---
phase: 75-steam-local-file-formats-in-rust
plan: 34
subsystem: steam
tags: [steamfiles, flags, cleanup, jest]
requires: [75-32, 75-33]
provides:
  - "D-08 flags GAMELIB_STEAMFILES_TEXT / GAMELIB_STEAMFILES_SHORTCUTS deleted everywhere in src and meta"
affects: [75-35]
key-files:
  deleted:
    - src/backend/storeManagers/steam/localFiles/steamFilesFlags.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/steamFilesFlags.test.ts
  modified:
    - src/backend/jest.setupContainment.ts
    - 31 steam / shortcuts / sidecar test files (per-test rust pins and restores removed)
key-decisions:
  - "Flag-named describe titles reworded rather than unwrapped, since the blocks hold real rust-path assertions"
metrics:
  tasks: 1
  completed: 2026-11-14
---

# Phase 75 Plan 34: Delete the D-08 flags Summary

Both dev flags and their module are gone; `grep -rl GAMELIB_STEAMFILES_ src meta` returns nothing.

## What changed
- `git rm` of `steamFilesFlags.ts` and its test. No production file imported them, since plans 30-33 had already removed every consumer.
- Removed the Jest transition pin from `jest.setupContainment.ts`.
- Removed the file-level and per-describe `process.env.GAMELIB_STEAMFILES_* = 'rust'` pins, their saved-value consts and restore blocks, and the "removed in plan 34" comments, in 31 test files. Hooks left empty were deleted.
- Reworded describe titles that named the flag.

Commit: 74738eab2 (single task).

## Deviations from Plan
None. The `rustSteamFiles.ts` header had no flag mention left to update.

## Verification
- tsc clean; prettier clean on touched files.
- `jest src/backend meta`: 9 failed suites, all on the known list (epicOfflineMode flake, shimCoverage, shimGenerate, moduleStateCensus, tauriShellSource, diPhaseGates, x86CallbackWineHarness, gamelibCatalogParity, lintTranslations).
- lint:tests 0 errors; lint:src 0 errors (warning ceiling message is pre-existing, none in files I changed); steam-line-ceiling 0; backend-di-ceilings 20 FAIL lines; check:ipc-contract 0; find-deadcode shows only the pre-existing humble/* and storeExitRefresh.ts findings.
- `pnpm build:sidecar`: build/main/sidecar.js contains no GAMELIB_STEAMFILES_ string.

## Self-Check: PASSED
