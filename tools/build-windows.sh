#!/usr/bin/env bash
# Keep the legacy entry point while Make and Node own portable packaging.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/tools/commands.mjs" windows "$@"
