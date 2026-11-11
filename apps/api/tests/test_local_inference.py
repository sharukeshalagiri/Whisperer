"""Independent speech and language-model providers and safe audio decoding."""

from __future__ import annotations

import asyncio
import io
import json
import os
import wave
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr
from whisperer_api.inference import (
    HttpLlmProvider,
    HttpSpeechProvider,
    InferenceRouter,
    LanguageModelOffError,
    OffLlmProvider,
)
from whisperer_api.settings import Settings


def _wav(seconds: float = 0.5, rate: int = 16_000, channels: int = 1) -> bytes:
    """Encode a short PCM16 tone like the desktop dictation recorder."""
    import math

    frames = bytearray()
    for index in range(int(seconds * rate)):
        sample = int(8000 * math.sin(2 * math.pi * 440 * index / rate))
        frames += sample.to_bytes(2, "little", signed=True) * channels
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(channels)
        output.setsampwidth(2)
        output.setframerate(rate)
        output.writeframes(bytes(frames))
    return buffer.getvalue()


class Recorder:
    """Record outgoing provider requests without network access."""

    def __init__(self) -> None:
        """Initialize empty request history."""
        self.requests: list[httpx.Request] = []

    def handle(self, request: httpx.Request) -> httpx.Response:
        """Return OpenAI-compatible synthetic responses."""
        self.requests.append(request)
        if request.url.path.endswith("/audio/transcriptions"):
            return httpx.Response(200, json={"text": "spoken"})
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "stt"}, {"id": "chat"}]})
        body = json.loads(request.content)
        return httpx.Response(
            200, json={"choices": [{"message": {"content": f"out:{body['model']}"}}]}
        )


def _client(recorder: Recorder) -> httpx.AsyncClient:
    """Build an HTTP client served by the recorder."""
    return httpx.AsyncClient(transport=httpx.MockTransport(recorder.handle))


def test_speech_and_llm_use_independent_endpoints_and_keys() -> None:
    """Send speech and chat to different URLs with their own credentials."""
    recorder = Recorder()
    client = _client(recorder)
    speech = HttpSpeechProvider(
        client, "https://speech.example.test/v1", "stt", SecretStr("speech-key"), 10.0
    )
    llm = HttpLlmProvider(
        client, "https://llm.example.test/v1/", "chat", SecretStr("llm-key"), 10.0
    )
    router = InferenceRouter(speech, llm)

    assert asyncio.run(router.transcribe(b"a", "a.wav", "audio/wav", "en")) == "spoken"
    assert asyncio.run(router.polish("text")) == "out:chat"

    speech_request, chat_request = recorder.requests
    assert str(speech_request.url) == "https://speech.example.test/v1/audio/transcriptions"
    assert speech_request.headers["authorization"] == "Bearer speech-key"
    assert str(chat_request.url) == "https://llm.example.test/v1/chat/completions"
    assert chat_request.headers["authorization"] == "Bearer llm-key"


def test_http_providers_omit_authorization_without_key() -> None:
    """Allow local endpoints such as Ollama that require no credential."""
    recorder = Recorder()
    llm = HttpLlmProvider(_client(recorder), "http://127.0.0.1:11434/v1", "chat", None, 10.0)
    assert asyncio.run(llm.complete("system", "user")) == "out:chat"
    assert "authorization" not in recorder.requests[0].headers


def test_http_providers_accept_a_full_endpoint_url() -> None:
    """Avoid doubling the path when the endpoint itself is pasted as the base URL."""
    recorder = Recorder()
    client = _client(recorder)
    speech = HttpSpeechProvider(
        client, "http://127.0.0.1:8000/v1/audio/transcriptions/", "stt", None, 10.0
    )
    llm = HttpLlmProvider(client, "http://127.0.0.1:11434/v1/chat/completions", "chat", None, 10.0)
    asyncio.run(speech.transcribe(b"a", "a.wav", "audio/wav", None))
    asyncio.run(llm.complete("system", "user"))
    assert [str(request.url) for request in recorder.requests] == [
        "http://127.0.0.1:8000/v1/audio/transcriptions",
        "http://127.0.0.1:11434/v1/chat/completions",
    ]


