"""Catalog, verified download and integrity coverage for on-device speech models."""

from __future__ import annotations

import asyncio
import hashlib
import json
from pathlib import Path

import httpx
import pytest
from whisperer_api.model_store import (
    CATALOG,
    ModelFile,
    ModelIntegrityError,
    ModelSpec,
    ModelStore,
    UnsupportedModelError,
)

_FILES = {"config.json": b'{"model_type": "nemo-conformer-tdt"}', "vocab.txt": b"a 0\nb 1\n"}


def _spec(files: dict[str, bytes] | None = None) -> ModelSpec:
    """Build a synthetic two-file catalog entry with real digests."""
    files = files or _FILES
    return ModelSpec(
        id="example/tiny-onnx",
        repository="example/tiny-onnx",
        revision="0123456789abcdef0123456789abcdef01234567",
        model_type="nemo-conformer-tdt",
        quantization=None,
        title="Tiny",
        license="cc-by-4.0",
        languages=("en",),
        files=tuple(
            ModelFile(name, len(content), hashlib.sha256(content).hexdigest())
            for name, content in files.items()
        ),
    )


def _client(served: dict[str, bytes], seen: list[str]) -> httpx.AsyncClient:
    """Serve pinned resolve URLs from memory and record requested URLs."""

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        name = request.url.path.rsplit("/", 1)[-1]
        if name not in served:
            return httpx.Response(404)
        return httpx.Response(200, content=served[name])

    return httpx.AsyncClient(transport=httpx.MockTransport(handle))


def test_catalog_pins_real_supported_artifacts() -> None:
    """Pin the production model to a commit, its onnx-asr family and every file digest."""
    spec = CATALOG["istupakov/parakeet-tdt-0.6b-v3-onnx"]
    assert spec.repository == "istupakov/parakeet-tdt-0.6b-v3-onnx"
    assert len(spec.revision) == 40
    assert spec.model_type == "nemo-conformer-tdt"
    names = {file.path for file in spec.files}
    assert {"config.json", "vocab.txt"} <= names
    assert any(name.startswith("encoder-model") for name in names)
    assert any(name.startswith("decoder_joint-model") for name in names)
    for current in CATALOG.values():
        assert current.model_type in {"nemo-conformer-tdt", "whisper-ort"}
        for file in current.files:
            assert len(file.sha256) == 64
            assert file.size > 0
            assert "/" not in file.path
            assert ".." not in file.path
            assert not file.path.endswith(".py")


def test_unknown_model_is_rejected(tmp_path: Path) -> None:
    """Never resolve an arbitrary repository outside the catalog."""
    store = ModelStore(tmp_path, lambda: _client({}, []))
    with pytest.raises(UnsupportedModelError):
        store.spec("someone/custom-executable-model")


def test_download_verifies_and_installs_atomically(tmp_path: Path) -> None:
    """Install only after every file matches its pinned size and digest."""
    spec = _spec()
    seen: list[str] = []
    progress: list[tuple[int, int]] = []
    store = ModelStore(tmp_path, lambda: _client(_FILES, seen), catalog={spec.id: spec})
    assert not store.is_installed(spec)

    path = asyncio.run(store.download(spec, lambda done, total: progress.append((done, total))))

    assert store.is_installed(spec)
    assert path == store.install_path(spec)
    assert (path / "vocab.txt").read_bytes() == _FILES["vocab.txt"]
    manifest = json.loads((path / "manifest.json").read_text())
    assert manifest["revision"] == spec.revision
    assert all(f"/resolve/{spec.revision}/" in url for url in seen)
    assert all(url.startswith("https://huggingface.co/example/tiny-onnx/") for url in seen)
    assert progress[-1] == (spec.total_bytes, spec.total_bytes)
    assert not [child for child in tmp_path.iterdir() if child.name.startswith(".staging")]
    store.verify(spec)


