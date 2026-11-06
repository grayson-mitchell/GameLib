---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 15
subsystem: steam-bridge-overlay
tags: [overlay, darwin-notify, probe, gap-closure, G1]
requires: [60-12, 60-14]
provides:
  - "Darwin notification com.gamelib.steambridge.overlay.<appid> (state 1/0) from the bridge helper behind GAMELIB_OVERLAY_INPUT_PROBE=1"
  - "GAMELIB_OVERLAY_RELEASE_EXPERIMENT passthrough (cb:release, cb:release+block, key:release)"
affects: [60-17, 60-18]
key-files:
  created:
    - native/steam-bridge/helper/gamelib_overlay_signal.h
    - meta/__tests__/overlaySignal.test.ts
  modified:
    - native/steam-bridge/helper/bridge_helper.c
    - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
    - src/backend/storeManagers/steam/games.ts
decisions:
  - "331 stays off the callback allowlist; the game receives no new callback"
  - "key:release+block excluded from the experiment allowlist (shim sendEvent: block would swallow Shift+Tab)"
metrics:
  tasks: 2
  completed: 2026-11-04
---

# Phase 60 Plan 15: Overlay signal and experiment env plumbing Summary

Opt-in (probe flag only): the bridge helper now logs each Mac Steam GameOverlayActivated_t (331) as an `OVL` line with epoch-ms and publishes it as a Darwin notification for the real appId, and the sidecar hands a regex-validated release-experiment value to the game on all overlay routes.

## Commits
- 42f2223cc feat(60-15): helper overlay signal (header, pump wiring, compiled C driver test)
- 7b9b838c6 feat(60-15): validated release-experiment env passthrough (overlayLaunch.ts, games.ts, tests)

## Verification
- overlaySignal test, fakeHomeIsolation, overlay + games jest (796 tests), codecheck, smoke:sidecar, build-steam-bridge all green; prettier applied.
- 331 not in gamelib_cbqueue.h (grep count 0); the 331 branch is guarded by `g_ovl.enabled`.

## Deviations from Plan
None to the code. The Meta jest project ignored the path filter on the first run and ran all of Meta: one failure, `meta/__tests__/hardcodedStringGate.test.ts`, on strings in `src/frontend/components/UI/SteamEngineLaunchNotice/index.tsx`. That file is not touched by this plan (pre-existing, from 60-14), so it is out of scope. Re-run with `--runTestsByPath`, overlaySignal passes.

## Deferred Issues
- hardcodedStringGate fails on SteamEngineLaunchNotice/index.tsx (60-14 origin). Not fixed here.

## Known Stubs
None.

## Threat Flags
None beyond the plan's register (T-60-15-02 accepted: local processes can post the notification name).

## Self-Check: PASSED
