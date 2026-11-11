Parent instructions: [repository root AGENTS.md](../AGENTS.md).

Implement portable Make target behavior in `commands.mjs`, not shell recipes. Pass artifact paths explicitly.

`check-folder-docs.mjs` backs `make docs-check`. Change it together with the folder documentation rules in the root AGENTS.md.

Desktop acceptance (`drive-desktop.mjs`) runs against the loopback fixture in `desktop-fixture.mjs` with a disposable profile. It must never contact production or a real identity provider.
Release orchestration must archive an explicit committed SHA, retain installers only under ignored `dist/` or outside the checkout, and state verification limits instead of treating unavailable host checks as passed.
Release names, tags and the feed come from `src/desktop/shared/releases.ts`; tools import it rather than restating a pattern. Bump `package.json` `version` for every release and never reuse a tag. Publishing is an outward action: publish only with the release owner's approval, and take the forge token from the environment only.
macOS builds use the host given by `--mac-host` or `WHISPERER_MAC_HOST`, or the optional per-user release config outside the checkout. Never hardcode a host, user or path, bypass the host's SSH configuration, delete remote workspaces or publish artifacts from that host.

## Learnings

None yet.
