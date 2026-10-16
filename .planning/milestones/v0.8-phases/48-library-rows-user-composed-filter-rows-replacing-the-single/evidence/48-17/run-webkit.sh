#!/usr/bin/env bash
# G-48-11c: run the scroller harness in a compiled WKWebView probe and print ONE run
# object { engine: "webkit", ref, call, states: [...] } on stdout.
#   run-webkit.sh <git-ref> [--extended]
# macOS only: needs /usr/bin/swiftc. Elsewhere it prints { engine: "webkit", notRun: true }.
# Every run gets a fresh disposable temp dir (mktemp -d, mode 700). WebKit storage is
# isolated by WKWebsiteDataStore.nonPersistent() inside the probe (evidence/48-13/wkprobe.swift,
# compiled read-only), not by HOME; no real profile is read.
set -euo pipefail
REF="${1:-HEAD}"
EXT="${2:-}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROBE="$HERE/../48-13/wkprobe.swift"

if [ "$(uname -s)" != "Darwin" ] || [ ! -x /usr/bin/swiftc ]; then
  REF_ARG="$REF" node -e '
console.log(JSON.stringify({ engine: "webkit", ref: process.env.REF_ARG, notRun: true,
  reason: "no /usr/bin/swiftc on this host (" + process.platform + "); WKWebView cannot be driven here." }))'
  exit 0
fi

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

PAGE="$(cd "$HERE" && node build-scroller-page.mjs --ref "$REF" --out "$TMP/page" ${EXT:+$EXT})"
/usr/bin/swiftc -O -o "$TMP/wkprobe" "$PROBE" 2> "$TMP/swiftc.err" || {
  cat "$TMP/swiftc.err" >&2; echo "swiftc failed" >&2; exit 1; }

RESULT="$(WK_WINDOW=1 "$TMP/wkprobe" "$PAGE" 120)"
REF_ARG="$REF" RESULT_JSON="$RESULT" node -e '
const r = JSON.parse(process.env.RESULT_JSON);
console.log(JSON.stringify({ engine: "webkit", ref: process.env.REF_ARG, call: r.call, states: r.states }, null, 1));'
