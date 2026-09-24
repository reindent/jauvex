#!/bin/sh
# Restart the app so that it loads a new build: stop exactly the given PID (only if it is still this app's Electron main
# process), wait until it is gone, then start ONE fresh copy. Only one copy may ever run (see AGENTS.md).
#
#   sh scripts/restart.sh <delay-seconds> <pid>
#
# The caller usually runs INSIDE the app (an agent's turn) and dies with it, and the tool that ran it may kill its whole
# process tree when the turn ends or is cancelled. So the work is handed to launchd: a one-shot user agent, owned by
# launchd (not by this shell), that survives everything above it and removes itself when done. If launchd will not take
# it, the work runs under nohup + setsid instead. Log: tmp/restart.log.
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT" || exit 1
mkdir -p tmp
if [ -z "$RESTART_DETACHED" ]; then
  LABEL="app-restart-$$"; PLIST="$ROOT/tmp/$LABEL.plist"; NODE_DIR=$(dirname "$(command -v node)")
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/sh</string><string>$ROOT/scripts/restart.sh</string><string>$1</string><string>$2</string></array>
  <key>EnvironmentVariables</key><dict><key>RESTART_DETACHED</key><string>1</string><key>RESTART_LABEL</key><string>$LABEL</string><key>PATH</key><string>$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$ROOT/tmp/restart.log</string>
  <key>StandardErrorPath</key><string>$ROOT/tmp/restart.log</string>
</dict></plist>
PL
  if launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>>tmp/restart.log; then echo "--- $(date '+%H:%M:%S') handed to launchd as $LABEL" >> tmp/restart.log; exit 0; fi
  echo "--- $(date '+%H:%M:%S') launchd refused the job; falling back to nohup" >> tmp/restart.log
  RESTART_DETACHED=1 nohup perl -MPOSIX -e 'POSIX::setsid(); exec "/bin/sh", @ARGV' "$ROOT/scripts/restart.sh" "$1" "$2" >> tmp/restart.log 2>&1 < /dev/null &
  exit 0
fi
trap 'if [ -n "$RESTART_LABEL" ]; then rm -f "tmp/$RESTART_LABEL.plist"; launchctl bootout "gui/$(id -u)/$RESTART_LABEL" 2>/dev/null; fi' EXIT # the plist first: bootout ends this very process
delay=$1; shift
set -- $*
echo "--- $(date '+%H:%M:%S') restart in ${delay}s for: $* (pid $$, parent $PPID)"
sleep "$delay"
APP="$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
for pid in "$@"; do
  cmd=$(ps -p "$pid" -o command= 2>/dev/null)
  case "$cmd" in
    "$APP"*) echo "stopping $pid"; kill "$pid" ;;
    "") echo "$pid already gone" ;;
    *) echo "skip $pid: not this app" ;;
  esac
done
i=0
while [ $i -lt 60 ]; do
  alive=0
  for pid in "$@"; do
    case "$(ps -p "$pid" -o command= 2>/dev/null)" in "$APP"*) alive=1 ;; esac
  done
  [ $alive -eq 0 ] && break
  sleep 0.5; i=$((i + 1))
done
if [ $alive -ne 0 ]; then echo "$(date '+%H:%M:%S') an old copy is still alive: NOT starting another one"; exit 1; fi
echo "$(date '+%H:%M:%S') old copy gone (waited $i half-seconds); starting"
sh start.sh
echo "$(date '+%H:%M:%S') started"
