"""End-to-end API smoke coverage using injected OIDC and gateway fakes."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import OctKey
from whisperer_api.auth import sign_in_code
from whisperer_api.main import create_app, redeem_in_transaction
from whisperer_api.persistence import DeviceAuthorization, User
from whisperer_api.resources import ResourceService
from whisperer_api.settings import Settings


class FakeHttpClient:
    """Satisfy startup preflight without making network calls."""

    async def get(
        self,
        url: str,
        *,
        timeout: float,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """Return successful OIDC discovery or gateway models.

        Args:
            url: Requested readiness URL.
            timeout: Requested bounded timeout.
            headers: Optional dependency credentials.

        Returns:
            Successful fake response.
        """
        del timeout, headers
        if url.endswith("openid-configuration"):
            return httpx.Response(
                200,
                json={
                    "issuer": "https://identity.example.test",
                    "authorization_endpoint": "https://identity.example.test/authorize",
                    "token_endpoint": "https://identity.example.test/token",
                    "jwks_uri": "https://identity.example.test/jwks",
                },
            )
        return httpx.Response(200, json={"data": [{"id": "transcribe"}, {"id": "polish"}]})

    async def aclose(self) -> None:
        """Provide the lifespan close seam.

        Args:
            None.

        Returns:
            None.
        """


class FakeOidc:
    """Complete generic OIDC callback without external identity traffic."""

    async def authorization_url(self, state: str, nonce: str, code_verifier: str) -> str:
        """Return a deterministic provider redirect.

        Args:
            state: Server state.
            nonce: Server nonce.
            code_verifier: Server PKCE verifier.

        Returns:
            Fake authorization URL.
        """
        del state, nonce, code_verifier
        return "https://identity.example.test/authorize"

    async def validate_callback(
        self, code: str, nonce: str, code_verifier: str
    ) -> dict[str, object]:
        """Return verified claims for the configured allowed group.

        Args:
            code: Provider callback code.
            nonce: Server callback nonce.
            code_verifier: Server PKCE verifier.

        Returns:
            Verified fake provider claims.
        """
        del code, nonce, code_verifier
        return {
            "sub": "subject-1",
            "groups": ["whisperer"],
            "given_name": "Ada",
            "family_name": "Lovelace",
        }


class FakeGateway:
    """Provide deterministic inference responses for resource routes."""

    async def transcribe(
        self, audio: bytes, filename: str, content_type: str, language: str | None
    ) -> str:
        """Return source text after validating received audio.

        Args:
            audio: Uploaded bytes.
            filename: Upload filename.
            content_type: Upload media type.
            language: Optional language hint.

        Returns:
            Deterministic raw text.
        """
        assert audio == b"audio"
        assert filename == "clip.webm"
        assert content_type == "audio/webm"
        assert language is None
        return "hello"

    async def polish(self, text: str) -> str:
        """Return deterministic polish output.

        Args:
            text: Existing text.

        Returns:
            Polished text.
        """
        return text

    async def summarize(self, text: str) -> str:
        """Return deterministic summary output.

        Args:
            text: Note text.

        Returns:
            Summary text.
        """
        return text


def test_oidc_device_resource_and_logout_flow(tmp_path: Path) -> None:
    """Exercise callback, single-use redemption, resources, logout, and expiry.

    Args:
        tmp_path: Pytest temporary directory for the isolated API database.

    Returns:
        None.
    """
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        oidc_allowed_groups="whisperer",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
        transcription_model="transcribe",
        polish_model="polish",
        database_url=f"sqlite:///{tmp_path / 'api.sqlite3'}",
    )
    app = create_app(settings)
    dependencies = app.state.dependencies
    dependencies.http_client = FakeHttpClient()
    dependencies.oidc = FakeOidc()
    dependencies.resources = ResourceService(dependencies.clock, FakeGateway())
    device_code = uuid4()
    verifier = "desktop-verifier"

    with TestClient(app) as client:
        login = client.get(
            "/login",
            params={"device_code": str(device_code), "verifier_challenge": _challenge(verifier)},
            follow_redirects=False,
        )
        assert login.status_code == 303
        with next(dependencies.database.session()) as session:
            state = session.get_one(
                __import__(
                    "whisperer_api.persistence", fromlist=["DeviceAuthorization"]
                ).DeviceAuthorization,
                str(device_code),
            ).state
        assert isinstance(state, str)
        confirm = client.get("/auth/callback", params={"code": "code", "state": state})
        assert confirm.status_code == 200
        assert sign_in_code(str(device_code)) in confirm.text
        assert "whisperer://" not in confirm.text
        callback = client.post("/auth/approve", data={"approval": _approval_token(confirm.text)})
        assert callback.status_code == 200
        completion_url = f"whisperer://auth/transfer/success?device_code={device_code}"
        assert completion_url in callback.text
        assert "access_token" not in callback.text
        assert "refresh_token" not in callback.text
        for page in (confirm, callback):
            assert page.headers["content-security-policy"] == (
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self';"
                " frame-ancestors 'none'"
            )
            assert page.headers["cache-control"] == "no-store"
            assert page.headers["referrer-policy"] == "no-referrer"
            assert page.headers["x-frame-options"] == "DENY"
        with next(dependencies.database.session()) as session:
            completed = session.get_one(DeviceAuthorization, str(device_code))
            assert completed.completed_at is not None
            assert completed.completion_access_token is not None
            assert completed.completion_refresh_token is not None
            assert completed.completion_access_token not in callback.text
            assert completed.completion_refresh_token not in callback.text
        completion = client.get(
            "/device/poll",
            params={"device_code": str(device_code)},
            headers={"X-Whisperer-Device-Verifier": verifier},
        )
        assert completion.json()["status"] == "complete"
        assert (
            client.get(
                "/device/poll",
                params={"device_code": str(device_code)},
                headers={"X-Whisperer-Device-Verifier": verifier},
            ).status_code
            == 401
        )
        access_token = completion.json()["accessToken"]
        headers = {"Authorization": f"Bearer {access_token}"}
        assert (
            client.post(
                "/v1/notes", headers=headers, json={"title": "n", "content": "c"}
            ).status_code
            == 201
        )
        assert (
            client.post(
                "/v1/dictionary",
                headers=headers,
                json={"phrase": "hello", "replacement": "HELLO"},
            ).status_code
            == 201
        )
        transcript = client.post(
            "/v1/transcriptions",
            headers=headers,
            files={"file": ("clip.webm", b"audio", "audio/webm")},
            data={"polish": "false"},
        )
        assert transcript.status_code == 200
        assert transcript.json()["text"] == "HELLO"
        assert transcript.json()["dictionaryReplacements"] == 1
        assert client.get("/v1/transcripts", headers=headers).json()["items"] == []
        assert client.post("/v1/auth/logout", headers=headers).status_code == 204
        assert client.get("/v1/notes", headers=headers).status_code == 401
        with next(dependencies.database.session()) as session:
            user = session.query(User).one()
            assert user is not None
            fresh_pair = dependencies.sessions.issue(session, user)
            session.commit()
        expired_token = _expired_token(dependencies, fresh_pair.access_token)
        assert (
            client.get(
                "/v1/notes", headers={"Authorization": f"Bearer {expired_token}"}
            ).status_code
            == 401
        )


class ClaimsOidc(FakeOidc):
    """Return caller-chosen verified claims."""

    def __init__(self, claims: dict[str, object]) -> None:
        """Store claims.

        Args:
            claims: Verified claims returned from the callback.
        """
        self._claims = claims

    async def validate_callback(
        self, code: str, nonce: str, code_verifier: str
    ) -> dict[str, object]:
        """Return the configured claims.

        Args:
            code: Provider callback code.
            nonce: Server callback nonce.
            code_verifier: Server PKCE verifier.

        Returns:
            Configured claims.
        """
        del code, nonce, code_verifier
        return self._claims


def _callback_status(tmp_path: Path, allowed_groups: str | None, claims: dict[str, object]) -> int:
    """Run login and callback and return the callback status.

    Args:
        tmp_path: Pytest temporary directory for the isolated API database.
        allowed_groups: Value for ``OIDC_ALLOWED_GROUPS``.
        claims: Verified provider claims.

    Returns:
        HTTP status of the callback.
    """
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        oidc_allowed_groups=allowed_groups,
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
        transcription_model="transcribe",
        polish_model="polish",
        database_url=f"sqlite:///{tmp_path / 'api.sqlite3'}",
    )
    app = create_app(settings)
    dependencies = app.state.dependencies
    dependencies.http_client = FakeHttpClient()
    dependencies.oidc = ClaimsOidc(claims)
    device_code = uuid4()
    with TestClient(app) as client:
        client.get(
            "/login",
            params={"device_code": str(device_code), "verifier_challenge": _challenge("v")},
            follow_redirects=False,
        )
        with next(dependencies.database.session()) as session:
            state = session.get_one(DeviceAuthorization, str(device_code)).state
        return client.get("/auth/callback", params={"code": "code", "state": state}).status_code


@pytest.mark.parametrize("allowed", [None, "", "   "])
@pytest.mark.parametrize("claims", [{"sub": "s"}, {"sub": "s", "groups": "not-a-list"}])
def test_blank_allowlist_admits_any_authenticated_account(
    tmp_path: Path, allowed: str | None, claims: dict[str, object]
) -> None:
    """Admit a valid account lacking a usable group claim when unrestricted.

    Args:
        tmp_path: Pytest temporary directory.
        allowed: Blank allowlist value.
        claims: Verified claims without a usable group claim.

    Returns:
        None.
    """
    assert _callback_status(tmp_path, allowed, claims) == 200


@pytest.mark.parametrize(
    "claims",
    [{"sub": "s"}, {"sub": "s", "groups": "whisperer"}, {"sub": "s", "groups": ["other"]}],
)
def test_configured_allowlist_rejects_missing_malformed_or_disjoint_groups(
    tmp_path: Path, claims: dict[str, object]
) -> None:
    """Keep rejecting accounts outside a configured allowlist.

    Args:
        tmp_path: Pytest temporary directory.
        claims: Verified claims with missing, malformed, or disjoint groups.

    Returns:
        None.
    """
    assert _callback_status(tmp_path, "whisperer", claims) == 403


def test_comma_only_allowlist_stays_restricted(tmp_path: Path) -> None:
    """Treat a malformed nonblank allowlist as restrictive, never unrestricted.

    Args:
        tmp_path: Pytest temporary directory.

    Returns:
        None.
    """
    assert _callback_status(tmp_path, ",", {"sub": "s", "groups": ["x"]}) == 403


def _approval_token(page: str) -> str:
    """Read the one-time approval token from the sign-in confirmation page."""
    match = re.search(r'name="approval" value="([^"]+)"', page)
    assert match is not None
    return match.group(1)


def _challenge(verifier: str) -> str:
    """Build the device challenge with production-compatible SHA-256 encoding.

    Args:
        verifier: Desktop-only raw verifier.

    Returns:
        URL-safe challenge value.
    """
    import base64
    import hashlib

    return (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    )


def _expired_token(dependencies: object, access_token: str) -> str:
    """Create an otherwise-valid expired token bound to the same local session.

    Args:
        dependencies: App dependency container.
        access_token: Current access token providing the session ID.

    Returns:
        Expired compact local token.
    """
    settings = dependencies.settings
    key = OctKey.import_key(settings.token_secret.get_secret_value())
    claims = jwt.decode(access_token, key, algorithms=["HS256"]).claims
    claims["exp"] = 1
    return jwt.encode({"alg": "HS256"}, claims, key)


def _phishing_setup(tmp_path: Path) -> tuple[TestClient, Any, str, str]:
    """Start a sign-in the way an attacker would: their own device code and verifier."""
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
        database_url=f"sqlite:///{tmp_path / 'api.sqlite3'}",
    )
    app = create_app(settings)
    dependencies = app.state.dependencies
    dependencies.http_client = FakeHttpClient()
    dependencies.oidc = FakeOidc()
    return TestClient(app), dependencies, str(uuid4()), "attacker-verifier"


def test_a_sent_sign_in_link_never_completes_without_approval(tmp_path: Path) -> None:
    """An attacker-built /login link signs the victim in at the IdP but yields no tokens."""
    client, dependencies, device_code, verifier = _phishing_setup(tmp_path)
    with client:
        client.get(
            "/login",
            params={"device_code": device_code, "verifier_challenge": _challenge(verifier)},
            follow_redirects=False,
        )
        with next(dependencies.database.session()) as session:
            state = session.get_one(DeviceAuthorization, device_code).state
        victim = client.get("/auth/callback", params={"code": "code", "state": state})
        assert victim.status_code == 200
        poll = client.get(
            "/device/poll",
            params={"device_code": device_code},
            headers={"X-Whisperer-Device-Verifier": verifier},
        )
        assert poll.json()["status"] == "pending"
        with next(dependencies.database.session()) as session:
            record = session.get_one(DeviceAuthorization, device_code)
            assert record.completed_at is None
            assert record.completion_access_token is None
        # Replaying the callback state does not help either.
        assert client.get("/auth/callback", params={"code": "c", "state": state}).status_code == 400


def test_approval_token_is_single_use_and_unguessable(tmp_path: Path) -> None:
    """Approval needs the exact token from the confirmation page, and works once."""
    client, dependencies, device_code, verifier = _phishing_setup(tmp_path)
    with client:
        client.get(
            "/login",
            params={"device_code": device_code, "verifier_challenge": _challenge(verifier)},
            follow_redirects=False,
        )
        with next(dependencies.database.session()) as session:
            state = session.get_one(DeviceAuthorization, device_code).state
        page = client.get("/auth/callback", params={"code": "code", "state": state}).text
        assert client.post("/auth/approve", data={"approval": "guess"}).status_code == 400
        assert client.post("/auth/approve", data={}).status_code == 400
        token = _approval_token(page)
        assert client.post("/auth/approve", data={"approval": token}).status_code == 200
        assert client.post("/auth/approve", data={"approval": token}).status_code == 400


def test_sign_in_code_matches_the_desktop_derivation() -> None:
    """The desktop derives the same code; this vector is pinned in its tests too."""
    assert sign_in_code("3f2b8c1e-5d4a-4e6b-9c7d-0a1b2c3d4e5f") == "YC5R-3KNG"


def test_replaying_a_rotated_refresh_token_revokes_the_whole_session(tmp_path: Path) -> None:
    """Reuse of a rotated refresh token means it leaked: end every session derived from it."""
    client, dependencies, _, _ = _phishing_setup(tmp_path)
    with client:
        with next(dependencies.database.session()) as session:
            user = User(
                issuer="https://identity.example.test",
                subject="s",
                created_at=dependencies.clock.now(),
            )
            session.add(user)
            session.flush()
            first = dependencies.sessions.issue(session, user)
            session.commit()
        rotated = client.post("/v1/auth/refresh", json={"refresh_token": first.refresh_token})
        assert rotated.status_code == 200
        successor = rotated.json()
        headers = {"Authorization": f"Bearer {successor['accessToken']}"}
        assert client.get("/v1/notes", headers=headers).status_code == 200
        replay = client.post("/v1/auth/refresh", json={"refresh_token": first.refresh_token})
        assert replay.status_code == 401
        assert (
            client.post(
                "/v1/auth/refresh", json={"refresh_token": successor["refreshToken"]}
            ).status_code
            == 401
        )
        assert client.get("/v1/notes", headers=headers).status_code == 401


def test_stream_polls_redeem_in_short_transactions(tmp_path: Path) -> None:
    """Each stream poll uses its own short transaction and returns its connection at once."""
    client, dependencies, device_code, verifier = _phishing_setup(tmp_path)
    pool = dependencies.database._engine.pool
    with client:
        client.get(
            "/login",
            params={"device_code": device_code, "verifier_challenge": _challenge(verifier)},
            follow_redirects=False,
        )
    # Redeem with the app stopped, so its background worker holds no connection either.
    pending = redeem_in_transaction(dependencies, device_code, verifier)
    assert pending is not None
    assert pending.status == "pending"
    assert pool.checkedout() == 0
    # Plain requests: the schema exists, and the app's lifespan may only run once per test.
    with next(dependencies.database.session()) as session:
        state = session.get_one(DeviceAuthorization, device_code).state
    page = client.get("/auth/callback", params={"code": "code", "state": state}).text
    client.post("/auth/approve", data={"approval": _approval_token(page)})
    complete = redeem_in_transaction(dependencies, device_code, verifier)
    assert complete is not None
    assert complete.status == "complete"
    assert pool.checkedout() == 0
    # The one-time consumption was committed: a second redemption gets nothing.
    assert redeem_in_transaction(dependencies, device_code, verifier) is None
