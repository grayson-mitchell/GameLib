---
phase: 80-steam-install-uninstall-and-update-polling-state-machines-in
plan: 28
subsystem: testing
tags: [steam, jest, cargo, rust-migration, test-retarget]
requires:
  - phase: 80-27
    provides: delete gate met, polls default to rust
provides:
  - steam __tests__ tree with no dependency on the TS poll loops, helpers or the polls flag
  - steampoll-aware test doubles (mockedFsSteamFiles, fsBackedSteamFiles, host double)
  - real-process watchdog cases and literal contract asserts in gamelib-steampoll
affects: [80-29, 80-30, 80-31]
tech-stack:
  added: []
  patterns: [fake requestRustInvoke answering steampoll channels, empty steampoll_status default]
key-files:
  created: [src/backend/testUtils/steamPollStatusFake.ts]
  modified:
    - src/backend/testUtils/testHostServices.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/mockedFsSteamFiles.ts
    - src/backend/storeManagers/steam/localFiles/__tests__/fixtures/stubRustSteamFiles.ts
    - meta/backendDiCeilings/storeManagers.steam.json
    - src-tauri/crates/gamelib-steampoll/tests/monitor.rs
    - src-tauri/crates/gamelib-steampoll/tests/contracts.rs
key-decisions:
  - "Ported subjects are deleted whole; stays-TS cases keep running on the rust arm over a fake requestRustInvoke"
  - "The depot-skip census reads effects.rs, where the literal key lives (install_once.rs only calls it)"
requirements-completed: [P80-gate, P80-parity]
duration: long
completed: 2026-11-16
---

# Phase 80 Plan 28: Steam test tree off the TS poll code

The steam `__tests__` tree no longer imports or reads the TS poll loops, helpers, `pollsFlag` or `GAMELIB_STEAM_POLLS`; coverage lives in cargo (per the 80-04..80-16 mapping tables) and the retargeted rust-arm tests.

## Inventory grep (task 1)

Run before any edit. Hits by owner (production hits are plans 30-31; the rest is here or plan 29):

- Plan 29 (outside steam `__tests__`, TS harness and sidecar): `src/backend/__tests__/steamPollTsDriver.test.ts`, `steamPollParity.test.ts`, `steamPollProfileFixtures.test.ts`, `diPhaseGates.test.ts`, `sidecar/__tests__/skeletonFlows.test.ts`, `gameDetailsFlows.test.ts`, `bootstrap.test.ts`, `src/backend/testUtils/testServices.ts`, `testUtils/steamPollReplay/timeline.ts`, `tsDriver.ts`, `steam/localFiles/__tests__/acfUpdateReplay.test.ts`, `adoptionReplay.test.ts`, `libraryReplay.test.ts`, `steam/depotRust/__tests__/rustSecondary.test.ts`.
- Plans 30-31 (production): `gamedetails/dispatch.ts`, `sidecar/bootstrap.ts`, `steamPollEventRegistration.ts`, `stdinEofRelease.ts`, `steam/gameUninstall.ts`, `steamLaunchedDeps.ts`, `steamProcesses.ts`, `steamInstallRuntime.ts`, `gameInstallBridge.ts`, `steamDownloadProgress.ts`, `stores.ts`, `steamDownloadMonitor.ts`, `updateNative.ts`, `gameSessionState.ts`, `library/{refresh,macArch,pollsFlag,pollState,resumeBreadcrumbs,rustRefresh,installRoot,acfState,resume,restartHold,installPolling,uninstallPolling,installPollOnce,installStop,updatePollOnce,acfUpdateState,runningPoll,index}.ts`, plus the Rust crate sources and `src-tauri/src/{steampoll_dispatch,main}.rs`.
- This plan (steam `__tests__`, 41 files): handled below. Not in the plan's file list and handled here: `games.test.ts` (80-26 pin, 100+ cases failing without it), `library.updates.test.ts` (mock only, left), `steamInstallRuntime.test.ts`, `library.installRoot/installedMap/macSteamRefresh/refresh.rust/rustRefresh/test`, `steamStartupKeyringDeferral`, `updateNative`, `updateDetection*`.

Remaining `.polls.` / `uninstallPolls` / `downloadMonitor` mentions in `pollsRustBranch.install`, `pollsRustBranch.uninstallRunning`, `steamInstallRuntime` and `games.test.ts` read production state objects that plan 31 removes together with the store (`library.updates.test.ts` mocks `rearmPersistedSteamRestartHolds` on `../library/resume`; plan 30 owns that module). They do not import a deleted module.

## Per file (task 1 and 2)

Deleted whole (subject is a TS loop/helper, mapped to cargo): `library.installPollOnce` (58 cases), `library.updatePollOnce` (26), `library.uninstallPolling` (24), `library.installPolling` (27), `library.runningPoll` (35), `library.restartHold` (19), `library.resume` (18), `library.acfState` (36; the readers are covered by `pollsRustBranch.acf`), `steamRestartHold` (9), `steamDownloadMonitor` (11), `steamDownloadProgress` (17), `childWatchdog` (7).

Edited (pin removed, cases deleted / kept):

