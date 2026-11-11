"""Fail-closed remote MCP authentication and exact issuer/subject identity mapping.

The production OAuth proxy fetches the issuer's discovery document when it is
constructed, so ``build_mcp_auth_provider`` runs only at application startup and
only when ``Settings.mcp_configured`` holds. Device mode never builds it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from cryptography.fernet import Fernet
from fastmcp.server.auth.jwt_issuer import derive_jwt_key
from fastmcp.server.auth.oidc_proxy import OIDCProxy
from key_value.aio.stores.filetree import (
    FileTreeStore,
    FileTreeV1CollectionSanitizationStrategy,
    FileTreeV1KeySanitizationStrategy,
)
from key_value.aio.wrappers.encryption import FernetEncryptionWrapper
from sqlalchemy import select

from whisperer_api.mcp_schemas import McpPrincipal
from whisperer_api.persistence import User
from whisperer_api.settings import MCP_PATH, MCP_SCOPE_ASK, MCP_SCOPE_READ

if TYPE_CHECKING:
    from pathlib import Path

    from fastmcp.server.auth import AccessToken
    from key_value.aio.protocols import AsyncKeyValue

    from whisperer_api.persistence import Database
    from whisperer_api.settings import Settings

_STORAGE_SALT = "whisperer-mcp-storage"
# A safe client message, not a credential.
INVALID_TOKEN_MESSAGE = "The MCP access token is not valid for this Whisperer server."  # noqa: S105
UNKNOWN_USER_MESSAGE = "Sign in to Whisperer once with this account before using MCP."


class McpAuthError(PermissionError):
    """Signal a rejected MCP identity with a safe, account-neutral message.

    Args:
        message: Client-readable explanation without token or account details.
    """


class McpAuthenticator:
    """Map a verified MCP access token to an existing local user.

    Args:
        database: Application database owner.
        issuer: Exact accepted token issuer, the configured OIDC issuer.
        resource_url: Canonical MCP resource URL the token audience must contain.
    """

    def __init__(self, database: Database, issuer: str, resource_url: str) -> None:
        """Store the identity boundary.

        Args:
            database: Application database owner.
            issuer: Exact accepted token issuer.
            resource_url: Canonical MCP resource URL and required audience.
        """
        self._database = database
        self._issuer = issuer
        self._resource_url = resource_url

    def principal(self, token: AccessToken) -> McpPrincipal:
        """Validate access-token claims and resolve the owner by issuer and subject.

        Never consults email, display name or any tool-supplied identifier.

        Args:
            token: Signature- and expiry-verified token from the MCP auth provider.

        Returns:
            Authenticated principal with the token's granted scopes.

        Raises:
            McpAuthError: If the token shape, issuer, audience or subject is wrong,
                or no user has signed in with this identity.
        """
        claims: dict[str, Any] = token.claims or {}
        issuer = claims.get("iss")
        subject = claims.get("sub")
        if not isinstance(issuer, str) or issuer != self._issuer:
            raise McpAuthError(INVALID_TOKEN_MESSAGE)
        if not isinstance(subject, str) or not subject.strip():
            raise McpAuthError(INVALID_TOKEN_MESSAGE)
        # ID tokens carry these; only an access token bound to this resource may authenticate.
        if "nonce" in claims or "at_hash" in claims:
            raise McpAuthError(INVALID_TOKEN_MESSAGE)
        if self._resource_url not in _audiences(claims.get("aud")):
            raise McpAuthError(INVALID_TOKEN_MESSAGE)
        with next(self._database.session()) as session:
            user_id = session.scalar(
                select(User.id).where(User.issuer == issuer, User.subject == subject)
            )
        if user_id is None:
            raise McpAuthError(UNKNOWN_USER_MESSAGE)
        return McpPrincipal(
            user_id=user_id, issuer=issuer, subject=subject, scopes=frozenset(token.scopes)
        )


def _audiences(value: object) -> frozenset[str]:
    """Normalize an ``aud`` claim that may be a string or a list of strings.

    Args:
        value: Raw ``aud`` claim.

    Returns:
        Audience strings; empty when absent or malformed.
    """
    if isinstance(value, str):
        return frozenset({value})
    if isinstance(value, list):
        return frozenset(item for item in value if isinstance(item, str))
    return frozenset()


def build_mcp_storage(storage_dir: Path, signing_key: str) -> AsyncKeyValue:
    """Build the durable, encrypted store for OAuth proxy registrations and tokens.

    Args:
        storage_dir: Private writable directory, created when absent.
        signing_key: High-entropy MCP signing key the encryption key is derived from.

    Returns:
        A Fernet-encrypting file store; undecryptable entries read as absent.
    """
    storage_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    key = derive_jwt_key(high_entropy_material=signing_key, salt=_STORAGE_SALT)
    store = FileTreeStore(
        data_directory=storage_dir,
        key_sanitization_strategy=FileTreeV1KeySanitizationStrategy(storage_dir),
        collection_sanitization_strategy=FileTreeV1CollectionSanitizationStrategy(storage_dir),
    )
    # A rotated key turns old entries into cache misses, so clients simply register again.
    return FernetEncryptionWrapper(
        key_value=store, fernet=Fernet(key), raise_on_decryption_error=False
    )


def build_mcp_auth_provider(settings: Settings, storage_dir: Path) -> OIDCProxy:
    """Construct the production OAuth proxy for the remote MCP endpoint.

    Contacts the issuer's discovery endpoint, so call it only at startup.

    Args:
        settings: Validated settings for which ``mcp_configured`` is true.
        storage_dir: Durable private directory for encrypted proxy state.

    Returns:
        Configured OIDC proxy that requires ``meetings:read`` and accepts ``meetings:ask``.

    Raises:
        ValueError: If MCP is not fully configured.
    """
    base_url = settings.mcp_base_url
    resource_url = settings.mcp_resource_url
    if (
        not settings.mcp_configured
        or base_url is None
        or resource_url is None
        or settings.mcp_oidc_client_id is None
        or settings.mcp_oidc_client_secret is None
        or settings.mcp_signing_key is None
    ):
        raise ValueError("Remote MCP is not fully configured.")
    signing_key = settings.mcp_signing_key.get_secret_value()
    return OIDCProxy(
        config_url=f"{settings.oidc_issuer}/.well-known/openid-configuration",
        client_id=settings.mcp_oidc_client_id,
        client_secret=settings.mcp_oidc_client_secret.get_secret_value(),
        audience=resource_url,
        timeout_seconds=int(settings.oidc_timeout_seconds),
        required_scopes=[MCP_SCOPE_READ],
        base_url=base_url,
        resource_base_url=base_url,
        redirect_path=f"{MCP_PATH}/oauth/callback",
        valid_scopes=[MCP_SCOPE_READ, MCP_SCOPE_ASK],
        client_storage=build_mcp_storage(storage_dir, signing_key),
        jwt_signing_key=signing_key,
        require_authorization_consent=True,
        forward_resource=True,
        extra_authorize_params={"resource": resource_url},
        extra_token_params={"resource": resource_url},
        fastmcp_access_token_expiry_seconds=settings.mcp_access_token_minutes * 60,
        enable_cimd=True,
    )
