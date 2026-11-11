"""Migrate notes, transcripts and dictionary entries from Whisperer's earlier Node.js API database.

The import is a dry run by default, copies only users named in an explicit mapping, and opens the
source SQLite file read-only.
"""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from whisperer_api.persistence import Database, DictionaryEntry, Note, Transcript, User


@dataclass(frozen=True, slots=True)
class ImportResult:
    """Summarize one explicit migration run.

    Args:
        dry_run: Whether no destination changes were committed.
        mapped_users: Number of source identities with explicit destination mappings.
        imported_notes: Number of notes copied.
        imported_transcripts: Number of transcripts copied.
        imported_dictionary_entries: Number of dictionary entries copied.
        unmatched_users: Source users intentionally left in the earlier database.
    """

    dry_run: bool
    mapped_users: int
    imported_notes: int
    imported_transcripts: int
    imported_dictionary_entries: int
    unmatched_users: int


class LegacyImporter:
    """Copy only explicitly mapped content into the separate API database.

    Args:
        database: Destination API database, never the earlier source database.
    """

    def __init__(self, database: Database) -> None:
        """Store the isolated destination database.

        Args:
            database: Destination API database, never the earlier source database.
        """
        self._database = database

    def run(self, source: Path, mapping: Path, apply: bool) -> ImportResult:
        """Read the earlier database without writes and optionally copy mapped content.

        Args:
            source: Existing earlier SQLite file opened in immutable read-only mode.
            mapping: JSON object from old user UUID to issuer and subject values.
            apply: Whether to commit inserts; false reports the exact candidate count only.

        Returns:
            Counts of copied or candidate records and intentionally unmatched users.

        Raises:
            ValueError: If the mapping has invalid structure or refers to unknown OIDC users.
        """
        mappings = self._read_mapping(mapping)
        connection = sqlite3.connect(f"file:{quote(str(source))}?mode=ro&immutable=1", uri=True)
        connection.row_factory = sqlite3.Row
        try:
            source_users = {str(row["id"]) for row in connection.execute("SELECT id FROM users")}
            mapped_destinations = self._destination_users(mappings)
            note_count = 0
            transcript_count = 0
            dictionary_count = 0
            with next(self._database.session()) as destination:
                for old_user_id, new_user in mapped_destinations.items():
                    note_count += self._copy_notes(
                        connection, destination, old_user_id, new_user.id, apply
                    )
                    transcript_count += self._copy_transcripts(
                        connection, destination, old_user_id, new_user.id, apply
                    )
                    dictionary_count += self._copy_dictionary(
                        connection, destination, old_user_id, new_user.id, apply
                    )
                if apply:
                    destination.commit()
            return ImportResult(
                dry_run=not apply,
                mapped_users=len(mapped_destinations),
                imported_notes=note_count,
                imported_transcripts=transcript_count,
                imported_dictionary_entries=dictionary_count,
                unmatched_users=len(source_users.difference(mapped_destinations)),
            )
        finally:
            connection.close()

    def _read_mapping(self, mapping: Path) -> dict[str, tuple[str, str]]:
        """Validate explicit old-ID to issuer-subject mappings.

        Args:
            mapping: JSON mapping file path.

        Returns:
            Mapping from earlier user IDs to OIDC issuer-subject pairs.

        Raises:
            ValueError: If the JSON representation is malformed.
        """
        try:
            payload: Any = json.loads(mapping.read_text())
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError("import mapping file cannot be read") from error
        if not isinstance(payload, dict):
            raise ValueError("import mapping must be an object")
        result: dict[str, tuple[str, str]] = {}
        for old_id, identity in payload.items():
            if not isinstance(old_id, str) or not isinstance(identity, dict):
                raise ValueError("import mapping is invalid")
            issuer = identity.get("issuer")
            subject = identity.get("subject")
            if not isinstance(issuer, str) or not isinstance(subject, str):
                raise ValueError("import mapping requires issuer and subject strings")
            result[old_id] = (issuer, subject)
        return result

    def _destination_users(self, mappings: dict[str, tuple[str, str]]) -> dict[str, User]:
        """Resolve mappings only through already linked issuer-subject local users.

        Args:
            mappings: Validated old user ID mappings.

        Returns:
            Destination users keyed by old user ID.

        Raises:
            ValueError: If any explicit mapping has no signed-in destination user.
        """
        resolved: dict[str, User] = {}
        with next(self._database.session()) as destination:
            for old_id, (issuer, subject) in mappings.items():
                user = destination.scalar(
                    select(User).where(User.issuer == issuer, User.subject == subject)
                )
                if user is None:
                    raise ValueError("mapped OIDC user has not signed in")
                resolved[old_id] = user
        return resolved

    def _copy_notes(
        self,
        source: sqlite3.Connection,
        destination: Session,
        old_user_id: str,
        new_user_id: str,
        apply: bool,
    ) -> int:
        """Copy source notes while preserving IDs, timestamps, and ownership.

        Args:
            source: Read-only earlier SQLite connection.
            destination: Open destination database session.
            old_user_id: Explicitly mapped earlier owner.
            new_user_id: Destination API owner.
            apply: Whether to add rows to the destination session.

        Returns:
            Number of rows copied, or that a dry run would copy. Rows whose ID already
            exists are skipped.
        """
        count = 0
        for row in source.execute("SELECT * FROM notes WHERE user_id = ?", (old_user_id,)):
            if destination.get(Note, row["id"]) is not None:
                continue
            count += 1
            if apply:
                destination.add(
                    Note(
                        id=row["id"],
                        user_id=new_user_id,
                        title=row["title"],
                        content=row["content"],
                        summary=row["summary"],
                        pinned=bool(row["pinned"]),
                        created_at=self._timestamp(row["created_at"]),
                        updated_at=self._timestamp(row["updated_at"]),
                    )
                )
        return count

    def _copy_transcripts(
        self,
        source: sqlite3.Connection,
        destination: Session,
        old_user_id: str,
        new_user_id: str,
        apply: bool,
    ) -> int:
        """Copy source transcripts while preserving IDs and ownership.

        Args:
            source: Read-only earlier SQLite connection.
            destination: Open destination database session.
            old_user_id: Explicitly mapped earlier owner.
            new_user_id: Destination API owner.
            apply: Whether to add rows to the destination session.

        Returns:
            Number of rows copied, or that a dry run would copy. Rows whose ID already
            exists are skipped.
        """
        count = 0
        for row in source.execute("SELECT * FROM transcripts WHERE user_id = ?", (old_user_id,)):
            if destination.get(Transcript, row["id"]) is not None:
                continue
            count += 1
            if apply:
                destination.add(
                    Transcript(
                        id=row["id"],
                        user_id=new_user_id,
                        text=row["text"],
                        raw_text=row["raw_text"],
                        language=row["language"],
                        created_at=self._timestamp(row["created_at"]),
                    )
                )
        return count

    def _copy_dictionary(
        self,
        source: sqlite3.Connection,
        destination: Session,
        old_user_id: str,
        new_user_id: str,
        apply: bool,
    ) -> int:
        """Copy source dictionary entries while preserving IDs and ownership.

        Args:
            source: Read-only earlier SQLite connection.
            destination: Open destination database session.
            old_user_id: Explicitly mapped earlier owner.
            new_user_id: Destination API owner.
            apply: Whether to add rows to the destination session.

        Returns:
            Number of rows copied, or that a dry run would copy. Rows whose ID already exists, or
            whose phrase the destination user already has, are skipped.
        """
        existing = set(
            destination.scalars(
                select(DictionaryEntry.phrase).where(DictionaryEntry.user_id == new_user_id)
            )
        )
        count = 0
        for row in source.execute(
            "SELECT * FROM dictionary_entries WHERE user_id = ?", (old_user_id,)
        ):
            if row["phrase"] in existing or destination.get(DictionaryEntry, row["id"]) is not None:
                continue
            existing.add(row["phrase"])
            count += 1
            if apply:
                created_at = self._timestamp(row["created_at"])
                updated = row["updated_at"] if "updated_at" in row.keys() else None  # noqa: SIM118
                destination.add(
                    DictionaryEntry(
                        id=row["id"],
                        user_id=new_user_id,
                        phrase=row["phrase"],
                        replacement=row["replacement"],
                        created_at=created_at,
                        updated_at=self._timestamp(updated) if updated else created_at,
                    )
                )
        return count

    def _timestamp(self, value: object) -> datetime:
        """Parse a persisted source UTC timestamp without guessing ownership.

        Args:
            value: Source SQLite timestamp column value.

        Returns:
            Parsed timestamp preserved for destination persistence.

        Raises:
            ValueError: If a source timestamp is not a valid ISO-8601 string.
        """
        if not isinstance(value, str):
            raise ValueError("source timestamp is invalid")
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
