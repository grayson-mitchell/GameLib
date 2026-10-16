#!/usr/bin/env bash
# G-48-11b: run the strip harness in chrome-headless-shell and print ONE run
# object { engine: "chromium", ref, override, variants: [...] } on stdout.
#   run-chromium.sh <git-ref> [override]
# Every run gets a fresh disposable profile (mktemp -d, mode 700): HOME and the
# XDG/Windows profile variables point inside it, removed on exit. Nothing here is
# profile-dependent, so there is no real-profile arm. The page loads only file://
# and data: content. Works under Git Bash on Windows and bash on macOS/Linux.
set -euo pipefail
REF="${1:-HEAD}"
OVERRIDE="${2:-none}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_shell() {
  if [ -n "${CHROME_HEADLESS_SHELL:-}" ] && [ -x "$CHROME_HEADLESS_SHELL" ]; then
    printf '%s' "$CHROME_HEADLESS_SHELL"; return
  fi
  local c
  for c in \
    "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-arm64/chrome-headless-shell \
    "$HOME"/Library/Caches/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-mac-x64/chrome-headless-shell \
    "${LOCALAPPDATA:-/nonexistent}"/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-win64/chrome-headless-shell.exe \
    "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell; do
    if [ -x "$c" ]; then printf '%s' "$c"; return; fi
  done
  echo "chrome-headless-shell not found; set CHROME_HEADLESS_SHELL" >&2
  return 1
}
CHROME="$(find_shell)"

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/profile" "$TMP/home"

# Windows-form path for node/chrome when running under Git Bash (cygpath exists).
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
TMPN="$(native "$TMP")"

PAGE="$(cd "$HERE" && node build-harness.mjs --ref "$REF" --out "$TMPN/page" --override "$OVERRIDE")"
PAGEN="$(native "$PAGE" 2>/dev/null || printf '%s' "$PAGE")"
case "$PAGEN" in
  [A-Za-z]:/*) URL="file:///$PAGEN" ;;
  *) URL="file://$PAGEN" ;;
esac

HOME="$TMP/home" USERPROFILE="$TMPN/home" APPDATA="$TMPN/home/AppData" \
LOCALAPPDATA="$TMPN/home/Local" XDG_CONFIG_HOME="$TMP/home/.config" \
XDG_STATE_HOME="$TMP/home/.state" XDG_DATA_HOME="$TMP/home/.local" \
XDG_CACHE_HOME="$TMP/home/.cache" \
"$CHROME" --disable-gpu --no-sandbox --window-size=1600,1000 \
  --user-data-dir="$TMPN/profile" --virtual-time-budget=60000 \
  --dump-dom "$URL" > "$TMP/dom.html" 2> "$TMP/err.txt" || {
    echo "chrome failed" >&2; cat "$TMP/err.txt" >&2; exit 1; }

REF_ARG="$REF" OVERRIDE_ARG="$OVERRIDE" node -e '
const fs = require("fs");
const dom = fs.readFileSync(process.argv[1], "utf8");
const m = dom.match(/<pre id="out"[^>]*>([\s\S]*?)<\/pre>/);
if (!m || !m[1].trim()) { console.error("no results in <pre id=out>"); process.exit(1); }
const txt = m[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const variants = JSON.parse(txt);
console.log(JSON.stringify({ engine: "chromium", ref: process.env.REF_ARG, override: process.env.OVERRIDE_ARG, variants }));
' "$TMP/dom.html"
