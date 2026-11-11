"""OIDC, protected device authorization, and local application sessions."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol, cast
from urllib.parse import urlencode
from uuid import UUID

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.oauth2.rfc6749.errors import OAuth2Error
from joserfc import jwt
from joserfc.errors import JoseError
from joserfc.jwk import KeySet, OctKey
from joserfc.jwt import JWTClaimsRegistry
from sqlalchemy import select, update
from sqlalchemy.engine import CursorResult
from sqlalchemy.orm import Session

from whisperer_api.persistence import DeviceAuthorization, RefreshSession, User
from whisperer_api.schemas import DevicePollResponse, RefreshResponse, UserResponse
from whisperer_api.settings import Settings


class Clock(Protocol):
    """Describe an injected UTC clock.

    Args:
        None.
    """

    def now(self) -> datetime:
        """Return the current UTC time.

        Args:
            None.

        Returns:
            Current aware UTC timestamp.
        """


class SystemClock:
    """Provide production UTC time.

    Args:
        None.
    """

    def now(self) -> datetime:
        """Return an aware UTC timestamp.

        Args:
            None.

        Returns:
            Current aware UTC timestamp.
        """
        return datetime.now(UTC)


class OidcClient:
    """Implement authorization code plus PKCE against a generic OIDC provider.

    Args:
        settings: Validated OIDC runtime configuration.
        http_client: Injected HTTP client used for discovery and JWKS.
    """

    def __init__(self, settings: Settings, http_client: httpx.AsyncClient) -> None:
        """Store validated OIDC configuration and the injected HTTP boundary.

        Args:
            settings: Validated OIDC runtime configuration.
            http_client: HTTP client used for discovery and JWKS.
        """
        self._settings = settings
        self._http_client = http_client
        self._discovery: dict[str, str] | None = None

    async def authorization_url(self, state: str, nonce: str, code_verifier: str) -> str:
        """Create a generic OIDC authorization URL with PKCE S256.

        Args:
            state: Server-stored transaction correlation nonce.
            nonce: Server-stored ID-token replay nonce.
            code_verifier: Secret PKCE verifier retained server side.

        Returns:
            Fully qualified authorization URL.

        Raises:
            ValueError: If discovery does not describe the required authorization endpoint.
        """
        discovery = await self._get_discovery()
        challenge = self._base64_digest(code_verifier)
        parameters = {
            "response_type": "code",
            "client_id": self._settings.oidc_client_id or "",
            "redirect_uri": f"{str(self._settings.public_url).rstrip('/')}/auth/callback",
            "scope": self._settings.oidc_scopes,
            "state": state,
            "nonce": nonce,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        return f"{discovery['authorization_endpoint']}?{urlencode(parameters)}"

    async def validate_callback(self, code: str, nonce: str, code_verifier: str) -> dict[str, Any]:
        """Exchange and verify an authorization response ID token.

        Args:
            code: One-time authorization code from the OIDC callback.
            nonce: Expected server-stored nonce.
            code_verifier: PKCE verifier bound to the authorization request.

        Returns:
            Verified provider claims.

        Raises:
            ValueError: If discovery, token exchange, or token claims are invalid.
        """
        discovery = await self._get_discovery()
        client = AsyncOAuth2Client(
            client_id=self._settings.oidc_client_id,
            client_secret=self._settings.oidc_client_secret.get_secret_value()
            if self._settings.oidc_client_secret
            else None,
        )
        try:
            token = await client.fetch_token(
                discovery["token_endpoint"],
                code=code,
                redirect_uri=f"{str(self._settings.public_url).rstrip('/')}/auth/callback",
                code_verifier=code_verifier,
            )
            id_token = token.get("id_token")
            if not isinstance(id_token, str):
                raise ValueError("provider did not return an ID token")
            jwks = await self._get_jwks(discovery["jwks_uri"])
            claims = jwt.decode(
                id_token, jwks, algorithms=["RS256", "PS256", "ES256", "EdDSA"]
            ).claims
            if self._settings.oidc_client_id is None:
                raise ValueError("OIDC client ID is not configured")
            registry = JWTClaimsRegistry(
                iss={"essential": True, "value": discovery["issuer"]},
                aud={"essential": True, "value": self._settings.oidc_client_id},
                exp={"essential": True},
                sub={"essential": True},
                nonce={"essential": True, "value": nonce},
            )
            registry.validate(claims)
            if not isinstance(claims, dict):
                raise ValueError("ID token claims are invalid")
            return claims
        except (httpx.HTTPError, JoseError, OAuth2Error, TypeError, ValueError) as error:
            raise ValueError("OIDC callback validation failed") from error

    async def _get_discovery(self) -> dict[str, str]:
        """Fetch and validate issuer discovery once per client lifetime.

        Args:
            None.

        Returns:
            Required discovery document fields.

        Raises:
            ValueError: If the provider document is unavailable or inconsistent.
        """
        if self._discovery is not None:
            return self._discovery
        if self._settings.oidc_issuer_url is None:
            raise ValueError("OIDC issuer is not configured")
        url = f"{str(self._settings.oidc_issuer_url).rstrip('/')}/.well-known/openid-configuration"
        try:
            response = await self._http_client.get(url, timeout=self._settings.oidc_timeout_seconds)
            response.raise_for_status()
            body = response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise ValueError("OIDC discovery is unavailable") from error
        fields = ("issuer", "authorization_endpoint", "token_endpoint", "jwks_uri")
        if not isinstance(body, dict) or any(not isinstance(body.get(key), str) for key in fields):
            raise ValueError("OIDC discovery is invalid")
        if body["issuer"].rstrip("/") != str(self._settings.oidc_issuer_url).rstrip("/"):
            raise ValueError("OIDC discovery issuer does not match configuration")
        self._discovery = {key: body[key] for key in fields}
        return self._discovery

    async def _get_jwks(self, url: str) -> KeySet:
        """Fetch the provider key set over bounded HTTP.

        Args:
            url: JWKS URL from verified discovery.

        Returns:
            Imported asymmetric JSON Web Key Set.

        Raises:
            ValueError: If the key set cannot be loaded.
        """
        try:
            response = await self._http_client.get(url, timeout=self._settings.oidc_timeout_seconds)
            response.raise_for_status()
            body = response.json()
            return KeySet.import_key_set(body)
        except (httpx.HTTPError, ValueError, TypeError) as error:
            raise ValueError("OIDC signing keys are unavailable") from error

    def _base64_digest(self, value: str) -> str:
        """Encode a SHA-256 digest in unpadded URL-safe base64.

        Args:
            value: UTF-8 value to bind to a public challenge.

        Returns:
            SHA-256 digest suitable for PKCE or device-verifier comparison.
        """
        return (
            base64.urlsafe_b64encode(hashlib.sha256(value.encode()).digest()).rstrip(b"=").decode()
        )


class SessionService:
    """Issue locally revocable app JWTs and hashed refresh credentials.

    Args:
        settings: Validated runtime configuration.
        clock: Injected UTC clock.
    """

    def __init__(self, settings: Settings, clock: Clock) -> None:
        """Store configuration and time source.

        Args:
            settings: Validated runtime configuration.
            clock: Injected UTC clock.
        """
        self._settings = settings
        self._clock = clock

    def issue(self, session: Session, user: User) -> RefreshResponse:
        """Issue a short-lived app access token and hashed refresh session.

        Args:
            session: Open database session receiving refresh state.
            user: Locally linked OIDC user.

        Returns:
            New access and refresh credential pair.
        """
        now = self._clock.now()
        refresh_token = secrets.token_urlsafe(48)
        refresh_session = RefreshSession(
            token_hash=self._token_hash(refresh_token),
            user_id=user.id,
            created_at=now,
            expires_at=now + timedelta(days=self._settings.refresh_token_days),
        )
        session.add(refresh_session)
        session.flush()
        return RefreshResponse(
            access_token=self._access_token(user, now, refresh_session.id),
            refresh_token=refresh_token,
        )

    def refresh(self, session: Session, refresh_token: str) -> tuple[User, RefreshResponse] | None:
        """Atomically revoke a refresh credential and issue a replacement.

        Args:
            session: Open database session holding local refresh state.
            refresh_token: Opaque local refresh credential.

        Returns:
            User and new pair when locally valid, otherwise None.
        """
        now = self._clock.now()
        stored = session.scalar(
            select(RefreshSession).where(
                RefreshSession.token_hash == self._token_hash(refresh_token),
                RefreshSession.revoked_at.is_(None),
                RefreshSession.expires_at > now,
            )
        )
        if stored is None:
            return None
        user = session.get(User, stored.user_id)
        if user is None:
            return None
        # A conditional revoke lets exactly one concurrent caller rotate the credential.
        claimed = cast(
            CursorResult[Any],
            session.execute(
                update(RefreshSession)
                .where(RefreshSession.id == stored.id, RefreshSession.revoked_at.is_(None))
                .values(revoked_at=now)
                .execution_options(synchronize_session=False)
            ),
        )
        if claimed.rowcount != 1:
            return None
        return user, self.issue(session, user)

    def revoke(self, session: Session, refresh_token: str) -> None:
        """Locally revoke an opaque refresh token without revealing its validity.

        Args:
            session: Open database session holding local refresh state.
            refresh_token: Opaque local refresh credential.

        Returns:
            None.
        """
        stored = session.scalar(
            select(RefreshSession).where(
                RefreshSession.token_hash == self._token_hash(refresh_token)
            )
        )
        if stored is not None:
            stored.revoked_at = self._clock.now()

    def user_from_access_token(self, session: Session, token: str) -> User | None:
        """Validate a local short-lived access token and resolve its user.

        Args:
            session: Open database session used to resolve subject ownership.
            token: JWT received in a Bearer authorization header.

        Returns:
            Linked user for a valid token, otherwise None.
        """
        try:
            claims = jwt.decode(token, self._secret_key(), algorithms=["HS256"]).claims
            JWTClaimsRegistry(
                exp={"essential": True},
                sub={"essential": True},
                sid={"essential": True},
                typ={"value": "access"},
            ).validate(claims)
            user_id = claims.get("sub")
            session_id = claims.get("sid")
            if not isinstance(user_id, str) or not isinstance(session_id, str):
                return None
            refresh_session = session.get(RefreshSession, session_id)
            if (
                refresh_session is None
                or refresh_session.user_id != user_id
                or refresh_session.revoked_at is not None
                or refresh_session.expires_at <= self._clock.now()
            ):
                return None
            return session.get(User, user_id)
        except (JoseError, ValueError, TypeError):
            return None

    def revoke_access_token(self, session: Session, token: str) -> None:
        """Immediately revoke the local refresh session bound to an access token.

        Args:
            session: Open database session containing local session state.
            token: Validated bearer access token.

        Returns:
            None.
        """
        try:
            claims = jwt.decode(token, self._secret_key(), algorithms=["HS256"]).claims
            session_id = claims.get("sid")
            if not isinstance(session_id, str):
                return
            refresh_session = session.get(RefreshSession, session_id)
            if refresh_session is not None:
                refresh_session.revoked_at = self._clock.now()
        except (JoseError, ValueError, TypeError):
            return

    def _access_token(self, user: User, now: datetime, session_id: str) -> str:
        """Sign one compact local HS256 application access token.

        Args:
            user: User represented by the token subject.
            now: UTC issuance timestamp.
            session_id: Locally revocable refresh-session identifier.

        Returns:
            Compact JWT string.
        """
        claims = {
            "sub": user.id,
            "sid": session_id,
            "typ": "access",
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(minutes=self._settings.access_token_minutes)).timestamp()),
        }
        return jwt.encode({"alg": "HS256"}, claims, self._secret_key())

    def _token_hash(self, token: str) -> str:
        """Hash opaque credentials for storage.

        Args:
            token: Plaintext token which must never be persisted.

        Returns:
            Hexadecimal SHA-256 digest.
        """
        return hashlib.sha256(token.encode()).hexdigest()

    def _secret_key(self) -> OctKey:
        """Read the configured secret only at token cryptography boundary.

        Args:
            None.

        Returns:
            Symmetric signing key for local application tokens.
        """
        if self._settings.token_secret is None:
            raise ValueError("TOKEN_SECRET is not configured")
        return OctKey.import_key(self._settings.token_secret.get_secret_value())


class DeviceAuthorizationService:
    """Protect browser completion with a desktop-owned verifier and atomic consumption.

    Args:
        settings: Validated runtime configuration.
        clock: Injected UTC clock.
        sessions: Local app session issuer.
    """

    def __init__(self, settings: Settings, clock: Clock, sessions: SessionService) -> None:
        """Store configuration and collaborators.

        Args:
            settings: Validated runtime configuration.
            clock: Injected UTC clock.
            sessions: Local app session issuer.
        """
        self._settings = settings
        self._clock = clock
        self._sessions = sessions

    def begin(
        self, session: Session, device_code: str, verifier_challenge: str
    ) -> DeviceAuthorization:
        """Create one expiring protected browser transaction.

        Args:
            session: Open database session receiving transaction state.
            device_code: Desktop-generated opaque correlation ID.
            verifier_challenge: Desktop hash of its raw redemption verifier.

        Returns:
            Newly persisted authorization record.

        Raises:
            ValueError: If an active device code already exists.
        """
        now = self._clock.now()
        current = session.get(DeviceAuthorization, device_code)
        if current is not None and current.expires_at > now:
            raise ValueError("device authorization already exists")
        if current is not None:
            session.delete(current)
        record = DeviceAuthorization(
            device_code=device_code,
            verifier_challenge=verifier_challenge,
            expires_at=now + timedelta(minutes=self._settings.device_authorization_minutes),
        )
        session.add(record)
        session.flush()
        return record

    def bind_browser_state(
        self,
        session: Session,
        record: DeviceAuthorization,
        state: str,
        nonce: str,
        code_verifier: str,
    ) -> None:
        """Attach server-only OAuth secrets to a pending browser transaction.

        Args:
            session: Open database session receiving OAuth state.
            record: Existing protected device transaction.
            state: OIDC callback state.
            nonce: OIDC ID-token nonce.
            code_verifier: Server-only PKCE verifier.

        Returns:
            None.
        """
        record.state = state
        record.nonce = nonce
        record.code_verifier = code_verifier
        session.flush()

    def complete(self, session: Session, record: DeviceAuthorization, user: User) -> None:
        """Issue local tokens and mark a browser transaction complete.

        Args:
            session: Open database session receiving session and completion state.
            record: Pending browser transaction.
            user: Verified linked OIDC user.

        Returns:
            None.
        """
        token_pair = self._sessions.issue(session, user)
        record.user_id = user.id
        record.completion_access_token = token_pair.access_token
        record.completion_refresh_token = token_pair.refresh_token
        record.completed_at = self._clock.now()
        record.state = None
        record.nonce = None
        record.code_verifier = None
        session.flush()

    def redeem(
        self, session: Session, device_code: str, verifier: str
    ) -> DevicePollResponse | None:
        """Return a protected completion once and atomically consume it.

        Args:
            session: Open database session containing transaction state.
            device_code: Desktop correlation code.
            verifier: Desktop raw verifier sent only over protected API transport.

        Returns:
            Pending or complete state, or None for invalid/expired attempts.
        """
        record = session.get(DeviceAuthorization, device_code)
        if record is None or record.expires_at <= self._clock.now():
            return None
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
            .rstrip(b"=")
            .decode()
        )
        if not hmac.compare_digest(record.verifier_challenge, challenge):
            return None
        if record.completed_at is None:
            return DevicePollResponse(status="pending")
        if record.user_id is None:
            return None
        user = session.get(User, record.user_id)
        access_token = record.completion_access_token
        refresh_token = record.completion_refresh_token
        if user is None or access_token is None or refresh_token is None:
            return None
        statement = (
            update(DeviceAuthorization)
            .where(
                DeviceAuthorization.device_code == device_code,
                DeviceAuthorization.consumed_at.is_(None),
            )
            .values(
                consumed_at=self._clock.now(),
                completion_access_token=None,
                completion_refresh_token=None,
            )
        )
        consumed = cast("CursorResult[Any]", session.execute(statement))
        if consumed.rowcount != 1:
            return None
        return DevicePollResponse(
            status="complete",
            access_token=access_token,
            refresh_token=refresh_token,
            provider="oidc",
            first_name=user.first_name,
            last_name=user.last_name,
            onboarding_completed=user.onboarding_completed,
        )

    def _random_value(self) -> str:
        """Generate high-entropy URL-safe OAuth transaction state.

        Args:
            None.

        Returns:
            Opaque URL-safe secret.
        """
        return secrets.token_urlsafe(32)

    def new_oauth_values(self) -> tuple[str, str, str]:
        """Generate a state, nonce, and PKCE verifier without persistence.

        Args:
            None.

        Returns:
            Server-only OAuth transaction values.
        """
        return self._random_value(), self._random_value(), self._random_value()

    def public_user(self, user: User) -> UserResponse:
        """Map internal persistence to public user representation.

        Args:
            user: Linked OIDC user.

        Returns:
            Safe response without provider credentials or ownership claims.
        """
        return UserResponse(
            id=UUID(user.id),
            first_name=user.first_name,
            last_name=user.last_name,
            onboarding_completed=user.onboarding_completed,
        )
