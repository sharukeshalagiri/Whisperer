Parent instructions: [main AGENTS.md](../AGENTS.md).

Runtime modules contain focused orchestration that can be tested without Electron.

- Keep Electron imports at the outer composition boundary where possible.
- Preserve cancellation semantics: aborted transcription work must never publish, copy, or persist a late result.
- Author a failing focused test before changing a runtime behavior.
- Keep authorization fail-closed: only owned main frames may reach named handlers.
- On-device runtime: nothing downloads at install, at startup or in the background. Download the pinned `uv`, Python, locked API packages or a catalog model only after an explicit user action, with visible progress, and only pinned HTTPS assets whose size and SHA-256 come from the upstream release, and never resolve, build or compile on the user's machine (`--locked --no-build`). Change `runtime-manifest.json` only with digests copied from the actual release assets.
- Spawn with argument arrays and an allowlisted environment. Boot token and provider keys go only on the child's private stdin, never in argv, environment, files or logs.
- Trust a loopback port only after the instance id and the HMAC challenge both match. Stop or signal only the owned child, never a process found by port.
- Restart automatically a bounded number of times, then surface the failure with a user action.
- `DataSyncCoordinator` runs one two-way sync at a time: export both sides first, then merge each into the other. It refuses when `ready()` names a blocker and touches neither side.

## Learnings

None yet.
