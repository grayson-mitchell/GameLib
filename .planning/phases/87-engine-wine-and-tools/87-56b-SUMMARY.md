---
phase: 87-engine-wine-and-tools
plan: 56b
subsystem: engine
tags: [engine-ts-deletion, relocation, twins, shared-vectors, rust, d-03, d-24, engineOutsideImporters]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-56a engineOutsideImporters map and pinnedEngineReader, 87-55 selection and CrossOver twins, 87-42 bottle switch shims
provides:
  - cluster C relocated with git mv: prepareBottle, engineSync, offlineRefusal, fallbackBottleCall are Steam caller code in steam/engine
  - cluster D off the engine runtime: the Steam selection is a validated write into engineSelectionView, the ledger answer is Rust's, the sync CrossOver read is a twin
  - two new twins with shared vectors on both sides (crossoverBinDirSync, parseEngineOverride)
  - no file outside src/backend/engine imports engineTypes, runTool, enginePins or engineIds; ENGINE_RUNTIME_MEMBER_READS is empty
affects: [87-56c, 87-57, 87-58, 87-59]

actuals:
  tokens: 31000
  tasks: 3
  commits: 3

plan_head_before: f85e359437a0f18c66fcef0d5a3de4dfe13fe205
plan_head_after: 4ccc065e01ecca4a6946ea5d54dc7f5be9b8bba8

tech-stack:
  added: []
  patterns:
    - "a Rust twin whose function never answers null or false gets its own vector file (override_twin.json), not a group of engine_twin.json"
    - "a Rust-owned answer with a transport-fault fallback to the old rule (recordGameRunning)"

key-files:
  created:
    - src/backend/storeManagers/steam/engine/prepareBottle.ts (git mv)
    - src/backend/storeManagers/steam/engine/engineSync.ts (git mv, rewritten)
    - src/backend/storeManagers/steam/engine/offlineRefusal.ts (git mv)
    - src/backend/storeManagers/steam/engine/fallbackBottleCall.ts (git mv)
    - src/backend/storeManagers/steam/__tests__/prepareBottle.test.ts (git mv)
    - src/backend/storeManagers/steam/__tests__/engineSync.test.ts (git mv, rewritten)
    - src/backend/storeManagers/steam/__tests__/offlineRefusal.test.ts (git mv)
    - src/backend/storeManagers/steam/__tests__/fallbackBottleCall.test.ts (git mv)
    - src/backend/testUtils/realRunTool.ts (git mv from engine/runTool.ts)
    - src/backend/testUtils/__tests__/realRunTool.test.ts (git mv from engine/__tests__/runTool.test.ts)
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/override_twin.json
  modified:
    - src/backend/enginewine/twin.ts
    - src/backend/enginewine/__tests__/twinVectors.test.ts
    - src-tauri/crates/gamelib-engine/tests/twin_vectors.rs
    - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/bottle_twin.json
    - src/backend/sidecar/bootstrap.ts
    - src/backend/storeManagers/steam/gameLaunch.ts
    - src/backend/storeManagers/steam/gameEngineDialogs.ts
    - src/backend/storeManagers/steam/gameInstallBridge.ts
    - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
    - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
    - src/backend/storeManagers/steam/engine/crossoverBinDir.ts
    - src/common/types/engine.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts

key-decisions:
  - "recordGameRunning answers Rust's boolean; on a failed call or a non-boolean reply it logs and answers the old ledger rule (bottle name survives sanitizeBottleName, key is a Steam app id), so a transport fault never refuses a launch the TS ledger accepted (T-87-95)"
  - "setSteamEngineSelection carries the TS registry's rules verbatim (Steam key shape, both wine binaries exist for a non-CrossOver selection, a copy is stored, the same 'Engine: <key> uses <label>' log line) into a write of engineSelectionView; Rust still gets the selection with the bottle switch"
  - "parseEngineOverride is pinned by a new override_twin.json, not engine_twin.json: that file's anti-vacuity rule requires a null-or-false answer in every group and the grammar always answers a string"
  - "createRunTool moved to testUtils/realRunTool.ts instead of staying in engine/: the only non-engine users are two real-runner tests, and the production tool runner is Rust's (rustRunTool); engine/runTool.ts therefore no longer exists for 87-56c to delete"

requirements-completed: []

duration: not recorded (one session; no start stamp was taken)
completed: 2026-11-23
---

# Phase 87 Plan 56b: Clusters C, D and E switched or twinned Summary

**The Steam caller-side engine halves now live in `steam/engine`, the Steam launch writes its selection to the view and asks Rust for the ledger, and the sync CrossOver read and the override grammar are twins pinned to Rust by vectors replayed on both sides; nothing outside `src/backend/engine` imports its helper modules any more.**

SVC-02 is NOT marked complete: it closes with 87-56c (the engine directory still exists). `requirements-completed` is empty.

## Accomplishments

