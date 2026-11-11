#!/usr/bin/env bash
# Keep the legacy entry point while Make and Node own portable packaging.
set -euo pipefail
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'DMG packaging requires a macOS runner with hdiutil.' >&2
  exit 1
fi
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
node "$ROOT/tools/commands.mjs" setup
exec node "$ROOT/tools/commands.mjs" dmg "$@"
