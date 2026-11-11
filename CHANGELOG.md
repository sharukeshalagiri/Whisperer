# Changelog

All notable changes to Whisperer are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/sharukeshalagiri/Whisperer/compare/v0.2.0-beta.1...HEAD
[0.2.0-beta.1]: https://github.com/sharukeshalagiri/Whisperer/releases/tag/v0.2.0-beta.1
