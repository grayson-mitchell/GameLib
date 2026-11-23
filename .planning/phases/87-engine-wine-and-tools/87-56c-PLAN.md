---
phase: 87-engine-wine-and-tools
plan: 56c
type: execute
wave: 38
depends_on: ["87-56b"]
files_modified:
  - src/backend/engine
  - src/backend/enginewine/intraPhase.ts
  - src/backend/enginewine/twin.ts
  - src/backend/enginewine/selectionView.ts
  - src/backend/services/engineServices.ts
  - src/backend/services/types.ts
  - src/backend/services/managerDeps.ts
  - src/backend/services/winetricksTarget.ts
  - src/backend/services/gameCommandFacts.ts
  - src/backend/launcher.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/runnerMiscFlowRegistration.ts
  - src/backend/stores/createStores.ts
  - src/backend/storeManagers/index.ts
  - src/backend/storeManagers/gog/setup.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/nile/setup.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/steam/bottle.ts
  - src/backend/storeManagers/steam/bridgeBottle.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/backend/storeManagers/steam/bridgeKnownFixes.ts
  - src/backend/storeManagers/steam/bridgeWineTools.ts
  - src/backend/storeManagers/steam/provisionBottle.ts
  - src/backend/storeManagers/steam/gameBridgeLaunch.ts
  - src/backend/storeManagers/steam/gameBridgeLaunchGate.ts
  - src/backend/storeManagers/steam/gameBridgeWineLaunch.ts
  - src/backend/storeManagers/steam/gameEngineDialogs.ts
  - src/backend/storeManagers/steam/gameInstall.ts
  - src/backend/storeManagers/steam/gameInstallBridge.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameLaunchOverlay.ts
  - src/backend/storeManagers/steam/engine/crossoverBinDir.ts
  - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
  - src/backend/storeManagers/steam/engine/pinnedEngine.ts
  - src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts
  - src/backend/storeManagers/steam/bridge/drm/bottleProcesses.ts
  - src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts
  - src/backend/storeManagers/steam/bridge/drm/runnerCrossover.ts
  - src/backend/storeManagers/steam/bridge/drm/stageDrmTypes.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts
  - src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts
  - src/backend/testUtils/testEngineRuntime.ts
  - src/backend/testUtils/testEngineState.ts
  - src/backend/testUtils/testEngineTransport.ts
  - src/backend/testUtils/testServices.ts
  - src/backend/testUtils/testSteamBottle.ts
  - src/backend/__tests__/launcherOverlayCensus.test.ts
  - src/backend/__tests__/managerOverlayCensus.test.ts
  - src/backend/__tests__/engineWinePortComplete.test.ts
  - src/backend/__tests__/engineWineShimSchedule.test.ts
  - src/backend/__tests__/diPhaseGates.test.ts
  - src/backend/__tests__/storeKinds.test.ts
  - src/backend/__tests__/storeMirrorSchedule.test.ts
  - src/backend/stores/__tests__/createStores.test.ts
  - src/backend/stores/__tests__/fixtures/registeredStores.json
  - src/backend/sidecar/__tests__/bootSourceShape.test.ts
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/sidecar/__tests__/engineStateWiring.test.ts
  - src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/backend/enginewine/__tests__/dxvkShim.test.ts
  - src/backend/services/__tests__/gameCommandFacts.test.ts
  - src/backend/storeManagers/__tests__/createStoreManagers.test.ts
  - src/backend/storeManagers/steam/__tests__/bottle.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeBottle.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeRemovalSafety.test.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts
  - src/backend/storeManagers/steam/__tests__/library.installRoot.test.ts
  - src/backend/storeManagers/steam/__tests__/library.installedMap.test.ts
  - src/backend/storeManagers/steam/__tests__/pollsRustBranch.acf.test.ts
  - src/backend/storeManagers/steam/__tests__/provisionBottle.test.ts
  - src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts
  - meta/backendDiCeilings/engine.json
  - meta/__tests__/logSecretGate.test.ts
autonomous: true
requirements: [SVC-02]
estimate:
  tokens: 112000
  raw_tokens: 112000
  tasks: 3
  confidence: low
  # basis: chars/4 of reads, writes and verify output, measured 2026-11-24 at HEAD 136ea8983: fixed 28k (workflow, summary template, CONTEXT slice, this plan, the 87-56b SUMMARY) + T1 40k (the engine-runtime field out of about 38 non-test and 20 test files, each a small codecheck-driven edit) + T2 22k (engine state, the notices store registration and its five gates, the services builder) + T3 22k (git rm of the tree, two census tests moved, five gate files, the twin's last private helpers). Above the 100k line; the overage is mechanical edits, advisory.
