"""The ``serve-local`` profile: one desktop-owned API bound to loopback.

Launch contract::

    python -m whisperer_api serve-local --config <absolute local.json>

The desktop writes ``local.json`` (no secrets), then sends one JSON boot line
on stdin and keeps stdin open. EOF on stdin means the desktop is gone, so the
server exits. Events go to stdout as JSON lines; logs go to stderr.
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import IO, TYPE_CHECKING

import httpx

from whisperer_api.http_clients import LOOPBACK_DIRECT
from whisperer_api.inference import (
    HttpLlmProvider,
    HttpSpeechProvider,
    InferenceRouter,
    LlmProvider,
    OffLlmProvider,
    OnnxSpeechProvider,
    SpeechProvider,
    SpeechUnavailableError,
)
from whisperer_api.local_auth import LocalAuthenticator
from whisperer_api.local_config import (
    BootDocument,
    BootProtocolError,
    EventWriter,
    HttpLlmConfig,
    HttpSpeechConfig,
    LocalConfig,
    OnnxSpeechConfig,
    read_boot_document,
    read_local_config,
)
from whisperer_api.model_store import ModelSpec, ModelStore
from whisperer_api.settings import Settings

if TYPE_CHECKING:
    from pathlib import Path

    from fastapi import FastAPI

    from whisperer_api.auth import Clock

_LOGGER = logging.getLogger("whisperer_api.local")
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})
_INTERACTIVE_TIMEOUT_SECONDS = 30.0
_BACKGROUND_TIMEOUT_SECONDS = 600.0
_PROGRESS_INTERVAL_SECONDS = 0.5
_UNCONFIGURED_SPEECH = "Speech is not set up."
_UNCONFIGURED_LLM = "Language model is not set up."

Emit = Callable[[dict[str, object]], None]


class UnconfiguredSpeechProvider:
    """Stand in until the user chooses a speech engine.

    Args:
        None.
    """

    provider: str | None = None
    model: str | None = None

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """Refuse transcription until speech is configured.

        Args:
            audio: Unused audio.
            filename: Unused filename.
            content_type: Unused media type.
            language: Unused language.
            timeout_seconds: Unused timeout.

        Returns:
            Never returns.

        Raises:
            SpeechUnavailableError: Always.
        """
        del audio, filename, content_type, language, timeout_seconds
        raise SpeechUnavailableError(_UNCONFIGURED_SPEECH)

    def status(self) -> tuple[str, str]:
        """Report the unconfigured state.

        Args:
            None.

        Returns:
            Unconfigured state and message.
        """
        return "unconfigured", _UNCONFIGURED_SPEECH


class UnconfiguredLlmProvider(OffLlmProvider):
    """Treat an unchosen language model like an off one, with its own status.

    Args:
        None.
    """

    provider = "unconfigured"

    def status(self) -> tuple[str, str]:
        """Report the unconfigured state.

        Args:
            None.

        Returns:
            Unconfigured state and message.
        """
        return "unconfigured", _UNCONFIGURED_LLM


@dataclass
class LocalProfile:
    """Everything the on-device profile adds to the shared API composition.

    Args:
        config: Validated desktop configuration.
        boot: Per-launch secrets from stdin.
        emit: Sink for structured stdout events.
        allowed_hosts: Host names accepted in the ``Host`` header.
        transport: Optional HTTP transport, injected by tests.
    """

    config: LocalConfig
    boot: BootDocument
    emit: Emit
    allowed_hosts: frozenset[str] = _LOOPBACK_HOSTS
    transport: httpx.AsyncBaseTransport | None = None
    onnx: OnnxSpeechProvider | None = field(default=None, init=False)
    store: ModelStore = field(init=False)
    download: asyncio.Task[None] | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        """Prepare the private data directory layout and model store.

        Args:
            None.

        Returns:
            None.
        """
        self.store = ModelStore(self.config.data_path / "models", self.http_client)

    @property
    def instance_id(self) -> str:
        """Return the desktop-assigned instance identifier.

        Args:
            None.

        Returns:
            UUID text.
        """
        return str(self.config.instance_id)

    def settings(self) -> Settings:
        """Build API settings for this device, ignoring process environment.

        Args:
            None.

        Returns:
            Settings pointing at the per-device SQLite database.
        """
        database = self.config.data_path / "api.sqlite3"
        return Settings.model_construct(
            database_url=f"sqlite:///{database}",
            gateway_base_url=None,
            gateway_api_key=None,
            gateway_timeout_seconds=_INTERACTIVE_TIMEOUT_SECONDS,
            meeting_gateway_timeout_seconds=_BACKGROUND_TIMEOUT_SECONDS,
        )

    def http_client(self) -> httpx.AsyncClient:
        """Create an HTTP client for provider calls or an explicit download.

        Args:
            None.

        Returns:
            Client that never follows redirects except where a caller asks.
        """
        return httpx.AsyncClient(
            follow_redirects=False, transport=self.transport, mounts=LOOPBACK_DIRECT
        )

    def authenticator(self, clock: Clock) -> LocalAuthenticator:
        """Build the boot-token authenticator.

        Args:
            clock: UTC clock.

        Returns:
            Authenticator for this launch.
        """
        return LocalAuthenticator(self.boot.boot_token, clock)

    def router(self, client: httpx.AsyncClient) -> InferenceRouter:
        """Build independent speech and language-model providers.

        Args:
            client: Shared provider HTTP client.

        Returns:
            Inference router for this device.
        """
        speech: SpeechProvider
        speech_config = self.config.speech
        if isinstance(speech_config, HttpSpeechConfig):
            speech = HttpSpeechProvider(
                client,
                str(speech_config.base_url),
                speech_config.model,
                self.boot.speech_api_key,
                _INTERACTIVE_TIMEOUT_SECONDS,
            )
        elif isinstance(speech_config, OnnxSpeechConfig):
            self.onnx = OnnxSpeechProvider(
                self.store, self.store.spec(speech_config.model), on_event=self.emit
            )
            speech = self.onnx
        else:
            speech = UnconfiguredSpeechProvider()
        llm: LlmProvider
        llm_config = self.config.llm
        if isinstance(llm_config, HttpLlmConfig):
            llm = HttpLlmProvider(
                client,
                str(llm_config.base_url),
                llm_config.model,
                self.boot.llm_api_key,
                _INTERACTIVE_TIMEOUT_SECONDS,
            )
        elif llm_config is None:
            llm = UnconfiguredLlmProvider()
        else:
            llm = OffLlmProvider()
        return InferenceRouter(speech, llm)

    def start_download(self, spec: ModelSpec) -> bool:
        """Start one explicit model download in the background.

        Args:
            spec: Catalog model to install.

        Returns:
            False when a download is already running.
        """
        if self.download is not None and not self.download.done():
            return False
        self.download = asyncio.create_task(self._download(spec))
        return True

    async def _download(self, spec: ModelSpec) -> None:
        """Download, verify and activate a model, reporting progress events.

        Args:
            spec: Catalog model to install.

        Returns:
            None.
        """
        last = 0.0
        active = self.onnx if self.onnx is not None and self.onnx.spec.id == spec.id else None

        def progress(done: int, total: int) -> None:
            nonlocal last
            if active is not None:
                active.downloading = (done, total)
            now = time.monotonic()
            if now - last >= _PROGRESS_INTERVAL_SECONDS or done == total:
                last = now
                self.emit(
                    {
                        "event": "model",
                        "model": spec.id,
                        "status": "downloading",
                        "completedBytes": done,
                        "totalBytes": total,
                        "message": "Downloading the speech model.",
                    }
                )

        try:
            progress(0, spec.total_bytes)
            await self.store.download(spec, progress)
        except Exception as error:
            _LOGGER.warning("model download failed: %s", type(error).__name__)
            self.emit(
                {
                    "event": "model",
                    "model": spec.id,
                    "status": "failed",
                    "message": str(error)
                    if isinstance(error, RuntimeError)
                    else "The speech model download failed.",
                }
            )
            return
        finally:
            if active is not None:
                active.downloading = None
        if active is not None:
            await active.reload()
        else:
            self.emit(
                {
                    "event": "model",
                    "model": spec.id,
                    "status": "ready",
                    "message": "The speech model is downloaded.",
                }
            )


def create_local_app(profile: LocalProfile) -> FastAPI:
    """Compose the shared API with the on-device profile.

    Args:
        profile: On-device configuration, secrets and event sink.

    Returns:
        FastAPI application.
    """
    from whisperer_api.main import create_app

    profile.config.data_path.mkdir(parents=True, exist_ok=True)
    _restrict(profile.config.data_path)
    return create_app(profile.settings(), local=profile)


PipePeek = Callable[[], "int | None"]

_PARENT_POLL_SECONDS = 0.2
_ERROR_BROKEN_PIPE = 109


def wait_for_parent_exit(
    stdin: IO[bytes],
    *,
    peek: PipePeek | None = None,
    sleep: Callable[[float], None] = time.sleep,
) -> None:
    """Return once the desktop closes stdin or exits, discarding any later input.

    On Windows a thread blocked in a synchronous read of the stdin pipe stalls
    every other thread that loads a native extension (numpy, onnxruntime, PyAV)
    until that read finishes, so the speech model would never load. There the
    pipe is polled with ``PeekNamedPipe``, which never leaves a read pending.
    Other systems, and a stdin that is not a pipe, use a blocking read.

    Args:
        stdin: Binary stdin after the boot line was read.
        peek: Returns the bytes waiting in the pipe, or None once it is closed.
            Defaults to ``PeekNamedPipe`` on Windows and to a blocking read elsewhere.
        sleep: Waits between polls.

    Returns:
        None.
    """
    if peek is None:
        peek = _windows_pipe_peek(stdin)
    if peek is None:
        while stdin.read(4096):
            continue
        return
    while (available := peek()) is not None:
        if available:
            # The bytes are already in the pipe, so this read cannot block.
            stdin.read(min(available, 4096))
        else:
            sleep(_PARENT_POLL_SECONDS)


if sys.platform == "win32":

    def _windows_pipe_peek(stdin: IO[bytes]) -> PipePeek | None:
        """Build a non-blocking ``PeekNamedPipe`` probe for stdin on Windows.

        Args:
            stdin: Binary stdin.

        Returns:
            The probe, or None when stdin is not a pipe.
        """
        import ctypes
        import msvcrt
        from ctypes import wintypes

        try:
            handle = msvcrt.get_osfhandle(stdin.fileno())
        except (OSError, ValueError):
            return None
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        peek_named_pipe = kernel32.PeekNamedPipe
        peek_named_pipe.argtypes = [
            wintypes.HANDLE,
            wintypes.LPVOID,
            wintypes.DWORD,
            wintypes.LPVOID,
            ctypes.POINTER(wintypes.DWORD),
            wintypes.LPVOID,
        ]
        peek_named_pipe.restype = wintypes.BOOL

        def peek() -> int | None:
            available = wintypes.DWORD(0)
            if peek_named_pipe(handle, None, 0, None, ctypes.byref(available), None):
                return int(available.value)
            return None

        if peek() is None and ctypes.get_last_error() != _ERROR_BROKEN_PIPE:
            # Not a pipe, for example a console or a file: a blocking read is safe there.
            return None
        return peek


else:

    def _windows_pipe_peek(stdin: IO[bytes]) -> PipePeek | None:
        """Return None: ``PeekNamedPipe`` exists only on Windows.

        Args:
            stdin: Binary stdin (unused off Windows).

        Returns:
            None, so the caller keeps the blocking read.
        """
        del stdin
        return None


class LocalServer:
    """Run the on-device profile until stdin closes or a signal arrives.

    Args:
        config_path: Absolute configuration file path.
        stdin: Binary stdin carrying the boot line and parent liveness.
        events: Event writer bound to the original stdout.
    """

    def __init__(self, config_path: Path, stdin: IO[bytes], events: EventWriter) -> None:
        """Store process boundaries.

        Args:
            config_path: Absolute configuration file path.
            stdin: Binary stdin carrying the boot line and parent liveness.
            events: Event writer bound to the original stdout.
        """
        self._config_path = config_path
        self._stdin = stdin
        self._events = events

    def run(self) -> int:
        """Boot, serve and shut down.

        Args:
            None.

        Returns:
            Process exit status.
        """
        try:
            config = read_local_config(self._config_path)
            boot = read_boot_document(self._stdin)
        except BootProtocolError as error:
            self._events.emit({"event": "error", "code": error.code, "message": str(error)})
            return 2
        try:
            listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            listener.bind(("127.0.0.1", 0))
            listener.listen(128)
        except OSError:
            self._events.emit(
                {"event": "error", "code": "bind_failed", "message": "Could not open a local port."}
            )
            return 1
        port = listener.getsockname()[1]
        self._events.emit({"event": "bind", "port": port})
        profile = LocalProfile(config, boot, self._events.emit)
        try:
            app = create_local_app(profile)
        except OSError:
            self._events.emit(
                {
                    "event": "error",
                    "code": "data_unavailable",
                    "message": "The data directory is not writable.",
                }
            )
            return 1
        return asyncio.run(self._serve(app, listener))

    async def _serve(self, app: FastAPI, listener: socket.socket) -> int:
        """Serve on the bound socket and watch stdin for parent exit.

        Args:
            app: Composed application.
            listener: Bound loopback listening socket.

        Returns:
            Process exit status.
        """
        import uvicorn

        server = uvicorn.Server(
            uvicorn.Config(
                app,
                log_config=None,
                access_log=False,
                server_header=False,
                date_header=False,
                lifespan="on",
            )
        )
        loop = asyncio.get_running_loop()

        def watch_stdin() -> None:
            wait_for_parent_exit(self._stdin)
            loop.call_soon_threadsafe(setattr, server, "should_exit", True)

        threading.Thread(target=watch_stdin, name="parent-watch", daemon=True).start()

        async def announce_ready() -> None:
            while not server.started:
                if server.should_exit:
                    return
                await asyncio.sleep(0.02)
            self._events.emit({"event": "ready"})

        announcer = asyncio.create_task(announce_ready())
        try:
            await server.serve(sockets=[listener])
        finally:
            announcer.cancel()
        if not server.started:
            return 1
        return 0


def serve_local(config_path: Path) -> int:
    """Entry point for ``python -m whisperer_api serve-local``.

    Reserves the original stdout for events and points file descriptor 1 at
    stderr, so stray prints from any library can never corrupt the protocol.

    Args:
        config_path: Configuration path from the command line.

    Returns:
        Process exit status.
    """
    sys.stdout.flush()
    event_stream = os.fdopen(os.dup(1), "wb", buffering=0)
    os.dup2(2, 1)
    sys.stdout = sys.stderr
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    events = EventWriter(event_stream)
    return LocalServer(config_path, sys.stdin.buffer, events).run()


def host_allowed(host_header: str | None, allowed: frozenset[str]) -> bool:
    """Accept only loopback host names, defending against DNS rebinding.

    Args:
        host_header: Raw ``Host`` header.
        allowed: Accepted host names.

    Returns:
        True when the host name, ignoring the port, is allowed.
    """
    if not host_header:
        return False
    host = host_header.strip().lower()
    if host.startswith("["):
        return False
    return host.rsplit(":", 1)[0] in allowed if ":" in host else host in allowed


def origin_allowed(origin: str | None) -> bool:
    """Refuse requests from web pages other than loopback ones.

    Args:
        origin: Raw ``Origin`` header.

    Returns:
        True when absent, opaque, a non-web scheme or a loopback origin.
    """
    if origin is None or origin == "null":
        return True
    lowered = origin.lower()
    if not lowered.startswith(("http://", "https://")):
        return True
    try:
        host = httpx.URL(origin).host
    except (httpx.InvalidURL, ValueError):
        return False
    return host in _LOOPBACK_HOSTS


def _restrict(path: Path) -> None:
    """Make a directory owner-only on POSIX systems.

    Args:
        path: Directory to restrict.

    Returns:
        None.
    """
    if os.name == "posix":
        path.chmod(0o700)
