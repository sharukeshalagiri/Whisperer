"""Audio deletion survives Windows file locks and races with the meeting worker.

Locks are simulated by raising the Windows sharing-violation error from ``os.unlink``;
no real file locks or sleeps are used.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from whisperer_api.auth import SystemClock
from whisperer_api.meeting_models import Meeting, MeetingSegment
from whisperer_api.meetings import MeetingService
from whisperer_api.persistence import Database, User

if TYPE_CHECKING:
    from collections.abc import Callable


@dataclass
class RecordingInference:
    """Record transcription calls and optionally run a hook mid-call.

    Args:
        calls: Number of transcription requests received.
        during_call: Optional action run while a transcription is in flight.
    """

    calls: int = 0
    during_call: Callable[[], None] | None = field(default=None)

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float,
    ) -> str:
        """Return a fixed transcript after running the optional hook.

        Args:
            audio: Segment bytes.
            filename: Segment filename.
            content_type: Segment media type.
            language: Optional language hint.
            timeout_seconds: Request bound.

        Returns:
            A fixed transcript.
        """
        del audio, filename, content_type, language, timeout_seconds
        self.calls += 1
        if self.during_call is not None:
            self.during_call()
        return "synthetic transcript"


@dataclass
class Stored:
    """One user with one meeting and one pending segment whose audio is on disk.

    Args:
        service: Meeting service under test.
        database: Its database.
        inference: Fake transcription boundary.
        user_id: Owner id.
        meeting_id: Meeting id.
        audio: Absolute audio file path.
        relative: Audio path relative to the private root.
    """

    service: MeetingService
    database: Database
    inference: RecordingInference
    user_id: str
    meeting_id: str
    audio: Path
    relative: str


@pytest.fixture
def stored(tmp_path: Path) -> Stored:
    """Compose a service with near-zero retry delay and no orphan grace period.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        A user, meeting and pending segment with audio on disk.
    """
    database = Database(f"sqlite:///{tmp_path / 'api.sqlite3'}")
    database.create_schema()
    clock = SystemClock()
    inference = RecordingInference()
    root = tmp_path / "audio"
    service = MeetingService(
        database,
        clock,
        inference,
        root,
        delete_retry_attempts=3,
        delete_retry_delay_seconds=0.0,
        orphan_grace_seconds=0.0,
    )
    now = datetime(2026, 1, 1, tzinfo=UTC)
    with next(database.session()) as session:
        user = User(issuer="https://issuer.example.test", subject="owner", created_at=now)
        session.add(user)
        session.flush()
        meeting = Meeting(
            user_id=user.id, title="Synthetic", started_at=now, created_at=now, updated_at=now
        )
        session.add(meeting)
        session.flush()
        segment_id = str(uuid4())
        relative = Path(user.id) / meeting.id / f"{segment_id}.audio"
        session.add(
            MeetingSegment(
                id=segment_id,
                meeting_id=meeting.id,
                user_id=user.id,
                storage_path=str(relative),
                checksum="0" * 64,
                filename="segment.webm",
                content_type="audio/webm",
                duration_ms=1000,
                size_bytes=15,
                status="pending",
                attempts=0,
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()
        user_id, meeting_id = user.id, meeting.id
    audio = root / relative
    audio.parent.mkdir(parents=True)
    audio.write_bytes(b"synthetic-bytes")
    return Stored(service, database, inference, user_id, meeting_id, audio, relative.as_posix())


def _sharing_violation(path: object) -> PermissionError:
    """Build the error Windows raises while another process holds a file open.

    Args:
        path: File that could not be deleted.

    Returns:
        A PermissionError carrying ``winerror == 32``.
    """
    error = PermissionError(13, "The process cannot access the file", str(path))
    error.winerror = 32  # set explicitly so the test runs on any OS
    return error


def _lock(monkeypatch: pytest.MonkeyPatch, name: str, times: int | None) -> list[int]:
    """Make ``os.unlink`` fail with a sharing violation for one file name.

    Args:
        monkeypatch: Pytest monkeypatch fixture.
        name: File name to lock, matched with or without ``dir_fd``.
        times: How many attempts fail; None keeps the lock until undone.

    Returns:
        A one-item list counting the locked attempts.
    """
    real_unlink = os.unlink
    attempts = [0]

    def unlink(path: Any, *args: Any, **kwargs: Any) -> None:
        if Path(os.fsdecode(path)).name == name and (times is None or attempts[0] < times):
            attempts[0] += 1
            raise _sharing_violation(path)
        real_unlink(path, *args, **kwargs)

    monkeypatch.setattr(os, "unlink", unlink)
    return attempts


def _delete_account(stored: Stored) -> list[str]:
    """Run the account-deletion order the API uses: rows, commit, then files.

    Args:
        stored: Fixture data.

    Returns:
        Audio paths still on disk.
    """
    with next(stored.database.session()) as session:
        stored.service.delete_user_content(session, stored.user_id)
        session.commit()
    return stored.service.remove_user_audio(stored.user_id)


def _row_counts(database: Database) -> tuple[int, int]:
    """Count meetings and segments.

    Args:
        database: Database to inspect.

    Returns:
        Meeting count and segment count.
    """
    with next(database.session()) as session:
        meetings = session.scalar(select(func.count()).select_from(Meeting)) or 0
        segments = session.scalar(select(func.count()).select_from(MeetingSegment)) or 0
        return meetings, segments


def test_transient_lock_is_retried_until_the_file_is_deleted(
    stored: Stored, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A sharing violation that clears within the retry budget leaves nothing behind."""
    attempts = _lock(monkeypatch, stored.audio.name, times=2)

    leftovers = _delete_account(stored)

    assert leftovers == []
    assert attempts[0] == 2
    assert not stored.audio.exists()
    assert _row_counts(stored.database) == (0, 0)


