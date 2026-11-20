---
phase: 61-unified-macos-engine-for-all-stores
plan: 15
subsystem: engine
tags: [overlay, store-managers, setup, census]
requires: [61-12, 61-14]
provides:
  - "legendary, gog, nile, sideload and storeManagerCommon launch/stop read settings through getLaunchSettings(engineKeyFor(...), stored)"
  - "gog and nile install setup run on the selected engine in the per-game bottle"
  - "managerOverlayCensus.test.ts guard"
key-files:
  modified:
    - src/backend/storeManagers/legendary/games.ts
    - src/backend/storeManagers/gog/games.ts
    - src/backend/storeManagers/gog/setup.ts
    - src/backend/storeManagers/nile/games.ts
    - src/backend/storeManagers/nile/setup.ts
    - src/backend/storeManagers/sideload/games.ts
    - src/backend/storeManagers/storeManagerCommon/games.ts
  created:
    - src/backend/engine/__tests__/managerOverlayCensus.test.ts
    - src/backend/storeManagers/gog/__tests__/setup.engine.test.ts
key-decisions:
  - "Manager getSettings() methods are unchanged; the overlay is applied at the call site (Settings screen keeps stored values)"
  - "gog reads at moveInstall, uninstall, update and post-update stay on stored settings, each annotated 'overlay census:' as install/metadata"
  - "Setup split into an engine-step wrapper plus runGogSetup/runNileSetup body; verifyWinePrefix moved into the body so it runs on the overlay settings"
metrics:
  tasks: 2
  completed: 2026-11-07
---

# Phase 61 Plan 15: Store manager overlay and engine-aware setup Summary

Every launch and stop path in the Epic, GOG, Amazon and sideload managers now reads settings through `getLaunchSettings`, and GOG/Amazon install setup on macOS runs on the engine chosen by `selectEngineForLaunch(game, { purpose: 'setup' })`.

## Commits
- 0941834eb: legendary, nile, sideload, storeManagerCommon overlay reads
- f640a51b6: gog overlay reads and annotations, gog/nile engine-aware setup, census test, setup.engine test

## Behaviour
- launch (legendary, gog, nile) and stop (all four) wrap `this.getSettings()`; `launchGame` wraps `getAppSettings`. The browser `targetExe` read in `launchGame` stays on stored settings.
- Setup, non-Windows: `use` runs the body on `getLaunchSettings(step.key, stored)`, skips `checkWineBeforeLaunch` (D-08), and calls `endEngineLaunch` in a `finally`; `refused` logs one warning and returns; `legacy`/`skip` keep the old self-heal path. `selectEngineForLaunch` provisions the per-game bottle (D-01, D-03).
- Census test: 12 cases, brace-matched bodies of `launch`/`stop`/`launchGame` across the five files, plus `getSettings()` unchanged and gog annotation check.

## Handoff from 61-14 closed
The store `launch()` bodies now pass the overlay settings to `prepareLaunch`, so its crossover-folder branch for third-party apps sees the same settings as `prepareWineLaunch` and the launch scripts.

## Deviations from Plan
- The census test file was committed with Task 2 rather than Task 1, because it covers gog and would be red at the Task 1 commit (the plan itself says it goes green only after Task 2).
- `verifyWinePrefix` moved from the setup preamble into `runGogSetup`/`runNileSetup` (runs for both `use` and legacy paths, on the right settings).

## Verification
- `tsc --noEmit` clean; `jest src/backend/storeManagers src/backend/engine`: 5042 passed, 3 failed (all in the known pre-existing list: bottle.test.ts DRM_LAUNCH_FORM, games.test.ts channel constants, macArchKnownFixRouting Intel). tauriShellSource not in this scope.
- `pnpm boundaries` clean; prettier clean on all touched files.
- Lint totals unchanged: tests 664, src 1117.
- Key links checked by grep: `getLaunchSettings(` present in all manager files; `selectEngineForLaunch(` in gog/setup.ts and nile/setup.ts.
- REQUIREMENTS.md does not exist; requirements mark-complete not run.

## Known Stubs
None.

## Self-Check: PASSED
