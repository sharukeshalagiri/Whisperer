Parent instructions: [tools AGENTS.md](../AGENTS.md).

These scripts measure the released desktop build. They are run by hand, never by CI or a Make target.

- Benchmark only a released build and a fresh temporary profile. Never point them at a real user profile or `%APPDATA%\Whisperer`.
- Use only public audio, LibriSpeech test-clean by default, and keep audio, profiles and raw results outside the checkout.
- Take every path from the command line. Never hardcode a user name, host name or local path.
- Report what the scripts measure, including failures and outliers. Change [docs/benchmarks.md](../../docs/benchmarks.md) together with a change to how a number is measured.

## Learnings

None yet.
