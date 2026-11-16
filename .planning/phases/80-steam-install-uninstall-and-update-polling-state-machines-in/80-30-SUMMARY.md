---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 30
subsystem: steam-polls
tags: [steam, rust, deletion, polls]
requires: [80-28, 80-29]
provides: [rust-only poll API modules, per-tick TS files deleted]
affects: [80-31]
key-files:
  deleted:
    - src/backend/storeManagers/steam/library/installPollOnce.ts
    - src/backend/storeManagers/steam/library/updatePollOnce.ts
  modified:
    - src/backend/storeManagers/steam/library/{installPolling,installStop,uninstallPolling,runningPoll,acfState,acfUpdateState,macArch,resumeBreadcrumbs,resume,index,refresh,rustRefresh,pollState}.ts
    - src/backend/storeManagers/steam/{gameInstallBridge,gameUninstall,updateNative,steamLaunchedDeps,macSteamAdoption}.ts
    - src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts
    - src/backend/gamedetails/dispatch.ts
    - src/backend/sidecar/{handlers,steamPollEventRegistration}.ts
    - src/backend/storeManagers/steam/__tests__/library.refresh.test.ts
completed: 2026-11-16
---

# Phase 80 Plan 30: Delete the TS poll logic inside the API modules

The poll API modules keep their paths, export names and parameters but contain only the Rust call; the two per-tick files and the rearm half of resume.ts are gone.

## Commits

- c64398d01: reduce the poll API modules to their rust arm, delete the per-tick files
- deb891707: rust-only ACF/macArch/breadcrumb wrappers, drop the rearm half, move the hold reader

## Pre-deletion grep

Hits were all in this plan's files or plan 31's (steamInstallRuntime/steamProcesses/pollState/restartHold/gameSessionState/bootstrap) plus tests that only name the thin modules (`__tests__/pollsRustBranch.*`, updateNative.test). No test-file hit needed fixing except the one below. Other hits: `games.ts`, `bridgeInstallState.ts`, `installRoot.ts` (comment-only mentions of pollInstallOnce/pollUpdateOnce; the verify grep for those two names is clean across `src meta`), `steamPollEventRegistration.ts` (comment reworded).

## What changed

- installPolling.ts: startInstallPolling / isDelegatedInstallPolling / cancelDelegatedInstall are `invokeSteamPoll` calls. installStop.ts, and uninstallPolling.ts's startUninstallPolling / stopUninstallPolling likewise. pollUninstallOnce is not a tick loop (it is the uninstall completion pipeline called directly by gameInstall/gameUninstall/removeAllCopies) so it stays, minus the TS registry entry read; `UninstallPollDeps` no longer carries `steamInstallRuntime`.
- runningPoll.ts: `readRunningAppId` / `readRunningAppIdOrThrow` / `readMacRunningAppId` are the Rust probe only (the reg.exe, registry.vdf and reaper TS probes are gone).
- acfState.ts has no rmSync; acfUpdateState.ts, macArch.ts (keeps applyMacArchVerdict, macArchCheckNeeded, promptI386Recovery), resumeBreadcrumbs.ts rust-only.
- resume.ts: `rearmPersistedSteamRestartHolds` deleted; index.ts init() rearm block deleted.
- `withoutSteamRestartHolds(deps, installed)` now lives in pollRust/rustSteamPoll.ts; refresh.ts and rustRefresh.ts import it.
- dispatch.ts / handlers.ts drop the `steamInstallRuntime` slice from the game-details deps; steamLaunchedDeps, gameUninstall (noticeSeq), updateNative (pollOwnsUpdate) and gameInstallBridge are rust-only. STEAM_BRIDGE_FINISHING_CONTEXT moved into gameInstallBridge.ts.
- library.refresh.test.ts: the D-UAT-13 hold test fed `holding` through the test runtime transport; the hold read now goes through `deps.requestRustInvoke`, so the fs mock answers `steampoll_status` with `holding`.
- macSteamAdoption.ts: dropped the now-unused `paths` argument to `readMacRunningAppId`.

## Deviations from Plan

1. [Rule 3] `GAMELIB_HANDOFF_STATE_FLAGS` not moved to installedMap.ts: its only consumer was the deleted installPollOnce.ts (the installedMap.ts mention is a comment), so an export there would be a new knip finding. It is deleted with pollState.ts in plan 31.
2. [Rule 3] `createRunningPoll` (the TS running-game poller instance) stays in runningPoll.ts, so `grep setInterval runningPoll.ts` still matches via `deps.clock.setInterval`. Its consumers (steamProcesses.ts, bootstrap.ts start, stdinEofRelease) are plan 31 files and 31 removes `runningPoll`; deleting it here would have broken codecheck. 31 should delete `createRunningPoll` and its `RunningPoll`/`Claim` types with steamProcesses' runningPoll.
3. [Rule 1] removeSteamInstallCopy keeps its cheap NUMERIC_APP_ID check ahead of the Rust call: pollRootsFor can throw for a non-numeric appId before Rust sees it. No deletion code remains in TS.
4. `readRunningAppId`/`readRunningAppIdOrThrow` keep an unused `_platform` parameter and `RunningPollProbeDeps` keeps `runner`/`paths` (D-09: parameters unchanged for callers).

## Gates

- codecheck: pass. prettier on edited paths: pass.
- lint: 1 error, `readSteamRestartHold` unused in steamRestartHold.ts (known, owned by 80-31); no other error.
- test:ci: 13 failing suites, all the known-red list (tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode, shimCoverage, shimGenerate, themeTokens, callbackRegistryHost, gamelibCatalogParity, genI18nGateScope, lintTranslations, steamLineCeiling, x86CallbackWineHarness). No new failures.
- gameinfo-narrowing-ceiling: pass. i18n --fail-on-update: pass.
- backend-di-ceilings: only the three known `GameStatus.*` jestMock growth entries.
- find-deadcode: FAIL with 17 new knip findings, all exports in the four files plan 31 `git rm`s (library/pollState.ts, library/restartHold.ts, steamDownloadProgress.ts, steamRestartHold.ts), dead only because their consumers were deleted here. They disappear with 31's deletion.

## Carry-forwards for 80-31

- Delete `createRunningPoll` + types in runningPoll.ts together with steamProcesses.runningPoll, bootstrap's TS start, and `pollsImpl()` uses still in steamLaunchedDeps-adjacent code (bootstrap, gameSessionState).
- Remaining `pollsImpl` importers after this plan: bootstrap.ts, gameSessionState.ts, library/restartHold.ts, pollsFlag.ts, the pollsRustBranch tests.
- `steampoll_status` is still invoked with `[{}]` (invokeSteamPoll always wraps the args object); tidy to `[]` against the empty-tuple schema in 31.
- Plan 31's file list expects `library.installPollOnce.test.ts` etc.; they no longer exist in the tree (retired by 28/29), so those entries are no-ops.

## Self-Check: PASSED
