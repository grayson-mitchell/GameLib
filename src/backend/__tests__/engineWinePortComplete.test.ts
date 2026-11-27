/**
 * Phase 87 per-sub-slice delete gate (87-03, D-06). The engine and wine ports are one phase with
 * several sub-slices, and each sub-slice gets its own `describe('<name>PortComplete')`, runnable
 * alone with `-t '<name>PortComplete'`, built on `runSlice` from `backend/testUtils/portSliceGate`
 * (the helper the 86 info gate uses). A slice's describe fails if a TS file the port deleted comes
 * back, a deleted identifier is named in non-test code, a TS `ipc.handle` or `ipc.on` registers one
 * of the slice's native channels, or a rollback flag string appears under src/ or src-tauri/src.
 *
 * The D-06 sub-slices, in the order the phase deletes them: runtimes (87-18, below), wineDownloads,
 * wineCore (87-24), tools, bottles, engine. A sub-slice with no describe yet has none because a `SliceSpec`
 * with nothing deleted would pass vacuously, so the plan that deletes a sub-slice adds its `describe('<name>PortComplete', () =>
 * runSlice(SPEC))` here RED first (the files and identifiers still exist), then deletes the TS and
 * watches it go green. Never lower a floor or widen an allow-list to turn a red run green.
 *
 * 87-57 adds `describe('engineWineSurvivors')` at the bottom: the explicit survivor table compared with the schedule in both
 * directions (D-21, D-22, D-23, D-24).
 *
 * D-06 no rollback: neither `GAMELIB_ENGINE` nor `GAMELIB_WINE` may appear anywhere under src/ or
 * src-tauri/src, from the first commit. There is no flag, no dual path and no fallback window; the
 * `noRollbackFlag` describe holds that for the whole phase, independent of any sub-slice. This file
 * names the two flags to forbid them and lives under `__tests__`, which the walk skips.
 *
 * Modelled on loggerPortComplete (82 D-05): every scan runs over comment-stripped text (the flag
 * scan reads raw text, so a flag named in a comment is still caught), every walk has a floor on the
 * files it read, and the self-tests at the bottom plant a violation and watch each scan fail.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { noIntraPhaseRowsLeft, SCHEDULE } from './engineWineShimSchedule.test'
import {
  findExportedValues,
  findRollbackFlag,
  findRustCalls,
  REPO_ROOT,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { StrippedFile } from 'backend/testUtils/infoPortGate'
import type { SliceSpec } from 'backend/testUtils/portSliceGate'
import {
  BACKEND_FILES_FLOOR,
  flagWalk,
  rustWalk,
  runSlice,
  RUST_FILES_FLOOR,
  SCANNED_FILES_FLOOR,
  tsWalk
} from 'backend/testUtils/portSliceGate'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** The two rollback flags D-06 forbids; named here once so the scan and its self-tests agree. */
const FORBIDDEN_FLAGS = ['GAMELIB_ENGINE', 'GAMELIB_WINE'] as const

/**
 * 87-18, D-06, D-14 and D-15: the runtimes sub-slice is Rust's. The TS slice (the lutris list, the
 * installed check, the download and its tar helper), its unit test and its oracle are deleted; the
 * goldens and the recordings stay for the Rust replay (`golden_runtimes.rs`), and so does the
 * `test_data` archive the wine-manager oracle still serves until its own port. The renderer's
 * `isRuntimeInstalled` and `downloadRuntime` are native `wine` channels, and the launcher reaches the
 * same ops through two scheduled shims (`engineWineShimSchedule`).
 */
const RUNTIMES: SliceSpec = {
  deleted: [
    'src/backend/wine/runtimes/runtimes.ts',
    'src/backend/wine/runtimes/util.ts',
    'src/backend/wine/runtimes/__tests__/runtimes/utils.test.ts',
    'src/backend/wine/__tests__/oracle/runtimes.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/runtimes',
    'src-tauri/crates/gamelib-wine/tests/fixtures/recorded/runtimes',
    'src/backend/wine/runtimes/__tests__/runtimes/test_data/ArchiveWithSubfolder.tar.xz'
  ],
  forbiddenIdentifiers: ['getAssetDataFromDownload', 'RuntimePaths'],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WINE',
  manifestSlice: 'wine',
  channelsFloor: 2
}

describe('runtimesPortComplete', () => {
  runSlice(RUNTIMES)
})

/**
 * 87-22, D-06 and D-15: the wine-downloads sub-slice is Rust's (87-19 ported it, 87-20 switched the
 * three channels). The TS wine manager (the install, the remove and the list refresh, the seven
 * release feeds and the downloader), their five unit tests and the wine-manager oracle are deleted;
 * the goldens, the state and the recordings stay for the Rust replay (`golden_wine_manager.rs`).
 * `stores.ts` stayed until 87-37, which deleted it with the `wineDownloaderInfoStore` mirror (the TS DXMT that read
 * it went in the same plan): the store's `storeTable.json` row lives on in the generator's EXTRA_ROWS so the Rust
 * `StoreHost` keeps owning it (T-87-35, D-29 row 5), and the engine's synchronous release read opens the file Rust
 * writes (`engine/wineManagerReleases.ts`).
 */
