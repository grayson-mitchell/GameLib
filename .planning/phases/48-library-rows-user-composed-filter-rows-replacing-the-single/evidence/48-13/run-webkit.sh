#!/usr/bin/env bash
# G-48-11b: run the strip harness in a compiled WKWebView probe and print ONE run
# object { engine: "webkit", ref, override, variants: [...] } on stdout.
#   run-webkit.sh <git-ref> [override]
# macOS only: needs /usr/bin/swiftc. On any other host it prints a single
# { engine: "webkit", notRun: true, reason } object and exits 0, so a merge
# records WHY the engine is absent instead of silently dropping it.
# Every run gets a fresh disposable temp dir (mktemp -d, mode 700). WebKit
# storage is isolated by WKWebsiteDataStore.nonPersistent() inside the probe,
# not by HOME (a fake HOME does not isolate WebKit).
set -euo pipefail
REF="${1:-HEAD}"
OVERRIDE="${2:-none}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$(uname -s)" != "Darwin" ] || [ ! -x /usr/bin/swiftc ]; then
  REF_ARG="$REF" OVERRIDE_ARG="$OVERRIDE" node -e '
console.log(JSON.stringify({ engine: "webkit", ref: process.env.REF_ARG, override: process.env.OVERRIDE_ARG, notRun: true,
  reason: "no /usr/bin/swiftc on this host (" + process.platform + "); WKWebView cannot be driven here. Owed to a macOS rerun of run-webkit.sh." }))'
  exit 0
fi

TMP="$(mktemp -d)"
chmod 700 "$TMP"
trap 'rm -rf "$TMP"' EXIT

PAGE="$(cd "$HERE" && node build-harness.mjs --ref "$REF" --out "$TMP/page" --override "$OVERRIDE")"
/usr/bin/swiftc -O -o "$TMP/wkprobe" "$HERE/wkprobe.swift" 2> "$TMP/swiftc.err" || {
  cat "$TMP/swiftc.err" >&2; echo "swiftc failed" >&2; exit 1; }

RESULT="$("$TMP/wkprobe" "$PAGE" 180)"
REF_ARG="$REF" OVERRIDE_ARG="$OVERRIDE" RESULT_JSON="$RESULT" node -e '
const variants = JSON.parse(process.env.RESULT_JSON);
console.log(JSON.stringify({ engine: "webkit", ref: process.env.REF_ARG, override: process.env.OVERRIDE_ARG, variants }));'
