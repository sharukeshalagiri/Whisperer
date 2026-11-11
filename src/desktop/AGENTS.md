Parent instructions: [src AGENTS.md](../AGENTS.md).

This is the Electron desktop client. Preserve existing user-visible behavior, layout and flow unless a change is requested, so each targeted change stays small and every diff carries only intent. Prefer an established, documented Electron pattern over a novel one.

## Stack

- Write main, preload and renderer in strict TypeScript. Build the renderer with React.
- Use electron-vite (Vite) with separate main, preload and renderer targets, electron-builder for packaging, ESLint and Prettier for style, Vitest for unit tests and Playwright's Electron driver for end-to-end tests.
- Lay out source as `main/`, `preload/`, `renderer/` and `shared/`. `shared/` holds the typed IPC contract and pure types only, never Electron or Node imports.

## Security baseline

Follow Electron's security checklist for every window:
- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` and `webSecurity` left on.
- Load app content only from packaged files through the privileged `whisperer://` protocol, never from http(s).
- Serve a strict Content-Security-Policy.
- Deny `window.open` and navigation by default.
- Handle permission requests explicitly.
- Hold a single-instance lock.
- Enable Electron fuses at package time in `tools/after-pack.cjs`: disable `RunAsNode` and Node CLI inspection, enforce embedded ASAR integrity and `OnlyLoadAppFromAsar`, and encrypt cookies.

IPC rules live with their owners: the contract in [shared](shared/AGENTS.md), the bridge in [preload](preload/AGENTS.md) and validation in [main](main/AGENTS.md).

## Network and credentials

- Only the main process talks to the API, through the generated client on a dedicated Electron session so the operating system certificate store applies. The renderer has no network access beyond the app protocol.
- The user enters the API server URL at sign-in. It is saved only after sign-in completes and cleared on sign-out.
- Sign-in completes by polling the verifier-protected `/device/poll`. The `whisperer://` deep link only shortens the wait, so sign-in still works if the operating system never delivers the link. The link carries only the device code, never tokens.
- A saved state from an older build must never block startup. Discard an invalid saved server and sign the user out rather than quitting.

## Diagnostics

- Write main-process warnings and errors, plus renderer console warnings and errors and renderer crashes, to the OS logs folder (`~/Library/Logs/Whisperer/main.log` on macOS) through `main/services/Logger.ts` with tokens redacted. Do not add stray `console` calls. A Finder-launched app has no console, and silently dropped renderer errors hide real crashes.
- Reproduce a startup problem past its timeouts. The hub escalates a stuck "Setting up Whisperer" loader to "hit a snag" after 20 seconds, so a shorter check misses it.

## Native capabilities

- Report each capability honestly through `Capabilities`. Wayland insertion, system audio and press-and-hold shortcuts stay unsupported until a secure adapter exists, and the UI falls back to the clipboard.
- The packaged application must not depend on native compilation. Use dependencies that ship prebuilt binaries for every target, and keep `npmRebuild` off.

## Verification

- `tools/drive-desktop.mjs` drives the real built app against a loopback fixture with a disposable profile. Keep it passing with every change to sign-in, recording, notes or history.
- React StrictMode mounts effects twice. A mounted-guard ref must be reset to true in its effect setup, not only cleared in cleanup.

## Learnings

None yet.
