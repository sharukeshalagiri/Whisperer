"""Exercise the owner-scoped MCP meeting adapter against an isolated database."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from whisperer_api.auth import SystemClock
from whisperer_api.inference import ContextLimitError
from whisperer_api.mcp_meetings import (
    LLM_OFF_MESSAGE,
    MEETING_NOT_FOUND_MESSAGE,
    NO_SUMMARY_MESSAGE,
    PROVIDER_FAILED_MESSAGE,
    STALE_CURSOR_MESSAGE,
    McpMeetingService,
    McpScopeError,
    McpToolError,
)
from whisperer_api.mcp_schemas import McpPrincipal
from whisperer_api.meeting_models import Meeting
from whisperer_api.meetings import MeetingQuestionSource, MeetingService
from whisperer_api.persistence import Database, User
from whisperer_api.settings import MCP_SCOPE_ASK, MCP_SCOPE_READ

if TYPE_CHECKING:
    from pathlib import Path

ISSUER = "https://identity.example.test"
# Multibyte code points straddle page boundaries to prove exact slicing.
TRANSCRIPT = "Start 🎙️ café naïve 日本語 — " * 40 + "end"


class UnusedInference:
    """Fail loudly if the adapter ever reaches durable meeting inference.

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
        """Reject any transcription attempt.

        Args:
            audio: Unused audio.
            filename: Unused filename.
            content_type: Unused media type.
            language: Unused language hint.
            timeout_seconds: Unused timeout.

        Returns:
            Never returns.

        Raises:
            AssertionError: Always.
        """
        raise AssertionError("MCP must not transcribe audio")

    async def summarize(self, text: str, *, timeout_seconds: float) -> str:
        """Reject any summary attempt.

        Args:
            text: Unused transcript.
            timeout_seconds: Unused timeout.

        Returns:
            Never returns.

        Raises:
            AssertionError: Always.
        """
        raise AssertionError("MCP must not summarize")


@dataclass
class FakeAnswer:
    """Carry a typed answer like the meeting AI service.

    Args:
        answer: Answer text.
    """

    answer: str


@dataclass
class FakeAnswerer:
    """Record the snapshot each question receives.

    Args:
        reply: Answer to return.
        error: Optional exception to raise instead.
    """

    reply: str = "Synthetic answer"
    error: Exception | None = None
    calls: list[tuple[MeetingQuestionSource, str, float]] = field(default_factory=list)

    async def answer(
        self, source: MeetingQuestionSource, question: str, *, timeout_seconds: float
    ) -> FakeAnswer:
        """Record and answer one question.

        Args:
            source: Server-resolved snapshot.
            question: Submitted question.
            timeout_seconds: Requested timeout.

        Returns:
            Configured answer.

        Raises:
            Exception: The configured error, when set.
        """
        self.calls.append((source, question, timeout_seconds))
        if self.error is not None:
            raise self.error
        return FakeAnswer(self.reply)


@dataclass
class Fixture:
    """Hold the composed adapter and seeded identities.

    Args:
        service: Adapter under test.
        database: Isolated database.
        answerer: Recording fake answerer.
        owner: Principal owning ``meeting_id``.
        other: Principal owning ``foreign_id``.
        meeting_id: Owner's complete meeting.
        foreign_id: Other user's meeting.
        llm_on: Mutable switch read by the answerer resolver.
    """

    service: McpMeetingService
    database: Database
    answerer: FakeAnswerer
    owner: McpPrincipal
    other: McpPrincipal
    meeting_id: UUID
    foreign_id: UUID
    llm_on: list[bool]


def _meeting(user_id: str, started_at: datetime, **values: object) -> Meeting:
    """Build one persisted meeting row.

    Args:
        user_id: Owner id.
        started_at: Capture start.
        **values: Field overrides.

    Returns:
        Unsaved meeting.
    """
    now = datetime.now(UTC)
    fields: dict[str, object] = {
        "id": str(uuid4()),
        "user_id": user_id,
        "title": "Weekly sync",
        "started_at": started_at,
        "duration_ms": 1_000,
        "revision": 1,
        "transcript": TRANSCRIPT,
        "transcript_revision": 3,
        "summary": None,
        "summary_revision": 0,
        "summary_stale": False,
        "transcript_status": "complete",
        "summary_status": "idle",
        "created_at": now,
        "updated_at": now,
    }
    fields.update(values)
    return Meeting(**fields)


