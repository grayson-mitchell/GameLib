---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 20
subsystem: steam-bridge-overlay
tags: [overlay, macos, G1, launch]
status: complete
requires: [60-18, 60-19]
provides:
  - "overlay_input.dylib inserted after gameoverlayrenderer on the tcp-clone and env overlay routes"
  - "SteamGame: appId <id> overlay input fix=<code> applied=<bool> [reason=...] log line"
  - "GAMELIB_OVERLAY_INPUT_FIX=off dev switch"
affects: [60-16]
key-files:
  modified:
    - src/backend/constants/paths.ts
    - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
key-decisions:
  - "OVERLAY_INPUT_FIX_CODE = X-RELEASE+BLOCK, routes tcp-clone and env, from the 60-18 verdict"
  - "Decision order: route, disabled, experiment, missing"
requirements-completed: [G1, D-15, D-12, D-08, D-04, D-07]
completed: 2026-11-04
---

# Phase 60 Plan 20: Overlay input fix wiring Summary

**Overlay launches on the CrossOver clone and Wine-Staging env routes now inject overlay_input.dylib after the Steam renderer (shim first), with one `overlay input fix=` log line per overlay launch.**

Branch taken: 60-18 verdict `X-RELEASE+BLOCK`, signal cb, close-restore ok, fix routes `tcp-clone,env` -> build.

## Tasks

1. Task 1 (60477e990): `inputModulePath` in `overlayEnvValues` (order `shim:loader:renderer:input[:probe]`, unsafe path dropped silently), `builtOverlayInputPath` in paths.ts, 4 new overlayLaunch tests.
2. Task 2 (df913db2b): `overlayInputArg(route)` in games.ts spread into the clone and env calls (and logged only for DRM), constants citing 60-18, 6 new games tests.

## Deviations from Plan

None. Note: the experiment check reuses `overlayInputProbeFromEnv`, so an armed valid experiment omits the fix even if the probe dylib itself is missing.

## Verification

- jest games.test.ts (661) and overlay dir pass; `pnpm codecheck` clean; `pnpm smoke:sidecar` PASS; prettier clean on changed paths.
- Not run (known pre-existing): meta/__tests__/hardcodedStringGate.test.ts.
- No timers or handles added (synchronous lstat only).

## Known Stubs

None.

## Self-Check: PASSED

Commits 60477e990 and df913db2b present.