must_haves:
  truths:
    - "Inherited from 87-56 (D-06, D-21, SC4): src/backend/engine does not exist; every file under it, its tests, the four oracles and oracle/fixtureBottles.ts are deleted, except the two census tests that guard launcher.ts and the store managers, which move to src/backend/__tests__ unchanged in what they assert; src/backend/services/engineServices.ts, testUtils/testEngineRuntime.ts and testUtils/testEngineState.ts are deleted; `describe('enginePortComplete')` (red since 87-56) is green"
    - "Inherited from 87-56 (D-05 amendment, 82 table): the 'engine-state' and 'engine-runtime' boot steps, `requireEngineRuntime` and the engineRuntime and engineState members of BootServices, ManagerDeps and LauncherDeps are gone; Steam code takes the sidecar transport from its own deps; the `steam_engine_notices` TS store registration is removed while its storeTable.json row stays for the Rust host (storeRowKeys in the engine SliceSpec); the sidecar still exits at stdin EOF"
    - "Inherited from 87-56 (D-21): `noIntraPhaseRowsLeft(SCHEDULE)` passes: no schedule row has deletedBy 87, src/backend/enginewine/intraPhase.ts is deleted, and perGameBottleName, pinMarkerMatches and pinnedEnginePaths are private in twin.ts with gameKey's three helpers inlined there privately (no second copy)"
    - "Inherited from 87-56 (D-06): noRollbackFlag is re-measured green: neither GAMELIB_ENGINE nor GAMELIB_WINE appears under src/ or src-tauri/src"
    - "Gates follow the deletion without being loosened: diPhaseGates, logSecretGate, storeKinds, storeMirrorSchedule, the boot shape tests and backendDiCeilings change only by the deleted files, each change carrying a comment that names this plan's deletion (the 87-37 and 87-56 precedent)"
  artifacts:
    - path: "src/backend/__tests__/engineWinePortComplete.test.ts"
      provides: "enginePortComplete over the whole engine tree, green"
      contains: "enginePortComplete"
    - path: "src/backend/testUtils/testEngineTransport.ts"
      provides: "the fake Rust transport the Steam tests used through testEngineRuntime"
    - path: "src/backend/__tests__/launcherOverlayCensus.test.ts"
      provides: "the T-61-43 launcher settings-read census, moved out of the engine tree"
  key_links:
    - from: "src/backend/__tests__/engineWinePortComplete.test.ts"
      to: "src/backend/__tests__/engineWineShimSchedule.test.ts"
      via: "noIntraPhaseRowsLeft over the exported SCHEDULE"
      pattern: "noIntraPhaseRowsLeft"
  prohibitions:
    - statement: "MUST NOT revive a deleted TS module, keep a TS copy of an engine module under another path, add a jest.mock call, or lower a floor or widen an allow-list by anything other than exactly the files this plan deletes"
      status: unresolved
      reason: "spec-less fallback; enforced by enginePortComplete, noIntraPhaseRowsLeft, the census tests and review; no wired check descriptor"
---

<objective>
Delete the engine sub-slice's TypeScript whole now that 87-56a and 87-56b left only type and boot plumbing outside it:
the engine runtime and engine state leave the boot and the deps, the notices store registration and the services
builder go, the directory and its oracles are deleted, and enginePortComplete and noIntraPhaseRowsLeft go green.