@pytest.fixture
def mcp(tmp_path: Path) -> Fixture:
    """Compose the adapter with isolated SQLite and two owners.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        Composed fixture.
    """
    database = Database(f"sqlite:///{tmp_path / 'api.sqlite3'}")
    database.create_schema()
    clock = SystemClock()
    meetings = MeetingService(database, clock, UnusedInference(), tmp_path / "audio")
    answerer = FakeAnswerer()
    llm_on = [True]
    service = McpMeetingService(
        database, meetings, lambda: answerer if llm_on[0] else None, timeout_seconds=42.0
    )
    scopes = frozenset({MCP_SCOPE_READ, MCP_SCOPE_ASK})
    with next(database.session()) as session:
        owner = User(issuer=ISSUER, subject="owner", created_at=clock.now())
        other = User(issuer=ISSUER, subject="other", created_at=clock.now())
        session.add_all([owner, other])
        session.flush()
        start = datetime(2026, 10, 1, tzinfo=UTC)
        mine = _meeting(owner.id, start, summary="Short summary", summary_revision=2)
        foreign = _meeting(other.id, start)
        session.add_all([mine, foreign])
        session.commit()
        return Fixture(
            service=service,
            database=database,
            answerer=answerer,
            owner=McpPrincipal(owner.id, ISSUER, "owner", scopes),
            other=McpPrincipal(other.id, ISSUER, "other", scopes),
            meeting_id=UUID(mine.id),
            foreign_id=UUID(foreign.id),
            llm_on=llm_on,
        )


def _with_scopes(principal: McpPrincipal, *scopes: str) -> McpPrincipal:
    """Copy a principal with different scopes.

    Args:
        principal: Source principal.
        *scopes: Replacement scopes.

    Returns:
        New principal.
    """
    return McpPrincipal(principal.user_id, principal.issuer, principal.subject, frozenset(scopes))


async def test_scope_denial_names_the_required_scope(mcp: Fixture) -> None:
    """Require meetings:read for reads and meetings:ask for questions.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    ask_only = _with_scopes(mcp.owner, MCP_SCOPE_ASK)
    read_only = _with_scopes(mcp.owner, MCP_SCOPE_READ)
    with pytest.raises(McpScopeError, match=MCP_SCOPE_READ):
        mcp.service.list_meetings(ask_only, None, 5)
    with pytest.raises(McpScopeError, match=MCP_SCOPE_READ):
        mcp.service.get_meeting_text(ask_only, mcp.meeting_id, "transcript", None, 10)
    with pytest.raises(McpScopeError, match=MCP_SCOPE_ASK):
        await mcp.service.ask_meeting(read_only, mcp.meeting_id, "What?", None, None)
    assert mcp.answerer.calls == []


def test_list_returns_only_owned_meetings_without_content(mcp: Fixture) -> None:
    """List exactly the principal's meetings and never their text.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    page = mcp.service.list_meetings(mcp.owner, None, 20)
    assert [item.id for item in page.items] == [mcp.meeting_id]
    assert page.next_cursor is None
    dumped = page.model_dump_json(by_alias=True)
    assert "Short summary" not in dumped
    assert "café" not in dumped
    assert page.items[0].has_summary is True


def test_list_pages_with_the_domain_cursor(mcp: Fixture) -> None:
    """Page through owned meetings with the existing opaque cursor.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    with next(mcp.database.session()) as session:
        base = datetime(2026, 9, 1, tzinfo=UTC)
        session.add_all(
            [_meeting(mcp.owner.user_id, base - timedelta(days=day)) for day in range(3)]
        )
        session.commit()
    seen: list[UUID] = []
    cursor: str | None = None
    while True:
        page = mcp.service.list_meetings(mcp.owner, cursor, 2)
        seen.extend(item.id for item in page.items)
        cursor = page.next_cursor
        if cursor is None:
            break
    assert len(seen) == len(set(seen)) == 4
    with pytest.raises(McpToolError, match="cursor is invalid"):
        mcp.service.list_meetings(mcp.owner, "not-a-cursor", 2)


@pytest.mark.parametrize("limit", [0, 21, -1])
def test_list_limit_out_of_bounds_is_rejected(mcp: Fixture, limit: int) -> None:
    """Reject rather than coerce list limits outside 1..20.

    Args:
        mcp: Composed fixture.
        limit: Out-of-range limit.

    Returns:
        None.
    """
    with pytest.raises(McpToolError, match="limit"):
        mcp.service.list_meetings(mcp.owner, None, limit)


@pytest.mark.parametrize("size", [0, 16_001])
def test_text_page_size_out_of_bounds_is_rejected(mcp: Fixture, size: int) -> None:
    """Reject rather than coerce maxCharacters outside 1..16,000.

    Args:
        mcp: Composed fixture.
        size: Out-of-range page size.

    Returns:
        None.
    """
    with pytest.raises(McpToolError, match="maxCharacters"):
        mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "transcript", None, size)


async def test_foreign_and_absent_meetings_are_indistinguishable(mcp: Fixture) -> None:
    """Return the same safe error for a foreign meeting and an absent one.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    messages: list[str] = []
    for meeting_id in (mcp.foreign_id, uuid4()):
        with pytest.raises(McpToolError) as text_error:
            mcp.service.get_meeting_text(mcp.owner, meeting_id, "transcript", None, 10)
        with pytest.raises(McpToolError) as ask_error:
            await mcp.service.ask_meeting(mcp.owner, meeting_id, "What?", None, None)
        messages.extend([str(text_error.value), str(ask_error.value)])
    assert set(messages) == {MEETING_NOT_FOUND_MESSAGE}
    assert mcp.answerer.calls == []


