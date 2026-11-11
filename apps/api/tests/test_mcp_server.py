"""Drive the mounted MCP endpoint end to end through the parent FastAPI app.

A synthetic RS256 verifier stands in for the OIDC proxy, so no identity provider,
gateway or socket is contacted. Requests stream through FastMCP's ASGI transport
inside the parent application's real lifespan.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import httpx
import httpx2
import pytest
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.exceptions import ToolError
from fastmcp.server.auth import RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import JWTVerifier, RSAKeyPair
from fastmcp.utilities.asgi_transport import StreamingASGITransport, run_asgi_lifespan
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from whisperer_api.local_config import BootDocument, LocalConfig
from whisperer_api.local_runtime import LocalProfile
from whisperer_api.main import create_app
from whisperer_api.mcp_meetings import MEETING_NOT_FOUND_MESSAGE
from whisperer_api.meeting_ai import MeetingAiService
from whisperer_api.meeting_models import Meeting
from whisperer_api.persistence import User
from whisperer_api.settings import MCP_SCOPE_ASK, MCP_SCOPE_READ, Settings

if TYPE_CHECKING:
    from pathlib import Path

    from fastapi import FastAPI
    from fastmcp.server.auth import AuthProvider

ISSUER = "https://identity.example.test"
BASE = "https://api.example.test"
RESOURCE = f"{BASE}/mcp"
METADATA = f"{BASE}/.well-known/oauth-protected-resource/mcp"
# Multibyte code points straddle page boundaries to prove exact slicing.
TRANSCRIPT = "Opening 🎙️ café naïve 日本語 — " * 30 + "close"
SUMMARY = "Ship on Friday."
_KEYS = RSAKeyPair.generate()
_OTHER_KEYS = RSAKeyPair.generate()


def _settings(tmp_path: Path, **overrides: Any) -> Settings:
    """Build a fully configured remote MCP deployment with synthetic values.

    Args:
        tmp_path: Private pytest directory.
        **overrides: Setting overrides.

    Returns:
        Validated settings.
    """
    values: dict[str, Any] = {
        "oidc_issuer_url": ISSUER,
        "oidc_client_id": "desktop-client",
        "oidc_client_secret": "synthetic-desktop-value",
        "public_url": BASE,
        "token_secret": "t" * 32,
        "gateway_base_url": "https://gateway.example.test",
        "gateway_api_key": "synthetic-gateway-value",
        "database_url": f"sqlite:///{tmp_path / 'api.sqlite3'}",
        "mcp_enabled": True,
        "mcp_oidc_client_id": "mcp-client",
        "mcp_oidc_client_secret": "synthetic-mcp-value",
        "mcp_signing_key": "x" * 32,
        "mcp_storage_dir": str(tmp_path / "mcp-oauth"),
    }
    values.update(overrides)
    return Settings(**values)


def _app(settings: Settings, **options: Any) -> FastAPI:
    """Create the app with every outbound readiness request answered offline.

    Args:
        settings: Deployment settings.
        **options: Extra ``create_app`` keyword arguments.

    Returns:
        Application whose HTTP client never leaves the process.
    """
    app = create_app(settings, **options)
    deps = app.state.dependencies
    deps.http_client = httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503))
    )
    return app


def _synthetic_auth(settings: Settings) -> AuthProvider:
    """Verify RS256 access tokens signed by the test key for the MCP resource.

    Args:
        settings: Deployment settings.

    Returns:
        Resource-server auth provider with no network dependency.
    """
    verifier = JWTVerifier(
        public_key=_KEYS.public_key,
        issuer=ISSUER,
        audience=RESOURCE,
        required_scopes=[MCP_SCOPE_READ],
    )
    return RemoteAuthProvider(
        token_verifier=verifier,
        authorization_servers=[ISSUER],  # type: ignore[list-item]
        base_url=BASE,
        resource_base_url=BASE,
        scopes_supported=[MCP_SCOPE_READ, MCP_SCOPE_ASK],
    )


def _token(
    subject: str = "owner",
    scopes: tuple[str, ...] = (MCP_SCOPE_READ, MCP_SCOPE_ASK),
    *,
    keys: RSAKeyPair = _KEYS,
    issuer: str = ISSUER,
    audience: str = RESOURCE,
    expires_in_seconds: int = 600,
) -> str:
    """Mint a synthetic RS256 access token.

    Args:
        subject: Token subject.
        scopes: Granted scopes.
        keys: Signing key pair.
        issuer: Token issuer.
        audience: Token audience.
        expires_in_seconds: Lifetime; negative values mint an expired token.

    Returns:
        Encoded JWT.
    """
    return keys.create_token(
        subject=subject,
        issuer=issuer,
        audience=audience,
        scopes=list(scopes),
        expires_in_seconds=expires_in_seconds,
    )


class Recorder:
    """Answer every meeting question with a fixed reply and record prompts.

    Args:
        reply: Model reply text.
    """

    def __init__(self, reply: str = "Friday.") -> None:
        """Store the reply.

        Args:
            reply: Model reply text.
        """
        self.reply = reply
        self.calls: list[list[ModelMessage]] = []

    def __call__(self, messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        """Record one request and reply.

        Args:
            messages: Request messages.
            info: Agent metadata.

        Returns:
            Fixed reply.
        """
        self.calls.append(messages)
        return ModelResponse(parts=[TextPart(self.reply)])


@dataclass
class Mounted:
    """Hold the composed app and seeded meetings.

    Args:
        app: Parent FastAPI application.
        meeting_id: Owner's complete meeting.
        foreign_id: Another user's meeting.
        recorder: Model call recorder.
    """

    app: FastAPI
    meeting_id: UUID
    foreign_id: UUID
    recorder: Recorder


def _meeting(user_id: str, started_at: datetime, **values: object) -> Meeting:
    """Build one persisted meeting row.

    Args:
        user_id: Owner id.
        started_at: Capture start.
        **values: Field overrides.

    Returns:
        Unsaved meeting.
    """
    now = datetime.now(UTC)
    fields: dict[str, object] = {
        "id": str(uuid4()),
        "user_id": user_id,
        "title": "Weekly sync",
        "started_at": started_at,
        "duration_ms": 1_000,
        "revision": 1,
        "transcript": TRANSCRIPT,
        "transcript_revision": 3,
        "summary": SUMMARY,
        "summary_revision": 2,
        "summary_stale": False,
        "transcript_status": "complete",
        "summary_status": "complete",
        "created_at": now,
        "updated_at": now,
    }
    fields.update(values)
    return Meeting(**fields)


def _compose(tmp_path: Path, **overrides: Any) -> Mounted:
    """Compose the remote app with MCP mounted and seed two owners.

    Args:
        tmp_path: Private pytest directory.
        **overrides: Setting overrides.

    Returns:
        Composed application and seeded identifiers.
    """
    app = _app(_settings(tmp_path, **overrides), mcp_auth_factory=_synthetic_auth)
    deps = app.state.dependencies
    recorder = Recorder()
    deps.meeting_ai = MeetingAiService(FunctionModel(recorder))
    deps.database.create_schema()
    with next(deps.database.session()) as session:
        owner = User(issuer=ISSUER, subject="owner", created_at=deps.clock.now())
        other = User(issuer=ISSUER, subject="other", created_at=deps.clock.now())
        session.add_all([owner, other])
        session.flush()
        start = datetime(2026, 10, 1, tzinfo=UTC)
        mine = _meeting(owner.id, start)
        older = _meeting(owner.id, start - timedelta(days=1), title="Earlier")
        foreign = _meeting(other.id, start)
        session.add_all([mine, older, foreign])
        session.commit()
        return Mounted(app, UUID(mine.id), UUID(foreign.id), recorder)


@pytest.fixture
def mounted(tmp_path: Path) -> Mounted:
    """Compose the mounted application.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        Composed application and seeded identifiers.
    """
    return _compose(tmp_path)


def _http(app: FastAPI) -> httpx2.AsyncClient:
    """Build a streaming in-process HTTP client for the parent application.

    Args:
        app: Parent FastAPI application.

    Returns:
        Client addressed at the public base URL.
    """
    return httpx2.AsyncClient(transport=StreamingASGITransport(app), base_url=BASE)


def _client(app: FastAPI, token: str) -> Client[StreamableHttpTransport]:
    """Build a FastMCP client that streams through the parent application.

    Args:
        app: Parent FastAPI application.
        token: Bearer access token.

    Returns:
        Unconnected FastMCP client.
    """

    def factory(**kwargs: Any) -> httpx2.AsyncClient:
        """Route the MCP client's HTTP traffic into the app.

        Args:
            **kwargs: Client options chosen by the MCP transport.

        Returns:
            In-process client.
        """
        return httpx2.AsyncClient(transport=StreamingASGITransport(app), **kwargs)

    return Client(StreamableHttpTransport(url=RESOURCE, auth=token, httpx_client_factory=factory))


_INITIALIZE = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {},
        "clientInfo": {"name": "probe", "version": "1"},
    },
}
_POST_HEADERS = {"Accept": "application/json, text/event-stream"}


async def _post(app: FastAPI, headers: dict[str, str] | None = None) -> httpx2.Response:
    """POST one initialize request to ``/mcp`` inside the app lifespan.

    Args:
        app: Parent FastAPI application.
        headers: Extra request headers.

    Returns:
        Response.
    """
    async with run_asgi_lifespan(app), _http(app) as http:
        return await http.post("/mcp", json=_INITIALIZE, headers=_POST_HEADERS | (headers or {}))


def _mcp_paths(app: FastAPI) -> set[str]:
    """Return the parent router paths that belong to MCP or OAuth discovery.

    Args:
        app: Parent FastAPI application.

    Returns:
        Matching route paths.
    """
    return {
        path
        for route in app.router.routes
        if (path := getattr(route, "path", ""))
        and (path.startswith(("/mcp", "/.well-known")) or path in {"/authorize", "/token"})
    }


async def test_disabled_mcp_mounts_nothing(tmp_path: Path) -> None:
    """Keep /mcp and every discovery route absent when MCP is off.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        None.
    """
    calls: list[Settings] = []
    app = _app(
        _settings(tmp_path, mcp_enabled=False),
        mcp_auth_factory=lambda settings: calls.append(settings) or _synthetic_auth(settings),
    )
    assert app.state.mcp_mounted is False
    assert not calls
    assert not _mcp_paths(app)
    async with run_asgi_lifespan(app), _http(app) as http:
        assert (await http.post("/mcp", json=_INITIALIZE)).status_code == 404
        metadata = await http.get("/.well-known/oauth-protected-resource/mcp")
        assert metadata.status_code == 404


async def test_enabled_but_incomplete_mcp_mounts_nothing(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Log the missing names once and never build the OAuth provider.

    Args:
        tmp_path: Private pytest directory.
        caplog: Log capture.

    Returns:
        None.
    """
    calls: list[Settings] = []
    app = _app(
        _settings(tmp_path, mcp_signing_key=None),
        mcp_auth_factory=lambda settings: calls.append(settings) or _synthetic_auth(settings),
    )
    assert app.state.mcp_mounted is False
    assert not calls
    assert not _mcp_paths(app)
    assert "MCP_SIGNING_KEY" in caplog.text


