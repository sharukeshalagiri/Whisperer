"""Read-only, owner-scoped meeting operations behind the remote MCP tools.

Every operation calls the meeting domain service directly inside a short database
transaction and closes it before any inference. Nothing here reads audio, notes,
dictionary entries, metrics or sessions, and nothing writes meeting content.
"""

from __future__ import annotations

import base64
import binascii
from typing import TYPE_CHECKING, Protocol
from uuid import UUID

from pydantic import BaseModel, ValidationError

from whisperer_api.inference import ContextLimitError
from whisperer_api.mcp_schemas import (
    McpAskMeetingInput,
    McpListMeetingsInput,
    McpMeetingAnswer,
    McpMeetingPage,
    McpMeetingSummaryItem,
    McpMeetingTextInput,
    McpMeetingTextPage,
    McpPrincipal,
    MeetingTextPart,
)
from whisperer_api.meeting_schemas import MAX_MEETING_QUESTION_ANSWER_CHARACTERS
from whisperer_api.meetings import MeetingConflictError, MeetingNotFoundError
from whisperer_api.settings import MCP_SCOPE_ASK, MCP_SCOPE_READ

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

    from whisperer_api.meeting_models import Meeting
    from whisperer_api.meetings import MeetingQuestionSource, MeetingService
    from whisperer_api.persistence import Database

MEETING_NOT_FOUND_MESSAGE = "Meeting not found. Call list_meetings to discover meeting ids."
LLM_OFF_MESSAGE = "The language model is turned off."
NO_SUMMARY_MESSAGE = "This meeting has no saved summary yet."
STALE_CURSOR_MESSAGE = "The cursor is stale because the text changed. Restart from the beginning."
INVALID_CURSOR_MESSAGE = "The cursor is invalid. Restart from the beginning."
PROVIDER_FAILED_MESSAGE = "The language model could not answer this question."


class McpToolError(ValueError):
    """Signal a safe, actionable MCP tool failure.

    The message never contains meeting text, provider output or foreign ownership.

    Args:
        message: Client-readable explanation.
    """


class McpScopeError(McpToolError):
    """Signal that the access token lacks the scope a tool requires.

    Args:
        scope: Missing OAuth scope.
    """

    def __init__(self, scope: str) -> None:
        """Name the missing scope.

        Args:
            scope: Missing OAuth scope.
        """
        super().__init__(f"This tool requires the {scope} scope. Reconnect and grant it.")
        self.scope = scope


class MeetingAnswerResult(Protocol):
    """Describe the typed answer returned by the meeting AI service.

    Args:
        None.
    """

    @property
    def answer(self) -> str:
        """Return the generated answer text.

        Args:
            None.

        Returns:
            Answer text.
        """


class MeetingAnswerer(Protocol):
    """Describe the meeting AI capability used to answer one question.

    Args:
        None.
    """

    async def answer(
        self, source: MeetingQuestionSource, question: str, *, timeout_seconds: float
    ) -> MeetingAnswerResult:
        """Answer one question from a complete saved meeting snapshot.

        Args:
            source: Server-resolved owned snapshot.
            question: The user's question.
            timeout_seconds: Bounded request duration.

        Returns:
            Typed answer.
        """


