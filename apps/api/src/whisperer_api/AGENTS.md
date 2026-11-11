Parent instructions: [apps/api/src AGENTS.md](../AGENTS.md).

Keep HTTP adapters in `main.py`, strict wire models in `schemas.py`, and business operations in their focused modules.

Preserve issuer and subject identity binding, and scope every resource query to its owner. Never link users by email or disclose credentials in responses or logs.

The API database is separate from the earlier Node.js API database. `legacy_import.py` reads that database read-only; run it with explicit user mappings and a dry run first.

The on-device profile never reads deployment environment settings. Secrets arrive only on stdin and stay out of argv, files, events and logs. Stdout carries protocol events only. Bind `127.0.0.1` alone, keep boot-token checks constant-time, and keep the HMAC challenge before any authenticated traffic.

Load `onnx_asr`, `onnxruntime`, `numpy` and `av` lazily, so a remote deployment without the `local` extra still imports. Install models only from the pinned catalog by exact revision and digest, and only on an explicit request; never download at startup or run model-supplied code.

- Meeting-question routes resolve the complete saved transcript and summary by authenticated ownership inside a short transaction, then close it before inference. Never accept client text as authoritative context, persist question history, update meeting content, touch dictionary or metrics, log text, silently truncate context, or treat meeting content as instructions.
- MCP tools are read-only and owner-scoped. Resolve the owner only from a verified access token's exact issuer and subject, never email or a tool argument, and call domain services directly rather than looping back over HTTP. Build the OIDC proxy once in `create_app`, through its injectable factory, and only when `Settings.mcp_configured` is true; the on-device profile never mounts MCP. A provider failure leaves MCP absent and logs only the error type.
- Mount MCP by mirroring the FastMCP routes as plain Starlette routes, never as FastAPI routes, so nothing MCP enters `openapi.json`. Keep its host/origin guard on and its lifespan inside the API lifespan, exiting before the worker and HTTP clients close. Register only the read-only tools and turn service errors into `ToolError` messages that carry no meeting text or token details.
- `sync.py` is the only code that copies one user's data between servers. Merge by stable id (dictionary by phrase), let the newer `updatedAt` win, never take over a record another user owns, leave meetings with transcription or summary work in progress alone, and never move audio. Every delete of a synced record calls `record_tombstone`, so a later sync does not bring it back.
- Meeting AI calls in `meeting_ai.py` send one model request each with no tools, message history, retries or instrumentation, carry the complete escaped input, cap output tokens, and reject empty or oversized output instead of shortening it.

## Learnings

None yet.
