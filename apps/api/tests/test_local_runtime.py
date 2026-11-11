"""On-device `serve-local` profile: boot protocol, loopback auth and local routes."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import os
import queue
import secrets
import subprocess
import sys
import threading
import time
import wave
from collections.abc import Iterator
from pathlib import Path
from typing import Any
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from whisperer_api.local_config import (
    BootDocument,
    BootProtocolError,
    EventWriter,
    LocalConfig,
    read_boot_document,
    read_local_config,
)
from whisperer_api.local_runtime import LocalProfile, create_local_app, wait_for_parent_exit
from whisperer_api.main import create_app
from whisperer_api.settings import Settings

_TOKEN = base64.urlsafe_b64encode(b"k" * 32).rstrip(b"=").decode()


def _config(tmp_path: Path, **overrides: Any) -> dict[str, Any]:
    """Return a valid desktop-written configuration document."""
    document: dict[str, Any] = {
        "version": 1,
        "instanceId": str(uuid4()),
        "dataDirectory": str(tmp_path / "data"),
        "speech": {"provider": "http", "baseUrl": "https://speech.example.test/v1", "model": "stt"},
        "llm": {"provider": "off"},
    }
    document.update(overrides)
    return document


def _wav() -> bytes:
    """Encode a short silent PCM16 WAV."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(16_000)
        output.writeframes(b"\0\0" * 1600)
    return buffer.getvalue()


class Upstream:
    """Fake every outbound HTTP call the local server could make."""

    def __init__(self) -> None:
        """Start with no observed requests."""
        self.requests: list[httpx.Request] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        """Answer speech and chat endpoints only."""
        self.requests.append(request)
        if request.url.path.endswith("/audio/transcriptions"):
            return httpx.Response(200, json={"text": "hello teh world"})
        if request.url.path.endswith("/chat/completions"):
            return httpx.Response(200, json={"choices": [{"message": {"content": "OK"}}]})
        return httpx.Response(404)


@pytest.fixture
def local(tmp_path: Path) -> Iterator[tuple[TestClient, Any, Upstream, LocalConfig]]:
    """Run the local profile in-process with a fake upstream."""
    config = LocalConfig.model_validate(_config(tmp_path))
    upstream = Upstream()
    events: list[dict[str, object]] = []
    profile = LocalProfile(
        config=config,
        boot=BootDocument.model_validate({"bootToken": _TOKEN, "speechApiKey": "speech-secret"}),
        emit=events.append,
        allowed_hosts=frozenset({"testserver"}),
        transport=httpx.MockTransport(upstream.handle),
    )
    app = create_local_app(profile)
    with TestClient(app) as client:
        yield client, app.state.dependencies, upstream, config


def _auth() -> dict[str, str]:
    """Return the boot-token bearer header."""
    return {"Authorization": f"Bearer {_TOKEN}"}


def test_config_requires_absolute_paths_and_rejects_unknown_fields(tmp_path: Path) -> None:
    """Refuse relative data paths, foreign keys such as a host, and secrets in the file."""
    LocalConfig.model_validate(_config(tmp_path))
    for bad in (
        _config(tmp_path, dataDirectory="relative/data"),
        _config(tmp_path, version=2),
        _config(tmp_path, host="0.0.0.0"),  # noqa: S104 - must be rejected
        _config(tmp_path, speech={"provider": "http", "baseUrl": "x", "model": "m", "apiKey": "k"}),
        _config(tmp_path, speech={"provider": "onnx", "model": "someone/arbitrary-repo"}),
        _config(tmp_path, llm={"provider": "http", "baseUrl": "ftp://llm", "model": "m"}),
    ):
        with pytest.raises(ValidationError):
            LocalConfig.model_validate(bad)


def test_config_file_must_be_absolute_and_bounded(tmp_path: Path) -> None:
    """Read only an absolute JSON file within the size bound."""
    path = tmp_path / "local.json"
    path.write_text(json.dumps(_config(tmp_path)))
    assert read_local_config(path).instance_id
    with pytest.raises(BootProtocolError):
        read_local_config(Path("local.json"))
    path.write_text(" " * 70_000)
    with pytest.raises(BootProtocolError):
        read_local_config(path)