const WINE_DOWNLOADS: SliceSpec = {
  deleted: [
    'src/backend/wine/manager/utils.ts',
    'src/backend/wine/manager/downloader/main.ts',
    'src/backend/wine/manager/downloader/utilities.ts',
    'src/backend/wine/manager/downloader/constants.ts',
    'src/backend/wine/manager/__tests__/removeWineVersion.test.ts',
    'src/backend/wine/manager/downloader/__tests__/main/getter.test.ts',
    'src/backend/wine/manager/downloader/__tests__/utilities/geProtonArch.test.ts',
    'src/backend/wine/manager/downloader/__tests__/utilities/rest.test.ts',
    'src/backend/wine/manager/downloader/__tests__/utilities/unzip.test.ts',
    'src/backend/wine/__tests__/oracle/wineManager.oracle.test.ts',
    'src/backend/wine/manager/stores.ts',
    'src/backend/wine/manager'
  ],
  kept: [
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_manager',
    'src-tauri/crates/gamelib-wine/tests/fixtures/recorded/wine_manager'
  ],
  forbiddenIdentifiers: [
    'updateWineListsIfOutdated',
    'WineManagerDeps',
    'getAvailableVersions',
    'fetchReleases',
    'PROTONGE_URL',
    'WINESTAGINGMACOS_URL',
    'createWineManagerStores',
    'wineDownloaderInfoStore'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WINE',
  manifestSlice: 'wine',
  channelsFloor: 5,
  storeRowKeys: ['store/wine-downloader-info']
}

describe('wineDownloadsPortComplete', () => {
  runSlice(WINE_DOWNLOADS)
})

/**
 * 87-24, D-06, D-14, D-15 and D-22: the wine core is Rust's (87-21 ported it, 87-24 switched its callers).
 * The renderer's `wine.isValidVersion` is a native `wine` channel and `validWine` is one scheduled shim
 * (`enginewine/wineCore.ts`). 88.2-24 deleted the shim with the TS command runner, the last caller of `launcher.validWine`
 * (the member went too), and the runner's `runWineCommand` twin with its wineCore oracle and test-only env copy. The
 * fixtures that oracle recorded stay: `gamelib-wine`'s `golden_wine_core` replays them. The sync env builders
 * (`setupEnvVars`, `setupWineEnvVars`) were deleted from `launcher.ts` in 88.1-17. `validWine` is no forbidden identifier
 * because `wine_valid` (the Rust op) is named for it and the renderer's `wine.isValidVersion` runs it; it is asserted below.
 */
const WINE_CORE: SliceSpec = {
  deleted: [],
  kept: [
    'src-tauri/crates/gamelib-wine/tests/fixtures/vectors/wine_env.json',
    'src-tauri/crates/gamelib-wine/tests/fixtures/vectors/valid_wine.json',
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_command'
  ],
  forbiddenIdentifiers: [],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WINE',
  manifestSlice: 'wine',
  channelsFloor: 6
}

describe('wineCorePortComplete', () => {
  runSlice(WINE_CORE)

  it('validWine is gone from launcher.ts and enginewine/wineCore.ts is deleted (88.2-24)', () => {
    const launcher = tsWalk.files.find(
      (f) => f.path === 'src/backend/launcher.ts'
    )
    expect(launcher).toBeDefined()
    expect(launcher?.code ?? '').not.toMatch(/\bvalidWine\b/)
    expect(
      tsWalk.files.some((f) => f.path === 'src/backend/enginewine/wineCore.ts')
    ).toBe(false)
  })

  it('the renderer wine.isValidVersion is native: the sidecar registers no handle for it', () => {
    const registered = tsWalk.files.filter(
      (f) =>
        f.path.startsWith('src/backend/sidecar/') &&
        /ipc\.handle\(\s*'wine\.isValidVersion'/.test(f.code)
    )
    expect(registered.map((f) => f.path)).toEqual([])
  })
})

/**
 * 87-26, D-06, D-14, D-15 and D-22: wine discovery is Rust's (87-23 ported it, 87-26 switched its callers).
 * The renderer's `getAlternativeWine` is a native `wine` channel; `config.ts`'s `getAlternativeWine` is one
 * scheduled shim (`enginewine/wineDiscovery.ts`, `discoverAlternativeWine`); the still-TS engine's CrossOver
 * locator reaches `wine_discover_crossover` through one intra-phase shim (`enginewine/intraPhase.ts`,
 * `discoverCrossover`, removed with the engine TS in 87-56). The TS discovery functions in
 * `utils/compatibility_layers.ts` and the discovery oracle test are deleted; the goldens and vectors stay for
 * the Rust replay (`golden_discovery.rs`), and `getDefaultWineBinary` stays as a scheduled twin pinned to
 * `default_wine.json` (`enginewine/__tests__/defaultWineTwin.test.ts`), so it is not a forbidden identifier.
 */
const WINE_DISCOVERY: SliceSpec = {
  deleted: ['src/backend/wine/__tests__/oracle/wineDiscovery.oracle.test.ts'],
  kept: [
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/discovery',
    'src-tauri/crates/gamelib-wine/tests/fixtures/vectors/default_wine.json',
    'src/backend/enginewine/__tests__/defaultWineTwin.test.ts'
  ],
  forbiddenIdentifiers: [
    'getLinuxWineSet',
    'getWineOnMac',
    'getWineskinWine',
    'getCrossover',
    'getGamePortingToolkitWine',
    'getSystemGamePortingToolkitWine',
    'getWhisky',
    'getCustomWinePaths',
    'getWineLibs',
    'getMacOsWineSet',
    'WineDiscoveryDeps',
    'LinuxWineDiscoveryDeps'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WINE',
  manifestSlice: 'wine',
  channelsFloor: 7
}

describe('wineDiscoveryPortComplete', () => {
  runSlice(WINE_DISCOVERY)

  const exportsOf = (path: string): string[] => {
    const file = tsWalk.files.find((f) => f.path === path)
    expect(file).toBeDefined()
    return findExportedValues(file?.path ?? '', file?.code ?? '')
  }

  it('the discovery shims exist and the default-wine twin survives next to the deleted functions', () => {
    expect(exportsOf('src/backend/enginewine/wineDiscovery.ts')).toContain(
      'discoverAlternativeWine'
    )
    // 87-56c: `enginewine/intraPhase.ts` (the `discoverCrossover` shim) is deleted with the engine TS that used it; the
    // enginePortComplete deleted list holds that.
    const layers = exportsOf('src/backend/utils/compatibility_layers.ts')
    expect(layers).toContain('getDefaultWineBinary')
    expect(layers).toContain('getWineExecs')
  })

  it('the renderer getAlternativeWine is native: the sidecar registers no handle for it', () => {
    const registered = tsWalk.files.filter(
      (f) =>
        f.path.startsWith('src/backend/sidecar/') &&
        /ipc\.handle\(\s*'getAlternativeWine'/.test(f.code)
    )
    expect(registered.map((f) => f.path)).toEqual([])
  })
})

/**
 * 87-37, D-06, D-08, D-14 and D-15: the tools sub-slice is Rust's (87-27..87-33 ported it, 87-34..87-36 switched
 * every caller). The TS tools tree (`index`, `dxmt`, `machoExports`, `toolsState`, the five winetricks modules),
 * its unit tests and the dxvk, dxmt and winetricks oracles are deleted with the `tools-state` and
 * `winetricks-queue` boot steps. The goldens, the recordings and the pure-parse vectors stay for the Rust replay
 * (`golden_dxvk.rs`, `golden_dxmt.rs`, `golden_winetricks.rs`). The three source-text gates dropped with the
 * tree (`winetricksInstallPathInvariant`, `toolSettingsWiring`, `runWineCommandOnGameGuard`) are covered by the
 * Rust tests the 87-37 SUMMARY names.
 */
const TOOLS: SliceSpec = {
  deleted: [
    'src/backend/tools/index.ts',
    'src/backend/tools/dxmt.ts',
    'src/backend/tools/machoExports.ts',
    'src/backend/tools/toolsState.ts',
    'src/backend/tools/winetricksApplyGuard.ts',
    'src/backend/tools/winetricksEnvironment.ts',
    'src/backend/tools/winetricksListParse.ts',
    'src/backend/tools/winetricksOutputClassifier.ts',
    'src/backend/tools/winetricksQueue.ts',
    'src/backend/tools/__tests__',
    'src/backend/tools/__tests__/oracle/dxvk.oracle.test.ts',
    'src/backend/tools/__tests__/oracle/dxmt.oracle.test.ts',
    'src/backend/tools/__tests__/oracle/winetricks.oracle.test.ts',
    'src/backend/services/toolsFrom.ts',
    'src/backend/testUtils/testToolsState.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/dxvk',
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/dxmt',
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/winetricks',
    'src-tauri/crates/gamelib-wine/tests/fixtures/recorded/dxvk',
    'src-tauri/crates/gamelib-wine/tests/fixtures/recorded/dxmt',
    'src-tauri/crates/gamelib-wine/tests/fixtures/recorded/winetricks',
    'src-tauri/crates/gamelib-wine/tests/fixtures/vectors/winetricks_pure.json'
  ],
  forbiddenIdentifiers: [
    'createTools',
    'createDxvk',
    'createWinetricks',
    'createWinetricksQueue',
    'createToolsState',
    'createWinetricksEnvironment',
    'registerDxmtListeners',
    'installOrUpdateTool'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WINE',
  manifestSlice: 'wine',
  channelsFloor: 9
}

describe('toolsPortComplete', () => {
  runSlice(TOOLS)

  it('the tools directory and the tools-state and winetricks-queue boot steps are gone', () => {
    const bootstrap = tsWalk.files.find(
      (f) => f.path === 'src/backend/sidecar/bootstrap.ts'
    )
    expect(bootstrap).toBeDefined()
    expect(bootstrap?.code).not.toMatch(/'tools-state'|'winetricks-queue'/)
  })
})

/**
 * 87-43, D-06, D-08, D-16 and D-24: the bottle switch, the TS bottle primitives and the conf writer are Rust's
 * (87-38..87-41 ported them, 87-42 switched every caller). `bottlePrimitives.ts` (the kill, the guarded removal and
 * the fallback creation reference, plus the re-exports of the twin's helpers), `engineSwitch.ts` (the switcher, the
 * marker writers and the switch context) and `adoptBottle.ts` (the cxbottle.conf writer) are deleted with their unit
 * tests and the two bottle oracles. The fake that stood in for Rust's bottle ops no longer runs a TS reference. The
 * goldens, the state bottles and the vectors stay for the Rust replay (`golden_bottles.rs`, `golden_switch.rs`,
 * `switch_incidents.rs`, `twin_vectors.rs`).
 *
 * Four modules the plan named stay, because the still-TS launch step (`launchEngine.ts`, `toolSettings.ts`,
 * `gameEngineState.ts`, `engineDecision.ts`) still calls them synchronously until 87-50..87-56 move it to Rust:
 * `bottleLedger.ts` (the running-games mirror `engineDecision` reads), `engineRegistry.ts` (the validating selection
 * registry over the view), `perGameBottle.ts` (`ensureGameBottle`) and `gamePrefix.ts` (`resolveGamePrefix`). The two
 * identifiers of the gate that name them (`createBottleLedger`, `createEngineRegistry`, `createPerGameBottleFlights`,
 * `resolveGamePrefix`) are therefore not forbidden here; the engine slice's own gate (87-56) forbids them.
 */
const BOTTLES: SliceSpec = {
  deleted: [
    'src/backend/engine/bottlePrimitives.ts',
    'src/backend/engine/engineSwitch.ts',
    'src/backend/engine/adoptBottle.ts',
    'src/backend/engine/__tests__/bottlePrimitives.test.ts',
    'src/backend/engine/__tests__/engineSwitch.test.ts',
    'src/backend/engine/__tests__/adoptBottle.test.ts',
    'src/backend/engine/__tests__/oracle/bottles.oracle.test.ts',
    'src/backend/engine/__tests__/oracle/engineSwitch.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-engine/tests/fixtures/state/bottles',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/switch',
    'src-tauri/crates/gamelib-engine/tests/fixtures/vectors/bottle_twin.json',
    'src-tauri/crates/gamelib-engine/tests/fixtures/vectors/selection_registry.json'
  ],
  forbiddenIdentifiers: [
    'createEngineSwitcher',
    'EngineSwitcher',
    'EngineSwitchDeps',
    'EngineSwitchContext',
    'buildCxbottleConf',
    'writeCxbottleConf',
    'switchServicesFrom',
    'switchContextFrom'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_ENGINE',
  manifestSlice: 'engine',
  channelsFloor: 3
}

describe('bottlesPortComplete', () => {
  runSlice(BOTTLES)

  // 87-56c: the engine runtime (`engine/engineRuntime.ts`) this test also read is deleted, so its "builds no switcher" half
  // goes with its subject; enginePortComplete holds the deletion.
  it('the bottle fake runs no TS reference', () => {
    const fake = tsWalk.files.find(
      (f) => f.path === 'src/backend/testUtils/fakeBottleRust.ts'
    )
    expect(fake).toBeDefined()
    expect(fake?.code).not.toMatch(/bottlePrimitives/)
  })
})

/**
 * 87-56, D-06 and D-21: the engine sub-slice, as far as it can go. 87-52 moved the launch step to Rust (the select,
 * the settings read, the deadline and the end), 87-53 the dialogs and the flows, 87-54 the Steam decision, deadline and
 * state record, 87-55 the bridge's tool runs. `launchEngine.ts` (the step, its deadline arming and its end),
 * `launchDeadline.ts`, `gameProcessWatch.ts` (the first-match watcher), `engineDialogs.ts` and `pinEngine.ts` (the TS
 * pin download the step handed its switch) have no caller left, so they are deleted with their unit tests, the launch
 * oracle and `legacyBottleUntouched.test.ts` (it ran the TS step over a legacy bottle; the legacy bottle is replayed
 * by `gamelib-engine`'s switch goldens, `switch_incidents.rs`, and its launch goldens). The runtime builds no
 * deadlines and no per-launch state. The launch goldens stay for the Rust replay (`golden_launch.rs`).
 *
 * `processListing.ts` (the `ps` / `pgrep` listing) moved to `storeManagers/steam/`, beside the one monitor that reads it.
 *
 * 87-56c deleted the rest: `src/backend/engine` does not exist, with its tests, the four oracles and
 * `oracle/fixtureBottles.ts`, as do `services/engineServices.ts`, `testUtils/testEngineRuntime.ts`,
 * `testUtils/testEngineState.ts` and `enginewine/intraPhase.ts`. The two census tests that guarded live code
 * (`launcherOverlayCensus` for `launcher.ts`, T-61-43, and `managerOverlayCensus` for the store managers, T-61-45) moved to
 * `src/backend/__tests__` unchanged in what they assert, and are `kept` below. The measured-importer map
 * (`describe('engineOutsideImporters')`) that 87-56a added to drive the switches is gone with the directory it mapped:
 * the deleted list below supersedes it, and the TS factories and builders that died are forbidden identifiers. The
 * `engineRuntime` and `engineState` boot steps and deps members, the `steam_engine_notices` TS registration (its
 * `storeTable.json` row stays for the Rust host, `storeRowKeys`) and the "engine runtime builds no launch deadlines"
 * check (its subject is gone) went in the same plan. `noIntraPhaseRowsLeft(SCHEDULE)` is called below over the
 * schedule `engineWineShimSchedule.test.ts` exports (importing that file registers its own tests here too). The identifiers
 * below are the ones the deleted files owned and no scheduled shim or Steam caller reuses (`armEngineLaunchDeadline`,
 * `bindDeadlineToMonitor` and `showEngineDialog` are names the launch shims and the Steam files carry too, so they
 * cannot be forbidden).
 */
const ENGINE: SliceSpec = {
  deleted: [
    'src/backend/engine/launchEngine.ts',
    'src/backend/engine/launchDeadline.ts',
    'src/backend/engine/gameProcessWatch.ts',
    'src/backend/engine/engineDialogs.ts',
    'src/backend/engine/pinEngine.ts',
    'src/backend/engine/processListing.ts',
    'src/backend/engine/__tests__/launchEngine.test.ts',
    'src/backend/engine/__tests__/launchEngine.deadline.test.ts',
    'src/backend/engine/__tests__/launchDeadline.test.ts',
    'src/backend/engine/__tests__/gameProcessWatch.test.ts',
    'src/backend/engine/__tests__/processListing.test.ts',
    'src/backend/engine/__tests__/legacyBottleUntouched.test.ts',
    'src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts',
    // 87-56c: the rest of the engine directory, the services builder, the two test helpers and the intra-phase shim list.
    'src/backend/engine/__tests__/bottleLedger.test.ts',
    'src/backend/engine/__tests__/crossoverLocation.test.ts',
    'src/backend/engine/__tests__/defined.ts',
    'src/backend/engine/__tests__/demoStatus.test.ts',
    'src/backend/engine/__tests__/engineConfig.test.ts',
    'src/backend/engine/__tests__/engineDecision.test.ts',
    'src/backend/engine/__tests__/engineIds.test.ts',
    'src/backend/engine/__tests__/engineRegistry.test.ts',
    'src/backend/engine/__tests__/engineRuntime.test.ts',
    'src/backend/engine/__tests__/engineState.test.ts',
    'src/backend/engine/__tests__/fallbackEngine.test.ts',
    'src/backend/engine/__tests__/fixtures/stub-cxbottle.sh',
    'src/backend/engine/__tests__/fixtures/stub-wine.sh',
    'src/backend/engine/__tests__/gameEngineState.test.ts',
    'src/backend/engine/__tests__/gameKey.test.ts',
    'src/backend/engine/__tests__/gamePrefix.test.ts',
    'src/backend/engine/__tests__/launchSettings.test.ts',
    'src/backend/engine/__tests__/oracle/engineConfig.oracle.test.ts',
    'src/backend/engine/__tests__/oracle/engineDecision.oracle.test.ts',
    'src/backend/engine/__tests__/oracle/engineState.oracle.test.ts',
    'src/backend/engine/__tests__/oracle/fallbackEngine.oracle.test.ts',
    'src/backend/engine/__tests__/oracle/fixtureBottles.ts',
    'src/backend/engine/__tests__/perGameBottle.test.ts',
    'src/backend/engine/__tests__/pinnedEngineProgress.test.ts',
    'src/backend/engine/__tests__/testedCrossoverVersions.test.ts',
    'src/backend/engine/__tests__/toolSettings.test.ts',
    'src/backend/engine/bottleLedger.ts',
    'src/backend/engine/crossoverLocation.ts',
    'src/backend/engine/demoStatus.ts',
    'src/backend/engine/engineConfig.ts',
    'src/backend/engine/engineDecision.ts',
    'src/backend/engine/engineEligibility.ts',
    'src/backend/engine/engineIds.ts',
    'src/backend/engine/engineNoticeStore.ts',
    'src/backend/engine/enginePins.ts',
    'src/backend/engine/engineRegistry.ts',
    'src/backend/engine/engineRuntime.ts',
    'src/backend/engine/engineServices.ts',
    'src/backend/engine/engineState.ts',
    'src/backend/engine/engineTypes.ts',
    'src/backend/engine/fallbackEngine.ts',
    'src/backend/engine/gameEngineState.ts',
    'src/backend/engine/gameKey.ts',
    'src/backend/engine/gamePrefix.ts',
    'src/backend/engine/launchSettings.ts',
    'src/backend/engine/perGameBottle.ts',
    'src/backend/engine/pinnedEngineProgress.ts',
    'src/backend/engine/testedCrossoverVersions.ts',
    'src/backend/engine/toolSettings.ts',
    'src/backend/engine/wineManagerReleases.ts',
    'src/backend/services/engineServices.ts',
    'src/backend/testUtils/testEngineRuntime.ts',
    'src/backend/testUtils/testEngineState.ts',
    'src/backend/enginewine/intraPhase.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/launch',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/config',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/decision',
    // 87-56c: the Rust replay's fixtures, which outlive the TS oracles that read some of them, and the two census tests
    // that guard live code and move out of the engine tree.
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/bottles',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/config',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/demo_status',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/fallback',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/state',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/switch',
    'src-tauri/crates/gamelib-engine/tests/fixtures/vectors',
    'src/backend/storeManagers/steam/engine/prepareBottle.ts',
    'src/backend/storeManagers/steam/engine/engineSync.ts',
    'src/backend/storeManagers/steam/engine/offlineRefusal.ts',
    'src/backend/storeManagers/steam/engine/fallbackBottleCall.ts',
    'src/backend/__tests__/launcherOverlayCensus.test.ts',
    'src/backend/__tests__/managerOverlayCensus.test.ts'
  ],
  forbiddenIdentifiers: [
    'createLaunchEngineState',
    'LaunchEngineState',
    'createLaunchDeadlines',
    'LaunchDeadlines',
    'watchForGameProcess',
    'deriveGameProcessPrefixes',
    'deriveGameProcessPrefix',
    'GameProcessWatchDeps',
    'showEngineNotice',
    'notifyEngineFallback',
    'ensurePinEngineFrom',
    'EnsurePinEngine',
    // 87-56c: the TS factories and builders that die with the directory.
    'createEngineRuntime',
    'createEngineState',
    'createFallbackEngine',
    'createLaunchSettingsRegistry',
    'createCrossoverLocator',
    'createEngineRegistry',
    'createBottleLedger',
    'createPerGameBottleFlights',
    'createEngineStores',
    'engineServicesFrom',
    'steamEngineServicesFrom',
    'requireEngineRuntime',
    'createTestEngineRuntime',
    'createTestEngineState',
    'EngineStateService'
  ],
  // 87-56c: the Rust host still opens `steam_engine_notices`; only its TS registration goes.
  storeRowKeys: ['store_cache/steam_engine_notices'],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_ENGINE',
  manifestSlice: 'engine',
  channelsFloor: 3
}

describe('enginePortComplete', () => {
  runSlice(ENGINE)

  it('no schedule row has deletedBy 87: every intra-phase shim is gone with the engine TS (87-56c, D-21)', () => {
    expect(() => noIntraPhaseRowsLeft(SCHEDULE)).not.toThrow()
  })
})

describe('noRollbackFlag', () => {
  it('anti-vacuity: the walks read real trees', () => {
    assertAtOrAboveFloor(
      'engineWinePortComplete src and meta files',
      tsWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'engineWinePortComplete src-tauri/src files',
      rustWalk.count,
      RUST_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'engineWinePortComplete src/backend files',
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')).length,
      BACKEND_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'engineWinePortComplete flag walk files',
      flagWalk.count,
      SCANNED_FILES_FLOOR
    )
  })

  it.each(FORBIDDEN_FLAGS)(
    'no %s rollback flag text exists in src/ or src-tauri/src',
    (flag) => {
      expect(findRollbackFlag(flagWalk.files, flag)).toEqual([])
    }
  )

  describe('planted violations', () => {
    const planted = (path: string, raw: string) => ({
      path,
      raw,
      code: raw
    })

    it('self-test: a planted flag is caught in code, in a comment and as a longer name, a different flag is not', () => {
      const files = [
        planted('flag.ts', "const on = process.env['GAMELIB_ENGINE']"),
        planted('doc.rs', '// GAMELIB_WINE=0 falls back'),
        planted('longer.ts', "process.env['GAMELIB_ENGINE_SWITCH']"),
        planted('other.ts', "process.env['GAMELIB_INFO_SLICE']")
      ]
      expect(findRollbackFlag(files, 'GAMELIB_ENGINE')).toEqual([
        'flag.ts',
        'longer.ts'
      ])
      expect(findRollbackFlag(files, 'GAMELIB_WINE')).toEqual(['doc.rs'])
    })

    it('self-test: a planted tree holding the flag string is walked and the scan returns it', () => {
      const dir = mkdtempSync(join(tmpdir(), 'engine-wine-port-complete-'))
      try {
        mkdirSync(join(dir, 'src', 'backend', '__tests__'), { recursive: true })
        mkdirSync(join(dir, 'src-tauri', 'src'), { recursive: true })
        writeFileSync(
          join(dir, 'src', 'backend', 'a.ts'),
          "export const a = process.env['GAMELIB_ENGINE']\n"
        )
        writeFileSync(
          join(dir, 'src-tauri', 'src', 'b.rs'),
          '// GAMELIB_WINE is the old switch\nfn b() {}\n'
        )
        writeFileSync(
          join(dir, 'src', 'backend', 'clean.ts'),
          'export const clean = 1\n'
        )
        writeFileSync(
          join(dir, 'src', 'backend', '__tests__', 'gate.ts'),
          "process.env['GAMELIB_ENGINE']\n"
        )
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        expect(walk.count).toBe(3)
        expect(findRollbackFlag(walk.files, 'GAMELIB_ENGINE')).toEqual([
          'src/backend/a.ts'
        ])
        expect(findRollbackFlag(walk.files, 'GAMELIB_WINE')).toEqual([
          'src-tauri/src/b.rs'
        ])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('self-test: an empty directory walks no files and fails the flag-walk floor', () => {
      const dir = mkdtempSync(join(tmpdir(), 'engine-wine-port-complete-'))
      try {
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        expect(walk.count).toBe(0)
        expect(findRollbackFlag(walk.files, 'GAMELIB_ENGINE')).toEqual([])
        expect(() =>
          assertAtOrAboveFloor(
            'engineWinePortComplete flag walk files',
            walk.count,
            SCANNED_FILES_FLOOR
          )
        ).toThrow(/engineWinePortComplete flag walk files/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})

/**
 * 87-57 (D-21, D-22, D-23, D-24; T-87-88): the phase's last code plan compares the final schedule with the survivor list
 * item by item, in both directions. `EXPECTED_SURVIVORS` is written out by hand, one name per row, and is never derived
 * from `SCHEDULE`: a schedule row nobody wrote down here fails as an extra, a row written down here that the schedule lost
 * fails as missing, and a row whose shape or wiring helper changed fails as both. The comparison key is (file, name,
 * shape, wiring); `deletedBy` is held to 88..98 for every row but is not part of the key, because a later plan may move a
 * deleting phase to the latest phase among a row's callers without changing what survives.
 *
 * 66 rows (78 until 88.1-15, 73 until 88.1-17, 69 until 88.1-19, 68 until 88.2-24) and three wiring helpers. The plan's table named 70; the 87-56a and 87-56b splits added five rows the plan was
 * written before (`resolveEngineToolSettings`, `resolveNonCrossoverEngine`, `ensureFallbackEngine`, `crossoverBinDirSync`,
 * `parseEngineOverride`), and two rows were created by plans 87-42 (`cancelFallbackBottle`, a bottles shim) and 87-54
 * (`bridgeDeadlines`, the D-24 view over the bridge deadline callbacks) that the plan's table did not list. Plan 87-70
 * added the 78th, `removeGameBottle`, on the user's 2026-11-24 gap decision 5. Plan 88.1-15 deleted five launcher-only rows
 * (`isRuntimeInstalled`, `downloadRuntime`, `dxvkInstallRemove`, `winetricksListInstalled`, `armEngineLaunchDeadline`), 78 to 73.
 * Plan 88.1-17 deleted four more: the two launcher env builder twins (`setupEnvVars`, `setupWineEnvVars`) and the two wine
 * manager shims `downloadDefaultWine` called (`installWineVersion`, `listWineReleases`), 73 to 69. Plan 88.1-19 deleted `updateWineVersionInfos`, a wine manager shim
 * with no TS caller left, with its channel, 69 to 68. Plan 88.2-24 deleted the last two rows 88.2 owned, the `validWine`
 * shim (`enginewine/wineCore.ts`) and the `createCommandRunner` twin (`commandRunner.ts`), 68 to 66.
 */
type ScheduleShape = (typeof SCHEDULE)[number]['shape']

interface Survivor {
  file: string
  name: string
  shape: ScheduleShape
  wiring?: readonly string[]
}

const ENGINEWINE = 'src/backend/enginewine'
const RESOLVERS_FILE = 'src/backend/sidecar/engineWineResolvers.ts'

/** One survivor row per name in `names`, all in `file` with `shape`; each name is written out, never matched. */
const rowsOf = (
  file: string,
  shape: ScheduleShape,
  names: readonly string[]
): Survivor[] => names.map((name) => ({ file, name, shape }))

const EXPECTED_SURVIVORS: readonly Survivor[] = [
  ...rowsOf(`${ENGINEWINE}/wineManager.ts`, 'shim', ['wineReleasesInfoReady']),
  ...rowsOf(`${ENGINEWINE}/wineDiscovery.ts`, 'shim', [
    'discoverAlternativeWine'
  ]),
  ...rowsOf('src/backend/utils/compatibility_layers.ts', 'twin', [
    'getDefaultWineBinary'
  ]),
  ...rowsOf(`${ENGINEWINE}/engineOnline.ts`, 'shim', ['setEngineOnline']),
  {
    file: RESOLVERS_FILE,
    name: 'toggleDXVK',
    shape: 'resolver',
    wiring: ['registerEngineWineResolvers']
  },
  ...rowsOf(RESOLVERS_FILE, 'resolver', [
    'toggleDXVKNVAPI',
    'toggleVKD3D',
    'winetricksApply',
    'winetricksAvailable',
    'winetricksInstalled',
    'runWineCommand',
    'runWineCommandForGame',
    'callTool',
    'getEngineState'
  ]),
  ...rowsOf(`${ENGINEWINE}/tools.ts`, 'shim', ['winetricksInstallVerbs']),
  ...rowsOf(`${ENGINEWINE}/twin.ts`, 'twin', [
    'engineKeyFor',
    'isWritableEngineOverride',
    'importEngineSettings',
    'getPerGameBottleNameFor',
    'getBottleDir',
    'sanitizeBottleName',
    'isBottleProvisioned',
    'buildFallbackGameSettings',
    'readBottleEngineMarkerKind',
    'readBottleEngineMarkerSummary',
    'restoreNeedsAbsentPin',
    'isPinnedEngineInstalled',
    'ENGINE_PINS',
    'pinById',
    'isNonCrossover',
    'engineLogLabel',
    'crossoverBinDirSync',
    'parseEngineOverride'
  ]),
  ...rowsOf(`${ENGINEWINE}/bottles.ts`, 'shim', [
    'prepareBottleForEngine',
    'killBottleWineServerWith',
    'removeCreatedBottleDir',
    // 87-70 (F5): the per-game bottle removal. The user's 2026-11-24 gap decision 5 is the authority that extends the
    // D-22/D-23/D-24 survivor list by this one row: `utils/uninstaller.ts` `removePrefix` is its only caller.
    'removeGameBottle',
    'createFallbackBottle',
    'cancelFallbackBottle',
    'reconcileBottleEngineMarker',
    'recordPinnedBottleEngine',
    'recordCrossoverBottleEngine',
    'markGameRunning',
    'markGameStopped',
    'clearEngineSelection'
  ]),
  {
    file: `${ENGINEWINE}/selectionView.ts`,
    name: 'engineSelectionView',
    shape: 'view',
    wiring: ['registerEngineSelectionView']
  },
  ...rowsOf(`${ENGINEWINE}/launch.ts`, 'shim', [
    'selectEngineForLaunch',
    'endEngineLaunch',
    'getLaunchSettings',
    'engineDialogDisplayed'
  ]),
  ...rowsOf(`${ENGINEWINE}/decision.ts`, 'shim', [
    'decideLaunchEngine',
    'decideCreationEngine',
    'preflightCrossover',
    'isCrossoverMissing',
    'resolveCrossoverBinDir'
  ]),
  ...rowsOf(`${ENGINEWINE}/runTool.ts`, 'shim', [
    'rustRunTool',
    'cancelRunTool'
  ]),
  {
    file: `${ENGINEWINE}/deadline.ts`,
    name: 'armBridgeDeadline',
    shape: 'shim',
    wiring: ['registerEngineDeadlineFired']
  },
  ...rowsOf(`${ENGINEWINE}/deadline.ts`, 'shim', ['cancelBridgeDeadline']),
  ...rowsOf(`${ENGINEWINE}/deadline.ts`, 'view', ['bridgeDeadlines']),
  ...rowsOf(`${ENGINEWINE}/state.ts`, 'shim', [
    'publishOverlayNotice',
    'publishOverlayExitNotice',
    'recordLaunchDecision'
  ]),
  ...rowsOf(`${ENGINEWINE}/toolSettings.ts`, 'shim', [
    'resolveEngineToolSettings',
    'resolveNonCrossoverEngine'
  ]),
  ...rowsOf(`${ENGINEWINE}/fallback.ts`, 'shim', ['ensureFallbackEngine'])
]

/** D-23: the ten resolvers, no others. */
const D23_RESOLVERS: readonly string[] = [
  'getEngineState',
  'winetricksApply',
  'winetricksAvailable',
  'winetricksInstalled',
  'toggleDXVK',
  'toggleDXVKNVAPI',
  'toggleVKD3D',
  'runWineCommand',
  'runWineCommandForGame',
  'callTool'
]

/** D-22: the wine command core's twins that live outside `enginewine/twin.ts`. */
const D22_TWINS: readonly string[] = ['getDefaultWineBinary']

/** D-24: the bridge's sync `bottlePrimitives` helpers, the pin table and its lookup. */
const D24_BRIDGE_HELPERS: readonly string[] = [
  'getBottleDir',
  'sanitizeBottleName',
  'isBottleProvisioned',
  'buildFallbackGameSettings',
  'readBottleEngineMarkerKind',
  'readBottleEngineMarkerSummary',
  'restoreNeedsAbsentPin',
  'isPinnedEngineInstalled',
  'ENGINE_PINS',
  'pinById'
]

/** D-24: the write-through views (the selection read and the bridge deadline callbacks). */
const D24_VIEWS: readonly string[] = ['engineSelectionView', 'bridgeDeadlines']

/** D-24 extensions, each flagged by the plan that added it (87-28, 87-55, 87-56a, 87-56b). */
const D24_EXTENSIONS: readonly string[] = [
  'engineKeyFor',
  'isWritableEngineOverride',
  'importEngineSettings',
  'getPerGameBottleNameFor',
  'isNonCrossover',
  'engineLogLabel',
  'crossoverBinDirSync',
  'parseEngineOverride'
]

/**
 * Non-test `src/backend` files outside the survivor files that may name a `RUST_ENGINE_` or `RUST_WINE_` constant: the
 * sidecar's one typed channel list, which carries every Rust channel the sidecar may invoke. Nothing else; the
 * `testUtils` fakes that answer those channels are test support and are not walked.
 */
const CHANNEL_NAMING_ALLOWED: readonly string[] = [
  'src/backend/sidecar/sidecarRpc.ts'
]

const CHANNEL_CONSTANT = /\bRUST_(?:ENGINE|WINE)_[A-Z0-9_]+\b/
const CHANNEL_PREFIXES = ['RUST_ENGINE_', 'RUST_WINE_'] as const

/** The comparison key: file, name, shape and the wiring helpers a row names. */
const survivorKey = (r: Survivor): string =>
  `${r.file}#${r.name} (${r.shape}${
    r.wiring && r.wiring.length > 0
      ? `, wiring ${[...r.wiring].sort().join('+')}`
      : ''
  })`

/** `expected` against `actual` in both directions, by key; duplicates on either side are reported too. */
function compareSurvivors(
  expected: readonly Survivor[],
  actual: readonly Survivor[]
): { missing: string[]; extra: string[]; duplicates: string[] } {
  const exp = expected.map(survivorKey)
  const act = actual.map(survivorKey)
  const dupes = (keys: string[]): string[] =>
    keys.filter((k, i) => keys.indexOf(k) !== i)
  return {
    missing: exp.filter((k) => !act.includes(k)),
    extra: act.filter((k) => !exp.includes(k)),
    duplicates: [...dupes(exp), ...dupes(act)]
  }
}

/** Files in `files` that name a channel constant and are neither a survivor file nor explicitly allowed. */
function unscheduledChannelFiles(
  files: readonly StrippedFile[],
  survivorFiles: readonly string[],
  allowed: readonly string[]
): string[] {
  return files
    .filter((f) => CHANNEL_CONSTANT.test(f.code))
    .map((f) => f.path)
    .filter((p) => !survivorFiles.includes(p) && !allowed.includes(p))
}

describe('engineWineSurvivors', () => {
  const asSurvivor = (r: (typeof SCHEDULE)[number]): Survivor => ({
    file: r.file,
    name: r.name,
    shape: r.shape,
    ...(r.wiring ? { wiring: r.wiring } : {})
  })
  // Phase 88 schedules its own shims under `src/backend/launchrust/` in the same SCHEDULE (88-12). This table is Phase
  // 87's final survivor list, so it compares the rows outside that directory; the launch rows are pinned by
  // `engineWineShimSchedule.test.ts` (shape, channel, callers, `deletedBy`) and by 88's own port-complete gates.
  const actual: Survivor[] = SCHEDULE.filter(
    (r) => !r.file.startsWith('src/backend/launchrust/')
  ).map(asSurvivor)
  const survivorFiles = [...new Set(EXPECTED_SURVIVORS.map((r) => r.file))]
  const names = (rows: readonly Survivor[]): string[] =>
    rows.map((r) => r.name).sort()
  const sorted = (list: readonly string[]): string[] => [...list].sort()

  /** Non-test src/backend TypeScript, with the test-support directory left out. */
  const productionBackend = tsWalk.files.filter(
    (f) =>
      /\.tsx?$/.test(f.path) &&
      f.path.startsWith('src/backend/') &&
      !f.path.startsWith('src/backend/testUtils/')
  )

  it('the table holds 66 rows, three of them naming a wiring helper (anti-vacuity)', () => {
    assertAtOrAboveFloor(
      'EXPECTED_SURVIVORS rows',
      EXPECTED_SURVIVORS.length,
      66
    )
    expect(EXPECTED_SURVIVORS).toHaveLength(66)
    expect(
      EXPECTED_SURVIVORS.filter((r) => r.wiring).map((r) => r.name)
    ).toEqual(['toggleDXVK', 'engineSelectionView', 'armBridgeDeadline'])
  })

  it('SCHEDULE equals EXPECTED_SURVIVORS by (file, name, shape, wiring), in both directions', () => {
    expect(compareSurvivors(EXPECTED_SURVIVORS, actual)).toEqual({
      missing: [],
      extra: [],
      duplicates: []
    })
  })

  it('every survivor file exists, so no row outlives its module', () => {
    for (const file of survivorFiles) {
      expect(existsSync(join(REPO_ROOT, file))).toBe(true)
    }
  })

  it('every row is scheduled for deletion in a phase from 88 to 98 (D-15; none left in 87)', () => {
    expect(
      SCHEDULE.filter((r) => r.deletedBy < 88 || r.deletedBy > 98).map(
        (r) => `${r.file}#${r.name}: ${r.deletedBy}`
      )
    ).toEqual([])
  })

  it('D-23: the resolver rows are exactly the ten resolvers, all in engineWineResolvers.ts', () => {
    const resolvers = actual.filter((r) => r.shape === 'resolver')
    expect(names(resolvers)).toEqual(sorted(D23_RESOLVERS))
    expect(resolvers.every((r) => r.file === RESOLVERS_FILE)).toBe(true)
    expect(D23_RESOLVERS).toHaveLength(10)
  })

  it('D-22: the twins outside enginewine/twin.ts are exactly getDefaultWineBinary (88.1-17 deleted the two env builders, 88.2-24 createCommandRunner)', () => {
    const outside = actual.filter(
      (r) => r.shape === 'twin' && r.file !== `${ENGINEWINE}/twin.ts`
    )
    expect(names(outside)).toEqual(sorted(D22_TWINS))
  })

  it('D-24: the twin.ts rows and the view rows are exactly the bridge helpers, the two views and the flagged extensions', () => {
    const d24 = actual.filter(
      (r) => r.file === `${ENGINEWINE}/twin.ts` || r.shape === 'view'
    )
    expect(names(d24)).toEqual(
      sorted([...D24_BRIDGE_HELPERS, ...D24_VIEWS, ...D24_EXTENSIONS])
    )
    expect(names(actual.filter((r) => r.shape === 'view')).join()).toEqual(
      sorted(D24_VIEWS).join()
    )
  })

  it('src/backend/engine, src/backend/tools and src/backend/wine/manager do not exist', () => {
    for (const dir of [
      'src/backend/engine',
      'src/backend/tools',
      'src/backend/wine/manager'
    ]) {
      expect(existsSync(join(REPO_ROOT, dir))).toBe(false)
    }
  })

  it('only the survivor files and the sidecar channel list name a RUST_ENGINE_ or RUST_WINE_ constant', () => {
    assertAtOrAboveFloor(
      'engineWineSurvivors production src/backend files',
      productionBackend.length,
      BACKEND_FILES_FLOOR
    )
    const naming = productionBackend.filter((f) =>
      CHANNEL_CONSTANT.test(f.code)
    )
    // A walk that finds no naming file proves nothing; the survivor files and the channel list name them today.
    assertAtOrAboveFloor(
      'engineWineSurvivors files naming a channel constant',
      naming.length,
      12
    )
    expect(
      unscheduledChannelFiles(
        productionBackend,
        survivorFiles,
        CHANNEL_NAMING_ALLOWED
      )
    ).toEqual([])
  })

  it('every requestRustInvoke call on a RUST_ENGINE_ or RUST_WINE_ channel sits in a survivor file', () => {
    const calls = findRustCalls(productionBackend, CHANNEL_PREFIXES)
    assertAtOrAboveFloor(
      'engineWineSurvivors engine and wine channel calls',
      calls.length,
      40
    )
    expect(
      calls.filter((c) => !survivorFiles.includes(c.path)).map((c) => c.path)
    ).toEqual([])
  })

  describe('planted violations', () => {
    const planted = (path: string, code: string): StrippedFile => ({
      path,
      raw: code,
      code
    })
    const base: readonly Survivor[] = EXPECTED_SURVIVORS
    const row = (over: Partial<Survivor> = {}): Survivor => ({
      file: `${ENGINEWINE}/wineDiscovery.ts`,
      name: 'planted',
      shape: 'shim',
      ...over
    })

    it('self-test: a schedule row the table does not name fails as extra', () => {
      const result = compareSurvivors(EXPECTED_SURVIVORS, [...base, row()])
      expect(result.extra).toEqual([survivorKey(row())])
      expect(result.missing).toEqual([])
    })

    it('self-test: a table row the schedule lost fails as missing', () => {
      const result = compareSurvivors(EXPECTED_SURVIVORS, base.slice(1))
      expect(result.missing).toEqual([survivorKey(EXPECTED_SURVIVORS[0]!)])
      expect(result.extra).toEqual([])
    })

    it('self-test: a changed shape, a changed wiring helper and a duplicated row each fail', () => {
      const first = base[0]!
      const shapeChanged = compareSurvivors(EXPECTED_SURVIVORS, [
        { ...first, shape: 'twin' },
        ...base.slice(1)
      ])
      expect(shapeChanged.missing).toHaveLength(1)
      expect(shapeChanged.extra).toHaveLength(1)

      const wired = base.findIndex((r) => r.name === 'engineSelectionView')
      const wiringChanged = compareSurvivors(EXPECTED_SURVIVORS, [
        ...base.slice(0, wired),
        { ...base[wired]!, wiring: ['registerSomethingElse'] },
        ...base.slice(wired + 1)
      ])
      expect(wiringChanged.missing).toHaveLength(1)
      expect(wiringChanged.extra).toHaveLength(1)

      const duplicated = compareSurvivors(EXPECTED_SURVIVORS, [...base, first])
      expect(duplicated.duplicates).toEqual([survivorKey(first)])
    })

    it('self-test: a planted file naming a channel constant outside the table and the channel list is caught', () => {
      const files = [
        planted(
          'src/backend/enginewine/wineDiscovery.ts',
          'requestRustInvoke(RUST_WINE_RUNTIME_DOWNLOAD)'
        ),
        planted(
          'src/backend/sidecar/sidecarRpc.ts',
          'RUST_ENGINE_BOTTLE_PREPARE'
        ),
        planted(
          'src/backend/storeManagers/steam/stray.ts',
          'requestRustInvoke(RUST_ENGINE_RUN_TOOL, {})'
        ),
        planted('src/backend/clean.ts', 'export const clean = 1')
      ]
      expect(
        unscheduledChannelFiles(files, survivorFiles, CHANNEL_NAMING_ALLOWED)
      ).toEqual(['src/backend/storeManagers/steam/stray.ts'])
      expect(
        findRustCalls(files, CHANNEL_PREFIXES)
          .filter((c) => !survivorFiles.includes(c.path))
          .map((c) => c.path)
      ).toEqual(['src/backend/storeManagers/steam/stray.ts'])
    })

    it('self-test: an empty walk fails the production-files floor', () => {
      expect(() =>
        assertAtOrAboveFloor(
          'engineWineSurvivors production src/backend files',
          0,
          BACKEND_FILES_FLOOR
        )
      ).toThrow(/engineWineSurvivors production src\/backend files/)
    })
  })
})
