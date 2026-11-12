# Roadmap and known limitations

Whisperer is in beta. This page records what has been verified on which platform, what is known not to work yet, and what is planned. It is the single place for open work; other pages link here.

## Platform status

| Area | Linux x64 (X11) | macOS | Windows |
| --- | --- | --- | --- |
| Desktop build and unit tests | Verified | Built, not run on Apple Silicon hardware | Cross-built and unit tested |
| End-to-end acceptance against the fixture | Verified under Xvfb | Run on an Intel macOS VM | Partial; X11-only checks are skipped |
| Physical microphone, OS permission prompts, shortcuts and insertion | Virtual X11 and a fake microphone only | Not yet verified on physical hardware | Insertion and transforms verified into a separate window with a fake microphone; physical microphone, prompts and shortcuts not yet verified |
| Local mode runtime install and dictation | Verified with the packaged build | Not yet verified | Verified with the packaged build |
| Packaged build in Local mode | Verified under Xvfb: dictation, insertion, transform, meetings, sync and MCP | Not yet verified | Verified: dictation, insertion, transform, meetings and data deletion |
| `apple` and `nvidia` Compose stacks | n/a | Merged Compose file validated only | Merged Compose file validated only |
| Code signing and notarization | n/a | Unsigned | Unsigned |

Linux arm64 is in the dependency lock but has not been installed or run.

## Known limitations

### Desktop

- Installers are unsigned. macOS asks for Accessibility again after each rebuild, and in-app installs need signed builds, so updates download through the browser.
- Wayland has no text insertion; dictation is copied to the clipboard instead. X11 insertion requires `xdotool`.
- The Fn (Globe) key and mouse buttons cannot be bound as shortcuts. Press-and-hold shortcuts need Accessibility on macOS and are unavailable on Wayland.
- On Linux the recording pill keeps its hit target active, because Electron cannot forward ignored mouse movement there.
- Spellchecking is off on Linux, because Chromium would download its dictionaries from Google at startup. Windows and macOS use the system spellchecker.
- The active application name is not captured on any platform, so the Insights apps card stays empty.
- Automatic transforms after dictation are not implemented; the controls stay disabled and say so. A transform's replacement is pasted only if the same text is still selected, and View changes shows the before and after.
- Scratchpad has no version history yet; its history button stays disabled.
- Dictation history keeps text only. No audio is retained for playback, and there is no in-app feedback on a dictation.
- Dictation languages are limited to the five the contract defines.

### Notetaker and meetings

- Only microphone audio is captured. There is no system audio capture, speaker labelling, folders or calendar automation.
- One recording session holds up to about two hours (25 MB at 24 kbit/s); Whisperer then finishes the meeting and Resume continues it in a new segment. Imported audio is limited to 25 MB and is not split.
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

- The newer `updatedAt` wins, using each server's own clock, so a badly skewed clock can let an older edit win (audit E11; equal timestamps now resolve the same way on both sides). There is no field-level merge or conflict copy.
- Meeting audio, local dictation history and snippets are not synced.
- Each snapshot carries everything, with no paging or incremental cursor.
- Sync is covered by API and unit tests, not yet by an end-to-end run against a live remote server.

### MCP

- The endpoint is read-only: no write tools, and no access to notes, dictionary, metrics or audio. It is not offered in Local mode.
- Clients sign in through an interactive browser OAuth flow. Headless clients are untested.
- The gateway must return a complete `chat.completion` body; streaming-only or truncated responses fail.

### Metrics

- `correctedWords` is a word-multiset difference between raw and final text, a proxy rather than an edit distance: reordered words count as corrections and inserted words never do.

## Open audit findings

The November 2026 audit's critical, high and medium findings are fixed. These low-severity ones are open; the ids match the audit report.

### Desktop

