#!/bin/sh
# Jauvex Personal on Arch / Omarchy, checked in a fresh Arch Linux container (podman or docker): scripts/install-arch.sh installs and builds
# the app as an ordinary user with sudo, as on Omarchy, then the app is started on a headless Wayland compositor (weston) and must keep
# running with no Wayland or fatal error in its log. Not part of npm test: it downloads Arch packages and builds whisper.cpp (about 15
# minutes the first time). This repository's Whisper and Kokoro models are lent read-only, so they are not downloaded again.
# Usage: sh tests/arch/check.sh
set -eu
cd "$(dirname "$0")/../.."
ROOT="$PWD"; RUN=$(command -v podman || command -v docker) || { echo 'podman or docker is needed'; exit 1; }
work="$ROOT/tmp/arch-check"; rm -rf "$work"; mkdir -p "$work"
trap '"$RUN" unshare rm -rf "$work" 2>/dev/null || rm -rf "$work"' EXIT # the copy and its build go with the check
tar --exclude=./node_modules --exclude=./kokoro/node_modules --exclude=./tmp --exclude=./models --exclude=./dist --exclude=./dist-electron --exclude=./.git -cf - . | tar -xf - -C "$work"
mkdir -p "$work/models"
"$RUN" run --rm -v "$work:/home/omarchy/jauvex" -v "$ROOT/models:/models:ro" docker.io/library/archlinux:latest bash -euc '
  pacman -Syu --noconfirm --needed sudo weston >/dev/null
  useradd -m omarchy 2>/dev/null || true; echo "omarchy ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/omarchy
  cp -r /models/. /home/omarchy/jauvex/models/; chown -R omarchy:omarchy /home/omarchy
  su omarchy -c "cd ~/jauvex && JAUVEX_NO_LAUNCH=1 sh scripts/install-arch.sh"
  echo "== installed: $(ls /home/omarchy/.local/bin | tr "\n" " ")and $(ls /home/omarchy/.local/share/applications)"
  su omarchy -c "export XDG_RUNTIME_DIR=/tmp/xdg; mkdir -p -m 700 \$XDG_RUNTIME_DIR; cd ~/jauvex
    weston --backend=headless --socket=wayland-1 --width=1440 --height=900 >/tmp/weston.log 2>&1 & sleep 3
    WAYLAND_DISPLAY=wayland-1 CVC_DATA_DIR=/tmp/jx-data node_modules/electron/dist/electron --no-sandbox --ozone-platform=wayland . >/tmp/app.log 2>&1 & app=\$!
    sleep 25; kill -0 \$app && echo \"== on Wayland: still running after 25 s\" || { echo \"== on Wayland: it stopped\"; tail -30 /tmp/app.log; exit 1; }
    if grep -iE \"fatal|failed to connect to wayland|segmentation\" /tmp/app.log; then echo \"== errors in its log\"; exit 1; fi
    echo \"== its log, last lines:\"; tail -5 /tmp/app.log; kill \$app"
  echo "== ALL PASS"'
