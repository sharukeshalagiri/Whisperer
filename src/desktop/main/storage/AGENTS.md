Parent instructions: [main AGENTS.md](../AGENTS.md).

This directory owns only local SQLite persistence for the Electron main process.

- Keep all account-owned rows partitioned by a hashed server-plus-user scope. `setScope(null)` must make scoped reads and writes unavailable.
- Do not add server requests, tokens, credentials, history upload, or history fetches.
- Keep migrations synchronous, versioned with SQLite `user_version`, and safe for an existing database.
- Audio retention remains opt-in. Persist only relative metadata under the configured audio root; do not remove files unless a checked-contained deletion operation is deliberately added and tested.
- Return JSON-serializable exports without credentials or absolute filesystem paths.
- Keep models local until a main-runtime adapter maps them to typed shared IPC contracts.
- Add a Vitest temporary-database test before changing persistence behavior.

## Learnings

None yet.
