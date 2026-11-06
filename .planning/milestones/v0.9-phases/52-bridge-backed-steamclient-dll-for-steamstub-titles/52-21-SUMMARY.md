---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 21
subsystem: steam-bridge
tags: [shim, withhold, gap-closure, WR-11]
requires: []
provides:
  - "single-exe branch withholds only when a target exists"
affects: [src/backend/storeManagers/steam/bridge/shimGenerate.ts]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/shimGenerate.ts
    - src/backend/storeManagers/steam/bridge/__tests__/shimGenerate.test.ts
requirements-completed: [P52-SCOPE-4]
metrics:
  tasks: 2
  files: 2
  completed: 2026-10-24
---

# Phase 52 Plan 21: WR-11 no-dll single-exe withhold Summary

placeShimForGame's single-exe branch now calls withholdIfRestorable only when `targetExists`, so a statically- or delay-importing title with no steam_api on disk gets placed-miss instead of a false "launching with the game's own steam_api" withhold.

## Commits
- RED 9c8c32d25: two failing tests (both received status 'withheld', expected 'placed-miss')
- GREEN 08a669c52: guarded call in shimGenerate.ts

## Verification
shimGenerate, bridgeVerdict, games suites: 479 passed. `pnpm codecheck` exit 0. Prettier clean on both paths. The existing game-original withhold test is unchanged and green.

## Deviations from Plan
None. REQUIREMENTS.md does not exist, so requirements mark-complete is a no-op.

## Self-Check: PASSED
