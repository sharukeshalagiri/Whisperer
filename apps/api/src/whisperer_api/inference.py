"""Independent speech and language-model providers behind one inference router.

Remote deployments build both providers from the shared ``GATEWAY_*`` settings
unless dedicated ``SPEECH_*`` or ``LLM_*`` settings are present. The on-device
profile builds them from the desktop's local configuration instead.
"""

from __future__ import annotations

import asyncio
import io
import time
import wave
from collections.abc import Callable
from importlib import import_module
from typing import TYPE_CHECKING, Any, Protocol
from urllib.parse import urlsplit

import httpx

if TYPE_CHECKING:
    from pathlib import Path

    from pydantic import SecretStr

    from whisperer_api.model_store import ModelSpec, ModelStore
    from whisperer_api.settings import Settings
    from whisperer_api.transformation_schemas import TransformationKind

LLM_OFF_MESSAGE = "Language model is off."
_TEST_SAMPLES = 8_000


class LanguageModelOffError(RuntimeError):
    """Signal that the user turned the language model off.

    Args:
        None.
    """

    def __init__(self) -> None:
        """Create the stable user-facing explanation.

        Args:
            None.
        """
        super().__init__(LLM_OFF_MESSAGE)


class ContextLimitError(ValueError):
    """Signal that the configured model rejected the complete supplied context.

    Args:
        None.
    """

    def __init__(self) -> None:
        """Create the stable no-truncation explanation.

        Args:
            None.
        """
        super().__init__(
            "The saved meeting is too large for the configured language model. "
            "It was not shortened."
        )


class SpeechUnavailableError(RuntimeError):
    """Signal that the selected speech engine cannot transcribe yet.

    Args:
        message: Safe explanation naming the missing step.
    """


class SpeechProvider(Protocol):
    """Describe one speech-to-text engine.

    Args:
        None.
    """

    @property
    def provider(self) -> str | None:
        """Return the provider kind, or None before setup.

        Args:
            None.

        Returns:
            Provider name.
        """

    @property
    def model(self) -> str | None:
        """Return the model name, if any.

        Args:
            None.

        Returns:
            Model name or None.
        """

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """Transcribe one recording.

        Args:
            audio: Uploaded audio bytes.
            filename: Client filename.
            content_type: Validated media type.
            language: Optional language hint.
            timeout_seconds: Optional bounded timeout override.

        Returns:
            Raw transcription text.
        """

    def status(self) -> tuple[str, str]:
        """Return the current readiness state and a safe message.

        Args:
            None.

        Returns:
            Status name and explanation.
        """


class LlmProvider(Protocol):
    """Describe one chat-completion engine.

    Args:
        None.
    """

    @property
    def provider(self) -> str:
        """Return the provider kind.

        Args:
            None.

        Returns:
            Provider name.
        """

    @property
    def model(self) -> str | None:
        """Return the model name, if any.

        Args:
            None.

        Returns:
            Model name or None.
        """

    @property
    def enabled(self) -> bool:
        """State whether completions are available.

        Args:
            None.

        Returns:
            False when the language model is off.
        """

    async def complete(
        self, instruction: str, text: str, *, timeout_seconds: float | None = None
    ) -> str:
        """Run one controlled completion.

        Args:
            instruction: Fixed system instruction.
            text: User-owned text.
            timeout_seconds: Optional bounded timeout override.

        Returns:
            Completion text.
        """

    def status(self) -> tuple[str, str]:
        """Return the current readiness state and a safe message.

        Args:
            None.

        Returns:
            Status name and explanation.
        """


