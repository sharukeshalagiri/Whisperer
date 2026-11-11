"""Strict wire models for exchanging one user's data between two Whisperer servers."""

from __future__ import annotations

# Pydantic resolves field annotations at runtime.
from typing import Literal
from uuid import UUID  # noqa: TC003

from pydantic import AwareDatetime, ConfigDict, Field

from whisperer_api.metrics_schemas import DictationMetricRequest
from whisperer_api.schemas import StrictModel

SyncKind = Literal["note", "dictionary", "meeting"]


class SyncModel(StrictModel):
    """Read and write snapshot fields by their lower-camel names.

    Args:
        None.
    """

    model_config = ConfigDict(extra="forbid", validate_by_alias=True, validate_by_name=False)


class SyncNote(SyncModel):
    """Carry one note with the time it last changed.

    Args:
        id: Stable note UUID shared by both servers.
        title: Display title.
        content: Note content.
        summary: Saved summary or absent value.
        pinned: Pin state.
        createdAt: Creation timestamp.
        updatedAt: Last change timestamp; the newer copy wins.
    """

    id: UUID
    title: str = Field(max_length=200)
    content: str = Field(max_length=100_000)
    summary: str | None = Field(default=None, max_length=100_000)
    pinned: bool = False
    created_at: AwareDatetime = Field(alias="createdAt")
    updated_at: AwareDatetime = Field(alias="updatedAt")


class SyncDictionaryEntry(SyncModel):
    """Carry one dictionary entry, matched across servers by its phrase.

    Args:
        phrase: Recognized phrase, unique per user.
        replacement: Output replacement.
        createdAt: Creation timestamp.
        updatedAt: Last change timestamp; the newer copy wins.
    """

    phrase: str = Field(min_length=1, max_length=200)
    replacement: str = Field(min_length=1, max_length=500)
    created_at: AwareDatetime = Field(alias="createdAt")
    updated_at: AwareDatetime = Field(alias="updatedAt")


class SyncMeeting(SyncModel):
    """Carry the finished text of one meeting. Audio never moves between servers.

    Args:
        id: Stable meeting UUID shared by both servers.
        title: Display title.
        startedAt: Capture start timestamp.
        endedAt: Capture finish timestamp, if known.
        durationMs: Recorded duration.
        transcript: Saved transcript text.
        summary: Saved summary text, if any.
        createdAt: Creation timestamp.
        updatedAt: Last change timestamp; the newer copy wins.
    """

    id: UUID
    title: str = Field(max_length=200)
    started_at: AwareDatetime = Field(alias="startedAt")
    ended_at: AwareDatetime | None = Field(alias="endedAt")
    duration_ms: int = Field(alias="durationMs", ge=0)
    transcript: str = Field(max_length=1_000_000)
    summary: str | None = Field(max_length=1_000_000)
    created_at: AwareDatetime = Field(alias="createdAt")
    updated_at: AwareDatetime = Field(alias="updatedAt")


class SyncMetric(DictationMetricRequest):
    """Carry one immutable dictation metric event under its stable event id.

    Args:
        eventId: Client-stable event UUID.
    """

    event_id: UUID = Field(alias="eventId")


class SyncDeletion(SyncModel):
    """Carry one deletion so the other server removes its older copy too.

    Args:
        kind: Record family.
        key: Note or meeting UUID, or dictionary phrase.
        deletedAt: Deletion timestamp; a copy changed after it survives.
    """

    kind: SyncKind
    key: str = Field(min_length=1, max_length=200)
    deleted_at: AwareDatetime = Field(alias="deletedAt")


class SyncSnapshot(SyncModel):
    """Represent everything of one user that two servers keep in step.

    Args:
        notes: Every note.
        dictionary: Every dictionary entry.
        meetings: Every meeting with no transcription or summary in progress.
        metrics: Every dictation metric event.
        deletions: Every remembered deletion.
    """

    notes: list[SyncNote] = Field(default_factory=list)
    dictionary: list[SyncDictionaryEntry] = Field(default_factory=list)
    meetings: list[SyncMeeting] = Field(default_factory=list)
    metrics: list[SyncMetric] = Field(default_factory=list)
    deletions: list[SyncDeletion] = Field(default_factory=list)


class SyncMergeResponse(SyncModel):
    """Report how many records a merge added, replaced or removed.

    Args:
        changes: Count of records changed on this server.
    """

    changes: int = Field(ge=0)
