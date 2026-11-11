Parent instructions: [repository root AGENTS.md](../AGENTS.md).

- Overlays extend the root `compose.yaml`; never duplicate the `api` service or change production defaults from here.
- Pin every image to a release tag. Check that the tag exists for each architecture its stack targets before changing it.
- Model choices belong in the stack's `.env` file so operators can override them. In local stacks the API only ever sees the `whisperer-transcription` and `whisperer-polish` aliases.
- The cloud stack adds no services. Keep provider keys in the operator's secret manager or `.env`, never in a tracked file.
- Inference services ship no telemetry and keep no request logs: speaches runs with logging off and no access log, and the gateway keeps message logging and telemetry off.
- Publish no port except the API's. Local inference stays on the private `whisperer-stack` network.
- Run `make stack-config` after any change here.

## Learnings

None yet.
