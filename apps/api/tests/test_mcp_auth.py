"""Exercise fail-closed MCP identity mapping and encrypted proxy storage."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from fastmcp.server.auth.providers.jwt import StaticTokenVerifier
from whisperer_api.auth import SystemClock
from whisperer_api.mcp_auth import (
    INVALID_TOKEN_MESSAGE,
    UNKNOWN_USER_MESSAGE,
    McpAuthenticator,
    McpAuthError,
    build_mcp_storage,
)
from whisperer_api.persistence import Database, User
from whisperer_api.settings import MCP_SCOPE_ASK, MCP_SCOPE_READ

if TYPE_CHECKING:
    from pathlib import Path

    from fastmcp.server.auth import AccessToken

ISSUER = "https://identity.example.test"
RESOURCE = "https://api.example.test/mcp"


@pytest.fixture
def authenticator(tmp_path: Path) -> tuple[McpAuthenticator, str]:
    """Seed one user and compose the authenticator.

    A second user shares the first user's email-like name but a different subject,
    proving lookup never uses anything but issuer and subject.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        Authenticator and the seeded owner's user id.
    """
    database = Database(f"sqlite:///{tmp_path / 'api.sqlite3'}")
    database.create_schema()
    with next(database.session()) as session:
        owner = User(
            issuer=ISSUER,
            subject="owner-sub",
            first_name="ann@example.test",
            created_at=SystemClock().now(),
        )
        session.add(owner)
        session.commit()
        owner_id = owner.id
    return McpAuthenticator(database, ISSUER, RESOURCE), owner_id


async def _token(claims: dict[str, Any], scopes: list[str] | None = None) -> AccessToken:
    """Produce a verified access token through FastMCP's static verifier.

    Args:
        claims: Token claims.
        scopes: Granted scopes.

    Returns:
        Verified access token.
    """
    data = {"client_id": "mcp-client", "scopes": scopes or [MCP_SCOPE_READ], **claims}
    verifier = StaticTokenVerifier(tokens={"synthetic": data})
    token = await verifier.verify_token("synthetic")
    assert token is not None
    return token


def _claims(**overrides: object) -> dict[str, Any]:
    """Build a valid access-token claim set with overrides.

    Args:
        **overrides: Claims to replace; ``None`` removes a claim.

    Returns:
        Claim dictionary.
    """
    claims: dict[str, Any] = {"iss": ISSUER, "sub": "owner-sub", "aud": RESOURCE}
    for name, value in overrides.items():
        if value is None:
            claims.pop(name, None)
        else:
            claims[name] = value
    return claims


async def test_valid_token_maps_to_the_existing_user(
    authenticator: tuple[McpAuthenticator, str],
) -> None:
    """Return the owner principal with the granted scopes.

    Args:
        authenticator: Composed authenticator and owner id.

    Returns:
        None.
    """
    service, owner_id = authenticator
    token = await _token(_claims(aud=["other", RESOURCE]), [MCP_SCOPE_READ, MCP_SCOPE_ASK])
    principal = service.principal(token)
    assert principal.user_id == owner_id
    assert (principal.issuer, principal.subject) == (ISSUER, "owner-sub")
    assert principal.scopes == frozenset({MCP_SCOPE_READ, MCP_SCOPE_ASK})


@pytest.mark.parametrize(
    "claims",
    [
        _claims(iss="https://identity.example.test/"),
        _claims(iss="https://evil.example.test"),
        _claims(iss=None),
        _claims(sub=None),
        _claims(sub="  "),
        _claims(nonce="n-0"),
        _claims(at_hash="hash"),
        _claims(aud="mcp-client"),
        _claims(aud=["https://api.example.test"]),
        _claims(aud=None),
    ],
)
async def test_invalid_token_shapes_are_rejected(
    authenticator: tuple[McpAuthenticator, str], claims: dict[str, Any]
) -> None:
    """Reject wrong issuer, missing subject, ID-token shape and wrong audience.

    Args:
        authenticator: Composed authenticator and owner id.
        claims: Invalid claim set.

    Returns:
        None.
    """
    service, _ = authenticator
    with pytest.raises(McpAuthError, match=INVALID_TOKEN_MESSAGE):
        service.principal(await _token(claims))


async def test_unknown_subject_is_rejected_even_with_a_matching_email(
    authenticator: tuple[McpAuthenticator, str],
) -> None:
    """Never resolve a user by email or name when the subject is unknown.

    Args:
        authenticator: Composed authenticator and owner id.

    Returns:
        None.
    """
    service, _ = authenticator
    token = await _token(
        _claims(sub="someone-else", email="ann@example.test", preferred_username="ann")
    )
    with pytest.raises(McpAuthError, match=UNKNOWN_USER_MESSAGE):
        service.principal(token)


async def test_storage_encrypts_values_on_disk(tmp_path: Path) -> None:
    """Persist proxy state encrypted and read it back with the same key only.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        None.
    """
    key = "k" * 48
    directory = tmp_path / "mcp-oauth"
    store = build_mcp_storage(directory, key)
    await store.put("client-1", {"secret": "plaintext-marker"}, collection="clients")
    assert await store.get("client-1", collection="clients") == {"secret": "plaintext-marker"}
    written = [path for path in directory.rglob("*") if path.is_file()]
    assert written
    assert all(b"plaintext-marker" not in path.read_bytes() for path in written)
    rotated = build_mcp_storage(directory, "r" * 48)
    assert await rotated.get("client-1", collection="clients") is None
