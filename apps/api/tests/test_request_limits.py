"""Request bodies are bounded and anonymous bodies are refused before parsing."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from fastapi.testclient import TestClient
from whisperer_api.main import create_app
from whisperer_api.persistence import User
from whisperer_api.request_limits import DEFAULT_LIMIT, UPLOAD_LIMIT, body_limit
from whisperer_api.settings import Settings

if TYPE_CHECKING:
    from collections.abc import Iterator
    from pathlib import Path


@pytest.fixture
def api(tmp_path: Path) -> Iterator[tuple[TestClient, dict[str, str]]]:
    """A remote API with one signed-in user."""
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
    with TestClient(app) as client:
        with next(dependencies.database.session()) as session:
            user = User(
                issuer="https://identity.example.test",
                subject="s",
                created_at=dependencies.clock.now(),
            )
            session.add(user)
            session.flush()
            pair = dependencies.sessions.issue(session, user)
            session.commit()
        yield client, {"Authorization": f"Bearer {pair.access_token}"}


def test_anonymous_bodies_are_refused_before_parsing(
    api: tuple[TestClient, dict[str, str]],
) -> None:
    """Without a valid token the answer is 401, never a validation error about the body."""
    client, _ = api
    assert client.post("/v1/sync", content=b"{not json").status_code == 401
    forged = {"Authorization": "Bearer not-a-token"}
    assert client.post("/v1/notes", headers=forged, content=b"x" * 1000).status_code == 401


def test_declared_oversized_bodies_are_refused(api: tuple[TestClient, dict[str, str]]) -> None:
    """A Content-Length over the route's limit is answered 413 without reading the body."""
    client, headers = api
    big = b"x" * (DEFAULT_LIMIT + 1)
    response = client.post(
        "/v1/notes", headers={**headers, "Content-Type": "application/json"}, content=big
    )
    assert response.status_code == 413, response.text
    assert response.headers["content-type"] == "application/problem+json"


def test_streamed_oversized_uploads_are_refused(api: tuple[TestClient, dict[str, str]]) -> None:
    """A chunked body without Content-Length is counted as it arrives."""
    client, headers = api

    def chunks() -> Iterator[bytes]:
        yield (
            b'--b\r\nContent-Disposition: form-data; name="file"; filename="a.webm"\r\n'
            b"Content-Type: audio/webm\r\n\r\n"
        )
        for _ in range(UPLOAD_LIMIT // (1024 * 1024) + 2):
            yield b"x" * (1024 * 1024)
        yield b"\r\n--b--\r\n"

    response = client.post(
        "/v1/transcriptions",
        headers={**headers, "Content-Type": "multipart/form-data; boundary=b"},
        content=chunks(),
    )
    assert response.status_code == 413, response.text


def test_ordinary_requests_still_work(api: tuple[TestClient, dict[str, str]]) -> None:
    """Normal authenticated writes pass through unchanged."""
    client, headers = api
    assert (
        client.post("/v1/notes", headers=headers, json={"title": "t", "content": "c"}).status_code
        == 201
    )


def test_route_limits() -> None:
    """Uploads and sync get room for audio and transcripts; everything else stays small."""
    assert body_limit("/v1/transcriptions") == UPLOAD_LIMIT
    assert body_limit("/v1/meetings/abc/segments/def") == UPLOAD_LIMIT
    assert body_limit("/v1/sync") > UPLOAD_LIMIT
    assert body_limit("/v1/notes") == DEFAULT_LIMIT
