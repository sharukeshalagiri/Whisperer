"""Word error rate of benchmark outputs against the LibriSpeech references, with jiwer.

Normalisation, applied to both sides and nothing else: lowercase, punctuation removed, whitespace
collapsed. Numbers are not spelled out, so "2" against "two" counts as an error.

Usage: python wer.py <audio dir> <result.json> [<result.json> ...]
  engine/meeting results (a list of runs with "text") are scored against hour.ref.txt;
  dictation results (a list of clips with "text" and "reference") are scored per clip and pooled.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import jiwer


def normalise(text: str) -> str:
    """Lowercase, drop punctuation (keeping apostrophes inside words), collapse whitespace."""
    text = text.lower().replace("’", "'")
    text = re.sub(r"[^\w\s']", " ", text)
    text = re.sub(r"(?<!\w)'|'(?!\w)", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    """Print one line per result file with the WER of each run, or the pooled clip WER."""
    audio = Path(sys.argv[1])
    hour_ref = normalise((audio / "hour.ref.txt").read_text(encoding="utf-8"))
    for name in sys.argv[2:]:
        data = json.loads(Path(name).read_text(encoding="utf-8"))
        runs = [r for r in data if "text" in r]
        if runs and "reference" in runs[0]:
            # A clip whose stored text is empty was not captured (the latency still counts); skip it.
            missing = [r["clip"] for r in runs if not r["text"].strip()]
            runs = [r for r in runs if r["text"].strip()]
            refs = [normalise(r["reference"]) for r in runs]
            hyps = [normalise(r["text"]) for r in runs]
            pooled = jiwer.wer(refs, hyps)
            print(f"{Path(name).name}: clips={len(runs)} pooled WER={pooled * 100:.2f}%"
                  + (f" (text not captured for clips {missing})" if missing else ""))
        else:
            wers = [jiwer.wer(hour_ref, normalise(r["text"])) for r in runs]
            print(f"{Path(name).name}: runs={len(runs)} WER per run=" + ", ".join(f"{w * 100:.2f}%" for w in wers))


if __name__ == "__main__":
    main()
