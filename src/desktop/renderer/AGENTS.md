Parent instructions: [desktop AGENTS.md](../AGENTS.md).

## Renderer boundaries

- Build screens only in the React TypeScript root, `components/`, and `features/`.
- The renderer talks only through the typed `window.whisperer` bridge in `../../shared/contracts.ts`. Do not use `fetch`, WebSocket APIs, Node APIs, Electron imports, credentials, or generic IPC.
- Keep account and server details renderer-safe. Never render, log, persist, or infer credentials or upstream tokens.
- Gate the hub on `connectionMode === 'device' || authenticated`. `authenticated` alone means a remote session exists, and it may stay true in device mode.
- `main.tsx` owns the single React Query client. Features use that provider instead of creating clients.
- Standalone hash windows use the same bridge and must not create a second audio capture engine. The hub owns capture coordination.
- Keep `#/home` and `#/history` as Dictation aliases, `#/meetings` as Notetaker, and `#/notes` as the hub Scratchpad while the sidebar keeps its current information architecture. `#/settings` opens the local Settings modal over Dictation.

## UI quality

- Keep the desktop shell device-oriented: no marketing, team or promotional copy.
- Preserve accessible semantics, visible focus, keyboard operation, light/dark theme support, and reduced-motion behavior.
- Shell-level motion paints beneath the sidebar and workspace content, ignores the pointer and never covers the page. Measure its geometry from live layout rather than fixed offsets or scales, and keep an old backend's page inert while it leaves.

## Learnings

None yet.
