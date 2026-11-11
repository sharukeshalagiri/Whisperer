Parent instructions: [main AGENTS.md](../AGENTS.md).

- Keep credentials inside SettingsService and ApiService. Public responses and logs contain none.
- A cancelled or replaced login must never persist its completion. A refresh must check its session epoch before persisting.
- Use the generated API client for existing contracts. A desktop change never adds or silently emulates an unsupported server endpoint.
- Propagate AbortSignal to the HTTP request. Transient connection failures do not erase a valid session.
- Route every authorized call by `connectionMode`. Device mode uses only the verified local connection and its boot token; it never refreshes, logs out or clears the remote session. Remote mode never uses the local connection. The only exception is the sync snapshot pair, which names its side explicitly.
- Inference keys stay OS-encrypted in SettingsService and are reported publicly only as `hasApiKey`.

## Learnings

None yet.
