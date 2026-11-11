"""Persistent owner-scoped meeting state and durable work records."""

from __future__ import annotations

# SQLAlchemy resolves Mapped annotations at runtime.
from datetime import datetime  # noqa: TC003
from uuid import uuid4

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from whisperer_api.persistence import Base, UtcDateTime


class Meeting(Base):
    """Store an owner-scoped meeting and its independently versioned text.

    Args:
        None.
    """

    __tablename__ = "api_meetings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    started_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    transcript: Mapped[str] = mapped_column(Text, nullable=False, default="")
    transcript_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary: Mapped[str | None] = mapped_column(Text)
    summary_revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_source_revision: Mapped[int | None] = mapped_column(Integer)
    summary_stale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    transcript_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    summary_status: Mapped[str] = mapped_column(String(16), nullable=False, default="idle")
    error: Mapped[str | None] = mapped_column(Text)
    summary_error: Mapped[str | None] = mapped_column(Text)
    summary_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_retry_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    summary_lease_id: Mapped[str | None] = mapped_column(String(36))
    summary_lease_expires_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    segments: Mapped[list[MeetingSegment]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan", passive_deletes=True
    )


class MeetingSegment(Base):
    """Store one append-only private audio segment and transcription lease.

    Args:
        None.
    """

    __tablename__ = "api_meeting_segments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    meeting_id: Mapped[str] = mapped_column(
        ForeignKey("api_meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(127), nullable=False)
    language: Mapped[str | None] = mapped_column(String(32))
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending", index=True)
    transcript: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    retry_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    lease_id: Mapped[str | None] = mapped_column(String(36))
    lease_expires_at: Mapped[datetime | None] = mapped_column(UtcDateTime())
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    meeting: Mapped[Meeting] = relationship(back_populates="segments")
