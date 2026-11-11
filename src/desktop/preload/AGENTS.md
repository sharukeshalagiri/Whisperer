Parent instructions: [desktop AGENTS.md](../AGENTS.md).

- This module runs with renderer-adjacent privileges; expose only the typed `window.whisperer` named methods.
- Never expose `ipcRenderer`, `contextBridge`, a generic invoke/send function, Electron modules, Node modules, tokens or unrestricted event channels.
- Validate all result and event payloads against `shared/protocol.ts` before renderer delivery. Turn malformed or transport failures into safe generic errors.
- Keep the preload compatible with `sandbox: true`: do not rely on arbitrary Node APIs or dynamic module loading.
- Change this bridge in lockstep with `shared/contracts.ts` and `shared/protocol.ts`.

## Learnings

None yet.
