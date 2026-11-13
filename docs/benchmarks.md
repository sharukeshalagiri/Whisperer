# Benchmarks

Measured performance of the released Whisperer 0.2.0-beta.2 Windows build in Local mode, on one mid-range laptop, with public LibriSpeech audio. Every number below states how it was measured and how many runs it comes from. Bad results and outliers are reported, not dropped. The scripts are in [tools/benchmark](../tools/benchmark/README.md).

## Headline numbers

| | Result | Method |
| --- | --- | --- |
| An hour of recorded audio, transcribed on the CPU | **3.03 min** with whisper-base (WER 4.04%), **7.14 min** with Parakeet TDT 0.6B v3 (WER 4.51%) | Meeting pipeline, median of 3 runs each, 60.3 min of LibriSpeech test-clean |
| Dictation, key release to text in another app | **1.93 s** median with Parakeet (max 5.14 s), **2.59 s** with whisper-base (max 2.69 s) | n=10 utterances of 9 to 11 s per model, polish off |
| Network | **0 outbound connections beyond this computer** in a 10 minute Local mode session | 5 dictations plus a meeting with transcript and summary, every TCP connection of the app's processes logged |
| Cold start | Main window ready in **0.87 s**, speech ready in **14.2 s** (Parakeet) or **8.6 s** (whisper-base) | Median of 3 launches each |
| Tests | **607 unit and integration tests passing**: 238 API, 338 Vitest and 31 node:test. Coverage 88.1% of API statements, 49.0% of desktop lines | Fresh runs on the benchmark machine at commit 1f30669 |

All of these come from the machine below. A faster CPU will be faster, and nothing here was run on macOS or Linux.

## Machine and conditions

| | |
| --- | --- |
| CPU | Intel Core i5-10210U, 4 cores, 8 threads, 1.6 GHz base (2019 laptop CPU) |
| Memory | 8 GB (7.8 GB usable) |
| GPU | Intel UHD and NVIDIA MX250, both unused. Local mode runs ONNX Runtime on the CPU only. |
| OS | Windows 11 Home 21H2 (10.0.22000), High performance power plan |
| Power | On AC. Every run checked AC power at its start and end and a run on battery was discarded. |
| Build | Released `Whisperer-0.2.0-beta.2-win-x64.exe`, checksum verified against the release `SHA256SUMS`, run from a fresh temporary profile per model |
| Rounding | Times, error rates, sizes and memory are rounded up, so no value is rounded in Whisperer's favor. |
| Other load | Docker Desktop was stopped. A browser and a database service were still open during some phases, so free memory at the start of each measured phase was 2.4 to 3.4 GB. CPU load averaged 0.9 to 10.6% in the 10 s before each phase, except 20.2% before the Parakeet meeting runs, which started straight after a profile setup. Both are logged with the results. |

## Test audio

