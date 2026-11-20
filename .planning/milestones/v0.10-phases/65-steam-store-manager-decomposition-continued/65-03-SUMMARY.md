---
phase: 65-steam-store-manager-decomposition-continued
plan: 03
subsystem: backend/storeManagers/steam
tags: [decomposition, library-split, pure-move]
requires: ["65-02"]
provides:
  - "steam/library/acfState.ts, macArch.ts, resumeBreadcrumbs.ts, restartHold.ts"
affects: [65-04, 65-05]
tech-stack:
  added: []
  patterns: ["one module per pure-move commit; describes move with their code"]
key-files:
  created:
    - src/backend/storeManagers/steam/library/acfState.ts
    - src/backend/storeManagers/steam/library/macArch.ts
    - src/backend/storeManagers/steam/library/resumeBreadcrumbs.ts
    - src/backend/storeManagers/steam/library/restartHold.ts
    - src/backend/storeManagers/steam/__tests__/library.acfState.test.ts
    - src/backend/storeManagers/steam/__tests__/library.macArch.test.ts
    - src/backend/storeManagers/steam/__tests__/library.resumeBreadcrumbs.test.ts
    - src/backend/storeManagers/steam/__tests__/library.restartHold.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/cancelDelete.ts
    - src/backend/storeManagers/steam/removeAllCopies.ts
    - meta/steamLineCeilingBaseline.json
    - meta/knip-baseline.txt
key-decisions:
  - "isHoldingForSteamRestart stays module-private in restartHold.ts (only caller is withoutSteamRestartHolds); exporting it would be a new knip finding"
  - "breadcrumbAppIsFullyInstalledOnDisk exported (init() in library.ts is a cross-module caller)"
metrics:
  completed: 2026-11-07
---

# Phase 65 Plan 03: acfState / macArch / resumeBreadcrumbs / restartHold Summary

Four more clusters extracted from `library.ts` (3787 -> 2810 lines) as one pure-move commit each, with the Steam suite unchanged at 4385 tests and no failing name outside the baseline.

## Commits

- 5bcac34e8 acfState (438 lines)
- 7d918b39a macArch (209 lines)
- e601dd7dd resumeBreadcrumbs (182 lines)
- 259efe6fc restartHold (195 lines)

`library.ts` ceiling: 3787 -> 3359 -> 3156 -> 2985 -> 2810. `gameInstall.ts` 1969 -> 1968 -> 1966.

## readAcfState spy-flip audit (games.test.ts)

All ten sites (~L8807, 9825, 10342, 10828, 10862, 10899, 10945, 10973, 11004, 11270) were repointed from `libraryModule` to `acfState`. None of them runs a real `pollInstallOnce`/`pollUninstallOnce` (the poller entry points are spied or not reached; install/uninstall flows live in gameInstall/gameUninstall, which imported `readAcfState` by name before and still do), so the verdict for every site is **unchanged**: no new failing test names, same count. Spies on `removeSteamInstallCopy`, `enumerateSteamInstallCopies`, `findOtherManifestsWithInstalldir` (removeCopies/games/cancelDelete tests) were repointed the same way. `games.test.ts` `libraryModule.scanDownloadingAppIds` and `promptI386Recovery` calls now go through `acfState` / `macArch` namespaces.

## Deviations from Plan

**1. [Rule 3] machOArchsOf/verdictFromArchs facade:** `export { machOArchsOf, verdictFromArchs }` re-exported names defined in `backend/utils/macArch`; dropped in the macArch commit and the moved tests import from `backend/utils/macArch` (62 D-05).

**2. [Rule 3] gameInstall.ts namespace import:** the 3-name resumeBreadcrumbs import would have pushed it past its ceiling; imported as `* as resumeBreadcrumbs` (as in 65-02).

**3. [Rule 1] Stray comment fix:** the resumeBreadcrumbs commit left a section-comment line orphaned in library.test.ts; moved to the new test file in the restartHold commit.

**4. isHoldingForSteamRestart not exported** (see key-decisions); the plan's artifact list names it as an export, but knip would flag it.

**5. Test split:** only the `markSteamInstallIncomplete()` describe is a top-level breadcrumb describe; the refresh()-driven breadcrumb tests live inside `SteamLibraryManager` and stay. The "D-UAT-13 hold persists" describes (persist/clear, init() re-arm) stay in `library.test.ts` because they drive `rearmPersistedSteamRestartHolds`, which moves to `resume.ts` in 65-04.

## Knip baseline

Removed the 65-02 temporary lines for `getReconcileRanDuringRearm`, `setReconcileRanDuringRearm` and `getSteamResumeBreadcrumbAppIds` (now imported cross-module).

## Deferred / pre-existing (out of scope)

`pnpm find-deadcode` still reports unrelated engine/IPC baseline drift; `indexedAccessRatchet` and the sidecar `testContainment` tripwire fail on unrelated files. No library-split findings.

## Verification

Steam regression check: 0 runtime-error suites, 4385 tests (baseline 4385), no new failures. `pnpm codecheck` clean, `pnpm boundaries` 0 violations, `pnpm steam-line-ceiling` PASS, `-t unref` tests pass, no `../library` import inside `library/`, no `export ... from` in library.ts, `pendingSteamHoldRearm`/`reconcileRanDuringRearm` defined only in `restartHold.ts`.

## Known Stubs

None.

## Self-Check: PASSED
