"""Tests for runtime configuration validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError
from whisperer_api.settings import Settings


def test_settings_treat_change_me_as_missing_authentication_configuration() -> None:
    """Treat deployment placeholders as unusable authentication values.

    Args:
        None.

    Returns:
        None.
    """
    settings = Settings(
        oidc_issuer_url="CHANGE_ME",
        oidc_client_id="CHANGE_ME",
        oidc_client_secret="CHANGE_ME",
        oidc_allowed_groups="CHANGE_ME",
        public_url="CHANGE_ME",
        token_secret="CHANGE_ME",
    )

    assert settings.missing_authentication_configuration == (
        "OIDC_ISSUER_URL",
        "OIDC_CLIENT_ID",
        "OIDC_CLIENT_SECRET",
        "OIDC_ALLOWED_GROUPS",
        "PUBLIC_URL",
        "TOKEN_SECRET",
    )
    assert not settings.authentication_configured


_CONFIGURED = {
    "oidc_issuer_url": "https://identity.example.test",
    "oidc_client_id": "client",
    "oidc_client_secret": "secret",
    "public_url": "https://api.example.test",
    "token_secret": "0123456789abcdef0123456789abcdef",
}


@pytest.mark.parametrize("blank", [None, "", "  "])
def test_blank_allowed_groups_is_ready_and_unrestricted(blank: str | None) -> None:
    """Treat a blank allowlist as configured, with no group restriction.

    Args:
        blank: Unset or blank allowlist.

    Returns:
        None.
    """
    settings = Settings(**_CONFIGURED, oidc_allowed_groups=blank)

    assert settings.missing_authentication_configuration == ()
    assert settings.authentication_configured
    assert not settings.groups_restricted


def test_placeholder_allowed_groups_fails_closed() -> None:
    """Keep CHANGE_ME from silently becoming an unrestricted deployment.

    Args:
        None.

    Returns:
        None.
    """
    settings = Settings(**_CONFIGURED, oidc_allowed_groups="CHANGE_ME")

    assert settings.missing_authentication_configuration == ("OIDC_ALLOWED_GROUPS",)
    assert not settings.authentication_configured


def test_nonblank_allowed_groups_is_restricted() -> None:
    """Restrict sign-in whenever an allowlist value is supplied.

    Args:
        None.

    Returns:
        None.
    """
    settings = Settings(**_CONFIGURED, oidc_allowed_groups=" a, b ")

    assert settings.groups_restricted
    assert settings.allowed_groups == {"a", "b"}


def test_settings_reject_non_https_issuer() -> None:
    """Reject a non-HTTPS OpenID Connect issuer.

    Args:
        None.

    Returns:
        None.
    """
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(oidc_issuer_url="http://identity.example.test")


def test_settings_rejects_short_token_secret() -> None:
    """Prevent use of an under-sized local JWT signing secret.

    Args:
        None.

    Returns:
        None.
    """
    with pytest.raises(ValidationError, match="at least 32"):
        Settings(token_secret="too-short")


_MCP = {
    "mcp_enabled": True,
    "mcp_oidc_client_id": "mcp-client",
    "mcp_oidc_client_secret": "mcp-secret",
    "mcp_signing_key": "fedcba9876543210fedcba9876543210",
}


def test_disabled_mcp_needs_no_configuration() -> None:
    """Leave MCP off by default without requiring any MCP setting.

    Args:
        None.

    Returns:
        None.
    """
    settings = Settings()

    assert settings.mcp_enabled is False
    assert settings.mcp_configured is False
    assert Settings(**_CONFIGURED, mcp_enabled=False).mcp_configured is False


def test_enabled_mcp_with_placeholders_reports_every_missing_name() -> None:
    """Fail closed when MCP is enabled but any prerequisite is a placeholder.

    Args:
        None.

    Returns:
        None.
    """
    settings = Settings(
        mcp_enabled=True,
        oidc_issuer_url="CHANGE_ME",
        public_url="CHANGE_ME",
        mcp_public_url="CHANGE_ME",
        mcp_oidc_client_id="CHANGE_ME",
        mcp_oidc_client_secret="CHANGE_ME",
        mcp_signing_key="CHANGE_ME",
        mcp_allowed_hosts="CHANGE_ME",
        mcp_allowed_origins="CHANGE_ME",
    )

    assert settings.missing_mcp_configuration == (
        "OIDC_ISSUER_URL",
        "PUBLIC_URL",
        "MCP_OIDC_CLIENT_ID",
        "MCP_OIDC_CLIENT_SECRET",
        "MCP_SIGNING_KEY",
        "MCP_ALLOWED_HOSTS",
        "MCP_ALLOWED_ORIGINS",
    )
    assert settings.mcp_configured is False
    assert settings.mcp_resource_url is None


def test_configured_mcp_derives_resource_hosts_and_origins() -> None:
    """Derive the resource URL and allowlists from the public URL.

    Args:
        None.

    Returns:
        None.
    """
    settings = Settings(**_CONFIGURED, **_MCP)

    assert settings.mcp_configured is True
    assert settings.mcp_resource_url == "https://api.example.test/mcp"
    assert settings.mcp_hosts == ("api.example.test",)
    assert settings.mcp_origins == ("https://api.example.test",)
    override = Settings(**_CONFIGURED, **_MCP, mcp_public_url="https://mcp.example.test:8443/")
    assert override.mcp_resource_url == "https://mcp.example.test:8443/mcp"
    assert override.mcp_hosts == ("mcp.example.test:8443",)
    explicit = Settings(
        **_CONFIGURED,
        **_MCP,
        mcp_allowed_hosts=" a.test , b.test ",
        mcp_allowed_origins="https://a.test",
    )
    assert explicit.mcp_hosts == ("a.test", "b.test")
    assert explicit.mcp_origins == ("https://a.test",)


def test_mcp_signing_key_must_be_long_and_distinct() -> None:
    """Reject a short MCP signing key or one reused from TOKEN_SECRET.

    Args:
        None.

    Returns:
        None.
    """
    with pytest.raises(ValidationError, match="MCP_SIGNING_KEY must contain at least 32"):
        Settings(mcp_signing_key="too-short")
    with pytest.raises(ValidationError, match="must differ from TOKEN_SECRET"):
        Settings(**{**_CONFIGURED, **_MCP, "mcp_signing_key": _CONFIGURED["token_secret"]})


def test_mcp_public_url_requires_https() -> None:
    """Reject an insecure MCP public URL.

    Args:
        None.

    Returns:
        None.
    """
    with pytest.raises(ValidationError, match="HTTPS"):
        Settings(mcp_public_url="http://api.example.test")
