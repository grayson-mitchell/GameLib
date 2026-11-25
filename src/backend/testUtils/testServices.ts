/**
 * Test fakes for the per-boot services (66.1, R5). Plain objects, no jest APIs, so meta/ and
 * non-jest callers can use them. Mirrors scriptedRunner: an unscripted call fails loudly,
 * because a default result would hide a missing script.
 *
 * `createTestStores` resolves every family it was not given lazily, on first access (a getter),
 * from a fresh `createStores` against its own registry (the jest fake HOME), so a test that
 * never touches a family never builds it.
 */
import { createTestHostServices } from './testHostServices'
import { createTestGameConfigs, createTestGlobalConfig } from './testConfig'
import { TEST_APP_INFO } from './testContext'
import type { AppPaths } from '../process/context'
import { createStoreRegistry } from '../stores/storeRegistry'
import { createKvsStores } from '../constants/key_value_stores'
import { createDownloadManagerStores } from '../downloadmanager/stores'
import { createHumbleStores } from '../humble/stores'
import { createMacArchStores } from '../macArch/stores'
import { createRunsForMeStores } from '../runsForMe/stores'
import { createGogStores } from '../storeManagers/gog/stores'
import { createLegendaryStores } from '../storeManagers/legendary/stores'
import { createNileStores } from '../storeManagers/nile/stores'
import { createSideloadStores } from '../storeManagers/sideload/stores'
import { createSteamStores } from '../storeManagers/steam/stores'
import type { StoreFamilyDeps, StoreRoot } from '../stores/storeRoot'
import { createTestStoreRoot } from './testStoreRoot'
import { createFakeClock } from './fakeClock'
import { createTestOnlineMonitor } from './testOnlineMonitor'
import { createTestAppRuntime } from './testAppRuntime'
import { createTestMiscRuntime } from './testMiscRuntime'
import { createTestSteamLaunchRuntime } from './testSteamLaunchRuntime'
import { createTestBridgeRuntime } from './testBridgeRuntime'
import { createTestGogRuntime } from './testGogRuntime'
import {
  createTestLegendaryRuntime,
  createTestNileRuntime,
  createTestInfoCaches
} from './testEpicAmazonRuntimes'
import {
  createTestAbortRegistry,
  createTestWindowRaiser
} from './testAbortRegistry'
import { createTestSteamInstallRuntime } from './testSteamInstallRuntime'
import { createTestSignInProbe } from './testSignInProbe'
import { createTestSteamSession } from './testSteamSession'
import { createTestAnonymousClient } from './testAnonymousClient'
import { createTestTokenStoreSlot } from './testTokenStore'
import { createTestSteamBottle } from './testSteamBottle'
import { createInertTestSteamUser } from './testSteamUser'
import { createTestHumbleServices } from './testHumble'
import { createLoginWindowSeamSlot } from '../login/loginWindowSeam'
import { createTestBridgeHelpers } from './testBridgeHelpers'
import { createTestAppPaths } from './testAppPaths'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type {
  BootServices,
  CommandRunner,
  Launcher,
  ManagerDeps,
  QuitHandler,
  SpawnAsync,
  StoreManagers,
  Stores
} from '../services/types'

const RUNNERS = [
  'sideload',
  'gog',
  'legendary',
  'nile',
  'steam'
] as const satisfies readonly Runner[]

/** An object whose every member not in `given` throws when CALLED. */
function unscriptedMembers<T extends object>(
  label: string,
  given: Partial<T>,
  memberPrefix = ''
): T {
  return new Proxy(given as T, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) {
        return Reflect.get(target, prop, receiver) as unknown
      }
      // then/toJSON etc. must stay undefined so awaiting or serialising a fake is safe.
      if (prop === 'then' || prop === 'toJSON') return undefined
      return () => {
        throw new Error(
          `unscripted ${label} call: ${memberPrefix}${String(prop)}`
        )
      }
    }
  })
}

