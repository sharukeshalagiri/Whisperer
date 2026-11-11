# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting: open the repository's **Security** tab and choose **Report a vulnerability**. Do not open a public issue, discussion or pull request for a suspected vulnerability.

Include what you can of the following:

- the affected component (desktop main, preload or renderer, the API, Local mode, the MCP endpoint, the Compose stacks or the release tooling) and version or commit
- steps to reproduce, or a proof of concept
- the impact you expect, such as credential exposure, sandbox escape, cross-user data access or code execution

You should receive an acknowledgement within a few days. Please give maintainers a reasonable time to release a fix before disclosing details publicly.

## Supported versions

Whisperer is in beta. Only the latest release and the `main` branch receive security fixes.

## Scope notes

These are part of the threat model and are good places to look:

- **Electron hardening.** Every window is sandboxed with context isolation, the preload bridge exposes only named functions validated by Zod in the main process, and packaged builds flip Electron fuses.
- **Credentials.** The renderer never receives API, OIDC or inference credentials. Desktop secrets are stored with the operating system's encryption through Electron `safeStorage`.
- **Local mode.** The desktop verifies the loopback API child through its health `instanceId` and an HMAC challenge before sending the boot token, and passes secrets only over the child's stdin, never in argv, environment variables or files.
- **Downloads.** The runtime installer and the on-device model store accept only artifacts pinned by version or commit, size and SHA-256, and download only after an explicit user action.
- **API authorization.** Identities are bound by OIDC issuer and subject, never by email, and every resource query is scoped to its owner. The MCP endpoint is read-only and owner-scoped.

Self-hosted deployments are operated by their owners. Misconfiguration of your own identity provider, reverse proxy or inference gateway is out of scope unless Whisperer's defaults or documentation make it unsafe.
