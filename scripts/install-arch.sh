#!/bin/sh
# Jauvex Personal on Arch Linux and Omarchy (omarchy.org: Arch with Hyprland on Wayland), from this folder:
#   git clone https://github.com/reindent/jauvex && cd jauvex && sh scripts/install-arch.sh
# Installs what the app needs with pacman (Node, git, Electron's libraries, what building whisper.cpp needs), builds whisper-server once
# into ~/.local/bin, builds the app (start.sh), and adds a "jauvex" command and an entry in the app launcher (Super+Space on Omarchy). Run
# it again to update after a git pull. start.sh starts Electron on Wayland in a Wayland session; Arch lets Chromium's sandbox use user namespaces, so no sudo
# for it. JAUVEX_NO_LAUNCH=1 builds without starting the app (the checks).
set -eu
cd "$(dirname "$0")/.."
ROOT="$PWD"
say() { printf '%s\n' "$*"; }
fail() { printf 'Jauvex: %s\n' "$*" >&2; exit 1; }
command -v pacman >/dev/null 2>&1 || fail "this script is for Arch Linux and Omarchy (pacman). On Ubuntu, use the install command at jauvex.ai."
SUDO=''; [ "$(id -u)" = 0 ] || SUDO='sudo'

say 'Jauvex on Arch / Omarchy'
# Node 22.18 or newer (Arch's is newer), git, and the libraries Electron loads; cmake and a compiler for whisper.cpp; curl for the models.
PKGS='nodejs npm git curl base-devel cmake nss gtk3 alsa-lib libxss libxtst libxkbcommon at-spi2-core libdrm mesa libcups'
missing=''; for p in $PKGS; do pacman -Qq "$p" >/dev/null 2>&1 || missing="$missing $p"; done
if [ -z "$missing" ]; then say '  System packages are here'
elif command -v omarchy-pkg-add >/dev/null 2>&1; then
  # Omarchy installs packages with its own tool and refuses a bare pacman upgrade (its update guard). A fresh Omarchy has no package lists
  # yet ("target not found"): its own update fetches them first, unattended.
  [ -f /var/lib/pacman/sync/core.db ] || { say '  Omarchy has no package lists yet: updating it first (omarchy update -y)'; omarchy-update -y; }
  say "  Installing with omarchy-pkg-add:$missing"; omarchy-pkg-add $missing
else
  # plain Arch: -Syu, not -S (no package lists on a fresh system, and Arch upgrades with every install: no partial upgrades)
  say "  Installing with pacman:$missing"; $SUDO pacman -Syu --needed --noconfirm $missing
fi

# The ears: whisper.cpp's server, built once (a few minutes) into ~/.local/bin, where the app looks for it.
BIN="$HOME/.local/bin"; mkdir -p "$BIN"
if command -v whisper-server >/dev/null 2>&1 || [ -x "$BIN/whisper-server" ]; then say '  whisper-server is here'
else
  say '  Building whisper-server (whisper.cpp, once: a few minutes)'
  src="$ROOT/tmp/whisper.cpp"; rm -rf "$src"; mkdir -p "$ROOT/tmp"
  git clone --depth 1 https://github.com/ggml-org/whisper.cpp "$src" >/dev/null 2>&1
  cmake -S "$src" -B "$src/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_TESTS=OFF >/dev/null
  cmake --build "$src/build" -j "$(nproc)" --target whisper-server >/dev/null
  install -m 755 "$src/build/bin/whisper-server" "$BIN/whisper-server"
  rm -rf "$src" # the build's sources are not kept: only the program
  say '  whisper-server is in ~/.local/bin'
fi

# The app itself: dependencies, Electron, Whisper's and Kokoro's models, the build (start.sh does each once, and again after an update).
CVC_DRY=1 sh start.sh

# A "jauvex" command and an entry in the app launcher (Omarchy's Super+Space reads ~/.local/share/applications).
cat > "$BIN/jauvex" <<EOT
#!/bin/sh
exec sh "$ROOT/start.sh" "\$@"
EOT
chmod 755 "$BIN/jauvex"
apps="$HOME/.local/share/applications"; mkdir -p "$apps"
cat > "$apps/jauvex.desktop" <<EOT
[Desktop Entry]
Type=Application
Name=Jauvex
Comment=Your coding agents, side by side, by voice
Exec=$BIN/jauvex
Icon=$ROOT/assets/icon.png
Terminal=false
Categories=Development;
EOT
say '  Added the "jauvex" command and Jauvex to the app launcher'
case ":$PATH:" in *":$BIN:"*) ;; *) say "  Note: $BIN is not on your PATH; the launcher entry works all the same." ;; esac
if [ -n "${JAUVEX_NO_LAUNCH:-}" ]; then say 'Jauvex is installed (not started).'; exit 0; fi
exec sh start.sh
