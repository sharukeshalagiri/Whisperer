"""Strict, bounded models for the read-only remote MCP meeting tools."""

from __future__ import annotations

from dataclasses import dataclass

# Pydantic resolves field annotations at runtime.
from datetime import datetime  # noqa: TC003
from typing import Literal
from uuid import UUID  # noqa: TC003

from pydantic import BaseModel, ConfigDict, Field, field_validator

from whisperer_api.meeting_schemas import MAX_MEETING_QUESTION_ANSWER_CHARACTERS, MeetingStatus

MeetingTextPart = Literal["transcript", "summary"]
MCP_LIST_LIMIT_MAX = 20
MCP_TEXT_PAGE_MAX_CHARACTERS = 16_000
MCP_QUESTION_MAX_CHARACTERS = 2_000


@dataclass(frozen=True)
class McpPrincipal:
    """Identify the authenticated owner of one MCP request.

    Created only after token validation resolves an existing user by issuer and subject.

    Args:
        user_id: Local application user id that owns every resolved meeting.
        issuer: Exact validated token issuer.
        subject: Stable validated token subject.
        scopes: Granted MCP scopes.
    """

    user_id: str
    issuer: str
    subject: str
    scopes: frozenset[str]


class McpModel(BaseModel):
    """Reject unknown fields and use the lower-camel wire names of the meeting API.

    Args:
        None.
    """

    # Tool results and their output schemas use the same lower-camel names as input.
    model_config = ConfigDict(
        extra="forbid", validate_by_alias=True, validate_by_name=False, serialize_by_alias=True
    )


class McpListMeetingsInput(McpModel):
    """Bound one meeting-listing request.

    Args:
        cursor: Opaque cursor from a previous page.
        limit: Page size from 1 through 20.
    """

    cursor: str | None = Field(default=None, max_length=512)
    limit: int = Field(ge=1, le=MCP_LIST_LIMIT_MAX, strict=True)


class McpMeetingTextInput(McpModel):
    """Bound one exact-character meeting text page request.

    Args:
        meetingId: Owned meeting UUID.
        part: Transcript or summary.
        cursor: Opaque cursor from a previous page of the same text.
        maxCharacters: Page size from 1 through 16,000 characters.
    """

    meeting_id: UUID = Field(alias="meetingId")
    part: MeetingTextPart
    cursor: str | None = Field(default=None, max_length=512)
    max_characters: int = Field(
        alias="maxCharacters", ge=1, le=MCP_TEXT_PAGE_MAX_CHARACTERS, strict=True
    )


class McpAskMeetingInput(McpModel):
    """Bound one ephemeral meeting question.

    Args:
        meetingId: Owned meeting UUID.
        question: The single question; it never supplies meeting context.
        transcriptRevision: Optional expected saved transcript revision.
        summaryRevision: Optional expected saved summary revision.
    """

    meeting_id: UUID = Field(alias="meetingId")
    question: str = Field(min_length=1, max_length=MCP_QUESTION_MAX_CHARACTERS)
    transcript_revision: int | None = Field(default=None, alias="transcriptRevision", ge=0)
    summary_revision: int | None = Field(default=None, alias="summaryRevision", ge=0)

    @field_validator("question")
    @classmethod
    def reject_blank_question(cls, value: str) -> str:
        """Reject whitespace-only questions without changing the wording.

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


class McpMeetingSummaryItem(McpModel):
    """Describe one owned meeting without any transcript, summary or audio content.

    Args:
        id: Stable meeting UUID.
        title: Display title.
        startedAt: Capture start timestamp.
        endedAt: Optional capture finish timestamp.
        durationMs: Sum of accepted audio segment durations.
        transcriptStatus: Transcript processing state.
        transcriptRevision: Saved transcript revision.
        summaryStatus: Summary processing state.
        summaryRevision: Saved summary revision.
        summaryStale: Whether the summary predates the transcript.
        hasSummary: Whether a saved summary exists.
    """

    id: UUID
    title: str
    started_at: datetime = Field(alias="startedAt")
    ended_at: datetime | None = Field(alias="endedAt")
    duration_ms: int = Field(alias="durationMs", ge=0)
    transcript_status: MeetingStatus = Field(alias="transcriptStatus")
    transcript_revision: int = Field(alias="transcriptRevision", ge=0)
    summary_status: MeetingStatus = Field(alias="summaryStatus")
    summary_revision: int = Field(alias="summaryRevision", ge=0)
    summary_stale: bool = Field(alias="summaryStale")
    has_summary: bool = Field(alias="hasSummary")


class McpMeetingPage(McpModel):
    """Return one page of owned meetings in descending capture order.

    Args:
        items: At most 20 meeting descriptions.
        nextCursor: Cursor for the next page, absent at the end.
    """

    items: list[McpMeetingSummaryItem] = Field(max_length=MCP_LIST_LIMIT_MAX)
    next_cursor: str | None = Field(alias="nextCursor")


class McpMeetingTextPage(McpModel):
    """Return one exact slice of a saved transcript or summary.

    Concatenating every page of one revision reproduces the saved text exactly.

    Args:
        meetingId: Owned meeting UUID.
        part: Transcript or summary.
        text: Exact code-point slice of the saved text.
        revision: Saved revision the slice belongs to.
        status: Processing state of this part.
        stale: Summary staleness, absent for transcripts.
        nextCursor: Cursor for the next slice, absent at the end.
        totalCharacters: Length of the complete saved text in code points.
    """

    meeting_id: UUID = Field(alias="meetingId")
    part: MeetingTextPart
    text: str = Field(max_length=MCP_TEXT_PAGE_MAX_CHARACTERS)
    revision: int = Field(ge=0)
    status: MeetingStatus
    stale: bool | None
    next_cursor: str | None = Field(alias="nextCursor")
    total_characters: int = Field(alias="totalCharacters", ge=0)


class McpMeetingAnswer(McpModel):
    """Return an ephemeral answer and the saved snapshot that grounded it.

    Args:
        answer: Answer based only on the saved meeting snapshot.
        transcriptRevision: Saved transcript revision sent to inference.
        summaryRevision: Saved summary revision sent to inference.
        summaryStale: Whether the saved summary predates the saved transcript.
        usedSummary: Whether a saved summary was part of the context.
    """

    answer: str = Field(min_length=1, max_length=MAX_MEETING_QUESTION_ANSWER_CHARACTERS)
    transcript_revision: int = Field(alias="transcriptRevision", ge=0)
    summary_revision: int = Field(alias="summaryRevision", ge=0)
    summary_stale: bool = Field(alias="summaryStale")
    used_summary: bool = Field(alias="usedSummary")
