"""SQLAlchemy persistence for the Whisperer API database."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime
from importlib import import_module
from typing import Protocol
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    create_engine,
    event,
    text,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)


class _SqliteCursor(Protocol):
    """Describe the DB-API cursor operations used for SQLite connection setup.

    Args:
        None.
    """

    def execute(self, statement: str) -> object:
        """Run one SQLite PRAGMA statement.

        Args:
            statement: SQLite pragma SQL.

        Returns:
            Driver-specific execution result.
        """

    def close(self) -> None:
        """Close this temporary DB-API cursor.

        Args:
            None.

        Returns:
            None.
        """


class _SqliteConnection(Protocol):
    """Describe the DB-API connection capability used during SQLite setup.

    Args:
        None.
    """

    def cursor(self) -> _SqliteCursor:
        """Open a cursor for connection PRAGMA configuration.

        Args:
            None.

        Returns:
            Temporary SQLite DB-API cursor.
        """


class UtcDateTime(TypeDecorator[datetime]):
    """Store UTC timestamps portably while restoring aware values on SQLite reads.

    Args:
        None.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: object) -> datetime | None:
        """Normalize aware timestamps before a database bind.

        Args:
            value: Optional UTC-aware timestamp.
            dialect: SQLAlchemy database dialect.

        Returns:
            UTC-naive storage value or None.

        Raises:
            ValueError: If a timestamp is naive.
        """
        del dialect
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("timestamps must be UTC-aware")
        return value.astimezone(UTC).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect: object) -> datetime | None:
        """Restore UTC awareness after a database read.

        Args:
            value: Optional stored timestamp.
            dialect: SQLAlchemy database dialect.

        Returns:
            UTC-aware application timestamp or None.
        """
        del dialect
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


class Base(DeclarativeBase):
    """Declare the isolated FastAPI database metadata.

    Args:
        None.
    """


class User(Base):
    """Represent an OIDC-linked local application user.

    Args:
        None.
    """

    __tablename__ = "api_users"
    __table_args__ = (UniqueConstraint("issuer", "subject", name="api_users_issuer_subject"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    issuer: Mapped[str] = mapped_column(String(2048), nullable=False)
    subject: Mapped[str] = mapped_column(String(512), nullable=False)
    first_name: Mapped[str | None] = mapped_column(String(200))
    last_name: Mapped[str | None] = mapped_column(String(200))
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    refresh_sessions: Mapped[list[RefreshSession]] = relationship(back_populates="user")


class RefreshSession(Base):
    """Store only a hash for a locally revocable refresh session.

    Args:
        None.
    """

    __tablename__ = "api_refresh_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    # Every rotation of one sign-in shares a family, so reuse of a rotated token ends them all.
    family_id: Mapped[str | None] = mapped_column(String(36), index=True)
    user: Mapped[User] = relationship(back_populates="refresh_sessions")


class DeviceAuthorization(Base):
    """Store an expiring browser transaction and its protected completion.

    Args:
        None.
    """

    __tablename__ = "api_device_authorizations"

    device_code: Mapped[str] = mapped_column(String(64), primary_key=True)
    verifier_challenge: Mapped[str] = mapped_column(String(128), nullable=False)
    state: Mapped[str | None] = mapped_column(String(128), unique=True)
    nonce: Mapped[str | None] = mapped_column(String(128))
    code_verifier: Mapped[str | None] = mapped_column(String(128))
    user_id: Mapped[str | None] = mapped_column(ForeignKey("api_users.id", ondelete="SET NULL"))
    completion_access_token: Mapped[str | None] = mapped_column(Text)
    completion_refresh_token: Mapped[str | None] = mapped_column(Text)
    approval_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    completed_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    consumed_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    expires_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)


class Transcript(Base):
    """Represent one user-owned persisted transcript.

    Args:
        None.
    """

    __tablename__ = "api_transcripts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)


class Note(Base):
    """Represent one user-owned note and optional generated summary.

    Args:
        None.
    """

    __tablename__ = "api_notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    revision: Mapped[int] = mapped_column(nullable=False, default=1, server_default="1")


class DictionaryEntry(Base):
    """Represent one private dictionary replacement.

    Args:
        None.
    """

    __tablename__ = "api_dictionary_entries"
    __table_args__ = (UniqueConstraint("user_id", "phrase", name="api_dictionary_owner_phrase"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    phrase: Mapped[str] = mapped_column(String(200), nullable=False)
    replacement: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)


class SyncTombstone(Base):
    """Remember one deletion so a later sync does not bring the record back.

    Args:
        None.
    """

    __tablename__ = "api_sync_tombstones"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(16), primary_key=True)
    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    deleted_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)


