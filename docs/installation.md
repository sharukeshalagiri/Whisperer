# Self hosting

## One server for every Whisperer on your network

A Whisperer server is one container that needs two things from outside. An OpenID Connect identity provider signs your users in, and an OpenAI compatible endpoint does the speech to text and the text completion. `make stack-up` starts the server together with its inference in one of four stacks.

| Stack | Inference runs on | Host needs | Speech to text | Polish and summaries |
| --- | --- | --- | --- | --- |
| `cloud` | OpenAI, or another OpenAI compatible provider | 1 CPU, 512 MB, internet | `gpt-transcribe` | `gpt-6-luna` |
| `apple` | Apple silicon Mac (M1 and later) | 8 GB for the Docker VM | Parakeet TDT 0.6B v3 | Gemma 3 1B |
| `nvidia` | Linux with an NVIDIA GPU, driver 560 or newer and the NVIDIA Container Toolkit | 8 GB of VRAM | Parakeet TDT 0.6B v3 on CUDA | Gemma 3 4B on CUDA |
| `cpu` | Any other x86-64 or ARM64 host | 6 GB of RAM | Whisper small, int8 | Gemma 3 1B |

`cloud` is the lightest stack. Audio and text leave the host for the provider under that provider's data terms. The other three keep everything on the host. To join an inference gateway you already run, use `make api-up` as described in [configuration](configuration.md).

## Requirements

- Docker with Compose 2.24 or newer. Docker Desktop, OrbStack or Colima on macOS, Docker Engine on Linux.
- GNU Make and Node.js 22.18 or newer for the `make` targets.
- An OIDC client for the API, as listed under [settings](configuration.md#settings). Without it the API runs and sign in stays unavailable.
- For `cloud`, an API key with access to both models.
- For local stacks, free disk for models. About 3 GB for Parakeet or 0.5 GB for Whisper small, plus 1 to 3 GB for the polish model. Intel Macs are not a supported local inference target, so use `cloud` there.

## Start a stack

1. Put the secrets in your secret manager, or in an untracked `.env` at the repository root, together with the OIDC settings from [configuration](configuration.md#settings).

   ```sh
   # cloud: your provider key
   echo "OPENAI_API_KEY=sk-..." >> .env
   # local stacks: a random key shared by the API and its local gateway
   echo "GATEWAY_API_KEY=sk-$(openssl rand -hex 24)" >> .env
   ```

2. Start it.

   ```sh
   make stack-up STACK=cloud     # or apple, nvidia, cpu
   make stack-up                 # detect local hardware: apple on an ARM Mac, nvidia when nvidia-smi works, else cpu
   ```

   Detection never picks `cloud`, so ask for it by name. The first start of a local stack downloads its models and can take several minutes. Later starts reuse the `hf-hub-cache` and `ollama-models` volumes.

3. Check it.

   ```sh
   make stack-status
   curl --fail http://127.0.0.1:14318/v1/health
   curl --fail http://127.0.0.1:14318/v1/ready
   ```

   `/v1/ready` succeeds once OIDC is configured and the endpoint lists both models.

4. Stop it with `make stack-down`. Accounts, notes and downloaded models are kept. Every stack shares the Compose project `whisperer-stack` and its data, so you can switch stacks without losing accounts.

## Choose models

Override any default for one run without editing files.

For `cloud`, set `TRANSCRIPTION_MODEL` and `POLISH_MODEL`. `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` also work for speech. For another OpenAI compatible provider, also set `GATEWAY_BASE_URL` to its `/v1` URL and put its key in `OPENAI_API_KEY` or `GATEWAY_API_KEY`.

```sh
POLISH_MODEL=gpt-6.1-sol make stack-up STACK=cloud
```

For local stacks, set `STT_MODEL` and `POLISH_MODEL_LOCAL`. Parakeet covers 25 European languages with automatic language detection. For other languages use `Systran/faster-whisper-small` on CPU and Apple or `Systran/faster-whisper-large-v3` on NVIDIA. On slow CPUs use `Systran/faster-whisper-base` or `Systran/faster-whisper-tiny`.

```sh
STT_MODEL=Systran/faster-whisper-base POLISH_MODEL_LOCAL=gemma3:270m make stack-up STACK=cpu
```

On a Mac, the native Ollama app uses the Metal GPU and is faster than the bundled container. Install it, then start with `OLLAMA_BASE_URL=http://host.docker.internal:11434 make stack-up STACK=apple`. The bundled Ollama container is skipped and the polish model is pulled into the native app.

A stack and a production `make api-up` deployment are separate Compose projects with separate data. Both publish port 14318 by default, so set `HOST_PORT` if they share a host.

## Reach it from other computers

The desktop requires HTTPS for any server that is not `127.0.0.1`. Put a TLS reverse proxy in front of port 14318 before giving other machines the address. The desktop trusts the operating system certificate store, which means an internal CA works once it is installed on each computer. If the API itself has to reach an identity provider signed by an internal CA, see [internal certificate authority](configuration.md#internal-certificate-authority).

Users then enter `https://<your host>` on the sign in screen. To let their AI apps read meetings as well, enable the [MCP endpoint](configuration.md#remote-mcp-endpoint).

## Migrate from the earlier Node.js API

Whisperer's earlier Node.js API kept notes, transcripts and dictionary entries in its own SQLite file. The `import-legacy` command copies them into this API's database. It opens the old file read-only, copies only the users you map, and changes nothing unless you pass `--apply`.

1. Have each person sign in to the new server once, so their account exists.
2. Write a mapping file from each old user ID to that person's identity provider issuer and subject:

   ```json
   {
     "<old user id>": { "issuer": "https://id.example.com/", "subject": "<subject>" }
   }
   ```

3. Run a dry run from the repository root with the same `DATABASE_URL` the server uses. It prints how many records it would copy.

   ```sh
   uv run --locked --all-packages python -m whisperer_api import-legacy --source old.sqlite3 --mapping mapping.json
   ```

4. Run the same command with `--apply` to copy them. Records whose ID already exists, and dictionary phrases the person already has, are skipped, so a second run copies nothing new.

Unmapped users stay in the old file. Back up the new database before you apply.

## Next steps

- [Configuration](configuration.md) lists every setting, the readiness checks, backups and the production `make api-up` path.
- [Get started](getting-started.md) is what to hand your users.
- [Local mode](local-mode.md) is the no server alternative for one person.
