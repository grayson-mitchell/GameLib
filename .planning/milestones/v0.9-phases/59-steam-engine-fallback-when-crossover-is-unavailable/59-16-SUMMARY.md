---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 16
subsystem: steam-engine-download
tags: [gap-closure, sidecar-exit, abort, bottle]
requires: []
provides:
  - "ensurePinnedEngine registers abort controller steam-engine-download:<pinId>"
  - "CROSSOVER_CREATE_FAILED error code on provisionBridgeBottle"
affects: [59-21]
key-files:
  modified:
    - src/backend/storeManagers/steam/engine/fallbackEngine.ts
    - src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
requirements-completed: [D-01, D-05, D-09]
completed: 2026-11-02
---

# Phase 59 Plan 16: Abortable engine download and create-failure code Summary

The built-in engine download now ends at stdin EOF, serves every concurrent caller, and a failed CrossOver bottle create returns its own code and leaves no partial bottle.

## Commits
- 2061b819e: abortable fan-out engine download and stale temp cleanup (WR-11, WR-10)
- 0a577cd27: CROSSOVER_CREATE_FAILED and partial bottle cleanup (WR-02)

## What changed
- `ensurePinnedEngine` keeps one shared entry per pin (listeners, caller count, aborted count, controller). The controller is registered with the shared abort registry, so `callAllAbortControllers()` (sidecar stdin-EOF release) aborts the download unconditionally. Entry and controller are released in `finally`.
- Every caller's `onProgress` receives every event; the shared run starts on a microtask so same-tick joiners see the first events. A caller aborting while others remain resolves `{ok:false, reason:'aborted'}` promptly without aborting the download; when all callers have aborted, the shared download aborts.
- `pruneUnpinnedEngines` removes stale `.tmp-*` dirs when `activeArtifactInstalls === 0`. No timers added.
- `CROSSOVER_CREATE_FAILED` added to the provision `errorCode` union; both the no-conf and throw branches return it and call `removeCreatedBottleDir` only when `createdHere`.

## Deviations from Plan
- Existing test "concurrent calls share one download" changed `toBe` to `toEqual`, since each caller now gets its own promise.
- Single-caller / last-caller abort lets the shared promise settle as 'aborted' (after temp cleanup) instead of resolving early, keeping cleanup deterministic.

## Verification
fallbackEngine.test.ts (17) and bottle.test.ts (188) pass; `pnpm codecheck` exits 0; prettier check clean.

## Self-Check: PASSED
