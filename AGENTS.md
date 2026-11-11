# Whisperer contributor guide

Rules for anyone changing this repository, human or agent. [CONTRIBUTING.md](CONTRIBUTING.md) covers setup, checks and pull requests. This file holds the rules that apply across the whole repository; each folder's AGENTS.md narrows them for that folder.

## Layout

| Path | Owns |
| --- | --- |
| `src/desktop/main` | Electron main process: windows, IPC handlers, the API client, local SQLite, platform adapters, the Local mode supervisor |
| `src/desktop/preload` | The sandboxed `window.whisperer` bridge |
| `src/desktop/renderer` | React UI. Talks only to the bridge |
| `src/desktop/shared` | Process-neutral IPC contract, Zod schemas, shortcuts and release naming |
| `apps/api` | FastAPI service, its tests and the generated `openapi.json` |
| `packages/api-client` | TypeScript client generated from `openapi.json` (`src/` and committed `dist/`) |
| `deploy`, `compose.yaml`, `Dockerfile` | Container image and the Compose inference stacks |
| `assets/brand` | Brand sources and generators; everything under `raster/`, `svg/`, `web/` and `src/desktop/assets` is generated |
| `tools` | `commands.mjs` behind every `make` target, packaging, release and acceptance drivers |
| `docs` | User guide and developer reference |

## Product rules

These apply to the desktop, the API and the docs alike.

- **No telemetry.** Ship no crash reporting, analytics SDKs, session replay, tracing or experiment exposure, and no third-party keys or endpoints. Desktop diagnostics stay in the local log file.
- **No tiers.** Every authenticated user has full access. Do not add plans, subscriptions, trials, quotas, upgrades, referrals or billing, and show no pricing or upgrade UI. The optional `OIDC_ALLOWED_GROUPS` allowlist is an operator setting that is off by default.
- **Honest egress.** Every claim about Local mode, in the UI or the docs, says where audio and text go. An HTTP endpoint still receives data even on localhost, so never claim zero egress and never call device mode "offline".
- **Backend ownership.** Meetings, their recording segments, transcripts and summaries belong to the authenticated user on the API. The desktop keeps only a scoped cache and pending uploads. Resuming appends segments without discarding prior edits, and summary regeneration never overwrites concurrent edits.
- **Personal dictionary.** Entries live on the API per user. Substitutions apply exactly once, to regular dictation only. Meetings, summaries and transforms never read or update the dictionary, and they never inflate dictation metrics.
- **Product metrics** are numerical dictation contributions stored per user for the Insights page. They are product data, not telemetry: never upload dictation text, audio, screenshots or diagnostics to populate them.
- **Transforms** generate a proposed replacement through the API and paste it only if the same text is still selected, then show a before/after review. Document surfaces keep explicit review and preserve revisions.
- **Secrets.** Gateway, OIDC and inference credentials stay on the API or in OS-encrypted desktop storage. Never commit credentials, `.env` files, personal audio, captured user data, installers or build output.

## Folder documentation

- Every tracked folder has an AGENTS.md and the exact CLAUDE.md shim. Untracked dependencies, caches and build output do not count.
- AGENTS.md owns the folder's standing rules. It starts with a link to its parent's AGENTS.md, holds only rules specific to that folder, and ends with `## Learnings`. A rule lives in exactly one place, the most specific folder it applies to; a child narrows its parent rather than repeating it.
- CLAUDE.md is only the three-line shim pointing to the AGENTS.md beside it. Never put rules in it.
- A README.md is optional. Where one exists, it explains the component with a Mermaid diagram and links the README.md of every child folder that has one. Update the nearest README when a component's ownership, data flow or public exports change.
- Change the folder guides together with the code, and run `make docs-check` before committing.

## Scope owners

- [Applications](apps/AGENTS.md) own the API implementation.
- [Assets](assets/AGENTS.md) own artwork generation and screenshots.
- [Deploy](deploy/AGENTS.md) owns the Compose inference stacks.
- [Documentation](docs/AGENTS.md) owns the user guide and developer reference.
- [Packages](packages/AGENTS.md) own the generated API client.
- [Desktop source](src/AGENTS.md) owns the Electron app and its runtime boundaries.
- [Tools](tools/AGENTS.md) own portable commands, packaging and releases.
- [Automation](.github/AGENTS.md) owns CI and repository templates.

## Code standards

- TypeScript is strict, linted with ESLint at zero warnings and formatted with Prettier. Python passes Ruff and `mypy --strict` and uses Google-style docstrings.
- Document exported functions and components concisely. Keep components and modules narrow.
- Never weaken lint rules, skip tests or add unexplained suppressions.

## Learnings

None yet.
