#!/bin/bash
# 088: put the pinned helper where dev GameLib spawns it from; `./swap.sh restore` puts the original back.
set -euo pipefail
cd "$(dirname "$0")"
T=../../../public/bin/arm64/darwin/steam-bridge-helper
if [ "${1:-}" = restore ]; then
  [ -f helper-original.bak ] && mv helper-original.bak "$T" && echo "restored original helper"; exit 0
fi
[ -f helper-original.bak ] || cp -p "$T" helper-original.bak
cp steam-bridge-helper-pinned "$T"
shasum -a256 "$T" steam-bridge-helper-pinned helper-original.bak
