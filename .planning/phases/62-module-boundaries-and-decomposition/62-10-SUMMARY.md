---
phase: 62-module-boundaries-and-decomposition
plan: 10
subsystem: steam-depot
tags: [refactor, decomposition, dependency-cruiser, depot]
requires: [62-09]
provides:
  - steam/depot/{downloadFiles,finalize,contentServers,outcome,sharedRedist}.ts as pure-move submodules
  - steam/depot/index.ts as the single public entry (depot.ts deleted)
affects: []
key-files:
  created:
    - src/backend/storeManagers/steam/depot/downloadFiles.ts
    - src/backend/storeManagers/steam/depot/finalize.ts
    - src/backend/storeManagers/steam/depot/contentServers.ts
    - src/backend/storeManagers/steam/depot/outcome.ts
    - src/backend/storeManagers/steam/depot/sharedRedist.ts
    - src/backend/storeManagers/steam/depot/index.ts
  modified:
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
  deleted:
    - src/backend/storeManagers/steam/depot.ts
decisions:
  - sharedRedist.ts extracted last (carry-over from 62-09), after downloadFiles and contentServers
  - index.ts is a pure re-export barrel; siblings never import it
metrics:
  tasks: 2
  commits: 6
completed: 2026-11-07
---

# Phase 62 Plan 10: depot fold, second half Summary

depot.ts (2,410 lines at start) was reduced to a pure re-export file by five byte-for-byte moves
(downloadFiles, finalize, contentServers, outcome, plus sharedRedist deferred from 62-09), then
swapped for `steam/depot/index.ts`. `from './depot'` importers now resolve to the directory index
unchanged.

## Commits

- b1b25b2ca extract depot/downloadFiles.ts
- 98e0727d1 extract depot/finalize.ts
- 2f7dfb9f2 extract depot/contentServers.ts
- c8eefceca extract depot/outcome.ts
- 78a97890b extract depot/sharedRedist.ts
- cfc3c34fb swap depot.ts for depot/index.ts

## Verification

- Exported-name set of depot/index.ts equals pre-swap depot.ts: 43 names, sorted diff empty
  (computed with the TypeScript checker's getExportsOfModule, incl. types).
- `grep "from './index'\|from '../depot'"` over steam/depot/ prints nothing.
- known-violations has 0 `no-circular-depot` / `no-depot-parent-back-edge` entries; boundaries
  ratchet 136/65; 9 `launcher-only-via-store-managers-index` entries unchanged.
- codecheck, lint (0 errors), find-deadcode (44/0 OK) green after every commit.
- `pnpm build:sidecar-sea` and `pnpm smoke:sidecar` (real-profile arm) exit 0 after the swap.
- Full jest: only the pre-existing baseline failures (see handback).

## Deviations from Plan

1. [Rule 3] sharedRedist.ts added to this plan (carry-over from 62-09, as the plan's prior notes required).
2. [Rule 1] Source-text census tests followed the code: `readDepotFoldedSources()` lists every new
   module (and `depot/index.ts` instead of `depot.ts`); B6 (selectPrimaryDepotFailure) reads
   `depot/outcome.ts`; the "never RAM-buffers" gate reads `depot/downloadFiles.ts` + `depot/download.ts`;
   the "finalizeToSteam never reads ownerAppId" test reads `depot/finalize.ts` and now asserts
   non-vacuity (it had silently become vacuous once finalize moved).
3. [Rule 1] `steamAuthSessionPolicy.test.ts` Rule E / F allow lists: `depot/outcome.ts` and
   `depot/sharedRedist.ts` added, `depot.ts` removed (it no longer contains the call sites).
4. Non-exported helpers given `export` for cross-module use: `FinalizeDepotEntry`, `getContentServerHosts`.
5. Task 2 plan said `git mv` so history follows; the swap commit also carries the index rewrite, so
   git shows it as delete+add rather than a rename (content changed beyond the similarity threshold).

## Known Stubs

None.

## Self-Check: PASSED

All six new files exist, depot.ts is gone, and the six commit hashes are in git log.
