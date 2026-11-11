"""Runtime configuration for the Whisperer API."""

from __future__ import annotations

from typing import Annotated

from pydantic import BeforeValidator, Field, HttpUrl, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER = "CHANGE_ME"
# Remote MCP mount path, appended to the public base to form the token audience.
MCP_PATH = "/mcp"
MCP_SCOPE_READ = "meetings:read"
MCP_SCOPE_ASK = "meetings:ask"


def _placeholder_to_none(value: object) -> object:
    """Normalize blank deployment placeholders before type validation.

    Args:
        value: Raw setting value supplied by the environment or caller.

    Returns:
        The value, or ``None`` for blank and placeholder strings.
    """
    if isinstance(value, str) and value.strip() in {"", _PLACEHOLDER}:
        return None
    return value


OptionalUrl = Annotated[HttpUrl | None, BeforeValidator(_placeholder_to_none)]
OptionalSecret = Annotated[SecretStr | None, BeforeValidator(_placeholder_to_none)]
OptionalText = Annotated[str | None, BeforeValidator(_placeholder_to_none)]


class Settings(BaseSettings):
    """Load and locally validate every runtime setting for the API.

    Args:
        Values are read from environment variables unless explicitly supplied.

    Raises:
        ValidationError: If a configured URL or bounded numeric value is invalid.
    """

    model_config = SettingsConfigDict(env_file=None, extra="forbid", case_sensitive=False)

    oidc_issuer_url: OptionalUrl = None
    oidc_client_id: OptionalText = None
    oidc_client_secret: OptionalSecret = None
    oidc_scopes: str = "openid email profile groups"
    oidc_groups_claim: str = "groups"
    # Blank means any authenticated account; CHANGE_ME stays configured-but-unusable.
    oidc_allowed_groups: str | None = None
    public_url: OptionalUrl = None
    token_secret: OptionalSecret = None
    gateway_base_url: OptionalUrl = HttpUrl("http://litellm:4000")
    gateway_api_key: OptionalSecret = None
    transcription_model: str = "whisper-1"
    polish_model: str = "gpt-4o-mini"
    # Optional dedicated endpoints. Unset means the shared gateway above. A
    # dedicated URL uses only its own key, never the gateway key.
    speech_base_url: OptionalUrl = None
    speech_api_key: OptionalSecret = None
    llm_base_url: OptionalUrl = None
    llm_api_key: OptionalSecret = None
    database_url: str = "sqlite:///./api.sqlite3"
    access_token_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_days: int = Field(default=30, ge=1, le=90)
    oidc_timeout_seconds: float = Field(default=5.0, gt=0, le=15)
    gateway_timeout_seconds: float = Field(default=10.0, gt=0, le=30)
    # Meeting segments and summaries are background work, so they may wait longer than dictation.
    meeting_gateway_timeout_seconds: float = Field(default=300.0, gt=0, le=1800)
    device_authorization_minutes: int = Field(default=10, ge=1, le=30)
    # Remote MCP is opt-in. Enabled with any prerequisite missing stays absent, never anonymous.
    mcp_enabled: bool = False
    # Unset means PUBLIC_URL; the MCP resource is always this base plus MCP_PATH.
    mcp_public_url: OptionalUrl = None
    # A separate upstream registration from the desktop client; never OIDC_CLIENT_ID.
    mcp_oidc_client_id: OptionalText = None
    mcp_oidc_client_secret: OptionalSecret = None
    mcp_signing_key: OptionalSecret = None
    # Durable, encrypted OAuth proxy state; Compose places it on the data volume.
    mcp_storage_dir: str = "./mcp-oauth"
    # Comma-separated; unset derives the host or origin from the MCP public URL.
    mcp_allowed_hosts: str | None = None
    mcp_allowed_origins: str | None = None
    mcp_access_token_minutes: int = Field(default=60, ge=5, le=1440)

    @field_validator("oidc_issuer_url", "public_url", "mcp_public_url", mode="after")
    @classmethod
    def _require_https(cls, value: HttpUrl | None) -> HttpUrl | None:
        """Reject insecure configured public endpoints.

        Args:
            value: Parsed optional URL for an internet-facing endpoint.

        Returns:
            The same parsed URL when absent or HTTPS.

        Raises:
            ValueError: If the configured endpoint is not HTTPS.
        """
        if value is not None and value.scheme != "https":
            raise ValueError("public OpenID Connect URLs must use HTTPS")
        return value

    @field_validator("token_secret", mode="after")
    @classmethod
    def _require_long_token_secret(cls, value: SecretStr | None) -> SecretStr | None:
        """Require a sufficient secret when application signing is configured.

        Args:
            value: Optional local JWT signing secret.

        Returns:
            Unchanged absent or secure signing secret.

        Raises:
            ValueError: If the configured secret has fewer than 32 characters.
        """
        if value is not None and len(value.get_secret_value()) < 32:
            raise ValueError("TOKEN_SECRET must contain at least 32 characters")
        return value

    @field_validator("mcp_signing_key", mode="after")
    @classmethod
    def _require_long_mcp_signing_key(cls, value: SecretStr | None) -> SecretStr | None:
        """Require a sufficient MCP proxy signing key when one is configured.

        Args:
            value: Optional MCP OAuth proxy signing key.

        Returns:
            Unchanged absent or sufficiently long key.

        Raises:
            ValueError: If the configured key has fewer than 32 characters.
        """
        if value is not None and len(value.get_secret_value()) < 32:
            raise ValueError("MCP_SIGNING_KEY must contain at least 32 characters")
        return value

    @field_validator("mcp_storage_dir")
    @classmethod
    def _require_storage_dir(cls, value: str) -> str:
        """Reject a blank MCP storage directory.

        Args:
            value: Configured storage directory text.

        Returns:
            Stripped directory text.

        Raises:
            ValueError: If the directory is blank.
        """
        result = value.strip()
        if not result:
            raise ValueError("MCP_STORAGE_DIR must not be blank")
        return result

    @model_validator(mode="after")
    def _separate_mcp_signing_key(self) -> Settings:
        """Keep MCP proxy signing independent from API session signing.

        Args:
            None.

        Returns:
            The validated settings.

        Raises:
            ValueError: If the MCP signing key equals the API token secret.
        """
        if (
            self.mcp_signing_key is not None
            and self.token_secret is not None
            and self.mcp_signing_key.get_secret_value() == self.token_secret.get_secret_value()
        ):
            raise ValueError("MCP_SIGNING_KEY must differ from TOKEN_SECRET")
        return self

    @field_validator("oidc_scopes", "oidc_groups_claim", "transcription_model", "polish_model")
    @classmethod
    def _require_nonempty_text(cls, value: str) -> str:
        """Reject empty behavior-defining string settings.

        Args:
            value: Parsed setting text.

        Returns:
            Stripped setting text.

        Raises:
            ValueError: If text is empty after trimming.
        """
        result = value.strip()
        if not result:
            raise ValueError("setting must not be blank")
        return result

    @property
    def allowed_groups(self) -> frozenset[str]:
        """Return configured group identifiers as a stable set.

        Args:
            None.

        Returns:
            Empty when no allowlist is configured.
        """
        if self.oidc_allowed_groups is None:
            return frozenset()
        return frozenset(
            group.strip() for group in self.oidc_allowed_groups.split(",") if group.strip()
        )

    @property
    def oidc_issuer(self) -> str:
        """Return the canonical issuer identifier used for stored identities.

        Args:
            None.

        Returns:
            Configured issuer without a trailing slash, since URL parsing adds one.
        """
        return str(self.oidc_issuer_url).rstrip("/")

    @property
    def groups_restricted(self) -> bool:
        """State whether sign-in is limited to an allowlist of groups.

        Args:
            None.

        Returns:
            False only when the allowlist is unset or blank, meaning any valid
            authenticated OIDC account may sign in. Any other value, including a
            malformed one that parses to no groups, restricts sign-in.
        """
        return self.oidc_allowed_groups is not None and bool(self.oidc_allowed_groups.strip())

    @property
    def missing_authentication_configuration(self) -> tuple[str, ...]:
        """Name missing authentication settings without exposing their values.

        Args:
            None.

        Returns:
            Ordered names required before browser authentication is enabled.
        """
        values: tuple[tuple[str, object | None], ...] = (
            ("OIDC_ISSUER_URL", self.oidc_issuer_url),
            ("OIDC_CLIENT_ID", self.oidc_client_id),
            ("OIDC_CLIENT_SECRET", self.oidc_client_secret),
            ("PUBLIC_URL", self.public_url),
            ("TOKEN_SECRET", self.token_secret),
        )
        missing = [name for name, value in values if value is None]
        allowlist = self.oidc_allowed_groups
        if allowlist is not None and allowlist.strip() == _PLACEHOLDER:
            missing.insert(3, "OIDC_ALLOWED_GROUPS")
        return tuple(missing)

    @property
    def authentication_configured(self) -> bool:
        """State whether all browser authentication settings are usable.

        Args:
            None.

        Returns:
            True only when no required authentication setting is missing.
        """
        return not self.missing_authentication_configuration

    @property
    def mcp_base_url(self) -> str | None:
        """Return the public MCP base URL without a trailing slash.

        Args:
            None.

        Returns:
            ``MCP_PUBLIC_URL``, else ``PUBLIC_URL``, else ``None``.
        """
        base = self.mcp_public_url or self.public_url
        return None if base is None else str(base).rstrip("/")

    @property
    def mcp_resource_url(self) -> str | None:
        """Return the canonical MCP protected-resource URL and token audience.

        Args:
            None.

        Returns:
            The public base followed by ``MCP_PATH``, or ``None`` without a base.
        """
        base = self.mcp_base_url
        return None if base is None else f"{base}{MCP_PATH}"

    @property
    def mcp_hosts(self) -> tuple[str, ...]:
        """Return the Host header values the MCP endpoint accepts.

        Args:
            None.

        Returns:
            Configured hosts, or the MCP public URL's host and port when unset.
        """
        if self.mcp_allowed_hosts is not None and self.mcp_allowed_hosts.strip():
            return _split_csv(self.mcp_allowed_hosts)
        authority = self._mcp_public_authority()
        return () if authority is None else (authority,)

    @property
    def mcp_origins(self) -> tuple[str, ...]:
        """Return the browser origins the MCP endpoint accepts.

        Args:
            None.

        Returns:
            Configured origins, or the MCP public URL's origin when unset.
        """
        if self.mcp_allowed_origins is not None and self.mcp_allowed_origins.strip():
            return _split_csv(self.mcp_allowed_origins)
        authority = self._mcp_public_authority()
        return () if authority is None else (f"https://{authority}",)

    def _mcp_public_authority(self) -> str | None:
        """Return the MCP public URL's host, with a port only when non-default.

        Args:
            None.

        Returns:
            Host or ``host:port`` text, or ``None`` without a public URL.
        """
        base = self.mcp_public_url or self.public_url
        if base is None or base.host is None:
            return None
        # Public URLs are validated as HTTPS, so 443 is the only default port.
        return base.host if base.port in {None, 443} else f"{base.host}:{base.port}"

    @property
    def missing_mcp_configuration(self) -> tuple[str, ...]:
        """Name missing remote MCP settings without exposing their values.

        Args:
            None.

        Returns:
            Ordered environment names required before MCP may be mounted.
        """
        values: tuple[tuple[str, object | None], ...] = (
            ("OIDC_ISSUER_URL", self.oidc_issuer_url),
            ("PUBLIC_URL", self.mcp_public_url or self.public_url),
            ("MCP_OIDC_CLIENT_ID", self.mcp_oidc_client_id),
            ("MCP_OIDC_CLIENT_SECRET", self.mcp_oidc_client_secret),
            ("MCP_SIGNING_KEY", self.mcp_signing_key),
        )
        missing = [name for name, value in values if value is None]
        # A CHANGE_ME allowlist keeps MCP absent rather than widening it to any host.
        for name, raw in (
            ("MCP_ALLOWED_HOSTS", self.mcp_allowed_hosts),
            ("MCP_ALLOWED_ORIGINS", self.mcp_allowed_origins),
        ):
            if raw is not None and raw.strip() == _PLACEHOLDER:
                missing.append(name)
        return tuple(missing)

    @property
    def mcp_configured(self) -> bool:
        """State whether remote MCP is enabled and every prerequisite is usable.

        Args:
            None.

        Returns:
            True only when ``MCP_ENABLED`` is set and nothing is missing.
        """
        return self.mcp_enabled and not self.missing_mcp_configuration


def _split_csv(value: str) -> tuple[str, ...]:
    """Split comma-separated operator text into trimmed nonblank items.

    Args:
        value: Comma-separated setting text.

    Returns:
        Ordered nonblank items.
    """
    return tuple(item.strip() for item in value.split(",") if item.strip())
