---
phase: 65-steam-store-manager-decomposition-continued
plan: 01
subsystem: tooling
tags: [line-ceiling, ratchet, depcruise, ci-gate, baselines]
requires: []
provides:
  - "pnpm steam-line-ceiling shrink-only 1,000-line gate for storeManagers/steam/"
  - "phase test and cycle baselines for later plans to diff against"
affects: [65-02, 65-03, 65-04]
tech-stack:
  added: []
  patterns: ["equality-ceiling ratchet (indexedAccessRatchet family), no --update flag"]
key-files:
  created:
    - meta/steamLineCeiling.cjs
    - meta/steamLineCeilingBaseline.json
    - meta/__tests__/steamLineCeiling.test.ts
    - meta/__tests__/steamLineCeilingWiring.test.ts
    - .planning/phases/65-steam-store-manager-decomposition-continued/65-baseline-steam.txt
    - .planning/phases/65-steam-store-manager-decomposition-continued/65-baseline-steam-count.txt
    - .planning/phases/65-steam-store-manager-decomposition-continued/65-baseline-adjacent.txt
    - .planning/phases/65-steam-store-manager-decomposition-continued/65-baseline-steam-cycles.txt
  modified:
    - package.json
    - .github/workflows/lint.yml
    - .husky/pre-push
    - .dependency-cruiser.cjs
    - meta/__tests__/boundaryGates.test.ts
    - .planning/todos/completed/2026-11-07-games-ts-further-split-below-1400-lines.md
key-decisions:
  - "Scanned-file floor 100 (128 code files measured); --min-files override exists only for the CLI test arm"
  - "bridgeRouteVerdict deliberately not added to the leaf rule (runtime-constructs SteamGame)"
metrics:
  completed: 2026-11-07
---

# Phase 65 Plan 01: Steam line-ceiling gate Summary

Shrink-only 1,000-line ceiling for `src/backend/storeManagers/steam/`, seeded with the 10 measured over-ceiling files and wired into lint.yml and pre-push; depcruise leaf rule extended for the new module names; baselines recorded.

## Commits

- bf69381d7 docs: baselines (Task 1)
- fc23e6cad test: failing gate test (RED)
- 85ec82e1e feat: gate script + baseline (GREEN)
- 6cc24919d feat: wiring (package.json, lint.yml, pre-push, wiring test)
- 2653abda6 feat: depcruise leaf rule + seeded arms
- 454982df8 docs: close games.ts 1,400 todo

## D-11 and baselines

D-11 held: 61-26/61-27 SUMMARYs exist, 61-HUMAN-UAT `status: complete`, in-scope trees clean.

- Steam suite: 4385 tests (planning measured 4384), 3 pre-existing failures (matches VALIDATION).
- Adjacent suite: 5 pre-existing failures (matches VALIDATION).
- Steam runtime import-cycle census: 321.
- Census command worked as written in the plan's context block, unchanged (needs `$TMPDIR` set and existing).

Over-1,000 files (seeded into the baseline): library.ts 4400, bottle.ts 2275, gameInstall.ts 1971, user.ts 1562, bridge/shimGenerate.ts 1479, games.ts 1351, bridge/drm/runnerClone.ts 1228, gameBridgeLaunch.ts 1183, bridge/helperProcess.ts 1143, bridge/drm/stageDrmBottle.ts 1005. 128 code files scanned. Matches the CONTEXT list of 10.

## Deviations from Plan

- The orchestrator renumbered later plans in the plan file mid-run (games.ts split is now 65-13, not 65-12); the todo Resolution text uses 65-13.
- The pending todo had already been moved to completed/ in a prior commit, so the todo commit only adds the Resolution section.
- `jest --selectProjects Meta <path>` ignores the path and runs the whole Meta project; targeted runs used `--testPathPattern`. Whole Meta run showed 4 failing suites at RED time (steamLineCeiling missing plus 3 pre-existing meta failures from the adjacent baseline); not investigated further.

## Known Stubs

None.

## Self-Check: PASSED

All files exist; all six commit hashes present in git log.
