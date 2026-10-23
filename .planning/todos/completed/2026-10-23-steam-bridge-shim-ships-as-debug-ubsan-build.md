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

## Closed 2026-10-23 — quick 261023-tyf

Both shims now compile with `-O2 -fno-sanitize=undefined` (`SHIM_RELEASE_CFLAGS` in
`meta/buildSteamBridgeShims.ts`, spread into the x86 and x64 argv). UBSan is OFF, not trap mode:
trap mode would still kill the game on input that is legal under the x86 ABI (a `ud2` in place of
a readable panic). One flag set serves dev and packaged builds, since dev builds place these same
DLLs into real bottles.

Commits: `1ffb5b315` (release flags + shimAbiGate on the production flags), `9542cf97a`
(marker keepalive fix + regenerated `steam_api_shim.c`).

| DLL | before | after | `misaligned address` | `GameLibSteamBridgeShim/2` | `127.0.0.1` |
|---|---|---|---|---|---|
| steam_api.dll (x86) | 894464 | 286720 | 1 -> 0 | 1 -> 1 | 1 -> 1 |
| steam_api64.dll (x64) | 848896 | 223744 | 1 -> 0 | 1 -> 1 | 1 -> 1 |

Export lists (48 x86, 47 x64) are identical before and after. Five shim suites pass (235 tests),
shimAbiGate ran and was not skipped. One matcher was adjusted: at -O2 the x64 stub never reads
`self`, so the old `mov %rcx,` regex missed. The ABI invariants hold (sret in %rdx returned in
%rax, plain `retq`, i386 `ret $0x4`); the matcher now asserts the %rdx sret role and that %rcx is
not used as the sret pointer.

Regression found and fixed: at -O2 the old keepalive (`volatile const char *`, pointee-volatile)
was a dead local and was deleted, dropping the `GameLibSteamBridgeShim/2` string (0 occurrences
measured). The generator now emits `const char *volatile gamelib_marker_keepalive`.

No in-repo shim-size pins existed. The 894464 mentions in 51-UAT.md and 51-27-SUMMARY.md are dated
historical evidence and were left alone. The DLLs are build outputs, not committed (D-07).
Existing `GameLibSteamBridge-*` bottles refresh on next launch via placeShimForGame's
byte-identity check, so no manual bottle step is needed; a packaged .app picks the fix up at its
next packaged build.

NOT verified: a live Hoard (or any game) launch against the release shim was not run. The spike
033 run C crash is fixed by construction (no sanitizer runtime in the DLL), not by live replay.
