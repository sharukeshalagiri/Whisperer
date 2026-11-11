"""Hardening: ownership on every route, upload types, logs, loopback binding and upgrades."""

from __future__ import annotations

import logging
import re
import socket
import sqlite3
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from whisperer_api.main import create_app
from whisperer_api.persistence import Database, User
from whisperer_api.resources import ResourceService
from whisperer_api.settings import Settings

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


class _Gateway:
    """Deterministic inference that never leaves the process."""

    async def transcribe(
        self, audio: bytes, filename: str, content_type: str, language: str | None
    ) -> str:
        return "PRIVATE-TRANSCRIPT-MARKER spoken words"

    async def polish(self, text: str) -> str:
        return text


@pytest.fixture
def two_users(tmp_path: Path) -> Iterator[tuple[TestClient, Any, dict[str, str], dict[str, str]]]:
    """A remote API with owner A and another account B."""
    settings = Settings(
        oidc_issuer_url="https://identity.example.test",
        oidc_client_id="client",
        oidc_client_secret="secret",
        public_url="https://api.example.test",
        token_secret="0123456789abcdef0123456789abcdef",
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-secret",
        database_url=f"sqlite:///{tmp_path / 'api.sqlite3'}",
    )
    app = create_app(settings)
    dependencies = app.state.dependencies
    dependencies.resources = ResourceService(dependencies.clock, _Gateway())
    with TestClient(app) as client:
        headers = []
        with next(dependencies.database.session()) as session:
            for subject in ("owner-a", "other-b"):
                user = User(
                    issuer="https://identity.example.test",
                    subject=subject,
                    created_at=dependencies.clock.now(),
                )
                session.add(user)
                session.flush()
                token = dependencies.sessions.issue(session, user).access_token
                headers.append({"Authorization": f"Bearer {token}"})
            session.commit()
        yield client, dependencies, headers[0], headers[1]


def test_another_users_resources_are_never_reachable(
    two_users: tuple[TestClient, Any, dict[str, str], dict[str, str]],
) -> None:
    """Every route type that takes a resource id answers 403 or 404 to another account."""
    client, _, owner, other = two_users
    note = client.post("/v1/notes", headers=owner, json={"title": "t", "content": "secret"}).json()
    entry = client.post(
        "/v1/dictionary", headers=owner, json={"phrase": "acme", "replacement": "ACME"}
    ).json()
    meeting_id = str(uuid4())
    meeting = client.post(
        "/v1/meetings",
        headers=owner,
        json={"id": meeting_id, "title": "Board", "startedAt": "2026-11-11T10:00:00Z"},
    )
    assert meeting.status_code == 201, meeting.text
    revision = {"If-Match": str(meeting.json()["revision"])}
    meeting_path = f"/v1/meetings/{meeting_id}"
    attempts: list[tuple[str, str, dict[str, Any]]] = [
        ("PATCH", f"/v1/notes/{note['id']}", {"json": {"content": "x"}}),
        ("PUT", f"/v1/notes/{note['id']}", {"json": {"title": "x", "content": "x"}}),
        ("DELETE", f"/v1/notes/{note['id']}", {}),
        ("POST", f"/v1/notes/{note['id']}/summary", {}),
        ("PATCH", f"/v1/dictionary/{entry['id']}", {"json": {"replacement": "x"}}),
        ("PUT", f"/v1/dictionary/{entry['id']}", {"json": {"phrase": "acme", "replacement": "x"}}),
        ("DELETE", f"/v1/dictionary/{entry['id']}", {}),
        ("GET", meeting_path, {}),
        ("PATCH", meeting_path, {"json": {"title": "x"}, "headers": revision}),
        ("DELETE", meeting_path, {}),
        ("POST", f"{meeting_path}/resume", {}),
        ("POST", f"{meeting_path}/finish", {}),
        ("POST", f"{meeting_path}/summary/regenerate", {}),
        ("POST", f"{meeting_path}/questions", {"json": {"question": "What was decided?"}}),
        ("GET", f"{meeting_path}/audio", {}),
        ("GET", f"{meeting_path}/transcript", {}),
        ("PATCH", f"{meeting_path}/transcript", {"json": {"text": "x"}, "headers": revision}),
        ("GET", f"{meeting_path}/summary", {}),
        ("PATCH", f"{meeting_path}/summary", {"json": {"text": "x"}, "headers": revision}),
        (
            "POST",
            f"{meeting_path}/segments/{uuid4()}",
            {
                "params": {"durationMs": 1000},
                "files": {"file": ("a.webm", b"audio", "audio/webm")},
            },
        ),
        ("POST", f"{meeting_path}/segments/{uuid4()}/retry", {}),
        ("DELETE", f"/v1/transcripts/{uuid4()}", {}),
    ]
    for method, path, options in attempts:
        extra_headers = options.pop("headers", {})
        response = client.request(method, path, headers={**other, **extra_headers}, **options)
        assert response.status_code in {403, 404}, f"{method} {path} -> {response.status_code}"
    # Taking over the owner's meeting id is refused too.
    takeover = client.post(
        "/v1/meetings",
        headers=other,
        json={"id": meeting_id, "title": "Mine", "startedAt": "2026-11-11T10:00:00Z"},
    )
    assert takeover.status_code in {403, 404, 409}
    # The owner's data is untouched.
    notes = client.get("/v1/notes", headers=owner).json()["items"]
    assert [item["content"] for item in notes] == ["secret"]
    assert client.get(meeting_path, headers=owner).json()["title"] == "Board"


