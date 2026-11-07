---
phase: 65-steam-store-manager-decomposition-continued
plan: 04
subsystem: backend/storeManagers/steam
tags: [decomposition, library-split, pure-move]
requires: ["65-03"]
provides:
  - "steam/library/installStop.ts, installPollOnce.ts, installPolling.ts, resume.ts"
affects: [65-05]
tech-stack:
  added: []
  patterns: ["one module per pure-move commit; describes move with their code; leaf module to break an import cycle"]
key-files:
  created:
    - src/backend/storeManagers/steam/library/installStop.ts
    - src/backend/storeManagers/steam/library/installPollOnce.ts
    - src/backend/storeManagers/steam/library/installPolling.ts
    - src/backend/storeManagers/steam/library/resume.ts
    - src/backend/storeManagers/steam/__tests__/library.installPollOnce.test.ts
    - src/backend/storeManagers/steam/__tests__/library.installPolling.test.ts
    - src/backend/storeManagers/steam/__tests__/library.resume.test.ts
  modified:
    - src/backend/storeManagers/steam/library.ts
    - src/backend/storeManagers/steam/gameInstall.ts
    - src/backend/storeManagers/steam/games.ts
    - src/backend/gamedetails/dispatch.ts
    - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
    - src/backend/storeManagers/steam/__tests__/library.test.ts
    - src/backend/storeManagers/steam/__tests__/library.restartHold.test.ts
    - src/backend/storeManagers/steam/__tests__/library.macArch.test.ts
    - src/backend/storeManagers/steam/__tests__/games.test.ts
    - src/backend/storeManagers/steam/__tests__/steamDepotSkipCopyCensus.test.ts
    - meta/steamLineCeilingBaseline.json
key-decisions:
  - "stopInstallPolling lives in a new leaf library/installStop.ts (user-approved) so installPollOnce and installPolling do not import each other"
  - "Timer, setInterval, activePolls.set and timer.unref stay together in installPolling.ts (D-10, D-16)"
metrics:
  completed: 2026-11-08
---

# Phase 65 Plan 04: installStop / installPollOnce / installPolling / resume Summary

`library.ts` shrank 2810 -> 1506 lines across four pure-move commits; Steam suite unchanged (4385 steam tests, no failing name outside the baseline, 0 runtime-error suites), boundaries at zero.

## Commits

- a22f2c0d1 installStop (approved extra leaf, 29 lines)
- 6d11e58c4 installPollOnce (473 lines)
- ecd5c98d1 installPolling (455 lines)
- d89f03df1 resume (416 lines)

`library.ts` ceiling: 2810 -> 2793 -> 2341 -> 1902 -> 1506. `gameInstall.ts` 1966 -> 1963 -> 1959. library.ts is now the class plus the uninstall/running poll clusters (65-05).

## Deviations from Plan

**1. [Approved decision - extra artifact] installStop.ts leaf.** `pollInstallOnce` calls `stopInstallPolling` at three sites while installPolling must import pollInstallOnce, which would have been a cycle. User decided on a new leaf `library/installStop.ts` holding only `stopInstallPolling` (deps: pollState `activePolls`, steamRestartHold `clearSteamRestartHold`, steamDownloadMonitor `stopSteamDownloadMonitor`, logInfo), moved first in its own commit. Extra files_modified entries: `installStop.ts`, `library.macArch.test.ts`, `library.restartHold.test.ts`, `steamDepotSkipCopyCensus.test.ts`. No line-ceiling baseline entry needed (under 1000). `cancelDelegatedInstall` stays in installPolling.ts.

**2. [Rule 3] steamDepotSkipCopyCensus.test.ts.** It source-greps `library.ts` for the literal key `steam.download.notify.depotSkipped`, which moved with pollInstallOnce; the path constant now points at `library/installPollOnce.ts` (commit 6d11e58c4).

**3. [Rule 3] gameInstall.ts ceiling.** The split import of `resumeInterruptedSteamInstall` (separate module) added a line and tripped the ceiling; imported `resume` as a namespace and converted the `macSteamAdoption` import to a namespace (`adoption.*`, 5 call sites; the existing `jest.mock('../macSteamAdoption')` still applies). Net 1963 -> 1959.

**4. [Rule 3] Unref tests.** The install-poll unref contract is covered by the moved tests in library.installPolling.test.ts (`npx jest -t unref` green, 9 tests); the remaining `setInterval` spies in library.test.ts concern init/uninstall/running pollers and stay for 65-05.

## Spy-direction audit (games.test.ts)

Repointed `startInstallPolling` (all sites) and `cancelDelegatedInstall` spies to `installPolling`, `resumeInterruptedSteamInstall` to `resume`, and `stopInstallPolling` to `installStop`. Each spied function is called by gameInstall.ts/games.ts via a named import now resolved in the owning module, so the spy still intercepts. A spy on `installPolling.startInstallPolling` additionally intercepts the call from `resume.ts`, but the only test that reaches resume (L~4285) spies `resume.resumeInterruptedSteamInstall` as a mock, so verdicts are unchanged: no new failing names, same count.

## Known Stubs

None.

## Pre-existing, out of scope

`pnpm find-deadcode` reports baseline drift in engine/IPC files unrelated to these modules; no finding mentions the new modules.

## Self-Check: PASSED

Created files exist; commits a22f2c0d1, 6d11e58c4, ecd5c98d1, d89f03df1 present.
