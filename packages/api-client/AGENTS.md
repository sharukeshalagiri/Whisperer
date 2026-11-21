Parent instructions: [packages AGENTS.md](../AGENTS.md).

Do not hand edit `src/` or `dist/`. Regenerate both from `apps/api/openapi.json` with `make api-contract`.

Keep the CommonJS output shape because the Electron main process loads `dist` with `require`.

Regeneration rewrites the client files but keeps this guide. `src/core/` stays tracked even though `.gitignore` ignores root-level core dumps.
