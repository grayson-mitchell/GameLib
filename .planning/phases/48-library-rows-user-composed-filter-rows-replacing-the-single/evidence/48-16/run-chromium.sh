#!/usr/bin/env bash
# G-48-12a: run the focus-ring scenarios in chrome-headless-shell and print ONE
# run object { engine: "chromium", ref, override, tracker, scenarios: [...] }.
#   run-chromium.sh <git-ref> [override] [only-scenarios, comma separated]
# Every run gets a fresh disposable profile (mktemp -d, mode 700): HOME and the
# XDG/Windows profile variables point inside it, removed on exit. Nothing here is
# profile-dependent, so there is no real-profile arm (fake-HOME convention, the
# discipline half). The pages load only file:// content.
set -euo pipefail
REF="${1:-HEAD}"
OVERRIDE="${2:-none}"
ONLY="${3:-}"
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

native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
TMPN="$(native "$TMP")"

PAGES="$(node "$HERE/build-focus-page.mjs" --ref "$REF" --out "$TMPN/pages" --override "$OVERRIDE")"

ARGS=(--grid "$PAGES/focus-grid.html" --list "$PAGES/focus-list.html")
if [ -n "$ONLY" ]; then ARGS+=(--only "$ONLY"); fi

HOME="$TMP/home" USERPROFILE="$TMPN/home" APPDATA="$TMPN/home/AppData" \
LOCALAPPDATA="$TMPN/home/Local" XDG_CONFIG_HOME="$TMP/home/.config" \
XDG_STATE_HOME="$TMP/home/.state" XDG_DATA_HOME="$TMP/home/.local" \
XDG_CACHE_HOME="$TMP/home/.cache" \
node "$HERE/drive-cdp.mjs" "$CHROME" "$TMPN/profile" "${ARGS[@]}" > "$TMP/scenarios.json"

REF_ARG="$REF" OVERRIDE_ARG="$OVERRIDE" node -e '
const fs = require("fs");
const meta = JSON.parse(fs.readFileSync(process.argv[1] + "/pages/meta.json", "utf8"));
const scenarios = JSON.parse(fs.readFileSync(process.argv[1] + "/scenarios.json", "utf8"));
console.log(JSON.stringify({ engine: "chromium", ref: process.env.REF_ARG, override: process.env.OVERRIDE_ARG, tracker: meta.tracker, scenarios }));
' "$TMP"
