#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out state/Games/"Some Game"
/opt/homebrew/bin/x86_64-w64-mingw32-gcc -O2 -o out/Game.exe sleeper.c
cp out/Game.exe "state/Games/Some Game/Game.exe"
echo built