class _HttpEndpoint:
    """Share URL and credential handling for OpenAI-compatible endpoints.

    Args:
        client: Shared async HTTP client.
        base_url: Endpoint root that serves the OpenAI-compatible paths.
        model: Provider model name.
        api_key: Optional bearer credential.
        timeout_seconds: Default request timeout.
        require_key: Whether a missing key is a configuration error.
    """

    provider = "http"
    _path = ""

    def __init__(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        model: str,
        api_key: SecretStr | None,
        timeout_seconds: float,
        *,
        require_key: bool = False,
    ) -> None:
        """Store endpoint configuration without reading the secret.

        Args:
            client: Shared async HTTP client.
            base_url: Endpoint root.
            model: Provider model name.
            api_key: Optional bearer credential.
            timeout_seconds: Default request timeout.
            require_key: Whether a missing key is a configuration error.
        """
        self._client = client
        root = base_url.rstrip("/")
        # Accept a full endpoint URL pasted where the root belongs.
        if self._path and root.endswith(self._path):
            root = root.removesuffix(self._path).rstrip("/")
        self._base_url = root
        self.model = model
        self._api_key = api_key
        self._timeout_seconds = timeout_seconds
        self._require_key = require_key

    @property
    def base_url(self) -> str:
        """Return the normalized endpoint root without the operation path.

        Args:
            None.

        Returns:
            Endpoint root URL.
        """
        return self._base_url

    @property
    def api_key(self) -> SecretStr | None:
        """Return the credential that belongs to exactly this endpoint.

        Args:
            None.

        Returns:
            Secret bearer credential, or None for a keyless endpoint.
        """
        return self._api_key

    @property
    def requires_key(self) -> bool:
        """State whether a missing key is a configuration error for this endpoint.

        Args:
            None.

        Returns:
            True for the shared gateway, which always needs its key.
        """
        return self._require_key

    def _headers(self) -> dict[str, str]:
        """Return the authorization header, if a key is configured.

        Args:
            None.

        Returns:
            Bearer header or no headers.

        Raises:
            ValueError: If a required key is absent.
        """
        if self._api_key is None:
            if self._require_key:
                raise ValueError("gateway authentication is not configured")
            return {}
        return {"Authorization": f"Bearer {self._api_key.get_secret_value()}"}

    def status(self) -> tuple[str, str]:
        """Report a configured HTTP endpoint and where data is sent.

        Args:
            None.

        Returns:
            Ready state naming only the endpoint host.
        """
        host = urlsplit(self._base_url).hostname or "the configured endpoint"
        return "ready", f"Requests are sent to {host}."


class HttpSpeechProvider(_HttpEndpoint):
    """Transcribe through an OpenAI-compatible ``/audio/transcriptions`` endpoint.

    Args:
        client: Shared async HTTP client.
        base_url: Endpoint root.
        model: Provider model name.
        api_key: Optional bearer credential.
        timeout_seconds: Default request timeout.
        require_key: Whether a missing key is a configuration error.
    """

    _path = "/audio/transcriptions"

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """Submit one recording for transcription.

        Args:
            audio: Uploaded audio bytes.
            filename: Client filename.
            content_type: Validated media type.
            language: Optional language hint.
            timeout_seconds: Optional bounded timeout override.

        Returns:
            Transcribed text.

        Raises:
            ValueError: If the endpoint fails or returns an invalid body.
        """
        data: dict[str, str] = {"model": self.model}
        if language:
            data["language"] = language
        try:
            response = await self._client.post(
                f"{self._base_url}{self._path}",
                headers=self._headers(),
                data=data,
                files={"file": (filename, audio, content_type)},
                timeout=timeout_seconds or self._timeout_seconds,
            )
            response.raise_for_status()
            text = response.json()["text"]
        except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
            raise ValueError("transcription response is unavailable") from error
        if not isinstance(text, str):
            raise ValueError("transcription response is invalid")
        return text


class HttpLlmProvider(_HttpEndpoint):
    """Complete text through an OpenAI-compatible ``/chat/completions`` endpoint.

    Args:
        client: Shared async HTTP client.
        base_url: Endpoint root.
        model: Provider model name.
        api_key: Optional bearer credential.
        timeout_seconds: Default request timeout.
        require_key: Whether a missing key is a configuration error.
    """

    enabled = True
    _path = "/chat/completions"

    async def complete(
        self, instruction: str, text: str, *, timeout_seconds: float | None = None
    ) -> str:
        """Send one controlled completion prompt.

        Args:
            instruction: Fixed system instruction.
            text: User-owned text.
            timeout_seconds: Optional bounded timeout override.

        Returns:
            First completion choice.

        Raises:
            ValueError: If the endpoint fails or returns an invalid body.
        """
        try:
            response = await self._client.post(
                f"{self._base_url}{self._path}",
                headers=self._headers(),
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": instruction},
                        {"role": "user", "content": text},
                    ],
                },
                timeout=timeout_seconds or self._timeout_seconds,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as error:
            # Providers differ in their schema, so inspect only their safe generic
            # error text and never retain it or the submitted meeting context.
            detail = error.response.text.lower()
            if error.response.status_code in (400, 413, 422) and _is_context_limit_error(detail):
                raise ContextLimitError() from error
            raise ValueError("inference response is unavailable") from error
        except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as error:
            raise ValueError("inference response is unavailable") from error
        if not isinstance(content, str):
            raise ValueError("inference response is invalid")
        return content