class McpMeetingService:
    """Compose owner-scoped meeting reads and questions for MCP tools.

    Args:
        database: Application database owner.
        meetings: Meeting domain service.
        meeting_ai_resolver: Returns the current answerer, or ``None`` when the LLM is off.
        timeout_seconds: Bounded question inference duration.
    """

    def __init__(
        self,
        database: Database,
        meetings: MeetingService,
        meeting_ai_resolver: Callable[[], MeetingAnswerer | None],
        timeout_seconds: float,
    ) -> None:
        """Store injected collaborators.

        Args:
            database: Application database owner.
            meetings: Meeting domain service.
            meeting_ai_resolver: Returns the current answerer, or ``None`` when the LLM is off.
            timeout_seconds: Bounded question inference duration.
        """
        self._database = database
        self._meetings = meetings
        self._meeting_ai_resolver = meeting_ai_resolver
        self._timeout_seconds = timeout_seconds

    def list_meetings(
        self, principal: McpPrincipal, cursor: str | None, limit: int
    ) -> McpMeetingPage:
        """List the principal's meetings without any text or audio content.

        Args:
            principal: Authenticated MCP owner.
            cursor: Opaque cursor from a previous page.
            limit: Page size from 1 through 20.

        Returns:
            One page of meeting descriptions.

        Raises:
            McpScopeError: If ``meetings:read`` was not granted.
            McpToolError: If an argument or cursor is invalid.
        """
        _require_scope(principal, MCP_SCOPE_READ)
        request = _validated(McpListMeetingsInput, {"cursor": cursor, "limit": limit})
        with next(self._database.session()) as session:
            try:
                records, next_cursor = self._meetings.list_meetings(
                    session, principal.user_id, request.cursor, request.limit
                )
            except MeetingConflictError as error:
                raise McpToolError(INVALID_CURSOR_MESSAGE) from error
            items = [_summary_item(record) for record in records]
        return McpMeetingPage(items=items, nextCursor=next_cursor)

    def get_meeting_text(
        self,
        principal: McpPrincipal,
        meeting_id: UUID,
        part: MeetingTextPart,
        cursor: str | None,
        max_characters: int,
    ) -> McpMeetingTextPage:
        """Return an exact code-point slice of an owned meeting's saved text.

        Args:
            principal: Authenticated MCP owner.
            meeting_id: Owned meeting UUID.
            part: Transcript or summary.
            cursor: Opaque cursor from a previous page of the same revision.
            max_characters: Page size from 1 through 16,000 characters.

        Returns:
            One page whose concatenation with its siblings is the exact saved text.

        Raises:
            McpScopeError: If ``meetings:read`` was not granted.
            McpToolError: If arguments are invalid, the meeting is unavailable, the
                summary is absent, or the cursor is invalid or stale.
        """
        _require_scope(principal, MCP_SCOPE_READ)
        request = _validated(
            McpMeetingTextInput,
            {
                "meetingId": meeting_id,
                "part": part,
                "cursor": cursor,
                "maxCharacters": max_characters,
            },
        )
        with next(self._database.session()) as session:
            meeting = self._owned(session, principal, request.meeting_id)
            if request.part == "transcript":
                text = meeting.transcript
                revision = meeting.transcript_revision
                status = meeting.transcript_status
                stale: bool | None = None
            else:
                if meeting.summary is None:
                    raise McpToolError(NO_SUMMARY_MESSAGE)
                text = meeting.summary
                revision = meeting.summary_revision
                status = meeting.summary_status
                stale = meeting.summary_stale
        offset = (
            0
            if request.cursor is None
            else _decode_text_cursor(request.cursor, request.meeting_id, request.part, revision)
        )
        if offset > len(text):
            raise McpToolError(INVALID_CURSOR_MESSAGE)
        end = min(offset + request.max_characters, len(text))
        next_cursor = (
            _encode_text_cursor(request.meeting_id, request.part, revision, end)
            if end < len(text)
            else None
        )
        return McpMeetingTextPage.model_validate(
            {
                "meetingId": request.meeting_id,
                "part": request.part,
                "text": text[offset:end],
                "revision": revision,
                "status": status,
                "stale": stale,
                "nextCursor": next_cursor,
                "totalCharacters": len(text),
            }
        )

    async def ask_meeting(
        self,
        principal: McpPrincipal,
        meeting_id: UUID,
        question: str,
        transcript_revision: int | None,
        summary_revision: int | None,
    ) -> McpMeetingAnswer:
        """Answer one question from an owned meeting's complete saved snapshot.

        The question is ephemeral: nothing is persisted and no meeting field changes.

        Args:
            principal: Authenticated MCP owner.
            meeting_id: Owned meeting UUID.
            question: The single question; it never supplies meeting context.
            transcript_revision: Optional expected saved transcript revision.
            summary_revision: Optional expected saved summary revision.

        Returns:
            Ephemeral answer and the revisions that grounded it.

        Raises:
            McpScopeError: If ``meetings:ask`` was not granted.
            McpToolError: If arguments are invalid, the meeting is unavailable or
                unfinished, revisions changed, the LLM is off, or inference fails.
        """
        _require_scope(principal, MCP_SCOPE_ASK)
        request = _validated(
            McpAskMeetingInput,
            {
                "meetingId": meeting_id,
                "question": question,
                "transcriptRevision": transcript_revision,
                "summaryRevision": summary_revision,
            },
        )
        answerer = self._meeting_ai_resolver()
        if answerer is None:
            raise McpToolError(LLM_OFF_MESSAGE)
        source = self._question_source(principal, request)
        try:
            result = await answerer.answer(
                source, request.question, timeout_seconds=self._timeout_seconds
            )
        except ContextLimitError as error:
            # This message is ours and states that nothing was shortened.
            raise McpToolError(str(error)) from error
        except Exception as error:
            raise McpToolError(PROVIDER_FAILED_MESSAGE) from error
        answer = result.answer.strip()
        if not answer or len(answer) > MAX_MEETING_QUESTION_ANSWER_CHARACTERS:
            raise McpToolError(PROVIDER_FAILED_MESSAGE)
        return McpMeetingAnswer(
            answer=answer,
            transcriptRevision=source.transcript_revision,
            summaryRevision=source.summary_revision,
            summaryStale=source.summary_stale,
            usedSummary=source.summary is not None,
        )

    def _question_source(
        self, principal: McpPrincipal, request: McpAskMeetingInput
    ) -> MeetingQuestionSource:
        """Snapshot and check the owned meeting inside a transaction closed before inference.

        Args:
            principal: Authenticated MCP owner.
            request: Validated question request.

        Returns:
            Complete immutable transcript and summary snapshot.

        Raises:
            McpToolError: If the meeting is unavailable, unfinished, empty or changed.
        """
        with next(self._database.session()) as session:
            try:
                source = self._meetings.question_source(
                    session, principal.user_id, request.meeting_id
                )
            except MeetingNotFoundError as error:
                raise McpToolError(MEETING_NOT_FOUND_MESSAGE) from error
        if source.transcript_status != "complete":
            raise McpToolError("Finish processing the transcript before asking a question.")
        if not source.transcript.strip():
            raise McpToolError("The saved transcript is empty.")
        if (
            request.transcript_revision is not None
            and request.transcript_revision != source.transcript_revision
        ) or (
            request.summary_revision is not None
            and request.summary_revision != source.summary_revision
        ):
            raise McpToolError("The meeting changed. Read it again and retry.")
        return source

    def _owned(self, session: Session, principal: McpPrincipal, meeting_id: UUID) -> Meeting:
        """Resolve one owned meeting with an ownership-blind error.

        Args:
            session: Short read transaction.
            principal: Authenticated MCP owner.
            meeting_id: Requested meeting UUID.

        Returns:
            Owned meeting record.

        Raises:
            McpToolError: If the meeting is absent or owned by someone else.
        """
        try:
            return self._meetings.get_meeting(session, principal.user_id, meeting_id)
        except MeetingNotFoundError as error:
            raise McpToolError(MEETING_NOT_FOUND_MESSAGE) from error


