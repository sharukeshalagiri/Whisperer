"""Incremental, private dictation metric operations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

from whisperer_api.metrics_models import (
    DictationMetric,
    DictationMetricApp,
    DictationMetricDaily,
    DictationMetricTotal,
)
from whisperer_api.metrics_schemas import (
    AppMetricItem,
    AppMetricsResponse,
    DailyMetricItem,
    DailyMetricsResponse,
    DictationMetricRequest,
    MetricsResponse,
)

_MAX_DAILY_RANGE_DAYS = 366


@dataclass(frozen=True, slots=True)
class _Day:
    """Sum one calendar date's rollups across every zone the events were recorded in.

    Args:
        date: Event-local calendar date.
        words: Output words.
        duration_ms: Dictation duration.
        dictation_count: Event count.
        dictionary_replacements: Dictionary replacements applied.
        corrected_words: Raw transcript words changed before output.
    """

    date: date
    words: int
    duration_ms: int
    dictation_count: int
    dictionary_replacements: int
    corrected_words: int


class MetricConflictError(Exception):
    """Signal a reused idempotency event ID with a different payload.

    Args:
        None.
    """


class MetricsService:
    """Persist dictation-only metrics and maintain queryable aggregates.

    Args:
        None.
    """

    def put(
        self,
        session: Session,
        user_id: str,
        event_id: str,
        request: DictationMetricRequest,
    ) -> None:
        """Record one event exactly once and increment all affected aggregates.

        Args:
            session: Open transaction scoped to the current request.
            user_id: Authenticated owner identifier.
            event_id: Client-stable retry identifier.
            request: Validated no-transcript metric representation.

        Returns:
            None.

        Raises:
            MetricConflictError: If the event ID was previously used for other data.
            ValueError: If cross-field metric constraints are invalid.
        """
        self._validate_request(request)
        existing = session.scalar(
            select(DictationMetric).where(
                DictationMetric.user_id == user_id, DictationMetric.event_id == event_id
            )
        )
        if existing is not None:
            self._ensure_same(existing, request)
            return
        metric = DictationMetric(
            user_id=user_id,
            event_id=event_id,
            created_at=request.created_at.astimezone(UTC),
            duration_ms=request.duration_ms,
            speech_duration_ms=request.speech_duration_ms,
            output_words=request.output_words,
            corrected_words=request.corrected_words,
            dictionary_replacements=request.dictionary_replacements,
            app_name=self._label(request.app_name),
            device_id=self._label(request.device_id),
            timezone=request.timezone,
        )
        try:
            with session.begin_nested():
                session.add(metric)
                session.flush()
        except IntegrityError:
            existing = session.scalar(
                select(DictationMetric).where(
                    DictationMetric.user_id == user_id, DictationMetric.event_id == event_id
                )
            )
            if existing is None:
                raise
            self._ensure_same(existing, request)
            return
        self._increment(session, metric)

    def overview(
        self, session: Session, user_id: str, timezone: str, now: datetime
    ) -> MetricsResponse:
        """Read precomputed totals plus bounded recent WPM and local aggregates.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner identifier.
            timezone: IANA zone defining today and the week and month boundaries.
            now: Current UTC timestamp.

        Returns:
            Account metrics without reading all source events.
        """
        total = session.get(DictationMetricTotal, user_id)
        today = now.astimezone(ZoneInfo(timezone)).date()
        sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        first_of_month = today.replace(day=1)
        first_of_last_month = (first_of_month - timedelta(days=1)).replace(day=1)
        by_date = {day.date: day for day in self._days(session, user_id, until=today)}
        active = {day for day, row in by_date.items() if row.dictation_count}

        def words_between(start: date, end: date) -> int:
            return sum(row.words for day, row in by_date.items() if start <= day <= end)

        return MetricsResponse(
            totalWords=total.total_words if total else 0,
            totalDurationMs=total.total_duration_ms if total else 0,
            dictationCount=total.dictation_count if total else 0,
            dictionaryReplacements=total.dictionary_replacements if total else 0,
            correctedWords=total.corrected_words if total else 0,
            wordsPerMinute=self._recent_wpm(session, user_id),
            wordsToday=words_between(today, today),
            wordsThisWeek=words_between(sunday, today),
            wordsThisMonth=words_between(first_of_month, today),
            wordsLastMonth=words_between(first_of_last_month, first_of_month - timedelta(days=1)),
            activeDays=len(active),
            dayStreak=self._day_streak(active, today),
            longestDayStreak=self._longest_day_streak(active),
            weekStreak=self._week_streak(active, today),
            timeZone=timezone,
        )

    def daily(
        self,
        session: Session,
        user_id: str,
        from_date: date,
        until_date: date,
    ) -> DailyMetricsResponse:
        """Return bounded calendar-day aggregates from the maintained rollup table.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner identifier.
            from_date: Inclusive first calendar day.
            until_date: Inclusive final calendar day.

        Returns:
            Ordered daily aggregate representation.

        Raises:
            ValueError: If the requested date range is invalid or too broad.
        """
        if until_date < from_date or (until_date - from_date).days > _MAX_DAILY_RANGE_DAYS:
            raise ValueError("Date range must be between zero and 366 days.")
        return DailyMetricsResponse(
            days=[
                DailyMetricItem(
                    date=day.date,
                    words=day.words,
                    durationMs=day.duration_ms,
                    dictationCount=day.dictation_count,
                    dictionaryReplacements=day.dictionary_replacements,
                    correctedWords=day.corrected_words,
                )
                for day in self._days(session, user_id, since=from_date, until=until_date)
            ]
        )

    def apps(self, session: Session, user_id: str) -> AppMetricsResponse:
        """Return aggregate metrics per nonempty application name.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner identifier.

        Returns:
            Applications ordered by words and name.
        """
        rows = session.scalars(
            select(DictationMetricApp)
            .where(DictationMetricApp.user_id == user_id)
            .order_by(DictationMetricApp.words.desc(), DictationMetricApp.app_name)
        )
        return AppMetricsResponse(
            items=[
                AppMetricItem(
                    appName=row.app_name,
                    words=row.words,
                    durationMs=row.duration_ms,
                    dictationCount=row.dictation_count,
                )
                for row in rows
            ]
        )

    @staticmethod
    def _days(
        session: Session, user_id: str, *, since: date | None = None, until: date
    ) -> list[_Day]:
        """Sum daily rollups by calendar date across every recording zone.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner identifier.
            since: Optional inclusive first date; omit it to read the whole history.
            until: Inclusive final date.

        Returns:
            Dates in ascending order; a date without events is absent.
        """
        daily = DictationMetricDaily
        query = (
            select(
                daily.date,
                func.sum(daily.words),
                func.sum(daily.duration_ms),
                func.sum(daily.dictation_count),
                func.sum(daily.dictionary_replacements),
                func.sum(daily.corrected_words),
            )
            .where(daily.user_id == user_id, daily.date <= until)
            .group_by(daily.date)
            .order_by(daily.date)
        )
        if since is not None:
            query = query.where(daily.date >= since)
        return [_Day(*row) for row in session.execute(query)]

    def _increment(self, session: Session, metric: DictationMetric) -> None:
        """Increment lifetime, local-day, and app aggregates for a new event.

        Args:
            session: Open request transaction.
            metric: Newly inserted source event.

        Returns:
            None.
        """
        total = session.get(DictationMetricTotal, metric.user_id)
        if total is None:
            total = DictationMetricTotal(
                user_id=metric.user_id,
                total_words=0,
                total_duration_ms=0,
                dictation_count=0,
                dictionary_replacements=0,
                corrected_words=0,
            )
            session.add(total)
        total.total_words += metric.output_words
        total.total_duration_ms += metric.duration_ms
        total.dictation_count += 1
        total.dictionary_replacements += metric.dictionary_replacements
        total.corrected_words += metric.corrected_words
        local_date = metric.created_at.astimezone(ZoneInfo(metric.timezone)).date()
        daily = session.scalar(
            select(DictationMetricDaily).where(
                DictationMetricDaily.user_id == metric.user_id,
                DictationMetricDaily.timezone == metric.timezone,
                DictationMetricDaily.date == local_date,
            )
        )
        if daily is None:
            daily = DictationMetricDaily(
                user_id=metric.user_id,
                timezone=metric.timezone,
                date=local_date,
                words=0,
                duration_ms=0,
                dictation_count=0,
                dictionary_replacements=0,
                corrected_words=0,
            )
            session.add(daily)
        daily.words += metric.output_words
        daily.duration_ms += metric.duration_ms
        daily.dictation_count += 1
        daily.dictionary_replacements += metric.dictionary_replacements
        daily.corrected_words += metric.corrected_words
        if metric.app_name:
            app = session.scalar(
                select(DictationMetricApp).where(
                    DictationMetricApp.user_id == metric.user_id,
                    DictationMetricApp.app_name == metric.app_name,
                )
            )
            if app is None:
                app = DictationMetricApp(
                    user_id=metric.user_id,
                    app_name=metric.app_name,
                    words=0,
                    duration_ms=0,
                    dictation_count=0,
                )
                session.add(app)
            app.words += metric.output_words
            app.duration_ms += metric.duration_ms
            app.dictation_count += 1

    def _recent_wpm(self, session: Session, user_id: str) -> int:
        """Compute a weighted WPM from at most 100 recent eligible events.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner identifier.

        Returns:
            Rounded weighted words per minute, or zero without eligible duration.
        """
        rows = list(
            session.scalars(
                select(DictationMetric)
                .where(
                    DictationMetric.user_id == user_id,
                    DictationMetric.output_words > 0,
                    DictationMetric.duration_ms < 400_000,
                )
                .order_by(DictationMetric.created_at.desc())
                .limit(100)
            )
        )
        duration = sum(row.speech_duration_ms or row.duration_ms for row in rows)
        return round(sum(row.output_words for row in rows) * 60_000 / duration) if duration else 0

    @staticmethod
    def _day_streak(active: set[date], today: date) -> int:
        """Count contiguous active local days ending today or yesterday.

        Args:
            active: Local dates with at least one event.
            today: Current local date.

        Returns:
            Number of consecutive active days.
        """
        cursor = today if today in active else today - timedelta(days=1)
        streak = 0
        while cursor in active:
            streak += 1
            cursor -= timedelta(days=1)
        return streak

    @staticmethod
    def _longest_day_streak(active: set[date]) -> int:
        """Find the longest run of consecutive active local days ever recorded.

        Args:
            active: Local dates with at least one event.

        Returns:
            Length of the longest run, or zero without events.
        """
        longest = 0
        for day in active:
            # Only a run's first day starts a count, so each day is visited at most twice.
            if day - timedelta(days=1) in active:
                continue
            length = 1
            while day + timedelta(days=length) in active:
                length += 1
            longest = max(longest, length)
        return longest

    @staticmethod
    def _week_streak(active: set[date], today: date) -> int:
        """Count contiguous Sunday-based local weeks with at least one event.

        Args:
            active: Local dates with at least one event.
            today: Current local date.

        Returns:
            Number of consecutive active Sunday-based weeks.
        """
        current_sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        active_weeks = {day - timedelta(days=(day.weekday() + 1) % 7) for day in active}
        cursor = (
            current_sunday if current_sunday in active_weeks else current_sunday - timedelta(days=7)
        )
        streak = 0
        while cursor in active_weeks:
            streak += 1
            cursor -= timedelta(days=7)
        return streak

    @staticmethod
    def _label(value: str | None) -> str | None:
        """Normalize optional metadata without retaining empty labels.

        Args:
            value: Optional client-supplied label.

        Returns:
            Stripped nonempty label or None.
        """
        return value.strip() or None if value is not None else None

    @staticmethod
    def _validate_request(request: DictationMetricRequest) -> None:
        """Enforce relational metric constraints unavailable to field validation.

        Args:
            request: Parsed metric request.

        Returns:
            None.

        Raises:
            ValueError: If the timestamp or speech duration is invalid.
        """
        if request.created_at.tzinfo is None:
            raise ValueError("createdAt must include a timezone.")
        if (
            request.speech_duration_ms is not None
            and request.speech_duration_ms > request.duration_ms
        ):
            raise ValueError("speechDurationMs cannot exceed durationMs.")

    def _ensure_same(self, metric: DictationMetric, request: DictationMetricRequest) -> None:
        """Verify a duplicate retry has precisely the original payload.

        Args:
            metric: Existing event matched by owner and event ID.
            request: Candidate retry request.

        Returns:
            None.

        Raises:
            MetricConflictError: If any persisted payload field differs.
        """
        values = (
            metric.created_at == request.created_at.astimezone(UTC),
            metric.duration_ms == request.duration_ms,
            metric.speech_duration_ms == request.speech_duration_ms,
            metric.output_words == request.output_words,
            metric.corrected_words == request.corrected_words,
            metric.dictionary_replacements == request.dictionary_replacements,
            metric.app_name == self._label(request.app_name),
            metric.device_id == self._label(request.device_id),
            metric.timezone == request.timezone,
        )
        if not all(values):
            raise MetricConflictError("This event ID was already used with different data.")
