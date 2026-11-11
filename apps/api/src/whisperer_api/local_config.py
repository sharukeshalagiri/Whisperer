"""Desktop-to-server boot protocol for the on-device profile.

The desktop writes a secret-free JSON configuration file, sends one secret
boot line on stdin and keeps stdin open; stdin EOF means the desktop is gone.
The server reports progress as bounded JSON lines on stdout.
"""

from __future__ import annotations

import base64
import binascii
import json
import threading
from pathlib import Path
from typing import IO, Annotated, Literal
from uuid import UUID  # noqa: TC003 - pydantic resolves it at runtime

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    HttpUrl,
    SecretStr,
    ValidationError,
    field_validator,
)

from whisperer_api.model_store import CATALOG

MAX_CONFIG_BYTES = 64 * 1024
MAX_BOOT_BYTES = 16 * 1024
MAX_EVENT_BYTES = 4096
_MAX_MESSAGE_CHARACTERS = 1000


class BootProtocolError(ValueError):
    """Signal an unusable configuration file or boot line without echoing it.

    Args:
        code: Stable machine-readable error code.
        message: Safe explanation.
    """

    def __init__(self, code: str, message: str) -> None:
        """Store the stable code and safe message.

        Args:
            code: Stable machine-readable error code.
            message: Safe explanation.
        """
        self.code = code
        super().__init__(message)


