---
phase: 87-engine-wine-and-tools
plan: 56b
type: execute
wave: 37
depends_on: ["87-56a"]
files_modified:
  - src/backend/storeManagers/steam/engine/prepareBottle.ts
  - src/backend/storeManagers/steam/engine/engineSync.ts
  - src/backend/storeManagers/steam/engine/offlineRefusal.ts
  - src/backend/storeManagers/steam/engine/fallbackBottleCall.ts
  - src/backend/storeManagers/steam/__tests__/prepareBottle.test.ts
  - src/backend/storeManagers/steam/__tests__/engineSync.test.ts
  - src/backend/storeManagers/steam/__tests__/offlineRefusal.test.ts
  - src/backend/storeManagers/steam/__tests__/fallbackBottleCall.test.ts
  - src/backend/engine/prepareBottle.ts
  - src/backend/engine/engineSync.ts
  - src/backend/engine/offlineRefusal.ts
  - src/backend/engine/fallbackBottleCall.ts
  - src/backend/engine/__tests__/prepareBottle.test.ts
  - src/backend/engine/__tests__/engineSync.test.ts
  - src/backend/engine/__tests__/offlineRefusal.test.ts
  - src/backend/engine/__tests__/fallbackBottleCall.test.ts
  - src/backend/engine/perGameBottle.ts
  - src/backend/engine/engineIds.ts
  - src/backend/engine/gameKey.ts
  - src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts
  - src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts
  - src/backend/storeManagers/steam/engine/steamEngineDeps.ts
  - src/backend/storeManagers/steam/gameLaunch.ts
  - src/backend/storeManagers/steam/gameEngineDialogs.ts
  - src/backend/storeManagers/steam/gameInstallBridge.ts
  - src/backend/storeManagers/steam/gameBridgeLaunchGate.ts
  - src/backend/storeManagers/steam/gameBridgeWineLaunch.ts
  - src/backend/storeManagers/steam/bridgeBottleLifecycle.ts
  - src/backend/storeManagers/steam/bridgeWineTools.ts
  - src/backend/storeManagers/steam/__tests__/games.test.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/enginewine/twin.ts
  - src/backend/enginewine/decision.ts
  - src/backend/enginewine/__tests__/twinVectors.test.ts
  - src/backend/enginewine/__tests__/bottlesShim.test.ts
  - src/backend/enginewine/__tests__/selectionView.test.ts
  - src-tauri/crates/gamelib-engine/tests/twin_vectors.rs
  - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/bottle_twin.json
  - src-tauri/crates/gamelib-engine/tests/fixtures/vectors/engine_twin.json
  - src/common/types/engine.ts
  - src/common/__tests__/enginePins.test.ts
  - src/backend/sidecar/__tests__/engineOverrideWriteGuard.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts
  - src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts
  - src/backend/storeManagers/steam/bridge/__tests__/bridgeRuntime.test.ts
  - src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts
  - src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts
  - src/backend/__tests__/engineWineShimSchedule.test.ts
  - src/backend/__tests__/engineWinePortComplete.test.ts
autonomous: true
requirements: [SVC-02]
estimate:
  tokens: 96000
  raw_tokens: 96000
  tasks: 3
  confidence: low
  # basis: chars/4 of reads, writes and verify output, measured 2026-11-24 at HEAD 136ea8983: fixed 27k (workflow, summary template, CONTEXT slice, this plan, the 87-56a SUMMARY) + T1 20k (one git mv, four callers, the facts type) + T2 22k (three git mv, the ledger and selection answers, five callers) + T3 27k (two twins with vectors on both sides, the facade, eleven test-import repoints). Over the 100k line is advisory; never read games.test.ts or bootstrap.ts whole.
