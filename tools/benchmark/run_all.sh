#!/usr/bin/env bash
# Runs every benchmark phase in sequence. Usage: run_all.sh <bench dir> <playwright-core index.mjs> <temp dir (Windows path)>
# Each phase writes into <bench>/results/<phase>/ and is skipped when its result file already exists (resume).
set -uo pipefail
B="$(cd "$1" && pwd)"; PW="$2"; T="$3"
S="$B/scripts"; R="$B/results"; mkdir -p "$R"; echo $$ > "$R/run_all.pid"; A="$(cygpath -aw "$B/audio")"; EXE="$(cygpath -aw "$B/app/payload/whisperer.exe")"; RES="$(cygpath -aw "$B/app/payload/resources")"
cond() { powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -aw "$S/conditions.ps1")" "$(cygpath -aw "$R/conditions.log")" "$1" || { echo "ABORT: not on AC power before: $1"; exit 3; }; }
declare -A PROFILE=( [parakeet]="$T\whisperer-bench-parakeet" [whisper]="$T\whisperer-bench-whisper" )
for kind in engine meeting; do
  for m in parakeet whisper; do
    out="$R/$kind"; [ -f "$out/$kind-$m.json" ] && grep -q skipped "$out/$kind-$m.json" && continue; [ -f "$out/$kind-$m.json" ] && grep -q '"processingMs"' "$out/$kind-$m.json" && [ "$(grep -c '"processingMs"' "$out/$kind-$m.json")" -ge 3 ] && continue
    cond "start $kind $m"
    timeout 14400 node "$S/bench_server.mjs" $kind --profile "${PROFILE[$m]}" --resources "$RES" --audio "$A" --out "$(cygpath -aw "$out")" --runs 3 --label "$kind-$m"
  done
done
for m in parakeet whisper; do
  out="$R/dictation-$m"; [ -f "$out/dictation.json" ] && continue
  cond "start dictation $m"
  timeout 7200 node "$S/bench_app.mjs" dictation --exe "$EXE" --profile "${PROFILE[$m]}" --out "$(cygpath -aw "$out")" --pw "$PW" --clips "$A\clips" --count 10
done
for m in parakeet whisper; do
  out="$R/coldstart-$m"; [ -f "$out/coldstart.json" ] || { cond "start coldstart $m"; timeout 3600 node "$S/bench_app.mjs" coldstart --exe "$EXE" --profile "${PROFILE[$m]}" --out "$(cygpath -aw "$out")" --pw "$PW" --runs 3; }
  out="$R/idle-$m"; [ -f "$out/idle-mem.csv" ] || { cond "start idle $m"; timeout 1800 node "$S/bench_app.mjs" idle --exe "$EXE" --profile "${PROFILE[$m]}" --out "$(cygpath -aw "$out")" --pw "$PW" --minutes 5; }
done
out="$R/privacy"
if [ ! -f "$out/privacy.json" ]; then
  cond "start privacy parakeet"
  python "$S/stub_gateway.py" 9101 > "$R/stub-gateway.log" 2>&1 & STUB=$!
  sleep 2
  timeout 3600 node "$S/bench_app.mjs" privacy --exe "$EXE" --profile "${PROFILE[parakeet]}" --out "$(cygpath -aw "$out")" --pw "$PW" --clips "$A\clips" --stub http://127.0.0.1:9101/v1 --minutes 10
  kill $STUB 2>/dev/null
fi
cond "all phases done"
echo ALL-DONE