def test_llm_off_rejects_every_language_model_operation() -> None:
    """Refuse polish, summaries and transforms when the language model is off."""
    router = InferenceRouter(
        HttpSpeechProvider(_client(Recorder()), "https://s.example.test", "stt", None, 5.0),
        OffLlmProvider(),
    )
    assert not router.llm_enabled
    with pytest.raises(LanguageModelOffError):
        asyncio.run(router.summarize("text"))
    with pytest.raises(LanguageModelOffError):
        asyncio.run(router.transform("polish", "text", None, None))


def test_polish_is_skipped_when_llm_is_off() -> None:
    """Return dictated text unchanged instead of failing dictation."""
    router = InferenceRouter(
        HttpSpeechProvider(_client(Recorder()), "https://s.example.test", "stt", None, 5.0),
        OffLlmProvider(),
    )
    assert asyncio.run(router.polish("keep me")) == "keep me"


def test_remote_settings_keep_gateway_fallback() -> None:
    """Build both providers from the shared gateway when no split is configured."""
    settings = Settings(
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-credential",
        transcription_model="transcribe",
        polish_model="polish",
    )
    recorder = Recorder()
    router = InferenceRouter.from_settings(settings, _client(recorder))
    asyncio.run(router.transcribe(b"a", "a.wav", "audio/wav", None))
    asyncio.run(router.summarize("t"))
    assert [str(request.url) for request in recorder.requests] == [
        "https://gateway.example.test/audio/transcriptions",
        "https://gateway.example.test/chat/completions",
    ]
    assert all(
        request.headers["authorization"] == "Bearer gateway-credential"
        for request in recorder.requests
    )


def test_split_remote_settings_override_gateway() -> None:
    """Prefer dedicated speech and LLM settings over the shared gateway."""
    settings = Settings(
        gateway_base_url="https://gateway.example.test",
        gateway_api_key="gateway-credential",
        speech_base_url="https://speech.example.test",
        speech_api_key="speech-credential",
        llm_base_url="https://llm.example.test",
    )
    recorder = Recorder()
    router = InferenceRouter.from_settings(settings, _client(recorder))
    asyncio.run(router.transcribe(b"a", "a.wav", "audio/wav", None))
    asyncio.run(router.summarize("t"))
    speech_request, llm_request = recorder.requests
    assert speech_request.url.host == "speech.example.test"
    assert speech_request.headers["authorization"] == "Bearer speech-credential"
    assert llm_request.url.host == "llm.example.test"
    # A dedicated endpoint never receives the shared gateway credential.
    assert "authorization" not in llm_request.headers


av = pytest.importorskip("av", reason="install the 'local' extra to test audio decoding")


def test_decode_dictation_wav_to_16k_mono() -> None:
    """Decode the desktop's PCM16 WAV at any recorder rate into 16 kHz mono floats."""
    from whisperer_api.audio import decode_audio

    samples = decode_audio(_wav(seconds=0.5, rate=48_000, channels=2), "audio/wav")
    assert samples.dtype.name == "float32"
    assert samples.ndim == 1
    assert abs(len(samples) - 8_000) < 400
    assert 0.1 < float(abs(samples).max()) <= 1.0


def test_decode_meeting_webm_opus() -> None:
    """Decode MediaRecorder-style WebM Opus without a system ffmpeg."""
    import numpy as np
    from whisperer_api.audio import decode_audio

    buffer = io.BytesIO()
    with av.open(buffer, "w", format="webm") as container:
        stream = container.add_stream("libopus", rate=48_000)
        stream.layout = "mono"
        tone = (0.3 * np.sin(2 * np.pi * 440 * np.arange(48_000) / 48_000)).astype(np.float32)
        for start in range(0, len(tone), 960):
            frame = av.AudioFrame.from_ndarray(
                tone[start : start + 960].reshape(1, -1), format="flt", layout="mono"
            )
            frame.sample_rate = 48_000
            for packet in stream.encode(frame):
                container.mux(packet)
        for packet in stream.encode(None):
            container.mux(packet)

    samples = decode_audio(buffer.getvalue(), "audio/webm;codecs=opus")
    assert abs(len(samples) - 16_000) < 1_600
    assert float(abs(samples).max()) > 0.1


def test_decode_rejects_non_audio() -> None:
    """Report garbage input as an unusable recording rather than crashing."""
    from whisperer_api.audio import AudioDecodeError, decode_audio

    with pytest.raises(AudioDecodeError):
        decode_audio(b"not audio at all" * 10, "audio/wav")
    with pytest.raises(AudioDecodeError):
        decode_audio(_wav(), "application/x-mpegurl")


