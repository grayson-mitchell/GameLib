#!/bin/bash
# Build the native arm64 helper. No SDK headers, no linking against the dylib —
# it's dlopen'd at runtime. Only libdl/libSystem (implicit).
set -euo pipefail
cd "$(dirname "$0")"
clang -arch arm64 -O2 -Wall -o helper helper.c
echo "built ./helper (arm64)"
file helper