def _is_context_limit_error(detail: str) -> bool:
    """Recognize explicit upstream input-context limit failures without broad guessing.

    Args:
        detail: Lower-cased provider response text.

    Returns:
        True when a known context-window or input-token limit phrase is present.
    """
    return any(
        phrase in detail
        for phrase in (
            "context length",
            "context window",
            "context_length",
            "input token limit",
            "input tokens exceeded",
            "maximum context",
            "prompt is too long",
            "too many token",
        )
    )


class OffLlmProvider:
    """Represent a language model the user turned off.

    Args:
        None.
    """

    provider = "off"
    model: str | None = None
    enabled = False

    async def complete(
        self, instruction: str, text: str, *, timeout_seconds: float | None = None
    ) -> str:
        """Refuse every completion.

        Args:
            instruction: Unused instruction.
            text: Unused text.
            timeout_seconds: Unused timeout.

        Returns:
            Never returns.

        Raises:
            LanguageModelOffError: Always.
        """
        del instruction, text, timeout_seconds
        raise LanguageModelOffError

    def status(self) -> tuple[str, str]:
        """Report the off state.

        Args:
            None.

        Returns:
            Off state and stable message.
        """
        return "off", LLM_OFF_MESSAGE


class Recognizer(Protocol):
    """Describe the loaded onnx-asr recognizer surface used here.

    Args:
        None.
    """

    def recognize(self, waveform: Any, *, sample_rate: int, **options: Any) -> str:  # noqa: ANN401
        """Recognize one mono waveform.

        Args:
            waveform: Float32 samples.
            sample_rate: Sample rate of the waveform.
            options: Model-specific recognition options.

        Returns:
            Recognized text.
        """


ModelLoader = Callable[["ModelSpec", "Path"], Recognizer]


def load_onnx_asr(spec: ModelSpec, path: Path) -> Recognizer:
    """Load a verified catalog model from its local directory with onnx-asr.

    The model type comes from the catalog and the path is a local directory,
    so onnx-asr resolves files offline and never contacts a model hub.

    Args:
        spec: Verified catalog entry.
        path: Installed model directory.

    Returns:
        Loaded recognizer.
    """
    onnx_asr = import_module("onnx_asr")
    recognizer: Recognizer = onnx_asr.load_model(
        spec.model_type,
        path,
        quantization=spec.quantization,
        providers=["CPUExecutionProvider"],
    )
    return recognizer


