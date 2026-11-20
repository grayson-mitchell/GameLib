---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 31
subsystem: steam-polls
tags: [steam, rust, deletion, polls, flag]
requires: [80-30]
provides: [no TS poll registries, no polls flag on either side]
affects: [80-32, 80-33]
key-files:
  deleted:
    - src/backend/storeManagers/steam/library/{pollState,restartHold,pollsFlag}.ts
    - src/backend/storeManagers/steam/{steamDownloadMonitor,steamDownloadProgress,steamRestartHold,childWatchdog}.ts
  modified:
    - src/backend/storeManagers/steam/{steamProcesses,steamInstallRuntime,stores,gameSessionState,updateNative}.ts
    - src/backend/storeManagers/steam/library/{runningPoll,refresh,installPolling,index}.ts
    - src/backend/storeManagers/steam/pollRust/rustSteamPoll.ts
    - src/backend/sidecar/{bootstrap,stdinEofRelease}.ts
    - src/backend/testUtils/testServices.ts
    - src-tauri/src/{steampoll_dispatch,main}.rs
completed: 2026-11-16
---

# Phase 80 Plan 31: Delete the TS registries and the polls flag

The sidecar holds no poll state, poll children or poll flag; the Rust polls are the only implementation and `steampoll_boot` always runs.

## Commits

- 74f4b0512: delete the TS registries, helper modules and the TS side of the polls flag
- 0133f144b: delete the polls flag in the shell (PollsImpl, DEFAULT_POLLS_IMPL, polls_impl, polls_impl_from and their test)

## Pre-deletion grep

Every hit was in this plan's file list, a 80-30 comment-only mention, or a test that stubbed the removed fields (hit list: registeredStores.json, storeKinds.test, diPhaseGates.test, stdinEofRelease(+test), bootstrap, steamProcesses, steamInstallRuntime, stores, testServices, gameSessionState, refresh, the six `library.*` test mocks, pollsRustBranch.install/uninstallRunning, plus the deleted modules). No non-poll production importer of any deleted module existed, so all six modules are gone. Post-deletion grep over `src meta src-tauri/src` for every deleted name and for `GAMELIB_STEAM_POLLS|pollsImpl|PollsImpl` is empty.

## What changed

- steamProcesses.ts keeps only `macSteam` and `drm`; `runningPoll`, `downloadMonitor` are gone with their testServices fakes. `createRunningPoll`, `RunningPoll`, `Claim` deleted from runningPoll.ts (80-30 carry-forward).
- steamInstallRuntime.ts drops `polls`, `uninstallPolls`, `restartHold`; stores.ts drops the `steam_restart_hold` CacheStore (Rust sole writer, T-80-85); storeKinds.test and registeredStores.json lose the row.
- bootstrap.ts: the `steam-running-poll` boot step is removed entirely (it only started the TS poller), and stdinEofRelease.ts drops the two monitor/poller stop callbacks; its test and bootSourceShape.test follow. The ceiling shard `sidecar-tests-stdinEof.json` stays at 1 (same single jest.mock).
- gameSessionState.ts always pushes the native in-flight mirror; refresh.ts uses only the Rust status.
- `invokeSteamPoll` takes optional args; `steampoll_status` now goes as `[]` (empty-tuple schema), tests updated.
- diPhaseGates OWNED_66_4 loses the two entries; the list holds exactly 80, so the >=80 floor still passes.
- Tests: the restart-hold bookkeeping test in steamInstallRuntime.test was removed (covered by pollsRustBranch.status via `withoutSteamRestartHolds`, rewritten to call the free function).

## Gates

- codecheck: pass. prettier on touched TS/JSON: pass. rustfmt on steampoll_dispatch.rs: clean (main.rs has pre-existing fmt drift elsewhere, my edit is one comment line).
- **pnpm lint: 0 errors** (958 warnings, all pre-existing categories).
- **pnpm find-deadcode: PASS** (339 baselined, no new findings; the 17 from 80-30 are gone).
- backend-di-ceilings: only the three known `GameStatus.*` jestMock growth entries. gameinfo-narrowing-ceiling: pass. i18n --fail-on-update: pass.
- test:ci: 13 failing suites, exactly the known-red list (tauriShellSource, flowRegistrationCensus, ipcDomainCensus, epicOfflineMode, shimCoverage, shimGenerate, themeTokens, callbackRegistryHost, gamelibCatalogParity, genI18nGateScope, lintTranslations, steamLineCeiling, x86CallbackWineHarness). No new failures.
- cargo build: pass. `cargo test --bin gamelib-shell`: 466 passed, 0 failed, 2 ignored. `cargo clippy --workspace -- -D warnings`: fails with 14 errors, all in files this plan did not touch (store_embed/state.rs, login_window/*, native_gamepad_shape.rs, shell_state.rs); none in steampoll_*. Not chased.

## Deviations from Plan

1. [Rule 3] Task 1's commit also carries the TS half of task 2 (pollsFlag.ts removal, gameSessionState/refresh/bootstrap flag checks): the deleted modules' consumers could not compile otherwise. Task 2's commit is the Rust half.
2. [Rule 3] The `steam-running-poll` boot step was deleted rather than emptied (and removed from the boot-order list and bootSourceShape.test).
3. Plan file-list entries that no longer exist (`library.installPollOnce.test.ts`, `library.restartHold.test.ts`, `library.uninstallPolling/installPolling.test.ts`, `library.resume.test.ts` if absent) were no-ops.

## Carry-forwards for 80-32/80-33

- Post-deletion live smoke (T-80-84) is plan 33's job; there is no fallback now.
- Doc mentions of the `steam-running-poll` step remain in `src/backend/process/README.md` (historical D-66.3-07 note) and `GAMELIB_STEAM_POLLS` is gone from code; any `.planning` docs still naming the flag are historical.
- Rust clippy baseline is red for unrelated files; keep it out of phase 80 gates.

## Self-Check: PASSED