must_haves:
  truths:
    - "Cluster C (D-03): prepareBottle, engineSync, offlineRefusal and fallbackBottleCall are Steam caller code in src/backend/storeManagers/steam/engine/, moved with `git mv` together with their unit tests (no copy left in src/backend/engine); they take the sidecar transport and path roots, never the engine runtime or the engine's services bag, and no file outside src/backend/engine imports them from there"
    - "Cluster D (D-24): no non-test file outside src/backend/engine reads an engine-runtime member other than its transport (`ENGINE_RUNTIME_MEMBER_READS` is empty): the Steam launch registers its selection through a relocated validated write into `engineSelectionView` (the TS registry's rules: Steam key shape, both wine binaries exist for a non-CrossOver selection, the same log line), the ledger's answer is Rust's `engine_ledger_mark_running`, and the Steam bottle's synchronous CrossOver read is the twin `crossoverBinDirSync`, pinned to Rust `CrossoverLocator::resolve_bin_dir_sync` by shared vectors that answer both a directory and null"
    - "Cluster E (D-24): `parseEngineOverride` is a twin in enginewine/twin.ts pinned to Rust `ids::parse_engine_override` by shared vectors, engine/engineIds.ts only re-exports it for the engine files 87-56c deletes, `EngineKey` and `EngineOverrideId` are types in src/common/types/engine.ts, and no file outside src/backend/engine (test or not) imports engineIds, engineTypes, runTool or enginePins; testedCrossoverVersions, demoStatus and crossoverLocation have no importer outside the directory and die with it in 87-56c"
    - "87-39 carry: the twin's intra-phase helpers readEngineMarker, hasStagingDxvk, isContradictedCrossover and isInside are private and their deletedBy-87 rows are gone; perGameBottleName, pinMarkerMatches and pinnedEnginePaths keep their rows because engine modules still import them (measured), and 87-56c makes them private with the tree"
    - "Behaviour is unchanged for every caller: the moved unit tests pass at their new paths, the Steam jest folder passes, and the two new twins answer every recorded vector in TS and Rust"
  artifacts:
    - path: "src/backend/storeManagers/steam/engine/prepareBottle.ts"
      provides: "prepareBottle and PrepareBottleCall, relocated"
    - path: "src/backend/storeManagers/steam/engine/engineSync.ts"
      provides: "recordGameRunning, recordGameStopped, dropEngineSelection, setSteamEngineSelection"
    - path: "src/backend/enginewine/twin.ts"
      provides: "crossoverBinDirSync and parseEngineOverride twins"
      contains: "crossoverBinDirSync"
  key_links:
    - from: "src/backend/sidecar/bootstrap.ts"
      to: "src/backend/enginewine/twin.ts"
      via: "the steam-bottle facade's sync CrossOver read calls crossoverBinDirSync"
      pattern: "crossoverBinDirSync"
    - from: "src/backend/enginewine/__tests__/twinVectors.test.ts"
      to: "src-tauri/crates/gamelib-engine/tests/twin_vectors.rs"
      via: "the same vector files replayed on both sides"
      pattern: "crossoverBinDirSync"
  prohibitions:
    - statement: "MUST NOT leave a second TS copy of a moved or twinned function, revive a deleted module, add a jest.mock call, lower a floor, or widen the importer map or an allow-list to pass a gate"
      status: unresolved
      reason: "spec-less fallback; enforced by engineOutsideImporters, the schedule's discovery, backend-di-ceilings and review; no wired check descriptor"
---

<objective>
Finish the switch of the 87-56 remainder: relocate the Steam caller-side halves (cluster C), take every outside read off
the engine runtime except its transport (cluster D), and give the pure helpers a twin or a common type home (cluster
E), so that after this plan the only outside importers of src/backend/engine are the type and boot plumbing 87-56c
removes with the directory.

Purpose: D-03 and D-24, checked against the importer map 87-56a wrote rather than the 87-56 cluster table.
Output: four relocated modules with their tests, the selection and ledger answers from the view and Rust, two twins
with shared vectors, the repointed importers, and the importer map shrunk to the plumbing.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/phases/87-engine-wine-and-tools/87-56-SUMMARY.md
@.planning/phases/87-engine-wine-and-tools/87-56a-SUMMARY.md
Read 87-CONTEXT.md D-03, D-21 and D-24 only. Read 87-55-SUMMARY.md decisions on `selection_twin.json` (why a twin that
never answers null or false got its own vector file) and the carry-forward on the sync CrossOver fast path. Read
.planning/quick/261124-8f3-bottle-port-quirks-sanitise-is-bottle-pr/261124-8f3-SUMMARY.md before touching twin.ts or
bottle_twin.json. Skill("gamelib-conventions"): the `<verify>` prettier rule.

<assumption_delta_decision>
The detector fired on "fallback" (the Phase 59 fallback engine). Primary noun: the engine selection. Decision:
no-change; this plan relocates and twins existing code and adds no second case.
</assumption_delta_decision>
</context>

## Measured live importers (HEAD 136ea8983, 2026-11-24; 87-56a changes noted)

