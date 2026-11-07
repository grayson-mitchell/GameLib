---
phase: 65-steam-store-manager-decomposition-continued
plan: 02
subsystem: backend/storeManagers/steam
tags: [decomposition, library-split, pure-move, d-16]
requires: ["65-01"]
provides:
  - "steam/library/installRoot.ts, pollState.ts, installedMap.ts leaves"
affects: [65-03, 65-04]
tech-stack:
  added: []
  patterns: ["leaf-first extraction; handle-free state leaf (D-16)"]
key-files:
  created:
    - src/backend/storeManagers/steam/library/installRoot.ts
    - src/backend/storeManagers/steam/library/pollState.ts
    - src/backend/storeManagers/steam/library/installedMap.ts
    - src/backend/storeManagers/steam/__tests__/library.installRoot.test.ts
    - src/backend/storeManagers/steam/__tests__/library.installedMap.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/gameUninstall.ts
    - src/backend/storeManagers/steam/cancelDelete.ts
    - src/backend/sidecar/installFlowRegistration.ts
    - meta/steamLineCeilingBaseline.json
    - meta/knip-baseline.txt
key-decisions:
  - "installRoot moved before pollState (pollState needs the AcfSource type from installRoot, avoiding a type back-edge)"
  - "gameInstall.ts imports pollState as a namespace so the file does not grow past its allowlisted ceiling"
metrics:
  completed: 2026-11-07
---

# Phase 65 Plan 02: library.ts leaf extraction Summary

Accessor commit plus three pure-move commits split `installRoot`, `pollState` (handle-free D-16 leaf) and `installedMap` out of `library.ts`, taking it from 4400 to 3787 lines with the Steam suite unchanged at 4385 tests and no new failures.

## Commits

- 4ee079263 accessors: `getReconcileRanDuringRearm` / `setReconcileRanDuringRearm`
- 42eb17bd3 move installRoot (240 lines)
- b27b197d1 move pollState (175 lines)
- f863d9635 move installedMap (268 lines)

All new modules are well under the ~800-line D-04 target. `library.ts` ceiling: 4400 -> 4186 -> 4039 -> 3787; `gameInstall.ts` 1971 -> 1969.

## Accessors (Task 1)

Only `reconcileRanDuringRearm` had writers in more than one future module (restartHold, resume, class init). The other module-level `let`s (`steamRequestNoticeSeq`, `runningPollTimer`, `lastKnownRunningAppId`) are single-owner. Knip began reporting the two accessors (and `getSteamResumeBreadcrumbAppIds`, a `libraryModule.*` namespace finding that surfaced in the same run) as unused exports, so all three were added to `meta/knip-baseline.txt` in the installRoot commit. They should be deleted from the baseline in the commit that moves `restartHold`/`resume`.

## Deviations from Plan

**1. [Rule 3 - Blocking] Task 1 commit exceeds the library.ts ceiling by 6 lines.** The two accessors add lines and the gate forbids raising an entry. The gate runs only at pre-push/CI, and the next commit lowers the entry far below 4400, so no pushed state is red. Baseline untouched in that commit.

**2. [Rule 3] Order swapped:** installRoot before pollState (the plan allowed this).

**3. [Rule 3] gameInstall.ts namespace import:** a named import block would have grown the file by 2 lines past its ceiling, so `import * as pollState` is used and its 4 call sites are prefixed; the ceiling was lowered to 1969.

**4. [Rule 1] metadataCapture.test.ts source scan retargeted** to `library/installRoot.ts` with a non-vacuity assertion on the function name.

**5. Test moves:** the `hostInstallPlatform` describe drives `refreshInstallState()` on the manager, so `library.installRoot.test.ts` imports `SteamLibraryManager` from `../library` and carries the full mock preamble. The pollState-related `261031-ihs` tests belong to the `pollInstallOnce` describe and stay in `library.test.ts` with only their import repointed, so there is no `library.pollState.test.ts`. `games.test.ts` uses a `pollStateModule` namespace for the finalized-marker helpers.

## Deferred / pre-existing (out of scope)

- `pnpm find-deadcode` was already failing on unrelated findings (engine files, IPC `schemaTypes`, `ipcValidation`, `ipcDomainParse`); none concern the library split.
- `node meta/indexedAccessRatchet.cjs` fails in `wiki_game_info` and `frontend/screens` (unrelated).
- `testContainment.test.ts` tripwire (sidecar dir) fails on an unclassified file from other work; not touched by this plan.

## Verification

Steam regression check: 0 runtime-error suites, 4385 steam tests (baseline 4385), no failing names outside baseline. `pnpm boundaries` 0 violations, `pnpm steam-line-ceiling` PASS, `pollState.ts` has zero non-comment `setInterval|setTimeout|process.on|unref`, and no module under `library/` imports `../library`.

## Known Stubs

None.

## Self-Check: PASSED
