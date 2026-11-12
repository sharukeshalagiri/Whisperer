# Changelog

All notable changes to Whisperer are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0-beta.2] - 2026-11-12

A security, privacy and reliability release from a full audit and end-to-end runs on Linux and Windows. It contains no new features. Installers are still unsigned.

### Security

- **Sign-in must now be approved in the browser.** A sign-in link someone else sends you can no longer sign them into your account. After you sign in at your identity provider, the browser shows a code and an Approve button. Approve only if the same code is on the Whisperer sign-in screen.
- Reusing a refresh token that was already rotated now ends the whole sign-in, on every device that shares it.
- The API refuses request bodies before authentication and caps their size: 26 MB for audio uploads, 64 MB for sync, 4 MB elsewhere.
- Transcription, language-model and MCP question requests are limited per account (`INFERENCE_REQUESTS_PER_MINUTE`, default 60, `0` turns it off). This is the same limit for every account, to stop runaway inference costs. It is not a plan or quota.
- The sign-in stream no longer holds a database connection for its whole lifetime.
- Electron 44.10.2, certifi 2026.10.23, authlib 1.9.5 and joserfc 1.8.0 fix the advisories reported against the earlier versions.

### Privacy

- Local mode makes no network requests you did not start. On Linux, Chromium no longer downloads spellchecker dictionaries from Google at launch, and spellchecking is off there. onnxruntime's built-in telemetry is turned off.
- Requests to an endpoint on this computer (`127.0.0.1`, `localhost`, `[::1]`) never go through a configured proxy.
- The automatic update check is now opt-in: Settings › System › Check for updates automatically. It contacts GitHub, so it is off by default. Check for updates still works on request.
- Delete on-device data now removes everything its dialog lists, including cached data and recordings of a server account you signed in to here. Deleting a server account also removes that account's data from this computer.
- Meetings deleted on the server disappear from the desktop, with their recordings.
- Export diagnostics now saves the app log and version details only, never transcripts, notes or meetings.
- Settings and the getting-started guide say where meeting audio and language-model text go in each mode.

### Fixed

- Windows: on-device speech in Local mode never finished loading, so every Local mode dictation and meeting transcription timed out.
- Linux X11: dictation pasted into GTK apps inserted nothing, because the paste key was sent as a synthetic event that GTK ignores.
- Linux X11: transforms could never capture the text you selected.
- Pasting no longer races the clipboard write, and the clipboard you had before is restored after Whisperer pastes.
- Quitting the app, or a crash, during a meeting no longer deletes the recording. It is finished and uploaded, and a recording interrupted by a crash is recovered at the next start.
- Meetings longer than about half an hour no longer fail to upload and block all later syncing. A recording session now finishes on its own after about two hours, and Resume continues it.
- A meeting whose upload is rejected no longer blocks every later upload, edit or Insights update.
- Cancelling a resumed recording no longer leaves the meeting open on the server.
- Starting while the server is unreachable keeps your history, notes, snippets and dictation working, and reconnects when the server is back.
- A polish failure no longer discards a successful transcription.
- Retry after a failed transcription sends the same recording again instead of asking you to repeat it.
- Starting a dictation right after the previous one finished no longer fails with "No recording is active."
- Right after Delete on-device data, the first lists the app reloads no longer fail with "The server request failed."
- The server's meeting worker keeps running after an unexpected error.
- The on-device server is restarted when it stops responding, with a pause between restarts.
- A damaged local database or settings file no longer stops the app or Local mode from starting. The damaged file is kept next to a fresh one, and settings come back from their last good copy.
- A Local mode runtime that keeps failing to start can be repaired by setting up on-device mode again.
- Two servers that sync records with the same timestamp now agree on which copy wins.
- The Transforms page's View changes button now opens the last transform's before and after.
- The microphone can be changed in Settings after onboarding.
- Compose now passes the documented `SPEECH_*` and `LLM_*` settings to the API.

### Changed

