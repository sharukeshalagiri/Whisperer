"""Ownership-scoped notes, transcripts, and dictionary services."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from whisperer_api.auth import Clock
from whisperer_api.persistence import DictionaryEntry, Note, Transcript, record_tombstone

_LOGGER = logging.getLogger("whisperer_api.resources")


class InferenceGateway(Protocol):
    """Describe inference calls needed by note and transcript resources.

    Args:
        None.
    """

    async def transcribe(
        self, audio: bytes, filename: str, content_type: str, language: str | None
    ) -> str:
        """Transcribe one audio upload.

        Args:
            audio: In-memory received audio bytes.
            filename: Sanitized original file name.
            content_type: Validated audio MIME type.
            language: Optional language hint.

        Returns:
            Raw transcription text.
        """

    async def polish(self, text: str) -> str:
        """Polish already-transcribed text.

        Args:
            text: Existing transcribed text.

        Returns:
            Polished text.
        """

    async def summarize(self, text: str) -> str:
        """Summarize note content.

        Args:
            text: Note title and content.

        Returns:
            Concise factual summary.
        """


class ResourceNotFoundError(Exception):
    """Signal a resource absent from the caller's ownership scope.

    Args:
        resource: Safe resource name for client messaging.
    """

    def __init__(self, resource: str) -> None:
        """Create an ownership-safe absence error.

        Args:
            resource: Safe resource name for client messaging.
        """
        self.resource = resource
        super().__init__(f"{resource} not found.")


class NoteChangedError(Exception):
    """Signal that a note changed while its summary was being generated.

    Args:
        None.
    """


class DuplicateDictionaryError(Exception):
    """Signal a duplicate private dictionary phrase.

    Args:
        None.
    """


@dataclass(frozen=True)
class TranscriptionResult:
    """Carry a non-persisted transcription response and substitution count.

    Args:
        id: New opaque response identifier.
        text: Final text returned to the device.
        raw_text: Gateway text before substitutions.
        language: Optional language hint supplied by the device.
        created_at: Creation timestamp.
        dictionary_replacements: Number of raw-text dictionary matches.
    """

    id: str
    text: str
    raw_text: str
    language: str | None
    created_at: datetime
    dictionary_replacements: int


class ResourceService:
    """Perform resource mutations scoped by caller user ID at every query.

    Args:
        clock: Injected UTC clock for deterministic mutation timestamps.
        inference: Injected model gateway for transcription and summaries.
    """

    def __init__(self, clock: Clock, inference: InferenceGateway) -> None:
        """Store time and inference dependencies.

        Args:
            clock: Injected UTC clock.
            inference: Injected model gateway.
        """
        self._clock = clock
        self._inference = inference

    def list_notes(self, session: Session, user_id: str) -> list[Note]:
        """List only notes owned by the caller.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.

        Returns:
            Owned notes ordered by last update descending.
        """
        return list(
            session.scalars(
                select(Note).where(Note.user_id == user_id).order_by(Note.updated_at.desc())
            )
        )

    def create_note(self, session: Session, user_id: str, title: str, content: str) -> Note:
        """Persist a new private note after legacy-compatible trimming.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            title: Requested note title.
            content: Requested note content.

        Returns:
            Persisted note.
        """
        now = self._clock.now()
        note = Note(
            user_id=user_id,
            title=title.strip(),
            content=content.strip(),
            created_at=now,
            updated_at=now,
        )
        session.add(note)
        session.flush()
        return note

    def update_note(
        self,
        session: Session,
        user_id: str,
        note_id: UUID,
        title: str | None,
        content: str | None,
        pinned: bool | None,
    ) -> Note:
        """Partially update an owned note and clear stale summaries on text changes.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            note_id: Target note identifier.
            title: Optional title replacement.
            content: Optional content replacement.
            pinned: Optional pin replacement.

        Returns:
            Updated owned note.

        Raises:
            ResourceNotFoundError: If the note is absent or owned by someone else.
        """
        note = self._owned_note(session, user_id, note_id)
        next_title = title.strip() if title is not None else note.title
        next_content = content.strip() if content is not None else note.content
        if next_title != note.title or next_content != note.content:
            note.summary = None
            note.revision += 1
        note.title = next_title
        note.content = next_content
        if pinned is not None:
            note.pinned = pinned
        note.updated_at = self._clock.now()
        session.flush()
        return note

    def delete_note(self, session: Session, user_id: str, note_id: UUID) -> None:
        """Delete one owned note without revealing another user's record.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            note_id: Target note identifier.

        Returns:
            None.

        Raises:
            ResourceNotFoundError: If the note is absent or foreign-owned.
        """
        note = self._owned_note(session, user_id, note_id)
        record_tombstone(session, user_id, "note", note.id, self._clock.now())
        session.delete(note)

    async def summarize_note(self, session: Session, user_id: str, note_id: UUID) -> Note:
        """Generate and safely persist a summary for an unchanged owned note.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            note_id: Target note identifier.

        Returns:
            Note with persisted summary.

        Raises:
            ResourceNotFoundError: If the note is absent or foreign-owned.
            NoteChangedError: If note text changed during generation.
            ValueError: If the language-model response is unusable.
        """
        note = self._owned_note(session, user_id, note_id)
        before = (note.title, note.content)
        material = f"{note.title}\n\n{note.content}" if note.title else note.content
        summary = await self._inference.summarize(material)
        session.refresh(note)
        if (note.title, note.content) != before:
            raise NoteChangedError
        note.summary = summary
        note.updated_at = self._clock.now()
        session.flush()
        return note

    def list_dictionary(self, session: Session, user_id: str) -> list[DictionaryEntry]:
        """List the caller's dictionary entries in creation order.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.

        Returns:
            Owned dictionary entries.
        """
        return list(
            session.scalars(
                select(DictionaryEntry)
                .where(DictionaryEntry.user_id == user_id)
                .order_by(DictionaryEntry.created_at)
            )
        )

    def create_dictionary(
        self, session: Session, user_id: str, phrase: str, replacement: str
    ) -> DictionaryEntry:
        """Create a private replacement, translating uniqueness safely.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            phrase: Required phrase to match.
            replacement: Requested replacement text.

        Returns:
            Persisted dictionary entry.

        Raises:
            DuplicateDictionaryError: If the user already owns the phrase.
        """
        now = self._clock.now()
        entry = DictionaryEntry(
            user_id=user_id,
            phrase=phrase.strip(),
            replacement=replacement.strip(),
            created_at=now,
            updated_at=now,
        )
        session.add(entry)
        try:
            session.flush()
        except IntegrityError as error:
            raise DuplicateDictionaryError() from error
        return entry

    def update_dictionary(
        self,
        session: Session,
        user_id: str,
        entry_id: UUID,
        phrase: str | None,
        replacement: str | None,
    ) -> DictionaryEntry:
        """Partially update one owned dictionary replacement.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            entry_id: Target dictionary ID.
            phrase: Optional phrase replacement.
            replacement: Optional replacement text.

        Returns:
            Updated owned dictionary entry.

        Raises:
            ResourceNotFoundError: If absent or foreign-owned.
            DuplicateDictionaryError: If the phrase conflicts for this user.
        """
        entry = self._owned_dictionary(session, user_id, entry_id)
        now = self._clock.now()
        if phrase is not None and phrase.strip() != entry.phrase:
            # The old phrase is gone, so other copies must drop it too.
            record_tombstone(session, user_id, "dictionary", entry.phrase, now)
            entry.phrase = phrase.strip()
        if replacement is not None:
            entry.replacement = replacement.strip()
        entry.updated_at = now
        try:
            session.flush()
        except IntegrityError as error:
            raise DuplicateDictionaryError() from error
        return entry

    def delete_dictionary(self, session: Session, user_id: str, entry_id: UUID) -> None:
        """Delete one owned dictionary entry.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            entry_id: Target dictionary ID.

        Returns:
            None.

        Raises:
            ResourceNotFoundError: If absent or foreign-owned.
        """
        entry = self._owned_dictionary(session, user_id, entry_id)
        record_tombstone(session, user_id, "dictionary", entry.phrase, self._clock.now())
        session.delete(entry)

    def list_transcripts(self, session: Session, user_id: str) -> list[Transcript]:
        """List caller-owned transcripts newest first.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.

        Returns:
            Owned transcript rows.
        """
        return list(
            session.scalars(
                select(Transcript)
                .where(Transcript.user_id == user_id)
                .order_by(Transcript.created_at.desc())
            )
        )

    async def transcribe(
        self,
        session: Session,
        user_id: str,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        polish: bool,
    ) -> TranscriptionResult:
        """Produce a non-persisted transcription with one literal substitution pass.

        Args:
            session: Open database session used only to read the private dictionary.
            user_id: Authenticated local user ID.
            audio: Uploaded audio bytes.
            filename: Original upload filename.
            content_type: Validated audio MIME type.
            language: Optional language hint.
            polish: Whether to invoke text polishing after substitutions.

        Returns:
            Stateless transcription data for immediate device delivery.
        """
        raw_text = await self._inference.transcribe(audio, filename, content_type, language)
        text, replacements = self._substitute(session, user_id, raw_text)
        if polish:
            try:
                text = await self._inference.polish(text)
            except ValueError as error:
                # The transcript is already good; a language-model failure must not discard it.
                _LOGGER.warning(
                    "Polish failed (%s); returning the unpolished text.", type(error).__name__
                )
        return TranscriptionResult(
            id=str(uuid4()),
            text=text,
            raw_text=raw_text,
            language=language,
            created_at=self._clock.now(),
            dictionary_replacements=replacements,
        )

    async def create_transcript(
        self,
        session: Session,
        user_id: str,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        polish: bool,
    ) -> Transcript:
        """Persist a deprecated transcript representation for legacy callers.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            audio: Uploaded audio bytes.
            filename: Original upload filename.
            content_type: Validated audio MIME type.
            language: Optional language hint.
            polish: Whether to invoke text polishing.

        Returns:
            Persisted legacy transcript.
        """
        result = await self.transcribe(
            session, user_id, audio, filename, content_type, language, polish
        )
        item = Transcript(
            user_id=user_id,
            text=result.text,
            raw_text=result.raw_text,
            language=result.language,
            created_at=result.created_at,
        )
        session.add(item)
        session.flush()
        return item

    def delete_transcript(self, session: Session, user_id: str, transcript_id: UUID) -> None:
        """Delete one caller-owned transcript.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            transcript_id: Target transcript ID.

        Returns:
            None.

        Raises:
            ResourceNotFoundError: If absent or foreign-owned.
        """
        item = session.scalar(
            select(Transcript).where(
                Transcript.id == str(transcript_id), Transcript.user_id == user_id
            )
        )
        if item is None:
            raise ResourceNotFoundError("Transcript")
        session.delete(item)

    def _owned_note(self, session: Session, user_id: str, note_id: UUID) -> Note:
        """Resolve a note within caller ownership.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            note_id: Target note ID.

        Returns:
            Owned note.

        Raises:
            ResourceNotFoundError: If absent or foreign-owned.
        """
        note = session.scalar(select(Note).where(Note.id == str(note_id), Note.user_id == user_id))
        if note is None:
            raise ResourceNotFoundError("Note")
        return note

    def _owned_dictionary(self, session: Session, user_id: str, entry_id: UUID) -> DictionaryEntry:
        """Resolve a dictionary row within caller ownership.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            entry_id: Target dictionary ID.

        Returns:
            Owned dictionary row.

        Raises:
            ResourceNotFoundError: If absent or foreign-owned.
        """
        entry = session.scalar(
            select(DictionaryEntry).where(
                DictionaryEntry.id == str(entry_id), DictionaryEntry.user_id == user_id
            )
        )
        if entry is None:
            raise ResourceNotFoundError("Dictionary entry")
        return entry

    def _substitute(self, session: Session, user_id: str, text: str) -> tuple[str, int]:
        """Apply all private literal whole-word substitutions in one non-cascading pass.

        Args:
            session: Open database session.
            user_id: Authenticated local user ID.
            text: Text to transform.

        Returns:
            Transformed text and the number of matched phrases.
        """
        entries = sorted(
            self.list_dictionary(session, user_id),
            key=lambda entry: len(entry.phrase),
            reverse=True,
        )
        if not entries:
            return text, 0
        alternatives = "|".join(re.escape(entry.phrase) for entry in entries)
        lookup = {entry.phrase.casefold(): entry.replacement for entry in entries}
        pattern = re.compile(rf"(?<!\w)({alternatives})(?!\w)", re.IGNORECASE)

        def replace(match: re.Match[str]) -> str:
            """Look up literal output without allowing regex replacement syntax.

            Args:
                match: Matched dictionary phrase.

            Returns:
                Plain replacement text.
            """
            return lookup[match.group(1).casefold()]

        return pattern.subn(replace, text)