def _require_scope(principal: McpPrincipal, scope: str) -> None:
    """Reject a principal that was not granted one scope.

    Args:
        principal: Authenticated MCP owner.
        scope: Required OAuth scope.

    Returns:
        None.

    Raises:
        McpScopeError: If the scope is missing.
    """
    if scope not in principal.scopes:
        raise McpScopeError(scope)


def _validated[ModelT: BaseModel](model: type[ModelT], values: dict[str, object]) -> ModelT:
    """Validate tool arguments strictly, naming only the rejected fields.

    Args:
        model: Strict input model.
        values: Raw lower-camel argument values.

    Returns:
        Validated input.

    Raises:
        McpToolError: If any argument is out of bounds or malformed.
    """
    try:
        return model.model_validate(values)
    except ValidationError as error:
        fields = sorted({".".join(str(part) for part in item["loc"]) for item in error.errors()})
        raise McpToolError(f"Invalid arguments: {', '.join(fields)}.") from error


def _summary_item(meeting: Meeting) -> McpMeetingSummaryItem:
    """Describe one meeting without any content.

    Args:
        meeting: Owned meeting record.

    Returns:
        Content-free listing item.
    """
    return McpMeetingSummaryItem.model_validate(
        {
            "id": meeting.id,
            "title": meeting.title,
            "startedAt": meeting.started_at,
            "endedAt": meeting.ended_at,
            "durationMs": meeting.duration_ms,
            "transcriptStatus": meeting.transcript_status,
            "transcriptRevision": meeting.transcript_revision,
            "summaryStatus": meeting.summary_status,
            "summaryRevision": meeting.summary_revision,
            "summaryStale": meeting.summary_stale,
            "hasSummary": meeting.summary is not None,
        }
    )


def _encode_text_cursor(meeting_id: UUID, part: str, revision: int, offset: int) -> str:
    """Encode a text page position bound to one meeting, part and saved revision.

    Args:
        meeting_id: Meeting the text belongs to.
        part: Text part the cursor pages through.
        revision: Saved text revision.
        offset: Next code-point offset.

    Returns:
        Opaque URL-safe cursor.
    """
    raw = f"{meeting_id}:{part}:{revision}:{offset}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _decode_text_cursor(cursor: str, meeting_id: UUID, part: str, revision: int) -> int:
    """Decode a text cursor and require it to match the requested text and revision.

    Args:
        cursor: Opaque cursor supplied by the client.
        meeting_id: Meeting the client is paging.
        part: Text part the client is paging.
        revision: Current saved revision of the requested text.

    Returns:
        Next code-point offset.

    Raises:
        McpToolError: If the cursor is malformed, belongs to another text or is stale.
    """
    try:
        padding = "=" * (-len(cursor) % 4)
        decoded = base64.urlsafe_b64decode(cursor + padding).decode("ascii")
        id_text, cursor_part, revision_text, offset_text = decoded.split(":")
        cursor_id, cursor_revision, offset = UUID(id_text), int(revision_text), int(offset_text)
    except (ValueError, UnicodeDecodeError, binascii.Error) as error:
        raise McpToolError(INVALID_CURSOR_MESSAGE) from error
    if offset < 0 or cursor_revision < 0 or cursor_id != meeting_id or cursor_part != part:
        raise McpToolError(INVALID_CURSOR_MESSAGE)
    if cursor_revision != revision:
        raise McpToolError(STALE_CURSOR_MESSAGE)
    return offset