- Meetings are recorded at 24 kbit/s Opus. Imported audio files are limited to 25 MB.
- The language setting is described as a hint: the default on-device Parakeet model detects the language by itself.
- `make api-lint` type-checks the API for Linux, macOS and Windows.
- A manual run of the Release workflow builds test installers as workflow artifacts without a release.

## [0.2.0-beta.1] - 2026-11-11

First public beta. Installers are unsigned; see the [roadmap](docs/roadmap.md) for what has and has not been verified on each platform.

### Added

- **System-wide dictation.** Hold-to-talk or toggle shortcuts start a recording from any app. The transcript is inserted into the focused app on macOS, Windows and Linux X11, with a clipboard fallback where insertion is not available, such as Wayland.
- **Polish, dictionary and snippets.** An optional language model cleans up each dictation. A per-user personal dictionary replaces heard phrases exactly once, and snippets expand saved text.
- **Transforms.** Saved instructions rewrite selected text in any app, paste only if the same text is still selected, and show a before and after review.
- **Notetaker.** Microphone meeting recording with resumable segments, a server-side transcript and summary worker, editable transcript and summary with revision checks, and single-turn questions answered from the saved meeting.
- **Insights.** Words dictated, words per minute, streaks and a daily heat map, computed by the server from numerical contributions only.
- **Self-hosted API.** FastAPI service with OpenID Connect device sign-in, identities bound by issuer and subject, owner-scoped resources, an optional group allowlist and any OpenAI-compatible inference gateway. Compose stacks for cloud, CPU, NVIDIA and Apple hosts.
- **Local mode.** "Continue without signing in" runs the same API as a loopback child process. It installs a pinned `uv`, Python and locked packages, and pinned Parakeet or Whisper ONNX speech models, only when you ask, verifying every file by size and SHA-256. The desktop proves the child is its own with an instance ID and an HMAC challenge, and passes secrets only over stdin.
- **Sync between Local mode and a server.** On request, notes, the dictionary, finished meeting text and metric events move in both directions. The newer `updatedAt` wins, deletions carry over as tombstones, and audio never moves.
- **Read-only MCP endpoint.** Lists, pages and answers questions about a user's own meetings for MCP clients, signed in through the identity provider. Off by default.
- **Earlier-database import.** `python -m whisperer_api import-legacy` migrates notes, transcripts and dictionary entries from Whisperer's earlier Node.js API database. It is a dry run by default, takes an explicit user mapping and opens the source read-only.
- **Release tooling.** `tools/release-desktop.mjs` builds one committed revision for Linux, Windows and macOS with checksums and a manifest. macOS host defaults can come from a per-user config outside the checkout.
- Contributor guide, security policy, issue and pull request templates, per-folder `AGENTS.md` guides and `make docs-check`.

### Fixed

- Windows: time zones now resolve without a system IANA database, which had broken metrics, sync and Local mode there.
- Windows: deleting meeting audio retries transient file locks, commits row deletions before removing files, reports files it could not remove, and sweeps orphaned audio safely.
- Windows: `make api-contract` no longer reports a stale contract because of CRLF line endings.
- The cloud Compose stack validates and starts with `GATEWAY_API_KEY` alone.
- The earlier-database import no longer fails on dictionary entries or phrases that already exist, and reports only rows it would copy or did copy.
- Settings: the Notetaker audio toggle, which never took effect, is replaced by an accurate note. Meeting audio stays on the device until the meeting is deleted. The dictation polish toggle moved to General, where it applies.

### Removed

- An unused meeting IPC operation that misreported server support, and an unreachable alternate history screen with disabled buttons.

### Security

- Every window is sandboxed with context isolation, and IPC is validated with Zod in both directions. Packaged builds flip Electron fuses.
- No telemetry, crash reporting or analytics of any kind.

[Unreleased]: https://github.com/sharukeshalagiri/Whisperer/compare/v0.2.0-beta.2...HEAD
[0.2.0-beta.2]: https://github.com/sharukeshalagiri/Whisperer/compare/v0.2.0-beta.1...v0.2.0-beta.2
[0.2.0-beta.1]: https://github.com/sharukeshalagiri/Whisperer/releases/tag/v0.2.0-beta.1