export function createTestManagers(
  overrides: {
    library?: { [R in Runner]?: Partial<LibraryManager> }
    launchHooks?: Partial<StoreManagers['launchHooks']>
    autoUpdate?: StoreManagers['autoUpdate']
    initAll?: StoreManagers['initAll']
  } = {}
): StoreManagers {
  const library = {} as Record<string, unknown>
  for (const runner of RUNNERS) {
    library[runner] = unscriptedMembers<LibraryManager>(
      'manager',
      overrides.library?.[runner] ?? {},
      `${runner}.`
    )
  }
  // The one cast: each runner object is a Proxy that throws on any unscripted member.
  const typedLibrary = library as unknown as StoreManagers['library']
  const launchHooks = {} as Record<string, unknown>
  for (const runner of RUNNERS) {
    launchHooks[runner] = overrides.launchHooks?.[runner] ?? {}
  }
  return {
    library: typedLibrary,
    launchHooks: launchHooks as StoreManagers['launchHooks'],
    autoUpdate:
      overrides.autoUpdate ??
      (() => {
        throw new Error('unscripted manager call: autoUpdate')
      }),
    initAll:
      overrides.initAll ??
      (() => {
        throw new Error('unscripted manager call: initAll')
      })
  }
}

const STORE_KEYS = [
  'kvs',
  'downloadManager',
  'humble',
  'macArch',
  'runsForMe',
  'gog',
  'legendary',
  'nile',
  'sideload',
  'steam'
] as const satisfies readonly (keyof Stores)[]

/** Builds one family against the shared registry; each call is lazy (see createTestStores). */
type FamilyBuilders = {
  [K in keyof Stores]: (deps: StoreFamilyDeps) => Stores[K]
}

/**
 * The factories are imported eagerly (importing a stores module has no side effect: the
 * stores modules only declare factories, and diPhaseGates pins that none constructs at import).
 * What stays lazy is the factory CALL, in the getters of createTestStores, so a family a suite
 * never reads never touches the real store backend.
 */
function familyBuilders(): FamilyBuilders {
  return {
    kvs: (deps) => createKvsStores(deps),
    downloadManager: (deps) => createDownloadManagerStores(deps),
    humble: (deps) => createHumbleStores(deps),
    macArch: (deps) => createMacArchStores(deps),
    runsForMe: (deps) => createRunsForMeStores(deps),
    gog: (deps) => createGogStores(deps),
    legendary: (deps) => createLegendaryStores(deps),
    nile: (deps) => createNileStores(deps),
    sideload: (deps) => createSideloadStores(deps),
    steam: (deps) => createSteamStores(deps)
  }
}

export function createTestStores(
  overrides: Partial<Stores> = {},
  root: StoreRoot = createTestStoreRoot()
): Stores {
  const stores = {} as Stores
  const deps: StoreFamilyDeps = { registry: createStoreRegistry(), root }
  const builders = familyBuilders()
  for (const key of STORE_KEYS) {
    const given = overrides[key]
    let built: Stores[typeof key] | undefined
    Object.defineProperty(stores, key, {
      enumerable: true,
      get: () => {
        if (given) return given
        // Lazy and per family on purpose: building a family touches the real store backend,
        // which a suite that overrides only the slices it reads must never reach, and a
        // suite that mocks one family's module must not break the others.
        built ??= builders[key](deps)
        return built
      }
    })
  }
  return stores
}

