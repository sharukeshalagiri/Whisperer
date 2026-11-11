"""Persistent incremental aggregates for private dictation metrics."""

from __future__ import annotations

from datetime import date, datetime  # noqa: TC003
from uuid import uuid4

from sqlalchemy import Date, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from whisperer_api.persistence import Base, UtcDateTime


class DictationMetric(Base):
    """Store one idempotent, user-owned dictation metric event.

    Args:
        None.
    """

    __tablename__ = "api_dictation_metrics"
    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="api_dictation_metric_owner_event"),
        Index("api_dictation_metric_wpm", "user_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    event_id: Mapped[str] = mapped_column(String(36), nullable=False)
    created_at: Mapped[datetime] = mapped_column(UtcDateTime(), nullable=False)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    speech_duration_ms: Mapped[int | None] = mapped_column(Integer)
    output_words: Mapped[int] = mapped_column(Integer, nullable=False)
    corrected_words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dictionary_replacements: Mapped[int] = mapped_column(Integer, nullable=False)
    app_name: Mapped[str | None] = mapped_column(String(500))
    device_id: Mapped[str | None] = mapped_column(String(200))
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)


class DictationMetricTotal(Base):
    """Store account-wide incremental metric totals.

    Args:
        None.
    """

    __tablename__ = "api_dictation_metric_totals"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), primary_key=True
    )
    total_words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dictation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dictionary_replacements: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    corrected_words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class DictationMetricDaily(Base):
    """Store incrementally maintained metric totals per event-local calendar day.

    The row's zone records where the event happened. Reads sum rows across zones by date, so
    a day dictated on another device's clock still counts once on every viewer's calendar.

    Args:
        None.
    """

    __tablename__ = "api_dictation_metric_daily"
    __table_args__ = (
        UniqueConstraint("user_id", "timezone", "date", name="api_dictation_daily_owner_zone_date"),
        Index("api_dictation_daily_lookup", "user_id", "timezone", "date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dictation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dictionary_replacements: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    corrected_words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class DictationMetricApp(Base):
    """Store incrementally maintained metrics by application name.

    Args:
        None.
    """

    __tablename__ = "api_dictation_metric_apps"
    __table_args__ = (
        UniqueConstraint("user_id", "app_name", name="api_dictation_app_owner_name"),
        Index("api_dictation_app_owner_words", "user_id", "words"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        ForeignKey("api_users.id", ondelete="CASCADE"), nullable=False
    )
    app_name: Mapped[str] = mapped_column(String(500), nullable=False)
    words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    dictation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
