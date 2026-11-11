# Configuration

## Every setting the server reads

The API reads its configuration from environment variables through one validated `Settings` model, and Docker Compose passes the same names unchanged. It is protected by OpenID Connect and backed by an OpenAI compatible inference endpoint. [Self hosting](installation.md) starts the server with its own inference, and this page applies to that path unchanged.

## Settings

Keep secrets out of Compose files, image layers, source and desktop clients. A local `.env` that Git ignores or a secret manager both work. `TOKEN_SECRET` and `GATEWAY_API_KEY` are secrets. URL values must be complete URLs, and public OIDC URLs must use HTTPS.

| Setting | Default | Required for ready authentication | Purpose |
| --- | --- | --- | --- |
| `BIND_ADDRESS` | `0.0.0.0` | No | Compose only. Host interface the API is published on. |
| `HOST_PORT` | `14318` | No | Compose only. Host port mapped to container port 4318. |
| `OIDC_ISSUER_URL` | none | Yes | HTTPS issuer URL for OIDC discovery and token validation. |
| `OIDC_CLIENT_ID` | none | Yes | Confidential OIDC client identifier. |
| `OIDC_CLIENT_SECRET` | none | Yes | Confidential OIDC client secret. |
| `OIDC_SCOPES` | `openid email profile groups` | No | Space separated scopes requested during browser authorization. |
| `OIDC_GROUPS_CLAIM` | `groups` | No | Claim holding the caller's OIDC group identifiers. |
| `OIDC_ALLOWED_GROUPS` | none (unrestricted) | No | Comma separated allowlist of OIDC group identifiers. Unset or blank admits any authenticated account. When nonblank, sign in requires a listed group in `OIDC_GROUPS_CLAIM`, and a missing, malformed or disjoint claim is rejected. `CHANGE_ME` is a placeholder and keeps authentication unavailable. |
| `CA_BUNDLE_PATH` | `/etc/ssl/certs/ca-certificates.crt` | No | Compose only. Host CA bundle mounted read only into the container as `/etc/ssl/certs/whisperer-ca.crt`. |
| `PUBLIC_URL` | none | Yes | HTTPS public API URL used in authorization callbacks and metadata. |
| `TOKEN_SECRET` | none | Yes | Private secret that protects service issued tokens. |
| `GATEWAY_BASE_URL` | `http://litellm:4000` | No | Base URL of an OpenAI compatible gateway reachable from the API container. |
| `GATEWAY_API_KEY` | none | Depends on gateway | Gateway credential, if the gateway requires one. |
| `TRANSCRIPTION_MODEL` | `whisper-1` | No | Gateway model name for transcription. |
| `POLISH_MODEL` | `gpt-4o-mini` | No | Gateway model name for polish and summary requests. |
| `SPEECH_BASE_URL` | none (use the gateway) | No | Dedicated OpenAI compatible speech endpoint. When set, transcription uses it with `SPEECH_API_KEY` only and never sends `GATEWAY_API_KEY` there. |
| `SPEECH_API_KEY` | none | No | Credential for `SPEECH_BASE_URL`, if that endpoint requires one. |
| `LLM_BASE_URL` | none (use the gateway) | No | Dedicated OpenAI compatible chat endpoint for polish, summaries and transformations. Uses `LLM_API_KEY` only. |
| `LLM_API_KEY` | none | No | Credential for `LLM_BASE_URL`, if that endpoint requires one. |
| `DATABASE_URL` | `sqlite:///./whisperer.sqlite3` | No | SQLAlchemy database URL. Compose sets `sqlite:////data/api.sqlite3`. |
| `ACCESS_TOKEN_MINUTES` | `15` | No | Access token lifetime, from 1 through 60 minutes. |
| `REFRESH_TOKEN_DAYS` | `30` | No | Refresh token lifetime, from 1 through 90 days. |
| `OIDC_TIMEOUT_SECONDS` | `5` | No | Timeout for OIDC metadata and token operations. |
| `GATEWAY_TIMEOUT_SECONDS` | `10` | No | Timeout for interactive dictation, note summary and text transformation requests, from above 0 through 30 seconds. |
| `MEETING_GATEWAY_TIMEOUT_SECONDS` | `300` | No | Timeout for one background meeting segment transcription or summary request, from above 0 through 1800 seconds. |
| `DEVICE_AUTHORIZATION_MINUTES` | `10` | No | Device authorization lifetime, from 1 through 30 minutes. |
| `MCP_ENABLED` | `false` | No | Turns on the remote MCP endpoint at `/mcp`. While enabled, any missing MCP prerequisite keeps the endpoint absent. It is never served anonymously, and the on-device server never offers it. |
| `MCP_PUBLIC_URL` | `PUBLIC_URL` | Only for MCP | HTTPS public base for MCP. The protected resource and token audience is this base followed by `/mcp`. |
| `MCP_OIDC_CLIENT_ID` | none | Only for MCP | Client identifier of a separate OIDC registration for MCP. Never reuse `OIDC_CLIENT_ID`. Its callback is `<MCP_PUBLIC_URL>/mcp/oauth/callback`. |
| `MCP_OIDC_CLIENT_SECRET` | none | Only for MCP | Secret for the MCP OIDC registration. |
| `MCP_SIGNING_KEY` | none | Only for MCP | Secret of at least 32 characters, different from `TOKEN_SECRET`, that signs MCP proxy tokens and encrypts stored proxy state. Changing it makes MCP clients sign in again. |
| `MCP_STORAGE_DIR` | `./mcp-oauth` | No | Directory for encrypted MCP client registrations and upstream tokens. Compose sets `/data/mcp-oauth` on the data volume. |
| `MCP_ALLOWED_HOSTS` | MCP public host | No | Comma separated `Host` values the MCP endpoint accepts. `CHANGE_ME` keeps MCP absent. |
| `MCP_ALLOWED_ORIGINS` | MCP public origin | No | Comma separated browser origins the MCP endpoint accepts. `CHANGE_ME` keeps MCP absent. |
| `MCP_ACCESS_TOKEN_MINUTES` | `60` | No | Lifetime of MCP access tokens issued by the proxy, from 5 through 1440 minutes. |