def test_boot_document_is_one_bounded_line() -> None:
    """Accept one JSON line with a 32-byte base64url token and optional keys."""
    stream = io.BytesIO(
        json.dumps({"bootToken": _TOKEN, "speechApiKey": "", "llmApiKey": "k"}).encode()
        + b"\nignored"
    )
    boot = read_boot_document(stream)
    assert boot.speech_api_key is None
    assert boot.llm_api_key is not None
    assert boot.llm_api_key.get_secret_value() == "k"
    assert stream.read() == b"ignored"
    for raw in (
        b'{"bootToken": "short"}\n',
        json.dumps({"bootToken": _TOKEN, "extra": 1}).encode() + b"\n",
        b"x" * 20_000,
        b"",
        json.dumps({"bootToken": _TOKEN}).encode(),
    ):
        with pytest.raises(BootProtocolError):
            read_boot_document(io.BytesIO(raw))


def test_boot_document_repr_hides_secrets() -> None:
    """Never render secrets through repr or errors."""
    boot = BootDocument.model_validate({"bootToken": _TOKEN, "llmApiKey": "llm-secret"})
    assert _TOKEN not in repr(boot)
    assert "llm-secret" not in repr(boot)


def test_event_writer_bounds_and_sanitizes_lines() -> None:
    """Write one compact JSON object per line, never exceeding 4096 bytes."""
    sink = io.BytesIO()
    writer = EventWriter(sink)
    writer.emit({"event": "error", "code": "x", "message": "m" * 10_000 + "\nnext"})
    writer.emit({"event": "ready"})
    lines = sink.getvalue().split(b"\n")
    assert lines[-1] == b""
    assert all(len(line) <= 4096 for line in lines)
    first = json.loads(lines[0])
    assert first["event"] == "error"
    assert "\n" not in first["message"]
    assert json.loads(lines[1]) == {"event": "ready"}


