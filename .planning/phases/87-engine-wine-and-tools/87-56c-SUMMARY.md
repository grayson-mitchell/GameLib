---
phase: 87-engine-wine-and-tools
plan: 56c
subsystem: engine
tags: [engine-ts-deletion, boot-steps, deps-members, census-tests, store-registration, d-06, d-21, sc4]
status: complete

requires:
  - phase: 87-engine-wine-and-tools
    provides: 87-56a engineOutsideImporters map and the tool-settings and pinned-engine switches, 87-56b the caller-half relocation, the sync CrossOver and override twins and the empty ENGINE_RUNTIME_MEMBER_READS
provides:
  - src/backend/engine does not exist (50 files git rm'd; the two settings-read census tests moved out)
  - the 'engine-runtime' and 'engine-state' boot steps, requireEngineRuntime and the engineRuntime and engineState members of BootServices, ManagerDeps and LauncherDeps are gone; every Steam slice takes requestRustInvoke from its own deps
  - the steam_engine_notices TS registration is gone (its storeTable.json row stays in EXTRA_ROWS for the Rust host)
  - services/engineServices.ts, testEngineRuntime.ts (now testEngineTransport.ts), testEngineState.ts and enginewine/intraPhase.ts are deleted
  - describe('enginePortComplete') over the whole tree is green with noIntraPhaseRowsLeft(SCHEDULE) in it; noRollbackFlag green
affects: [87-57, 87-58, 87-59]

actuals:
  tokens: 175000
  tasks: 3
  commits: 3

plan_head_before: dfc3b74e159ee5b07ed304457364103de96ed3d3
plan_head_after: 4f0e367ea2ae0e0945a3458b64b1d9e2d16af17e

tech-stack:
  added: []
  patterns:
    - "a Steam slice that only read the transport takes `requestRustInvoke` and its callers pass their deps, not a runtime wrapper"
    - "a test transport (`testEngineTransport.ts`) that answers the bottle gate, ledger, selection clear and CrossOver lookup, with `isTestEngineChannel` for tests that route several fakes by channel"
    - "a dying directory's own tests keep an interim helper file while their subject lives, deleted with them in the same plan"

key-files:
  created:
    - src/backend/testUtils/testEngineTransport.ts (git mv from testEngineRuntime.ts, rewritten)
    - src/backend/__tests__/launcherOverlayCensus.test.ts (git mv)
    - src/backend/__tests__/managerOverlayCensus.test.ts (git mv)
  modified:
    - src/backend/sidecar/bootstrap.ts
    - src/backend/services/types.ts
    - src/backend/services/managerDeps.ts
    - src/backend/services/winetricksTarget.ts
    - src/backend/services/gameCommandFacts.ts
    - src/backend/launcher.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/stores/createStores.ts
    - src/backend/enginewine/twin.ts
    - src/backend/__tests__/engineWinePortComplete.test.ts
    - src/backend/__tests__/engineWineShimSchedule.test.ts
  deleted:
    - src/backend/engine (50 files)
    - src/backend/services/engineServices.ts
    - src/backend/testUtils/testEngineState.ts
    - src/backend/enginewine/intraPhase.ts
    - src/backend/sidecar/__tests__/engineStateWiring.test.ts
    - meta/backendDiCeilings/engine.json

key-decisions:
  - "the engineRuntime field is replaced by requestRustInvoke on every Steam slice (the transport was the only member read since 87-56b); `ManagerDeps` already carried it from the host"
  - "the tool-target and game-command sources are local Pick-based types (`ToolTargetSource` in winetricksTarget.ts, `GameCommandSource` in gameCommandFacts.ts); `BridgeKnownFixDeps` shrank to `Pick<ManagerDeps, 'commandRunner'>` by compile-driven pruning, `provisionBridgeBottle` to `KillBottleDeps & { config }`"
  - "engineStateWiring.test.ts is deleted, not repointed: its only subject was the 'engine-state' boot step and the TS engine state"
  - "steam_engine_notices leaves DOCUMENTED_CLASSES and EXPECTED_KINDS in the same plan (its TS class is deleted); the row stays through the existing EXTRA_ROWS entry in meta/genStoreTable.ts, so storeTable.json is unchanged"

requirements-completed: [SVC-02]

duration: not recorded (one session; no start stamp was taken)
completed: 2026-11-24
---

# Phase 87 Plan 56c: The engine directory is deleted whole Summary

**`src/backend/engine` no longer exists: the engine runtime and engine state left the boot and every deps type, the notices store registration and the services builder went with them, the two census tests that guarded live code moved out unchanged in what they assert, and enginePortComplete, noIntraPhaseRowsLeft and noRollbackFlag are green.**

SVC-02 is marked complete: every truth of the plan holds (see Verification).

## Accomplishments

- **Task 1 (tracer).** The `engine-runtime` boot step, `requireEngineRuntime` and the `engineRuntime` member left `BootServices`, `ManagerDeps` and `LauncherDeps` and every `Pick` list. Every Steam slice that typed the runtime (`bottle.ts`, `bridgeBottle.ts`, `bridgeBottleLifecycle.ts`, `provisionBottle.ts`, the DRM and overlay files, `gameLaunch.ts` and the other launch and install files) takes `requestRustInvoke` from its own deps, and calls `crossoverBinDir(deps)`, `dropEngineSelection(steamGame.deps, ...)` and the like directly. `testEngineRuntime.ts` became `testEngineTransport.ts` (the same fake transport answers, plus `createTestEngineTransport`, `createTestCrossoverLocator` and `isTestEngineChannel`). The `ENGINE` SliceSpec in `engineWinePortComplete.test.ts` was extended over the whole tree first (red), and the importer map's `engineRuntime` row went to `[]`.
- **Task 2.** The `engine-state` step and `engineState` member went (BootServices, ManagerDeps, LauncherDeps, gog and nile setup, `storeManagers/index.ts`, `managerDeps.ts`, `handlers.ts`). `createEngineStores` left `createStores.ts`, the `Stores` type and `testServices.ts`. `services/engineServices.ts` is deleted; its source types became local: `ToolTargetSource` (winetricksTarget.ts), `GameCommandSource` (gameCommandFacts.ts, which `launcher.ts` and `handlers.ts` now build directly), `Pick<ManagerDeps, ...>` in runnerMiscFlowRegistration.ts, and the narrowed `BridgeKnownFixDeps` and `provisionBridgeBottle` types. `steam_engine_notices` joined `DELETED_IN_PHASE_87`.
- **Task 3.** The census tests moved with `git mv` (only the path root of `read` changed). `twin.ts` inlines `gameKey`'s three helpers (`STEAM_APP_ID_RE`, `isCleanAppName`, `isKnownRunner`) privately, byte-for-byte equal to the deleted ones, and `perGameBottleName`, `pinMarkerMatches` and `pinnedEnginePaths` are private. `git rm -r src/backend/engine`, `intraPhase.ts` and `meta/backendDiCeilings/engine.json`. The four intra-phase schedule rows (`perGameBottleName`, `pinMarkerMatches`, `pinnedEnginePaths`, `discoverCrossover`) are gone; `SCHEDULE` is exported and enginePortComplete calls `noIntraPhaseRowsLeft(SCHEDULE)`. `describe('engineOutsideImporters')` and the "engine runtime builds no launch deadlines" test were removed (noted in the file header).

## Task Commits

1. **Task 1 (tracer): no engine runtime** - `adce99186` (feat)
2. **Task 2: engine state, notices store registration, services builder** - `913729fb6` (feat)
3. **Task 3: the engine directory is deleted whole** - `4f0e367ea` (feat)

`commits: 3` is the measured `git rev-list --count dfc3b74e1..HEAD`.

## Gates that followed the deletion (each by exactly the deleted files, each with a comment naming 87-56c)

| Gate | Change | Why |
| --- | --- | --- |
| diPhaseGates OWNED_66_3 | 24 -> 23 | engine/engineState.ts |
| diPhaseGates OWNED_66_4 | floor 61 -> 54 (list lost 7 files) | bottleLedger, crossoverLocation, engineNoticeStore, engineRegistry, fallbackEngine, launchSettings, perGameBottle |
| meta logSecretGate | 14 -> 13 exemptions, file list without engine/perGameBottle.ts | file deleted |
| storeKinds | MIN_CONSTRUCTIONS 46 -> 45, MIN_FILES_WITH_CONSTRUCTION 12 -> 11; `steam_engine_notices` left EXPECTED_KINDS | engineNoticeStore.ts deleted (done in Task 3, when the file went, not Task 2) |
| storeTable.test | EXPECTED_KINDS literal floor 46 -> 45 | same store |
| storeMirrorSchedule | `steam_engine_notices` in DELETED_IN_PHASE_87, out of DOCUMENTED_CLASSES | TS registration and class gone |
| createStores.test, userStateFamily.test, testServices.test | engine family gone (12 -> 11 families); `steam_engine_notices` in NO_TS_STORE | same |
| nativeChannelOwnership | BACKEND_FILES_FLOOR 567 -> 540 | 27 non-test files the walk read were deleted (24 engine modules, engineServices.ts, intraPhase.ts, testEngineState.ts), 588 -> 561 |
| bootSourceShape anchors, bootstrap.test key list, testContainment classification | 'engine-state', engineState and engineStateWiring.test.ts dropped | step and test deleted |
| engineWineShimSchedule importer lists | engine paths and services/engineServices.ts dropped; testEngineTransport.ts added to ENGINE_TWIN_IMPORTERS and the selection-view callers | files deleted or added |
| engineWinePortComplete | two tests whose subject was `engineRuntime.ts` and `intraPhase.ts` lost that half (bottlesPortComplete, wineDiscoveryPortComplete) | subjects deleted |

## For 87-57 (survivor check)

- **Rows 87-56a/b added, all still scheduled:** `resolveEngineToolSettings` (deletedBy 98), `resolveNonCrossoverEngine` (98), `ensureFallbackEngine` (96), `crossoverBinDirSync` (96), `parseEngineOverride` (98).
- **Relocated Steam caller code that survives (not a schedule row):** `offlineLaunchCertainlyBlocked` (`steam/engine/offlineRefusal.ts`), `prepareBottle`, the `engineSync` functions, `createFallbackBottleCancellable`.
- **Rows removed in 87-56c:** `perGameBottleName`, `pinMarkerMatches`, `pinnedEnginePaths` (now private) and `discoverCrossover` (`enginewine/intraPhase.ts` deleted). Earlier removals by 87-56b: `readEngineMarker`, `hasStagingDxvk`, `isContradictedCrossover`, `isInside`. No row has `deletedBy: 87`.
- **New test support:** `testUtils/testEngineTransport.ts` is test support, not a survivor of any engine slice.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The red set was 68, not 70, and the plan's "52 engine paths" was 50**
- **Found during:** Task 1
- **Issue:** the plan's count assumed the 87-56a/b moves of its own listing; 87-56b had also moved `engine/runTool.ts` and its test to `testUtils/realRunTool.ts`. `git ls-files src/backend/engine` listed 52 paths including the two census tests, so 50 once they are left out, and the failing set after Task 1 is 68 (50 + 3 deleted-path titles + 2 kept + 13 identifiers).
- **Fix:** recomputed from the 87-56b SUMMARY, as the plan allows; only the count changed. Measured by jest `--json`: 68 failing titles, all in the expected categories. (A later `testInterimEngineRuntime.ts` made it 69 for one task, then 64 after Task 2.)
- **Committed in:** `adce99186`

**2. [Rule 3 - Blocking] The engine TS's own unit tests needed an engine runtime and an engine state until Task 3**
- **Found during:** Task 1 (codecheck covers the dying tests)
- **Issue:** `createTestEngineServices` (in `testServices.ts`) builds an `EngineServices` with an `engineRuntime` and an `engineState`, and six engine tests use it. Deleting `testEngineRuntime.ts` and `testEngineState.ts` in Tasks 1 and 2 would have left them uncompilable. `testServices.ts` may not `require` (a `diPhaseGates` rule), so the lazy load could not sit there.
- **Fix:** `testUtils/testInterimEngineRuntime.ts` held `interimEngineRuntime()` and `interimEngineState()` for those tests (and `engineRuntime.test.ts` got a local factory); Task 3 deleted the file, `createTestEngineServices` and the tests together. The `createEngineRuntime` and `createTestEngineState` identifier tests stayed red as the plan expected, and `createTestEngineState` itself disappeared in Task 2.
- **Committed in:** `adce99186`, `913729fb6`, deleted in `4f0e367ea`

**3. [Rule 1 - Bug] The `engineServicesFrom` spy and the `installRemove` test tested a function no production code called**
- **Found during:** Task 2
- **Issue:** `bridgeBottleLifecycle.test.ts` spied `engineServicesFrom` (its production caller was gone since 87-56b) and `dxvkShim.test.ts` tested `engineServicesFrom().installRemove`.
- **Fix:** the spy and its mocks were removed; the `installRemove` describe was dropped (the shim's own two cases stay in the file).
- **Committed in:** `913729fb6`

**4. [Rule 1 - Bug] Tests asserted on a registry return value the view does not have**
- **Found during:** Task 1
- **Issue:** `bridgeBottleLifecycle.test.ts` used the TS registry's `setEngineSelection`, which answers whether the selection was valid; the replacement `engineSelectionView.apply` returns nothing and no longer validated.
- **Fix:** that test calls `setSteamEngineSelection` (the validating production function); `games.test.ts`, which sets selections it never validates against real binaries, uses the view directly.
- **Committed in:** `adce99186`

**5. [Scope] Files outside `files_modified`**
- `meta/genStoreTable.ts` needed no change (its `EXTRA_ROWS` already lists `steam_engine_notices`, so `storeTable.json` is byte-identical). `registeredStores.json` needed no change (it never listed the engine family). Edited beyond the plan's list: `services/__tests__/winetricksTarget.test.ts`, `enginewine/tools.ts` (comment), `storeManagers/steam/__tests__/pinnedEngine.test.ts` (it used the twin's now-private `pinnedEnginePaths`; it lays out the pinned layout by hand), `storeManagers/steam/__tests__/bridgeWineTools.test.ts`, `stores/__tests__/storeTable.test.ts`, `stores/__tests__/userStateFamily.test.ts`, `testUtils/__tests__/testServices.test.ts`, `sidecar/__tests__/testContainment.test.ts`, `sidecar/__tests__/nativeChannelOwnership.test.ts`, `enginewine/selectionView.ts` (comment).
- Deferred to the plan's own wording: `MIN_CONSTRUCTIONS 45` and `MIN_FILES_WITH_CONSTRUCTION 11` are in the Task 3 commit, not Task 2 (the construction left with the file, which Task 3 deleted); the Task 2 acceptance grep for it is satisfied at the end.
- `importing engineWineShimSchedule.test.ts` from `engineWinePortComplete.test.ts` (the plan's design) registers the schedule tests a second time in that file; correct, a few seconds of duplicate work, noted in the file header.

---

**Total deviations:** 5 (two blocking, two bugs, one scope note). **Impact on plan:** no gate loosened beyond the deleted files, no `jest.mock` added, no deleted module revived, no second TS copy (the three `gameKey` helpers exist once, in `twin.ts`).

## Authentication Gates

None.

## Known Stubs

None added (searched the created and modified files for hardcoded empty values and placeholder text).

## Threat Flags

None. No new endpoint, auth path or file-access pattern. T-87-96 (boot after the deletion): `bootstrap.test`, `bootSourceShape` and the stdin-EOF smoke (`smoke:exit-check --mode eof`, PASS at 123 ms) ran after every task. T-87-97 (census guards): both census tests are in the repo at `src/backend/__tests__` and pass. T-87-98 (floors): see the gate table.

## Left for a later plan

- `.dependency-cruiser.cjs` still carries the `engine-is-store-agnostic` rule over `^src/backend/engine/`; with the directory gone it matches nothing. Removing it needs `meta/__tests__/boundaryGates.test.ts` to follow, so it is left for the 87-57 sweep. `pnpm boundaries` passes (the three violations that 87-56b's moves had introduced into the dying files went with them).
- `src/backend/enginewine/__tests__/dxvkShim.test.ts` no longer pins the boolean coercion the `installRemove` wrapper did; the caller that coerces (launcher's DXVK step) is covered by its own tests.

## Live checks owed (carry to the 87-58/87-59 live gate)

1. Cold start of the dev app on macOS: the sidecar boots without the engine steps (`pnpm tauri:dev`), and quitting exits promptly (the EOF smoke covers only the headless case).
2. A Steam bridge launch (CrossOver) and a built-in-engine launch reach Rust for the ledger, the selection clear and the CrossOver lookup through the transport the deps now carry (the 87-56b live checks, still unrun).
3. The engine-state and notice dismissals the renderer shows come from Rust alone now (no TS `engineStateChanged` push): open a game page for a fallback-engine game and dismiss a notice.

## Verification

- `pnpm codecheck` clean after every task; `pnpm exec jest src/backend src/common meta`: 697 suites passed in the last full run (17,051 tests); two suites (`fakeHomeIsolation`, `helperIntegration` WR-02) failed under the load of that run and pass alone (72 tests); `pnpm lint` 0 errors (both ceilings PASS); `pnpm backend-di-ceilings` PASS (jestMock 1,661 -> 1,637, 385 files); `pnpm boundaries` clean; `pnpm build:sidecar` and `pnpm smoke:exit-check -- --mode eof` PASS after each task.
- Truths: `src/backend/engine`, `enginewine/intraPhase.ts`, `services/engineServices.ts`, `testUtils/testEngineRuntime.ts`, `testUtils/testEngineState.ts` and `meta/backendDiCeilings/engine.json` are absent; the two census tests are tracked at their new paths; `grep -c "'engine-runtime'|'engine-state'" bootstrap.ts` is 0; `grep -rlw engineRuntime src` is 0 non-test files; `GAMELIB_ENGINE` and `GAMELIB_WINE` appear nowhere in `src` or `src-tauri/src` outside the gate's own tests; `grep -cE "^export function (perGameBottleName|pinMarkerMatches|pinnedEnginePaths)" twin.ts` is 0; `grep -c "toHaveLength(13)" logSecretGate.test.ts` is 1.
- Scoped `npx prettier --check` over every TS and JSON file written is clean.

## Self-Check

- Created and moved files exist: `testUtils/testEngineTransport.ts`, both census tests, this SUMMARY: verified below.
- Commits `adce99186`, `913729fb6`, `4f0e367ea` on HEAD ancestry: verified below.

---
*Phase: 87-engine-wine-and-tools*
*Completed: 2026-11-24*

## Self-Check: PASSED
