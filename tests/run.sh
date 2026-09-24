#!/bin/sh
# Runs the checks in tests/: window checks (tests/window/*.test.ts) in a hidden, silent copy of the app on its own data folder and
# ports, and backend checks (tests/*.test.ts) straight against electron/*.ts. Usage: sh tests/run.sh [--quick] [part-of-a-name]
#   --quick   the backend and pure checks only (tests/*.test.ts), all at once: a few seconds. For every change (npm run check). The window
#             checks take minutes (a hidden copy of the app each): they run before a release (npm test), or one by name when a change
#             is in its part of the window (sh tests/run.sh <name>).
# Header lines a check can carry:  // needs: mic (a fake microphone)  // wav: tests/fixtures/x.wav (what it hears, 48 kHz mono)
#                                  // env: KEY=VALUE (__ROOT__ = this repository)   // fresh (empty data folder)
#                                  // llm (calls a real model: skipped unless CVC_TEST_LLM=1)
cd "$(dirname "$0")/.." || exit 1; ROOT="$PWD"; mkdir -p tmp/scratch tmp/testrun
QUICK=""; [ "$1" = --quick ] && { QUICK=1; shift; }
fail=0; ran=0
prep() { # prep <check>: its name, a data folder of its own (the fixture state unless "// fresh") and its env; fails when it is skipped
  t=$1; name=$(basename "$t" | sed 's/\.test\..*//')
  if grep -q '^// llm' "$t" && [ -z "$CVC_TEST_LLM" ]; then echo "skip $name (calls a real model; CVC_TEST_LLM=1 runs it)"; return 1; fi
  DATA="$ROOT/tmp/testrun/$name"; rm -rf "$DATA"; mkdir -p "$DATA"
  grep -q '^// fresh' "$t" || sed "s|__ROOT__|$ROOT|g" tests/fixtures/state.json > "$DATA/state.json"
  envs=$(sed -n 's|^// env: ||p' "$t" | sed "s|__ROOT__|$ROOT|g" | tr '\n' ' ') # __ROOT__: this repository (the stand-ins in tests/mock)
}
backend() { env $envs CVC_ROOT="$ROOT" CVC_DATA_DIR="$DATA" CVC_JAUVEX_HOME="$DATA/home" npx tsx "$1" 2>&1; }
judge() { # judge <name> <output>: its lines; a check counts as failed when it failed, crashed, or ended without its summary line
  printf '%s\n' "$2" | grep -E '^(PASS|FAIL|ok |BAD |skip)'
  if printf '%s\n' "$2" | grep -qE '^(FAIL|BAD )|FAILED'; then fail=$((fail+1)); printf '%s\n' "$2" | grep -vE '^(PASS|ok )' | tail -8
  elif ! printf '%s\n' "$2" | grep -qE '^(PASS|ok )'; then fail=$((fail+1)); echo "FAIL $1 produced no result (crashed?)"; printf '%s\n' "$2" | tail -8
  elif ! printf '%s\n' "$2" | grep -qE '^(ALL PASS|[0-9]+ FAILED)$'; then fail=$((fail+1)); echo "FAIL $1 ended without its summary line (crashed after a PASS?)"; printf '%s\n' "$2" | tail -8; fi
}

if [ -n "$QUICK" ]; then # all at once, then read in order
  started=""
  for t in tests/*.test.ts; do
    case "$(basename "$t" | sed 's/\.test\..*//')" in *"$1"*) ;; *) continue ;; esac
    prep "$t" || continue; started="$started $name"; ran=$((ran+1)); backend "$t" > "$DATA/out.txt" &
  done; wait
  for name in $started; do echo "== $name"; judge "$name" "$(cat "$ROOT/tmp/testrun/$name/out.txt")"; done
else
  for t in tests/window/*.test.ts tests/*.test.ts; do
    [ -f "$t" ] || continue
    case "$(basename "$t" | sed 's/\.test\..*//')" in *"$1"*) ;; *) continue ;; esac
    prep "$t" || continue
    flags=""; grep -q '^// needs: mic' "$t" && flags="--no-sandbox --use-fake-device-for-media-stream --use-fake-ui-for-media-stream"
    wav=$(sed -n 's|^// wav: ||p' "$t"); [ -n "$wav" ] && flags="$flags --use-file-for-fake-audio-capture=$ROOT/$wav%noloop"
    echo "== $name"; ran=$((ran+1))
    case "$t" in
      tests/window/*) env $envs CVC_HIDDEN=1 CVC_WHISPER_PORT=4331 CVC_DATA_DIR="$DATA" CVC_JAUVEX_HOME="$DATA/home" ./node_modules/.bin/electron . --remote-debugging-port=9341 $flags > "$DATA/app.log" 2>&1 & pid=$!
         out=$(CVC_DATA_DIR="$DATA" CVC_JAUVEX_HOME="$DATA/home" node "$t" 2>&1); ps -p $pid -o command= 2>/dev/null | grep -q electron && kill $pid; wait $pid 2>/dev/null; sleep 1 ;;
      *) out=$(backend "$t") ;;
    esac
    judge "$name" "$out"
  done
fi
echo; if [ $fail -eq 0 ]; then echo "ALL PASS ($ran checks)"; else echo "$fail of $ran FAILED"; exit 1; fi