`TRANSCRIPTION_MODEL` and `POLISH_MODEL` name the models on whichever endpoint serves each capability. Leave the dedicated speech and chat settings unset to keep one gateway for both.

Any account that authenticates with the configured provider may sign in unless `OIDC_ALLOWED_GROUPS` is a nonblank allowlist. A value still set to `CHANGE_ME` keeps readiness and authentication unavailable, and a `CHANGE_ME` allowlist fails closed rather than becoming unrestricted. Do not describe a deployment as having working sign in until `/v1/ready` succeeds.

The desktop's on-device server, `python -m whisperer_api serve-local`, ignores every setting on this page. It reads only the configuration file and boot line described in the [developer reference](api-runtime.md#on-device-server).


## Deploy to production

Copy `.env.example` to `.env` and replace every `CHANGE_ME` with your own values. Docker Compose reads `.env` from the repository root, and `.env` is ignored by Git. To keep secrets in a secret manager instead, export them into the shell that runs `make`, or pass your own file with `docker compose --env-file`.

1. Install Docker Compose, Node.js 22.18 or newer and `uv`.
2. Confirm the external gateway network exists before starting Compose. Set `GATEWAY_NETWORK` only when your gateway uses another network.

   ```sh
   docker network inspect llm-network
   ```

3. Back up existing data before changing images or configuration. Stop the service first so SQLite and its WAL files are copied together, and confirm the backup before continuing. `make api-down` keeps the named volume. Never run `docker compose down -v` against a production service.

   ```sh
   docker compose stop api
   mkdir -p backups
   docker compose cp api:/data "backups/api-data-$(date +%Y%m%d-%H%M%S)"
   ```

4. Run the local validation. It installs only the locked workspace and starts no server.

   ```sh
   make api-setup
   make api-lint
   make api-test
   make api-contract
   make api-preflight
   docker compose config --quiet
   ```

5. Start it, then check liveness and readiness.

   ```sh
   make api-preflight
   make api-up
   make api-status
   curl --fail http://127.0.0.1:14318/v1/health
   curl --fail http://127.0.0.1:14318/v1/ready
   ```

To use model names other than the defaults, set `TRANSCRIPTION_MODEL` and `POLISH_MODEL` in `.env` or on the command line.

```sh
TRANSCRIPTION_MODEL=<speech-model> POLISH_MODEL=<chat-model> make api-up
```

Compose publishes `0.0.0.0:14318` by default. Set `BIND_ADDRESS` or `HOST_PORT` for another interface or port, and place a TLS reverse proxy and a firewall in front of it before permitting untrusted access. Repository validation never deploys or modifies production data.

