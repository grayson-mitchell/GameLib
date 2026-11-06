---
phase: 59-steam-engine-fallback-when-crossover-is-unavailable
plan: 03
subsystem: steam-engine
tags: [fallback-engine, sha256-pin, download, engine-override]
requires: []
provides:
  - ENGINE_PINS (current/previous), pinById, pinnedEngineIds
  - parseEngineOverride closed grammar
  - ensurePinnedEngine / isPinnedEngineInstalled / pruneUnpinnedEngines
  - GameSettings.steamEngineOverride
affects: [59-05, 59-07]
tech-stack:
  added: []
  patterns: [single-flight in-flight map, mkdtemp then rename, lstat symlink containment via path.relative]
key-files:
  created:
    - src/backend/storeManagers/steam/engine/enginePins.ts
    - src/backend/storeManagers/steam/engine/engineIds.ts
    - src/backend/storeManagers/steam/engine/fallbackEngine.ts
    - src/backend/storeManagers/steam/engine/__tests__/engineIds.test.ts
    - src/backend/storeManagers/steam/engine/__tests__/fallbackEngine.test.ts
  modified:
    - src/common/types.ts
key-decisions:
  - "previous pin is null: no earlier release shipped a pin; next bump moves current into previous"
  - "Prune only runs after a successful ensure of a real ENGINE_PINS pin (identity check), never at load"
requirements-completed: [D-05, D-08, D-14]
duration: 15min
completed: 2026-11-01
---

# Phase 59 Plan 03: Pinned fallback engine Summary

Wine-Staging 11.20 + DXVK-macOS 1.10.3 pinned by size and sha256 in source, fetched only on demand with streaming hash verification, extracted in a temp dir with symlink containment checks and renamed into place; override ids parse through a closed grammar.

## Commits
- f434aef04: pin table, id grammar, steamEngineOverride field
- 0e0f44426: fallbackEngine download/verify/extract/retention

## Verification
- Pin URLs, sizes and the wine sha256 digest confirmed against the GitHub API. The DXVK asset reports no digest (null) so its sha256 comes from RESEARCH only; sizes match.
- engineIds, fallbackEngine and fakeHomeIsolation tests pass (25 tests); `pnpm codecheck` passes; prettier clean.

## Deviations from Plan
None. Note: the fallbackEngine test fakes `backend/utils` (downloadFile, calculateEta) and substitutes an equivalent `tar -xf --strip-components` for extractFiles, because importing the real utils pulls Electron transitively.

## Known Stubs
None.

## Self-Check: PASSED