| Module (src/backend/engine/) | Cluster | Live non-test importers outside | Engine-internal importers | Test importers outside | This plan |
| --- | --- | --- | --- | --- | --- |
| prepareBottle | C | steam/engine/steamEngineDeps.ts (PrepareBottleCall type), steam/gameEngineDialogs.ts, steam/gameInstallBridge.ts, steam/gameLaunch.ts (all three dynamic imports) | none | steam/__tests__/games.test.ts (spy) | T1 |
| engineSync | C | steam/gameBridgeLaunchGate.ts, steam/gameBridgeWineLaunch.ts, steam/gameLaunch.ts | none | none | T2 |
| offlineRefusal | C | steam/gameEngineDialogs.ts, steam/gameLaunch.ts (dynamic) | none | oracle/engineConfig.oracle, oracle/engineDecision.oracle | T2 (oracle imports repointed) |
| fallbackBottleCall | C | steam/bridgeBottleLifecycle.ts | perGameBottle | none | T2 (perGameBottle repointed until 87-56c) |
| engineRuntime | D | services/types.ts, sidecar/bootstrap.ts, steam/bottle.ts, bridge/drm/drmLaunchSetup.ts, bridge/drm/runnerCrossover.ts, bridge/overlay/overlayLaunch.ts, bridge/overlay/overlayRunnerClone.ts, steam/bridgeBottle.ts, steam/bridgeBottleLifecycle.ts, steam/provisionBottle.ts (type-only except bootstrap) | engineServices, engineSync, perGameBottle, prepareBottle | three oracles, testUtils/testEngineRuntime.ts | member reads after 87-56a: bootstrap.ts `crossover` (the sync facade, T3) and gameLaunch.ts `registry` (T2); the type importers and the field go in 87-56c's sweep |
| bottleLedger, engineRegistry (not in the cluster table) | D | none by import; reached through the runtime's ledger and registry members | engineRuntime, launchSettings | six Steam tests build a registry for an unused slice member | T2 removes the reads; 87-56c deletes the files and those test members |
| crossoverLocation | D/E | none by import; reached through the runtime's crossover member by the bootstrap facade | engineRuntime | own test, oracle/engineDecision | T3 twin; file dies in 87-56c |
| engineState | D | launcher.ts (type), services/types.ts (type), sidecar/bootstrap.ts (boot step); no method of it is called outside the directory (measured) | engineServices, gameEngineState | testUtils/testEngineState.ts | 87-56c |
| engineNoticeStore | D | services/types.ts, stores/createStores.ts | none | testUtils/testServices.ts | 87-56c |
| engineIds | E | enginewine/decision.ts (type), enginewine/twin.ts, steam/bridgeWineTools.ts, steam/gameLaunch.ts (dynamic) | engineConfig, engineDecision, engineState, offlineRefusal | own test, engineDecision.test, two oracles | T3 |
| gameKey | E | enginewine/twin.ts | nine engine files | own test, oracle/engineConfig | T3 moves the EngineKey type; the twin keeps its three helper imports until 87-56c inlines them privately with the tree (no second copy at any commit) |
| enginePins | E | none | engineConfig, engineDecision, engineIds, fallbackEngine | sidecar/__tests__/engineOverrideWriteGuard.test.ts, src/common/__tests__/enginePins.test.ts | T3 repoints the two tests |
| engineTypes | E | none | nine engine files | enginewine/__tests__/bottlesShim.test.ts, selectionView.test.ts, steam/__tests__/bridgeBottleLifecycle.test.ts, bridgeWineTools.test.ts | T3 repoints |
| runTool | E | none | engineDecision, testedCrossoverVersions | steam/bridge/__tests__/bridgeRuntime.test.ts, bridge/drm/__tests__/runnerClone.test.ts, bridge/overlay/__tests__/overlayRunnerClone.test.ts, overlayRunnerClone.realCrossover.test.ts | T3 repoints |
| testedCrossoverVersions, demoStatus | E | none | engineDecision (and engineState) | own tests, oracles | none: die in 87-56c |

Surprise against the 87-56 cluster table: of cluster E's eight modules only engineIds and gameKey have a live importer
outside the directory. Moving the other six would create unscheduled TS copies of Rust-owned functions (D-21), so they
die with the tree in 87-56c. offlineRefusal's `offlineLaunchCertainlyBlocked` is a pure function Rust also owns
(`gamelib_engine::offline`); it relocates as Steam caller code by the user's 87-56 split decision, and the SUMMARY must
name it for 87-57's survivor check.

<tasks>