## Liveness and readiness

The API validates syntax and bounds when it loads `Settings`. `make api-preflight` runs the same validation without serving HTTP and reports configuration that blocks authentication or gateway use without disclosing secret values. At startup, preflight checks establish the OIDC and gateway readiness state without tying liveness to those external systems.

- `GET /v1/health` is liveness. It succeeds whenever the HTTP process is running, even with OIDC intentionally left as `CHANGE_ME`.
- `GET /v1/ready` is readiness. It returns a sanitized `503` until the authentication and gateway checks succeed. Authentication endpoints also return `503` while OIDC settings remain placeholders.

Compose health checks call `/v1/health`, not `/v1/ready`, so an incomplete identity configuration never restarts the container. Check `/v1/ready` after deployment and after changing OIDC or gateway settings.

## Data safety and identities

Compose mounts the `api-data` volume at `/data`, and the API writes its database at `/data/api.sqlite3`. Stop the service before a volume level backup so the database and WAL files are consistent, keep archives private and verify that a backup holds both files before migrating anything.

Accounts are never linked by email. An identity is associated only after an authenticated OIDC flow using the provider's stable subject identifier, which prevents account takeover when an email address is reassigned or a claim changes.

`OIDC_ISSUER_URL` may be written with or without a trailing slash. Discovery matches the provider's `issuer` ignoring that slash, and the ID token `iss` is then validated exactly against the issuer the provider published. Stored identities use the configured issuer without a trailing slash.

## Internal certificate authority

The container image carries only public CAs, so HTTPS to an issuer signed by an internal CA fails with `CERTIFICATE_VERIFY_FAILED`. Compose bind mounts the host bundle from `CA_BUNDLE_PATH` read only at `/etc/ssl/certs/whisperer-ca.crt` and sets `SSL_CERT_FILE` to it. The locked `httpx` and Authlib clients read that variable when they create their TLS context, so no application code is involved. The host bundle must include the internal CA and exist before `docker compose up`.

## Remote MCP endpoint

The optional MCP endpoint lets an MCP client such as Claude Code list the signed in user's meetings, read their saved transcripts and summaries and ask one question about a meeting. It is off by default and runs only on a remote deployment. [Connect your AI app](mcp.md) is the user's side of it.

**Public endpoint.** Clients connect to `https://<host>/mcp`, where `<host>` comes from `MCP_PUBLIC_URL` or `PUBLIC_URL`. That URL is also the protected resource and the required token audience. The API serves these routes at the root of the same host, and none of them appears in `openapi.json`.

| Route | Purpose |
| --- | --- |
| `/mcp` | Streamable HTTP MCP endpoint (`POST`, `DELETE`). Requires a bearer token. |
| `/.well-known/oauth-protected-resource/mcp` | Protected resource metadata (RFC 9728) naming the resource and authorization server. |
| `/.well-known/oauth-authorization-server` | Authorization server metadata for the API's OAuth proxy. |
| `/authorize`, `/token`, `/register` | OAuth authorization with PKCE, token exchange and dynamic client registration for MCP clients. |
| `/consent` | Consent page shown before the proxy forwards the user to the identity provider. |
| `/mcp/oauth/callback` | Callback from the identity provider to the proxy. |

**Startup.** MCP mounts only when `MCP_ENABLED=true` and every MCP setting above is usable. A missing setting is logged once by name at startup and leaves MCP absent. The proxy also fetches the issuer's discovery document at startup. If that fails, the API logs one line naming only the error type, leaves MCP absent and keeps every other route serving. `/v1/ready` does not report MCP. Restart the API after the identity provider recovers.

**Identity provider prerequisites.** Register these before you enable MCP.

- A separate confidential OIDC client for MCP. Do not reuse the desktop client. Set its redirect URI to `https://<host>/mcp/oauth/callback` and require PKCE. Its identifier and secret go in `MCP_OIDC_CLIENT_ID` and `MCP_OIDC_CLIENT_SECRET`.
- A resource, which Pocket ID calls an API, whose identifier is exactly `https://<host>/mcp`, with the permissions `meetings:read` and `meetings:ask`. Grant both to the MCP client for user delegated access, so that access tokens carry `aud` equal to the resource and the granted scopes in `scope`.
- The access token's `iss` must equal `OIDC_ISSUER_URL`, compared without a trailing slash. Its `sub` must belong to a user who has already signed in to Whisperer through the desktop. Users are never matched by email.

