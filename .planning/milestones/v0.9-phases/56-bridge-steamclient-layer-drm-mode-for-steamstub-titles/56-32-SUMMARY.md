---
phase: 56-bridge-steamclient-layer-drm-mode-for-steamstub-titles
plan: 32
subsystem: steam-drm-bottle-stage
tags: [drm, wine-log, gap-closure, sidecar-exit-contract]
requires: [56-27, 56-31]
provides:
  - stage wine session log (`<appId>-<id>.stage.wine.log`)
  - pre-kill process listing on every timed-out stage attempt
  - dev-only forced first stage timeout
affects: [stageDrmBottle, drmLaunchSetup]
key-files:
  created:
    - src/backend/storeManagers/steam/bridge/drm/stageWineLog.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/stageWineLog.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts
    - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/stageDrmBottle.test.ts
    - src/backend/storeManagers/steam/bridge/drm/__tests__/drmLaunchSetup.test.ts
decisions:
  - "winebus is not disabled for the stage (game reuses the stage session); winebus/IOHID root cause stays out of scope"
  - "Forced timeout honoured only when isPackagedSidecar() is false and value matches /^[0-9]{3,5}$/"
metrics:
  tasks: 2
  completed: 2026-10-29
---

# Phase 56 Plan 32: Stage wine log and deterministic retry trigger Summary

The bottle stage's wine session now writes a bounded, symlink-safe log, every timed-out attempt records the bottle process list before the session is ended, and a dev run can force the timeout -> kill -> retry path.

## Commits
- 5028e07e7: stageWineLog module (0700 dir, `wx` 0600 open, 2 MiB cap, keep 8 per app, header line)
- 6cdafa4a9: stage wiring, pre-kill listing, retry-passed line, forced first timeout, unref'd listing children, `stageLogDir` from drmLaunchSetup

## Behaviour
- Log only opened when the registry is not already staged; path logged as `stage wine log <path>`; `[gamelib] stage attempt <n>` markers; sink closed in a finally.
- `bottle processes at timeout:` logged and written to the stage log before `endStageSession` on each timed-out attempt; the final-failure path still logs it too.
- `stage retry passed on attempt <n>` on a passing retry.
- `GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS` shortens attempt 0 only.
- `ps`/`lsof` listing children are `unref?.()`'d (WR-03).

## Tests
All named tests implemented: stageWineLog A-E; stageDrmBottle A-E (E parameterised over packaged, '5', 'abc', '999999'). Drm suites and fakeHomeIsolation pass (305 passed), tsc clean, prettier clean on the touched paths.

## Deviations from Plan
**[Rule 3 - test fixture]** The existing drmLaunchSetup happy-path test used an exact `toEqual` on the stage input; it now expects the new `stageLogDir` (from `buildDrmPaths(APP_FOLDER)`). Commit 6cdafa4a9.

Skill("gamelib-conventions") could not be loaded (no Skill tool); the plan's own restatement of the conventions was followed (scoped prettier, `.unref?.()` spelling, no env literal).

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model (T-56-32-01..03 mitigated as specified).

## Self-Check: PASSED
