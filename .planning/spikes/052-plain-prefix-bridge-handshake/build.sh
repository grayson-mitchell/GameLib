#!/bin/bash
# Spike 052: build the x86 + x64 probe against the SHIPPED shims' .def (the production artifacts in
# public/bin/arm64/darwin are what run; only their import libs are made here).
set -euo pipefail
cd "$(dirname "$0")"
R=../../..; Z="$R/.build-tools/zig/zig"; G="$R/native/steam-bridge/generated"
mkdir -p out
"$Z" dlltool -m i386 -d "$G/steam_api.def" -l out/libsteam_api.a
"$Z" dlltool -m i386:x86-64 -d "$G/steam_api64.def" -l out/libsteam_api64.a
"$Z" cc -target x86-windows-gnu -O2 -o out/probe32.exe probe.c out/libsteam_api.a
"$Z" cc -target x86_64-windows-gnu -O2 -o out/probe64.exe probe.c out/libsteam_api64.a
rm -f out/*.pdb ./*.pdb ./*.lib
file out/probe32.exe out/probe64.exe
