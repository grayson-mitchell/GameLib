#!/usr/bin/env bash
# G-48-11a: drive UAT item 11's resize sweep through a WKWebView window against
# the --ro harness page and print ONE run object on stdout:
#   { mode, ref, <window.__ro fields> }
#   run-ro-sweep.sh <shipped|deferred> [git-ref]     (ref defaults to HEAD)
# macOS only (/usr/bin/swiftc). Fresh mktemp -d (mode 700) per run, HOME and the
# XDG variables pointed inside it, removed on exit. WebKit storage is isolated by
# WKWebsiteDataStore.nonPersistent() inside the probe (a fake HOME does not
# isolate WebKit). The window is non-activating: it takes no focus.
set -euo pipefail
MODE="${1:?usage: run-ro-sweep.sh <shipped|deferred> [git-ref]}"
REF="${2:-HEAD}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
H13="$HERE/../48-13"

if [ "$(uname -s)" != "Darwin" ] || [ ! -x /usr/bin/swiftc ]; then
  echo "run-ro-sweep.sh: needs macOS /usr/bin/swiftc" >&2
  exit 1
fi

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT
export HOME="$TMP/home" XDG_CONFIG_HOME="$TMP/xdg-config" XDG_STATE_HOME="$TMP/xdg-state" \
  XDG_DATA_HOME="$TMP/xdg-data" XDG_CACHE_HOME="$TMP/xdg-cache"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME"

PAGE="$(cd "$H13" && node build-harness.mjs --ref "$REF" --out "$TMP/page" --ro "$MODE")"
/usr/bin/swiftc -O -o "$TMP/wk-ro-sweep" "$HERE/wk-ro-sweep.swift" 2> "$TMP/swiftc.err" || {
  cat "$TMP/swiftc.err" >&2; echo "swiftc failed" >&2; exit 1; }

RESULT="$("$TMP/wk-ro-sweep" "$PAGE" 90)"
SHORT="$(git -C "$HERE" rev-parse --short "$REF")"
MODE_ARG="$MODE" REF_ARG="$SHORT" RESULT_JSON="$RESULT" node -e '
const r = JSON.parse(process.env.RESULT_JSON);
console.log(JSON.stringify({ mode: process.env.MODE_ARG, ref: process.env.REF_ARG, ...r }));'
