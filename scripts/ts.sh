#!/bin/sh
# Runs a TypeScript file with Node: the system's when it strips types (Node 22.18 or newer from nodejs.org or Homebrew), else Electron's own
# (Ubuntu's nodejs package is built without type stripping, and its node stops at the first .ts file).
#   sh scripts/ts.sh <file.ts> [args...]
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if node -e 'process.exit(process.features.typescript ? 0 : 1)' 2>/dev/null; then exec node "$@"; fi
for e in "$ROOT/node_modules/electron/dist/electron" "$ROOT/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"; do
  [ -x "$e" ] && ELECTRON_RUN_AS_NODE=1 exec "$e" "$@"
done
echo "No Node that runs TypeScript: install Node 22.18 or newer, or run npm install (it brings Electron's)." >&2; exit 1
