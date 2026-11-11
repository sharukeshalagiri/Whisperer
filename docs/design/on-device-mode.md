# On-device mode design

How Local mode works and why it is built this way. For what users see and how to set it up, read [Local mode](../local-mode.md). Open issues are on the [roadmap](../roadmap.md#local-mode).

## Intent

Whisperer users can run the product without signing in to any server. On-device mode starts the same Whisperer API on the user's machine, bound to loopback, and the desktop talks to it exactly as it talks to a remote server. The API owns inference. Electron holds none.

Running locally is not a promise that nothing leaves the computer. Speech or the language model can point at an HTTP endpoint, and that endpoint receives audio or text. Whether it leaves the device depends on the configured endpoint, and a localhost address alone does not prove no onward forwarding. Runtime and model downloads also use the network when the user starts them.

## Goals

- Onboard and dictate with no account and no server URL.
- Keep signed-in behavior unchanged. Remote mode uses the remote server and its inference.
- Share one API contract and one inference implementation between both modes.
- Keep the installer small. It ships API source and the lock file. The runtime and models download only on an explicit user action, verified by hash, with live progress.
- Show in the sidebar and in Settings which backend the app is using.

## Non-goals

- No Docker, no Docker Model Runner, no llama.cpp, no whisper.cpp and no inference code in Electron.
- No unverified artifacts. Only models pinned by commit, size and SHA-256 are loaded. Today that means two catalog entries, CPU inference and no model import from disk. These are current implementation limits, not architectural rules.
- No mixing. The local server runs only in device mode and remote mode never starts it.
- No automatic migration of local data into a remote account. The user-started data sync in `apps/api/src/whisperer_api/sync.py` is the one path between them.
- No telemetry and no hidden network calls.

## Modes

`connectionMode` is `remote` or `device` and is persisted in settings.

- **remote** is the sign-in flow. `apiHost` is the remote URL.
- **device** needs no sign-in. The desktop supervises a child process running `python -m whisperer_api serve-local`. `apiHost` is the loopback URL once the child is verified. The local user is `{id: 'device', displayName: 'This device'}` and its cache scope stays stable across port changes. Account shows `Running on this device`.

Entry is a `Continue without signing in` link under the sign-in form. It sets device mode and downloads nothing. Settings lets the user switch either way. A switch is refused while a dictation, meeting or transform is in flight, and a second concurrent switch is refused too. Signing in, saving the account and deleting the account are refused in device mode.

## Local server contract

Launch is `python -B -E -s -m whisperer_api serve-local --config <abs path to local.json>` with the working directory at the bundled `apps/api/src`. The command reads no environment settings.

`local.json` is written atomically by the desktop with mode 0600, holds no secrets, is at most 64 KiB and rejects unknown fields. It carries `version`, `instanceId`, `dataDirectory`, `speech` and `llm`.

- `speech` is `{provider: 'http', baseUrl, model}` or `{provider: 'onnx', model: <catalog id>}`, or null.
- `llm` is `{provider: 'http', baseUrl, model}` or `{provider: 'off'}`, or null.
- A null block reads as `unconfigured`.

The data directory holds `api.sqlite3`, `meeting-audio/` and `models/`, and the API creates it with mode 0700.

stdin takes one newline-terminated JSON line of at most 16 KiB with `bootToken` (32 bytes, base64url) and optional `speechApiKey` and `llmApiKey`. Stdin then stays open. EOF means the parent is gone, so the server shuts down and exits 0. SIGTERM stops it too. Secrets never appear in argv, environment or files.

stdout carries compact JSON lines of at most 4096 bytes. File descriptor 1 is redirected to stderr, so library output cannot corrupt the protocol. The events are `bind` with the port, `database`, `ready`, `model` and `error`. A `model` event carries a status of `missing`, `downloading`, `verifying`, `loading`, `ready` or `failed`, plus byte counts while downloading. An `error` event is followed by a non-zero exit.

Identity is proven before the token is sent. `GET /v1/health` returns `service: whisperer` and the `instanceId` the desktop wrote into `local.json`. The desktop then posts a nonce to `/v1/local/challenge` and compares the returned HMAC-SHA256 under the boot token string in constant time. A foreign process on a reused port cannot answer correctly.

Authentication is `Authorization: Bearer <bootToken>`, compared in constant time, on every other `/v1/*` route. One persistent user with issuer `device` and subject `local` owns all data. The routes `/login`, `/auth/callback`, `/device/*` and `/v1/auth/refresh` return 404 and logout does nothing. A `Host` other than `127.0.0.1` or `localhost`, or a non-loopback `Origin`, gets 403.

These routes exist only in this profile and return 404 on a remote deployment:

| Route | Purpose |
| --- | --- |
| `POST /v1/local/challenge` | HMAC identity challenge, answered before any authenticated request |
| `GET /v1/inference/status` | Speech and language model readiness |
| `GET /v1/inference/models` | The pinned catalog and what is installed |
| `POST /v1/inference/models/download` | Start a verified catalog download |
| `POST /v1/inference/test` | Test the configured speech or language model |
| `DELETE /v1/local/data` | Erase the device user's rows and meeting audio, then vacuum the database |

## Inference in the API

Settings split speech from the language model. The `GATEWAY_*` settings remain the fallback for remote deployments, and optional `SPEECH_*` and `LLM_*` base URL and key settings take precedence. A dedicated URL never receives the gateway key.

- Speech `onnx` runs in process through `onnx-asr` on the CPU, with PyAV decoding the audio so no system ffmpeg is needed.
- Speech `http` and language model `http` call an OpenAI-compatible endpoint.
- Language model `off` skips polish and returns the dictated text unchanged. Transforms and note summaries return 409 `Language model is off.`.
- Dictation returns 503 while the model is missing and 415 for audio that cannot be decoded.

The catalog is two exact model IDs pinned to a commit, with size and SHA-256 for every file.

| Model | Download | Notes |
| --- | --- | --- |
| `istupakov/parakeet-tdt-0.6b-v3-onnx` | about 670 MB, int8 | 25 European languages, CC-BY-4.0 |
| `istupakov/whisper-base-onnx` | about 108 MB, int8 | Multilingual, Apache-2.0 |

The server downloads these files with `httpx`, checks them while streaming, stages them in a 0700 directory and renames them into place only after every file matches. Installed files are hashed again before each load. An ID outside the catalog gets 422. `huggingface_hub` is not used and no code from a model repository runs. Nothing downloads at startup. The user starts each download.

Dictionary substitutions and metrics semantics are unchanged. The dictionary applies once to regular dictation only.

## Runtime installation in the desktop

The pinned versions, URLs, sizes and SHA-256 digests live in `src/desktop/main/runtime/runtime-manifest.json`. The setup action runs three stages with progress and installs nothing until the user presses it.

1. Fetch `uv` 0.13.1 over HTTPS through the Electron session, which trusts the operating system certificate store. Check the exact size and SHA-256, extract only the binary and rename it into place.
2. Run `uv python install 3.12.15`. The system Python is never used.
3. Run `uv sync --locked --no-dev --no-build` for the `whisperer-api` package with the `local` extra, against the bundled API source and `uv.lock`, into a partial environment, then rename it into place. The environment key includes the pinned versions, the platform and the lock inputs.

Every command is an argument array without a shell, with an allowlisted environment. The cache, Python and environments live under `<userData>/runtime`. Cancelling, a failure or low disk leaves the previous runtime intact. The setup requires 2 GiB of free space.

`local` is an optional extra of `whisperer-api` holding onnx-asr, onnxruntime, numpy and PyAV. A remote install without it has none of them.

## UI

- The sidebar shows a `Cloud` mark beside the product logo in remote mode and a `Laptop` mark in device mode. It links to the Inference settings and never says offline.
- Onboarding gains an Inference step in device mode. Speech is `On this device` with a catalog model or an HTTP endpoint. The language model is an HTTP endpoint or Off. Continue unlocks when the server is ready, speech is ready and the language model is ready or off.
- Settings gains an Inference section with live rows for the local server, speech and language model, a collapsed redacted activity log, and the Set up, Cancel, Retry, Start, Restart and Download model actions.
- API keys are write-only. The renderer knows only whether a key exists.
- Data and Privacy names where dictation audio goes, including an HTTP endpoint host, and offers Delete on-device data behind a typed confirmation.

## Failure behavior

Every failure names the stage, for example `Runtime download failed (uv): ...`. Startup is limited to 120 s. After the server is ready a crash restarts it at most twice, then shows `Local server stopped unexpectedly` with Restart. A missing model keeps Settings usable. Stop closes stdin, waits 5 s, then sends SIGTERM and SIGKILL to the owned child only. Quitting stops the owned child before the app exits.

## Implementation notes

- The exact `uv` invocations in `src/desktop/main/runtime/RuntimeInstaller.ts` add hardening flags not spelled out above: `uv python install` also passes `--no-bin --no-registry --no-config --system-certs`, and `uv sync` passes `--no-install-workspace --package whisperer-api --extra local`.
- Only the Linux x64 install has been exercised end to end. See the [roadmap](../roadmap.md) for platform status and the open Local mode issues.
