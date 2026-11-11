"""Pinned speech-model catalog with verified, atomic downloads.

Only catalog entries can be installed. Each entry pins a Hugging Face commit,
an onnx-asr model family and the size and SHA-256 of every file onnx-asr
loads. Files are fetched by exact revision, checked while streaming, staged
in a private directory and renamed into place only after every file matches.
No model-supplied code is ever executed.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING

import httpx

_LOGGER = logging.getLogger(__name__)

if TYPE_CHECKING:
    from pathlib import Path

_HUB = "https://huggingface.co"
_CHUNK_BYTES = 1024 * 1024
_MANIFEST = "manifest.json"


class UnsupportedModelError(ValueError):
    """Signal a model identifier outside the pinned catalog.

    Args:
        model: Rejected identifier.
    """


class ModelIntegrityError(RuntimeError):
    """Signal a download or installed file that does not match its pin.

    Args:
        message: Safe explanation naming the stage.
    """


@dataclass(frozen=True, slots=True)
class ModelFile:
    """Pin one file inside a model repository.

    Args:
        path: File name at the repository root.
        size: Exact byte size.
        sha256: Lowercase hexadecimal SHA-256 digest.
    """

    path: str
    size: int
    sha256: str


@dataclass(frozen=True, slots=True)
class ModelSpec:
    """Describe one supported on-device speech model.

    Args:
        id: Stable catalog identifier shown to users.
        repository: Hugging Face repository holding the files.
        revision: Full commit hash the files are fetched from.
        model_type: onnx-asr model family name.
        quantization: onnx-asr quantization suffix, if any.
        title: Short display name.
        license: SPDX license identifier of the weights.
        languages: ISO language codes the model transcribes.
        files: Every file onnx-asr loads, pinned by size and digest.
        window_seconds: Longest audio window passed to the model at once.
    """

    id: str
    repository: str
    revision: str
    model_type: str
    quantization: str | None
    title: str
    license: str
    languages: tuple[str, ...]
    files: tuple[ModelFile, ...]
    window_seconds: float = 30.0

    @property
    def total_bytes(self) -> int:
        """Return the summed size of every pinned file.

        Args:
            None.

        Returns:
            Download size in bytes.
        """
        return sum(file.size for file in self.files)


_PARAKEET_LANGUAGES = (
    "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fr", "hr", "hu", "it",
    "lt", "lv", "mt", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "uk",
)  # fmt: skip

CATALOG: dict[str, ModelSpec] = {
    spec.id: spec
    for spec in (
        ModelSpec(
            id="istupakov/parakeet-tdt-0.6b-v3-onnx",
            repository="istupakov/parakeet-tdt-0.6b-v3-onnx",
            revision="8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce",
            model_type="nemo-conformer-tdt",
            quantization="int8",
            title="Parakeet TDT 0.6B v3 (int8)",
            license="cc-by-4.0",
            languages=_PARAKEET_LANGUAGES,
            window_seconds=60.0,
            files=(
                ModelFile(
                    "config.json",
                    97,
                    "666903c76b9798caf2c210afd4f6cd60b08a8dbf9800ec8d7a3bc0d2148ac466",
                ),
                ModelFile(
                    "vocab.txt",
                    93939,
                    "d58544679ea4bc6ac563d1f545eb7d474bd6cfa467f0a6e2c1dc1c7d37e3c35d",
                ),
                ModelFile(
                    "encoder-model.int8.onnx",
                    652183999,
                    "6139d2fa7e1b086097b277c7149725edbab89cc7c7ae64b23c741be4055aff09",
                ),
                ModelFile(
                    "decoder_joint-model.int8.onnx",
                    18202004,
                    "eea7483ee3d1a30375daedc8ed83e3960c91b098812127a0d99d1c8977667a70",
                ),
            ),
        ),
        ModelSpec(
            id="istupakov/whisper-base-onnx",
            repository="istupakov/whisper-base-onnx",
            revision="998334d3bfe2deba3c8e6821f05388dbf2b706d2",
            model_type="whisper-ort",
            quantization="int8",
            title="Whisper Base (int8)",
            license="apache-2.0",
            languages=("multilingual",),
            window_seconds=30.0,
            files=(
                ModelFile(
                    "config.json",
                    60,
                    "de30e642a4a23e8f710b94a85268e91d755ed23ebefeb094e638201ab25a4cc3",
                ),
                ModelFile(
                    "vocab.json",
                    1036584,
                    "50d6a919f0a0601d56a04eb583c780d18553aa388254ba3158eb6a00f13e2c1a",
                ),
                ModelFile(
                    "added_tokens.json",
                    34604,
                    "9715fd2243b6f06a5858b5e32950d2853f73dd5bc201aafcf76f5082a2d8acd1",
                ),
                ModelFile(
                    "whisper-base_beamsearch.int8.onnx",
                    107166530,
                    "537719570b1b859d5d805283f509bce621d8ebbba8189609d8fb12064a68530c",
                ),
            ),
        ),
    )
}

DEFAULT_MODEL = "istupakov/parakeet-tdt-0.6b-v3-onnx"

Progress = Callable[[int, int], None]


class ModelStore:
    """Install and verify catalog models below one private directory.

    Args:
        root: Model cache directory, created with owner-only permissions.
        client_factory: Builds the HTTP client used for one explicit download.
        catalog: Supported models, defaulting to the pinned catalog.
    """

    def __init__(
        self,
        root: Path,
        client_factory: Callable[[], httpx.AsyncClient],
        catalog: dict[str, ModelSpec] | None = None,
    ) -> None:
        """Store the cache root and collaborators without touching the network.

        Args:
            root: Model cache directory.
            client_factory: Builds the HTTP client used for one explicit download.
            catalog: Supported models.
        """
        self._root = root
        self._client_factory = client_factory
        self.catalog = CATALOG if catalog is None else catalog

    def spec(self, model: str) -> ModelSpec:
        """Return the catalog entry for an identifier.

        Args:
            model: Catalog identifier.

        Returns:
            Pinned model description.

        Raises:
            UnsupportedModelError: If the identifier is not in the catalog.
        """
        try:
            return self.catalog[model]
        except KeyError:
            raise UnsupportedModelError("This model is not supported on this device.") from None

    def install_path(self, spec: ModelSpec) -> Path:
        """Return the directory holding one installed revision.

        Args:
            spec: Catalog entry.

        Returns:
            Install directory, which may not exist.
        """
        return self._root / spec.repository.replace("/", "--") / spec.revision

    def is_installed(self, spec: ModelSpec) -> bool:
        """State whether a complete install manifest exists with right-sized files.

        Args:
            spec: Catalog entry.

        Returns:
            True when every pinned file is present with its pinned size.
        """
        path = self.install_path(spec)
        if not (path / _MANIFEST).is_file():
            return False
        return all(
            (path / file.path).is_file() and (path / file.path).stat().st_size == file.size
            for file in spec.files
        )

    def verify(self, spec: ModelSpec) -> Path:
        """Hash every installed file against its pin before loading.

        Args:
            spec: Catalog entry.

        Returns:
            Verified install directory.

        Raises:
            ModelIntegrityError: If any file is missing, linked or modified.
        """
        path = self.install_path(spec)
        for file in spec.files:
            target = path / file.path
            if target.is_symlink() or not target.is_file():
                raise ModelIntegrityError("The installed speech model is incomplete.")
            digest = hashlib.sha256()
            with target.open("rb") as handle:
                while chunk := handle.read(_CHUNK_BYTES):
                    digest.update(chunk)
            if digest.hexdigest() != file.sha256:
                raise ModelIntegrityError("The installed speech model is damaged.")
        return path

    def clean_staging(self) -> None:
        """Remove interrupted downloads from a previous run.

        Args:
            None.

        Returns:
            None.
        """
        if not self._root.is_dir():
            return
        for child in self._root.iterdir():
            if child.name.startswith(".staging-") and not child.is_symlink():
                shutil.rmtree(child, ignore_errors=True)
        # A crash between moving an old install aside and installing the new one
        # leaves "<revision>.previous"; restore it when nothing replaced it.
        for backup in self._root.glob("*/*.previous"):
            target = backup.with_name(backup.name.removesuffix(".previous"))
            if backup.is_symlink():
                continue
            try:
                if target.exists():
                    shutil.rmtree(backup, ignore_errors=True)
                else:
                    backup.rename(target)
            except OSError as error:
                # Never block startup; the model then reports itself missing.
                _LOGGER.warning("could not restore a previous model install: %s", error.strerror)

    async def download(self, spec: ModelSpec, progress: Progress) -> Path:
        """Fetch, verify and atomically install every pinned file.

        Args:
            spec: Catalog entry.
            progress: Receives completed and total bytes as data arrives.

        Returns:
            Installed directory.

        Raises:
            ModelIntegrityError: If any file fails to download or verify.
        """
        self._root.mkdir(parents=True, exist_ok=True)
        _restrict(self._root)
        staging = self._root / f".staging-{uuid.uuid4().hex}"
        staging.mkdir(mode=0o700)
        completed = 0
        try:
            async with self._client_factory() as client:
                for file in spec.files:
                    completed = await self._fetch(client, spec, file, staging, completed, progress)
            (staging / _MANIFEST).write_text(
                json.dumps(
                    {
                        "id": spec.id,
                        "repository": spec.repository,
                        "revision": spec.revision,
                        "files": {file.path: file.sha256 for file in spec.files},
                    },
                    sort_keys=True,
                )
            )
            target = self.install_path(spec)
            target.parent.mkdir(parents=True, exist_ok=True)
            previous = None
            if target.exists():
                # Move the old install aside first, so a failed rename keeps it usable.
                previous = target.with_name(f"{target.name}.previous")
                target.rename(previous)
            try:
                staging.rename(target)
            except OSError:
                if previous is not None:
                    previous.rename(target)
                raise
            if previous is not None:
                shutil.rmtree(previous, ignore_errors=True)
            return target
        except httpx.HTTPError as error:
            raise ModelIntegrityError("The speech model download failed: network error.") from error
        finally:
            if staging.exists():
                shutil.rmtree(staging, ignore_errors=True)

    async def _fetch(
        self,
        client: httpx.AsyncClient,
        spec: ModelSpec,
        file: ModelFile,
        staging: Path,
        completed: int,
        progress: Progress,
    ) -> int:
        """Stream one file by pinned revision while checking size and digest.

        Args:
            client: Download HTTP client.
            spec: Catalog entry.
            file: Pinned file.
            staging: Private staging directory.
            completed: Bytes completed before this file.
            progress: Progress receiver.

        Returns:
            Bytes completed after this file.

        Raises:
            ModelIntegrityError: If the response fails, overruns or mismatches.
        """
        url = f"{_HUB}/{spec.repository}/resolve/{spec.revision}/{file.path}"
        digest = hashlib.sha256()
        received = 0
        descriptor = os.open(staging / file.path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            async with client.stream("GET", url, follow_redirects=True, timeout=60.0) as response:
                if response.status_code != 200:
                    raise ModelIntegrityError(
                        f"The speech model download failed: {file.path} is unavailable."
                    )
                async for chunk in response.aiter_bytes(_CHUNK_BYTES):
                    received += len(chunk)
                    if received > file.size:
                        raise ModelIntegrityError(
                            f"The speech model download failed: {file.path} is too large."
                        )
                    digest.update(chunk)
                    handle.write(chunk)
                    progress(completed + received, spec.total_bytes)
        if received != file.size or digest.hexdigest() != file.sha256:
            raise ModelIntegrityError(
                f"The speech model download failed verification: {file.path}."
            )
        return completed + received


def _restrict(path: Path) -> None:
    """Make a directory owner-only where the platform supports it.

    Args:
        path: Directory to restrict.

    Returns:
        None.
    """
    if os.name == "posix":
        path.chmod(0o700)
