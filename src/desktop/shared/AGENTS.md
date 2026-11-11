Parent instructions: [desktop AGENTS.md](../AGENTS.md).

- Keep this directory process-neutral: no Electron, Node, filesystem, network or storage imports.
- Define each renderer-visible operation and event name once in `protocol.ts`; never invent literal channel strings in callers. Requests use `ipcMain.handle` with `ipcRenderer.invoke`; `webContents.send` carries only main-to-renderer events.
- Every renderer-to-main request needs a strict Zod request schema and a `{ ok: true, data } | { ok: false, error }` response schema in `IPC_RUNTIME_SPECS`.
- `meetings.ask` accepts only a meeting identifier, bounded question and optional revision expectations. It never carries transcript/summary text or stored conversation history, and it returns only a bounded renderer-safe answer snapshot.
- Keep public types credential-free. Tokens, cookies, raw authentication responses and unrestricted IPC do not belong in this contract.
- Make contract changes additively when possible and update `DesktopApi`, runtime schemas, preload, guides and tests together.

- Keep shortcut actions, platform defaults and normalized collision rules in `shortcuts.ts`; renderer and main must agree on the same vocabulary.

## Learnings

None yet.
