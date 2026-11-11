Parent instructions: [.github AGENTS.md](../AGENTS.md).

- Keep CI checks aligned with supported Make targets and pinned tool versions. `ci.yaml` and `codeql.yml` only verify; they never publish packages or deploy services.
- `release.yml` is the only workflow that writes: on a `v*` tag it builds unsigned installers, checks their names against `src/desktop/shared/releases.ts`, and attaches them with `SHA256SUMS` to a draft release. It never publishes the draft and never signs.
- Give each job the least `permissions` it needs; the default is `contents: read`.

## Learnings

None yet.