**Scopes.** `meetings:read` is required for every MCP request and allows `list_meetings` and `get_meeting_text`. `meetings:ask` is additionally required for `ask_meeting`. A token without `meetings:read` is refused as `401 invalid_token`, and a missing `meetings:ask` is reported by `ask_meeting` as a tool error that names the scope. The endpoint is stateless. Every request carries its bearer token, no session state is kept between requests, and MCP sends no telemetry, tracing or prompt capture anywhere.

**Reverse proxy.** Terminate TLS at the proxy and forward plain HTTP to the API on the same host name.

- Pass the original `Host` header and set `X-Forwarded-Proto: https`. The host must be in `MCP_ALLOWED_HOSTS`. Others are refused with `421`, and browser origins outside `MCP_ALLOWED_ORIGINS` with `403`. Public metadata URLs always come from `MCP_PUBLIC_URL` or `PUBLIC_URL`, never from inbound `Host` or `Forwarded` values.
- Do not buffer `/mcp`. Responses can be server sent event streams. For nginx, set `proxy_buffering off;` and `proxy_cache off;` on that location.
- Set the read and send timeouts for `/mcp` to at least `MEETING_GATEWAY_TIMEOUT_SECONDS`, so a long `ask_meeting` call is not cut off.
- Forward the well known routes, `/authorize`, `/token`, `/register`, `/consent` and `/mcp/oauth/callback` to the API unchanged.

**Proxy state.** Registered MCP clients and upstream tokens are stored under `MCP_STORAGE_DIR`, encrypted with a key derived from `MCP_SIGNING_KEY`. Keep the directory on the private data volume. Rotating the key makes the old entries unreadable, and clients register and sign in again.

Enabling MCP on a deployment, registering the identity provider client and resource and injecting the secrets all need explicit operator approval. Repository validation never performs them.

## Inference stacks

`make stack-up` layers the overlays in [deploy](../deploy/README.md) over `compose.yaml`. It reads the stack's `deploy/<stack>.env`, then the root `.env`, then the shell, and later sources win. Every stack is the Compose project `whisperer-stack` with its own `api-data` volume, never shared with a production `make api-up` deployment.

| Setting | Default | Purpose |
| --- | --- | --- |
| `STACK` | detected | `cloud`, `apple`, `nvidia` or `cpu`. Detection never picks `cloud`. It picks `apple` on an ARM Mac, `nvidia` when `nvidia-smi` succeeds, otherwise `cpu`. |

The `cloud` stack uses the API settings above directly, with these defaults from `deploy/cloud.env`.

| Setting | Default | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | none, required unless `GATEWAY_API_KEY` is set | Provider key, passed to the API as `GATEWAY_API_KEY`. |
| `GATEWAY_BASE_URL` | `https://api.openai.com/v1` | Any provider serving `/audio/transcriptions`, `/chat/completions` and `/models` under one URL. |
| `TRANSCRIPTION_MODEL` | `gpt-transcribe` | Provider speech to text model. |
| `POLISH_MODEL` | `gpt-6-luna` | Provider chat model for polish, summaries and transformations. |

The local stacks set `GATEWAY_BASE_URL`, `TRANSCRIPTION_MODEL` and `POLISH_MODEL` themselves, so those three are ignored there, and add the following.

| Setting | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_API_KEY` | none, required | Shared secret between the API and the local gateway. Use a random `sk-` value. |
| `STT_MODEL` | per stack | Hugging Face id of a speaches model, either a Parakeet ONNX or a faster-whisper (CTranslate2) model. |
| `POLISH_MODEL_LOCAL` | per stack | Ollama model tag for polish, summaries and transformations. |
| `OLLAMA_BASE_URL` | bundled container | An Ollama you already run, such as the native macOS app at `http://host.docker.internal:11434`. Skips the bundled container. |
| `STT_MODEL_TTL` | `900` | Seconds speaches keeps the speech model loaded after its last request. |
| `OLLAMA_KEEP_ALIVE` | `30m` | How long the bundled Ollama keeps the polish model loaded. |
| `SPEACHES_CPUS` | `4` | CPU limit for speaches on the CPU and Apple stacks. |
| `GATEWAY_TIMEOUT_SECONDS` | `30` | Raised to the API's ceiling because local inference is slower than a hosted gateway. |