def test_persistent_lock_deletes_rows_reports_the_file_and_the_sweep_removes_it(
    stored: Stored, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Rows go even when audio cannot; the leftover is logged and swept once unlocked."""
    _lock(monkeypatch, stored.audio.name, times=None)

    with caplog.at_level(logging.WARNING, logger="whisperer_api.meetings"):
        leftovers = _delete_account(stored)

    assert leftovers == [stored.relative]
    assert stored.audio.exists()
    assert _row_counts(stored.database) == (0, 0)
    assert stored.relative in caplog.text

    # Still locked: the sweep reports it again instead of claiming success.
    assert stored.service.sweep_orphan_audio() == [stored.relative]

    monkeypatch.undo()
    assert stored.service.sweep_orphan_audio() == []
    assert not stored.audio.exists()


def test_other_errors_are_not_retried(stored: Stored, monkeypatch: pytest.MonkeyPatch) -> None:
    """Only Windows sharing violations are retried; any other failure is reported at once."""
    real_unlink = os.unlink
    attempts = [0]

    def unlink(path: Any, *args: Any, **kwargs: Any) -> None:
        if Path(os.fsdecode(path)).name == stored.audio.name:
            attempts[0] += 1
            raise PermissionError(13, "Access is denied", str(path))
        real_unlink(path, *args, **kwargs)

    monkeypatch.setattr(os, "unlink", unlink)

    assert _delete_account(stored) == [stored.relative]
    # One failure inside rmtree, with no retries.
    assert attempts[0] == 1


def test_sweep_keeps_referenced_audio_and_young_orphans(stored: Stored, tmp_path: Path) -> None:
    """A sweep never touches audio a row references, nor an orphan inside the grace period."""
    young = MeetingService(
        stored.database,
        SystemClock(),
        stored.inference,
        tmp_path / "audio",
        orphan_grace_seconds=3600.0,
    )
    stray = stored.audio.parent / f"{uuid4()}.audio"
    stray.write_bytes(b"uncommitted upload")

    assert young.sweep_orphan_audio() == []
    assert stray.exists()
    assert stored.service.sweep_orphan_audio() == []
    assert not stray.exists()
    assert stored.audio.exists()


async def test_worker_skips_a_segment_deleted_before_it_reads_the_audio(
    stored: Stored, caplog: pytest.LogCaptureFixture
) -> None:
    """A segment whose meeting is deleted mid-read exits quietly and writes nothing."""
    claimed = stored.service._claim_segment()  # drive one worker step directly
    assert claimed is not None
    with next(stored.database.session()) as session:
        stored.service.delete_meeting(session, stored.user_id, UUID(stored.meeting_id))
        session.commit()
    assert not stored.audio.exists()

    with caplog.at_level(logging.WARNING):
        await stored.service._process_segment(claimed)

    assert stored.inference.calls == 0
    assert _row_counts(stored.database) == (0, 0)
    assert caplog.records == []


async def test_worker_does_not_save_results_for_a_segment_deleted_during_transcription(
    stored: Stored, caplog: pytest.LogCaptureFixture
) -> None:
    """A transcript finished after its meeting was deleted is dropped without recreating rows."""
    claimed = stored.service._claim_segment()  # drive one worker step directly
    assert claimed is not None

    def delete_meeting() -> None:
        with next(stored.database.session()) as session:
            stored.service.delete_meeting(session, stored.user_id, UUID(stored.meeting_id))
            session.commit()

    stored.inference.during_call = delete_meeting

    with caplog.at_level(logging.WARNING):
        await stored.service._process_segment(claimed)

    assert stored.inference.calls == 1
    assert _row_counts(stored.database) == (0, 0)
    assert caplog.records == []
