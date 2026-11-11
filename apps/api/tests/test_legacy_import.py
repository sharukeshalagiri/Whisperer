"""Tests for the dry-run-first import from Whisperer's earlier Node.js API database."""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import func, select
from whisperer_api.legacy_import import LegacyImporter
from whisperer_api.persistence import Database, DictionaryEntry, Note, Transcript, User

ISSUER = "https://id.example.com/"
CREATED = "2025-03-01T10:00:00Z"
UPDATED = "2025-03-02T11:30:00Z"


def _source(path: Path) -> Path:
    """Write an earlier-schema SQLite fixture with two users and their content.

    Args:
        path: Fixture file to create.

    Returns:
        The fixture path.
    """
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        CREATE TABLE users (id TEXT PRIMARY KEY);
        CREATE TABLE notes (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, content TEXT,
            summary TEXT, pinned INTEGER, created_at TEXT, updated_at TEXT);
        CREATE TABLE transcripts (id TEXT PRIMARY KEY, user_id TEXT, text TEXT, raw_text TEXT,
            language TEXT, created_at TEXT);
        CREATE TABLE dictionary_entries (id TEXT PRIMARY KEY, user_id TEXT, phrase TEXT,
            replacement TEXT, created_at TEXT);
        """
    )
    for user in ("old-alice", "old-bob"):
        connection.execute("INSERT INTO users VALUES (?)", (user,))
        connection.execute(
            "INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (f"note-{user}", user, "Title", "Body", None, 1, CREATED, UPDATED),
        )
        connection.execute(
            "INSERT INTO transcripts VALUES (?, ?, ?, ?, ?, ?)",
            (f"transcript-{user}", user, "Hello.", "hello", "en", CREATED),
        )
        connection.execute(
            "INSERT INTO dictionary_entries VALUES (?, ?, ?, ?, ?)",
            (f"dict-{user}", user, "whisper", "Whisperer", CREATED),
        )
    connection.commit()
    connection.close()
    return path


@pytest.fixture
def database(tmp_path: Path) -> Database:
    """Create an API database where only the mapped user has signed in.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        The destination database.
    """
    database = Database(f"sqlite:///{tmp_path / 'api.sqlite3'}")
    database.create_schema()
    with next(database.session()) as session:
        session.add(
            User(id="new-alice", issuer=ISSUER, subject="alice", created_at=datetime.now(UTC))
        )
        session.commit()
    return database


def _mapping(tmp_path: Path) -> Path:
    """Write a mapping that names only the first earlier user.

    Args:
        tmp_path: Private pytest directory.

    Returns:
        The mapping file path.
    """
    mapping = tmp_path / "mapping.json"
    mapping.write_text(json.dumps({"old-alice": {"issuer": ISSUER, "subject": "alice"}}))
    return mapping


def _counts(database: Database) -> tuple[int, int, int]:
    """Count notes, transcripts and dictionary entries in the destination.

    Args:
        database: Destination database.

    Returns:
        Row counts for notes, transcripts and dictionary entries.
    """
    with next(database.session()) as session:
        return (
            session.scalar(select(func.count()).select_from(Note)) or 0,
            session.scalar(select(func.count()).select_from(Transcript)) or 0,
            session.scalar(select(func.count()).select_from(DictionaryEntry)) or 0,
        )


def test_dry_run_reports_candidates_and_changes_nothing(database: Database, tmp_path: Path) -> None:
    source = _source(tmp_path / "old.sqlite3")
    before = hashlib.sha256(source.read_bytes()).hexdigest()

    result = LegacyImporter(database).run(source, _mapping(tmp_path), apply=False)

    assert result.dry_run is True
    assert result.mapped_users == 1
    assert result.unmatched_users == 1
    assert (result.imported_notes, result.imported_transcripts) == (1, 1)
    assert result.imported_dictionary_entries == 1
    assert _counts(database) == (0, 0, 0)
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before


def test_apply_copies_only_mapped_users_and_is_idempotent(
    database: Database, tmp_path: Path
) -> None:
    source = _source(tmp_path / "old.sqlite3")
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    mapping = _mapping(tmp_path)

    result = LegacyImporter(database).run(source, mapping, apply=True)

    assert result.dry_run is False
    assert _counts(database) == (1, 1, 1)
    with next(database.session()) as session:
        owners = {
            *session.scalars(select(Note.user_id)),
            *session.scalars(select(Transcript.user_id)),
            *session.scalars(select(DictionaryEntry.user_id)),
        }
        note = session.get(Note, "note-old-alice")
        entry = session.get(DictionaryEntry, "dict-old-alice")
    assert owners == {"new-alice"}
    assert note is not None
    assert note.pinned is True
    assert note.updated_at == datetime(2025, 3, 2, 11, 30, tzinfo=UTC)
    assert entry is not None
    assert entry.updated_at == entry.created_at
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before

    again = LegacyImporter(database).run(source, mapping, apply=True)
    assert (again.imported_notes, again.imported_transcripts) == (0, 0)
    assert again.imported_dictionary_entries == 0
    assert _counts(database) == (1, 1, 1)


def test_apply_skips_a_phrase_the_user_already_has(database: Database, tmp_path: Path) -> None:
    source = _source(tmp_path / "old.sqlite3")
    now = datetime.now(UTC)
    with next(database.session()) as session:
        session.add(
            DictionaryEntry(
                user_id="new-alice",
                phrase="whisper",
                replacement="Mine",
                created_at=now,
                updated_at=now,
            )
        )
        session.commit()

    result = LegacyImporter(database).run(source, _mapping(tmp_path), apply=True)

    assert result.imported_dictionary_entries == 0
    with next(database.session()) as session:
        assert list(session.scalars(select(DictionaryEntry.replacement))) == ["Mine"]


def test_mapping_to_a_user_who_never_signed_in_is_refused(
    database: Database, tmp_path: Path
) -> None:
    source = _source(tmp_path / "old.sqlite3")
    mapping = tmp_path / "mapping.json"
    mapping.write_text(json.dumps({"old-bob": {"issuer": ISSUER, "subject": "bob"}}))

    with pytest.raises(ValueError, match="has not signed in"):
        LegacyImporter(database).run(source, mapping, apply=True)
    assert _counts(database) == (0, 0, 0)