- **A7** Insights "Apps dictated into" stays at 0: app names are not recorded.
- **A12** For a resumed meeting, playback and Export audio each use one segment, not the whole recording.
- **A13** Settings › Account says Local-mode data is not merged into a server account, although Sync now merges notes, dictionary and meeting text.
- **A14** Signing out while the server is unreachable signs out locally but shows an error.
- **A15** A meeting that is already on the server cannot be deleted while offline.
- **A17** The All and Personal tabs on Dictionary and Snippets do not filter.
- **A18** "Open Whisperer at login" is shown on Linux, where it does nothing. The `retainAudio` setting is accepted and ignored.
- **A19** The bridge exposes `history.clear`, `transformations.start` and `diagnostics.open` without a control that uses them.
- **A20** The Notetaker shortcut can start a meeting before a freshly created hub window is listening. Resume lacks the server-switch and erase guards that Start has.
- **B2** A transform's selection capture saves and restores plain text only, so images or rich text on the clipboard are lost, and the temporary copy appears in clipboard history. After a paste, only plain text is put back.
- **B3** The paste target is the focused window and process, so a different field or tab in the same window still matches.
- **B4** IPC checks the owning window and validates every payload, but does not check the frame's origin, and most channels are not limited to the window that needs them.
- **B5** No `will-redirect`, `will-attach-webview` or `web-contents-created` guards; navigation and new windows are already denied.
- **B6** DevTools can be opened in packaged builds.
- **B7** Update links are checked for scheme only, and `http:` is accepted.
- **B8** `WHISPERER_DESKTOP_DATA_DIR` is honoured in packaged builds without validating the path.
- **B9** The keyboard hook loads with the default hold-to-talk shortcut. It records nothing and fires only on configured shortcuts, but a code comment says it is opt-in.
- **B10** Windows helpers start `powershell.exe` by name rather than by its full System32 path.
- **B11, B13** Builds are unsigned, the bundled API source is outside ASAR integrity, and the update notice does not verify an installer digest (SHA256SUMS is published with each release).
- **B12** The permission check handler grants `media` without checking that it is audio; the request handler does require audio only.
- **D10** Deleting on-device data needs the on-device server to be running.
- **D11** With "sync at startup" on, erased on-device data comes back from the server account, and the erase dialog does not warn about it.
- **D13** File-system errors in the log include full paths, which contain the OS user name.
- **E12** A meeting segment is read into memory whole for each upload attempt.
- **E13** If writing the launch config fails during an automatic restart, the status can keep showing the old port.
- **E15** Not verified on macOS: unsigned upgrades may lose access to the keychain entry, and the saved session would then be dropped.
- **F1** Not verified: X11 key events use `xdotool key --window` (synthetic events). Tk and Chromium accept them; GTK applications are untested.

### API

- **A10** When polish fails, the raw transcript is returned, but nothing in the response tells the desktop that polish was skipped, so the user is not told.
- **A16** With the language model off, a finished meeting still queues a summary, which ends as failed with a generic message.
- **A22, A23** The configuration guide gives the wrong `DATABASE_URL` default, and its deploy steps include `make api-contract`, which needs a git checkout.
- **C6** `durationMs` on a segment upload has no upper bound, and there is no per-user storage quota.
- **C7** A completed sign-in that is never redeemed keeps its tokens in plain text until it expires, and expired rows are not purged.
- **C8** A repeated `/login` with an active device code answers 500, and `verifier_challenge` length and format are not validated.
- **C9** API responses carry no `nosniff`, `Cache-Control: no-store` or HSTS headers; only the sign-in pages do.
- **C10 (D14)** The container runs uvicorn with its access log on, which records the OIDC authorization code in `/auth/callback` request lines.
- **C11** The server does not validate configured inference URLs (scheme, embedded credentials), and the SSRF model is not documented.
- **C12** `/v1/transcriptions` accepts any `audio/*` type and does not check the bytes.
- **D1** Two clients still honour a configured proxy for loopback addresses: the `preflight` command and the OIDC client. Neither carries audio or text.
- **C14, C16** Development dependencies with advisories: js-yaml, undici and @hey-api packages in code generation and build tooling. None of them ships in the app. (pytest is now 9.2.)
- **D6** Sync tombstones are never pruned; dictionary tombstones keep the deleted phrase.
- **D7** The database engine does not hide SQL parameters, so an unexpected database error could log note or transcript text.
- **D8** The API reference says dictionary substitutions run after polish; the code runs them before.
- **D12** Deleting a server account does not compact a SQLite database.
- **D15** onnxruntime's Windows telemetry events are not explicitly disabled.
- **D16** The device-setup README mentions custom Hugging Face model ids, which the app does not accept.
- **E14** Model downloads cannot resume; an interrupted download starts again from zero.

## Dependency updates held back

Dependabot pull requests that were closed rather than merged, and why.

- **npm development group (#2):** TypeScript 7 cannot be installed yet, because typescript-eslint 8.72 supports TypeScript below 6.1 only (`npm ci` fails with ERESOLVE). The same group also held Electron 45, Vite 8, electron-vite 6 and @types/node 26. Each of these major upgrades needs its own migration and an end-to-end run of the packaged app, so they will be done one at a time.
- **cryptography 50 for Intel macOS (#10):** cryptography 49 and later publish no Intel macOS wheel, and Local mode installs with `--no-build`, so the Intel macOS pin stays at `cryptography<49`. Other platforms already use cryptography 50. Revisit when an Intel macOS wheel is published or Intel Macs are no longer supported.

## Planned

- Physical-device verification of capture, permissions, shortcuts and insertion on macOS, Windows and Linux X11, and Apple Silicon runs.
- Local mode installs and packaged-build runs on macOS arm64 and x64, Windows x64 and Linux arm64, with speech timing measurements.
- A dictation latency benchmark (stop to text) for the packaged build, and an upgrade check from each earlier release on every platform. Neither was measured for 0.2.0-beta.2.
- Signed and notarized builds, then in-app updates.
- Wayland insertion through a consented portal or compositor adapter.
- Server-side splitting of large imported audio files.
- Clock-skew detection or logical clocks for sync (E11).
- A data-only erase for remote accounts.
- Scratchpad version history, once desktop storage keeps note revisions.
- A tighter polish prompt for small local models, which sometimes return several options instead of one rewrite.

Contributions toward any of these are welcome; see [CONTRIBUTING.md](../CONTRIBUTING.md).
