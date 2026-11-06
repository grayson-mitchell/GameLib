---
phase: 52-bridge-backed-steamclient-dll-for-steamstub-titles
plan: 05
subsystem: steam-bridge
tags: [objdump, import-scan, pe]
requires: []
provides:
  - "parseImportedDllNames: zero-import DLL heading parser"
  - "scanSteamApiImports follows a bounded same-directory static-import closure"
affects: [shimGenerate]
key-files:
  modified:
    - src/backend/storeManagers/steam/bridge/importParse.ts
    - src/backend/storeManagers/steam/bridge/importScan.ts
    - src/backend/storeManagers/steam/bridge/__tests__/importScan.test.ts
    - src/backend/storeManagers/steam/bridge/__tests__/fixtures/objdumpImports.ts
key-decisions:
  - "Closure tests use real temp dirs with empty files plus a path-keyed spawnAsync mock, not an fs mock"
requirements-completed: [P52-SCOPE-5]
duration: 10min
completed: 2026-10-24
---

# Phase 52 Plan 05: DLL-importer scan closure Summary

`scanSteamApiImports` now walks DLLs imported by the launch exe (same directory only, depth 2, 32-DLL cap), so a Grim Dawn-shaped exe reports x64 and Engine.dll's steam_api64 symbols. The result type is unchanged, so `placeShimForGame` gets the merged result as is.

## Tasks

1. `parseImportedDllNames` and four Grim Dawn-shaped fixtures. Commit: see `git log` (feat(52-05) parseImportedDllNames).
2. Bounded closure. Followed names must have no separators or `..`, must not be system DLLs (`api-ms-*`, `ext-ms-*`), must exist in the exe directory and pass `relative()` containment. Spawns are argv-form. A failing followed DLL is logged and skipped. Arch disagreement returns `CONFLICTING_HEADINGS_ERROR`. One `logInfo` names the contributing DLLs.

## Verification

`npx jest src/backend/storeManagers/steam/bridge`: 14 suites, 406 tests green. Prettier was run on all four files. `tsc` reported no errors in the touched files.

## Deviations from Plan

None. The plan executed as written.

## Self-Check: PASSED
