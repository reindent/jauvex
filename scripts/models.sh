#!/bin/sh
# The Whisper models start.sh fetches (small for the transcript, base for the live words), each checked against the size and SHA-256
# Hugging Face lists for it. A download goes to a .part file and becomes the model only once it is whole: an interrupted download
# once stayed behind under the model's name, every later install took it for done, and Whisper could not load it (2026-09-24).
#   sh scripts/models.sh missing        the models that are missing or incomplete, one per line: <file>:<MB>
#   sh scripts/models.sh fetch <file>   downloads that one (again) and checks it
# JAUVEX_MODELS_URL and JAUVEX_MODELS_DIR change where they come from and where they go, JAUVEX_MODELS_RETRIES how often a download
# that fails is tried again (3; a dropped connection counts: --retry-all-errors). The three are for the checks.
set -u
url="${JAUVEX_MODELS_URL:-https://huggingface.co/ggerganov/whisper.cpp/resolve/main}"
dir="${JAUVEX_MODELS_DIR:-models}"
table='ggml-small-q5_1.bin 190085487 ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb
ggml-base-q5_1.bin 59707625 422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898'
size() { stat -f %z "$1" 2>/dev/null || echo 0; }

case "${1:-}" in
  missing)
    printf '%s\n' "$table" | while read -r file bytes sum; do
      [ "$(size "$dir/$file")" = "$bytes" ] || printf '%s:%s\n' "$file" "$(( (bytes + 500000) / 1000000 ))"
    done ;;
  fetch)
    line="$(printf '%s\n' "$table" | grep "^${2:-none} ")" || { echo "not a model this script knows: ${2:-}" >&2; exit 2; }
    set -- $line; part="$dir/$1.part"
    mkdir -p "$dir" && rm -f "$part" || exit 1
    curl -fsSL --retry "${JAUVEX_MODELS_RETRIES:-3}" --retry-all-errors -o "$part" "$url/$1" || { rm -f "$part"; echo "The download of $1 failed." >&2; exit 1; }
    got="$(size "$part")"
    [ "$got" = "$2" ] || { rm -f "$part"; echo "The download of $1 is incomplete: $got bytes of $2." >&2; exit 1; }
    [ "$(shasum -a 256 "$part" | cut -d ' ' -f 1)" = "$3" ] || { rm -f "$part"; echo "The download of $1 does not match its SHA-256." >&2; exit 1; }
    mv -f "$part" "$dir/$1" ;;
  *) echo 'usage: sh scripts/models.sh missing | fetch <file>' >&2; exit 2 ;;
esac
