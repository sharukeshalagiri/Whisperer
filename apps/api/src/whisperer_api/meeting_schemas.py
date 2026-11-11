"""Strict lower-camel-case wire models for owner-scoped meetings."""

from __future__ import annotations

# Pydantic resolves field annotations at runtime.
from datetime import datetime  # noqa: TC003
from typing import Literal
from uuid import UUID  # noqa: TC003

from pydantic import BaseModel, ConfigDict, Field, field_validator

MeetingStatus = Literal["pending", "running", "complete", "failed", "idle"]
MAX_MEETING_QUESTION_ANSWER_CHARACTERS = 20_000


class MeetingModel(BaseModel):
    """Reject unknown meeting fields and serialize every field in lower camel case.

    Args:
        None.
    """

    model_config = ConfigDict(extra="forbid", validate_by_alias=True, validate_by_name=False)


class MeetingCreateRequest(MeetingModel):
    """Create one meeting, optionally using a client-generated stable identifier.

    Args:
        id: Optional idempotent client-generated meeting UUID.
        title: Initial display title.
        startedAt: Device capture start timestamp.
    """

    id: UUID | None = None
    title: str = Field(default="", max_length=200)
    started_at: datetime = Field(alias="startedAt")


class MeetingMetadataPatchRequest(MeetingModel):
    """Change editable meeting metadata under the meeting revision precondition.

    Args:
        title: Optional replacement display title.
        startedAt: Optional replacement capture start timestamp.
        endedAt: Optional replacement capture end timestamp.
    """

    title: str | None = Field(default=None, max_length=200)
    started_at: datetime | None = Field(default=None, alias="startedAt")
    ended_at: datetime | None = Field(default=None, alias="endedAt")


class MeetingTextPatchRequest(MeetingModel):
    """Replace a meeting transcript or summary under its dedicated revision.

    Args:
        text: Full replacement user-authored text.
    """

    text: str = Field(max_length=1_000_000)


class MeetingResponse(MeetingModel):
    """Represent the flattened meeting state returned by every meeting operation.

    Args:
        id: Stable meeting UUID.
        title: Display title.
        startedAt: Capture start timestamp.
        endedAt: Optional capture finish timestamp.
        durationMs: Sum of accepted audio segment durations.
        revision: Metadata/state revision used for metadata concurrency.
        transcript: Current editable transcript.
        transcriptRevision: Transcript concurrency revision.
        summary: Current editable or generated summary.
        summaryRevision: Summary concurrency revision.
        summarySourceRevision: Transcript revision used to generate the summary.
        summaryStale: Whether the summary predates the current transcript.
        transcriptStatus: Pending, running, complete, failed, or idle state.
        summaryStatus: Pending, running, complete, failed, or idle state.
        error: Safe latest processing error, if any.
        hasAudio: Whether private stored audio exists.
    """

    id: UUID
    title: str
    started_at: datetime = Field(alias="startedAt")
    ended_at: datetime | None = Field(alias="endedAt")
    duration_ms: int = Field(alias="durationMs", ge=0)
    revision: int = Field(ge=1)
    transcript: str
    transcript_revision: int = Field(alias="transcriptRevision", ge=0)
    summary: str | None
    summary_revision: int = Field(alias="summaryRevision", ge=0)
    summary_source_revision: int | None = Field(alias="summarySourceRevision", ge=0)
    summary_stale: bool = Field(alias="summaryStale")
    transcript_status: MeetingStatus = Field(alias="transcriptStatus")
    summary_status: MeetingStatus = Field(alias="summaryStatus")
    error: str | None
    has_audio: bool = Field(alias="hasAudio")


class MeetingListResponse(MeetingModel):
    """Represent a cursor-paged meeting listing.

    Args:
        items: Meetings in descending capture-start order.
        nextCursor: Cursor for the next page or absent at the end.
    """

    items: list[MeetingResponse]
    next_cursor: str | None = Field(alias="nextCursor")


class MeetingTranscriptResponse(MeetingModel):
    """Represent independently versioned transcript state.

    Args:
        text: Current transcript text.
        revision: Transcript concurrency revision.
        status: Transcript processing state.
        error: Safe latest transcription error, if any.
    """

    text: str
    revision: int = Field(ge=0)
    status: MeetingStatus
    error: str | None


class MeetingSummaryResponse(MeetingModel):
    """Represent independently versioned summary state.

    Args:
        text: Current summary, if one exists.
        revision: Summary concurrency revision.
        sourceRevision: Transcript revision on which this summary is based.
        stale: Whether transcript changes superseded the summary.
        status: Summary processing state.
        error: Safe latest summary error, if any.
    """

    text: str | None
    revision: int = Field(ge=0)
    source_revision: int | None = Field(alias="sourceRevision", ge=0)
    stale: bool
    status: MeetingStatus
    error: str | None


class MeetingQuestionRequest(MeetingModel):
    """Ask one question against an owned meeting's saved text.

    Args:
        question: The user's single question; it never supplies meeting context.
        transcriptRevision: Optional saved transcript revision the caller expects.
        summaryRevision: Optional saved summary revision the caller expects.
    """

    question: str = Field(min_length=1, max_length=2_000)
    transcript_revision: int | None = Field(default=None, alias="transcriptRevision", ge=0)
    summary_revision: int | None = Field(default=None, alias="summaryRevision", ge=0)

    @field_validator("question")
    @classmethod
    def reject_blank_question(cls, value: str) -> str:
        """Reject whitespace-only questions without changing the user's wording.

        Args:
            value: Parsed submitted question.

        Returns:
            Original nonblank question.

        Raises:
            ValueError: If the question contains only whitespace.
        """
        if not value.strip():
            raise ValueError("question must not be blank")
        return value


class MeetingQuestionResponse(MeetingModel):
    """Return an ephemeral answer and the saved snapshot that grounded it.

    Args:
        answer: Generated answer based only on the saved meeting snapshot.
        transcriptRevision: Saved transcript revision sent to inference.
        summaryRevision: Saved summary revision sent to inference.
        summaryStale: Whether the saved summary predates the saved transcript.
        usedSummary: Whether a saved summary was present in the complete context.
    """

    answer: str = Field(max_length=MAX_MEETING_QUESTION_ANSWER_CHARACTERS)
    transcript_revision: int = Field(alias="transcriptRevision", ge=0)
    summary_revision: int = Field(alias="summaryRevision", ge=0)
    summary_stale: bool = Field(alias="summaryStale")
    used_summary: bool = Field(alias="usedSummary")


class MeetingSegmentResponse(MeetingModel):
    """Represent accepted segment processing state for upload and retry operations.

    Args:
        id: Stable client-generated segment UUID.
        status: Segment processing state.
        durationMs: Accepted audio duration.
        error: Safe segment error, if any.
    """

    id: UUID
    status: MeetingStatus
    duration_ms: int = Field(alias="durationMs", ge=0)
    error: str | None
