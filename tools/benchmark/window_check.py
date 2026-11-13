"""Read-only diagnostic: transcribe the hour's 48 kHz parts with the released inference code at
different window lengths, to test whether the window length explains dropped passages.

Usage (with the Python of a desktop profile's runtime):
  python -B -E -s window_check.py <resources api src dir> <model dir> <audio dir> <out json> <model id> <seconds> [<seconds> ...]

It imports the released modules unchanged and only passes a different window length to the
released `_windows` splitter; nothing in the app or profile is modified.
"""

from __future__ import annotations

import json
import sys
import time
from dataclasses import replace
from pathlib import Path


def main() -> None:
    """Run every requested window length over all parts and write texts and timings."""
    src, model_dir, audio_dir, out, model_id = sys.argv[1:6]
    seconds = [float(value) for value in sys.argv[6:]]
    sys.path.insert(0, src)
    from whisperer_api.audio import decode_audio
    from whisperer_api.inference import _windows, load_onnx_asr
    from whisperer_api.model_store import CATALOG

    spec = CATALOG[model_id]
    recognizer = load_onnx_asr(spec, Path(model_dir))
    parts = sorted(Path(audio_dir).glob("hour-48k-*.wav"))
    samples = [decode_audio(part.read_bytes(), "audio/wav") for part in parts]
    results = []
    for window in seconds:
        variant = replace(spec, window_seconds=window)
        texts = []
        started = time.perf_counter()
        for audio in samples:
            pieces = [recognizer.recognize(w, sample_rate=16_000).strip() for w in _windows(audio, variant.window_seconds)]
            texts.append(" ".join(p for p in pieces if p))
        elapsed = time.perf_counter() - started
        results.append({"window_seconds": window, "processing_s": round(elapsed, 1), "text": " ".join(texts)})
        print(f"window {window:g} s: {elapsed:.1f} s", flush=True)
    Path(out).write_text(json.dumps({"model": model_id, "runs": results}, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