[LibriSpeech](https://www.openslr.org/12) test-clean, licensed CC BY 4.0. `prepare_audio.py` builds:

- **The hour.** 471 utterances concatenated in corpus order, 3,618.5 s (60.3 min), 16 kHz mono, with a 10,054 word reference.
- **20 clips** of 9 to 11 s from later utterances, one per speaker, with their references. The dictation test used the first 10.

Word error rate (WER) is computed with jiwer 4.0.0 after lowercasing and removing punctuation except apostrophes inside words. Numbers are written as words in LibriSpeech, so a model that writes digits is counted wrong for them.

## Transcribing an hour of audio

Both paths below use the on-device server that the desktop starts (`serve-local`), launched with the same arguments, environment allowlist and boot token as the app. Model load time is measured separately, from process start until `/v1/inference/status` reports speech ready, and is not included in the processing time.

### Meeting pipeline

This is how the app processes a Notetaker recording. The desktop records a meeting as one 24 kbit/s Opus WebM segment per uninterrupted recording. It starts a new segment only when a meeting is resumed, and stops at 24 MB or just under two hours (`MeetingCaptureLimits.ts`). An uninterrupted hour is therefore one segment of about 11 MB, and the test uploads the hour exactly that way. It replays the desktop's calls: create the meeting, upload the segment, finish, then poll until the transcript is complete. Time runs from the start of the upload, which is when recording has finished, to transcript complete. Uploading took about 0.2 s of that. The summary stayed pending because no language model was configured, and it is not part of the time.

| Model | Processing time per run | Median | Minutes per hour of audio | RTF | Model load | WER |
| --- | --- | --- | --- | --- | --- | --- |
| whisper-base | 189.5, 182.6, 182.1 s | 182.6 s | 3.03 (3.02 to 3.15) | 0.051 | 7.8 s (27.8, 7.8, 7.6) | 4.04% every run |
| Parakeet TDT 0.6B v3 | 427.7, 431.1, 430.1 s | 430.1 s | 7.14 (7.10 to 7.15) | 0.119 | 13.5 s (14.8, 13.3, 13.5) | 4.51% every run |

Minutes per hour of audio scale the processing time to exactly 60 minutes. RTF is processing time divided by audio duration. The transcripts were identical across runs. The first whisper-base load took 27.8 s against 7.8 s afterwards, most likely a cold disk cache.

### Dictation path

The same hour sent through the dictation endpoint, `/v1/transcriptions` with polish off, as 15 consecutive 4 minute 48 kHz WAV uploads plus an 18.5 s tail. A dictation upload is limited to 10 minutes and 25 MiB, so this is how long audio would go through dictation. Time runs from the first request to the last response.

| Model | Processing time per run | Median | Minutes per hour of audio | RTF | Model load | WER |
| --- | --- | --- | --- | --- | --- | --- |
| whisper-base | 187.1, 180.8, 178.6 s | 180.8 s | 3.00 (2.97 to 3.11) | 0.050 | 7.6 s (12.8, 7.6, 7.6) | 4.81% every run |
| Parakeet TDT 0.6B v3 | 426.9, 431.8, 431.0 s | 431.0 s | 7.15 (7.08 to 7.16) | 0.120 | 14.3 s (14.3, 14.1, 17.0) | 9.26% every run |

Speed matches the meeting pipeline. Parakeet's accuracy does not, because of the issue below.

### Known issue: Parakeet drops passages

Parakeet sometimes leaves out a run of consecutive words, from 11 up to 185 words at a time, while the audio around it is transcribed correctly. Long audio is split into windows of at most 60 s for Parakeet and 30 s for whisper-base (`_windows` in `inference.py`).

| Run | WER | Substitutions | Deletions | Insertions | Dropped runs of 10+ words | WER without those runs |
| --- | --- | --- | --- | --- | --- | --- |
| Parakeet, dictation path | 9.26% | 160 | 755 | 15 | 11 runs, 712 words | 2.17% |
| Parakeet, meeting pipeline | 4.51% | 156 | 284 | 13 | 4 runs, 238 words | 2.14% |
| whisper-base, dictation path | 4.81% | 338 | 99 | 46 | 1 run, 43 words | 4.38% |

Counting only substitutions and insertions, Parakeet's word-level error rate on the dictation path is 1.75% (175 of 10,054 words), against 3.82% for whisper-base. Including the isolated deletions but not the dropped runs, it is 2.17%. So when Parakeet transcribes a passage it is more accurate than whisper-base, and the measured 9.26% comes mostly from the dropped passages.

A read-only diagnostic (`window_check.py`) reran the released inference code over the same 4 minute parts and changed only the window length. At 60 s it reproduced the released output exactly, word for word. At 30 s the WER fell to 6.03% and the dropped words fell from 712 to 351, but 10 dropped runs remained. The window length is part of the cause, not all of it. This is tracked as a high priority fix for 0.2.0-beta.3 in the [roadmap](roadmap.md).

## Dictation latency

The packaged app was driven over the Chrome DevTools Protocol with Chromium's fake microphone playing one clip. A separate plain text window held the keyboard focus, as a user's document would. The script started recording, stopped it 0.3 s after the speech ended, as a user releasing the shortcut would, and measured the time from stop until the dictated text appeared in that window. The app was relaunched for every clip, so each dictation was the first after the model loaded. Polish was off: Ollama is not installed on the machine and no language model was configured.

| Model | n | Median | Min | Max | All results | WER (clips with captured text) |
| --- | --- | --- | --- | --- | --- | --- |
| Parakeet TDT 0.6B v3 | 10 | 1.93 s | 1.81 s | 5.14 s | 1.81, 1.84, 1.85, 1.85, 1.90, 1.97, 1.97, 1.98, 2.02, 5.14 s | 2.57% (9 clips, 234 words) |
| whisper-base | 10 | 2.59 s | 2.48 s | 2.69 s | 2.48, 2.50, 2.55, 2.58, 2.59, 2.59, 2.61, 2.65, 2.65, 2.69 s | 3.89% (8 clips, 206 words) |

With n=10, the median and the maximum are reported instead of a p95. The 5.14 s Parakeet result was the first clip of its phase, and the cause was not established. One whisper-base attempt on clip 1 timed out with no text after 120 s and the retry succeeded. Every other clip worked on the first attempt. whisper-base is slower than Parakeet here although it is faster on the hour, most likely because it always processes a full 30 s window however short the speech is.

The latency of each clip is valid, but for 3 clips the script read the text window's file a second time after the paste and got an empty read, so their text was not stored. Those clips are left out of the WER, and the script now keeps the text from the first read.

## Cold start

Three launches per model of the already set up app, 10 s apart.

| Model | Launch to main window ready | Launch to speech ready | Local server start to speech ready |
| --- | --- | --- | --- |
| Parakeet TDT 0.6B v3 | 0.87 s (0.84 to 0.88) | 14.2 s (13.9 to 14.2) | 13.3 s (13.0 to 13.4) |
| whisper-base | 0.85 s (0.77 to 0.90) | 8.6 s (8.6 to 8.6) | 7.7 s (7.7 to 7.7) |

Main window ready means the window's bridge answered its first state request. Speech ready means the local server reported the model loaded, so dictation can start.

## Footprint

| | Size |
| --- | --- |
| Windows installer | 120.1 MB (120,012,550 bytes) |
| macOS installers, arm64 and x64 | 138.0 MB and 144.7 MB |
| Linux `.deb`, amd64 | 107.7 MB |
| Local mode runtime, one-time download on Windows | 130.0 MB (129,962,201 bytes): uv 15,308,685, Python 3.12.15 22,019,610 and 92 locked wheels 92,633,906 bytes |
| Local mode runtime on disk | 694.4 MB |
| Parakeet TDT 0.6B v3 model download | 670.5 MB (670,480,039 bytes) |
| whisper-base model download | 108.3 MB (108,237,778 bytes) |

Megabytes here are 1,000,000 bytes. The runtime download is the sum of the pinned uv archive, the Python archive uv fetched and the wheels from the release's `uv.lock` that were installed. It was calculated from those sizes rather than captured on the network. Runtime setup took 47 to 52 s and the model downloads 28 s for whisper-base and 80 to 139 s for Parakeet over the same home connection.

| Memory | Parakeet TDT 0.6B v3 | whisper-base |
| --- | --- | --- |
| Whole app idle, 5 minutes after speech ready | 1,291 MB working set | 839 MB working set |
| Local server, peak while transcribing the hour as a meeting | 1,968 MB working set, 2,468 MB private | 741 MB working set, 1,036 MB private |
| Local server, peak while transcribing the hour as dictations | 1,765 MB working set, 2,260 MB private | 543 MB working set, 832 MB private |

Idle memory is the mean over 30 s of all 8 app processes, including the local server. Peaks are the highest of 3 runs, sampled every 2 s, so a shorter spike can be missed. On this 8 GB laptop, a Parakeet meeting with a browser open brought free memory down to 838 MB.

## Network egress

A 10 minute Local mode session on a fresh Parakeet profile: 5 dictations, then a 60 s meeting recording with its transcript and summary. The summary went to a stand-in for an OpenAI compatible endpoint on `127.0.0.1`, so the session exercised the language model path without a real provider. A poller logged every TCP connection owned by the app's process tree every 0.3 s.

Result: **0 connections to any address other than this computer.** All traffic stayed on loopback, between the desktop, its local server and the stand-in endpoint. Local mode still sends audio and text to those loopback endpoints, so this is not a claim of zero egress. A connection shorter than the polling interval could be missed, and UDP and DNS lookups were not attributed to the app.

## Tests and coverage

Fresh runs on the benchmark machine at commit `1f30669`, the `main` branch when the benchmark ran, which is the 0.2.0-beta.2 code plus dependency updates and documentation. Coverage is reported as measured, rounded down.

| Suite | Result | Coverage |
| --- | --- | --- |
| API, pytest | 238 passed, 0 failed | 88.1% of statements (4,417 statements, 525 missed), coverage.py |
| Desktop, Vitest | 338 passed in 54 files, 0 failed | 49.0% of lines, 45.2% of statements, 41.6% of branches, 35.3% of functions, `@vitest/coverage-v8` 5.0.4 |
| Desktop, node:test | 31 passed, 0 failed | not measured |
| End to end, `tools/drive-desktop.mjs` on Windows | Failed, 2 of 2 runs | The driver stops at its first failure. It failed at the backend switch animation check, where 13 pixels of the ring were still drawn in the final seeked frame. The checks after it did not run. The driver is verified under Xvfb on Linux. |
| End to end on the packaged Windows build | Incomplete | 7 checks passed before the run was stopped because the laptop was critically low on memory: renderer isolation, the OS sandbox, Local mode setup, runtime install, model download, on-device dictation and a dictionary substitution. Insertion, transforms, Notetaker and the rest did not run. It was not restarted. |
| End to end on Linux | Not run | It runs in Docker, which was kept stopped for these measurements. |

Much of the desktop's window, renderer and platform code is exercised by the end to end drivers rather than by unit tests, and that is not counted in the desktop coverage.

## Reproduce

Requires Node 22, Python with jiwer, ffmpeg and PowerShell. Keep the audio, profiles and results outside the checkout.

```sh
python tools/benchmark/prepare_audio.py <LibriSpeech/test-clean> <bench>/audio
# extract the released installer into <bench>/app/payload, then set up one profile per model
node tools/benchmark/bench_app.mjs setup --exe <payload>/whisperer.exe --profile <temp>/whisperer-bench-parakeet --out <bench>/results --pw <playwright-core>/index.mjs --model istupakov/parakeet-tdt-0.6b-v3-onnx
bash tools/benchmark/run_all.sh <bench> <playwright-core>/index.mjs <temp>
python tools/benchmark/wer.py <bench>/audio <bench>/results/meeting/meeting-parakeet.json
```

`run_all.sh` skips phases that already have results, so it can resume after an interruption. Raw logs, memory samples and transcripts stay with the results.
