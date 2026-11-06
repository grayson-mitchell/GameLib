---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 05
subsystem: steam-bridge-overlay
tags: [overlay, crossover, runner-clone, codesign, fail-open]
requires: [60-02, 60-03]
provides:
  - detectCrossoverForOverlay (no allowlist, D-06)
  - ensureOverlayRunnerClone / verifyOverlayRunnerClone (D-04)
  - OverlayRunnerReady (the eight DrmBridgeRunner fields plus source)
affects: [60-07]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts
decisions:
  - "Overlay clone uses resignLoader 'derived' on both loaders; marker schema 'overlay-1' pins clone and source loader hashes"
  - "Own inFlight map, prune and removable-name guard; never touches the DRM runners root"
requirements: [D-04, D-06, D-08]
metrics:
  tasks: 2
  files: 3
  completed: 2026-11-02
---

# Phase 60 Plan 05: Overlay-only CrossOver clone Summary

An unpatched APFS clone of the inner SharedSupport/CrossOver with both loaders re-signed (derived entitlements plus dyld env), built on any CrossOver build and failing open with `OverlayStepError`.

## Tasks

1. 081470134 feat: `overlayRunnerClone.ts` with detect, ensure, verify, marker `overlay-1`, per-launch re-verify (clone hashes, source hashes, dyld entitlement), re-clone on same-build reinstall, in-use guard ("quit the game and retry"), own-root prune, in-flight dedupe. 19 unit tests on synthetic trees.
2. e92c50f91 test: opt-in real-CrossOver arm (`GAMELIB_REAL_CROSSOVER=1`). Measured clone + double re-sign on CrossOver 26.3.0.39832 on this Mac: about 1.1 s (cp -c). Installed loaders byte-identical before/after; second call returns cache. Skipped otherwise.

## Deviations from Plan

- The real-arm test mocks `backend/logger` (the real logger imports electron and made the first run fail with a clone error). Test-only.
- `readCrossoverBundleVersion` is the tagged-result form from 60-03, not `string | null`; handled accordingly.

## Verification

Targeted jest (overlayRunnerClone, fakeHomeIsolation) pass, real arm passes with the env var, `pnpm codecheck` clean, eslint and prettier clean on touched files. Grep gates: 0 forbidden tokens, no DRM path literals.

## Known Stubs
None.

## Self-Check: PASSED
