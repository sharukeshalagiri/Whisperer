Parent instructions: [desktop AGENTS.md](../AGENTS.md).

This directory owns the Electron main-process boundary. Keep renderer access narrow, validate every IPC sender and payload before use, and reject unsupported operations explicitly.

- Keep `index.ts` limited to process setup and dependency composition.
- Put stateful security or lifecycle coordination in `runtime/`.
- Do not add renderer compatibility bridges, generic invoke channels, or renderer-side networking.
- Use the typed names and schemas in `../shared/`; coordinate contract changes with that owner.
- Keep one active backend. A mode switch must invalidate in-flight results and change the store scope so caches and queued uploads never cross backends or accounts. Gate hub features on `connected()`, not on a remote session.

## Learnings

None yet.