def test_device_profile_never_mounts_mcp(tmp_path: Path) -> None:
    """Ignore MCP settings entirely for the on-device profile.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        None.
    """
    config = LocalConfig.model_validate(
        {
            "version": 1,
            "instanceId": str(uuid4()),
            "dataDirectory": str(tmp_path / "data"),
            "speech": {
                "provider": "http",
                "baseUrl": "https://speech.example.test/v1",
                "model": "stt",
            },
            "llm": {"provider": "off"},
        }
    )
    token = base64.urlsafe_b64encode(b"k" * 32).rstrip(b"=").decode()
    profile = LocalProfile(
        config=config,
        boot=BootDocument.model_validate({"bootToken": token}),
        emit=lambda event: None,
    )
    calls: list[Settings] = []
    app = _app(
        _settings(tmp_path),
        local=profile,
        mcp_auth_factory=lambda settings: calls.append(settings) or _synthetic_auth(settings),
    )
    assert app.state.mcp_mounted is False
    assert not calls
    assert not _mcp_paths(app)


async def test_auth_factory_failure_keeps_the_api_serving(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """Leave MCP absent and the API healthy when discovery is unavailable.

    Args:
        tmp_path: Private pytest directory.
        caplog: Log capture.

    Returns:
        None.
    """

    def unavailable(_: Settings) -> AuthProvider:
        """Fail like an unreachable discovery document.

        Args:
            _: Deployment settings.

        Returns:
            Never returns.

        Raises:
            RuntimeError: Always, carrying text that must not be logged.
        """
        raise RuntimeError("upstream said private-detail")

    app = _app(_settings(tmp_path), mcp_auth_factory=unavailable)
    assert app.state.mcp_mounted is False
    assert not _mcp_paths(app)
    assert "RuntimeError" in caplog.text
    assert "private-detail" not in caplog.text
    async with run_asgi_lifespan(app), _http(app) as http:
        assert (await http.get("/v1/health")).status_code == 200
        assert (await http.post("/mcp", json=_INITIALIZE)).status_code == 404


def test_openapi_has_no_mcp_routes(mounted: Mounted) -> None:
    """Keep every mirrored MCP and OAuth route out of the OpenAPI document.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    assert mounted.app.state.mcp_mounted is True
    assert "/mcp" in _mcp_paths(mounted.app)
    paths = set(mounted.app.openapi()["paths"])
    forbidden = {"/mcp", "/authorize", "/token", "/register", "/consent"}
    assert not paths & forbidden
    assert not [path for path in paths if path.startswith(("/.well-known", "/mcp"))]


async def test_protected_resource_metadata_names_the_canonical_resource(
    mounted: Mounted,
) -> None:
    """Serve RFC 9728 metadata at the root with the /mcp resource.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    async with run_asgi_lifespan(mounted.app), _http(mounted.app) as http:
        response = await http.get("/.well-known/oauth-protected-resource/mcp")
        nested = await http.post("/mcp/mcp", json=_INITIALIZE, headers=_POST_HEADERS)
    assert response.status_code == 200
    body = response.json()
    assert body["resource"] == RESOURCE
    assert [server.rstrip("/") for server in body["authorization_servers"]] == [ISSUER]
    assert set(body["scopes_supported"]) == {MCP_SCOPE_READ, MCP_SCOPE_ASK}
    assert nested.status_code == 404


async def test_unauthenticated_request_gets_a_resource_metadata_challenge(
    mounted: Mounted,
) -> None:
    """Challenge a request without a bearer token.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    response = await _post(mounted.app)
    assert response.status_code == 401
    challenge = response.headers["www-authenticate"]
    assert challenge.startswith("Bearer ")
    assert f'resource_metadata="{METADATA}"' in challenge
    assert MCP_SCOPE_READ in challenge


@pytest.mark.parametrize(
    "token",
    [
        pytest.param("not-a-jwt", id="malformed"),
        pytest.param(_token(expires_in_seconds=-60), id="expired"),
        pytest.param(_token(keys=_OTHER_KEYS), id="wrong-signature"),
        pytest.param(_token(issuer="https://evil.example.test"), id="wrong-issuer"),
        pytest.param(_token(audience=BASE), id="wrong-audience"),
        pytest.param(_token(scopes=(MCP_SCOPE_ASK,)), id="missing-read-scope"),
    ],
)
async def test_invalid_tokens_are_rejected(mounted: Mounted, token: str) -> None:
    """Reject bad, expired, foreign, wrong-audience and under-scoped tokens with 401.

    The verifier treats a token without ``meetings:read`` as invalid, so FastMCP
    answers 401 ``invalid_token`` rather than 403 ``insufficient_scope``.

    Args:
        mounted: Composed application.
        token: Rejected bearer token.

    Returns:
        None.
    """
    response = await _post(mounted.app, {"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
    assert 'error="invalid_token"' in response.headers["www-authenticate"]


async def test_foreign_origin_is_forbidden(mounted: Mounted) -> None:
    """Reject a browser request from an origin outside the allowlist.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    response = await _post(
        mounted.app,
        {"Authorization": f"Bearer {_token()}", "Origin": "https://evil.example.test"},
    )
    assert response.status_code == 403


async def test_foreign_host_is_rejected(mounted: Mounted) -> None:
    """Reject a Host header outside the allowlist before authentication.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    response = await _post(
        mounted.app, {"Authorization": f"Bearer {_token()}", "Host": "evil.example.test"}
    )
    assert response.status_code == 421


async def test_tools_list_exposes_exactly_three_read_only_tools(mounted: Mounted) -> None:
    """List only the V1 tools, each annotated read-only and idempotent.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        tools = await client.list_tools()
    assert sorted(tool.name for tool in tools) == [
        "ask_meeting",
        "get_meeting_text",
        "list_meetings",
    ]
    for tool in tools:
        assert tool.annotations is not None
        assert tool.annotations.read_only_hint is True
        assert tool.annotations.destructive_hint is False
        assert tool.annotations.idempotent_hint is True
        assert tool.annotations.open_world_hint is False
        assert tool.description
    limits = {tool.name: tool.input_schema["properties"] for tool in tools}
    assert limits["list_meetings"]["limit"]["maximum"] == 20
    assert limits["get_meeting_text"]["max_characters"]["maximum"] == 16_000
    assert limits["ask_meeting"]["question"]["maxLength"] == 2_000


async def test_write_attempts_are_refused(mounted: Mounted) -> None:
    """There is no write tool: calling one fails and changes nothing.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        before = await client.call_tool("list_meetings", {"limit": 20})
        for name, arguments in (
            ("delete_meeting", {"meeting_id": str(uuid4())}),
            ("update_meeting", {"meeting_id": str(uuid4()), "title": "changed"}),
        ):
            result = await client.call_tool(name, arguments, raise_on_error=False)
            assert result.is_error
        after = await client.call_tool("list_meetings", {"limit": 20})
    assert after.structured_content == before.structured_content


async def test_list_meetings_returns_owned_metadata(mounted: Mounted) -> None:
    """Return only the caller's meetings, newest first, without content.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        first = await client.call_tool("list_meetings", {"limit": 1})
        second = await client.call_tool(
            "list_meetings", {"cursor": first.structured_content["nextCursor"], "limit": 1}
        )
    items = first.structured_content["items"] + second.structured_content["items"]
    assert [item["title"] for item in items] == ["Weekly sync", "Earlier"]
    assert items[0]["id"] == str(mounted.meeting_id)
    assert second.structured_content["nextCursor"] is None
    assert TRANSCRIPT[:10] not in str(first.structured_content)


async def test_get_meeting_text_pages_concatenate_exactly(mounted: Mounted) -> None:
    """Reassemble the exact transcript from small pages.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    pieces: list[str] = []
    cursor: str | None = None
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        while True:
            arguments: dict[str, Any] = {
                "meeting_id": str(mounted.meeting_id),
                "max_characters": 97,
            }
            if cursor is not None:
                arguments["cursor"] = cursor
            page = (await client.call_tool("get_meeting_text", arguments)).structured_content
            pieces.append(page["text"])
            cursor = page["nextCursor"]
            if cursor is None:
                break
        summary = await client.call_tool(
            "get_meeting_text", {"meeting_id": str(mounted.meeting_id), "part": "summary"}
        )
    assert len(pieces) > 1
    assert "".join(pieces) == TRANSCRIPT
    assert summary.structured_content["text"] == SUMMARY


async def test_out_of_range_arguments_are_rejected(mounted: Mounted) -> None:
    """Reject oversized pages and limits instead of coercing them.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        with pytest.raises(ToolError):
            await client.call_tool("list_meetings", {"limit": 21})
        with pytest.raises(ToolError):
            await client.call_tool(
                "get_meeting_text",
                {"meeting_id": str(mounted.meeting_id), "max_characters": 16_001},
            )
        with pytest.raises(ToolError):
            await client.call_tool(
                "ask_meeting", {"meeting_id": str(mounted.meeting_id), "question": ""}
            )


async def test_ask_meeting_answers_without_writing(mounted: Mounted) -> None:
    """Answer from the saved snapshot and leave the meeting unchanged.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    deps = mounted.app.state.dependencies

    def snapshot() -> tuple[object, ...]:
        """Read the persisted meeting fields a question must not change.

        Args:
            None.

        Returns:
            Field tuple.
        """
        with next(deps.database.session()) as session:
            meeting = session.get(Meeting, str(mounted.meeting_id))
            assert meeting is not None
            return (
                meeting.transcript,
                meeting.transcript_revision,
                meeting.summary,
                meeting.summary_revision,
                meeting.revision,
                meeting.updated_at,
            )

    before = snapshot()
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        result = await client.call_tool(
            "ask_meeting",
            {"meeting_id": str(mounted.meeting_id), "question": "When do we ship?"},
        )
    assert result.structured_content == {
        "answer": "Friday.",
        "transcriptRevision": 3,
        "summaryRevision": 2,
        "summaryStale": False,
        "usedSummary": True,
    }
    assert len(mounted.recorder.calls) == 1
    assert snapshot() == before


async def test_ask_meeting_requires_the_ask_scope(mounted: Mounted) -> None:
    """Name the missing scope instead of answering.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    token = _token(scopes=(MCP_SCOPE_READ,))
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, token) as client:
        with pytest.raises(ToolError, match=MCP_SCOPE_ASK):
            await client.call_tool(
                "ask_meeting", {"meeting_id": str(mounted.meeting_id), "question": "Why?"}
            )
    assert not mounted.recorder.calls