def test_decode_rejects_overlong_audio() -> None:
    """Bound decoded duration so a small compressed upload cannot exhaust memory."""
    from whisperer_api.audio import AudioDecodeError, decode_audio

    with pytest.raises(AudioDecodeError):
        decode_audio(_wav(seconds=2.0), "audio/wav", max_seconds=1.0)


def test_onnx_provider_reports_missing_model_without_network(tmp_path: Path) -> None:
    """Fail fast with a clear message when the selected model is not installed."""
    from whisperer_api.inference import OnnxSpeechProvider, SpeechUnavailableError
    from whisperer_api.model_store import CATALOG, ModelStore

    def forbidden() -> httpx.AsyncClient:
        raise AssertionError("no network access")

    store = ModelStore(tmp_path, forbidden)
    provider = OnnxSpeechProvider(store, CATALOG["istupakov/parakeet-tdt-0.6b-v3-onnx"])
    assert provider.status()[0] == "missing"
    with pytest.raises(SpeechUnavailableError):
        asyncio.run(provider.transcribe(_wav(), "a.wav", "audio/wav", None))


def test_onnx_provider_decodes_and_recognizes_off_loop(tmp_path: Path) -> None:
    """Decode then call the loaded recognizer with 16 kHz samples."""
    from whisperer_api.inference import OnnxSpeechProvider
    from whisperer_api.model_store import CATALOG, ModelStore

    calls: list[tuple[int, int]] = []

    class FakeRecognizer:
        def recognize(self, samples: object, *, sample_rate: int) -> str:
            calls.append((len(samples), sample_rate))  # type: ignore[arg-type]
            return " recognized "

    class InstalledStore(ModelStore):
        def is_installed(self, spec: object) -> bool:  # type: ignore[override]
            return True

        def verify(self, spec: object) -> Path:  # type: ignore[override]
            return tmp_path

    provider = OnnxSpeechProvider(
        InstalledStore(tmp_path, httpx.AsyncClient),
        CATALOG["istupakov/parakeet-tdt-0.6b-v3-onnx"],
        loader=lambda spec, path: FakeRecognizer(),
    )
    assert asyncio.run(provider.transcribe(_wav(), "a.wav", "audio/wav", "en")) == "recognized"
    assert calls and calls[0][1] == 16_000
    assert provider.status()[0] == "ready"


@pytest.mark.parametrize("failure", [httpx.ConnectError("refused"), httpx.ReadTimeout("slow")])
def test_transport_failures_become_value_errors(failure: httpx.HTTPError) -> None:
    """Report unreachable or slow endpoints as provider failures, not crashes."""

    def handle(request: httpx.Request) -> httpx.Response:
        raise failure

    client = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    speech = HttpSpeechProvider(client, "http://127.0.0.1:9/v1", "stt", None, 1.0)
    llm = HttpLlmProvider(client, "http://127.0.0.1:9/v1", "chat", None, 1.0)
    with pytest.raises(ValueError):
        asyncio.run(speech.transcribe(b"a", "a.wav", "audio/wav", None))
    with pytest.raises(ValueError):
        asyncio.run(llm.complete("s", "u"))


def test_model_loading_turns_onnxruntime_telemetry_off_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """onnxruntime ships telemetry; it must be off before any model session exists."""
    import sys
    import types

    from whisperer_api import inference

    calls: list[str] = []
    fake_ort = types.ModuleType("onnxruntime")
    fake_ort.disable_telemetry_events = lambda: calls.append("telemetry off")  # type: ignore[attr-defined]
    monkeypatch.delenv("ORT_DISABLE_TELEMETRY", raising=False)

    def load_model(*args: object, **kwargs: object) -> object:
        calls.append(
            f"model loaded, ORT_DISABLE_TELEMETRY={os.environ.get('ORT_DISABLE_TELEMETRY')}"
        )
        return object()

    fake_asr = types.ModuleType("onnx_asr")
    fake_asr.load_model = load_model  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "onnxruntime", fake_ort)
    monkeypatch.setitem(sys.modules, "onnx_asr", fake_asr)
    from whisperer_api.model_store import CATALOG

    spec = CATALOG["istupakov/whisper-base-onnx"]

    inference.load_onnx_asr(spec, Path())

    assert calls == ["telemetry off", "model loaded, ORT_DISABLE_TELEMETRY=1"]
