"""Decode uploaded recordings to 16 kHz mono samples for on-device speech models.

PyAV (the ``local`` extra) bundles its own FFmpeg libraries, so decoding needs no
system ffmpeg. It is imported only when on-device speech is used.
"""

from __future__ import annotations

import io
from importlib import import_module
from typing import Any

SAMPLE_RATE = 16_000
_DEFAULT_MAX_SECONDS = 2 * 60 * 60
# Pin the demuxer from the declared media type so FFmpeg never probes for
# playlist or concatenation formats that can reference other files or URLs.
_DEMUXERS = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/webm": "matroska",
    "video/webm": "matroska",
    "audio/ogg": "ogg",
    "application/ogg": "ogg",
    "audio/mpeg": "mp3",
    "audio/mp4": "mov",
    "audio/flac": "flac",
    "audio/aac": "aac",
}


class AudioDecodeError(ValueError):
    """Signal an upload that is not decodable audio within the configured bounds.

    Args:
        message: Safe explanation without audio content.
    """


def decode_audio(
    data: bytes, content_type: str, *, max_seconds: float = _DEFAULT_MAX_SECONDS
) -> Any:  # noqa: ANN401 - NumPy is an optional dependency
    """Decode one audio upload to a float32 mono 16 kHz NumPy array.

    Args:
        data: Complete uploaded audio bytes.
        content_type: Declared media type; selects an allowlisted demuxer.
        max_seconds: Largest decoded duration accepted before aborting.

    Returns:
        One-dimensional float32 samples in the range -1.0 to 1.0.

    Raises:
        AudioDecodeError: If the format is unsupported, undecodable, silent of
            samples, or longer than ``max_seconds``.
    """
    demuxer = _DEMUXERS.get(content_type.lower().split(";", 1)[0].strip())
    if demuxer is None:
        raise AudioDecodeError("This audio format is not supported on this device.")
    av = import_module("av")
    numpy = import_module("numpy")
    limit = int(max_seconds * SAMPLE_RATE)
    chunks: list[Any] = []
    total = 0
    try:
        with av.open(io.BytesIO(data), mode="r", format=demuxer) as container:
            if not container.streams.audio:
                raise AudioDecodeError("The recording contains no audio.")
            stream = container.streams.audio[0]
            resampler = av.AudioResampler(format="flt", layout="mono", rate=SAMPLE_RATE)
            for frame in container.decode(stream):
                for converted in resampler.resample(frame):
                    total = _append(chunks, converted, total, limit)
            for converted in resampler.resample(None):
                total = _append(chunks, converted, total, limit)
    except AudioDecodeError:
        raise
    except (av.FFmpegError, ValueError, OSError, IndexError) as error:
        raise AudioDecodeError("The recording could not be decoded.") from error
    if total == 0:
        raise AudioDecodeError("The recording contains no audio.")
    samples = numpy.concatenate(chunks).astype(numpy.float32, copy=False)
    return numpy.clip(samples, -1.0, 1.0)


def _append(chunks: list[Any], frame: Any, total: int, limit: int) -> int:  # noqa: ANN401
    """Append one resampled frame while enforcing the decoded duration bound.

    Args:
        chunks: Accumulated sample arrays.
        frame: Resampled packed float mono audio frame.
        total: Samples accumulated so far.
        limit: Maximum accepted sample count.

    Returns:
        Updated sample count.

    Raises:
        AudioDecodeError: If the bound is exceeded.
    """
    samples = frame.to_ndarray().reshape(-1)
    total += int(samples.shape[0])
    if total > limit:
        raise AudioDecodeError("The recording is longer than this device accepts.")
    chunks.append(samples)
    return total
