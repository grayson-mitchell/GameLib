---
phase: 70-split-gameinfo-into-shared-and-per-store-shapes
plan: 03
subsystem: tooling
tags: [gameinfo, flip-probe, typescript-compiler-api]
requires: [70-01]
provides:
  - meta/gameInfoFlipProbe.cjs (applyFlip, parseArgs, classify, runProbe, CLI)
  - package.json script gameinfo-flip-probe (removed in 70-11)
affects: [70-04, 70-05, 70-06, 70-07, 70-08, 70-09, 70-10, 70-11]
key-files:
  created:
    - meta/gameInfoFlipProbe.cjs
    - meta/__tests__/gameInfoFlipProbe.test.ts
  modified:
    - package.json
key-decisions:
  - "Probe is in-process and read-only: CompilerHost serves a flipped src/common/types.ts from memory; no fs write or child process"
requirements-completed: []
completed: 2026-11-14
---

# Phase 70 Plan 03: GameInfo flip probe Summary

Read-only TypeScript-compiler-API probe that type-checks the repo as if `GameInfo` were the union and the nested store keys were gone, with per-file error counts and an `--only`/`--non-test` exit gate. Run takes about 11 s.

## Measured inventory (real tree, `node meta/gameInfoFlipProbe.cjs --json`)

Bucket totals (error lines): storeManagers non-test 80, storeManagers test 51, outside non-test 42, outside test 1. Global (file-less) diagnostics: 0. Total 174.

Files: 16 SM non-test, 19 outside-SM non-test, 10 test. This matches RESEARCH exactly (16 / 19 / 10); no deltas.

| Owner | File (errors) |
| ----- | ------------- |
| 70-04 | steam/cancelDelete.ts (4), gameInstall.ts (2), gameMetadata.ts (3), games.ts (2), library/index.ts (1), library/refresh.ts (4), library/resume.ts (2), library/resumeBreadcrumbs.ts (14), queueHeadRevalidation.ts (1) |
| 70-05 | gog/games.ts (14), gog/library.ts (16), gog/setup.ts (4), sideload/library.ts (3) |
| 70-06 | legendary/games.ts (5), legendary/setup.ts (4), storeManagerCommon/games.ts (1) |
| 70-07 | backend/downloadmanager/downloadqueue.ts (2), launcher.ts (1), macArch/recovery.ts (1), save_sync.ts (2), frontend/hooks/hasAnticheatInfo.ts (2), hasStatus.ts (6) |
| 70-08 | Game/GamePage/components/AppleWikiInfo.tsx (1), DownloadSizeInfo.tsx (1), InstalledInfo.tsx (1), MainButton.tsx (2), GamePage/index.tsx (2), GameSubMenu/index.tsx (1), ModifyInstallModal/GOG/index.tsx (11), TimeContainer/index.tsx (2) |
| 70-09 | Library/components/GameCard/index.tsx (3), InstallModal/index.tsx (1), InstallModal/ThirdPartyDialog/index.tsx (1), filterEngine.ts (1), librarySort.ts (1) |
| 70-11 (tests) | gog/__tests__/library.test.ts (6), legendary/__tests__/getGameInfoForceReloadStaleness.test.ts (2), steam/__tests__/games.test.ts (23), library.installPollOnce (4), library.refresh (3), library.resumeBreadcrumbs (5), library.test (4), staleQueueHeadCancel.regression (2), steam/localFiles/__tests__/libraryReplay.test.ts (2), frontend Library/__tests__/filterEngine.test.ts (1) |

UNOWNED non-test files: none. Nothing to absorb into 70-07 beyond its own area, and no 70-07b gap plan is needed.

## Verification

jest 7 pass; `tsc -p tsconfig.meta.json` clean; `pnpm find-deadcode` PASS; prettier clean on the three written source paths; `grep -cE "writeFileSync|spawn|execSync|execFile"` on the probe = 0; `git status --porcelain src/common/types.ts` empty after the run. Did not run full `pnpm lint` or `pnpm codecheck`.

## Commits

- 066b7ae7a feat(70-03): add read-only GameInfo flip probe (probe, test, script)

## Deviations from Plan

None. Task 2 wrote no source file.

## Known Stubs

None.

## Self-Check: PASSED
