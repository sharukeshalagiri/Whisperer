## Summary

<!-- What does this change do, and why? Link the issue it resolves. -->

## Checks

- [ ] `make desktop-lint`, `make desktop-test` and `make desktop-build` pass, if the desktop changed
- [ ] `make api-lint` and `make api-test` pass, if the API changed
- [ ] `make api-contract` is clean, and the regenerated contract and client are committed with any API change
- [ ] Docs and folder AGENTS.md files are updated for behavior, rule or configuration changes, and `make docs-check` passes
- [ ] No secrets, `.env` files, recordings, personal data or build output are included
