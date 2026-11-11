"""Tests for bounded external service readiness checks."""

from __future__ import annotations

import httpx
import pytest
from whisperer_api.preflight import PreflightService
from whisperer_api.settings import Settings


class FakeHttpClient:
    """Return configured responses without making network requests."""

    def __init__(self, responses: dict[str, httpx.Response]) -> None:
        """Store responses keyed by URL.

        Args:
            responses: HTTP results returned for individual GET URLs.
        """
        self.responses = responses
        self.requests: list[tuple[str, float, dict[str, str] | None]] = []

    async def get(
        self,
        url: str,
        *,
        timeout: float,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        """Return the configured response.

        Args:
            url: Requested absolute URL.
            timeout: Bounded request timeout.

        Returns:
            Configured HTTP response.
        """
        self.requests.append((url, timeout, headers))
        return self.responses[url]


@pytest.mark.asyncio
async def test_preflight_reports_ready_after_discovery_and_models_check() -> None:
    """Verify configured OIDC and gateway endpoints with bounded calls."""
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
    )
    client = FakeHttpClient(
        {
            "https://identity.example.test/.well-known/openid-configuration": httpx.Response(
                200,
                json={
                    "issuer": "https://identity.example.test",
                    "authorization_endpoint": "https://identity.example.test/authorize",
                    "token_endpoint": "https://identity.example.test/token",
                    "jwks_uri": "https://identity.example.test/jwks",
                },
            ),
            "https://gateway.example.test/models": httpx.Response(
                200, json={"data": [{"id": "transcribe"}, {"id": "polish"}]}
            ),
        }
    )

    result = await PreflightService(settings, client).run()

    assert result.ready is True
    assert result.missing_configuration == ()
    assert result.failures == ()
    assert client.requests == [
        ("https://identity.example.test/.well-known/openid-configuration", 5.0, None),
        ("https://gateway.example.test/models", 10.0, {"Authorization": "Bearer gateway-secret"}),
    ]


@pytest.mark.asyncio
async def test_preflight_sanitizes_external_failure() -> None:
    """Avoid exposing provider response bodies and credentials in readiness."""
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        oidc_allowed_groups="whisperer",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
    )
    client = FakeHttpClient(
        {
            "https://identity.example.test/.well-known/openid-configuration": httpx.Response(
                500, text="secret"
            ),
            "https://gateway.example.test/models": httpx.Response(500, text="secret"),
        }
    )

    result = await PreflightService(settings, client).run()

    assert result.ready is False
    assert result.failures == (
        "OIDC discovery is unavailable.",
        "Gateway model discovery is unavailable.",
    )


def _discovery_client() -> FakeHttpClient:
    """Build a client with healthy OIDC discovery and gateway responses.

    Args:
        None.

    Returns:
        Fake HTTP client.
    """
    return FakeHttpClient(
        {
            "https://identity.example.test/.well-known/openid-configuration": httpx.Response(
                200,
                json={
                    "issuer": "https://identity.example.test",
                    "authorization_endpoint": "https://identity.example.test/authorize",
                    "token_endpoint": "https://identity.example.test/token",
                    "jwks_uri": "https://identity.example.test/jwks",
                },
            ),
            "https://gateway.example.test/models": httpx.Response(
                200, json={"data": [{"id": "whisper-1"}, {"id": "gpt-4o-mini"}]}
            ),
        }
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("allowed", "ready"), [(None, True), ("", True), ("CHANGE_ME", False)])
async def test_preflight_blank_allowlist_is_ready_but_placeholder_is_not(
    allowed: str | None, ready: bool
) -> None:
    """Report readiness for a blank allowlist and failure for the placeholder."""
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        oidc_allowed_groups=allowed,
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
    )

    result = await PreflightService(settings, _discovery_client()).run()

    assert result.ready is ready
    assert result.missing_configuration == (() if ready else ("OIDC_ALLOWED_GROUPS",))


_DISCOVERY = {
    "https://identity.example.test/.well-known/openid-configuration": httpx.Response(
        200,
        json={
            "issuer": "https://identity.example.test",
            "authorization_endpoint": "https://identity.example.test/authorize",
            "token_endpoint": "https://identity.example.test/token",
            "jwks_uri": "https://identity.example.test/jwks",
        },
    )
}


def _auth_settings(**values: object) -> Settings:
    """Build ready authentication settings with the given inference overrides."""
    return Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        transcription_model="stt",
        polish_model="chat",
        **values,
    )


@pytest.mark.asyncio
async def test_preflight_probes_dedicated_endpoints_without_gateway() -> None:
    """Probe each dedicated endpoint with its own key and skip the unused gateway."""
    settings = _auth_settings(
        speech_base_url="https://speech.example.test/v1",
        speech_api_key="speech-key",
        llm_base_url="http://llm.example.test/v1",
    )
    client = FakeHttpClient(
        {
            **_DISCOVERY,
            "https://speech.example.test/v1/models": httpx.Response(
                200, json={"data": [{"id": "stt"}]}
            ),
            "http://llm.example.test/v1/models": httpx.Response(
                200, json={"data": [{"id": "chat"}]}
            ),
        }
    )

    result = await PreflightService(settings, client).run()

    assert result.ready is True, result.failures
    assert client.requests[1:] == [
        ("https://speech.example.test/v1/models", 10.0, {"Authorization": "Bearer speech-key"}),
        ("http://llm.example.test/v1/models", 10.0, None),
    ]


@pytest.mark.asyncio
async def test_preflight_reports_missing_dedicated_model() -> None:
    """Fail readiness when a dedicated endpoint lacks its configured model."""
    settings = _auth_settings(
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
        speech_base_url="https://speech.example.test/v1",
    )
    client = FakeHttpClient(
        {
            **_DISCOVERY,
            "https://speech.example.test/v1/models": httpx.Response(
                200, json={"data": [{"id": "other"}]}
            ),
            "https://gateway.example.test/models": httpx.Response(
                200, json={"data": [{"id": "chat"}]}
            ),
        }
    )

    result = await PreflightService(settings, client).run()

    assert result.ready is False
    assert result.failures == ("Configured speech model is unavailable.",)
    gateway_call = client.requests[-1]
    assert gateway_call == (
        "https://gateway.example.test/models",
        10.0,
        {"Authorization": "Bearer gateway-secret"},
    )
