# Renderer component rules

Follow [renderer rules](../AGENTS.md).

- Keep primitives narrow and renderer-only; feature behavior stays in the owning feature folder.
- Give every interactive primitive an accessible name.
- Never call `window.whisperer` from shared presentation primitives. Route-level screens that read the bridge live under `features/`.
- Keep exported component props documented and avoid hidden global state.