def test_non_audio_uploads_are_refused(
    two_users: tuple[TestClient, Any, dict[str, str], dict[str, str]],
) -> None:
    """A transcription upload must declare an audio type."""
    client, _, owner, _ = two_users
    response = client.post(
        "/v1/transcriptions",
        headers=owner,
        files={"file": ("a.exe", b"MZ\x90\x00", "application/octet-stream")},
    )
    assert response.status_code == 415


def test_logs_never_contain_transcript_text(
    two_users: tuple[TestClient, Any, dict[str, str], dict[str, str]],
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Dictation text and note content stay out of every log record, at every level."""
    client, _, owner, _ = two_users
    caplog.set_level(logging.DEBUG)
    transcript = client.post(
        "/v1/transcriptions",
        headers=owner,
        files={"file": ("clip.webm", b"audio", "audio/webm")},
        data={"polish": "true"},
    )
    assert transcript.status_code == 200
    assert "PRIVATE-TRANSCRIPT-MARKER" in transcript.json()["text"]
    client.post("/v1/notes", headers=owner, json={"title": "t", "content": "PRIVATE-NOTE-MARKER"})
    assert "PRIVATE-TRANSCRIPT-MARKER" not in caplog.text
    assert "PRIVATE-NOTE-MARKER" not in caplog.text


def test_the_on_device_server_binds_loopback_only(monkeypatch: pytest.MonkeyPatch) -> None:
    """serve-local opens its port on 127.0.0.1 and nowhere else."""
    from whisperer_api import local_runtime

    bound: list[object] = []

    class _Socket(socket.socket):
        def bind(self, address: Any) -> None:  # type: ignore[override]
            bound.append(address)
            raise OSError("stop after bind")

    monkeypatch.setattr(local_runtime.socket, "socket", _Socket)
    monkeypatch.setattr(local_runtime, "read_local_config", lambda path: object())
    monkeypatch.setattr(local_runtime, "read_boot_document", lambda stdin: object())
    events: list[dict[str, object]] = []

    class _Events:
        def emit(self, event: dict[str, object]) -> None:
            events.append(event)

    server = local_runtime.LocalServer.__new__(local_runtime.LocalServer)
    server._config_path = None  # type: ignore[attr-defined]
    server._stdin = None  # type: ignore[attr-defined]
    server._events = _Events()  # type: ignore[attr-defined]
    assert server.run() == 1
    assert bound == [("127.0.0.1", 0)]
    assert events[-1]["code"] == "bind_failed"


def test_a_beta1_api_database_upgrades_without_losing_data(tmp_path: Path) -> None:
    """A database written before the approval and refresh-family columns opens with its rows."""
    path = tmp_path / "api.sqlite3"
    url = f"sqlite:///{path}"
    Database(url).create_schema()
    with sqlite3.connect(path) as connection:
        # Recreate the 0.2.0-beta.1 tables, which did not have these columns yet.
        ddl = connection.execute(
            "SELECT sql FROM sqlite_master WHERE name = 'api_device_authorizations'"
        ).fetchone()[0]
        kept = [line for line in ddl.splitlines() if "approval_token_hash" not in line]
        beta1_ddl = re.sub(r",\s*\n\)", "\n)", "\n".join(kept))
        connection.execute("DROP TABLE api_device_authorizations")
        connection.execute(beta1_ddl)
        connection.execute("DROP INDEX IF EXISTS ix_api_refresh_sessions_family_id")
        connection.execute("ALTER TABLE api_refresh_sessions DROP COLUMN family_id")
        connection.execute(
            "INSERT INTO api_users (id, issuer, subject, created_at, onboarding_completed)"
            " VALUES ('u1', 'https://identity.example.test', 's', '2026-11-01 00:00:00', 1)"
        )
        connection.execute(
            "INSERT INTO api_notes (id, user_id, title, content, summary, pinned, revision,"
            " created_at, updated_at) VALUES ('n1', 'u1', 'Kept', 'beta.1 note', '', 0, 1,"
            " '2026-11-01 00:00:00', '2026-11-01 00:00:00')"
        )
    connection.close()

    Database(url).create_schema()

    with sqlite3.connect(path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(api_refresh_sessions)")}
        device_columns = {
            row[1] for row in connection.execute("PRAGMA table_info(api_device_authorizations)")
        }
        content = connection.execute("SELECT content FROM api_notes WHERE id = 'n1'").fetchone()
    connection.close()
    assert "family_id" in columns
    assert "approval_token_hash" in device_columns
    assert content == ("beta.1 note",)