def test_corrupt_download_leaves_nothing_installed(tmp_path: Path) -> None:
    """Reject a file whose bytes do not match the pinned digest."""
    spec = _spec()
    served = {**_FILES, "vocab.txt": b"x" * len(_FILES["vocab.txt"])}
    store = ModelStore(tmp_path, lambda: _client(served, []), catalog={spec.id: spec})

    with pytest.raises(ModelIntegrityError):
        asyncio.run(store.download(spec, lambda done, total: None))

    assert not store.is_installed(spec)
    assert list(tmp_path.iterdir()) == []


def test_oversized_download_is_cut_off(tmp_path: Path) -> None:
    """Stop reading as soon as a response exceeds its pinned size."""
    spec = _spec()
    served = {**_FILES, "config.json": _FILES["config.json"] + b"extra"}
    store = ModelStore(tmp_path, lambda: _client(served, []), catalog={spec.id: spec})

    with pytest.raises(ModelIntegrityError):
        asyncio.run(store.download(spec, lambda done, total: None))
    assert not store.is_installed(spec)


def test_http_failure_is_reported_without_install(tmp_path: Path) -> None:
    """Surface a missing upstream file as a failed download."""
    spec = _spec()
    store = ModelStore(
        tmp_path,
        lambda: _client({"config.json": _FILES["config.json"]}, []),
        catalog={spec.id: spec},
    )
    with pytest.raises(ModelIntegrityError):
        asyncio.run(store.download(spec, lambda done, total: None))
    assert not store.is_installed(spec)


def test_tampered_install_fails_verification(tmp_path: Path) -> None:
    """Detect a modified installed file before loading it."""
    spec = _spec()
    store = ModelStore(tmp_path, lambda: _client(_FILES, []), catalog={spec.id: spec})
    path = asyncio.run(store.download(spec, lambda done, total: None))
    (path / "vocab.txt").write_bytes(b"z" * len(_FILES["vocab.txt"]))

    with pytest.raises(ModelIntegrityError):
        store.verify(spec)


def test_stale_staging_directories_are_removed(tmp_path: Path) -> None:
    """Clean interrupted downloads left by a previous process."""
    (tmp_path / ".staging-old").mkdir()
    (tmp_path / ".staging-old" / "part").write_bytes(b"1")
    ModelStore(tmp_path, lambda: _client({}, [])).clean_staging()
    assert not (tmp_path / ".staging-old").exists()


def test_failed_rename_keeps_previous_install(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Keep the existing verified install when replacing it fails."""
    spec = _spec()
    store = ModelStore(tmp_path, lambda: _client(_FILES, []), catalog={spec.id: spec})
    asyncio.run(store.download(spec, lambda done, total: None))
    original = Path.rename

    def failing_rename(self: Path, target: Path) -> Path:
        if self.name.startswith(".staging-"):
            raise OSError("disk full")
        return original(self, target)

    monkeypatch.setattr(Path, "rename", failing_rename)
    with pytest.raises(OSError):
        asyncio.run(store.download(spec, lambda done, total: None))
    monkeypatch.undo()
    assert store.is_installed(spec)
    store.verify(spec)
    assert not [child for child in tmp_path.iterdir() if child.name.startswith(".")]


def test_interrupted_replacement_is_restored(tmp_path: Path) -> None:
    """Restore an install that a crash left moved aside."""
    spec = _spec()
    store = ModelStore(tmp_path, lambda: _client(_FILES, []), catalog={spec.id: spec})
    path = asyncio.run(store.download(spec, lambda done, total: None))
    path.rename(path.with_name(f"{path.name}.previous"))
    assert not store.is_installed(spec)
    store.clean_staging()
    assert store.is_installed(spec)


def test_failed_restore_does_not_block_startup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Log and continue when a left-behind install cannot be restored."""
    spec = _spec()
    store = ModelStore(tmp_path, lambda: _client(_FILES, []), catalog={spec.id: spec})
    path = asyncio.run(store.download(spec, lambda done, total: None))
    path.rename(path.with_name(f"{path.name}.previous"))

    def failing_rename(self: Path, target: Path) -> Path:
        raise OSError("read-only")

    monkeypatch.setattr(Path, "rename", failing_rename)
    store.clean_staging()
    assert "could not restore" in caplog.text
