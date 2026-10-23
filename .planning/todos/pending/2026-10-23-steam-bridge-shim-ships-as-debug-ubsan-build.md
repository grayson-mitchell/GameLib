---
created: 2026-10-23
title: "Steam bridge shim ships as a Debug/UBSan build that can panic games on legal x86 misaligned pointers"
source: spike 033 (shim-gamefixes-hoard), run C
area: steam-bridge
files:
  - meta/buildSteamBridgeShims.ts
  - native/steam-bridge/generated/steam_api_shim.c
severity: major
platform: any
ready: code
---

`buildShimCompileArgv()` in `meta/buildSteamBridgeShims.ts` invokes
`zig cc -target x86-windows-gnu -shared -o … steam_api_shim.c steam_api.def -lws2_32` with **no
`-O` flag**. zig's default is a Debug build with UBSan enabled. The `steam_api.dll` GameLib placed
in `GameLibSteamBridge-63000` carries the sanitizer runtime: `strings` finds the `misaligned
address` / `panic:` messages in it, as it does in a locally rebuilt copy.

Measured in spike 033: 32-bit MSVC game code legally passes 4-byte-aligned `LARGE_INTEGER*`
(that's the x86 ABI). A shim-side store through it aborted Hoard with:

    thread 212 panic: member access within misaligned address 0x22f484 for type 'LARGE_INTEGER' … requires 8 byte alignment

It did so even via `memcpy` on the typed pointer. Any generated shim export that dereferences a
game-supplied pointer to an 8-byte-aligned type (64-bit IDs, `uint64` out-params, structs with
doubles) can panic a game the same way, on input that is valid for that platform. That's a crash
the game would never hit against Valve's real `steam_api.dll`.

Fix options:
- Build with `-O2 -fno-sanitize=undefined`, or keep UBSan but `-fsanitize-trap=undefined`
  (traps silently rather than with a runtime panic). Release builds probably want UBSan off.
- Alternatively, keep Debug for dev builds only and switch to `-O2` in packaged builds.
- Re-run the x86 and x64 shim smoke/coverage checks after the flag change. `-O2` can change
  codegen in the THISCALL/hidden-pointer paths.

Major rather than medium because it can be a silent, game-specific crash in shipped builds, and
it's indistinguishable to the user from "the game doesn't work on Mac".
