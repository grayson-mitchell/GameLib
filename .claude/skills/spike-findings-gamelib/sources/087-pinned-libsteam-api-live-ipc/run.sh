#!/bin/bash
# 087: run the harness once per dylib against the live, signed-in Mac Steam client.
# Each run is its own process (one dylib per process, like the bridge helper).
set -uo pipefail
cd "$(dirname "$0")"
APPID="${APPID:-480}"
: > results.jsonl
for d in pinned/*.dylib; do
  label="$(basename "$d" .dylib)-app${APPID}"
  ./harness "$d" "$APPID" "$label" >> results.jsonl
  echo "--- $label exit $? ---" >&2
  sleep 2
done
cat results.jsonl