def test_health_reports_instance_and_challenge_proves_token(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Expose instanceId publicly and answer an HMAC challenge keyed by the token text."""
    client, _, _, config = local
    health = client.get("/v1/health").json()
    assert health == {
        "status": "ok",
        "service": "whisperer",
        "version": 1,
        "instanceId": str(config.instance_id),
    }
    nonce = secrets.token_urlsafe(24)
    response = client.post("/v1/local/challenge", json={"nonce": nonce})
    assert response.status_code == 200
    expected = (
        base64.urlsafe_b64encode(hmac.new(_TOKEN.encode(), nonce.encode(), hashlib.sha256).digest())
        .rstrip(b"=")
        .decode()
    )
    assert response.json() == {"hmac": expected}
    assert client.post("/v1/local/challenge", json={"nonce": "x"}).status_code == 422


def test_every_resource_requires_the_boot_token(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Reject missing and wrong bearer tokens; accept the boot token."""
    client, _, _, _ = local
    assert client.get("/v1/me").status_code == 401
    assert client.get("/v1/me", headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get("/v1/notes", headers={"Authorization": _TOKEN}).status_code == 401
    me = client.get("/v1/me", headers=_auth())
    assert me.status_code == 200
    assert me.json()["user"]["onboardingCompleted"] is False
    assert client.get("/v1/inference/status").status_code == 401


def test_remote_sign_in_routes_are_absent(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Return 404 for browser sign-in, device polling and refresh in this profile."""
    client, _, _, _ = local
    code = str(uuid4())
    assert (
        client.get("/login", params={"device_code": code, "verifier_challenge": "c"}).status_code
        == 404
    )
    assert client.get("/auth/callback", params={"code": "c", "state": "s"}).status_code == 404
    assert client.get("/device/poll", params={"device_code": code}).status_code == 404
    assert client.get("/device/stream", params={"device_code": code}).status_code == 404
    assert client.post("/v1/auth/refresh", json={"refreshToken": "x"}).status_code == 404


def test_foreign_host_and_browser_origin_are_refused(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Defend loopback against DNS rebinding and cross-site browser requests."""
    client, _, _, _ = local
    assert client.get("/v1/health", headers={"Host": "attacker.example"}).status_code == 403
    assert (
        client.get("/v1/me", headers={**_auth(), "Origin": "https://attacker.example"}).status_code
        == 403
    )


def test_principal_persists_across_restarts(tmp_path: Path) -> None:
    """Resolve the same device user and data from the same data directory."""
    config = LocalConfig.model_validate(_config(tmp_path))
    boot = BootDocument.model_validate({"bootToken": _TOKEN})
    ids = []
    for index in range(2):
        app = create_local_app(
            LocalProfile(config, boot, lambda event: None, frozenset({"testserver"}))
        )
        with TestClient(app) as client:
            if index == 0:
                created = client.post(
                    "/v1/notes", headers=_auth(), json={"title": "t", "content": "c"}
                )
                assert created.status_code == 201
            ids.append(client.get("/v1/me", headers=_auth()).json()["user"]["id"])
            assert len(client.get("/v1/notes", headers=_auth()).json()["items"]) == 1
    assert ids[0] == ids[1]
    assert (tmp_path / "data" / "api.sqlite3").is_file()


def test_ready_needs_no_identity_provider(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Report readiness without OIDC configuration or any outbound traffic."""
    client, _, upstream, _ = local
    assert client.get("/v1/ready").json()["status"] == "ready"
    assert upstream.requests == []


def test_dictation_uses_local_speech_endpoint_and_dictionary_once(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Transcribe through the configured speech endpoint and its own key."""
    client, _, upstream, _ = local
    assert (
        client.post(
            "/v1/dictionary", headers=_auth(), json={"phrase": "teh", "replacement": "the"}
        ).status_code
        == 201
    )
    response = client.post(
        "/v1/transcriptions",
        headers=_auth(),
        params={"polish": "true"},
        files={"file": ("recording.wav", _wav(), "audio/wav")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["text"] == "hello the world"
    assert response.json()["dictionaryReplacements"] == 1
    (request,) = upstream.requests
    assert str(request.url) == "https://speech.example.test/v1/audio/transcriptions"
    assert request.headers["authorization"] == "Bearer speech-secret"


def test_transformations_return_409_when_llm_off(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Explain that the language model is off rather than failing upstream."""
    client, _, upstream, _ = local
    response = client.post(
        "/v1/text-transformations", headers=_auth(), json={"kind": "polish", "text": "hi"}
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Language model is off."
    assert upstream.requests == []


def test_meeting_questions_require_device_auth_and_an_enabled_model(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Keep on-device questions behind the boot token and current LLM configuration.

    Args:
        local: Isolated local profile fixture.
    """
    client, _, upstream, _ = local
    identifier = str(uuid4())
    assert client.post(
        f"/v1/meetings/{identifier}/questions", json={"question": "Anything?"}
    ).status_code == 401
    response = client.post(
        f"/v1/meetings/{identifier}/questions",
        headers=_auth(),
        json={"question": "Anything?"},
    )
    assert response.status_code == 409
    assert response.json()["detail"] == "Language model is off."
    assert upstream.requests == []


def test_inference_status_shape(local: tuple[TestClient, Any, Upstream, LocalConfig]) -> None:
    """Report speech and language-model readiness separately without secrets."""
    client, _, _, _ = local
    body = client.get("/v1/inference/status", headers=_auth()).json()
    assert body["speech"]["provider"] == "http"
    assert body["speech"]["model"] == "stt"
    assert body["speech"]["status"] == "ready"
    assert body["llm"] == {
        "provider": "off",
        "model": None,
        "status": "off",
        "message": "Language model is off.",
    }
    assert "speech-secret" not in json.dumps(body)


def test_inference_test_endpoint(local: tuple[TestClient, Any, Upstream, LocalConfig]) -> None:
    """Probe the speech provider on request and report the LLM as off."""
    client, _, upstream, _ = local
    speech = client.post("/v1/inference/test", headers=_auth(), json={"target": "speech"}).json()
    assert speech["ok"] is True
    assert isinstance(speech["latencyMs"], int)
    llm = client.post("/v1/inference/test", headers=_auth(), json={"target": "llm"}).json()
    assert llm["ok"] is False
    assert llm["message"] == "Language model is off."
    assert len(upstream.requests) == 1


def test_model_catalog_and_download_validation(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """List only catalog models and reject unknown model downloads."""
    client, _, upstream, _ = local
    models = client.get("/v1/inference/models", headers=_auth()).json()["items"]
    ids = [item["id"] for item in models]
    assert "istupakov/parakeet-tdt-0.6b-v3-onnx" in ids
    assert all(item["installed"] is False for item in models)
    rejected = client.post(
        "/v1/inference/models/download", headers=_auth(), json={"model": "evil/model"}
    )
    assert rejected.status_code == 422
    assert upstream.requests == []


def test_onnx_model_missing_keeps_server_usable(tmp_path: Path) -> None:
    """Start without a model, report it missing and download nothing implicitly."""
    config = LocalConfig.model_validate(
        _config(
            tmp_path, speech={"provider": "onnx", "model": "istupakov/parakeet-tdt-0.6b-v3-onnx"}
        )
    )
    upstream = Upstream()
    events: list[dict[str, object]] = []
    app = create_local_app(
        LocalProfile(
            config,
            BootDocument.model_validate({"bootToken": _TOKEN}),
            events.append,
            frozenset({"testserver"}),
            transport=httpx.MockTransport(upstream.handle),
        )
    )
    with TestClient(app) as client:
        status = client.get("/v1/inference/status", headers=_auth()).json()["speech"]
        assert status["status"] == "missing"
        assert status["model"] == "istupakov/parakeet-tdt-0.6b-v3-onnx"
        assert client.get("/v1/notes", headers=_auth()).status_code == 200
        dictation = client.post(
            "/v1/transcriptions",
            headers=_auth(),
            files={"file": ("recording.wav", _wav(), "audio/wav")},
        )
        assert dictation.status_code == 503
    assert upstream.requests == []
    assert {"event": "model", "status": "missing"}.items() <= next(
        event for event in events if event["event"] == "model"
    ).items()


def test_remote_profile_is_unchanged(tmp_path: Path) -> None:
    """Keep remote health shape, reject boot tokens and hide local routes."""
    settings = Settings(
        token_secret="0123456789abcdef0123456789abcdef",
        database_url=f"sqlite:///{tmp_path / 'remote.sqlite3'}",
    )
    app = create_app(settings)

    class NoNetwork:
        async def get(self, *args: object, **kwargs: object) -> httpx.Response:
            return httpx.Response(503)

        async def aclose(self) -> None:
            return None

    app.state.dependencies.http_client = NoNetwork()
    with TestClient(app) as client:
        assert client.get("/v1/health").json() == {
            "status": "ok",
            "service": "whisperer",
            "version": 1,
        }
        assert client.get("/v1/me", headers=_auth()).status_code == 401
        assert client.post("/v1/local/challenge", json={"nonce": "a" * 22}).status_code == 404
        assert client.get("/v1/inference/status", headers=_auth()).status_code == 404
        assert client.delete("/v1/local/data", headers=_auth()).status_code == 404


def test_delete_local_data_erases_every_owned_resource_and_audio(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Erase rows and audio for the device user, keep models, and keep the server usable."""
    client, _, _, config = local
    data = config.data_path
    models = data / "models" / "kept.bin"
    models.parent.mkdir(parents=True, exist_ok=True)
    models.write_bytes(b"model")
    assert (
        client.post("/v1/notes", headers=_auth(), json={"title": "t", "content": "c"}).status_code
        == 201
    )
    assert (
        client.post(
            "/v1/dictionary", headers=_auth(), json={"phrase": "teh", "replacement": "the"}
        ).status_code
        == 201
    )
    dictated = client.post(
        "/v1/transcriptions",
        headers=_auth(),
        files={"file": ("recording.wav", _wav(), "audio/wav")},
    )
    assert dictated.status_code == 200, dictated.text
    metric = client.put(
        f"/v1/dictation-metrics/{uuid4()}",
        headers=_auth(),
        json={
            "createdAt": "2026-01-01T00:00:00Z",
            "durationMs": 1000,
            "outputWords": 3,
            "dictionaryReplacements": 0,
            "timezone": "UTC",
        },
    )
    assert metric.status_code == 200, metric.text
    meeting = client.post(
        "/v1/meetings",
        headers=_auth(),
        json={"id": str(uuid4()), "title": "Synthetic", "startedAt": "2026-01-01T00:00:00Z"},
    )
    assert meeting.status_code == 201, meeting.text
    segment = client.post(
        f"/v1/meetings/{meeting.json()['id']}/segments/{uuid4()}",
        headers=_auth(),
        params={"durationMs": 1000},
        files={"file": ("segment.webm", b"synthetic-bytes", "audio/webm")},
    )
    assert segment.status_code == 201, segment.text
    audio_root = data / "meeting-audio"
    assert any(path.is_file() for path in audio_root.rglob("*"))
    before = client.get("/v1/me", headers=_auth()).json()["user"]["id"]

    assert client.delete("/v1/local/data").status_code == 401
    assert client.delete("/v1/local/data", headers=_auth()).status_code == 204

    assert not any(path.is_file() for path in audio_root.rglob("*"))
    assert audio_root.is_dir()
    assert models.read_bytes() == b"model"
    for path in ("/v1/notes", "/v1/dictionary", "/v1/transcripts", "/v1/meetings"):
        listed = client.get(path, headers=_auth())
        assert listed.status_code == 200, (path, listed.text)
        assert listed.json()["items"] == [], path
    assert client.get("/v1/metrics", headers=_auth()).json()["totalWords"] == 0
    assert client.get("/v1/me", headers=_auth()).json()["user"]["id"] != before
    database = (data / "api.sqlite3").read_bytes()
    assert b"hello teh world" not in database and b"hello the world" not in database
    assert client.delete("/v1/local/data", headers=_auth()).status_code == 204


def _read_event(process: subprocess.Popen[bytes], deadline: float) -> dict[str, Any]:
    """Read one stdout event line before the deadline."""
    assert process.stdout is not None
    while time.monotonic() < deadline:
        line = process.stdout.readline()
        if line:
            assert len(line) <= 4097
            return json.loads(line)
        if process.poll() is not None:
            break
    raise AssertionError("server produced no event")


def test_serve_local_process_boot_protocol(tmp_path: Path) -> None:
    """Boot the real command, verify the instance and exit when stdin closes."""
    config_path = tmp_path / "local.json"
    document = _config(
        tmp_path,
        speech={"provider": "http", "baseUrl": "http://127.0.0.1:9/v1", "model": "stt"},
    )
    config_path.write_text(json.dumps(document))
    config_path.chmod(0o600)
    stderr_path = tmp_path / "stderr.log"
    environment = {key: value for key, value in os.environ.items() if key in {"PATH", "SYSTEMROOT"}}
    with stderr_path.open("wb") as stderr:
        process = subprocess.Popen(  # noqa: S603
            [sys.executable, "-m", "whisperer_api", "serve-local", "--config", str(config_path)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=stderr,
            env=environment,
        )
        try:
            assert process.stdin is not None
            process.stdin.write(
                json.dumps({"bootToken": _TOKEN, "speechApiKey": "speech-secret"}).encode() + b"\n"
            )
            process.stdin.flush()
            deadline = time.monotonic() + 30
            events = [_read_event(process, deadline) for _ in range(3)]
            assert [event["event"] for event in events] == ["bind", "database", "ready"]
            port = events[0]["port"]
            assert isinstance(port, int)
            assert events[1]["status"] == "ready"
            base = f"http://127.0.0.1:{port}"
            health = httpx.get(f"{base}/v1/health").json()
            assert health["instanceId"] == document["instanceId"]
            nonce = secrets.token_urlsafe(16)
            proof = httpx.post(f"{base}/v1/local/challenge", json={"nonce": nonce}).json()["hmac"]
            expected = (
                base64.urlsafe_b64encode(
                    hmac.new(_TOKEN.encode(), nonce.encode(), hashlib.sha256).digest()
                )
                .rstrip(b"=")
                .decode()
            )
            assert hmac.compare_digest(proof, expected)
            assert httpx.get(f"{base}/v1/me").status_code == 401
            assert httpx.get(f"{base}/v1/me", headers=_auth()).status_code == 200
            assert httpx.get(f"http://localhost:{port}/v1/health").status_code == 200
            process.stdin.close()
            assert process.wait(timeout=15) == 0
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
    assert process.stdout is not None
    remaining = process.stdout.read()
    for line in remaining.splitlines():
        json.loads(line)
    logs = stderr_path.read_bytes()
    for secret in (_TOKEN.encode(), b"speech-secret"):
        assert secret not in logs
        assert secret not in remaining
    assert (tmp_path / "data" / "api.sqlite3").is_file()


def test_serve_local_rejects_bad_boot_document(tmp_path: Path) -> None:
    """Exit non-zero with a structured error when stdin carries no valid boot line."""
    config_path = tmp_path / "local.json"
    config_path.write_text(json.dumps(_config(tmp_path)))
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-m", "whisperer_api", "serve-local", "--config", str(config_path)],
        input=b'{"bootToken": "short"}\n',
        capture_output=True,
        timeout=30,
        check=False,
    )
    assert result.returncode != 0
    events = [json.loads(line) for line in result.stdout.splitlines()]
    assert events[-1]["event"] == "error"
    assert events[-1]["code"] == "boot_invalid"
    assert b"short" not in result.stderr


def test_model_download_starts_on_the_event_loop(tmp_path: Path) -> None:
    """Accept an explicit download, emit progress and finish with a ready event."""
    import hashlib

    from whisperer_api.model_store import ModelFile, ModelSpec

    content = b'{"model_type": "nemo-conformer-tdt"}'
    spec = ModelSpec(
        id="istupakov/parakeet-tdt-0.6b-v3-onnx",
        repository="istupakov/parakeet-tdt-0.6b-v3-onnx",
        revision="8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce",
        model_type="nemo-conformer-tdt",
        quantization="int8",
        title="Synthetic",
        license="cc-by-4.0",
        languages=("en",),
        files=(ModelFile("config.json", len(content), hashlib.sha256(content).hexdigest()),),
    )

    def serve(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=content)

    events: list[dict[str, object]] = []
    profile = LocalProfile(
        LocalConfig.model_validate(_config(tmp_path)),
        BootDocument.model_validate({"bootToken": _TOKEN}),
        events.append,
        frozenset({"testserver"}),
        transport=httpx.MockTransport(serve),
    )
    profile.store.catalog = {spec.id: spec}
    with TestClient(create_local_app(profile)) as client:
        response = client.post(
            "/v1/inference/models/download", headers=_auth(), json={"model": spec.id}
        )
        assert response.status_code == 202
        assert response.json() == {"model": spec.id, "status": "downloading"}
        deadline = time.monotonic() + 10
        while not any(event.get("status") == "ready" for event in events):
            assert time.monotonic() < deadline
            client.get("/v1/health")
            time.sleep(0.02)
        models = client.get("/v1/inference/models", headers=_auth()).json()["items"]
        assert models[0]["installed"] is True
    statuses = [event["status"] for event in events if event["event"] == "model"]
    assert statuses[0] == "downloading"
    assert statuses[-1] == "ready"


def test_malformed_origin_is_refused_not_crashed(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Answer a malformed web Origin with 403 rather than a server error."""
    client, _, _, _ = local
    for origin in ("http://[::1", "http://exa mple.test", "https://"):
        response = client.get("/v1/health", headers={"Origin": origin})
        assert response.status_code == 403, origin


def test_note_summary_with_llm_off_uses_shared_message(
    local: tuple[TestClient, Any, Upstream, LocalConfig],
) -> None:
    """Explain an off language model identically for summaries and transforms."""
    client, _, _, _ = local
    note = client.post("/v1/notes", headers=_auth(), json={"title": "t", "content": "c"}).json()
    response = client.post(f"/v1/notes/{note['id']}/summary", headers=_auth())
    assert response.status_code == 409
    assert response.json()["detail"] == "Language model is off."


def test_unconfigured_llm_transform_uses_shared_message(tmp_path: Path) -> None:
    """Return the same 409 message when no language model has been chosen."""
    document = _config(tmp_path)
    del document["llm"]
    profile = LocalProfile(
        LocalConfig.model_validate(document),
        BootDocument.model_validate({"bootToken": _TOKEN}),
        lambda event: None,
        frozenset({"testserver"}),
    )
    with TestClient(create_local_app(profile)) as client:
        response = client.post(
            "/v1/text-transformations", headers=_auth(), json={"kind": "polish", "text": "x"}
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "Language model is off."


def test_note_summary_provider_failure_is_502(tmp_path: Path) -> None:
    """Report an unusable language-model response as 502, not a note conflict."""

    def broken(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    profile = LocalProfile(
        LocalConfig.model_validate(
            _config(
                tmp_path, llm={"provider": "http", "baseUrl": "http://127.0.0.1:9/v1", "model": "m"}
            )
        ),
        BootDocument.model_validate({"bootToken": _TOKEN}),
        lambda event: None,
        frozenset({"testserver"}),
        transport=httpx.MockTransport(broken),
    )
    with TestClient(create_local_app(profile)) as client:
        note = client.post("/v1/notes", headers=_auth(), json={"title": "t", "content": "c"}).json()
        response = client.post(f"/v1/notes/{note['id']}/summary", headers=_auth())
        assert response.status_code == 502
        assert "changed" not in response.json()["detail"]


def test_parent_watch_polls_until_the_pipe_closes() -> None:
    """The Windows poller drains late input, sleeps while idle and stops on a closed pipe."""
    answers: list[int | None] = [0, 3, 0, None]
    sleeps: list[float] = []
    stdin = io.BytesIO(b"abc")

    wait_for_parent_exit(stdin, peek=lambda: answers.pop(0), sleep=sleeps.append)

    assert answers == []
    assert stdin.read() == b""
    assert len(sleeps) == 2


def test_parent_watch_reads_to_eof_without_a_pipe() -> None:
    """A stdin that is not a pipe falls back to reading until end of file."""
    stdin = io.BytesIO(b"x" * 10_000)

    wait_for_parent_exit(stdin)

    assert stdin.read() == b""


_NATIVE_LOAD_SCRIPT = """
import sys, threading
from whisperer_api.local_runtime import wait_for_parent_exit

watcher = threading.Thread(target=wait_for_parent_exit, args=(sys.stdin.buffer,), daemon=True)
watcher.start()

def load() -> None:
    import numpy
    import onnxruntime
    print("loaded", flush=True)

loader = threading.Thread(target=load)
loader.start()
loader.join()
watcher.join()
print("parent gone", flush=True)
"""


@pytest.mark.skipif(sys.platform != "win32", reason="the stdin pipe stall is specific to Windows")
def test_native_extensions_load_while_the_parent_watch_runs() -> None:
    """Regression: a blocking stdin read on Windows stalled numpy and the speech model forever."""
    pytest.importorskip("onnxruntime")
    process = subprocess.Popen(  # noqa: S603
        [sys.executable, "-c", _NATIVE_LOAD_SCRIPT],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        assert process.stdout is not None
        assert process.stdin is not None
        lines: queue.Queue[bytes] = queue.Queue()
        threading.Thread(target=lambda: lines.put(process.stdout.readline()), daemon=True).start()
        # Before the fix the loader never returned while stdin stayed open.
        assert lines.get(timeout=60).strip() == b"loaded"
        process.stdin.close()
        stdout, _ = process.communicate(timeout=30)
        assert stdout.strip() == b"parent gone"
        assert process.returncode == 0
    finally:
        process.kill()
        process.wait()