def record_tombstone(
    session: Session, user_id: str, kind: str, key: str, deleted_at: datetime
) -> None:
    """Record or advance the deletion of one synchronized record.

    Args:
        session: Open transaction that also performs the deletion.
        user_id: Owner of the deleted record.
        kind: Record family: ``note``, ``dictionary`` or ``meeting``.
        key: Note or meeting id, or the dictionary phrase.
        deleted_at: When the record was deleted.

    Returns:
        None.
    """
    existing = session.get(SyncTombstone, (user_id, kind, key))
    if existing is None:
        session.add(SyncTombstone(user_id=user_id, kind=kind, key=key, deleted_at=deleted_at))
    elif existing.deleted_at < deleted_at:
        existing.deleted_at = deleted_at


# Columns added after a table first shipped, as (table, column, ALTER statements) applied to
# existing SQLite files in order. Every statement is a module constant, never request input.
_COUNTER = "INTEGER NOT NULL DEFAULT 0"
_ADDED_COLUMNS: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "api_refresh_sessions",
        "family_id",
        (
            "ALTER TABLE api_refresh_sessions ADD COLUMN family_id VARCHAR(36)",
            "CREATE INDEX IF NOT EXISTS ix_api_refresh_sessions_family_id"
            " ON api_refresh_sessions (family_id)",
        ),
    ),
    (
        "api_device_authorizations",
        "approval_token_hash",
        (
            "ALTER TABLE api_device_authorizations ADD COLUMN approval_token_hash VARCHAR(64)",
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_api_device_authorizations_approval"
            " ON api_device_authorizations (approval_token_hash)",
        ),
    ),
    (
        "api_notes",
        "revision",
        ("ALTER TABLE api_notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 1",),
    ),
    (
        "api_dictionary_entries",
        "updated_at",
        (
            "ALTER TABLE api_dictionary_entries ADD COLUMN updated_at DATETIME",
            "UPDATE api_dictionary_entries SET updated_at = created_at",
        ),
    ),
    (
        "api_dictation_metrics",
        "corrected_words",
        (f"ALTER TABLE api_dictation_metrics ADD COLUMN corrected_words {_COUNTER}",),
    ),
    (
        "api_dictation_metric_totals",
        "corrected_words",
        (f"ALTER TABLE api_dictation_metric_totals ADD COLUMN corrected_words {_COUNTER}",),
    ),
    (
        "api_dictation_metric_daily",
        "dictionary_replacements",
        (f"ALTER TABLE api_dictation_metric_daily ADD COLUMN dictionary_replacements {_COUNTER}",),
    ),
    (
        "api_dictation_metric_daily",
        "corrected_words",
        (f"ALTER TABLE api_dictation_metric_daily ADD COLUMN corrected_words {_COUNTER}",),
    ),
    (
        "api_dictation_metric_apps",
        "duration_ms",
        (f"ALTER TABLE api_dictation_metric_apps ADD COLUMN duration_ms {_COUNTER}",),
    ),
)


class Database:
    """Own an isolated SQLAlchemy engine and injected session boundary.

    Args:
        url: SQLAlchemy URL for the API database.
    """

    def __init__(self, url: str) -> None:
        """Create the database engine and session factory.

        Args:
            url: SQLAlchemy URL for the new API database.
        """
        self._engine = create_engine(url, future=True)
        if self._engine.dialect.name == "sqlite":
            event.listen(self._engine, "connect", self._configure_sqlite)
        self._sessions = sessionmaker(self._engine, expire_on_commit=False)

    @staticmethod
    def _configure_sqlite(connection: _SqliteConnection, _: object) -> None:
        """Apply safe concurrency and integrity settings to SQLite connections.

        Args:
            connection: Newly opened DB-API connection.
            _: SQLAlchemy connection record.

        Returns:
            None.
        """
        cursor = connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.execute("PRAGMA journal_mode=WAL")
        finally:
            cursor.close()

    def create_schema(self) -> None:
        """Create new API tables and apply safe additive local migrations.

        Args:
            None.

        Returns:
            None.
        """
        import_module("whisperer_api.metrics_models")
        import_module("whisperer_api.meeting_models")
        Base.metadata.create_all(self._engine)
        if self._engine.dialect.name != "sqlite":
            return
        with self._engine.begin() as connection:
            for table, column, statements in _ADDED_COLUMNS:
                columns = {
                    row[1] for row in connection.execute(text(f"PRAGMA table_info({table})"))
                }
                if column in columns:
                    continue
                for statement in statements:
                    connection.execute(text(statement))

    def compact(self) -> None:
        """Rewrite a SQLite file so deleted rows no longer remain in free pages.

        Other databases reclaim storage themselves, so this is a no-op for them.

        Args:
            None.

        Returns:
            None.
        """
        if self._engine.dialect.name != "sqlite":
            return
        # VACUUM cannot run inside a transaction, so the connection must autocommit throughout.
        with self._engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
            connection.exec_driver_sql("VACUUM")
            connection.exec_driver_sql("PRAGMA wal_checkpoint(TRUNCATE)")

    def session(self) -> Iterator[Session]:
        """Yield one transaction-aware database session.

        Args:
            None.

        Yields:
            A session closed after the request finishes.
        """
        with self._sessions() as session:
            yield session
