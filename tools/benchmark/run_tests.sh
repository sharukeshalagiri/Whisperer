#!/usr/bin/env bash
# Fresh test and coverage runs. Usage: run_tests.sh <repo checkout> <output dir>
set -u
R="$1"; O="$2"; mkdir -p "$O"; cd "$R"
echo "== api $(date -Is)"; uv run --locked --all-packages --with coverage coverage run --source=apps/api/src/whisperer_api -m pytest -q -p no:cacheprovider > "$O/api-pytest.txt" 2>&1; echo "api exit $?"
uv run --locked --all-packages --with coverage coverage report > "$O/api-coverage.txt" 2>&1; tail -1 "$O/api-coverage.txt"; rm -f .coverage
echo "== desktop $(date -Is)"; npm i --no-save --no-audit --no-fund @vitest/coverage-v8@5.0.4 > "$O/npm-coverage-install.txt" 2>&1
npx vitest run --config vitest.config.ts --coverage.enabled --coverage.provider=v8 --coverage.reporter=text-summary --coverage.reportsDirectory="$O/desktop-coverage" > "$O/desktop-vitest.txt" 2>&1; echo "vitest exit $?"
node --test src/desktop/main/platform/PlatformService.test.cjs src/desktop/main/platform/HoldShortcutService.test.cjs > "$O/desktop-nodetest.txt" 2>&1; echo "node:test exit $?"
echo "== e2e $(date -Is)"; node tools/commands.mjs desktop-build > "$O/desktop-build.txt" 2>&1; echo "build exit $?"
timeout 1800 node tools/drive-desktop.mjs > "$O/e2e.txt" 2>&1; echo "e2e exit $?"
echo "== done $(date -Is)"
