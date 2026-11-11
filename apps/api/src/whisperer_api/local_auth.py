"""Boot-token authentication and the persistent device principal.

The on-device profile has exactly one user, identified by issuer ``device``
and subject ``local``. Every request proves possession of the per-launch boot
token; the desktop first verifies the server with an HMAC challenge so it
never sends the token to a process that does not already hold it.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from typing import TYPE_CHECKING

from sqlalchemy import select

from whisperer_api.persistence import User

if TYPE_CHECKING:
    from pydantic import SecretStr
    from sqlalchemy.orm import Session

    from whisperer_api.auth import Clock

DEVICE_ISSUER = "device"
DEVICE_SUBJECT = "local"


class LocalAuthenticator:
    """Authenticate the desktop that launched this server.

    Args:
        boot_token: Per-launch secret received on stdin.
        clock: UTC clock used when creating the device user.
    """

    def __init__(self, boot_token: SecretStr, clock: Clock) -> None:
        """Store the secret and clock.

        Args:
            boot_token: Per-launch secret received on stdin.
            clock: UTC clock used when creating the device user.
        """
        self._token = boot_token.get_secret_value().encode()
        self._clock = clock

    def challenge(self, nonce: str) -> str:
        """Prove possession of the boot token for a desktop-chosen nonce.

        Args:
            nonce: Desktop nonce text.

        Returns:
            Unpadded base64url HMAC-SHA256 keyed by the token text.
        """
        digest = hmac.new(self._token, nonce.encode(), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()

    def bearer_matches(self, token: str) -> bool:
        """Compare a bearer credential with the boot token in constant time.

        Args:
            token: Bearer credential from the request.

        Returns:
            Whether it is the boot token.
        """
        return hmac.compare_digest(token.encode(), self._token)

    def user_from_bearer(self, session: Session, token: str) -> User | None:
        """Resolve the device user when the bearer is the boot token.

        Args:
            session: Open database session.
            token: Bearer credential from the request.

        Returns:
            Device user, or None for any other credential.
        """
        if not hmac.compare_digest(token.encode(), self._token):
            return None
        return self.ensure_user(session)

    def ensure_user(self, session: Session) -> User:
        """Return the persistent device user, creating it on first use.

        Args:
            session: Open database session.

        Returns:
            The single local owner of all resources.
        """
        user = session.scalar(
            select(User).where(User.issuer == DEVICE_ISSUER, User.subject == DEVICE_SUBJECT)
        )
        if user is None:
            user = User(issuer=DEVICE_ISSUER, subject=DEVICE_SUBJECT, created_at=self._clock.now())
            session.add(user)
            session.flush()
        return user
