# Contributing to Whisperer

Thanks for your interest in improving Whisperer. Bug reports, documentation fixes and focused pull requests are all welcome.

## Before you start

- Search existing issues before opening a new one. For anything larger than a small fix, open an issue first so the approach can be agreed before you write code.
- Report security problems privately as described in [SECURITY.md](SECURITY.md), never in a public issue.
- Read [AGENTS.md](AGENTS.md) for the project-wide rules and code standards, then the AGENTS.md in each folder you change. The nested guides hold the architecture boundaries and security rules for their folder.

## Development setup

You need Node.js 22.18 or newer for every `make` target, since each one runs through `node tools/commands.mjs`. You also need [uv](https://docs.astral.sh/uv/) and Python 3.12. Docker is optional and only needed for the Compose stacks and the Windows cross-build.

```sh
make setup        # install locked desktop dependencies and build the app
make api-setup    # install the locked Python workspace, including the on-device extra
make help         # list every command
```

Day to day:

```sh
npm run desktop:dev   # Electron with hot reload
make server           # API on http://0.0.0.0:4318 for development
```

## Checks

Run the checks that cover your change before you open a pull request. CI runs all of them.

```sh
make desktop-lint     # TypeScript type checks and ESLint
make desktop-test     # Vitest and node:test suites
make desktop-build    # production build of main, preload and renderer
make api-lint         # Ruff and mypy --strict
make api-test         # pytest
make api-contract     # regenerate openapi.json and the TypeScript client, fail if stale
make stack-config     # validate every Compose stack
make docs-check       # every folder has AGENTS.md and the CLAUDE.md shim; READMEs have a diagram and child links
```

Do not weaken lint rules, skip tests or add suppressions to get a green build. If a suppression is truly needed, explain it in a comment on the same line.

## Changing the API

The API is contract first. After changing a route or a wire model, run `make api-contract` and commit the regenerated `apps/api/openapi.json` and `packages/api-client` together with the change. The generated client, including its `dist/`, is committed on purpose so the desktop builds without a Python toolchain.

## Pull requests

- Keep each pull request focused on one change, with tests for new behavior and fixed bugs.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages, for example `fix(desktop): keep the pill above full-screen windows`.
- Update the docs in `docs/` when user-visible behavior or configuration changes, and the folder's AGENTS.md when its rules change. A new folder gets an AGENTS.md that links its parent's, plus the CLAUDE.md shim.
- Never commit secrets, `.env` files, recordings, personal data, installers or build output.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
