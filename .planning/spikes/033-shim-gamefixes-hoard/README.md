---
spike: 033
name: shim-gamefixes-hoard
type: standard
validates: "Given 030's two Hoard problems (3.3-compat context crash; ~30 s splash freeze), when per-game fixes are applied from inside GameLib's steam_api shim by redirecting the game EXE's IAT at load, then the UNMODIFIED exe runs (WGL fix) and the splash freeze shrinks (seek cache)"
verdict: PARTIAL
related: [030, 031, 032, 008]
tags: [steam, macos, crossover, shim, iat-hook, opengl, wgl, glew, rosetta, x87, ubsan, zig, hoard, game-fix]
---

# Spike 033: Hoard fixes from inside the steam_api shim

## What This Validates

Spike 030 hid `WGL_ARB_create_context` from Hoard by flipping one byte in `Reuben.exe`, and it left
a ~30 s freeze at the splash. **Given** GameLib already places its own `steam_api.dll` next to the
game, **when** that shim redirects the game exe's import-table (IAT) slots at
`DLL_PROCESS_ATTACH`, **then**:
- (a) the **unmodified** exe should run, via a WGL extension-string filter;
- (b) the splash freeze should shrink, via a user-space seek cache, if 030's seek-storm theory holds.

## Build

`gamefix.c` is compiled **beside** the unmodified generated `native/steam-bridge/generated/steam_api_shim.c`.
`build.sh` mirrors `meta/buildSteamBridgeShims.ts` `buildShimCompileArgv` exactly: the repo-pinned
`.build-tools/zig/zig` 0.16.0, `cc -target x86-windows-gnu -shared … -lws2_32`, and **no `-O`**.
`run.sh` swaps it in for GameLib's placed DLL and always restores it, with a sha check. Each fix is
switched by an env var. A frame-gap meter (an IAT hook on `GDI32!SwapBuffers`) is always on, so
"freeze" is measured, not eyeballed.

## Investigation Trail

| Run | Fixes | Result |
|---|---|---|
| A | none | crash (3.3 compat context), the control |
| B | WGL | **runs, unmodified exe**; filter dropped 3 `WGL_ARB_create_context*` tokens; **max frame gap 24.03 s** |
| C | WGL + seek cache | first two attempts panicked (see UBSan below); once fixed: **449,472 seeks answered in memory, 142 real**, yet **max frame gap 24.35 s**, unchanged. The process also exited on its own at ~53 s, unexplained |
| D | WGL + profiler | 1,895 samples at 10 ms inside the freeze: ~80 % at `Reuben.exe+0x10db00…0x10e700`, the rest at `+0x108700` and `+0xeba00`, **all game code** |

- **Relay tracing distorts this freeze.** Under `+relay` the longest frame gap was only 2.9 s; the
  game interleaves frames with load chunks when slowed down. This likely explains why you saw the
  spinner keep turning on traced runs. Call counts from relay are what misled 030 into blaming
  seeks. The in-shim sampler (a suspended-thread EIP histogram, recorded only while frames are
  stalled) doesn't have that distortion.
- **The hot region is dense x87 FPU code:** 282 `fld`, 160 `fstp`, 79 `fmul`, 77 `fxch` in
  ~3 KB. The pattern `a·c − b·d` / `a·d + b·c` with a strided pointer suggests a complex-number
  transform (FFT-like), run once at load. **Rosetta 2 emulates x87 in software and is notoriously
  slow at it.** A native x86 CPU (Proton) runs the same loop quickly.
- **UBSan in the shim build.** `zig cc` without `-O` is a Debug build with UBSan, and GameLib's
  placed shim also contains the sanitizer runtime (`misaligned address` / `panic:` strings, both
  DLLs). x86 MSVC code legally passes 4-byte-aligned `LARGE_INTEGER*`. Writing through it, even via
  `memcpy` on the typed pointer, panicked the game (`store of misaligned address 0x22f484 … requires
  8 byte alignment`). Fixed for `gamefix.c` with a file-scoped
  `#pragma clang attribute … no_sanitize("alignment")`.

## Results

**Verdict: PARTIAL ⚠**

- ✓ **The WGL fix works from the shim.** The unmodified, sha-verified `Reuben.exe` runs on Apple's
  GPU-backed GL 2.1 with no crash. It's an IAT hook of `OPENGL32!wglGetProcAddress` that wraps
  `wglGetExtensionsString{ARB,EXT}` and drops `WGL_ARB_create_context*` tokens. A Steam file
  verify can't undo it, and it generalises to any GLEW-era game with a legacy fallback. This
  replaces 030's byte patch as the shipping shape.
- ✗ **The seek cache is a non-fix.** It removes 99.97 % of real seeks and leaves the freeze
  unchanged, plus it caused an unexplained early exit. Do not ship it.
- ✓ **The freeze's real root cause is found:** an x87-heavy, CPU-bound loop in Hoard's own code at
  load, slow under Rosetta 2. It **isn't fixable from a shim.** The options are UX (GameLib shows
  "Starting…" while the game window is unresponsive) or accepting it. The quit freeze is still
  untraced; it may be the same class.
- ⚠ **Product risk, separate from Hoard:** the shipped shim is a Debug/UBSan build. Any game that
  hands a shim export a legal-on-x86 misaligned pointer the shim dereferences would panic the game.
  This is worth a todo. Options: build with `-O2 -fno-sanitize=undefined` (or `-fsanitize-trap`), or
  audit the generated code's pointer reads.

## How to Run

```bash
./build.sh                                   # repo-pinned zig, mirrors buildShimCompileArgv
WATCH=60 ./run.sh <label> <wgl 0|1> <seek 0|1>   # PROFILE=1 adds the freeze-only sampler
INTERACTIVE=1 ./run.sh play 1 0              # play the WGL-fixed unmodified game
python3 -I relay_time.py <relay.cxlog>       # Call/Ret time split (shown misleading here; kept for the record)
```