export function createTestServices(
  overrides: Partial<BootServices> = {}
): BootServices {
  const spawnAsync: SpawnAsync = () => {
    throw new Error('unscripted spawnAsync call')
  }
  const quit: QuitHandler = {
    handleExit: () => {
      throw new Error('unscripted quit call: handleExit')
    }
  }
  const host = overrides.host ?? createTestHostServices()
  // One root per services bundle: the stores write and notify through the root handlers bind on.
  const storeRoot = overrides.storeRoot ?? createTestStoreRoot()
  const stores = overrides.stores ?? createTestStores({}, storeRoot)
  const config = overrides.config ?? createTestGlobalConfig()
  const signInProbe =
    overrides.signInProbe ?? createTestSignInProbe({ ipc: host.ipc })
  const steamUser = overrides.steamUser ?? createInertTestSteamUser()
  // One seam slot per services bundle, shared with the Humble services this bundle builds (94-04).
  const loginWindowSeam =
    overrides.loginWindowSeam ?? createLoginWindowSeamSlot()
  return {
    stores,
    storeRegistry: overrides.storeRegistry ?? createStoreRegistry(),
    storeRoot,
    managers: overrides.managers ?? createTestManagers(),
    launcher: overrides.launcher ?? unscriptedMembers<Launcher>('launcher', {}),
    commandRunner:
      overrides.commandRunner ??
      unscriptedMembers<CommandRunner>('command runner', {}),
    runner:
      overrides.runner ??
      unscriptedMembers<BootServices['runner']>('process runner', {}),
    clock: overrides.clock ?? createFakeClock(),
    steamProcesses: overrides.steamProcesses ?? createTestSteamProcesses(),
    spawnAsync: overrides.spawnAsync ?? spawnAsync,
    quit: overrides.quit ?? quit,
    downloadQueue:
      overrides.downloadQueue ??
      unscriptedMembers<BootServices['downloadQueue']>('download queue', {}),
    host,
    config,
    gameConfigs: overrides.gameConfigs ?? createTestGameConfigs(),
    paths: overrides.paths ?? createTestPaths(),
    appInfo: overrides.appInfo ?? TEST_APP_INFO,
    onlineMonitor: overrides.onlineMonitor ?? createTestOnlineMonitor(),
    steamLaunchRuntime:
      overrides.steamLaunchRuntime ?? createTestSteamLaunchRuntime(),
    bridgeRuntime: overrides.bridgeRuntime ?? createTestBridgeRuntime(),
    steamInstallRuntime:
      overrides.steamInstallRuntime ?? createTestSteamInstallRuntime(),
    gogRuntime: overrides.gogRuntime ?? createTestGogRuntime(),
    legendaryRuntime:
      overrides.legendaryRuntime ?? createTestLegendaryRuntime(),
    nileRuntime: overrides.nileRuntime ?? createTestNileRuntime(),
    infoCaches: overrides.infoCaches ?? createTestInfoCaches(),
    aborts: overrides.aborts ?? createTestAbortRegistry(),
    appRuntime: overrides.appRuntime ?? createTestAppRuntime(),
    miscRuntime: overrides.miscRuntime ?? createTestMiscRuntime(),
    windowRaiser: overrides.windowRaiser ?? createTestWindowRaiser(),
    signInProbe,
    steamSession: overrides.steamSession ?? createTestSteamSession(),
    tokenStore: overrides.tokenStore ?? createTestTokenStoreSlot(),
    anonymousClient: overrides.anonymousClient ?? createTestAnonymousClient(),
    bridgeHelpers: overrides.bridgeHelpers ?? createTestBridgeHelpers(),
    steamBottle:
      overrides.steamBottle ?? createTestSteamBottle({ stores, config }),
    steamUser,
    loginWindowSeam,
    humble:
      overrides.humble ??
      createTestHumbleServices({
        stores,
        steamUser,
        signInOutcomes: signInProbe.outcomes,
        loginWindowSeam
      })
  }
}

/** Placeholder paths nothing reads from or creates: a suite that needs real dirs uses createTestContext. */
function createTestPaths(): AppPaths {
  const root = '/test-gamelib'
  return createTestAppPaths(root, {
    appRoot: `${root}/app`,
    publicDir: `${root}/app/public`,
    userData: `${root}/userData`,
    appData: `${root}/appData`,
    exe: `${root}/GameLib`,
    knownFolder: (name) =>
      `${root}/${name === 'desktop' ? 'Desktop' : 'Documents'}`
  })
}

/** Steam process instances whose members throw until a test scripts them. */
function createTestSteamProcesses(
  overrides: Partial<ManagerDeps['steamProcesses']> = {}
): ManagerDeps['steamProcesses'] {
  return {
    macSteam: overrides.macSteam ?? createInertSteamProcesses().macSteam,
    drm: unscriptedMembers<ManagerDeps['steamProcesses']['drm']>(
      'steam drm',
      overrides.drm ?? {}
    )
  }
}

/**
 * Steam process instances that do nothing: the poller never ticks, no monitor ever spawns or
 * reports a live reading. For suites that run Steam library code but do not assert on either
 * (a test that does passes its own members, e.g. jest.fn()s).
 */
export function createInertSteamProcesses(
  overrides: Partial<ManagerDeps['steamProcesses']> = {}
): ManagerDeps['steamProcesses'] {
  return {
    macSteam: overrides.macSteam ?? {
      isSteamRunning: () => Promise.resolve(false),
      openUrlDetached: () => undefined
    },
    drm:
      overrides.drm ??
      unscriptedMembers<ManagerDeps['steamProcesses']['drm']>('steam drm', {})
  }
}

