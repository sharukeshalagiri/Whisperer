Parent instructions: [main AGENTS.md](../AGENTS.md).

- This directory owns native platform capability and insertion adapters only.
- Inject Electron and command-execution dependencies. Never import or expose renderer-controlled command execution.
- Native commands must use `execFile`-style argument arrays, `shell: false`, and bounded timeouts. Do not interpolate target values into source code or shell strings.
- Preserve honest unavailable states. Wayland and system audio remain unavailable; press-and-hold actions are available only through `HoldShortcutService` on its supported platforms with required permission.
- Keep target identities in main-process memory; do not log them or send them to the renderer.
- Global hooks run only for a signed-in session and match only configured chords. Pressed key codes stay transient in memory; never log, persist or forward them.