- **Cluster C (D-03).** `prepareBottle`, `engineSync`, `offlineRefusal` and `fallbackBottleCall` moved with `git mv`, together with their unit tests, to `src/backend/storeManagers/steam/engine/` and `steam/__tests__/`; no copy is left. `prepareBottle` takes `{paths} & RustInvokeDeps` and reads the pinned-engine marker through `pinnedEngineReader`; `steamPrepareFacts` takes `config.getSettings()` so the three callers (DRM restore, launch switch, install redist switch) pass `steamGame.deps` and no longer build the engine services (`steamEngineServicesFrom` is gone from all three files). `bridgeBottleLifecycle` reads the global settings through `deps.config.getSettings()`.
- **Cluster D (D-24).** `engineSync` dropped the TS ledger and registry: `recordGameRunning` answers `engine_ledger_mark_running`, `dropEngineSelection` clears the view then Rust, and the new `setSteamEngineSelection` replaces `engineRuntime.registry.setEngineSelection` in `gameLaunch.ts`. The bootstrap `steam-bottle` facade's sync read is the twin `crossoverBinDirSync`, so `ENGINE_RUNTIME_MEMBER_READS` is empty.
- **Cluster E (D-24).** `crossoverBinDirSync` (24 vectors, laid as fake trees, answering both a directory and null) joined `bottle_twin.json`; `parseEngineOverride` (57 vectors) is in the new `override_twin.json`. Both are replayed by `twinVectors.test.ts` and `twin_vectors.rs` against `CrossoverLocator::with_system_applications(..).resolve_bin_dir_sync` and `ids::parse_engine_override`, with floors. `EngineKey` and `EngineOverrideId` are types in `src/common/types/engine.ts`; `engineIds.ts` and `gameKey.ts` only re-export for the files 87-56c deletes.
- **87-39 carry.** `readEngineMarker`, `hasStagingDxvk`, `isContradictedCrossover` and `isInside` are private in `twin.ts` and their four `deletedBy: 87` schedule rows are gone. `perGameBottleName`, `pinMarkerMatches` and `pinnedEnginePaths` keep their rows (engine modules still import them).

## Task Commits

1. **Task 1 (tracer): prepareBottle relocated, three callers switched** - `b3d9184ef` (feat)
2. **Task 2: engineSync, offlineRefusal, fallbackBottleCall relocated; selection and ledger from the view and Rust** - `290b91386` (feat)
3. **Task 3: the two twins with shared vectors, private helpers, outside importers repointed** - `4ccc065e0` (feat)

`commits: 3` is the measured `git rev-list --count f85e35943..HEAD` at the last task commit.

## For 87-57 (survivor check)

- **Relocated Steam caller code that survives:** `offlineLaunchCertainlyBlocked` (`steam/engine/offlineRefusal.ts`) is a pure predicate Rust also owns (`gamelib_engine::offline`); it moved as Steam caller code by the 87-56 split decision. Also `prepareBottle`, `recordGameRunning`/`recordGameStopped`/`dropEngineSelection`/`setSteamEngineSelection`, `createFallbackBottleCancellable`.
- **New twin rows (EXPECTED_SURVIVORS does not list them):** `crossoverBinDirSync` (twin, deletedBy 96) and `parseEngineOverride` (twin, deletedBy 98) in `enginewine/twin.ts`, with vector groups in `bottle_twin.json` and `override_twin.json`.
- **Removed rows:** `readEngineMarker`, `hasStagingDxvk`, `isContradictedCrossover`, `isInside` (now private).
- **Moved:** `createRunTool` is `testUtils/realRunTool.ts` (test support, not a survivor of any engine slice).

## What is left in the importer map (input to 87-56c)