class _Strict(BaseModel):
    """Reject unknown fields and accept camelCase aliases.

    Args:
        None.
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True, frozen=True)


class HttpSpeechConfig(_Strict):
    """Select an OpenAI-compatible speech endpoint.

    Args:
        provider: Always ``http``.
        baseUrl: Endpoint root serving ``/audio/transcriptions``.
        model: Endpoint model name.
    """

    provider: Literal["http"]
    base_url: HttpUrl = Field(alias="baseUrl")
    model: str = Field(min_length=1, max_length=200)


class OnnxSpeechConfig(_Strict):
    """Select a pinned catalog model run on this device.

    Args:
        provider: Always ``onnx``.
        model: Catalog identifier.
    """

    provider: Literal["onnx"]
    model: str

    @field_validator("model")
    @classmethod
    def _catalog_only(cls, value: str) -> str:
        """Accept only pinned catalog models.

        Args:
            value: Requested model identifier.

        Returns:
            The identifier.

        Raises:
            ValueError: If the model is not in the catalog.
        """
        if value not in CATALOG:
            raise ValueError("unsupported on-device model")
        return value


class HttpLlmConfig(_Strict):
    """Select an OpenAI-compatible chat endpoint.

    Args:
        provider: Always ``http``.
        baseUrl: Endpoint root serving ``/chat/completions``.
        model: Endpoint model name.
    """

    provider: Literal["http"]
    base_url: HttpUrl = Field(alias="baseUrl")
    model: str = Field(min_length=1, max_length=200)


class OffLlmConfig(_Strict):
    """Turn language-model features off.

    Args:
        provider: Always ``off``.
    """

    provider: Literal["off"]


SpeechConfig = Annotated[HttpSpeechConfig | OnnxSpeechConfig, Field(discriminator="provider")]
LlmConfig = Annotated[HttpLlmConfig | OffLlmConfig, Field(discriminator="provider")]


class LocalConfig(_Strict):
    """Describe one on-device server written by the desktop; holds no secrets.

    Args:
        version: Document version, always 1.
        instanceId: Desktop-generated identifier echoed by ``/v1/health``.
        dataDirectory: Absolute directory for the database, audio and models.
        speech: Speech provider, or null until the user sets it up.
        llm: Language-model provider, or null until the user sets it up.
    """

    version: Literal[1]
    instance_id: UUID = Field(alias="instanceId")
    data_directory: str = Field(alias="dataDirectory", min_length=1, max_length=4096)
    speech: SpeechConfig | None = None
    llm: LlmConfig | None = None

    @field_validator("data_directory")
    @classmethod
    def _absolute(cls, value: str) -> str:
        """Require an absolute data directory.

        Args:
            value: Configured directory.

        Returns:
            The directory.

        Raises:
            ValueError: If the path is relative.
        """
        if not Path(value).is_absolute():
            raise ValueError("dataDirectory must be absolute")
        return value

    @property
    def data_path(self) -> Path:
        """Return the data directory as a path.

        Args:
            None.

        Returns:
            Absolute data directory.
        """
        return Path(self.data_directory)


def _blank_to_none(value: object) -> object:
    """Treat empty provider keys as absent.

    Args:
        value: Raw key value.

    Returns:
        None for empty strings, otherwise the value.
    """
    return None if value == "" else value


OptionalKey = Annotated[SecretStr | None, BeforeValidator(_blank_to_none)]


class BootDocument(_Strict):
    """Carry the per-launch secrets the desktop sends on stdin.

    Args:
        bootToken: 32 random bytes in base64url text, the bearer credential.
        speechApiKey: Optional speech endpoint key.
        llmApiKey: Optional language-model endpoint key.
    """

    boot_token: SecretStr = Field(alias="bootToken")
    speech_api_key: OptionalKey = Field(default=None, alias="speechApiKey", max_length=4096)
    llm_api_key: OptionalKey = Field(default=None, alias="llmApiKey", max_length=4096)

    @field_validator("boot_token")
    @classmethod
    def _thirty_two_bytes(cls, value: SecretStr) -> SecretStr:
        """Require exactly 32 bytes of base64url-encoded entropy.

        Args:
            value: Encoded token.

        Returns:
            The token.

        Raises:
            ValueError: If the token is not base64url or not 32 bytes.
        """
        text = value.get_secret_value()
        if not 43 <= len(text) <= 44 or any(
            not (character.isalnum() or character in "-_=") for character in text
        ):
            raise ValueError("bootToken must be 32 bytes of base64url")
        try:
            decoded = base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
        except (binascii.Error, ValueError):
            raise ValueError("bootToken must be 32 bytes of base64url") from None
        if len(decoded) != 32:
            raise ValueError("bootToken must be 32 bytes of base64url")
        return value


def read_local_config(path: Path) -> LocalConfig:
    """Read and validate the desktop's configuration file.

    Args:
        path: Absolute configuration path.

    Returns:
        Validated configuration.

    Raises:
        BootProtocolError: If the path or document is unusable.
    """
    if not path.is_absolute():
        raise BootProtocolError("config_invalid", "The configuration path must be absolute.")
    try:
        with path.open("rb") as handle:
            raw = handle.read(MAX_CONFIG_BYTES + 1)
    except OSError:
        raise BootProtocolError("config_invalid", "The configuration file is unreadable.") from None
    if len(raw) > MAX_CONFIG_BYTES:
        raise BootProtocolError("config_invalid", "The configuration file is too large.")
    try:
        return LocalConfig.model_validate(json.loads(raw))
    except (ValueError, ValidationError):
        raise BootProtocolError("config_invalid", "The configuration file is invalid.") from None


def read_boot_document(stream: IO[bytes]) -> BootDocument:
    """Read exactly one newline-terminated boot line, leaving the stream open.

    Args:
        stream: Binary stdin.

    Returns:
        Validated boot secrets.

    Raises:
        BootProtocolError: If the line is missing, oversized or invalid.
    """
    line = stream.readline(MAX_BOOT_BYTES + 1)
    if not line.endswith(b"\n") or len(line) > MAX_BOOT_BYTES:
        raise BootProtocolError("boot_invalid", "The boot line is missing or too large.")
    try:
        return BootDocument.model_validate(json.loads(line))
    except (ValueError, ValidationError):
        raise BootProtocolError("boot_invalid", "The boot line is invalid.") from None


class EventWriter:
    """Write bounded single-line JSON events to the desktop.

    Args:
        stream: Binary stream reserved for events.
    """

    def __init__(self, stream: IO[bytes]) -> None:
        """Store the stream and a lock for writes from worker threads.

        Args:
            stream: Binary stream reserved for events.
        """
        self._stream = stream
        self._lock = threading.Lock()

    def emit(self, event: dict[str, object]) -> None:
        """Write one event, truncating its message to fit the line bound.

        Args:
            event: JSON-compatible event with an ``event`` field.

        Returns:
            None.
        """
        payload = dict(event)
        message = payload.get("message")
        if isinstance(message, str):
            payload["message"] = _clean(message)[:_MAX_MESSAGE_CHARACTERS]
        line = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode() + b"\n"
        if len(line) > MAX_EVENT_BYTES:
            line = b'{"event":"error","code":"event_too_large","message":"An event was dropped."}\n'
        with self._lock:
            try:
                self._stream.write(line)
                self._stream.flush()
            except (OSError, ValueError):
                return


def _clean(text: str) -> str:
    """Replace control characters so a message stays on one line.

    Args:
        text: Raw message.

    Returns:
        Message with control characters replaced by spaces.
    """
    return "".join(
        " " if ord(character) < 32 or ord(character) == 127 else character for character in text
    )
