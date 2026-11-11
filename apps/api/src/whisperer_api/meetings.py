"""Owner-scoped meeting operations with durable transcription and summary work."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import shutil
import time
from contextlib import contextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING, Protocol, cast
from uuid import UUID, uuid4

from sqlalchemy import and_, func, or_, select, update

from whisperer_api.meeting_models import Meeting, MeetingSegment
from whisperer_api.persistence import record_tombstone

if TYPE_CHECKING:
    from collections.abc import Callable, Generator, Iterator

    from sqlalchemy.orm import Session
    from sqlalchemy.sql.elements import ColumnElement

    from whisperer_api.auth import Clock
    from whisperer_api.persistence import Database

_MAX_ATTEMPTS = 3
_LEASE_DURATION = timedelta(minutes=2)
_STREAM_CHUNK_BYTES = 64 * 1024
_PENDING = "pending"
_RUNNING = "running"
_COMPLETE = "complete"
_FAILED = "failed"
_IDLE = "idle"
_ACTIVE_SEGMENT_STATUSES = (_PENDING, _RUNNING)
# Windows ERROR_SHARING_VIOLATION: another process (often antivirus, or this worker reading the
# file) still holds it open, so it cannot be deleted yet.
_WINDOWS_SHARING_VIOLATION = 32
_LOGGER = logging.getLogger("whisperer_api.meetings")


def _is_sharing_violation(error: BaseException) -> bool:
    """Report whether a failed file operation hit a Windows sharing violation.

    Args:
        error: Exception raised by a filesystem call.

    Returns:
        True only for ``PermissionError`` carrying ``winerror == 32``; never on other systems.
    """
    return isinstance(error, PermissionError) and getattr(error, "winerror", None) == (
        _WINDOWS_SHARING_VIOLATION
    )


@dataclass(frozen=True)
class MeetingQuestionSource:
    """Freeze the owned saved meeting content used for one ephemeral answer.

    Args:
        transcript: Complete persisted transcript at snapshot time.
        transcript_revision: Persisted transcript revision at snapshot time.
        transcript_status: Persisted transcript processing status.
        summary: Complete persisted summary, when one exists.
        summary_revision: Persisted summary revision at snapshot time.
        summary_stale: Whether the summary predates the transcript.
    """

    transcript: str
    transcript_revision: int
    transcript_status: str
    summary: str | None
    summary_revision: int
    summary_source_revision: int | None
    summary_status: str
    summary_stale: bool


class MeetingInference(Protocol):
    """Describe the gateway capabilities used by durable meeting work.

    Args:
        None.
    """

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float,
    ) -> str:
        """Transcribe one stored audio segment.

        Args:
            audio: Complete bounded private audio bytes.
            filename: Safe original filename for gateway metadata.
            content_type: Validated audio media type.
            language: Optional spoken-language hint.
            timeout_seconds: Bounded request duration for this long-running operation.

        Returns:
            Plain transcript text.
        """


class GeneratedSummary(Protocol):
    """Describe a bounded generated summary.

    Args:
        None.
    """

    @property
    def text(self) -> str:
        """Return the stripped, non-empty summary text.

        Args:
            None.

        Returns:
            Summary text.
        """


class MeetingSummarizer(Protocol):
    """Describe the language-model boundary that summarizes complete transcripts.

    Args:
        None.
    """

    async def summarize(self, transcript: str, *, timeout_seconds: float) -> GeneratedSummary:
        """Summarize the complete current meeting transcript.

        Args:
            transcript: User-owned transcript text.
            timeout_seconds: Bounded request duration for this long-running operation.

        Returns:
            Bounded summary.
        """


class AsyncByteReader(Protocol):
    """Describe the bounded asynchronous reader used by multipart adapters.

    Args:
        None.
    """

    async def read(self, size: int = -1) -> bytes:
        """Read at most the requested number of bytes.

        Args:
            size: Maximum byte count, or negative for an implementation default.

        Returns:
            Next byte chunk, or empty bytes at end of input.
        """


class MeetingError(Exception):
    """Base exception for safe meeting operation failures.

    Args:
        None.
    """


class MeetingNotFoundError(MeetingError):
    """Signal an absent or foreign-owned meeting without disclosing ownership.

    Args:
        None.
    """


class MeetingConflictError(MeetingError):
    """Signal an idempotency, lifecycle, or storage conflict.

    Args:
        detail: Safe client-readable conflict explanation.
    """

    def __init__(self, detail: str) -> None:
        """Store a safe conflict detail.

        Args:
            detail: Client-readable explanation without private data.
        """
        super().__init__(detail)


class MeetingRevisionConflictError(MeetingConflictError):
    """Signal that an If-Match text or metadata revision is stale.

    Args:
        None.
    """

    def __init__(self) -> None:
        """Create the stable stale-revision error.

        Args:
            None.
        """
        super().__init__("The meeting changed. Refresh it and try again.")


class AudioTooLargeError(MeetingError):
    """Signal that an upload exceeded the configured bounded size.

    Args:
        None.
    """


class UnsupportedAudioError(MeetingError):
    """Signal a non-audio segment media type.

    Args:
        None.
    """


@dataclass(frozen=True)
class StoredAudio:
    """Describe one authenticated private audio file for an HTTP download adapter.

    Args:
        path: Private file system path.
        content_type: Original accepted media type.
        filename: Safe presentation filename.
        size_bytes: File length recorded at upload.
    """

    path: Path
    content_type: str
    filename: str
    size_bytes: int


@dataclass(frozen=True)
class _ClaimedSegment:
    """Capture durable work details after its lease commits.

    Args:
        id: Segment id.
        lease_id: Unique lease token.
        storage_path: Relative audio path.
        filename: Gateway filename metadata.
        content_type: Gateway media type.
        language: Optional language hint.
    """

    id: str
    lease_id: str
    storage_path: str
    filename: str
    content_type: str
    language: str | None


@dataclass(frozen=True)
class _ClaimedSummary:
    """Capture a committed summary lease and immutable source snapshot.

    Args:
        id: Meeting id.
        lease_id: Unique summary lease token.
        transcript: Snapshot passed to inference.
        transcript_revision: Source transcript revision.
    """

    id: str
    lease_id: str
    transcript: str
    transcript_revision: int


class MeetingService:
    """Persist meetings, isolate audio, and run one restart-safe worker loop.

    Args:
        database: Isolated application database used by worker-owned transactions.
        clock: UTC clock shared with the application composition root.
        inference: Injected gateway for transcription.
        audio_root: Existing or creatable private root for meeting audio artifacts.
        summarizer: Language-model boundary for summaries, or None when it is off.
        max_segment_bytes: Strict per-segment byte cap applied while streaming.
        inference_timeout_seconds: Gateway timeout applied only to meeting work.
        delete_retry_attempts: Extra attempts for a file deletion blocked by a sharing violation.
        delete_retry_delay_seconds: Pause between those attempts; tests set it near zero.
        orphan_grace_seconds: Minimum age of an unreferenced file before a sweep deletes it.
    """

    def __init__(
        self,
        database: Database,
        clock: Clock,
        inference: MeetingInference,
        audio_root: Path,
        summarizer: MeetingSummarizer | None = None,
        max_segment_bytes: int = 25 * 1024 * 1024,
        inference_timeout_seconds: float = 300.0,
        delete_retry_attempts: int = 10,
        delete_retry_delay_seconds: float = 0.05,
        orphan_grace_seconds: float = 600.0,
    ) -> None:
        """Store injected collaborators without starting background work.

        Args:
            database: Application database owner.
            clock: UTC source for timestamps and lease deadlines.
            inference: Gateway used for transcription after leases commit.
            audio_root: Private artifact root outside public static paths.
            summarizer: Summary boundary; None records each summary as a failure.
            max_segment_bytes: Maximum accepted audio bytes per segment.
            inference_timeout_seconds: Bounded transcription and summary request duration.
            delete_retry_attempts: Extra attempts after a Windows sharing violation.
            delete_retry_delay_seconds: Pause between deletion attempts.
            orphan_grace_seconds: An unreferenced file younger than this is left alone, so an
                upload that has moved its file into place but not yet committed is never swept.
        """
        self._database = database
        self._clock = clock
        self._inference = inference
        self._summarizer = summarizer
        self._audio_root = audio_root.resolve()
        self._max_segment_bytes = max_segment_bytes
        self._inference_timeout_seconds = inference_timeout_seconds
        self._delete_retry_attempts = delete_retry_attempts
        self._delete_retry_delay_seconds = delete_retry_delay_seconds
        self._orphan_grace_seconds = orphan_grace_seconds
        self._wake = asyncio.Event()
        self._stopping = asyncio.Event()
        self._worker: asyncio.Task[None] | None = None

    async def start(self) -> None:
        """Create storage and start the one durable processing loop once.

        Args:
            None.

        Returns:
            None.
        """
        self._audio_root.mkdir(parents=True, exist_ok=True)
        # Nothing is uploading before the server starts, so unreferenced audio of any age goes.
        await asyncio.to_thread(self.sweep_orphan_audio, 0.0)
        if self._worker is None or self._worker.done():
            self._stopping.clear()
            self._worker = asyncio.create_task(self._run_worker(), name="meeting-worker")

    async def stop(self) -> None:
        """Stop the worker without erasing its durable leases or queued work.

        Args:
            None.

        Returns:
            None.
        """
        self._stopping.set()
        self._wake.set()
        if self._worker is not None:
            self._worker.cancel()
            with suppress(asyncio.CancelledError):
                await self._worker
            self._worker = None

    def create_meeting(
        self,
        session: Session,
        user_id: str,
        meeting_id: UUID | None,
        title: str,
        started_at: datetime,
    ) -> Meeting:
        """Create or idempotently return one caller-owned meeting.

        Args:
            session: Request transaction controlled by the HTTP adapter.
            user_id: Authenticated local owner id.
            meeting_id: Optional client-generated stable UUID.
            title: Initial display title.
            started_at: UTC-aware device capture start.

        Returns:
            Newly persisted or idempotently existing meeting.

        Raises:
            MeetingConflictError: If another owner already uses the requested id.
        """
        identifier = str(meeting_id or uuid4())
        existing = session.get(Meeting, identifier)
        if existing is not None:
            if existing.user_id == user_id:
                return existing
            raise MeetingConflictError("The meeting id is already in use.")
        now = self._clock.now()
        meeting = Meeting(
            id=identifier,
            user_id=user_id,
            title=title.strip(),
            started_at=_utc(started_at),
            duration_ms=0,
            revision=1,
            transcript="",
            transcript_revision=0,
            summary_revision=0,
            summary_stale=False,
            transcript_status=_PENDING,
            summary_status=_IDLE,
            created_at=now,
            updated_at=now,
        )
        session.add(meeting)
        session.flush()
        return meeting

    def get_meeting(self, session: Session, user_id: str, meeting_id: UUID) -> Meeting:
        """Resolve one meeting within the caller's ownership scope.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Requested meeting UUID.

        Returns:
            Owned meeting record.

        Raises:
            MeetingNotFoundError: If absent or owned by a different user.
        """
        return self._owned_meeting(session, user_id, str(meeting_id))

    def list_meetings(
        self, session: Session, user_id: str, cursor: str | None, limit: int = 50
    ) -> tuple[list[Meeting], str | None]:
        """List owned meetings in stable descending capture order.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            cursor: Opaque prior-page cursor, if any.
            limit: Maximum result count, bounded by this method.

        Returns:
            Page records and an opaque next cursor when another page exists.

        Raises:
            MeetingConflictError: If the supplied cursor is invalid.
        """
        page_size = min(max(limit, 1), 100)
        statement = select(Meeting).where(Meeting.user_id == user_id)
        if cursor is not None:
            before_started, before_id = self._decode_cursor(cursor)
            statement = statement.where(
                or_(
                    Meeting.started_at < before_started,
                    and_(Meeting.started_at == before_started, Meeting.id < before_id),
                )
            )
        records = list(
            session.scalars(
                statement.order_by(Meeting.started_at.desc(), Meeting.id.desc()).limit(
                    page_size + 1
                )
            )
        )
        has_more = len(records) > page_size
        items = records[:page_size]
        next_cursor = self._encode_cursor(items[-1]) if has_more and items else None
        return items, next_cursor

    def patch_metadata(
        self,
        session: Session,
        user_id: str,
        meeting_id: UUID,
        expected_revision: int,
        title: str | None,
        started_at: datetime | None,
        ended_at: datetime | None,
    ) -> Meeting:
        """Conditionally update meeting metadata using its aggregate revision.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Target meeting UUID.
            expected_revision: If-Match revision supplied by the caller.
            title: Optional replacement title.
            started_at: Optional replacement start time.
            ended_at: Optional replacement end time.

        Returns:
            Updated owned meeting.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
            MeetingRevisionConflictError: If another mutation won the race.
        """
        current = self._owned_meeting(session, user_id, str(meeting_id))
        values: dict[str, object] = {
            "revision": Meeting.revision + 1,
            "updated_at": self._clock.now(),
        }
        if title is not None:
            values["title"] = title.strip()
        if started_at is not None:
            values["started_at"] = _utc(started_at)
        if ended_at is not None:
            values["ended_at"] = _utc(ended_at)
        if len(values) == 2:
            return current
        result = session.execute(
            update(Meeting)
            .where(
                Meeting.id == current.id,
                Meeting.user_id == user_id,
                Meeting.revision == expected_revision,
            )
            .values(**values)
        )
        if _rowcount(result) != 1:
            raise MeetingRevisionConflictError()
        session.flush()
        return self._owned_meeting(session, user_id, current.id)

    def patch_transcript(
        self, session: Session, user_id: str, meeting_id: UUID, expected_revision: int, text: str
    ) -> Meeting:
        """Replace transcript text without allowing workers to overwrite newer edits.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Target meeting UUID.
            expected_revision: Transcript If-Match revision.
            text: Full caller-authored replacement transcript.

        Returns:
            Updated owned meeting.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
            MeetingRevisionConflictError: If the transcript changed first.
        """
        current = self._owned_meeting(session, user_id, str(meeting_id))
        result = session.execute(
            update(Meeting)
            .where(
                Meeting.id == current.id,
                Meeting.user_id == user_id,
                Meeting.transcript_revision == expected_revision,
            )
            .values(
                transcript=text,
                transcript_revision=Meeting.transcript_revision + 1,
                revision=Meeting.revision + 1,
                summary_stale=Meeting.summary.is_not(None),
                updated_at=self._clock.now(),
            )
        )
        if _rowcount(result) != 1:
            raise MeetingRevisionConflictError()
        session.flush()
        return self._owned_meeting(session, user_id, current.id)

    def patch_summary(
        self, session: Session, user_id: str, meeting_id: UUID, expected_revision: int, text: str
    ) -> Meeting:
        """Replace summary text with a dedicated conditional revision update.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Target meeting UUID.
            expected_revision: Summary If-Match revision.
            text: Full caller-authored replacement summary.

        Returns:
            Updated owned meeting.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
            MeetingRevisionConflictError: If the summary changed first.
        """
        current = self._owned_meeting(session, user_id, str(meeting_id))
        result = session.execute(
            update(Meeting)
            .where(
                Meeting.id == current.id,
                Meeting.user_id == user_id,
                Meeting.summary_revision == expected_revision,
            )
            .values(
                summary=text,
                summary_revision=Meeting.summary_revision + 1,
                summary_source_revision=Meeting.transcript_revision,
                summary_stale=False,
                summary_status=_COMPLETE,
                summary_error=None,
                summary_retry_at=None,
                summary_lease_id=None,
                summary_lease_expires_at=None,
                revision=Meeting.revision + 1,
                updated_at=self._clock.now(),
            )
        )
        if _rowcount(result) != 1:
            raise MeetingRevisionConflictError()
        session.flush()
        return self._owned_meeting(session, user_id, current.id)

    def resume_meeting(self, session: Session, user_id: str, meeting_id: UUID) -> Meeting:
        """Reopen the same meeting so a device can append new segments.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Meeting UUID to resume.

        Returns:
            Reopened meeting preserving prior transcript edits and summary text.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
        """
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        meeting.ended_at = None
        meeting.transcript_status = _PENDING
        meeting.summary_status = _IDLE
        meeting.summary_stale = meeting.summary is not None
        meeting.error = None
        meeting.summary_error = None
        meeting.revision += 1
        meeting.updated_at = self._clock.now()
        session.flush()
        return meeting

    def finish_meeting(self, session: Session, user_id: str, meeting_id: UUID) -> Meeting:
        """Finish capture and queue summary work only after active segments drain.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Meeting UUID to finish.

        Returns:
            Finished meeting whose transcript remains immediately readable.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
        """
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        active_count = self._active_segment_count(session, meeting.id)
        failed_count = self._failed_segment_count(session, meeting.id)
        now = self._clock.now()
        values: dict[str, object] = {
            "ended_at": now,
            "transcript_status": _PENDING
            if active_count
            else (_FAILED if failed_count else _COMPLETE),
            "revision": Meeting.revision + 1,
            "updated_at": now,
        }
        if not active_count:
            values.update(
                summary_status=_PENDING,
                summary_attempts=0,
                summary_retry_at=None,
                summary_error=None,
            )
        session.execute(
            update(Meeting)
            .where(Meeting.id == meeting.id, Meeting.user_id == user_id)
            .values(**values)
        )
        session.flush()
        self._wake.set()
        return self._owned_meeting(session, user_id, meeting.id)

    def regenerate_summary(self, session: Session, user_id: str, meeting_id: UUID) -> Meeting:
        """Queue an explicit summary regeneration from the current transcript.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Target meeting UUID.

        Returns:
            Meeting with a pending summary job.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
            MeetingConflictError: If capture is still open or segments remain active.
        """
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        if meeting.ended_at is None or self._active_segment_count(session, meeting.id):
            raise MeetingConflictError("Finish processing audio before generating a summary.")
        meeting.summary_status = _PENDING
        meeting.summary_attempts = 0
        meeting.summary_retry_at = None
        meeting.summary_error = None
        meeting.summary_lease_id = None
        meeting.summary_lease_expires_at = None
        meeting.revision += 1
        meeting.updated_at = self._clock.now()
        session.flush()
        self._wake.set()
        return meeting

    async def upload_segment(
        self,
        session: Session,
        user_id: str,
        meeting_id: UUID,
        segment_id: UUID,
        reader: AsyncByteReader,
        filename: str,
        content_type: str,
        duration_ms: int,
        language: str | None,
    ) -> MeetingSegment:
        """Stream one bounded segment to private storage and enqueue it idempotently.

        Args:
            session: Request transaction used only before and after stream storage.
            user_id: Authenticated local owner id.
            meeting_id: Target resumed or active meeting UUID.
            segment_id: Stable client-generated idempotency UUID.
            reader: Multipart reader consumed in fixed-size chunks.
            filename: Untrusted presentation filename, reduced to a basename.
            content_type: Accepted audio media type.
            duration_ms: Device-measured non-negative segment duration.
            language: Optional language hint forwarded to transcription.

        Returns:
            Existing idempotent or newly accepted segment record.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
            MeetingConflictError: If closed, malformed, or id conflicts with different data.
            AudioTooLargeError: If bytes exceed the configured segment cap.
            UnsupportedAudioError: If the media type is not accepted audio.
        """
        if not _is_audio_content_type(content_type):
            raise UnsupportedAudioError()
        if duration_ms < 0:
            raise MeetingConflictError("Audio duration must not be negative.")
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        if meeting.ended_at is not None:
            raise MeetingConflictError("Resume the meeting before uploading another segment.")
        safe_filename = Path(filename or "recording").name[:255] or "recording"
        relative_path = Path(user_id) / meeting.id / f"{segment_id}.audio"
        final_path = self._private_path(relative_path)
        temporary_path = self._private_path(Path(".staging") / f"{uuid4()}.part")
        checksum, size_bytes = await self._stream_to_temporary(reader, temporary_path)
        existing = session.get(MeetingSegment, str(segment_id))
        if existing is not None:
            with suppress(FileNotFoundError):
                temporary_path.unlink()
            if (
                existing.meeting_id == meeting.id
                and existing.user_id == user_id
                and existing.checksum == checksum
                and existing.filename == safe_filename
                and existing.content_type == content_type
                and existing.duration_ms == duration_ms
                and existing.language
                == (language.strip()[:32] if language and language.strip() else None)
            ):
                return existing
            raise MeetingConflictError("The segment id is already associated with different audio.")
        try:
            final_path.parent.mkdir(parents=True, exist_ok=True)
            temporary_path.replace(final_path)
            now = self._clock.now()
            segment = MeetingSegment(
                id=str(segment_id),
                meeting_id=meeting.id,
                user_id=user_id,
                storage_path=str(relative_path),
                checksum=checksum,
                filename=safe_filename,
                content_type=content_type,
                language=language.strip()[:32] if language and language.strip() else None,
                duration_ms=duration_ms,
                size_bytes=size_bytes,
                status=_PENDING,
                attempts=0,
                retry_at=None,
                created_at=now,
                updated_at=now,
            )
            session.add(segment)
            session.execute(
                update(Meeting)
                .where(Meeting.id == meeting.id, Meeting.user_id == user_id)
                .values(
                    duration_ms=Meeting.duration_ms + duration_ms,
                    transcript_status=_PENDING,
                    error=None,
                    revision=Meeting.revision + 1,
                    updated_at=now,
                )
            )
            session.flush()
        except Exception:
            with suppress(FileNotFoundError):
                final_path.unlink()
            raise
        self._wake.set()
        return segment

    def retry_segment(
        self, session: Session, user_id: str, meeting_id: UUID, segment_id: UUID
    ) -> MeetingSegment:
        """Requeue one failed owned segment with a conditional state transition.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Parent meeting UUID.
            segment_id: Failed segment UUID.

        Returns:
            Requeued segment.

        Raises:
            MeetingNotFoundError: If parent or segment is absent or foreign-owned.
            MeetingConflictError: If the segment is not failed.
        """
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        result = session.execute(
            update(MeetingSegment)
            .where(
                MeetingSegment.id == str(segment_id),
                MeetingSegment.meeting_id == meeting.id,
                MeetingSegment.user_id == user_id,
                MeetingSegment.status == _FAILED,
            )
            .values(
                status=_PENDING,
                attempts=0,
                retry_at=None,
                error=None,
                lease_id=None,
                lease_expires_at=None,
                updated_at=self._clock.now(),
            )
        )
        if _rowcount(result) != 1:
            segment = session.get(MeetingSegment, str(segment_id))
            if segment is None or segment.meeting_id != meeting.id or segment.user_id != user_id:
                raise MeetingNotFoundError()
            raise MeetingConflictError("Only failed segments can be retried.")
        meeting.transcript_status = _PENDING
        meeting.error = None
        meeting.revision += 1
        meeting.updated_at = self._clock.now()
        session.flush()
        self._wake.set()
        segment = session.get(MeetingSegment, str(segment_id))
        if segment is None:
            raise MeetingNotFoundError()
        return segment

    def delete_meeting(
        self,
        session: Session,
        user_id: str,
        meeting_id: UUID,
        deleted_at: datetime | None = None,
    ) -> None:
        """Delete an owned meeting, cancel its durable work, and remove private audio.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Target meeting UUID.
            deleted_at: When the deletion happened; None means now. A sync passes the
                other server's time so its tombstone stays comparable.

        Returns:
            None.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
        """
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        paths = list(
            session.scalars(
                select(MeetingSegment.storage_path).where(MeetingSegment.meeting_id == meeting.id)
            )
        )
        record_tombstone(session, user_id, "meeting", meeting.id, deleted_at or self._clock.now())
        session.delete(meeting)
        session.flush()
        leftovers = []
        for relative_path in paths:
            with suppress(ValueError):
                if not self._delete_file(self._private_path(Path(relative_path))):
                    leftovers.append(Path(relative_path).as_posix())
        self._report_leftovers("meeting deletion", leftovers)
        with suppress(OSError):
            (self._audio_root / user_id / meeting.id).rmdir()
        self._wake.set()

    def delete_user_content(self, session: Session, user_id: str) -> None:
        """Delete all owned meeting rows for account removal, leaving files on disk.

        The caller commits first and then calls ``remove_user_audio`` (or ``erase_all_audio``),
        so a file that cannot be deleted never leaves rows pointing at half-deleted audio.

        Args:
            session: Transaction which also owns user-account deletion.
            user_id: Authenticated local owner id being removed.

        Returns:
            None.
        """
        meetings = list(session.scalars(select(Meeting).where(Meeting.user_id == user_id)))
        for meeting in meetings:
            session.delete(meeting)
        session.flush()
        self._wake.set()

    def remove_user_audio(self, user_id: str) -> list[str]:
        """Delete one removed user's private audio after their rows are committed away.

        Args:
            user_id: Local owner id whose rows no longer exist.

        Returns:
            Relative paths still on disk; logged, and retried by the next orphan sweep.
        """
        leftovers = self._remove_tree(self._private_path(Path(user_id)))
        self._report_leftovers("account deletion", leftovers)
        self._wake.set()
        return leftovers

    def erase_all_audio(self) -> list[str]:
        """Remove every private audio file below the storage root, keeping the root itself.

        Only the on-device profile calls this, after its single user's rows are committed away.

        Args:
            None.

        Returns:
            Relative paths still on disk; logged, and retried by the next orphan sweep.
        """
        leftovers: list[str] = []
        if self._audio_root.is_dir():
            for child in self._audio_root.iterdir():
                # Never follow a link out of private storage; remove the link itself instead.
                if child.is_symlink() or not child.is_dir():
                    if not self._delete_file(child):
                        leftovers.append(child.relative_to(self._audio_root).as_posix())
                else:
                    leftovers.extend(self._remove_tree(self._private_path(Path(child.name))))
        self._report_leftovers("local data erase", leftovers)
        self._wake.set()
        return leftovers

    def sweep_orphan_audio(self, grace_seconds: float | None = None) -> list[str]:
        """Delete audio files that no meeting segment row references.

        Runs at startup and before every account or local data deletion, so audio left behind
        by a locked file or an interrupted request is eventually removed.

        Args:
            grace_seconds: Minimum file age; None uses the configured grace period. Files moved
                into place by an upload that has not committed yet are younger than this.

        Returns:
            Relative paths of orphans that still could not be deleted.
        """
        if not self._audio_root.is_dir():
            return []
        grace = self._orphan_grace_seconds if grace_seconds is None else grace_seconds
        with self._transaction() as session:
            stored = session.scalars(select(MeetingSegment.storage_path))
            known = {Path(path).as_posix() for path in stored}
        cutoff = time.time() - grace
        removed = 0
        leftovers: list[str] = []
        for path in sorted(self._audio_root.rglob("*")):
            if path.is_symlink() or not path.is_file():
                continue
            relative = path.relative_to(self._audio_root).as_posix()
            if relative in known:
                continue
            try:
                if path.stat().st_mtime > cutoff:
                    continue
            except FileNotFoundError:
                continue
            if self._delete_file(path):
                removed += 1
            else:
                leftovers.append(relative)
        # Prune emptied folders bottom-up; a non-empty or freshly created one is left alone.
        folders = [
            item for item in self._audio_root.rglob("*") if item.is_dir() and not item.is_symlink()
        ]
        for folder in sorted(folders, key=lambda item: len(item.parts), reverse=True):
            with suppress(OSError):
                if folder.stat().st_mtime <= cutoff:
                    folder.rmdir()
        if removed:
            _LOGGER.info("Removed %d unreferenced meeting audio files.", removed)
        self._report_leftovers("orphan sweep", leftovers)
        return leftovers

    def _delete_file(self, path: Path) -> bool:
        """Delete one file, retrying only while a Windows sharing violation blocks it.

        Args:
            path: File to remove.

        Returns:
            True when the file is gone, False when it is still on disk.
        """
        return self._retry_removal(os.unlink, str(path))

    def _remove_tree(self, path: Path) -> list[str]:
        """Delete a private folder tree, retrying files locked by a sharing violation.

        Args:
            path: Folder below the private audio root.

        Returns:
            Relative paths of files that are still on disk afterwards.
        """

        def retry_locked(
            function: Callable[..., object], target: str, error: BaseException
        ) -> None:
            if function in (os.unlink, os.remove, os.rmdir) and _is_sharing_violation(error):
                self._retry_removal(function, target)

        if not path.exists():
            return []
        shutil.rmtree(path, onexc=retry_locked)
        if not path.exists():
            return []
        return sorted(
            item.relative_to(self._audio_root).as_posix()
            for item in path.rglob("*")
            if item.is_file() or item.is_symlink()
        )

    def _retry_removal(self, remove: Callable[[str], object], target: str) -> bool:
        """Run one removal call, retrying a bounded number of times on sharing violations.

        Args:
            remove: ``os.unlink``, ``os.remove`` or ``os.rmdir``.
            target: Path to remove.

        Returns:
            True when the path is gone, False when it is still there.
        """
        for attempt in range(self._delete_retry_attempts + 1):
            try:
                remove(target)
                return True
            except FileNotFoundError:
                return True
            except OSError as error:
                if not _is_sharing_violation(error) or attempt == self._delete_retry_attempts:
                    return False
                time.sleep(self._delete_retry_delay_seconds)
        return False

    def _report_leftovers(self, context: str, leftovers: list[str]) -> None:
        """Log audio that is still on disk after a deletion, by relative storage path.

        Args:
            context: Which operation left the files.
            leftovers: Relative paths below the private audio root.

        Returns:
            None.
        """
        if leftovers:
            _LOGGER.warning(
                "Audio still on disk after %s; the next orphan sweep retries it: %s",
                context,
                ", ".join(leftovers),
            )

    def transformation_source(
        self, session: Session, user_id: str, resource_type: str, resource_id: str
    ) -> tuple[str, int]:
        """Resolve an owned meeting text artifact for an explicit transformation action.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            resource_type: ``meetingTranscript`` or ``meetingSummary`` source kind.
            resource_id: Meeting UUID string.

        Returns:
            Source text and its dedicated revision.

        Raises:
            MeetingNotFoundError: If the owned meeting or requested summary is absent.
            MeetingConflictError: If the resource type is unsupported.
        """
        try:
            meeting_id = UUID(resource_id)
        except ValueError as error:
            raise MeetingNotFoundError() from error
        meeting = self.get_meeting(session, user_id, meeting_id)
        if resource_type == "meetingTranscript":
            return meeting.transcript, meeting.transcript_revision
        if resource_type == "meetingSummary" and meeting.summary is not None:
            return meeting.summary, meeting.summary_revision
        if resource_type == "meetingSummary":
            raise MeetingNotFoundError()
        raise MeetingConflictError("The requested meeting transformation source is unsupported.")

    def question_source(
        self, session: Session, user_id: str, meeting_id: UUID
    ) -> MeetingQuestionSource:
        """Snapshot one owned meeting's complete saved text for an ephemeral question.

        Args:
            session: Short transaction used to read the authoritative meeting row.
            user_id: Authenticated meeting owner.
            meeting_id: Target meeting identifier.

        Returns:
            Immutable complete transcript and summary snapshot with revisions.

        Raises:
            MeetingNotFoundError: If the meeting is absent or belongs to another owner.
        """
        meeting = self.get_meeting(session, user_id, meeting_id)
        return MeetingQuestionSource(
            transcript=meeting.transcript,
            transcript_revision=meeting.transcript_revision,
            transcript_status=meeting.transcript_status,
            summary=meeting.summary,
            summary_revision=meeting.summary_revision,
            summary_source_revision=meeting.summary_source_revision,
            summary_status=meeting.summary_status,
            summary_stale=meeting.summary_stale,
        )

    def get_audio(
        self, session: Session, user_id: str, meeting_id: UUID, segment_id: UUID | None = None
    ) -> StoredAudio:
        """Resolve one stored private audio file for an authenticated range adapter.

        Args:
            session: Request transaction.
            user_id: Authenticated local owner id.
            meeting_id: Parent meeting UUID.
            segment_id: Explicit segment UUID, or the sole segment when omitted.

        Returns:
            Metadata for one private on-disk audio file.

        Raises:
            MeetingNotFoundError: If meeting, audio, or requested segment is unavailable.
            MeetingConflictError: If a segment id is required to disambiguate audio.
        """
        meeting = self._owned_meeting(session, user_id, str(meeting_id))
        statement = select(MeetingSegment).where(
            MeetingSegment.meeting_id == meeting.id,
            MeetingSegment.user_id == user_id,
        )
        if segment_id is not None:
            statement = statement.where(MeetingSegment.id == str(segment_id))
        else:
            records = list(session.scalars(statement.order_by(MeetingSegment.created_at)))
            if len(records) != 1:
                if not records:
                    raise MeetingNotFoundError()
                raise MeetingConflictError("Select a segment id to download meeting audio.")
            segment = records[0]
            return self._stored_audio(segment)
        requested_segment = session.scalar(statement)
        if requested_segment is None:
            raise MeetingNotFoundError()
        return self._stored_audio(requested_segment)

    def response_data(self, session: Session, meeting: Meeting) -> dict[str, object]:
        """Build the flattened lower-camel response representation for one meeting.

        Args:
            session: Request transaction used to determine stored-audio presence.
            meeting: Owned meeting record to present.

        Returns:
            Lower-camel response values accepted by ``MeetingResponse``.
        """
        has_audio = (
            session.scalar(
                select(MeetingSegment.id).where(MeetingSegment.meeting_id == meeting.id).limit(1)
            )
            is not None
        )
        return {
            "id": meeting.id,
            "title": meeting.title,
            "startedAt": meeting.started_at,
            "endedAt": meeting.ended_at,
            "durationMs": meeting.duration_ms,
            "revision": meeting.revision,
            "transcript": meeting.transcript,
            "transcriptRevision": meeting.transcript_revision,
            "summary": meeting.summary,
            "summaryRevision": meeting.summary_revision,
            "summarySourceRevision": meeting.summary_source_revision,
            "summaryStale": meeting.summary_stale,
            "transcriptStatus": meeting.transcript_status,
            "summaryStatus": meeting.summary_status,
            "error": meeting.error or meeting.summary_error,
            "hasAudio": has_audio,
        }

    def transcript_data(self, meeting: Meeting) -> dict[str, object]:
        """Build independently versioned transcript response values.

        Args:
            meeting: Owned meeting record.

        Returns:
            Lower-camel transcript representation.
        """
        return {
            "text": meeting.transcript,
            "revision": meeting.transcript_revision,
            "status": meeting.transcript_status,
            "error": meeting.error,
        }

    def summary_data(self, meeting: Meeting) -> dict[str, object]:
        """Build independently versioned summary response values.

        Args:
            meeting: Owned meeting record.

        Returns:
            Lower-camel summary representation.
        """
        return {
            "text": meeting.summary,
            "revision": meeting.summary_revision,
            "sourceRevision": meeting.summary_source_revision,
            "stale": meeting.summary_stale,
            "status": meeting.summary_status,
            "error": meeting.summary_error,
        }

    @contextmanager
    def _transaction(self) -> Iterator[Session]:
        """Open a short worker-owned transaction and reliably close its generator.

        Args:
            None.

        Yields:
            A committing SQLAlchemy session for durable state transitions.
        """
        sessions = cast("Generator[Session, None, None]", self._database.session())
        session = next(sessions)
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
        finally:
            sessions.close()

    async def _run_worker(self) -> None:
        """Lease and process one durable unit at a time until shutdown.

        Args:
            None.

        Returns:
            None.
        """
        while not self._stopping.is_set():
            # SQLite and file I/O stay off the event loop so request commits are not blocked.
            await asyncio.to_thread(self._recover_expired_leases)
            segment = await asyncio.to_thread(self._claim_segment)
            if segment is not None:
                await self._process_segment(segment)
                continue
            summary = await asyncio.to_thread(self._claim_summary)
            if summary is not None:
                await self._process_summary(summary)
                continue
            self._wake.clear()
            with suppress(TimeoutError):
                await asyncio.wait_for(self._wake.wait(), timeout=1.0)

    def _recover_expired_leases(self) -> None:
        """Return expired work leases to durable pending or failed terminal states.

        Args:
            None.

        Returns:
            None.
        """
        now = self._clock.now()
        with self._transaction() as session:
            session.execute(
                update(MeetingSegment)
                .where(
                    MeetingSegment.status == _RUNNING,
                    MeetingSegment.lease_expires_at.is_not(None),
                    MeetingSegment.lease_expires_at < now,
                )
                .values(
                    status=case_status(cast("ColumnElement[int]", MeetingSegment.attempts)),
                    retry_at=now + timedelta(seconds=10),
                    error="Processing timed out; retrying.",
                    lease_id=None,
                    lease_expires_at=None,
                    updated_at=now,
                )
            )
            session.execute(
                update(Meeting)
                .where(
                    Meeting.summary_status == _RUNNING,
                    Meeting.summary_lease_expires_at.is_not(None),
                    Meeting.summary_lease_expires_at < now,
                )
                .values(
                    summary_status=case_status(
                        cast("ColumnElement[int]", Meeting.summary_attempts)
                    ),
                    summary_retry_at=now + timedelta(seconds=10),
                    summary_error="Summary processing timed out; retrying.",
                    summary_lease_id=None,
                    summary_lease_expires_at=None,
                    updated_at=now,
                )
            )
            for meeting in session.scalars(
                select(Meeting).where(
                    Meeting.ended_at.is_not(None),
                    Meeting.transcript_status.in_((_PENDING, _RUNNING)),
                )
            ):
                self._queue_summary_if_drained(session, meeting, now)

    def _claim_segment(self) -> _ClaimedSegment | None:
        """Atomically lease one queued or expired segment before gateway work.

        Args:
            None.

        Returns:
            Immutable segment details after a committed lease, or None when idle.
        """
        now = self._clock.now()
        lease_id = str(uuid4())
        with self._transaction() as session:
            candidate = session.scalar(
                select(MeetingSegment)
                .join(Meeting)
                .where(
                    MeetingSegment.status == _PENDING,
                    MeetingSegment.attempts < _MAX_ATTEMPTS,
                    or_(MeetingSegment.retry_at.is_(None), MeetingSegment.retry_at <= now),
                )
                .order_by(MeetingSegment.created_at)
                .limit(1)
            )
            if candidate is None:
                return None
            result = session.execute(
                update(MeetingSegment)
                .where(
                    MeetingSegment.id == candidate.id,
                    MeetingSegment.status == _PENDING,
                    MeetingSegment.attempts < _MAX_ATTEMPTS,
                    or_(MeetingSegment.retry_at.is_(None), MeetingSegment.retry_at <= now),
                )
                .values(
                    status=_RUNNING,
                    attempts=MeetingSegment.attempts + 1,
                    retry_at=None,
                    lease_id=lease_id,
                    lease_expires_at=now + _LEASE_DURATION,
                    error=None,
                    updated_at=now,
                )
            )
            if _rowcount(result) != 1:
                return None
            session.execute(
                update(Meeting)
                .where(Meeting.id == candidate.meeting_id)
                .values(transcript_status=_RUNNING, error=None, updated_at=now)
            )
            return _ClaimedSegment(
                id=candidate.id,
                lease_id=lease_id,
                storage_path=candidate.storage_path,
                filename=candidate.filename,
                content_type=candidate.content_type,
                language=candidate.language,
            )

    async def _process_segment(self, claimed: _ClaimedSegment) -> None:
        """Run one transcription outside database transactions and persist safely.

        Args:
            claimed: Previously committed segment lease.

        Returns:
            None.
        """
        try:
            audio = await asyncio.to_thread(
                self._private_path(Path(claimed.storage_path)).read_bytes
            )
        except FileNotFoundError:
            # Deleting the meeting or account removes the row and then the file; only a
            # segment that still exists has really lost its audio.
            if await asyncio.to_thread(self._segment_still_leased, claimed):
                await asyncio.to_thread(self._fail_segment, claimed)
            return
        except Exception:
            await asyncio.to_thread(self._fail_segment, claimed)
            return
        try:
            text = await self._inference.transcribe(
                audio,
                claimed.filename,
                claimed.content_type,
                claimed.language,
                timeout_seconds=self._inference_timeout_seconds,
            )
        except Exception:
            await asyncio.to_thread(self._fail_segment, claimed)
            return
        if not await asyncio.to_thread(self._segment_still_leased, claimed):
            return
        # _complete_segment re-checks the lease inside its own transaction before writing.
        await asyncio.to_thread(self._complete_segment, claimed, text.strip())

    def _segment_still_leased(self, claimed: _ClaimedSegment) -> bool:
        """Report whether a claimed segment still exists under the same running lease.

        Args:
            claimed: Lease taken by this worker.

        Returns:
            False once the segment, its meeting or its account was deleted or re-leased.
        """
        with self._transaction() as session:
            return (
                session.scalar(
                    select(MeetingSegment.id).where(
                        MeetingSegment.id == claimed.id,
                        MeetingSegment.status == _RUNNING,
                        MeetingSegment.lease_id == claimed.lease_id,
                    )
                )
                is not None
            )

    def _complete_segment(self, claimed: _ClaimedSegment, text: str) -> None:
        """Append transcription using revision-conditional writes that retain edits.

        Args:
            claimed: Matching committed processing lease.
            text: New raw transcription with no automatic refinement stage.

        Returns:
            None.
        """
        now = self._clock.now()
        with self._transaction() as session:
            segment = session.scalar(
                select(MeetingSegment).where(
                    MeetingSegment.id == claimed.id,
                    MeetingSegment.status == _RUNNING,
                    MeetingSegment.lease_id == claimed.lease_id,
                )
            )
            if segment is None:
                return
            meeting = session.get(Meeting, segment.meeting_id)
            if meeting is None:
                return
            expected_revision = meeting.transcript_revision
            appended = _append_transcript(meeting.transcript, text)
            result = session.execute(
                update(Meeting)
                .where(
                    Meeting.id == meeting.id,
                    Meeting.transcript_revision == expected_revision,
                )
                .values(
                    transcript=appended,
                    transcript_revision=Meeting.transcript_revision + 1,
                    transcript_status=self._completed_transcript_status(
                        session, meeting.id, segment.id
                    ),
                    summary_stale=Meeting.summary.is_not(None),
                    revision=Meeting.revision + 1,
                    error=None,
                    updated_at=now,
                )
            )
            if _rowcount(result) != 1:
                return
            segment.status = _COMPLETE
            segment.transcript = text
            segment.error = None
            segment.lease_id = None
            segment.lease_expires_at = None
            segment.updated_at = now
            session.flush()
            # The conditional UPDATE bypasses the loaded ORM row, so reload committed state.
            refreshed = session.get(Meeting, meeting.id, populate_existing=True)
            if (
                refreshed is not None
                and refreshed.ended_at is not None
                and not self._active_segment_count(session, refreshed.id)
            ):
                refreshed.summary_status = _PENDING
                refreshed.summary_attempts = 0
                refreshed.summary_retry_at = None
                refreshed.summary_error = None
                refreshed.updated_at = now
        self._wake.set()

    def _fail_segment(self, claimed: _ClaimedSegment) -> None:
        """Persist a safe failed state without corrupting prior transcript text.

        Args:
            claimed: Matching committed processing lease.

        Returns:
            None.
        """
        now = self._clock.now()
        with self._transaction() as session:
            segment = session.scalar(
                select(MeetingSegment).where(
                    MeetingSegment.id == claimed.id,
                    MeetingSegment.status == _RUNNING,
                    MeetingSegment.lease_id == claimed.lease_id,
                )
            )
            if segment is None:
                return
            segment.status = _FAILED if segment.attempts >= _MAX_ATTEMPTS else _PENDING
            segment.retry_at = (
                None if segment.status == _FAILED else now + timedelta(seconds=2**segment.attempts)
            )
            segment.error = "The transcription provider could not complete this segment."
            segment.lease_id = None
            segment.lease_expires_at = None
            segment.updated_at = now
            meeting = session.get(Meeting, segment.meeting_id)
            if meeting is not None:
                meeting.transcript_status = segment.status
                meeting.error = segment.error
                meeting.updated_at = now
                self._queue_summary_if_drained(session, meeting, now)
        self._wake.set()

    def _claim_summary(self) -> _ClaimedSummary | None:
        """Atomically lease one eligible finished-meeting summary job.

        Args:
            None.

        Returns:
            Immutable summary input after a committed lease, or None when idle.
        """
        now = self._clock.now()
        lease_id = str(uuid4())
        with self._transaction() as session:
            meeting = session.scalar(
                select(Meeting)
                .where(
                    Meeting.ended_at.is_not(None),
                    Meeting.summary_status == _PENDING,
                    Meeting.summary_attempts < _MAX_ATTEMPTS,
                    or_(Meeting.summary_retry_at.is_(None), Meeting.summary_retry_at <= now),
                )
                .order_by(Meeting.updated_at)
                .limit(1)
            )
            if meeting is None or self._active_segment_count(session, meeting.id):
                return None
            result = session.execute(
                update(Meeting)
                .where(
                    Meeting.id == meeting.id,
                    Meeting.summary_status == _PENDING,
                    Meeting.summary_attempts < _MAX_ATTEMPTS,
                    or_(Meeting.summary_retry_at.is_(None), Meeting.summary_retry_at <= now),
                )
                .values(
                    summary_status=_RUNNING,
                    summary_attempts=Meeting.summary_attempts + 1,
                    summary_retry_at=None,
                    summary_lease_id=lease_id,
                    summary_lease_expires_at=now + _LEASE_DURATION,
                    summary_error=None,
                    updated_at=now,
                )
            )
            if _rowcount(result) != 1:
                return None
            return _ClaimedSummary(
                meeting.id,
                lease_id,
                meeting.transcript,
                meeting.transcript_revision,
            )

    async def _process_summary(self, claimed: _ClaimedSummary) -> None:
        """Generate one summary outside transactions and guard its source revision.

        Args:
            claimed: Previously committed summary lease and source snapshot.

        Returns:
            None.
        """
        try:
            if self._summarizer is None:
                raise ValueError("the language model is off")
            summary = await self._summarizer.summarize(
                claimed.transcript, timeout_seconds=self._inference_timeout_seconds
            )
        except Exception:
            await asyncio.to_thread(self._fail_summary, claimed)
            return
        await asyncio.to_thread(self._complete_summary, claimed, summary.text)

    def _complete_summary(self, claimed: _ClaimedSummary, text: str) -> None:
        """Persist a summary only when the lease and source revision still match.

        Args:
            claimed: Matching committed summary lease and source version.
            text: Gateway-generated summary text.

        Returns:
            None.
        """
        now = self._clock.now()
        with self._transaction() as session:
            result = session.execute(
                update(Meeting)
                .where(
                    Meeting.id == claimed.id,
                    Meeting.summary_status == _RUNNING,
                    Meeting.summary_lease_id == claimed.lease_id,
                    Meeting.transcript_revision == claimed.transcript_revision,
                )
                .values(
                    summary=text,
                    summary_revision=Meeting.summary_revision + 1,
                    summary_source_revision=claimed.transcript_revision,
                    summary_stale=False,
                    summary_status=_COMPLETE,
                    summary_error=None,
                    summary_lease_id=None,
                    summary_lease_expires_at=None,
                    revision=Meeting.revision + 1,
                    updated_at=now,
                )
            )
            if _rowcount(result) == 1:
                return
            meeting = session.get(Meeting, claimed.id)
            if meeting is not None and meeting.summary_lease_id == claimed.lease_id:
                meeting.summary_status = _PENDING
                meeting.summary_lease_id = None
                meeting.summary_lease_expires_at = None
                meeting.summary_stale = True
                meeting.updated_at = now
        self._wake.set()

    def _fail_summary(self, claimed: _ClaimedSummary) -> None:
        """Record an independent summary failure without failing the transcript.

        Args:
            claimed: Matching committed summary lease.

        Returns:
            None.
        """
        now = self._clock.now()
        with self._transaction() as session:
            meeting = session.scalar(
                select(Meeting).where(
                    Meeting.id == claimed.id,
                    Meeting.summary_status == _RUNNING,
                    Meeting.summary_lease_id == claimed.lease_id,
                )
            )
            if meeting is None:
                return
            meeting.summary_status = (
                _FAILED if meeting.summary_attempts >= _MAX_ATTEMPTS else _PENDING
            )
            meeting.summary_retry_at = (
                None
                if meeting.summary_status == _FAILED
                else now + timedelta(seconds=2**meeting.summary_attempts)
            )
            meeting.summary_error = "The summary provider could not complete this meeting."
            meeting.summary_lease_id = None
            meeting.summary_lease_expires_at = None
            meeting.updated_at = now
        self._wake.set()

    def _owned_meeting(self, session: Session, user_id: str, meeting_id: str) -> Meeting:
        """Resolve an owned meeting without revealing foreign record existence.

        Args:
            session: Database session to query.
            user_id: Authenticated local owner id.
            meeting_id: Target meeting id string.

        Returns:
            Owned meeting record.

        Raises:
            MeetingNotFoundError: If absent or foreign-owned.
        """
        meeting = session.scalar(
            select(Meeting)
            .where(Meeting.id == meeting_id, Meeting.user_id == user_id)
            .execution_options(populate_existing=True)
        )
        if meeting is None:
            raise MeetingNotFoundError()
        return meeting

    def _queue_summary_if_drained(self, session: Session, meeting: Meeting, now: datetime) -> None:
        """Queue a summary when finished capture has no remaining active segments.

        Args:
            session: Current transaction containing recent segment state.
            meeting: Finished meeting to inspect and possibly update.
            now: Timestamp for any queued state transition.

        Returns:
            None.
        """
        if meeting.ended_at is None or self._active_segment_count(session, meeting.id):
            return
        meeting.transcript_status = (
            _FAILED if self._failed_segment_count(session, meeting.id) else _COMPLETE
        )
        if meeting.summary_status == _IDLE:
            meeting.summary_status = _PENDING
            meeting.summary_attempts = 0
            meeting.summary_retry_at = None
            meeting.summary_error = None
            meeting.updated_at = now

    def _active_segment_count(self, session: Session, meeting_id: str) -> int:
        """Count queued or leased segments for one meeting.

        Args:
            session: Database session to query.
            meeting_id: Parent meeting id.

        Returns:
            Count of pending or running segments.
        """
        return int(
            session.scalar(
                select(func.count())
                .select_from(MeetingSegment)
                .where(
                    MeetingSegment.meeting_id == meeting_id,
                    MeetingSegment.status.in_(_ACTIVE_SEGMENT_STATUSES),
                )
            )
            or 0
        )

    def _failed_segment_count(self, session: Session, meeting_id: str) -> int:
        """Count terminal failed segments for one meeting.

        Args:
            session: Database session to query.
            meeting_id: Parent meeting id.

        Returns:
            Count of failed segments.
        """
        return int(
            session.scalar(
                select(func.count())
                .select_from(MeetingSegment)
                .where(MeetingSegment.meeting_id == meeting_id, MeetingSegment.status == _FAILED)
            )
            or 0
        )

    def _completed_transcript_status(
        self, session: Session, meeting_id: str, completing_segment_id: str
    ) -> str:
        """Determine post-completion status while excluding the current running segment.

        Args:
            session: Current transaction containing the completing segment.
            meeting_id: Parent meeting id.
            completing_segment_id: Segment transitioning from running to complete.

        Returns:
            Pending, running, complete, or failed transcript status.
        """
        remaining = int(
            session.scalar(
                select(func.count())
                .select_from(MeetingSegment)
                .where(
                    MeetingSegment.meeting_id == meeting_id,
                    MeetingSegment.id != completing_segment_id,
                    MeetingSegment.status.in_(_ACTIVE_SEGMENT_STATUSES),
                )
            )
            or 0
        )
        if remaining:
            return _PENDING
        return _FAILED if self._failed_segment_count(session, meeting_id) else _COMPLETE

    def _stream_path(self, path: Path) -> Path:
        """Ensure a temporary path remains private and create its parent directory.

        Args:
            path: Relative path below the configured audio root.

        Returns:
            Resolved safe private path.
        """
        result = self._private_path(path)
        result.parent.mkdir(parents=True, exist_ok=True)
        return result

    async def _stream_to_temporary(self, reader: AsyncByteReader, path: Path) -> tuple[str, int]:
        """Bound stream input to disk while calculating an idempotency checksum.

        Args:
            reader: Multipart reader yielding byte chunks.
            path: Safe temporary private file path.

        Returns:
            SHA-256 checksum and total accepted byte length.

        Raises:
            AudioTooLargeError: If input crosses the configured strict size cap.
        """
        target = self._stream_path(path)
        digest = hashlib.sha256()
        total = 0
        try:
            with target.open("xb") as handle:
                while True:
                    chunk = await reader.read(_STREAM_CHUNK_BYTES)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > self._max_segment_bytes:
                        raise AudioTooLargeError()
                    digest.update(chunk)
                    handle.write(chunk)
            return digest.hexdigest(), total
        except Exception:
            with suppress(FileNotFoundError):
                target.unlink()
            raise

    def _private_path(self, relative_path: Path) -> Path:
        """Resolve a relative artifact path and reject traversal outside private storage.

        Args:
            relative_path: Supposed relative storage path.

        Returns:
            Safe resolved path below the configured private root.

        Raises:
            ValueError: If the supplied path escapes the private root.
        """
        path = (self._audio_root / relative_path).resolve()
        if path != self._audio_root and self._audio_root not in path.parents:
            raise ValueError("audio path escapes private storage")
        return path

    def _stored_audio(self, segment: MeetingSegment) -> StoredAudio:
        """Convert a stored segment into authenticated download metadata.

        Args:
            segment: Owned persisted audio segment.

        Returns:
            Existing private audio file metadata.

        Raises:
            MeetingNotFoundError: If the artifact was removed.
        """
        path = self._private_path(Path(segment.storage_path))
        if not path.is_file():
            raise MeetingNotFoundError()
        return StoredAudio(path, segment.content_type, segment.filename, segment.size_bytes)

    def _encode_cursor(self, meeting: Meeting) -> str:
        """Encode stable ordering fields into an opaque URL-safe page cursor.

        Args:
            meeting: Last meeting of the current page.

        Returns:
            Opaque cursor string.
        """
        value = f"{meeting.started_at.astimezone(UTC).isoformat()}|{meeting.id}".encode()
        return base64.urlsafe_b64encode(value).decode().rstrip("=")

    def _decode_cursor(self, cursor: str) -> tuple[datetime, str]:
        """Decode a previously emitted page cursor.

        Args:
            cursor: Opaque cursor supplied by the client.

        Returns:
            UTC timestamp and id ordering tuple.

        Raises:
            MeetingConflictError: If malformed or non-UTC-safe.
        """
        try:
            padding = "=" * (-len(cursor) % 4)
            decoded = base64.urlsafe_b64decode(cursor + padding).decode()
            timestamp, meeting_id = decoded.rsplit("|", 1)
            parsed = datetime.fromisoformat(timestamp)
            UUID(meeting_id)
            return _utc(parsed), meeting_id
        except (ValueError, UnicodeDecodeError) as error:
            raise MeetingConflictError("The meeting cursor is invalid.") from error


def case_status(attempts: ColumnElement[int]) -> ColumnElement[str]:
    """Return SQL conditional status used when a timed-out lease is recovered.

    Args:
        attempts: SQLAlchemy attempts column expression.

    Returns:
        SQL CASE expression selecting pending before the retry ceiling.
    """
    from sqlalchemy import case

    return case((attempts >= _MAX_ATTEMPTS, _FAILED), else_=_PENDING)


def _rowcount(result: object) -> int:
    """Read an update count across SQLAlchemy's generic result typing boundary.

    Args:
        result: Database execution result from an UPDATE statement.

    Returns:
        A non-negative affected-row count, or -1 when a dialect cannot report it.
    """
    value = getattr(result, "rowcount", -1)
    return value if isinstance(value, int) else -1


def _append_transcript(existing: str, addition: str) -> str:
    """Append a segment with one readable separator while preserving all edits.

    Args:
        existing: Current user-visible transcript, possibly manually edited.
        addition: New direct transcription text.

    Returns:
        Combined transcript without rewriting either prior value.
    """
    if not addition:
        return existing
    if not existing:
        return addition
    return f"{existing.rstrip()}\n\n{addition}"


def _utc(value: datetime) -> datetime:
    """Normalize a required aware timestamp to UTC.

    Args:
        value: Timestamp supplied by a client or persistence record.

    Returns:
        UTC-aware timestamp.

    Raises:
        MeetingConflictError: If the client supplied a naive timestamp.
    """
    if value.tzinfo is None:
        raise MeetingConflictError("Timestamps must include a UTC offset.")
    return value.astimezone(UTC)


def _is_audio_content_type(content_type: str) -> bool:
    """Accept the small audio MIME set supported by the gateway adapter.

    Args:
        content_type: Client-provided media type.

    Returns:
        Whether this media type represents accepted audio input.
    """
    accepted = {
        "application/ogg",
        "audio/aac",
        "audio/flac",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "audio/x-wav",
        "video/webm",
    }
    return content_type.lower().split(";", 1)[0].strip() in accepted
