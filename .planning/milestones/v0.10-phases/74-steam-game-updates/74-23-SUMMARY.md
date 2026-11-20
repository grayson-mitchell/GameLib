---
phase: 74-steam-game-updates
plan: 23
subsystem: steam-updates
tags: [steam, update-detection, gap-closure]
requires: []
provides:
  - PICS-stale registered games are always handed to Steam
  - target-aware quiet end of the update poll
  - PICS failure never hides a stale registered game
affects: [updateNative, updatePollOnce, updateDetection, updateInfo]
key-files:
  modified:
    - src/backend/storeManagers/steam/updateNative.ts
    - src/backend/storeManagers/steam/library/acfUpdateState.ts
    - src/backend/storeManagers/steam/library/updatePollOnce.ts
    - src/backend/storeManagers/steam/updateDetection.ts
    - src/backend/storeManagers/steam/updateInfo.ts
decisions:
  - "A registered PICS failure compares the prior state to the ACF: unchanged keeps prior, target reached writes current, otherwise keeps prior state with corrected installedBuild"
metrics:
  tasks: 3
  completed: 2026-11-13
---

# Phase 74 Plan 23: Registered-update gap closure Summary

Registered updates for PICS-stale games are handed to Steam even when the ACF says current, the poll never fakes completion short of the target build, and a PICS timeout can no longer flip a stale registered game to current.

## Commits

- 9e3e3d2be: Tasks 1 and 2 (updateNative short-circuit gated on `picsSaysNewer`, shared `STATE_FLAG_FULLY_INSTALLED`, no cast; quiet end completes only at target, redundant completion clause removed)
- 8698db974: Task 3 (registered PICS-failure arm cases A/B/C; updateInfo skips the network while the ACF is unchanged, else 20 s bound)

## Verification

jest: updateNative, library.updatePollOnce, library.installPolling, updateInfo, updateDetection (+ exit, acf) all pass. `tsc --noEmit` clean; scoped prettier clean; steam-line-ceiling PASS; eslint 0 errors on touched sources. `graphify update .` run.

## Deviations from Plan

- Tasks 1 and 2 were committed together because both touch `updatePollOnce.ts`.
- The plan's "statuses `['done']` only" for the unmet-target quiet end: the tick's own progress 'updating' precedes 'done' (pre-existing). The test asserts `['updating','done']` plus that complete() ("finished") never logs.
- `pnpm codecheck` fails in the second step on pre-existing `meta/gen_vtables.ts` type errors (unrelated, untouched); the app `tsc --noEmit` passes.

## Self-Check: PASSED
