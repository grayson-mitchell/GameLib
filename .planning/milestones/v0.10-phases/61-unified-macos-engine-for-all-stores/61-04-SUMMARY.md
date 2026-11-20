---
phase: 61-unified-macos-engine-for-all-stores
plan: 04
subsystem: engine
tags: [refactor, engine, crossover, runTool, processListing]
requires: ["61-03"]
provides:
  - engine/crossoverLocation.ts (moved, git mv)
  - engine/runTool.ts (RunTool, RunToolResult, defaultRunTool)
  - engine/processListing.ts (parsePsLine, processListing, exported)
affects: [61-16]
key-files:
  created:
    - src/backend/engine/runTool.ts
    - src/backend/engine/processListing.ts
    - src/backend/engine/__tests__/processListing.test.ts
  modified:
    - src/backend/storeManagers/steam/bridge/drm/runnerClone.ts
    - src/backend/storeManagers/steam/bottleProcessMonitor.ts
    - src/backend/engine/testedCrossoverVersions.ts
  moved:
    - steam/crossoverLocation.ts -> engine/crossoverLocation.ts (with its test)
decisions:
  - "No re-export facade; every importer and jest.mock repointed to backend/engine/*"
metrics:
  completed: 2026-11-07
  tasks: 2
---

# Phase 61 Plan 04: Engine primitives moved out of Steam Summary

Three store-agnostic modules now live in `src/backend/engine/` (CrossOver resolver, RunTool spawn helper, ps/pgrep listing and line parser) so the engine and the non-Steam first-match watcher need no Steam import.

## Commits
- 8d7722652: crossoverLocation git mv (renames detected) plus repointed importers and mocks
- 424ba0929: runTool.ts and processListing.ts extraction, new processListing test (7 cases)

## Deviations from Plan

**[Rule 3 - Blocking] RunTool carried its dependencies.** `RunnerTool`, `RUNNER_TOOLS`, `OUTPUT_CAP` and `unrefHandle` moved to `engine/runTool.ts` with `defaultRunTool` because they are used only by it. `RUNNER_TIMEOUTS` stays in runnerClone.ts. Additional importers of `RunTool`/`defaultRunTool` beyond the plan list (`overlayRunnerClone.ts`, `overlayLaunch.ts`) were repointed to honour "no facade". The now-unused `spawnAsync` import was dropped from bottleProcessMonitor.ts.

## Verification
- jest over engine, steam, appshell: 4664 passed; 3 failures are the known pre-existing ones (bottle DRM_LAUNCH_FORM, games channel constants, macArchKnownFixRouting Intel).
- `pnpm codecheck` and `pnpm boundaries` clean. `pnpm lint` fails only on the known tests-scope ceiling (661); my new files add 0 warnings (the 2 eslint warnings in runnerClone.test.ts are on pre-existing lines).
- No engine file imports `storeManagers/steam`.

## Known Stubs
None.

## Self-Check: PASSED
