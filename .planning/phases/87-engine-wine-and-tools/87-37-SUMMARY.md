---
phase: 87-engine-wine-and-tools
plan: 37
subsystem: wine
tags: [delete, d-06, d-08, tools, winetricks, dxvk, dxmt, store-mirror, wine-downloader-info, census, ratchet]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: every caller of the TS tools switched to Rust (87-34 DXVK, 87-35 Winetricks, 87-36 wine command and callTool), services/toolsFrom.ts caller-free (87-36), the Rust wine manager and its wine-downloader-info store (87-19, 87-20)
provides:
  - describe('toolsPortComplete') in engineWinePortComplete.test.ts (deleted files, kept fixtures, eight forbidden identifiers, GAMELIB_WINE absent, wine slice at 9 channels), red before and green after
  - src/backend/tools/**, services/toolsFrom.ts, testUtils/testToolsState.ts, the tools-state and winetricks-queue boot steps and the ToolsState and WinetricksQueue service types deleted
  - src/backend/wine/manager/stores.ts, createWineManagerStores and the wineManager member of Stores deleted; the wine-downloader-info row lives in genStoreTable EXTRA_ROWS (storeTable.json byte-identical)
  - EngineSourceSlices (services/engineServices.ts) and InstallRemove (engine/engineServices.ts), the two types the engine still needed from the deleted tools module
  - engine/wineManagerReleases.ts reads the Rust-written store file (the engine's synchronous release read)
affects: [87-56, 98]

actuals:
  tokens: 3900
  tasks: 2
  commits: 2

plan_head_before: a2e29499735ec2b7d42e4cc85aae9dd4ff77bfee
plan_head_after: f97ffaa95a667c55313b7767e342458b455cfd01

tech-stack:
  added: []
  patterns:
    - "a deleted TS mirror's store keeps its storeTable.json row in genStoreTable EXTRA_ROWS (86-17, 86-24, now 87-37), so the StoreHost keeps owning it and the table is byte-identical"
    - "a still-TS reader of a Rust-owned cache store opens the file Rust writes instead of keeping a mirror alive (engine/wineManagerReleases.ts, deleted with the engine TS in 87-56)"

key-files:
  created: []
  modified:
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/sidecar/bootstrap.ts
    - src/backend/services/types.ts
    - src/backend/services/engineServices.ts
    - src/backend/engine/engineServices.ts
    - src/backend/engine/engineSwitch.ts
    - src/backend/engine/wineManagerReleases.ts
    - src/backend/sidecar/runnerMiscFlowRegistration.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/stores/createStores.ts
    - src/backend/testUtils/testServices.ts
    - src/backend/config.ts
    - src/backend/utils.ts
    - src/backend/launcher.ts
    - src/backend/storeManagers/steam/installFormIpc.ts
    - meta/genStoreTable.ts
  deleted:
    - src/backend/tools/ (index, dxmt, machoExports, toolsState, five winetricks modules, 16 unit tests, three oracle tests)
    - src/backend/services/toolsFrom.ts
    - src/backend/testUtils/testToolsState.ts
    - src/backend/wine/manager/stores.ts
    - src/backend/testUtils/drivableRunner.ts
    - src/backend/utils/inet/downloader/index.ts
    - meta/backendDiCeilings/tools.json

key-decisions:
  - "The TS tools tree went whole, including the three oracle tests; the goldens, recordings and winetricks_pure.json stay for the Rust replay and toolsPortComplete pins them as kept"
  - "ToolsDeps survived as EngineSourceSlices (without toolsState, stores and the tools-only members) because the engine's bottle path and registerRunnerMiscFlows still read those slices; Tools['DXVK']['installRemove'] became the InstallRemove type"
  - "The engine's synchronous wineManagerReleases() cannot go through an async Rust op, so it opens <userData>/store/wine-downloader-info.json (the file Rust writes); a missing, corrupt or mis-shaped file is the empty list, as the cache store was. EngineServices['paths'] gained userData"
  - "toolsState was pure pass-through (launcher, storeManagers, managerDeps, gog and nile setup, handlers) and left every one of them with the service"
  - "Census floors that counted deleted code were lowered with the deletion recorded beside each; none was lowered to turn a run green"

patterns-established:
  - "a deleted store mirror is scheduled in storeMirrorSchedule as DELETED_IN_PHASE_87 (due 87, not registered), mirroring DELETED_IN_PHASE_86"

requirements-completed: [SVC-02]

coverage:
  - id: D1
    description: "src/backend/tools/** (index, dxmt, machoExports, toolsState, the five winetricks modules, their tests and the dxvk, dxmt and winetricks oracles), services/toolsFrom.ts and testToolsState.ts are gone; the tools-state and winetricks-queue boot steps and the ToolsState and WinetricksQueue service types with them; toolsPortComplete is red before and green after with GAMELIB_WINE absent, and the Rust goldens, recordings and winetricks_pure.json are still on disk"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/__tests__/engineWinePortComplete.test.ts (toolsPortComplete, 24 failures before the deletion, 0 after)"
        status: pass
      - kind: unit
        ref: "bootSourceShape, bootstrap, registrationOncePerBoot, diPhaseGates, moduleStateCensus, engineWineShimSchedule"
        status: pass
    human_judgment: false
  - id: D2
    description: "No TS registers or writes the wine-downloader-info store; its storeTable.json row survives for the Rust host (generated from EXTRA_ROWS, byte-identical), and the Rust manager goldens still pass"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "storeTable, storeKinds, storeMirrorSchedule, createStores, cacheFamily, storeLayer, wineDownloadsPortComplete (store row pinned)"
        status: pass
      - kind: unit
        ref: "cargo test -p gamelib-wine --test golden_wine_manager (9 passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The engine's release list still reads: wineManagerReleasesFrom returns the stored wine-releases on every call, and the empty list for a missing file, corrupt JSON or a mis-shaped key"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "src/backend/engine/__tests__/engineDecision.test.ts (wineManagerReleasesFrom), engineConfig.oracle.test.ts over a fake HOME"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every census and ratchet gate passes with no floor lowered except where the deleted code held the count"
    requirement: SVC-02
    verification:
      - kind: unit
        ref: "pnpm backend-di-ceilings (PASS), pnpm find-deadcode (PASS, baseline unchanged), pnpm codecheck, Backend and Common jest projects (15073 passed, 0 failed), meta project (2877 passed)"
        status: pass
    human_judgment: false
  - id: D5
    description: "On a Mac, the engine's pinned-engine and Wine Manager release decisions (Settings, Wine Manager list installed) still see the releases Rust wrote after a refresh and an install"
    verification: []
    human_judgment: true
    rationale: "The reader and the Rust writer are each tested, and the file shape is the same one the oracle seeds, but no test refreshes the list in a running app and then reads the engine decision; one run on a Mac closes it (live-gate item)"

duration: 23min
completed: 2026-11-24
---

# Phase 87 Plan 37: The tools sub-slice and the wine-downloader-info mirror are deleted Summary

**`src/backend/tools/**`, `services/toolsFrom.ts`, the `tools-state` and `winetricks-queue` boot steps and the `wine-downloader-info` TS store mirror are gone, `toolsPortComplete` went from 24 failures to green, and every census and ratchet gate passes.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-11-24T00:27+13:00
- **Completed:** 2026-11-24T00:50+13:00
- **Tasks:** 2 of 2
- **Files:** 87 changed in the two commits (289 insertions, 10672 deletions)

## Accomplishments

- **Tracer (Task 1):** `describe('toolsPortComplete')` first, run red (24 failures: fifteen deleted-path checks, seven forbidden identifiers, the boot-step check, and so on), then the deletion. The tracer gate (automated-only verify) was re-run and passed before Task 2.
- **Deleted:** the nine `tools/*.ts` modules, 16 unit tests and three oracle tests, `services/toolsFrom.ts` (caller-free since 87-36), `testUtils/testToolsState.ts`, both boot steps and their names in the step-order list, `toolsState` and `winetricksQueue` from `BootServices` and `ManagerDeps`, and `toolsState`'s pass-through in the launcher, `storeManagers/index.ts`, `managerDeps.ts`, gog and nile setup, `handlers.ts` and `testServices.ts`.
- **Types the engine still needed:** `ToolsDeps` lives on as `EngineSourceSlices` in `services/engineServices.ts` (the same slices minus `toolsState`, `stores` and the tools-only members), `Tools['DXVK']['installRemove']` became `InstallRemove` in `engine/engineServices.ts`, and `registerRunnerMiscFlows` takes its own narrow deps.
- **The mirror (Task 2):** `wine/manager/stores.ts`, its `createStores` registration and the `wineManager` member of `Stores`, `testServices` and every `Pick<..., 'wineManager'>` are gone, with the store named in none of `config.ts`, `installFormIpc.ts` or `utils.ts`. The row moved to `genStoreTable` `EXTRA_ROWS` (`storeTable.json` is byte-identical); `storeKinds`, `registeredStores.json`, `storeMirrorSchedule` (new `DELETED_IN_PHASE_87`), `storeLayer`, `cacheFamily` and `createStores` agree. `wineDownloadsPortComplete` forbids `createWineManagerStores` and `wineDownloaderInfoStore` and pins the `store/wine-downloader-info` row.
- **Census sweep:** see Deviations (floors), plus the dead code the deletion orphaned.

## Task Commits

1. **Task 1 (tracer): toolsPortComplete, and the TS tools slice, its boot steps and toolsFrom deleted** - `0e6b9b56d` (feat)
2. **Task 2: delete the wine-downloader-info TS mirror and sweep the store and ratchet gates** - `f97ffaa95` (feat)

## Which Rust test covers each dropped source-text gate (D-08)

- **`runWineCommandOnGameGuard`** (the install-path deref guard, the Steam refusal, the native refusal): `src-tauri/crates/gamelib-wine/tests/run_for_game_guard.rs` (`a_native_game_is_refused_and_never_spawns`, `a_game_whose_info_carries_no_install_path_is_a_handled_no_op`, `an_ineligible_steam_title_is_refused_with_the_pitfall_5_log_and_never_spawns`, `an_eligible_steam_title_runs_in_exactly_the_settings_it_was_given`, `the_steam_guard_runs_before_the_native_guard`), and on the TS side the order the guards run in is pinned by `services/__tests__/gameCommandFacts.test.ts` and `sidecar/__tests__/engineWineResolvers.test.ts`.
- **`toolSettingsWiring`** (each tool entry point resolves settings with the right `ensureBottle`, and `unavailable` never spawns): `gameCommandFacts.test.ts` and `engineWineResolvers.test.ts` (the `targetFor` calls with `ensureBottle: true` or `false`), and in Rust `run_for_game_guard.rs` (`no_usable_wine_runs_nothing_and_logs_the_reason_without_the_command`, `a_tool_goes_through_the_same_guards`).
- **`winetricksInstallPathInvariant`** (the queue is the one renderer install path, no `--gui`, no `winetricksInstall` channel): the install and queue code is Rust (`gamelib-wine` `winetricks/install.rs` builds `-q <verb>`, `winetricks/queue.rs` is the one queue), pinned by `golden_winetricks.rs` and the recorded cases; the absence of a `winetricksInstall` channel and the `winetricksApply` resolver are held by the native-channel manifest (`nativeChannelOwnership`), the IPC schema snapshot and the `winetricksApply` row in `engineWineShimSchedule`. I did not map each of its four invariants to a single test one for one; the channel-absence part rests on the manifest and snapshot, which would fail on a re-added channel.
- **`launcherOverlayCensus`'s `tools/index.ts overlay census`** (not named in the plan, same kind of gate): dropped with the file it read; `gameCommandFacts.test.ts` pins the settings reads that replaced it.

## Verification

- Task 1 chain: `test ! -e src/backend/tools`, the plan's jest list (engineWinePortComplete, engineWineShimSchedule, bootSourceShape, bootstrap, registrationOncePerBoot, diPhaseGates, moduleStateCensus: 376 passed), `pnpm codecheck`, prettier over the written paths.
- Task 2 chain: `test ! -e src/backend/wine/manager/stores.ts`, the plan's jest list (storeKinds, storeMirrorSchedule, createStores, engineWinePortComplete, installFormIpc: 254 passed), `pnpm codecheck`, `pnpm backend-di-ceilings`, `pnpm find-deadcode`, prettier over the written paths (none ignored).
- Whole `Backend` and `Common` jest projects: 15073 passed, 0 failed (13 skipped, pre-existing), against 15423 before the plan (the deleted tests). `meta` project: 2877 passed. `cargo test -p gamelib-wine --test golden_wine_manager`: 9 passed. ESLint over the changed files: 0 errors.
- Acceptance: `test ! -e src/backend/tools`; `grep -c "'tools-state'\|'winetricks-queue'" bootstrap.ts` is 0; `test ! -e src/backend/wine/manager/stores.ts`; `grep -c createWineManagerStores createStores.ts` is 0; `grep -c wine-downloader-info storeTable.json` is 2.
- Not run: the engine's release decisions against a list a real Rust refresh just wrote (coverage D5).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The engine still needed two types from the deleted tools module**
- **Found during:** Task 1
- **Issue:** `ToolsDeps` was the deps type of `registerRunnerMiscFlows` and of `EngineServicesSource`, and `Tools['DXVK']['installRemove']` typed `EngineServices.installRemove` and the engine switch. Deleting `tools/index.ts` broke all of them.
- **Fix:** `EngineSourceSlices` (services/engineServices.ts), `InstallRemove` (engine/engineServices.ts), and a narrow `Pick<EngineSourceSlices, 'config' | 'onlineMonitor' | 'notifications'> & SaveSyncDeps` for `registerRunnerMiscFlows`; `handlers.ts` stopped passing `spawnAsync` and `stores` it never read.
- **Files modified:** `services/engineServices.ts`, `engine/engineServices.ts`, `engine/engineSwitch.ts`, `sidecar/runnerMiscFlowRegistration.ts`, `sidecar/handlers.ts`
- **Commit:** `0e6b9b56d`

**2. [Rule 3 - Blocking] `toolsFrom.ts` and files the plan does not list**
- **Found during:** Task 1
- **Issue:** the plan's `files_modified` omits `services/toolsFrom.ts` (the 87-36 carry-forward deletes it, and it value-imported `backend/tools`), and `toolsState` was threaded through the launcher, `storeManagers/index.ts`, `managerDeps.ts`, gog and nile setup, `handlers.ts` and three tests.
- **Fix:** deleted `toolsFrom.ts` (verified caller-free first) and removed every `toolsState` pass-through. `winetricksQueue.ts`, `dxmt.ts`, `runWineCommandOnGuard` and `winetricksInstallPathInvariant` were all in scope as the 87-36 notes said; the sidecar zod entries for the moved channels were not touched.
- **Commit:** `0e6b9b56d`

**3. [Rule 1 - Bug] The engine reads the wine-downloader-info store synchronously, and the plan did not know it**
- **Found during:** Task 2
- **Issue:** `engine/wineManagerReleases.ts` (`wineManagerReleasesFrom`, used by the engine decision, the engine config, the steam engine deps and `services/engineServices.ts`) read `stores.wineManager.wineDownloaderInfoStore.get('wine-releases')`, a sync read. The research's reader list (config, utils, DXMT, installFormIpc) missed it, so deleting the mirror would have emptied the release list the engine decides from. A Rust op is async and cannot serve it.
- **Fix:** `wineManagerReleasesFrom` now opens `<userData>/store/wine-downloader-info.json`, the file Rust writes (key `wine-releases`), on every call; a missing, corrupt or mis-shaped file is the empty list. `EngineServices['paths']` gained `userData`. Tests: file-backed cases in `engineDecision.test.ts`, the fake-HOME oracle reads the same reader. **The plan's truth "no TS reads the store" is therefore met for the mirror, not for this one file read; it goes with the engine TS in 87-56.** It is a leaf module outside `enginewine/`, so the survivor schedule needs no row.
- **Files modified:** `engine/wineManagerReleases.ts`, `engine/engineServices.ts`, `engine/__tests__/engineDecision.test.ts`, `engine/__tests__/oracle/engineConfig.oracle.test.ts`
- **Commit:** `f97ffaa95`

**3b. Why this is not Rule 4:** it adds no table, service or boundary and the Rust owner is unchanged; the alternative (keep the TS mirror) contradicts the plan's deletion and the 86 precedent. Flagging it for the 87-56 and live-gate readers anyway.

**4. [Rule 3 - Blocking] `pnpm backend-di-ceilings` was already red from 87-26 and 87-36**
- **Found during:** Task 1 verification sweep
- **Issue:** the gate failed before this plan's edits: `crossoverLocation.test.ts` shrank 3 to 2 (87-26), `runnerMiscFlows.test.ts` shrank 5 to 4, `wineToolsFlows.test.ts` was a stale entry (file deleted), and two tests 87-36 added carried `jest.mock` calls with no baseline (`showDialogBoxModalAutoPushFailure.test.ts` 2, `gameCommandFacts.test.ts` 5). The 87-36 and 87-26 verify chains did not include this gate.
- **Fix:** the two shrinks lowered; the stale `wineToolsFlows` entry (9) dropped; the two new tests baselined at 2 and 5 under the same shard, a net 9 to 7. The two new tests' mocks are not removed by this plan (a DI rewrite of `gatherGameCommandFacts` is out of scope); the shard now holds 11 sites where it held 14. `tools.json` (all ten entries were under the deleted tools tests) deleted.
- **Files modified:** `meta/backendDiCeilings/sidecar-tests-wineTools.json`, `engine.json`, `tools.json` (deleted)
- **Commit:** `0e6b9b56d`

**5. [Rule 3 - Blocking] Floors and counts that held deleted code**
- **Issue / Fix, each with the deletion recorded beside it:** `diPhaseGates` OWNED_66_3 26 to 24 (`winetricksQueue.ts`, `dxmt.ts`), OWNED_66_4 floor 67 to 65 (`tools/index.ts`, `winetricksEnvironment.ts`), stores modules 11 to 10 and the 66.1 floor 12 to 11, `storeKinds` constructions 47 to 46 and construction files 13 to 12, `storeTable` kinds literal 47 to 46, `testServices` store families 13 to 12, `logSecretGate` exemptions 15 to 14 (the `wine --version` probe in `tools/index.ts`), `bootSourceShape` (the `winetricks-queue` anchor and the `wine/manager/stores.ts` module), `engineWineShimSchedule` (`tools/index.ts` among the compatibility-layer importers), `registeredStores.json` (one entry), `storeLayer` (the store left the round-trip list). `meta/knip-baseline.txt`, listed in the plan, needed no edit: it names no deleted file and `pnpm find-deadcode` passes against it.
- **Commit:** `0e6b9b56d`, `f97ffaa95`

**6. [Rule 3 - Blocking] Dead code the deletion orphaned (knip)**
- **Issue:** with the tools gone, `find-deadcode` reported 13 new findings that had only the deleted code as a user.
- **Fix:** deleted `testUtils/drivableRunner.ts` and `utils/inet/downloader/index.ts` (no importer), removed `DXMT_REQUIRED_MACDRV_SYMBOLS` and `winemacPathFor` from `scanners/scanTypes.ts`, `buildTarGz`, `pinProcess` and `waitForTreeToSettle` from `toolsOracleSupport.ts`, `installAdapter` from `recorder.ts`, `Tool` and `WinetricksInstallOutcome` from `common/types.ts`, and un-exported `WinemacMetalCheck`, `SyntheticResponse` and `defaultSteamWineToolsDeps`. The baseline did not move.
- **Commit:** `0e6b9b56d`

**7. [Rule 3 - Blocking] A source-text gate over the deleted file**
- **Issue:** `engine/__tests__/launcherOverlayCensus.test.ts` read `tools/index.ts` in a second describe.
- **Fix:** that describe was dropped (D-08), with a header note pointing at `gameCommandFacts.test.ts`; the launcher describe stays.
- **Commit:** `0e6b9b56d`

**Total deviations:** 7 auto-fixed (6 blocking, 1 bug). **Impact on plan:** the plan's deletions all landed as written; the extra work is the type relocation, one file read that replaces a mirror's sync get, and the ratchet and dead-code fallout.

## Carry-forward checks (from the 87-30..87-36 notes)

- `services/toolsFrom.ts` caller-free (87-36): confirmed by grep, deleted.
- `createTools` had no non-test caller: confirmed, deleted with `tools/`.
- `winetricksQueue` (the TS queue, its `winetricks-queue` boot step, the `BootServices` field) and the TS gates `runWineCommandOnGameGuard.test.ts` and `winetricksInstallPathInvariant.test.ts`: all deleted.
- `dxmt.ts` (87-31) existed only for its tests and oracle: deleted with them.
- Nothing the notes listed was still live; nothing outside the plan's scope was deleted without being named above.

## Issues Encountered

None beyond the deviations.

## Known Stubs

None.

## Threat Flags

None. T-87-35 is mitigated as planned: the `store/wine-downloader-info` row stays for the host (generated, byte-identical, pinned by `wineDownloadsPortComplete`), `storeMirrorSchedule` and `storeKinds` agree with the 82 table, and the Rust manager golden passes. The new file read in `wineManagerReleases.ts` opens one fixed path under `userData` and never writes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 87-56 deletes the engine TS and must delete `engine/wineManagerReleases.ts` with it (the file read stands in for the mirror until then); the `EngineServices['paths'].userData` member goes with it.
- The two `jest.mock`-heavy tests 87-36 added (`gameCommandFacts.test.ts`, `showDialogBoxModalAutoPushFailure.test.ts`) now hold baselined sites; a later plan can drop them by injecting the resolvers.
- `graphify update .` was run.

## Self-Check: PASSED

- ABSENT (deleted as planned): `src/backend/tools`, `src/backend/services/toolsFrom.ts`, `src/backend/testUtils/testToolsState.ts`, `src/backend/wine/manager/stores.ts`, `src/backend/testUtils/drivableRunner.ts`, `src/backend/utils/inet/downloader/index.ts`
- FOUND: `src/backend/engine/wineManagerReleases.ts`, `src/backend/__tests__/engineWinePortComplete.test.ts` (toolsPortComplete), `src/common/types/ipc/storeTable.json` (wine-downloader-info row, 2 matches)
- FOUND: `0e6b9b56d`, `f97ffaa95` (ancestors of HEAD; `git rev-list --count` from the plan ledger is 2)
