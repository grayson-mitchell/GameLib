---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 06
subsystem: steam-engine
tags: [bottle, cxbottle, dxvk, engine-switch]
requires: [59-01, 59-03, 59-05]
provides:
  - engine/adoptBottle.ts (buildCxbottleConf, writeCxbottleConf)
  - engine/engineSwitch.ts (prepareBottleForEngine, ENGINE_MARKER_FILE)
  - bottle.ts provisionBridgeBottle fallbackEngine branch, createTimeoutMs, CROSSOVER_CREATE_TIMEOUT
  - DXVK.installRemove optional pinned source
affects: [59-07, 59-10]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/adoptBottle.ts
    - src/backend/storeManagers/steam/engine/engineSwitch.ts
    - src/backend/storeManagers/steam/engine/__tests__/adoptBottle.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineSwitch.test.ts
  modified:
    - src/backend/tools/index.ts
    - src/backend/tools/__tests__/dxvkInstallRemove.test.ts
    - src/backend/storeManagers/steam/bottle.ts
    - src/backend/storeManagers/steam/__tests__/bottle.test.ts
decisions:
  - "DXVK_RESTORE_ENGINE hard-coded to crossover per 59-01 (dxvk_restore_clean: yes)"
  - "Fallback bottle conf is written last, so isBridgeBottleReady is false until the bottle is complete"
  - "engineSwitch takes every collaborator as an injectable dep, defaults to the real functions"
metrics:
  tasks: 3
  completed: 2026-11-01
---

# Phase 59 Plan 06: Fallback bottle creation and engine switching Summary

The fallback engine can now create a bridge bottle from nothing in CrossOver's Bottles directory, with a minimal `cxbottle.conf` written last so CrossOver adopts it later. CrossOver's own `--create` is now capped, and a bottle can switch engines in both directions with the old wineserver stopped and DXVK in the right state.

## Wave 0 gates

59-01-SUMMARY.md reported `adoption_clean: yes` and `dxvk_restore_clean: yes` with `dxvk_restore_engine: crossover`. Tasks 2 and 3 therefore proceeded without a checkpoint.

## Tasks

| Task | Commit | Result |
| ---- | ------ | ------ |
| 1 adoptBottle.ts and pinned DXVK source | b414a94a3 | `writeCxbottleConf` (atomic, refuses an existing conf or a missing `system.reg`); `installRemove(..., source)` copies synchronously and writes `current_dxvk-macOS` before resolving |
| 2 provisionBridgeBottle fallback branch and create cap | dbcf39c2e (+ d61fc8ab1 comment reword) | wineboot -i, wineserver -w, DXVK, conf, wineserver -k in that order; `createTimeoutMs` yields `CROSSOVER_CREATE_TIMEOUT` and removes only a dir this call created |
| 3 engineSwitch.ts | 9d04650f0 | `prepareBottleForEngine` with the `.gamelib-engine.json` marker |

The installRemove tests live in the existing `src/backend/tools/__tests__/dxvkInstallRemove.test.ts` (one new describe block).

## Behaviour notes

- Cleanup of a partial bottle uses `path.relative(bottlesRoot, dir) === bottleName` and only runs when `existsSync(dir)` was false before the call (T-59-25).
- `prepareBottleForEngine` ignores a marker wineserver unless it sits inside `pinnedEngineRoot()`, `<toolsPath>/wine`, or is CrossOver's own (T-59-26). It refuses while the monitor phase is `starting` or `running` (T-59-29).
- Returning to CrossOver restores DXVK only when a DXVK source dir is known (the current pin); otherwise it warns and leaves DXVK rather than guessing DLL names.
- The `crossoverSettings` dep (`getBridgeBottleSettings`) must be called while the CrossOver selection is the registered one; callers in 59-10 should order accordingly.

## Deviations from Plan

**1. [Rule 3 - Blocking] Dynamic import of `backend/tools` in bottle.ts.** `bottle.ts` deliberately avoids static imports of the launcher chain; the fallback branch loads `DXVK` lazily and the test mocks `backend/tools`.

**2. [Rule 1 - Bug] Reworded a 59-05 comment in bottle.ts** that mentioned WINEUSERNAME, since the acceptance grep requires zero occurrences.

**3. First Task 1 commit was amended** (own unpushed commit) to include a missing `readFileSync` test import.

## Known Stubs

None.

## Threat Flags

None beyond the plan's threat model.

## Verification

- `npx jest src/backend/storeManagers/steam src/backend/tools`: 118 suites, 4072 passed, 1 skipped.
- `fakeHomeIsolation.test.ts` passes. `pnpm codecheck` exits 0. Prettier check clean on all touched files.

## Self-Check: PASSED

All created files exist; commits b414a94a3, dbcf39c2e, 9d04650f0 exist.