Outside importers still present, all removed by 87-56c: `engineNoticeStore` (`stores/createStores.ts`), `engineRuntime` (ten Steam and boot files, type or boot construction only), `engineServices` and `wineManagerReleases` (`services/engineServices.ts`), `engineState` (`launcher.ts`, `services/types.ts`, `bootstrap.ts`), `gameKey` (`enginewine/twin.ts`, which keeps its three helper imports until 87-56c inlines them privately). No engine-runtime member is read outside the directory.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createRunTool` could not be repointed to a common type or a twin**
- **Found during:** Task 3
- **Issue:** the plan repoints the outside `runTool` importers to `src/common/types/engine.ts`, which holds only the `RunTool` and `RunToolResult` types. Two real-runner tests (`runnerClone.test.ts`, `overlayRunnerClone.realCrossover.test.ts`) call the value `createRunTool`, and no twin or common home exists for it (the production runner is Rust's `rustRunTool`).
- **Fix:** `git mv src/backend/engine/runTool.ts src/backend/testUtils/realRunTool.ts` (and its test to `testUtils/__tests__/realRunTool.test.ts`); `engineDecision.ts` (dying) imports it from there, `testedCrossoverVersions.ts` and the decision oracle take the types from common. The `runTool` key left the importer map. **87-56c no longer has `engine/runTool.ts` or `engine/__tests__/runTool.test.ts` to delete**, and `testUtils/realRunTool.ts` is the one place that still holds the TS tool runner (it imports `fakeHomeProfile`, as the old file did).
- **Files modified:** `src/backend/testUtils/realRunTool.ts`, `src/backend/testUtils/__tests__/realRunTool.test.ts`, `src/backend/engine/engineDecision.ts`, `src/backend/engine/testedCrossoverVersions.ts`, the two Steam real tests, `runnerClone.test.ts`
- **Committed in:** `4ccc065e0`

**2. [Rule 1 - Bug] engineConfig.test.ts lost its previous pin**
- **Found during:** Task 3 (full backend run)
- **Issue:** the test mocked `../enginePins` to give the pin table a `previous` pin (the shipped table has none). `parseEngineOverride` now reads the twin's table, so `pinned:<previous>` parsed to `automatic`.
- **Fix:** the one `jest.mock` now targets `common/enginePins.json` (the file the twin reads), so `enginePins`, the twin's `pinById` and the grammar all see the same table. `jest.mock` count unchanged.
- **Committed in:** `4ccc065e0`

**3. [Test restructuring] games.test.ts and engineSync.test.ts**
- **Found during:** Task 2
- **Issue:** three games.test.ts cases asserted through the TS registry and ledger (`registry.setEngineSelection` spy, `registry.clearEngineSelection` spy, `ledger.gamesRunningIn`); engineSync.test.ts asserted the TS ledger's local mirror.
- **Fix:** the first spies `setSteamEngineSelection`, the second spies `engineSelectionView.clear`, the third spies the `markGameRunning`/`markGameStopped` shims (no new `jest.mock`); the `resetBottleLedger` and `gamesRunningIn` helpers were removed. engineSync.test.ts now pins Rust's answer, the transport-fault fallback, the unreadable-reply fallback, and each `setSteamEngineSelection` refusal (T-87-93).
- **Committed in:** `290b91386`

**4. [Scope] Files the plan's files_modified did not list**
- `src/backend/storeManagers/steam/bottle.ts` (a doc comment that named the TS locator), `src/backend/enginewine/bottles.ts` (a doc comment path), `src/backend/storeManagers/steam/engine/crossoverBinDir.ts` (the hint-folding helper `crossoverHintWineBins`, shared with the bootstrap facade so the fold exists once), `src/backend/engine/__tests__/engineConfig.test.ts`, `src/backend/engine/engineDecision.ts`, `src/backend/engine/testedCrossoverVersions.ts`, `src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts`. The plan's list also named `bridgeWineTools.test.ts`, which imported none of the four modules (nothing to repoint).

---

**Total deviations:** 4 (one blocking relocation, one bug, one test restructuring, one scope note). **Impact on plan:** no gate lowered or widened, no `jest.mock` added, no deleted module revived, no second TS copy of a moved or twinned function (`crossoverLocation.ts` still holds the old locator until 87-56c deletes it with the directory, as the plan scheduled).

## Authentication Gates

None.

## Known Stubs

None added by this plan (searched the created and modified files for hardcoded empty values and placeholder text).

## Threat Flags

None. No new endpoint, auth path or file-access pattern; `setSteamEngineSelection` and the twins match the plan's register (T-87-93, T-87-94, T-87-95).

## Live checks owed (carry to the 87-58/87-59 live gate)

1. A Steam bridge launch on a built-in (pinned) engine registers its selection, runs, and the stop path clears it (the selection and ledger no longer touch the TS runtime).
2. A DRM-mode launch's restore to CrossOver and the install's redist switch still reach Rust through the relocated `prepareBottle`.
3. With CrossOver installed only under `~/Applications`, the Steam bottle's sync lookup finds it (the twin; Rust-vector tested, not run live).

## Verification

- `pnpm exec jest src/backend src/common`: 633 suites passed (14,845 tests; 13 skipped, 3 suites skipped as before); `pnpm codecheck` clean; `pnpm backend-di-ceilings` PASS at jestMock=1661 (unchanged); `pnpm lint` 0 errors.
- `cargo test -p gamelib-engine --test twin_vectors`: 12 passed; `cargo fmt --check -p gamelib-engine` clean.
- Acceptance greps: outside-importer count of engineTypes/runTool/enginePins/engineIds 14 -> 0; the four exported helpers 4 -> 0; `crossover.resolveCrossoverBinDir(` in bootstrap 1 -> 0; `crossoverBinDirSync` in twin.ts 2; `export function parseEngineOverride` 1; `engineRuntime.registry` in gameLaunch.ts 0; `steamEngineServicesFrom` in the three prepareBottle callers 0; old files `engine/{prepareBottle,engineSync,offlineRefusal,fallbackBottleCall,runTool}.ts` absent.
- Scoped `npx prettier --check` over every TS file written is clean; the JSON vector files are prettier-ignored (checked with `--file-info`).

## Self-Check

- Created and moved files exist: the four `steam/engine` modules, their four tests, `testUtils/realRunTool.ts` and its test, `override_twin.json`: verified below.
- Commits `b3d9184ef`, `290b91386`, `4ccc065e0` on HEAD ancestry: verified below.

## Self-Check: PASSED

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-23*