/** Deps for a library manager under test; any member not given throws when called. */
export function createTestManagerDeps(
  overrides: Partial<ManagerDeps> = {}
): ManagerDeps {
  const host = createTestHostServices()
  const stores = overrides.stores ?? createTestStores()
  const config = overrides.config ?? createTestGlobalConfig()
  return {
    libraryManagers: overrides.libraryManagers ?? createTestManagers().library,
    stores,
    commandRunner:
      overrides.commandRunner ??
      unscriptedMembers<CommandRunner>('command runner', {}),
    launcher: overrides.launcher ?? unscriptedMembers<Launcher>('launcher', {}),
    spawnAsync:
      overrides.spawnAsync ??
      (() => {
        throw new Error('unscripted spawnAsync call')
      }),
    runner:
      overrides.runner ??
      unscriptedMembers<ManagerDeps['runner']>('process runner', {}),
    clock: overrides.clock ?? createFakeClock(),
    steamProcesses: overrides.steamProcesses ?? createTestSteamProcesses(),
    getDownloadQueue:
      overrides.getDownloadQueue ??
      (() => {
        throw new Error('unscripted call: getDownloadQueue')
      }),
    config,
    gameConfigs: overrides.gameConfigs ?? createTestGameConfigs(),
    paths: overrides.paths ?? createTestPaths(),
    appInfo: overrides.appInfo ?? TEST_APP_INFO,
    dialogs: overrides.dialogs ?? host.dialogs,
    sendFrontendMessage:
      overrides.sendFrontendMessage ?? host.sendFrontendMessage,
    requestRustInvoke: overrides.requestRustInvoke ?? host.requestRustInvoke,
    openExternal: overrides.openExternal ?? host.openExternal,
    notifications: overrides.notifications ?? host.notifications,
    appState: overrides.appState ?? host.appState,
    imageTools: overrides.imageTools ?? host.imageTools,
    onlineMonitor: overrides.onlineMonitor ?? createTestOnlineMonitor(),
    steamLaunchRuntime:
      overrides.steamLaunchRuntime ?? createTestSteamLaunchRuntime(),
    bridgeRuntime: overrides.bridgeRuntime ?? createTestBridgeRuntime(),
    steamInstallRuntime:
      overrides.steamInstallRuntime ?? createTestSteamInstallRuntime(),
    gogRuntime: overrides.gogRuntime ?? createTestGogRuntime(),
    legendaryRuntime:
      overrides.legendaryRuntime ?? createTestLegendaryRuntime(),
    nileRuntime: overrides.nileRuntime ?? createTestNileRuntime(),
    infoCaches: overrides.infoCaches ?? createTestInfoCaches(),
    aborts: overrides.aborts ?? createTestAbortRegistry(),
    appRuntime: overrides.appRuntime ?? createTestAppRuntime(),
    miscRuntime: overrides.miscRuntime ?? createTestMiscRuntime(),
    windowRaiser: overrides.windowRaiser ?? createTestWindowRaiser(),
    signIn: overrides.signIn ?? createTestSignInProbe(),
    steamSession: overrides.steamSession ?? createTestSteamSession(),
    tokenStore: overrides.tokenStore ?? createTestTokenStoreSlot(),
    anonymousClient: overrides.anonymousClient ?? createTestAnonymousClient(),
    bridgeHelpers: overrides.bridgeHelpers ?? createTestBridgeHelpers(),
    steamBottle:
      overrides.steamBottle ?? createTestSteamBottle({ stores, config }),
    steamUser: overrides.steamUser ?? createInertTestSteamUser(),
    loginWindowSeam: overrides.loginWindowSeam ?? createLoginWindowSeamSlot()
  }
}

/**
 * The config, app-info and host slices `createTools` (ToolsDeps) and the engine source read.
 * A test spreads this into its tools deps literal.
 */
export function createTestToolsSlices(
  overrides: { sendFrontendMessage?: ManagerDeps['sendFrontendMessage'] } = {}
) {
  const host = createTestHostServices()
  const config = createTestGlobalConfig()
  return {
    config,
    gameConfigs: createTestGameConfigs(),
    appInfo: TEST_APP_INFO,
    dialogs: host.dialogs,
    sendFrontendMessage:
      overrides.sendFrontendMessage ?? host.sendFrontendMessage,
    requestRustInvoke: host.requestRustInvoke,
    appState: host.appState,
    notifications: host.notifications,
    onlineMonitor: createTestOnlineMonitor(),
    steamLaunchRuntime: createTestSteamLaunchRuntime(),
    bridgeRuntime: createTestBridgeRuntime(),
    steamInstallRuntime: createTestSteamInstallRuntime(),
    gogRuntime: createTestGogRuntime(),
    legendaryRuntime: createTestLegendaryRuntime(),
    nileRuntime: createTestNileRuntime(),
    infoCaches: createTestInfoCaches(),
    aborts: createTestAbortRegistry(),
    appRuntime: createTestAppRuntime(),
    windowRaiser: createTestWindowRaiser(),
    paths: createTestPaths(),
    steamBottle: createTestSteamBottle({ stores: createTestStores(), config })
  }
}
