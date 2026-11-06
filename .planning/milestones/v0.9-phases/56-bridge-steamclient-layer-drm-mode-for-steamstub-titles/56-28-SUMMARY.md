---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 28
subsystem: steam-bridge
tags: [drm, ceg, gap-closure]
requires: []
provides:
  - "placeShimForGame reads drm from launchWrapper.drmExe"
affects: [games.ts persistBridgeDrmSignal callers (inherit via shimResult.drm)]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
requirements-completed: [D-12, D-17]
duration: 5min
completed: 2026-10-29
---

# Phase 56 Plan 28: Single-exe DRM signal Summary

placeShimForGame now computes `drm` via `detectExeSteamDrm(appId, drmSource)` where `drmSource = launchWrapper?.drmExe ?? resolve(gameExePath)`, so CEG on a UE Shipping exe is no longer lost and the stored `ceg` verdict is not cleared (CR-02). exeArch split documented at the stamp site (IN-06).

Commit: 15fa338f8.

## Deviations from Plan
Test C (unsanitizable bottle name) has no dedicated test; the fallback path is covered by the existing CEG tests, which run with the default resolver. No other deviations. games.ts untouched.

## Verification
shimGenerate and games jest suites pass (568 tests), tsc clean, prettier clean.

## Self-Check: PASSED
