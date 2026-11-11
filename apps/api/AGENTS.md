Parent instructions: [apps AGENTS.md](../AGENTS.md).

Keep the OpenAPI document and generated client compatible with the desktop. Use `make api-contract` after intentional contract changes.

Keep OIDC credentials and gateway credentials outside this package and out of test fixtures.

Browser sign-in first shows an approval page with the code from `sign_in_code`, which the desktop shows too; nothing completes until the person posts that page's one-time approval token to `/auth/approve`. It then finishes on a completion page that opens `whisperer://auth/transfer/success?device_code=…` and shows an "Open Whisperer" fallback link. Put only the device code in that link; tokens are redeemed through the verifier-protected `/device/poll`.

On-device inference dependencies belong in the optional `local` extra. Every locked package in it must have a CPython 3.12 wheel for macOS arm64 and x64, Windows amd64 and Linux x86_64 and aarch64; check `uv.lock` after any change.

## Learnings

None yet.
