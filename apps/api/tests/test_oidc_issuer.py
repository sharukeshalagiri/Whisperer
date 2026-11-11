"""Issuer matching coverage for providers publishing slashless issuer identifiers."""

from __future__ import annotations

import httpx
import pytest
from joserfc import jwt
from joserfc.jwk import RSAKey
from whisperer_api import auth
from whisperer_api.auth import OidcClient
from whisperer_api.settings import Settings

ISSUER = "https://auth.example.test"


class FakeHttpClient:
    """Serve discovery with a slashless issuer and a JWKS."""

    def __init__(self, key: RSAKey) -> None:
        """Store the signing key.

        Args:
            key: Key whose public half is published.
        """
        self._key = key

    async def get(self, url: str, *, timeout: float) -> httpx.Response:
        """Return discovery or JWKS.

        Args:
            url: Requested URL.
            timeout: Requested timeout.

        Returns:
            Fake successful response.
        """
        del timeout
        request = httpx.Request("GET", url)
        if url.endswith("openid-configuration"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "issuer": ISSUER,
                    "authorization_endpoint": f"{ISSUER}/authorize",
                    "token_endpoint": f"{ISSUER}/token",
                    "jwks_uri": f"{ISSUER}/jwks",
                },
            )
        return httpx.Response(
            200, request=request, json={"keys": [self._key.as_dict(private=False)]}
        )


def _settings() -> Settings:
    """Build settings whose parsed issuer URL gains a trailing slash.

    Returns:
        Authentication settings.
    """
    return Settings(
        oidc_issuer_url=ISSUER,
        oidc_client_id="client",
        oidc_client_secret="secret",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
    )


def _install_token(monkeypatch: pytest.MonkeyPatch, token: str) -> None:
    """Replace the OAuth client with one returning a fixed ID token.

    Args:
        monkeypatch: Pytest patch fixture.
        token: ID token to return from the token endpoint.
    """

    class FakeOAuthClient:
        def __init__(self, **_: object) -> None:
            pass

        async def fetch_token(self, *_: object, **__: object) -> dict[str, str]:
            return {"id_token": token}

    monkeypatch.setattr(auth, "AsyncOAuth2Client", FakeOAuthClient)


def _id_token(key: RSAKey, issuer: str) -> str:
    """Sign an ID token.

    Args:
        key: Signing key.
        issuer: Value for ``iss``.

    Returns:
        Compact JWT.
    """
    claims = {"iss": issuer, "aud": "client", "sub": "s", "nonce": "n", "exp": 4_102_444_800}
    return jwt.encode({"alg": "RS256", "kid": key.kid}, claims, key)


@pytest.mark.asyncio
async def test_slashless_discovery_issuer_and_token_iss_are_accepted(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Accept a provider whose issuer has no slash although the URL type adds one."""
    key = RSAKey.generate_key(2048, auto_kid=True)
    settings = _settings()
    assert str(settings.oidc_issuer_url) == f"{ISSUER}/"
    assert settings.oidc_issuer == ISSUER
    _install_token(monkeypatch, _id_token(key, ISSUER))

    claims = await OidcClient(settings, FakeHttpClient(key)).validate_callback("c", "n", "v")

    assert claims["sub"] == "s"


@pytest.mark.asyncio
async def test_token_iss_must_equal_published_issuer(monkeypatch: pytest.MonkeyPatch) -> None:
    """Reject a token whose issuer differs from the verified discovery issuer."""
    key = RSAKey.generate_key(2048, auto_kid=True)
    _install_token(monkeypatch, _id_token(key, f"{ISSUER}/"))

    with pytest.raises(ValueError, match="validation failed"):
        await OidcClient(_settings(), FakeHttpClient(key)).validate_callback("c", "n", "v")
