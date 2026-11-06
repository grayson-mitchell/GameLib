---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 19
subsystem: steam-bridge-overlay
tags: [overlay, macos, winemac, dylib, G1]
status: complete
requires: [60-18]
provides:
  - "overlay_input.dylib (universal, ad hoc signed) in public/bin/<arch>/darwin/ built by pnpm build-steam-bridge"
  - "helper publishes com.gamelib.steambridge.overlay.<appid> on every launch"
affects: [60-20, 60-16]
key-files:
  created:
    - native/steam-bridge/overlay-input/overlay_input.m
    - meta/__tests__/overlayInputSmoke.test.ts
  modified:
    - native/steam-bridge/helper/gamelib_overlay_signal.h
    - native/steam-bridge/helper/bridge_helper.c
    - meta/__tests__/overlaySignal.test.ts
    - meta/buildSteamBridgeShims.ts
    - meta/__tests__/buildSteamBridgeShims.test.ts
    - public/bin/.gitignore
key-decisions:
  - "Source and block constants set from the 60-18 verdict: OVERLAY_INPUT_SOURCE_CB=1, OVERLAY_INPUT_BLOCK=1; key source not built"
  - "Game-process scope via a Wine service executable deny-list"
requirements-completed: [G1, D-15, D-12, D-08]
completed: 2026-11-04
---

# Phase 60 Plan 19: G1 fix module Summary

**overlay_input.dylib frees winemac's cursor capture on overlay open (cb signal), defers re-capture, calls set_active(1/0), and replays on close; the helper now publishes the overlay state on every launch.**

Branch taken: 60-18 verdict `X-RELEASE+BLOCK`, `signal: cb`, `close-restore: ok`, `fix routes: tcp-clone,env` -> build, including Task 1.

## Tasks

1. Task 1 (fe4d045c7): `gl_ovl_state.enabled` split into `publish` (on whenever the notify name is valid) and `log` (only with GAMELIB_OVERLAY_INPUT_PROBE=1). Test updated first: log-off budget is 0, log-on 256; the publish round trip is unchanged. 331 is still not in gamelib_cbqueue.h and not relayed to the game.
2. Task 2 (1b4d6ec9f): `overlay_input.m`, `buildOverlayInputCompileArgv` / `overlayInputOutputPath` / `compileOverlayInput` (called after compileOverlayInputProbe in main()), argv/order tests, smoke test, gitignore entry. Vendored overlay shim untouched.

Smoke test (5 cases, run with a live window server): open/release/defer/forward/replay/set_active 1 then 0; `set_active absent` logged once; inactive without WineApplication (once); inactive in a process named explorer.exe (no open, no set_active); stderr capped at 64 lines under 500 deferred calls.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Game-process scope check (orchestrator must-carry from 60-18)**
- **Found during:** Task 2 planning; 60-18 recorded that Wine's explorer.exe and one windows=9 process on Staging also ran the experiment.
- **Fix:** beyond the WineApplication + non-nil NSApp gate, the module reads getprogname() and every NSProcessInfo argument, and stays inactive (logs `overlay_input inactive` once) if any basename (case-insensitive, `/` or `\` separated) is a known Wine service exe: explorer.exe, services.exe, winedevice.exe, plugplay.exe, svchost.exe, rpcss.exe, wineboot.exe, conhost.exe, start.exe, winemenubuilder.exe, tabtip.exe, taskmgr.exe, wmiprvse.exe, cmd.exe, steam.exe. The decision is made once and cached.
- **Limit:** the unidentified windows=9 Staging process is not provably covered by this deny-list (its executable name was not recorded). If it is not on the list, 60-16 live gating on Staging should check for `overlay_input open` lines from non-game pids; adding its name is a one-line change.
- **Files:** overlay_input.m, overlayInputSmoke.test.ts (explorer.exe case).

**2. Hook set trimmed to what the fix needs.** The probe's observe-only hooks (event tap, CGEventPost, CGSForceShowCursor, QuickDraw, display hide/show), log file, sampler and image-order lines were not ported. Caller matching uses the dladdr basename `winemac.so`; the 300 s timeout is dropped as the plan specified (T-60-19-03).

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model.

## Verification

- overlaySignal, buildSteamBridgeShims, overlayInputSmoke jest (Meta, by explicit path) green; fakeHomeIsolation green.
- `pnpm build-steam-bridge`: overlay_input.dylib is x86_64 + arm64; `git check-ignore` confirms it is ignored; `git diff -- native/steam-bridge/overlay-shim` empty.
- prettier --check clean on the three meta TS files and overlaySignal.test.ts.
- Not run (known pre-existing, not ours): meta/__tests__/hardcodedStringGate.test.ts.

## Self-Check: PASSED

Files exist; commits fe4d045c7 and 1b4d6ec9f present.