Purpose: the unmet 87-56 must-haves (D-06, D-21, SC4), measured against the importer map rather than assumed.
Output: an absent src/backend/engine, a sidecar booting without engine steps, a green enginePortComplete, no
deletedBy-87 row, and every census agreeing with the deleted tree.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-engine-wine-and-tools/87-56-SUMMARY.md
@.planning/phases/87-engine-wine-and-tools/87-56b-SUMMARY.md
Read 87-56-PLAN.md (the parent's must-haves and its Task 2 verify) and the 87-37 SUMMARY's store-row move only.
Read 87-RESEARCH.md "Runtime State Inventory" stale-reference sweep only. Skill("gamelib-conventions"): the sidecar
exit contract and the `<verify>` prettier rule apply.

<assumption_delta_decision>
The detector fired on "fallback" (the Phase 59 fallback engine). Primary noun: the engine selection. Decision:
no-change; this plan deletes code and adds no case.
</assumption_delta_decision>
</context>

## Measured live importers (HEAD 136ea8983, 2026-11-24; what 87-56a and 87-56b leave)

| Module or member | Outside importers left for this plan | Notes |
| --- | --- | --- |
| engineRuntime (type and the boot-built field) | services/types.ts, sidecar/bootstrap.ts, and as a type: steam/bottle.ts, bridge/drm/drmLaunchSetup.ts, bridge/drm/runnerCrossover.ts, bridge/overlay/overlayLaunch.ts, bridge/overlay/overlayRunnerClone.ts, steam/bridgeBottle.ts, steam/bridgeBottleLifecycle.ts, steam/provisionBottle.ts | the field name appears in 36 non-test files (measured with `grep -rlw`, testUtils included) and 20 test files; after 87-56b only the transport member is read |
| engineState | launcher.ts (EngineStateService type), services/types.ts, sidecar/bootstrap.ts | carried through ManagerDeps, gog/setup.ts, nile/games.ts, nile/setup.ts, storeManagers/index.ts, services/managerDeps.ts, sidecar/handlers.ts; no method is called outside the directory |
| engineNoticeStore | services/types.ts, stores/createStores.ts | and testUtils/testServices.ts |
| engineServices (type) and wineManagerReleases | services/engineServices.ts | the builder this plan deletes |
| services/engineServices.ts (outside the directory, deleted here) | launcher.ts, sidecar/handlers.ts, sidecar/runnerMiscFlowRegistration.ts, steam/bridgeBottleLifecycle.ts, steam/bridgeKnownFixes.ts, services/winetricksTarget.ts, services/gameCommandFacts.ts (types and the source builders) | tests: enginewine/__tests__/dxvkShim.test.ts, services/__tests__/gameCommandFacts.test.ts, steam/__tests__/bridgeBottleLifecycle.test.ts |
| gameKey | enginewine/twin.ts (three helpers) | inlined privately here |
| test importers that break with the tree | sidecar/__tests__/engineStateWiring.test.ts (a decision type); six Steam tests that build an engine registry for an unused slice member (bottle, bridgeBottle, bridgeBottleLifecycle, library.installRoot, library.installedMap, provisionBottle); the createTestEngineRuntime users (bridgeRemovalSafety, games, runnerClone, overlayLaunch, overlayRunnerClone and its realCrossover variant, testSteamBottle, testServices) | repointed or reduced to their subject |
| tests inside the tree that guard live code | engine/__tests__/launcherOverlayCensus.test.ts (launcher.ts, T-61-43) and managerOverlayCensus.test.ts (store managers, T-61-45) import nothing from the engine | moved, not deleted; deleting the directory whole would have dropped both guards (surprise) |
| gates naming engine files | diPhaseGates OWNED_66_3 (engineState.ts, length 24) and OWNED_66_4 (seven engine files, floor 61); meta/__tests__/logSecretGate.test.ts (14 exemptions, one in engine/perGameBottle.ts); meta/backendDiCeilings/engine.json (still tracked although the 87-56 SUMMARY lists it deleted) | each reduced by exactly the deleted files |

## Scope note

This plan lists 82 files in `files_modified` and is estimated at 112k tokens, above the ~100k smart-zone budget. The
user chose exactly three plans for the 87-56 remainder, so it is not split. Most of the overage is Task 1's sweep: the
`engineRuntime` field leaves about 38 non-test and 20 test files, and each edit is small and mechanical, found by
`pnpm codecheck`. **If Task 1 runs past budget, commit Task 1 alone (its verify green, including the red-set check
below) and stop at a checkpoint before Task 2.** Do not start Task 2 in a context that is already degrading.

## Expected enginePortComplete red set after Task 1

At HEAD 136ea8983 `describe('enginePortComplete')` runs 35 tests and none fails (measured with jest `--json`). After
Task 1 extends the `ENGINE` SliceSpec and removes the engine runtime, exactly these 70 tests fail. Tasks 2 and 3 turn
each one green:

- 52 "`<path>` is deleted" titles, one for each path `git ls-files src/backend/engine` lists once 87-56b has moved its
  eight files and with the two census tests left out. Measured from HEAD less those ten paths, the list is:
  `__tests__/` bottleLedger.test.ts, crossoverLocation.test.ts, defined.ts, demoStatus.test.ts, engineConfig.test.ts,
  engineDecision.test.ts, engineIds.test.ts, engineRegistry.test.ts, engineRuntime.test.ts, engineState.test.ts,
  fallbackEngine.test.ts, fixtures/stub-cxbottle.sh, fixtures/stub-wine.sh, gameEngineState.test.ts, gameKey.test.ts,
  gamePrefix.test.ts, launchSettings.test.ts, oracle/engineConfig.oracle.test.ts, oracle/engineDecision.oracle.test.ts,
  oracle/engineState.oracle.test.ts, oracle/fallbackEngine.oracle.test.ts, oracle/fixtureBottles.ts,
  perGameBottle.test.ts, pinnedEngineProgress.test.ts, runTool.test.ts, testedCrossoverVersions.test.ts,
  toolSettings.test.ts; and the modules bottleLedger.ts, crossoverLocation.ts, demoStatus.ts, engineConfig.ts,
  engineDecision.ts, engineEligibility.ts, engineIds.ts, engineNoticeStore.ts, enginePins.ts, engineRegistry.ts,
  engineRuntime.ts, engineServices.ts, engineState.ts, engineTypes.ts, fallbackEngine.ts, gameEngineState.ts,
  gameKey.ts, gamePrefix.ts, launchSettings.ts, perGameBottle.ts, pinnedEngineProgress.ts, runTool.ts,
  testedCrossoverVersions.ts, toolSettings.ts, wineManagerReleases.ts (all under src/backend/engine/).
- 3 more "is deleted" titles: src/backend/services/engineServices.ts, src/backend/testUtils/testEngineState.ts and
  src/backend/enginewine/intraPhase.ts.
- 2 "is kept" titles for the census tests' new paths, src/backend/__tests__/launcherOverlayCensus.test.ts and
  managerOverlayCensus.test.ts, which only move in Task 3.
- 13 "non-test code under src/backend never names `<id>`" titles: createEngineRuntime, createEngineState,
  createFallbackEngine, createLaunchSettingsRegistry, createCrossoverLocator, createEngineRegistry, createBottleLedger,
  createPerGameBottleFlights, createEngineStores, engineServicesFrom, steamEngineServicesFrom, createTestEngineState,
  EngineStateService.

Task 1 itself deletes `requireEngineRuntime`, `createTestEngineRuntime` and testUtils/testEngineRuntime.ts, so those
three tests pass after it. Every other test the spec adds (the kept fixture directories, the relocated steam/engine
modules, the store row, the channels, the flag) passes from the start. If the 87-56b SUMMARY records a different set of
moved files, recompute the 52 from that SUMMARY, record the difference in this plan's SUMMARY, and change only the
path count in the check. The identifier list does not change without a reason written in the SUMMARY.

<tasks>

<task type="tracer">
  <name>Tracer — the sidecar boots and a Steam bridge call reaches Rust with no engine runtime: enginePortComplete extended red, the 'engine-runtime' step and field gone, Steam deps carry their own transport</name>
  <files>src/backend/__tests__/engineWinePortComplete.test.ts, src/backend/services/types.ts, src/backend/services/managerDeps.ts, src/backend/sidecar/bootstrap.ts, src/backend/sidecar/handlers.ts, src/backend/launcher.ts, src/backend/downloadmanager/downloadqueue.ts, src/backend/storeManagers/index.ts, src/backend/storeManagers/gog/setup.ts, src/backend/storeManagers/nile/games.ts, src/backend/storeManagers/nile/setup.ts, src/backend/storeManagers/sideload/games.ts, src/backend/storeManagers/steam/bottle.ts, src/backend/storeManagers/steam/bridgeBottle.ts, src/backend/storeManagers/steam/bridgeBottleLifecycle.ts, src/backend/storeManagers/steam/bridgeWineTools.ts, src/backend/storeManagers/steam/provisionBottle.ts, src/backend/storeManagers/steam/gameBridgeLaunch.ts, src/backend/storeManagers/steam/gameBridgeLaunchGate.ts, src/backend/storeManagers/steam/gameBridgeWineLaunch.ts, src/backend/storeManagers/steam/gameEngineDialogs.ts, src/backend/storeManagers/steam/gameInstall.ts, src/backend/storeManagers/steam/gameInstallBridge.ts, src/backend/storeManagers/steam/gameLaunch.ts, src/backend/storeManagers/steam/gameLaunchOverlay.ts, src/backend/storeManagers/steam/engine/crossoverBinDir.ts, src/backend/storeManagers/steam/engine/steamEngineDeps.ts, src/backend/storeManagers/steam/engine/pinnedEngine.ts, src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts, src/backend/storeManagers/steam/bridge/drm/bottleProcesses.ts, src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts, src/backend/storeManagers/steam/bridge/drm/runnerCrossover.ts, src/backend/storeManagers/steam/bridge/drm/stageDrmTypes.ts, src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts, src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts, src/backend/services/winetricksTarget.ts, src/backend/services/gameCommandFacts.ts, src/backend/enginewine/selectionView.ts, src/backend/testUtils/testEngineRuntime.ts, src/backend/testUtils/testEngineTransport.ts, src/backend/testUtils/testServices.ts, src/backend/testUtils/testSteamBottle.ts, src/backend/sidecar/__tests__/bootstrap.test.ts, src/backend/sidecar/__tests__/bootSourceShape.test.ts, src/backend/sidecar/__tests__/playtimeQueueBootDrain.test.ts, src/backend/downloadmanager/__tests__/downloadqueue.test.ts, src/backend/storeManagers/__tests__/createStoreManagers.test.ts, src/backend/storeManagers/steam/__tests__/bottle.test.ts, src/backend/storeManagers/steam/__tests__/bridgeBottle.test.ts, src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts, src/backend/storeManagers/steam/__tests__/bridgeRemovalSafety.test.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/storeManagers/steam/__tests__/launchWithoutSteam.test.ts, src/backend/storeManagers/steam/__tests__/library.installRoot.test.ts, src/backend/storeManagers/steam/__tests__/library.installedMap.test.ts, src/backend/storeManagers/steam/__tests__/pollsRustBranch.acf.test.ts, src/backend/storeManagers/steam/__tests__/provisionBottle.test.ts, src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts, src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayLaunch.test.ts, src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts, src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts</files>
  <precondition>describe('engineOutsideImporters') passes at the starting HEAD with the map 87-56b left (outside importers only in this plan's table, ENGINE_RUNTIME_MEMBER_READS empty); if it fails, stop and return a checkpoint naming the unlisted importer, never widen the map</precondition>
  <read_first>
    - This plan's measured table and the 87-56b SUMMARY (the map and member-read list it left)
    - src/backend/__tests__/engineWinePortComplete.test.ts the `ENGINE` SliceSpec, `describe('enginePortComplete')` and `engineOutsideImporters`; src/backend/testUtils/portSliceGate.ts `SliceSpec` (storeRowKeys)
    - src/backend/sidecar/bootstrap.ts by grep only: the step-name list, the 'engine-runtime' step, `requireEngineRuntime`, every `engineRuntime` reference
    - src/backend/testUtils/testEngineRuntime.ts (its fake transport answers) and one Steam test that uses it (runnerClone.test.ts)
    - games.test.ts by grep only (`engineRuntime`, `testRuntime`), never whole
  </read_first>
  <action>
    Run the precondition. Extend the `ENGINE` SliceSpec in place: `deleted` becomes every path `git ls-files
    src/backend/engine` lists now except the two census tests (which get kept entries at their new paths), plus
    src/backend/services/engineServices.ts, src/backend/testUtils/testEngineRuntime.ts,
    src/backend/testUtils/testEngineState.ts and src/backend/enginewine/intraPhase.ts; `kept` adds the gamelib-engine
    fixture directories golden/bottles, golden/config, golden/decision, golden/demo_status, golden/fallback,
    golden/launch, golden/state, golden/switch and fixtures/vectors and the four relocated steam/engine modules;
    `storeRowKeys` names `store_cache/steam_engine_notices`; `forbiddenIdentifiers` adds the TS factories and builders
    that die here (createEngineRuntime, createEngineState, createFallbackEngine, createLaunchSettingsRegistry,
    createCrossoverLocator, createEngineRegistry, createBottleLedger, createPerGameBottleFlights, createEngineStores,
    engineServicesFrom, steamEngineServicesFrom, requireEngineRuntime, createTestEngineRuntime, createTestEngineState,
    EngineStateService), each first checked with `findIdentifiers` to be named by no shim, twin or relocated Steam
    module. Run it: after this task its failing set must equal the "Expected enginePortComplete red set after Task 1"
    above exactly (70 titles). The verify's last step checks this.

    Then remove the engine runtime: delete its boot step (the engine-runtime entry and its name in the step list) and
    `requireEngineRuntime` from bootstrap.ts (the steam-bottle facade's async half takes the host transport), the `engineRuntime` member from
    BootServices, ManagerDeps and LauncherDeps and from every `Pick`/key list that names it, and every Steam deps slice
    field typed as the runtime: a slice that only read the transport takes `requestRustInvoke` (ManagerDeps already has
    it) and its call sites pass the deps themselves; the vestigial registry slices in bottle.ts and bridgeBottle.ts
    (`BottleSettingsDeps`, `BridgeBottleDeps`) lose the member. Replace testUtils/testEngineRuntime.ts with
    testUtils/testEngineTransport.ts exporting the same fake transport (ledger, selection clear, CrossOver lookup and
    version-gate answers) and repoint its users and the six tests that built a registry for the removed member. Drive
    the sweep with `pnpm codecheck`. Update selectionView.ts's comment that named the runtime registry. Drop the
    engineRuntime key from the importer map's comment-only references if any remain.
  </action>
  <verify>
    <automated>test "$(grep -c "'engine-runtime'" src/backend/sidecar/bootstrap.ts)" -eq 0 && test ! -e src/backend/testUtils/testEngineRuntime.ts && pnpm codecheck && pnpm exec jest --runTestsByPath src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/sidecar/__tests__/bootSourceShape.test.ts src/backend/sidecar/__tests__/registrationOncePerBoot.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts && pnpm exec jest src/backend/storeManagers src/backend/services src/backend/downloadmanager src/backend/enginewine --silent && pnpm build:sidecar && pnpm smoke:exit-check -- --mode eof && npx prettier --check src/backend/__tests__/engineWinePortComplete.test.ts src/backend/services/types.ts src/backend/services/managerDeps.ts src/backend/sidecar/bootstrap.ts src/backend/sidecar/handlers.ts src/backend/launcher.ts src/backend/downloadmanager/downloadqueue.ts src/backend/storeManagers/index.ts src/backend/storeManagers/steam/bottle.ts src/backend/storeManagers/steam/bridgeBottle.ts src/backend/storeManagers/steam/bridgeBottleLifecycle.ts src/backend/storeManagers/steam/gameLaunch.ts src/backend/storeManagers/steam/gameBridgeWineLaunch.ts src/backend/storeManagers/steam/provisionBottle.ts src/backend/testUtils/testEngineTransport.ts src/backend/testUtils/testServices.ts src/backend/testUtils/testSteamBottle.ts src/backend/storeManagers/steam/__tests__/games.test.ts && { rm -f node_modules/.cache/87-56c-t1-red.json; pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts -t enginePortComplete --json --outputFile=node_modules/.cache/87-56c-t1-red.json >/dev/null 2>&1; node -e "const fs=require('fs'),cp=require('child_process');const r=JSON.parse(fs.readFileSync('node_modules/.cache/87-56c-t1-red.json','utf8'));const failed=new Set(r.testResults.flatMap(t=>t.assertionResults).filter(a=>a.status==='failed'&&a.ancestorTitles.includes('enginePortComplete')).map(a=>a.title));const census=/__tests__\/(launcherOverlayCensus|managerOverlayCensus)\.test\.ts$/;const eng=cp.execSync('git ls-files src/backend/engine').toString().split('\n').filter(p=>p&&!census.test(p));if(eng.length!==52)throw new Error('engine paths '+eng.length+', expected 52');const del=[...eng,'src/backend/services/engineServices.ts','src/backend/testUtils/testEngineState.ts','src/backend/enginewine/intraPhase.ts'].map(p=>p+' is deleted');const kept=['launcherOverlayCensus','managerOverlayCensus'].map(n=>'src/backend/__tests__/'+n+'.test.ts is kept');const ids=['createEngineRuntime','createEngineState','createFallbackEngine','createLaunchSettingsRegistry','createCrossoverLocator','createEngineRegistry','createBottleLedger','createPerGameBottleFlights','createEngineStores','engineServicesFrom','steamEngineServicesFrom','createTestEngineState','EngineStateService'].map(i=>'non-test code under src/backend never names '+i);const want=new Set([...del,...kept,...ids]);const extra=[...failed].filter(t=>!want.has(t)),missing=[...want].filter(t=>!failed.has(t));if(want.size!==70||extra.length||missing.length){console.error(JSON.stringify({size:want.size,extra,missing}));process.exit(1)}console.log('T1 red set equals the expected 70')"; }</automated>
    <fails_when>non-zero exit; the first `test` exits 1 because the boot step name remains or the old test helper exists; codecheck reports an error; jest prints "failed" in the non-gate suites; smoke:exit-check reports a hang or a non-zero exit; prettier prints "Code style issues found"; the red-set step exits 1 and prints a JSON object whose `extra` (an enginePortComplete test failing that should not) or `missing` (an expected red test that passes, or never ran because the spec was not extended) is non-empty, or prints "engine paths N, expected 52", or throws ENOENT because jest wrote no report. The enginePortComplete run's own non-zero exit is expected at this point and is deliberately not chained.</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -c "'engine-runtime'" src/backend/sidecar/bootstrap.ts` == 0 [HEAD=5 EXPECT==0 @136ea8983]
    - `grep -rlw "engineRuntime" src --include='*.ts' --include='*.tsx' | grep -v '^src/backend/engine/' | grep -v __tests__ | wc -l` == 0, with every remaining hit a comment the executor rewrites [HEAD=36 EXPECT==0 @136ea8983]
    - the sidecar exits at stdin EOF (smoke:exit-check)
    - the red-set step of the verify prints "T1 red set equals the expected 70". That step runs jest `--json` on enginePortComplete and compares the failing titles with the list under "Expected enginePortComplete red set after Task 1", in both directions [HEAD=0 EXPECT==70 @136ea8983]
  </acceptance_criteria>
  <done>No boot step, deps field or Steam slice carries the TS engine runtime; the sidecar boots and exits without it.</done>
</task>

<task type="auto">
  <name>Task 2: Engine state, the notices store registration and the services builder: the 'engine-state' step goes, the storeTable row stays for the Rust host</name>
  <files>src/backend/sidecar/bootstrap.ts, src/backend/services/types.ts, src/backend/services/managerDeps.ts, src/backend/services/engineServices.ts, src/backend/services/winetricksTarget.ts, src/backend/services/gameCommandFacts.ts, src/backend/launcher.ts, src/backend/sidecar/handlers.ts, src/backend/sidecar/runnerMiscFlowRegistration.ts, src/backend/storeManagers/index.ts, src/backend/storeManagers/gog/setup.ts, src/backend/storeManagers/nile/games.ts, src/backend/storeManagers/nile/setup.ts, src/backend/storeManagers/steam/bridgeBottleLifecycle.ts, src/backend/storeManagers/steam/bridgeKnownFixes.ts, src/backend/stores/createStores.ts, src/backend/testUtils/testEngineState.ts, src/backend/testUtils/testServices.ts, src/backend/stores/__tests__/createStores.test.ts, src/backend/stores/__tests__/fixtures/registeredStores.json, src/backend/__tests__/storeKinds.test.ts, src/backend/__tests__/storeMirrorSchedule.test.ts, src/backend/sidecar/__tests__/bootSourceShape.test.ts, src/backend/sidecar/__tests__/bootstrap.test.ts, src/backend/enginewine/__tests__/dxvkShim.test.ts, src/backend/services/__tests__/gameCommandFacts.test.ts, src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts</files>
  <read_first>
    - src/backend/sidecar/bootstrap.ts by grep only: the 'engine-state' step and every `engineState` reference
    - src/backend/stores/createStores.ts, storeKinds.test.ts (the 87-37 floor comments for MIN_CONSTRUCTIONS and MIN_FILES_WITH_CONSTRUCTION), storeMirrorSchedule.test.ts (`DELETED_IN_PHASE_87`, `EXTRA_ROWS`, the steam_engine_notices schedule cell and code row), createStores.test.ts (the engine notice cache constant)
    - src/backend/services/engineServices.ts (every export and its importers in this plan's table)
  </read_first>
  <action>
    Remove the engine-state boot step and its name in the step list, and the engineState member from BootServices, ManagerDeps,
    LauncherDeps and every Pick or key list (gog/setup.ts, nile/games.ts, nile/setup.ts, storeManagers/index.ts,
    managerDeps.ts, handlers.ts); delete testUtils/testEngineState.ts. Remove the engine notices store from
    createStores.ts, the Stores type in services/types.ts and testServices.ts (the CacheStore file name stays Rust's;
    no on-disk name changes, D-07), following 87-37: `steam_engine_notices` joins `DELETED_IN_PHASE_87` with its
    storeTable.json row kept through `EXTRA_ROWS`, MIN_CONSTRUCTIONS 46 -> 45 and MIN_FILES_WITH_CONSTRUCTION 12 -> 11
    each with a comment naming this deletion, and registeredStores.json and createStores.test.ts follow. Delete
    services/engineServices.ts: the source types its importers used become local `Pick`-based types where they are read
    (winetricksTarget.ts's tool-target source, gameCommandFacts.ts, runnerMiscFlowRegistration.ts,
    bridgeKnownFixes.ts, bridgeBottleLifecycle.ts), and launcher.ts and handlers.ts build those directly; repoint the
    three tests and drop the file from the schedule's tools-shim importer list.
  </action>
  <!-- planner-discipline-allow: createEngineStores -->
  <verify>
    <automated>test "$(grep -c "'engine-state'" src/backend/sidecar/bootstrap.ts)" -eq 0 && test ! -e src/backend/services/engineServices.ts && test ! -e src/backend/testUtils/testEngineState.ts && pnpm codecheck && pnpm exec jest --runTestsByPath src/backend/__tests__/storeKinds.test.ts src/backend/__tests__/storeMirrorSchedule.test.ts src/backend/stores/__tests__/createStores.test.ts src/backend/stores/__tests__/storeTable.test.ts src/backend/stores/__tests__/userStateFamily.test.ts src/backend/sidecar/__tests__/bootSourceShape.test.ts src/backend/sidecar/__tests__/bootstrap.test.ts src/backend/sidecar/__tests__/registrationOncePerBoot.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/enginewine/__tests__/dxvkShim.test.ts src/backend/services/__tests__/gameCommandFacts.test.ts src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts && pnpm build:sidecar && pnpm smoke:exit-check -- --mode eof && npx prettier --check src/backend/sidecar/bootstrap.ts src/backend/services/types.ts src/backend/services/managerDeps.ts src/backend/services/winetricksTarget.ts src/backend/services/gameCommandFacts.ts src/backend/launcher.ts src/backend/sidecar/handlers.ts src/backend/sidecar/runnerMiscFlowRegistration.ts src/backend/storeManagers/index.ts src/backend/storeManagers/steam/bridgeBottleLifecycle.ts src/backend/storeManagers/steam/bridgeKnownFixes.ts src/backend/stores/createStores.ts src/backend/testUtils/testServices.ts src/backend/stores/__tests__/createStores.test.ts src/backend/stores/__tests__/fixtures/registeredStores.json src/backend/__tests__/storeKinds.test.ts src/backend/__tests__/storeMirrorSchedule.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts</automated>
    <fails_when>non-zero exit; a `test` exits 1 because the boot step name or a deleted file remains; codecheck reports an error; jest prints "failed"; smoke:exit-check reports a hang or a non-zero exit; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -c "'engine-state'" src/backend/sidecar/bootstrap.ts` == 0 [HEAD=3 EXPECT==0 @136ea8983]
    - `grep -c "createEngineStores" src/backend/stores/createStores.ts` == 0 [HEAD=2 EXPECT==0 @136ea8983]
    - `grep -c "steam_engine_notices" src/common/types/ipc/storeTable.json` >= 1 (the row stays; a preservation check) [HEAD=3 EXPECT>=1 @136ea8983 GUARD MUTATION: storeRowKeys in the engine SliceSpec]
    - `grep -cE "MIN_CONSTRUCTIONS\s*=\s*45\b" src/backend/__tests__/storeKinds.test.ts` >= 1 with a comment naming 87-56c [HEAD=0 EXPECT>=1 @136ea8983]
  </acceptance_criteria>
  <done>The sidecar builds no engine state and registers no engine store; the services builder is gone.</done>
</task>

<task type="auto">
  <name>Task 3: Delete src/backend/engine whole: the two census tests move out, the twin's last intra-phase helpers go private, intraPhase.ts goes, and every engine gate turns green</name>
  <files>src/backend/engine, src/backend/enginewine/intraPhase.ts, src/backend/enginewine/twin.ts, src/backend/__tests__/launcherOverlayCensus.test.ts, src/backend/__tests__/managerOverlayCensus.test.ts, src/backend/__tests__/engineWinePortComplete.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts, src/backend/__tests__/diPhaseGates.test.ts, src/backend/sidecar/__tests__/engineStateWiring.test.ts, meta/backendDiCeilings/engine.json, meta/__tests__/logSecretGate.test.ts</files>
  <read_first>
    - `git ls-files src/backend/engine` (what remains) and the enginePortComplete red items T1 recorded
    - src/backend/engine/__tests__/launcherOverlayCensus.test.ts and managerOverlayCensus.test.ts (their `read` path roots)
    - src/backend/enginewine/twin.ts the gameKey imports and the three remaining deletedBy-87 helpers; src/backend/engine/gameKey.ts the three helpers the twin uses
    - src/backend/__tests__/engineWineShimSchedule.test.ts `SCHEDULE`, `noIntraPhaseRowsLeft`, the `discoverCrossover` row and every importer list naming an engine path
    - src/backend/__tests__/diPhaseGates.test.ts OWNED_66_3 (the length assertion and its comments) and OWNED_66_4 (the floor and its comments); meta/__tests__/logSecretGate.test.ts the 14-exemption assertions and their comments
    - src/backend/sidecar/__tests__/engineStateWiring.test.ts (whether its subject outlives the engine)
  </read_first>
  <action>
    `git mv` the two census tests to src/backend/__tests__/launcherOverlayCensus.test.ts and managerOverlayCensus.test.ts,
    adjusting only their path roots so they read the same launcher.ts and store-manager files. In twin.ts inline gameKey's
    three helpers as module-private functions (the twin was their one outside user, so the logic still exists once) and
    make perGameBottleName, pinMarkerMatches and pinnedEnginePaths private; delete their three schedule rows and the
    discoverCrossover row with intraPhase.ts. `git rm -r src/backend/engine`. Repoint or reduce
    engineStateWiring.test.ts to what it still tests (delete it if its only subject was the TS engine state; say which
    in the SUMMARY). Drop engine paths from the schedule's importer lists. Export `SCHEDULE` from
    engineWineShimSchedule.test.ts and add an `it` in enginePortComplete calling `noIntraPhaseRowsLeft(SCHEDULE)`; replace
    the "engine runtime builds no launch deadlines" test with nothing (its subject is gone) and remove
    `describe('engineOutsideImporters')`, superseded by the deleted list, noting both in the file header. Gates by
    exactly the deleted files, each with a comment naming 87-56c: OWNED_66_3 drops engine/engineState.ts (24 -> 23);
    OWNED_66_4 drops its seven engine files (floor 61 -> 54); logSecretGate's exemption count 14 -> 13 and its file list
    without engine/perGameBottle.ts; meta/backendDiCeilings/engine.json is deleted (every entry names a deleted test).
    Run noRollbackFlag and enginePortComplete green. Write the SUMMARY's 87-57 note: the schedule rows 87-56a/b added
    (resolveEngineToolSettings, resolveNonCrossoverEngine, ensureFallbackEngine, crossoverBinDirSync,
    parseEngineOverride), the relocated offlineLaunchCertainlyBlocked, and the rows removed. Mark SVC-02 in
    `requirements-completed` only if every truth above holds.
  </action>
  <verify>
    <automated>test ! -e src/backend/engine && test ! -e src/backend/enginewine/intraPhase.ts && test ! -e meta/backendDiCeilings/engine.json && pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/launcherOverlayCensus.test.ts src/backend/__tests__/managerOverlayCensus.test.ts src/backend/__tests__/diPhaseGates.test.ts src/backend/enginewine/__tests__/twinVectors.test.ts meta/__tests__/logSecretGate.test.ts && pnpm exec jest src/backend src/common --silent && pnpm codecheck && pnpm backend-di-ceilings && pnpm build:sidecar && pnpm smoke:exit-check -- --mode eof && npx prettier --check src/backend/enginewine/twin.ts src/backend/__tests__/launcherOverlayCensus.test.ts src/backend/__tests__/managerOverlayCensus.test.ts src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/diPhaseGates.test.ts meta/__tests__/logSecretGate.test.ts</automated>
    <fails_when>non-zero exit; a `test` exits 1 because the engine tree, intraPhase.ts or the engine ceiling file remains; jest prints "failed" (enginePortComplete, noIntraPhaseRowsLeft or noRollbackFlag red); codecheck reports an error; backend-di-ceilings prints FAIL or a stale entry; smoke:exit-check reports a hang or a non-zero exit; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `test ! -e src/backend/engine` exits 0 (at HEAD it exits 1: 62 tracked files)
    - `git ls-files --error-unmatch src/backend/__tests__/launcherOverlayCensus.test.ts src/backend/__tests__/managerOverlayCensus.test.ts` exits 0 (at HEAD it exits 1)
    - `grep -cE "^export function (perGameBottleName|pinMarkerMatches|pinnedEnginePaths)\b" src/backend/enginewine/twin.ts` == 0 [HEAD=3 EXPECT==0 @136ea8983]
    - enginePortComplete, noIntraPhaseRowsLeft and noRollbackFlag pass
    - `grep -c "toHaveLength(13)" meta/__tests__/logSecretGate.test.ts` >= 1 [HEAD=0 EXPECT>=1 @136ea8983]
  </acceptance_criteria>
  <done>src/backend/engine is gone, no intra-phase row remains, and every census agrees with the deleted tree.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| deletion -> runtime | removing boot steps, deps fields and stores must not leave a path that needs them |
| deletion -> guards | tests inside the deleted tree that guard surviving code must not go with it |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-87-96 | Denial of Service | sidecar boot after the deletion | medium | mitigate | the boot tests and the EOF exit smoke run after T1, T2 and T3; the precondition proves no caller outside the plumbing remains |
| T-87-97 | Tampering | the launcher and store-manager settings-read censuses (T-61-43, T-61-45) | high | mitigate | both census tests move out of the tree before `git rm`, with only their path roots changed, and are in T3's verify |
| T-87-98 | Repudiation | floors and counts lowered with the deletion | medium | mitigate | each change equals the deleted files and carries a comment naming 87-56c; the 87-37 and 87-56 precedent |
| T-87-SC | Tampering | package installs | low | accept | no new package |
</threat_model>

<verification>
- enginePortComplete, noIntraPhaseRowsLeft and noRollbackFlag pass; the full backend and common jest, the moved census
  tests, diPhaseGates and logSecretGate pass; codecheck and backend-di-ceilings pass; the sidecar exits at stdin EOF.
</verification>

<success_criteria>
The engine sub-slice's TS, its boot steps and its store registration are deleted (D-06, D-21), no intra-phase row
remains, and the phase-wide survivor sweep in 87-57 can run against a tree whose only engine TS is the schedule's.
</success_criteria>

## Artifacts this phase produces

- `describe('enginePortComplete')` over the whole tree, green; `noIntraPhaseRowsLeft(SCHEDULE)` called with `SCHEDULE` exported
- New: `src/backend/testUtils/testEngineTransport.ts`; moved: `src/backend/__tests__/{launcherOverlayCensus,managerOverlayCensus}.test.ts`
- Deleted: `src/backend/engine` (every file, tests, oracles, fixtures), `src/backend/services/engineServices.ts`, `src/backend/testUtils/{testEngineRuntime,testEngineState}.ts`, `src/backend/enginewine/intraPhase.ts`, `meta/backendDiCeilings/engine.json`, boot steps `engine-state` and `engine-runtime`, the `steam_engine_notices` TS registration, `describe('engineOutsideImporters')`
- Removed schedule rows: `perGameBottleName`, `pinMarkerMatches`, `pinnedEnginePaths`, `discoverCrossover`

<output>
Create `.planning/phases/87-engine-wine-and-tools/87-56c-SUMMARY.md` when done
</output>
