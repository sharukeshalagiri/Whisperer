"""Build the benchmark audio from LibriSpeech test-clean (CC BY 4.0, https://www.openslr.org/12).

Outputs, all derived from public audio only:
  hour.wav            ~60 min, 16 kHz mono PCM16, utterances concatenated in corpus order
  hour.ref.txt        the matching reference transcript
  hour.manifest.json  utterance ids and durations
  hour-48k-NN.wav     the hour split into 4-minute 48 kHz PCM16 WAV parts (the dictation upload format,
                      each under the 25 MiB limit) for the engine test
  hour.webm           the hour as 24 kbit/s Opus in WebM (the format the app records meetings in)
  clips/clip-NN.wav   short utterances of about 10 s (16 kHz), clips/refs.json with their references
  clips/fake-NN.wav   the same clips at 48 kHz with 0.5 s leading and 4 s trailing silence, for the
                      fake microphone

Usage: python prepare_audio.py <LibriSpeech/test-clean dir> <out dir> [--minutes 60] [--clips 20]
Requires ffmpeg on PATH. Standard library only.
"""

from __future__ import annotations

import argparse
import json
import struct
import subprocess
import wave
from pathlib import Path

RATE = 16_000


def decode(path: Path, rate: int = RATE) -> bytes:
    """Decode an audio file to mono PCM16 at ``rate`` with ffmpeg."""
    return subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(rate), "-"],
        check=True, capture_output=True,
    ).stdout


def write_wav(path: Path, pcm: bytes, rate: int) -> None:
    """Write mono PCM16 samples as a WAV file."""
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(rate)
        out.writeframes(pcm)


def utterances(root: Path) -> list[tuple[str, Path, str]]:
    """Return (id, flac path, reference text) for every utterance, in corpus order."""
    items = []
    for trans in sorted(root.rglob("*.trans.txt")):
        for line in trans.read_text(encoding="utf-8").splitlines():
            uid, _, text = line.partition(" ")
            items.append((uid, trans.parent / f"{uid}.flac", text.strip()))
    return items


def main() -> None:
    """Build the hour, its 48 kHz parts and WebM, and the short clips."""
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", type=Path)
    parser.add_argument("out", type=Path)
    parser.add_argument("--minutes", type=float, default=60.0)
    parser.add_argument("--clips", type=int, default=20)
    args = parser.parse_args()
    out: Path = args.out
    (out / "clips").mkdir(parents=True, exist_ok=True)
    items = utterances(args.corpus)

    pcm = bytearray()
    refs: list[str] = []
    manifest = []
    used = 0
    target = args.minutes * 60 * RATE * 2
    for uid, flac, text in items:
        if len(pcm) >= target:
            break
        audio = decode(flac)
        pcm += audio
        refs.append(text)
        manifest.append({"id": uid, "seconds": round(len(audio) / (RATE * 2), 3)})
        used += 1
    write_wav(out / "hour.wav", bytes(pcm), RATE)
    (out / "hour.ref.txt").write_text(" ".join(refs) + "\n", encoding="utf-8")
    seconds = len(pcm) / (RATE * 2)
    (out / "hour.manifest.json").write_text(json.dumps({"source": "LibriSpeech test-clean (CC BY 4.0, openslr.org/12)", "utterances": len(manifest), "seconds": round(seconds, 3), "items": manifest}, indent=1), encoding="utf-8")

    hour48 = decode(out / "hour.wav", 48_000)
    part = 4 * 60 * 48_000 * 2
    for index in range(0, len(hour48), part):
        write_wav(out / f"hour-48k-{index // part + 1:02d}.wav", hour48[index:index + part], 48_000)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(out / "hour.wav"), "-c:a", "libopus", "-b:a", "24k", "-ac", "1", "-map_metadata", "-1", str(out / "hour.webm")], check=True)

    clips = []
    seen_speakers: set[str] = set()
    for uid, flac, text in items[used:]:
        if len(clips) >= args.clips:
            break
        speaker = uid.split("-")[0]
        if speaker in seen_speakers:
            continue
        audio = decode(flac)
        duration = len(audio) / (RATE * 2)
        if not 9.0 <= duration <= 11.0:
            continue
        seen_speakers.add(speaker)
        number = len(clips) + 1
        write_wav(out / "clips" / f"clip-{number:02d}.wav", audio, RATE)
        padded = struct.pack("<h", 0) * int(0.5 * 48_000) + decode(flac, 48_000) + struct.pack("<h", 0) * int(4 * 48_000)
        write_wav(out / "clips" / f"fake-{number:02d}.wav", padded, 48_000)
        clips.append({"clip": number, "id": uid, "seconds": round(duration, 3), "reference": text})
    (out / "clips" / "refs.json").write_text(json.dumps({"source": "LibriSpeech test-clean (CC BY 4.0, openslr.org/12)", "lead_silence_s": 0.5, "clips": clips}, indent=1), encoding="utf-8")
    print(f"hour: {used} utterances, {seconds / 60:.2f} min; clips: {len(clips)}")


if __name__ == "__main__":
    main()
