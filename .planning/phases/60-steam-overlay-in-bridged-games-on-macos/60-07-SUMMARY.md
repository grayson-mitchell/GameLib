---
phase: 60-steam-overlay-in-bridged-games-on-macos
plan: 07
subsystem: steam-bridge-overlay
tags: [overlay, cx_env, bottle, runner-registry, fail-open]
requires: [60-01, 60-02, 60-05]
provides:
  - overlayLaunch (appendCxEnvTokens, buildOverlayCxTokens, checkOverlayInputs, prepareOverlayTokens, prepareOverlayLaunch)
  - bottle.ts overlay runner registry (BridgeRunnerKind, setOverlayBridgeRunner, getBridgeRunnerKind, endPerGameBridgeBottleSessionWith)
affects: [60-08]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
    - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
  modified:
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
key-decisions:
  - "Overlay entries live in the same drmBridgeRunners map with a kind field, so getDrmBridgeRunner keeps returning every kind and drmLaunchSetup's runner-change comparison still sees overlay entries"
  - "Steam dylibs are checked with stat (may be reached via links in the user's Steam install); the shim with lstat (no symlink follow)"
metrics:
  completed: 2026-11-03
  tasks: 2
  files: 4
---

# Phase 60 Plan 07: Launch-side overlay library and overlay-capable runner registry

CX_ENV token builder/merger and fail-open prepare functions for the overlay (D-12, D-08), plus a bottle.ts registry that holds a kind-tagged overlay runner (D-04).

## Commits
- b98856f48: overlayLaunch.ts with tests (23 cases)
- b6cc22ab8: bottle.ts registry (kind 'drm' | 'overlay'), setOverlayBridgeRunner, getBridgeRunnerKind, endPerGameBridgeBottleSessionWith, 5 new tests

## Verification
- jest overlayLaunch, bottle, drmLaunchSetup: all pass; `pnpm codecheck` clean; prettier clean; eslint clean on touched files.

## getDrmBridgeRunner callers (checked for overlay entries)
- `drmLaunchSetup.ts:298` (getRunner): compares runnerDir and ends the session before registering a DRM runner; correct for an overlay entry (a differing runnerDir triggers a session end).
- `games.ts:4701` (`hadDrmRunner = getDrmBridgeRunner(...) !== undefined`): now also true for an overlay entry. Plan 08 must use `getBridgeRunnerKind` or the previous-runner bin dir (with `endPerGameBridgeBottleSessionWith`) if that flag drives behavior, since an overlay entry is not a DRM runner.

## Deviations from Plan
None - plan executed as written. Note: `appendCxEnvTokens` returns the CX_ENV entry appended at the end of the env list (other keys keep relative order).

## Known Stubs
None.

## Self-Check: PASSED
