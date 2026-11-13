import { mockedFsSteamFiles } from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
/**
 * getBridgeRouteVerdict() -- D-51-09 Task 2's installedIn (LOCATION) wiring.
 * Moved out of games.test.ts with the function (65-13, D-03); the collaborator
 * mocks below are the subset the real SteamGame + eligibility chain needs.
 */
import { existsSync } from 'graceful-fs'
import { getBridgeRouteVerdict } from '../bridgeRouteVerdict'
import { isBridgeBottleReady } from '../bridgeBottle'
import { bridgeAllowlist } from '../bridge/allowlist'
import type { GameInfo } from 'common/types'

const steamMetadataStore = {
  get: jest.fn(),
  set: jest.fn(),
  entries: jest.fn().mockReturnValue([])
}
const steamTestDeps = createTestManagerDeps({
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  stores: createTestStores({
    steam: {
      configStore: {
        get: jest.fn(),
        get_nodefault: jest.fn(),
        set: jest.fn(),
        clear: jest.fn()
      },
      steamLibraryStore: { get: jest.fn(), set: jest.fn() },
      steamMetadataStore,
      steamSyncStore: { get: jest.fn(), set: jest.fn() }
    } as never
  })
})

// The boot-owned Steam library state the code under test reads (D-66.3-13): one instance per file.
const library = steamTestDeps.steamSession.libraryState.library
const pendingFetches = steamTestDeps.steamSession.libraryState.pendingFetches

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('axios')
jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: jest.fn(),
  removeShortcuts: jest.fn(),
  shortcutFiles: jest.fn()
}))
jest.mock('backend/dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn()),
  showDialogBoxModalAuto: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
}))
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn(),
  sendGameStatusUpdate: jest.fn()
}))
jest.mock('backend/connectivityNow', () => ({
  checkConnectivityNow: jest.fn()
}))
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
}))
jest.mock('backend/engine/bottlePrimitives', () => ({
  buildFallbackGameSettings: jest.fn(),
  getBottleDir: jest.fn(),
  sanitizeBottleName: (name: string | null) => name
}))
jest.mock('../bottle', () => ({
  isCrossoverInstalled: async () => true,
  isBottleReady: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  getBottleSteamappsDir: jest.fn()
}))
jest.mock('../bridgeBottleLifecycle', () => ({
  stopPerGameBridgeBottle: jest.fn()
}))
jest.mock('../bridgeBottle', () => {
  // Same shape as games.test.ts: findBridgeInstallBottle closes over the
  // isBridgeBottleReady jest.fn so a test drives LOCATION through it.
  const isBridgeBottleReady = jest.fn()
  return {
    isBridgeBottleReady,
    getBridgeBottleSettings: jest.fn(),
    createDrmBridgeRunners: () => ({}),
    bridgeBottleNameFor: (appId: string): string | null =>
      /^\d+$/.test(appId) ? `GameLibSteamBridge-${appId}` : null,
    findBridgeInstallBottle: (appId: string): string | null => {
      const perGameName = /^\d+$/.test(appId)
        ? `GameLibSteamBridge-${appId}`
        : null
      if (perGameName && isBridgeBottleReady(perGameName)) {
        return perGameName
      }
      if (isBridgeBottleReady('GameLibSteamBridge')) {
        return 'GameLibSteamBridge'
      }
      return null
    }
  }
})
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn(), knownBadReason: jest.fn() }
}))

const APP_ID = '570'

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

// ── getBridgeRouteVerdict() — D-51-09 Task 2's installedIn (LOCATION) wiring ──

describe('getBridgeRouteVerdict() — D-51-09 installedIn (LOCATION, not eligibility)', () => {
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    steamMetadataStore.get.mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(bridgeAllowlist.has as jest.Mock).mockReset().mockReturnValue(false)
    ;(bridgeAllowlist.knownBadReason as jest.Mock)
      .mockReset()
      .mockReturnValue(null)
    ;(isBridgeBottleReady as jest.Mock).mockReset().mockReturnValue(false)
    ;(existsSync as jest.Mock).mockReset().mockReturnValue(false)
  })

  afterEach(() => {
    envMock.isMac = false
    envMock.isWindows = false
    envMock.isLinux = true
  })

  it('rejects a non-numeric appId as not-eligible with installedIn null, never reaching checkBridgeRoute', async () => {
    const result = await getBridgeRouteVerdict(steamTestDeps, 'not-numeric')

    expect(result.route).toBe('not-eligible')
    expect(result.installedIn).toBeNull()
  })

  it("installedIn is 'bridge' when findBridgeInstallBottle locates an existing bridge install, independent of the eligibility route", async () => {
    // isBridgeBottleReady(true) drives the test-double findBridgeInstallBottle
    // reimplementation (see the '../bottle' factory mock above) to a non-null
    // result for ANY appId.
    ;(isBridgeBottleReady as jest.Mock).mockReturnValue(true)

    const result = await getBridgeRouteVerdict(steamTestDeps, APP_ID)

    expect(result.installedIn).toBe('bridge')
  })

  it("installedIn is 'bottle' when no bridge bottle holds this install but the title is installed AND bottle-eligible (existing GameLibSteam install, D-51-09's core distinction)", async () => {
    library.set(APP_ID, makeEntry({ title: 'Avernum 4', is_installed: true }))

    const result = await getBridgeRouteVerdict(steamTestDeps, APP_ID)

    expect(result.installedIn).toBe('bottle')
  })

  it('installedIn stays null when the title is not installed anywhere and no bridge bottle holds it', async () => {
    library.set(APP_ID, makeEntry({ title: 'Avernum 4', is_installed: false }))

    const result = await getBridgeRouteVerdict(steamTestDeps, APP_ID)

    expect(result.installedIn).toBeNull()
  })
})
