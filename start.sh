#!/bin/sh
# Build and launch through LaunchServices (open), not as a child of the terminal: macOS attributes
# privacy permissions (the microphone) to the responsible process.
# Each step shows a spinner while it runs (the first start installs and fetches Electron, which takes a while);
# a step's output is kept in tmp/start.log and shown only if the step fails.
unset ELECTRON_RUN_AS_NODE
cd "$(dirname "$0")"
mkdir -p tmp; LOG="$PWD/tmp/start.log"; : > "$LOG"

step() { # step "label" command...
  label="$1"; shift; start=$(date +%s)
  if [ -t 1 ]; then
    ( i=0; set -- '⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏'; while :; do i=$(( (i % 10) + 1 )); eval "f=\$$i"; printf '\r  %s %s' "$f" "$label"; sleep 0.08; done ) & spin=$!
    "$@" >> "$LOG" 2>&1; code=$?
    kill "$spin" 2>/dev/null; wait "$spin" 2>/dev/null; printf '\r'
  else
    printf '  - %s\n' "$label"; "$@" >> "$LOG" 2>&1; code=$?
  fi
  took=$(( $(date +%s) - start ))
  if [ $code -eq 0 ]; then printf '  \033[32m✓\033[0m %s \033[2m(%ss)\033[0m\n' "$label" "$took"
  else printf '  \033[31m✗\033[0m %s\n\n' "$label"; tail -40 "$LOG"; printf '\nThe whole output is in tmp/start.log\n'; exit $code; fi
}

printf 'Jauvex\n'
# Again whenever the lockfile changed since the last install: an update or a pull brings a new one.
if [ -d node_modules ] && cmp -s package-lock.json node_modules/.jauvex-lock; then step "Dependencies are installed" true
else step "Installing dependencies (npm install)" npm install --no-audit --no-fund; cp package-lock.json node_modules/.jauvex-lock; fi
# The electron package does not fetch its binary by itself (no postinstall of its own since Electron 40-something): install-electron does.
[ -d node_modules/electron/dist/Electron.app ] && step "Electron is here" true || step "Fetching Electron (about 120 MB, once)" npx install-electron
# The ears: whisper-server (Homebrew) and the models the app prefers (small for the transcript, base for the live words).
if command -v whisper-server >/dev/null 2>&1; then step "whisper-server is here" true
elif command -v brew >/dev/null 2>&1; then step "Installing whisper-cpp (brew, once)" brew install whisper-cpp
else printf '  \033[33m!\033[0m whisper-server is not installed and Homebrew is missing: install Homebrew (brew.sh), then run this again. Without it you can type but not talk.\n'; fi
# A model counts only when it is whole (scripts/models.sh knows each one's size and SHA-256): one cut short is downloaded again.
missing="$(sh scripts/models.sh missing)"
[ -z "$missing" ] && step "Whisper models are here" true
for m in $missing; do
  f="${m%%:*}"; [ -f "models/$f" ] && printf '  \033[33m!\033[0m models/%s is incomplete: downloading it again.\n' "$f"
  step "Downloading the Whisper model $f (${m#*:} MB, once)" sh scripts/models.sh fetch "$f"
done
step "Building the window" npx vite build --logLevel warn
step "Building the app" node scripts/bundle-electron.ts
[ -n "$CVC_DRY" ] && { printf '  (built, not launched)\n'; exit 0; }
# macOS protects Documents, Desktop, Downloads and iCloud Drive: an app started through LaunchServices gets no access to them
# until it is granted its own permission, and Electron cannot even read package.json to ask ("Error launching app: EPERM").
# In those folders the app is started as a child of this terminal instead, so it inherits the terminal's access.
case "$PWD" in
  "$HOME/Documents"*|"$HOME/Desktop"*|"$HOME/Downloads"*|"$HOME/Library/Mobile Documents"*|"$HOME/Library/CloudStorage"*)
    printf '  \033[33m!\033[0m This folder is one macOS protects (Documents, Desktop, Downloads or iCloud): starting from the terminal so the app can read it.\n    A plain folder such as ~/Coding/jauvex gives the app its own permissions and cleaner prompts.\n'
    nohup "$PWD/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron" "$PWD" "$@" > "$PWD/tmp/app.log" 2>&1 < /dev/null & pid=$!
    sleep 2; if kill -0 "$pid" 2>/dev/null; then printf '  \033[32m✓\033[0m Launched (pid %s, log in tmp/app.log)\n' "$pid"; else printf '  \033[31m✗\033[0m The app stopped right away:\n'; tail -20 "$PWD/tmp/app.log"; exit 1; fi ;;
  *) step "Launching" open -n "$PWD/node_modules/electron/dist/Electron.app" --args "$PWD" "$@" ;;
esac