class OnnxSpeechProvider:
    """Run one verified catalog speech model in-process with onnx-asr on CPU.

    Args:
        store: Model store owning installed artifacts.
        spec: Selected catalog model.
        loader: Factory that loads a recognizer from a verified directory.
        on_event: Optional sink for model lifecycle events.
        max_seconds: Longest accepted recording.
    """

    provider = "onnx"

    def __init__(
        self,
        store: ModelStore,
        spec: ModelSpec,
        loader: ModelLoader = load_onnx_asr,
        on_event: Callable[[dict[str, object]], None] | None = None,
        max_seconds: float = 2 * 60 * 60,
    ) -> None:
        """Store collaborators; nothing loads until ``prepare`` or first use.

        Args:
            store: Model store owning installed artifacts.
            spec: Selected catalog model.
            loader: Factory that loads a recognizer from a verified directory.
            on_event: Optional sink for model lifecycle events.
            max_seconds: Longest accepted recording.
        """
        self._store = store
        self.spec = spec
        self.model = spec.id
        self._loader = loader
        self._on_event = on_event or (lambda event: None)
        self._max_seconds = max_seconds
        self._recognizer: Recognizer | None = None
        self._state = "missing"
        self._message = "The speech model is not downloaded."
        self._load_lock = asyncio.Lock()
        self._run_lock = asyncio.Lock()
        self.downloading: tuple[int, int] | None = None

    def status(self) -> tuple[str, str]:
        """Return the model lifecycle state.

        Args:
            None.

        Returns:
            Status name and explanation.
        """
        if self.downloading is not None:
            done, total = self.downloading
            return "downloading", f"Downloading {done} of {total} bytes."
        if self._recognizer is not None:
            return "ready", "Runs on this device."
        if self._state in {"loading", "failed"}:
            return self._state, self._message
        if not self._store.is_installed(self.spec):
            return "missing", "The speech model is not downloaded."
        return "loading", "The speech model loads on first use."

    async def prepare(self) -> None:
        """Load the model when installed, or report that it is missing.

        Args:
            None.

        Returns:
            None.
        """
        if not self._store.is_installed(self.spec):
            self._emit("missing", "The speech model is not downloaded.")
            return
        try:
            await self._ensure_loaded()
        except SpeechUnavailableError:
            return

    async def reload(self) -> None:
        """Drop any loaded recognizer and load the installed model again.

        Args:
            None.

        Returns:
            None.
        """
        async with self._run_lock:
            self._recognizer = None
            self._state = "missing"
        await self.prepare()

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """Decode and recognize one recording off the event loop.

        Args:
            audio: Uploaded audio bytes.
            filename: Unused client filename.
            content_type: Media type selecting the decoder.
            language: Optional language hint, used only by Whisper models.
            timeout_seconds: Unused; on-device work is bounded by duration.

        Returns:
            Recognized text.

        Raises:
            SpeechUnavailableError: If the model is not installed or failed to load.
            AudioDecodeError: If the recording cannot be decoded.
        """
        del filename, timeout_seconds
        recognizer = await self._ensure_loaded()
        audio_module = import_module("whisperer_api.audio")
        samples = await asyncio.to_thread(
            audio_module.decode_audio, audio, content_type, max_seconds=self._max_seconds
        )
        async with self._run_lock:
            return await asyncio.to_thread(self._recognize, recognizer, samples, language)

    async def probe(self) -> None:
        """Recognize a short silent clip to prove the engine runs.

        Args:
            None.

        Returns:
            None.
        """
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16_000)
            output.writeframes(b"\0\0" * _TEST_SAMPLES)
        await self.transcribe(buffer.getvalue(), "probe.wav", "audio/wav", None)

    async def _ensure_loaded(self) -> Recognizer:
        """Verify and load the installed model once.

        Args:
            None.

        Returns:
            Loaded recognizer.

        Raises:
            SpeechUnavailableError: If the model is missing, corrupt or fails to load.
        """
        if self._recognizer is not None:
            return self._recognizer
        async with self._load_lock:
            # Another request may have finished loading while this one waited.
            loaded: Recognizer | None = self._recognizer
            if loaded is not None:
                return loaded
            if not self._store.is_installed(self.spec):
                raise SpeechUnavailableError("The speech model is not downloaded.")
            self._state, self._message = "loading", "Checking the speech model."
            self._emit("verifying", "Checking the speech model.")
            try:
                path = await asyncio.to_thread(self._store.verify, self.spec)
                self._emit("loading", "Loading the speech model.")
                self._message = "Loading the speech model."
                recognizer = await asyncio.to_thread(self._loader, self.spec, path)
            except Exception as error:
                self._state = "failed"
                self._message = "The speech model could not be loaded. Download it again."
                self._emit("failed", self._message)
                raise SpeechUnavailableError(self._message) from error
            self._recognizer = recognizer
            self._state, self._message = "ready", "Runs on this device."
            self._emit("ready", "The speech model is ready.")
            return recognizer

    def _recognize(self, recognizer: Recognizer, samples: Any, language: str | None) -> str:  # noqa: ANN401
        """Recognize bounded windows and join their text.

        Args:
            recognizer: Loaded model.
            samples: 16 kHz mono float32 samples.
            language: Optional language hint.

        Returns:
            Joined recognized text.
        """
        options: dict[str, Any] = {}
        primary = (language or "").split("-", 1)[0].split("_", 1)[0].lower()
        if self.spec.model_type == "whisper-ort" and primary.isalpha() and len(primary) <= 3:
            options["language"] = primary
        pieces = []
        for window in _windows(samples, self.spec.window_seconds):
            try:
                text = recognizer.recognize(window, sample_rate=16_000, **options)
            except KeyError:
                # Whisper rejects an unknown language token; detect the language instead.
                options.pop("language", None)
                text = recognizer.recognize(window, sample_rate=16_000)
            if text.strip():
                pieces.append(text.strip())
        return " ".join(pieces)

    def _emit(self, status: str, message: str) -> None:
        """Send one model lifecycle event.

        Args:
            status: Event status.
            message: Safe explanation.

        Returns:
            None.
        """
        self._on_event(
            {"event": "model", "model": self.spec.id, "status": status, "message": message}
        )