def test_text_cursor_is_bound_to_its_meeting_and_part(mcp: Fixture) -> None:
    """Reject a transcript cursor reused on the summary or on another meeting.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    page = mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "transcript", None, 1)
    assert page.next_cursor is not None
    with pytest.raises(McpToolError, match="invalid"):
        mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "summary", page.next_cursor, 1)
    with pytest.raises(McpToolError, match="invalid"):
        mcp.service.get_meeting_text(mcp.other, mcp.foreign_id, "transcript", page.next_cursor, 1)


def test_transcript_pages_concatenate_to_the_exact_original(mcp: Fixture) -> None:
    """Rebuild the saved transcript exactly from multiple code-point pages.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    parts: list[str] = []
    cursor: str | None = None
    pages = 0
    while True:
        page = mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "transcript", cursor, 7)
        assert len(page.text) <= 7
        assert page.total_characters == len(TRANSCRIPT)
        assert page.revision == 3
        assert page.stale is None
        parts.append(page.text)
        pages += 1
        cursor = page.next_cursor
        if cursor is None:
            break
    assert pages > 1
    assert "".join(parts) == TRANSCRIPT


def test_stale_text_cursor_is_rejected(mcp: Fixture) -> None:
    """Reject a cursor once the saved transcript revision changes.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    page = mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "transcript", None, 5)
    assert page.next_cursor is not None
    with next(mcp.database.session()) as session:
        meeting = session.get(Meeting, str(mcp.meeting_id))
        assert meeting is not None
        meeting.transcript_revision += 1
        session.commit()
    with pytest.raises(McpToolError, match=STALE_CURSOR_MESSAGE):
        mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "transcript", page.next_cursor, 5)
    with pytest.raises(McpToolError, match="cursor is invalid"):
        mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "transcript", "%%%", 5)


def test_summary_text_and_absent_summary(mcp: Fixture) -> None:
    """Return a saved summary and name an absent one safely.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    page = mcp.service.get_meeting_text(mcp.owner, mcp.meeting_id, "summary", None, 100)
    assert page.text == "Short summary"
    assert page.stale is False
    assert page.next_cursor is None
    with pytest.raises(McpToolError, match=NO_SUMMARY_MESSAGE):
        mcp.service.get_meeting_text(mcp.other, mcp.foreign_id, "summary", None, 100)


async def test_ask_uses_the_complete_saved_snapshot(mcp: Fixture) -> None:
    """Hand the complete owned snapshot to the answerer without mutation.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    answer = await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "Decisions?", 3, 2)
    assert answer.answer == "Synthetic answer"
    assert (answer.transcript_revision, answer.summary_revision) == (3, 2)
    assert answer.used_summary is True
    [(source, question, timeout)] = mcp.answerer.calls
    assert source.transcript == TRANSCRIPT
    assert source.summary == "Short summary"
    assert (question, timeout) == ("Decisions?", 42.0)
    with next(mcp.database.session()) as session:
        meeting = session.get(Meeting, str(mcp.meeting_id))
        assert meeting is not None
        assert (meeting.transcript_revision, meeting.summary_revision) == (3, 2)


async def test_ask_with_the_language_model_off(mcp: Fixture) -> None:
    """Refuse safely when no meeting answerer is configured.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    mcp.llm_on[0] = False
    with pytest.raises(McpToolError, match=LLM_OFF_MESSAGE):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", None, None)


async def test_ask_rejects_revision_mismatch_and_unfinished_transcripts(mcp: Fixture) -> None:
    """Mirror the HTTP route's revision and completeness checks.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    with pytest.raises(McpToolError, match="meeting changed"):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", 2, None)
    with pytest.raises(McpToolError, match="meeting changed"):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", None, 9)
    with next(mcp.database.session()) as session:
        meeting = session.get(Meeting, str(mcp.meeting_id))
        assert meeting is not None
        meeting.transcript_status = "running"
        session.commit()
    with pytest.raises(McpToolError, match="Finish processing"):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", None, None)
    with pytest.raises(McpToolError, match="question"):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "   ", None, None)
    assert mcp.answerer.calls == []


async def test_ask_hides_provider_failures(mcp: Fixture) -> None:
    """Replace provider error text with a safe message, keeping the context-limit notice.

    Args:
        mcp: Composed fixture.

    Returns:
        None.
    """
    mcp.answerer.error = RuntimeError("upstream secret detail")
    with pytest.raises(McpToolError) as error:
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", None, None)
    assert str(error.value) == PROVIDER_FAILED_MESSAGE
    mcp.answerer.error = ContextLimitError()
    with pytest.raises(McpToolError, match="not shortened"):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", None, None)
    mcp.answerer.error = None
    mcp.answerer.reply = "   "
    with pytest.raises(McpToolError, match=PROVIDER_FAILED_MESSAGE):
        await mcp.service.ask_meeting(mcp.owner, mcp.meeting_id, "What?", None, None)