<task type="tracer" tdd="true">
  <name>Tracer — the DRM restore's bottle switch runs through the relocated prepareBottle: map re-checked, `git mv`, the pinned-engine reader, four callers switched</name>
  <files>src/backend/storeManagers/steam/engine/prepareBottle.ts, src/backend/engine/prepareBottle.ts, src/backend/storeManagers/steam/__tests__/prepareBottle.test.ts, src/backend/engine/__tests__/prepareBottle.test.ts, src/backend/storeManagers/steam/engine/steamEngineDeps.ts, src/backend/storeManagers/steam/gameEngineDialogs.ts, src/backend/storeManagers/steam/gameLaunch.ts, src/backend/storeManagers/steam/gameInstallBridge.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts, src/backend/__tests__/engineWinePortComplete.test.ts</files>
  <precondition>describe('engineOutsideImporters') passes at the starting HEAD with the map 87-56a left; if it fails, a caller exists that this plan does not switch: stop and return a checkpoint naming it, never widen the map</precondition>
  <read_first>
    - This plan's measured table; the 87-56a SUMMARY (the map it left, the pinnedEngine.ts helpers, the slim facts type it gave steamPrepareFacts)
    - src/backend/engine/prepareBottle.ts and its test; src/backend/storeManagers/steam/engine/pinnedEngine.ts `pinnedEngineReader`
    - src/backend/storeManagers/steam/gameEngineDialogs.ts `prepareDrmBottleForCrossover`; the prepareBottle call sites in gameLaunch.ts and gameInstallBridge.ts (grep `prepareBottle(`); steamEngineDeps.ts `steamPrepareFacts`
    - games.test.ts by grep only: the namespace import of the prepareBottle module (line 2) and its `jest.spyOn`
  </read_first>
  <behavior>
    - prepareBottle at its new path answers exactly as before for every case its moved test pins (the restore re-asks Rust after the pin download, the view is applied, onSwitching runs once after a real change)
    - the DRM restore, the Steam launch switch and the install's redist switch each call the relocated module with the Steam deps' transport and paths
  </behavior>
  <action>
    Run the precondition. `git mv` the module and its unit test to src/backend/storeManagers/steam/engine/prepareBottle.ts
    and src/backend/storeManagers/steam/__tests__/prepareBottle.test.ts. Its services parameter becomes `{paths:
    Pick<AppPaths, 'userHome' | 'toolsPath'>} & RustInvokeDeps`, the marker summary reads through `pinnedEngineReader`,
    and `NonCrossoverEngine` comes from src/common/types/engine.ts. The three dynamic-import call sites take the relocated
    module (a static import is fine where no cycle appears; check with codecheck) and pass
    `{paths: steamGame.deps.paths, requestRustInvoke: steamGame.deps.engineRuntime.requestRustInvoke}` instead of the
    engine services builder; `steamPrepareFacts` reads the global game settings through `config.getSettings()` so the
    callers pass `steamGame.deps` directly. Update games.test.ts's import path for the spied module, the schedule's
    importer lists that named the old path (bottles shim and twin), and the importer map (drop the prepareBottle key,
    whose file left the directory). The services builder's last dynamic imports in these three files go, which 87-56c
    relies on.
  </action>
  <verify>
    <automated>test ! -e src/backend/engine/prepareBottle.ts && pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/storeManagers/steam/__tests__/prepareBottle.test.ts src/backend/storeManagers/steam/__tests__/steamEngineDeps.test.ts && pnpm exec jest src/backend/storeManagers/steam --silent && pnpm codecheck && npx prettier --check src/backend/storeManagers/steam/engine/prepareBottle.ts src/backend/storeManagers/steam/__tests__/prepareBottle.test.ts src/backend/storeManagers/steam/engine/steamEngineDeps.ts src/backend/storeManagers/steam/gameEngineDialogs.ts src/backend/storeManagers/steam/gameLaunch.ts src/backend/storeManagers/steam/gameInstallBridge.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/engineWinePortComplete.test.ts</automated>
    <fails_when>non-zero exit; the `test` exits 1 because the old file still exists; jest prints "failed" (engineOutsideImporters red at the start means stop at the checkpoint); codecheck reports an error; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `git ls-files --error-unmatch src/backend/storeManagers/steam/engine/prepareBottle.ts` exits 0 and `test ! -e src/backend/engine/prepareBottle.ts` exits 0 (at HEAD the first exits 1 and the second exits 1)
    - `grep -rl "steamEngineServicesFrom" src/backend/storeManagers/steam/gameLaunch.ts src/backend/storeManagers/steam/gameEngineDialogs.ts src/backend/storeManagers/steam/gameInstallBridge.ts | wc -l` == 0 [HEAD=3 EXPECT==0 @136ea8983]
  </acceptance_criteria>
  <done>The Steam bottle switch's caller half lives with the Steam code and reaches Rust through its own transport.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: engineSync, offlineRefusal and fallbackBottleCall relocated; the Steam selection and the ledger answer from the view and Rust</name>
  <files>src/backend/storeManagers/steam/engine/engineSync.ts, src/backend/storeManagers/steam/engine/offlineRefusal.ts, src/backend/storeManagers/steam/engine/fallbackBottleCall.ts, src/backend/storeManagers/steam/__tests__/engineSync.test.ts, src/backend/storeManagers/steam/__tests__/offlineRefusal.test.ts, src/backend/storeManagers/steam/__tests__/fallbackBottleCall.test.ts, src/backend/engine/engineSync.ts, src/backend/engine/offlineRefusal.ts, src/backend/engine/fallbackBottleCall.ts, src/backend/engine/__tests__/engineSync.test.ts, src/backend/engine/__tests__/offlineRefusal.test.ts, src/backend/engine/__tests__/fallbackBottleCall.test.ts, src/backend/engine/perGameBottle.ts, src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts, src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts, src/common/types/engine.ts, src/backend/storeManagers/steam/gameLaunch.ts, src/backend/storeManagers/steam/gameEngineDialogs.ts, src/backend/storeManagers/steam/gameBridgeLaunchGate.ts, src/backend/storeManagers/steam/gameBridgeWineLaunch.ts, src/backend/storeManagers/steam/bridgeBottleLifecycle.ts, src/backend/storeManagers/steam/__tests__/games.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts, src/backend/__tests__/engineWinePortComplete.test.ts</files>
  <read_first>
    - src/backend/engine/engineSync.ts, offlineRefusal.ts, fallbackBottleCall.ts and their tests
    - src/backend/engine/bottleLedger.ts `markGameRunning` (when the TS ledger answered false) and src/backend/engine/engineRegistry.ts `setEngineSelection` (its validation, copy and log line)
    - src-tauri/crates/gamelib-engine/src/lib.rs the `engine_ledger_mark_running` arm (it answers whether the game was marked)
    - gameLaunch.ts `selectLaunchEngine` (the registry destructure and the clear helper); gameBridgeWineLaunch.ts and gameBridgeLaunchGate.ts engine-sync call sites; bridgeBottleLifecycle.ts `provisionBridgeBottle` (the services-builder dynamic import for the global settings)
  </read_first>
  <behavior>
    - recordGameRunning answers Rust's boolean; when the call fails it logs as now and answers the TS ledger's own validity rule for a Steam key and bottle name, so a launch is never refused for a transport fault the TS ledger would have accepted
    - setSteamEngineSelection refuses a key that is not a Steam app id and a non-CrossOver selection whose wine or wineserver binary is missing, copies the selection, applies it to engineSelectionView and logs the TS line; dropEngineSelection clears the view and sends the Rust clear as before
    - offlineLaunchCertainlyBlocked and createFallbackBottleCancellable answer as before at their new paths
  </behavior>
  <action>
    `git mv` the three modules and their unit tests into src/backend/storeManagers/steam/engine/ and
    src/backend/storeManagers/steam/__tests__/. engineSync.ts drops the TS ledger and registry: recordGameRunning
    returns the `markGameRunning` shim's boolean (falling back on a failed call to the TS ledger's predicate, written with
    the twin's `sanitizeBottleName` and `engineKeyFor('steam', key)`; read bottleLedger.ts for the exact rule),
    recordGameStopped and dropEngineSelection keep their Rust calls and the view clear, and a new
    `setSteamEngineSelection(key, selection)` carries the TS registry's validation and log line into a write of
    `engineSelectionView`. The three take `RustInvokeDeps` (their callers keep passing the runtime, which still carries the
    transport until 87-56c). gameLaunch.ts uses setSteamEngineSelection instead of the runtime registry. offlineRefusal
    and fallbackBottleCall take their types from src/common/types/engine.ts (add `EngineOverrideId` there; engineIds.ts
    re-exports the type). Repoint the engine-internal importers that 87-56c deletes (perGameBottle.ts and the two
    oracles) to the new paths rather than keeping copies. bridgeBottleLifecycle.ts reads the global game settings
    through `deps.config.getSettings()` instead of building the engine services. Update games.test.ts only where a moved
    module path or a registry fake is named, the schedule's bottles-shim importer list, and the importer map (drop the
    three keys; ENGINE_RUNTIME_MEMBER_READS loses gameLaunch.ts). Name offlineRefusal in the SUMMARY for 87-57.
  </action>
  <verify>
    <automated>test ! -e src/backend/engine/engineSync.ts && test ! -e src/backend/engine/offlineRefusal.ts && test ! -e src/backend/engine/fallbackBottleCall.ts && pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/storeManagers/steam/__tests__/engineSync.test.ts src/backend/storeManagers/steam/__tests__/offlineRefusal.test.ts src/backend/storeManagers/steam/__tests__/fallbackBottleCall.test.ts src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts && pnpm exec jest src/backend/storeManagers/steam src/backend/engine --silent && pnpm codecheck && pnpm backend-di-ceilings && npx prettier --check src/backend/storeManagers/steam/engine/engineSync.ts src/backend/storeManagers/steam/engine/offlineRefusal.ts src/backend/storeManagers/steam/engine/fallbackBottleCall.ts src/backend/storeManagers/steam/__tests__/engineSync.test.ts src/backend/storeManagers/steam/__tests__/offlineRefusal.test.ts src/backend/storeManagers/steam/__tests__/fallbackBottleCall.test.ts src/backend/engine/perGameBottle.ts src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts src/common/types/engine.ts src/backend/storeManagers/steam/gameLaunch.ts src/backend/storeManagers/steam/gameEngineDialogs.ts src/backend/storeManagers/steam/gameBridgeLaunchGate.ts src/backend/storeManagers/steam/gameBridgeWineLaunch.ts src/backend/storeManagers/steam/bridgeBottleLifecycle.ts src/backend/storeManagers/steam/__tests__/games.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/engineWinePortComplete.test.ts</automated>
    <fails_when>non-zero exit; a `test` exits 1 because an old file still exists; jest prints "failed"; codecheck reports an error; backend-di-ceilings prints FAIL or a jestMock increase; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - `grep -v '^\s*\(//\|\*\)' src/backend/storeManagers/steam/gameLaunch.ts | grep -cF "engineRuntime.registry"` == 0 [HEAD=1 EXPECT==0 @136ea8983]
    - `git ls-files --error-unmatch src/backend/storeManagers/steam/engine/engineSync.ts src/backend/storeManagers/steam/engine/offlineRefusal.ts src/backend/storeManagers/steam/engine/fallbackBottleCall.ts` exits 0 (at HEAD it exits 1)
    - engineOutsideImporters passes with no engineSync, offlineRefusal or fallbackBottleCall key and gameLaunch.ts gone from ENGINE_RUNTIME_MEMBER_READS
  </acceptance_criteria>
  <!-- planner-discipline-allow: engineRuntime.registry -->
  <done>The Steam launch's selection, ledger and caller-side helpers no longer touch the TS engine runtime's state.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: The sync CrossOver read and parseEngineOverride become twins with shared vectors; four intra-phase twin helpers private; the helper-module test importers repointed</name>
  <files>src/backend/enginewine/twin.ts, src/backend/enginewine/decision.ts, src/backend/enginewine/__tests__/twinVectors.test.ts, src-tauri/crates/gamelib-engine/tests/twin_vectors.rs, src-tauri/crates/gamelib-engine/tests/fixtures/vectors/bottle_twin.json, src-tauri/crates/gamelib-engine/tests/fixtures/vectors/engine_twin.json, src/backend/sidecar/bootstrap.ts, src/backend/engine/engineIds.ts, src/backend/engine/gameKey.ts, src/common/types/engine.ts, src/backend/storeManagers/steam/bridgeWineTools.ts, src/backend/storeManagers/steam/gameLaunch.ts, src/backend/enginewine/__tests__/bottlesShim.test.ts, src/backend/enginewine/__tests__/selectionView.test.ts, src/common/__tests__/enginePins.test.ts, src/backend/sidecar/__tests__/engineOverrideWriteGuard.test.ts, src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts, src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts, src/backend/storeManagers/steam/bridge/__tests__/bridgeRuntime.test.ts, src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts, src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts, src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts, src/backend/__tests__/engineWineShimSchedule.test.ts, src/backend/__tests__/engineWinePortComplete.test.ts</files>
  <read_first>
    - src/backend/engine/crossoverLocation.ts (the sync candidate order) and src-tauri/crates/gamelib-engine/src/crossover/locate.rs `resolve_bin_dir_sync` and `with_system_applications`
    - src/backend/sidecar/bootstrap.ts the 'steam-bottle' step's crossover facade only (grep `resolveCrossoverBinDir`); src/backend/storeManagers/steam/engine/crossoverBinDir.ts (how a crossover `wineVersion` becomes a hint)
    - src/backend/engine/engineIds.ts and src-tauri/crates/gamelib-engine/src/ids.rs `parse_engine_override`
    - src/backend/enginewine/__tests__/twinVectors.test.ts and tests/twin_vectors.rs (the bottle module's fake-profile tree laying, the engine_twin floors and anti-vacuity rule, the selection_twin precedent)
    - src/backend/__tests__/engineWineShimSchedule.test.ts the twin rows, `ENGINE_TWIN_IMPORTERS` and the four intra rows named in this task
  </read_first>
  <behavior>
    - crossoverBinDirSync(userHome, hintWineBins, systemApplications) answers the first of the hinted bins' CrossOver bin directories, the system Applications install and the user Applications install that holds `cxbottle`, else null, matching Rust `resolve_bin_dir_sync` with an empty memo for every vector (both answers present, over a floor)
    - parseEngineOverride answers the closed grammar for every vector (automatic, crossover, pinned and wine-manager ids, garbage to automatic) in TS and Rust
    - the bootstrap facade's sync read answers as the TS locator did (its memo is no longer written by any caller since the async lookup moved to Rust in 87-55)
  </behavior>
  <action>
    Twins (D-24 extended, the 87-55 precedent): add `crossoverBinDirSync` to twin.ts (the injectable system Applications
    directory defaults to `/Applications`), a vector group in bottle_twin.json laid as fake trees, replayed by
    twinVectors.test.ts and by twin_vectors.rs against `CrossoverLocator::with_system_applications(<fake>)`; schedule row
    (twin, 96, vectors twinVectors.test.ts). Move `parseEngineOverride`'s body into twin.ts as an exported twin with a
    vector group in engine_twin.json if that file's anti-vacuity rule admits a function that never answers null or false,
    else in a new vector file replayed the same way; schedule row (twin, 98). engine/engineIds.ts becomes a re-export of
    the twin function and the common type for the engine files 87-56c deletes. Move `EngineKey` to
    src/common/types/engine.ts (gameKey.ts re-exports it; the twin keeps importing gameKey's three helpers until 87-56c).
    The bootstrap 'steam-bottle' facade's sync read calls `crossoverBinDirSync(ctx.paths.userHome, hints)` with a
    crossover `wineVersion` folded into the hints as crossoverBinDir.ts does; add bootstrap.ts to the twin importer list.
    Repoint decision.ts's type, bridgeWineTools.ts and gameLaunch.ts to the twin and common type. Make readEngineMarker,
    hasStagingDxvk, isContradictedCrossover and isInside module-private and delete their four schedule rows (measured:
    nothing outside twin.ts imports them). Repoint the eleven outside test files in this task's list from the engine's
    types, run-tool, pins and ids modules to src/common/types/engine.ts and the twin. Update the importer map: engineIds
    has no outside importer and ENGINE_RUNTIME_MEMBER_READS is empty.
  </action>
  <verify>
    <automated>test "$(grep -rlE "[^a-z]engine/(engineTypes|runTool|enginePins|engineIds)'" src --include='*.ts' --include='*.tsx' | grep -v '^src/backend/engine/' | wc -l | tr -d ' ')" -eq 0 && pnpm exec jest --runTestsByPath src/backend/__tests__/engineWinePortComplete.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/enginewine/__tests__/twinVectors.test.ts && pnpm exec jest src/backend src/common --silent && cd src-tauri && cargo test -p gamelib-engine --test twin_vectors && cargo fmt --check -p gamelib-engine && cd .. && pnpm codecheck && pnpm backend-di-ceilings && npx prettier --check src/backend/enginewine/twin.ts src/backend/enginewine/decision.ts src/backend/enginewine/__tests__/twinVectors.test.ts src/backend/sidecar/bootstrap.ts src/backend/engine/engineIds.ts src/backend/engine/gameKey.ts src/common/types/engine.ts src/backend/storeManagers/steam/bridgeWineTools.ts src/backend/storeManagers/steam/gameLaunch.ts src/backend/enginewine/__tests__/bottlesShim.test.ts src/backend/enginewine/__tests__/selectionView.test.ts src/common/__tests__/enginePins.test.ts src/backend/sidecar/__tests__/engineOverrideWriteGuard.test.ts src/backend/storeManagers/steam/__tests__/bridgeWineTools.test.ts src/backend/storeManagers/steam/__tests__/bridgeBottleLifecycle.test.ts src/backend/storeManagers/steam/bridge/__tests__/bridgeRuntime.test.ts src/backend/storeManagers/steam/bridge/drm/__tests__/runnerClone.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.test.ts src/backend/storeManagers/steam/bridge/overlay/__tests__/overlayRunnerClone.realCrossover.test.ts src/backend/__tests__/engineWineShimSchedule.test.ts src/backend/__tests__/engineWinePortComplete.test.ts</automated>
    <fails_when>non-zero exit; the `test` exits 1 because a file outside the engine directory still imports one of the four helper modules; jest prints "failed"; cargo prints "test result: FAILED" or "Diff in"; codecheck reports an error; backend-di-ceilings prints FAIL; prettier prints "Code style issues found"</fails_when>
  </verify>
  <acceptance_criteria>
    - the outside-importer count of the engine's types, run-tool, pins and ids modules is 0 (the verify's first command) [HEAD=14 EXPECT==0 @136ea8983]
    - `grep -cE "^export function (readEngineMarker|hasStagingDxvk|isContradictedCrossover|isInside)\b" src/backend/enginewine/twin.ts` == 0 [HEAD=4 EXPECT==0 @136ea8983]
    - `grep -c "crossover.resolveCrossoverBinDir(" src/backend/sidecar/bootstrap.ts` == 0 [HEAD=1 EXPECT==0 @136ea8983]
    - `grep -c "crossoverBinDirSync" src/backend/enginewine/twin.ts` >= 1 and `grep -c "export function parseEngineOverride" src/backend/enginewine/twin.ts` == 1 [HEAD=0 EXPECT>=1 @136ea8983]
  </acceptance_criteria>
  <done>Every outside caller of src/backend/engine is gone except the type and boot plumbing 87-56c removes; the pure helpers that survive are twins pinned to Rust.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Steam launch -> engineSelectionView | the synchronous bridge reads trust what the view holds |
| TS twin -> Rust owner | a twin that drifts gives the sync path a different answer than Rust |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-87-93 | Tampering | setSteamEngineSelection | medium | mitigate | the TS registry's validation moves verbatim (Steam key shape, both binaries exist for a non-CrossOver selection, a copy is stored); engineSync.test.ts pins each refusal |
| T-87-94 | Spoofing | crossoverBinDirSync and parseEngineOverride twins | medium | mitigate | shared vector files replayed by TS and Rust with floors and both answers present (82 D-05), the 87-39/87-55 pattern |
| T-87-95 | Denial of Service | ledger answer on a transport fault | low | mitigate | a failed Rust call falls back to the TS ledger's own validity rule, so a launch is not refused for a fault the TS accepted |
| T-87-SC | Tampering | package installs | low | accept | no new package |
</threat_model>

<verification>
- engineOutsideImporters (with an empty member-read list), the schedule, the twin vectors on both sides, the Steam folder
  and the full backend and common jest pass; codecheck and backend-di-ceilings pass.
</verification>

<success_criteria>
Clusters C, D and E are switched or twinned (D-03, D-24): the only outside importers of src/backend/engine are
services/types.ts, sidecar/bootstrap.ts, stores/createStores.ts, launcher.ts's EngineStateService type,
services/engineServices.ts and the engine-runtime type in the Steam slices, all of which 87-56c removes.
</success_criteria>

## Artifacts this phase produces

- Relocated (git mv, with tests): `src/backend/storeManagers/steam/engine/{prepareBottle,engineSync,offlineRefusal,fallbackBottleCall}.ts`
- New: `setSteamEngineSelection` in `steam/engine/engineSync.ts`
- Twins and schedule rows: `crossoverBinDirSync` (twin, 96), `parseEngineOverride` (twin, 98) in `enginewine/twin.ts`, with vector groups in `bottle_twin.json` and `engine_twin.json` (or a new override vector file) replayed by `twinVectors.test.ts` and `twin_vectors.rs`
- Types moved to `src/common/types/engine.ts`: `EngineKey`, `EngineOverrideId`
- Removed schedule rows: `readEngineMarker`, `hasStagingDxvk`, `isContradictedCrossover`, `isInside` (deletedBy 87; now private)
- For 87-57: two new twin rows and the relocated `offlineLaunchCertainlyBlocked` (record them in the SUMMARY)

<output>
Create `.planning/phases/87-engine-wine-and-tools/87-56b-SUMMARY.md` when done
</output>
