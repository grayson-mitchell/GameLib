import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import type { GameConfigSlice } from 'backend/game_config'
import type { SteamDrm } from '../bridge/drm/drmLaunchSetup'
import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { createTestEngineState } from 'backend/testUtils/testEngineState'
import {
  createTestManagerDeps,
  createInertSteamProcesses,
  createTestManagers,
  createTestServices,
  createTestStores
} from 'backend/testUtils/testServices'
import type { AppPaths } from 'backend/process/context'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestBridgeHelpers } from 'backend/testUtils/testBridgeHelpers'
/**
 * Unit tests for SteamGame — LIB-04 (lazy metadata), GAME-01 (launch), GAME-04 (no-Wine),
 * and supporting read methods (getSettings, getExtraInfo, isGameAvailable).
 *
 * Mock strategy follows Phase 1 user.test.ts patterns:
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - ../state is NOT mocked — real library Map + pendingFetches Set used,
 *    cleared in beforeEach
 */
import axios from 'axios'
import i18next from 'i18next'
import { readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

/**
 * Every game*.ts module beside games.ts, discovered from the directory (the 62
 * split moved code out of games.ts, so negative source scans must see them all).
 * Uses the real fs: graceful-fs is mocked below, but node:fs is not.
 */
const gameModuleFiles = (): string[] => {
  const files = jest
    .requireActual<typeof import('node:fs')>('node:fs')
    .readdirSync(join(__dirname, '..'))
    .filter((f) => /^game.*\.ts$/.test(f))
  // anti-vacuity: 13 game*.ts modules exist today
  expect(files).toContain('games.ts')
  expect(files.length).toBeGreaterThanOrEqual(13)
  return files
}
const sendFrontendMessage = jest.fn()
import * as shortcutsModule from '../../../shortcuts/shortcuts/shortcuts'
import { TITLE_AUTHORITATIVE_KEYS } from '../titleSettings'
import SteamGame from '../games'
import * as gameMetadata from '../gameMetadata'
import * as gameInstallDepot from '../gameInstallDepot'
import * as gameLaunchModule from '../gameLaunch'
import * as stopSteamLaunchedModule from '../stopSteamLaunchedGame'
import * as steamLaunchWatchModule from '../steamLaunchWatch'
import type { SteamLaunchWatchRegistry } from '../steamLaunchWatch'
import * as gameBridgeLaunchModule from '../gameBridgeLaunch'
import * as gameBridgeLaunchGateModule from '../gameBridgeLaunchGate'
import { launchBridgeGame } from '../gameBridgeLaunchGate'
import { fireBridgeWineLaunch } from '../gameBridgeWineLaunch'
import { prepareTcpOverlay } from '../gameLaunchOverlay'
import * as gameInstallBridgeModule from '../gameInstallBridge'
import { checkBottleEligibility } from '../gameEligibility'
import {
  buildDrmLaunchEnvironment,
  drmBottleWinPath,
  prepareDrmTraceFile,
  drmWineLogPathFor,
  drmWineDebugFromEnv,
  createDrmWineLogAppender,
  relogDrmTrace,
  DRM_DLLPATH_CHANNEL,
  DRM_DLLOVERRIDES_CHANNEL,
  DRM_TRACE_KEEP_PER_APP,
  MAC_STEAM_CLIENT_SUBPATH,
  createDrmModeNoticeLatch
} from '../gameDrmLaunch'
import { buildSteamProtocolUrl } from '../gameProtocolUrl'
import { createPlatformCaptureQueue } from '../platformCapture'
import type { SteamLaunchRuntime } from '../steamLaunchRuntime'
import {
  parseSteamStorageRequirement,
  getSteamInstallSize,
  parseSteamMacMinOSVersion,
  macArchFromMinOS
} from '../gameRequirements'
import {
  markForcedWindowsViaBottle,
  clearForcedWindowsViaBottle
} from '../gameSessionState'
import SteamLibraryManager from '../library'
import * as uninstallPollingModule from '../library/uninstallPolling'
import * as installPollingModule from '../library/installPolling'
import * as resumeModule from '../library/resume'
import * as installStopModule from '../library/installStop'
import * as acfState from '../library/acfState'
import * as macArch from '../library/macArch'
// Phase 51 Plan 09 Task 3: namespace import so setBridgeUserRoute (real,
// unmocked module — bridgeVerdict.ts is never jest.mock'd in this file) can
// be spied per-test to assert the forced-userRoute clear on a scan miss,
// mirroring the libraryModule spy pattern immediately above.
import * as bridgeVerdictModule from '../bridge/bridgeVerdict'
// 260821-rb5: namespace import so isNativeInstallInFlight (a games.ts export
// consumed by library.ts's init()) can be spied per-test to simulate a
// process restart's cleared in-memory registry — mirrors the same pattern
// library.test.ts already uses for the reverse direction (T-23-14).
import * as gamesModule from '../gameSessionState'
import { getBottleSteamappsDir } from '../bottle'
import {
  provisionBridgeBottle,
  discardNewBridgeBottle,
  removePerGameBridgeBottle,
  stopPerGameBridgeBottle,
  killBridgeBottleWineServer
} from '../bridgeBottleLifecycle'
import { isBridgeBottleReady, getBridgeBottleSettings } from '../bridgeBottle'
import {
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall
} from '../bottledSteam'
import {
  getBottleDir,
  buildFallbackGameSettings
} from 'backend/engine/bottlePrimitives'
import type { DrmLaunchForm } from '../bridgeBottle'
import type {
  DrmDllPathChannel,
  DrmDllOverridesChannel
} from '../gameDrmLaunch'
import { createMockSteamUser } from 'backend/testUtils/testSteamUser'
const steamUser = createMockSteamUser()
import type { GameInfo, InstallParams } from 'common/types'
import {
  isSteamNativeDeleteEnabled,
  isSteamNativeInstallEnabled
} from '../nativeInstallSetting'
import { decideSteamNativeDelete } from '../nativeDelete'
import { isSteamExperimentalInstallAppEnabled } from '../experimentalInstallAppSetting'
import { requestSteamInstallApp } from '../steamInstallApp'
import { downloadSteamDepots, prescreenBridgeDepots } from '../depot'
import { ensureSteamClientReady } from '../clientSetup'
import {
  resolveSteamInstallTarget,
  resolveSteamLibraryRoot,
  UnsafeInstalldirError
} from '../installLocation'
import { STEAM_PICS_TIMEOUT_MS } from '../withTimeout'
import { bridgeAllowlist } from '../bridge/allowlist'
import { knownFixSaysCeg } from '../drmKnownFix'
import { placeShimForGame } from '../bridge/shimGenerate'
import { detectDrmWrapper } from '../bridge/shimDrmWrapper'
import { detectSteamDrmInPe } from '../bridge/peScan'
import { restoreBridgeSteamApiOriginals } from '../bridge/originalRestore'
import {
  resolveBridgeLaunchExe,
  resolveBridgeLaunchWorkingDir
} from '../bridge/launchTarget'
import { ensureBridgeHelperReady } from '../bridge/helperProcess'
import { writeBridgeConfig } from '../bridge/bridgeConfig'
import {
  applySteamBridgeKnownFixes,
  steamBridgeLaunchCommandParts
} from '../bridgeKnownFixes'
import { createSharedRedistInstaller } from '../bridge/sharedRedistInstall'

// The mocked installer below hands out one shared jest.fn from every factory call.
const { installSteamBridgeSharedRedists } = createSharedRedistInstaller({
  versioning: createTestVersioning()
})
import {
  decideCreationEngine,
  decideLaunchEngine,
  preflightCrossover
} from 'backend/engine/engineDecision'
import {
  readBottleEngineMarkerKind,
  restoreNeedsAbsentPin
} from 'backend/engine/engineSwitch'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import { createTestEngineRuntime } from 'backend/testUtils/testEngineRuntime'
import { checkConnectivityNow } from 'backend/connectivityNow'
import { ENGINE_PINS } from 'backend/engine/enginePins'
import { existsSync } from 'graceful-fs'
import { getSteamLibraries, sendGameStatusUpdate } from 'backend/utils'
// 260821-rb5: only needed by this task's case-C self-heal test (2) —
// asserts init()'s startup surfacing loop against a StateFlags=4 ACF.
import { notify } from 'backend/dialog/dialog'
import { parse } from '@node-steam/vdf'
// Real (unmocked) fs/path/os — used only by the SharedDepots-scoping
// regression test below, which proves uninstallBottleGameDirectly()'s
// deletion is scoped correctly against a REAL temp directory tree, the
// same "real-disk fixture" pattern library.test.ts's own startup-resume
// reconciliation suite already uses (mkdtempSync + rmSync in
// beforeEach/afterEach). games.ts's own rmSync (node:fs) is never mocked
// anywhere in this file, so this is exercising real filesystem behavior,
// not a mock.
import {
  mkdtempSync,
  rmSync as realRmSync,
  existsSync as realExistsSync,
  writeFileSync,
  mkdirSync
} from 'node:fs'
import { join as realJoin } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * quick 261108-anw: make the NEXT node:fs rmSync throw EACCES (gameUninstall
 * reaches rmSync via a CJS property access, so a spy intercepts it). The
 * caller must mockRestore() before any real-fs cleanup.
 */
function failNextRmSync(): jest.SpyInstance {
  return jest
    .spyOn(jest.requireActual<typeof import('node:fs')>('node:fs'), 'rmSync')
    .mockImplementationOnce(() => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
    })
}

/** The single uninstall-failed notice pushed, for the given title. */
function expectOneFailedNotice(title: string): void {
  const calls = sendFrontendMessage.mock.calls.filter(
    (c) => c[0] === 'steamRequestNotice'
  )
  expect(calls).toHaveLength(1)
  expect(calls[0][1]).toEqual(
    expect.objectContaining({
      appId: APP_ID,
      title,
      kind: 'uninstall-failed',
      seq: expect.any(Number)
    })
  )
}
import { reportDetectedFix } from 'backend/knownFixReport'
// The abort registry is injected into the manager deps (66.4-13): these control the
// AbortController create/call/delete lifecycle for the native depot-download path (D-02).
const createAbortController = jest.fn()
const callAbortController = jest.fn()
const deleteAbortController = jest.fn()
const hasAbortController = jest.fn()
const getAbortSignal = jest.fn()
import { at } from './fixtures/indexed'
import type { Stores } from 'backend/services/types'

import { createTestGlobalConfig } from 'backend/testUtils/testConfig'

// `libDeps` is declared before steamTestDeps; the scan reads the library map through the same instance.
const libDeps = {
  config: createTestGlobalConfig(),
  requestRustInvoke: jest.fn(),
  get steamSession() {
    return steamTestDeps.steamSession
  }
}

const { steamMetadataStore, steamLibraryStore } =
  jest.requireMock<Stores['steam']>('../stores')
const steamStoresModule = jest.requireMock<Stores['steam']>('../stores')

// The bridge launch reaches runWineCommand through the commandRunner slice.
const runWineCommand = jest.fn()

// quick 261111-9mj: the steam manager carries the per-boot launch-watch registry.
const launchWatches: SteamLaunchWatchRegistry = new Map()
const drmStandIn: Partial<SteamDrm> = {
  drmLaunchSetup: (...args: Parameters<SteamDrm['drmLaunchSetup']>) =>
    jest
      .requireMock<{
        drmLaunchSetup: SteamDrm['drmLaunchSetup']
      }>('../bridge/drm/drmLaunchSetup')
      .drmLaunchSetup(...args),
  prefetchDrmDownloads: () => Promise.resolve({ status: 'not-applicable' })
}

// The engine state is a boot-owned slice now (D-66.3-12): the recording fakes are injected through
// the deps instead of a module mock.
const publishOverlayExitNotice = jest.fn()
const publishOverlayNotice = jest.fn()
const recordLaunchDecision = jest.fn()

// The boot-owned bridge-helper registry's per-appId stop (D-66.3-14), observed by the cases below.
const stopBridgeHelper = jest.fn()
// 66.3-15: the bottle helpers are read through the deps slice, so they are plain mocks here.
// quick 261024-cjq: after reset crossoverInstalled() is undefined, which reads as installed.
const crossoverInstalled = jest.fn()
const isBottleReady = jest.fn()
const getSteamBottleSettings = jest.fn()
// Recording fakes for the host services the manager deps expose (shell.openExternal, the
// main-window raise, dialog.showMessageBox); the tests assert on these.
const hostFakes = {
  shell: { openExternal: jest.fn() },
  app: { raiseMainWindow: jest.fn() },
  dialog: { showMessageBox: jest.fn() }
}
// One engine runtime on a fake clock for the whole file (the boot instance of production); the
// tests below clear what they register (selection, ledger, deadline) exactly as before.
const mockPrepareBottleForEngine = jest.fn()
const mockEnsurePinnedEngine = jest.fn()
const mockIsPinnedEngineInstalled = jest.fn()
const gamesClock = createFakeClock()
const testRuntime = createTestEngineRuntime({ clock: gamesClock })
const getEngineSelection = (k: string) =>
  testRuntime.registry.getEngineSelection(k)
const clearEngineSelection = (k: string) =>
  testRuntime.registry.clearEngineSelection(k)
const gamesRunningIn = (bottle: string) =>
  testRuntime.ledger.gamesRunningIn(bottle)
const __activeLaunchDeadlineCount = () => testRuntime.deadlines.activeCount()
const cancelLaunchDeadline = (k: string, reason: 'superseded') =>
  testRuntime.deadlines.cancelLaunchDeadline(k, reason)
// The launch deadline runs on the runtime clock; timers the mocked redist step arms use jest's.
const advanceBoth = async (ms: number) => {
  // Let the launch reach its arm point (microtasks) before the runtime clock moves.
  await jest.advanceTimersByTimeAsync(0)
  gamesClock.advance(ms)
  await jest.advanceTimersByTimeAsync(ms)
}
const advanceBothSync = (ms: number) => {
  gamesClock.advance(ms)
  jest.advanceTimersByTime(ms)
}
const resetBottleLedger = () => {
  for (const bottle of ['GameLibSteam', 'GameLib']) {
    for (const key of testRuntime.ledger.gamesRunningIn(bottle)) {
      testRuntime.ledger.markGameStopped(bottle, key)
    }
  }
}
// 66.4-06: the Steam launch runtime is a set of recording fakes handed through the deps slice.
// startBottleProcessMonitor ties the helper's lifetime to the game's own process after a successful
// wine launch; the phase probe and stop serve the single-flight check (quick/261024-gvu): with
// resetMocks they return undefined (falsy = no live monitor) unless a test sets them. The DRM
// runner registry carries the Phase 60 overlay surface; the notice latch is a real, resettable one.
const startBottleProcessMonitor = jest.fn()
const getBottleProcessMonitorPhase = jest.fn()
const stopBottleProcessMonitor = jest.fn()
const getDrmBridgeRunner = jest.fn()
let drmNoticeLatch = createDrmModeNoticeLatch()
const __resetDrmModeNoticeShownForTests = () => {
  drmNoticeLatch = createDrmModeNoticeLatch()
}
const testSteamLaunchRuntime = {
  monitors: {
    startBottleProcessMonitor: (...a: unknown[]) =>
      startBottleProcessMonitor(...a),
    stopBottleProcessMonitor: (...a: unknown[]) =>
      stopBottleProcessMonitor(...a),
    getBottleProcessMonitorPhase: (...a: unknown[]) =>
      getBottleProcessMonitorPhase(...a),
    stopAllBottleProcessMonitors: jest.fn(),
    getActiveMonitorKind: jest.fn()
  },
  drmRunners: {
    getDrmBridgeRunner: (...a: unknown[]) => getDrmBridgeRunner(...a),
    clearDrmBridgeRunner: jest.fn(),
    setOverlayBridgeRunner: jest.fn(),
    setDrmBridgeRunner: jest.fn(),
    getBridgeRunnerKind: jest.fn(),
    drmRunnerBinDir: jest.fn()
  },
  drmNotice: { claim: (key: string) => drmNoticeLatch.claim(key) },
  raiser: {
    raiseFrontmostBottledProcess: jest.fn(),
    cancelRaiseLoops: jest.fn()
  },
  platformCapture: createPlatformCaptureQueue()
} as unknown as SteamLaunchRuntime
// 66.4-06: the launch files read the app folder, the home and the built dylib paths from deps.paths,
// so the Phase 56 test-owned roots (declared here) ride the paths slice.
const mockedLaunchPaths: Pick<
  AppPaths,
  | 'appFolder'
  | 'userHome'
  | 'builtOverlayInputPath'
  | 'builtOverlayInputProbePath'
> = {
  // Phase 56 (56-12): no test writes under a real app folder.
  builtOverlayInputPath: join(
    tmpdir(),
    `gamelib input games-test-${process.pid}`,
    'overlay_input.dylib'
  ),
  builtOverlayInputProbePath: join(
    tmpdir(),
    `gamelib probe games-test-${process.pid}`,
    'overlay_input_probe.dylib'
  ),
  appFolder: join(tmpdir(), `gamelib drm games-test-${process.pid}`),
  userHome: createContainedHomeAppPaths().userHome
}
const steamTestDeps = createTestManagerDeps({
  sendFrontendMessage,
  aborts: {
    create: (id: string) => createAbortController(id),
    call: (id: string) => callAbortController(id),
    delete: (id: string) => deleteAbortController(id),
    has: (id: string) => hasAbortController(id),
    getSignal: (id: string) => getAbortSignal(id),
    abortAll: () => undefined
  },
  engineRuntime: testRuntime,
  steamLaunchRuntime: testSteamLaunchRuntime,
  paths: {
    ...createTestServices().paths,
    appFolder: mockedLaunchPaths.appFolder,
    userHome: mockedLaunchPaths.userHome,
    builtOverlayInputPath: mockedLaunchPaths.builtOverlayInputPath,
    builtOverlayInputProbePath: mockedLaunchPaths.builtOverlayInputProbePath
  },
  steamUser,
  steamBottle: {
    isBottleReady,
    getSteamBottleSettings,
    isCrossoverInstalled: async () => crossoverInstalled() !== false
  } as never,
  bridgeHelpers: { ...createTestBridgeHelpers(), stop: stopBridgeHelper },
  engineState: {
    ...createTestEngineState(),
    publishOverlayExitNotice,
    publishOverlayNotice,
    recordLaunchDecision
  },
  // The i386-recovery confirm goes through deps.dialogs; hostFakes records it.
  dialogs: {
    ...createTestHostServices().dialogs,
    showMessageBox: (...a: unknown[]) => hostFakes.dialog.showMessageBox(...a)
  },
  // The steam:// hand-offs, the main-window raise and the per-game config go through deps; the
  // platform / game_config mocks below stay the recording fakes the assertions read.
  openExternal: {
    ...createTestHostServices().openExternal,
    openExternal: (...a: unknown[]) => hostFakes.shell.openExternal(...a)
  },
  appState: {
    ...createTestHostServices().appState,
    raiseMainWindow: () => hostFakes.app.raiseMainWindow()
  },
  gameConfigs: {
    get: (appName: string) =>
      (
        jest.requireMock('backend/game_config').GameConfig.get as (
          appName: string
        ) => GameConfigSlice
      )(appName)
  },
  steamProcesses: createInertSteamProcesses({
    // The DRM instance: its launch setup is the jest.fn()-backed stand-in the
    // '../bridge/drm/drmLaunchSetup' mock below exports (not-applicable by default).
    drm: drmStandIn as SteamDrm
  }),
  stores: createTestStores({ steam: steamStoresModule }),
  commandRunner: { runWineCommand } as never,
  libraryManagers: createTestManagers({
    library: { steam: { launchWatches } as never }
  }).library
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library
const pendingFetches = steamTestDeps.steamSession.libraryState.pendingFetches
// The boot-owned per-session game maps (D-66.3-13): one instance for this file, cleared between cases.
const gameSession = steamTestDeps.steamSession.gameSession
const markBridgeFailedThisSession = (appId: string) =>
  gameSession.markBridgeFailedThisSession(appId)
const clearBridgeFailedThisSession = (appId: string) =>
  gameSession.clearBridgeFailedThisSession(appId)
const resetBridgeFailedSession = () =>
  gameSession.bridgeFailedThisSession.clear()
const resetBridgeLaunchBottles = () => gameSession.bridgeLaunchBottles.clear()
const resetLoggedEmptyGameInfoMisses = () =>
  gameSession.loggedEmptyGameInfoMisses.clear()

jest.mock('backend/knownFixReport', () => ({
  reportDetectedFix: jest.fn(),
  knownFixReportDeps: () => ({ post: () => undefined })
}))

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── axios mock — controls store appdetails API responses ─────────────────────
jest.mock('axios')
// steam/games.ts now imports the shared shortcuts module, whose import graph pulls fs-extra,
// which cannot load under this file's graceful-fs mock (quick 261026-c7r).
jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: jest.fn(),
  removeShortcuts: jest.fn(),
  shortcutFiles: jest.fn()
}))

// ── Metadata cache store mock — controls steamMetadataStore ──────────────────
// Phase 74 plan 09: the gate is covered in updateLaunchPrompt.test.ts; here it must not
// perturb this file's bottle-settings read counts.
jest.mock('../updateLaunchPrompt', () => ({
  gateBridgeLaunchOnUpdate: jest.fn().mockResolvedValue('launch')
}))
jest.mock('../stores', () => ({
  configStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn(),
    clear: jest.fn()
  },
  steamLibraryStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn(),
    // 260821-rb5: SteamLibraryManager.init() unconditionally calls
    // migrateStaleArtUrls(), which iterates steamMetadataStore.entries() —
    // needed by the new case-C breadcrumb tests below, which are the first
    // tests in this file to exercise a real init() call.
    entries: jest.fn().mockReturnValue([])
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── dialog notify mock ────────────────────────────────────────────────────────
jest.mock('backend/dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn()),
  showDialogBoxModalAuto: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))

// ── GameConfig mock — ensures getSettings() returns defaults ─────────────────
jest.mock('backend/game_config', () => ({
  GameConfig: {
    get: jest.fn().mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue({
        autoSyncSaves: false,
        savesPath: '',
        gogSaves: [],
        wineVersion: { name: 'Wine', type: 'wine', bin: '' },
        winePrefix: '',
        wineCrossoverBottle: '',
        autoInstallDxvk: false,
        autoInstallDxvkNvapi: false,
        autoInstallVkd3d: false,
        preferSystemLibs: false,
        enableEsync: false,
        enableFsync: false,
        enableFsrSharpening: false,
        maxSharpening: false,
        enableDXVKFpsLimit: false,
        DXVKFpsCap: '0',
        targetExe: '',
        verboseLogs: false,
        launcherArgs: '',
        enviromentOptions: [],
        wrapperOptions: []
      })
    })
  }
}))

// ── Mocks required when SteamLibraryManager is imported for integration test ──
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))
jest.mock('@node-steam/vdf', () => ({ parse: jest.fn() }))
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
// quick-260817-d61: ensureConnected added -- getExtraInfo()'s locked->unlocked
// keyring-deferral transition now fire-and-forgets a call to it. Defaulted to
// a resolved promise so resetMocks:true (which wipes even a factory-supplied
// implementation before every test) never leaves it undefined, which would
// throw synchronously before the fire-and-forget .catch() is even reached.
// G25: the fresh connectivity check taken at Play. Default (set in the file-level
// beforeEach, since resetMocks wipes it) is online.
jest.mock('backend/connectivityNow', () => ({
  checkConnectivityNow: jest.fn()
}))
// ── backend/constants/environment mock — mutable double, defaults to non-mac ─
// (mirrors library.test.ts's pattern) so pre-existing tests keep their
// pre-Phase-17 behavior (isBottleEligible() short-circuits false) unless a
// test explicitly flips envMock.isMac = true.
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))

// ── bottle.ts mock — Phase 17 bottle-routing surface (isBottleReady,
// tellBottledSteamTo*, getSteamBottleSettings). Fully replaced (not spied) —
// bottle.ts pulls in backend/config's heavy transitive chain and lazily
// imports backend/launcher, neither of which games.test.ts needs to exercise.
jest.mock('backend/engine/bottlePrimitives', () => ({
  buildFallbackGameSettings: jest.fn(),
  // Phase 51 Plan 01 (D-51-01): launchBridgeGame()'s bottleProcessMonitor
  // wiring resolves the bottle dir via this.
  getBottleDir: jest.fn(),
  // Plan 61-05: bottleLedger validates the bottle name with the real guard.
  sanitizeBottleName: (name: string | null) =>
    typeof name === 'string' && name.trim() && !/[/\\\0]|\.\./.test(name)
      ? name.trim()
      : null
}))
jest.mock('../bottle', () => {
  return {
    CROSSOVER_MISSING: 'crossover-missing',
    CROSSOVER_CREATE_TIMEOUT: 'crossover-create-timeout',
    CROSSOVER_CREATE_FAILED: 'crossover-create-failed',
    PROVISION_ABORTED: 'provision-aborted',
    // Phase 21 Plan 11 (D-15/SNI-08): bottle depot-download write target.
    getBottleSteamappsDir: jest.fn()
  }
})
jest.mock('../bridgeBottleLifecycle', () => ({
  discardNewBridgeBottle: jest.fn(),
  endPerGameBridgeBottleSessionWith: jest.fn(),
  killBridgeBottleWineServer: jest.fn(),
  provisionBridgeBottle: jest.fn(),
  // quick/261016-u1w (D-D): per-game bridge bottle removal on uninstall.
  removePerGameBridgeBottle: jest.fn(),
  // quick 261024-urq: Stop-button counterpart (per-game wineserver -k).
  stopPerGameBridgeBottle: jest.fn()
}))
jest.mock('../bridgeBottle', () => {
  // Phase 24 Plan 08 (R4): dedicated bridge bottle readiness/provisioning
  // surface — installBridgeGame()'s BLOCKER-1 inline provisioning call.
  // Declared as a local const (not inline in the returned object) so
  // findBridgeInstallBottle below can close over the SAME jest.fn() object
  // identity -- resetMocks only clears a mock's calls/implementation, it
  // never replaces the object reference, so every existing test that
  // already drives isBridgeBottleReady for its own purposes also drives
  // findBridgeInstallBottle's real-shaped reimplementation for free.
  const isBridgeBottleReady = jest.fn()
  return {
    isBridgeBottleReady,
    getBridgeBottleSettings: jest.fn(),
    createDrmBridgeRunners: () => ({}),
    // quick/261016-u1w (D-A): plain arrow function, NOT jest.fn() -- resetMocks
    // wipes a jest.fn()'s implementation before every test, but games.ts calls
    // this directly as a pure, deterministic builder, so the factory gives it
    // a real (mirrored) implementation that survives resetMocks.
    bridgeBottleNameFor: (appId: string): string | null =>
      /^\d+$/.test(appId) ? `GameLibSteamBridge-${appId}` : null,
    // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility. Plain function
    // for the same resetMocks-survival reason as bridgeBottleNameFor above,
    // reimplemented against isBridgeBottleReady's readiness signal (the
    // dedicated bridge-readiness mock, never reused for unrelated purposes
    // elsewhere in this file -- unlike the shared graceful-fs existsSync
    // mock, which many unrelated describe blocks drive for their own
    // purposes and would cross-contaminate if reused here). Every existing
    // test that already sets isBridgeBottleReady(true) to reach the bridge
    // branch gets a correct findBridgeInstallBottle result with zero
    // per-test changes.
    findBridgeInstallBottle: (paths: unknown, appId: string): string | null => {
      const perGameName = /^\d+$/.test(appId)
        ? `GameLibSteamBridge-${appId}`
        : null
      if (perGameName && isBridgeBottleReady(paths, perGameName)) {
        return perGameName
      }
      if (isBridgeBottleReady(paths, 'GameLibSteamBridge')) {
        return 'GameLibSteamBridge'
      }
      return null
    }
  }
})
jest.mock('../bottledSteam', () => ({
  createBottledSteamRaiser: () => ({}),
  tellBottledSteamToLaunch: jest.fn(),
  tellBottledSteamToUninstall: jest.fn()
}))

// ── bridge/allowlist.ts mock (24-03) — controls isBridgeEligible()'s
// bridgeAllowlist.has(appId) lookup without pulling in the real bundled
// bridge-allowlist.json/zod validation.
// Phase 51 Plan 09 (D-51-07): knownBadReason added alongside has() --
// assembleBridgeRouteInput() reads both. resetMocks:true means a test that
// never sets this returns `undefined`; assembleBridgeRouteInput() coerces
// with `?? null` so that default never misreads as "known bad" (which
// requires a non-null reason) in every pre-existing test below.
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn(), knownBadReason: jest.fn() }
}))

// quick 261027-gtd: resetMocks returns undefined, which
// assembleBridgeRouteInput maps to null, so every pre-existing test is
// unaffected.
// quick 261029-ji2: pending-adoption record + Play-time Steam restart.
// Plain object: the injected pending-adoption store handle the callers pass through.
const mockAdoptionStore = {}
jest.mock('../macSteamAdoption', () => ({
  probeMacSteamPid: jest.fn(),
  // Plain function (not jest.fn): the caller builds the restart deps, the driver is mocked.
  createRestartDeps: (deps: { launchRunGameId: () => Promise<unknown> }) => ({
    launchRunGameId: deps.launchRunGameId
  }),
  readAcfSnapshot: jest.fn(),
  recordPendingAdoption: jest.fn(),
  readPendingAdoption: jest.fn(),
  clearPendingAdoption: jest.fn(),
  pendingAdoptionStoreFrom: () => mockAdoptionStore,
  decidePlayAdoption: jest.fn(),
  restartMacSteamForAdoption: jest.fn()
}))
jest.mock('../drmKnownFix', () => ({ knownFixSaysCeg: jest.fn() }))

// ── bridge/shimGenerate.ts mock (24-05) — installBridgeGame()'s post-download
// shim-placement hook.
jest.mock('../bridge/shimGenerate', () => ({
  placeShimForGame: jest.fn()
}))
jest.mock('../bridge/shimDrmWrapper', () => ({
  // Phase 56 (56-12): undefined under resetMocks, which keeps every existing
  // test on the TCP path.
  detectDrmWrapper: jest.fn()
}))

// Gap 11 (56-21): the UE-aware resolver. Default delegates to the mocked
// detectDrmWrapper (drmExe = launch exe); a test overrides it via
// __detectLaunchOverride to simulate a Shipping exe carrying .bind.
jest.mock('../bridge/drm/drmScanExe', () => {
  const override: { fn?: (exe: string) => unknown } = {}
  return {
    __detectLaunchOverride: override,
    detectLaunchDrmWrapper: async (
      _rust: unknown,
      _bottle: string,
      exe: string
    ) => {
      if (override.fn) return override.fn(exe)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const shim = require('../bridge/shimDrmWrapper')
      return { drmWrapper: await shim.detectDrmWrapper(exe), drmExe: exe }
    }
  }
})

// Phase 56 (56-12): drmLaunchSetup is a plain function over a jest.fn() so it
// survives resetMocks; the default is the not-applicable (TCP) result.
jest.mock('../bridge/drm/drmLaunchSetup', () => {
  const drmLaunchSetupMock = jest.fn()
  return {
    __drmLaunchSetupMock: drmLaunchSetupMock,
    DRM_END_SESSION_TIMEOUT_MS: 15000,
    drmLaunchSetup: (...args: unknown[]) =>
      drmLaunchSetupMock(...args) ??
      Promise.resolve({ status: 'not-applicable', mode: 'tcp' })
  }
})

// Phase 60 (60-08): overlay policy and launch preparation. Plain functions over
// jest.fn() so they survive resetMocks. Default: overlay off, so every
// pre-Phase-60 launch test runs on stock CrossOver untouched (D-04).
jest.mock('../bridge/overlay/overlayPolicy', () => {
  const resolveMock = jest.fn()
  const storedMock = jest.fn()
  return {
    __resolveOverlayEnabledMock: resolveMock,
    __readStoredOverlayOverrideMock: storedMock,
    resolveOverlayEnabled: (...args: unknown[]) =>
      resolveMock(...args) ?? { enabled: false, source: 'user' },
    readStoredOverlayOverride: (...args: unknown[]) => storedMock(...args),
    isAbnormalOverlayExit: jest.requireActual('../bridge/overlay/overlayPolicy')
      .isAbnormalOverlayExit,
    parseOverlayOverride: jest.requireActual('../bridge/overlay/overlayPolicy')
      .parseOverlayOverride
  }
})
// Todo 2026-11-04: titleSettings. The stored-config reader is a jest.fn() so it
// survives resetMocks (undefined by default: no title keys in older tests).
jest.mock('../titleSettings', () => {
  const storedMock = jest.fn()
  return {
    __readStoredTitleConfigMock: storedMock,
    readStoredTitleConfig: (...args: unknown[]) => storedMock(...args),
    pickTitleSettings: jest.requireActual('../titleSettings').pickTitleSettings,
    TITLE_AUTHORITATIVE_KEYS:
      jest.requireActual('../titleSettings').TITLE_AUTHORITATIVE_KEYS
  }
})
// Phase 60 (60-09): attach watch and overlay wine log. The shim forwarder and
// console-log path helper stay real.
jest.mock('../bridge/overlay/overlayAttachWatch', () => {
  const watchMock = jest.fn()
  return {
    ...jest.requireActual('../bridge/overlay/overlayAttachWatch'),
    __watchOverlayAttachMock: watchMock,
    watchOverlayAttach: (...args: unknown[]) => watchMock(...args)
  }
})
jest.mock('../bridge/overlay/overlayWineLog', () => {
  const openMock = jest.fn()
  return {
    ...jest.requireActual('../bridge/overlay/overlayWineLog'),
    __openOverlayWineLogMock: openMock,
    openOverlayWineLog: (...args: unknown[]) => openMock(...args)
  }
})
jest.mock('../bridge/overlay/overlayLaunch', () => {
  const prepareLaunchMock = jest.fn()
  const prepareTokensMock = jest.fn()
  const prepareEnvMock = jest.fn()
  return {
    ...jest.requireActual('../bridge/overlay/overlayLaunch'),
    __prepareOverlayEnvMock: prepareEnvMock,
    prepareOverlayEnv: (...args: unknown[]) => prepareEnvMock(...args),
    __prepareOverlayLaunchMock: prepareLaunchMock,
    __prepareOverlayTokensMock: prepareTokensMock,
    prepareOverlayLaunch: (...args: unknown[]) => prepareLaunchMock(...args),
    prepareOverlayTokens: (...args: unknown[]) => prepareTokensMock(...args)
  }
})

// Phase 56 (56-12): detectSteamDrmInPe is undefined under resetMocks, which
// games.ts treats as "not parsed".
jest.mock('../bridge/peScan', () => ({
  ...jest.requireActual('../bridge/peScan'),
  detectSteamDrmInPe: jest.fn()
}))

// quick 261026-lif: SteamGame.repair() delegates to the restore helper.
jest.mock('../bridge/originalRestore', () => ({
  restoreBridgeSteamApiOriginals: jest.fn()
}))

// ── bridge/launchTarget.ts mock (24-08 Task 1) — resolveBridgeLaunchExe used
// by both installBridgeGame() (Task 2) and launch()'s bridge branch (Task 3).
jest.mock('../bridge/launchTarget', () => ({
  resolveBridgeLaunchExe: jest.fn(),
  resolveBridgeLaunchWorkingDir: jest.fn()
}))

// ── bridge/helperProcess.ts mock (24-06, widened Phase 51 Plan 01) —
// ensureBridgeHelperReady() gate + stopBridgeHelper() teardown hook, both
// consumed by launch()'s bridge branch.
jest.mock('../bridge/helperProcess', () => ({
  ensureBridgeHelperReady: jest.fn()
}))

// ── bridge/bridgeConfig.ts mock (Phase 51 Plan 01, D-51-01) — the
// gamelib_bridge.cfg port handoff launchBridgeGame() writes right before
// firing wine.
jest.mock('../bridge/bridgeConfig', () => ({
  writeBridgeConfig: jest.fn(),
  BRIDGE_CONFIG_FILENAME: 'gamelib_bridge.cfg'
}))

// ── bridgeKnownFixes.ts mock (quick 261024-tny) — applySteamBridgeKnownFixes,
// lazily imported by fireBridgeWineLaunch. resetMocks wipes implementations
// before EACH test, so a file-scope beforeEach below re-applies a passthrough.
jest.mock('../bridgeKnownFixes', () => ({
  applySteamBridgeKnownFixes: jest.fn(),
  // quick 261029-mbl: re-applied as a passthrough in the file-scope beforeEach.
  steamBridgeLaunchCommandParts: jest.fn(),
  // Spike 034: undefined under resetMocks, so no fix lines reach the cfg.
  steamShimFeatureCfgLines: jest.fn()
}))

// quick 261025-rkj: the bridge first-launch shared redist step.
jest.mock('../bridge/sharedRedistInstall', () => {
  const installSteamBridgeSharedRedists = jest.fn()
  return {
    installSteamBridgeSharedRedists,
    createSharedRedistInstaller: () => ({ installSteamBridgeSharedRedists })
  }
})

// Phase 59 (59-09): engine decision + on-demand download, lazily imported by
// installBridgeGame. Defaults are set in the file-level beforeEach below.
jest.mock('backend/engine/engineDecision', () => ({
  decideCreationEngine: jest.fn(),
  decideLaunchEngine: jest.fn(),
  preflightCrossover: jest.fn(),
  isCrossoverMissing: jest.fn()
}))
// Phase 61 (61-08): the Steam adapter that injects Steam-only inputs into the
// store-agnostic decision and switch.
jest.mock('../engine/steamEngineDeps', () => ({
  readSteamEngineOverride: jest.fn(),
  STEAM_ENGINE_RUNNER: 'steam',
  steamEngineStateDeps: jest.fn(() => ({})),
  steamDecisionDeps: jest.fn(() => ({})),
  steamDecisionServices: jest.fn(() => ({})),
  steamSwitchDeps: jest.fn(() => ({ crossoverSettings: jest.fn() }))
}))
// Phase 59 (59-10): per-launch bottle preparation and state publishing.
// 66.4-05: the switcher and the fallback-engine owner are boot instances reached through
// deps.engineRuntime; the runtime built below wraps these recording fakes.
jest.mock('backend/engine/engineSwitch', () => ({
  createEngineSwitcher: () => ({
    prepareBottleForEngine: (...a: unknown[]) =>
      mockPrepareBottleForEngine(...a)
  }),
  switchContextFrom: jest.fn(),
  readBottleEngineMarkerKind: jest.fn(),
  restoreNeedsAbsentPin: jest.fn()
}))
jest.mock('backend/engine/fallbackEngine', () => ({
  createFallbackEngine: () => ({
    ensurePinnedEngine: (...a: unknown[]) => mockEnsurePinnedEngine(...a),
    isPinnedEngineInstalled: (...a: unknown[]) =>
      mockIsPinnedEngineInstalled(...a),
    pinnedEnginePaths: jest.fn(),
    pinnedEngineRoot: jest.fn(),
    pruneUnpinnedEngines: jest.fn(),
    sweepStaleEngineTemps: jest.fn()
  })
}))

// ── nativeInstallSetting.ts mock (Plan 03's D-13 opt-in read seam) — plain
// jest.fn() with no default implementation. resetMocks:true means it returns
// undefined (falsy) unless a test explicitly sets mockReturnValue(true), so
// every pre-existing test (which never touches this) keeps exercising the
// opt-in-OFF / legacy steam://install path with zero changes.
jest.mock('../nativeInstallSetting', () => ({
  isSteamNativeInstallEnabled: jest.fn(),
  // quick 261106-s3n: undefined (OFF) unless a test sets it.
  isSteamNativeDeleteEnabled: jest.fn()
}))
jest.mock('../nativeDelete', () => ({ decideSteamNativeDelete: jest.fn() }))

// quick 261105-ord: experimental InstallApp accessor + helper caller. Plain
// jest.fn()s: resetMocks makes the accessor return undefined (OFF) unless a
// test sets it, so every pre-existing test is unaffected.
jest.mock('../experimentalInstallAppSetting', () => ({
  isSteamExperimentalInstallAppEnabled: jest.fn()
}))
jest.mock('../steamInstallApp', () => ({
  requestSteamInstallApp: jest.fn(),
  // The runner-backed helper seam (66.2-06): an opaque function here; only its presence is asserted.
  createSteamInstallAppRun: () => 'install-app-run'
}))

// ── depot.ts mock — downloadSteamDepots + prescreenBridgeDepots (D-51-06,
// Plan 17) are the only two games.ts needs; depot.ts itself pulls in
// steam-user's heavy internal manifest parser, which games.test.ts has no
// reason to exercise.
jest.mock('../depot', () => ({
  downloadSteamDepots: jest.fn(),
  prescreenBridgeDepots: jest.fn()
}))

// ── Plan 09/10 seam mocks — clientSetup.ts / installLocation.ts. Plan 07
// wires these as call-order seams; their real (Plan 09/10) implementations
// are out of this plan's scope, so games.test.ts controls their resolved
// values directly.
jest.mock('../clientSetup', () => ({
  ensureSteamClientReady: jest.fn()
}))
jest.mock('../installLocation', () => ({
  resolveSteamInstallTarget: jest.fn(),
  resolveSteamLibraryRoot: jest.fn(),
  // T-37-01/T-37-03: real class (not a stub) so `err instanceof
  // UnsafeInstalldirError` in games.ts's catch block works against an error
  // a test constructs via `new UnsafeInstalldirError(...)` on the mocked
  // resolveSteamInstallTarget's rejection.
  UnsafeInstalldirError:
    jest.requireActual('../installLocation').UnsafeInstalldirError
}))

// D-UAT-19 (quick 261102-dkw): the delegated steam://install branch now gates
// on ensureSteamClientReady too. Default every test to a ready client so the
// hand-off tests below keep exercising openExternal; a test that needs another
// verdict overrides this in its own setup (describe/it beforeEach runs later).
beforeEach(() => {
  ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
    status: 'ready',
    ready: true
  })
  // Resolved "not parsed" by default; scenarios override per test.
  ;(detectSteamDrmInPe as jest.Mock).mockResolvedValue({
    parsed: false,
    cegMarkers: [],
    hasBindSection: false,
    readError: null
  })
})

// ── Test helpers ──────────────────────────────────────────────────────────────

const APP_ID = '570'

/** Fixture API response for appid 570 (Dota 2) */
const fixtureApiResponse = {
  data: {
    [APP_ID]: {
      success: true,
      data: {
        name: 'Dota 2',
        short_description: 'A multiplayer online battle arena game.',
        platforms: { windows: true, mac: true, linux: false },
        genres: [
          { id: '1', description: 'Action' },
          { id: '2', description: 'Strategy' }
        ]
      }
    }
  }
}

// debug/steam-bottle-uninstall-reverts (routing fix): uninstall() now routes
// SOLELY off install.install_path, so any test exercising uninstall() must
// give its library entry an install_path that resolves inside a known root.
// Shared fixtures so per-test setup only needs one line.
/** A registered native Steam library root — resolveInstallRoot() consults
 *  getSteamLibraries() for this. */
const NATIVE_LIBRARY_ROOT = '/mock/native/steam'
/** An install_path resolving inside NATIVE_LIBRARY_ROOT's steamapps/common/. */
const NATIVE_INSTALL_PATH = `${NATIVE_LIBRARY_ROOT}/steamapps/common/Dota 2`

/** Minimal library entry with no artwork (triggers lazy fetch) */
function makeEntry(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'steam',
    app_name: APP_ID,
    title: APP_ID,
    art_cover: '',
    art_square: '',
    is_installed: false,
    install: {},
    extra: { reqs: [] },
    canRunOffline: true,
    installable: true,
    ...overrides
  } as GameInfo
}

/** Flush all pending microtasks and macrotasks */
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve))

// ── Describe block ────────────────────────────────────────────────────────────

// WR-03: the helper's per-launch secret as ensureBridgeHelperReady returns it.
const BRIDGE_TEST_SECRET = 'ab'.repeat(32)

describe('SteamGame.getGameInfo lazy metadata', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
  })

  // ── LIB-04: synchronous return from in-memory library ────────────────────

  it('LIB-04: getGameInfo returns the existing library entry synchronously', () => {
    const entry = makeEntry({
      title: 'Dota 2',
      art_cover: 'https://example.com/art.jpg'
    })
    library.set(APP_ID, entry)
    // A fully-enriched cache entry has platforms already captured (DETAIL-01
    // gap-fix), so getGameInfo must NOT trigger a self-heal re-fetch.
    // Quick task 260816-hdg: `is_windows_native` is what makes this fixture
    // actually mean "fully enriched". Without it the entry is pre-D-17 residue
    // and the self-heal correctly DOES fire — see the residue counterpart
    // below. The field was added rather than the predicate weakened.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_windows_native: true
    })

    const result = new SteamGame(APP_ID, steamTestDeps).getGameInfo()

    expect(result).toBe(entry)
    // Synchronous return — axios must NOT have been called yet
    expect(axios.get).not.toHaveBeenCalled()
  })

  // ── DETAIL-01 gap-fix: self-healing platform re-fetch ────────────────────

  it('DETAIL-01 self-heal: getGameInfo re-fetches a cached game (art present) whose platforms were never captured', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    // Pre-Phase-7 cache: art is present (old guard would skip) but platforms
    // were never captured — the self-heal guard must still fire the fetch once.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(APP_ID, makeEntry({ art_cover: 'https://example.com/art.jpg' }))

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('260816-hdg self-heal: getGameInfo re-fetches a PRE-D-17 RESIDUE entry (platformsCaptured:true, no is_windows_native)', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    // THE 370-ENTRY RESIDUE SHAPE — art present AND the flag claims platforms
    // were captured, so both of the original guards would skip. The depot
    // field that fetch owes is absent, so this entry never actually answered
    // the depot question and the self-heal must fire.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true
    })
    library.set(APP_ID, makeEntry({ art_cover: 'https://example.com/art.jpg' }))

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  it('260816-hdg convergence: getGameInfo does NOT re-fetch once the refetch has written is_windows_native (one fetch per game, no loop)', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    // The post-refetch shape. games.ts writes is_windows_native via a `!!`
    // coercion, so it is ALWAYS present after a successful fetch — including
    // when the answer is `false`. That is what bounds the self-heal at exactly
    // one fetch per appId rather than a per-render loop.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_windows_native: false
    })
    library.set(APP_ID, makeEntry({ art_cover: 'https://example.com/art.jpg' }))

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
  })

  it('DETAIL-01 self-heal: getGameInfo does NOT re-fetch a delisted cached game (avoids loop)', async () => {
    // Delisted games return before capturing platforms; gating on !is_delisted
    // prevents a re-fetch loop.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(
      APP_ID,
      makeEntry({ art_cover: 'https://example.com/art.jpg', is_delisted: true })
    )

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
  })

  // 08.1 review WR-02. The case above only covers a delisted game that ALREADY
  // HAS art — the one shape the pre-fix art-based trigger happened to skip. The
  // shape that actually loops is a game whose FIRST-EVER fetch came back
  // `success:false`: the delisted branch writes `art_cover: ''` and returns
  // before populating it, so `!existing.art_cover` stays true forever and
  // getGameInfo fires a store request plus a pushGameToLibrary on every single
  // access. pendingFetches only dedups CONCURRENT calls, so it cannot bound a
  // sequential loop. Red-proofed: both assertions below fail against the
  // pre-fix guard (`!existing.art_cover || platformsNeverCaptured`).
  it('WR-02: getGameInfo does NOT re-fetch a delisted game that has NO art_cover (the loop shape)', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(APP_ID, makeEntry({ art_cover: '', is_delisted: true }))

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
  })

  it('WR-02: repeated getGameInfo calls on an art-less delisted game stay at zero requests', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(APP_ID, makeEntry({ art_cover: '', is_delisted: true }))

    const game = new SteamGame(APP_ID, steamTestDeps)
    game.getGameInfo()
    await flushAsync()
    game.getGameInfo()
    await flushAsync()
    game.getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })

  // 08.1 review WR-03. This method interpolates `this.appId` into a
  // store.steampowered.com query string and into two CDN image URLs that are
  // pushed to the renderer as <img src>. Its sibling chokepoints
  // (getSteamInstallSize, buildSteamProtocolUrl) both reject a non-numeric
  // appId before building any URL, citing T-06-01/T-03-01; this one did not.
  it('WR-03: a non-numeric appId is rejected before any URL is built', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    const badAppId = '../../etc/passwd'
    library.set(badAppId, makeEntry({ art_cover: '' }))

    new SteamGame(badAppId, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
  })

  it('WR-03: a numeric appId is still fetched (the guard is not over-broad)', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: undefined
    })
    library.set(APP_ID, makeEntry({ art_cover: '' }))

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  // ── LIB-04: lazy metadata fetch via Steam store API ──────────────────────

  it('LIB-04: when art_cover is empty, fetchMetadataIfNeeded calls the Steam store appdetails API', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith(
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}`,
      { timeout: 15000 }
    )
  })

  it('LIB-04: after fetch, art_cover/art_square/title/genres/about.description are populated from the API response', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    const updated = library.get(APP_ID)!
    expect(updated.art_cover).toBe(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`
    )
    expect(updated.art_square).toBe(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/library_600x900.jpg`
    )
    expect(updated.title).toBe('Dota 2')
    expect(updated.extra?.genres).toEqual(['Action', 'Strategy'])
    expect(updated.extra?.about?.description).toBe(
      'A multiplayer online battle arena game.'
    )
  })

  // ── DETAIL-01: native platform capture ───────────────────────────────────

  it('DETAIL-01: appdetails platforms map onto is_mac_native / is_linux_native', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    const updated = library.get(APP_ID)!
    expect(updated.is_mac_native).toBe(true)
    expect(updated.is_linux_native).toBe(false)
  })

  // ── steam-startup-resume-crash (2026-07-18) hardening: the fire-and-forget
  // fetchMetadataIfNeeded() call in getGameInfo() must never produce an
  // unhandled promise rejection, no matter what throws inside it. ──────────

  it('a fetchMetadataIfNeeded() rejection is caught at the call site and never surfaces as an unhandled rejection', async () => {
    const { logWarning } = jest.requireMock('backend/logger')
    const rejectionSpy = jest.fn()
    process.on('unhandledRejection', rejectionSpy)

    const fetchSpy = jest
      .spyOn(gameMetadata, 'fetchMetadataIfNeeded')
      .mockRejectedValue(
        new Error('simulated crash inside fetchMetadataIfNeeded')
      )

    library.set(APP_ID, makeEntry())
    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()
    // Give any (incorrectly) unhandled rejection a full microtask+macrotask
    // turn to actually surface before asserting it never did.
    await flushAsync()

    expect(rejectionSpy).not.toHaveBeenCalled()
    expect(logWarning).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining(
          `unexpected error in background metadata fetch for appId ${APP_ID}`
        )
      ]),
      'Steam'
    )

    process.off('unhandledRejection', rejectionSpy)
    fetchSpy.mockRestore()
  })

  it('DETAIL-01: native platform flags are persisted to steamMetadataStore', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        is_mac_native: true,
        is_linux_native: false
      })
    )
  })

  // ── D-17: Windows depot-availability capture ──────────────────────────────

  it('D-17: appdetails platforms.windows maps onto GameInfo.is_windows_native', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.is_windows_native).toBe(true)
  })

  it('D-17: is_windows_native is persisted to steamMetadataStore', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_windows_native: true })
    )
  })

  it('261029-sbi: appdetails metacritic.score is persisted with metacriticCaptured and lands on the pushed GameInfo', async () => {
    const withScore = {
      data: {
        [APP_ID]: {
          ...fixtureApiResponse.data[APP_ID],
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            metacritic: { score: 88, url: 'https://example.invalid' }
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(withScore)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.metacritic_score).toBe(88)
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        metacritic_score: 88,
        metacriticCaptured: true
      })
    )
  })

  it('261029-sbi: no appdetails metacritic carries existing score/captured forward, and invents none', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      metacritic_score: 75,
      metacriticCaptured: true
    })
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
    expect(written.metacritic_score).toBe(75)
    expect(written.metacriticCaptured).toBe(true)
  })

  it('261029-sbi: no appdetails metacritic and no existing entry writes neither field', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
    expect('metacritic_score' in written).toBe(false)
    expect('metacriticCaptured' in written).toBe(false)
  })

  it('D-17 false-safe: platforms.windows false yields is_windows_native false on BOTH the GameInfo and the persisted entry', async () => {
    const fixtureWindowsFalse = {
      data: {
        [APP_ID]: {
          ...fixtureApiResponse.data[APP_ID],
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            platforms: { windows: false, mac: true, linux: false }
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureWindowsFalse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.is_windows_native).toBe(false)
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_windows_native: false })
    )
  })

  it('D-17 false-safe: an appdetails response with no platforms object yields false, never undefined', async () => {
    const fixtureNoPlatforms = {
      data: {
        [APP_ID]: {
          success: true,
          data: {
            name: 'Dota 2',
            short_description: 'A multiplayer online battle arena game.',
            genres: []
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureNoPlatforms)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(library.get(APP_ID)!.is_windows_native).toBe(false)
  })

  // ── Quick task 260816-qcn: freshest-write-wins precedence (WR-02/CR-01) ──

  describe('260816-qcn: appdetails writer honours resolvePlatformWrite precedence', () => {
    // fixtureApiResponse gives windows:true, mac:true, linux:false. This
    // fixture disagrees on every field so the two sources genuinely
    // conflict, rather than coincidentally agreeing.
    const CONFLICTING_PICS_TRIPLE = {
      is_windows_native: true,
      is_mac_native: false,
      is_linux_native: true
    }

    it('declined: an existing strictly-newer PICS capture survives on BOTH the cache write and the pushed GameInfo (split-brain check)', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        ...CONFLICTING_PICS_TRIPLE,
        platformsCaptured: true,
        platformsSource: 'pics',
        platformsCapturedAt: Date.now() + 60_000
      })
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      await flushAsync()

      const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
      expect(written.is_windows_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_windows_native
      )
      expect(written.is_mac_native).toBe(CONFLICTING_PICS_TRIPLE.is_mac_native)
      expect(written.is_linux_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_linux_native
      )
      expect(written.platformsSource).toBe('pics')

      const pushed = library.get(APP_ID)!
      expect(pushed.is_windows_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_windows_native
      )
      expect(pushed.is_mac_native).toBe(CONFLICTING_PICS_TRIPLE.is_mac_native)
      expect(pushed.is_linux_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_linux_native
      )

      const pushedMessage = sendFrontendMessage.mock.calls.find(
        ([channel]) => channel === 'pushGameToLibrary'
      )
      expect(pushedMessage![1].is_windows_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_windows_native
      )
      expect(pushedMessage![1].is_mac_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_mac_native
      )
      expect(pushedMessage![1].is_linux_native).toBe(
        CONFLICTING_PICS_TRIPLE.is_linux_native
      )
    })

    it('accepted: appdetails wins over an OLDER PICS capture -- persisted triple is the appdetails one, platformsSource flips to appdetails', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        ...CONFLICTING_PICS_TRIPLE,
        platformsCaptured: true,
        platformsSource: 'pics',
        platformsCapturedAt: Date.now() - 60_000
      })
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      await flushAsync()

      const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
      // fixtureApiResponse: windows:true, mac:true, linux:false
      expect(written.is_windows_native).toBe(true)
      expect(written.is_mac_native).toBe(true)
      expect(written.is_linux_native).toBe(false)
      expect(written.platformsSource).toBe('appdetails')
      expect(written.platformsCapturedAt).toBeGreaterThanOrEqual(
        Date.now() - 60_000
      )
    })

    it('legacy: an existing entry with no platformsCapturedAt is writable by appdetails and gets stamped', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_windows_native: false
        // no platformsCapturedAt -- pre-this-task legacy entry
      })
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      await flushAsync()

      const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
      expect(written.is_windows_native).toBe(true)
      expect(written.platformsSource).toBe('appdetails')
      expect(typeof written.platformsCapturedAt).toBe('number')
    })

    it('carry-forward on the DECLINED path: mac_arch/mac_arch_verified/mac_arch_source/forcedWindowsViaBottle all survive', async () => {
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        ...CONFLICTING_PICS_TRIPLE,
        platformsCaptured: true,
        platformsSource: 'pics',
        platformsCapturedAt: Date.now() + 60_000,
        mac_arch: '64',
        mac_arch_verified: true,
        mac_arch_source: 'macho',
        forcedWindowsViaBottle: true
      })
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      await flushAsync()

      const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
      expect(written.mac_arch).toBe('64')
      expect(written.mac_arch_verified).toBe(true)
      expect(written.mac_arch_source).toBe('macho')
      expect(written.forcedWindowsViaBottle).toBe(true)
    })

    it('260816-qcn additional gap: mac_arch is derived from the EFFECTIVE is_mac_native, never the raw appdetails one, when precedence declines and is_mac_native is false on the winning side', async () => {
      // fixtureApiResponse claims mac:true (raw appdetails is_mac_native
      // would be true), but the existing PICS capture is strictly newer,
      // complete, AND says is_mac_native:false. If mac_arch were derived
      // from the raw appdetails is_mac_native instead of the EFFECTIVE
      // (post-precedence) one, this would incorrectly compute a mac_arch
      // heuristic for a game whose winning platform answer says it has no
      // mac build at all -- the exact silent-regression window flagged by
      // the plan checker gap.
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        is_windows_native: true,
        is_mac_native: false,
        is_linux_native: true,
        platformsCaptured: true,
        platformsSource: 'pics',
        platformsCapturedAt: Date.now() + 60_000
        // no mac_arch on the existing entry, no mac_arch_verified
      })
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      await flushAsync()

      const [, written] = (steamMetadataStore.set as jest.Mock).mock.calls[0]
      // Declined write: the effective is_mac_native is false (PICS' verdict
      // won), so mac_arch must NOT be derived via macArchFromMinOS -- it
      // must stay whatever the (absent) existingMeta.mac_arch was: undefined.
      expect(written.is_mac_native).toBe(false)
      expect(written.mac_arch).toBeUndefined()
      expect(written.mac_arch_source).toBeUndefined()

      const pushed = library.get(APP_ID)!
      expect(pushed.is_mac_native).toBe(false)
      expect(pushed.mac_arch).toBeUndefined()
    })
  })

  // ── MAC32-01: inline mac_arch derivation (direction B) ────────────────────

  function fixtureWithMacRequirements(minimumHtml: string | undefined) {
    return {
      data: {
        [APP_ID]: {
          success: true,
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            mac_requirements: { minimum: minimumHtml }
          }
        }
      }
    }
  }

  it('MAC32-01: is_mac_native true + min-OS 10.15 persists mac_arch "64" and mac_arch_source "minos", preserving art_cover/art_square/extra', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(
        '<li><strong>OS:</strong> macOS 10.15 or newer<br></li>'
      )
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        mac_arch: '64',
        mac_arch_source: 'minos',
        art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`,
        art_square: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/library_600x900.jpg`,
        extra: expect.anything()
      })
    )
    const updated = library.get(APP_ID)!
    expect(updated.mac_arch).toBe('64')
  })

  it('MAC32-01: is_mac_native true + min-OS 10.9.3 (real 32-bit, Age of Wonders III) persists mac_arch "unknown" — never a false-negative assert-32', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(
        '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
      )
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: 'unknown', mac_arch_source: 'minos' })
    )
  })

  it('MAC32-01: is_mac_native true + empty mac_requirements (minimum undefined) resolves mac_arch "unknown" without throwing', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(undefined)
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    library.set(APP_ID, makeEntry())

    expect(() =>
      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    ).not.toThrow()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: 'unknown', mac_arch_source: 'minos' })
    )
  })

  it('MAC32-01: is_mac_native false does NOT recompute mac_arch — carries forward the existing entry unchanged', async () => {
    const notMacNativeResponse = {
      data: {
        [APP_ID]: {
          success: true,
          data: {
            ...fixtureApiResponse.data[APP_ID].data,
            platforms: { windows: true, mac: false, linux: false },
            mac_requirements: {
              minimum: '<li><strong>OS:</strong> macOS 10.15 or newer<br></li>'
            }
          }
        }
      }
    }
    ;(axios.get as jest.Mock).mockResolvedValue(notMacNativeResponse)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      mac_arch: 'unknown'
    })
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ mac_arch: 'unknown' })
    )
    // mac_arch_source must not be freshly stamped 'minos' — is_mac_native is false.
    const setCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([key]) => key === APP_ID
    )
    expect(setCall?.[1]?.mac_arch_source).toBeUndefined()
  })

  it('MAC32-01: existing mac_arch_verified true is NEVER regressed by a re-fetch — mac_arch/mac_arch_source/mac_arch_verified preserved', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(
      fixtureWithMacRequirements(
        '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>' // would compute 'unknown' if NOT gated
      )
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        mac_arch: '32',
        mac_arch_verified: true,
        mac_arch_source: 'macho'
      })
    )
  })

  // ── LIB-04: cache persistence ─────────────────────────────────────────────

  it('LIB-04: fetched metadata is written to steamMetadataStore for indefinite reuse', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`,
        art_square: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/library_600x900.jpg`
      })
    )
  })

  // ── LIB-04: frontend update via IPC ──────────────────────────────────────

  it('LIB-04: fetchMetadataIfNeeded calls sendFrontendMessage pushGameToLibrary with the updated GameInfo', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: APP_ID,
        art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${APP_ID}/header.jpg`,
        title: 'Dota 2',
        // Phase 17 D-08 reconciliation (Plan 09): this push only happens
        // after a successful appdetails fetch, exactly when platforms are
        // captured — the frontend bottle indicator relies on this flag.
        steamPlatformsCaptured: true
      })
    )
  })

  // ── LIB-04: pendingFetches dedup (T-2-03) ────────────────────────────────

  it('LIB-04: concurrent getGameInfo calls for the same appId only fire one network request (pendingFetches dedup)', async () => {
    // Slow-resolving promise — not resolved until after both sync calls complete
    let resolveAxios!: (value: unknown) => void
    ;(axios.get as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveAxios = resolve
      })
    )
    library.set(APP_ID, makeEntry())

    const game = new SteamGame(APP_ID, steamTestDeps)
    // Both calls happen synchronously before any awaited code runs
    game.getGameInfo()
    game.getGameInfo()

    // Now resolve the single in-flight request
    resolveAxios(fixtureApiResponse)
    await flushAsync()

    // Only one network request should have been made
    expect(axios.get).toHaveBeenCalledTimes(1)
  })

  // ── LIB-04: error handling ────────────────────────────────────────────────

  it('LIB-04: a failed appdetails request is caught and logged without throwing', async () => {
    ;(axios.get as jest.Mock).mockRejectedValue(new Error('Network error'))
    library.set(APP_ID, makeEntry())

    const game = new SteamGame(APP_ID, steamTestDeps)

    // Synchronous call must not throw
    expect(() => game.getGameInfo()).not.toThrow()

    // Async error must also be swallowed (not bubble up as unhandled rejection)
    await flushAsync()

    // logWarning should have been called with the error
    const { logWarning } = jest.requireMock('backend/logger')
    expect(logWarning).toHaveBeenCalled()
    // steamMetadataStore.set must NOT run, and no game must be pushed to the
    // frontend (the steamMetadataSyncing on/off signals are expected + allowed).
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })
})

// ── Integration: lazy fetch reachable through SteamLibraryManager ────────────

describe('SteamLibraryManager.getGameInfo integration — lazy fetch delegation', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
  })

  it('getGameInfo() through the library manager triggers lazy metadata fetch via SteamGame delegation', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    // Entry in shared Map with no artwork — should trigger fetchMetadataIfNeeded
    library.set(APP_ID, makeEntry())

    const manager = new SteamLibraryManager(steamTestDeps)
    const result = manager.getGameInfo(APP_ID)

    // Synchronous return should be the in-Map entry
    expect(result).toBeDefined()
    expect(result?.app_name).toBe(APP_ID)

    // Lazy fetch must have been triggered through the delegation chain
    await flushAsync()
    expect(axios.get).toHaveBeenCalledTimes(1)
    expect(axios.get).toHaveBeenCalledWith(
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}`,
      { timeout: 15000 }
    )
  })
})

// ── GAME-01: SteamGame.launch() + appId guard (T-03-01) ──────────────────────

describe('buildSteamProtocolUrl — quick 261029-i1n launch verb', () => {
  it('launch verb emits steam://launch/<id>/Dialog (capital D, Playnite form)', () => {
    expect(buildSteamProtocolUrl('launch', '264160')).toBe(
      'steam://launch/264160/Dialog'
    )
  })

  it('rungameid, install and uninstall verbs are unchanged', () => {
    expect(buildSteamProtocolUrl('rungameid', '264160')).toBe(
      'steam://rungameid/264160'
    )
    expect(buildSteamProtocolUrl('install', '264160')).toBe(
      'steam://install/264160'
    )
    expect(buildSteamProtocolUrl('uninstall', '264160')).toBe(
      'steam://uninstall/264160'
    )
  })

  it.each(['abc', '264160/../uninstall/5', ''])(
    'launch verb rejects non-numeric appId %j before looking at the verb',
    (badId) => {
      expect(buildSteamProtocolUrl('launch', badId)).toBeNull()
    }
  )
})

describe('SteamGame.launch() — GAME-01', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let logWarningMock: jest.Mock

  beforeEach(() => {
    // quick 261029-i1n: pin the host to the module-mock defaults (Linux) so the
    // rungameid assertions below are an explicit Linux pin, not order-dependent.
    const envPin = jest.requireMock('backend/constants/environment')
    envPin.isWindows = false
    envPin.isMac = false
    envPin.isLinux = true
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    logWarningMock = jest.requireMock('backend/logger').logWarning as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
  })

  it('GAME-01: launch() calls shell.openExternal with steam://rungameid/{appId} for numeric appId', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    // activate:false so the Steam handoff does not steal foreground / force a
    // macOS fullscreen-Space switch from Console mode.
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
  })

  it('GAME-01: launch() resolves true for a valid numeric appId', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
  })

  it('launch() does NOT show a hand-off toast (toast feature removed — Steam opens fast enough)', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('T-03-01: launch() does NOT call shell.openExternal when appId is non-numeric (injection guard)', async () => {
    const badGame = new SteamGame('abc', steamTestDeps)
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() does NOT call shell.openExternal for appId with shell metacharacters', async () => {
    const badId = '12; rm -rf ~'
    const badGame = new SteamGame(badId, steamTestDeps)
    library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() does NOT call shell.openExternal for appId with path traversal', async () => {
    const badId = '10/../uninstall/5'
    const badGame = new SteamGame(badId, steamTestDeps)
    library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() logs a warning when appId is invalid', async () => {
    const badGame = new SteamGame('not-a-number', steamTestDeps)
    library.set(
      'not-a-number',
      makeEntry({ app_name: 'not-a-number', title: 'BadGame' })
    )

    await badGame.launch({} as any)

    expect(logWarningMock).toHaveBeenCalled()
  })

  it('GAME-04/D-06: launch() does not invoke any Wine/Proton routine — only shell.openExternal is called as external exec', async () => {
    // Verify that the steam:// URL contains rungameid (not a Heroic runtime command)
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    // shell.openExternal must be called with a steam:// URL using rungameid — NOT a CLI/Wine command
    const calls = shellOpenExternal.mock.calls
    expect(calls.length).toBe(1)
    const url: string = calls[0][0]
    expect(url).toMatch(/^steam:\/\/rungameid\/\d+$/)
  })

  describe('quick 261029-i1n: Windows host launches via steam://launch/<appId>/Dialog', () => {
    beforeEach(() => {
      const env = jest.requireMock('backend/constants/environment')
      env.isWindows = true
      env.isMac = false
      env.isLinux = false
    })

    afterEach(() => {
      const env = jest.requireMock('backend/constants/environment')
      env.isWindows = false
      env.isMac = false
      env.isLinux = true
    })

    it('opens steam://launch/<appId>/Dialog with activate:false and resolves true', async () => {
      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.launch({} as any)

      expect(result).toBe(true)
      expect(shellOpenExternal).toHaveBeenCalledTimes(1)
      expect(shellOpenExternal).toHaveBeenCalledWith(
        `steam://launch/${APP_ID}/Dialog`,
        { activate: false }
      )
    })

    it('never opens a rungameid URL', async () => {
      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.launch({} as any)

      for (const call of shellOpenExternal.mock.calls) {
        expect(String(call[0])).not.toContain('rungameid')
      }
    })

    it.each(['abc', '12; rm -rf ~', '10/../uninstall/5'])(
      'rejects non-numeric appId %j: no openExternal, resolves false, warns',
      async (badId) => {
        library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))
        const badGame = new SteamGame(badId, steamTestDeps)

        const result = await badGame.launch({} as any)

        expect(shellOpenExternal).not.toHaveBeenCalled()
        expect(result).toBe(false)
        expect(logWarningMock).toHaveBeenCalled()
      }
    )
  })
})

// ── D-11: SteamGame.isNative() — per-OS confirmed-not-native ─────────────────

describe('SteamGame.isNative() — D-11 per-OS confirmed-not-native', () => {
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
  })

  it('non-mac (Linux/Windows): isNative() returns true even for a confirmed-not-native metadata entry', () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
  })

  it('D-11: macOS confirmed-not-native (platformsCaptured:true, is_mac_native:false) — isNative() returns false', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(false)
  })

  it('260816-hdg non-change: a PRE-D-17 RESIDUE entry still routes to the bottle — the mac gate deliberately keeps the raw read', () => {
    envMock.isMac = true
    // Residue on the DEPOT axis (no is_windows_native) but complete on the MAC
    // axis. The mac question was genuinely answered, so bottle routing must be
    // byte-for-byte what it was before the depot normalization — narrowing this
    // gate too would de-route bottle-eligible games over a fact already cached.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    // isNative() is the public wrapper — its body is `!this.isBottleEligible()`,
    // so a false here IS the bottle-routing verdict. Asserted through the
    // wrapper rather than the private method, which `tsc --noEmit` rejects
    // (ts-jest is transpile-only in this repo and would not have caught it).
    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(false)
  })

  it('D-11 (BLOCKER): macOS NOT-yet-captured (platformsCaptured not true) — isNative() returns true (do not bottle an unconfirmed game)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
  })

  it('macOS Mac-native game (platformsCaptured:true, is_mac_native:true) — isNative() returns true', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
  })

  it('macOS with no metadata entry at all — isNative() returns true (D-11 ambiguous-default fallback)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
  })

  // ── MAC32-02: confirmed-32-bit routing (post-install Mach-O verdict) ─────

  it('MAC32-02: macOS + mac_arch "32" (is_mac_native true — a confirmed-32 game reports it) — isNative() returns false', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(false)
  })

  it('MAC32-02: non-macOS host + mac_arch "32" — isNative() returns true (the !isMac guard fires first, bottle is macOS-only)', () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
  })

  it('MAC32-02: macOS + mac_arch "64" or "unknown" with no D-11 trigger — isNative() returns true (native path, not bottle-eligible)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '64',
      mac_arch_verified: true,
      mac_arch_source: 'macho'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
  })

  it('MAC32-02 regression: the existing D-11 path (platformsCaptured true && is_mac_native false) still routes to the bottle unchanged', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      mac_arch: 'unknown'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(false)
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.launch() bottle routing ─────────────────

describe('SteamGame.launch() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock

  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
  })

  it('bottle-eligible + un-provisioned: launch() does NOT call shell.openExternal, emits steamBottleSetupRequired, resolves false', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    expect(result).toBe(false)
  })

  it('bottle-eligible + provisioned: launch() calls tellBottledSteamToLaunch, NOT shell.openExternal', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(result).toBe(true)
  })

  it.each(['starting', 'running'] as const)(
    '261024-gvu: a live %s monitor blocks a second dispatch (no tellBottledSteamToLaunch), resolves true and logs once',
    async (phase) => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      isBottleReady.mockReturnValue(true)
      getBottleProcessMonitorPhase.mockReturnValue(phase)
      const { logInfo } = jest.requireMock('backend/logger')

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.launch({} as any)

      expect(result).toBe(true)
      expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
      expect(shellOpenExternal).not.toHaveBeenCalled()
      const guardLogs = (logInfo as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).includes(`launch already ${phase}`)
      )
      expect(guardLogs.length).toBe(1)
      expect(String(guardLogs[0][0])).toContain(APP_ID)
    }
  )

  it('261024-gvu: phase null leaves bottled routing unchanged', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(true)
    getBottleProcessMonitorPhase.mockReturnValue(null)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(await game.launch({} as any)).toBe(true)
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(steamTestDeps, APP_ID)
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — launch() STILL calls shell.openExternal with steam://rungameid/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('D-11 (BLOCKER): NOT-yet-captured macOS game — launch() STILL takes the native rungameid path and does NOT emit steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      expect.anything()
    )
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — launch() STILL calls shell.openExternal with steam://rungameid/<appId>', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })
})

// quick 261024-tny: file-scope passthrough for the known-fixes applier, so every
// describe that reaches fireBridgeWineLaunch keeps its pre-existing behaviour
// (the applier returns the bridge settings untouched). Describe-level
// beforeEach hooks run after this one and may override it.
// Phase 54 plan 08: every install path acquires a lease; default to a granted
// one so tests unrelated to the session policy keep their behaviour.
let leaseRelease: jest.Mock
const HEALTHY_PREFLIGHT = {
  kind: 'healthy',
  binDir: '/cx/bin',
  build: '26.3',
  trialDaysRemaining: null
}
const cxDecision = (extra: Record<string, unknown> = {}) => ({
  kind: 'use',
  selection: {
    kind: 'crossover',
    reason: 'cx-healthy',
    crossoverBuild: '26.3',
    binDir: '/cx/bin'
  },
  preflight: HEALTHY_PREFLIGHT,
  pin: null,
  needsDownload: false,
  override: 'automatic',
  logLines: ['engine=crossover build=26.3 reason=cx-healthy'],
  ...extra
})
const ENGINE_OK = {
  ok: true,
  paths: {
    wineDir: '/engine/wine',
    wineBin: '/engine/wine/bin/wine',
    wineserverBin: '/engine/wine/bin/wineserver',
    dxvkDir: '/engine/dxvk'
  }
}
// Module-export spies outlive their test (the backend jest project sets
// resetMocks, not restoreMocks), so every one is registered here and restored.
const trackedSpies: jest.SpyInstance[] = []
function trackSpy<T extends jest.SpyInstance>(spy: T): T {
  trackedSpies.push(spy)
  return spy
}
afterEach(() => {
  for (const spy of trackedSpies.splice(0)) spy.mockRestore()
})

beforeEach(() => {
  leaseRelease = jest.fn()
  jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
    ok: true,
    client: {},
    release: leaseRelease
  } as never)
  ;(applySteamBridgeKnownFixes as jest.Mock).mockImplementation(
    (_deps: unknown, _id: string, settings: unknown) =>
      Promise.resolve(settings)
  )
  ;(steamBridgeLaunchCommandParts as jest.Mock).mockImplementation(
    (_deps: unknown, _id: string, exePath: string) => [exePath]
  )
  ;(installSteamBridgeSharedRedists as jest.Mock).mockResolvedValue(undefined)
  ;(decideCreationEngine as jest.Mock).mockResolvedValue({
    kind: 'crossover',
    createTimeoutMs: 120_000,
    probed: false,
    build: null
  })
  mockEnsurePinnedEngine.mockResolvedValue(ENGINE_OK)
  // Phase 59 (59-10): healthy CrossOver by default so every pre-existing
  // bridge launch test keeps launching on CrossOver.
  ;(preflightCrossover as jest.Mock).mockResolvedValue(HEALTHY_PREFLIGHT)
  ;(decideLaunchEngine as jest.Mock).mockResolvedValue(cxDecision())
  ;(checkConnectivityNow as jest.Mock).mockResolvedValue({
    offline: false,
    source: 'dns-ok',
    elapsedMs: 0
  })
  ;(
    jest.requireMock('backend/engine/engineDecision')
      .isCrossoverMissing as jest.Mock
  ).mockResolvedValue(false)
  mockPrepareBottleForEngine.mockResolvedValue({
    ok: true,
    changed: false
  })
  clearEngineSelection(APP_ID)
})

// ── Phase 24 Plan 08 (R4/R6/R7, finding #3): allowlist-based bridge launch
// routing — ensureBridgeHelperReady() readiness gate + resolveBridgeLaunchExe()
// exe resolution + direct runWineCommand (never tellBottledSteamToLaunch).

describe('SteamGame.launch() — Phase 24 Plan 08 bridge routing (R4/R6/R7/finding-3), reordered by Phase 51 Plan 01 (D-51-01)', () => {
  let envMock: any
  const BRIDGE_STEAMAPPS_DIR = '/mock/bridge/bottle/steamapps'
  const RESOLVED_EXE_PATH = `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/Avernum4.exe`

  beforeEach(() => {
    resetBridgeFailedSession()
    __resetDrmModeNoticeShownForTests()
    resetBridgeLaunchBottles()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
    ;(ensureBridgeHelperReady as jest.Mock).mockReset()
    ;(resolveBridgeLaunchExe as jest.Mock).mockReset()
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    runWineCommand.mockReset().mockResolvedValue({
      stdout: '',
      stderr: ''
    })
    // 24-13 (D-UAT-24-02): launchBridgeGame's on-disk existence gate.
    // Default both to true/ready so the pre-existing happy-path tests below
    // (which never mention the exe-existence guard) keep exercising a
    // "bridge genuinely installed" state; the dedicated D-UAT-24-02 test
    // overrides existsSync to false.
    ;(isBridgeBottleReady as jest.Mock).mockReset().mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReset().mockReturnValue(true)
    // Phase 51 Plan 01 (D-51-01): three new steps slot in between the
    // existence gate and runWineCommand -- benign defaults here so every
    // pre-existing test below that never mentions them keeps exercising
    // the happy path; the dedicated tests for each override explicitly.
    ;(placeShimForGame as jest.Mock)
      .mockReset()
      .mockResolvedValue({ status: 'placed', shimPath: RESOLVED_EXE_PATH })
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true,
      port: 55123,
      secret: BRIDGE_TEST_SECRET
    })
    ;(writeBridgeConfig as jest.Mock).mockReset().mockReturnValue({
      status: 'written',
      path: '/mock/.../gamelib_bridge.cfg'
    })
    stopBridgeHelper.mockReset()
    startBottleProcessMonitor.mockReset()
    ;(getBottleSteamappsDir as jest.Mock)
      .mockReset()
      .mockReturnValue(BRIDGE_STEAMAPPS_DIR)
    ;(getBottleDir as jest.Mock)
      .mockReset()
      .mockReturnValue('/mock/bridge/bottle')
  })

  afterEach(() => {
    // Restore the module-mock's declared defaults (isMac:false, isLinux:true)
    // — several LATER describe blocks in this file (e.g. stop()/install()
    // GAME-02) never touch envMock themselves and rely on the ambient
    // isMac:false default, so this block must not leave isMac:true trailing
    // into whatever test runs next in file order.
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  describe('SteamGame.stop() — bridge route kills the per-game bottle (261024-urq)', () => {
    const PER_GAME_BOTTLE = `GameLibSteamBridge-${APP_ID}`
    const warnedNoOp = () => {
      const { logWarning } = jest.requireMock('backend/logger')
      return (logWarning as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('Steam owns process lifecycle')
      )
    }
    const warnedMessages = () => {
      const { logWarning } = jest.requireMock('backend/logger')
      return (logWarning as jest.Mock).mock.calls.map((c) => String(c[0]))
    }

    // Drive a real bridge launch; the wine child stays pending like a live
    // game (CrossOver's winewrapper lives as long as the game).
    const launchBridge = async (bottle: string) => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
        wineCrossoverBottle: bottle
      })
      ;(stopPerGameBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'stopped'
      })
      runWineCommand.mockReturnValue(new Promise(() => {}))
      const game = new SteamGame(APP_ID, steamTestDeps)
      expect(await game.launch({} as any)).toBe(true)
      return game
    }

    it('per-game bottle: kills it once, then stops the helper and the monitor; no no-op warning', async () => {
      const game = await launchBridge(PER_GAME_BOTTLE)
      stopBridgeHelper.mockClear()

      await game.stop()

      expect(stopPerGameBridgeBottle).toHaveBeenCalledTimes(1)
      expect(stopPerGameBridgeBottle).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID
      )
      expect(stopBridgeHelper).toHaveBeenCalledWith(APP_ID)
      expect(stopBottleProcessMonitor).toHaveBeenCalledWith(APP_ID)
      expect(warnedNoOp()).toBe(false)
    })

    it('monitor phase starting (still launching): the kill still happens', async () => {
      const game = await launchBridge(PER_GAME_BOTTLE)
      getBottleProcessMonitorPhase.mockReturnValue('starting')

      await game.stop()
      expect(stopPerGameBridgeBottle).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID
      )
      expect(stopBottleProcessMonitor).toHaveBeenCalledWith(APP_ID)
    })

    it('legacy shared bottle: no kill, helper and monitor still torn down, warning names the shared bottle', async () => {
      const game = await launchBridge('GameLibSteamBridge')
      stopBridgeHelper.mockClear()

      await game.stop()

      expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()
      expect(stopBridgeHelper).toHaveBeenCalledWith(APP_ID)
      expect(stopBottleProcessMonitor).toHaveBeenCalledWith(APP_ID)
      expect(
        warnedMessages().some((m) =>
          m.includes('shared bridge bottle GameLibSteamBridge')
        )
      ).toBe(true)
    })

    it('game exited on its own (monitor onStopped) before Stop: no kill', async () => {
      const game = await launchBridge(PER_GAME_BOTTLE)
      const monitorArgs = startBottleProcessMonitor.mock.calls[0][1]
      monitorArgs.onStopped()

      await game.stop()

      expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()
    })

    it('a second stop() does not kill again', async () => {
      const game = await launchBridge(PER_GAME_BOTTLE)

      await game.stop()
      await game.stop()

      expect(stopPerGameBridgeBottle).toHaveBeenCalledTimes(1)
    })

    it('bottled-Steam route (no bridge launch recorded, monitor running): monitor ended, no kill', async () => {
      getBottleProcessMonitorPhase.mockReturnValue('running')
      const game = new SteamGame(APP_ID, steamTestDeps)

      await game.stop()

      expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()
      expect(stopBottleProcessMonitor).toHaveBeenCalledWith(APP_ID)
    })
  })

  describe('quick 261026-lif: SteamGame.repair() and persisted fingerprints', () => {
    const INSTALL_ROOT = `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4`

    it('bridge title: restores originals with the resolved bottle and install root, stdout lists each outcome', async () => {
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      ;(restoreBridgeSteamApiOriginals as jest.Mock).mockResolvedValue({
        status: 'ok',
        outcomes: [
          { path: `${INSTALL_ROOT}/bin/steam_api64.dll`, outcome: 'restored' },
          { path: `${INSTALL_ROOT}/steam_api.dll`, outcome: 'not-in-depot' }
        ]
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).repair()

      expect(restoreBridgeSteamApiOriginals).toHaveBeenCalledTimes(1)
      expect(restoreBridgeSteamApiOriginals).toHaveBeenCalledWith({
        installRuntime: steamTestDeps.steamInstallRuntime,
        steamUser: steamTestDeps.steamUser,
        config: steamTestDeps.config,
        appId: APP_ID,
        bottleDir: '/mock/bridge/bottle',
        installRoot: INSTALL_ROOT,
        installdir: 'Avernum 4'
      })
      expect(result.stderr).toBe('')
      expect(result.stdout.split('\n')).toEqual([
        'bin/steam_api64.dll: restored',
        'steam_api.dll: not-in-depot'
      ])
    })

    it('a partial restore throws naming the failed paths', async () => {
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      ;(restoreBridgeSteamApiOriginals as jest.Mock).mockResolvedValue({
        status: 'partial',
        outcomes: [
          {
            path: `${INSTALL_ROOT}/bin/steam_api64.dll`,
            outcome: 'download-failed',
            detail: 'cdn down'
          }
        ]
      })

      await expect(
        new SteamGame(APP_ID, steamTestDeps).repair()
      ).rejects.toThrow(/bin\/steam_api64\.dll: download-failed \(cdn down\)/)
    })

    it.each([
      [
        'no resolvable exe',
        () => (resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(undefined)
      ],
      [
        'bottle not ready',
        () => (isBridgeBottleReady as jest.Mock).mockReturnValue(false)
      ],
      [
        'exe absent on disk',
        () => (existsSync as jest.Mock).mockReturnValue(false)
      ]
    ])(
      'non-bridge title (%s): scoped error, restore never called',
      async (_n, arrange) => {
        ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
          RESOLVED_EXE_PATH
        )
        arrange()

        const err = await new SteamGame(APP_ID, steamTestDeps)
          .repair()
          .catch((e: Error) => e)

        expect(err).toBeInstanceOf(Error)
        expect((err as Error).message).toContain(
          'Repair restores bridge steam_api originals'
        )
        expect((err as Error).message).not.toContain('Phase 2')
        expect(restoreBridgeSteamApiOriginals).not.toHaveBeenCalled()
      }
    )

    it('launch threads persistedOriginalFingerprints from the persisted scan, and omits the key when absent', async () => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      const fps = { 'drive_c/x/steam_api.dll': { size: 3, sha1: 'ab' } }
      const spy = jest.spyOn(bridgeVerdictModule, 'readBridgeVerdict')
      try {
        spy.mockReturnValue({
          scan: { interfaceVersions: {}, originalFingerprints: fps }
        } as never)
        await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
        expect(placeShimForGame).toHaveBeenLastCalledWith(
          expect.anything(),
          steamTestDeps.paths,
          APP_ID,
          RESOLVED_EXE_PATH,
          expect.objectContaining({ persistedOriginalFingerprints: fps })
        )

        spy.mockReturnValue({ scan: { interfaceVersions: {} } } as never)
        await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
        const opts = (placeShimForGame as jest.Mock).mock.calls.at(-1)[3]
        expect(opts).not.toHaveProperty('persistedOriginalFingerprints')
      } finally {
        jest.restoreAllMocks()
      }
    })
  })

  it('allowlisted launch: resolveBridgeLaunchExe -> placeShimForGame -> ensureBridgeHelperReady -> writeBridgeConfig -> runWineCommand with the RESOLVED exe path + getBridgeBottleSettings (NOT tellBottledSteamToLaunch, no <gameExePath> placeholder)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      offline: false
    })
    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({ bottleName: 'GameLibSteamBridge' })
    )
    expect(ensureBridgeHelperReady).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      expect.any(Object)
    )
    expect(writeBridgeConfig).toHaveBeenCalledWith({
      paths: steamTestDeps.paths,
      exePath: RESOLVED_EXE_PATH,
      bottleName: 'GameLibSteamBridge',
      appId: APP_ID,
      port: 55123,
      secret: BRIDGE_TEST_SECRET,
      shimPaths: [RESOLVED_EXE_PATH]
    })
    // quick/261016-u1w (D-B threading): getBridgeBottleSettings is now
    // per-appId, so the resolved bottle used for every readiness/config
    // step and runWineCommand's gameSettings is this game's OWN bridge
    // bottle.
    expect(getBridgeBottleSettings).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandParts: [RESOLVED_EXE_PATH],
        gameSettings: { wineCrossoverBottle: 'GameLibSteamBridge' },
        wait: false
      })
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(result).toBe(true)

    // Phase 51 Plan 01 Task 2 (D-51-01): the monitor is started with
    // kind:'bridge' and an onStopped that tears down THIS appId's helper.
    expect(startBottleProcessMonitor).toHaveBeenCalledTimes(1)
    const monitorArgs = startBottleProcessMonitor.mock.calls[0][1]
    expect(monitorArgs.appId).toBe(APP_ID)
    expect(monitorArgs.kind).toBe('bridge')
    expect(monitorArgs.bottleDir).toBe('/mock/bridge/bottle')
    expect(typeof monitorArgs.onStopped).toBe('function')

    monitorArgs.onStopped()
    expect(stopBridgeHelper).toHaveBeenCalledWith(APP_ID)
  })

  it('quick 261024-tny: the known-fixes applier runs with (appId, bridge settings, install root, exe path) before the monitor and the wine launch', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    // quick 261028-k7l added exePath as the 4th arg.
    expect(applySteamBridgeKnownFixes).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      { wineCrossoverBottle: 'GameLibSteamBridge' },
      `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4`,
      RESOLVED_EXE_PATH
    )
    const applierOrder = at(
      (applySteamBridgeKnownFixes as jest.Mock).mock.invocationCallOrder,
      0
    )
    expect(applierOrder).toBeLessThan(
      at(startBottleProcessMonitor.mock.invocationCallOrder, 0)
    )
    expect(applierOrder).toBeLessThan(
      at(runWineCommand.mock.invocationCallOrder, 0)
    )
  })

  it('starts the game in the install root, not the exe dir (Grim Dawn x64/ cwd), or in the resolved workingdir when there is one', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(resolveBridgeLaunchWorkingDir as jest.Mock).mockReturnValue(undefined)

    await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
    expect(runWineCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startFolder: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4`
      })
    )
    ;(resolveBridgeLaunchWorkingDir as jest.Mock).mockReturnValue(
      `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/bin`
    )
    await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
    expect(runWineCommand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startFolder: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/bin`
      })
    )
  })

  it('quick 261024-tny: the settings the applier returns (fix env) are what runWineCommand receives; the monitor bottleDir is unchanged', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    const withEnv = {
      wineCrossoverBottle: 'GameLibSteamBridge',
      enviromentOptions: [{ key: 'DXVK_ASYNC', value: '1' }]
    }
    ;(applySteamBridgeKnownFixes as jest.Mock).mockResolvedValue(withEnv)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(runWineCommand.mock.calls[0][0].gameSettings).toBe(withEnv)
    expect(startBottleProcessMonitor.mock.calls[0][1].bottleDir).toBe(
      '/mock/bridge/bottle'
    )
  })

  it('quick 261024-tny: a rejecting applier never fails the launch -- original settings reach runWineCommand, warning logged, no steamBridgeSetupRequired', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(applySteamBridgeKnownFixes as jest.Mock).mockRejectedValue(
      new Error('fix boom')
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        gameSettings: { wineCrossoverBottle: 'GameLibSteamBridge' }
      })
    )
    const { logWarning } = jest.requireMock('backend/logger')
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('fix boom'),
      'Steam'
    )
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.anything()
    )
  })

  it('quick 261025-rkj: the shared redist installer runs with (appId, bridge settings) after the known fixes and before the monitor and wine launch', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(installSteamBridgeSharedRedists).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      { wineCrossoverBottle: 'GameLibSteamBridge' }
    )
    const order = at(
      (installSteamBridgeSharedRedists as jest.Mock).mock.invocationCallOrder,
      0
    )
    expect(order).toBeGreaterThan(
      at((applySteamBridgeKnownFixes as jest.Mock).mock.invocationCallOrder, 0)
    )
    expect(order).toBeLessThan(
      at(startBottleProcessMonitor.mock.invocationCallOrder, 0)
    )
    expect(order).toBeLessThan(at(runWineCommand.mock.invocationCallOrder, 0))
  })

  it('Phase 54: a bridge Play never acquires or ensures a CM session and passes no allowLogon to the shared redist step', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    await new SteamGame(APP_ID, steamTestDeps).launch({} as any)

    expect(steamUser.acquireAuthenticated).not.toHaveBeenCalled()
    expect(steamUser.acquireOpenAuthenticated).not.toHaveBeenCalled()
    expect(steamUser.ensureConnected).not.toHaveBeenCalled()
    const call = (installSteamBridgeSharedRedists as jest.Mock).mock.calls[0]
    expect(call[4]?.allowLogon).not.toBe(true)
  })

  it('quick 261025-rkj: the installer runs once per bridge launch', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    await new SteamGame(APP_ID, steamTestDeps).launch({} as any)

    expect(installSteamBridgeSharedRedists).toHaveBeenCalledTimes(1)
  })

  it('quick 261025-rkj: a rejecting installer never fails the launch -- game still launches, warning logged, no steamBridgeSetupRequired', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(installSteamBridgeSharedRedists as jest.Mock).mockRejectedValue(
      new Error('redist boom')
    )

    const result = await new SteamGame(APP_ID, steamTestDeps).launch({} as any)

    expect(result).toBe(true)
    expect(runWineCommand).toHaveBeenCalled()
    const { logWarning } = jest.requireMock('backend/logger')
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('redist boom'),
      'Steam'
    )
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.anything()
    )
  })

  it('placeShimForGame rejects (shim-not-built) — game is NOT launched, markBridgeFailedThisSession applied, steamBridgeSetupRequired fired with reason shim-refresh-failed, ensureBridgeHelperReady never reached', async () => {
    const SHIM_FAIL_APP_ID = '555555'
    library.set(SHIM_FAIL_APP_ID, makeEntry({ title: 'Shim Refresh Failure' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'shim-not-built'
    })

    const game = new SteamGame(SHIM_FAIL_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
    expect(result).toBe(false)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: SHIM_FAIL_APP_ID,
        reason: 'shim-refresh-failed',
        fallbackAvailable: true
      }
    )

    // Poisoned this session -- a later launch() for the SAME appId skips
    // the bridge entirely (finding #3 lineage).
    const secondResult = await game.launch({} as any)
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(
      steamTestDeps,
      SHIM_FAIL_APP_ID
    )
    expect(secondResult).toBe(true)
  })

  it('shim-not-built with arch x64 fires steamBridgeSetupRequired with reason win64-no-shim (D-51-13), not the generic shim-refresh-failed', async () => {
    const WIN64_SHIM_APP_ID = '555556'
    library.set(WIN64_SHIM_APP_ID, makeEntry({ title: 'Win64 Shim Missing' }))
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'shim-not-built',
      arch: 'x64'
    })

    const game = new SteamGame(WIN64_SHIM_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(false)
    expect(runWineCommand).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: WIN64_SHIM_APP_ID,
        reason: 'win64-no-shim',
        fallbackAvailable: true
      }
    )
  })

  describe('quick 261024-br4: Steam CEG DRM detected at launch', () => {
    const CEG_APP_ID = '555558'
    const CEG_DRM = { kind: 'ceg', markers: ['STEAM_SPLIT_GUID'] }

    beforeEach(() => {
      library.set(CEG_APP_ID, makeEntry({ title: 'CEG Title' }))
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      ;(removePerGameBridgeBottle as jest.Mock).mockReset()
    })

    it('returns false with the drm-wrapped dialog, persists drm, keeps the bottle', async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH,
        drm: CEG_DRM
      })

      const game = new SteamGame(CEG_APP_ID, steamTestDeps)
      const result = await game.launch({} as any)

      expect(result).toBe(false)
      expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
      expect(runWineCommand).not.toHaveBeenCalled()
      expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        {
          appName: CEG_APP_ID,
          reason: 'drm-wrapped',
          fallbackAvailable: true
        }
      )
      const drmPersistCall = (
        steamMetadataStore.set as jest.Mock
      ).mock.calls.find(
        ([id, value]) => id === CEG_APP_ID && value?.bridge?.drm === 'ceg'
      )
      expect(drmPersistCall).toBeDefined()
      expect(reportDetectedFix).toHaveBeenCalledWith(
        {
          appId: CEG_APP_ID,
          key: 'drm',
          op: 'add',
          detector: 'ceg'
        },
        expect.objectContaining({ post: expect.any(Function) })
      )

      // Breaker armed: the next launch skips the bridge.
      isBottleReady.mockReturnValue(true)
      ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
        status: 'done'
      })
      ;(placeShimForGame as jest.Mock).mockClear()
      await game.launch({} as any)
      expect(placeShimForGame).not.toHaveBeenCalled()
      expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(
        steamTestDeps,
        CEG_APP_ID
      )
    })

    it("with userRoute 'bridge' proceeds to the helper and the wine launch", async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { userRoute: 'bridge' }
      })
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH,
        drm: CEG_DRM
      })

      const game = new SteamGame(CEG_APP_ID, steamTestDeps)
      const result = await game.launch({} as any)

      expect(result).toBe(true)
      expect(ensureBridgeHelperReady).toHaveBeenCalledWith(
        expect.anything(),
        CEG_APP_ID,
        expect.any(Object)
      )
      expect(runWineCommand).toHaveBeenCalled()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
      // Phase 57: a forced-bridge title still reports (Pitfall 6).
      expect(reportDetectedFix).toHaveBeenCalledWith(
        {
          appId: CEG_APP_ID,
          key: 'drm',
          op: 'add',
          detector: 'ceg'
        },
        expect.objectContaining({ post: expect.any(Function) })
      )
    })

    it('does not report when drm is null (parsed, not CEG)', async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH,
        drm: null
      })

      await new SteamGame(CEG_APP_ID, steamTestDeps).launch({} as any)

      expect(reportDetectedFix).not.toHaveBeenCalled()
    })

    it('still resolves the launch when the report hook never settles', async () => {
      ;(reportDetectedFix as jest.Mock).mockImplementation(
        () => new Promise(() => undefined)
      )
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH,
        drm: CEG_DRM
      })

      await expect(
        new SteamGame(CEG_APP_ID, steamTestDeps).launch({} as any)
      ).resolves.toBe(false)
    })
  })

  describe('quick 261023-oq7: a miss launches through the bridge', () => {
    const MISS_APP_ID = '555557'
    const missVerdict = (symbols: string[], arch: 'x86' | 'x64' = 'x86') => ({
      status: 'miss' as const,
      arch,
      missingSymbols: symbols,
      interfaceVersions: { SteamUser: 'SteamUser023' },
      stubbedInterfaces: [],
      shimExportSetVersion: 'v1',
      scannedAt: '2026-01-01T00:00:00.000Z'
    })

    beforeEach(() => {
      library.set(MISS_APP_ID, makeEntry({ title: 'Launch-Time Miss' }))
      isBottleReady.mockReturnValue(true)
      ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
        status: 'done'
      })
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
    })

    it("'placed-miss' persists the verdict, sets up helper and cfg, runs the game, and sends no setup-required", async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed-miss',
        shimPaths: [RESOLVED_EXE_PATH],
        verdict: missVerdict(['SteamUtils005'])
      })

      const result = await new SteamGame(MISS_APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(ensureBridgeHelperReady).toHaveBeenCalledWith(
        expect.anything(),
        MISS_APP_ID,
        expect.any(Object)
      )
      expect(writeBridgeConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          interfaceVersions: { SteamUser: 'SteamUser023' }
        })
      )
      expect(runWineCommand).toHaveBeenCalled()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
      const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
        ([id, value]) =>
          id === MISS_APP_ID &&
          value?.bridge?.scan?.status === 'miss' &&
          value.bridge.scan.missingSymbols.includes('SteamUtils005')
      )
      expect(persistCall).toBeDefined()
      // Not poisoned: a later launch still goes through the bridge.
      await new SteamGame(MISS_APP_ID, steamTestDeps).launch({} as any)
      expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    })

    it('CR-04: a runtime-loaded miss launches with the marker persisted in missingSymbols', async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed-miss',
        shimPaths: [RESOLVED_EXE_PATH],
        verdict: missVerdict(['steam_api64.dll@runtime-loaded'], 'x64')
      })

      const result = await new SteamGame(MISS_APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(runWineCommand).toHaveBeenCalled()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
      const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
        ([id, value]) =>
          id === MISS_APP_ID &&
          value?.bridge?.scan?.missingSymbols?.includes(
            'steam_api64.dll@runtime-loaded'
          )
      )
      expect(persistCall).toBeDefined()
    })

    it("'already-placed' with a persisted miss launches through the helper and does not overwrite the persisted miss", async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { scan: missVerdict(['steam_api64.dll@runtime-loaded'], 'x64') }
      })
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH
      })

      const result = await new SteamGame(MISS_APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(ensureBridgeHelperReady).toHaveBeenCalled()
      expect(runWineCommand).toHaveBeenCalled()
      const overwrite = (steamMetadataStore.set as jest.Mock).mock.calls.find(
        ([id, value]) =>
          id === MISS_APP_ID && value?.bridge?.scan?.status === 'clean'
      )
      expect(overwrite).toBeUndefined()
    })

    it("helper not ready after a 'placed-miss': the breaker and dialog still fire (real failures unchanged)", async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed-miss',
        shimPaths: [RESOLVED_EXE_PATH],
        verdict: missVerdict(['SteamUtils005'])
      })
      ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
        status: 'not-inited',
        ready: false
      })

      const game = new SteamGame(MISS_APP_ID, steamTestDeps)
      const result = await game.launch({} as any)

      expect(result).toBe(false)
      expect(runWineCommand).not.toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.objectContaining({
          appName: MISS_APP_ID,
          reason: 'not-inited'
        })
      )
    })

    it.each(['steam-not-running', 'steam-not-signed-in'] as const)(
      'quick 261027-aue: helper status %s -> no launch, session NOT poisoned, setup message without the bottled fallback',
      async (status) => {
        ;(placeShimForGame as jest.Mock).mockResolvedValue({
          status: 'already-placed',
          shimPath: RESOLVED_EXE_PATH
        })
        ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValueOnce({
          status,
          ready: false
        })

        const first = await new SteamGame(MISS_APP_ID, steamTestDeps).launch(
          {} as any
        )

        expect(first).toBe(false)
        expect(runWineCommand).not.toHaveBeenCalled()
        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'steamBridgeSetupRequired',
          {
            appName: MISS_APP_ID,
            reason: status,
            fallbackAvailable: false
          }
        )

        // Not poisoned: the next Play goes down the bridge path again.
        ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
          status: 'ready',
          ready: true,
          port: 55001,
          secret: 'a'.repeat(64)
        })
        const second = await new SteamGame(MISS_APP_ID, steamTestDeps).launch(
          {} as any
        )
        expect(second).toBe(true)
        expect(ensureBridgeHelperReady).toHaveBeenCalledTimes(2)
        expect(runWineCommand).toHaveBeenCalled()
      }
    )

    it('quick 261027-aue: launch passes onWaitingForSteam, which fires notify() with the waiting strings', async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH
      })
      ;(notify as jest.Mock).mockClear()

      await new SteamGame(MISS_APP_ID, steamTestDeps).launch({} as any)

      const options = (ensureBridgeHelperReady as jest.Mock).mock.calls[0][2]
      expect(options.onWaitingForSteam).toEqual(expect.any(Function))
      options.onWaitingForSteam('steam-not-running')
      expect(notify).toHaveBeenCalledTimes(1)
      expect(notify).toHaveBeenCalledWith({
        title: 'gamelib:steam.bridge.waiting.title',
        body: 'gamelib:steam.bridge.waiting.notRunning'
      })
    })
  })

  describe('quick 261023-ue0: shimPaths handed to writeBridgeConfig', () => {
    const UE0_APP_ID = '555558'
    const UNITY_SHIM = `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/Game_Data/Plugins/x86_64/steam_api64.dll`
    const missVerdict = {
      status: 'miss' as const,
      arch: 'x64' as const,
      missingSymbols: ['steam_api64.dll@runtime-loaded'],
      interfaceVersions: {},
      stubbedInterfaces: [],
      shimExportSetVersion: 'v1',
      scannedAt: '2026-01-01T00:00:00.000Z'
    }

    beforeEach(() => {
      library.set(UE0_APP_ID, makeEntry({ title: 'Unity Runtime' }))
      isBottleReady.mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
    })

    const launchWith = async (shimResult: object) => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue(shimResult)
      return new SteamGame(UE0_APP_ID, steamTestDeps).launch({} as any)
    }

    it("'placed' passes [shimPath]", async () => {
      await launchWith({ status: 'placed', shimPath: RESOLVED_EXE_PATH })
      expect(writeBridgeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ shimPaths: [RESOLVED_EXE_PATH] })
      )
    })

    it("'placed-miss' passes every shimPaths entry", async () => {
      await launchWith({
        status: 'placed-miss',
        shimPaths: [RESOLVED_EXE_PATH, UNITY_SHIM],
        verdict: missVerdict
      })
      expect(writeBridgeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ shimPaths: [RESOLVED_EXE_PATH, UNITY_SHIM] })
      )
    })

    it("'already-placed' with shimPaths rewrites the cfg at the Unity Plugins path on a repeat launch", async () => {
      await launchWith({
        status: 'already-placed',
        shimPath: UNITY_SHIM,
        shimPaths: [UNITY_SHIM]
      })
      expect(writeBridgeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ shimPaths: [UNITY_SHIM] })
      )
    })

    it("'already-placed' with only shimPath (static branch) passes [shimPath]", async () => {
      await launchWith({
        status: 'already-placed',
        shimPath: RESOLVED_EXE_PATH
      })
      expect(writeBridgeConfig).toHaveBeenCalledWith(
        expect.objectContaining({ shimPaths: [RESOLVED_EXE_PATH] })
      )
    })
  })

  describe('D-14 (56-13): Phase 52 forwarder removed', () => {
    const SHIM = RESOLVED_EXE_PATH
    const BASE_VERDICT = {
      status: 'clean' as const,
      arch: 'x64' as const,
      missingSymbols: [],
      interfaceVersions: {},
      stubbedInterfaces: [],
      shimExportSetVersion: 'v1',
      scannedAt: '2026-01-01T00:00:00.000Z'
    }
    let idCounter = 0
    const freshId = () => {
      const id = String(770000 + ++idCounter)
      library.set(id, makeEntry({ title: `SteamStub ${id}` }))
      return id
    }
    const callOrder: string[] = []
    const { logInfo } = jest.requireMock('backend/logger')
    const dialogMock = jest.requireMock('backend/dialog/dialog')
      .showDialogBoxModalAuto as jest.Mock

    beforeEach(() => {
      callOrder.length = 0
      dialogMock.mockClear()
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      isBottleReady.mockReturnValue(true)
      ;(notify as jest.Mock).mockClear()
      ;(logInfo as jest.Mock).mockClear()
      sendFrontendMessage.mockClear()
      ;(writeBridgeConfig as jest.Mock).mockImplementation(() => {
        callOrder.push('cfg')
        return { status: 'written', path: '/mock/cfg' }
      })
      runWineCommand.mockImplementation(() => {
        callOrder.push('wine')
        return Promise.resolve({ stdout: '', stderr: '' })
      })
    })

    // Built by concatenation so the removal grep gate finds no literal.
    const STEAMSTUB = 'steam' + 'stub'
    // True when any Phase 52 steamstub trace (log line, notify) appeared.
    const steamStubTrace = (): boolean =>
      (logInfo as jest.Mock).mock.calls.some(
        (c) =>
          typeof c[0] === 'string' &&
          (c[0].includes('reason=' + STEAMSTUB + '-') ||
            c[0].includes('[bridge-' + STEAMSTUB + ']'))
      ) ||
      (notify as jest.Mock).mock.calls.some(
        (c) =>
          typeof c[0]?.title === 'string' &&
          c[0].title.startsWith('gamelib:steam.bridge.' + STEAMSTUB + '.')
      )

    it('TCP placed: a stale steamstub flag launches like any other TCP title with no steamstub trace', async () => {
      const id = freshId()
      jest.spyOn(bridgeVerdictModule, 'readBridgeVerdict').mockReturnValue({
        scan: { ...BASE_VERDICT, drmWrapper: 'steamstub' }
      } as never)
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed',
        shimPath: SHIM,
        verdict: { ...BASE_VERDICT, drmWrapper: 'steamstub' },
        drmWrapper: 'steamstub',
        exeArch: 'x64'
      })
      let result: boolean
      try {
        result = await new SteamGame(id, steamTestDeps).launch({} as any)
      } finally {
        jest.restoreAllMocks()
      }
      expect(result).toBe(true)
      expect(writeBridgeConfig).toHaveBeenCalledTimes(1)
      expect(runWineCommand).toHaveBeenCalledTimes(1)
      expect(callOrder).toEqual(['cfg', 'wine'])
      expect(steamStubTrace()).toBe(false)
      expect(dialogMock).not.toHaveBeenCalled()
    })

    it('withheld: goes direct with no steamstub notice, log or dialog', async () => {
      const id = freshId()
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'withheld',
        restored: [],
        drmWrapper: 'steamstub',
        exeArch: 'x64',
        verdict: {
          ...BASE_VERDICT,
          status: 'miss',
          drmWrapper: 'steamstub',
          missingSymbols: ['SteamAPI_X']
        }
      })
      const result = await new SteamGame(id, steamTestDeps).launch({} as any)
      expect(result).toBe(true)
      expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
      expect(runWineCommand).toHaveBeenCalledTimes(1)
      expect(steamStubTrace()).toBe(false)
      expect(dialogMock).not.toHaveBeenCalled()
    })

    it('no-steam-api: goes direct with no steamstub notice, log or dialog', async () => {
      const id = freshId()
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'no-steam-api',
        verdict: { ...BASE_VERDICT, drmWrapper: 'steamstub' }
      })
      const result = await new SteamGame(id, steamTestDeps).launch({} as any)
      expect(result).toBe(true)
      expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
      expect(runWineCommand).toHaveBeenCalledTimes(1)
      expect(steamStubTrace()).toBe(false)
      expect(dialogMock).not.toHaveBeenCalled()
    })

    it('fresh drmWrapper none overrides a stale persisted steamstub and rewrites the scan without it', async () => {
      const id = freshId()
      jest.spyOn(bridgeVerdictModule, 'readBridgeVerdict').mockReturnValue({
        scan: { ...BASE_VERDICT, drmWrapper: 'steamstub' }
      } as never)
      const writeSpy = jest
        .spyOn(bridgeVerdictModule, 'writeBridgeScanVerdict')
        .mockImplementation(() => undefined as never)
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'already-placed',
        shimPath: SHIM,
        drmWrapper: 'none',
        exeArch: 'x64'
      })
      try {
        await new SteamGame(id, steamTestDeps).launch({} as any)
        expect(writeSpy).toHaveBeenCalledTimes(1)
        expect(at(writeSpy.mock.calls, 0)[1]).not.toHaveProperty('drmWrapper')
      } finally {
        jest.restoreAllMocks()
      }
    })
  })

  it("D-51-09 (Task 2): placeShimForGame's 'no-steam-api' status at launch skips ensureBridgeHelperReady/writeBridgeConfig entirely, calls runWineCommand directly, and persists the clean verdict", async () => {
    const NO_STEAM_API_APP_ID = '555558'
    library.set(
      NO_STEAM_API_APP_ID,
      makeEntry({ title: 'No Steam API Import' })
    )
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'no-steam-api',
      verdict: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'v1',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const game = new SteamGame(NO_STEAM_API_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(writeBridgeConfig).not.toHaveBeenCalled()
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandParts: [RESOLVED_EXE_PATH],
        wait: false
      })
    )
    expect(result).toBe(true)
    const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) =>
        id === NO_STEAM_API_APP_ID && value?.bridge?.scan?.status === 'clean'
    )
    expect(persistCall).toBeDefined()
  })

  it("quick 261024-j4l: placeShimForGame's 'withheld' status at launch goes direct (no helper, no config) and persists the miss verdict", async () => {
    const WITHHELD_APP_ID = '555560'
    library.set(WITHHELD_APP_ID, makeEntry({ title: 'Withheld Shim' }))
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'withheld',
      restored: [],
      verdict: {
        status: 'miss',
        arch: 'x64',
        missingSymbols: ['SteamInternal_GameServer_Init', 'SteamFriends017'],
        interfaceVersions: { SteamFriends: 'SteamFriends017' },
        stubbedInterfaces: [],
        shimExportSetVersion: 'v1',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const game = new SteamGame(WITHHELD_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(writeBridgeConfig).not.toHaveBeenCalled()
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandParts: [RESOLVED_EXE_PATH],
        wait: false
      })
    )
    expect(result).toBe(true)
    const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) =>
        id === WITHHELD_APP_ID && value?.bridge?.scan?.status === 'miss'
    )
    expect(persistCall).toBeDefined()
  })

  it("D-51-09 (Task 2): placeShimForGame's 'placed' status at launch persists the clean verdict via writeBridgeScanVerdict (steamMetadataStore.set observed) and still reaches runWineCommand through the normal helper/config path", async () => {
    const PLACED_APP_ID = '555559'
    library.set(PLACED_APP_ID, makeEntry({ title: 'Freshly Re-placed Shim' }))
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: RESOLVED_EXE_PATH,
      verdict: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: { SteamUtils: 'SteamUtils005' },
        stubbedInterfaces: [],
        shimExportSetVersion: 'v2',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const game = new SteamGame(PLACED_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
    expect(runWineCommand).toHaveBeenCalled()
    // D-51-09: the FRESH verdict's own interfaceVersions pool is handed to
    // writeBridgeConfig, not the (absent) persisted one.
    expect(writeBridgeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceVersions: { SteamUtils: 'SteamUtils005' }
      })
    )
    const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) =>
        id === PLACED_APP_ID &&
        value?.bridge?.scan?.shimExportSetVersion === 'v2'
    )
    expect(persistCall).toBeDefined()
  })

  it("D-51-09 (Task 2): a previously-persisted scan verdict's interfaceVersions pool is threaded into placeShimForGame as persistedInterfaceVersions", async () => {
    const PERSISTED_APP_ID = '555560'
    library.set(
      PERSISTED_APP_ID,
      makeEntry({ title: 'Has A Persisted Verdict' })
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: {
        scan: {
          status: 'clean',
          arch: 'x86',
          missingSymbols: [],
          interfaceVersions: { SteamUser: 'SteamUser023' },
          stubbedInterfaces: [],
          shimExportSetVersion: 'v1',
          scannedAt: '2026-01-01T00:00:00.000Z'
        }
      }
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(PERSISTED_APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      PERSISTED_APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({
        bottleName: 'GameLibSteamBridge',
        persistedInterfaceVersions: { SteamUser: 'SteamUser023' }
      })
    )
  })

  it('51-REVIEW WR-01: with the scan auto-cleared, the top-level retained interfaceVersions pool is threaded as persistedInterfaceVersions', async () => {
    const RETAINED_APP_ID = '555561'
    library.set(
      RETAINED_APP_ID,
      makeEntry({ title: 'Has A Retained Version Pool' })
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: {
        interfaceVersions: { SteamUser: 'SteamUser023' }
      }
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'already-placed',
      shimPath: RESOLVED_EXE_PATH
    })

    const game = new SteamGame(RETAINED_APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      RETAINED_APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({
        persistedInterfaceVersions: { SteamUser: 'SteamUser023' }
      })
    )
    // 'already-placed' carries no fresh verdict, so the cfg's iface lines
    // must come from the retained pool too.
    expect(writeBridgeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        interfaceVersions: { SteamUser: 'SteamUser023' }
      })
    )
  })

  it('quick 261026-u1a: with the scan auto-cleared, the top-level retained originalFingerprints are threaded as persistedOriginalFingerprints', async () => {
    const FP_APP_ID = '555562'
    library.set(FP_APP_ID, makeEntry({ title: 'Fingerprint Fallback' }))
    const staleFps = { 'a.dll': { size: 2, sha1: 'stale' } }
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { originalFingerprints: staleFps }
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'already-placed',
      shimPath: RESOLVED_EXE_PATH
    })

    const game = new SteamGame(FP_APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      FP_APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({ persistedOriginalFingerprints: staleFps })
    )
  })

  it('quick 261026-u1a: scan.originalFingerprints takes precedence over the top-level retained copy', async () => {
    const FP_APP_ID = '555563'
    library.set(FP_APP_ID, makeEntry({ title: 'Fingerprint Fallback' }))
    const scanFps = { 'a.dll': { size: 1, sha1: 'scan' } }
    const staleFps = { 'a.dll': { size: 2, sha1: 'stale' } }
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: {
        scan: {
          status: 'miss',
          arch: 'x86',
          missingSymbols: [],
          interfaceVersions: {},
          stubbedInterfaces: [],
          shimExportSetVersion: 'x',
          scannedAt: 'x',
          originalFingerprints: scanFps
        },
        originalFingerprints: staleFps
      }
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'already-placed',
      shimPath: RESOLVED_EXE_PATH
    })

    const game = new SteamGame(FP_APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      FP_APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({ persistedOriginalFingerprints: scanFps })
    )
  })

  it('WR-03: helper ready:true but no secret -> game is NOT launched and no cfg is written (fail closed)', async () => {
    const NOSECRET_APP_ID = '777777'
    library.set(NOSECRET_APP_ID, makeEntry({ title: 'No Secret Game' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true,
      port: 55123
    })

    const game = new SteamGame(NOSECRET_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(false)
    expect(writeBridgeConfig).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
  })

  it('R7 forced failure: ensureBridgeHelperReady not-ready — game is NOT launched, markBridgeFailedThisSession applied, steamBridgeSetupRequired fired, and a subsequent launch() for the SAME appId skips the bridge (finding #3 bypass)', async () => {
    // A dedicated appId, never reused elsewhere in this file, so this
    // test's bridgeFailedThisSession mutation cannot leak into other tests.
    const FAILING_APP_ID = '888888'
    library.set(FAILING_APP_ID, makeEntry({ title: 'Failing Bridge Game' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'unreachable',
      ready: false
    })
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(FAILING_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(runWineCommand).not.toHaveBeenCalled()
    expect(writeBridgeConfig).not.toHaveBeenCalled()
    expect(result).toBe(false)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: FAILING_APP_ID,
        reason: 'unreachable',
        fallbackAvailable: true
      }
    )

    // A subsequent launch() re-invocation (e.g. the D-05 fallback dialog's
    // own re-invocation) must now skip the bridge entirely (finding #3) and
    // route to the existing bottled path instead.
    const secondResult = await game.launch({} as any)
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(
      steamTestDeps,
      FAILING_APP_ID
    )
    expect(secondResult).toBe(true)
  })

  it('writeBridgeConfig rejects — game is NOT launched, markBridgeFailedThisSession applied, steamBridgeSetupRequired fired with reason bridge-config-write-failed', async () => {
    const CONFIG_FAIL_APP_ID = '444444'
    library.set(
      CONFIG_FAIL_APP_ID,
      makeEntry({ title: 'Bridge Config Write Failure' })
    )
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(writeBridgeConfig as jest.Mock).mockReturnValue({
      status: 'error',
      error: 'boom'
    })

    const game = new SteamGame(CONFIG_FAIL_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(runWineCommand).not.toHaveBeenCalled()
    expect(result).toBe(false)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: CONFIG_FAIL_APP_ID,
        reason: 'bridge-config-write-failed',
        fallbackAvailable: true
      }
    )

    const secondResult = await game.launch({} as any)
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(
      steamTestDeps,
      CONFIG_FAIL_APP_ID
    )
    expect(secondResult).toBe(true)
  })

  it('resolveBridgeLaunchExe returns undefined — launch() does NOT run a bare/undefined path, marks bridge-failed, fires steamBridgeSetupRequired', async () => {
    const NO_EXE_APP_ID = '777777'
    library.set(NO_EXE_APP_ID, makeEntry({ title: 'No Windows Launch Entry' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(undefined)

    const game = new SteamGame(NO_EXE_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(runWineCommand).not.toHaveBeenCalled()
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: NO_EXE_APP_ID,
        reason: 'launch-exe-not-resolved',
        fallbackAvailable: true
      }
    )
    expect(result).toBe(false)
  })

  it('D-UAT-24-02: resolveBridgeLaunchExe returns a path, but the exe is absent on disk (installed via a non-bridge path) — runWineCommand is NOT called, steamBridgeSetupRequired fired with reason bridge-not-installed, markBridgeFailedThisSession NOT applied (bridge stays eligible for a later install-through-bridge retry), and the shim/helper/config steps never even run', async () => {
    const NOT_INSTALLED_APP_ID = '666666'
    library.set(
      NOT_INSTALLED_APP_ID,
      makeEntry({ title: 'Installed via native/old-bottle path' })
    )
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(NOT_INSTALLED_APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(existsSync).toHaveBeenCalledWith(RESOLVED_EXE_PATH)
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: NOT_INSTALLED_APP_ID,
        reason: 'bridge-not-installed',
        fallbackAvailable: true
      }
    )
    expect(result).toBe(false)

    // Not a bridge FAILURE — markBridgeFailedThisSession must NOT have been
    // applied, so a later install-through-the-bridge retry is not poisoned.
    // Proven black-box: a subsequent launch() with the exe now present
    // reaches runWineCommand rather than falling back to the bottled path.
    ;(existsSync as jest.Mock).mockReturnValue(true)
    const secondResult = await game.launch({} as any)
    expect(runWineCommand).toHaveBeenCalledTimes(1)
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(secondResult).toBe(true)
  })

  it('D-UAT-24-02: exe resolved + exe exists on disk + bridge bottle ready — happy path unchanged (runWineCommand fires, monitor starts)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(runWineCommand).toHaveBeenCalledTimes(1)
    expect(startBottleProcessMonitor).toHaveBeenCalledTimes(1)
    expect(result).toBe(true)
  })

  describe('51-23: monitor starts before the wine child is awaited', () => {
    const flush = async () => {
      for (let i = 0; i < 10; i++) await Promise.resolve()
    }

    beforeEach(() => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
    })

    it('resolves true with a never-settling wine child; monitor already started, before runWineCommand', async () => {
      const handle = { launcherExited: jest.fn() }
      startBottleProcessMonitor.mockReturnValue(handle)
      runWineCommand.mockReturnValue(new Promise(() => {}))

      const result = await new SteamGame(APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(startBottleProcessMonitor).toHaveBeenCalledTimes(1)
      const monitorArgs = startBottleProcessMonitor.mock.calls[0][1]
      expect(monitorArgs.kind).toBe('bridge')
      monitorArgs.onStopped()
      expect(stopBridgeHelper).toHaveBeenCalledWith(APP_ID)
      expect(
        at(startBottleProcessMonitor.mock.invocationCallOrder, 0)
      ).toBeLessThan(at(runWineCommand.mock.invocationCallOrder, 0))
      expect(handle.launcherExited).not.toHaveBeenCalled()
    })

    it('wine child resolving calls launcherExited once', async () => {
      const handle = { launcherExited: jest.fn() }
      startBottleProcessMonitor.mockReturnValue(handle)
      let resolveWine: (v: unknown) => void = () => {}
      runWineCommand.mockReturnValue(
        new Promise((r) => {
          resolveWine = r
        })
      )

      await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
      resolveWine({ stdout: '', stderr: '' })
      await flush()

      expect(handle.launcherExited).toHaveBeenCalledTimes(1)
    })

    it('wine child rejecting marks failed, sends bridge-launch-failed, calls launcherExited once', async () => {
      const handle = { launcherExited: jest.fn() }
      startBottleProcessMonitor.mockReturnValue(handle)
      let rejectWine: (e: unknown) => void = () => {}
      runWineCommand.mockReturnValue(
        new Promise((_r, rej) => {
          rejectWine = rej
        })
      )

      await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
      rejectWine(new Error('spawn failed'))
      await flush()

      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        {
          appName: APP_ID,
          reason: 'bridge-launch-failed',
          fallbackAvailable: true
        }
      )
      expect(jest.requireMock('backend/logger').logWarning).toHaveBeenCalled()
      expect(handle.launcherExited).toHaveBeenCalledTimes(1)
    })

    it('null install root: warns, still launches wine, rejection handler works with a null handle', async () => {
      ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
        '/somewhere/else/steamapps'
      )
      runWineCommand.mockRejectedValue(new Error('boom'))

      const result = await new SteamGame(APP_ID, steamTestDeps).launch(
        {} as any
      )
      await flush()

      expect(result).toBe(true)
      expect(startBottleProcessMonitor).not.toHaveBeenCalled()
      expect(runWineCommand).toHaveBeenCalledTimes(1)
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.objectContaining({ reason: 'bridge-launch-failed' })
      )
    })
  })

  it('known-bad title (knownBadReason non-null) never calls resolveBridgeLaunchExe/placeShimForGame/ensureBridgeHelperReady/writeBridgeConfig/runWineCommand — routes to the bottled launch flow (D-51-07, resolveBridgeRoute rule 4)', async () => {
    // Phase 51 Plan 09: a non-seed, never-scanned, bottle-eligible title now
    // DEFAULTS to the bridge route (resolveBridgeRoute rule 11,
    // 'pending-scan') -- bridgeAllowlist.has(false) alone no longer forces
    // the bottled path. knownBadReason is the deterministic way to force it.
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(
      'drm-wrapped'
    )
    isBottleReady.mockReturnValue(true)
    // D-51-09: launch() dispatches on LOCATION (findBridgeInstallBottle), not
    // ELIGIBILITY -- a known-bad title's install() would never have routed
    // bits into the bridge bottle in the first place (resolveBridgeRoute
    // rule 4), so the outer beforeEach's blanket isBridgeBottleReady:true
    // default does not model this scenario and must be overridden here.
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(resolveBridgeLaunchExe).not.toHaveBeenCalled()
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(ensureBridgeHelperReady).not.toHaveBeenCalled()
    expect(writeBridgeConfig).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(steamTestDeps, APP_ID)
  })

  it('non-seed, never-scanned, bottle-eligible title now routes to the bridge on launch (D-51-07, resolveBridgeRoute rule 11 — pending-scan)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.launch({} as any)

    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })
})

// ── SteamGame.stop() — no-op ──────────────────────────────────────────────────

describe('SteamGame.stop() — no-op', () => {
  beforeEach(() => {
    library.clear()
    library.set(APP_ID, makeEntry())
  })

  it('stop() resolves void without throwing (Steam owns process lifecycle)', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.stop()).resolves.toBeUndefined()
  })
})

describe('SteamGame.stop() — pending launch monitor (261024-gvu)', () => {
  const warnedNoOp = () => {
    const { logWarning } = jest.requireMock('backend/logger')
    return (logWarning as jest.Mock).mock.calls.some((c) =>
      String(c[0]).includes('Steam owns process lifecycle')
    )
  }

  it('ends a live monitor instead of the no-op warning', async () => {
    getBottleProcessMonitorPhase.mockReturnValue('starting')
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.stop()
    expect(stopBottleProcessMonitor).toHaveBeenCalledWith(APP_ID)
    expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()
    expect(warnedNoOp()).toBe(false)
  })

  it('phase null keeps the no-op warning and does not stop a monitor', async () => {
    getBottleProcessMonitorPhase.mockReturnValue(null)
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.stop()
    expect(stopBottleProcessMonitor).not.toHaveBeenCalled()
    expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()
    expect(warnedNoOp()).toBe(true)
  })
})

describe('SteamGame.stop() — Steam-launched PID stop (261111-9b7)', () => {
  const warnedNoOp = () => {
    const { logWarning } = jest.requireMock('backend/logger')
    return (logWarning as jest.Mock).mock.calls.some((c) =>
      String(c[0]).includes('Steam owns process lifecycle')
    )
  }
  let stopSpy: jest.SpyInstance
  let doneSpy: jest.SpyInstance
  beforeEach(() => {
    getBottleProcessMonitorPhase.mockReturnValue(null)
    stopSpy = jest.spyOn(stopSteamLaunchedModule, 'stopSteamLaunchedGame')
    doneSpy = jest
      .spyOn(gameLaunchModule, 'sendLaunchDone')
      .mockImplementation(() => undefined)
  })
  afterEach(() => {
    stopSpy.mockRestore()
    doneSpy.mockRestore()
  })

  it('stopped -> sends done, no no-op warning', async () => {
    stopSpy.mockResolvedValue({
      kind: 'stopped',
      folder: '/f',
      termed: [1],
      killed: []
    })
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.stop()).resolves.toBeUndefined()
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(stopSpy.mock.calls[0]?.[1]).toBe(APP_ID)
    expect(doneSpy).toHaveBeenCalledWith(game)
    expect(warnedNoOp()).toBe(false)
  })

  it.each([
    { kind: 'no-process', folder: '/f' },
    { kind: 'no-folder' },
    { kind: 'unsupported-platform' },
    { kind: 'failed', error: 'boom' }
  ])('%p keeps the no-op warning and sends no done', async (outcome) => {
    stopSpy.mockResolvedValue(outcome)
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.stop()).resolves.toBeUndefined()
    expect(doneSpy).not.toHaveBeenCalled()
    expect(warnedNoOp()).toBe(true)
  })

  it('live monitor branch never calls it', async () => {
    getBottleProcessMonitorPhase.mockReturnValue('starting')
    await new SteamGame(APP_ID, steamTestDeps).stop()
    expect(stopSpy).not.toHaveBeenCalled()
  })
})

describe('SteamGame.stop() — delegated install cancel (261105-vfq)', () => {
  const warnedNoOp = () => {
    const { logWarning } = jest.requireMock('backend/logger')
    return (logWarning as jest.Mock).mock.calls.some((c) =>
      String(c[0]).includes('Steam owns process lifecycle')
    )
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('cancels the delegated poll and skips the no-op path', async () => {
    getBottleProcessMonitorPhase.mockReturnValue(null)
    const spy = jest
      .spyOn(installPollingModule, 'cancelDelegatedInstall')
      .mockReturnValue(true)
    await new SteamGame(APP_ID, steamTestDeps).stop()
    expect(spy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(warnedNoOp()).toBe(false)
  })

  it('keeps the no-op warning when there is no delegated poll', async () => {
    getBottleProcessMonitorPhase.mockReturnValue(null)
    const spy = jest
      .spyOn(installPollingModule, 'cancelDelegatedInstall')
      .mockReturnValue(false)
    await new SteamGame(APP_ID, steamTestDeps).stop()
    expect(spy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(warnedNoOp()).toBe(true)
  })
})

// ── SteamGame.stop() — D-02 real abort for an in-flight native depot download ─
//
// stop() converts from an unconditional no-op into: if a depot download
// AbortController is registered for this.appId (registered at native install
// start), call callAbortController(this.appId) so depot.ts's loop aborts and
// finalizeToSteam (Plan 06) writes the 1026 handoff; otherwise stays a safe
// no-op (native steam:// path / bottle path — Steam owns process lifecycle).

describe('SteamGame.stop() — D-02 native depot-download abort', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue({
      targetSteamappsDir: '/mock/steam/steamapps',
      installdir: APP_ID
    })
    createAbortController.mockReturnValue({
      signal: 'mock-signal'
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
  })

  it('when a native depot download is in flight for this.appId, stop() calls callAbortController(this.appId)', async () => {
    // Slow-resolving downloadSteamDepots — install() is in flight when stop() runs.
    let resolveDownload!: (value: { status: 'done' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const installPromise = game.install({} as any)
    // Let install() run all the way through ensurePlatformsCaptured() ->
    // ensureSteamClientReady -> resolveSteamInstallTarget -> createAbortController
    // (each a separate microtask hop) up to the pending downloadSteamDepots
    // call before stop() is called. flushAsync's setImmediate macrotask is
    // guaranteed to run after every queued microtask, unlike a fixed count of
    // Promise.resolve() hops.
    await flushAsync()

    await game.stop()
    expect(callAbortController).toHaveBeenCalledWith(APP_ID)
    expect(stopPerGameBridgeBottle).not.toHaveBeenCalled()
    expect(stopBridgeHelper).not.toHaveBeenCalledWith(APP_ID)
    expect(stopBottleProcessMonitor).not.toHaveBeenCalled()

    resolveDownload({ status: 'done' })
    await installPromise
  })

  it('when no depot download is in flight (native steam:// path / bottle path), stop() remains a safe no-op and does not throw', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.stop()).resolves.toBeUndefined()
    expect(callAbortController).not.toHaveBeenCalled()
  })

  it('D-UAT-05: stop() called WHILE ensureSteamClientReady is still pending finds nativeInstallsInFlight already registered — no historic "Steam owns process lifecycle; no-op" branch', async () => {
    const { logWarning } = jest.requireMock('backend/logger')
    let resolveReady!: (value: { ready: true }) => void
    ;(ensureSteamClientReady as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveReady = resolve
      })
    )
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const installPromise = game.install({} as any)
    // Let install() run through ensurePlatformsCaptured() into the
    // (still-pending) ensureSteamClientReady await — registration (D-UAT-05
    // fix) happens synchronously before this await starts.
    await flushAsync()

    await game.stop()
    expect(callAbortController).toHaveBeenCalledWith(APP_ID)
    expect(logWarning).not.toHaveBeenCalledWith(
      expect.stringContaining('no-op'),
      expect.anything()
    )

    resolveReady({ ready: true })
    await installPromise
  })
})

// ── GAME-02: SteamGame.install() ──────────────────────────────────────────────

describe('SteamGame.install() — GAME-02', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    // Spy on startInstallPolling so install() can call it without running the real poller
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('GAME-02: install() calls shell.openExternal with steam://install/{appId} for numeric appId', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it("GAME-02/focus: native install HANDS FOCUS to Steam — openExternal is called WITHOUT { activate: false }, so the steam:// protocol handler foregrounds the native Steam client (OS-delegated parity with the CrossOver path's raiseInstallerWindow() System Events raise); contrast launch() which passes { activate: false } to avoid stealing foreground", async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    // Native install intentionally lets the OS bring Steam to the front — the
    // SAME OUTCOME as the bottled/CrossOver install (raiseInstallerWindow), via
    // a different MECHANISM (OS protocol activation vs a GameLib-driven raise).
    // The focus handover is "hands off": activation must NOT be suppressed.
    const [url, opts] = shellOpenExternal.mock.calls[0]
    expect(url).toBe(`steam://install/${APP_ID}`)
    expect(opts).toBeUndefined()
    // Explicit contrast with launch()'s { activate: false } foreground-suppression.
    expect(shellOpenExternal).not.toHaveBeenCalledWith(
      `steam://install/${APP_ID}`,
      { activate: false }
    )
  })

  it('GAME-02: install() resolves { status: "done" } for a valid numeric appId', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done' })
  })

  it('install() does NOT show a hand-off toast (toast feature removed)', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('T-03-01: install() does NOT call shell.openExternal when appId is non-numeric', async () => {
    const badGame = new SteamGame('abc', steamTestDeps)
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ status: 'error' }))
  })

  it('GAME-02: install() does NOT call sendFrontendMessage directly (no optimistic flip — D-02)', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    // Badge flipped by ACF poller (D-07) or focus re-read (D-01), never by click (D-02)
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('GAME-02/D-07: install() calls startInstallPolling with this.appId after successful openExternal', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      delegatedToSteamClient: true
    })
  })

  it('D-07: install() does NOT call startInstallPolling when appId is non-numeric (T-03-01 guard)', async () => {
    const badGame = new SteamGame('abc', steamTestDeps)
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))
    await badGame.install({} as any)
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })

  // D-UAT-19 (quick 261102-dkw): with no Steam client to handle steam://,
  // Windows showed a bare "no app handles this link" error and the poller
  // kept the game "installing" ~30 min. The hand-off is now gated on the
  // client, like the native path.
  it.each(['needs-install', 'needs-launch'] as const)(
    'D-UAT-19: a %s client defers to guided setup — no openExternal, no poller, no finished entry',
    async (status) => {
      ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
        status,
        ready: false
      })
      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(ensureSteamClientReady).toHaveBeenCalledWith(
        expect.anything(),
        APP_ID
      )
      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(shellOpenExternal).not.toHaveBeenCalled()
      expect(startInstallPollingSpy).not.toHaveBeenCalled()
    }
  )

  it('D-UAT-19: a client check that reports an error is an install error, not a hand-off', async () => {
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
      status: 'needs-install',
      ready: false,
      error: 'boom'
    })
    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'error', error: 'boom' })
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })

  it('D-UAT-19: a ready client still hands off — ensureSteamClientReady runs before openExternal', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    const readyOrder = at(
      (ensureSteamClientReady as jest.Mock).mock.invocationCallOrder,
      0
    )
    const openOrder = at(shellOpenExternal.mock.invocationCallOrder, 0)
    expect(readyOrder).toBeLessThan(openOrder)
  })
})

// ── steam-startup-resume-crash (2026-07-18) / D-04 softened ────────────────
//
// SteamLibraryManager.init() no longer auto-drives a leftover interrupted
// (StateFlags 1026) install on boot — it only flags the library entry
// steamResumePending:true. The user's own Install click is the resume
// trigger: install() must call resumeInterruptedSteamInstall() FIRST when
// that flag is set (and must never do so, and never let a failure there
// block the real install, otherwise).

describe('SteamGame.install() — steam-startup-resume-crash resume-on-click (D-04 softened)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  let resumeSpy: jest.SpyInstance

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    resumeSpy = jest
      .spyOn(resumeModule, 'resumeInterruptedSteamInstall')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    resumeSpy.mockRestore()
  })

  it('calls resumeInterruptedSteamInstall(appId) BEFORE proceeding to the normal install flow when steamResumePending is true', async () => {
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        install: { steamResumePending: true } as any
      })
    )
    const game = new SteamGame(APP_ID, steamTestDeps)

    await game.install({} as any)

    expect(resumeSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    // The normal install flow still runs afterward (D-04 softened resume is
    // additive, not a replacement for the real install/completion path).
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('does NOT call resumeInterruptedSteamInstall when steamResumePending is not set (no regression for a normal fresh install)', async () => {
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    const game = new SteamGame(APP_ID, steamTestDeps)

    await game.install({} as any)

    expect(resumeSpy).not.toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('a resumeInterruptedSteamInstall() rejection never blocks the subsequent real install attempt (hardening)', async () => {
    resumeSpy.mockRejectedValue(new Error('resume finalize exploded'))
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        install: { steamResumePending: true } as any
      })
    )
    const game = new SteamGame(APP_ID, steamTestDeps)

    const result = await game.install({} as any)

    expect(resumeSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(result).toEqual({ status: 'done' })
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })
})

// ── SNI-07 (D-13): SteamGame.install() native depot-download opt-in branch ──
//
// isSteamNativeInstallEnabled() gates whether install() routes a (non-bottle-
// eligible) install through depot.ts's downloadSteamDepots orchestrator
// instead of the legacy steam://install handoff. OFF preserves today's
// behavior byte-for-byte (D-13 safety valve); ON wires the Plan 09/10 seams
// (resolveSteamInstallTarget/ensureSteamClientReady) and maps
// downloadSteamDepots's { status, error? } outcome onto InstallResult using
// the SAME conventions gog/legendary's own install() functions use, so a
// classified error renders through the EXISTING generic queue error+Retry
// surface with zero downloadqueue.ts changes (D-06/D-07 reuse).

describe('SteamGame.install() — SNI-07 native depot-download opt-in (D-13)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  const TARGET = {
    targetSteamappsDir: '/mock/steam/steamapps',
    installdir: APP_ID
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    // Non-macOS host (envMock defaults isMac:false) — never bottle-eligible,
    // so every test here exercises the native/legacy branch, not Plan 11's
    // bottle branch.
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(TARGET)
    createAbortController.mockReturnValue({
      signal: 'mock-signal'
    })
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('opt-in OFF: install() takes the legacy steam://install path and does NOT call downloadSteamDepots', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    // D-UAT-19: OFF still checks the client (a hand-off with no client to
    // handle steam:// is the bug), but never resolves a depot target.
    expect(ensureSteamClientReady).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID
    )
    expect(resolveSteamInstallTarget).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done' })
  })

  it('opt-in ON, non-bottle: install() calls ensureSteamClientReady -> resolveSteamInstallTarget -> downloadSteamDepots in order, with the resolved target + host os + an AbortSignal, then startInstallPolling', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()

    const readyOrder = at(
      (ensureSteamClientReady as jest.Mock).mock.invocationCallOrder,
      0
    )
    const targetOrder = at(
      (resolveSteamInstallTarget as jest.Mock).mock.invocationCallOrder,
      0
    )
    const downloadOrder = at(
      (downloadSteamDepots as jest.Mock).mock.invocationCallOrder,
      0
    )
    expect(readyOrder).toBeLessThan(targetOrder)
    expect(targetOrder).toBeLessThan(downloadOrder)

    expect(ensureSteamClientReady).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID
    )
    expect(resolveSteamInstallTarget).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      {}
    )
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      installRuntime: steamTestDeps.steamInstallRuntime,
      steamUser: steamTestDeps.steamUser,
      config: steamTestDeps.config,
      targetSteamappsDir: TARGET.targetSteamappsDir,
      installdir: TARGET.installdir,
      os: expect.any(String),
      signal: 'mock-signal'
    })
    // debug/steam-1026-download-restart: this poll starts AFTER GameLib's own
    // depot.ts download finished — isNativeHandoff:true so StateFlags 1026 is
    // correctly read as "waiting for Steam restart", not an active download.
    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      isNativeHandoff: true,
      skippedDepots: []
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('Phase 54: native install acquires one user-install lease before resolveSteamInstallTarget and the crash breadcrumb, and releases it once after the download settles', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
    expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith({
      reason: 'user-install',
      guidedAction: 'install',
      appName: APP_ID
    })
    const acquireOrder = at(
      jest.mocked(steamUser.acquireAuthenticated).mock.invocationCallOrder,
      0
    )
    expect(acquireOrder).toBeLessThan(
      at((resolveSteamInstallTarget as jest.Mock).mock.invocationCallOrder, 0)
    )
    expect(leaseRelease).toHaveBeenCalledTimes(1)
    expect(at(leaseRelease.mock.invocationCallOrder, 0)).toBeGreaterThan(
      at((downloadSteamDepots as jest.Mock).mock.invocationCallOrder, 0)
    )
  })

  it('54-REVIEW CR-01: the native install lease carries the install path and bottle choice for a guided retry', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    await new SteamGame(APP_ID, steamTestDeps).install({
      path: '/Volumes/Games/SteamLibrary',
      steamForceWindowsViaBottle: false
    } as any)

    expect(steamUser.acquireAuthenticated).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'user-install',
        installPath: '/Volumes/Games/SteamLibrary',
        forceWindowsViaBottle: false
      })
    )
  })

  it('Phase 54: the native lease is released on a depot error and on a resolve-target error', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'error',
      error: 'boom'
    })
    await new SteamGame(APP_ID, steamTestDeps).install({} as any)
    expect(leaseRelease).toHaveBeenCalledTimes(1)

    leaseRelease.mockClear()
    ;(resolveSteamInstallTarget as jest.Mock).mockRejectedValue(
      new Error('pics down')
    )
    await new SteamGame(APP_ID, steamTestDeps).install({} as any)
    expect(leaseRelease).toHaveBeenCalledTimes(1)
  })

  it('Phase 54: the native lease is released when the download is cancelled', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'cancelled'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result).toEqual({ status: 'abort' })
    expect(leaseRelease).toHaveBeenCalledTimes(1)
  })

  it('Phase 54: a go-offline-required refusal defers to the guided step -- no target resolution, no breadcrumb, no download', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
      ok: false,
      reason: 'go-offline-required'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    expect(resolveSteamInstallTarget).not.toHaveBeenCalled()
    expect(library.get(APP_ID)?.install?.steamResumePending).toBeFalsy()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
  })

  it('Phase 54: a token-absent refusal returns the classified not-signed-in error', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
      ok: false,
      reason: 'token-absent'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result.status).toBe('error')
    expect((result as { error?: string }).error).toEqual(
      expect.stringMatching(/\S/)
    )
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(library.get(APP_ID)?.install?.steamResumePending).toBeFalsy()
  })

  it.each(['needs-install', 'needs-launch'] as const)(
    'quick 261027-tot: ensureSteamClientReady %s (no error) defers the install -- done+deferredToSetup, no downloadSteamDepots, no polling',
    async (status) => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
        status,
        ready: false
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(downloadSteamDepots).not.toHaveBeenCalled()
      expect(startInstallPollingSpy).not.toHaveBeenCalled()
    }
  )

  it('quick 261027-tot: a not-ready result that carries an error (non-numeric appId, T-21-05) is still an error, not a deferral', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
      status: 'needs-install',
      ready: false,
      error: 'Invalid appId: "../x"'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({
      status: 'error',
      error: 'Invalid appId: "../x"'
    })
    expect(downloadSteamDepots).not.toHaveBeenCalled()
  })

  it("23.2-04: a downloadSteamDepots outcome carrying skippedDepots threads through to startInstallPolling's options object", async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'done',
      skippedDepots: ['1771304']
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      isNativeHandoff: true,
      skippedDepots: ['1771304']
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('23.2-04: a downloadSteamDepots outcome with no skippedDepots field threads through as [], never undefined', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      isNativeHandoff: true,
      skippedDepots: []
    })
    const call = (startInstallPollingSpy as jest.Mock).mock.calls.find(
      ([, appId]) => appId === APP_ID
    )
    expect(call![2].skippedDepots).not.toBeUndefined()
  })

  it('D-06/D-07 error surface reuse: a { status: "error", error } depot outcome maps to an InstallResult.error carrying the EXACT classified message — no steam-specific error/Retry UI, downloadqueue.ts uninvolved', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    const classifiedMessage = 'Steam servers dropped the connection'
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'error',
      error: classifiedMessage
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'error', error: classifiedMessage })
    expect(result.status).not.toBe('abort')
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })

  it('cancel outcome: a { status: "cancelled" } depot outcome maps to the abort-shaped InstallResult other runners use for a user cancel — not an error', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'cancelled'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'abort' })
    expect(result.error).toBeUndefined()
  })

  it('non-numeric appId is still rejected before any native handoff (T-03-01 guard) even with the opt-in ON', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    // depot.ts's own guard classifies a rejected non-numeric appId as an
    // error outcome — downloadSteamDepots never throws (Plan 06 contract).
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
      status: 'error',
      error: 'Invalid Steam appId'
    })
    const badGame = new SteamGame('abc', steamTestDeps)
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ status: 'error' }))
  })

  it('createAbortController is registered under this.appId before downloadSteamDepots runs, and released after it resolves', async () => {
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })
    // WR-02: the run removes only its own registered controller
    const registered = new AbortController()
    createAbortController.mockReturnValue(registered)
    getAbortSignal.mockReturnValue(registered.signal)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(createAbortController).toHaveBeenCalledWith(APP_ID)
    expect(deleteAbortController).toHaveBeenCalledWith(APP_ID)
  })

  // ── G-30-02 (30-07 gap closure) ──────────────────────────────────────────
  // A never-settling resolveSteamInstallTarget (the pre-download resolution
  // PHASE, belt-and-suspenders bound on top of Task 1's per-CM-call bounds)
  // must resolve runNativeDepotDownload to {status:'error'} within the
  // bounded window instead of hanging install() forever.
  describe('G-30-02: pre-download phase (resolveSteamInstallTarget) is bounded', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('a never-settling resolveSteamInstallTarget makes install() resolve to {status:"error"} within the bounded window, not hang', async () => {
      jest.useFakeTimers()
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(resolveSteamInstallTarget as jest.Mock).mockReturnValue(
        new Promise(() => {
          // Never settles — simulates a stale-but-present CM socket parking
          // this PICS-backed resolution forever.
        })
      )

      const game = new SteamGame(APP_ID, steamTestDeps)
      const resultPromise = game.install({} as any)
      const assertion = expect(resultPromise).resolves.toEqual({
        status: 'error',
        error: expect.stringContaining('timed out')
      })

      // WR-01: the outer belt-and-suspenders bound is STEAM_PICS_TIMEOUT_MS * 2
      // (strictly larger than any inner per-CM-call bound, so an inner graceful
      // fallback always wins its own race). Advance past that outer bound so
      // the never-settling resolution trips the outer timer.
      await jest.advanceTimersByTimeAsync(STEAM_PICS_TIMEOUT_MS * 2 + 5000)
      await assertion

      expect(downloadSteamDepots).not.toHaveBeenCalled()
    })

    it('a fast-resolving resolveSteamInstallTarget is unaffected (happy path unchanged, protects the Electron build)', async () => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result).toEqual({ status: 'done' })
    })

    it('T-37-01/T-37-03/C-01: a resolveSteamInstallTarget rejecting with UnsafeInstalldirError returns the CLASSIFIED message (never the raw candidate, never mislabeled "timed out"), while the raw candidate still reaches the log', async () => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(resolveSteamInstallTarget as jest.Mock).mockRejectedValue(
        new UnsafeInstalldirError(
          'SteamGame: rejected unsafe PICS installdir "../../etc/passwd" for appId 12345 (traversal — escapes the install root)'
        )
      )

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      // 37-REVIEW C-01: this assertion previously REQUIRED the raw candidate
      // ("../../etc/passwd") in `result.error`, which is exactly the leak --
      // `InstallResult.error` is rendered verbatim in the install-failure
      // dialog, so an attacker-controlled PICS installdir reached the user's
      // screen. games.ts now classifies the abort itself (the abort is raised
      // by resolveSteamInstallTarget, BEFORE the download starts, so it never
      // reaches depot.ts's classifyDepotError call sites at :3016/:3067).
      const { logWarning } = jest.requireMock('backend/logger')
      expect(result.status).toBe('error')
      // classifyDepotError's /traversal/i branch. Under jest, i18next is not
      // initialised with the catalog, so `t()` returns the KEY; at runtime it
      // renders "The download contained an unsafe file path and was stopped."
      // Asserting the key is the stable contract either way.
      expect(result.error).toBe('steam.download.error.unsafePath')
      // The untrusted candidate must NOT survive into the dialog string.
      expect(result.error).not.toEqual(
        expect.stringContaining('../../etc/passwd')
      )
      expect(result.error).not.toEqual(expect.stringContaining('timed out'))
      // ...but it MUST still reach the log, or the diagnostic is lost.
      expect(logWarning).toHaveBeenCalledWith(
        expect.stringContaining('../../etc/passwd'),
        expect.anything()
      )
      expect(downloadSteamDepots).not.toHaveBeenCalled()
    })
  })
})

// ── 260821-rb5: case-C residue breadcrumb ────────────────────────────────────
//
// Closes case C of the aborted-depot-residue todo
// (.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md): a
// hard kill (kill -9, crash, power loss) mid native-depot-download means no
// JS ever runs at teardown, so no appmanifest_*.acf is written and
// scanDownloadingAppIds (library.ts) can never see the residue. This block
// proves an install-start breadcrumb persisted to steamLibraryStore makes
// the residue SURFACED on the next init(), not merely that a helper ran.

describe('260821-rb5 — case-C residue breadcrumb', () => {
  let startInstallPollingSpy: jest.SpyInstance

  const TARGET = {
    targetSteamappsDir: '/mock/steam/steamapps',
    installdir: APP_ID
  }

  // Reads the PERSISTED store (never the in-memory Map) — the mock is
  // set(key, value); confirm arity against the mock's own recorded calls.
  const persisted = () =>
    jest
      .mocked(steamLibraryStore.set)
      .mock.calls.filter((c) => c[0] === 'games')
      .at(-1)?.[1] as GameInfo[]

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(TARGET)
    createAbortController.mockReturnValue({
      signal: 'mock-signal'
    })
    // resetMocks: true strips jest.fn() implementations (not just call
    // history) before EVERY test, including the mock factory's default
    // above — this describe block is the first in the file to exercise a
    // real init() call, whose migrateStaleArtUrls() iterates
    // steamMetadataStore.entries() unconditionally.
    ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([])
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('a hard-killed native install (finalize never called) persists a breadcrumb, and a fresh init() surfaces it as resumable with an EMPTY ACF scan', async () => {
    // Simulates "no JS ran at teardown": downloadSteamDepots never settles,
    // so no cancelled/error/done branch runs and the finally block never
    // runs either. The resolver is held and fired at the END of this test
    // (after every assertion) so games.ts's own nativeInstallsInFlight
    // registry — module-private, no test reset hook — releases APP_ID
    // before the next test runs; otherwise a later test reusing APP_ID
    // would join this permanently-unsettled promise via the T-23-12
    // single-flight guard instead of exercising its own scenario.
    let resolveDownload!: (value: { status: 'done' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const installPromise = game.install({} as any)
    // Flush the pre-download microtask hops until downloadSteamDepots has
    // been called (asserted below as the load-bearing precondition).
    await flushAsync()

    // Deviation (Rule 1 — test bug found writing this RED-proof, not a
    // production fix): the settle-and-drain cleanup below is wrapped in
    // try/finally so it always runs, even when an assertion in this test
    // fails (expected during RED). Without this, a failed assertion skips
    // straight to the `it` block's catch, leaving downloadSteamDepots's
    // promise — and therefore games.ts's module-private
    // nativeInstallsInFlight entry for APP_ID — permanently unsettled for
    // the rest of the file, which hung a LATER test (single-flight guard
    // joining a promise that can never resolve) instead of failing it.
    try {
      expect(downloadSteamDepots).toHaveBeenCalled()

      const afterStart = persisted()
      const startedEntry = afterStart?.find((g) => g.app_name === APP_ID)
      expect(startedEntry?.install?.steamResumePending).toBe(true)
      expect(startedEntry?.install?.steamResumeTargetSteamappsDir).toBe(
        TARGET.targetSteamappsDir
      )
      expect(startedEntry?.install?.steamResumeInstalldir).toBe(
        TARGET.installdir
      )

      // ── Simulate the process restart ────────────────────────────────────
      library.clear()
      jest.mocked(steamLibraryStore.get).mockReturnValue(afterStart)
      jest.mocked(getSteamLibraries).mockResolvedValue([])
      ;(existsSync as jest.Mock).mockReturnValue(false)
      jest.mocked(steamUser.isLoggedIn).mockReturnValue(false)
      // A restart wipes the in-memory nativeInstallsInFlight registry — the
      // real (unmocked) games.ts map still shows APP_ID in-flight within
      // THIS test process (its promise hasn't settled yet), so this spy
      // stands in for the memory reset a real kill -9 + relaunch would
      // cause.
      const inFlightSpy = jest
        .spyOn(
          steamTestDeps.steamSession.gameSession,
          'isNativeInstallInFlight'
        )
        .mockReturnValue(false)

      // Load-bearing precondition: an empty ACF scan is what makes this a
      // breadcrumb-only surfacing, not an ACF-derived one.
      const scanResult = await acfState.scanDownloadingAppIds(libDeps)
      expect(scanResult).toEqual([])

      await new SteamLibraryManager(steamTestDeps).init()

      expect(library.get(APP_ID)?.install?.steamResumePending).toBe(true)
      expect(notify).toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: APP_ID,
          install: expect.objectContaining({ steamResumePending: true })
        })
      )

      inFlightSpy.mockRestore()
    } finally {
      resolveDownload({ status: 'done' })
      await installPromise.catch(() => undefined)
    }
  })

  it('a breadcrumb whose appId has an on-disk StateFlags=4 ACF is CLEARED at startup, not surfaced', async () => {
    const breadcrumbEntry: GameInfo = {
      ...makeEntry({ title: 'Dota 2' }),
      install: {
        steamResumePending: true,
        steamResumeTargetSteamappsDir: TARGET.targetSteamappsDir,
        steamResumeInstalldir: TARGET.installdir
      }
    }
    library.clear()
    jest.mocked(steamLibraryStore.get).mockReturnValue([breadcrumbEntry])
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(
      jest.requireMock('graceful-fs').readFileSync as jest.Mock
    ).mockReturnValue('installed-content')
    ;(parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: APP_ID,
        StateFlags: '4',
        installdir: TARGET.installdir
      }
    })
    jest.mocked(steamUser.isLoggedIn).mockReturnValue(false)
    const inFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)

    await new SteamLibraryManager(steamTestDeps).init()

    expect(notify).not.toHaveBeenCalled()
    expect(library.get(APP_ID)?.install?.steamResumePending).toBeFalsy()
    expect(
      library.get(APP_ID)?.install?.steamResumeTargetSteamappsDir
    ).toBeUndefined()
    expect(library.get(APP_ID)?.install?.steamResumeInstalldir).toBeUndefined()

    // The clear must be durable — present in the last persisted array too,
    // not merely the in-memory Map.
    const finalPersisted = persisted()
    const finalEntry = finalPersisted?.find((g) => g.app_name === APP_ID)
    expect(finalEntry?.install?.steamResumePending).toBeFalsy()
    expect(finalEntry?.install?.steamResumeTargetSteamappsDir).toBeUndefined()
    expect(finalEntry?.install?.steamResumeInstalldir).toBeUndefined()

    inFlightSpy.mockRestore()
  })

  it('a successful native depot run clears the breadcrumb before the poller starts', async () => {
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    const finalPersisted = persisted()
    const finalEntry = finalPersisted?.find((g) => g.app_name === APP_ID)
    expect(finalEntry?.install?.steamResumeInstalldir).toBeUndefined()
    expect(finalEntry?.install?.steamResumeTargetSteamappsDir).toBeUndefined()
    expect(finalEntry?.install?.steamResumePending).toBeFalsy()

    // Ordering: the clearing persist ('games'-keyed steamLibraryStore.set
    // call whose entry has no breadcrumb fields left) must land at or before
    // startInstallPolling. Derived purely from steamLibraryStore.set's own
    // mock call/order data — no spy on the not-yet-existing
    // clearSteamResumeBreadcrumb export required, so this stays RED-safe
    // (fails on content, not on missing-export setup crash) and GREEN-safe.
    const gamesSetCalls = jest
      .mocked(steamLibraryStore.set)
      .mock.calls.map((call, index) => ({ call, index }))
      .filter(({ call }) => call[0] === 'games')
    const clearingCallIndex = gamesSetCalls.find(({ call }) => {
      const arr = call[1]
      const entry = arr.find((g) => g.app_name === APP_ID)
      return (
        entry !== undefined &&
        !entry.install?.steamResumePending &&
        !entry.install?.steamResumeTargetSteamappsDir &&
        !entry.install?.steamResumeInstalldir
      )
    })?.index
    expect(clearingCallIndex).toBeDefined()
    if (clearingCallIndex === undefined) {
      throw new Error('unreachable: clearingCallIndex asserted defined above')
    }
    const clearOrder = at(
      jest.mocked(steamLibraryStore.set).mock.invocationCallOrder,
      clearingCallIndex
    )
    const pollOrder = at(startInstallPollingSpy.mock.invocationCallOrder, 0)
    expect(clearOrder).toBeLessThan(pollOrder)
  })

  it('an appId with no breadcrumb and no incomplete ACF is NOT surfaced by init()', async () => {
    library.clear()
    jest
      .mocked(steamLibraryStore.get)
      .mockReturnValue([makeEntry({ title: 'Dota 2' })])
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    ;(existsSync as jest.Mock).mockReturnValue(false)
    jest.mocked(steamUser.isLoggedIn).mockReturnValue(false)
    const inFlightSpy = jest
      .spyOn(steamTestDeps.steamSession.gameSession, 'isNativeInstallInFlight')
      .mockReturnValue(false)

    const scanResult = await acfState.scanDownloadingAppIds(libDeps)
    expect(scanResult).toEqual([])

    await new SteamLibraryManager(steamTestDeps).init()

    expect(notify).not.toHaveBeenCalled()
    expect(library.get(APP_ID)?.install?.steamResumePending).toBeFalsy()

    inFlightSpy.mockRestore()
  })
})

// ── Phase 23 (23-05, T-23-12/T-23-13): single-flight guard + fail-safe ──────
//
// installDepotDownload adds this.appId to nativeInstallsInFlight but (prior to
// this plan) never checked it on entry, so install() could be entered twice
// for one appId and spawn two concurrent downloadSteamDepots runs (the Gate 1
// progress-percent flip-flop root cause). These tests prove: at most one
// downloadSteamDepots per appId, a joining caller resolves to the SAME
// result, per-appId independence, and reliable registry release on
// success/error/cancel/throw (T-23-13 — never permanently blocks a later
// re-install).

describe('SteamGame.install() — single-flight guard (T-23-12/T-23-13)', () => {
  const OTHER_APP_ID = '990080'

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    library.set(
      OTHER_APP_ID,
      makeEntry({ app_name: OTHER_APP_ID, title: 'Hogwarts Legacy' })
    )
    jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue({
      targetSteamappsDir: '/mock/steam/steamapps',
      installdir: APP_ID
    })
    createAbortController.mockReturnValue({
      signal: { aborted: false }
    })
  })

  it('two overlapping installDepotDownload calls for the SAME appId invoke downloadSteamDepots exactly ONCE, and the joining caller resolves to the SAME result', async () => {
    let resolveDownload!: (value: { status: 'done' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const first = game.install({} as any)
    await flushAsync()
    const second = game.install({} as any)

    resolveDownload({ status: 'done' })
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)
    expect(secondResult).toEqual(firstResult)
  })

  it('registry cleared on success — a subsequent FRESH installDepotDownload for the same appId calls downloadSteamDepots again (not permanently blocked)', async () => {
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)
    await game.install({} as any)

    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('registry cleared on an { status: "error" } outcome — a subsequent fresh install calls downloadSteamDepots again', async () => {
    ;(downloadSteamDepots as jest.Mock)
      .mockResolvedValueOnce({ status: 'error', error: 'boom' })
      .mockResolvedValueOnce({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const first = await game.install({} as any)
    const second = await game.install({} as any)

    expect(first).toEqual({ status: 'error', error: 'boom' })
    expect(second).toEqual({ status: 'done' })
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('registry cleared on a { status: "cancelled" } outcome — a subsequent fresh install calls downloadSteamDepots again', async () => {
    ;(downloadSteamDepots as jest.Mock)
      .mockResolvedValueOnce({ status: 'cancelled' })
      .mockResolvedValueOnce({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const first = await game.install({} as any)
    const second = await game.install({} as any)

    expect(first).toEqual({ status: 'abort' })
    expect(second).toEqual({ status: 'done' })
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('registry cleared when downloadSteamDepots rejects/throws — a subsequent fresh install calls downloadSteamDepots again', async () => {
    ;(downloadSteamDepots as jest.Mock)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.install({} as any)).rejects.toThrow('network error')
    const second = await game.install({} as any)

    expect(second).toEqual({ status: 'done' })
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
  })

  it('two overlapping installs for DIFFERENT appIds both proceed — guard is per-appId, not global', async () => {
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const other = new SteamGame(OTHER_APP_ID, steamTestDeps)

    const results = await Promise.all([
      game.install({} as any),
      other.install({} as any)
    ])

    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
    expect(results).toEqual([{ status: 'done' }, { status: 'done' }])
  })

  // ── T-23-15: pause/resume abort-before-restart (no stacking) ──────────────
  it('pause -> resume: a resume issued WHILE the aborted prior run is still tearing down waits for its settlement (finally cleanup) before starting a fresh downloadSteamDepots — the two never run concurrently', async () => {
    let resolveFirstDownload!: (value: { status: 'cancelled' }) => void
    ;(downloadSteamDepots as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirstDownload = resolve
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const firstInstall = game.install({} as any)
    // Let the first run reach the pending downloadSteamDepots call.
    await flushAsync()
    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)

    // Pause: stop() marks the tracked entry aborted and calls
    // callAbortController — the first run is now TEARING DOWN, not yet
    // settled (its downloadSteamDepots promise is still pending).
    await game.stop()
    expect(callAbortController).toHaveBeenCalledWith(APP_ID)

    // Resume issued WHILE the aborted first run is still tearing down.
    ;(downloadSteamDepots as jest.Mock).mockResolvedValueOnce({
      status: 'done'
    })
    const resumeInstall = game.install({} as any)
    await flushAsync()

    // The resume must NOT have started a second downloadSteamDepots yet —
    // it is awaiting the prior (aborted) run's settlement first (no
    // stacking).
    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)

    // Let the first (aborted) run settle -> its finally cleanup runs.
    resolveFirstDownload({ status: 'cancelled' })
    await firstInstall
    await flushAsync()

    // The resume's fresh run can now proceed to a NEW downloadSteamDepots
    // call.
    const resumeResult = await resumeInstall
    expect(downloadSteamDepots).toHaveBeenCalledTimes(2)
    expect(resumeResult).toEqual({ status: 'done' })
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.install() bottle routing ────────────────

describe('SteamGame.install() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('bottle-eligible + un-provisioned: install() does NOT call shell.openExternal and emits steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    // The install did not actually start (no ACF poller) — flag the deferral so
    // the DownloadManager clears the transient 'installing' badge instead of
    // leaving the game stuck "installing" after Confirm or "Not now".
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('bottle-eligible + half-provisioned bottle (conf exists, steam.exe missing — isBottleReady false) does NOT dispatch to bottled Steam', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    // isBottleReady() is the real readiness gate (conf + steam.exe); a
    // half-provisioned bottle (cxbottle.conf present, steam.exe missing —
    // the GAP 1 stuck-loop scenario) reports false here, exactly like an
    // un-provisioned bottle from games.ts's perspective.
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('bottle-eligible + provisioned: install() routes to installBottleNative (depot download into the bottle), NOT shell.openExternal or a bottled-Steam dispatch', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const installBottleNative = trackSpy(
      jest.spyOn(gameInstallDepot, 'installBottleNative')
    ).mockResolvedValue({ status: 'done' } as any)
    const result = await game.install({} as any)

    expect(installBottleNative).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done' })
  })

  it('quick 261030-o77: a bottle depot-install error is returned as-is (no poller started by install(), no bottled-Steam fallback)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    trackSpy(
      jest.spyOn(gameInstallDepot, 'installBottleNative')
    ).mockResolvedValue({ status: 'error', error: 'boom' } as any)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'error', error: 'boom' })
  })

  it('D-11 (BLOCKER): NOT-yet-captured macOS game — install() STILL takes the native steam://install path and does NOT emit steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      expect.anything()
    )
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — install() STILL calls shell.openExternal with steam://install/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — install() STILL calls shell.openExternal with steam://install/<appId>', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })
})

// ── Phase 21 Plan 11 (D-15/SNI-08): SteamGame.install() bottle depot-download
// opt-in. Unifies the install mechanism across native and bottle: when the
// opt-in is ON and a game is bottle-eligible + the bottle is ready, install()
// depot-downloads the WINDOWS depot (bottled Steam is a Windows Steam client)
// directly into the bottle's OWN steamapps/ via depot.ts's downloadSteamDepots
// — the SAME mechanism SNI-07's native branch uses, just with the write
// target swapped to getBottleSteamappsDir() and os hard-coded 'windows'. Never
// dispatches to the bottled Steam client for the download itself
// (dispatchToBottledSteam stays reserved for guided setup/launch/uninstall).
// quick 261030-o77: the bottle route always uses this depot download, with the
// toggle ON or OFF; not-ready still requests guided setup with zero depot
// download attempted.

describe('SteamGame.install() — SNI-08 bottle depot-download opt-in (D-15)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  let envMock: any

  const BOTTLE_STEAMAPPS_DIR = '/mock/bottle/steamapps'
  // resolveSteamInstallTarget's OWN targetSteamappsDir must be discarded on
  // the bottle path (it resolves a NATIVE macOS Steam library, irrelevant to
  // a bottle write target) — only its PICS-derived installdir is reused.
  const RESOLVED_TARGET = {
    targetSteamappsDir: '/mock/native/steamapps',
    installdir: 'Dota 2'
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReset()
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(BOTTLE_STEAMAPPS_DIR)
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLib'
    })
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(RESOLVED_TARGET)
    createAbortController.mockReturnValue({
      signal: 'mock-signal'
    })
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('opt-in ON + bottle-eligible + ready: install() depot-downloads into the bottle steamapps dir with os:"windows", then starts the bottle-scoped poller', async () => {
    isBottleReady.mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(getBottleSteamappsDir).toHaveBeenCalledWith(
      expect.anything(),
      'GameLib'
    )
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      installRuntime: steamTestDeps.steamInstallRuntime,
      steamUser: steamTestDeps.steamUser,
      config: steamTestDeps.config,
      targetSteamappsDir: BOTTLE_STEAMAPPS_DIR,
      installdir: RESOLVED_TARGET.installdir,
      os: 'windows',
      signal: 'mock-signal'
    })
    // debug/steam-1026-download-restart: this poll starts AFTER GameLib's own
    // depot.ts download finished (D-15/SNI-08 native-ON bottle path) —
    // isNativeHandoff:true so StateFlags 1026 is correctly read as "waiting
    // for Steam restart", not an active download.
    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      source: 'bottle',
      isNativeHandoff: true,
      skippedDepots: []
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('quick 261027-tot: opt-in ON + bottle-eligible + Steam client not ready defers the install (done+deferredToSetup), no depot download, no polling', async () => {
    isBottleReady.mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
      status: 'needs-launch',
      ready: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })

  it('opt-in ON + bottle-eligible + ready: install() does NOT dispatch to the bottled Steam client (no Wine dispatch for the download itself)', async () => {
    isBottleReady.mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
  })

  it('quick 261030-o77: opt-in OFF + bottle-eligible + ready: install() still depot-downloads into the bottle (the toggle does not apply to the bottle route)', async () => {
    isBottleReady.mockReturnValue(true)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      installRuntime: steamTestDeps.steamInstallRuntime,
      steamUser: steamTestDeps.steamUser,
      config: steamTestDeps.config,
      targetSteamappsDir: BOTTLE_STEAMAPPS_DIR,
      installdir: RESOLVED_TARGET.installdir,
      os: 'windows',
      signal: 'mock-signal'
    })
    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      source: 'bottle',
      isNativeHandoff: true,
      skippedDepots: []
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('quick 261030-o77: opt-in OFF + mac-native (not bottle-eligible): still takes steam://install', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      delegatedToSteamClient: true
    })
    expect(downloadSteamDepots).not.toHaveBeenCalled()
  })

  it('opt-in ON + bottle-eligible but NOT ready: install() requests guided setup and never attempts a depot download', async () => {
    isBottleReady.mockReturnValue(false)
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      {
        appName: APP_ID
      }
    )
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })
})

// ── Phase 24 Plan 08 (R4/R7, BLOCKER 1, finding #3): allowlist-based bridge
// routing — isBridgeEligible() composition (isBottleEligible() &&
// bridgeAllowlist.has(appId) && !bridgeFailedThisSession.has(appId)) and
// installBridgeGame()'s inline bridge-bottle provisioning + shim placement.
// The bridge bottle target (GameLibSteamBridge) is DISTINCT from the Phase
// 17 GameLibSteam bottle the SNI-08 describe block above exercises.

describe('SteamGame.install() — Phase 24 Plan 08 bridge routing (R4/BLOCKER-1/finding-3)', () => {
  let startInstallPollingSpy: jest.SpyInstance
  let stopInstallPollingSpy: jest.SpyInstance
  let setBridgeUserRouteSpy: jest.SpyInstance

  let envMock: any

  const BRIDGE_STEAMAPPS_DIR = '/mock/bridge/bottle/steamapps'
  const RESOLVED_TARGET = {
    targetSteamappsDir: '/mock/native/steamapps',
    installdir: 'Avernum 4'
  }
  const RESOLVED_EXE_PATH =
    '/mock/bridge/bottle/steamapps/common/Avernum 4/Avernum4.exe'

  beforeEach(() => {
    resetBridgeFailedSession()
    __resetDrmModeNoticeShownForTests()
    steamTestDeps.steamInstallRuntime.polls.clearBridgeInstallFinalized(APP_ID)
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    stopInstallPollingSpy = jest.spyOn(installStopModule, 'stopInstallPolling')
    setBridgeUserRouteSpy = jest.spyOn(
      bridgeVerdictModule,
      'setBridgeUserRoute'
    )
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
    ;(isBridgeBottleReady as jest.Mock).mockReset()
    ;(provisionBridgeBottle as jest.Mock).mockReset()
    ;(removePerGameBridgeBottle as jest.Mock).mockReset()
    // quick 261030-o77: the bottled fallback now always runs installBottleNative
    // (GameLib's own depot download into the Phase 17 bottle), which reads the
    // bottle settings.
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    // quick/261016-u1w (D-A): new installs target the PER-GAME bridge
    // bottle directly (bridgeBottleNameFor(appId)), never the shared
    // legacy name — re-keyed from 'GameLibSteamBridge' to the per-game name.
    ;(getBottleSteamappsDir as jest.Mock).mockImplementation(
      (_paths: unknown, bottleName: string) =>
        bottleName === `GameLibSteamBridge-${APP_ID}`
          ? BRIDGE_STEAMAPPS_DIR
          : '/mock/bottle/steamapps'
    )
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(RESOLVED_TARGET)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })
    createAbortController.mockReturnValue({
      signal: 'mock-signal'
    })
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`
    })
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    stopInstallPollingSpy.mockRestore()
    setBridgeUserRouteSpy.mockRestore()
    // Restore the module-mock's declared defaults — see the identical note
    // in the launch() bridge-routing describe block above.
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  it('allowlisted + bottle-eligible: install() routes to installBridgeGame (bridge bottle target + shimGenerate called), NOT the bottle depot download', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).not.toHaveBeenCalled()
    // quick/261016-u1w (D-A): isBridgeBottleReady is consulted against the
    // PER-GAME bottle name, not the shared legacy name.
    expect(isBridgeBottleReady).toHaveBeenCalledWith(
      expect.anything(),
      `GameLibSteamBridge-${APP_ID}`
    )
    expect(downloadSteamDepots).toHaveBeenCalledWith(APP_ID, {
      installRuntime: steamTestDeps.steamInstallRuntime,
      steamUser: steamTestDeps.steamUser,
      config: steamTestDeps.config,
      targetSteamappsDir: BRIDGE_STEAMAPPS_DIR,
      installdir: RESOLVED_TARGET.installdir,
      os: 'windows',
      signal: 'mock-signal'
    })
    expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    // quick/261016-u1w: placeShimForGame now receives the per-game bottle
    // name explicitly, rather than relying on shimGenerate's own default.
    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({
        bottleName: `GameLibSteamBridge-${APP_ID}`,
        gameInstallRoot: expect.stringContaining('Avernum 4')
      })
    )
    expect(result).toEqual({ status: 'done' })
  })

  it('Phase 54: a bridge install holds one lease from download through the shared-redist step (allowLogon: true) and releases it once; provisioning runs under it (59-21 G2)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    ;(provisionBridgeBottle as jest.Mock).mockImplementation(() => {
      expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
      return Promise.resolve({ status: 'done' })
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result).toEqual({ status: 'done' })
    expect(provisionBridgeBottle).toHaveBeenCalled()
    const acquires = jest.mocked(steamUser.acquireAuthenticated).mock
    expect(acquires.calls).toEqual([
      [{ reason: 'user-install', guidedAction: 'install', appName: APP_ID }],
      [{ reason: 'user-install', guidedAction: 'install', appName: APP_ID }]
    ])
    // the outer (bridge) lease is the first acquire; the inner one belongs to
    // the native depot run. Both are released.
    expect(leaseRelease).toHaveBeenCalledTimes(2)
    expect(installSteamBridgeSharedRedists).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      expect.anything(),
      undefined,
      { allowLogon: true }
    )
    const redistOrder = at(
      (installSteamBridgeSharedRedists as jest.Mock).mock.invocationCallOrder,
      0
    )
    expect(redistOrder).toBeGreaterThan(
      at((placeShimForGame as jest.Mock).mock.invocationCallOrder, 0)
    )
    expect(Math.max(...leaseRelease.mock.invocationCallOrder)).toBeGreaterThan(
      redistOrder
    )
  })

  it('56-20 Gap 3: a final done status is sent after the install-time redist step', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils')

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    const doneCalls = (sendGameStatusUpdate as jest.Mock).mock.calls
    const last = doneCalls[doneCalls.length - 1][1]
    expect(last).toEqual({ appName: APP_ID, runner: 'steam', status: 'done' })
    const doneOrder = (sendGameStatusUpdate as jest.Mock).mock
      .invocationCallOrder
    expect(doneOrder[doneOrder.length - 1]).toBeGreaterThan(
      at(
        (installSteamBridgeSharedRedists as jest.Mock).mock.invocationCallOrder,
        0
      )
    )
  })

  it('quick 261029-mbi: the only done is the final one, after the redist step', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
    sendFrontendMessage.mockClear()

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ is_installed: true })
    )
    const frontendDone = sendFrontendMessage.mock.calls.filter(
      ([channel, payload]) =>
        channel === 'gameStatusUpdate' && payload?.status === 'done'
    )
    expect(frontendDone).toHaveLength(0)
    const doneIndexes = (sendGameStatusUpdate as jest.Mock).mock.calls
      .map(([, payload], i) => (payload.status === 'done' ? i : -1))
      .filter((i) => i !== -1)
    expect(doneIndexes).toHaveLength(1)
    expect(
      at(
        (sendGameStatusUpdate as jest.Mock).mock.invocationCallOrder,
        at(doneIndexes, 0)
      )
    ).toBeGreaterThan(
      at(
        (installSteamBridgeSharedRedists as jest.Mock).mock.invocationCallOrder,
        0
      )
    )
  })

  it('quick 261031-ihs: success finalizes the marker, unset during the tail, with one toast', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
    // A leftover marker from a previous install must be cleared at start.
    steamTestDeps.steamInstallRuntime.polls.markBridgeInstallFinalized(APP_ID)
    const seen: boolean[] = []
    ;(installSteamBridgeSharedRedists as jest.Mock).mockImplementation(() => {
      seen.push(
        steamTestDeps.steamInstallRuntime.polls.isBridgeInstallFinalized(APP_ID)
      )
      return Promise.resolve()
    })
    ;(notify as jest.Mock).mockClear()

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(seen).toEqual([false])
    expect(
      steamTestDeps.steamInstallRuntime.polls.isBridgeInstallFinalized(APP_ID)
    ).toBe(true)
    expect(sendGameStatusUpdate).toHaveBeenLastCalledWith(expect.anything(), {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('56-20 Gap 3: a rejecting redist step still sends the final done status', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(installSteamBridgeSharedRedists as jest.Mock).mockRejectedValue(
      new Error('redist boom')
    )
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils')

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result).toEqual({ status: 'done' })
    expect(sendGameStatusUpdate).toHaveBeenLastCalledWith(expect.anything(), {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
  })

  it('Phase 54: a rejecting install-time shared-redist step is logged and the install still completes', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(installSteamBridgeSharedRedists as jest.Mock).mockRejectedValue(
      new Error('redist boom')
    )

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result).toEqual({ status: 'done' })
    const { logWarning } = jest.requireMock('backend/logger')
    expect(logWarning).toHaveBeenCalledWith(
      expect.stringContaining('redist boom'),
      'Steam'
    )
  })

  it('Phase 54: a go-offline refusal from the bridge download returns deferredToSetup untouched -- no shim, no redist step', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
      ok: false,
      reason: 'go-offline-required'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(installSteamBridgeSharedRedists).not.toHaveBeenCalled()
  })

  it('quick 261027-tot: bridge route + Steam client not ready defers the install -- no markBridgeFailedThisSession (bridge stays eligible), no launch-exe resolve, no shim, no setup-required', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
      status: 'needs-install',
      ready: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done', deferredToSetup: true })
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(resolveBridgeLaunchExe).not.toHaveBeenCalled()
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.anything()
    )
    // not marked bridge-failed: a second install() still routes to the bridge
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    await new SteamGame(APP_ID, steamTestDeps).install({} as any)
    expect(downloadSteamDepots).toHaveBeenCalledTimes(1)
  })

  it("quick 261023-oq7: placeShimForGame's 'placed-miss' status completes the install as a bridge install -- verdict persisted, bottle kept, breaker not armed, no setup-required, userRoute not cleared, no bottled dispatch", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    const missVerdict = {
      status: 'miss' as const,
      arch: 'x86' as const,
      missingSymbols: ['SteamUser@unknown-version'],
      interfaceVersions: {},
      stubbedInterfaces: [],
      shimExportSetVersion: 'irrelevant',
      scannedAt: '2026-01-01T00:00:00.000Z'
    }
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed-miss',
      shimPaths: [`${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`],
      verdict: missVerdict
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done' })
    expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
    expect(setBridgeUserRouteSpy).not.toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      undefined
    )
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.anything()
    )
    const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) =>
        id === APP_ID &&
        value?.bridge?.scan?.status === 'miss' &&
        value.bridge.scan.missingSymbols.includes('SteamUser@unknown-version')
    )
    expect(persistCall).toBeDefined()

    // Breaker not armed: a later install() is not routed to the bottle for
    // 'failed-this-session'.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { scan: missVerdict, noticeAcknowledgedFor: 'scan-miss' }
    })
    await new SteamGame(APP_ID, steamTestDeps).install({} as any)
  })

  it("D-51-09 (Task 3): placeShimForGame's shim-not-built with arch x64 at INSTALL time (win64-no-shim) deletes the per-game bottle, clears userRoute, and fires steamBridgeSetupRequired with reason win64-no-shim and the literal steam_api64.dll missing symbol", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(removePerGameBridgeBottle as jest.Mock).mockResolvedValue({
      status: 'removed'
    })
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'shim-not-built',
      arch: 'x64'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({
      status: 'error',
      error: 'Bridge shim has not been built yet (packaging step pending)'
    })
    expect(removePerGameBridgeBottle).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID
    )
    expect(stopInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(setBridgeUserRouteSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      undefined
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: APP_ID,
        reason: 'win64-no-shim',
        missingSymbols: ['steam_api64.dll'],
        fallbackAvailable: true
      }
    )
    // win64-no-shim carries no verdict (unlike 'placed-miss') -- nothing scan-shaped
    // should be persisted for it.
    const scanPersistCall = (
      steamMetadataStore.set as jest.Mock
    ).mock.calls.find(([id, value]) => id === APP_ID && value?.bridge?.scan)
    expect(scanPersistCall).toBeUndefined()
    expect(library.get(APP_ID)?.is_installed).not.toBe(true)
    // 51-REVIEW WR-07: the x64 arch IS persisted, so the next session's
    // install() routes win64-no-shim instead of re-downloading.
    const archPersistCall = (
      steamMetadataStore.set as jest.Mock
    ).mock.calls.find(
      ([id, value]) => id === APP_ID && value?.bridge?.steamApi === 'x64'
    )
    expect(archPersistCall).toBeDefined()
  })

  it("D-51-09 (Task 3): placeShimForGame's 'placed' status at install time persists the fresh verdict via writeBridgeScanVerdict before markBridgeGameInstalled flips is_installed", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`,
      verdict: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: { SteamUtils: 'SteamUtils005' },
        stubbedInterfaces: [],
        shimExportSetVersion: 'v2',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done' })
    const persistCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) =>
        id === APP_ID && value?.bridge?.scan?.shimExportSetVersion === 'v2'
    )
    expect(persistCall).toBeDefined()
    expect(library.get(APP_ID)?.is_installed).toBe(true)
  })

  describe('quick 261024-br4: Steam CEG DRM detected at install', () => {
    const CEG_DRM = { kind: 'ceg', markers: ['STEAM_SPLIT_GUID'] }
    const drmPersistCall = () =>
      (steamMetadataStore.set as jest.Mock).mock.calls.find(
        ([id, value]) => id === APP_ID && value?.bridge?.drm === 'ceg'
      )

    beforeEach(() => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(removePerGameBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'removed'
      })
    })

    it('quick 261031-ihs: an error result marks the install finalized and sends done', async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed',
        shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`,
        verdict: {
          status: 'clean',
          arch: 'x86',
          missingSymbols: [],
          interfaceVersions: {},
          stubbedInterfaces: [],
          shimExportSetVersion: 'v-ceg',
          scannedAt: '2026-01-01T00:00:00.000Z'
        },
        drm: CEG_DRM
      })
      const { sendGameStatusUpdate } = jest.requireMock('backend/utils')

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result.status).toBe('error')
      expect(
        steamTestDeps.steamInstallRuntime.polls.isBridgeInstallFinalized(APP_ID)
      ).toBe(true)
      expect(sendGameStatusUpdate).toHaveBeenLastCalledWith(expect.anything(), {
        appName: APP_ID,
        runner: 'steam',
        status: 'done'
      })
    })

    it('stops the install, removes the per-game bottle, persists drm and fires setup-required drm-wrapped', async () => {
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed',
        shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`,
        verdict: {
          status: 'clean',
          arch: 'x86',
          missingSymbols: [],
          interfaceVersions: {},
          stubbedInterfaces: [],
          shimExportSetVersion: 'v-ceg',
          scannedAt: '2026-01-01T00:00:00.000Z'
        },
        drm: CEG_DRM
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result).toEqual({
        status: 'error',
        error: expect.stringContaining('Steam CEG DRM detected')
      })
      const scanPersistCall = (
        steamMetadataStore.set as jest.Mock
      ).mock.calls.find(
        ([id, value]) =>
          id === APP_ID && value?.bridge?.scan?.shimExportSetVersion === 'v-ceg'
      )
      expect(scanPersistCall).toBeDefined()
      expect(drmPersistCall()).toBeDefined()
      expect(stopInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
      expect(removePerGameBridgeBottle).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID
      )
      expect(setBridgeUserRouteSpy).not.toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        undefined
      )
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        {
          appName: APP_ID,
          reason: 'drm-wrapped',
          fallbackAvailable: true
        }
      )
      expect(library.get(APP_ID)?.is_installed).not.toBe(true)
      expect(reportDetectedFix).toHaveBeenCalledWith(
        {
          appId: APP_ID,
          key: 'drm',
          op: 'add',
          detector: 'ceg'
        },
        expect.objectContaining({ post: expect.any(Function) })
      )

      // The breaker is armed: a later install() of the same appId is routed
      // away from the bridge (failed-this-session -> bottled Steam).
      ;(placeShimForGame as jest.Mock).mockClear()
      isBottleReady.mockReturnValue(true)
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)
      expect(placeShimForGame).not.toHaveBeenCalled()
    })

    it("with userRoute 'bridge' completes as a normal bridge install, still persisting drm", async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { userRoute: 'bridge' }
      })
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed',
        shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`,
        drm: CEG_DRM
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result).toEqual({ status: 'done' })
      expect(drmPersistCall()).toBeDefined()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
      expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
      expect(library.get(APP_ID)?.is_installed).toBe(true)
      expect(reportDetectedFix).toHaveBeenCalledWith(
        {
          appId: APP_ID,
          key: 'drm',
          op: 'add',
          detector: 'ceg'
        },
        expect.objectContaining({ post: expect.any(Function) })
      )
    })

    it("drm null clears a persisted drm 'ceg' and completes normally", async () => {
      // userRoute 'bridge' is what lets a title already persisted as CEG
      // reach installBridgeGame at all (otherwise row 4 routes it to bottle).
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { userRoute: 'bridge', drm: 'ceg' }
      })
      ;(placeShimForGame as jest.Mock).mockResolvedValue({
        status: 'placed',
        shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`,
        drm: null
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result).toEqual({ status: 'done' })
      const clearCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
        ([id, value]) =>
          id === APP_ID &&
          value?.bridge?.userRoute === 'bridge' &&
          !('drm' in value.bridge)
      )
      expect(clearCall).toBeDefined()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
    })
  })

  it("D-51-09 (Task 3): placeShimForGame's 'no-steam-api' status at install time persists the verdict AND sets the steam_api prescreen to 'none'", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'no-steam-api',
      verdict: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'v2',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done' })
    const scanPersistCall = (
      steamMetadataStore.set as jest.Mock
    ).mock.calls.find(
      ([id, value]) => id === APP_ID && value?.bridge?.scan?.status === 'clean'
    )
    expect(scanPersistCall).toBeDefined()
    const prescreenPersistCall = (
      steamMetadataStore.set as jest.Mock
    ).mock.calls.find(
      ([id, value]) => id === APP_ID && value?.bridge?.steamApi === 'none'
    )
    expect(prescreenPersistCall).toBeDefined()
    expect(library.get(APP_ID)?.is_installed).toBe(true)
  })

  it("CR-04: install with persisted steamApi 'x64' and a no-steam-api placement never downgrades the prescreen to 'none'", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { steamApi: 'x64' }
    })
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'no-steam-api',
      verdict: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'v2',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    const noneWrite = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) => id === APP_ID && value?.bridge?.steamApi === 'none'
    )
    expect(noneWrite).toBeUndefined()
  })

  it("CR-04: install with persisted steamApi 'none' and a placed verdict arch x86 upgrades the prescreen to 'x86'", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { steamApi: 'none' }
    })
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: `${BRIDGE_STEAMAPPS_DIR}/common/Avernum 4/steam_api.dll`,
      verdict: {
        status: 'clean',
        arch: 'x86',
        missingSymbols: [],
        interfaceVersions: {},
        stubbedInterfaces: [],
        shimExportSetVersion: 'v2',
        scannedAt: '2026-01-01T00:00:00.000Z'
      }
    })

    await new SteamGame(APP_ID, steamTestDeps).install({} as any)

    const upgrade = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) => id === APP_ID && value?.bridge?.steamApi === 'x86'
    )
    expect(upgrade).toBeDefined()
  })

  it('D-A/D-B: new installs ALWAYS target the per-game bottle directly, even when the legacy bridge bottle already holds this appId manifest (the resolver is never consulted for new installs)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    // Legacy bottle is ready; per-game bottle is NOT ready — if install()
    // ever consulted resolveBridgeBottleName, a legacy-manifest answer
    // would resolve to the legacy name. Installs must bypass that
    // resolver entirely and provision/target the per-game name regardless.
    ;(isBridgeBottleReady as jest.Mock).mockImplementation(
      (_paths: unknown, bottleName?: string) =>
        bottleName === 'GameLibSteamBridge'
    )
    ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(isBridgeBottleReady).toHaveBeenCalledWith(
      expect.anything(),
      `GameLibSteamBridge-${APP_ID}`
    )
    expect(isBridgeBottleReady).not.toHaveBeenCalledWith(
      expect.anything(),
      'GameLibSteamBridge'
    )
    expect(provisionBridgeBottle).toHaveBeenCalledWith(steamTestDeps, {
      bottleName: `GameLibSteamBridge-${APP_ID}`,
      createTimeoutMs: 120_000,
      signal: expect.anything()
    })
    expect(placeShimForGame).toHaveBeenCalledWith(
      expect.anything(),
      steamTestDeps.paths,
      APP_ID,
      RESOLVED_EXE_PATH,
      expect.objectContaining({
        bottleName: `GameLibSteamBridge-${APP_ID}`,
        gameInstallRoot: expect.stringContaining('Avernum 4')
      })
    )
    expect(result).toEqual({ status: 'done' })
  })

  it('D-UAT-24-05 wiring: installBridgeGame polls the BRIDGE bottle (pollerSource:"bridge"), never "bottle" (which watches the unrelated Phase 17 GameLibSteam bottle and would never observe this manifest)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(startInstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, {
      source: 'bridge',
      isNativeHandoff: true,
      skippedDepots: []
    })
    expect(startInstallPollingSpy).not.toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      expect.objectContaining({ source: 'bottle' })
    )
  })

  it('D-UAT-24-03 cascade (b): a completed bridge install records install.install_path UNDER the bridge bottle (GameLibSteamBridge), never the Phase 17 GameLibSteam bottle', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    const stored = library.get(APP_ID)
    expect(stored?.install.install_path).toContain(BRIDGE_STEAMAPPS_DIR)
    expect(stored?.install.install_path).toContain('common')
    expect(stored?.install.install_path).not.toContain('/mock/bottle/steamapps')
  })

  it('D-UAT-24-03 cascade (a): a successful bridge install calls clearBridgeFailedThisSession — proven by exercising the exported un-poison hook: after markBridgeFailedThisSession + clearBridgeFailedThisSession for the SAME appId, a subsequent install() reaches the bridge again rather than the bottled fallback', async () => {
    const RETRY_APP_ID = '555555'
    library.set(RETRY_APP_ID, makeEntry({ title: 'Retry After Clear' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    // Simulate an earlier recoverable bridge failure this session (e.g. a
    // prior launch() failure, finding #3) that installBridgeGame's success
    // path (`clearBridgeFailedThisSession(this.appId)`, games.ts) is
    // responsible for un-poisoning.
    markBridgeFailedThisSession(RETRY_APP_ID)
    clearBridgeFailedThisSession(RETRY_APP_ID)

    const game = new SteamGame(RETRY_APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    // Reaching downloadSteamDepots (the bridge's own depot-download engine)
    // proves isBridgeEligible() was true for this appId — i.e. the earlier
    // bridgeFailedThisSession marking no longer applies.
    expect(downloadSteamDepots).toHaveBeenCalled()
    expect(result).toEqual({ status: 'done' })
  })

  it('a FAILED bridge install (depot download error) still marks bridge-failed and does NOT clear it — a subsequent install() for the same appId still routes to the bottled fallback', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValueOnce({
      status: 'error',
      error: 'depot download failed'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const firstResult = await game.install({} as any)
    expect(firstResult).toEqual({
      status: 'error',
      error: 'depot download failed'
    })
    expect(placeShimForGame).not.toHaveBeenCalled()

    // A subsequent install() call for the SAME appId must stay routed to
    // the bottled fallback — the failure was never cleared.
    const secondGame = new SteamGame(APP_ID, steamTestDeps)
    const secondResult = await secondGame.install({} as any)
    expect(downloadSteamDepots).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        os: 'windows',
        targetSteamappsDir: '/mock/bottle/steamapps'
      })
    )
    expect(secondResult).toEqual({ status: 'done' })
  })

  it('Plan 13 (D-51-08): known-bad title (knownBadReason non-null), no acknowledgement -- install() fires steamBridgeRouteNotice and defers to setup WITHOUT ever reaching the bottled dispatch', async () => {
    // Phase 51 Plan 09: a non-seed, never-scanned, bottle-eligible title now
    // DEFAULTS to the bridge route (resolveBridgeRoute rule 11,
    // 'pending-scan') -- bridgeAllowlist.has(false) alone no longer forces
    // the bottled path. knownBadReason is the deterministic way to force it.
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(
      'drm-wrapped'
    )
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    // D-51-08: no silent heavy Windows Steam client -- the bottled dispatch
    // never runs while the notice is unacknowledged.
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBridgeRouteNotice', {
      appName: APP_ID,
      reason: 'known-bad',
      knownBadReason: 'drm-wrapped',
      missingSymbols: [],
      route: 'bottle',
      userRoute: null
    })
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it("quick 261027-gtd: known-fix drm 'ceg' with no allowlist entry -- install() fires the drm-wrapped steamBridgeRouteNotice before any download", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
    ;(knownFixSaysCeg as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(knownFixSaysCeg).toHaveBeenCalledWith(expect.anything(), APP_ID)
    expect(placeShimForGame).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBridgeRouteNotice', {
      appName: APP_ID,
      reason: 'known-bad',
      knownBadReason: 'drm-wrapped',
      missingSymbols: [],
      route: 'bottle',
      userRoute: null
    })
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it("Plan 13 (D-51-11): known-bad title with userRoute 'bridge' (Try the bridge anyway) -- install() routes to installBridgeGame, no notice", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(
      'drm-wrapped'
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { userRoute: 'bridge' }
    })
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeRouteNotice',
      expect.anything()
    )
    expect(downloadSteamDepots).toHaveBeenCalled()
    expect(result).toEqual({ status: 'done' })
  })

  describe('quick 261023-oq7: scan-miss routes to the bridge behind an informational notice', () => {
    const missScan = {
      status: 'miss',
      arch: 'x86',
      missingSymbols: ['SteamUser@unknown-version'],
      interfaceVersions: {},
      stubbedInterfaces: [],
      shimExportSetVersion: 'irrelevant',
      scannedAt: '2026-01-01T00:00:00.000Z'
    }
    const arrange = (
      bridge: Record<string, unknown> = {},
      knownBad: string | null = null
    ) => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(knownBad)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { scan: missScan, ...bridge }
      })
      isBottleReady.mockReturnValue(true)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })
    }
    const noticeCalls = () =>
      sendFrontendMessage.mock.calls.filter(
        (c) => c[0] === 'steamBridgeRouteNotice'
      )

    it('unacknowledged: one scan-miss notice on route bridge, deferred, nothing installed', async () => {
      arrange()
      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(downloadSteamDepots).not.toHaveBeenCalled()
      expect(noticeCalls()).toEqual([
        [
          'steamBridgeRouteNotice',
          {
            appName: APP_ID,
            reason: 'scan-miss',
            knownBadReason: null,
            missingSymbols: ['SteamUser@unknown-version'],
            route: 'bridge',
            userRoute: null
          }
        ]
      ])
      expect(result).toEqual({ status: 'done', deferredToSetup: true })
    })

    it('acknowledged for scan-miss: no notice, downloads through the bridge', async () => {
      arrange({ noticeAcknowledgedFor: 'scan-miss' })
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(noticeCalls()).toEqual([])
      expect(downloadSteamDepots).toHaveBeenCalled()
    })

    it('quick 261029-avh: DRM-mode miss (steamstub), unacknowledged: no notice, downloads through the bridge', async () => {
      arrange({ scan: { ...missScan, drmWrapper: 'steamstub' } })
      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(noticeCalls()).toEqual([])
      expect(result).not.toEqual({ status: 'done', deferredToSetup: true })
      expect(downloadSteamDepots).toHaveBeenCalled()
    })

    it('quick 261029-avh: non-DRM miss, unacknowledged: exactly one scan-miss notice on route bridge', async () => {
      arrange({})
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      const calls = noticeCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0][1]).toMatchObject({
        reason: 'scan-miss',
        route: 'bridge'
      })
    })

    it('does-not-run + miss: exactly one combined notice', async () => {
      arrange({}, 'does-not-run')
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      const calls = noticeCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0][1]).toMatchObject({
        reason: 'scan-miss',
        knownBadReason: 'does-not-run',
        route: 'bridge'
      })
    })

    it('drm-wrapped + miss: known-bad notice on route bottle', async () => {
      arrange({}, 'drm-wrapped')
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      const calls = noticeCalls()
      expect(calls).toHaveLength(1)
      expect(calls[0][1]).toMatchObject({
        reason: 'known-bad',
        route: 'bottle'
      })
    })

    it("userRoute 'bottle' + miss: no notice, bottled path", async () => {
      arrange({ userRoute: 'bottle' })
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(noticeCalls()).toEqual([])
      expect(downloadSteamDepots).toHaveBeenCalledWith(
        APP_ID,
        expect.objectContaining({
          os: 'windows',
          targetSteamappsDir: '/mock/bottle/steamapps'
        })
      )
    })
  })

  describe.each(['63000', '411300'])(
    'D-51-08 amendment 2026-10-23: non-DRM known-bad title %s stays on the bridge',
    (badAppId) => {
      const arrange = (bridge?: Record<string, unknown>) => {
        library.set(badAppId, makeEntry({ title: 'Does Not Run' }))
        ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
        ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(
          'does-not-run'
        )
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: false,
          ...(bridge ? { bridge } : {})
        })
        ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
        isBottleReady.mockReturnValue(true)
        ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
          status: 'done'
        })
      }

      it('unacknowledged: fires the informational known-bad notice on route bridge and defers', async () => {
        arrange()
        const result = await new SteamGame(badAppId, steamTestDeps).install(
          {} as any
        )

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'steamBridgeRouteNotice',
          {
            appName: badAppId,
            reason: 'known-bad',
            knownBadReason: 'does-not-run',
            missingSymbols: [],
            route: 'bridge',
            userRoute: null
          }
        )
        expect(downloadSteamDepots).not.toHaveBeenCalled()
        expect(result).toEqual({ status: 'done', deferredToSetup: true })
      })

      it('acknowledged: no notice, installs through the bridge, never the bottle', async () => {
        arrange({ noticeAcknowledgedFor: 'known-bad' })
        await new SteamGame(badAppId, steamTestDeps).install({} as any)

        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamBridgeRouteNotice',
          expect.anything()
        )
        expect(downloadSteamDepots).toHaveBeenCalled()
      })

      it("userRoute 'bottle': no known-bad notice, takes the bottled path", async () => {
        arrange({ userRoute: 'bottle' })
        await new SteamGame(badAppId, steamTestDeps).install({} as any)

        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamBridgeRouteNotice',
          expect.anything()
        )
        expect(downloadSteamDepots).toHaveBeenCalledWith(
          badAppId,
          expect.objectContaining({
            os: 'windows',
            targetSteamappsDir: '/mock/bottle/steamapps'
          })
        )
      })
    }
  )

  it('non-seed, never-scanned, bottle-eligible title now routes to the bridge on install (D-51-07, resolveBridgeRoute rule 11 — pending-scan)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)
  })

  // 51-REVIEW WR-08: install() must route by LOCATION when partial bits of an
  // interrupted native download already live in the GameLibSteam bottle --
  // not start a second download into a fresh bridge bottle.
  describe('51-REVIEW WR-08: an interrupted GameLibSteam download keeps the bottled path', () => {
    function setBreadcrumb(targetSteamappsDir: string): void {
      const entry = makeEntry({ title: 'Avernum 4' })
      library.set(APP_ID, {
        ...entry,
        install: {
          ...entry.install,
          steamResumeTargetSteamappsDir: targetSteamappsDir,
          steamResumeInstalldir: 'Avernum 4'
        }
      })
    }

    beforeEach(() => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      isBottleReady.mockReturnValue(false)
      getSteamBottleSettings.mockReturnValue({
        wineCrossoverBottle: 'GameLibSteam'
      })
      sendFrontendMessage.mockClear()
      ;(placeShimForGame as jest.Mock).mockClear()
      ;(downloadSteamDepots as jest.Mock).mockClear()
    })

    it('breadcrumb pointing at the GameLibSteam bottle: no bridge install, the bottled path runs instead', async () => {
      setBreadcrumb('/mock/bottle/steamapps')

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(provisionBridgeBottle).not.toHaveBeenCalled()
      expect(downloadSteamDepots).not.toHaveBeenCalled()
      expect(placeShimForGame).not.toHaveBeenCalled()
      // The bottled path's own not-ready deferral proves which branch ran.
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBottleSetupRequired',
        { appName: APP_ID }
      )
      expect(result).toEqual({ status: 'done', deferredToSetup: true })
    })

    it('breadcrumb pointing at the bridge bottle (an interrupted BRIDGE download) still routes to the bridge', async () => {
      setBreadcrumb(BRIDGE_STEAMAPPS_DIR)

      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.install({} as any)

      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBottleSetupRequired',
        expect.anything()
      )
      expect(placeShimForGame).toHaveBeenCalled()
    })
  })

  // ── D-51-06 (Plan 17): the cheap pre-install screen, run ONLY when
  // route.route === 'bridge' && route.reason === 'pending-scan' && no
  // steamApi is stored yet. ────────────────────────────────────────────────
  describe('D-51-06 pre-install prescreen (Plan 17)', () => {
    /** Stateful steamMetadataStore double, scoped identically to the
     *  write-discipline describe's own local helper (not imported across
     *  describes, per this plan's own instruction) — .get() must reflect the
     *  prescreen's own setBridgeSteamApiPrescreen() write so the SECOND
     *  bridgeRoute() computation (after the screen persists its result) sees
     *  the freshly-persisted steamApi value, exactly like a real store. */
    function mockStatefulMetadataStore(initial: Record<string, unknown>) {
      let state: Record<string, unknown> | undefined = initial
      ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
      ;(steamMetadataStore.set as jest.Mock).mockImplementation((_id, meta) => {
        state = meta
      })
    }

    let setBridgeSteamApiPrescreenSpy: jest.SpyInstance

    beforeEach(() => {
      ;(prescreenBridgeDepots as jest.Mock).mockReset()
      // bridgeVerdict.ts is real/unmocked in this file -- spy (not replace)
      // so the real steamMetadataStore.set() write still happens, mirroring
      // this file's own setBridgeIdentityFallback spy precedent.
      setBridgeSteamApiPrescreenSpy = jest.spyOn(
        bridgeVerdictModule,
        'setBridgeSteamApiPrescreen'
      )
    })

    afterEach(() => {
      setBridgeSteamApiPrescreenSpy.mockRestore()
    })

    it('Phase 54: the prescreen holds one short prescreen lease released before installBridgeGame runs', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(prescreenBridgeDepots as jest.Mock).mockResolvedValue('x64')
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })
      const releases: jest.Mock[] = []
      jest.mocked(steamUser.acquireAuthenticated).mockImplementation(() => {
        const release = jest.fn()
        releases.push(release)
        return Promise.resolve({ ok: true, client: {}, release } as never)
      })

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(steamUser.acquireAuthenticated).toHaveBeenNthCalledWith(1, {
        reason: 'prescreen',
        guidedAction: 'install',
        appName: APP_ID
      })
      const prescreenOrder = at(
        (prescreenBridgeDepots as jest.Mock).mock.invocationCallOrder,
        0
      )
      expect(
        at(
          jest.mocked(steamUser.acquireAuthenticated).mock.invocationCallOrder,
          0
        )
      ).toBeLessThan(prescreenOrder)
      expect(releases[0]).toHaveBeenCalledTimes(1)
      expect(at(at(releases, 0).mock.invocationCallOrder, 0)).toBeLessThan(
        at((downloadSteamDepots as jest.Mock).mock.invocationCallOrder, 0)
      )
    })

    it('Phase 54: a prescreen refusal returns the refusal result and never screens or persists', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
        ok: false,
        reason: 'go-offline-required'
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(prescreenBridgeDepots).not.toHaveBeenCalled()
      expect(setBridgeSteamApiPrescreenSpy).not.toHaveBeenCalled()
      expect(downloadSteamDepots).not.toHaveBeenCalled()
      expect(steamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
    })

    it("x64 with no Win64 shim bundled: persists 'x64', route recomputes to bottle/win64-no-shim, notice fired, no download", async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(existsSync as jest.Mock).mockReturnValue(false) // no Win64 shim built
      ;(prescreenBridgeDepots as jest.Mock).mockResolvedValue('x64')
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(prescreenBridgeDepots).toHaveBeenCalledWith(
        APP_ID,
        expect.objectContaining({ os: 'windows' })
      )
      expect(setBridgeSteamApiPrescreenSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        'x64'
      )
      expect(downloadSteamDepots).not.toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeRouteNotice',
        {
          appName: APP_ID,
          reason: 'win64-no-shim',
          knownBadReason: null,
          missingSymbols: [],
          route: 'bottle',
          userRoute: null
        }
      )
      expect(result).toEqual({ status: 'done', deferredToSetup: true })
    })

    it("x64 WITH a Win64 shim bundled: persists 'x64', route stays bridge -- installBridgeGame proceeds", async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(existsSync as jest.Mock).mockReturnValue(true) // Win64 shim present
      ;(prescreenBridgeDepots as jest.Mock).mockResolvedValue('x64')
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(setBridgeSteamApiPrescreenSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        'x64'
      )
      expect(downloadSteamDepots).toHaveBeenCalled()
      expect(result).toEqual({ status: 'done' })
    })

    it("prescreen 'none': persisted, installBridgeGame proceeds (placement later reports no-steam-api, no shim placed)", async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(prescreenBridgeDepots as jest.Mock).mockResolvedValue('none')
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(setBridgeSteamApiPrescreenSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        'none'
      )
      expect(downloadSteamDepots).toHaveBeenCalled()
      expect(result).toEqual({ status: 'done' })
    })

    it.each(['x86', 'both', 'unknown'] as const)(
      "prescreen result '%s': persisted, installBridgeGame proceeds (install then scan)",
      async (prescreenResult) => {
        mockStatefulMetadataStore({
          platformsCaptured: true,
          is_mac_native: false
        })
        ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
        ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
        ;(prescreenBridgeDepots as jest.Mock).mockResolvedValue(prescreenResult)
        ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
        ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
          status: 'done'
        })

        const game = new SteamGame(APP_ID, steamTestDeps)
        const result = await game.install({} as any)

        expect(setBridgeSteamApiPrescreenSpy).toHaveBeenCalledWith(
          steamTestDeps,
          APP_ID,
          prescreenResult
        )
        expect(downloadSteamDepots).toHaveBeenCalled()
        expect(result).toEqual({ status: 'done' })
      }
    )

    it('seed title skips the screen entirely (prescreenBridgeDepots not called)', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.install({} as any)

      expect(prescreenBridgeDepots).not.toHaveBeenCalled()
    })

    it('a title with a stored CLEAN scan verdict skips the screen (route reason is scan-clean, not pending-scan)', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: {
          scan: {
            status: 'clean',
            arch: 'x86',
            missingSymbols: [],
            interfaceVersions: {},
            stubbedInterfaces: [],
            shimExportSetVersion: 'current',
            scannedAt: '2026-01-01T00:00:00.000Z'
          }
        }
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.install({} as any)

      expect(prescreenBridgeDepots).not.toHaveBeenCalled()
    })

    it('a title with an already-stored steamApi skips the screen even though the route still resolves to bridge/pending-scan', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { steamApi: 'x64' }
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
      ;(existsSync as jest.Mock).mockReturnValue(true) // Win64 shim present
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(prescreenBridgeDepots).not.toHaveBeenCalled()
      expect(downloadSteamDepots).toHaveBeenCalled()
      expect(result).toEqual({ status: 'done' })
    })
  })

  it('BLOCKER 1: bridge bottle not ready — provisionBridgeBottle is called BEFORE any depot download; on success proceeds to depot download', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).toHaveBeenCalledWith(steamTestDeps, {
      bottleName: `GameLibSteamBridge-${APP_ID}`,
      createTimeoutMs: 120_000,
      signal: expect.anything()
    })
    expect(downloadSteamDepots).toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.objectContaining({ reason: 'bridge-bottle-provision-failed' })
    )
    expect(result).toEqual({ status: 'done' })
  })

  it('BLOCKER 1: bridge bottle provisioning FAILURE fires steamBridgeSetupRequired and returns deferredToSetup:true — no depot download attempted', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
      status: 'error',
      error: 'cxbottle create failed'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).toHaveBeenCalledWith(steamTestDeps, {
      bottleName: `GameLibSteamBridge-${APP_ID}`,
      createTimeoutMs: 120_000,
      signal: expect.anything()
    })
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      {
        appName: APP_ID,
        reason: 'bridge-bottle-provision-failed',
        fallbackAvailable: true
      }
    )
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  describe('quick 261024-cjq: missing CrossOver is a precondition, not a bridge failure', () => {
    it('bridge route, CrossOver absent: install proceeds to the bridge (no crossoverRequired error, bridge not marked failed)', async () => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
      crossoverInstalled.mockReturnValue(false)
      ;(decideCreationEngine as jest.Mock).mockResolvedValue({
        kind: 'pinned',
        reason: 'cx-missing',
        pin: ENGINE_PINS.current
      })
      ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'done'
      })
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result.error).toBeUndefined()
      expect(provisionBridgeBottle).toHaveBeenCalledTimes(1)
      expect(downloadSteamDepots).toHaveBeenCalled()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
    })

    it('race: provisionBridgeBottle reports crossover-missing -> built-in engine retry, no setup dialog', async () => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
      ;(provisionBridgeBottle as jest.Mock)
        .mockResolvedValueOnce({
          status: 'error',
          errorCode: 'crossover-missing',
          error: 'CrossOver is required...'
        })
        .mockResolvedValueOnce({ status: 'done' })
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result.error).toBeUndefined()
      expect(provisionBridgeBottle).toHaveBeenCalledTimes(2)
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
    })

    it('CrossOver absent on a bottle-routed, non-bridge-eligible title: same error, no bottled-Steam setup dialog', async () => {
      // Known-bad + acknowledged: the route resolves to bottled Steam.
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(
        'drm-wrapped'
      )
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false,
        bridge: { noticeAcknowledgedFor: 'known-bad' }
      })
      isBottleReady.mockReturnValue(false)
      crossoverInstalled.mockReturnValue(false)

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install({} as any)

      expect(result.status).toBe('error')
      // i18next is mocked to echo the key in this file
      expect(result.error).toContain('crossoverRequired')
      expect(provisionBridgeBottle).not.toHaveBeenCalled()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeRouteNotice',
        expect.anything()
      )
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBottleSetupRequired',
        expect.anything()
      )
    })
  })

  describe('Phase 59 (59-09): engine-aware bridge bottle creation', () => {
    const pinnedDecision = () => ({
      kind: 'pinned',
      reason: 'cx-missing',
      pin: ENGINE_PINS.current
    })
    const sendGameStatusUpdate = jest.requireMock('backend/utils')
      .sendGameStatusUpdate as jest.Mock
    const statuses = () =>
      sendGameStatusUpdate.mock.calls
        .map(([, u]) => u)
        .filter((u) => u.status === 'engine-download')
        .map((u) => u.context)

    beforeEach(() => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
      ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'done'
      })
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
        status: 'done'
      })
    })

    it('pinned decision: downloads with deduplicated whole-percent engine-download statuses, then creates the bottle with fallbackEngine', async () => {
      ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
      mockEnsurePinnedEngine.mockImplementation((_pin, opts) => {
        for (const percentage of [0, 0.2, 10.4, 10.2, 99.6, 100]) {
          opts.onProgress({
            phase: 'downloading',
            artifact: 'wine',
            percentage
          })
        }
        return Promise.resolve(ENGINE_OK)
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(statuses()).toEqual([
        'downloading:0',
        'downloading:10',
        'downloading:98',
        'setting-up',
        'creating-bottle'
      ])
      const call = (provisionBridgeBottle as jest.Mock).mock.calls[0][1]
      expect(call.bottleName).toBe(`GameLibSteamBridge-${APP_ID}`)
      expect(call.wineVersion).toBeUndefined()
      expect(call.fallbackEngine).toEqual(
        expect.objectContaining({
          wineBin: ENGINE_OK.paths.wineBin,
          wineserverBin: ENGINE_OK.paths.wineserverBin,
          dxvk: expect.objectContaining({ dir: ENGINE_OK.paths.dxvkDir })
        })
      )
      expect(downloadSteamDepots).toHaveBeenCalled()
      expect(result.status).toBe('done')
    })

    it('G1: real two-archive progress never resets the percent and labels verify/unpack/set-up (trace 2026-11-02)', async () => {
      ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
      mockEnsurePinnedEngine.mockImplementation((_pin, opts) => {
        const run = (artifact: 'dxvk' | 'wine') => {
          for (const percentage of [0, 5, 50, 100]) {
            opts.onProgress({ phase: 'downloading', artifact, percentage })
          }
          opts.onProgress({ phase: 'verifying', artifact })
          opts.onProgress({ phase: 'extracting', artifact })
        }
        run('dxvk')
        run('wine')
        return Promise.resolve(ENGINE_OK)
      })

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      const seen = statuses() as string[]
      const percents = seen
        .filter((c) => c.startsWith('downloading:'))
        .map((c) => Number(c.slice('downloading:'.length)))
      expect(percents.length).toBeGreaterThan(1)
      expect(percents).toEqual([...percents].sort((a, b) => a - b))
      expect(percents[percents.length - 1]).toBe(100)
      expect(seen).toContain('verifying')
      expect(seen).toContain('extracting')
      // no bare percent (legacy '0') once phases exist, and no consecutive dupes
      expect(seen.filter((c) => /^\d+$/.test(c))).toEqual([])
      expect(seen.filter((c, i) => c === seen[i - 1])).toEqual([])
      expect(seen[seen.length - 1]).toBe('creating-bottle')
      expect(seen[seen.length - 2]).toBe('setting-up')
    })

    it('G1: once the bottle is ready the status leaves engine-download for installing before the game depots download', async () => {
      ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
      mockEnsurePinnedEngine.mockImplementation((_pin, opts) => {
        opts.onProgress({
          phase: 'downloading',
          artifact: 'wine',
          percentage: 50
        })
        return Promise.resolve(ENGINE_OK)
      })
      const order: string[] = []
      sendGameStatusUpdate.mockImplementation((_deps: unknown, u) => {
        order.push(`${u.status}:${u.context ?? ''}`)
      })
      ;(downloadSteamDepots as jest.Mock).mockImplementation(() => {
        order.push('depots')
        return Promise.resolve({ status: 'done' })
      })

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      const depots = order.indexOf('depots')
      const lastEngine = order
        .map((o) => o.startsWith('engine-download'))
        .lastIndexOf(true)
      const installingAfterEngine = order.findIndex(
        (o, i) => i > lastEngine && o.startsWith('installing')
      )
      expect(depots).toBeGreaterThan(-1)
      expect(installingAfterEngine).toBeGreaterThan(lastEngine)
      expect(installingAfterEngine).toBeLessThan(depots)
    })

    it('already-installed pin: no engine download status is sent, only the creating-bottle stage (G21)', async () => {
      ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)
      expect(statuses()).toEqual(['creating-bottle'])
      expect(provisionBridgeBottle).toHaveBeenCalledWith(
        steamTestDeps,
        expect.objectContaining({ fallbackEngine: expect.anything() })
      )
    })

    it('crossover decision: never downloads the engine (D-05) and passes the create cap', async () => {
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)
      expect(mockEnsurePinnedEngine).not.toHaveBeenCalled()
      expect(provisionBridgeBottle).toHaveBeenCalledWith(steamTestDeps, {
        bottleName: `GameLibSteamBridge-${APP_ID}`,
        createTimeoutMs: 120_000,
        signal: expect.anything()
      })
    })

    it('crossover create timeout (D-12): falls back to the built-in engine and continues', async () => {
      ;(provisionBridgeBottle as jest.Mock)
        .mockResolvedValueOnce({
          status: 'error',
          errorCode: 'crossover-create-timeout',
          error: 'timed out'
        })
        .mockResolvedValueOnce({ status: 'done' })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(mockEnsurePinnedEngine).toHaveBeenCalledTimes(1)
      expect(provisionBridgeBottle).toHaveBeenCalledTimes(2)
      expect(
        (provisionBridgeBottle as jest.Mock).mock.calls[1][1].fallbackEngine
      ).toBeDefined()
      expect(result.status).toBe('done')
    })

    it('undownloadable engine: error result, terminal done status, never marks the bridge failed or shows setup', async () => {
      ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
      mockEnsurePinnedEngine.mockResolvedValue({
        ok: false,
        reason: 'offline',
        detail: 'no network'
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result.status).toBe('error')
      expect(result.error).toContain('downloadFailed')
      expect(provisionBridgeBottle).not.toHaveBeenCalled()
      expect(downloadSteamDepots).not.toHaveBeenCalled()
      expect(sendGameStatusUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ appName: APP_ID, status: 'done' })
      )
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
      // a later install still routes to the bridge (not marked failed)
      mockEnsurePinnedEngine.mockResolvedValue(ENGINE_OK)
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)
      expect(provisionBridgeBottle).toHaveBeenCalledTimes(1)
    })

    describe('59-21: sign-in first, create-failed fallback, abort, redist engine', () => {
      const redistSettings = () =>
        (installSteamBridgeSharedRedists as jest.Mock).mock.calls[0]?.[2]

      it('G2: a refused session returns before any engine decision, download or bottle creation', async () => {
        jest.mocked(steamUser.acquireAuthenticated).mockResolvedValue({
          ok: false,
          reason: 'logon-rejected'
        })
        const expected = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(decideCreationEngine).not.toHaveBeenCalled()
        expect(mockEnsurePinnedEngine).not.toHaveBeenCalled()
        expect(provisionBridgeBottle).not.toHaveBeenCalled()
        expect(expected.status).toBeDefined()
        expect(leaseRelease).not.toHaveBeenCalled()
      })

      it('WR-02: a CrossOver create that returns crossover-create-failed falls back to the built-in engine', async () => {
        ;(provisionBridgeBottle as jest.Mock)
          .mockResolvedValueOnce({
            status: 'error',
            errorCode: 'crossover-create-failed',
            error: 'cxbottle exited 1'
          })
          .mockResolvedValueOnce({ status: 'done' })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(mockEnsurePinnedEngine).toHaveBeenCalledTimes(1)
        expect(provisionBridgeBottle).toHaveBeenCalledTimes(2)
        expect(
          (provisionBridgeBottle as jest.Mock).mock.calls[1][1].fallbackEngine
        ).toBeDefined()
        expect(result.status).toBe('done')
      })

      // A real AbortController wired through the aborthandler mocks, with a
      // registry that mimics createAbortController replacing the entry.
      const wireControllers = () => {
        const registry = new Map<string, AbortController>()
        createAbortController.mockImplementation((id) => {
          const c = new AbortController()
          registry.set(id, c)
          return c
        })
        hasAbortController.mockImplementation((id) => registry.has(id))
        getAbortSignal.mockImplementation((id) => registry.get(id)?.signal)
        deleteAbortController.mockImplementation((id) => {
          registry.delete(id)
        })
        return registry
      }

      it('WR-01: an aborted engine download is status abort', async () => {
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        mockEnsurePinnedEngine.mockResolvedValue({
          ok: false,
          reason: 'aborted',
          detail: 'shutting down'
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        expect(provisionBridgeBottle).not.toHaveBeenCalled()
        expect(downloadSteamDepots).not.toHaveBeenCalled()
        expect(leaseRelease).toHaveBeenCalledTimes(1)
        expect(sendGameStatusUpdate).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ appName: APP_ID, status: 'done' })
        )
      })

      it('WR-01: install cancel mid engine download aborts the signal it received and removes the controller', async () => {
        const registry = wireControllers()
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        mockEnsurePinnedEngine.mockImplementation(
          (_pin, opts: { signal: AbortSignal }) => {
            registry.get(APP_ID)!.abort()
            return Promise.resolve(
              opts.signal.aborted
                ? { ok: false, reason: 'aborted', detail: 'cancelled' }
                : ENGINE_OK
            )
          }
        )
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result.status).toBe('abort')
        expect(provisionBridgeBottle).not.toHaveBeenCalled()
        expect(registry.has(APP_ID)).toBe(false)
        expect(leaseRelease).toHaveBeenCalledTimes(1)
      })

      it('CR-01: abort during provisioning never reaches installBridgeGameLeased (engine already installed)', async () => {
        const registry = wireControllers()
        // the engine resolves at once; the cancel lands during the decision
        ;(decideCreationEngine as jest.Mock).mockImplementation(() => {
          registry.get(APP_ID)!.abort()
          return Promise.resolve(pinnedDecision())
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        expect(provisionBridgeBottle).not.toHaveBeenCalled()
        expect(downloadSteamDepots).not.toHaveBeenCalled()
        expect(sendGameStatusUpdate).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ appName: APP_ID, status: 'done' })
        )
        expect(leaseRelease).toHaveBeenCalledTimes(1)
        expect(registry.has(APP_ID)).toBe(false)
      })

      it('CR-01: PROVISION_ABORTED is an abort, not a bridge failure', async () => {
        wireControllers()
        ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'error',
          errorCode: 'provision-aborted',
          error: 'aborted'
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        // no built-in-engine fallback, no setup dialog, no downloads
        expect(provisionBridgeBottle).toHaveBeenCalledTimes(1)
        expect(mockEnsurePinnedEngine).not.toHaveBeenCalled()
        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamBridgeSetupRequired',
          expect.anything()
        )
        expect(downloadSteamDepots).not.toHaveBeenCalled()
        // the route is not poisoned: the next install provisions again
        ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'done'
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(provisionBridgeBottle).toHaveBeenCalledTimes(2)
        expect(downloadSteamDepots).toHaveBeenCalled()
      })

      it('CR-01: the signal reaches provisionBridgeBottle on every call (CrossOver, create-failed fallback, pinned)', async () => {
        wireControllers()
        ;(provisionBridgeBottle as jest.Mock)
          .mockResolvedValueOnce({
            status: 'error',
            errorCode: 'crossover-create-failed',
            error: 'x'
          })
          .mockResolvedValueOnce({ status: 'done' })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'done'
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        const calls = (provisionBridgeBottle as jest.Mock).mock.calls
        expect(calls).toHaveLength(3)
        for (const [, opts] of calls) {
          expect(opts.signal).toBeInstanceOf(AbortSignal)
        }
      })

      it('CR-01: abort after a fresh bottle discards it', async () => {
        const registry = wireControllers()
        ;(provisionBridgeBottle as jest.Mock).mockImplementation(() => {
          registry.get(APP_ID)!.abort()
          return Promise.resolve({ status: 'done', createdHere: true })
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        expect(discardNewBridgeBottle).toHaveBeenCalledWith(
          steamTestDeps.paths,
          `GameLibSteamBridge-${APP_ID}`
        )
        expect(downloadSteamDepots).not.toHaveBeenCalled()
      })

      it('CR-01: abort after provisioning keeps a pre-existing bottle dir', async () => {
        const registry = wireControllers()
        ;(provisionBridgeBottle as jest.Mock).mockImplementation(() => {
          registry.get(APP_ID)!.abort()
          return Promise.resolve({ status: 'done', createdHere: false })
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        expect(discardNewBridgeBottle).not.toHaveBeenCalled()
        expect(downloadSteamDepots).not.toHaveBeenCalled()
      })

      it('CR-01: a throw before the depot hand-off removes the provisioning controller', async () => {
        const registry = wireControllers()
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'done'
        })
        // throws between provisioning and installDepotDownload
        sendGameStatusUpdate.mockImplementation(
          (_deps: unknown, u: { status: string }) => {
            if (u.status === 'installing') throw new Error('boom')
          }
        )
        await expect(
          new SteamGame(APP_ID, steamTestDeps).install({} as any)
        ).rejects.toThrow('boom')
        expect(registry.has(APP_ID)).toBe(false)
        expect(leaseRelease).toHaveBeenCalledTimes(1)
      })

      it('CR-01: the provisioning controller stays registered when the depot run starts', async () => {
        const registry = wireControllers()
        let seen: boolean | undefined
        ;(downloadSteamDepots as jest.Mock).mockImplementation(() => {
          seen = registry.has(APP_ID)
          return Promise.resolve({ status: 'done' })
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(seen).toBe(true)
      })

      it('IN-03: a stale aborted controller is replaced', async () => {
        const registry = wireControllers()
        const stale = new AbortController()
        stale.abort()
        registry.set(APP_ID, stale)
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(createAbortController).toHaveBeenCalledWith(APP_ID)
        expect(result.status).toBe('done')
        expect(downloadSteamDepots).toHaveBeenCalled()
      })

      const order = () =>
        sendGameStatusUpdate.mock.calls.map(
          ([, u]: [unknown, { status: string; context?: string }]) =>
            u.context ? `${u.status}:${u.context}` : u.status
        )

      it('G21: CrossOver creation sends creating-bottle before provisioning and installing after', async () => {
        const seq: string[] = []
        sendGameStatusUpdate.mockImplementation((_deps: unknown, u) =>
          seq.push(`${u.status}:${u.context ?? ''}`)
        )
        ;(provisionBridgeBottle as jest.Mock).mockImplementation(() => {
          seq.push('provision')
          return Promise.resolve({ status: 'done' })
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        const create = seq.indexOf('engine-download:creating-bottle')
        expect(create).toBeGreaterThan(-1)
        expect(create).toBeLessThan(seq.indexOf('provision'))
        expect(seq.indexOf('installing:')).toBeGreaterThan(
          seq.indexOf('provision')
        )
      })

      it('G21: built-in path with the engine already installed sends creating-bottle then installing', async () => {
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        const seq = order()
        expect(seq.indexOf('engine-download:creating-bottle')).toBeGreaterThan(
          -1
        )
        expect(seq.indexOf('installing')).toBeGreaterThan(
          seq.indexOf('engine-download:creating-bottle')
        )
      })

      it('G21: built-in path with a download sends engine contexts, then creating-bottle, then installing', async () => {
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        mockEnsurePinnedEngine.mockImplementation((_pin, opts) => {
          opts.onProgress({
            phase: 'downloading',
            artifact: 'wine',
            percentage: 50
          })
          return Promise.resolve(ENGINE_OK)
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        const seq = order()
        const dl = seq.findIndex((o: string) =>
          o.startsWith('engine-download:downloading:')
        )
        const setup = seq.indexOf('engine-download:setting-up')
        const create = seq.indexOf('engine-download:creating-bottle')
        const installing = seq.indexOf('installing')
        expect(dl).toBeGreaterThan(-1)
        expect(setup).toBeGreaterThan(dl)
        expect(create).toBeGreaterThan(setup)
        expect(installing).toBeGreaterThan(create)
      })

      it('G21: a CrossOver create failure falling back to the built-in engine sends creating-bottle again', async () => {
        ;(provisionBridgeBottle as jest.Mock)
          .mockResolvedValueOnce({
            status: 'error',
            errorCode: 'crossover-create-failed',
            error: 'x'
          })
          .mockResolvedValueOnce({ status: 'done' })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(
          order().filter((o: string) => o === 'engine-download:creating-bottle')
        ).toHaveLength(2)
      })

      it('G21: a provisioning failure sends done before deferring to setup', async () => {
        ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'error',
          errorCode: 'other',
          error: 'boom'
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'done', deferredToSetup: true })
        const seq = order()
        const create = seq.indexOf('engine-download:creating-bottle')
        expect(seq.indexOf('done', create)).toBeGreaterThan(create)
        expect(seq).not.toContain('installing')
      })

      it('G21: an abort during provisioning sends done and never installing', async () => {
        wireControllers()
        ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'error',
          errorCode: 'provision-aborted',
          error: 'aborted'
        })
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        const seq = order()
        expect(seq).toContain('done')
        expect(seq).not.toContain('installing')
      })

      it('WR-02: a depot run leaves a newer install controller registered, and removes its own', async () => {
        const registry = wireControllers()
        let newer: AbortController | undefined
        ;(downloadSteamDepots as jest.Mock).mockImplementationOnce(() => {
          // a reinstall registers its provisioning controller during teardown
          newer = new AbortController()
          registry.set(APP_ID, newer)
          return Promise.resolve({ status: 'done' })
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(registry.get(APP_ID)).toBe(newer)
        expect(newer!.signal.aborted).toBe(false)
      })

      it('WR-02: a run whose own controller is still registered removes it (no leak)', async () => {
        const registry = wireControllers()
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(downloadSteamDepots).toHaveBeenCalled()
        expect(registry.has(APP_ID)).toBe(false)
      })

      it('WR-03: a cancel while waiting on a tearing-down prior run stops the install', async () => {
        const registry = wireControllers()
        let resolveFirst!: (v: { status: 'cancelled' }) => void
        ;(downloadSteamDepots as jest.Mock).mockReturnValueOnce(
          new Promise((resolve) => {
            resolveFirst = resolve
          })
        )
        const game = new SteamGame(APP_ID, steamTestDeps)
        const first = game.install({} as any)
        await flushAsync()
        expect(downloadSteamDepots).toHaveBeenCalledTimes(1)
        await game.stop()

        const second = new SteamGame(APP_ID, steamTestDeps).install({} as any)
        await flushAsync()
        // the cancel lands while the second install waits on the prior run
        registry.get(APP_ID)!.abort()
        resolveFirst({ status: 'cancelled' })
        await first
        const result = await second
        expect(result).toEqual({ status: 'abort' })
        expect(downloadSteamDepots).toHaveBeenCalledTimes(1)
      })

      it('WR-03: a signal aborted before the depot run registers nothing and starts no download', async () => {
        const registry = wireControllers()
        let abortedAtCall = false
        ;(provisionBridgeBottle as jest.Mock).mockImplementation(() => {
          return Promise.resolve({ status: 'done' })
        })
        // cancel lands between the provisioning stage and the depot hand-off
        sendGameStatusUpdate.mockImplementation(
          (_deps: unknown, u: { status: string }) => {
            if (u.status === 'installing' && !abortedAtCall) {
              abortedAtCall = true
              registry.get(APP_ID)!.abort()
            }
          }
        )
        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        expect(downloadSteamDepots).not.toHaveBeenCalled()
        expect(registry.has(APP_ID)).toBe(false)
      })

      it('an existing live appId controller is reused and left alone by the install', async () => {
        const controller = new AbortController()
        hasAbortController.mockReturnValue(true)
        getAbortSignal.mockReturnValue(controller.signal)
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(mockEnsurePinnedEngine.mock.calls[0][1].signal).toBe(
          controller.signal
        )
        // only the depot run registers or removes controllers, after provisioning
        const provisioned = at(
          (provisionBridgeBottle as jest.Mock).mock.invocationCallOrder,
          0
        )
        for (const m of [createAbortController, deleteAbortController]) {
          for (const order of m.mock.invocationCallOrder) {
            expect(order).toBeGreaterThan(provisioned)
          }
        }
      })

      it('CR-02: a no-CrossOver install runs the redists on buildFallbackGameSettings(bottle, engine)', async () => {
        const fallback = { wineVersion: { bin: '/engine/wine/bin/wine' } }
        ;(buildFallbackGameSettings as jest.Mock).mockReturnValue(fallback)
        ;(decideCreationEngine as jest.Mock).mockResolvedValue(pinnedDecision())
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(buildFallbackGameSettings).toHaveBeenCalledWith(
          steamTestDeps.paths,
          `GameLibSteamBridge-${APP_ID}`,
          expect.objectContaining({ wineBin: ENGINE_OK.paths.wineBin }),
          expect.anything()
        )
        expect(redistSettings()).toBe(fallback)
      })

      it('CR-02: a CrossOver-created bottle keeps the stock CrossOver settings for the redists', async () => {
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(buildFallbackGameSettings).not.toHaveBeenCalled()
        expect(redistSettings()).toEqual({
          wineCrossoverBottle: 'GameLibSteamBridge'
        })
      })

      it('CR-02: CrossOver create failed then fallback-created -> fallback settings', async () => {
        const fallback = { tag: 'fallback' }
        ;(buildFallbackGameSettings as jest.Mock).mockReturnValue(fallback)
        ;(provisionBridgeBottle as jest.Mock)
          .mockResolvedValueOnce({
            status: 'error',
            errorCode: 'crossover-create-failed',
            error: 'x'
          })
          .mockResolvedValueOnce({ status: 'done' })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(redistSettings()).toBe(fallback)
      })

      it('CR-02: an existing bottle with a pinned launch decision is prepared and gets fallback settings', async () => {
        const fallback = { tag: 'fallback' }
        const sel = {
          kind: 'pinned',
          reason: 'cx-expired',
          wineBin: '/engine/wine/bin/wine',
          wineserverBin: '/engine/wine/bin/wineserver',
          label: 'x',
          version: '1',
          dxvk: { dir: '/d', version: '2' }
        }
        ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
        ;(buildFallbackGameSettings as jest.Mock).mockReturnValue(fallback)
        ;(decideLaunchEngine as jest.Mock).mockResolvedValue({
          ...cxDecision(),
          selection: sel,
          preflight: { kind: 'expired' }
        })
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(mockPrepareBottleForEngine).toHaveBeenCalledWith(
          expect.objectContaining({ next: sel, crossoverHealthy: false })
        )
        expect(buildFallbackGameSettings).toHaveBeenCalledWith(
          steamTestDeps.paths,
          `GameLibSteamBridge-${APP_ID}`,
          sel,
          expect.anything()
        )
        expect(redistSettings()).toBe(fallback)
      })

      it('CR-02: an existing bottle on healthy CrossOver gets stock settings', async () => {
        ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
        await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(mockPrepareBottleForEngine).toHaveBeenCalledWith(
          expect.objectContaining({ crossoverHealthy: true })
        )
        expect(redistSettings()).toEqual({
          wineCrossoverBottle: 'GameLibSteamBridge'
        })
      })

      it('CR-02: an unavailable engine or a failed preparation skips the redists with a warning and the install still completes', async () => {
        ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
        ;(decideLaunchEngine as jest.Mock).mockResolvedValue({
          kind: 'unavailable',
          override: 'pinned',
          detail: 'not installed'
        })
        let result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result.status).toBe('done')
        expect(installSteamBridgeSharedRedists).not.toHaveBeenCalled()
        ;(decideLaunchEngine as jest.Mock).mockResolvedValue(cxDecision())
        mockPrepareBottleForEngine.mockResolvedValue({
          ok: false,
          reason: 'shared-bottle',
          detail: 'shared'
        })
        result = await new SteamGame(APP_ID, steamTestDeps).install({} as any)
        expect(result.status).toBe('done')
        expect(installSteamBridgeSharedRedists).not.toHaveBeenCalled()
        const { logWarning } = jest.requireMock('backend/logger')
        expect(
          (logWarning as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes('shared redists skipped: no usable engine')
          )
        ).toBe(true)
      })

      it.each([
        ['steamstub', 'steamclient-layer'],
        [undefined, 'tcp']
      ])(
        'WR-04 install writer: drmWrapper %s persists mode %s',
        async (wrapper, mode) => {
          const override = jest.requireMock<{
            __detectLaunchOverride: { fn?: (e: string) => unknown }
          }>('../bridge/drm/drmScanExe').__detectLaunchOverride
          override.fn = (exe: string) => ({ drmWrapper: wrapper, drmExe: exe })
          const spy = jest.spyOn(bridgeVerdictModule, 'writeBridgeModeVerdict')
          try {
            await new SteamGame(APP_ID, steamTestDeps).install({} as any)
            expect(spy).toHaveBeenCalledWith(steamTestDeps, APP_ID, mode)
          } finally {
            override.fn = undefined
            spy.mockRestore()
          }
        }
      )
    })

    it('other provisioning errors keep marking the bridge failed with the setup dialog', async () => {
      ;(provisionBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'error',
        error: 'boom'
      })
      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )
      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.objectContaining({ reason: 'bridge-bottle-provision-failed' })
      )
    })

    describe('59-29 CR-02: a cancelled bridge download does not poison the session', () => {
      const CR02_APP_ID = APP_ID
      beforeEach(() => {
        library.set(CR02_APP_ID, makeEntry({ title: 'Cancel Test' }))
        ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      })

      it('CR-02: an aborted depot download does not mark the bridge failed', async () => {
        ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
          status: 'cancelled'
        })
        const result = await new SteamGame(CR02_APP_ID, steamTestDeps).install(
          {} as any
        )
        expect(result).toEqual({ status: 'abort' })
        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamBridgeSetupRequired',
          expect.anything()
        )
      })

      // installBridgeGame is the only route that asks whether the bridge
      // bottle is ready; the bottled branch never does (see Plan 13 above).
      it('CR-02: reinstall after an aborted depot download routes to the bridge', async () => {
        ;(downloadSteamDepots as jest.Mock).mockResolvedValueOnce({
          status: 'cancelled'
        })
        await new SteamGame(CR02_APP_ID, steamTestDeps).install({} as any)
        ;(isBridgeBottleReady as jest.Mock).mockClear()
        ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
          status: 'done'
        })
        await new SteamGame(CR02_APP_ID, steamTestDeps).install({} as any)
        expect(isBridgeBottleReady).toHaveBeenCalled()
      })

      it('CR-02: a depot error still marks the bridge failed', async () => {
        ;(downloadSteamDepots as jest.Mock).mockResolvedValueOnce({
          status: 'error',
          error: 'boom'
        })
        await new SteamGame(CR02_APP_ID, steamTestDeps).install({} as any)
        ;(isBridgeBottleReady as jest.Mock).mockClear()
        ;(downloadSteamDepots as jest.Mock).mockResolvedValue({
          status: 'done'
        })
        await new SteamGame(CR02_APP_ID, steamTestDeps).install({} as any)
        expect(isBridgeBottleReady).not.toHaveBeenCalled()
      })
    })
  })

  it('Plan 13 (D-51-08): isBridgeEligible() is false when knownBadReason is non-null, and once noticeAcknowledgedFor matches the reason install() goes straight to the bottled branch with NO notice', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(
      'drm-wrapped'
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { noticeAcknowledgedFor: 'known-bad' }
    })
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(isBridgeBottleReady).not.toHaveBeenCalled()
    expect(downloadSteamDepots).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        os: 'windows',
        targetSteamappsDir: '/mock/bottle/steamapps'
      })
    )
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeRouteNotice',
      expect.anything()
    )
  })

  it('finding #3 (fallback bypass): after markBridgeFailedThisSession(appId), install() routes to the bottled path despite the appId being allowlisted + bottle-eligible', async () => {
    // A dedicated appId — never reused elsewhere in this file — so this
    // test's markBridgeFailedThisSession() mutation of the module-scoped
    // bridgeFailedThisSession Set cannot leak into any other test.
    const FALLBACK_TEST_APP_ID = '999999'
    library.set(FALLBACK_TEST_APP_ID, makeEntry({ title: 'Fallback Test' }))
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)

    markBridgeFailedThisSession(FALLBACK_TEST_APP_ID)

    const game = new SteamGame(FALLBACK_TEST_APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(provisionBridgeBottle).not.toHaveBeenCalled()
    // The bottled fallback downloads into the Phase 17 bottle, never the
    // bridge bottle (no depot download targets the bridge steamapps dir).
    expect(downloadSteamDepots).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetSteamappsDir: BRIDGE_STEAMAPPS_DIR })
    )
    expect(downloadSteamDepots).toHaveBeenCalledWith(
      FALLBACK_TEST_APP_ID,
      expect.objectContaining({
        os: 'windows',
        targetSteamappsDir: '/mock/bottle/steamapps'
      })
    )
    expect(result).toEqual({ status: 'done' })
  })

  it("a title with userRoute 'bottle' takes the existing bottled branch regardless of seed/pending-scan default (D-51-07, resolveBridgeRoute rule 3)", async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { userRoute: 'bottle' }
    })
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(isBridgeBottleReady).not.toHaveBeenCalled()
    // The bottled fallback downloads into the Phase 17 bottle, never the
    // bridge bottle (no depot download targets the bridge steamapps dir).
    expect(downloadSteamDepots).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ targetSteamappsDir: BRIDGE_STEAMAPPS_DIR })
    )
    expect(downloadSteamDepots).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        os: 'windows',
        targetSteamappsDir: '/mock/bottle/steamapps'
      })
    )
    expect(result).toEqual({ status: 'done' })
  })

  it('a persisted scan-miss whose missingSymbols are now ALL covered is auto-cleared (steamMetadataStore.set observed with scan removed) and install() routes to the bridge (D-51-07)', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: {
        scan: {
          status: 'miss',
          arch: 'x86',
          // SteamAPI_Init is in SHIM_EXPORTED_SYMBOLS (shimCoverage.ts) --
          // a persisted miss naming it is "now covered" by the current shim.
          missingSymbols: ['SteamAPI_Init'],
          interfaceVersions: {},
          stubbedInterfaces: [],
          shimExportSetVersion: 'stale-version',
          scannedAt: '2026-01-01T00:00:00.000Z'
        }
      }
    })
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    const clearCall = (steamMetadataStore.set as jest.Mock).mock.calls.find(
      ([id, value]) =>
        id === APP_ID &&
        value &&
        typeof value === 'object' &&
        'bridge' in value &&
        value.bridge &&
        !('scan' in value.bridge)
    )
    expect(clearCall).toBeDefined()
  })
})

// ── 34.13-06 (D-17): SteamGame.install() Windows-via-bottle override ────────
//
// The regression trap this block exists to avoid (34.13-PLAN-OUTLINE.md note
// 2): installSteamGame() hardcodes platformToInstall: 'Windows' for EVERY
// Steam install, and the Steam backend reads that field nowhere. Every
// pre-existing install() spec in this file calls game.install({} as any) —
// an EMPTY args object, so {}.platformToInstall is undefined and those specs
// are structurally blind to a naive platformToInstall-keyed implementation:
// it would pass all of them while flipping every real mac-native install
// into the bottle. This block's baseline specs use PRODUCTION_ARGS
// (platformToInstall: 'Windows' present, matching every real Steam install)
// specifically to close that blind spot.
describe('SteamGame.install() — D-17 Windows-via-bottle override (34.13-06)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  let envMock: any

  // Transcribed field-for-field from installSteamGame()'s window.api.install
  // literal (InstallGameModal.ts) — the production call shape for EVERY
  // Steam install. Deliberately carries NO steamForceWindowsViaBottle key;
  // argsWith() below is the only place a spec adds it.
  const PRODUCTION_ARGS: InstallParams = {
    appName: APP_ID,
    path: '',
    runner: 'steam',
    installDlcs: [],
    sdlList: [],
    installLanguage: 'en-US',
    platformToInstall: 'Windows',
    gameInfo: makeEntry()
  }

  function argsWith(overrides: Partial<InstallParams> = {}): InstallParams {
    return { ...PRODUCTION_ARGS, ...overrides }
  }

  /** Spies on all three private-method terminals install() can reach, each
   * resolving { status: 'done' } like a real success — so a spec only has
   * to name the ONE terminal it expects, via assertExactlyOneRoute(). */
  function spyOnAllTerminals(_game: SteamGame): {
    installBridgeGame: jest.SpyInstance
    installBottleNative: jest.SpyInstance
    installNative: jest.SpyInstance
  } {
    const installBridgeGame = trackSpy(
      jest.spyOn(gameInstallBridgeModule, 'installBridgeGame')
    ).mockResolvedValue({ status: 'done' } as any)
    const installBottleNative = trackSpy(
      jest.spyOn(gameInstallDepot, 'installBottleNative')
    ).mockResolvedValue({ status: 'done' } as any)
    const installNative = trackSpy(
      jest.spyOn(gameInstallDepot, 'installNative')
    ).mockResolvedValue({ status: 'done' } as any)
    // Module spies are shared across calls within a test (instance spies were
    // fresh per game), so start every call from a clean count.
    installBridgeGame.mockClear()
    installBottleNative.mockClear()
    installNative.mockClear()
    return { installBridgeGame, installBottleNative, installNative }
  }

  type Terminal =
    | 'bridge'
    | 'deferred-to-setup'
    | 'bottle-native'
    | 'native-depot'
    | 'native-protocol'

  /** The load-bearing regression guard: asserts the ONE expected terminal
   * fired AND that none of the other five did. A helper that only checks
   * the positive terminal cannot catch a routing change that fires two
   * terminals, or the wrong one — the negative half is the entire point. */
  function assertExactlyOneRoute(
    expected: Terminal,
    terminals: ReturnType<typeof spyOnAllTerminals>
  ): void {
    const fired: Record<Terminal, boolean> = {
      bridge: terminals.installBridgeGame.mock.calls.length > 0,
      'bottle-native': terminals.installBottleNative.mock.calls.length > 0,
      'native-depot': terminals.installNative.mock.calls.length > 0,
      'native-protocol': shellOpenExternal.mock.calls.some(
        (call) => call[0] === `steam://install/${APP_ID}`
      ),
      'deferred-to-setup': sendFrontendMessage.mock.calls.some(
        (call) => call[0] === 'steamBottleSetupRequired'
      )
    }
    ;(Object.keys(fired) as Terminal[]).forEach((key) => {
      expect(fired[key]).toBe(key === expected)
    })
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset()
    // Native-install ON/OFF is a routing axis in this block — every spec
    // sets it explicitly below rather than relying on resetMocks' implicit
    // undefined/false default, so it is never an accidental coupling.
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  // ── Override-ABSENT baseline: today's routing, byte-identical ───────────

  it('B1: macOS mac-native game with a proven Windows depot NOT chosen — native install() unchanged', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('B2: macOS not-yet-captured game — native install() unchanged (D-11 BLOCKER invariant)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('B3: macOS bottle-eligible, provisioned — dispatches to the bottled Steam client', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      // D-51-09: a non-seed, never-scanned, bottle-eligible title now
      // defaults to the bridge route (rule 11, pending-scan) -- this
      // describe block's B1-B4/F-series specs pin specific OTHER
      // routing axes (native-install toggle, bottle readiness), so pin
      // the bridge axis too via userRoute:'bottle' (rule 3) rather than
      // relying on the obsolete default.
      bridge: { userRoute: 'bottle' }
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('bottle-native', terminals)
  })

  it('B4: macOS bottle-eligible, un-provisioned — defers to guided setup', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      // D-51-09: pin the bottle route (see B3's identical note).
      bridge: { userRoute: 'bottle' }
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    const result = await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('deferred-to-setup', terminals)
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('B5: macOS bottle-eligible + allowlisted — routes to the bridge', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('bridge', terminals)
  })

  it('B6: macOS mac-native, native install opt-in ON — non-bottle depot-download opt-in unaffected', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-depot', terminals)
  })

  it('B7: non-mac host — native install() unchanged regardless of eligibility signal', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)

    assertExactlyOneRoute('native-protocol', terminals)
  })

  // ── Override-PRESENT positive routing ────────────────────────────────────

  /** quick 261107-lum: the forced-Windows install resolves the normal bridge
   * verdict. A never-scanned non-seed title lands on 'pending-scan', which
   * runs the pre-install prescreen -- so the lease and screen are mocked. */
  function arrangeForcedBridge(
    meta: Record<string, unknown> = {},
    knownBad: string | null = null
  ) {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      ...meta
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(knownBad)
    isBottleReady.mockReturnValue(true)
    ;(prescreenBridgeDepots as jest.Mock).mockReset()
    ;(prescreenBridgeDepots as jest.Mock).mockResolvedValue('unknown')
    jest
      .mocked(steamUser.acquireAuthenticated)
      .mockImplementation(() =>
        Promise.resolve({ ok: true, client: {}, release: jest.fn() } as never)
      )
  }

  it('F1: quick 261107-lum — mac-native + proven Windows depot + override routes through the bridge verdict (pending-scan prescreen, then installBridgeGame)', async () => {
    arrangeForcedBridge()

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    // Contrast with B1 above — the identical fixture minus the override,
    // which routes 'native-protocol'. F1 and B1 differ in exactly one key:
    // proof the override is the operative input, not the fixture shape.
    assertExactlyOneRoute('bridge', terminals)
    expect(terminals.installBridgeGame).toHaveBeenCalledTimes(1)
    expect(prescreenBridgeDepots).toHaveBeenCalledTimes(1)
  })

  it('F2: quick 261107-lum — an un-provisioned GameLibSteam bottle does not block a bridge-routed forced install', async () => {
    arrangeForcedBridge()
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('bridge', terminals)
    expect(
      sendFrontendMessage.mock.calls.some(
        (c) => c[0] === 'steamBottleSetupRequired'
      )
    ).toBe(false)
  })

  it("F10: override + persisted userRoute 'bottle' — the old D-17 bottled path is the verdict's own fallback, and it marks the forced flag", async () => {
    arrangeForcedBridge({ bridge: { userRoute: 'bottle' } })
    const markSpy = jest.spyOn(gamesModule, 'markForcedWindowsViaBottle')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('bottle-native', terminals)
    expect(markSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    markSpy.mockRestore()
  })

  it("F11: override + drm-wrapped known-bad (acknowledged) reroutes to bottled Steam; 'does-not-run' stays on the bridge", async () => {
    arrangeForcedBridge(
      { bridge: { noticeAcknowledgedFor: 'known-bad' } },
      'drm-wrapped'
    )
    let game = new SteamGame(APP_ID, steamTestDeps)
    let terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    assertExactlyOneRoute('bottle-native', terminals)
    sendFrontendMessage.mockClear()
    arrangeForcedBridge(
      { bridge: { noticeAcknowledgedFor: 'known-bad' } },
      'does-not-run'
    )
    game = new SteamGame(APP_ID, steamTestDeps)
    terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    expect(terminals.installBridgeGame).toHaveBeenCalledTimes(1)
    expect(terminals.installBottleNative).not.toHaveBeenCalled()
  })

  it('F12: forced bridge install marks the forced flag only on a completed (non-deferred, done) result', async () => {
    const markSpy = jest.spyOn(gamesModule, 'markForcedWindowsViaBottle')
    const cases: Array<[any, boolean]> = [
      [{ status: 'done' }, true],
      [{ status: 'error', error: 'x' }, false],
      [{ status: 'done', deferredToSetup: true }, false]
    ]
    for (const [result, expectMarked] of cases) {
      markSpy.mockClear()
      arrangeForcedBridge()
      const game = new SteamGame(APP_ID, steamTestDeps)
      const terminals = spyOnAllTerminals(game)
      terminals.installBridgeGame.mockResolvedValue(result)
      await game.install(argsWith({ steamForceWindowsViaBottle: true }))
      expect(terminals.installBridgeGame).toHaveBeenCalledTimes(1)
      if (expectMarked) {
        expect(markSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
      } else {
        expect(markSpy).not.toHaveBeenCalled()
      }
    }
    markSpy.mockRestore()
  })

  it('F13: a route notice raised during a forced install replays forceWindowsViaBottle; the same notice without the override has no such key', async () => {
    // unacknowledged does-not-run known-bad -> bridge route with a notice
    arrangeForcedBridge({}, 'does-not-run')
    let game = new SteamGame(APP_ID, steamTestDeps)
    let terminals = spyOnAllTerminals(game)
    const forced = await game.install(
      argsWith({ steamForceWindowsViaBottle: true })
    )
    expect(forced).toEqual({ status: 'done', deferredToSetup: true })
    expect(terminals.installBridgeGame).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBridgeRouteNotice',
      expect.objectContaining({
        appName: APP_ID,
        route: 'bridge',
        forceWindowsViaBottle: true
      })
    )

    // Same notice WITHOUT the override: bottle-eligible fixture (no override
    // needed), exact payload, no forceWindowsViaBottle key.
    sendFrontendMessage.mockClear()
    arrangeForcedBridge({ is_mac_native: false }, 'does-not-run')
    game = new SteamGame(APP_ID, steamTestDeps)
    terminals = spyOnAllTerminals(game)
    await game.install(PRODUCTION_ARGS)
    const noticeCall = sendFrontendMessage.mock.calls.find(
      (c) => c[0] === 'steamBridgeRouteNotice'
    )
    expect(noticeCall).toBeDefined()
    expect(noticeCall![1]).not.toHaveProperty('forceWindowsViaBottle')
  })

  it('F14: CrossOver missing does not block a bridge-routed forced install (the gate only stops non-bridge routes)', async () => {
    arrangeForcedBridge()
    crossoverInstalled.mockReturnValue(false)
    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    assertExactlyOneRoute('bridge', terminals)
  })

  it('F3: native install opt-in ON — a forced game with a user-forced bottle verdict depot-downloads into the BOTTLE, not the host', async () => {
    arrangeForcedBridge({ bridge: { userRoute: 'bottle' } })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('bottle-native', terminals)
  })

  it('F8: additive, never subtractive — an ALREADY bottle-eligible game with the override set is unchanged from B3', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      // D-51-09: pin the bottle route (see B3's identical note).
      bridge: { userRoute: 'bottle' }
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    // The override is an OR; it can never remove a game from the bottle
    // path — this is byte-identical to B3's outcome.
    assertExactlyOneRoute('bottle-native', terminals)
  })

  // ── Containment: a hostile or malformed override cannot reach the bottle ─

  it('F4: Deferred Idea — no proven Windows depot (is_windows_native: false) falls through, logged', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: false
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)
    const { logWarning } = jest.requireMock('backend/logger')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('native-protocol', terminals)
    expect(logWarning).toHaveBeenCalled()
  })

  it('F5: Deferred Idea — never-captured depot signal (is_windows_native absent) falls through', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
      // is_windows_native deliberately absent — the pre-34.13 cache-entry
      // shape every existing user has on upgrade. undefined and false are
      // distinct upgrade realities, kept as separate specs (F4/F5).
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('F6: host containment — non-mac hosts (Linux and Windows) never reach the bottle even with a proven depot + override', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)

    // Pass 1: Linux host.
    envMock.isMac = false
    envMock.isLinux = true
    envMock.isWindows = false
    let game = new SteamGame(APP_ID, steamTestDeps)
    let terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    assertExactlyOneRoute('native-protocol', terminals)

    // Pass 2: Windows host — both non-mac hosts covered, not one assumed
    // from the other.
    envMock.isMac = false
    envMock.isLinux = false
    envMock.isWindows = true
    game = new SteamGame(APP_ID, steamTestDeps)
    terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))
    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('F7: value contract — an explicit false override is byte-identical to B1 (only === true has any effect)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })
    ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: false }))

    assertExactlyOneRoute('native-protocol', terminals)
  })

  it('F9: quick 261107-lum — an allowlisted (seed) title with the override routes to the bridge, no prescreen', async () => {
    arrangeForcedBridge()
    // quick 261107-lum: the forced-Windows choice feeds the bridge route
    // input, so a seed title resolves the seed row and dispatches the bridge.
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const terminals = spyOnAllTerminals(game)
    await game.install(argsWith({ steamForceWindowsViaBottle: true }))

    assertExactlyOneRoute('bridge', terminals)
    expect(terminals.installBottleNative).not.toHaveBeenCalled()
    expect(prescreenBridgeDepots).not.toHaveBeenCalled()
  })
})

// ── D-17 forced-verdict durability (34.13-14) ────────────────────────────────
//
// 34.13-06 taught install() to honor args.steamForceWindowsViaBottle for a
// single install call — but never persisted the verdict, so getSettings(),
// isNative(), launch(), uninstall() and checkBottleEligibility() stayed
// unaware of a forced install after it returned (T-34.13-06-06). This block
// characterizes what "durable" means across all six consumers before any
// source is touched (Task 1), then Task 2 appends the write-discipline
// (W-series) specs once the persisted verdict and widened predicate exist.

describe('SteamGame — D-17 forced-verdict durability (34.13-14)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance

  let envMock: any

  /** A game whose persisted entry WAS forced into the bottle by a prior
   * successful D-17 override install (34.13-06) — the shape this plan makes
   * durable. */
  function forcedMeta(overrides: Record<string, unknown> = {}) {
    return {
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      forcedWindowsViaBottle: true,
      ...overrides
    }
  }

  /** The pre-34.13 upgrade shape: the field has never existed on this cache
   * entry at all — deliberately does NOT set forcedWindowsViaBottle to any
   * value. `undefined` (absent) and `false` (explicit, see explicitFalseMeta
   * below) are different upgrade realities; a single merged fixture cannot
   * distinguish them. */
  function unforcedMeta(overrides: Record<string, unknown> = {}) {
    return {
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      ...overrides
    }
  }

  /** A cache entry that explicitly stores forcedWindowsViaBottle: false —
   * pins that only === true re-routes; a stored false must never be treated
   * as a truthiness accident. */
  function explicitFalseMeta(overrides: Record<string, unknown> = {}) {
    return {
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      forcedWindowsViaBottle: false,
      ...overrides
    }
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    startUninstallPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    // Routing axes for this block — reset explicitly per spec rather than
    // relying on resetMocks' implicit undefined/false default.
    isBottleReady.mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    getSteamBottleSettings.mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  // ── D1-D6: durability discriminators, all against forcedMeta() ──────────

  it('D1: getSettings() resolves the bottle settings for a forced game, never GameConfig.get', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    const bottleSettings = { wineCrossoverBottle: 'GameLibSteam' }
    getSteamBottleSettings.mockReturnValue(bottleSettings)
    const gameConfigGetMock = jest.requireMock('backend/game_config').GameConfig
      .get as jest.Mock
    gameConfigGetMock.mockClear()

    const game = new SteamGame(APP_ID, steamTestDeps)
    const settings = await game.getSettings()

    expect(settings).toBe(bottleSettings)
    expect(gameConfigGetMock).not.toHaveBeenCalled()
  })

  it('getSettings() for a bottle-eligible game carries its own engine override (59-UAT G11)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    const readStored = jest.requireMock('../engine/steamEngineDeps')
      .readSteamEngineOverride as jest.Mock
    readStored.mockReturnValueOnce('pinned:wine-staging-11.20')

    const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()

    expect(settings).toEqual({
      wineCrossoverBottle: 'GameLibSteam',
      engineOverride: 'pinned:wine-staging-11.20',
      steamEngineOverride: 'pinned:wine-staging-11.20'
    })
  })

  describe('getSettings() overlay override (60-UAT G3, same split as 59-UAT G11)', () => {
    const storedOverlay = () =>
      jest.requireMock('../bridge/overlay/overlayPolicy')
        .__readStoredOverlayOverrideMock as jest.Mock
    const storedEngine = () =>
      jest.requireMock('../engine/steamEngineDeps')
        .readSteamEngineOverride as jest.Mock
    beforeEach(() => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
      getSteamBottleSettings.mockReturnValue({
        wineCrossoverBottle: 'GameLibSteam'
      })
    })

    it('a bottle-eligible game carries its own overlay override', async () => {
      storedOverlay().mockReturnValueOnce('off')
      const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()
      expect(settings).toEqual({
        wineCrossoverBottle: 'GameLibSteam',
        steamOverlayOverride: 'off'
      })
    })

    it('carries both overrides when both are stored', async () => {
      storedEngine().mockReturnValueOnce('pinned:wine-staging-11.20')
      storedOverlay().mockReturnValueOnce('on')
      const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()
      expect(settings).toEqual({
        wineCrossoverBottle: 'GameLibSteam',
        engineOverride: 'pinned:wine-staging-11.20',
        steamEngineOverride: 'pinned:wine-staging-11.20',
        steamOverlayOverride: 'on'
      })
    })

    it.each(['automatic', undefined, 'garbage', 42])(
      'omits the key for a stored %p',
      async (value) => {
        storedOverlay().mockReturnValueOnce(value)
        const settings = await new SteamGame(
          APP_ID,
          steamTestDeps
        ).getSettings()
        expect(settings).not.toHaveProperty('steamOverlayOverride')
      }
    )
  })

  describe('getSettings() per-title keys (todo 2026-11-04 read/write split)', () => {
    const storedTitle = () =>
      jest.requireMock('../titleSettings')
        .__readStoredTitleConfigMock as jest.Mock
    const storedOverlay = () =>
      jest.requireMock('../bridge/overlay/overlayPolicy')
        .__readStoredOverlayOverrideMock as jest.Mock
    const storedEngine = () =>
      jest.requireMock('../engine/steamEngineDeps')
        .readSteamEngineOverride as jest.Mock
    beforeEach(() => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
      getSteamBottleSettings.mockReturnValue({
        wineCrossoverBottle: 'GameLibSteam'
      })
    })

    const VALUES: Record<(typeof TITLE_AUTHORITATIVE_KEYS)[number], unknown> = {
      launcherArgs: '-novid',
      targetExe: 'C:\\Game\\alt.exe',
      enviromentOptions: [{ key: 'A', value: '1' }],
      wrapperOptions: [{ exe: 'w', args: '' }],
      beforeLaunchScriptPath: '/s/before.sh',
      afterLaunchScriptPath: '/s/after.sh',
      language: 'de',
      verboseLogs: true,
      showFps: true,
      showMangohud: true,
      lastUsedLaunchOption: { type: 'basic', name: 'x', parameters: '-y' }
    }

    it.each(TITLE_AUTHORITATIVE_KEYS.map((k) => [k]))(
      'carries the stored %s',
      async (key) => {
        storedTitle().mockReturnValueOnce({ [key]: VALUES[key] })
        const settings = await new SteamGame(
          APP_ID,
          steamTestDeps
        ).getSettings()
        expect(settings).toEqual({
          wineCrossoverBottle: 'GameLibSteam',
          [key]: VALUES[key]
        })
      }
    )

    it('a stale wine/prefix/bottle in the title file never wins', async () => {
      getSteamBottleSettings.mockReturnValue({
        wineCrossoverBottle: 'GameLibSteam',
        wineVersion: { name: 'bottle' },
        winePrefix: '/bottle'
      })
      storedTitle().mockReturnValueOnce({
        wineVersion: { name: 'stale' },
        winePrefix: '/stale',
        wineCrossoverBottle: 'OldBottle',
        launcherArgs: '-a'
      })
      const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()
      expect(settings).toEqual({
        wineCrossoverBottle: 'GameLibSteam',
        wineVersion: { name: 'bottle' },
        winePrefix: '/bottle',
        launcherArgs: '-a'
      })
    })

    it('a key absent from the title file keeps the bottle/global value', async () => {
      getSteamBottleSettings.mockReturnValue({
        wineCrossoverBottle: 'GameLibSteam',
        launcherArgs: '-global'
      })
      storedTitle().mockReturnValueOnce({ language: 'de' })
      const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()
      expect(settings).toMatchObject({
        launcherArgs: '-global',
        language: 'de'
      })
    })

    it('the title value beats the bottle/global value', async () => {
      getSteamBottleSettings.mockReturnValue({
        wineCrossoverBottle: 'GameLibSteam',
        launcherArgs: '-global'
      })
      storedTitle().mockReturnValueOnce({ launcherArgs: '-title' })
      const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()
      expect(settings).toMatchObject({ launcherArgs: '-title' })
    })

    it('merges engine, overlay and a title key together', async () => {
      storedEngine().mockReturnValueOnce('pinned:wine-staging-11.20')
      storedOverlay().mockReturnValueOnce('on')
      storedTitle().mockReturnValueOnce({ showFps: true })
      const settings = await new SteamGame(APP_ID, steamTestDeps).getSettings()
      expect(settings).toEqual({
        wineCrossoverBottle: 'GameLibSteam',
        engineOverride: 'pinned:wine-staging-11.20',
        steamEngineOverride: 'pinned:wine-staging-11.20',
        steamOverlayOverride: 'on',
        showFps: true
      })
    })
  })

  it('D2: isNative() is false for a forced game — launcher.ts must run checkWineBeforeLaunch', () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(false)
  })

  it('D3: launch() dispatches to the bottled Steam client, never steam://rungameid', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    isBottleReady.mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    // The load-bearing negative half: steam://rungameid reaching the host
    // Steam client is the exact defect T-34.13-06-06 closes.
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(true)
  })

  it('D4 (debug/steam-bottle-uninstall-reverts FINAL): uninstall() routes a forced-bottle game to direct deletion — never tellBottledSteamToUninstall, never steam://uninstall', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    isBottleReady.mockReturnValue(true)
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
    // debug/steam-bottle-uninstall-reverts (routing fix): the library
    // entry's own install_path is now the routing source of truth.
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        install: { install_path: '/mock/bottle/steamapps/common/Dota 2' }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(acfState, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: '/mock/bottle/steamapps/common/Dota 2'
      })
    const pollUninstallOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    // The delegated path's own bottle-scoped poller is never started —
    // direct deletion completes synchronously via pollUninstallOnce above.
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  // D5 is split into two independent specs (launch/uninstall halves) rather
  // than one `it()` with two assertions, so a mutation that only breaks ONE
  // half is observable in the test report instead of being masked by jest
  // stopping at the first failing expectation inside a single test.

  it('D5a: a forced+allowlisted game never enters the Phase 24 bridge on launch() — currently a VACUOUS pass, see Task 2', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    // The forced bits live in the Phase 17 GameLibSteam bottle; the Phase 24
    // GameLibSteamBridge bottle is a different filesystem root that has
    // never held them — bridging a forced+allowlisted title would swap one
    // broken launch for another, not fix anything.
    //
    // VACUITY (pre-Task-2): isBridgeEligible() composes isBottleEligible(),
    // which is false for this mac-native fixture until Task 2 persists the
    // forced verdict — so the entire bottle block (bridge sub-check
    // included) is unreachable and this spy is never called for the wrong
    // reason (nothing routes there at all, not because containment
    // engaged). Task 2 re-proves this non-vacuously by reverting the bridge
    // pin and observing this spec fail.
    const launchGame = new SteamGame(APP_ID, steamTestDeps)

    const launchBridgeSpy = trackSpy(
      jest.spyOn(gameBridgeLaunchGateModule, 'launchBridgeGame')
    ).mockResolvedValue(true as any)
    await launchGame.launch({} as any)
    expect(launchBridgeSpy).not.toHaveBeenCalled()
  })

  it('D5c: quick 261107-lum — a forced game whose bits live in a bridge bottle launches through the bridge, never steam://rungameid', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)
    // findBridgeInstallBottle (test double) reports GameLibSteamBridge-<appId>.
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const launchGame = new SteamGame(APP_ID, steamTestDeps)
    const launchBridgeSpy = trackSpy(
      jest.spyOn(gameBridgeLaunchGateModule, 'launchBridgeGame')
    ).mockResolvedValue(true as any)
    await launchGame.launch({} as any)

    expect(launchBridgeSpy).toHaveBeenCalledTimes(1)
    const { shell } = hostFakes
    expect(
      shell.openExternal.mock.calls.some((c) =>
        String(c[0]).startsWith('steam://rungameid')
      )
    ).toBe(false)
  })

  it('D5b: a forced+allowlisted game never enters the Phase 24 bridge on uninstall() — currently a VACUOUS pass, see Task 2', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    isBottleReady.mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })
    // debug/steam-bottle-uninstall-reverts FINAL: uninstall() now always
    // reaches uninstallBottleGameDirectly()'s readAcfState('bottle') call
    // (never tellBottledSteamToUninstall), which unconditionally resolves
    // getSteamBottleSettings() before it can even determine the manifest is
    // absent — needs a return value here or the real (unmocked)
    // readAcfState throws destructuring undefined.
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })

    // Same rationale as D5a, mirrored for the uninstall() bridge sub-check
    // — the bridge composition is consulted independently by each caller.
    const uninstallGame = new SteamGame(APP_ID, steamTestDeps)

    // 65-13: uninstallBridgeGame is now a free function called from inside
    // gameUninstall.ts, so a method spy can no longer intercept it. Observe
    // the bridge branch through its first collaborator instead: the bridge
    // uninstall always removes the per-game bottle through
    // removePerGameBridgeBottle, which must stay untouched here.
    await uninstallGame.uninstall({} as any)
    expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
  })

  it('D6: checkBottleEligibility() resolves true for a forced game', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(checkBottleEligibility(game)).resolves.toBe(true)
  })

  // ── N1-N3: fail-safe baselines — must pass BEFORE and AFTER Task 2 ───────

  it('N1: absent flag (pre-34.13 upgrade shape) routes exactly as it does today', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(unforcedMeta())
    const gameConfigGetMock = jest.requireMock('backend/game_config').GameConfig
      .get as jest.Mock
    gameConfigGetMock.mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue({ autoSyncSaves: false })
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)
    await game.getSettings()
    expect(gameConfigGetMock).toHaveBeenCalledWith(APP_ID)

    const launchResult = await game.launch({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
    expect(launchResult).toBe(true)

    // debug/steam-bottle-uninstall-reverts (routing fix): the library
    // entry's own install_path is now the routing source of truth — give it
    // one resolving inside a mocked native library for the uninstall() half.
    // resolveInstallRoot() also consults the bottle root first (isMac=true
    // in this describe) — production getSteamBottleSettings() always
    // returns a valid object, so mock it the same way rather than leave it
    // unmocked-undefined.
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )

    shellOpenExternal.mockClear()
    await game.uninstall({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })

  it('N2: explicit false is byte-identical to N1 — only === true re-routes', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(explicitFalseMeta())

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)

    await game.launch({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })

  it('N3: a persisted flag can never resurrect a bottle path on a non-mac host (D-18)', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(forcedMeta())

    const game = new SteamGame(APP_ID, steamTestDeps)
    expect(game.isNative()).toBe(true)

    await game.launch({} as any)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
    expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
  })

  // ── W1-W7: write discipline — the verdict is written ONLY on a committed
  // forced install, and survives a metadata re-fetch (Task 2) ─────────────

  describe('write discipline (W1-W7)', () => {
    // Transcribed field-for-field from 34.13-06's own local copy (which is
    // itself transcribed from installSteamGame()'s window.api.install
    // literal) — deliberately re-declared here rather than imported across
    // describes, per this plan's own instruction.
    const PRODUCTION_ARGS: InstallParams = {
      appName: APP_ID,
      path: '',
      runner: 'steam',
      installDlcs: [],
      sdlList: [],
      installLanguage: 'en-US',
      platformToInstall: 'Windows',
      gameInfo: makeEntry()
    }

    function argsWith(overrides: Partial<InstallParams> = {}): InstallParams {
      return { ...PRODUCTION_ARGS, ...overrides }
    }

    /** Stateful steamMetadataStore double — .get() reflects the last .set()
     * call, so a write-discipline spec can inspect the FINAL persisted
     * entry after install() returns, not just whether .set() was called
     * (a bare-set implementation could call .set() and still fail the
     * neighboring-field-survival assertion in W1). Shape lifted from the
     * ensurePlatformsCaptured/checkBottleEligibility describes' local copy
     * — not imported across describes, per this plan's own instruction. */
    function mockStatefulMetadataStore(initial: Record<string, unknown>) {
      let state: Record<string, unknown> | undefined = initial
      ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
      ;(steamMetadataStore.set as jest.Mock).mockImplementation((_id, meta) => {
        state = meta
      })
    }

    let startInstallPollingSpy: jest.SpyInstance

    beforeEach(() => {
      startInstallPollingSpy = jest
        .spyOn(installPollingModule, 'startInstallPolling')
        .mockImplementation(() => {})
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReset()
    })

    afterEach(() => {
      startInstallPollingSpy.mockRestore()
    })

    // ── 34.13 review A-09 / A-14 ─────────────────────────────────────────
    // Both defects were re-raised because the iteration-2 skip rationale
    // ("games.ts is fenced") expired one commit later. Neither is observable
    // through install(), because install() only reaches this writer on a path
    // that guarantees an entry exists — which is exactly the point of the
    // first one. Drive the exported functions directly.

    it('A-14a: markForcedWindowsViaBottle REFUSES to fabricate an entry when none exists', () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
      ;(steamMetadataStore.set as jest.Mock).mockClear()

      markForcedWindowsViaBottle(steamTestDeps, APP_ID)

      // The pre-fix shape wrote `{ art_cover:'', art_square:'', extra:{reqs:[]},
      // forcedWindowsViaBottle: true }` — an entry with NO platformsCaptured,
      // i.e. strictly worse than the missing read it compensated for.
      expect(steamMetadataStore.set as jest.Mock).not.toHaveBeenCalled()
    })

    it('A-14a: markForcedWindowsViaBottle still writes when an entry DOES exist (discriminator)', () => {
      mockStatefulMetadataStore({
        art_cover: 'https://cdn/570/header.jpg',
        platformsCaptured: true
      })
      ;(steamMetadataStore.set as jest.Mock).mockClear()

      markForcedWindowsViaBottle(steamTestDeps, APP_ID)

      expect(steamMetadataStore.set as jest.Mock).toHaveBeenCalledTimes(1)
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
            platformsCaptured?: boolean
          }
        ).forcedWindowsViaBottle
      ).toBe(true)
      // The neighbouring field survives — the read-modify-write spread is
      // still required (T-18-02-04: .set REPLACES the whole entry).
      expect(
        (steamMetadataStore.get(APP_ID) as { platformsCaptured?: boolean })
          .platformsCaptured
      ).toBe(true)
    })

    it('A-14b: clearForcedWindowsViaBottle performs NO write when the flag was never set', () => {
      mockStatefulMetadataStore({
        art_cover: 'https://cdn/570/header.jpg',
        platformsCaptured: true
      })
      ;(steamMetadataStore.set as jest.Mock).mockClear()

      clearForcedWindowsViaBottle(steamTestDeps, APP_ID)

      // The pre-fix shape computed `wasForced` and used it ONLY to gate the
      // log line; the whole-entry rewrite ran regardless, on EVERY
      // confirmed-absent bottle tick, to write a value the entry already had.
      expect(steamMetadataStore.set as jest.Mock).not.toHaveBeenCalled()
    })

    it('A-14b: clearForcedWindowsViaBottle DOES write when the flag was set (discriminator)', () => {
      mockStatefulMetadataStore({
        art_cover: 'https://cdn/570/header.jpg',
        platformsCaptured: true,
        forcedWindowsViaBottle: true
      })
      ;(steamMetadataStore.set as jest.Mock).mockClear()

      clearForcedWindowsViaBottle(steamTestDeps, APP_ID)

      expect(steamMetadataStore.set as jest.Mock).toHaveBeenCalledTimes(1)
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        ).forcedWindowsViaBottle
      ).toBe(false)
    })

    it('W1: bottle-native terminal (depot install completes) persists the flag AND survives neighboring fields', async () => {
      mockStatefulMetadataStore({
        art_cover: 'https://cdn/570/header.jpg',
        art_square: 'https://cdn/570/library_600x900.jpg',
        extra: { reqs: [] },
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        // quick 261107-lum: a forced install now resolves the bridge verdict;
        // pin the bottled terminal these specs characterise (rule 3).
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)
      trackSpy(
        jest.spyOn(gameInstallDepot, 'installBottleNative')
      ).mockResolvedValue({ status: 'done' } as any)
      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      const stored = steamMetadataStore.get(APP_ID) as unknown as Record<
        string,
        unknown
      >
      expect(stored.forcedWindowsViaBottle).toBe(true)
      // T-18-02-04 guard: a bare-set implementation would wipe these.
      expect(stored.art_cover).toBe('https://cdn/570/header.jpg')
      expect(stored.art_square).toBe('https://cdn/570/library_600x900.jpg')
      expect(stored.extra).toEqual({ reqs: [] })
      expect(stored.platformsCaptured).toBe(true)
    })

    it('W2: depot terminal (native install opt-in ON) persists the flag', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        // quick 261107-lum: a forced install now resolves the bridge verdict;
        // pin the bottled terminal these specs characterise (rule 3).
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)

      trackSpy(
        jest.spyOn(gameInstallDepot, 'installBottleNative')
      ).mockResolvedValue({ status: 'done' } as any)

      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).toBe(true)
    })

    it('W3: depot terminal failure persists nothing', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        // quick 261107-lum: a forced install now resolves the bridge verdict;
        // pin the bottled terminal these specs characterise (rule 3).
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)

      trackSpy(
        jest.spyOn(gameInstallDepot, 'installBottleNative')
      ).mockResolvedValue({ status: 'error', error: 'boom' } as any)

      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W4: deferred-to-setup (bottle not provisioned) persists nothing — status:"done" here is NOT a success signal', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        // quick 261107-lum: a forced install now resolves the bridge verdict;
        // pin the bottled terminal these specs characterise (rule 3).
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      isBottleReady.mockReturnValue(false)

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.install(
        argsWith({ steamForceWindowsViaBottle: true })
      )

      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W5: a failed bottle-native install persists nothing (the flag is written only on a completed install)', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        // quick 261107-lum: a forced install now resolves the bridge verdict;
        // pin the bottled terminal these specs characterise (rule 3).
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)
      trackSpy(
        jest.spyOn(gameInstallDepot, 'installBottleNative')
      ).mockResolvedValue({ status: 'error', error: 'nope' } as any)
      await game.install(argsWith({ steamForceWindowsViaBottle: true }))

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W6: override absent — an ordinarily bottle-eligible game persists NO flag (it never needed one)', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false,
        // D-51-09: an ordinarily-bottle-eligible, non-seed, never-scanned
        // title now DEFAULTS to the bridge route (rule 11, pending-scan) --
        // this test is about the forcedWindowsViaBottle write discipline on
        // the BOTTLE path specifically, so userRoute:'bottle' (rule 3) pins
        // the route deterministically rather than relying on the obsolete
        // "non-seed always stays bottled" assumption.
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)
      const installBottleNative = trackSpy(
        jest.spyOn(gameInstallDepot, 'installBottleNative')
      ).mockResolvedValue({ status: 'done' } as any)
      await game.install(PRODUCTION_ARGS)

      expect(installBottleNative).toHaveBeenCalledTimes(1)
      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).not.toBe(true)
    })

    it('W7: the persisted verdict survives a subsequent appdetails re-fetch (no T-18-02-04 silent drop)', async () => {
      mockStatefulMetadataStore({
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        platformsCaptured: true,
        is_mac_native: true,
        is_windows_native: true,
        forcedWindowsViaBottle: true
      })
      ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
      // art_cover:'' (from makeEntry's default) triggers getGameInfo()'s own
      // fire-and-forget fetchMetadataIfNeeded — the SAME re-fetch trigger
      // LIB-04's specs already exercise, not a synthetic direct call.
      library.set(APP_ID, makeEntry())

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      await flushAsync()

      expect(
        (
          steamMetadataStore.get(APP_ID) as {
            forcedWindowsViaBottle?: boolean
          }
        )?.forcedWindowsViaBottle
      ).toBe(true)
    })

    // ── 34.13 review A-19 ────────────────────────────────────────────────
    // Four specs (NBI-1..NBI-4) used to pin a `nativeBottleInstall` flag's
    // write discipline and its T-18-02-04 carry-forward. A repo-wide census
    // found ZERO reads of that field feeding any branch — its own JSDoc said
    // so ("PROVENANCE ONLY ... no longer load-bearing for uninstall
    // routing") — while its writer performed a whole-entry
    // steamMetadataStore rewrite on every committed bottle install and its
    // eraser another on every confirmed-absent bottle tick. Field, pair,
    // store declaration and carry-forward are removed; this repo's own
    // convention (SteamBottleConfig's retired `loggedIn`,
    // common/types/steam.ts) is that a dead always-false signal is deleted
    // rather than kept, because leaving it only invites a future consumer to
    // trust it.
    //
    // The replacement is a DELETION gate, not the absence of a gate: a
    // re-introduction has to be deliberate.
    it('A-19: the nativeBottleInstall provenance field is GONE — a committed bottle install writes no such key', async () => {
      mockStatefulMetadataStore({
        platformsCaptured: true,
        is_mac_native: false,
        // D-51-09: see W6's identical note above — pin the bottle route
        // deterministically so this test keeps exercising installBottleNative
        // rather than the new bridge default.
        bridge: { userRoute: 'bottle' }
      })
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      isBottleReady.mockReturnValue(true)

      const game = new SteamGame(APP_ID, steamTestDeps)

      trackSpy(
        jest.spyOn(gameInstallDepot, 'installBottleNative')
      ).mockResolvedValue({ status: 'done' } as any)

      await game.install(PRODUCTION_ARGS)

      const entry = steamMetadataStore.get(APP_ID) as unknown as Record<
        string,
        unknown
      >
      expect(entry).toBeDefined()
      expect(entry).not.toHaveProperty('nativeBottleInstall')
      // Discriminator: the SIBLING D-17 flag is a live, read signal and must
      // NOT have been collaterally removed. No override was passed here, so
      // it must be absent for that reason and not because the pair is gone —
      // W2 above covers the positive case.
      expect(entry).not.toHaveProperty('nativeBottleInstall')
      expect(
        Object.keys(entry).some((k) => k.includes('forcedWindowsViaBottle'))
      ).toBe(false)
    })

    it('A-19: the source carries no writer, eraser or store declaration for it', () => {
      // A census, so the deletion cannot be half-undone in one file. The 62
      // split moved code out of games.ts, so it now covers every game*.ts
      // module plus every library/*.ts module and stores.ts.
      const libraryModules = jest
        .requireActual<typeof import('node:fs')>('node:fs')
        .readdirSync(join(__dirname, '..', 'library'))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => `library/${f}`)
      // anti-vacuity: the census must actually see the library modules
      expect(libraryModules).toContain('library/index.ts')
      expect(libraryModules).toContain('library/refresh.ts')
      for (const relative of [
        ...gameModuleFiles(),
        ...libraryModules,
        'stores.ts'
      ]) {
        const source = stripSourceComments(
          readFileSync(join(__dirname, '..', relative), 'utf8')
        )
        expect(source).not.toContain('nativeBottleInstall')
        expect(source).not.toContain('markNativeBottleInstall')
        expect(source).not.toContain('clearNativeBottleInstall')
      }
    })

    it('A-19 RED: the census DOES trip on a specimen carrying the removed field', () => {
      const specimen = stripSourceComments(
        'export function markNativeBottleInstall(appId: string) {\n' +
          '  steamMetadataStore.set(appId, { nativeBottleInstall: true })\n' +
          '}\n'
      )
      expect(specimen).toContain('nativeBottleInstall')
      expect(specimen).toContain('markNativeBottleInstall')
    })
  })
})

// ── Phase 17 Plan 09 (MACSTEAM-04 gap closure): ensurePlatformsCaptured() ────
//
// Closes UAT GAP 2: on macOS, an uncaptured Windows-only game's Install/Play
// previously fell through to native steam:// with no guided-setup dialog
// because isBottleEligible() required platformsCaptured===true, which was
// only ever set by a throttled fire-and-forget fetch. install()/launch()/
// uninstall() now await ensurePlatformsCaptured() BEFORE consulting the gate.

describe('SteamGame.install() ensurePlatformsCaptured() — Phase 17 Plan 09 (MACSTEAM-04)', () => {
  let shellOpenExternal: jest.Mock

  let envMock: any

  /** Windows-only appdetails fixture (mac:false) — the confirmed-not-native case. */
  const windowsOnlyFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Windows Only Game',
          short_description: '',
          platforms: { windows: true, mac: false, linux: false },
          genres: []
        }
      }
    }
  }

  /** Native-Mac appdetails fixture (mac:true). */
  const macNativeFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Mac Native Game',
          short_description: '',
          platforms: { windows: true, mac: true, linux: false },
          genres: []
        }
      }
    }
  }

  /**
   * Stateful steamMetadataStore double — .get() reflects the last .set() call
   * (unlike a static mockReturnValue), so ensurePlatformsCaptured's bounded
   * poll can actually observe the in-flight fetch resolving platformsCaptured,
   * mirroring how the real electron-store behaves.
   */
  function mockStatefulMetadataStore(initial: Record<string, unknown>) {
    let state: Record<string, unknown> | undefined = initial
    ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
    ;(steamMetadataStore.set as jest.Mock).mockImplementation((_id, meta) => {
      state = meta
    })
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Windows Only Game' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset()
  })

  afterEach(() => {
    // Explicit reset (do not rely on test-order discipline in later describes).
    envMock.isMac = false
  })

  it('platformsCaptured-uncaptured macOS install does NOT fall through to native — forces a synchronous capture and routes to guided setup', async () => {
    // D-51-09: see W6/A-19's identical note -- a non-seed, never-scanned,
    // bottle-eligible title now defaults to the bridge route (rule 11),
    // but this test is about ensurePlatformsCaptured's synchronous-capture
    // mechanism, not bridge routing, so userRoute:'bottle' pins the route.
    // The carry-forward added at fetchMetadataIfNeeded's write (D-51-07)
    // preserves this field through the capture fetch below.
    mockStatefulMetadataStore({
      platformsCaptured: undefined,
      bridge: { userRoute: 'bottle' }
    })
    ;(axios.get as jest.Mock).mockResolvedValue(windowsOnlyFixture)
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(axios.get).toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      {
        appName: APP_ID
      }
    )
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('native-Mac game routes native after capture — install() calls shell.openExternal once platforms resolve is_mac_native:true', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(macNativeFixture)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(axios.get).toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(result).toEqual({ status: 'done' })
  })

  it('non-macOS install skips platform capture — axios.get is NOT called by ensurePlatformsCaptured, native path used unchanged', async () => {
    envMock.isMac = false
    mockStatefulMetadataStore({ platformsCaptured: undefined })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.install({} as any)

    expect(axios.get).not.toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(result).toEqual({ status: 'done' })
  })

  it('already-captured game skips the fetch — no redundant network on the hot path', async () => {
    // D-51-09: pin the bottle route — see the identical note on the
    // 'platformsCaptured-uncaptured' test just above.
    mockStatefulMetadataStore({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { userRoute: 'bottle' }
    })
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.install({} as any)

    expect(axios.get).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      {
        appName: APP_ID
      }
    )
  })
})

// ── D-09: SteamGame.checkBottleEligibility() — backend-authoritative verdict ─

describe('SteamGame.checkBottleEligibility() — D-09 backend-authoritative verdict', () => {
  let envMock: any

  /** Windows-only appdetails fixture (mac:false) — the confirmed-not-native case. */
  const windowsOnlyFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Windows Only Game',
          short_description: '',
          platforms: { windows: true, mac: false, linux: false },
          genres: []
        }
      }
    }
  }

  /** Native-Mac appdetails fixture (mac:true). */
  const macNativeFixture = {
    data: {
      [APP_ID]: {
        success: true,
        data: {
          name: 'Mac Native Game',
          short_description: '',
          platforms: { windows: true, mac: true, linux: false },
          genres: []
        }
      }
    }
  }

  /**
   * Stateful steamMetadataStore double — .get() reflects the last .set() call
   * (unlike a static mockReturnValue), so ensurePlatformsCaptured's bounded
   * poll can actually observe the in-flight fetch resolving platformsCaptured,
   * mirroring how the real electron-store behaves.
   */
  function mockStatefulMetadataStore(initial: Record<string, unknown>) {
    let state: Record<string, unknown> | undefined = initial
    ;(steamMetadataStore.get as jest.Mock).mockImplementation(() => state)
    ;(steamMetadataStore.set as jest.Mock).mockImplementation((_id, meta) => {
      state = meta
    })
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Windows Only Game' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
  })

  afterEach(() => {
    envMock.isMac = false
  })

  it('cold cache + Windows-only game resolves true AND actually performs the capture', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(windowsOnlyFixture)

    const result = await checkBottleEligibility(
      new SteamGame(APP_ID, steamTestDeps)
    )

    expect(result).toBe(true)
    expect(axios.get).toHaveBeenCalled()
  })

  it('cold cache + mac-native game resolves false', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(macNativeFixture)

    const result = await checkBottleEligibility(
      new SteamGame(APP_ID, steamTestDeps)
    )

    expect(result).toBe(false)
  })

  it('already-captured entry resolves true with no redundant network', async () => {
    mockStatefulMetadataStore({ platformsCaptured: true, is_mac_native: false })

    const result = await checkBottleEligibility(
      new SteamGame(APP_ID, steamTestDeps)
    )

    expect(result).toBe(true)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('non-macOS resolves false without touching the network', async () => {
    envMock.isMac = false
    mockStatefulMetadataStore({ platformsCaptured: undefined })

    const result = await checkBottleEligibility(
      new SteamGame(APP_ID, steamTestDeps)
    )

    expect(result).toBe(false)
    expect(axios.get).not.toHaveBeenCalled()
  })

  it('MAC32-02: a confirmed-32 mac build resolves true through the wrapper', async () => {
    mockStatefulMetadataStore({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32'
    })

    const result = await checkBottleEligibility(
      new SteamGame(APP_ID, steamTestDeps)
    )

    expect(result).toBe(true)
  })
})

// ── GAME-03: SteamGame.uninstall() ───────────────────────────────────────────

describe('SteamGame.uninstall() — GAME-03', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let showDialogBoxModalAutoMock: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    showDialogBoxModalAutoMock = jest.requireMock('backend/dialog/dialog')
      .showDialogBoxModalAuto as jest.Mock
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    // Spy on startUninstallPolling so uninstall() can call it without running the real poller
    startUninstallPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  it('GAME-03: uninstall() calls shell.openExternal with steam://uninstall/{appId}', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
  })

  it('GAME-03: uninstall() resolves an ExecResult { stdout, stderr }', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(result).toEqual(expect.objectContaining({ stdout: '', stderr: '' }))
  })

  it('D-07: uninstall() calls startUninstallPolling with this.appId after successful openExternal', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)
    expect(startUninstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
  })

  it('D-07: uninstall() does NOT call startUninstallPolling when appId is non-numeric (T-03-01 guard)', async () => {
    const badGame = new SteamGame('abc', steamTestDeps)
    library.set(
      'abc',
      makeEntry({ app_name: 'abc', title: 'BadGame', is_installed: true })
    )
    await badGame.uninstall({} as any)
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
  })

  it('uninstall() does NOT show a hand-off toast (toast feature removed)', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('D-05: uninstall() does NOT show a GamerLib confirmation dialog', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    // Steam shows its own confirm dialog — GamerLib must not add a second one
    expect(showDialogBoxModalAutoMock).not.toHaveBeenCalled()
  })

  it('D-01/D-02: uninstall() does NOT call sendFrontendMessage (no optimistic flip, reconcile on focus)', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    // Badge state is reconciled only after the focus ACF re-read, never assumed from click
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })
})

// ── quick 261029-l9w: unadopted Mac native install is removed directly ───────

describe('SteamGame.uninstall() — quick 261029-l9w: unadopted Mac native install', () => {
  let envMock: any
  let shellOpenExternal: jest.Mock
  let startPollingSpy: jest.SpyInstance
  let readAcfStateSpy: jest.SpyInstance
  let removeCopySpy: jest.SpyInstance
  let pollOnceSpy: jest.SpyInstance
  const adoption = () =>
    jest.mocked(
      jest.requireMock<typeof import('../macSteamAdoption')>(
        '../macSteamAdoption'
      )
    )
  const MANIFEST = `${NATIVE_LIBRARY_ROOT}/steamapps/appmanifest_${APP_ID}.acf`
  const BASELINE = { mtimeMs: 1, content: 'gamelib' }
  const RECORD = {
    steamPid: 50647,
    manifestPath: MANIFEST,
    baseline: BASELINE,
    recordedAt: 0
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    startPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    readAcfStateSpy = jest.spyOn(acfState, 'readAcfState').mockResolvedValue({
      state: 'installed',
      installPath: NATIVE_INSTALL_PATH,
      stateFlags: 4
    } as any)
    removeCopySpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockResolvedValue({
        status: 'removed',
        source: 'native',
        manifestOnly: false
      } as any)
    pollOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    // Use ji2's real decision so each arm exercises it, not a canned value.
    adoption().decidePlayAdoption.mockImplementation(
      jest.requireActual('../macSteamAdoption').decidePlayAdoption
    )
    adoption().readPendingAdoption.mockReturnValue(RECORD)
    adoption().readAcfSnapshot.mockResolvedValue(BASELINE)
    adoption().probeMacSteamPid.mockResolvedValue(50647)
    ;(parse as jest.Mock).mockReturnValue(undefined)
    // resolveInstallRoot() consults the bottle root first on Mac.
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'Steam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    envMock.isMac = false
    startPollingSpy.mockRestore()
    readAcfStateSpy.mockRestore()
    removeCopySpy.mockRestore()
    pollOnceSpy.mockRestore()
  })

  const expectDelegated = () => {
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(startPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(removeCopySpy).not.toHaveBeenCalled()
  }

  it('direct arm: removes via removeSteamInstallCopy then pollUninstallOnce, no steam://uninstall', async () => {
    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startPollingSpy).not.toHaveBeenCalled()
    expect(removeCopySpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')
    expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
      APP_ID,
      mockAdoptionStore
    )
    expect(pollOnceSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')
    expect(at(removeCopySpy.mock.invocationCallOrder, 0)).toBeLessThan(
      at(pollOnceSpy.mock.invocationCallOrder, 0)
    )
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('direct arm, absent race: still clears the record and completes via pollUninstallOnce', async () => {
    removeCopySpy.mockResolvedValue({ status: 'absent', source: 'native' })

    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
      APP_ID,
      mockAdoptionStore
    )
    expect(pollOnceSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')
  })

  it('delegates when there is no pending-adoption record', async () => {
    adoption().readPendingAdoption.mockReturnValue(undefined)
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates when the steam_osx PID differs', async () => {
    adoption().probeMacSteamPid.mockResolvedValue(99999)
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates when Steam is not running', async () => {
    adoption().probeMacSteamPid.mockResolvedValue(null)
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates when the PID probe rejects (treated as not running)', async () => {
    adoption().probeMacSteamPid.mockRejectedValue(new Error('pgrep failed'))
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates when the ACF is Steam-adopted', async () => {
    ;(parse as jest.Mock).mockReturnValue({
      AppState: { StateFlags: '4', buildid: '123' }
    })
    adoption().readAcfSnapshot.mockResolvedValue({
      mtimeMs: 2,
      content: 'steam-rewrote'
    })
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates when the native ACF is not "installed" (downloading)', async () => {
    readAcfStateSpy.mockResolvedValue({ state: 'downloading' } as any)
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates when record.manifestPath is a different library manifest', async () => {
    adoption().readPendingAdoption.mockReturnValue({
      ...RECORD,
      manifestPath: `/other/lib/steamapps/appmanifest_${APP_ID}.acf`
    })
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
  })

  it('delegates on a non-Mac host without probing or reading the record', async () => {
    envMock.isMac = false
    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
    expectDelegated()
    expect(adoption().probeMacSteamPid).not.toHaveBeenCalled()
    expect(adoption().readPendingAdoption).not.toHaveBeenCalled()
  })

  it('refusal arm: deletes nothing, no delegation, keeps record, clears status, stderr set', async () => {
    removeCopySpy.mockResolvedValue({
      status: 'refused',
      source: 'native',
      reason: 'install path outside common/'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startPollingSpy).not.toHaveBeenCalled()
    expect(adoption().clearPendingAdoption).not.toHaveBeenCalled()
    expect(pollOnceSpy).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
    expect(result.stderr).toContain('Refused')
  })

  it('throw arm: never throws out of uninstall(); returns failed (quick 261108-anw: the callback owns done)', async () => {
    removeCopySpy.mockRejectedValue(new Error('EACCES'))

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startPollingSpy).not.toHaveBeenCalled()
    expect(adoption().clearPendingAdoption).not.toHaveBeenCalled()
    expect(pollOnceSpy).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.anything()
    )
    expect(result.failed).toBe(true)
    expect(result.stderr).toContain('EACCES')
  })
})

// ── quick 261106-s3n: delete in GameLib (setting ON) ─────────────────────────

describe('SteamGame.uninstall() — quick 261106-s3n: delete in GameLib (ON)', () => {
  let envMock: any
  let shellOpenExternal: jest.Mock
  let startPollingSpy: jest.SpyInstance
  let removeCopySpy: jest.SpyInstance
  let pollOnceSpy: jest.SpyInstance
  const adoption = () =>
    jest.mocked(
      jest.requireMock<typeof import('../macSteamAdoption')>(
        '../macSteamAdoption'
      )
    )
  const done = {
    appName: APP_ID,
    runner: 'steam',
    status: 'done'
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    ;(isSteamNativeDeleteEnabled as jest.Mock).mockReturnValue(true)
    startPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    removeCopySpy = jest
      .spyOn(acfState, 'removeSteamInstallCopy')
      .mockResolvedValue({
        status: 'removed',
        source: 'native',
        manifestOnly: false
      } as any)
    pollOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'Steam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    envMock.isMac = false
    startPollingSpy.mockRestore()
    removeCopySpy.mockRestore()
    pollOnceSpy.mockRestore()
  })

  it('steam-uninstalled: polls the ACF, opens no steam:// URL, deletes nothing', async () => {
    ;(decideSteamNativeDelete as jest.Mock).mockResolvedValue({
      route: 'steam-uninstalled'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(decideSteamNativeDelete).toHaveBeenCalledWith(
      APP_ID,
      NATIVE_INSTALL_PATH,
      {
        readRunningAppId: expect.any(Function),
        isProcessRunningFromFolder: expect.any(Function),
        requestSteamUninstallApp: expect.any(Function)
      }
    )
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
      APP_ID,
      mockAdoptionStore
    )
    expect(removeCopySpy).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('fallback: removeSteamInstallCopy(native) then pollUninstallOnce, no steam:// URL', async () => {
    ;(decideSteamNativeDelete as jest.Mock).mockResolvedValue({
      route: 'fallback',
      why: 'signed-out'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startPollingSpy).not.toHaveBeenCalled()
    expect(removeCopySpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')
    expect(pollOnceSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'native')
    expect(at(removeCopySpy.mock.invocationCallOrder, 0)).toBeLessThan(
      at(pollOnceSpy.mock.invocationCallOrder, 0)
    )
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('fallback with a refused copy: nothing polled, status cleared, stderr set', async () => {
    ;(decideSteamNativeDelete as jest.Mock).mockResolvedValue({
      route: 'fallback',
      why: 'steam-not-running'
    })
    removeCopySpy.mockResolvedValue({
      status: 'refused',
      source: 'native',
      reason: 'install path outside common/'
    })

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(pollOnceSpy).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', done)
    expect(result.stderr).toContain('Refused')
    expect(result.refused).toBe(true)
  })

  it('quick 261108-anw: fallback with a caught rm error returns failed, notices once, sends no route-level done', async () => {
    ;(decideSteamNativeDelete as jest.Mock).mockResolvedValue({
      route: 'fallback',
      why: 'signed-out'
    })
    removeCopySpy.mockRejectedValue(new Error('EACCES'))

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(pollOnceSpy).not.toHaveBeenCalled()
    expect(result.failed).toBe(true)
    expect(result.refused).toBeUndefined()
    expect(result.stderr).toContain('Failed to remove native install')
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      done
    )
    expect(notify).not.toHaveBeenCalled()
    expectOneFailedNotice('Dota 2')
  })

  it.each([
    [{ route: 'refused-running' }, 'running'],
    [{ route: 'steam-error', code: 2 }, 'error 2'],
    [{ route: 'refused', reason: 'running-check-failed' }, 'running-check']
  ])(
    '%j: deletes nothing, clears status, sets stderr',
    async (decision, text) => {
      ;(decideSteamNativeDelete as jest.Mock).mockResolvedValue(decision)

      const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
        {} as any
      )

      expect(removeCopySpy).not.toHaveBeenCalled()
      expect(pollOnceSpy).not.toHaveBeenCalled()
      expect(startPollingSpy).not.toHaveBeenCalled()
      expect(shellOpenExternal).not.toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', done)
      expect(result.stderr).toContain(text)
      expect(result.refused).toBe(true)
      expect(notify).not.toHaveBeenCalled()
    }
  )

  it.each([
    [{ route: 'refused-running' }, { kind: 'uninstall-refused-running' }],
    [
      { route: 'steam-error', code: 2 },
      { kind: 'uninstall-steam-error', code: 2 }
    ],
    [
      { route: 'refused', reason: 'running-check-failed' },
      { kind: 'uninstall-check-failed' }
    ]
  ])(
    '%j pushes an in-app steamRequestNotice under the game title',
    async (decision, expected) => {
      ;(decideSteamNativeDelete as jest.Mock).mockResolvedValue(decision)
      await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'steamRequestNotice',
        expect.objectContaining({ appId: APP_ID, title: 'Dota 2', ...expected })
      )
    }
  )

  it('OFF: the decision is never consulted and steam://uninstall is used', async () => {
    ;(isSteamNativeDeleteEnabled as jest.Mock).mockReturnValue(false)

    await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)

    expect(decideSteamNativeDelete).not.toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.uninstall() bottle routing ──────────────

describe('SteamGame.uninstall() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance

  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    startUninstallPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    // debug/steam-bottle-uninstall-reverts (routing fix): resolveInstallRoot()
    // always consults the bottle root first on mac (isMac=true here for every
    // test in this describe, including the native-routing ones) — production
    // getSteamBottleSettings() always returns a valid object (falls back to
    // DEFAULT_STEAM_BOTTLE_NAME), so mock it the same way here rather than
    // leave it unmocked-undefined.
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  // NOTE (debug/steam-bottle-uninstall-reverts FINAL): the former
  // "bottle-eligible + provisioned: uninstall() calls
  // tellBottledSteamToUninstall" test used to live here. That routing is
  // retired — EVERY bottle-eligible + provisioned title now uninstalls via
  // direct deletion, never tellBottledSteamToUninstall. That behavior is
  // now fully covered (with the readAcfState/pollUninstallOnce spies it
  // needs) by the "direct deletion for ALL bottle-eligible titles" describe
  // block below, so it is not duplicated here.

  it('bottle-eligible + un-provisioned: uninstall() does NOT call shell.openExternal and emits steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    isBottleReady.mockReturnValue(false)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — uninstall() STILL calls shell.openExternal with steam://uninstall/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })

  it('D-11: NOT-yet-captured macOS game — uninstall() STILL takes the native path', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — uninstall() STILL calls shell.openExternal', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
  })
})

// ── debug/steam-bottle-uninstall-reverts (FINAL): direct deletion for ALL
// bottle-eligible, non-bridge titles — delegating uninstall to the bottled
// Steam client's own confirm dialog was PROVEN architecturally unworkable
// in this CrossOver bottle for every bottle title (CW_USEDEFAULT
// off-screen-window defect), not only GameLib-authored
// (installBottleNative, D-15/SNI-08) ones. uninstall() therefore routes
// EVERY bottle-eligible, non-bridge title to uninstallBottleGameDirectly()
// UNCONDITIONALLY now — the nativeBottleInstall flag no longer changes
// routing (see games.ts JSDoc; the flag itself is kept as provenance-only
// metadata).

describe('SteamGame.uninstall() — direct deletion for ALL bottle-eligible titles (debug/steam-bottle-uninstall-reverts FINAL)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance
  let readAcfStateSpy: jest.SpyInstance
  let pollUninstallOnceSpy: jest.SpyInstance

  let envMock: any

  // Steam-authored installdir (Hoard, appId 63000) — deliberately NOT an
  // 'app_<id>' GameLib-authored name, proving the naming-convention
  // generalization: installRoot is derived purely from the ACF's own
  // on-disk installdir, never FALLBACK_INSTALLDIR_PREFIX.
  const INSTALL_PATH = '/mock/bottle/steamapps/common/Hoard'

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    // debug/steam-bottle-uninstall-reverts (routing fix): uninstall() now
    // routes off the library entry's own install.install_path (never title
    // attributes) — give it one that resolves inside the bottle root by
    // default so this describe's existing tests keep exercising
    // uninstallBottleGameDirectly(). The ACF-level installPath (what
    // readAcfStateSpy controls per-test) is a SEPARATE value, answering a
    // different question — see uninstallBottleGameDirectly()'s own JSDoc.
    library.set(
      APP_ID,
      makeEntry({
        title: 'Hoard',
        is_installed: true,
        install: { install_path: INSTALL_PATH }
      })
    )
    startUninstallPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    readAcfStateSpy = jest.spyOn(acfState, 'readAcfState')
    pollUninstallOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset().mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('nativeBottleInstall:true (GameLib-authored install) routes to direct deletion — never dispatches to the bottled Steam client', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      nativeBottleInstall: true
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    // Reuses the SAME confirmed-absent completion pipeline the delegated
    // path's own poller uses — badge flip/persist/notify/flag-clear.
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('nativeBottleInstall:false (explicit — legacy-delegated/Steam-authored install, e.g. Hoard) ALSO routes to direct deletion — routing no longer depends on this flag', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      nativeBottleInstall: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('nativeBottleInstall absent (never set — pre-fix cache entry) ALSO routes to direct deletion — no title ever falls through to tellBottledSteamToUninstall anymore', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('quick 261108-anw: an rm error on the bottle install returns failed, notices once, polls nothing', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: INSTALL_PATH
    })
    const rmSpy = failNextRmSync()

    const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
      {} as any
    )

    expect(rmSpy).toHaveBeenCalled()
    rmSpy.mockRestore()
    expect(result.failed).toBe(true)
    expect(result.refused).toBeUndefined()
    expect(result.stderr).toContain('Failed to remove bottle install')
    expect(pollUninstallOnceSpy).not.toHaveBeenCalled()
    expectOneFailedNotice('Hoard')
  })

  it('containment: rejects an installPath outside the bottle common/ dir instead of deleting it', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({
      state: 'installed',
      installPath: '/etc/passwd'
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(result.stderr).toContain('unsafe path')
    expect(pollUninstallOnceSpy).not.toHaveBeenCalled()
  })

  // NOTE the name: this spec drives `{ state: 'absent' }` ONLY. It used to be
  // named "(already absent/downloading)", advertising coverage of a branch it
  // never reached — the 34.13 review A-10 defect sat directly underneath that
  // claim. `downloading` now has its OWN branch and its own specs below.
  it('no installed manifest found (already absent) — syncs state via pollUninstallOnce instead of deleting', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    readAcfStateSpy.mockResolvedValue({ state: 'absent' })

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  // ── 34.13 review A-12 ─────────────────────────────────────────────────────
  // The method containment-checks `installRoot` with the full
  // resolve()+relative()+isAbsolute() idiom and then deletes a SECOND path,
  // `appmanifest_${appId}.acf`, built from a renderer-supplied appId that got
  // none of it. `join` is not containment (Phase 18).
  describe('A-12: a non-numeric appId is refused before either delete target is built', () => {
    beforeEach(() => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
    })

    it.each([
      '../../../../etc',
      '63000/../../..',
      '63000; rm -rf /',
      '',
      'notanumber'
    ])('refuses appId "%s" without touching the ACF at all', async (badId) => {
      library.set(
        badId,
        makeEntry({
          app_name: badId,
          title: 'Hoard',
          is_installed: true,
          install: { install_path: INSTALL_PATH }
        })
      )
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: INSTALL_PATH
      })

      const result = await new SteamGame(badId, steamTestDeps).uninstall(
        {} as any
      )

      expect(result.stderr).toContain('invalid appId')
      // The refusal is BEFORE the ACF read, so no delete target is ever
      // constructed from the untrusted value.
      expect(readAcfStateSpy).not.toHaveBeenCalled()
      expect(pollUninstallOnceSpy).not.toHaveBeenCalled()
    })

    it('DISCRIMINATOR: a numeric appId is NOT refused (the gate cannot pass by refusing everything)', async () => {
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: INSTALL_PATH
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
        {} as any
      )

      expect(result.stderr).not.toContain('invalid appId')
      expect(readAcfStateSpy).toHaveBeenCalledWith(
        expect.anything(),
        APP_ID,
        'bottle'
      )
    })
  })

  // ── 34.13 review A-10 ─────────────────────────────────────────────────────
  // Known-bad input: readAcfState('bottle') resolves
  // `{ state: 'downloading', stateFlags: 1026 }` — a partial/handoff manifest.
  // Against the pre-fix source (where 'downloading' fell into the
  // `state !== 'installed'` branch) all three specs below fail: A10a because
  // pollUninstallOnce IS called, A10b because the result is `{stderr: ''}`,
  // and A10c because pollUninstallOnce's own non-absent branch emits
  // `status: 'uninstalling'` with no poll registered to ever clear it.
  describe('A-10: a mid-download bottle manifest is refused, not reported as a successful uninstall', () => {
    const DOWNLOADING = { state: 'downloading' as const, stateFlags: 1026 }

    beforeEach(() => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue(DOWNLOADING)
    })

    it('A10a: never reaches pollUninstallOnce — the completion pipeline must not run for an install that is still in progress', async () => {
      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.uninstall({} as any)

      expect(pollUninstallOnceSpy).not.toHaveBeenCalled()
      expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    })

    it('A10b: reports a real error rather than an empty-stderr success', async () => {
      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.uninstall({} as any)

      expect(result.stderr).toContain('still in progress')
      expect(result.stderr).not.toBe('')
    })

    it('A10c: emits a TERMINAL status frame and never a terminal-less `uninstalling` one', async () => {
      sendFrontendMessage.mockClear()

      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.uninstall({} as any)

      const statusFrames = sendFrontendMessage.mock.calls
        .filter(([channel]) => channel === 'gameStatusUpdate')
        .map(([, payload]) => payload.status)

      expect(statusFrames).not.toContain('uninstalling')
      expect(statusFrames).toContain('done')
    })
  })

  // ── SharedDepots hazard: a REAL filesystem regression test, not a mocked
  // one — proves uninstallBottleGameDirectly()'s deletion is scoped to
  // EXACTLY this title's own installdir + own manifest, and never touches
  // a sibling directory another bottle title's SharedDepots points at
  // (Hoard's real manifest declares SharedDepots 228987/228990 -> 228980,
  // "Steamworks Common Redistributables" — see debug session evidence).
  describe('SharedDepots hazard — real filesystem scoping proof', () => {
    let tmp: string
    let steamappsDir: string
    let hoardInstallDir: string
    let sharedDepotOwnerDir: string
    let hoardManifestPath: string
    let siblingManifestPath: string

    beforeEach(() => {
      tmp = mkdtempSync(
        realJoin(tmpdir(), 'gamelib-uninstall-shareddepots-test-')
      )
      steamappsDir = realJoin(tmp, 'steamapps')
      hoardInstallDir = realJoin(steamappsDir, 'common', 'Hoard')
      // The SharedDepots OWNER app's own installdir — a SIBLING of
      // Hoard's own installdir under common/, never a child of it. This is
      // where 228987/228990's actual files live; uninstalling Hoard must
      // never reach into it.
      sharedDepotOwnerDir = realJoin(
        steamappsDir,
        'common',
        'Steamworks Common Redistributables'
      )
      hoardManifestPath = realJoin(steamappsDir, `appmanifest_${APP_ID}.acf`)
      siblingManifestPath = realJoin(steamappsDir, 'appmanifest_228980.acf')

      mkdirSync(hoardInstallDir, { recursive: true })
      mkdirSync(sharedDepotOwnerDir, { recursive: true })
      writeFileSync(realJoin(hoardInstallDir, 'Hoard.exe'), 'binary-stub')
      writeFileSync(
        realJoin(sharedDepotOwnerDir, 'vcredist_x64.exe'),
        'shared-redist-stub'
      )
      writeFileSync(hoardManifestPath, 'hoard manifest content')
      writeFileSync(siblingManifestPath, 'sibling manifest content')
      ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(steamappsDir)
      // Override the outer beforeEach's fake INSTALL_PATH — this nested
      // suite roots the bottle at a REAL tmp dir, so the library entry's own
      // install_path (the new routing source of truth) must resolve inside
      // THIS real tree, not the fake '/mock/bottle/...' path.
      library.set(
        APP_ID,
        makeEntry({
          title: 'Hoard',
          is_installed: true,
          install: { install_path: hoardInstallDir }
        })
      )
    })

    afterEach(() => {
      realRmSync(tmp, { recursive: true, force: true })
    })

    it("removes ONLY Hoard's own installdir + own manifest — the SharedDepots owner's sibling directory and manifest survive untouched", async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: hoardInstallDir
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.uninstall({} as any)

      expect(result).toEqual({ stdout: '', stderr: '' })
      // Hoard's own install dir + manifest are gone.
      expect(realExistsSync(hoardInstallDir)).toBe(false)
      expect(realExistsSync(hoardManifestPath)).toBe(false)
      // The SharedDepots owner's sibling directory (and its content) and
      // its own manifest survive completely untouched.
      expect(realExistsSync(sharedDepotOwnerDir)).toBe(true)
      expect(
        realExistsSync(realJoin(sharedDepotOwnerDir, 'vcredist_x64.exe'))
      ).toBe(true)
      expect(realExistsSync(siblingManifestPath)).toBe(true)
    })

    // ── 34.13 review A-13 ──────────────────────────────────────────────────
    // The SharedDepots argument above is sound for the shape it proves, and
    // silently assumes away a DIFFERENT one: two installed appIds whose ACFs
    // declare the SAME `installdir`. Steam does this routinely (a game and
    // its dedicated-server/tool app, regional SKU variants, demo/base pairs).
    // There `installRoot` resolves to the SHARED directory, so the recursive
    // delete takes the co-installed app's files with it while only THIS
    // appId's manifest is removed — the other app's manifest survives
    // pointing at an empty path, and Steam and GameLib both still believe it
    // is installed. Proven on a REAL filesystem, like the case above.
    it("A-13: a shared installdir removes THIS title's manifest only — the co-installed app's files survive on disk", async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: hoardInstallDir
      })
      const conflictSpy = jest
        .spyOn(acfState, 'findOtherManifestsWithInstalldir')
        .mockResolvedValue(['228980'])

      const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
        {} as any
      )

      expect(result).toEqual({ stdout: '', stderr: '' })
      // THIS title's manifest is gone...
      expect(realExistsSync(hoardManifestPath)).toBe(false)
      // ...and the shared directory, with the co-installed app's files in
      // it, is untouched. Pre-fix this whole tree was recursively deleted.
      expect(realExistsSync(hoardInstallDir)).toBe(true)
      expect(realExistsSync(realJoin(hoardInstallDir, 'Hoard.exe'))).toBe(true)
      expect(realExistsSync(siblingManifestPath)).toBe(true)
      // The completion pipeline still runs, so the badge reconciles.
      expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        'bottle'
      )

      conflictSpy.mockRestore()
    })

    it('quick 261108-anw: an rm error on the shared-installdir manifest returns failed, notices once, polls nothing', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: hoardInstallDir
      })
      const conflictSpy = jest
        .spyOn(acfState, 'findOtherManifestsWithInstalldir')
        .mockResolvedValue(['228980'])
      const rmSpy = failNextRmSync()

      const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
        {} as any
      )
      conflictSpy.mockRestore()

      expect(rmSpy).toHaveBeenCalled()
      rmSpy.mockRestore()
      expect(result.failed).toBe(true)
      expect(result.refused).toBeUndefined()
      expect(result.stderr).toContain('Failed to remove bottle install')
      expect(pollUninstallOnceSpy).not.toHaveBeenCalled()
      expectOneFailedNotice('Hoard')
    })

    it('A-13 DISCRIMINATOR: with NO conflicting manifest the directory IS deleted (the check cannot pass by refusing everything)', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: hoardInstallDir
      })
      const conflictSpy = jest
        .spyOn(acfState, 'findOtherManifestsWithInstalldir')
        .mockResolvedValue([])

      await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)

      expect(realExistsSync(hoardInstallDir)).toBe(false)
      expect(realExistsSync(hoardManifestPath)).toBe(false)

      conflictSpy.mockRestore()
    })

    it("A-13: the conflict check is driven by THIS title's installdir segment and its own appId", async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      readAcfStateSpy.mockResolvedValue({
        state: 'installed',
        installPath: hoardInstallDir
      })
      const conflictSpy = jest
        .spyOn(acfState, 'findOtherManifestsWithInstalldir')
        .mockResolvedValue([])

      await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)

      expect(conflictSpy).toHaveBeenCalledWith(
        expect.anything(),
        steamappsDir,
        'Hoard',
        APP_ID
      )

      conflictSpy.mockRestore()
    })
  })
})

// ── debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED):
// uninstall() routing is driven SOLELY by where install.install_path resolves
// — never by title attributes. These tests prove the routing decision itself
// is install_path-driven (not merely consistent with it by coincidence), and
// cover the required refuse-and-report scenarios RED-provably: each refuse
// assertion checks a positive absence (openExternal/readAcfState never
// called) that the pre-fix, attribute-only routing would NOT have satisfied.

describe('SteamGame.uninstall() — install_path-driven routing (debug/steam-bottle-uninstall-reverts, OPERATOR DECISION LOCKED)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance

  let envMock: any
  const BOTTLE_INSTALL_PATH = '/mock/bottle/steamapps/common/SomeGame'

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    startUninstallPollingSpy = jest
      .spyOn(uninstallPollingModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    isBottleReady.mockReset().mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  it('native-only: a title with a valid native install_path routes native and deletes correctly, regardless of any bottle-eligibility metadata', async () => {
    // Metadata says bottle-ineligible (ordinary case) — install_path in a
    // registered native library.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(startUninstallPollingSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('ROUTING PROOF: a title bottle-eligible PER METADATA still routes NATIVE when install_path resolves to a native library — attributes never drive uninstall routing', async () => {
    // Metadata says bottle-eligible (is_mac_native:false would normally send
    // this down the bottle branch pre-fix) — but install_path resolves to a
    // NATIVE library. install_path must win.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: NATIVE_INSTALL_PATH }
      })
    )
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    const readAcfStateSpy = jest.spyOn(acfState, 'readAcfState')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    // The bottle-scoped ACF is never even consulted — routing never reached
    // uninstallBottleGameDirectly() despite bottle-eligible metadata.
    expect(readAcfStateSpy).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })

    readAcfStateSpy.mockRestore()
  })

  it('ROUTING PROOF (inverse): a title NOT bottle-eligible per metadata still routes BOTTLE when install_path resolves inside the bottle — attributes never drive uninstall routing', async () => {
    // Metadata says NOT bottle-eligible (is_mac_native:true) — but
    // install_path resolves inside the CrossOver bottle. install_path must
    // win, routing to direct bottle deletion, never native delegation.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'SomeGame',
        is_installed: true,
        install: { install_path: BOTTLE_INSTALL_PATH }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(acfState, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: BOTTLE_INSTALL_PATH
      })
    const pollUninstallOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(result).toEqual({ stdout: '', stderr: '' })

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('bottle-only (regression, just-shipped mechanism): a title with a valid bottle install_path routes bottle and deletes correctly', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Hoard',
        is_installed: true,
        install: { install_path: BOTTLE_INSTALL_PATH }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(acfState, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: BOTTLE_INSTALL_PATH
      })
    const pollUninstallOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('dual-installed (bottle-pointed): routes ONLY to the bottle copy uninstallBottleGameDirectly() represents — never touches the native delegation path at all', async () => {
    // The library entry's install_path represents the bottle copy (what the
    // user is looking at); a native copy also happens to exist on disk, but
    // uninstall() must never consult it — it acts SOLELY on the represented
    // copy. (The badge-stays-installed / install_path re-resolution half of
    // this scenario is unit-tested directly against pollUninstallOnce() in
    // library.test.ts's "dual-install partial removal" suite — this test
    // proves the ROUTING half: only the pointed-at copy is ever touched.)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Hoard',
        is_installed: true,
        install: { install_path: BOTTLE_INSTALL_PATH }
      })
    )
    // A native copy also exists — getSteamLibraries() would report it if
    // ever consulted, but routing must never reach that call for a
    // bottle-pointed install_path.
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    const readAcfStateSpy = jest
      .spyOn(acfState, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: BOTTLE_INSTALL_PATH
      })
    const pollUninstallOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(readAcfStateSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'native'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )
    expect(shellOpenExternal).not.toHaveBeenCalled()

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  it('stale/absent install_path: refuses and deletes nothing (RED-provable — pre-fix attribute routing would have delegated natively regardless)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    // makeEntry()'s default install:{} has no install_path.
    library.set(APP_ID, makeEntry({ title: 'Dota 2', is_installed: true }))
    const readAcfStateSpy = jest.spyOn(acfState, 'readAcfState')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(readAcfStateSpy).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(result.stderr).toContain('Refused to uninstall')
    expect(result.stdout).toBe('')

    readAcfStateSpy.mockRestore()
  })

  it('install_path outside every known root (bottle AND all native libraries): refuses and deletes nothing (RED-provable)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    library.set(
      APP_ID,
      makeEntry({
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: '/completely/unrelated/place/Game' }
      })
    )
    // A real native library IS registered, but does not contain this path —
    // proves the containment check, not just an empty-libraries fallback.
    ;(getSteamLibraries as jest.Mock).mockResolvedValue([NATIVE_LIBRARY_ROOT])
    const readAcfStateSpy = jest.spyOn(acfState, 'readAcfState')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(readAcfStateSpy).not.toHaveBeenCalled()
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
    expect(result.stderr).toContain('Refused to uninstall')
    expect(result.stdout).toBe('')

    readAcfStateSpy.mockRestore()
  })
})

// ── Phase 24 Plan 08 (R4/R6): allowlist-based bridge uninstall routing —
// removes the game from the DEDICATED bridge bottle directly (no Steam
// client to dispatch a verb to on this path), never touching the Phase 17
// GameLibSteam bottle.

describe('SteamGame.uninstall() — Phase 24 Plan 08 bridge routing (R4/R6)', () => {
  let envMock: any
  const RESOLVED_EXE_PATH =
    '/mock/bridge/bottle/steamapps/common/Avernum 4/Avernum4.exe'

  beforeEach(() => {
    resetBridgeFailedSession()
    __resetDrmModeNoticeShownForTests()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4', is_installed: true }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(bridgeAllowlist.has as jest.Mock).mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
    ;(resolveBridgeLaunchExe as jest.Mock).mockReset()
    ;(removePerGameBridgeBottle as jest.Mock).mockReset()
    // Phase 51 Plan 09 (D-51-09): uninstall() now dispatches on LOCATION
    // (findBridgeInstallBottle) rather than ELIGIBILITY (isBridgeEligible) --
    // every test in this describe block is about an install that already
    // lives in the bridge bottle, so isBridgeBottleReady defaults to true
    // here and the 'not installed via bridge' cases override it locally.
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockImplementation(
      (_paths: unknown, bottleName: string) =>
        bottleName === 'GameLibSteamBridge'
          ? '/mock/bridge/bottle/steamapps'
          : '/mock/bottle/steamapps'
    )
  })

  afterEach(() => {
    // Restore the module-mock's declared defaults — see the identical note
    // in the launch() bridge-routing describe block above.
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  it('allowlisted uninstall: removes the game from the bridge bottle (resolveBridgeLaunchExe consulted), NOT tellBottledSteamToUninstall — Phase 17 GameLibSteam bottle untouched', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.uninstall({} as any)

    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    // quick/261016-u1w (D-B threading): resolves THIS game's own bridge
    // bottle rather than the shared zero-arg default.
    expect(getBridgeBottleSettings).toHaveBeenCalledWith(steamTestDeps, APP_ID)
    // quick/261016-u1w (D-D): this game lives in the LEGACY shared bottle
    // ('GameLibSteamBridge'), not its own per-game bottle, so the whole-bottle
    // removal path must never be reached here.
    expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
    expect(result).toEqual({ stdout: '', stderr: '' })
    expect(library.get(APP_ID)?.is_installed).toBe(false)
  })

  // quick/261016-u1w (D-D): when this game's own bottle IS its per-game
  // bottle, the whole bottle is removed directly — no resolveBridgeLaunchExe,
  // no install-root resolution, no PICS round-trip.
  describe('per-game bottle removal (D-D)', () => {
    beforeEach(() => {
      ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
        wineCrossoverBottle: 'GameLibSteamBridge-570'
      })
    })

    it('calls removePerGameBridgeBottle(appId) and never consults resolveBridgeLaunchExe', async () => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(removePerGameBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'removed'
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      await game.uninstall({} as any)
      expect(removePerGameBridgeBottle).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID
      )
      expect(resolveBridgeLaunchExe).not.toHaveBeenCalled()
    })

    it.each(['removed', 'absent'] as const)(
      'on status "%s", returns an empty ExecResult and marks the library entry is_installed:false',
      async (status) => {
        ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
        ;(removePerGameBridgeBottle as jest.Mock).mockResolvedValue({ status })

        const game = new SteamGame(APP_ID, steamTestDeps)
        const result = await game.uninstall({} as any)

        expect(result).toEqual({ stdout: '', stderr: '' })
        expect(library.get(APP_ID)?.is_installed).toBe(false)
      }
    )

    it('on status "error", stderr carries the error and the library entry stays installed', async () => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(removePerGameBridgeBottle as jest.Mock).mockResolvedValue({
        status: 'error',
        error: 'cxbottle delete failed'
      })
      const pollSpy = jest
        .spyOn(uninstallPollingModule, 'pollUninstallOnce')
        .mockResolvedValue(undefined)

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.uninstall({} as any)

      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('cxbottle delete failed')
      expect(library.get(APP_ID)?.is_installed).toBe(true)
      expect(result.failed).toBe(true)
      expect(result.refused).toBeUndefined()
      expect(result.stderr).toContain('Failed to remove bridge bottle')
      expect(pollSpy).not.toHaveBeenCalled()
      pollSpy.mockRestore()
      expectOneFailedNotice('Avernum 4')
    })
  })

  // 261017-bqw: a real-filesystem regression proving the legacy shared
  // bottle's uninstall deletes THIS appId's own appmanifest_<appId>.acf
  // alongside the install root. Measured live on 2026-10-17 by quick task
  // 261016-wsq, Arm 2 — uninstalling Avernum 5 (206040) from the legacy
  // bottle left the manifest behind, and the gameStatusUpdate-triggered
  // refresh read it back and re-marked the game installed with a deleted
  // install_path, hiding it from the Library grid.
  describe('261017-bqw: legacy shared bottle — real filesystem manifest unlink', () => {
    let tmp: string
    let bridgeSteamappsDir: string
    let phase17SteamappsDir: string
    let installDir: string
    let manifestPath: string
    let siblingDir: string
    let siblingManifestPath: string

    beforeEach(() => {
      tmp = mkdtempSync(
        realJoin(tmpdir(), 'gamelib-bridge-legacy-uninstall-test-')
      )
      bridgeSteamappsDir = realJoin(tmp, 'bridge', 'steamapps')
      phase17SteamappsDir = realJoin(tmp, 'phase17', 'steamapps')
      installDir = realJoin(bridgeSteamappsDir, 'common', 'Avernum 4')
      manifestPath = realJoin(bridgeSteamappsDir, `appmanifest_${APP_ID}.acf`)
      siblingDir = realJoin(bridgeSteamappsDir, 'common', 'Avernum 6')
      siblingManifestPath = realJoin(
        bridgeSteamappsDir,
        'appmanifest_206060.acf'
      )

      mkdirSync(installDir, { recursive: true })
      mkdirSync(siblingDir, { recursive: true })
      mkdirSync(phase17SteamappsDir, { recursive: true })
      writeFileSync(realJoin(installDir, 'Avernum4.exe'), 'binary-stub')
      writeFileSync(realJoin(siblingDir, 'Avernum 6.exe'), 'binary-stub')
      writeFileSync(manifestPath, 'avernum 4 legacy-bottle manifest')
      writeFileSync(siblingManifestPath, 'avernum 6 legacy-bottle manifest')
      writeFileSync(
        realJoin(phase17SteamappsDir, `appmanifest_${APP_ID}.acf`),
        'avernum 4 phase17-bottle manifest'
      )

      // resetMocks wipes these between tests, and the outer beforeEach keys
      // getBottleSteamappsDir to the fake '/mock/...' paths, so re-arm here
      // against the real tmp tree.
      ;(getBottleSteamappsDir as jest.Mock).mockImplementation(
        (_paths: unknown, bottleName: string) =>
          bottleName === 'GameLibSteamBridge'
            ? bridgeSteamappsDir
            : phase17SteamappsDir
      )
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        realJoin(installDir, 'Avernum4.exe')
      )
      library.set(
        APP_ID,
        makeEntry({
          title: 'Avernum 4',
          is_installed: true,
          install: { install_path: installDir }
        })
      )
    })

    afterEach(() => {
      realRmSync(tmp, { recursive: true, force: true })
    })

    it("removes the install root AND this appId's own appmanifest from the legacy bottle — the sibling legacy game and the Phase 17 bottle's own manifest for the same appId survive untouched", async () => {
      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.uninstall({} as any)

      expect(result).toEqual({ stdout: '', stderr: '' })
      expect(realExistsSync(installDir)).toBe(false)
      expect(realExistsSync(manifestPath)).toBe(false)
      expect(realExistsSync(siblingDir)).toBe(true)
      expect(realExistsSync(realJoin(siblingDir, 'Avernum 6.exe'))).toBe(true)
      expect(realExistsSync(siblingManifestPath)).toBe(true)
      expect(
        realExistsSync(
          realJoin(phase17SteamappsDir, `appmanifest_${APP_ID}.acf`)
        )
      ).toBe(true)
      expect(library.get(APP_ID)?.is_installed).toBe(false)
      expect(removePerGameBridgeBottle).not.toHaveBeenCalled()
    })

    it('quick 261108-anw: an rm error on the install root returns failed, notices once, polls nothing', async () => {
      const pollSpy = jest
        .spyOn(uninstallPollingModule, 'pollUninstallOnce')
        .mockResolvedValue(undefined)
      const rmSpy = failNextRmSync()

      const result = await new SteamGame(APP_ID, steamTestDeps).uninstall(
        {} as any
      )

      expect(rmSpy).toHaveBeenCalled()
      rmSpy.mockRestore()
      expect(result.failed).toBe(true)
      expect(result.refused).toBeUndefined()
      expect(result.stderr).toContain('Failed to remove bridge install')
      expect(pollSpy).not.toHaveBeenCalled()
      expectOneFailedNotice('Avernum 4')
      pollSpy.mockRestore()
    })

    it('a manifest already missing before uninstall still completes with empty stderr (force:true, not an error)', async () => {
      realRmSync(manifestPath, { force: true })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const result = await game.uninstall({} as any)

      expect(result).toEqual({ stdout: '', stderr: '' })
      expect(realExistsSync(installDir)).toBe(false)
      expect(library.get(APP_ID)?.is_installed).toBe(false)
    })
  })

  it('regression: a non-allowlisted title uninstall() never consults resolveBridgeLaunchExe, and (debug/steam-bottle-uninstall-reverts FINAL) routes to direct deletion instead of tellBottledSteamToUninstall', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
    // D-51-09: uninstall() dispatches on LOCATION (findBridgeInstallBottle),
    // not ELIGIBILITY -- this title is a legacy/Phase-17-style install that
    // never lived in the bridge bottle, so the outer beforeEach's blanket
    // isBridgeBottleReady:true default does not model this scenario and
    // must be overridden here.
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
    isBottleReady.mockReturnValue(true)
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
    // debug/steam-bottle-uninstall-reverts (routing fix): the library
    // entry's own install_path is now the routing source of truth — must
    // resolve inside the bottle root (getBottleSteamappsDir's
    // 'GameLibSteam' branch, mocked in this describe's outer beforeEach) for
    // this test to still reach uninstallBottleGameDirectly().
    library.set(
      APP_ID,
      makeEntry({
        title: 'Avernum 4',
        is_installed: true,
        install: { install_path: '/mock/bottle/steamapps/common/Hoard' }
      })
    )
    const readAcfStateSpy = jest
      .spyOn(acfState, 'readAcfState')
      .mockResolvedValue({
        state: 'installed',
        installPath: '/mock/bottle/steamapps/common/Hoard'
      })
    const pollUninstallOnceSpy = jest
      .spyOn(uninstallPollingModule, 'pollUninstallOnce')
      .mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(resolveBridgeLaunchExe).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
    expect(readAcfStateSpy).toHaveBeenCalledWith(
      expect.anything(),
      APP_ID,
      'bottle'
    )
    expect(pollUninstallOnceSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      'bottle'
    )

    readAcfStateSpy.mockRestore()
    pollUninstallOnceSpy.mockRestore()
  })

  // ── D-UAT-24-07 fold-in: markBridgeGameUninstalled() must emit a
  // gameStatusUpdate 'done' — the backend uninstall succeeded, but without
  // this the frontend "Uninstalling" pill never cleared (24-UAT.md RETEST
  // RUN 1 "Also observed").

  it('D-UAT-24-07 fold-in: a completed bridge uninstall emits gameStatusUpdate {status:"done"} (clears the Uninstalling pill) AND pushGameToLibrary with is_installed:false', async () => {
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
  })

  // Live 2026-10-27, Grim Dawn 219990: both bridge removal branches finish
  // through pollUninstallOnce(appId, 'bridge') so a surviving native/bottle
  // copy is noticed (library.test.ts covers what that branch then does).
  it.each([
    ['per-game bottle', true],
    ['legacy shared bottle', false]
  ])(
    'bridge uninstall (%s) completes through pollUninstallOnce(appId, "bridge")',
    async (_label, perGame) => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        RESOLVED_EXE_PATH
      )
      if (perGame) {
        ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
          wineCrossoverBottle: `GameLibSteamBridge-${APP_ID}`
        })
        ;(removePerGameBridgeBottle as jest.Mock).mockResolvedValue({
          status: 'removed'
        })
      }
      const pollSpy = jest
        .spyOn(uninstallPollingModule, 'pollUninstallOnce')
        .mockResolvedValue(undefined)

      await new SteamGame(APP_ID, steamTestDeps).uninstall({} as any)

      if (perGame) {
        expect(removePerGameBridgeBottle).toHaveBeenCalledWith(
          steamTestDeps,
          APP_ID
        )
      }
      expect(pollSpy).toHaveBeenCalledWith(steamTestDeps, APP_ID, 'bridge')
      pollSpy.mockRestore()
    }
  )

  it('D-UAT-24-07 fold-in: gameStatusUpdate {status:"done"} still fires even when the library entry is absent for that appId (resolveBridgeLaunchExe returns undefined — nothing to remove)', async () => {
    library.delete(APP_ID)
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(undefined)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.uninstall({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: APP_ID,
      runner: 'steam',
      status: 'done'
    })
    // No library entry existed, so no pushGameToLibrary for this appId.
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID })
    )
  })
})

// ── LIB-06: parseSteamStorageRequirement ─────────────────────────────────────

describe('parseSteamStorageRequirement', () => {
  it('LIB-06: returns bytes for "15 GB available space" HTML (15 * 1024^3)', () => {
    const html =
      '<ul><li><strong>Storage:</strong> 15 GB available space</li></ul>'
    expect(parseSteamStorageRequirement(html)).toBe(15 * 1024 ** 3) // 16106127360
  })

  it('LIB-06: returns bytes for plain "512 MB available space" (512 * 1024^2)', () => {
    expect(parseSteamStorageRequirement('512 MB available space')).toBe(
      512 * 1024 ** 2
    ) // 536870912
  })

  it('LIB-06: returns undefined for undefined input', () => {
    expect(parseSteamStorageRequirement(undefined)).toBeUndefined()
  })

  it('LIB-06: returns undefined when string contains no size pattern', () => {
    expect(parseSteamStorageRequirement('no size here')).toBeUndefined()
  })

  it('LIB-06: returns undefined for non-string input (array cast — typeof guard)', () => {
    expect(parseSteamStorageRequirement([] as any)).toBeUndefined()
  })
})

// ── MAC32-01: parseSteamMacMinOSVersion / macArchFromMinOS ───────────────────
// Fixtures below are the LITERAL live-fetched mac_requirements.minimum HTML
// strings from 18-RESEARCH.md Pattern 1's corpus (cross-checked against the
// four committed 18-01 appinfo fixtures' real titles).

describe('parseSteamMacMinOSVersion', () => {
  it('canonical bulleted shape: Dota 2 (570) resolves to 10.15', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> macOS 10.15 or newer<br></li>'
      )
    ).toEqual({ major: 10, minor: 15 })
  })

  it('canonical bulleted shape with parenthetical codename: Age of Wonders III (226840, confirmed 32-bit) resolves to 10.9.3', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>'
      )
    ).toEqual({ major: 10, minor: 9 })
  })

  it('"or higher" phrasing: A Hat in Time (253230, false-flag, real 64-bit) resolves to 10.11.6', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> MAC OS X 10.11.6 or higher<br></li>'
      )
    ).toEqual({ major: 10, minor: 11 })
  })

  it('multi-alternative "or higher" list: Half-Life 2 (220) returns the LOWEST alternative (10.5.8, not 10.6.3)', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> Leopard 10.5.8, Snow Leopard 10.6.3, or higher<br></li>'
      )
    ).toEqual({ major: 10, minor: 5 })
  })

  it('tagless run-on prose: Portal resolves to 10.5.8 without the "1GB" RAM figure leaking in', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<strong>Minimum: </strong>OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM, NVIDIA...'
      )
    ).toEqual({ major: 10, minor: 5 })
  })

  it('label+value co-located inside one <strong>, range format: Terraria resolves to the lowest bound (10.9.5, not 10.11.6)', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS: OSX 10.9.5 - 10.11.6</strong> <br></li>'
      )
    ).toEqual({ major: 10, minor: 9 })
  })

  it('decoy digits: Dust: An Elysian Tail resolves via 10.6.8, NOT via the literal "32" in "32/64-bit" (no dot, excluded)', () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> Snow Leopard 10.6.8, 32/64-bit<br>...'
      )
    ).toEqual({ major: 10, minor: 6 })
  })

  it("major > 10: No Man's Sky resolves to 12.3", () => {
    expect(
      parseSteamMacMinOSVersion(
        '<li><strong>OS:</strong> macOS Monterey 12.3<br></li>'
      )
    ).toEqual({ major: 12, minor: 3 })
  })

  it('returns null for undefined input (empty-array proxy: mac_requirements: [] yields undefined via optional chaining)', () => {
    expect(parseSteamMacMinOSVersion(undefined)).toBeNull()
  })

  it('returns null without throwing when no OS line is present at all', () => {
    expect(parseSteamMacMinOSVersion('no os line here at all')).toBeNull()
  })

  it('returns null for non-string input (typeof guard)', () => {
    expect(parseSteamMacMinOSVersion([] as any)).toBeNull()
  })
})

describe('macArchFromMinOS', () => {
  it('Dota 2 (570, min-OS 10.15, Catalina floor) resolves to "64" (confident)', () => {
    expect(
      macArchFromMinOS('<li><strong>OS:</strong> macOS 10.15 or newer<br></li>')
    ).toBe('64')
  })

  it('No Man\'s Sky (min-OS 12.3, major > 10) resolves to "64" (confident)', () => {
    expect(
      macArchFromMinOS('<li><strong>OS:</strong> macOS Monterey 12.3<br></li>')
    ).toBe('64')
  })

  it('Age of Wonders III (226840, min-OS 10.9.3, REAL 32-bit) resolves to "unknown" — never a false-negative assert-32', () => {
    expect(
      macArchFromMinOS('<li><strong>OS:</strong> 10.9.3 (Mavericks)<br></li>')
    ).toBe('unknown')
  })

  it('A Hat in Time (253230, min-OS 10.11.6, REAL 64-bit false-flag) resolves to "unknown" — the false-flag-safe anchor', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS:</strong> MAC OS X 10.11.6 or higher<br></li>'
      )
    ).toBe('unknown')
  })

  it('Half-Life 2 (220, min-OS 10.5.8, lowest of two alternatives) resolves to "unknown"', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS:</strong> Leopard 10.5.8, Snow Leopard 10.6.3, or higher<br></li>'
      )
    ).toBe('unknown')
  })

  it('tagless prose (Portal) resolves to "unknown"', () => {
    expect(
      macArchFromMinOS(
        '<strong>Minimum: </strong>OS X version Leopard 10.5.8, Snow Leopard 10.6.3, 1GB RAM, NVIDIA...'
      )
    ).toBe('unknown')
  })

  it('Terraria range shape resolves to "unknown" (lowest bound 10.9.5)', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS: OSX 10.9.5 - 10.11.6</strong> <br></li>'
      )
    ).toBe('unknown')
  })

  it('Dust: An Elysian Tail decoy digits resolve to "unknown" via 10.6.8, not the literal "32"', () => {
    expect(
      macArchFromMinOS(
        '<li><strong>OS:</strong> Snow Leopard 10.6.8, 32/64-bit<br>...'
      )
    ).toBe('unknown')
  })

  it('undefined input (empty-array proxy) resolves to "unknown" without throwing', () => {
    expect(macArchFromMinOS(undefined)).toBe('unknown')
  })

  it('unparseable text resolves to "unknown" without throwing', () => {
    expect(macArchFromMinOS('no os line here at all')).toBe('unknown')
  })
})

// ── LIB-06: getSteamInstallSize ───────────────────────────────────────────────

describe('getSteamInstallSize', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    // getFileSize is mocked in backend/utils — set a stable return value per test
    ;(
      jest.requireMock('backend/utils').getFileSize as jest.Mock
    ).mockReturnValue('15.00 GiB')
  })

  it('LIB-06: returns installed game size from install_size without calling axios.get', async () => {
    const gameInfo = makeEntry({
      is_installed: true,
      install: { install_size: '15.00 GiB', install_path: '/games/tf2' }
    })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(jest.mocked(axios.get)).not.toHaveBeenCalled()
    // Fast path returns the already-formatted string straight through — no
    // parse, no getFileSize call — regardless of the mocked getFileSize
    // return value configured in beforeEach.
    expect(result).toBe('15.00 GiB')
    expect(
      jest.requireMock('backend/utils').getFileSize as jest.Mock
    ).not.toHaveBeenCalled()
  })

  it('LIB-06: calls store API for uninstalled game and returns parsed size string', async () => {
    jest.mocked(axios.get).mockResolvedValue({
      data: {
        '440': {
          success: true,
          data: {
            name: 'Team Fortress 2',
            pc_requirements: {
              minimum:
                '<ul><li><strong>Storage:</strong> 15 GB available space</li></ul>'
            }
          }
        }
      }
    })
    const gameInfo = makeEntry({ is_installed: false, install: {} })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(jest.mocked(axios.get)).toHaveBeenCalledTimes(1)
    expect(jest.mocked(axios.get)).toHaveBeenCalledWith(
      'https://store.steampowered.com/api/appdetails?appids=440'
    )
    expect(result).not.toBe('?? MB')
  })

  it('LIB-06: returns "?? MB" when axios.get rejects', async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error('Network error'))
    const gameInfo = makeEntry({ is_installed: false, install: {} })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(result).toBe('?? MB')
  })

  it('T-06-01: returns "?? MB" for non-numeric appId without calling axios.get', async () => {
    const result = await getSteamInstallSize('not-an-id')
    expect(result).toBe('?? MB')
    expect(jest.mocked(axios.get)).not.toHaveBeenCalled()
  })
})

// ── SteamGame.forceUninstall() ────────────────────────────────────────────────

describe('SteamGame.forceUninstall()', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2', is_installed: true }))
  })

  it('forceUninstall() keeps the appId in the library marked is_installed:false', async () => {
    expect(library.has(APP_ID)).toBe(true)

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.forceUninstall()

    expect(library.has(APP_ID)).toBe(true)
    expect(library.get(APP_ID)?.is_installed).toBe(false)
    expect(library.get(APP_ID)?.install).toEqual({})
  })

  it('forceUninstall() calls sendFrontendMessage pushGameToLibrary with is_installed: false', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.forceUninstall()

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
  })

  it('GAP-18-06: forceUninstall() preserves mac_arch:32 in the Map and persists to steamLibraryStore', async () => {
    library.set(
      APP_ID,
      makeEntry({
        title: 'Old 32-bit Game',
        is_installed: true,
        mac_arch: '32'
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.forceUninstall()

    // Badge data survives in the Map
    expect(library.get(APP_ID)?.mac_arch).toBe('32')
    expect(library.get(APP_ID)?.is_installed).toBe(false)

    // Persist happened (GAP-17-BOTTLE-STORE-DIVERGENCE class)
    expect(steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.any(Array)
    )

    // The pushed payload carries the badge data
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: APP_ID,
        is_installed: false,
        mac_arch: '32'
      })
    )
  })

  it('R5 (D-17, 34.13-14): forceUninstall() does NOT clear the forced verdict — the bits were never removed', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true,
      forcedWindowsViaBottle: true
    })

    const game = new SteamGame(APP_ID, steamTestDeps)
    await game.forceUninstall()

    // forceUninstall() only touches the library Map/steamLibraryStore — it
    // never calls steamMetadataStore.set, so the persisted verdict is
    // untouched (still true — the files are still in the bottle).
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })
})

// ── MAC32-03 Task 3: promptI386Recovery — i386 recovery (CONTEXT D-6) ─────────
//
// Given verifyMacArchGroundTruth (library.ts, Task 2) has already flipped and
// cached mac_arch:'32' for this appId, promptI386Recovery is the decoupled,
// user-consented recovery: confirm → forceUninstall() the dead native copy,
// then install() — which now routes through the bottle because
// isBottleEligible() honors the cached mac_arch:'32' verdict. Cancel → neither
// is called, the '32' verdict (persisted independently by
// verifyMacArchGroundTruth before this prompt ever fires) is left untouched.

describe('promptI386Recovery() — MAC32-03 i386 recovery (CONTEXT D-6)', () => {
  let shellOpenExternal: jest.Mock
  let dialogShowMessageBox: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance

  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell, dialog } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    dialogShowMessageBox = dialog.showMessageBox
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    library.set(
      APP_ID,
      makeEntry({ title: 'Old 32-bit Game', is_installed: true })
    )
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    isBottleReady.mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    envMock.isMac = false
  })

  it('confirmed dialog — forceUninstall() then install() (bottle path, mac_arch:32) are invoked', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_source: 'macho',
      mac_arch_verified: true,
      // D-51-09: a confirmed-32-bit mac build is bottle-eligible via
      // MAC32-02's own mac_arch==='32' branch, independent of is_mac_native
      // -- same obsolete-default conflict as B3/B4/F8/W6/A-19 above. Pin
      // the bottle route; this test is about i386-recovery's
      // forceUninstall()->install() sequencing, not bridge routing.
      bridge: { userRoute: 'bottle' }
    })
    dialogShowMessageBox.mockResolvedValue({ response: 0 })
    isBottleReady.mockReturnValue(true)
    const installBottleNative = trackSpy(
      jest.spyOn(gameInstallDepot, 'installBottleNative')
    ).mockResolvedValue({ status: 'done' } as any)

    await macArch.promptI386Recovery(steamTestDeps, APP_ID)

    expect(dialogShowMessageBox).toHaveBeenCalledTimes(1)
    // forceUninstall(): kept in the in-memory library, marked not-installed
    // (keep-entry — recovery no longer orphans the game) + pushed not-installed
    expect(library.has(APP_ID)).toBe(true)
    expect(library.get(APP_ID)?.is_installed).toBe(false)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
    // install(): routes through the bottle (mac_arch:'32' → isBottleEligible())
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(installBottleNative).toHaveBeenCalledTimes(1)
    installBottleNative.mockRestore()
  })

  it('cancelled dialog — neither forceUninstall() nor install() is invoked, mac_arch 32 stays cached', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      mac_arch: '32',
      mac_arch_source: 'macho',
      mac_arch_verified: true
    })
    dialogShowMessageBox.mockResolvedValue({ response: 1 })

    await macArch.promptI386Recovery(steamTestDeps, APP_ID)

    expect(dialogShowMessageBox).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).not.toHaveBeenCalled()
    // forceUninstall() never ran — the native (unrunnable) install stays in
    // the in-memory library untouched.
    expect(library.has(APP_ID)).toBe(true)
    // The '32' verdict (cached independently by verifyMacArchGroundTruth
    // before this prompt fires) is never touched by promptI386Recovery itself.
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })
})

// ── Supporting read methods: getSettings, getExtraInfo, isGameAvailable ───────

describe('SteamGame supporting read methods — GAME-01 unblock', () => {
  let existsSyncMock: jest.Mock

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    existsSyncMock = jest.requireMock('graceful-fs').existsSync as jest.Mock
    // quick-260817-d61: re-establish steamUser.ensureConnected() (resetMocks:
    // true wipes the factory-supplied mockResolvedValue before every test) --
    // getExtraInfo()'s locked->unlocked transition fire-and-forgets a call to
    // it, and a bare jest.fn() with no implementation returns undefined,
    // which would throw synchronously on .catch().
    jest.mocked(steamUser.ensureConnected).mockResolvedValue(true)
    // Re-establish GameConfig mock (resetMocks: true clears return values between tests)
    const mockSettings = {
      autoSyncSaves: false,
      savesPath: '',
      gogSaves: [],
      wineVersion: { name: 'Wine', type: 'wine', bin: '' },
      winePrefix: '',
      wineCrossoverBottle: '',
      autoInstallDxvk: false,
      autoInstallDxvkNvapi: false,
      autoInstallVkd3d: false,
      preferSystemLibs: false,
      enableEsync: false,
      enableFsync: false,
      enableFsrSharpening: false,
      maxSharpening: false,
      enableDXVKFpsLimit: false,
      DXVKFpsCap: '0',
      targetExe: '',
      verboseLogs: false,
      launcherArgs: '',
      enviromentOptions: [],
      wrapperOptions: []
    }
    ;(
      jest.requireMock('backend/game_config').GameConfig.get as jest.Mock
    ).mockReturnValue({
      config: undefined,
      getSettings: jest.fn().mockResolvedValue(mockSettings)
    })
    library.set(APP_ID, makeEntry())
  })

  // ── getSettings ────────────────────────────────────────────────────────────

  it('getSettings() resolves a GameSettings object with autoSyncSaves === false', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    const settings = await game.getSettings()

    expect(settings).toBeDefined()
    expect(settings.autoSyncSaves).toBe(false)
  })

  it('getSettings() does not throw', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.getSettings()).resolves.not.toThrow()
  })

  // ── Phase 17 (D-11): getSettings() bottle-eligible resolution ────────────
  //
  // LAUNCH ORDERING: launcher.ts's launchEventCallback runs checkWineBeforeLaunch
  // BEFORE game.launch() for a bottle-eligible game (isNative()===false) — that
  // pre-step consumes THIS getSettings() result. It must resolve the dedicated
  // bottle store (getSteamBottleSettings), never fall through to an empty
  // per-appId gameConfigs.get(<numeric appId>) (Pitfall-6 phantom-config guard).

  describe('bottle-eligible resolution (D-11)', () => {
    let envMock: any

    beforeEach(() => {
      envMock = jest.requireMock('backend/constants/environment')
      envMock.isMac = true
      envMock.isWindows = false
      envMock.isLinux = false
      getSteamBottleSettings.mockReset()
    })

    it('bottle-eligible game: getSettings() resolves getSteamBottleSettings(), NOT gameConfigs.get(<appId>)', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      const bottleSettings = {
        autoSyncSaves: false,
        wineVersion: { name: 'CrossOver', type: 'crossover', bin: '' },
        wineCrossoverBottle: 'GameLibSteam'
      }
      getSteamBottleSettings.mockReturnValue(bottleSettings)
      const gameConfigGetMock = jest.requireMock('backend/game_config')
        .GameConfig.get as jest.Mock
      gameConfigGetMock.mockClear()

      const game = new SteamGame(APP_ID, steamTestDeps)
      const settings = await game.getSettings()

      expect(settings).toBe(bottleSettings)
      expect(getSteamBottleSettings).toHaveBeenCalledTimes(1)
      expect(gameConfigGetMock).not.toHaveBeenCalled()
    })

    it('non-eligible macOS game (Mac-native): getSettings() falls back to gameConfigs.get(<appId>) unchanged', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: true
      })
      const gameConfigGetMock = jest.requireMock('backend/game_config')
        .GameConfig.get as jest.Mock
      gameConfigGetMock.mockReturnValue({
        config: undefined,
        getSettings: jest.fn().mockResolvedValue({ autoSyncSaves: false })
      })

      const game = new SteamGame(APP_ID, steamTestDeps)
      const settings = await game.getSettings()

      expect(gameConfigGetMock).toHaveBeenCalledWith(APP_ID)
      expect(getSteamBottleSettings).not.toHaveBeenCalled()
      expect(settings.autoSyncSaves).toBe(false)
    })
  })

  // ── getExtraInfo ───────────────────────────────────────────────────────────

  it('getExtraInfo() resolves in-memory GameInfo.extra when present', async () => {
    const extraData = {
      reqs: [],
      about: { description: 'A great game', shortDescription: 'A great game' }
    }
    library.set(APP_ID, makeEntry({ extra: extraData }))

    const game = new SteamGame(APP_ID, steamTestDeps)
    const extra = await game.getExtraInfo()

    expect(extra).toEqual(extraData)
  })

  it('getExtraInfo() resolves a safe default when extra is absent', async () => {
    library.set(APP_ID, makeEntry({ extra: undefined }))

    const game = new SteamGame(APP_ID, steamTestDeps)
    const extra = await game.getExtraInfo()

    expect(extra).toEqual(
      expect.objectContaining({
        reqs: [],
        about: expect.objectContaining({
          description: '',
          shortDescription: ''
        })
      })
    )
  })

  it('getExtraInfo() does not throw', async () => {
    const game = new SteamGame(APP_ID, steamTestDeps)
    await expect(game.getExtraInfo()).resolves.not.toThrow()
  })

  // ── isGameAvailable ────────────────────────────────────────────────────────

  it('isGameAvailable() resolves true when game is installed and install_path existsSync returns true', async () => {
    existsSyncMock.mockReturnValue(true)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const available = await game.isGameAvailable()

    expect(available).toBe(true)
    expect(existsSyncMock).toHaveBeenCalledWith('/games/dota2')
  })

  it('isGameAvailable() resolves false when game is not installed', async () => {
    library.set(APP_ID, makeEntry({ is_installed: false, install: {} }))

    const game = new SteamGame(APP_ID, steamTestDeps)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves false when install_path does not exist on disk', async () => {
    existsSyncMock.mockReturnValue(false)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves TRUE when game is delisted and installed with an existing install_path (D-15, Dead Island/91310 specimen) — LIB-07 gate removed', async () => {
    existsSyncMock.mockReturnValue(true)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        is_delisted: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const available = await game.isGameAvailable()

    expect(available).toBe(true)
  })

  it('isGameAvailable() still resolves false when game is delisted and NOT installed — removal did not turn the function into "always true"', async () => {
    library.set(
      APP_ID,
      makeEntry({ is_installed: false, is_delisted: true, install: {} })
    )

    const game = new SteamGame(APP_ID, steamTestDeps)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  // ── Debug session steam-library-22-games-missing (2026-08-21): getGameInfo
  // persisted-cache fallback ──────────────────────────────────────────────
  //
  // Before the fix, an empty in-memory `library` Map (renderer boot before
  // SteamLibraryManager.refresh()'s CM sync populates it) made getGameInfo()
  // return `{} as GameInfo`, which made isGameAvailable() resolve false for
  // an owned, previously-installed game -- a false negative that got
  // persisted into the frontend's `nonAvailableGames` localStorage exclusion
  // list with nothing to ever re-check it (see reconcileNonAvailableGames,
  // src/frontend/hooks/constants.ts).

  it('getGameInfo() falls back to the persisted steamLibraryStore cache when the in-memory library Map is empty', () => {
    // The describe-level beforeEach seeds `library` with a default makeEntry()
    // for the OTHER tests in this block -- undo that here so this test's
    // premise (in-memory Map genuinely empty) actually holds.
    library.delete(APP_ID)
    const fixture = makeEntry({
      is_installed: true,
      install: { install_path: '/games/dota2' }
    })
    ;(steamLibraryStore.get as jest.Mock).mockReturnValue([fixture])

    const result = new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    expect(result.app_name).toBe(APP_ID)
    expect(result.is_installed).toBe(true)
  })

  it('getGameInfo() persisted-cache fallback self-heals the in-memory library Map (only reads the store once)', () => {
    library.delete(APP_ID)
    ;(steamLibraryStore.get as jest.Mock).mockReturnValue([
      makeEntry({
        is_installed: true,
        install: { install_path: '/games/dota2' }
      })
    ])

    const game = new SteamGame(APP_ID, steamTestDeps)
    game.getGameInfo()

    expect(library.get(APP_ID)?.app_name).toBe(APP_ID)

    // Second call must be served from the now-populated in-memory Map, not
    // another steamLibraryStore.get() read.
    ;(steamLibraryStore.get as jest.Mock).mockClear()
    game.getGameInfo()
    expect(steamLibraryStore.get).not.toHaveBeenCalled()
  })

  it('getGameInfo() returns {} when the appId is absent from BOTH the in-memory Map and the persisted cache', () => {
    library.delete(APP_ID)
    ;(steamLibraryStore.get as jest.Mock).mockReturnValue([])

    const result = new SteamGame(APP_ID, steamTestDeps).getGameInfo()

    expect(result).toEqual({})
  })

  // ── quick task 260905-luf (D-01): the double cache miss is now logged once
  // per appId, not silent ────────────────────────────────────────────────
  describe('260905-luf: getGameInfo() double cache miss logging (log-once per appId)', () => {
    beforeEach(() => {
      resetLoggedEmptyGameInfoMisses()
    })

    it('still returns the {} sentinel unchanged — the logging addition is not a behavior change to the cross-runner contract', () => {
      library.delete(APP_ID)
      ;(steamLibraryStore.get as jest.Mock).mockReturnValue([])

      const result = new SteamGame(APP_ID, steamTestDeps).getGameInfo()

      expect(result).toEqual({})
    })

    it('logs a warning via backend/logger on a double cache miss for a given appId', () => {
      library.delete(APP_ID)
      ;(steamLibraryStore.get as jest.Mock).mockReturnValue([])
      const { logWarning } = jest.requireMock('backend/logger')

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()

      expect(logWarning).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining(APP_ID)]),
        expect.anything()
      )
    })

    it('does NOT log again for the SAME appId on a second double cache miss within the same process (log-once, T-luf-02 flood guard)', () => {
      library.delete(APP_ID)
      ;(steamLibraryStore.get as jest.Mock).mockReturnValue([])
      const { logWarning } = jest.requireMock('backend/logger')

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      expect(logWarning).toHaveBeenCalledTimes(1)

      // Second double-miss lookup for the same appId, same process.
      library.delete(APP_ID)
      new SteamGame(APP_ID, steamTestDeps).getGameInfo()

      expect(logWarning).toHaveBeenCalledTimes(1)
    })

    it('DOES log again for a DIFFERENT appId — the guard is scoped per appId, not a single global latch', () => {
      const OTHER_LUF_APP_ID = '271590'
      library.delete(APP_ID)
      library.delete(OTHER_LUF_APP_ID)
      ;(steamLibraryStore.get as jest.Mock).mockReturnValue([])
      const { logWarning } = jest.requireMock('backend/logger')

      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
      new SteamGame(OTHER_LUF_APP_ID, steamTestDeps).getGameInfo()

      expect(logWarning).toHaveBeenCalledTimes(2)
      expect(logWarning).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining(APP_ID)]),
        expect.anything()
      )
      expect(logWarning).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining(OTHER_LUF_APP_ID)]),
        expect.anything()
      )
    })
  })

  it('isGameAvailable() resolves true via the persisted-cache fallback when the in-memory library Map has not been hydrated yet (the exact hydration-race false negative this session diagnosed)', async () => {
    library.delete(APP_ID)
    existsSyncMock.mockReturnValue(true)
    ;(steamLibraryStore.get as jest.Mock).mockReturnValue([
      makeEntry({
        is_installed: true,
        install: { install_path: '/games/dota2' }
      })
    ])

    const game = new SteamGame(APP_ID, steamTestDeps)
    const available = await game.isGameAvailable()

    expect(available).toBe(true)
  })
})

// ── CONSOLE-01 Gap B: is_delisted detection in fetchMetadataIfNeeded ──────────
//
// These tests verify all three behavioural branches of the delisted-detection
// logic in fetchMetadataIfNeeded. The gap was previously grep-verified only.
//
// Branch 1 — DEFINITIVE DELISTED: success:false → is_delisted:true written.
// Branch 2 — AVAILABLE / CLEARED:  success:true with data → is_delisted:false.
// Branch 3 — TRANSIENT (ambiguous empty envelope): no is_delisted write.
// Branch 4 — TRANSIENT (network throw / catch block): no is_delisted write.

describe('SteamGame.fetchMetadataIfNeeded — is_delisted detection (CONSOLE-01 Gap B)', () => {
  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
  })

  it('CONSOLE-01/B1: success:false response sets is_delisted:true on steamMetadataStore, library entry, and pushGameToLibrary', async () => {
    // Arrange: Steam appdetails returns a definitive "no such app" envelope.
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { [APP_ID]: { success: false } }
    })
    // Seed the metadata store with existing art so the merge preserves it.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: 'https://example.com/old-art.jpg',
      art_square: 'https://example.com/old-sq.jpg',
      extra: { reqs: [] }
    })
    library.set(APP_ID, makeEntry())

    // Act: fire getGameInfo → triggers fetchMetadataIfNeeded as fire-and-forget.
    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    // Assert 1: steamMetadataStore persists the delisted flag.
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_delisted: true })
    )
    // Assert 2: in-memory library entry carries is_delisted:true.
    expect(library.get(APP_ID)?.is_delisted).toBe(true)
    // Assert 3: frontend receives the updated GameInfo with is_delisted:true.
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_delisted: true })
    )
  })

  it('CONSOLE-01/B2: success:true response clears is_delisted to false on steamMetadataStore, library entry, and pushGameToLibrary', async () => {
    // Arrange: a normal successful appdetails response (existing fixture).
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    // Act
    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    // Assert 1: steamMetadataStore carries is_delisted:false (stale flag cleared).
    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({ is_delisted: false })
    )
    // Assert 2: in-memory library entry has is_delisted:false.
    expect(library.get(APP_ID)?.is_delisted).toBe(false)
    // Assert 3: frontend push carries is_delisted:false.
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ is_delisted: false })
    )
  })

  it('CONSOLE-01/B3: ambiguous empty envelope (no success, no data) does NOT write is_delisted — transient failure must not hide owned games', async () => {
    // Arrange: envelope present but both success and data are absent.
    // This represents a rate-limit or partial API response — NOT a delisted verdict.
    ;(axios.get as jest.Mock).mockResolvedValue({
      data: { [APP_ID]: {} }
    })
    library.set(APP_ID, makeEntry())

    // Act
    new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    await flushAsync()

    // Assert: no persistence write whatsoever — transient branch returns early.
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    // Assert: no game pushed — owned game must remain visible (the
    // steamMetadataSyncing on/off signals are expected + allowed).
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })

  it('CONSOLE-01/B4: network error (axios throw) does NOT write is_delisted — catch block must never mark owned games delisted', async () => {
    // Arrange: axios rejects — simulates offline / network timeout.
    ;(axios.get as jest.Mock).mockRejectedValue(new Error('Network timeout'))
    library.set(APP_ID, makeEntry())

    // Act — must not throw synchronously or cause an unhandled rejection.
    expect(() =>
      new SteamGame(APP_ID, steamTestDeps).getGameInfo()
    ).not.toThrow()
    await flushAsync()

    // Assert: catch block only logs; no store write, no game pushed (the
    // steamMetadataSyncing on/off signals are expected + allowed).
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })
})

// ── maybeNotifyBridgeLimited() — D-51-02/D-51-04 (Phase 51 Plan 12) ─────────
//
// Deliberately a STANDALONE top-level describe, appended at the END of the
// file rather than nested inside "SteamGame.launch() — Phase 24 Plan 08
// bridge routing" (where this behavior is actually wired in). That describe
// (and several later ones -- "Phase 17 bottle routing", "SNI-08") share a
// module-scoped `bridgeFailedThisSession` Set (games.ts) that is cleared in
// EVERY test's beforeEach but is left SET by whichever test happens to run
// last before those later describes -- an existing, order-dependent
// fragility (not something this plan introduces or is in scope to fix:
// `resolveBridgeRoute`'s rule 2, `failedThisSession -> bottle`, is what
// "Phase 17"/"SNI-08"'s own tests implicitly rely on to avoid the Phase
// 51-09 'pending-scan' default routing them to the bridge instead).
// Measured empirically: inserting ANY extra test (even a no-op) at the END
// of that describe flips 8 later, unrelated tests to failure by changing
// which test last touches that shared Set. A standalone describe at the
// very end of the file -- after every other describe has already run --
// cannot disturb that ordering at all, so this builds its own complete
// mock setup from scratch instead of reusing that describe's.
describe('maybeNotifyBridgeLimited() — the one-time limited-features notice plus the every-launch [bridge-notice] log line', () => {
  const RESOLVED_EXE_PATH =
    '/mock/bridge/bottle/steamapps/common/Avernum 4/Avernum4.exe'

  let envMock: any
  let setBridgeIdentityFallbackSpy: jest.SpyInstance
  let markBridgeLimitedNoticeShownSpy: jest.SpyInstance

  beforeEach(() => {
    resetBridgeFailedSession()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Avernum 4' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(bridgeAllowlist.knownBadReason as jest.Mock).mockReturnValue(null)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(RESOLVED_EXE_PATH)
    ;(getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: 'GameLibSteamBridge'
    })
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: RESOLVED_EXE_PATH
    })
    ;(writeBridgeConfig as jest.Mock).mockReturnValue({
      status: 'written',
      path: '/mock/.../gamelib_bridge.cfg'
    })
    runWineCommand.mockResolvedValue({ stdout: '', stderr: '' })
    stopBridgeHelper.mockReset()
    startBottleProcessMonitor.mockReset()
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bridge/bottle/steamapps'
    )
    ;(getBottleDir as jest.Mock).mockReturnValue('/mock/bridge/bottle')

    // bridgeVerdict.ts is real/unmocked in this file -- spy (not replace) so
    // the real steamMetadataStore.set() write still happens, mirroring this
    // file's own setBridgeUserRoute spy precedent.
    setBridgeIdentityFallbackSpy = jest.spyOn(
      bridgeVerdictModule,
      'setBridgeIdentityFallback'
    )
    markBridgeLimitedNoticeShownSpy = jest.spyOn(
      bridgeVerdictModule,
      'markBridgeLimitedNoticeShown'
    )
  })

  afterEach(() => {
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
    setBridgeIdentityFallbackSpy.mockRestore()
    markBridgeLimitedNoticeShownSpy.mockRestore()
  })

  it('D-51-04: fallback-identity launch -> setBridgeIdentityFallback(appId, true), logs [bridge-notice] reason=identity-fallback, runWineCommand still called, steamBridgeSetupRequired never sent', async () => {
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'fallback-identity',
      ready: true,
      port: 55123,
      secret: BRIDGE_TEST_SECRET
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    const { logInfo } = jest.requireMock('backend/logger')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
    expect(runWineCommand).toHaveBeenCalledTimes(1)
    expect(setBridgeIdentityFallbackSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      true
    )
    expect(logInfo).toHaveBeenCalledWith(
      `[bridge-notice] appId=${APP_ID} reason=identity-fallback`,
      'Steam'
    )
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'steamBridgeSetupRequired',
      expect.anything()
    )
    // D-51-02: first-ever launch for this appId -- notify() fires once,
    // body = limited.body PLUS limited.identityFallback appended.
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'gamelib:steam.bridge.limited.title',
      body:
        'gamelib:steam.bridge.limited.body ' +
        'gamelib:steam.bridge.limited.identityFallback'
    })
    expect(markBridgeLimitedNoticeShownSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID
    )
  })

  it('D-51-02: ready launch with stubbedInterfaces logs [bridge-notice] reason=stubbed:<list> on EVERY launch; notify() fires on the first launch only, then markBridgeLimitedNoticeShown persists so a later launch logs but never notifies again', async () => {
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true,
      port: 55123,
      secret: BRIDGE_TEST_SECRET
    })
    const { logInfo } = jest.requireMock('backend/logger')
    const stubbedScan = {
      status: 'clean' as const,
      arch: 'x86' as const,
      missingSymbols: [],
      interfaceVersions: {},
      stubbedInterfaces: ['SteamRemoteStorage', 'SteamNetworking'],
      shimExportSetVersion: 'v1',
      scannedAt: '2026-10-21T00:00:00Z'
    }

    // First launch: limitedNoticeShown not yet set.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { scan: stubbedScan }
    })

    const firstGame = new SteamGame(APP_ID, steamTestDeps)
    await firstGame.launch({} as any)

    expect(logInfo).toHaveBeenCalledWith(
      `[bridge-notice] appId=${APP_ID} reason=stubbed:SteamRemoteStorage,SteamNetworking`,
      'Steam'
    )
    expect(notify).toHaveBeenCalledTimes(1)
    expect(markBridgeLimitedNoticeShownSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID
    )
    expect(setBridgeIdentityFallbackSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      false
    )

    // Second launch: the persisted verdict now carries limitedNoticeShown:
    // true -- logs again (every launch), but notify() never fires again.
    ;(notify as jest.Mock).mockClear()
    ;(logInfo as jest.Mock).mockClear()
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false,
      bridge: { scan: stubbedScan, limitedNoticeShown: true }
    })

    const secondGame = new SteamGame(APP_ID, steamTestDeps)
    await secondGame.launch({} as any)

    expect(logInfo).toHaveBeenCalledWith(
      `[bridge-notice] appId=${APP_ID} reason=stubbed:SteamRemoteStorage,SteamNetworking`,
      'Steam'
    )
    expect(notify).not.toHaveBeenCalled()
  })

  it('D-51-02/D-51-04: a clean verdict with no stubbed interfaces and no identity fallback logs nothing, never notifies, but still persists setBridgeIdentityFallback(appId, false)', async () => {
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true,
      port: 55123,
      secret: BRIDGE_TEST_SECRET
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    const { logInfo } = jest.requireMock('backend/logger')

    const game = new SteamGame(APP_ID, steamTestDeps)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
    expect(logInfo).not.toHaveBeenCalledWith(
      expect.stringContaining('[bridge-notice]'),
      expect.anything()
    )
    expect(notify).not.toHaveBeenCalled()
    expect(setBridgeIdentityFallbackSpy).toHaveBeenCalledWith(
      steamTestDeps,
      APP_ID,
      false
    )
  })
})

describe('SteamGame shortcuts delegate to the shared module (261026-c7r)', () => {
  it('addShortcuts calls the shared addShortcuts with (this, fromMenu)', async () => {
    const spy = shortcutsModule.addShortcuts as jest.Mock
    spy.mockResolvedValue(undefined)
    const game = new SteamGame(APP_ID, steamTestDeps)

    await game.addShortcuts(true)

    expect(spy).toHaveBeenCalledWith(game.deps, game, true)
  })

  it('removeShortcuts calls the shared removeShortcuts with (deps, this)', async () => {
    const spy = shortcutsModule.removeShortcuts as jest.Mock
    spy.mockResolvedValue(undefined)
    const game = new SteamGame(APP_ID, steamTestDeps)

    await game.removeShortcuts()

    expect(spy).toHaveBeenCalledWith(steamTestDeps, game)
  })

  it('propagates a rejection from the shared addShortcuts', async () => {
    ;(shortcutsModule.addShortcuts as jest.Mock).mockRejectedValue(
      new Error('Could not write shortcuts: boom')
    )

    await expect(
      new SteamGame(APP_ID, steamTestDeps).addShortcuts(true)
    ).rejects.toThrow('boom')
  })
})

// ── Phase 56 (56-12): steamclient-layer DRM mode ─────────────────────────────
describe('Phase 56: steamclient-layer DRM mode (56-12)', () => {
  const realFs = jest.requireActual<typeof import('node:fs')>('node:fs')
  const { logInfo, logWarning } = jest.requireMock('backend/logger')
  const mockedAppFolder = mockedLaunchPaths.appFolder
  const { formatDrmNoticeLine, formatBridgeDrmAnchor, DRM_STEPS } =
    jest.requireActual('../bridge/drm/steamclientLayerMode')
  const { formatDrmTraceLine, drmRelogPrefix } = jest.requireActual(
    '../bridge/drm/drmTrace'
  )
  const tmpDirs: string[] = []
  const makeTmp = () => {
    const d = mkdtempSync(realJoin(tmpdir(), 'gamelib drm '))
    tmpDirs.push(d)
    return d
  }
  afterEach(() => {
    for (const d of tmpDirs.splice(0))
      realRmSync(d, { recursive: true, force: true })
    realRmSync(mockedAppFolder, { recursive: true, force: true })
  })

  const traceLine = (
    appId: string,
    role: 'game' | 'helper' = 'game',
    n = 1
  ): string =>
    formatDrmTraceLine({
      appId,
      pid: 100 + n,
      role,
      event: 'call',
      name: `Fn${n}`
    })

  describe('helpers', () => {
    const base = {
      appId: '219990',
      traceFile:
        '/Users/a b/Library/Application Support/GameLib/steam-bridge/drm/trace/219990-1761084000123.log',
      macSteamClientDir:
        '/Users/a b/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS',
      steamDirHost:
        '/Users/a b/Library/Application Support/CrossOver/Bottles/GameLibSteamBridge-219990/drive_c/Program Files (x86)/Steam',
      windowsDllDir:
        '/Users/a b/Library/Application Support/GameLib/steam-bridge/drm/runners/crossover-26.3.0.39832/CrossOver/lib/wine/x86_64-windows',
      unixDllDir:
        '/Users/a b/Library/Application Support/GameLib/steam-bridge/drm/runners/crossover-26.3.0.39832/CrossOver/lib/wine/x86_64-unix',
      launchForm: 'bin/wine+CX_BOTTLE' as DrmLaunchForm,
      dllPathChannel: 'not-needed' as DrmDllPathChannel,
      dllOverridesChannel: 'dll-option' as DrmDllOverridesChannel,
      base: [] as { key: string; value: string }[]
    }
    const okEnv = (over: Partial<typeof base> = {}) => {
      const r = buildDrmLaunchEnvironment({ ...base, ...over })
      if (r.status !== 'ok') throw new Error(r.cause)
      return r
    }
    const keys = (r: { enviromentOptions: { key: string }[] }) =>
      r.enviromentOptions.map((e) => e.key)

    it('channel constants equal the 56-01 SUMMARY values', () => {
      const text = realFs.readFileSync(
        realJoin(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          '..',
          '.planning',
          'milestones',
          'v0.9-phases',
          '56-bridge-steamclient-layer-drm-mode-for-steamstub-titles',
          '56-01-SUMMARY.md'
        ),
        'utf8'
      )
      expect(/^dllpath_channel: ([a-z_-]+)/m.exec(text)?.[1]).toBe(
        DRM_DLLPATH_CHANNEL
      )
      expect(/^dlloverrides_channel: ([a-z_-]+)/m.exec(text)?.[1]).toBe(
        DRM_DLLOVERRIDES_CHANNEL
      )
    })

    it('always sets trace, SteamGameId, SteamAppId and the client dir once, replacing duplicates', () => {
      const r = okEnv({
        base: [
          { key: 'FOO', value: 'bar' },
          { key: 'steamappid', value: '1' },
          { key: 'GAMELIB_DRM_TRACE_FILE', value: '/old' }
        ]
      })
      const entries = Object.fromEntries(
        r.enviromentOptions.map((e) => [e.key, e.value])
      )
      expect(entries.GAMELIB_DRM_TRACE_FILE).toBe(base.traceFile)
      expect(entries.SteamGameId).toBe('219990')
      expect(entries.SteamAppId).toBe('219990')
      expect(entries.STEAM_COMPAT_CLIENT_INSTALL_PATH).toBe(
        base.macSteamClientDir
      )
      expect(
        keys(r).filter((k) => k.toLowerCase() === 'steamappid')
      ).toHaveLength(1)
      expect(keys(r)[0]).toBe('FOO')
      expect(keys(r)).toHaveLength(5)
    })

    it("overrides channel 'env' rewrites WINEDLLOVERRIDES", () => {
      const r = okEnv({
        dllOverridesChannel: 'env',
        base: [
          { key: 'WINEDLLOVERRIDES', value: 'nvapi64=d;steamclient64,d3d9=b' }
        ]
      })
      expect(
        r.enviromentOptions.find((e) => e.key === 'WINEDLLOVERRIDES')?.value
      ).toBe('nvapi64=d;d3d9=b;steamclient=n;steamclient64=n;lsteamclient=b')
      expect(r.commandPrefix).toEqual([])
      const bare = okEnv({ dllOverridesChannel: 'env' })
      expect(
        bare.enviromentOptions.find((e) => e.key === 'WINEDLLOVERRIDES')?.value
      ).toBe('steamclient=n;steamclient64=n;lsteamclient=b')
    })

    it("overrides channel 'dll-option' puts --dll= in argv and adds no env", () => {
      const r = okEnv()
      expect(keys(r)).not.toContain('WINEDLLOVERRIDES')
      expect(r.commandPrefix).toEqual([
        '--dll=steamclient=n;steamclient64=n;lsteamclient=b'
      ])
    })

    it("'cx_env' carries both variables in one CX_ENV entry", () => {
      const r = okEnv({
        dllOverridesChannel: 'cx_env',
        dllPathChannel: 'cx_env',
        base: [{ key: 'CX_ENV', value: 'A=1' }]
      })
      const drmPath = [
        base.steamDirHost,
        base.windowsDllDir,
        base.unixDllDir
      ].join(':')
      expect(keys(r).filter((k) => k === 'CX_ENV')).toHaveLength(1)
      expect(r.enviromentOptions.find((e) => e.key === 'CX_ENV')?.value).toBe(
        `A=1 WINEDLLOVERRIDES='steamclient=n;steamclient64=n;lsteamclient=b' WINEDLLPATH='${drmPath}'`
      )
    })

    it("'registry' yields three HKCU reg argv and never HKLM", () => {
      const r = okEnv({ dllOverridesChannel: 'registry' })
      const hk = 'HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides'
      expect(r.registryCommands).toEqual([
        ['reg', 'add', hk, '/v', 'steamclient', '/d', 'native', '/f'],
        ['reg', 'add', hk, '/v', 'steamclient64', '/d', 'native', '/f'],
        ['reg', 'add', hk, '/v', 'lsteamclient', '/d', 'builtin', '/f']
      ])
      const all = JSON.stringify(r.registryCommands)
      expect(all).not.toMatch(/HKEY_LOCAL_MACHINE|HKLM/)
    })

    it("path channel 'env' appends the base value; 'not-needed' adds nothing", () => {
      const r = okEnv({
        dllPathChannel: 'env',
        base: [{ key: 'WINEDLLPATH', value: '/x' }]
      })
      expect(
        r.enviromentOptions.find((e) => e.key === 'WINEDLLPATH')?.value
      ).toBe(`${base.steamDirHost}:${base.windowsDllDir}:${base.unixDllDir}:/x`)
      expect(keys(okEnv())).not.toContain('WINEDLLPATH')
    })

    it('raw-only is the env channel under the raw form and an error otherwise', () => {
      const raw = okEnv({
        launchForm: 'raw WINELOADER+WINEPREFIX',
        dllPathChannel: 'raw-only',
        dllOverridesChannel: 'raw-only'
      })
      expect(keys(raw)).toEqual(
        expect.arrayContaining(['WINEDLLPATH', 'WINEDLLOVERRIDES'])
      )
      for (const over of [
        { dllPathChannel: 'raw-only' as const },
        { dllOverridesChannel: 'raw-only' as const }
      ]) {
        const r = buildDrmLaunchEnvironment({ ...base, ...over })
        expect(r.status).toBe('error')
        expect((r as { cause: string }).cause).toContain('raw-only')
      }
    })

    it('rejects invalid inputs', () => {
      const bad: Partial<typeof base>[] = [
        { appId: 'abc' },
        { traceFile: 'relative/x.log' },
        { macSteamClientDir: 'rel' },
        { steamDirHost: 'rel' },
        { windowsDllDir: 'rel' },
        { traceFile: '/x/\nx' },
        { windowsDllDir: '/a:b' },
        { steamDirHost: '/a:b' },
        { dllPathChannel: 'cx_env', unixDllDir: "/it's:x" }
      ]
      for (const over of bad) {
        expect(buildDrmLaunchEnvironment({ ...base, ...over }).status).toBe(
          'error'
        )
      }
      expect(
        buildDrmLaunchEnvironment({
          ...base,
          dllPathChannel: 'cx_env',
          unixDllDir: "/it's"
        }).status
      ).toBe('error')
    })

    it('drmBottleWinPath maps into drive_c and refuses escapes', () => {
      expect(
        drmBottleWinPath(
          '/b/x',
          '/b/x/drive_c/Program Files (x86)/Steam/steamapps/common/Grim Dawn/x64/Grim Dawn.exe'
        )
      ).toBe(
        'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grim Dawn\\x64\\Grim Dawn.exe'
      )
      expect(drmBottleWinPath('/b/x', '/elsewhere/g.exe')).toBeNull()
      expect(drmBottleWinPath('/b/x', '/b/x/drive_c')).toBeNull()
      expect(drmBottleWinPath('/b/x', '/b/x/drive_c/../g.exe')).toBeNull()
      expect(drmBottleWinPath('/b/x', '/b/x/drive_c/a\n.exe')).toBeNull()
    })

    it('prepareDrmTraceFile makes a 0700 dir and prunes only this app', () => {
      const root = makeTmp()
      const traceRoot = realJoin(root, 'steam-bridge', 'drm', 'trace')
      mkdirSync(traceRoot, { recursive: true })
      for (let i = 1; i <= 10; i++) {
        writeFileSync(realJoin(traceRoot, `219990-${i}.log`), 'x')
      }
      writeFileSync(realJoin(traceRoot, '5-1.log'), 'x')
      writeFileSync(realJoin(traceRoot, 'notes.txt'), 'x')
      const r = prepareDrmTraceFile(root, '219990', 1761084000123)
      expect(r).toEqual({
        status: 'ok',
        traceFile: realJoin(traceRoot, '219990-1761084000123.log'),
        traceRoot
      })
      expect(realFs.statSync(traceRoot).mode & 0o777).toBe(0o700)
      expect(
        realExistsSync(realJoin(traceRoot, '219990-1761084000123.log'))
      ).toBe(false)
      const left = realFs
        .readdirSync(traceRoot)
        .filter((n) => n.startsWith('219990-'))
      expect(left).toHaveLength(DRM_TRACE_KEEP_PER_APP - 1)
      expect(left).toContain('219990-10.log')
      expect(left).not.toContain('219990-1.log')
      expect(realExistsSync(realJoin(traceRoot, '5-1.log'))).toBe(true)
      expect(realExistsSync(realJoin(traceRoot, 'notes.txt'))).toBe(true)
    })

    it('56-20: drmWineLogPathFor, drmWineDebugFromEnv and the bounded appender', () => {
      expect(drmWineLogPathFor('/x/219990-17.log')).toBe(
        '/x/219990-17.wine.log'
      )
      expect(drmWineDebugFromEnv('+seh,+steamclient')).toBe('+seh,+steamclient')
      for (const bad of ['a b', 'a"b', '$X', 'a;b', 'a'.repeat(201), '']) {
        expect(drmWineDebugFromEnv(bad)).toBeUndefined()
      }
      expect(drmWineDebugFromEnv(undefined)).toBeUndefined()

      const root = makeTmp()
      const path = realJoin(root, 'a.wine.log')
      const app = createDrmWineLogAppender(path, 10)
      app.write('12345')
      app.write('678901234')
      app.write('ignored')
      app.close()
      const body = realFs.readFileSync(path, 'utf8')
      expect(body.startsWith('1234567890')).toBe(true)
      expect(body).toContain('[gamelib] wine log truncated at 10 bytes')
      expect(body).not.toContain('ignored')
    })

    it('56-20: pruning a trace file also removes its wine log', () => {
      const root = makeTmp()
      const traceRoot = realJoin(root, 'steam-bridge', 'drm', 'trace')
      mkdirSync(traceRoot, { recursive: true })
      for (let i = 1; i <= 10; i++) {
        writeFileSync(realJoin(traceRoot, `219990-${i}.log`), 'x')
        writeFileSync(realJoin(traceRoot, `219990-${i}.wine.log`), 'x')
      }
      prepareDrmTraceFile(root, '219990', 1761084000123)
      expect(realExistsSync(realJoin(traceRoot, '219990-1.wine.log'))).toBe(
        false
      )
      expect(realExistsSync(realJoin(traceRoot, '219990-10.wine.log'))).toBe(
        true
      )
    })

    it('56-31: orphan wine logs with no trace are bounded per app (CR-03)', () => {
      const root = makeTmp()
      const traceRoot = realJoin(root, 'steam-bridge', 'drm', 'trace')
      mkdirSync(traceRoot, { recursive: true })
      for (let i = 1; i <= 12; i++) {
        writeFileSync(realJoin(traceRoot, `219990-${i}.wine.log`), 'x')
      }
      prepareDrmTraceFile(root, '219990', 1761084000123)
      const left = realFs
        .readdirSync(traceRoot)
        .filter((n) => n.startsWith('219990-'))
        .sort()
      expect(left).toHaveLength(DRM_TRACE_KEEP_PER_APP - 1)
      for (let i = 12; i > 12 - (DRM_TRACE_KEEP_PER_APP - 1); i--) {
        expect(left).toContain(`219990-${i}.wine.log`)
      }
    })

    it('56-31: mixed trace and wine-only ids are retained by id', () => {
      const root = makeTmp()
      const traceRoot = realJoin(root, 'steam-bridge', 'drm', 'trace')
      mkdirSync(traceRoot, { recursive: true })
      for (let i = 1; i <= 10; i++) {
        if (i % 2 === 1)
          writeFileSync(realJoin(traceRoot, `219990-${i}.log`), 'x')
        writeFileSync(realJoin(traceRoot, `219990-${i}.wine.log`), 'x')
      }
      prepareDrmTraceFile(root, '219990', 1761084000123)
      const keep = DRM_TRACE_KEEP_PER_APP - 1
      for (let i = 1; i <= 10; i++) {
        const survives = i > 10 - keep
        expect(
          realExistsSync(realJoin(traceRoot, `219990-${i}.wine.log`))
        ).toBe(survives)
        expect(realExistsSync(realJoin(traceRoot, `219990-${i}.log`))).toBe(
          survives && i % 2 === 1
        )
      }
    })

    it('56-31: other apps and stage wine logs are untouched; non-file entries are spared', () => {
      const root = makeTmp()
      const traceRoot = realJoin(root, 'steam-bridge', 'drm', 'trace')
      mkdirSync(traceRoot, { recursive: true })
      for (let i = 1; i <= 12; i++) {
        writeFileSync(realJoin(traceRoot, `648800-${i}.log`), 'x')
        writeFileSync(realJoin(traceRoot, `648800-${i}.wine.log`), 'x')
        writeFileSync(realJoin(traceRoot, `219990-${i}.stage.wine.log`), 'x')
        if (i !== 5) writeFileSync(realJoin(traceRoot, `219990-${i}.log`), 'x')
      }
      mkdirSync(realJoin(traceRoot, '219990-5.wine.log'))
      expect(prepareDrmTraceFile(root, '219990', 99).status).toBe('ok')
      for (let i = 1; i <= 12; i++) {
        expect(realExistsSync(realJoin(traceRoot, `648800-${i}.log`))).toBe(
          true
        )
        expect(
          realExistsSync(realJoin(traceRoot, `648800-${i}.wine.log`))
        ).toBe(true)
        expect(
          realExistsSync(realJoin(traceRoot, `219990-${i}.stage.wine.log`))
        ).toBe(true)
      }
      expect(realExistsSync(realJoin(traceRoot, '219990-5.wine.log'))).toBe(
        true
      )
    })

    it('prepareDrmTraceFile refuses a symlinked trace dir and spares symlink targets', () => {
      const root = makeTmp()
      const elsewhere = makeTmp()
      mkdirSync(realJoin(root, 'steam-bridge', 'drm'), { recursive: true })
      realFs.symlinkSync(
        elsewhere,
        realJoin(root, 'steam-bridge', 'drm', 'trace')
      )
      const r = prepareDrmTraceFile(root, '219990')
      expect(r.status).toBe('error')
      expect((r as { cause: string }).cause).toContain('symlink')

      const root2 = makeTmp()
      const traceRoot = realJoin(root2, 'steam-bridge', 'drm', 'trace')
      mkdirSync(traceRoot, { recursive: true })
      const target = realJoin(elsewhere, 'precious')
      writeFileSync(target, 'keep')
      realFs.symlinkSync(target, realJoin(traceRoot, '219990-1.log'))
      expect(prepareDrmTraceFile(root2, '219990', 99).status).toBe('ok')
      expect(realExistsSync(target)).toBe(true)
    })

    it('relogDrmTrace relogs only valid lines for this app as canonical output', () => {
      const dir = makeTmp()
      const f = realJoin(dir, 't.log')
      writeFileSync(
        f,
        [
          traceLine('219990', 'game', 1),
          traceLine('219990', 'game', 2),
          traceLine('219990', 'helper', 3),
          'forged line [drm-trace] nonsense',
          traceLine('555', 'game', 4)
        ].join('\n') + '\n'
      )
      ;(logInfo as jest.Mock).mockClear()
      expect(relogDrmTrace('219990', f)).toEqual({
        status: 'relogged',
        events: 3,
        rejected: 2
      })
      const relogged = (logInfo as jest.Mock).mock.calls.filter((c) =>
        String(c[0]).startsWith(drmRelogPrefix('219990'))
      )
      expect(relogged).toHaveLength(3)
      expect(relogged[0]).toEqual([
        drmRelogPrefix('219990') + traceLine('219990', 'game', 1),
        'Steam'
      ])
    })

    it('relogDrmTrace refuses symlinks and directories, skips oversize and missing', () => {
      const dir = makeTmp()
      const target = realJoin(dir, 'real.log')
      writeFileSync(target, traceLine('219990') + '\n')
      const link = realJoin(dir, 'link.log')
      realFs.symlinkSync(target, link)
      ;(logInfo as jest.Mock).mockClear()
      expect(relogDrmTrace('219990', link).status).toBe('refused')
      expect(relogDrmTrace('219990', dir).status).toBe('refused')
      expect(relogDrmTrace('219990', realJoin(dir, 'absent.log')).status).toBe(
        'missing'
      )
      const big = realJoin(dir, 'big.log')
      writeFileSync(big, 'x'.repeat(262145))
      expect(relogDrmTrace('219990', big).status).toBe('oversize')
      expect(
        (logInfo as jest.Mock).mock.calls.filter((c) =>
          String(c[0]).startsWith(drmRelogPrefix('219990'))
        )
      ).toHaveLength(0)
    })
  })

  describe('launch', () => {
    const { __drmLaunchSetupMock } = jest.requireMock<{
      __drmLaunchSetupMock: jest.Mock
    }>('../bridge/drm/drmLaunchSetup')
    const dialogMock = jest.requireMock<{
      showDialogBoxModalAuto: jest.Mock
    }>('backend/dialog/dialog').showDialogBoxModalAuto
    let idCounter = 0
    let tmp: string
    let bottleDir: string
    let exePath: string
    let tSpy: jest.SpyInstance
    let envMock: { isMac: boolean; isWindows: boolean; isLinux: boolean }
    const callOrder: string[] = []
    const freshId = () => {
      const id = String(880000 + ++idCounter)
      library.set(id, makeEntry({ title: `DRM ${id}`, app_name: id }))
      return id
    }
    const bottleFor = (id: string) => `GameLibSteamBridge-${id}`
    const wineVersionClone = {
      bin: '/clone dir/bin/wine',
      name: 'clone',
      type: 'crossover'
    }
    const readyFor = (id: string) => ({
      status: 'ok' as const,
      mode: 'steamclient-layer' as const,
      appId: id,
      launchForm: 'bin/wine+CX_BOTTLE' as const,
      anchor: { crossover: '26.3.0.39832', client: '1761084000' },
      progressSent: false,
      runner: {
        windowsDllDir: `${tmp}/runner dir/lib/wine/x86_64-windows`,
        unixDllDir: `${tmp}/runner dir/lib/wine/x86_64-unix`
      },
      bottle: {
        steamDirHost: `${bottleDir}/drive_c/Program Files (x86)/Steam`,
        helperWinPath: 'C:\\Program Files (x86)\\Steam\\steam.exe'
      },
      bottleSettings: {
        wineCrossoverBottle: bottleFor(id),
        wineVersion: wineVersionClone,
        winePrefix: bottleDir,
        enviromentOptions: []
      }
    })
    let onStopped: (() => void) | undefined
    const dylib = () =>
      realJoin(
        mockedLaunchPaths.userHome,
        ...MAC_STEAM_CLIENT_SUBPATH,
        'steamclient.dylib'
      )

    beforeEach(() => {
      resetBridgeFailedSession()
      resetBridgeLaunchBottles()
      library.clear()
      pendingFetches.clear()
      callOrder.length = 0
      tmp = makeTmp()
      bottleDir = realJoin(tmp, 'Bottles', 'b')
      const exeDir = realJoin(
        bottleDir,
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'steamapps',
        'common',
        'Grim Dawn',
        'x64'
      )
      mkdirSync(exeDir, { recursive: true })
      exePath = realJoin(exeDir, 'Grim Dawn.exe')
      writeFileSync(exePath, 'MZ')
      envMock = jest.requireMock('backend/constants/environment')
      envMock.isMac = true
      envMock.isWindows = false
      envMock.isLinux = false
      tSpy = jest
        .spyOn(i18next, 't')
        .mockImplementation(((k: string) => k) as never)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(exePath)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
      ;(existsSync as jest.Mock).mockReturnValue(true)
      isBottleReady.mockReturnValue(true)
      ;(getBridgeBottleSettings as jest.Mock).mockImplementation(
        (_deps: unknown, id: string) => ({
          wineCrossoverBottle: bottleFor(id),
          wineVersion: {
            bin: '/stock/bin/wine',
            name: 'stock',
            type: 'crossover'
          },
          enviromentOptions: []
        })
      )
      ;(getBottleDir as jest.Mock).mockReturnValue(bottleDir)
      ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
        realJoin(
          bottleDir,
          'drive_c',
          'Program Files (x86)',
          'Steam',
          'steamapps'
        )
      )
      ;(applySteamBridgeKnownFixes as jest.Mock).mockImplementation(
        (_deps: unknown, _id: string, settings: unknown) =>
          Promise.resolve(settings)
      )
      ;(installSteamBridgeSharedRedists as jest.Mock).mockResolvedValue(
        undefined
      )
      ;(placeShimForGame as jest.Mock).mockImplementation(() => {
        callOrder.push('shim')
        return Promise.resolve({ status: 'placed', shimPath: exePath })
      })
      ;(detectDrmWrapper as jest.Mock).mockImplementation(async () => {
        callOrder.push('detect')
        return 'steamstub'
      })
      ;(detectSteamDrmInPe as jest.Mock).mockResolvedValue({
        parsed: false,
        cegMarkers: [],
        hasBindSection: false,
        readError: null
      })
      startBottleProcessMonitor.mockImplementation(
        (_deps: unknown, args: { onStopped: () => void }) => {
          onStopped = args.onStopped
          return { launcherExited: jest.fn() }
        }
      )
      ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
        status: 'ready',
        ready: true,
        port: 1,
        secret: 's'
      })
      ;(writeBridgeConfig as jest.Mock).mockReturnValue({
        status: 'written',
        path: '/x'
      })
      runWineCommand.mockImplementation(() => {
        callOrder.push('wine')
        return Promise.resolve({ stdout: '', stderr: '', code: 0 })
      })
      onStopped = undefined
      ;(logInfo as jest.Mock).mockClear()
      ;(logWarning as jest.Mock).mockClear()
      ;(notify as jest.Mock).mockClear()
      dialogMock.mockClear()
      sendFrontendMessage.mockClear()
      ;(tellBottledSteamToLaunch as jest.Mock).mockClear()
      getDrmBridgeRunner.mockReturnValue(undefined)
      __drmLaunchSetupMock.mockReset()
    })
    afterEach(() => {
      tSpy.mockRestore()
      envMock.isMac = false
      envMock.isWindows = false
      envMock.isLinux = true
    })

    const infoLines = () =>
      (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
    const shimLike = () => [
      placeShimForGame,
      ensureBridgeHelperReady,
      writeBridgeConfig
    ]
    const useDrmOk = (id: string) => {
      __drmLaunchSetupMock.mockImplementation(() => {
        callOrder.push('drm-setup')
        return Promise.resolve(readyFor(id))
      })
      ;(existsSync as jest.Mock).mockImplementation(() => true)
    }

    describe('branch', () => {
      it('runs drmLaunchSetup before any shim placement and never reaches the shim/forwarder path', async () => {
        const id = freshId()
        __drmLaunchSetupMock.mockImplementation(() => {
          callOrder.push('drm-setup')
          return Promise.resolve({
            status: 'error',
            step: 'steam-not-running',
            cause: 'c'
          })
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        expect(callOrder).toEqual(['detect', 'drm-setup'])
        for (const m of shimLike()) expect(m).not.toHaveBeenCalled()
        expect(runWineCommand).not.toHaveBeenCalled()
      })

      it('persists the steamclient-layer bridge mode right after resolving it (WR-04 writer)', async () => {
        const id = freshId()
        const spy = jest.spyOn(bridgeVerdictModule, 'writeBridgeModeVerdict')
        __drmLaunchSetupMock.mockResolvedValue({
          status: 'error',
          step: 'steam-not-running',
          cause: 'c'
        })
        try {
          await new SteamGame(id, steamTestDeps).launch({} as never)
          expect(spy).toHaveBeenCalledWith(
            steamTestDeps,
            id,
            'steamclient-layer'
          )
        } finally {
          spy.mockRestore()
        }
      })

      it('hands drmLaunchSetup the exe, bottle, install root and wrapper', async () => {
        const id = freshId()
        __drmLaunchSetupMock.mockResolvedValue({
          status: 'error',
          step: 'runner-clone',
          cause: 'c'
        })
        await new SteamGame(id, steamTestDeps).launch({} as never)
        expect(__drmLaunchSetupMock).toHaveBeenCalledWith(
          {
            appId: id,
            appFolder: mockedAppFolder,
            bottleName: bottleFor(id),
            exePath,
            installRoot: realJoin(
              bottleDir,
              'drive_c',
              'Program Files (x86)',
              'Steam',
              'steamapps',
              'common',
              'Grim Dawn'
            ),
            installdir: 'Grim Dawn',
            drmWrapper: 'steamstub',
            cegMarkers: [],
            drmExe: exePath
          },
          { ...steamTestDeps, runTool: expect.any(Function) }
        )
      })

      describe('UE Shipping exe carries .bind (Gap 11)', () => {
        const shipping = '/bottle/Game/Binaries/Win64/Game-Win64-Shipping.exe'
        const override = () =>
          jest.requireMock<{
            __detectLaunchOverride: { fn?: (e: string) => unknown }
          }>('../bridge/drm/drmScanExe').__detectLaunchOverride
        afterEach(() => {
          override().fn = undefined
        })

        it('routes to DRM mode, keeps the bootstrap as exePath, reads CEG from the Shipping exe', async () => {
          const id = freshId()
          override().fn = () => ({ drmWrapper: 'steamstub', drmExe: shipping })
          __drmLaunchSetupMock.mockResolvedValue({
            status: 'error',
            step: 'runner-clone',
            cause: 'c'
          })
          await new SteamGame(id, steamTestDeps).launch({} as never)
          expect(__drmLaunchSetupMock.mock.calls[0][0]).toMatchObject({
            exePath,
            drmExe: shipping,
            drmWrapper: 'steamstub'
          })
        })

        it('keeps the CEG refusal when the Shipping exe carries CEG markers', async () => {
          const id = freshId()
          const realShipping = exePath + '.shipping.exe'
          writeFileSync(realShipping, 'MZ')
          override().fn = () => ({
            drmWrapper: 'steamstub',
            drmExe: realShipping
          })
          ;(detectSteamDrmInPe as jest.Mock).mockResolvedValue({
            parsed: true,
            cegMarkers: ['STEAM_GUIDD'],
            hasBindSection: true,
            readError: null
          })
          ;(placeShimForGame as jest.Mock).mockResolvedValue({
            status: 'placed',
            shimPath: exePath,
            drmWrapper: 'steamstub',
            drm: { kind: 'ceg', markers: ['STEAM_GUIDD'] }
          })
          await new SteamGame(id, steamTestDeps).launch({} as never)
          expect(detectSteamDrmInPe).toHaveBeenCalled()
          expect(__drmLaunchSetupMock.mock.calls[0][0].cegMarkers).toEqual([
            'STEAM_GUIDD'
          ])
          expect(infoLines().some((l) => l.startsWith('[bridge-drm] '))).toBe(
            false
          )
        })

        it('resolver none leaves the TCP path', async () => {
          const id = freshId()
          override().fn = () => ({ drmWrapper: 'none', drmExe: exePath })
          await new SteamGame(id, steamTestDeps).launch({} as never)
          expect(__drmLaunchSetupMock.mock.calls[0][0]).toMatchObject({
            drmWrapper: 'none',
            drmExe: exePath
          })
          expect(placeShimForGame).toHaveBeenCalledTimes(1)
        })
      })

      it('CEG markers are read before drmLaunchSetup and the CEG refusal still runs', async () => {
        const id = freshId()
        ;(detectSteamDrmInPe as jest.Mock).mockResolvedValue({
          parsed: true,
          cegMarkers: ['STEAM_GUIDD'],
          hasBindSection: true,
          readError: null
        })
        ;(placeShimForGame as jest.Mock).mockResolvedValue({
          status: 'placed',
          shimPath: exePath,
          drmWrapper: 'steamstub',
          drm: { kind: 'ceg', markers: ['STEAM_GUIDD'] }
        })
        await new SteamGame(id, steamTestDeps).launch({} as never)
        expect(__drmLaunchSetupMock.mock.calls[0][0].cegMarkers).toEqual([
          'STEAM_GUIDD'
        ])
        expect(placeShimForGame).toHaveBeenCalled()
        expect(infoLines().some((l) => l.startsWith('[bridge-drm] '))).toBe(
          false
        )
      })

      it.each(['none', undefined])(
        'wrapper %s continues on the TCP path unchanged',
        async (wrapper) => {
          const id = freshId()
          ;(detectDrmWrapper as jest.Mock).mockResolvedValue(wrapper)
          expect(
            await new SteamGame(id, steamTestDeps).launch({} as never)
          ).toBe(true)
          expect(__drmLaunchSetupMock.mock.calls[0][0]).toMatchObject({
            drmWrapper: wrapper,
            cegMarkers: []
          })
          expect(detectSteamDrmInPe).not.toHaveBeenCalled()
          expect(placeShimForGame).toHaveBeenCalledTimes(1)
          expect(runWineCommand.mock.calls[0][0].commandParts).toEqual([
            exePath
          ])
          expect(infoLines().some((l) => l.startsWith('[bridge-drm] '))).toBe(
            false
          )
        }
      )

      it('not-applicable after a registered runner re-reads the bottle settings', async () => {
        const id = freshId()
        ;(detectDrmWrapper as jest.Mock).mockResolvedValue('none')
        getDrmBridgeRunner.mockReturnValue({ kind: 'drm' })
        let calls = 0
        ;(getBridgeBottleSettings as jest.Mock).mockImplementation(() => {
          calls++
          return {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: {
              bin: `/v${calls}/wine`,
              name: `v${calls}`,
              type: 'crossover'
            },
            enviromentOptions: []
          }
        })
        await new SteamGame(id, steamTestDeps).launch({} as never)
        const used = runWineCommand.mock.calls[0][0].gameSettings
        // Call 1 is the readiness gate, call 2 the 59-10 engine re-read, call 3
        // the re-read after the cleared clone runner.
        expect(used.wineVersion.bin).toBe('/v3/wine')
      })

      it('an unresolved install root is a bottle-stage notice with no setup call', async () => {
        const id = freshId()
        ;(getBottleSteamappsDir as jest.Mock).mockReturnValue('/somewhere/else')
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        expect(
          jest.requireMock('../bridge/drm/drmLaunchSetup').__drmLaunchSetupMock
        ).not.toHaveBeenCalled()
        expect(infoLines()).toContain(
          formatDrmNoticeLine(id, 'bottle-stage', 'install root not resolved')
        )
        expect(runWineCommand).not.toHaveBeenCalled()
      })
    })

    describe('notices', () => {
      it.each(DRM_STEPS as readonly string[])(
        'step %s: logs, notifies once, no launch, no session breaker',
        async (step) => {
          const id = freshId()
          __drmLaunchSetupMock.mockResolvedValue({
            status: 'error',
            step,
            cause: 'cause text'
          })
          const game = new SteamGame(id, steamTestDeps)
          expect(await game.launch({} as never)).toBe(false)
          expect(infoLines()).toContain(
            formatDrmNoticeLine(id, step, 'cause text')
          )
          expect(notify).toHaveBeenCalledTimes(1)
          expect(dialogMock).toHaveBeenCalledTimes(1)
          expect((notify as jest.Mock).mock.calls[0][0].title).toBe(
            'gamelib:steam.bridge.drm.title'
          )
          expect(tSpy).toHaveBeenCalledWith(
            'gamelib:steam.bridge.drm.detail',
            'Details: {{cause}}',
            { cause: 'cause text' }
          )
          const camel = step.replace(/-([a-z])/g, (_m, c: string) =>
            c.toUpperCase()
          )
          expect(tSpy.mock.calls.map((c) => c[0])).toContain(
            `gamelib:steam.bridge.drm.step.${camel}`
          )
          expect(
            infoLines().some((l) =>
              l.startsWith(
                `[bridge-notice] appId=${id} dispatched=in-app-dialog+notify dialog-frame-sent=`
              )
            )
          ).toBe(true)
          // second launch: notice line again, no new dialog, setup reached again
          expect(await game.launch({} as never)).toBe(false)
          expect(__drmLaunchSetupMock).toHaveBeenCalledTimes(2)
          expect(notify).toHaveBeenCalledTimes(1)
          expect(dialogMock).toHaveBeenCalledTimes(1)
          expect(
            infoLines().filter(
              (l) => l === formatDrmNoticeLine(id, step, 'cause text')
            )
          ).toHaveLength(2)
          expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
          expect(
            sendFrontendMessage.mock.calls.some(
              (c) => c[0] === 'steamBridgeSetupRequired'
            )
          ).toBe(false)
        }
      )

      it('raises the main window before the dialog and logs display=confirmed on ack, display=unconfirmed on timeout', async () => {
        const { app } = hostFakes
        const acknowledgeDialogDisplay = (id: string) =>
          steamTestDeps.dialogs.displayAcks.acknowledge(id)
        jest.useFakeTimers()
        try {
          const confirmedId = freshId()
          __drmLaunchSetupMock.mockResolvedValue({
            status: 'error',
            step: 'runner-clone',
            cause: 'c'
          })
          await new SteamGame(confirmedId, steamTestDeps).launch({} as never)
          expect(app.raiseMainWindow).toHaveBeenCalledTimes(1)
          expect(
            at(app.raiseMainWindow.mock.invocationCallOrder, 0)
          ).toBeLessThan(at(dialogMock.mock.invocationCallOrder, 0))
          const ackId = dialogMock.mock.calls[0][0].ackId as string
          expect(typeof ackId).toBe('string')
          expect(infoLines().some((l) => l.includes('display=pending'))).toBe(
            true
          )
          expect(acknowledgeDialogDisplay(ackId)).toBe(true)
          expect(
            infoLines().some((l) =>
              l.startsWith(
                `[bridge-notice] appId=${confirmedId} display=confirmed elapsedMs=`
              )
            )
          ).toBe(true)

          const timedOutId = freshId()
          await new SteamGame(timedOutId, steamTestDeps).launch({} as never)
          jest.advanceTimersByTime(15_000)
          expect(infoLines()).toContain(
            `[bridge-notice] appId=${timedOutId} display=unconfirmed timeout=15000`
          )
        } finally {
          jest.useRealTimers()
        }
      })

      it('a different step for the same appId shows the dialog again', async () => {
        const id = freshId()
        const game = new SteamGame(id, steamTestDeps)
        __drmLaunchSetupMock.mockResolvedValue({
          status: 'error',
          step: 'runner-clone',
          cause: 'a'
        })
        await game.launch({} as never)
        __drmLaunchSetupMock.mockResolvedValue({
          status: 'error',
          step: 'valve-fetch',
          cause: 'a'
        })
        await game.launch({} as never)
        expect(dialogMock).toHaveBeenCalledTimes(2)
      })

      it('en/gamelib.json holds the 11 keys with the t() default strings', async () => {
        const id = freshId()
        const defaults = new Map<string, string>()
        for (const step of DRM_STEPS as readonly string[]) {
          tSpy.mockClear()
          __drmLaunchSetupMock.mockResolvedValue({
            status: 'error',
            step,
            cause: 'x'
          })
          await new SteamGame(id, steamTestDeps).launch({} as never)
          for (const c of tSpy.mock.calls) {
            if (typeof c[1] === 'string') defaults.set(String(c[0]), c[1])
          }
        }
        // The spy returns the key, so the defaults come from the source: assert
        // via the catalog against the strings declared in games.ts.
        const catalog = JSON.parse(
          realFs.readFileSync(
            realJoin(
              __dirname,
              '..',
              '..',
              '..',
              '..',
              '..',
              'public',
              'locales',
              'en',
              'gamelib.json'
            ),
            'utf8'
          )
        ).steam.bridge.drm
        // The DRM step texts moved to gameDrmLaunch.ts (62-05); the
        // title/detail keys moved to gameLaunch.ts (62-07). Search all owners.
        const src = ['games.ts', 'gameLaunch.ts', 'gameDrmLaunch.ts']
          .map((f) => realFs.readFileSync(realJoin(__dirname, '..', f), 'utf8'))
          .join('\n')
        const pairs: [string, string][] = [
          ['gamelib:steam.bridge.drm.title', catalog.title],
          ['gamelib:steam.bridge.drm.detail', catalog.detail],
          ...Object.entries(catalog.step).map(
            ([k, v]) =>
              [`gamelib:steam.bridge.drm.step.${k}`, v as string] as [
                string,
                string
              ]
          )
        ]
        expect(pairs).toHaveLength(11)
        for (const [key, value] of pairs) {
          expect(defaults.has(key) || key.endsWith('title')).toBe(true)
          const idx = src.indexOf(`'${key}'`)
          expect(idx).toBeGreaterThan(-1)
          const window = src.slice(idx, idx + 600)
          expect(
            window.includes(JSON.stringify(value)) ||
              window.includes(`"${value}"`) ||
              window.includes(`'${value}'`)
          ).toBe(true)
        }
      })
    })

    describe('ok launch', () => {
      const runCall = () => runWineCommand.mock.calls[0][0]
      const traceFileOf = (call: {
        gameSettings: { enviromentOptions: { key: string; value: string }[] }
      }) =>
        call.gameSettings.enviromentOptions.find(
          (e) => e.key === 'GAMELIB_DRM_TRACE_FILE'
        )!.value

      it('launches steam.exe with the game C: path under the clone with the measured env', async () => {
        const id = freshId()
        useDrmOk(id)
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        const call = runCall()
        expect(call.commandParts).toEqual(
          [
            '--dll=steamclient=n;steamclient64=n;lsteamclient=b',
            'C:\\Program Files (x86)\\Steam\\steam.exe',
            'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grim Dawn\\x64\\Grim Dawn.exe'
          ].slice(DRM_DLLOVERRIDES_CHANNEL === 'dll-option' ? 0 : 1)
        )
        expect(call.wait).toBe(false)
        expect(call.protonVerb).toBe('run')
        expect(call.gameSettings.wineVersion).toEqual(wineVersionClone)
        const ready = readyFor(id)
        const expected = buildDrmLaunchEnvironment({
          appId: id,
          traceFile: traceFileOf(call),
          macSteamClientDir: realJoin(
            mockedLaunchPaths.userHome,
            ...MAC_STEAM_CLIENT_SUBPATH
          ),
          steamDirHost: ready.bottle.steamDirHost,
          windowsDllDir: ready.runner.windowsDllDir,
          unixDllDir: ready.runner.unixDllDir,
          launchForm: ready.launchForm,
          dllPathChannel: DRM_DLLPATH_CHANNEL,
          dllOverridesChannel: DRM_DLLOVERRIDES_CHANNEL,
          base: []
        })
        expect(
          (expected as { enviromentOptions: unknown }).enviromentOptions
        ).toEqual(call.gameSettings.enviromentOptions)
        const env = Object.fromEntries(
          call.gameSettings.enviromentOptions.map(
            (e: { key: string; value: string }) => [e.key, e.value]
          )
        )
        expect(env.SteamGameId).toBe(id)
        expect(env.SteamAppId).toBe(id)
        expect(traceFileOf(call)).toMatch(
          new RegExp(
            `${mockedAppFolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/steam-bridge/drm/trace/${id}-[0-9]+\\.log$`
          )
        )
        for (const k of Object.keys(env)) {
          expect(k).not.toMatch(
            /^(HOME|USERPROFILE|APPDATA|LOCALAPPDATA|XDG_.*)$/
          )
        }
        for (const m of shimLike()) expect(m).not.toHaveBeenCalled()
      })

      it('known fixes, redists and dll overrides run on the clone settings, which win a wineVersion swap', async () => {
        const id = freshId()
        useDrmOk(id)
        ;(applySteamBridgeKnownFixes as jest.Mock).mockImplementation(
          (_deps: unknown, _i: string, settings: Record<string, unknown>) =>
            Promise.resolve({
              ...settings,
              wineVersion: { bin: '/other/wine', name: 'o', type: 'crossover' }
            })
        )
        await new SteamGame(id, steamTestDeps).launch({} as never)
        expect(
          (applySteamBridgeKnownFixes as jest.Mock).mock.calls[0][2]
        ).toEqual(readyFor(id).bottleSettings)
        expect(
          (installSteamBridgeSharedRedists as jest.Mock).mock.calls[0][2]
        ).toEqual(readyFor(id).bottleSettings)
        expect(runCall().gameSettings.wineVersion).toEqual(wineVersionClone)
      })

      it('logs exactly one [bridge-drm] anchor, before wine, for the launch trace file', async () => {
        const id = freshId()
        useDrmOk(id)
        runWineCommand.mockImplementation(() => {
          callOrder.push('wine')
          return Promise.resolve({ code: 0 })
        })
        ;(logInfo as jest.Mock).mockImplementation((line: string) => {
          if (String(line).startsWith('[bridge-drm] ')) callOrder.push('anchor')
        })
        await new SteamGame(id, steamTestDeps).launch({} as never)
        const anchors = infoLines().filter((l) => l.startsWith('[bridge-drm] '))
        expect(anchors).toEqual([
          formatBridgeDrmAnchor({
            appId: id,
            crossover: '26.3.0.39832',
            client: '1761084000',
            trace: traceFileOf(runCall())
          })
        ])
        expect(callOrder.filter((c) => c === 'anchor' || c === 'wine')).toEqual(
          ['anchor', 'wine']
        )
      })

      it('re-logs the trace once the monitor reports the game gone', async () => {
        const id = freshId()
        useDrmOk(id)
        await new SteamGame(id, steamTestDeps).launch({} as never)
        const file = traceFileOf(runCall())
        writeFileSync(
          file,
          [traceLine(id, 'game', 1), traceLine(id, 'game', 2)].join('\n') + '\n'
        )
        expect(onStopped).toBeDefined()
        onStopped!()
        onStopped!()
        const lines = infoLines()
        const anchorIdx = lines.findIndex((l) => l.startsWith('[bridge-drm] '))
        const relogIdx = lines
          .map((l, i) => (l.startsWith(drmRelogPrefix(id)) ? i : -1))
          .filter((i) => i >= 0)
        expect(relogIdx).toHaveLength(2)
        expect(relogIdx[0]).toBeGreaterThan(anchorIdx)
        expect(lines[at(relogIdx, 0)]).toBe(
          drmRelogPrefix(id) + traceLine(id, 'game', 1)
        )
      })

      it('without a monitor the re-log happens when wine settles', async () => {
        const id = freshId()
        useDrmOk(id)
        startBottleProcessMonitor.mockReturnValue(null)
        let release!: () => void
        runWineCommand.mockImplementation(
          () =>
            new Promise((r) => {
              release = () => r({ code: 0 })
            })
        )
        await new SteamGame(id, steamTestDeps).launch({} as never)
        writeFileSync(traceFileOf(runCall()), traceLine(id) + '\n')
        release()
        await flushAsync()
        expect(
          infoLines().filter((l) => l.startsWith(drmRelogPrefix(id)))
        ).toHaveLength(1)
      })

      it('a missing Mac Steam steamclient.dylib is a steam-not-running notice', async () => {
        const id = freshId()
        useDrmOk(id)
        ;(existsSync as jest.Mock).mockImplementation(
          (p: string) => p !== dylib()
        )
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        const line = infoLines().find((l) =>
          l.includes(`appId=${id} reason=drm-steam-not-running`)
        )
        expect(line).toContain('steamclient.dylib')
        expect(runWineCommand).not.toHaveBeenCalled()
      })

      it("a DRM-ready launch failure after progress sends a terminal 'done' (56-27, IN-01)", async () => {
        const id = freshId()
        const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
        ;(sendGameStatusUpdate as jest.Mock).mockClear()
        useDrmOk(id)
        __drmLaunchSetupMock.mockResolvedValue({
          ...readyFor(id),
          progressSent: true
        })
        ;(existsSync as jest.Mock).mockImplementation(
          (p: string) => p !== dylib()
        )
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        expect(sendGameStatusUpdate).toHaveBeenCalledWith(expect.anything(), {
          appName: id,
          runner: 'steam',
          status: 'done'
        })
        expect(
          infoLines().some((l) =>
            l.includes('sent terminal status done after launch failure')
          )
        ).toBe(true)
      })

      it("a DRM-ready launch failure without progress still sends a terminal 'done' (WR-01)", async () => {
        const id = freshId()
        const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
        ;(sendGameStatusUpdate as jest.Mock).mockClear()
        useDrmOk(id)
        ;(existsSync as jest.Mock).mockImplementation(
          (p: string) => p !== dylib()
        )
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        expect(sendGameStatusUpdate).toHaveBeenCalledWith(expect.anything(), {
          appName: id,
          runner: 'steam',
          status: 'done'
        })
      })

      it("a failure after a redist status (progressSent false) ends with 'done' after it (WR-01)", async () => {
        const id = freshId()
        const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
        ;(sendGameStatusUpdate as jest.Mock).mockClear()
        useDrmOk(id)
        const spy = jest
          .spyOn(gameLaunchModule, 'launchDrmModeGame')
          .mockImplementation(() => {
            sendGameStatusUpdate(
              {},
              {
                appName: id,
                runner: 'steam',
                status: 'redist'
              }
            )
            return Promise.resolve(false)
          })
        try {
          expect(
            await new SteamGame(id, steamTestDeps).launch({} as never)
          ).toBe(false)
        } finally {
          spy.mockRestore()
        }
        const calls = (sendGameStatusUpdate as jest.Mock).mock.calls
        const redistIdx = calls.findIndex((c) => c[1].status === 'redist')
        const doneIdx = calls.findIndex((c) => c[1].status === 'done')
        expect(redistIdx).toBeGreaterThanOrEqual(0)
        expect(doneIdx).toBeGreaterThan(redistIdx)
      })

      it("a thrown launchDrmModeGame sends 'done' and still propagates (WR-01)", async () => {
        const id = freshId()
        const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
        ;(sendGameStatusUpdate as jest.Mock).mockClear()
        useDrmOk(id)
        const err = new Error('boom')
        const spy = jest
          .spyOn(gameLaunchModule, 'launchDrmModeGame')
          .mockRejectedValue(err)
        try {
          await expect(
            new SteamGame(id, steamTestDeps).launch({} as never)
          ).rejects.toBe(err)
        } finally {
          spy.mockRestore()
        }
        expect(sendGameStatusUpdate).toHaveBeenCalledWith(expect.anything(), {
          appName: id,
          runner: 'steam',
          status: 'done'
        })
      })

      it("a successful DRM-ready launch sends no 'done' from the call site (WR-01)", async () => {
        const id = freshId()
        const { sendGameStatusUpdate } = jest.requireMock('backend/utils')
        ;(sendGameStatusUpdate as jest.Mock).mockClear()
        useDrmOk(id)
        const spy = jest
          .spyOn(gameLaunchModule, 'launchDrmModeGame')
          .mockResolvedValue(true)
        try {
          expect(
            await new SteamGame(id, steamTestDeps).launch({} as never)
          ).toBe(true)
        } finally {
          spy.mockRestore()
        }
        expect(sendGameStatusUpdate).not.toHaveBeenCalledWith(
          expect.objectContaining({ status: 'done' })
        )
      })

      it('an invalid anchor field gives a bottle-stage notice and no launch', async () => {
        const id = freshId()
        useDrmOk(id)
        __drmLaunchSetupMock.mockResolvedValue({
          ...readyFor(id),
          anchor: { crossover: '26.3.0.39832', client: '17x' }
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        expect(
          infoLines().some((l) =>
            l.includes(`appId=${id} reason=drm-bottle-stage`)
          )
        ).toBe(true)
        expect(runWineCommand).not.toHaveBeenCalled()
      })

      it('a game exe outside the bottle drive_c gives a bottle-stage notice', async () => {
        const id = freshId()
        useDrmOk(id)
        ;(getBottleDir as jest.Mock).mockReturnValue(realJoin(tmp, 'other'))
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          false
        )
        expect(
          infoLines().some((l) =>
            l.includes(`appId=${id} reason=drm-bottle-stage`)
          )
        ).toBe(true)
        expect(runWineCommand).not.toHaveBeenCalled()
      })

      it('a wine launch rejection is a bottle-stage notice without a session mark', async () => {
        const id = freshId()
        useDrmOk(id)
        runWineCommand.mockRejectedValue(new Error('boom'))
        const game = new SteamGame(id, steamTestDeps)
        expect(await game.launch({} as never)).toBe(true)
        await flushAsync()
        const line = infoLines().find((l) =>
          l.includes(`appId=${id} reason=drm-bottle-stage`)
        )
        expect(line).toContain('cause=wine')
        expect(line).toContain('launch')
        await game.launch({} as never)
        expect(__drmLaunchSetupMock).toHaveBeenCalledTimes(2)
        expect(
          sendFrontendMessage.mock.calls.some(
            (c) => c[0] === 'steamBridgeSetupRequired'
          )
        ).toBe(false)
      })

      it('a failing registry write gives a bottle-stage notice and no launch', async () => {
        const id = freshId()
        useDrmOk(id)
        runWineCommand.mockResolvedValue({
          code: 1,
          stderr: 'denied'
        })
        const game = new SteamGame(id, steamTestDeps)
        const ready = readyFor(id)
        const ok = await fireBridgeWineLaunch(
          game,
          exePath,
          ready.bottleSettings as never,
          {
            ready: ready as never,
            gameWinPath: 'C:\\g.exe',
            traceFile: `${tmp}/t.log`,
            anchorLine: '[bridge-drm] x',
            macSteamClientDir: `${tmp}/mac`,
            buildEnv: (
              input: Parameters<typeof buildDrmLaunchEnvironment>[0]
            ) =>
              buildDrmLaunchEnvironment({
                ...input,
                dllOverridesChannel: 'registry'
              })
          }
        )
        expect(ok).toBe(false)
        expect(runWineCommand.mock.calls).toHaveLength(1)
        expect(runWineCommand.mock.calls[0][0].wait).toBe(true)
        expect(
          infoLines().some((l) =>
            l.includes(`appId=${id} reason=drm-bottle-stage`)
          )
        ).toBe(true)
        expect(startBottleProcessMonitor).not.toHaveBeenCalled()
      })
    })

    describe('Phase 60 overlay (DRM route and env)', () => {
      const { __resolveOverlayEnabledMock, __readStoredOverlayOverrideMock } =
        jest.requireMock<{
          __resolveOverlayEnabledMock: jest.Mock
          __readStoredOverlayOverrideMock: jest.Mock
        }>('../bridge/overlay/overlayPolicy')
      const { __prepareOverlayTokensMock } = jest.requireMock<{
        __prepareOverlayTokensMock: jest.Mock
      }>('../bridge/overlay/overlayLaunch')
      const tokensFor = (id: string) => [
        `DYLD_INSERT_LIBRARIES='/s/shim.dylib'`,
        `SteamOverlayGameId=${id}`
      ]
      const resignedReady = (id: string, resigned: boolean) => {
        const r = readyFor(id)
        return { ...r, runner: { ...r.runner, wineloaderResigned: resigned } }
      }
      const useResigned = (id: string, resigned: boolean) => {
        __drmLaunchSetupMock.mockImplementation(() =>
          Promise.resolve(resignedReady(id, resigned))
        )
        ;(existsSync as jest.Mock).mockImplementation(() => true)
      }
      const cxEnv = () =>
        (
          runWineCommand.mock.calls[0][0].gameSettings.enviromentOptions as {
            key: string
            value: string
          }[]
        ).find((e) => e.key === 'CX_ENV')?.value
      beforeEach(() => {
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: true,
          source: 'default'
        })
        __prepareOverlayTokensMock.mockReset()
      })

      const baseEnv = (
        extra: Partial<Parameters<typeof buildDrmLaunchEnvironment>[0]>
      ) => ({
        appId: '123',
        traceFile: '/t/trace.log',
        macSteamClientDir: '/mac/client',
        steamDirHost: '/steam',
        windowsDllDir: '/r/win',
        unixDllDir: '/r/unix',
        launchForm: 'bin/wine+CX_BOTTLE' as const,
        dllPathChannel: 'env' as const,
        dllOverridesChannel: 'env' as const,
        base: [] as { key: string; value: string }[],
        ...extra
      })
      const cxOf = (r: ReturnType<typeof buildDrmLaunchEnvironment>) =>
        r.status === 'ok'
          ? r.enviromentOptions.find((e) => e.key === 'CX_ENV')?.value
          : undefined

      it('buildDrmLaunchEnvironment: overlay tokens alone become CX_ENV', () => {
        expect(
          cxOf(buildDrmLaunchEnvironment(baseEnv({ overlayTokens: ['A=1'] })))
        ).toBe('A=1')
      })

      it('buildDrmLaunchEnvironment: overlay tokens append to an existing CX_ENV', () => {
        expect(
          cxOf(
            buildDrmLaunchEnvironment(
              baseEnv({
                base: [{ key: 'CX_ENV', value: 'X=2' }],
                overlayTokens: ['A=1']
              })
            )
          )
        ).toBe('X=2 A=1')
      })

      it('buildDrmLaunchEnvironment: an inner quote in an overlay token is an error', () => {
        const r = buildDrmLaunchEnvironment(
          baseEnv({ overlayTokens: [`P='a'b'`] })
        )
        expect(r.status).toBe('error')
      })

      it('buildDrmLaunchEnvironment: no overlay tokens leaves CX_ENV unset', () => {
        expect(cxOf(buildDrmLaunchEnvironment(baseEnv({})))).toBeUndefined()
      })

      it('resigned clone and ok tokens: CX_ENV carries the overlay tokens', async () => {
        const id = freshId()
        useResigned(id, true)
        __prepareOverlayTokensMock.mockResolvedValue({
          status: 'ok',
          tokens: tokensFor(id)
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(cxEnv()).toContain(`DYLD_INSERT_LIBRARIES='`)
        expect(cxEnv()).toContain(`SteamOverlayGameId=${id}`)
        expect(notify).not.toHaveBeenCalled()
        expect(infoLines()).toContain(
          `SteamGame: appId ${id} overlay=on source=default`
        )
      })

      // 60-REVIEW WR-06 (D-04): the DRM clone only logs the input fix, never
      // injects it. Every other gate would pass here (module present, no probe,
      // fix not off), so only the route keeps the module out.
      it('DRM route: input module never passed, logged applied=false reason=route', async () => {
        const inputPath = mockedLaunchPaths.builtOverlayInputPath
        const keys = [
          'GAMELIB_OVERLAY_INPUT_FIX',
          'GAMELIB_OVERLAY_INPUT_PROBE',
          'GAMELIB_OVERLAY_RELEASE_EXPERIMENT'
        ]
        const saved = keys.map((k) => process.env[k])
        try {
          for (const k of keys) delete process.env[k]
          mkdirSync(join(inputPath, '..'), { recursive: true })
          writeFileSync(inputPath, 'x')
          const id = freshId()
          useResigned(id, true)
          __prepareOverlayTokensMock.mockResolvedValue({
            status: 'ok',
            tokens: tokensFor(id)
          })
          expect(
            await new SteamGame(id, steamTestDeps).launch({} as never)
          ).toBe(true)
          expect(__prepareOverlayTokensMock).toHaveBeenCalledTimes(1)
          expect(
            __prepareOverlayTokensMock.mock.calls[0][0]
          ).not.toHaveProperty('inputModulePath')
          expect(cxEnv() ?? '').not.toContain('overlay_input.dylib')
          const fixLines = infoLines()
            .concat(
              (logWarning as jest.Mock).mock.calls.map((c) => String(c[0]))
            )
            .filter((l) => l.includes('overlay input fix='))
          expect(fixLines).toEqual([
            `SteamGame: appId ${id} overlay input fix=X-RELEASE+BLOCK applied=false reason=route`
          ])
        } finally {
          keys.forEach((k, i) => {
            if (saved[i] === undefined) delete process.env[k]
            else process.env[k] = saved[i]
          })
        }
      })

      it('probe flag 1: the DRM prepare call receives the probe; unset: none', async () => {
        const probePath = mockedLaunchPaths.builtOverlayInputProbePath
        mkdirSync(join(probePath, '..'), { recursive: true })
        writeFileSync(probePath, 'x')
        const saved = process.env.GAMELIB_OVERLAY_INPUT_PROBE
        try {
          const id = freshId()
          useResigned(id, true)
          __prepareOverlayTokensMock.mockResolvedValue({
            status: 'ok',
            tokens: tokensFor(id)
          })
          process.env.GAMELIB_OVERLAY_INPUT_PROBE = '1'
          await new SteamGame(id, steamTestDeps).launch({} as never)
          expect(
            __prepareOverlayTokensMock.mock.calls[0][0].probe.dylibPath
          ).toBe(probePath)
          __prepareOverlayTokensMock.mockClear()
          delete process.env.GAMELIB_OVERLAY_INPUT_PROBE
          const id2 = freshId()
          useResigned(id2, true)
          __prepareOverlayTokensMock.mockResolvedValue({
            status: 'ok',
            tokens: tokensFor(id2)
          })
          runWineCommand.mockClear()
          await new SteamGame(id2, steamTestDeps).launch({} as never)
          expect(
            __prepareOverlayTokensMock.mock.calls[0][0]
          ).not.toHaveProperty('probe')
        } finally {
          if (saved === undefined)
            delete process.env.GAMELIB_OVERLAY_INPUT_PROBE
          else process.env.GAMELIB_OVERLAY_INPUT_PROBE = saved
        }
      })

      it('unresigned clone: no tokens, one resign notice and log line, game still launches', async () => {
        const id = freshId()
        useResigned(id, false)
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(cxEnv() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
        expect(__prepareOverlayTokensMock).not.toHaveBeenCalled()
        expect(notify).toHaveBeenCalledTimes(1)
        expect(
          (logWarning as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes(
              `[bridge-notice] appId=${id} reason=overlay-resign`
            )
          )
        ).toBe(true)
      })

      it('shim step failure: launches without tokens and notifies on every launch (no dedupe)', async () => {
        const id = freshId()
        useResigned(id, true)
        __prepareOverlayTokensMock.mockResolvedValue({
          status: 'error',
          step: 'shim',
          cause: 'missing shim'
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(cxEnv() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
        expect(notify).toHaveBeenCalledTimes(2)
        expect(
          (logWarning as jest.Mock).mock.calls.filter((c) =>
            String(c[0]).includes(`appId=${id} reason=overlay-shim`)
          )
        ).toHaveLength(2)
        // G4/D-09: one in-app push per launch; D-08: never a dialog.
        expect(publishOverlayNotice).toHaveBeenCalledTimes(2)
        expect(publishOverlayNotice).toHaveBeenCalledWith(
          { runner: 'steam', appName: id },
          'shim'
        )
        expect(
          jest.requireMock('backend/dialog/dialog').showDialogBoxModalAuto
        ).not.toHaveBeenCalled()
        expect(hostFakes.app.raiseMainWindow).not.toHaveBeenCalled()
      })

      it('overlay off: no tokens, no notify, policy source is logged', async () => {
        const id = freshId()
        useResigned(id, true)
        __readStoredOverlayOverrideMock.mockReturnValue('off')
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: false,
          source: 'user'
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(__prepareOverlayTokensMock).not.toHaveBeenCalled()
        expect(cxEnv() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
        expect(notify).not.toHaveBeenCalled()
        expect(infoLines()).toContain(
          `SteamGame: appId ${id} overlay=off source=user`
        )
        expect(__resolveOverlayEnabledMock).toHaveBeenCalledWith(
          expect.objectContaining({ userOverride: 'off' })
        )
      })

      it('a throwing policy read means no overlay, not a blocked launch', async () => {
        const id = freshId()
        useResigned(id, true)
        __resolveOverlayEnabledMock.mockImplementation(() => {
          throw new Error('boom')
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(__prepareOverlayTokensMock).not.toHaveBeenCalled()
        expect(cxEnv() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
      })
    })

    describe('Phase 60 overlay (TCP route)', () => {
      const { __resolveOverlayEnabledMock } = jest.requireMock<{
        __resolveOverlayEnabledMock: jest.Mock
      }>('../bridge/overlay/overlayPolicy')
      const { __prepareOverlayLaunchMock, __prepareOverlayEnvMock } =
        jest.requireMock<{
          __prepareOverlayLaunchMock: jest.Mock
          __prepareOverlayEnvMock: jest.Mock
        }>('../bridge/overlay/overlayLaunch')
      const bottleMod = jest.requireMock<{
        endPerGameBridgeBottleSessionWith: jest.Mock
      }>('../bridgeBottleLifecycle')
      const bridgeBottleMod = {
        setOverlayBridgeRunner: testSteamLaunchRuntime.drmRunners
          .setOverlayBridgeRunner as jest.Mock
      }
      const runnerBin = '/ov/runner/CrossOver/bin/wine'
      const overlayRunner = {
        crossoverBuild: '26.3.0',
        runnerDir: '/ov/runner',
        cxRoot: '/ov/runner/CrossOver',
        wrapperBin: runnerBin
      }
      const okResult = (id: string) => ({
        status: 'ok' as const,
        runner: overlayRunner,
        tokens: [`DYLD_INSERT_LIBRARIES='/s/shim.dylib'`, `SteamAppId=${id}`]
      })
      const registered = { current: false }
      beforeEach(() => {
        registered.current = false
        ;(detectDrmWrapper as jest.Mock).mockResolvedValue('none')
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: true,
          source: 'default'
        })
        __prepareOverlayLaunchMock.mockReset()
        __prepareOverlayEnvMock.mockReset()
        __prepareOverlayEnvMock.mockResolvedValue({ status: 'ok', vars: [] })
        bridgeBottleMod.setOverlayBridgeRunner.mockImplementation(() => {
          registered.current = true
          return true
        })
        bottleMod.endPerGameBridgeBottleSessionWith.mockResolvedValue(true)
        ;(getBridgeBottleSettings as jest.Mock).mockImplementation(
          (_deps: unknown, id: string) => ({
            wineCrossoverBottle: bottleFor(id),
            wineVersion: registered.current
              ? { bin: runnerBin, name: 'overlay', type: 'crossover' }
              : { bin: '/stock/bin/wine', name: 'stock', type: 'crossover' },
            enviromentOptions: []
          })
        )
      })
      const usedSettings = () => runWineCommand.mock.calls[0][0].gameSettings
      const cxEnvOf = () =>
        (
          usedSettings().enviromentOptions as { key: string; value: string }[]
        ).find((e) => e.key === 'CX_ENV')?.value

      it('overlay on: registers the clone, launches on it with the tokens', async () => {
        const id = freshId()
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(bridgeBottleMod.setOverlayBridgeRunner).toHaveBeenCalledWith(
          id,
          overlayRunner
        )
        expect(usedSettings().wineVersion.bin).toBe(runnerBin)
        expect(cxEnvOf()).toMatch(/^DYLD_INSERT_LIBRARIES='/)
        expect(cxEnvOf()).toContain(`SteamAppId=${id}`)
      })

      it('no previous runner and overlay on: ends the stock wineserver session first', async () => {
        const id = freshId()
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        await new SteamGame(id, steamTestDeps).launch({} as never)
        expect(
          bottleMod.endPerGameBridgeBottleSessionWith
        ).toHaveBeenCalledWith(
          steamTestDeps,
          id,
          bottleFor(id),
          undefined,
          15000
        )
        expect(
          at(
            bottleMod.endPerGameBridgeBottleSessionWith.mock
              .invocationCallOrder,
            0
          )
        ).toBeLessThan(
          at(bridgeBottleMod.setOverlayBridgeRunner.mock.invocationCallOrder, 0)
        )
      })

      it('overlay off: stock runner, no prepare, no tokens, no notify', async () => {
        const id = freshId()
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: false,
          source: 'user'
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(__prepareOverlayLaunchMock).not.toHaveBeenCalled()
        expect(usedSettings().wineVersion.bin).toBe('/stock/bin/wine')
        expect(cxEnvOf() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
        expect(notify).not.toHaveBeenCalled()
        expect(
          bottleMod.endPerGameBridgeBottleSessionWith
        ).not.toHaveBeenCalled()
      })

      it('overlay turned off after an overlay launch: ends the clone wineserver with the clone bin dir', async () => {
        const id = freshId()
        getDrmBridgeRunner.mockReturnValue({
          kind: 'overlay',
          runner: overlayRunner
        })
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: false,
          source: 'user'
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(
          bottleMod.endPerGameBridgeBottleSessionWith
        ).toHaveBeenCalledWith(
          steamTestDeps,
          id,
          bottleFor(id),
          '/ov/runner/CrossOver/bin',
          15000
        )
        expect(usedSettings().wineVersion.bin).toBe('/stock/bin/wine')
      })

      it('clone step failure: stock runner, no tokens, one toast, log line, launch succeeds (D-08)', async () => {
        const id = freshId()
        __prepareOverlayLaunchMock.mockResolvedValue({
          status: 'error',
          step: 'clone',
          cause: 'clone failed'
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(bridgeBottleMod.setOverlayBridgeRunner).not.toHaveBeenCalled()
        expect(usedSettings().wineVersion.bin).toBe('/stock/bin/wine')
        expect(cxEnvOf() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
        expect(notify).toHaveBeenCalledTimes(1)
        expect(
          (logWarning as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes(`appId=${id} reason=overlay-clone`)
          )
        ).toBe(true)
      })

      it('a refused runner registration falls back to stock with a clone notice', async () => {
        const id = freshId()
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        bridgeBottleMod.setOverlayBridgeRunner.mockReturnValue(false)
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(usedSettings().wineVersion.bin).toBe('/stock/bin/wine')
        expect(cxEnvOf() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
        expect(notify).toHaveBeenCalledTimes(1)
      })

      it('a throwing prepare launches on stock without blocking', async () => {
        const id = freshId()
        __prepareOverlayLaunchMock.mockRejectedValue(new Error('boom'))
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(usedSettings().wineVersion.bin).toBe('/stock/bin/wine')
        expect(cxEnvOf() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
      })

      const envVarsFor = (id: string) => [
        {
          key: 'DYLD_INSERT_LIBRARIES',
          value:
            '/s/shim.dylib:/b/steamloader.dylib:/b/gameoverlayrenderer.dylib'
        },
        { key: 'SteamOverlayGameId', value: id },
        { key: 'SteamGameId', value: id },
        { key: 'SteamAppId', value: id }
      ]
      const pinStaging = (id: string) => {
        const { setEngineSelection } = testRuntime.registry
        setEngineSelection(id, {
          kind: 'pinned',
          pinId: 'staging-11',
          reason: 'override',
          wineBin: '/engine/wine/bin/wine',
          wineserverBin: '/engine/wine/bin/wineserver',
          label: 'Wine-Staging 11.20',
          version: '11.20',
          dxvk: null
        })
      }
      const callPrepare = async (id: string, settings: unknown) => {
        const game = new SteamGame(id, steamTestDeps)
        try {
          return await prepareTcpOverlay(game, settings as never, undefined)
        } finally {
          clearEngineSelection(id)
        }
      }

      it('fallback engine: env route, env log line, no clone, no toast (D-07)', async () => {
        const id = freshId()
        pinStaging(id)
        __prepareOverlayEnvMock.mockResolvedValue({
          status: 'ok',
          vars: envVarsFor(id)
        })
        const input = {
          wineCrossoverBottle: bottleFor(id),
          wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' }
        }
        const out = await callPrepare(id, input)
        expect(out.overlayLaunch).toEqual({ kind: 'env', vars: envVarsFor(id) })
        expect(out.settings).toBe(input)
        expect(__prepareOverlayLaunchMock).not.toHaveBeenCalled()
        expect(bridgeBottleMod.setOverlayBridgeRunner).not.toHaveBeenCalled()
        expect(infoLines()).toContain(
          `SteamGame: appId ${id} overlay=env reason=fallback-engine (D-07)`
        )
        expect(infoLines().join('\n')).not.toContain('overlay=skipped')
        expect(notify).not.toHaveBeenCalled()
      })

      it('fallback engine: setup failure toasts once and launches without overlay (D-08)', async () => {
        const id = freshId()
        pinStaging(id)
        __prepareOverlayEnvMock.mockResolvedValue({
          status: 'error',
          step: 'shim',
          cause: 'overlay shim missing'
        })
        const out = await callPrepare(id, {
          wineCrossoverBottle: bottleFor(id),
          wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' }
        })
        expect(out.overlayLaunch).toBeUndefined()
        expect(notify).toHaveBeenCalledTimes(1)
        expect(
          (logWarning as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes(`appId=${id} reason=overlay-shim`)
          )
        ).toBe(true)
      })

      describe('60-11 input probe flag (G1)', () => {
        const saved = process.env.GAMELIB_OVERLAY_INPUT_PROBE
        const probePath = mockedLaunchPaths.builtOverlayInputProbePath
        beforeEach(() => {
          mkdirSync(join(probePath, '..'), { recursive: true })
          writeFileSync(probePath, 'x')
        })
        afterEach(() => {
          if (saved === undefined)
            delete process.env.GAMELIB_OVERLAY_INPUT_PROBE
          else process.env.GAMELIB_OVERLAY_INPUT_PROBE = saved
        })
        const probeOf = (m: jest.Mock) => m.mock.calls[0][0].probe

        it('flag 1: fallback engine and TCP clone calls receive the probe', async () => {
          process.env.GAMELIB_OVERLAY_INPUT_PROBE = '1'
          const id = freshId()
          pinStaging(id)
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' }
          })
          expect(probeOf(__prepareOverlayEnvMock)).toEqual({
            dylibPath: probePath,
            logPath: expect.stringMatching(
              new RegExp(`input-probe-${id}-\\d+\\.log$`)
            )
          })
          const id2 = freshId()
          __prepareOverlayLaunchMock.mockResolvedValue(okResult(id2))
          await callPrepare(id2, {
            wineCrossoverBottle: bottleFor(id2),
            wineVersion: {
              bin: '/stock/bin/wine',
              name: 's',
              type: 'crossover'
            }
          })
          expect(probeOf(__prepareOverlayLaunchMock).dylibPath).toBe(probePath)
        })

        it.each([undefined, '0', 'true'])(
          'flag %s: no probe arg on either call',
          async (v) => {
            if (v === undefined) delete process.env.GAMELIB_OVERLAY_INPUT_PROBE
            else process.env.GAMELIB_OVERLAY_INPUT_PROBE = v
            const id = freshId()
            pinStaging(id)
            await callPrepare(id, {
              wineCrossoverBottle: bottleFor(id),
              wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' }
            })
            expect(__prepareOverlayEnvMock.mock.calls[0][0]).not.toHaveProperty(
              'probe'
            )
          }
        )
      })

      describe('60-20 overlay input fix (G1)', () => {
        const inputPath = mockedLaunchPaths.builtOverlayInputPath
        const probePath = mockedLaunchPaths.builtOverlayInputProbePath
        const keys = [
          'GAMELIB_OVERLAY_INPUT_FIX',
          'GAMELIB_OVERLAY_INPUT_PROBE',
          'GAMELIB_OVERLAY_RELEASE_EXPERIMENT'
        ]
        const saved: Record<string, string | undefined> = {}
        const crossover = {
          bin: '/stock/bin/wine',
          name: 's',
          type: 'crossover'
        }
        const staging = { bin: '/e/wine', name: 'e', type: 'wine' }
        const fixLines = () =>
          infoLines()
            .concat(
              (logWarning as jest.Mock).mock.calls.map((c) => String(c[0]))
            )
            .filter((l) => l.includes('overlay input fix='))
        const withModule = (present: boolean) => {
          mkdirSync(join(inputPath, '..'), { recursive: true })
          if (present) writeFileSync(inputPath, 'x')
          else rmSync(inputPath, { force: true })
        }
        beforeEach(() => {
          for (const k of keys) {
            saved[k] = process.env[k]
            delete process.env[k]
          }
          withModule(true)
        })
        afterEach(() => {
          for (const k of keys) {
            if (saved[k] === undefined) delete process.env[k]
            else process.env[k] = saved[k]
          }
        })

        // 60-REVIEW WR-04: applied= is read from what the launch carries, so
        // the prepare mocks echo the module into DYLD_INSERT_LIBRARIES the way
        // the real value builder does.
        const echoTokens = (id: string) => (a: { inputModulePath?: string }) =>
          Promise.resolve({
            ...okResult(id),
            tokens: [
              `DYLD_INSERT_LIBRARIES='/s/shim.dylib${
                a.inputModulePath ? `:${a.inputModulePath}` : ''
              }'`,
              `SteamAppId=${id}`
            ]
          })
        const echoVars = (a: { inputModulePath?: string }) =>
          Promise.resolve({
            status: 'ok',
            vars: [
              {
                key: 'DYLD_INSERT_LIBRARIES',
                value: `/s/shim.dylib${
                  a.inputModulePath ? `:${a.inputModulePath}` : ''
                }`
              }
            ]
          })
        const notInjected = (id: string) => [
          `SteamGame: appId ${id} overlay input fix=X-RELEASE+BLOCK applied=false reason=not-injected`
        ]

        it('CrossOver clone, module present: passed and logged applied=true', async () => {
          const id = freshId()
          __prepareOverlayLaunchMock.mockImplementation(echoTokens(id))
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(
            __prepareOverlayLaunchMock.mock.calls[0][0].inputModulePath
          ).toBe(inputPath)
          expect(fixLines()).toEqual([
            `SteamGame: appId ${id} overlay input fix=X-RELEASE+BLOCK applied=true`
          ])
        })

        it('fallback engine: passed and logged applied=true', async () => {
          const id = freshId()
          pinStaging(id)
          __prepareOverlayEnvMock.mockImplementation(echoVars)
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: staging
          })
          expect(__prepareOverlayEnvMock.mock.calls[0][0].inputModulePath).toBe(
            inputPath
          )
          expect(fixLines()).toEqual([
            `SteamGame: appId ${id} overlay input fix=X-RELEASE+BLOCK applied=true`
          ])
        })

        it('clone prepare error: applied=false reason=not-injected, never applied=true', async () => {
          const id = freshId()
          __prepareOverlayLaunchMock.mockResolvedValue({
            status: 'error',
            step: 'clone',
            cause: 'resign failed'
          })
          const out = await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(out.overlayLaunch).toBeUndefined()
          expect(fixLines()).toEqual(notInjected(id))
        })

        it('runner registration refused: applied=false reason=not-injected', async () => {
          const id = freshId()
          __prepareOverlayLaunchMock.mockImplementation(echoTokens(id))
          bridgeBottleMod.setOverlayBridgeRunner.mockReturnValue(false)
          const out = await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(out.overlayLaunch).toBeUndefined()
          expect(fixLines()).toEqual(notInjected(id))
        })

        it('module dropped by the value builder: applied=false reason=not-injected', async () => {
          const id = freshId()
          pinStaging(id)
          // ok result whose DYLD_INSERT_LIBRARIES does not name the module
          __prepareOverlayEnvMock.mockResolvedValue({
            status: 'ok',
            vars: [{ key: 'DYLD_INSERT_LIBRARIES', value: '/s/shim.dylib' }]
          })
          const out = await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: staging
          })
          expect(out.overlayLaunch).toBeDefined()
          expect(fixLines()).toEqual(notInjected(id))
        })

        it('fallback prepare error: applied=false reason=not-injected', async () => {
          const id = freshId()
          pinStaging(id)
          __prepareOverlayEnvMock.mockResolvedValue({
            status: 'error',
            step: 'shim',
            cause: 'overlay shim missing'
          })
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: staging
          })
          expect(fixLines()).toEqual(notInjected(id))
        })

        it('module missing: no arg, one warning, no toast, overlay still prepared', async () => {
          withModule(false)
          const id = freshId()
          __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
          const out = await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(
            __prepareOverlayLaunchMock.mock.calls[0][0]
          ).not.toHaveProperty('inputModulePath')
          expect(out.overlayLaunch).toBeDefined()
          expect(notify).not.toHaveBeenCalled()
          const warns = (logWarning as jest.Mock).mock.calls
            .map((c) => String(c[0]))
            .filter((l) => l.includes('overlay input fix='))
          expect(warns).toEqual([
            `SteamGame: appId ${id} overlay input fix=X-RELEASE+BLOCK applied=false reason=missing`
          ])
        })

        it('GAMELIB_OVERLAY_INPUT_FIX=off: disabled; other values ignored', async () => {
          process.env.GAMELIB_OVERLAY_INPUT_FIX = 'off'
          const id = freshId()
          __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(
            __prepareOverlayLaunchMock.mock.calls[0][0]
          ).not.toHaveProperty('inputModulePath')
          expect(fixLines()[0]).toContain('applied=false reason=disabled')
          __prepareOverlayLaunchMock.mockClear()
          process.env.GAMELIB_OVERLAY_INPUT_FIX = '0'
          const id2 = freshId()
          __prepareOverlayLaunchMock.mockResolvedValue(okResult(id2))
          await callPrepare(id2, {
            wineCrossoverBottle: bottleFor(id2),
            wineVersion: crossover
          })
          expect(
            __prepareOverlayLaunchMock.mock.calls[0][0].inputModulePath
          ).toBe(inputPath)
        })

        it('armed 60-15 experiment: applied=false reason=experiment', async () => {
          mkdirSync(join(probePath, '..'), { recursive: true })
          writeFileSync(probePath, 'x')
          process.env.GAMELIB_OVERLAY_INPUT_PROBE = '1'
          process.env.GAMELIB_OVERLAY_RELEASE_EXPERIMENT = 'cb:release+block'
          const id = freshId()
          __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(
            __prepareOverlayLaunchMock.mock.calls[0][0]
          ).not.toHaveProperty('inputModulePath')
          expect(fixLines()[0]).toContain('applied=false reason=experiment')
        })

        // 60-REVIEW WR-02: the probe (observe-only too) hooks the same entry
        // points, so the fix is withheld whenever the probe is armed.
        it.each([
          ['CrossOver clone', crossover],
          ['fallback engine', staging]
        ])(
          'armed probe, no experiment (%s): probe passed, no module, applied=false reason=probe',
          async (_n, wineVersion) => {
            mkdirSync(join(probePath, '..'), { recursive: true })
            writeFileSync(probePath, 'x')
            process.env.GAMELIB_OVERLAY_INPUT_PROBE = '1'
            const id = freshId()
            if (wineVersion === staging) pinStaging(id)
            __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
            await callPrepare(id, {
              wineCrossoverBottle: bottleFor(id),
              wineVersion
            })
            const mock =
              wineVersion === staging
                ? __prepareOverlayEnvMock
                : __prepareOverlayLaunchMock
            expect(mock.mock.calls[0][0]).not.toHaveProperty('inputModulePath')
            expect(mock.mock.calls[0][0].probe.dylibPath).toBe(probePath)
            expect(fixLines()).toEqual([
              `SteamGame: appId ${id} overlay input fix=X-RELEASE+BLOCK applied=false reason=probe`
            ])
          }
        )

        it('overlay off: no module and no fix line', async () => {
          __resolveOverlayEnabledMock.mockReturnValue({
            enabled: false,
            source: 'user'
          })
          const id = freshId()
          await callPrepare(id, {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: crossover
          })
          expect(__prepareOverlayLaunchMock).not.toHaveBeenCalled()
          expect(fixLines()).toHaveLength(0)
        })
      })

      it('fallback engine with the overlay off: no env prepared', async () => {
        const id = freshId()
        pinStaging(id)
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: false,
          source: 'user'
        })
        const out = await callPrepare(id, {
          wineCrossoverBottle: bottleFor(id),
          wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' }
        })
        expect(out.overlayLaunch).toBeUndefined()
        expect(__prepareOverlayEnvMock).not.toHaveBeenCalled()
        expect(notify).not.toHaveBeenCalled()
      })

      it('fallback engine launch: plain env on the unchanged runner, no CX_ENV DYLD, known-fix runner stands', async () => {
        const id = freshId()
        pinStaging(id)
        __prepareOverlayEnvMock.mockResolvedValue({
          status: 'ok',
          vars: envVarsFor(id)
        })
        ;(getBridgeBottleSettings as jest.Mock).mockImplementation(
          (_deps: unknown, bid: string) => ({
            wineCrossoverBottle: bottleFor(bid),
            wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' },
            enviromentOptions: [{ key: 'SteamAppId', value: 'old' }]
          })
        )
        ;(applySteamBridgeKnownFixes as jest.Mock).mockImplementation(
          (_deps: unknown, _id: string, settings: object) =>
            Promise.resolve({
              ...settings,
              wineVersion: { bin: '/swapped/wine', name: 's', type: 'wine' }
            })
        )
        const game = new SteamGame(id, steamTestDeps)
        const launched = await fireBridgeWineLaunch(
          game,
          '/g/game.exe',
          (getBridgeBottleSettings as jest.Mock)(steamTestDeps, id),
          undefined,
          { kind: 'env', vars: envVarsFor(id) }
        )
        expect(launched).toBe(true)
        expect(usedSettings().wineVersion.bin).toBe('/swapped/wine')
        const env = usedSettings().enviromentOptions as {
          key: string
          value: string
        }[]
        expect(env.filter((e) => e.key === 'SteamAppId')).toEqual([
          { key: 'SteamAppId', value: id }
        ])
        expect(env.find((e) => e.key === 'DYLD_INSERT_LIBRARIES')?.value).toBe(
          at(envVarsFor(id), 0).value
        )
        expect(cxEnvOf() ?? '').not.toContain('DYLD_INSERT_LIBRARIES')
      })

      it('fallback engine after an overlay launch ends the clone wineserver', async () => {
        const id = freshId()
        const { setEngineSelection } = testRuntime.registry
        setEngineSelection(id, {
          kind: 'pinned',
          pinId: 'staging-11',
          reason: 'override',
          wineBin: '/engine/wine/bin/wine',
          wineserverBin: '/engine/wine/bin/wineserver',
          label: 'Wine-Staging 11.20',
          version: '11.20',
          dxvk: null
        })
        const game = new SteamGame(id, steamTestDeps)
        await prepareTcpOverlay(
          game,
          {
            wineCrossoverBottle: bottleFor(id),
            wineVersion: { bin: '/e/wine', name: 'e', type: 'wine' }
          } as never,
          { kind: 'overlay', runner: overlayRunner } as never
        )
        clearEngineSelection(id)
        expect(
          bottleMod.endPerGameBridgeBottleSessionWith
        ).toHaveBeenCalledWith(
          steamTestDeps,
          id,
          bottleFor(id),
          '/ov/runner/CrossOver/bin',
          15000
        )
      })

      it('same overlay runner as before: no session end', async () => {
        const id = freshId()
        getDrmBridgeRunner.mockReturnValue({
          kind: 'overlay',
          runner: overlayRunner
        })
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        await new SteamGame(id, steamTestDeps).launch({} as never)
        expect(
          bottleMod.endPerGameBridgeBottleSessionWith
        ).not.toHaveBeenCalled()
      })

      it('a known fix that swaps the runner is restored to the overlay clone', async () => {
        const id = freshId()
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        ;(applySteamBridgeKnownFixes as jest.Mock).mockImplementation(
          (_deps: unknown, _id: string, settings: object) =>
            Promise.resolve({
              ...settings,
              wineVersion: { bin: '/other/wine', name: 'o', type: 'wine' }
            })
        )
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(usedSettings().wineVersion.bin).toBe(runnerBin)
        expect(
          (logWarning as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes('restoring the overlay clone runner')
          )
        ).toBe(true)
      })

      it('the no-steam-api path carries the overlay tokens too', async () => {
        const id = freshId()
        ;(placeShimForGame as jest.Mock).mockResolvedValue({
          status: 'no-steam-api'
        })
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(cxEnvOf()).toContain(`SteamAppId=${id}`)
      })
    })

    describe('Phase 60 overlay (post-launch: attach watch, wine log, D-10)', () => {
      const { __resolveOverlayEnabledMock } = jest.requireMock<{
        __resolveOverlayEnabledMock: jest.Mock
      }>('../bridge/overlay/overlayPolicy')
      const { __prepareOverlayLaunchMock, __prepareOverlayTokensMock } =
        jest.requireMock<{
          __prepareOverlayLaunchMock: jest.Mock
          __prepareOverlayTokensMock: jest.Mock
        }>('../bridge/overlay/overlayLaunch')
      const { __watchOverlayAttachMock } = jest.requireMock<{
        __watchOverlayAttachMock: jest.Mock
      }>('../bridge/overlay/overlayAttachWatch')
      const { __openOverlayWineLogMock } = jest.requireMock<{
        __openOverlayWineLogMock: jest.Mock
      }>('../bridge/overlay/overlayWineLog')
      const bottleMod = jest.requireMock<{
        endPerGameBridgeBottleSessionWith: jest.Mock
      }>('../bridgeBottleLifecycle')
      const bridgeBottleMod = {
        setOverlayBridgeRunner: testSteamLaunchRuntime.drmRunners
          .setOverlayBridgeRunner as jest.Mock
      }
      const { showDialogBoxModalAuto } = jest.requireMock<{
        showDialogBoxModalAuto: jest.Mock
      }>('backend/dialog/dialog')
      const runnerBin = '/ov/runner/CrossOver/bin/wine'
      const okResult = (id: string) => ({
        status: 'ok' as const,
        runner: {
          crossoverBuild: '26.3.0',
          runnerDir: '/ov/runner',
          cxRoot: '/ov/runner/CrossOver',
          wrapperBin: runnerBin
        },
        tokens: [`DYLD_INSERT_LIBRARIES='/s/shim.dylib'`, `SteamAppId=${id}`]
      })
      const registered = { current: false }
      type Monitor = {
        onFirstMatch: () => void
        onStopped: () => void
      }
      let monitor: Monitor | undefined
      const mon = (): Monitor => {
        if (!monitor) throw new Error('process monitor was not started')
        return monitor
      }
      let settleWine: (v: { code?: number }) => void
      let rejectWine: (e: unknown) => void
      let wineLogMock: { path: string; write: jest.Mock; close: jest.Mock }

      beforeEach(() => {
        jest.useFakeTimers()
        monitor = undefined
        registered.current = false
        wineLogMock = {
          path: '/ov/trace/overlay-wine.log',
          write: jest.fn(),
          close: jest.fn()
        }
        ;(detectDrmWrapper as jest.Mock).mockResolvedValue('none')
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: true,
          source: 'default'
        })
        __prepareOverlayLaunchMock.mockReset()
        __openOverlayWineLogMock.mockReset().mockReturnValue(wineLogMock)
        __watchOverlayAttachMock
          .mockReset()
          .mockReturnValue(new Promise(() => {}))
        bridgeBottleMod.setOverlayBridgeRunner.mockImplementation(() => {
          registered.current = true
          return true
        })
        bottleMod.endPerGameBridgeBottleSessionWith.mockResolvedValue(true)
        ;(getBridgeBottleSettings as jest.Mock).mockImplementation(
          (_deps: unknown, id: string) => ({
            wineCrossoverBottle: bottleFor(id),
            wineVersion: registered.current
              ? { bin: runnerBin, name: 'overlay', type: 'crossover' }
              : { bin: '/stock/bin/wine', name: 'stock', type: 'crossover' },
            enviromentOptions: []
          })
        )
        startBottleProcessMonitor.mockImplementation(
          (_deps: unknown, a: Monitor) => {
            monitor = a
            return { launcherExited: jest.fn() }
          }
        )
        runWineCommand.mockImplementation(
          () =>
            new Promise((resolve, reject) => {
              settleWine = resolve
              rejectWine = reject
            })
        )
      })
      afterEach(() => {
        // Stand the armed launch deadline down (it is a module-level registry
        // that later describes count).
        monitor?.onFirstMatch()
        jest.useRealTimers()
      })

      const onOutput = () =>
        runWineCommand.mock.calls[0][0].options?.onOutput as
          | ((c: string) => void)
          | undefined
      const launchOn = async (id: string) => {
        __prepareOverlayLaunchMock.mockResolvedValue(okResult(id))
        return new SteamGame(id, steamTestDeps).launch({} as never)
      }
      const flush = async () => {
        for (let i = 0; i < 5; i++) await Promise.resolve()
      }
      const exitNotices = (id: string) =>
        (logWarning as jest.Mock).mock.calls.filter((c) =>
          String(c[0]).includes(`appId=${id} reason=overlay-exit-abnormal`)
        )
      const SHIM =
        'overlay_shim hook_set_pixel_format: layer=WineMetalLayer format=80 (BGRA8Unorm)\n'

      it('TCP overlay launch opens the trace-dir wine log and forwards shim lines', async () => {
        const id = freshId()
        expect(await launchOn(id)).toBe(true)
        expect(__openOverlayWineLogMock).toHaveBeenCalledWith(
          join(mockedLaunchPaths.appFolder, 'steam-bridge', 'overlay', 'trace'),
          id,
          expect.any(Number)
        )
        onOutput()?.(SHIM)
        expect(wineLogMock.write).toHaveBeenCalledWith(SHIM)
        expect(
          (logInfo as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes(
              `SteamGame: appId ${id} overlay_shim hook_set_pixel_format`
            )
          )
        ).toBe(true)
      })

      it('the wine log is closed when the wine promise settles', async () => {
        const id = freshId()
        await launchOn(id)
        settleWine({ code: 0 })
        await flush()
        expect(wineLogMock.close).toHaveBeenCalled()
      })

      it('a null overlay wine log still forwards shim lines and launches', async () => {
        const id = freshId()
        __openOverlayWineLogMock.mockReturnValue(null)
        expect(await launchOn(id)).toBe(true)
        onOutput()?.(SHIM)
        expect(
          (logInfo as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes('overlay_shim hook_set_pixel_format')
          )
        ).toBe(true)
      })

      it('non-overlay TCP launch: no wine log, no onOutput, no watch', async () => {
        const id = freshId()
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: false,
          source: 'user'
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(__openOverlayWineLogMock).not.toHaveBeenCalled()
        expect(onOutput()).toBeUndefined()
        expect(monitor).toBeDefined()
        mon().onFirstMatch()
        expect(__watchOverlayAttachMock).not.toHaveBeenCalled()
      })

      it('DRM overlay launch keeps one wine log and forwards shim lines, no overlay log file', async () => {
        const id = freshId()
        const r = readyFor(id)
        __drmLaunchSetupMock.mockImplementation(() =>
          Promise.resolve({
            ...r,
            runner: { ...r.runner, wineloaderResigned: true }
          })
        )
        ;(existsSync as jest.Mock).mockImplementation(() => true)
        __prepareOverlayTokensMock.mockResolvedValue({
          status: 'ok',
          tokens: [`DYLD_INSERT_LIBRARIES='/s/shim.dylib'`]
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        expect(__openOverlayWineLogMock).not.toHaveBeenCalled()
        onOutput()?.(SHIM)
        expect(
          (logInfo as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes(`SteamGame: appId ${id} overlay_shim`)
          )
        ).toBe(true)
      })

      it('DRM overlay launch gives the attach watch the 30 s window (60-UAT G2); TCP gets none', async () => {
        const id = freshId()
        const r = readyFor(id)
        __drmLaunchSetupMock.mockImplementation(() =>
          Promise.resolve({
            ...r,
            runner: { ...r.runner, wineloaderResigned: true }
          })
        )
        ;(existsSync as jest.Mock).mockImplementation(() => true)
        __prepareOverlayTokensMock.mockResolvedValue({
          status: 'ok',
          tokens: [`DYLD_INSERT_LIBRARIES='/s/shim.dylib'`]
        })
        expect(await new SteamGame(id, steamTestDeps).launch({} as never)).toBe(
          true
        )
        if (monitor) mon().onFirstMatch()
        expect(__watchOverlayAttachMock).toHaveBeenCalledTimes(1)
        expect(__watchOverlayAttachMock.mock.calls[0][0].timeoutMs).toBe(30_000)

        __watchOverlayAttachMock.mockClear()
        __drmLaunchSetupMock.mockReset()
        monitor = undefined
        const tcpId = freshId()
        await launchOn(tcpId)
        mon().onFirstMatch()
        expect(__watchOverlayAttachMock).toHaveBeenCalledTimes(1)
        expect(
          __watchOverlayAttachMock.mock.calls[0][0].timeoutMs
        ).toBeUndefined()
      })

      it('with a monitor the watch starts at first match, once, with the start time', async () => {
        const id = freshId()
        const t0 = Date.now()
        await launchOn(id)
        expect(__watchOverlayAttachMock).not.toHaveBeenCalled()
        mon().onFirstMatch()
        mon().onFirstMatch()
        expect(__watchOverlayAttachMock).toHaveBeenCalledTimes(1)
        expect(__watchOverlayAttachMock.mock.calls[0][0]).toEqual({
          appId: id,
          consoleLogPath: join(
            mockedLaunchPaths.userHome,
            'Library',
            'Application Support',
            'Steam',
            'logs',
            'console_log.txt'
          ),
          launchStartedAt: expect.any(Number)
        })
        expect(
          __watchOverlayAttachMock.mock.calls[0][0].launchStartedAt
        ).toBeGreaterThanOrEqual(t0)
      })

      it('with no monitor the watch starts at spawn, once, and the launch does not await it', async () => {
        const id = freshId()
        startBottleProcessMonitor.mockReturnValue(null)
        // never-resolving watch promise: launch must still resolve
        expect(await launchOn(id)).toBe(true)
        if (monitor) return
        expect(__watchOverlayAttachMock).toHaveBeenCalledTimes(1)
      })

      it('D-10: game gone at 12 s with code 1 shows one in-app toast', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onFirstMatch()
        jest.advanceTimersByTime(12_000)
        mon().onStopped()
        settleWine({ code: 1 })
        await flush()
        expect(exitNotices(id)).toHaveLength(1)
        expect(publishOverlayExitNotice).toHaveBeenCalledTimes(1)
        expect(publishOverlayExitNotice).toHaveBeenCalledWith({
          runner: 'steam',
          appName: id
        })
        expect(showDialogBoxModalAuto).not.toHaveBeenCalled()
        expect(runWineCommand).toHaveBeenCalledTimes(1)
      })

      it('D-10: no code field counts as unknown, so abnormal', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onFirstMatch()
        jest.advanceTimersByTime(5_000)
        mon().onStopped()
        settleWine({})
        await flush()
        expect(exitNotices(id)).toHaveLength(1)
      })

      it('D-10: a rejected wine promise after a quick stop counts too', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onFirstMatch()
        jest.advanceTimersByTime(5_000)
        mon().onStopped()
        rejectWine(new Error('x'))
        await flush()
        expect(exitNotices(id)).toHaveLength(1)
      })

      it('D-10: gone at 45 s is a normal session, no notice', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onFirstMatch()
        jest.advanceTimersByTime(45_000)
        mon().onStopped()
        settleWine({ code: 1 })
        await flush()
        expect(exitNotices(id)).toHaveLength(0)
      })

      it('D-10: wrapper code 0 means no notice', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onFirstMatch()
        jest.advanceTimersByTime(5_000)
        mon().onStopped()
        settleWine({ code: 0 })
        await flush()
        expect(exitNotices(id)).toHaveLength(0)
        expect(publishOverlayExitNotice).not.toHaveBeenCalled()
      })

      it('D-10: a non-overlay launch dying at 5 s gets no overlay notice', async () => {
        const id = freshId()
        __resolveOverlayEnabledMock.mockReturnValue({
          enabled: false,
          source: 'user'
        })
        await new SteamGame(id, steamTestDeps).launch({} as never)
        mon().onFirstMatch()
        jest.advanceTimersByTime(5_000)
        mon().onStopped()
        settleWine({ code: 1 })
        await flush()
        expect(exitNotices(id)).toHaveLength(0)
      })

      it('D-10: never seen (no first match) gives no overlay notice', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onStopped()
        settleWine({ code: 1 })
        await flush()
        expect(exitNotices(id)).toHaveLength(0)
      })

      it('D-10: wine promise never settles, the 3 s unref grace decides once', async () => {
        const id = freshId()
        await launchOn(id)
        mon().onFirstMatch()
        jest.advanceTimersByTime(5_000)
        mon().onStopped()
        expect(exitNotices(id)).toHaveLength(0)
        jest.advanceTimersByTime(3_000)
        expect(exitNotices(id)).toHaveLength(1)
        settleWine({ code: 1 })
        mon().onStopped()
        await flush()
        expect(exitNotices(id)).toHaveLength(1)
        expect(jest.getTimerCount()).toBeLessThanOrEqual(1)
      })
    })
  })
})

// ── quick 261029-ji2: restart Mac Steam on Play to adopt a native install ────

describe('SteamGame — quick 261029-ji2 pending Steam adoption', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  let envMock: any
  const adoption = () =>
    jest.mocked(
      jest.requireMock<typeof import('../macSteamAdoption')>(
        '../macSteamAdoption'
      )
    )
  const RECORD = {
    steamPid: 123,
    manifestPath: `/mock/steam/steamapps/appmanifest_${APP_ID}.acf`,
    baseline: { mtimeMs: 1, content: 'x' },
    recordedAt: 1
  }
  const TARGET = {
    targetSteamappsDir: '/mock/steam/steamapps',
    installdir: APP_ID
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    isBottleReady.mockReturnValue(false)
    adoption().probeMacSteamPid.mockResolvedValue(null)
    adoption().readAcfSnapshot.mockResolvedValue(RECORD.baseline)
    adoption().readPendingAdoption.mockReturnValue(undefined)
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    envMock.isMac = false
  })

  describe('install end (native Mac route)', () => {
    beforeEach(() => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
      ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(TARGET)
      createAbortController.mockReturnValue({
        signal: 'mock-signal'
      })
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })
    })

    it('Steam running: records the pending adoption once with its PID and baseline, polls with macNativeRoute, never fires steam://install', async () => {
      adoption().probeMacSteamPid.mockResolvedValue(123)

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result).toEqual({ status: 'done' })
      expect(adoption().recordPendingAdoption).toHaveBeenCalledTimes(1)
      expect(adoption().recordPendingAdoption).toHaveBeenCalledWith(
        APP_ID,
        expect.objectContaining({
          steamPid: 123,
          baseline: RECORD.baseline,
          manifestPath: `/mock/steam/steamapps/appmanifest_${APP_ID}.acf`
        }),
        mockAdoptionStore
      )
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        {
          isNativeHandoff: true,
          skippedDepots: [],
          macNativeRoute: true
        }
      )
      expect(shellOpenExternal).not.toHaveBeenCalled()
    })

    it('Steam not running: no record is written (a stale one is cleared), still polls with macNativeRoute', async () => {
      adoption().probeMacSteamPid.mockResolvedValue(null)

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(adoption().recordPendingAdoption).not.toHaveBeenCalled()
      expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
        APP_ID,
        mockAdoptionStore
      )
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        expect.objectContaining({ macNativeRoute: true })
      )
    })

    it('U-3: a Steam-performed install (opt-in OFF, steam://install delegated) never records a pending adoption', async () => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
      adoption().probeMacSteamPid.mockResolvedValue(123)

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(adoption().recordPendingAdoption).not.toHaveBeenCalled()
      expect(adoption().probeMacSteamPid).not.toHaveBeenCalled()
    })
  })

  describe('launch() on Mac', () => {
    it('no record + Steam running: plain rungameid, steam never restarted, no probe', async () => {
      adoption().probeMacSteamPid.mockResolvedValue(123)

      const result = await new SteamGame(APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(shellOpenExternal).toHaveBeenCalledWith(
        `steam://rungameid/${APP_ID}`,
        { activate: false }
      )
      expect(adoption().restartMacSteamForAdoption).not.toHaveBeenCalled()
      expect(adoption().probeMacSteamPid).not.toHaveBeenCalled()
    })

    it('record + same PID + unadopted: restarts Steam, clears the record and returns true on relaunch', async () => {
      adoption().readPendingAdoption.mockReturnValue(RECORD)
      adoption().probeMacSteamPid.mockResolvedValue(123)
      adoption().decidePlayAdoption.mockReturnValue('restart')
      adoption().restartMacSteamForAdoption.mockResolvedValue({
        kind: 'relaunched'
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(adoption().restartMacSteamForAdoption).toHaveBeenCalledWith(
        APP_ID,
        expect.objectContaining({ launchRunGameId: expect.any(Function) })
      )
      expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
        APP_ID,
        mockAdoptionStore
      )
    })

    it.each<
      [
        Awaited<
          ReturnType<
            typeof import('../macSteamAdoption').restartMacSteamForAdoption
          >
        >
      ]
    >([
      [{ kind: 'game-running', runningAppId: 4000 }],
      [{ kind: 'steam-busy' }],
      [{ kind: 'quit-timeout' }]
    ])(
      'record + restart refused (%j): notifies, returns false, keeps the record, opens no rungameid',
      async (outcome) => {
        adoption().readPendingAdoption.mockReturnValue(RECORD)
        adoption().probeMacSteamPid.mockResolvedValue(123)
        adoption().decidePlayAdoption.mockReturnValue('restart')
        adoption().restartMacSteamForAdoption.mockResolvedValue(outcome)

        const result = await new SteamGame(APP_ID, steamTestDeps).launch(
          {} as any
        )

        expect(result).toBe(false)
        expect(notifyMock).toHaveBeenCalledTimes(1)
        expect(adoption().clearPendingAdoption).not.toHaveBeenCalled()
        expect(shellOpenExternal).not.toHaveBeenCalled()
      }
    )

    it('record + different PID: clears the record and launches normally', async () => {
      adoption().readPendingAdoption.mockReturnValue(RECORD)
      adoption().probeMacSteamPid.mockResolvedValue(999)
      adoption().decidePlayAdoption.mockReturnValue('clear-and-launch')

      const result = await new SteamGame(APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
        APP_ID,
        mockAdoptionStore
      )
      expect(adoption().restartMacSteamForAdoption).not.toHaveBeenCalled()
      expect(shellOpenExternal).toHaveBeenCalledWith(
        `steam://rungameid/${APP_ID}`,
        { activate: false }
      )
    })

    it('non-mac host: never reads a record or probes Steam', async () => {
      envMock.isMac = false
      envMock.isLinux = true

      const result = await new SteamGame(APP_ID, steamTestDeps).launch(
        {} as any
      )

      expect(result).toBe(true)
      expect(adoption().readPendingAdoption).not.toHaveBeenCalled()
      expect(adoption().probeMacSteamPid).not.toHaveBeenCalled()
    })
  })
})

// ── Phase 59 (59-10): per-launch engine selection and the launch deadline ────
describe('SteamGame — quick 261105-ord experimental InstallApp', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  let envMock: any
  const adoption = () =>
    jest.mocked(
      jest.requireMock<typeof import('../macSteamAdoption')>(
        '../macSteamAdoption'
      )
    )
  const settingOn = () =>
    (isSteamExperimentalInstallAppEnabled as jest.Mock).mockReturnValue(true)
  const installApp = () => requestSteamInstallApp as jest.Mock
  const TARGET = {
    targetSteamappsDir: '/mock/steam/steamapps',
    installdir: APP_ID
  }

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = hostFakes
    shellOpenExternal = shell.openExternal
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(installPollingModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })
    isBottleReady.mockReturnValue(false)
    ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({ ready: true })
    ;(resolveSteamLibraryRoot as jest.Mock).mockResolvedValue('/mock/steam')
    adoption().probeMacSteamPid.mockResolvedValue(null)
    adoption().readAcfSnapshot.mockResolvedValue({ mtimeMs: 1, content: 'x' })
    adoption().readPendingAdoption.mockReturnValue(undefined)
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
    envMock.isMac = false
  })

  describe('downloader OFF route (steam://install)', () => {
    beforeEach(() => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(false)
    })

    it('ok: no openExternal, polls delegated, passes the resolved library root', async () => {
      settingOn()
      installApp().mockResolvedValue({ kind: 'ok', folderIndex: 0 })

      const result = await new SteamGame(APP_ID, steamTestDeps).install({
        path: '/mock/steam'
      } as any)

      expect(result).toEqual({ status: 'done' })
      expect(resolveSteamLibraryRoot).toHaveBeenCalledWith(
        expect.anything(),
        '/mock/steam'
      )
      expect(installApp()).toHaveBeenCalledWith(
        APP_ID,
        { libraryPath: '/mock/steam' },
        { paths: expect.anything(), run: 'install-app-run' }
      )
      expect(shellOpenExternal).not.toHaveBeenCalled()
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        {
          delegatedToSteamClient: true
        }
      )
    })

    it('unavailable: falls back to steam://install with the same polling call', async () => {
      settingOn()
      installApp().mockResolvedValue({
        kind: 'unavailable',
        reason: 'steam-not-running'
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result).toEqual({ status: 'done' })
      expect(shellOpenExternal).toHaveBeenCalledWith(
        `steam://install/${APP_ID}`
      )
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        {
          delegatedToSteamClient: true
        }
      )
    })

    it('error code 2: returns an install error naming the code, no openExternal, no polling', async () => {
      settingOn()
      installApp().mockResolvedValue({ kind: 'error', code: 2 })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result.status).toBe('error')
      expect((result as { error: string }).error).toContain('EAppUpdateError 2')
      expect(shellOpenExternal).not.toHaveBeenCalled()
      expect(startInstallPollingSpy).not.toHaveBeenCalled()
    })

    it('Steam client needs install: deferred as today, helper never called', async () => {
      settingOn()
      ;(ensureSteamClientReady as jest.Mock).mockResolvedValue({
        ready: false,
        status: 'needs-install'
      })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result).toEqual({ status: 'done', deferredToSetup: true })
      expect(installApp()).not.toHaveBeenCalled()
    })

    it('setting OFF: helper never called, steam://install as before', async () => {
      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(installApp()).not.toHaveBeenCalled()
      expect(shellOpenExternal).toHaveBeenCalledWith(
        `steam://install/${APP_ID}`
      )
    })
  })

  describe('downloader ON route (adoption after GameLib download)', () => {
    beforeEach(() => {
      ;(isSteamNativeInstallEnabled as jest.Mock).mockReturnValue(true)
      ;(resolveSteamInstallTarget as jest.Mock).mockResolvedValue(TARGET)
      createAbortController.mockReturnValue({
        signal: 'mock-signal'
      })
      ;(downloadSteamDepots as jest.Mock).mockResolvedValue({ status: 'done' })
    })

    it('Steam running + ok: no pending record, record cleared, polling marked adopted by the Steam client, library root derived from the manifest', async () => {
      settingOn()
      adoption().probeMacSteamPid.mockResolvedValue(123)
      installApp().mockResolvedValue({ kind: 'ok', folderIndex: 0 })

      const result = await new SteamGame(APP_ID, steamTestDeps).install(
        {} as any
      )

      expect(result).toEqual({ status: 'done' })
      expect(installApp()).toHaveBeenCalledWith(
        APP_ID,
        { libraryPath: '/mock/steam' },
        { paths: expect.anything(), run: 'install-app-run' }
      )
      expect(adoption().recordPendingAdoption).not.toHaveBeenCalled()
      expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
        APP_ID,
        mockAdoptionStore
      )
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        {
          isNativeHandoff: true,
          skippedDepots: [],
          macNativeRoute: true,
          adoptedBySteamClient: true
        }
      )
    })

    it.each([
      [{ kind: 'unavailable', reason: 'not-signed-in' }],
      [{ kind: 'error', code: 18 }]
    ])(
      'Steam running + %j: records the pending adoption exactly as today',
      async (outcome) => {
        settingOn()
        adoption().probeMacSteamPid.mockResolvedValue(123)
        installApp().mockResolvedValue(outcome)

        const result = await new SteamGame(APP_ID, steamTestDeps).install(
          {} as any
        )

        expect(result).toEqual({ status: 'done' })
        expect(adoption().recordPendingAdoption).toHaveBeenCalledTimes(1)
        expect(adoption().recordPendingAdoption).toHaveBeenCalledWith(
          APP_ID,
          expect.objectContaining({ steamPid: 123 }),
          mockAdoptionStore
        )
        expect(startInstallPollingSpy).toHaveBeenCalledWith(
          steamTestDeps,
          APP_ID,
          {
            isNativeHandoff: true,
            skippedDepots: [],
            macNativeRoute: true
          }
        )
      }
    )

    it('Steam not running: helper not called, stale record cleared', async () => {
      settingOn()
      adoption().probeMacSteamPid.mockResolvedValue(null)

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(installApp()).not.toHaveBeenCalled()
      expect(adoption().clearPendingAdoption).toHaveBeenCalledWith(
        APP_ID,
        mockAdoptionStore
      )
      expect(adoption().recordPendingAdoption).not.toHaveBeenCalled()
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        {
          isNativeHandoff: true,
          skippedDepots: [],
          macNativeRoute: true
        }
      )
    })

    it('setting OFF: helper never called, pending adoption recorded as today', async () => {
      adoption().probeMacSteamPid.mockResolvedValue(123)

      await new SteamGame(APP_ID, steamTestDeps).install({} as any)

      expect(installApp()).not.toHaveBeenCalled()
      expect(adoption().recordPendingAdoption).toHaveBeenCalledTimes(1)
      expect(startInstallPollingSpy).toHaveBeenCalledWith(
        steamTestDeps,
        APP_ID,
        {
          isNativeHandoff: true,
          skippedDepots: [],
          macNativeRoute: true
        }
      )
    })
  })
})

describe('SteamGame.launch() — phase 59 engine selection and launch deadline (59-10)', () => {
  const ID = '570'
  const PER_GAME = `GameLibSteamBridge-${ID}`
  const EXE = '/mock/bridge/bottle/steamapps/common/Game/Game.exe'
  let envMock: any

  const pinnedDecision = (
    reason: string,
    extra: Record<string, unknown> = {}
  ) => ({
    kind: 'use',
    selection: {
      kind: 'pinned',
      pinId: 'staging-11',
      reason,
      wineBin: '/engine/wine/bin/wine',
      wineserverBin: '/engine/wine/bin/wineserver',
      label: 'Wine-Staging 11.20',
      version: '11.20',
      dxvk: { dir: '/engine/dxvk', version: '1.10.3' }
    },
    preflight: {
      kind: 'expired',
      binDir: '/cx/bin',
      build: '26.3',
      daysAgo: 5
    },
    pin: {
      id: 'staging-11',
      label: 'Wine-Staging 11.20',
      wine: { version: '11.20' },
      dxvk: { version: '1.10.3' }
    },
    needsDownload: false,
    override: 'automatic',
    logLines: ['engine=pinned name="Wine-Staging 11.20" version=11.20'],
    ...extra
  })
  const infoMessages = () =>
    (jest.requireMock('backend/logger').logInfo as jest.Mock).mock.calls.map(
      (c) => String(c[0])
    )
  const setupSettings = () =>
    (getBridgeBottleSettings as jest.Mock).mockReturnValue({
      wineCrossoverBottle: PER_GAME
    })

  beforeEach(() => {
    resetBridgeFailedSession()
    resetBridgeLaunchBottles()
    resetBottleLedger()
    library.clear()
    pendingFetches.clear()
    library.set(ID, makeEntry({ title: 'Test Game' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(true)
    ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(EXE)
    setupSettings()
    runWineCommand.mockReturnValue(new Promise(() => {}))
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(placeShimForGame as jest.Mock).mockResolvedValue({
      status: 'placed',
      shimPath: EXE
    })
    ;(ensureBridgeHelperReady as jest.Mock).mockResolvedValue({
      status: 'ready',
      ready: true,
      port: 55123,
      secret: BRIDGE_TEST_SECRET
    })
    ;(writeBridgeConfig as jest.Mock).mockReturnValue({
      status: 'written',
      path: '/mock/gamelib_bridge.cfg'
    })
    ;(getBottleSteamappsDir as jest.Mock).mockReturnValue(
      '/mock/bridge/bottle/steamapps'
    )
    ;(getBottleDir as jest.Mock).mockReturnValue('/mock/bridge/bottle')
    getSteamBottleSettings.mockReturnValue({
      wineCrossoverBottle: 'GameLibSteam'
    })
  })

  afterEach(() => {
    cancelLaunchDeadline(ID, 'superseded')
    clearEngineSelection(ID)
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
    jest.useRealTimers()
  })

  describe('engine selection', () => {
    it('healthy CrossOver: registers the selection, prepares the bottle, logs the engine, no notification', async () => {
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(getEngineSelection(ID)).toMatchObject({ kind: 'crossover' })
      expect(mockPrepareBottleForEngine).toHaveBeenCalledWith(
        expect.objectContaining({ key: ID, bottleName: PER_GAME })
      )
      expect(notify).not.toHaveBeenCalled()
      expect(
        infoMessages().some((m) => m.includes('engine=crossover build=26.3'))
      ).toBe(true)
      expect(recordLaunchDecision).toHaveBeenCalledTimes(1)
    })

    it('expired CrossOver with the pin installed: no download, toast, and settings re-read after registration', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-expired')
      )
      let registeredAtRead: unknown
      ;(getBridgeBottleSettings as jest.Mock).mockImplementation(() => {
        registeredAtRead = getEngineSelection(ID)
        return { wineCrossoverBottle: PER_GAME }
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(mockEnsurePinnedEngine).not.toHaveBeenCalled()
      expect(registeredAtRead).toMatchObject({ kind: 'pinned' })
      expect(notify).toHaveBeenCalledTimes(1)
      expect((notify as jest.Mock).mock.calls[0][0].body).toContain(
        'toast.cxExpired'
      )
      expect(recordLaunchDecision).toHaveBeenCalled()
    })

    it('WR-01: Steam launch with an inconclusive pinned decision shows no engine toast', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue({
        ...pinnedDecision('cx-expired'),
        selection: {
          ...pinnedDecision('cx-expired').selection,
          reason: 'cx-inconclusive'
        },
        preflight: {
          kind: 'broken',
          binDir: '/cx/bin',
          build: '26.3',
          detail: 'timeout',
          inconclusive: true
        }
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(
        (notify as jest.Mock).mock.calls.some((c) =>
          String(c[0]?.body).includes('steam.engine.toast')
        )
      ).toBe(false)
    })

    it('needs download: sends engine-download progress, then launches', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-missing', { needsDownload: true })
      )
      mockEnsurePinnedEngine.mockImplementation((_pin: unknown, opts: any) => {
        opts.onProgress({
          phase: 'downloading',
          artifact: 'wine',
          percentage: 40
        })
        return Promise.resolve(ENGINE_OK)
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(sendGameStatusUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'engine-download',
          context: 'downloading:40'
        })
      )
    })

    it('IN-05: a real engine switch sends setting-up through onSwitching', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-missing', { needsDownload: false })
      )
      mockPrepareBottleForEngine.mockImplementation((args: any) => {
        args.onSwitching?.()
        return Promise.resolve({ ok: true })
      })
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      expect(sendGameStatusUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'engine-download',
          context: 'setting-up'
        })
      )
    })

    it('download failure: notifies, sends done, returns false, clears the registry, never marks the bridge failed', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-missing', { needsDownload: true })
      )
      mockEnsurePinnedEngine.mockResolvedValue({
        ok: false,
        reason: 'offline',
        detail: 'x'
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(notify).toHaveBeenCalledTimes(1)
      expect((notify as jest.Mock).mock.calls[0][0].body).toContain(
        'downloadFailed'
      )
      expect(sendGameStatusUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ status: 'done' })
      )
      expect(getEngineSelection(ID)).toBeUndefined()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
      expect(runWineCommand).not.toHaveBeenCalled()
    })

    it('override engine unavailable: dialog, false, no fallback', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue({
        kind: 'unavailable',
        override: 'pinned:old',
        detail: 'gone'
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      const dialog = jest.requireMock('backend/dialog/dialog')
      expect(
        (dialog.showDialogBoxModalAuto as jest.Mock).mock.calls[0][0].message
      ).toContain('overrideUnavailable')
      expect(runWineCommand).not.toHaveBeenCalled()
    })

    it('override pinned selection: no toast, engine label still logged', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('override', { override: 'pinned:staging-11' })
      )
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(notify).not.toHaveBeenCalled()
      expect(infoMessages().some((m) => m.includes('engine=pinned'))).toBe(true)
    })

    it('an untested build adds its line on every launch and does not block', async () => {
      const line = 'SteamEngine: CrossOver 99 is untested'
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        cxDecision({ logLines: ['engine=crossover build=99', line] })
      )
      const game = new SteamGame(ID, steamTestDeps)
      expect(await game.launch({} as any)).toBe(true)
      cancelLaunchDeadline(ID, 'superseded')
      clearEngineSelection(ID)
      expect(await game.launch({} as any)).toBe(true)
      expect(infoMessages().filter((m) => m.includes(line))).toHaveLength(2)
    })

    it('expired then licensed pre-flight: pinned then CrossOver (D-07)', async () => {
      ;(decideLaunchEngine as jest.Mock)
        .mockResolvedValueOnce(pinnedDecision('cx-expired'))
        .mockResolvedValueOnce(cxDecision())
      const game = new SteamGame(ID, steamTestDeps)
      await game.launch({} as any)
      expect(getEngineSelection(ID)).toMatchObject({ kind: 'pinned' })
      cancelLaunchDeadline(ID, 'superseded')
      clearEngineSelection(ID)
      await game.launch({} as any)
      expect(getEngineSelection(ID)).toMatchObject({ kind: 'crossover' })
    })

    it('game-running from prepareBottleForEngine: false, nothing spawned, registry cleared', async () => {
      mockPrepareBottleForEngine.mockResolvedValue({
        ok: false,
        reason: 'game-running',
        detail: 'running'
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(runWineCommand).not.toHaveBeenCalled()
      expect(getEngineSelection(ID)).toBeUndefined()
    })

    const engineDialog = () =>
      jest.requireMock('backend/dialog/dialog')
        .showDialogBoxModalAuto as jest.Mock

    it('download failure shows an in-app dialog with the downloadFailed body (WR-08)', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-missing', { needsDownload: true })
      )
      mockEnsurePinnedEngine.mockResolvedValue({
        ok: false,
        reason: 'offline',
        detail: 'x'
      })
      engineDialog().mockClear()
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(engineDialog()).toHaveBeenCalledTimes(1)
      expect(engineDialog().mock.calls[0][0].message).toContain(
        'downloadFailed'
      )
      expect(
        infoMessages().some((m) => m.includes('tag=engine-download-failed'))
      ).toBe(true)
    })

    it('a rejected setEngineSelection shows the selectionRejected dialog (WR-08)', async () => {
      const spy = jest
        .spyOn(testRuntime.registry, 'setEngineSelection')
        .mockReturnValue(false)
      engineDialog().mockClear()
      try {
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          false
        )
      } finally {
        spy.mockRestore()
      }
      expect(engineDialog()).toHaveBeenCalledTimes(1)
      expect(engineDialog().mock.calls[0][0].message).toContain(
        'selectionRejected'
      )
      expect(
        infoMessages().some((m) => m.includes('tag=engine-selection-rejected'))
      ).toBe(true)
      expect(runWineCommand).not.toHaveBeenCalled()
    })

    it('shared-bottle refusal: sharedBottle dialog, selection cleared, nothing spawned (WR-06)', async () => {
      mockPrepareBottleForEngine.mockResolvedValue({
        ok: false,
        reason: 'shared-bottle',
        detail: 'shared'
      })
      engineDialog().mockClear()
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(engineDialog()).toHaveBeenCalledTimes(1)
      expect(engineDialog().mock.calls[0][0].message).toContain('sharedBottle')
      expect(
        infoMessages().some((m) => m.includes('tag=engine-shared-bottle'))
      ).toBe(true)
      expect(getEngineSelection(ID)).toBeUndefined()
      expect(runWineCommand).not.toHaveBeenCalled()
    })

    it('marker-newer refusal: markerNewer dialog, selection cleared, nothing spawned (261109-w52)', async () => {
      mockPrepareBottleForEngine.mockResolvedValue({
        ok: false,
        reason: 'marker-newer',
        detail: 'newer'
      })
      engineDialog().mockClear()
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(engineDialog()).toHaveBeenCalledTimes(1)
      expect(engineDialog().mock.calls[0][0].message).toContain('markerNewer')
      expect(
        infoMessages().some((m) => m.includes('tag=engine-marker-newer'))
      ).toBe(true)
      expect(getEngineSelection(ID)).toBeUndefined()
      expect(runWineCommand).not.toHaveBeenCalled()
    })

    describe('G22: offline refusal before the pre-flight probe', () => {
      const blocked = (over: Record<string, unknown> = {}) => {
        const o = {
          online: false,
          cxMissing: false,
          override: undefined as unknown,
          kind: 'non-crossover',
          pinInstalled: false,
          needsPin: true,
          ...over
        }
        ;(checkConnectivityNow as jest.Mock).mockResolvedValue({
          offline: !o.online,
          source: o.online ? 'dns-ok' : 'dns-failed',
          elapsedMs: 0
        })
        ;(
          jest.requireMock('backend/engine/engineDecision')
            .isCrossoverMissing as jest.Mock
        ).mockResolvedValue(o.cxMissing)
        ;(
          jest.requireMock('../engine/steamEngineDeps')
            .readSteamEngineOverride as jest.Mock
        ).mockReturnValue(o.override)
        ;(readBottleEngineMarkerKind as jest.Mock).mockReturnValue(o.kind)
        mockIsPinnedEngineInstalled.mockReturnValue(o.pinInstalled)
        ;(restoreNeedsAbsentPin as jest.Mock).mockReturnValue(o.needsPin)
        engineDialog().mockClear()
      }

      it('G22: offline with the pin absent refuses without probing', async () => {
        blocked()
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          false
        )
        expect(decideLaunchEngine).not.toHaveBeenCalled()
        expect(engineDialog()).toHaveBeenCalledTimes(1)
        expect(engineDialog().mock.calls[0][0].message).toContain(
          'downloadFailed'
        )
        expect(
          infoMessages().some((m) => m.includes('tag=engine-download-failed'))
        ).toBe(true)
        expect(getEngineSelection(ID)).toBeUndefined()
        expect(mockPrepareBottleForEngine).not.toHaveBeenCalled()
        expect(runWineCommand).not.toHaveBeenCalled()
        const warn = jest.requireMock('backend/logger').logWarning as jest.Mock
        expect(
          warn.mock.calls.some((c) =>
            String(c[0]).includes(
              `appId ${ID} launch blocked before pre-flight: offline, and returning this bottle to CrossOver needs an engine pin that is not on disk (restore-needs-pin)`
            )
          )
        ).toBe(true)
      })

      it('G22: a CrossOver override is refused the same way', async () => {
        blocked({ override: 'crossover' })
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          false
        )
        expect(decideLaunchEngine).not.toHaveBeenCalled()
      })

      it('G25: the bridge launch checks connectivity once, before resolveBridgeLaunchExe, and passes offline', async () => {
        blocked({ online: false, needsPin: false, kind: 'crossover' })
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(checkConnectivityNow).toHaveBeenCalledTimes(1)
        expect(checkConnectivityNow).toHaveBeenCalledWith(
          `launch ${ID}`,
          steamTestDeps.onlineMonitor
        )
        expect(
          at((checkConnectivityNow as jest.Mock).mock.invocationCallOrder, 0)
        ).toBeLessThan(
          at((resolveBridgeLaunchExe as jest.Mock).mock.invocationCallOrder, 0)
        )
        expect(resolveBridgeLaunchExe).toHaveBeenCalledWith(steamTestDeps, ID, {
          offline: true
        })
      })

      it('G25: UAT 34 run 1, CrossOver missing with the DXVK copy present, is refused before the probe', async () => {
        blocked({ cxMissing: true, needsPin: false })
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          false
        )
        expect(decideLaunchEngine).not.toHaveBeenCalled()
        expect(engineDialog()).toHaveBeenCalledTimes(1)
        expect(engineDialog().mock.calls[0][0].message).toContain(
          'downloadFailed'
        )
        const warn = jest.requireMock('backend/logger').logWarning as jest.Mock
        expect(
          warn.mock.calls.some(
            (c) =>
              String(c[0]).includes(
                `appId ${ID} launch blocked before pre-flight`
              ) && String(c[0]).endsWith('(crossover-missing)')
          )
        ).toBe(true)
        expect(getEngineSelection(ID)).toBeUndefined()
        expect(runWineCommand).not.toHaveBeenCalled()
      })

      it('G25: CrossOver missing with a CrossOver override still reaches decideLaunchEngine', async () => {
        blocked({ cxMissing: true, needsPin: false, override: 'crossover' })
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(decideLaunchEngine).toHaveBeenCalledTimes(1)
      })

      it('G25: UAT 34 run 2, CrossOver present with the DXVK copy, still runs decideLaunchEngine once', async () => {
        blocked({ cxMissing: false, needsPin: false })
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(decideLaunchEngine).toHaveBeenCalledTimes(1)
      })

      it('G25: fresh online never calls isCrossoverMissing', async () => {
        blocked({ online: true, cxMissing: true })
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(
          jest.requireMock('backend/engine/engineDecision').isCrossoverMissing
        ).not.toHaveBeenCalled()
        expect(decideLaunchEngine).toHaveBeenCalledTimes(1)
      })

      it.each([
        ['online', { online: true }],
        ['pin installed', { pinInstalled: true }],
        ['CrossOver marker', { kind: 'crossover' }],
        ['no marker', { kind: null }],
        ['restore needs no pin', { needsPin: false }],
        ['pinned override', { override: 'pinned:wine-staging-11.20' }]
      ])('G22: %s still runs decideLaunchEngine', async (_n, over) => {
        blocked(over)
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(decideLaunchEngine).toHaveBeenCalledTimes(1)
      })
    })

    describe('G26: one bridge launch per appId', () => {
      const deferred = () => {
        let resolve!: (v: boolean) => void
        let reject!: (e: unknown) => void
        const promise = new Promise<boolean>((res, rej) => {
          resolve = res
          reject = rej
        })
        return { promise, resolve, reject }
      }
      // One module spy serves every game in the test (the body is a free
      // function now); per-appId behaviour is expressed on the spy itself.
      const bodySpy = () =>
        trackSpy(jest.spyOn(gameBridgeLaunchModule, 'launchBridgeGameBody'))

      it('G26: a second concurrent launch runs the body once and both resolve to its value', async () => {
        const game = new SteamGame(ID, steamTestDeps)
        const d = deferred()
        const spy = bodySpy().mockReturnValue(d.promise)
        const a = launchBridgeGame(game)
        const b = launchBridgeGame(game)
        d.resolve(true)
        expect(await a).toBe(true)
        expect(await b).toBe(true)
        expect(spy).toHaveBeenCalledTimes(1)
      })

      it('G26: the joiner logs, notifies once, and never shows a modal', async () => {
        const game = new SteamGame(ID, steamTestDeps)
        const d = deferred()
        bodySpy().mockReturnValue(d.promise)
        const { logInfo } = jest.requireMock('backend/logger')
        ;(notify as jest.Mock).mockClear()
        engineDialog().mockClear()
        const a = launchBridgeGame(game)
        expect(notify).not.toHaveBeenCalled()
        const b = launchBridgeGame(game)
        d.resolve(true)
        await Promise.all([a, b])
        expect(notify).toHaveBeenCalledTimes(1)
        expect((notify as jest.Mock).mock.calls[0][0].title).toBe('Test Game')
        expect((notify as jest.Mock).mock.calls[0][0].body).toContain(
          'alreadyLaunching'
        )
        expect(
          (logInfo as jest.Mock).mock.calls.some((c) =>
            String(c[0]).includes(
              `appId ${ID} bridge launch already in progress`
            )
          )
        ).toBe(true)
        expect(engineDialog()).not.toHaveBeenCalled()
      })

      it('G26: the guard is released when the launch resolves', async () => {
        const game = new SteamGame(ID, steamTestDeps)
        const d = deferred()
        const spy = bodySpy().mockReturnValueOnce(d.promise)
        const a = launchBridgeGame(game)
        d.resolve(true)
        await a
        spy.mockResolvedValue(true)
        await launchBridgeGame(game)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('G26: a rejecting body rejects both callers and releases the guard', async () => {
        const game = new SteamGame(ID, steamTestDeps)
        const d = deferred()
        const spy = bodySpy().mockReturnValueOnce(d.promise)
        const a = launchBridgeGame(game)
        const b = launchBridgeGame(game)
        const settled = Promise.allSettled([a, b])
        d.reject(new Error('boom'))
        const res = await settled
        expect(res.map((r) => r.status)).toEqual(['rejected', 'rejected'])
        spy.mockResolvedValue(true)
        await launchBridgeGame(game)
        expect(spy).toHaveBeenCalledTimes(2)
      })

      it('G26: a body resolving false clears the engine selection once (owner only)', async () => {
        const game = new SteamGame(ID, steamTestDeps)
        const d = deferred()
        bodySpy().mockReturnValue(d.promise)
        const clearSpy = jest.spyOn(
          testRuntime.registry,
          'clearEngineSelection'
        )
        clearSpy.mockClear()
        const a = launchBridgeGame(game)
        const b = launchBridgeGame(game)
        d.resolve(false)
        expect(await a).toBe(false)
        expect(await b).toBe(false)
        expect(clearSpy).toHaveBeenCalledTimes(1)
        clearSpy.mockRestore()
      })

      it('G26: launches of different appIds each run their own body', async () => {
        library.set('571', makeEntry({ title: 'Other Game' }))
        const g1 = new SteamGame(ID, steamTestDeps)
        const g2 = new SteamGame('571', steamTestDeps)
        const d1 = deferred()
        const d2 = deferred()
        const spy = bodySpy().mockImplementation((g: SteamGame) =>
          g.appId === ID ? d1.promise : d2.promise
        )
        const a = launchBridgeGame(g1)
        const b = launchBridgeGame(g2)
        d1.resolve(true)
        d2.resolve(true)
        await Promise.all([a, b])
        const callsFor = (id: string) =>
          spy.mock.calls.filter(([g]) => g.appId === id).length
        expect(callsFor(ID)).toBe(1)
        expect(callsFor('571')).toBe(1)
      })

      it('IN-04: two concurrent launch() calls run the bridge body once and notify once', async () => {
        const d = deferred()
        const spy = jest
          .spyOn(gameBridgeLaunchModule, 'launchBridgeGameBody')
          .mockReturnValue(d.promise)
        ;(notify as jest.Mock).mockClear()
        try {
          const a = new SteamGame(ID, steamTestDeps).launch({} as any)
          const b = new SteamGame(ID, steamTestDeps).launch({} as any)
          d.resolve(true)
          expect(await a).toBe(true)
          expect(await b).toBe(true)
          expect(spy).toHaveBeenCalledTimes(1)
          expect(notify).toHaveBeenCalledTimes(1)
          expect((notify as jest.Mock).mock.calls[0][0].body).toContain(
            'alreadyLaunching'
          )
        } finally {
          spy.mockRestore()
        }
      })
    })

    it('a CrossOver override on an expired bottle passes crossoverHealthy:false (G10)', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        cxDecision({
          override: 'crossover',
          preflight: {
            kind: 'expired',
            binDir: '/cx/bin',
            build: '26.3',
            daysAgo: 5
          }
        })
      )
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      expect(mockPrepareBottleForEngine).toHaveBeenCalledWith(
        expect.objectContaining({ crossoverHealthy: false })
      )
    })

    it('a healthy CrossOver decision passes crossoverHealthy:true (G10)', async () => {
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      expect(mockPrepareBottleForEngine).toHaveBeenCalledWith(
        expect.objectContaining({ crossoverHealthy: true })
      )
    })

    it('a TCP bridge launch persists the bridge mode as tcp (WR-04 writer)', async () => {
      const spy = jest.spyOn(bridgeVerdictModule, 'writeBridgeModeVerdict')
      try {
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(spy).toHaveBeenCalledWith(steamTestDeps, ID, 'tcp')
      } finally {
        spy.mockRestore()
      }
    })

    it('dxvk-failed while switching to CrossOver blocks the launch with the restoreFailed dialog', async () => {
      mockPrepareBottleForEngine.mockResolvedValue({
        ok: false,
        reason: 'dxvk-failed',
        detail: 'boom'
      })
      engineDialog().mockClear()
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(engineDialog()).toHaveBeenCalledTimes(1)
      expect(engineDialog().mock.calls[0][0].message).toContain('restoreFailed')
      expect(
        infoMessages().some((m) => m.includes('tag=engine-restore-failed'))
      ).toBe(true)
      expect(getEngineSelection(ID)).toBeUndefined()
      expect(runWineCommand).not.toHaveBeenCalled()
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'steamBridgeSetupRequired',
        expect.anything()
      )
    })

    it('dxvk-failed on a non-CrossOver selection warns and continues', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-missing', { needsDownload: false })
      )
      mockPrepareBottleForEngine.mockResolvedValue({
        ok: false,
        reason: 'dxvk-failed',
        detail: 'boom'
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(engineDialog().mock.calls.map((c) => c[0].message)).not.toContain(
        'restoreFailed'
      )
    })

    it('prepareBottleForEngine gets an ensurePinEngine that reports engine-download progress', async () => {
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      const args = mockPrepareBottleForEngine.mock.calls[0][0]
      mockEnsurePinnedEngine.mockImplementation((_pin: unknown, opts: any) => {
        opts.onProgress({
          phase: 'downloading',
          artifact: 'wine',
          percentage: 55
        })
        return Promise.resolve(ENGINE_OK)
      })
      const engine = await args.deps.ensurePinEngine({
        id: 'staging-11',
        label: 'Wine-Staging 11.20',
        wine: { version: '11.20' },
        dxvk: { version: '1.10.3' }
      })
      expect(engine).not.toBeNull()
      expect(sendGameStatusUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          status: 'engine-download',
          context: 'downloading:55'
        })
      )
    })

    it.each(['expired', 'missing', 'broken'])(
      'DRM launch with %s pre-flight: CrossOver-required dialog, no engine decision, no drmLaunchSetup',
      async (kind) => {
        ;(detectDrmWrapper as jest.Mock).mockResolvedValue('steamstub')
        ;(preflightCrossover as jest.Mock).mockResolvedValue({
          kind,
          binDir: '/cx/bin',
          build: null,
          daysAgo: 3,
          detail: 'x'
        })
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          false
        )
        const dialog = jest.requireMock('backend/dialog/dialog')
        expect(
          (dialog.showDialogBoxModalAuto as jest.Mock).mock.calls[0][0].message
        ).toContain('crossoverRequired.drm')
        expect(decideLaunchEngine).not.toHaveBeenCalled()
        expect(
          jest.requireMock('../bridge/drm/drmLaunchSetup').__drmLaunchSetupMock
        ).not.toHaveBeenCalled()
        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamBridgeSetupRequired',
          expect.anything()
        )
      }
    )

    it('bottled-Steam launch with an unhealthy pre-flight: CrossOver-required dialog, no dispatch', async () => {
      ;(bridgeAllowlist.has as jest.Mock).mockReturnValue(false)
      ;(isBridgeBottleReady as jest.Mock).mockReturnValue(false)
      isBottleReady.mockReturnValue(true)
      ;(preflightCrossover as jest.Mock).mockResolvedValue({
        kind: 'missing',
        detail: 'x'
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        false
      )
      expect(tellBottledSteamToLaunch).not.toHaveBeenCalled()
      const dialog = jest.requireMock('backend/dialog/dialog')
      expect(
        (dialog.showDialogBoxModalAuto as jest.Mock).mock.calls[0][0].message
      ).toContain('crossoverRequired.bottled')
    })

    it('nag_blocks is no (59-01): no nag notification exists in code', () => {
      for (const file of gameModuleFiles()) {
        const src = readFileSync(join(__dirname, '..', file), 'utf8')
        expect(stripSourceComments(src)).not.toMatch(/nagNotice|NagTime/)
      }
    })
  })

  describe('launch deadline', () => {
    const timerSafe = async (fn: () => Promise<void>) => {
      jest.useFakeTimers()
      try {
        await fn()
      } finally {
        jest.useRealTimers()
      }
    }

    it('D-16: a bridge launch marks the bottle ledger and onStopped clears it', async () => {
      jest.useFakeTimers()
      let onStopped: (() => void) | undefined
      startBottleProcessMonitor.mockImplementation((_deps: unknown, a: any) => {
        onStopped = a.onStopped
        return { launcherExited: jest.fn() }
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(gamesRunningIn(PER_GAME)).toEqual([ID])
      onStopped?.()
      expect(gamesRunningIn(PER_GAME)).toEqual([])
    })

    it('arms a deadline and the first match cancels it (no timers left)', async () => {
      jest.useFakeTimers()
      let onFirstMatch: (() => void) | undefined
      startBottleProcessMonitor.mockImplementation((_deps: unknown, a: any) => {
        onFirstMatch = a.onFirstMatch
        return { launcherExited: jest.fn() }
      })
      expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
        true
      )
      expect(__activeLaunchDeadlineCount()).toBe(1)
      onFirstMatch?.()
      expect(__activeLaunchDeadlineCount()).toBe(0)
      expect(jest.getTimerCount()).toBe(0)
      advanceBothSync(200_000)
      expect(killBridgeBottleWineServer).not.toHaveBeenCalled()
    })

    it('fires after spawn with no match: kill before registry clear, helper stopped, done, one dialog, no misrouting', async () => {
      await timerSafe(async () => {
        startBottleProcessMonitor.mockReturnValue({
          launcherExited: jest.fn()
        })
        const order: string[] = []
        ;(killBridgeBottleWineServer as jest.Mock).mockImplementation(() => {
          order.push(
            `kill:${getEngineSelection(ID) ? 'registered' : 'cleared'}`
          )
          return Promise.resolve(true)
        })
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          true
        )
        ;(decideLaunchEngine as jest.Mock).mockClear()
        await advanceBoth(180_000)
        expect(stopBottleProcessMonitor).toHaveBeenCalledWith(ID)
        expect(killBridgeBottleWineServer).toHaveBeenCalledWith(
          steamTestDeps,
          ID,
          15_000
        )
        expect(order).toEqual(['kill:registered'])
        expect(getEngineSelection(ID)).toBeUndefined()
        expect(stopBridgeHelper).toHaveBeenCalledWith(ID)
        expect(sendGameStatusUpdate).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ status: 'done' })
        )
        const dialog = jest.requireMock('backend/dialog/dialog')
        expect(dialog.showDialogBoxModalAuto).toHaveBeenCalledTimes(1)
        expect(
          (dialog.showDialogBoxModalAuto as jest.Mock).mock.calls[0][0]
        ).toMatchObject({ title: expect.stringContaining('didntStart.title') })
        expect(sendFrontendMessage).not.toHaveBeenCalledWith(
          'steamBridgeSetupRequired',
          expect.anything()
        )
        expect(decideLaunchEngine).not.toHaveBeenCalled()
        expect(mockEnsurePinnedEngine).not.toHaveBeenCalled()
        // not marked failed this session: the next Play still takes the bridge
        runWineCommand.mockClear()
        await new SteamGame(ID, steamTestDeps).launch({} as any)
        expect(runWineCommand).toHaveBeenCalledTimes(1)
      })
    })

    it('fires during the redist step: nothing is spawned afterwards and false is returned', async () => {
      await timerSafe(async () => {
        startBottleProcessMonitor.mockReturnValue({
          launcherExited: jest.fn()
        })
        ;(installSteamBridgeSharedRedists as jest.Mock).mockImplementation(
          () => new Promise((r) => setTimeout(r, 200_000))
        )
        const p = new SteamGame(ID, steamTestDeps).launch({} as any)
        await advanceBoth(200_000)
        expect(await p).toBe(false)
        expect(runWineCommand).not.toHaveBeenCalled()
        expect(killBridgeBottleWineServer).toHaveBeenCalled()
      })
    })

    it('launcher exiting before any match cancels the deadline', async () => {
      jest.useFakeTimers()
      let resolveWine!: () => void
      runWineCommand.mockReturnValue(
        new Promise<void>((r) => (resolveWine = r))
      )
      const handle = { launcherExited: jest.fn() }
      startBottleProcessMonitor.mockReturnValue(handle)
      // First call is launch()'s single-flight check; the rest see a monitor
      // that never matched.
      getBottleProcessMonitorPhase
        .mockReturnValueOnce(null)
        .mockReturnValue('starting')
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      resolveWine()
      for (let i = 0; i < 10; i++) await Promise.resolve()
      expect(__activeLaunchDeadlineCount()).toBe(0)
      expect(handle.launcherExited).toHaveBeenCalled()
    })

    it('a launch error cancels the deadline and clears the selection', async () => {
      jest.useFakeTimers()
      runWineCommand.mockRejectedValue(new Error('boom'))
      startBottleProcessMonitor.mockReturnValue({
        launcherExited: jest.fn()
      })
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      await Promise.resolve()
      await Promise.resolve()
      expect(__activeLaunchDeadlineCount()).toBe(0)
      expect(getEngineSelection(ID)).toBeUndefined()
    })

    it('monitor onStopped clears the engine selection', async () => {
      let onStopped: (() => void) | undefined
      startBottleProcessMonitor.mockImplementation((_deps: unknown, a: any) => {
        onStopped = a.onStopped
        return { launcherExited: jest.fn() }
      })
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      expect(getEngineSelection(ID)).toBeDefined()
      onStopped?.()
      expect(getEngineSelection(ID)).toBeUndefined()
    })

    it('no install root: no deadline armed, logged', async () => {
      ;(resolveBridgeLaunchExe as jest.Mock).mockResolvedValue(
        '/elsewhere/Game.exe'
      )
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      expect(__activeLaunchDeadlineCount()).toBe(0)
      expect(infoMessages().some((m) => m.includes('no launch deadline'))).toBe(
        true
      )
    })

    it('non-CrossOver selection arms the deadline when the monitor matches Staging (59-01: yes)', async () => {
      ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
        pinnedDecision('cx-expired')
      )
      startBottleProcessMonitor.mockReturnValue({
        launcherExited: jest.fn()
      })
      await new SteamGame(ID, steamTestDeps).launch({} as any)
      expect(__activeLaunchDeadlineCount()).toBe(1)
    })

    it('the monitor giving up stands the deadline down: a game nobody can see is never stopped (59-UAT G3)', async () => {
      await timerSafe(async () => {
        let onUnavailable: (() => void) | undefined
        startBottleProcessMonitor.mockImplementation(
          (_deps: unknown, a: any) => {
            onUnavailable = a.onUnavailable
            return { launcherExited: jest.fn() }
          }
        )
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          true
        )
        expect(__activeLaunchDeadlineCount()).toBe(1)
        onUnavailable?.()
        expect(__activeLaunchDeadlineCount()).toBe(0)
        await advanceBoth(200_000)
        expect(killBridgeBottleWineServer).not.toHaveBeenCalled()
      })
    })

    it('a deadline firing after the registry was cleared logs the engine chosen at arm time (59-UAT G5)', async () => {
      await timerSafe(async () => {
        ;(decideLaunchEngine as jest.Mock).mockResolvedValue(
          pinnedDecision('cx-missing')
        )
        startBottleProcessMonitor.mockReturnValue({
          launcherExited: jest.fn()
        })
        expect(await new SteamGame(ID, steamTestDeps).launch({} as any)).toBe(
          true
        )
        clearEngineSelection(ID)
        await advanceBoth(180_000)
        const warnings = (
          jest.requireMock('backend/logger').logWarning as jest.Mock
        ).mock.calls.map((c) => String(c[0]))
        const fired = warnings.find((m) =>
          m.startsWith(`SteamGame: appId ${ID} launch deadline fired`)
        )
        expect(fired).toContain('engine=pinned')
        expect(fired).not.toContain('engine=crossover')
      })
    })
  })
})

describe('Steam launch watch wiring (261111-9mj)', () => {
  const doneCount = () =>
    (sendGameStatusUpdate as jest.Mock).mock.calls.filter(
      (c) => c[1]?.status === 'done'
    ).length
  let startSpy: jest.SpyInstance
  let stopSpy: jest.SpyInstance
  let delegatedSpy: jest.SpyInstance
  beforeEach(() => {
    const env = jest.requireMock('backend/constants/environment')
    env.isWindows = false
    env.isMac = false
    env.isLinux = true
    launchWatches.clear()
    // an earlier describe may leave a bridge record that stop() would take first
    resetBridgeLaunchBottles()
    ;(sendGameStatusUpdate as jest.Mock).mockClear()
    library.clear()
    pendingFetches.clear()
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    const { shell } = hostFakes
    shell.openExternal.mockResolvedValue(undefined)
    getBottleProcessMonitorPhase.mockReturnValue(null)
    startSpy = jest
      .spyOn(steamLaunchWatchModule, 'startSteamLaunchWatch')
      .mockReturnValue({ status: 'started', settled: Promise.resolve() })
    stopSpy = jest.spyOn(stopSteamLaunchedModule, 'stopSteamLaunchedGame')
    // an earlier describe may leave a delegated-install poll that stop() takes first
    delegatedSpy = jest
      .spyOn(installPollingModule, 'cancelDelegatedInstall')
      .mockReturnValue(false)
  })
  afterEach(() => {
    delegatedSpy.mockRestore()
    startSpy.mockRestore()
    stopSpy.mockRestore()
    const env = jest.requireMock('backend/constants/environment')
    env.isWindows = false
  })

  const registerWatch = (shown: boolean) => {
    launchWatches.set(APP_ID, {
      shown,
      settled: Promise.resolve(),
      cancel: () => void launchWatches.delete(APP_ID),
      noteRelaunch: () => undefined
    })
  }

  it('G1 launch starts the watch after openExternal', async () => {
    const { shell } = hostFakes
    await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(startSpy.mock.calls[0]?.[1]).toBe(APP_ID)
  })

  it('G2 win32 launch starts the watch too (quick 261111-a9g)', async () => {
    jest.requireMock('backend/constants/environment').isWindows = true
    await new SteamGame(APP_ID, steamTestDeps).launch({} as any)
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(startSpy.mock.calls[0]?.[1]).toBe(APP_ID)
  })

  it('G3 stop with a shown watch and no-process sends exactly one done', async () => {
    registerWatch(true)
    stopSpy.mockResolvedValue({ kind: 'no-process', folder: '/f' })
    await new SteamGame(APP_ID, steamTestDeps).stop()
    expect(doneCount()).toBe(1)
    expect(launchWatches.size).toBe(0)
  })

  it('G4 stop that stops the game cancels the watch and sends one done', async () => {
    registerWatch(true)
    stopSpy.mockResolvedValue({
      kind: 'stopped',
      folder: '/f',
      termed: [1],
      killed: []
    })
    await new SteamGame(APP_ID, steamTestDeps).stop()
    expect(doneCount()).toBe(1)
    expect(launchWatches.size).toBe(0)
  })

  it('G5 stop with no watch and no-process keeps the no-op warning and sends no done', async () => {
    stopSpy.mockResolvedValue({ kind: 'no-process', folder: '/f' })
    await new SteamGame(APP_ID, steamTestDeps).stop()
    expect(doneCount()).toBe(0)
    const { logWarning } = jest.requireMock('backend/logger')
    expect(
      (logWarning as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('Steam owns process lifecycle')
      )
    ).toBe(true)
  })

  it('G6 (am0) win32 failed hand-off: openExternal rejecting starts no watch', async () => {
    jest.requireMock('backend/constants/environment').isWindows = true
    const { shell } = hostFakes
    shell.openExternal.mockRejectedValueOnce(new Error('opener failed'))
    await expect(
      new SteamGame(APP_ID, steamTestDeps).launch({} as any)
    ).rejects.toThrow('opener failed')
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('G7 (am0) win32 failed hand-off: a non-numeric appId starts no watch', async () => {
    jest.requireMock('backend/constants/environment').isWindows = true
    const { shell } = hostFakes
    library.set('abc', makeEntry({ title: 'Not Numeric' }))
    await expect(
      new SteamGame('abc', steamTestDeps).launch({} as any)
    ).resolves.toBe(false)
    expect(shell.openExternal).not.toHaveBeenCalled()
    expect(startSpy).not.toHaveBeenCalled()
  })
})
