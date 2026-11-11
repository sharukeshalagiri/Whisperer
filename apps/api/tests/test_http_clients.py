"""Outbound HTTP clients never send loopback traffic through a configured proxy."""

from __future__ import annotations

import base64
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
from whisperer_api.local_config import BootDocument, LocalConfig
from whisperer_api.local_runtime import LocalProfile
from whisperer_api.main import ApplicationDependencies
from whisperer_api.settings import Settings

if TYPE_CHECKING:
    import httpx
    import httpx2

_PROXY = "http://proxy.invalid:3128"
_LOOPBACK = ("http://127.0.0.1:11434/v1", "http://localhost:11434/v1", "http://[::1]:8080/v1")
_REMOTE = "https://api.example.test/v1"


def _proxy_of(client: httpx.AsyncClient | httpx2.AsyncClient, url: str) -> object:
    """Return the proxy URL the client would use for ``url``, or None for a direct call."""
    transport = client._transport_for_url(client._merge_url(url))
    pool = getattr(transport, "_pool", None)
    return getattr(pool, "_proxy_url", None)


@pytest.fixture(autouse=True)
def _proxy_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Configure a proxy the way a corporate machine or the desktop's environment would."""
    for name in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        monkeypatch.setenv(name, _PROXY)
    for name in ("NO_PROXY", "no_proxy"):
        monkeypatch.delenv(name, raising=False)


def _assert_loopback_direct(client: httpx.AsyncClient | httpx2.AsyncClient) -> None:
    for url in _LOOPBACK:
        assert _proxy_of(client, url) is None, url
    assert _proxy_of(client, _REMOTE) is not None


def test_local_profile_client_calls_loopback_endpoints_directly(tmp_path: Path) -> None:
    """Local mode: a loopback Ollama or speech endpoint must never be reached through the proxy."""
    config: dict[str, Any] = {
        "version": 1,
        "instanceId": str(uuid4()),
        "dataDirectory": str(tmp_path / "data"),
        "speech": {"provider": "http", "baseUrl": "http://127.0.0.1:9000/v1", "model": "stt"},
        "llm": {"provider": "off"},
    }
    token = base64.urlsafe_b64encode(b"k" * 32).rstrip(b"=").decode()
    profile = LocalProfile(
        config=LocalConfig.model_validate(config),
        boot=BootDocument.model_validate({"bootToken": token}),
        emit=lambda event: None,
        allowed_hosts=frozenset({"testserver"}),
    )
    _assert_loopback_direct(profile.http_client())


def test_remote_and_meeting_ai_clients_call_loopback_endpoints_directly() -> None:
    """Remote deployments and meeting AI calls apply the same loopback rule."""
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="http://127.0.0.1:4000/v1",
        gateway_api_key="gateway-secret",
        database_url="sqlite://",
    )
    dependencies = ApplicationDependencies(settings)
    _assert_loopback_direct(dependencies.http_client)
    _assert_loopback_direct(dependencies.ai_http_client)
