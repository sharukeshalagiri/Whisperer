"""Export one user's data as a snapshot and merge a snapshot from another server.

Merging the other side's snapshot into each server makes the two converge: the newer
``updatedAt`` wins, a remembered deletion removes any copy not changed after it, and
dictation metric events are immutable, so they are simply combined. Audio never moves.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import select

from whisperer_api.meeting_models import Meeting
from whisperer_api.metrics import MetricConflictError
from whisperer_api.metrics_models import DictationMetric
from whisperer_api.persistence import DictionaryEntry, Note, SyncTombstone, record_tombstone
from whisperer_api.sync_schemas import (
    SyncDeletion,
    SyncDictionaryEntry,
    SyncMeeting,
    SyncMetric,
    SyncNote,
    SyncSnapshot,
)

if TYPE_CHECKING:
    from datetime import datetime

    from sqlalchemy.orm import Session

    from whisperer_api.meetings import MeetingService
    from whisperer_api.metrics import MetricsService

_IN_PROGRESS = ("pending", "running")


class SyncService:
    """Keep one user's notes, dictionary, meetings and metrics in step with another server.

    Args:
        metrics: Metric service that records events and their aggregates.
        meetings: Meeting service that deletes meetings with their audio.
    """

    def __init__(self, metrics: MetricsService, meetings: MeetingService) -> None:
        """Store the services that own metric and meeting side effects.

        Args:
            metrics: Metric service that records events and their aggregates.
            meetings: Meeting service that deletes meetings with their audio.
        """
        self._metrics = metrics
        self._meetings = meetings

    def export(self, session: Session, user_id: str) -> SyncSnapshot:
        """Read everything of one user that is kept in step.

        Meetings still being transcribed or summarized wait for a later sync.

        Args:
            session: Open database session.
            user_id: Authenticated owner.

        Returns:
            The user's complete snapshot.
        """
        notes = session.scalars(select(Note).where(Note.user_id == user_id))
        entries = session.scalars(select(DictionaryEntry).where(DictionaryEntry.user_id == user_id))
        meetings = session.scalars(
            select(Meeting).where(
                Meeting.user_id == user_id,
                Meeting.transcript_status.not_in(_IN_PROGRESS),
                Meeting.summary_status.not_in(_IN_PROGRESS),
            )
        )
        metrics = session.scalars(select(DictationMetric).where(DictationMetric.user_id == user_id))
        deletions = session.scalars(select(SyncTombstone).where(SyncTombstone.user_id == user_id))
        return SyncSnapshot.model_validate(
            {
                "notes": [
                    {
                        "id": note.id,
                        "title": note.title,
                        "content": note.content,
                        "summary": note.summary,
                        "pinned": note.pinned,
                        "createdAt": note.created_at,
                        "updatedAt": note.updated_at,
                    }
                    for note in notes
                ],
                "dictionary": [
                    {
                        "phrase": entry.phrase,
                        "replacement": entry.replacement,
                        "createdAt": entry.created_at,
                        "updatedAt": entry.updated_at,
                    }
                    for entry in entries
                ],
                "meetings": [
                    {
                        "id": meeting.id,
                        "title": meeting.title,
                        "startedAt": meeting.started_at,
                        "endedAt": meeting.ended_at,
                        "durationMs": meeting.duration_ms,
                        "transcript": meeting.transcript,
                        "summary": meeting.summary,
                        "createdAt": meeting.created_at,
                        "updatedAt": meeting.updated_at,
                    }
                    for meeting in meetings
                ],
                "metrics": [
                    {
                        "eventId": metric.event_id,
                        "createdAt": metric.created_at,
                        "durationMs": metric.duration_ms,
                        "speechDurationMs": metric.speech_duration_ms,
                        "outputWords": metric.output_words,
                        "correctedWords": metric.corrected_words,
                        "dictionaryReplacements": metric.dictionary_replacements,
                        "appName": metric.app_name,
                        "deviceId": metric.device_id,
                        "timezone": metric.timezone,
                    }
                    for metric in metrics
                ],
                "deletions": [
                    {"kind": item.kind, "key": item.key, "deletedAt": item.deleted_at}
                    for item in deletions
                ],
            }
        )

    def merge(self, session: Session, user_id: str, snapshot: SyncSnapshot) -> int:
        """Apply another server's snapshot to one user's data.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner.
            snapshot: The other server's snapshot for the same person.

        Returns:
            Number of records added, replaced or removed here.
        """
        changes = sum(self._delete(session, user_id, item) for item in snapshot.deletions)
        tombstones = {
            (item.kind, item.key): item.deleted_at
            for item in session.scalars(
                select(SyncTombstone).where(SyncTombstone.user_id == user_id)
            )
        }
        for note in snapshot.notes:
            if not self._deleted_after(tombstones, "note", str(note.id), note.updated_at):
                changes += self._merge_note(session, user_id, note)
        for entry in snapshot.dictionary:
            if not self._deleted_after(tombstones, "dictionary", entry.phrase, entry.updated_at):
                changes += self._merge_dictionary(session, user_id, entry)
        for meeting in snapshot.meetings:
            if not self._deleted_after(tombstones, "meeting", str(meeting.id), meeting.updated_at):
                changes += self._merge_meeting(session, user_id, meeting)
        changes += sum(self._merge_metric(session, user_id, metric) for metric in snapshot.metrics)
        session.flush()
        return changes

    @staticmethod
    def _deleted_after(
        tombstones: dict[tuple[str, str], datetime], kind: str, key: str, updated_at: datetime
    ) -> bool:
        """Tell whether a deletion here is at least as new as an incoming copy.

        Args:
            tombstones: Deletions remembered here, by kind and key.
            kind: Record family.
            key: Record id or dictionary phrase.
            updated_at: When the incoming copy last changed.

        Returns:
            True when the incoming copy must stay deleted.
        """
        deleted_at = tombstones.get((kind, key))
        return deleted_at is not None and deleted_at >= updated_at

    def _delete(self, session: Session, user_id: str, item: SyncDeletion) -> int:
        """Remember an incoming deletion and remove the local copy unless it changed later.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner.
            item: Deletion from the other server.

        Returns:
            1 when a local record was removed, otherwise 0.
        """
        record_tombstone(session, user_id, item.kind, item.key, item.deleted_at)
        if item.kind == "dictionary":
            entry = session.scalar(
                select(DictionaryEntry).where(
                    DictionaryEntry.user_id == user_id, DictionaryEntry.phrase == item.key
                )
            )
            if entry is None or entry.updated_at > item.deleted_at:
                return 0
            session.delete(entry)
            return 1
        record = session.get(Note if item.kind == "note" else Meeting, item.key)
        if (
            not isinstance(record, Note | Meeting)
            or record.user_id != user_id
            or record.updated_at > item.deleted_at
        ):
            return 0
        if isinstance(record, Meeting):
            self._meetings.delete_meeting(session, user_id, UUID(record.id), item.deleted_at)
        else:
            session.delete(record)
        return 1

    @staticmethod
    def _merge_note(session: Session, user_id: str, incoming: SyncNote) -> int:
        """Add an incoming note or replace an older local copy.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner.
            incoming: Note from the other server.

        Returns:
            1 when the note was added or replaced, otherwise 0.
        """
        note = session.get(Note, str(incoming.id))
        if note is None:
            note = Note(id=str(incoming.id), user_id=user_id, created_at=incoming.created_at)
            session.add(note)
        elif note.user_id != user_id or note.updated_at >= incoming.updated_at:
            return 0
        else:
            # Transformations compare this revision, so a replaced text must advance it.
            note.revision += 1
        note.title = incoming.title
        note.content = incoming.content
        note.summary = incoming.summary
        note.pinned = incoming.pinned
        note.updated_at = incoming.updated_at
        return 1

    @staticmethod
    def _merge_dictionary(session: Session, user_id: str, incoming: SyncDictionaryEntry) -> int:
        """Add an incoming entry or replace an older local entry with the same phrase.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner.
            incoming: Entry from the other server.

        Returns:
            1 when the entry was added or replaced, otherwise 0.
        """
        entry = session.scalar(
            select(DictionaryEntry).where(
                DictionaryEntry.user_id == user_id, DictionaryEntry.phrase == incoming.phrase
            )
        )
        if entry is None:
            session.add(
                DictionaryEntry(
                    user_id=user_id,
                    phrase=incoming.phrase,
                    replacement=incoming.replacement,
                    created_at=incoming.created_at,
                    updated_at=incoming.updated_at,
                )
            )
            return 1
        if entry.updated_at >= incoming.updated_at:
            return 0
        entry.replacement = incoming.replacement
        entry.updated_at = incoming.updated_at
        return 1

    @staticmethod
    def _merge_meeting(session: Session, user_id: str, incoming: SyncMeeting) -> int:
        """Add an incoming meeting's text or replace an older local copy.

        A local meeting with transcription or summary work in progress is left alone.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner.
            incoming: Meeting from the other server.

        Returns:
            1 when the meeting was added or replaced, otherwise 0.
        """
        meeting = session.get(Meeting, str(incoming.id))
        if meeting is None:
            meeting = Meeting(
                id=str(incoming.id),
                user_id=user_id,
                revision=1,
                transcript_revision=0,
                summary_revision=0,
                created_at=incoming.created_at,
            )
            session.add(meeting)
        elif (
            meeting.user_id != user_id
            or meeting.updated_at >= incoming.updated_at
            or meeting.transcript_status in _IN_PROGRESS
            or meeting.summary_status in _IN_PROGRESS
        ):
            return 0
        else:
            meeting.revision += 1
        if meeting.transcript != incoming.transcript:
            meeting.transcript_revision += 1
        if meeting.summary != incoming.summary:
            meeting.summary_revision += 1
        meeting.title = incoming.title
        meeting.started_at = incoming.started_at
        meeting.ended_at = incoming.ended_at
        meeting.duration_ms = incoming.duration_ms
        meeting.transcript = incoming.transcript
        meeting.summary = incoming.summary
        meeting.summary_source_revision = (
            meeting.transcript_revision if incoming.summary is not None else None
        )
        meeting.summary_stale = False
        meeting.transcript_status = "complete"
        meeting.summary_status = "complete" if incoming.summary is not None else "idle"
        meeting.error = None
        meeting.summary_error = None
        meeting.updated_at = incoming.updated_at
        return 1

    def _merge_metric(self, session: Session, user_id: str, incoming: SyncMetric) -> int:
        """Record an incoming metric event that this server has not counted yet.

        Args:
            session: Open request transaction.
            user_id: Authenticated owner.
            incoming: Immutable event from the other server.

        Returns:
            1 when the event was new here, otherwise 0.
        """
        event_id = str(incoming.event_id)
        known = session.scalar(
            select(DictationMetric.id).where(
                DictationMetric.user_id == user_id, DictationMetric.event_id == event_id
            )
        )
        if known is not None:
            return 0
        try:
            self._metrics.put(session, user_id, event_id, incoming)
        except (MetricConflictError, ValueError):
            return 0
        return 1