| File | Deleted | Kept |
| --- | --- | --- |
| removeCopies | enumerate (3), 10 remove-guard cases, containment describe (4), manifestOnly/native/bottle bottle cases (3), pollUninstallOnce routing case (all ported, 80-05 table) | host gate (8), non-numeric, 3 bridge-bottle cases retargeted to a scripted `steampoll_acf_remove_copy`, 5 auto-cleanup cases retargeted, removeAll (8), IPC census |
| library.macArch | machOArchsOfAsync (3), verdictFromArchs (5), locateMachOBinary (6), locate-nothing, E1/E2/E4 (poll wiring, 80-10 table) | apply/persist/report/dialog/CR-01 cases and E3, verdict scripted on the rust invoke from the existing lipo probe |
| library.resumeBreadcrumbs | breadcrumbAppIsFullyInstalledOnDisk ts-arm describe (5) | 4 |
| library.installedMap | readAcfState case (1) | 20 |
| updateDetection.acf | readAcfUpdateFieldsFromDir steamfiles describe (3) | 5 (fixture read case retargeted on `fsBackedSteamFiles`) |
| library.refresh | none (hold case retargeted to a scripted `holding[]`) | 43 |
| steamInstallRuntime | none (hold case retargeted) | 6 |
| pollsRustBranch.* | `pollsImpl` flag and shell-default cases, every `ts:` case (7) | 37 |
| games.test | none (pin removed; marker tests read the recorded `steampoll_bridge_finalized` calls) | 684 |
| all other pinned files | pin only (acfInstalldir, acfInstalledDepots, runningFromFolder, macArchKnownFix, macArchKnownFixRouting, library.test, library.installRoot, macSteamRefresh, refresh.rust, rustRefresh, steamStartupKeyringDeferral, updateDetection, updateDetection.exit, updateNative, library.updates) | all |

DI ceiling shard: removed `acfState`, `installPollOnce`, `installPolling`, `restartHold`, `resume`, `runningPoll`, `uninstallPolling`, `updatePollOnce`, `steamDownloadMonitor`; `removeCopies` 25 -> 24. `pnpm backend-di-ceilings` shows only the known-red `steamPoll*` and `GameStatus.*` entries.

## Cargo mapping for the two deleted unit-test files

`steamDownloadProgress.test.ts`: every case already has a counterpart in `tests/progress.rs` (parse lines, nettop rows, accumulator, tracker, `live_progress` percent/cap/floor/no-total, `window_rate`); nothing to add.

`childWatchdog.test.ts`: `buildWatchdogSpawn` -> `watchdog_script_and_argv_shape_are_pinned`; four real-process cases -> `watchdog_real::{removes_the_tree_within_5s_of_the_parent_dying, still_kills_the_grandchild_when_the_middle_process_dies_first, removes_the_tree_within_2s_of_a_clean_sigterm, exits_the_tree_when_the_watched_pid_exits}` (cfg(unix), cleared env, sleep processes); the two live script/nettop cases (opt-in, not a CI gate) -> `stop_kills_a_real_child` (macOS).

`contracts.rs` `constants_match_pollstate_ts` -> `poll_constants_hold_their_pinned_values` (literals); `monitor.rs` `watchdog_literal_matches_childwatchdog_ts` is replaced by the literal pin above.

## Deviations from Plan

1. **[Rule 1] Census target.** The plan pointed the depot-skip census at `install_once.rs`; the literal key `steam.download.notify.depotSkipped` lives in `effects.rs`, so `POLL_SOURCE_PATH` reads that file (the describe title names both).
2. **[Rule 3] Unowned pinned file.** `games.test.ts` carried an 80-26 pin and was in no plan list; its pin is removed and the failures it uncovered are fixed here.
3. **[Rule 3] knip.** Deleting the tests left four exports unused (`WATCHDOG_SH`, `DEFAULT_POLLS_IMPL`, `locateMachOBinary`, `readSteamRestartHold`); de-exported (the files go in plans 30-31).
4. **Test doubles.** `createTestHostServices` now answers an empty `steampoll_status` when no `rustInvoke` is scripted; `mockedFsSteamFiles` and `fsBackedSteamFiles` answer the steampoll channels the rust arm calls.
5. The carry-forward `[{}]` vs `[]` for `steampoll_status` was not tidied: it is a production call site (plans 30-31), and `pollsRustBranch.status` still asserts the current shape.

## Verification

steam jest suite and `src/backend` jest: only the known-red suites fail (`dxvkInstallRemove` failed once under parallel load and passes alone; unrelated). `pnpm codecheck`, `pnpm lint` (0 errors), `pnpm find-deadcode`, `pnpm gameinfo-narrowing-ceiling` pass; `steam-line-ceiling` fails only on the known `gameLaunch.ts`. `cargo test -p gamelib-steampoll`, clippy `-D warnings` and `cargo fmt -p gamelib-steampoll --check` pass. Prettier clean on edited TS and the JSON shard.

## Commits

- 847c799d1: retarget or delete the steam tests that drove the TS poll loops
- 218f419eb: watchdog, census and refresh checks off the TS poll sources

## Self-Check: PASSED
