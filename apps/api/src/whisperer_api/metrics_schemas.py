"""Strict wire models for private, account-level dictation metrics."""

from __future__ import annotations

from datetime import date, datetime  # noqa: TC003
from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, Field

from whisperer_api.schemas import StrictModel


def _valid_timezone(value: str) -> str:
    """Require an IANA time-zone identifier.

    Args:
        value: Client-supplied IANA time-zone identifier.

    Returns:
        The validated identifier.

    Raises:
        ValueError: If the zone is unavailable on the server.
    """
    try:
        ZoneInfo(value)
    except ZoneInfoNotFoundError as error:
        raise ValueError("timezone must be a valid IANA time zone") from error
    return value


IanaTimezone = Annotated[
    str, Field(min_length=1, max_length=64, strict=True), AfterValidator(_valid_timezone)
]


class DictationMetricRequest(StrictModel):
    """Accept one retry-safe dictation event without transcript content.

    Args:
        createdAt: Event timestamp in UTC.
        durationMs: Full elapsed dictation duration.
        speechDurationMs: Optional detected speech duration.
        outputWords: Number of output words.
        correctedWords: Number of raw transcript words changed before output.
        dictionaryReplacements: Number of applied dictionary replacements.
        appName: Optional focused application label.
        deviceId: Optional opaque local device label.
        timezone: Event-local IANA time zone.
    """

    created_at: datetime = Field(alias="createdAt")
    duration_ms: int = Field(alias="durationMs", strict=True, ge=1, le=86_400_000)
    speech_duration_ms: int | None = Field(
        default=None, alias="speechDurationMs", strict=True, ge=1, le=86_400_000
    )
    output_words: int = Field(alias="outputWords", strict=True, ge=0, le=100_000)
    corrected_words: int = Field(default=0, alias="correctedWords", strict=True, ge=0, le=100_000)
    dictionary_replacements: int = Field(
        alias="dictionaryReplacements", strict=True, ge=0, le=100_000
    )
    app_name: str | None = Field(default=None, alias="appName", max_length=500)
    device_id: str | None = Field(default=None, alias="deviceId", max_length=200)
    timezone: IanaTimezone = "UTC"


class MetricsResponse(StrictModel):
    """Represent account-wide dictation totals and current local activity.

    Args:
        totalWords: Lifetime output words.
        totalDurationMs: Lifetime dictation duration.
        dictationCount: Lifetime event count.
        dictionaryReplacements: Lifetime replacement count.
        correctedWords: Lifetime raw transcript words changed before output.
        wordsPerMinute: Weighted rate from the recent eligible events.
        wordsToday: Output words on the local current day.
        wordsThisWeek: Output words since the local Sunday.
        wordsThisMonth: Output words since the first of the local month.
        wordsLastMonth: Output words across the previous local month.
        activeDays: Local days with at least one dictation.
        dayStreak: Consecutive local days with dictation.
        longestDayStreak: Longest run of consecutive local days with dictation.
        weekStreak: Consecutive Sunday-based local weeks with dictation.
        timeZone: Time zone used for local calendar values.
    """

    total_words: int = Field(alias="totalWords")
    total_duration_ms: int = Field(alias="totalDurationMs")
    dictation_count: int = Field(alias="dictationCount")
    dictionary_replacements: int = Field(alias="dictionaryReplacements")
    corrected_words: int = Field(alias="correctedWords")
    words_per_minute: int = Field(alias="wordsPerMinute")
    words_today: int = Field(alias="wordsToday")
    words_this_week: int = Field(alias="wordsThisWeek")
    words_this_month: int = Field(alias="wordsThisMonth")
    words_last_month: int = Field(alias="wordsLastMonth")
    active_days: int = Field(alias="activeDays")
    day_streak: int = Field(alias="dayStreak")
    longest_day_streak: int = Field(alias="longestDayStreak")
    week_streak: int = Field(alias="weekStreak")
    time_zone: str = Field(alias="timeZone")


class DailyMetricItem(StrictModel):
    """Represent one local calendar-day aggregate.

    Args:
        date: Local calendar date.
        words: Total output words.
        durationMs: Total duration.
        dictationCount: Number of events.
        dictionaryReplacements: Dictionary replacements applied that day.
        correctedWords: Raw transcript words changed before output that day.
    """

    date: date
    words: int
    duration_ms: int = Field(alias="durationMs")
    dictation_count: int = Field(alias="dictationCount")
    dictionary_replacements: int = Field(alias="dictionaryReplacements")
    corrected_words: int = Field(alias="correctedWords")


class DailyMetricsResponse(StrictModel):
    """Wrap bounded local-day aggregates.

    Args:
        days: Ordered local daily metric aggregates.
    """

    days: list[DailyMetricItem]


class AppMetricItem(StrictModel):
    """Represent one aggregate application label.

    Args:
        appName: Focused application label.
        words: Total output words.
        durationMs: Total dictation duration.
        dictationCount: Number of events.
    """

    app_name: str = Field(alias="appName")
    words: int
    duration_ms: int = Field(alias="durationMs")
    dictation_count: int = Field(alias="dictationCount")


class AppMetricsResponse(StrictModel):
    """Wrap application-level aggregates.

    Args:
        items: Applications ordered by output words.
    """

    items: list[AppMetricItem]