def _windows(samples: Any, window_seconds: float) -> list[Any]:  # noqa: ANN401
    """Split long audio into bounded windows at the quietest nearby point.

    Args:
        samples: 16 kHz mono float32 samples.
        window_seconds: Largest window the model handles well.

    Returns:
        Consecutive sample windows covering the input, skipping slivers.
    """
    numpy = import_module("numpy")
    window = int(window_seconds * 16_000)
    search = min(window // 4, 5 * 16_000)
    frame = 320
    windows: list[Any] = []
    start = 0
    total = int(samples.shape[0])
    while total - start > window:
        lower = start + window - search
        region = samples[lower : start + window]
        usable = (len(region) // frame) * frame
        energy = numpy.square(region[:usable]).reshape(-1, frame).mean(axis=1)
        cut = lower + int(energy.argmin()) * frame
        windows.append(samples[start:cut])
        start = cut
    tail = samples[start:]
    if tail.shape[0] >= 1_600 or not windows:
        windows.append(tail)
    return windows


class InferenceRouter:
    """Route dictation, polish, summaries and transforms to their providers.

    Args:
        speech: Speech-to-text provider.
        llm: Language-model provider, possibly off.
    """

    def __init__(self, speech: SpeechProvider, llm: LlmProvider) -> None:
        """Store the two independent providers.

        Args:
            speech: Speech-to-text provider.
            llm: Language-model provider.
        """
        self.speech = speech
        self.llm = llm

    @classmethod
    def from_settings(cls, settings: Settings, client: httpx.AsyncClient) -> InferenceRouter:
        """Build remote providers, falling back to the shared gateway settings.

        A dedicated base URL never inherits the gateway key, so a credential is
        only ever sent to the endpoint it was configured for.

        Args:
            settings: Validated remote settings.
            client: Shared async HTTP client.

        Returns:
            Router with HTTP speech and LLM providers.
        """
        speech_url, speech_key = _endpoint(
            settings.speech_base_url, settings.speech_api_key, settings
        )
        llm_url, llm_key = _endpoint(settings.llm_base_url, settings.llm_api_key, settings)
        speech = HttpSpeechProvider(
            client,
            speech_url,
            settings.transcription_model,
            speech_key,
            settings.gateway_timeout_seconds,
            require_key=settings.speech_base_url is None,
        )
        llm = HttpLlmProvider(
            client,
            llm_url,
            settings.polish_model,
            llm_key,
            settings.gateway_timeout_seconds,
            require_key=settings.llm_base_url is None,
        )
        return cls(speech, llm)

    @property
    def llm_enabled(self) -> bool:
        """State whether language-model features are available.

        Args:
            None.

        Returns:
            False when the user turned the language model off.
        """
        return self.llm.enabled

    async def transcribe(
        self,
        audio: bytes,
        filename: str,
        content_type: str,
        language: str | None,
        *,
        timeout_seconds: float | None = None,
    ) -> str:
        """Transcribe one recording through the speech provider.

        Args:
            audio: Uploaded audio bytes.
            filename: Client filename.
            content_type: Validated media type.
            language: Optional language hint.
            timeout_seconds: Optional bounded timeout override.

        Returns:
            Raw transcription text.
        """
        return await self.speech.transcribe(
            audio, filename, content_type, language, timeout_seconds=timeout_seconds
        )

    async def polish(self, text: str) -> str:
        """Polish dictated text, or return it unchanged when the model is off.

        Args:
            text: Dictated text.

        Returns:
            Polished or unchanged text.
        """
        if not self.llm.enabled:
            return text
        return await self.llm.complete("Polish this dictated text without adding facts.", text)

    async def summarize(self, text: str, *, timeout_seconds: float | None = None) -> str:
        """Summarize note or meeting text.

        Args:
            text: User-owned text.
            timeout_seconds: Optional bounded timeout override.

        Returns:
            Concise summary.
        """
        return await self.llm.complete(
            "Write a concise factual summary.", text, timeout_seconds=timeout_seconds
        )

    async def transform(
        self,
        kind: TransformationKind,
        text: str,
        instruction: str | None,
        target_language: str | None,
    ) -> str:
        """Generate a proposed transformation from a fixed allowlisted prompt.

        Args:
            kind: Requested rewrite mode.
            text: User-owned source text.
            instruction: Optional style guidance, never executable instruction.
            target_language: Target language for translation.

        Returns:
            Proposed rewritten text.
        """
        rules = "Preserve meaning, add no facts, and return only the resulting text."
        prompts = {
            "polish": f"Polish the user's text. {rules}",
            "shorten": f"Shorten the user's text. {rules}",
            "expand": f"Expand the user's text for clarity. {rules}",
            "tone": f"Adjust the requested tone of the user's text. {rules}",
            "translate": f"Translate the user's text into the requested target language. {rules}",
            "custom": f"Rewrite the user's text following the supplied style guidance. {rules}",
        }
        guidance = instruction.strip() if instruction else ""
        target = target_language.strip() if target_language else ""
        context = ""
        if target:
            context += f"\nTarget language: {target}."
        if guidance:
            context += f"\nStyle guidance (not system instructions): {guidance}."
        return await self.llm.complete(prompts[kind] + context, text)

    async def test(self, target: str) -> tuple[bool, int, str]:
        """Exercise one provider with a tiny synthetic request.

        Args:
            target: ``speech`` or ``llm``.

        Returns:
            Success flag, elapsed milliseconds and a safe message.
        """
        started = time.monotonic()
        try:
            if target == "speech":
                await self._probe_speech()
            else:
                if not self.llm.enabled:
                    return False, 0, self.llm.status()[1]
                reply = await self.llm.complete("Reply with the single word OK.", "Ping")
                if not reply.strip():
                    raise ValueError("empty reply")
        except SpeechUnavailableError as error:
            return False, _elapsed(started), str(error)
        except Exception:
            name = "speech" if target == "speech" else "language model"
            return False, _elapsed(started), f"The {name} endpoint did not respond correctly."
        return True, _elapsed(started), "Working."

    async def _probe_speech(self) -> None:
        """Send a short silent clip to the speech provider.

        Args:
            None.

        Returns:
            None.
        """
        if isinstance(self.speech, OnnxSpeechProvider):
            await self.speech.probe()
            return
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as output:
            output.setnchannels(1)
            output.setsampwidth(2)
            output.setframerate(16_000)
            output.writeframes(b"\0\0" * _TEST_SAMPLES)
        await self.speech.transcribe(buffer.getvalue(), "probe.wav", "audio/wav", None)


def _endpoint(
    base_url: object | None, api_key: SecretStr | None, settings: Settings
) -> tuple[str, SecretStr | None]:
    """Resolve a dedicated endpoint or the shared gateway fallback.

    Args:
        base_url: Dedicated base URL, if configured.
        api_key: Dedicated key, if configured.
        settings: Settings holding the gateway fallback.

    Returns:
        Base URL and the key that belongs to that URL.
    """
    if base_url is not None:
        return str(base_url), api_key
    return str(settings.gateway_base_url), settings.gateway_api_key


def _elapsed(started: float) -> int:
    """Return whole milliseconds since ``started``.

    Args:
        started: Monotonic start time.

    Returns:
        Elapsed milliseconds.
    """
    return int((time.monotonic() - started) * 1000)
