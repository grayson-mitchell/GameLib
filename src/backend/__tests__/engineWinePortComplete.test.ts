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
import {
  findExportedValues,
  findImporters,
  findRollbackFlag,
  walkStripped
} from 'backend/testUtils/infoPortGate'
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
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
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
 * (`enginewine/wineCore.ts`). No TS file is deleted outright: the sync env builders (`setupEnvVars`,
 * `setupWineEnvVars`) and the command runner's `runWineCommand` stay as scheduled twins pinned by the
 * same goldens until Phase 88 (D-22), so the fixtures and the wineCore oracle that vector them are kept.
 * The one removed export is `validWine` from `launcher.ts`, which cannot be a forbidden identifier because
 * the shim carries the name; it is asserted below instead.
 */
const WINE_CORE: SliceSpec = {
  deleted: [],
  kept: [
    'src-tauri/crates/gamelib-wine/tests/fixtures/vectors/wine_env.json',
    'src-tauri/crates/gamelib-wine/tests/fixtures/vectors/valid_wine.json',
    'src-tauri/crates/gamelib-wine/tests/fixtures/golden/wine_command',
    'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts'
  ],
  forbiddenIdentifiers: [],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WINE',
  manifestSlice: 'wine',
  channelsFloor: 6
}

describe('wineCorePortComplete', () => {
  runSlice(WINE_CORE)

  it('launcher.ts exports no validWine; the shim in enginewine/wineCore.ts does', () => {
    const launcher = tsWalk.files.find(
      (f) => f.path === 'src/backend/launcher.ts'
    )
    expect(launcher).toBeDefined()
    expect(
      findExportedValues(launcher?.path ?? '', launcher?.code ?? '')
    ).not.toContain('validWine')
    const shim = tsWalk.files.find(
      (f) => f.path === 'src/backend/enginewine/wineCore.ts'
    )
    expect(findExportedValues(shim?.path ?? '', shim?.code ?? '')).toContain(
      'validWine'
    )
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
    expect(exportsOf('src/backend/enginewine/intraPhase.ts')).toContain(
      'discoverCrossover'
    )
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

  it('the engine runtime builds no switcher and the bottle fake runs no TS reference', () => {
    const runtime = tsWalk.files.find(
      (f) => f.path === 'src/backend/engine/engineRuntime.ts'
    )
    expect(runtime).toBeDefined()
    expect(runtime?.code).not.toMatch(/switcher/)
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
 * The rest of `src/backend/engine` stays, and the 87-56 SUMMARY lists why, module by module: a live TS caller outside
 * the engine still reads it (the Steam launch and install files read the caller-side halves `prepareBottle`,
 * `engineSync`, `offlineRefusal`, `fallbackBottleCall` and `pinnedEngineProgress`; the Wine tools
 * read `toolSettings`; the boot builds `engineRuntime` and `engineState`), or one of its oracles replays it against
 * goldens Rust also owns (`engineConfig.oracle`, `engineDecision.oracle`, `engineState.oracle`,
 * `fallbackEngine.oracle`). Those modules and the `describe('enginePortComplete')` that deletes them whole are owed to
 * the plan that routes their callers (see the SUMMARY's decision list). The identifiers below are the ones the deleted
 * files owned and no scheduled shim or Steam caller reuses (`armEngineLaunchDeadline`, `bindDeadlineToMonitor` and
 * `showEngineDialog` are names the launch shims and the Steam files carry too, so they cannot be forbidden).
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
    'src/backend/engine/__tests__/oracle/launchEngine.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/launch',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/config',
    'src-tauri/crates/gamelib-engine/tests/fixtures/golden/decision'
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
    'EnsurePinEngine'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_ENGINE',
  manifestSlice: 'engine',
  channelsFloor: 3
}

describe('enginePortComplete', () => {
  runSlice(ENGINE)

  it('the engine runtime builds no launch deadlines and no per-launch state', () => {
    const runtime = tsWalk.files.find(
      (f) => f.path === 'src/backend/engine/engineRuntime.ts'
    )
    expect(runtime).toBeDefined()
    expect(runtime?.code).not.toMatch(/deadlines|launchState/)
  })
})

/**
 * 87-56a, the 87-56 lesson: a deletion plan that assumes "every caller already switched" was wrong for six clusters, and
 * the miss surfaced only at the first delete. This map is the MEASURED set of live non-test importers, outside
 * `src/backend/engine`, of every non-test module under it (alias and relative specifiers, dynamic imports and requires;
 * `testUtils` files count as tests), written out and never derived. An unlisted caller fails here instead of at a
 * deletion; every later switch in 87-56a/b/c removes its row entries in the same commit. Never widen a list to pass.
 */
const ENGINE_OUTSIDE_IMPORTERS: Record<string, readonly string[]> = {
  bottleLedger: [],
  crossoverLocation: [],
  demoStatus: [],
  engineConfig: [],
  engineDecision: [],
  engineEligibility: [],
  engineIds: [
    'src/backend/enginewine/decision.ts',
    'src/backend/enginewine/twin.ts',
    'src/backend/storeManagers/steam/bridgeWineTools.ts',
    'src/backend/storeManagers/steam/gameLaunch.ts'
  ],
  engineNoticeStore: ['src/backend/stores/createStores.ts'],
  enginePins: [],
  engineRegistry: [],
  engineRuntime: [
    'src/backend/services/types.ts',
    'src/backend/sidecar/bootstrap.ts',
    'src/backend/storeManagers/steam/bottle.ts',
    'src/backend/storeManagers/steam/bridge/drm/drmLaunchSetup.ts',
    'src/backend/storeManagers/steam/bridge/drm/runnerCrossover.ts',
    'src/backend/storeManagers/steam/bridge/overlay/overlayLaunch.ts',
    'src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts',
    'src/backend/storeManagers/steam/bridgeBottle.ts',
    'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
    'src/backend/storeManagers/steam/provisionBottle.ts'
  ],
  engineServices: ['src/backend/services/engineServices.ts'],
  engineState: [
    'src/backend/launcher.ts',
    'src/backend/services/types.ts',
    'src/backend/sidecar/bootstrap.ts'
  ],
  engineSync: [
    'src/backend/storeManagers/steam/gameBridgeLaunchGate.ts',
    'src/backend/storeManagers/steam/gameBridgeWineLaunch.ts',
    'src/backend/storeManagers/steam/gameLaunch.ts'
  ],
  engineTypes: [],
  fallbackBottleCall: [
    'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts'
  ],
  fallbackEngine: [],
  gameEngineState: [],
  gameKey: ['src/backend/enginewine/twin.ts'],
  gamePrefix: [],
  launchSettings: [],
  offlineRefusal: [
    'src/backend/storeManagers/steam/gameEngineDialogs.ts',
    'src/backend/storeManagers/steam/gameLaunch.ts'
  ],
  perGameBottle: [],
  pinnedEngineProgress: [],
  prepareBottle: [
    'src/backend/storeManagers/steam/engine/steamEngineDeps.ts',
    'src/backend/storeManagers/steam/gameEngineDialogs.ts',
    'src/backend/storeManagers/steam/gameInstallBridge.ts',
    'src/backend/storeManagers/steam/gameLaunch.ts'
  ],
  runTool: [],
  testedCrossoverVersions: [],
  toolSettings: [],
  wineManagerReleases: ['src/backend/services/engineServices.ts']
}

/**
 * The files outside the engine directory that read a member of the engine runtime (`ledger`, `registry`, `crossover`,
 * `fallback`, `launchSettings`, `perGameBottle`), directly or through `requireEngineRuntime(...)`, with the members each
 * reads. Slimming the runtime (87-56b) and deleting the members' modules (87-56c) edit this in the same commit.
 */
const ENGINE_RUNTIME_MEMBER_READS: Record<string, readonly string[]> = {
  'src/backend/sidecar/bootstrap.ts': ['crossover'],
  'src/backend/storeManagers/steam/gameLaunch.ts': ['registry']
}

const ENGINE_DIR = 'src/backend/engine'
const RUNTIME_MEMBER_RE =
  /(?:requireEngineRuntime\([^)]*\)|[eE]ngineRuntime)\??\.(ledger|registry|crossover|fallback|launchSettings|perGameBottle)\b/g

const outsideEngineFiles = (files: readonly StrippedFileLike[]) =>
  files.filter(
    (f) =>
      f.path.startsWith('src/') &&
      !f.path.startsWith(`${ENGINE_DIR}/`) &&
      !f.path.startsWith('src/backend/testUtils/') &&
      !/\.test\./.test(f.path)
  )

interface StrippedFileLike {
  path: string
  code: string
}

function engineImportersOf(
  files: readonly StrippedFileLike[]
): Record<string, string[]> {
  const outside = outsideEngineFiles(files)
  const modules = readdirSync(join(REPO_ROOT_FOR_GATE, ENGINE_DIR))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
  const out: Record<string, string[]> = {}
  for (const m of modules) {
    out[m] = findImporters(
      outside.map((f) => ({ ...f, raw: f.code })),
      `${ENGINE_DIR}/${m}.ts`
    ).sort()
  }
  return out
}

function runtimeMemberReadsOf(
  files: readonly StrippedFileLike[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const f of outsideEngineFiles(files)) {
    const members = new Set<string>()
    for (const m of f.code.matchAll(RUNTIME_MEMBER_RE)) members.add(m[1]!)
    if (members.size > 0) out[f.path] = [...members].sort()
  }
  return out
}

const REPO_ROOT_FOR_GATE = process.cwd()

describe('engineOutsideImporters', () => {
  it('the map has one key per non-test module under src/backend/engine', () => {
    const modules = readdirSync(join(REPO_ROOT_FOR_GATE, ENGINE_DIR))
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(Object.keys(ENGINE_OUTSIDE_IMPORTERS).sort()).toEqual(modules)
  })

  it('every engine module has exactly its listed live importers outside the engine directory', () => {
    expect(engineImportersOf(tsWalk.files)).toEqual(
      Object.fromEntries(
        Object.entries(ENGINE_OUTSIDE_IMPORTERS).map(([k, v]) => [
          k,
          [...v].sort()
        ])
      )
    )
  })

  it('the engine runtime members are read outside the directory only where listed', () => {
    expect(runtimeMemberReadsOf(tsWalk.files)).toEqual(
      ENGINE_RUNTIME_MEMBER_READS
    )
  })

  it('self-test: a planted importer and a planted member read are each reported', () => {
    const planted = [
      {
        path: 'src/backend/services/plantedCaller.ts',
        raw: '',
        code: "import { x } from 'backend/engine/runTool'\nconst y = engineRuntime.perGameBottle\n"
      }
    ]
    expect(engineImportersOf(planted)['runTool']).toEqual([
      'src/backend/services/plantedCaller.ts'
    ])
    expect(
      runtimeMemberReadsOf(planted)['src/backend/services/plantedCaller.ts']
    ).toEqual(['perGameBottle'])
    // a test file and a testUtils file are not importers
    const quiet = [
      {
        path: 'src/backend/services/plantedCaller.test.ts',
        raw: '',
        code: "import { x } from 'backend/engine/runTool'\n"
      }
    ]
    expect(engineImportersOf(quiet)['runTool']).toEqual([])
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