@pytest.mark.parametrize("tool", ["get_meeting_text", "ask_meeting"])
async def test_foreign_and_absent_meetings_are_indistinguishable(
    mounted: Mounted, tool: str
) -> None:
    """Report another user's meeting exactly like a missing one.

    Args:
        mounted: Composed application.
        tool: Tool under test.

    Returns:
        None.
    """
    messages: list[str] = []
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
        for meeting_id in (mounted.foreign_id, uuid4()):
            arguments: dict[str, Any] = {"meeting_id": str(meeting_id)}
            if tool == "ask_meeting":
                arguments["question"] = "What happened?"
            with pytest.raises(ToolError) as error:
                await client.call_tool(tool, arguments)
            messages.append(str(error.value))
    assert messages == [MEETING_NOT_FOUND_MESSAGE, MEETING_NOT_FOUND_MESSAGE]


async def test_unknown_subject_cannot_use_tools(mounted: Mounted) -> None:
    """Refuse a valid token whose subject never signed in to Whisperer.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token("stranger")) as client:
        with pytest.raises(ToolError, match="Sign in to Whisperer"):
            await client.call_tool("list_meetings", {})


async def test_lifespan_restarts_and_shuts_down_cleanly(mounted: Mounted) -> None:
    """Start and stop one app's composed lifespan twice, serving MCP tools each time.

    Shutdown closes the HTTP clients, so the test supplies fresh ones per cycle.

    Args:
        mounted: Composed application.

    Returns:
        None.
    """
    deps = mounted.app.state.dependencies
    for _ in range(2):
        deps.http_client = httpx.AsyncClient(
            transport=httpx.MockTransport(lambda request: httpx.Response(503))
        )
        deps.ai_http_client = httpx2.AsyncClient()
        async with run_asgi_lifespan(mounted.app), _client(mounted.app, _token()) as client:
            assert len(await client.list_tools()) == 3
        assert deps.meetings._worker is None
        assert deps.http_client.is_closed
        assert deps.ai_http_client.is_closed


async def test_startup_failure_unwinds_mcp_and_resources(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Close the worker and HTTP clients when startup fails after MCP started.

    Args:
        tmp_path: Private pytest directory.
        monkeypatch: Pytest patching fixture.

    Returns:
        None.
    """
    mounted = _compose(tmp_path)
    deps = mounted.app.state.dependencies

    async def failing_run(self: object) -> None:
        """Fail like a crashing readiness check.

        Args:
            self: Preflight service.

        Returns:
            Never returns.

        Raises:
            RuntimeError: Always.
        """
        raise RuntimeError("readiness crashed")

    monkeypatch.setattr("whisperer_api.main.PreflightService.run", failing_run)
    with pytest.raises(RuntimeError, match="startup failed"):
        async with run_asgi_lifespan(mounted.app):
            pass
    assert deps.meetings._worker is None
    assert deps.http_client.is_closed
