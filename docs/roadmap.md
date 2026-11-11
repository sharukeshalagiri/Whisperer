# Roadmap and known limitations

Whisperer is in beta. This page records what has been verified on which platform, what is known not to work yet, and what is planned. It is the single place for open work; other pages link here.

## Platform status

| Area | Linux x64 (X11) | macOS | Windows |
| --- | --- | --- | --- |
| Desktop build and unit tests | Verified | Built, not run on Apple Silicon hardware | Cross-built and unit tested |
| End-to-end acceptance against the fixture | Verified under Xvfb | Run on an Intel macOS VM | Partial; X11-only checks are skipped |
| Physical microphone, OS permission prompts, shortcuts and insertion | Virtual X11 and a fake microphone only | Not yet verified on physical hardware | Not yet verified on physical hardware |
| Local mode runtime install and dictation | Verified from source | Not yet verified | Unit tests only |
| Packaged build in Local mode | Not yet verified | Not yet verified | Not yet verified |
| `apple` and `nvidia` Compose stacks | n/a | Merged Compose file validated only | Merged Compose file validated only |
| Code signing and notarization | n/a | Unsigned | Unsigned |

Linux arm64 is in the dependency lock but has not been installed or run.

## Known limitations

### Desktop

- Installers are unsigned. macOS asks for Accessibility again after each rebuild, and in-app installs need signed builds, so updates download through the browser.
- Wayland has no text insertion; dictation is copied to the clipboard instead. X11 insertion requires `xdotool`.
- The Fn (Globe) key and mouse buttons cannot be bound as shortcuts. Press-and-hold shortcuts need Accessibility on macOS and are unavailable on Wayland.
- On Linux the recording pill keeps its hit target active, because Electron cannot forward ignored mouse movement there.
- The active application name is not captured on any platform, so the Insights apps card stays empty.
- Automatic transforms after dictation are not implemented; the controls stay disabled and say so. Every transform is reviewed before it is applied.
- Scratchpad has no version history yet; its history button stays disabled.
- Dictation history keeps text only. No audio is retained for playback, and there is no in-app feedback on a dictation.
- Dictation languages are limited to the five the contract defines.

### Notetaker and meetings

- Only microphone audio is captured. There is no system audio capture, speaker labelling, folders or calendar automation.
- Meeting segments larger than the gateway's upload limit are not split on the server.
- Meeting questions are single turn, with no saved conversation, streaming or citations. The practical context size depends on the configured model.

### Local mode

- Inference runs on the CPU only, and it is serialized: a dictation can wait behind a long meeting segment.
- Only the two pinned catalog models can be used. Model import from disk is not available.
- A model that fails to load is fully re-hashed on the next attempt, which is slow for the 670 MB Parakeet model.
- Model downloads write on the server's event loop and cannot be cancelled without stopping the local server; the next start downloads again.
- If the desktop exits while a transcription runs, the local server may wait for that work before it exits.
- The runtime uses roughly 400 MB of disk on Linux x64 before models, and setup requires 2 GiB free.
- Deleting on-device data vacuums both SQLite databases, but filesystem snapshots, backups and SSD wear levelling can keep older copies outside the app's control. A data-only erase for a remote account is not built; deleting the remote account removes everything.
- The renderer cannot read structured error codes across the context bridge and branches on state and message text.

### Sync

- The newer `updatedAt` wins, using each server's own clock, so a badly skewed clock can let an older edit win. There is no field-level merge or conflict copy.
- Meeting audio, local dictation history and snippets are not synced.
- Each snapshot carries everything, with no paging or incremental cursor.
- Sync is covered by API and unit tests, not yet by an end-to-end run against a live remote server.

### MCP

- The endpoint is read-only: no write tools, and no access to notes, dictionary, metrics or audio. It is not offered in Local mode.
- Clients sign in through an interactive browser OAuth flow. Headless clients are untested.
- The gateway must return a complete `chat.completion` body; streaming-only or truncated responses fail.

### Metrics

- `correctedWords` is a word-multiset difference between raw and final text, a proxy rather than an edit distance: reordered words count as corrections and inserted words never do.

## Planned

- Physical-device verification of capture, permissions, shortcuts and insertion on macOS, Windows and Linux X11, and Apple Silicon runs.
- Local mode installs and packaged-build runs on macOS arm64 and x64, Windows x64 and Linux arm64, with speech timing measurements.
- Signed and notarized builds, then in-app updates.
- Wayland insertion through a consented portal or compositor adapter.
- Server-side splitting of large meeting segments.
- A data-only erase for remote accounts.
- Scratchpad version history, once desktop storage keeps note revisions.
- A tighter polish prompt for small local models, which sometimes return several options instead of one rewrite.

Contributions toward any of these are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).
