#!/bin/sh
# The models start.sh fetches: Whisper's (small for the transcript, base for the live words) and, on Linux, Kokoro's for the spoken
# voice (macOS speaks with `say`): `sh scripts/models.sh missing kokoro`. Each one is checked against the size and SHA-256
# Hugging Face lists for it. A download goes to a .part file and becomes the model only once it is whole: an interrupted download
# once stayed behind under the model's name, every later install took it for done, and Whisper could not load it (2026-09-24).
#   sh scripts/models.sh missing [kokoro]  the models that are missing or incomplete, one per line: <file>:<MB>
#   sh scripts/models.sh fetch <file>   downloads that one (again) and checks it
# JAUVEX_MODELS_URL and JAUVEX_MODELS_DIR change where they come from and where they go, JAUVEX_MODELS_RETRIES how often a download
# that fails is tried again (3; a dropped connection counts: --retry-all-errors). The three are for the checks.
set -u
url="${JAUVEX_MODELS_URL:-https://huggingface.co/ggerganov/whisper.cpp/resolve/main}"
dir="${JAUVEX_MODELS_DIR:-models}"
table='ggml-small-q5_1.bin 190085487 ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
ggml-base-q5_1.bin 59707625 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
# Kokoro-82M for kokoro-js (its voices come with the npm package), full precision: on a CPU it renders about three times faster than the
# 8-bit one. Pinned to one revision of the repository, so a later upload cannot change what the checksums mean.
kokoro_url="${JAUVEX_KOKORO_URL:-https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/1939ad2a8e416c0acfeecc08a694d14ef25f2231}"
kokoro='kokoro/onnx/model.onnx 325532232 8fbea51ea711f2af382e88c833d9e288c6dc82ce5e98421ea61c058ce21a34cb
kokoro/config.json 44 df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f
kokoro/tokenizer.json 3497 77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34
kokoro/tokenizer_config.json 113 be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20'
size() { if [ -f "$1" ]; then wc -c < "$1" | tr -d " "; else echo 0; fi; } # wc, not stat: its options differ between macOS and Linux
sha256() { if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"; else sha256sum "$1"; fi; }

case "${1:-}" in
  missing)
    [ "${2:-}" = kokoro ] && table="$kokoro"
    printf '%s\n' "$table" | while read -r file bytes sum; do
      [ "$(size "$dir/$file")" = "$bytes" ] || printf '%s:%s\n' "$file" "$(( (bytes + 500000) / 1000000 ))"
    done ;;
  fetch)
    case "${2:-}" in kokoro/*) table="$kokoro"; url="$kokoro_url/${2#kokoro/}"; url="${url%/*}" ;; esac
    line="$(printf '%s\n' "$table" | grep "^${2:-none} ")" || { echo "not a model this script knows: ${2:-}" >&2; exit 2; }
    set -- $line; part="$dir/$1.part"
    mkdir -p "$(dirname "$dir/$1")" && rm -f "$part" || exit 1
    curl -fsSL --retry "${JAUVEX_MODELS_RETRIES:-3}" --retry-all-errors -o "$part" "$url/${1##*/}" || { rm -f "$part"; echo "The download of $1 failed." >&2; exit 1; }
    got="$(size "$part")"
    [ "$got" = "$2" ] || { rm -f "$part"; echo "The download of $1 is incomplete: $got bytes of $2." >&2; exit 1; }
    [ "$(sha256 "$part" | cut -d ' ' -f 1)" = "$3" ] || { rm -f "$part"; echo "The download of $1 does not match its SHA-256." >&2; exit 1; }
    mv -f "$part" "$dir/$1" ;;
  *) echo 'usage: sh scripts/models.sh missing [kokoro] | fetch <file>' >&2; exit 2 ;;
esac
