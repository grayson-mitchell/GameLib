---
phase: 62-module-boundaries-and-decomposition
plan: 09
subsystem: steam-depot
tags: [refactor, decomposition, dependency-cruiser, depot]
requires: [62-08]
provides:
  - steam/depot/planModel.ts, plan.ts, machO.ts, download.ts as pure-move submodules
  - zero depot back-edges / depot cycles in the depcruise baseline
affects: [62-10]
key-files:
  created:
    - src/backend/storeManagers/steam/depot/planModel.ts
    - src/backend/storeManagers/steam/depot/plan.ts
    - src/backend/storeManagers/steam/depot/machO.ts
    - src/backend/storeManagers/steam/depot/download.ts
  modified:
    - src/backend/storeManagers/steam/depot.ts
    - src/backend/storeManagers/steam/depot/reconcile.ts
    - src/backend/storeManagers/steam/depot/pathCollisions.ts
    - src/backend/storeManagers/steam/depot/flagsCensus.ts
    - src/backend/storeManagers/steam/__tests__/depot.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - .dependency-cruiser-known-violations.json
decisions:
  - sharedRedist.ts deferred to 62-10 (depends on downloadDepotFiles and getContentServerHosts, still in depot.ts)
  - RawContentServer relocated into planModel (type needed by SteamUserDepotExtras)
metrics:
  tasks: 2
  commits: 6
completed: 2026-11-07
---

# Phase 62 Plan 09: depot.ts fold, first half Summary

Four of the five planned seams (planModel, plan, machO, download) moved byte-for-byte out of
`steam/depot.ts` into `steam/depot/`, the three D-08 back-edges repointed to their owning
submodules, and the depcruise baseline shrunk to zero depot violations. depot.ts is 4,598 -> 2,410 lines.

## Commits

- 9bb2dd927 extract depot/planModel.ts
- 99148bd2f repoint flagsCensus/pathCollisions/reconcile model imports to planModel
- 6ef53bc77 extract depot/plan.ts (baseline 16 -> 11)
- 81d453228 extract depot/machO.ts
- 17c112901 extract depot/download.ts
- 01023aff2 repoint reconcile.ts to ./download (baseline 11 -> 9; back-edge 3 -> 0, circular-depot 4 -> 0)

## Deviations from Plan

1. [Rule 3 - ordering] sharedRedist.ts NOT extracted. `downloadSharedRedistDepotsLeased` calls
   `downloadDepotFiles` and `getContentServerHosts`, which live in the 62-10 regions
   (downloadFiles, contentServers). Extracting it now would import `../depot` (a new back-edge and
   cycle, which the shrink-only baseline cannot absorb). It should be extracted in 62-10 after
   downloadFiles and contentServers land. Consequence: the acceptance check `depot.ts < 2,000 lines`
   is not met (2,410).
2. [Rule 3] `RawContentServer` (+ doc comment) was relocated inside depot.ts into the planModel
   region before the move, because `SteamUserDepotExtras.getContentServers` references it. 62-10's
   contentServers module should import it from `./planModel`. depot.ts still re-exports it.
3. [Rule 3] machO extracted before download (downloadSingleFile calls applyMachOExecutableFallback).
4. [Rule 3] The planModel-only back-edge repoints (flagsCensus, pathCollisions, reconcile types) were
   committed before plan.ts, otherwise the move routed the pathCollisions<->depot cycle through
   plan.ts as a new unbaselined cycle path. The reconcile sha1File/resolveContainedPath repoint
   followed download.ts as planned.
5. [Rule 1] Tests that read depot.ts text: `depot.test.ts` canWriteFullOwnership census now reads
   `depot/download.ts`; two negative censuses (skippedDepots, StateFlags "4") read depot.ts plus the
   folded submodules via `readDepotFoldedSources()`. `steamAuthSessionPolicy.test.ts` Rule E allow
   list gained `depot/plan.ts` (the acquireAuthenticated site moved there).
   62-10 should add its new modules to `readDepotFoldedSources()`.

Non-exported helpers given `export` (listed per commit message): NUMERIC_ID, DepotModeCounters,
DepotPlanEntry, AppCommonName, ContentManifestModule, SteamUserDepotClient; assertNumericAppId,
throwIfAborted, getDepotClient, withPlanBuildRetry, fetchAppInfo, loadContentManifestParser,
fetchDepotPlanEntry; applyMachOExecutableFallback; FILE_CONCURRENCY, TARGET_INFLIGHT_CHUNKS,
PROGRESS_THROTTLE_MS, PROGRESS_THROTTLE_PERCENT, PROGRESS_HEARTBEAT_MS, DownloadDepotFilesOpts,
DepotDownloadResult, downloadSingleFile, applyEDepotFileModes.

## Verification

codecheck, lint, boundaries (ratchet 136/65), find-deadcode all green after each commit. Full jest
shows only the pre-existing baseline failures (see handback).

## Self-Check: PASSED

All four new modules exist; all six commit hashes present in git log.
