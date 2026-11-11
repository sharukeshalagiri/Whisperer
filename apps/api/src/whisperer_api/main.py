"""FastAPI application composition and HTTP adapters."""

import asyncio
import logging
from collections.abc import AsyncIterator, Iterator
from contextlib import AsyncExitStack, asynccontextmanager
from datetime import date
from html import escape
from pathlib import Path
from typing import TYPE_CHECKING, Annotated, Any
from urllib.parse import urlencode
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
import httpx2
from fastapi import (
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from whisperer_api.audio import AudioDecodeError
from whisperer_api.auth import (
    DeviceAuthorizationService,
    OidcClient,
    SessionService,
    SystemClock,
    sign_in_code,
)
from whisperer_api.http_clients import LOOPBACK_DIRECT
from whisperer_api.inference import (
    LLM_OFF_MESSAGE,
    ContextLimitError,
    HttpLlmProvider,
    InferenceRouter,
    LanguageModelOffError,
    SpeechUnavailableError,
)
from whisperer_api.meeting_ai import (
    EmptyMeetingAiOutputError,
    MeetingAiService,
    OversizedMeetingAiOutputError,
)
from whisperer_api.meeting_models import MeetingSegment
from whisperer_api.meeting_schemas import (
    MeetingCreateRequest,
    MeetingListResponse,
    MeetingMetadataPatchRequest,
    MeetingQuestionRequest,
    MeetingQuestionResponse,
    MeetingResponse,
    MeetingSegmentResponse,
    MeetingSummaryResponse,
    MeetingTextPatchRequest,
    MeetingTranscriptResponse,
)
from whisperer_api.meetings import (
    AudioTooLargeError,
    MeetingConflictError,
    MeetingNotFoundError,
    MeetingRevisionConflictError,
    MeetingService,
    UnsupportedAudioError,
)
from whisperer_api.metrics import MetricConflictError, MetricsService
from whisperer_api.metrics_schemas import (
    AppMetricsResponse,
    DailyMetricsResponse,
    DictationMetricRequest,
    IanaTimezone,
    MetricsResponse,
)
from whisperer_api.persistence import Database, DeviceAuthorization, Note, RefreshSession, User
from whisperer_api.preflight import PreflightResult, PreflightService
from whisperer_api.resources import (
    DuplicateDictionaryError,
    NoteChangedError,
    ResourceNotFoundError,
    ResourceService,
)
from whisperer_api.schemas import (
    CurrentUserResponse,
    DevicePollResponse,
    DictionaryCreateRequest,
    DictionaryListResponse,
    DictionaryResponse,
    DictionaryUpdateRequest,
    HealthResponse,
    InferenceEngineStatus,
    InferenceStatusResponse,
    InferenceTestRequest,
    InferenceTestResponse,
    LocalChallengeRequest,
    LocalChallengeResponse,
    ModelDownloadRequest,
    ModelDownloadResponse,
    NoteCreateRequest,
    NoteListResponse,
    NoteResponse,
    NoteUpdateRequest,
    Problem,
    ReadyResponse,
    RefreshRequest,
    RefreshResponse,
    SpeechModelListResponse,
    SpeechModelResponse,
    TranscriptListResponse,
    TranscriptResponse,
    UserUpdateRequest,
)
from whisperer_api.settings import Settings
from whisperer_api.sync import SyncService
from whisperer_api.sync_schemas import SyncMergeResponse, SyncSnapshot
from whisperer_api.transformation_schemas import (
    TextTransformationRequest,
    TextTransformationResponse,
)
from whisperer_api.transformations import (
    TransformationConflictError,
    TransformationService,
    TransformationSourceError,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastmcp.server.auth import AuthProvider
    from starlette.types import Lifespan

    from whisperer_api.local_auth import LocalAuthenticator
    from whisperer_api.local_runtime import LocalProfile

_LOGGER = logging.getLogger("whisperer_api")
_MAX_AUDIO_BYTES = 25 * 1024 * 1024
_NOT_FOUND = "Not Found"
# Sign-in and session routes that do not exist on an on-device server.
_REMOTE_ONLY_PATHS = frozenset(
    {"/login", "/auth/callback", "/device/poll", "/device/stream", "/v1/auth/refresh"}
)
_DESKTOP_COMPLETION_URL = "whisperer://auth/transfer/success"
_PROBLEM_RESPONSES: dict[int | str, dict[str, Any]] = {
    status: {
        "description": title,
        "content": {"application/problem+json": {"schema": Problem.model_json_schema()}},
    }
    for status, title in {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        409: "Conflict",
        412: "Precondition Failed",
        413: "Content Too Large",
        415: "Unsupported Media Type",
        422: "Unprocessable Content",
        428: "Precondition Required",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }.items()
}


class GatewayClient(InferenceRouter):
    """Route remote inference through the configured gateway or dedicated endpoints.

    Args:
        settings: Runtime model and endpoint configuration.
        http_client: Async HTTP client used for all provider requests.
    """

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        """Build HTTP speech and language-model providers from settings.

        Args:
            settings: Runtime model and endpoint configuration.
            http_client: Async HTTP client used for all provider requests.
        """
        router = InferenceRouter.from_settings(settings, http_client)
        super().__init__(router.speech, router.llm)


class ApplicationDependencies:
    """Own application collaborators and inject them through FastAPI dependencies.

    Args:
        settings: Validated runtime settings.
        local: On-device profile, or None for a remote deployment.
        ai_http_client: Optional client for meeting AI calls, injected by tests.
    """

    def __init__(
        self,
        settings: Settings,
        local: "LocalProfile | None" = None,
        *,
        ai_http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        """Construct reusable application collaborators.

        Args:
            settings: Validated runtime settings.
            local: On-device profile, or None for a remote deployment.
            ai_http_client: Optional client for meeting AI calls, injected by tests.
        """
        self.settings = settings
        self.local = local
        self.database = Database(settings.database_url)
        self.clock = SystemClock()
        self.http_client = (
            local.http_client()
            if local
            else httpx.AsyncClient(follow_redirects=False, mounts=LOOPBACK_DIRECT)
        )
        self.sessions = SessionService(settings, self.clock)
        self.devices = DeviceAuthorizationService(settings, self.clock, self.sessions)
        self.oidc = OidcClient(settings, self.http_client)
        self.gateway: InferenceRouter = (
            local.router(self.http_client) if local else GatewayClient(settings, self.http_client)
        )
        self.local_auth: LocalAuthenticator | None = (
            local.authenticator(self.clock) if local else None
        )
        # Pydantic AI speaks httpx2, so meeting AI calls own a separate client.
        self.ai_http_client = ai_http_client or httpx2.AsyncClient(
            follow_redirects=False, mounts=LOOPBACK_DIRECT
        )
        self.meeting_ai = meeting_ai_service(self.gateway, self.ai_http_client)
        self.resources = ResourceService(self.clock, self.gateway)
        self.metrics = MetricsService()
        self.meetings = MeetingService(
            database=self.database,
            clock=self.clock,
            inference=self.gateway,
            summarizer=self.meeting_ai,
            audio_root=(
                local.config.data_path / "meeting-audio"
                if local
                else _meeting_audio_root(settings.database_url)
            ),
            inference_timeout_seconds=settings.meeting_gateway_timeout_seconds,
        )
        self.transformations = TransformationService(self.gateway, self)
        self.sync = SyncService(self.metrics, self.meetings)
        self.preflight_result: PreflightResult | None = None
        self.background: set[asyncio.Task[None]] = set()

    def transformation_source(
        self, session: Session, user_id: str, resource_type: str, resource_id: UUID
    ) -> tuple[str, int]:
        """Resolve owned note or meeting text for a non-mutating transformation.

        Args:
            session: Open short-lived database session.
            user_id: Authenticated owner identifier.
            resource_type: Requested supported text resource kind.
            resource_id: Owned resource identifier.

        Returns:
            Stored text and its dedicated revision.

        Raises:
            ResourceNotFoundError: If the resource is absent or foreign-owned.
        """
        if resource_type == "note":
            note = session.scalar(
                select(Note).where(Note.id == str(resource_id), Note.user_id == user_id)
            )
            if note is None:
                raise ResourceNotFoundError("Note")
            return note.content, note.revision
        try:
            mapped_type = {
                "meeting-transcript": "meetingTranscript",
                "meeting-summary": "meetingSummary",
            }.get(resource_type)
            if mapped_type is None:
                raise ResourceNotFoundError("Resource")
            return self.meetings.transformation_source(
                session, user_id, mapped_type, str(resource_id)
            )
        except MeetingNotFoundError as error:
            raise ResourceNotFoundError("Meeting") from error

    async def close(self) -> None:
        """Close network resources during application shutdown.

        Args:
            None.

        Returns:
            None.
        """
        await self.http_client.aclose()
        await self.ai_http_client.aclose()

    def get_session(self) -> Iterator[Session]:
        """Yield a committing database transaction per request.

        Args:
            None.

        Yields:
            Open SQLAlchemy session committed on success.
        """
        with next(self.database.session()) as session:
            try:
                yield session
                session.commit()
            except Exception:
                session.rollback()
                raise


def meeting_ai_service(
    router: InferenceRouter, http_client: httpx2.AsyncClient
) -> MeetingAiService | None:
    """Build the meeting AI service on the router's language-model endpoint.

    The service reuses the endpoint's own URL and key, so a dedicated language-model
    URL never receives the gateway key.

    Args:
        router: Composed inference router.
        http_client: Client dedicated to meeting AI calls.

    Returns:
        Service for an HTTP language model, or None when it is off, unconfigured or
        missing a required key.
    """
    llm = router.llm
    if not isinstance(llm, HttpLlmProvider):
        return None
    # The shared gateway needs its key; without one nothing may leave the server.
    if llm.requires_key and llm.api_key is None:
        return None
    return MeetingAiService.from_endpoint(
        llm.base_url, llm.api_key, llm.model, http_client=http_client
    )


_BROWSER_PAGE_HEADERS = {
    "Cache-Control": "no-store",
    "Content-Security-Policy": (
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'"
    ),
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
}
_BROWSER_PAGE_STYLE = (
    "body{font-family:system-ui,sans-serif;line-height:1.5;margin:3rem;max-width:36rem}"
    "a{color:inherit;font-weight:600}"
    ".code{font:600 1.6rem ui-monospace,monospace;letter-spacing:.12em}"
    "button{font:inherit;font-weight:600;padding:.5rem 1.2rem}"
)


def _approval_page(code: str, token: str) -> Response:
    """Ask the person to confirm the code their own Whisperer app shows before signing in.

    Args:
        code: Short sign-in code derived from the device code.
        token: One-time approval token for the form.

    Returns:
        No-token HTML page with an approval form.
    """
    return Response(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Approve Whisperer sign-in</title>
  <style>{_BROWSER_PAGE_STYLE}</style>
</head>
<body>
  <main>
    <h1>Approve sign-in</h1>
    <p>Whisperer on your computer should be showing this code:</p>
    <p class="code">{escape(code)}</p>
    <p>Approve only if you started this sign-in and the codes match. If Whisperer is not
    showing this code, someone else sent you this link: close this page.</p>
    <form method="post" action="approve">
      <input type="hidden" name="approval" value="{escape(token, quote=True)}">
      <button type="submit">Approve sign-in</button>
    </form>
  </main>
</body>
</html>""",
        headers=_BROWSER_PAGE_HEADERS,
        media_type="text/html",
        status_code=200,
    )


def _completion_page(device_code: str) -> Response:
    """Hand the browser back to the desktop after an approved sign-in.

    Args:
        device_code: Desktop transaction id; the only value the return link carries.

    Returns:
        No-token HTML page that opens the desktop.
    """
    completion_url = f"{_DESKTOP_COMPLETION_URL}?{urlencode({'device_code': device_code})}"
    escaped_completion_url = escape(completion_url, quote=True)
    return Response(
        f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0;url={escaped_completion_url}">
  <title>Signed in to Whisperer</title>
  <style>{_BROWSER_PAGE_STYLE}</style>
</head>
<body>
  <main>
    <p>You're signed in. Return to Whisperer.</p>
    <p>If Whisperer didn't open, click <a href="{escaped_completion_url}">Open Whisperer</a> or
    switch back to the app — it finishes signing in automatically.</p>
  </main>
</body>
</html>""",
        headers=_BROWSER_PAGE_HEADERS,
        media_type="text/html",
        status_code=200,
    )


def create_app(
    settings: Settings | None = None,
    *,
    local: "LocalProfile | None" = None,
    mcp_auth_factory: "Callable[[Settings], AuthProvider] | None" = None,
) -> FastAPI:
    """Build a FastAPI app with injected infrastructure collaborators.

    Args:
        settings: Optional explicit settings useful to deterministic tests.
        local: On-device profile; None builds the remote deployment.
        mcp_auth_factory: Builds the remote MCP OAuth provider; defaults to the
            OIDC proxy. Called only for a remote deployment with MCP configured.

    Returns:
        Configured FastAPI application.
    """
    dependencies = ApplicationDependencies(settings or Settings(), local)
    mcp_lifespan: Lifespan[FastAPI] | None = None

    @asynccontextmanager
    async def lifespan(running: FastAPI) -> AsyncIterator[None]:
        """Initialize isolated persistence and close HTTP resources.

        Args:
            running: Running application instance.

        Yields:
            Control while the application serves requests.
        """
        async with AsyncExitStack() as stack:
            stack.push_async_callback(dependencies.close)
            dependencies.database.create_schema()
            if local is not None:
                await _start_local(dependencies, local)
            stack.push_async_callback(dependencies.meetings.stop)
            await dependencies.meetings.start()
            stack.callback(_cancel_background, dependencies, local)
            # MCP stops before the worker and HTTP clients it uses are closed.
            if mcp_lifespan is not None:
                await stack.enter_async_context(mcp_lifespan(running))
            if local is None:
                dependencies.preflight_result = await PreflightService(
                    dependencies.settings, dependencies.http_client
                ).run()
            else:
                dependencies.preflight_result = PreflightResult(True, (), ())
            yield

    app = FastAPI(
        title="Whisperer API", version="1", lifespan=lifespan, responses=_PROBLEM_RESPONSES
    )
    app.state.dependencies = dependencies
    mcp_lifespan = _mount_mcp(app, dependencies, mcp_auth_factory or _default_mcp_auth)
    app.state.mcp_mounted = mcp_lifespan is not None
    session_dependency = Annotated[Session, Depends(dependencies.get_session)]
    if local is not None:
        _guard_loopback(app, local)

    @app.exception_handler(HTTPException)
    async def http_problem(request: Request, error: HTTPException) -> JSONResponse:
        """Convert framework authentication errors to a stable problem response.

        Args:
            request: Incoming request.
            error: Raised HTTP status exception.

        Returns:
            Problem JSON response.
        """
        return _problem(request, error.status_code, str(error.detail))

    @app.exception_handler(RequestValidationError)
    async def validation_problem(request: Request, _: RequestValidationError) -> JSONResponse:
        """Return safe validation problems without echoing untrusted request values.

        Args:
            request: Incoming invalid request.
            _: Framework validation details intentionally not exposed.

        Returns:
            Stable 422 problem representation.
        """
        return _problem(request, 422, "The request representation is invalid.")

    @app.get(
        "/v1/health",
        response_model=HealthResponse,
        response_model_exclude_none=True,
        operation_id="getHealth",
    )
    def health() -> HealthResponse:
        """Return legacy-compatible process liveness.

        Args:
            None.

        Returns:
            Public liveness response; an on-device server adds its instance id.
        """
        if local is None:
            return HealthResponse()
        return HealthResponse(instance_id=local.config.instance_id)

    @app.get("/v1/ready", response_model=ReadyResponse, operation_id="getReadiness")
    def ready() -> JSONResponse:
        """Return sanitized external dependency readiness.

        Args:
            None.

        Returns:
            200 when ready or 503 without secrets or upstream response bodies.
        """
        result = dependencies.preflight_result
        if result is None:
            result = PreflightResult(False, (), ("Readiness has not run.",))
        body = ReadyResponse(
            status="ready" if result.ready else "unavailable",
            missing_configuration=result.missing_configuration,
            failures=result.failures,
        )
        return JSONResponse(
            body.model_dump(by_alias=True), status_code=200 if result.ready else 503
        )

    @app.get("/login", operation_id="beginBrowserLogin")
    async def login(
        device_code: UUID, verifier_challenge: str, session: session_dependency
    ) -> RedirectResponse:
        """Start an OIDC browser login bound to a desktop device verifier.

        Args:
            device_code: Desktop-generated transaction UUID.
            verifier_challenge: SHA-256 challenge of a desktop secret.
            session: Injected new API database transaction.

        Returns:
            Redirect to generic OIDC authorization.
        """
        _remote_only(dependencies)
        if not dependencies.settings.authentication_configured:
            raise HTTPException(503, "Authentication is not configured.")
        record = dependencies.devices.begin(session, str(device_code), verifier_challenge)
        state, nonce, code_verifier = dependencies.devices.new_oauth_values()
        dependencies.devices.bind_browser_state(session, record, state, nonce, code_verifier)
        return RedirectResponse(
            await dependencies.oidc.authorization_url(state, nonce, code_verifier), status_code=303
        )

    @app.get("/auth/callback", operation_id="oidcCallback")
    async def callback(code: str, state: str, session: session_dependency) -> Response:
        """Verify a browser OIDC callback and ask the person to approve the sign-in.

        Args:
            code: Provider authorization code.
            state: Server-issued transaction state.
            session: Injected API database transaction.

        Returns:
            No-token confirmation page; nothing completes until the person approves it.
        """
        _remote_only(dependencies)
        record = session.scalar(
            select(DeviceAuthorization).where(DeviceAuthorization.state == state)
        )
        if (
            record is None
            or record.completed_at is not None
            or record.expires_at <= dependencies.clock.now()
            or record.nonce is None
            or record.code_verifier is None
        ):
            raise HTTPException(400, "Authentication transaction is invalid or expired.")
        try:
            claims = await dependencies.oidc.validate_callback(
                code, record.nonce, record.code_verifier
            )
        except ValueError:
            raise HTTPException(401, "Identity verification failed.") from None
        groups = claims.get(dependencies.settings.oidc_groups_claim, [])
        if dependencies.settings.groups_restricted and (
            not isinstance(groups, list)
            or not dependencies.settings.allowed_groups.intersection(
                group for group in groups if isinstance(group, str)
            )
        ):
            raise HTTPException(403, "You are not authorized to use this application.")
        subject = claims.get("sub")
        if not isinstance(subject, str):
            raise HTTPException(401, "Identity verification failed.")
        user = session.scalar(
            select(User).where(
                User.issuer == dependencies.settings.oidc_issuer, User.subject == subject
            )
        )
        if user is None:
            user = User(
                issuer=dependencies.settings.oidc_issuer,
                subject=subject,
                first_name=claims.get("given_name")
                if isinstance(claims.get("given_name"), str)
                else None,
                last_name=claims.get("family_name")
                if isinstance(claims.get("family_name"), str)
                else None,
                created_at=dependencies.clock.now(),
            )
            session.add(user)
            session.flush()
        token = dependencies.devices.await_approval(session, record, user)
        return _approval_page(sign_in_code(record.device_code), token)

    @app.post("/auth/approve", include_in_schema=False)
    async def approve(request: Request, session: session_dependency) -> Response:
        """Complete the sign-in the person approved on the confirmation page.

        Args:
            request: Browser form post carrying the one-time approval token.
            session: Injected API database transaction.

        Returns:
            Minimal no-token page that hands the browser back to the desktop.
        """
        _remote_only(dependencies)
        form = await request.form()
        token = form.get("approval")
        record = (
            dependencies.devices.approve(session, token)
            if isinstance(token, str) and 0 < len(token) <= 128
            else None
        )
        if record is None:
            raise HTTPException(400, "This sign-in is invalid, already used or expired.")
        return _completion_page(record.device_code)

    @app.get(
        "/device/poll", response_model=DevicePollResponse, operation_id="pollDeviceAuthorization"
    )
    def poll_device(
        device_code: UUID,
        session: session_dependency,
        verifier: Annotated[str | None, Header(alias="X-Whisperer-Device-Verifier")] = None,
    ) -> DevicePollResponse:
        """Redeem a protected device completion once.

        Args:
            device_code: Desktop transaction UUID.
            session: Injected API database transaction.
            verifier: Raw desktop-only verifier in a request header.

        Returns:
            Pending or atomically single-use complete state.
        """
        _remote_only(dependencies)
        if verifier is None:
            raise HTTPException(401, "A valid device verifier is required.")
        result = dependencies.devices.redeem(session, str(device_code), verifier)
        if result is None:
            raise HTTPException(401, "Device authorization is invalid or expired.")
        return result

    @app.get("/device/stream", operation_id="streamDeviceAuthorization")
    async def stream_device(
        device_code: UUID,
        session: session_dependency,
        verifier: Annotated[str | None, Header(alias="X-Whisperer-Device-Verifier")] = None,
    ) -> EventSourceResponse:
        """Stream a protected device completion event using the desktop verifier.

        Args:
            device_code: Desktop transaction UUID.
            session: Injected API database transaction.
            verifier: Raw desktop-only verifier in a request header.

        Returns:
            Server-sent completion event with application tokens only after redemption.
        """
        _remote_only(dependencies)
        if verifier is None:
            raise HTTPException(401, "A valid device verifier is required.")

        async def events() -> AsyncIterator[dict[str, object]]:
            """Poll protected state until it completes or expires.

            Args:
                None.

            Yields:
                SSE event dictionaries with pending keepalives or one completion.
            """
            while True:
                result = dependencies.devices.redeem(session, str(device_code), verifier)
                if result is None:
                    yield {"event": "error", "data": "authorization expired"}
                    return
                if result.status == "complete":
                    yield {"event": "complete", "data": result.model_dump_json(by_alias=True)}
                    return
                yield {"event": "pending", "data": result.model_dump_json(by_alias=True)}
                session.expire_all()
                await asyncio.sleep(0.5)

        return EventSourceResponse(events())

    @app.post(
        "/v1/auth/refresh", response_model=RefreshResponse, operation_id="refreshApplicationSession"
    )
    def refresh(request_body: RefreshRequest, session: session_dependency) -> RefreshResponse:
        """Rotate a local refresh token only after revalidation capability exists.

        Args:
            request_body: Opaque local refresh token.
            session: Injected API database transaction.

        Returns:
            Rotated application session pair.
        """
        _remote_only(dependencies)
        result = dependencies.sessions.refresh(session, request_body.refresh_token)
        if result is None:
            # Keep a reuse revocation even though the request fails.
            session.commit()
            raise HTTPException(401, "The refresh session is invalid or expired.")
        _, response = result
        return response

    @app.post("/v1/auth/logout", status_code=204, operation_id="logoutApplicationSession")
    def logout(
        session: session_dependency,
        user: Annotated[User, Depends(_current_user(dependencies))],
        authorization: Annotated[str | None, Header()] = None,
    ) -> Response:
        """Accept a locally authenticated logout request.

        Args:
            session: Injected API database transaction.
            user: Authenticated user used to validate the bearer token.
            authorization: Validated Bearer header whose linked session is revoked.

        Returns:
            Empty logout response.
        """
        del user
        if authorization is not None and dependencies.local is None:
            dependencies.sessions.revoke_access_token(
                session, authorization.removeprefix("Bearer ")
            )
        return Response(status_code=204)

    @app.get("/v1/me", response_model=CurrentUserResponse, operation_id="getCurrentUser")
    @app.get("/v1/auth/me", response_model=CurrentUserResponse, operation_id="getLegacyCurrentUser")
    def current_user(
        user: Annotated[User, Depends(_current_user(dependencies))],
    ) -> CurrentUserResponse:
        """Return the currently authenticated user in the legacy wrapper.

        Args:
            user: Authenticated linked local user.

        Returns:
            Safe current user response.
        """
        return CurrentUserResponse(user=dependencies.devices.public_user(user))

    @app.patch("/v1/me", response_model=CurrentUserResponse, operation_id="patchCurrentUser")
    def patch_current_user(
        body: UserUpdateRequest,
        session: session_dependency,
        user: Annotated[User, Depends(_current_user(dependencies))],
    ) -> CurrentUserResponse:
        """Update optional local profile display names only.

        Args:
            body: Strict local profile fields.
            session: Injected API database transaction.
            user: Authenticated local account.

        Returns:
            Updated public account representation.
        """
        del session
        if body.first_name is None and body.last_name is None:
            raise HTTPException(400, "At least one profile field is required.")
        if body.first_name is not None:
            user.first_name = body.first_name.strip() or None
        if body.last_name is not None:
            user.last_name = body.last_name.strip() or None
        return CurrentUserResponse(user=dependencies.devices.public_user(user))

    @app.delete("/v1/me", status_code=204, operation_id="deleteAccount")
    def delete_account(
        session: session_dependency,
        user: Annotated[User, Depends(_current_user(dependencies))],
    ) -> Response:
        """Delete all local account content without touching upstream identity.

        Args:
            session: Injected API database transaction.
            user: Authenticated local account.

        Returns:
            Empty local deletion acknowledgement.
        """
        dependencies.meetings.sweep_orphan_audio()
        dependencies.meetings.delete_user_content(session, user.id)
        session.execute(delete(RefreshSession).where(RefreshSession.user_id == user.id))
        session.delete(user)
        # Commit before deleting files: a locked file then leaves only an orphan for the sweep,
        # never rows that point at half-deleted audio.
        session.commit()
        dependencies.meetings.remove_user_audio(user.id)
        return Response(status_code=204)

    _register_resources(app, dependencies, session_dependency)
    _register_metrics(app, dependencies, session_dependency)
    _register_meetings(app, dependencies, session_dependency)
    _register_transformations(app, dependencies, session_dependency)
    _register_sync(app, dependencies, session_dependency)
    _register_local(app, dependencies)
    return app


def _authenticated_user(
    dependencies: ApplicationDependencies, session: Session, authorization: str | None
) -> User:
    """Resolve one authenticated user within the caller-owned database session.

    Args:
        dependencies: Composed application collaborators.
        session: Transaction used for token and user lookup.
        authorization: Raw Authorization header supplied by FastAPI.

    Returns:
        Authenticated linked user.

    Raises:
        HTTPException: If the bearer credential is absent or invalid.
    """
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(401, "A valid Bearer token is required.")
    token = authorization.removeprefix("Bearer ")
    if dependencies.local_auth is not None:
        user = dependencies.local_auth.user_from_bearer(session, token)
    else:
        user = dependencies.sessions.user_from_access_token(session, token)
    if user is None:
        raise HTTPException(401, "The session is invalid or expired.")
    return user


def _current_user(dependencies: ApplicationDependencies) -> Any:
    """Build a request dependency which resolves local Bearer authentication.

    Args:
        dependencies: Composed application collaborators.

    Returns:
        Async FastAPI dependency function.
    """

    def resolve(
        authorization: Annotated[str | None, Header()] = None,
        session: Session = Depends(dependencies.get_session),
    ) -> User:
        """Validate an application Bearer token and resolve user ownership.

        Args:
            authorization: HTTP Authorization header.
            session: Injected API database transaction.

        Returns:
            Authenticated linked user.
        """
        return _authenticated_user(dependencies, session, authorization)

    return resolve


def _current_user_id(dependencies: ApplicationDependencies) -> Any:
    """Build a short-lived authentication dependency for long-running inference routes.

    Args:
        dependencies: Composed application collaborators.

    Returns:
        Dependency returning a detached authenticated user ID.
    """

    def resolve(authorization: Annotated[str | None, Header()] = None) -> str:
        """Resolve and detach the owner before any provider request begins.

        Args:
            authorization: HTTP Authorization header.

        Returns:
            Authenticated user ID detached from the closed lookup session.
        """
        with next(dependencies.database.session()) as session:
            try:
                user_id = _authenticated_user(dependencies, session, authorization).id
                session.commit()
                return user_id
            except Exception:
                session.rollback()
                raise

    return resolve


def _register_resources(
    app: FastAPI, dependencies: ApplicationDependencies, session_dependency: Any
) -> None:
    """Register legacy resource paths through ownership-scoped services.

    Args:
        app: FastAPI application receiving routes.
        dependencies: Composed application collaborators.
        session_dependency: Request database dependency annotation.

    Returns:
        None.
    """
    user_dependency = _current_user(dependencies)

    @app.get("/v1/notes", response_model=NoteListResponse, operation_id="listNotes")
    def list_notes(
        session: session_dependency, user: Annotated[User, Depends(user_dependency)]
    ) -> NoteListResponse:
        """List caller-owned notes.

        Args:
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Private notes ordered by update time.
        """
        return NoteListResponse(
            items=[
                NoteResponse.model_validate(item, from_attributes=True)
                for item in dependencies.resources.list_notes(session, user.id)
            ]
        )

    @app.post("/v1/notes", response_model=NoteResponse, status_code=201, operation_id="createNote")
    def create_note(
        body: NoteCreateRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> NoteResponse:
        """Create an owned note.

        Args:
            body: Strict note creation representation.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Persisted note representation.
        """
        return NoteResponse.model_validate(
            dependencies.resources.create_note(session, user.id, body.title, body.content),
            from_attributes=True,
        )

    @app.patch("/v1/notes/{note_id}", response_model=NoteResponse, operation_id="patchNote")
    @app.put("/v1/notes/{note_id}", response_model=NoteResponse, operation_id="replaceNote")
    def update_note(
        note_id: UUID,
        body: NoteUpdateRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> NoteResponse:
        """Partially update an owned note through either PATCH or PUT.

        Args:
            note_id: UUID target note.
            body: Strict update representation.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Updated note representation.
        """
        if body.title is None and body.content is None and body.pinned is None:
            raise HTTPException(400, "At least one note field is required.")
        try:
            note = dependencies.resources.update_note(
                session, user.id, note_id, body.title, body.content, body.pinned
            )
        except ResourceNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        return NoteResponse.model_validate(note, from_attributes=True)

    @app.delete("/v1/notes/{note_id}", status_code=204, operation_id="deleteNote")
    def delete_note(
        note_id: UUID, session: session_dependency, user: Annotated[User, Depends(user_dependency)]
    ) -> Response:
        """Delete one caller-owned note.

        Args:
            note_id: UUID target note.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Empty deletion response.
        """
        try:
            dependencies.resources.delete_note(session, user.id, note_id)
        except ResourceNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        return Response(status_code=204)

    @app.post(
        "/v1/notes/{note_id}/summary",
        response_model=NoteResponse,
        operation_id="summarizeNote",
    )
    async def summarize_note(
        note_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> NoteResponse:
        """Generate and persist a summary for an owned unchanged note.

        Args:
            note_id: UUID target note.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Complete note including generated summary.
        """
        try:
            note = await dependencies.resources.summarize_note(session, user.id, note_id)
        except LanguageModelOffError as error:
            raise HTTPException(409, LLM_OFF_MESSAGE) from error
        except ResourceNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        except NoteChangedError as error:
            raise HTTPException(
                409,
                "The note changed while its summary was being generated. Generate it again.",
            ) from error
        except ValueError as error:
            raise HTTPException(
                502, "The summary provider could not complete the request."
            ) from error
        return NoteResponse.model_validate(note, from_attributes=True)

    @app.get("/v1/dictionary", response_model=DictionaryListResponse, operation_id="listDictionary")
    def list_dictionary(
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> DictionaryListResponse:
        """List caller-owned private dictionary entries.

        Args:
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Dictionary entries ordered by creation.
        """
        entries = dependencies.resources.list_dictionary(session, user.id)
        return DictionaryListResponse(
            items=[
                DictionaryResponse.model_validate(entry, from_attributes=True) for entry in entries
            ]
        )

    @app.post(
        "/v1/dictionary",
        response_model=DictionaryResponse,
        status_code=201,
        operation_id="createDictionaryEntry",
    )
    def create_dictionary(
        body: DictionaryCreateRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> DictionaryResponse:
        """Create a caller-owned dictionary replacement.

        Args:
            body: Strict dictionary create representation.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Persisted dictionary entry.
        """
        try:
            entry = dependencies.resources.create_dictionary(
                session, user.id, body.phrase, body.replacement
            )
        except DuplicateDictionaryError as error:
            raise HTTPException(409, "This phrase is already in your dictionary.") from error
        return DictionaryResponse.model_validate(entry, from_attributes=True)

    @app.patch(
        "/v1/dictionary/{entry_id}",
        response_model=DictionaryResponse,
        operation_id="patchDictionaryEntry",
    )
    @app.put(
        "/v1/dictionary/{entry_id}",
        response_model=DictionaryResponse,
        operation_id="replaceDictionaryEntry",
        deprecated=True,
    )
    def update_dictionary(
        entry_id: UUID,
        body: DictionaryUpdateRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> DictionaryResponse:
        """Partially update one owned dictionary entry through legacy PUT.

        Args:
            entry_id: UUID target dictionary entry.
            body: Strict replacement representation.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Updated dictionary entry.
        """
        if body.phrase is None and body.replacement is None:
            raise HTTPException(400, "At least one dictionary field is required.")
        try:
            entry = dependencies.resources.update_dictionary(
                session, user.id, entry_id, body.phrase, body.replacement
            )
        except ResourceNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        except DuplicateDictionaryError as error:
            raise HTTPException(409, "This phrase is already in your dictionary.") from error
        return DictionaryResponse.model_validate(entry, from_attributes=True)

    @app.delete(
        "/v1/dictionary/{entry_id}",
        status_code=204,
        operation_id="deleteDictionaryEntry",
    )
    def delete_dictionary(
        entry_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> Response:
        """Delete one caller-owned dictionary entry.

        Args:
            entry_id: UUID target dictionary entry.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Empty deletion response.
        """
        try:
            dependencies.resources.delete_dictionary(session, user.id, entry_id)
        except ResourceNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        return Response(status_code=204)

    @app.get(
        "/v1/transcripts",
        response_model=TranscriptListResponse,
        operation_id="listTranscripts",
        deprecated=True,
    )
    def list_transcripts(
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> TranscriptListResponse:
        """List caller-owned transcripts newest first.

        Args:
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Owned transcript representations.
        """
        items = dependencies.resources.list_transcripts(session, user.id)
        return TranscriptListResponse(
            items=[TranscriptResponse.model_validate(item, from_attributes=True) for item in items]
        )

    @app.delete(
        "/v1/transcripts/{transcript_id}",
        status_code=204,
        operation_id="deleteTranscript",
        deprecated=True,
    )
    def delete_transcript(
        transcript_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> Response:
        """Delete one caller-owned transcript.

        Args:
            transcript_id: UUID target transcript.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Empty deletion response.
        """
        try:
            dependencies.resources.delete_transcript(session, user.id, transcript_id)
        except ResourceNotFoundError as error:
            raise HTTPException(404, str(error)) from error
        return Response(status_code=204)

    @app.post(
        "/v1/transcriptions",
        response_model=TranscriptResponse,
        status_code=200,
        operation_id="createTranscription",
    )
    async def create_transcription(
        file: UploadFile = File(),
        language: str | None = None,
        polish: bool = False,
        session: Session = Depends(dependencies.get_session),
        user: User = Depends(user_dependency),
    ) -> TranscriptResponse:
        """Transcribe a bounded audio upload for the authenticated owner.

        Args:
            file: Required audio file upload.
            language: Optional language hint.
            polish: Whether to polish returned transcription text.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Persisted transcript representation.

        Raises:
            HTTPException: If upload constraints or inference fail.
        """
        if file.content_type is None or not (
            file.content_type.startswith("audio/")
            or file.content_type in {"video/webm", "application/ogg"}
        ):
            raise HTTPException(415, "The uploaded file must be audio.")
        audio = await file.read(_MAX_AUDIO_BYTES + 1)
        if len(audio) > _MAX_AUDIO_BYTES:
            raise HTTPException(413, "Audio uploads are limited to 25 MB.")
        try:
            item = await dependencies.resources.transcribe(
                session,
                user.id,
                audio,
                file.filename or "recording",
                file.content_type,
                language,
                polish,
            )
        except SpeechUnavailableError as error:
            raise HTTPException(503, str(error)) from error
        except AudioDecodeError as error:
            raise HTTPException(415, str(error)) from error
        except LanguageModelOffError as error:
            raise HTTPException(409, LLM_OFF_MESSAGE) from error
        except ValueError as error:
            raise HTTPException(
                502, "The transcription provider could not complete the request."
            ) from error
        finally:
            await file.close()
        return TranscriptResponse.model_validate(item, from_attributes=True)


def _register_metrics(
    app: FastAPI, dependencies: ApplicationDependencies, session_dependency: Any
) -> None:
    """Register account-level metric endpoints backed by incremental aggregates.

    Args:
        app: FastAPI application receiving routes.
        dependencies: Composed application collaborators.
        session_dependency: Request database dependency annotation.

    Returns:
        None.
    """
    user_dependency = _current_user(dependencies)

    @app.put("/v1/dictation-metrics/{event_id}", status_code=200, operation_id="putDictationMetric")
    def put_dictation_metric(
        event_id: UUID,
        body: DictationMetricRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> Response:
        """Record a retry-safe dictation metric event without retaining text.

        Args:
            event_id: Client-stable idempotency identifier.
            body: Validated numerical metric event.
            session: Injected API database transaction.
            user: Authenticated metric owner.

        Returns:
            Empty 200 acknowledgement for new and identical retried events.
        """
        try:
            dependencies.metrics.put(session, user.id, str(event_id), body)
        except MetricConflictError as error:
            raise HTTPException(409, str(error)) from error
        except ValueError as error:
            raise HTTPException(422, str(error)) from error
        return Response(status_code=200)

    @app.get("/v1/metrics", response_model=MetricsResponse, operation_id="getMetrics")
    def get_metrics(
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        timezone: IanaTimezone = Query("UTC", alias="timeZone"),
    ) -> MetricsResponse:
        """Return lifetime and local-calendar metrics from maintained aggregates.

        Args:
            timezone: IANA zone defining local day and Sunday-based week boundaries.
            session: Injected API database transaction.
            user: Authenticated metric owner.

        Returns:
            Account metric dashboard representation.
        """
        return dependencies.metrics.overview(session, user.id, timezone, dependencies.clock.now())

    @app.get(
        "/v1/metrics/daily", response_model=DailyMetricsResponse, operation_id="getDailyMetrics"
    )
    def get_daily_metrics(
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        from_date: date | None = Query(None, alias="from"),
        until_date: date | None = Query(None, alias="until"),
        timezone: IanaTimezone = Query("UTC", alias="timeZone"),
    ) -> DailyMetricsResponse:
        """List a bounded inclusive calendar-date range of metric rollups.

        Args:
            from_date: Optional first date, defaulting to 29 days ago.
            until_date: Optional last date, defaulting to today.
            timezone: IANA zone that decides which date is today.
            session: Injected API database transaction.
            user: Authenticated metric owner.

        Returns:
            Daily account metric aggregates.
        """
        today = dependencies.clock.now().astimezone(ZoneInfo(timezone)).date()
        end = until_date or today
        start = from_date or end.fromordinal(end.toordinal() - 29)
        try:
            return dependencies.metrics.daily(session, user.id, start, end)
        except ValueError as error:
            raise HTTPException(422, str(error)) from error

    @app.get("/v1/metrics/apps", response_model=AppMetricsResponse, operation_id="getAppMetrics")
    def get_app_metrics(
        session: session_dependency, user: Annotated[User, Depends(user_dependency)]
    ) -> AppMetricsResponse:
        """Return words and dictation count by focused application.

        Args:
            session: Injected API database transaction.
            user: Authenticated metric owner.

        Returns:
            Application metric aggregates.
        """
        return dependencies.metrics.apps(session, user.id)


def _register_meetings(
    app: FastAPI, dependencies: ApplicationDependencies, session_dependency: Any
) -> None:
    """Register HTTP adapters for owner-scoped meetings and private audio.

    Args:
        app: FastAPI application receiving routes.
        dependencies: Composed application collaborators.
        session_dependency: Request database dependency annotation.

    Returns:
        None.
    """
    user_dependency = _current_user(dependencies)
    question_user_dependency = _current_user_id(dependencies)

    @app.post(
        "/v1/meetings",
        response_model=MeetingResponse,
        status_code=201,
        operation_id="createMeeting",
    )
    def create_meeting(
        body: MeetingCreateRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingResponse:
        """Create an owned meeting.

        Args:
            body: Meeting metadata and optional stable identifier.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Created or idempotently existing meeting.
        """
        try:
            meeting = dependencies.meetings.create_meeting(
                session, user.id, body.id, body.title, body.started_at
            )
        except MeetingConflictError as error:
            raise _meeting_http_error(error) from error
        return MeetingResponse.model_validate(dependencies.meetings.response_data(session, meeting))

    @app.get("/v1/meetings", response_model=MeetingListResponse, operation_id="listMeetings")
    def list_meetings(
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        cursor: str | None = None,
        limit: int = Query(50, ge=1, le=100),
    ) -> MeetingListResponse:
        """List owned meetings using a stable opaque cursor.

        Args:
            cursor: Optional opaque continuation cursor.
            limit: Bounded maximum number of meetings.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            One meeting page.
        """
        try:
            items, next_cursor = dependencies.meetings.list_meetings(
                session, user.id, cursor, limit
            )
        except MeetingConflictError as error:
            raise _meeting_http_error(error) from error
        return MeetingListResponse(
            items=[
                MeetingResponse.model_validate(dependencies.meetings.response_data(session, item))
                for item in items
            ],
            nextCursor=next_cursor,
        )

    @app.get("/v1/meetings/{meeting_id}", response_model=MeetingResponse, operation_id="getMeeting")
    def get_meeting(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingResponse:
        """Return one owned meeting.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Flattened meeting state.
        """
        try:
            meeting = dependencies.meetings.get_meeting(session, user.id, meeting_id)
        except MeetingNotFoundError as error:
            raise _meeting_http_error(error) from error
        return MeetingResponse.model_validate(dependencies.meetings.response_data(session, meeting))

    @app.patch(
        "/v1/meetings/{meeting_id}", response_model=MeetingResponse, operation_id="patchMeeting"
    )
    def patch_meeting(
        meeting_id: UUID,
        body: MeetingMetadataPatchRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> MeetingResponse:
        """Conditionally update owned meeting metadata.

        Args:
            meeting_id: Target meeting UUID.
            body: Partial meeting metadata.
            if_match: Required metadata revision precondition.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Updated meeting representation.
        """
        try:
            meeting = dependencies.meetings.patch_metadata(
                session,
                user.id,
                meeting_id,
                _revision(if_match),
                body.title,
                body.started_at,
                body.ended_at,
            )
        except MeetingErrorTypes as error:
            raise _meeting_http_error(error) from error
        return MeetingResponse.model_validate(dependencies.meetings.response_data(session, meeting))

    @app.delete("/v1/meetings/{meeting_id}", status_code=204, operation_id="deleteMeeting")
    def delete_meeting(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> Response:
        """Delete an owned meeting and all private audio.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Empty deletion acknowledgement.
        """
        try:
            dependencies.meetings.delete_meeting(session, user.id, meeting_id)
        except MeetingNotFoundError as error:
            raise _meeting_http_error(error) from error
        return Response(status_code=204)

    @app.post(
        "/v1/meetings/{meeting_id}/resume",
        response_model=MeetingResponse,
        operation_id="resumeMeeting",
    )
    def resume_meeting(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingResponse:
        """Reopen an owned meeting for more audio.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Reopened meeting state.
        """
        try:
            meeting = dependencies.meetings.resume_meeting(session, user.id, meeting_id)
        except MeetingNotFoundError as error:
            raise _meeting_http_error(error) from error
        return MeetingResponse.model_validate(dependencies.meetings.response_data(session, meeting))

    @app.post(
        "/v1/meetings/{meeting_id}/finish",
        response_model=MeetingResponse,
        operation_id="finishMeeting",
    )
    def finish_meeting(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingResponse:
        """Finish capture and queue eligible durable summary work.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Finished meeting state.
        """
        try:
            meeting = dependencies.meetings.finish_meeting(session, user.id, meeting_id)
        except MeetingNotFoundError as error:
            raise _meeting_http_error(error) from error
        return MeetingResponse.model_validate(dependencies.meetings.response_data(session, meeting))

    @app.post(
        "/v1/meetings/{meeting_id}/segments/{segment_id}",
        response_model=MeetingSegmentResponse,
        status_code=201,
        operation_id="uploadMeetingSegment",
    )
    async def upload_meeting_segment(
        meeting_id: UUID,
        segment_id: UUID,
        file: UploadFile = File(),
        duration_ms: int = Query(alias="durationMs", ge=0),
        language: str | None = None,
        session: Session = Depends(dependencies.get_session),
        user: User = Depends(user_dependency),
    ) -> MeetingSegmentResponse:
        """Stream a bounded audio segment into private meeting storage.

        Args:
            meeting_id: Target active meeting UUID.
            segment_id: Stable segment retry identifier.
            file: Multipart audio stream.
            duration_ms: Device-measured segment duration.
            language: Optional spoken-language hint.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Accepted or identical prior segment state.
        """
        try:
            if file.content_type is None:
                raise UnsupportedAudioError()
            segment = await dependencies.meetings.upload_segment(
                session,
                user.id,
                meeting_id,
                segment_id,
                file,
                file.filename or "recording",
                file.content_type,
                duration_ms,
                language,
            )
        except (
            MeetingNotFoundError,
            MeetingConflictError,
            AudioTooLargeError,
            UnsupportedAudioError,
        ) as error:
            raise _meeting_http_error(error) from error
        finally:
            await file.close()
        return MeetingSegmentResponse.model_validate(_segment_data(segment))

    @app.get(
        "/v1/meetings/{meeting_id}/transcript",
        response_model=MeetingTranscriptResponse,
        operation_id="getMeetingTranscript",
    )
    def get_meeting_transcript(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingTranscriptResponse:
        """Return independently versioned owned transcript state.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Transcript state.
        """
        try:
            meeting = dependencies.meetings.get_meeting(session, user.id, meeting_id)
        except MeetingNotFoundError as error:
            raise _meeting_http_error(error) from error
        return MeetingTranscriptResponse.model_validate(
            dependencies.meetings.transcript_data(meeting)
        )

    @app.patch(
        "/v1/meetings/{meeting_id}/transcript",
        response_model=MeetingTranscriptResponse,
        operation_id="patchMeetingTranscript",
    )
    def patch_meeting_transcript(
        meeting_id: UUID,
        body: MeetingTextPatchRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> MeetingTranscriptResponse:
        """Conditionally replace an owned meeting transcript.

        Args:
            meeting_id: Target meeting UUID.
            body: Full transcript replacement.
            if_match: Required transcript revision precondition.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Updated transcript state.
        """
        try:
            meeting = dependencies.meetings.patch_transcript(
                session, user.id, meeting_id, _revision(if_match), body.text
            )
        except MeetingErrorTypes as error:
            raise _meeting_http_error(error) from error
        return MeetingTranscriptResponse.model_validate(
            dependencies.meetings.transcript_data(meeting)
        )

    @app.get(
        "/v1/meetings/{meeting_id}/summary",
        response_model=MeetingSummaryResponse,
        operation_id="getMeetingSummary",
    )
    def get_meeting_summary(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingSummaryResponse:
        """Return independently versioned owned summary state.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Summary state.
        """
        try:
            meeting = dependencies.meetings.get_meeting(session, user.id, meeting_id)
        except MeetingNotFoundError as error:
            raise _meeting_http_error(error) from error
        return MeetingSummaryResponse.model_validate(dependencies.meetings.summary_data(meeting))

    @app.patch(
        "/v1/meetings/{meeting_id}/summary",
        response_model=MeetingSummaryResponse,
        operation_id="patchMeetingSummary",
    )
    def patch_meeting_summary(
        meeting_id: UUID,
        body: MeetingTextPatchRequest,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        if_match: Annotated[str | None, Header(alias="If-Match")] = None,
    ) -> MeetingSummaryResponse:
        """Conditionally replace an owned meeting summary.

        Args:
            meeting_id: Target meeting UUID.
            body: Full summary replacement.
            if_match: Required summary revision precondition.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Updated summary state.
        """
        try:
            meeting = dependencies.meetings.patch_summary(
                session, user.id, meeting_id, _revision(if_match), body.text
            )
        except MeetingErrorTypes as error:
            raise _meeting_http_error(error) from error
        return MeetingSummaryResponse.model_validate(dependencies.meetings.summary_data(meeting))

    @app.post(
        "/v1/meetings/{meeting_id}/summary/regenerate",
        response_model=MeetingResponse,
        operation_id="regenerateMeetingSummary",
    )
    def regenerate_meeting_summary(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingResponse:
        """Queue a new summary for a completed meeting.

        Args:
            meeting_id: Target meeting UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Meeting state with queued summary work.
        """
        try:
            meeting = dependencies.meetings.regenerate_summary(session, user.id, meeting_id)
        except (MeetingNotFoundError, MeetingConflictError) as error:
            raise _meeting_http_error(error) from error
        return MeetingResponse.model_validate(dependencies.meetings.response_data(session, meeting))

    @app.post(
        "/v1/meetings/{meeting_id}/questions",
        response_model=MeetingQuestionResponse,
        response_model_by_alias=True,
        operation_id="askMeetingQuestion",
    )
    async def ask_meeting_question(
        meeting_id: UUID,
        body: MeetingQuestionRequest,
        user_id: Annotated[str, Depends(question_user_dependency)],
    ) -> MeetingQuestionResponse:
        """Answer one question from an owned meeting's complete saved snapshot.

        The transaction ends before inference so a slow configured provider cannot
        hold an SQLite write lock. The request carries no transcript or summary;
        only the owned saved record can supply the model context.

        Args:
            meeting_id: Target owned meeting UUID.
            body: Question and optional revision expectations.
            user_id: Detached authenticated meeting owner ID.

        Returns:
            Ephemeral answer and the revisions used to ground it.

        Raises:
            HTTPException: If the meeting cannot be used or the provider fails.
        """
        meeting_ai = dependencies.meeting_ai
        if meeting_ai is None or not dependencies.gateway.llm_enabled:
            raise HTTPException(409, LLM_OFF_MESSAGE)
        with next(dependencies.database.session()) as source_session:
            try:
                source = dependencies.meetings.question_source(source_session, user_id, meeting_id)
                if source.transcript_status != "complete":
                    raise MeetingConflictError(
                        "Finish processing the transcript before asking a question."
                    )
                if not source.transcript.strip():
                    raise ValueError("The saved transcript is empty.")
                if (
                    body.transcript_revision is not None
                    and body.transcript_revision != source.transcript_revision
                ) or (
                    body.summary_revision is not None
                    and body.summary_revision != source.summary_revision
                ):
                    raise MeetingRevisionConflictError()
                source_session.commit()
            except MeetingNotFoundError as error:
                source_session.rollback()
                raise _meeting_http_error(error) from error
            except MeetingConflictError as error:
                source_session.rollback()
                raise _meeting_http_error(error) from error
            except ValueError as error:
                source_session.rollback()
                raise HTTPException(422, str(error)) from error
        try:
            answer = await meeting_ai.answer(
                source,
                body.question,
                timeout_seconds=dependencies.settings.meeting_gateway_timeout_seconds,
            )
        except ContextLimitError as error:
            raise HTTPException(422, str(error)) from error
        except EmptyMeetingAiOutputError as error:
            raise HTTPException(
                502, "The meeting question provider returned an empty answer."
            ) from error
        except OversizedMeetingAiOutputError as error:
            raise HTTPException(
                502, "The meeting question provider returned an answer that is too large."
            ) from error
        except ValueError as error:
            raise HTTPException(
                502, "The meeting question provider could not complete the request."
            ) from error
        return MeetingQuestionResponse(
            answer=answer.answer,
            transcriptRevision=source.transcript_revision,
            summaryRevision=source.summary_revision,
            summaryStale=source.summary_stale,
            usedSummary=source.summary is not None,
        )

    @app.post(
        "/v1/meetings/{meeting_id}/segments/{segment_id}/retry",
        response_model=MeetingSegmentResponse,
        operation_id="retryMeetingSegment",
    )
    def retry_meeting_segment(
        meeting_id: UUID,
        segment_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> MeetingSegmentResponse:
        """Requeue a failed owned meeting segment.

        Args:
            meeting_id: Parent meeting UUID.
            segment_id: Failed segment UUID.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Requeued segment state.
        """
        try:
            segment = dependencies.meetings.retry_segment(session, user.id, meeting_id, segment_id)
        except (MeetingNotFoundError, MeetingConflictError) as error:
            raise _meeting_http_error(error) from error
        return MeetingSegmentResponse.model_validate(_segment_data(segment))

    @app.get(
        "/v1/meetings/{meeting_id}/audio",
        response_class=FileResponse,
        operation_id="getMeetingAudio",
    )
    def get_meeting_audio(
        meeting_id: UUID,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
        segment_id: UUID | None = Query(None, alias="segmentId"),
    ) -> FileResponse:
        """Download one authenticated private meeting audio segment.

        Args:
            meeting_id: Parent meeting UUID.
            segment_id: Optional segment UUID when there is only one recording.
            session: Injected API database transaction.
            user: Authenticated meeting owner.

        Returns:
            Range-capable private audio file response.
        """
        try:
            audio = dependencies.meetings.get_audio(session, user.id, meeting_id, segment_id)
        except (MeetingNotFoundError, MeetingConflictError) as error:
            raise _meeting_http_error(error) from error
        return FileResponse(audio.path, media_type=audio.content_type, filename=audio.filename)


def _register_transformations(app: FastAPI, dependencies: ApplicationDependencies, _: Any) -> None:
    """Register non-mutating transformation proposal adapter.

    Args:
        app: FastAPI application receiving routes.
        dependencies: Composed application collaborators.
        _: Retained signature symmetry with resource registration helpers.

    Returns:
        None.
    """
    user_dependency = _current_user(dependencies)

    @app.post(
        "/v1/text-transformations",
        response_model=TextTransformationResponse,
        response_model_by_alias=True,
        operation_id="createTextTransformation",
    )
    async def create_text_transformation(
        body: TextTransformationRequest, user: Annotated[User, Depends(user_dependency)]
    ) -> TextTransformationResponse:
        """Generate a review-only transformation outside a long database transaction.

        Args:
            body: Validated inline or owned-resource transformation request.
            user: Authenticated transformation owner.

        Returns:
            Proposed output without mutating source text, dictionary, or metrics.
        """
        if not dependencies.gateway.llm_enabled:
            raise HTTPException(409, LLM_OFF_MESSAGE)
        with next(dependencies.database.session()) as source_session:
            try:
                text, revision = dependencies.transformations.source(source_session, user.id, body)
                source_session.commit()
            except ResourceNotFoundError as error:
                source_session.rollback()
                raise HTTPException(404, str(error)) from error
            except TransformationConflictError as error:
                source_session.rollback()
                raise HTTPException(412, "The source changed. Refresh it and try again.") from error
            except TransformationSourceError as error:
                source_session.rollback()
                raise HTTPException(
                    422, "The selected source has no transformable text."
                ) from error
        try:
            return await dependencies.transformations.generate(body, text, revision)
        except (ValueError, httpx.HTTPError) as error:
            raise HTTPException(
                502, "The transformation provider could not complete the request."
            ) from error


def _register_sync(
    app: FastAPI, dependencies: ApplicationDependencies, session_dependency: Any
) -> None:
    """Register the snapshot routes the desktop uses to keep two servers in step.

    Args:
        app: FastAPI application receiving routes.
        dependencies: Composed application collaborators.
        session_dependency: Request database dependency annotation.

    Returns:
        None.
    """
    user_dependency = _current_user(dependencies)

    @app.get("/v1/sync", response_model=SyncSnapshot, operation_id="exportSyncSnapshot")
    def export_sync_snapshot(
        session: session_dependency, user: Annotated[User, Depends(user_dependency)]
    ) -> SyncSnapshot:
        """Export the caller's notes, dictionary, finished meetings, metrics and deletions.

        Args:
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            The caller's complete snapshot. Audio is never included.
        """
        return dependencies.sync.export(session, user.id)

    @app.post("/v1/sync", response_model=SyncMergeResponse, operation_id="mergeSyncSnapshot")
    def merge_sync_snapshot(
        body: SyncSnapshot,
        session: session_dependency,
        user: Annotated[User, Depends(user_dependency)],
    ) -> SyncMergeResponse:
        """Merge another server's snapshot of the same person into the caller's data.

        The newer copy of each record wins and remembered deletions are applied.

        Args:
            body: Snapshot exported by the other server.
            session: Injected API database transaction.
            user: Authenticated owner.

        Returns:
            Number of records changed here.
        """
        return SyncMergeResponse(changes=dependencies.sync.merge(session, user.id, body))


def _remote_only(dependencies: ApplicationDependencies) -> None:
    """Hide browser sign-in, device polling and refresh on an on-device server.

    Args:
        dependencies: Composed application collaborators.

    Returns:
        None.

    Raises:
        HTTPException: 404 when running the on-device profile.
    """
    if dependencies.local is not None:
        raise HTTPException(404, _NOT_FOUND)


def _local_profile(dependencies: ApplicationDependencies) -> "LocalProfile":
    """Return the on-device profile or hide the route on a remote server.

    Args:
        dependencies: Composed application collaborators.

    Returns:
        Active on-device profile.

    Raises:
        HTTPException: 404 on a remote deployment.
    """
    if dependencies.local is None:
        raise HTTPException(404, _NOT_FOUND)
    return dependencies.local


def _guard_loopback(app: FastAPI, local: "LocalProfile") -> None:
    """Reject foreign Host names and cross-site browser origins before routing.

    Args:
        app: Application receiving the middleware.
        local: On-device profile holding the accepted host names.

    Returns:
        None.
    """
    from whisperer_api.local_runtime import host_allowed, origin_allowed

    @app.middleware("http")
    async def loopback_only(request: Request, call_next: Any) -> Response:
        """Refuse DNS-rebinding and web-page requests to the local server.

        Args:
            request: Incoming request.
            call_next: Next ASGI handler.

        Returns:
            Response from the route, or a 403 problem.
        """
        if not host_allowed(request.headers.get("host"), local.allowed_hosts) or not origin_allowed(
            request.headers.get("origin")
        ):
            return _problem(request, 403, "This server only accepts requests from this device.")
        if request.url.path in _REMOTE_ONLY_PATHS:
            return _problem(request, 404, _NOT_FOUND)
        response: Response = await call_next(request)
        return response


def _cancel_background(dependencies: ApplicationDependencies, local: "LocalProfile | None") -> None:
    """Cancel request-spawned tasks and any running model download at shutdown.

    Args:
        dependencies: Application collaborators owning the background tasks.
        local: On-device profile, or None for a remote deployment.

    Returns:
        None.
    """
    for task in dependencies.background:
        task.cancel()
    if local is not None and local.download is not None:
        local.download.cancel()


def _default_mcp_auth(settings: Settings) -> "AuthProvider":
    """Build the production OIDC proxy for the remote MCP endpoint.

    Args:
        settings: Settings for which ``mcp_configured`` is true.

    Returns:
        Configured OAuth proxy; constructing it fetches the issuer's discovery document.
    """
    from whisperer_api.mcp_auth import build_mcp_auth_provider

    return build_mcp_auth_provider(settings, Path(settings.mcp_storage_dir))


def _mount_mcp(
    app: FastAPI,
    dependencies: ApplicationDependencies,
    auth_factory: "Callable[[Settings], AuthProvider]",
) -> "Lifespan[FastAPI] | None":
    """Mount the authenticated MCP endpoint when a remote deployment configures it.

    The on-device profile never mounts MCP. An enabled but incomplete configuration,
    or an OAuth provider that cannot start, leaves MCP absent and the API serving.

    Args:
        app: Parent FastAPI application.
        dependencies: Application collaborators.
        auth_factory: Builds the MCP OAuth provider.

    Returns:
        The MCP lifespan to enter at startup, or None when nothing was mounted.
    """
    settings = dependencies.settings
    if dependencies.local is not None or not settings.mcp_enabled:
        return None
    if not settings.mcp_configured:
        _LOGGER.warning(
            "MCP is enabled but not mounted; missing settings: %s",
            ", ".join(settings.missing_mcp_configuration),
        )
        return None
    try:
        auth = auth_factory(settings)
    except Exception as error:
        # The error text may echo upstream responses, so only its type is logged.
        _LOGGER.warning("MCP is not mounted; its OAuth provider failed (%s).", type(error).__name__)
        return None
    from whisperer_api.mcp_server import register_mcp

    return register_mcp(app, dependencies, auth)


async def _start_local(dependencies: ApplicationDependencies, local: "LocalProfile") -> None:
    """Create the device principal, report the database and prepare speech.

    Args:
        dependencies: Composed application collaborators.
        local: On-device profile.

    Returns:
        None.
    """
    if dependencies.local_auth is not None:
        with next(dependencies.database.session()) as session:
            dependencies.local_auth.ensure_user(session)
            session.commit()
    local.emit({"event": "database", "status": "ready"})
    local.store.clean_staging()
    if local.onnx is not None:
        onnx = local.onnx
        # Loading a large model can take seconds; never hold up the API.
        task = asyncio.create_task(onnx.prepare())
        dependencies.background.add(task)
        task.add_done_callback(dependencies.background.discard)


def _engine_status(provider: Any) -> InferenceEngineStatus:
    """Describe one provider without credentials.

    Args:
        provider: Speech or language-model provider.

    Returns:
        Public engine status.
    """
    status, message = provider.status()
    name = getattr(provider, "provider", None)
    return InferenceEngineStatus(
        provider=None if name == "unconfigured" else name,
        model=getattr(provider, "model", None) or None,
        status=status,
        message=message,
    )


def _register_local(app: FastAPI, dependencies: ApplicationDependencies) -> None:
    """Register on-device routes; a remote deployment answers them with 404.

    Args:
        app: FastAPI application receiving routes.
        dependencies: Composed application collaborators.

    Returns:
        None.
    """
    user_dependency = _current_user(dependencies)

    def require_local() -> None:
        """Hide on-device routes on a remote deployment before any validation.

        Args:
            None.

        Returns:
            None.
        """
        _local_profile(dependencies)

    local_only = [Depends(require_local)]

    @app.post(
        "/v1/local/challenge",
        response_model=LocalChallengeResponse,
        operation_id="answerLocalChallenge",
        dependencies=local_only,
    )
    def local_challenge(body: LocalChallengeRequest) -> LocalChallengeResponse:
        """Prove this process received the desktop's boot token.

        Args:
            body: Desktop-chosen nonce.

        Returns:
            HMAC of the nonce keyed by the boot token text.
        """
        _local_profile(dependencies)
        assert dependencies.local_auth is not None  # noqa: S101
        return LocalChallengeResponse(hmac=dependencies.local_auth.challenge(body.nonce))

    @app.get(
        "/v1/inference/status",
        response_model=InferenceStatusResponse,
        operation_id="getInferenceStatus",
        dependencies=local_only,
    )
    def inference_status(
        user: Annotated[User, Depends(user_dependency)],
    ) -> InferenceStatusResponse:
        """Report speech and language-model readiness separately.

        Args:
            user: Authenticated device owner.

        Returns:
            Engine states without credentials.
        """
        del user
        _local_profile(dependencies)
        return InferenceStatusResponse(
            speech=_engine_status(dependencies.gateway.speech),
            llm=_engine_status(dependencies.gateway.llm),
        )

    @app.get(
        "/v1/inference/models",
        response_model=SpeechModelListResponse,
        operation_id="listSpeechModels",
        dependencies=local_only,
    )
    def list_speech_models(
        user: Annotated[User, Depends(user_dependency)],
    ) -> SpeechModelListResponse:
        """List supported on-device speech models and whether each is installed.

        Args:
            user: Authenticated device owner.

        Returns:
            Pinned catalog entries.
        """
        del user
        local = _local_profile(dependencies)
        return SpeechModelListResponse(
            items=[
                SpeechModelResponse(
                    id=spec.id,
                    title=spec.title,
                    revision=spec.revision,
                    license=spec.license,
                    languages=list(spec.languages),
                    size_bytes=spec.total_bytes,
                    installed=local.store.is_installed(spec),
                )
                for spec in local.store.catalog.values()
            ]
        )

    @app.post(
        "/v1/inference/models/download",
        response_model=ModelDownloadResponse,
        status_code=202,
        operation_id="downloadSpeechModel",
        dependencies=local_only,
    )
    async def download_speech_model(
        body: ModelDownloadRequest, user: Annotated[User, Depends(user_dependency)]
    ) -> ModelDownloadResponse:
        """Start one explicit catalog model download; progress goes to stdout events.

        Args:
            body: Catalog model identifier.
            user: Authenticated device owner.

        Returns:
            Acknowledgement of the started download.
        """
        del user
        local = _local_profile(dependencies)
        if body.model not in local.store.catalog:
            raise HTTPException(422, "This model is not supported on this device.")
        if not local.start_download(local.store.spec(body.model)):
            raise HTTPException(409, "A model download is already running.")
        return ModelDownloadResponse(model=body.model)

    @app.post(
        "/v1/inference/test",
        response_model=InferenceTestResponse,
        response_model_by_alias=True,
        operation_id="testInference",
        dependencies=local_only,
    )
    async def test_inference(
        body: InferenceTestRequest, user: Annotated[User, Depends(user_dependency)]
    ) -> InferenceTestResponse:
        """Probe one engine with a tiny synthetic request.

        Args:
            body: Engine to probe.
            user: Authenticated device owner.

        Returns:
            Probe outcome and latency.
        """
        del user
        _local_profile(dependencies)
        ok, latency, message = await dependencies.gateway.test(body.target)
        return InferenceTestResponse(ok=ok, latency_ms=latency, message=message)

    @app.delete(
        "/v1/local/data",
        status_code=204,
        operation_id="deleteLocalData",
        dependencies=local_only,
    )
    def delete_local_data(
        session: Annotated[Session, Depends(dependencies.get_session)],
        user: Annotated[User, Depends(user_dependency)],
    ) -> Response:
        """Permanently erase everything the device user stored on this server.

        Transcripts, notes, dictionary entries, meetings, their audio and metrics go. The
        runtime, downloaded models and configuration stay, so the server keeps working; the
        next request starts a fresh, empty device user.

        Args:
            session: Request transaction that also resolved the device user.
            user: Authenticated device owner.

        Returns:
            Empty acknowledgement once the data is gone.
        """
        _local_profile(dependencies)
        dependencies.meetings.sweep_orphan_audio()
        dependencies.meetings.delete_user_content(session, user.id)
        session.delete(user)
        # Commit before deleting files (see delete_account) and so VACUUM runs with no open
        # write transaction. Leftover audio is logged and retried by the next orphan sweep.
        session.commit()
        dependencies.meetings.erase_all_audio()
        dependencies.database.compact()
        return Response(status_code=204)


def _segment_data(segment: MeetingSegment) -> dict[str, object]:
    """Build the public lower-camel representation of one accepted segment.

    Args:
        segment: Owned persisted segment.

    Returns:
        Fields accepted by ``MeetingSegmentResponse``.
    """
    return {
        "id": segment.id,
        "status": segment.status,
        "durationMs": segment.duration_ms,
        "error": segment.error,
    }


def _revision(value: str | None) -> int:
    """Parse a required numeric If-Match revision without accepting weak tags.

    Args:
        value: Raw If-Match header value.

    Returns:
        Nonnegative expected revision.

    Raises:
        HTTPException: If the caller omitted or malformed the precondition.
    """
    try:
        revision = int(value or "")
    except ValueError as error:
        raise HTTPException(428, "A numeric If-Match revision is required.") from error
    if revision < 0:
        raise HTTPException(428, "A numeric If-Match revision is required.")
    return revision


MeetingErrorTypes = (MeetingNotFoundError, MeetingConflictError, MeetingRevisionConflictError)


def _meeting_http_error(error: Exception) -> HTTPException:
    """Translate meeting domain errors to stable safe HTTP failures.

    Args:
        error: Meeting operation exception.

    Returns:
        Matching HTTP exception with no private detail.
    """
    if isinstance(error, MeetingNotFoundError):
        return HTTPException(404, "Meeting not found.")
    if isinstance(error, MeetingRevisionConflictError):
        return HTTPException(412, str(error))
    if isinstance(error, AudioTooLargeError):
        return HTTPException(413, "Audio uploads are limited to 25 MB.")
    if isinstance(error, UnsupportedAudioError):
        return HTTPException(415, "The uploaded file must be supported audio.")
    return HTTPException(409, str(error))


def _meeting_audio_root(database_url: str) -> Path:
    """Derive a private sibling audio directory without serving it statically.

    Args:
        database_url: Configured isolated SQLAlchemy database URL.

    Returns:
        Safe private directory path for meeting audio.
    """
    if database_url.startswith("sqlite:///"):
        return Path(database_url.removeprefix("sqlite:///")).resolve().parent / "meeting-audio"
    return Path("./meeting-audio").resolve()


def _problem(request: Request, status: int, detail: str) -> JSONResponse:
    """Build a safe RFC 9457 problem response.

    Args:
        request: Request which caused the problem.
        status: HTTP status code.
        detail: Safe client-readable explanation.

    Returns:
        Problem response with application/problem+json media type.
    """
    titles = {
        400: "Bad Request",
        401: "Unauthorized",
        403: "Forbidden",
        404: "Not Found",
        409: "Conflict",
        412: "Precondition Failed",
        413: "Content Too Large",
        415: "Unsupported Media Type",
        422: "Unprocessable Content",
        428: "Precondition Required",
        502: "Bad Gateway",
        503: "Service Unavailable",
    }
    body = Problem(
        type="about:blank",
        title=titles.get(status, "Error"),
        status=status,
        detail=detail,
        instance=request.url.path,
    )
    return JSONResponse(
        body.model_dump(), status_code=status, media_type="application/problem+json"
    )


def __getattr__(name: str) -> FastAPI:
    """Build the remote deployment app on first access as ``whisperer_api.main:app``.

    Importing this module for the on-device profile must not read deployment
    environment settings or construct a remote application.

    Args:
        name: Requested module attribute.

    Returns:
        The remote FastAPI application.

    Raises:
        AttributeError: For any other missing attribute.
    """
    if name != "app":
        raise AttributeError(name)
    application = create_app()
    globals()["app"] = application
    return application
