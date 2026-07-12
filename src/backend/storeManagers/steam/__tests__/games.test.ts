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
import { sendFrontendMessage } from '../../../ipc'
import { steamMetadataStore } from '../electronStores'
import SteamGame, {
  parseSteamStorageRequirement,
  getSteamInstallSize,
  parseSteamMacMinOSVersion,
  macArchFromMinOS
} from '../games'
import SteamLibraryManager from '../library'
import * as libraryModule from '../library'
import {
  isBottleReady,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  getSteamBottleSettings
} from '../bottle'
import { library, pendingFetches } from '../state'
import type { GameInfo } from 'common/types'

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

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── Metadata cache store mock — controls steamMetadataStore ──────────────────
jest.mock('../electronStores', () => ({
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
    set: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── electron shell mock — controls shell.openExternal ────────────────────────
jest.mock('electron', () => ({
  shell: {
    openExternal: jest.fn()
  },
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path')
  }
}))

// ── dialog notify mock ────────────────────────────────────────────────────────
jest.mock('backend/dialog/dialog', () => ({
  notify: jest.fn(),
  showDialogBoxModalAuto: jest.fn()
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
  getFileSize: jest.fn()
}))
jest.mock('../user', () => ({
  SteamUser: { isLoggedIn: jest.fn(), getClient: jest.fn() }
}))
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn()
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
jest.mock('../bottle', () => ({
  isBottleReady: jest.fn(),
  tellBottledSteamToInstall: jest.fn(),
  tellBottledSteamToLaunch: jest.fn(),
  tellBottledSteamToUninstall: jest.fn(),
  getSteamBottleSettings: jest.fn()
}))

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
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true
    })

    const result = new SteamGame(APP_ID).getGameInfo()

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

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(axios.get).toHaveBeenCalledTimes(1)
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

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(axios.get).not.toHaveBeenCalled()
  })

  // ── LIB-04: lazy metadata fetch via Steam store API ──────────────────────

  it('LIB-04: when art_cover is empty, fetchMetadataIfNeeded calls the Steam store appdetails API', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
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

    new SteamGame(APP_ID).getGameInfo()
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

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    const updated = library.get(APP_ID)!
    expect(updated.is_mac_native).toBe(true)
    expect(updated.is_linux_native).toBe(false)
  })

  it('DETAIL-01: native platform flags are persisted to steamMetadataStore', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
    await flushAsync()

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        is_mac_native: true,
        is_linux_native: false
      })
    )
  })

  // ── LIB-04: cache persistence ─────────────────────────────────────────────

  it('LIB-04: fetched metadata is written to steamMetadataStore for indefinite reuse', async () => {
    ;(axios.get as jest.Mock).mockResolvedValue(fixtureApiResponse)
    library.set(APP_ID, makeEntry())

    new SteamGame(APP_ID).getGameInfo()
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

    new SteamGame(APP_ID).getGameInfo()
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

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)

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

    const manager = new SteamLibraryManager()
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

describe('SteamGame.launch() — GAME-01', () => {
  let shellOpenExternal: jest.Mock
  let notifyMock: jest.Mock
  let logWarningMock: jest.Mock

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    logWarningMock = jest.requireMock('backend/logger').logWarning as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
  })

  it('GAME-01: launch() calls shell.openExternal with steam://rungameid/{appId} for numeric appId', async () => {
    const game = new SteamGame(APP_ID)
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
    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
  })

  it('launch() does NOT show a hand-off toast (toast feature removed — Steam opens fast enough)', async () => {
    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('T-03-01: launch() does NOT call shell.openExternal when appId is non-numeric (injection guard)', async () => {
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() does NOT call shell.openExternal for appId with shell metacharacters', async () => {
    const badId = '12; rm -rf ~'
    const badGame = new SteamGame(badId)
    library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() does NOT call shell.openExternal for appId with path traversal', async () => {
    const badId = '10/../uninstall/5'
    const badGame = new SteamGame(badId)
    library.set(badId, makeEntry({ app_name: badId, title: 'BadGame' }))

    const result = await badGame.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toBe(false)
  })

  it('T-03-01: launch() logs a warning when appId is invalid', async () => {
    const badGame = new SteamGame('not-a-number')
    library.set(
      'not-a-number',
      makeEntry({ app_name: 'not-a-number', title: 'BadGame' })
    )

    await badGame.launch({} as any)

    expect(logWarningMock).toHaveBeenCalled()
  })

  it('GAME-04/D-06: launch() does not invoke any Wine/Proton routine — only shell.openExternal is called as external exec', async () => {
    // Verify that the steam:// URL contains rungameid (not a Heroic runtime command)
    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    // shell.openExternal must be called with a steam:// URL using rungameid — NOT a CLI/Wine command
    const calls = shellOpenExternal.mock.calls
    expect(calls.length).toBe(1)
    const url: string = calls[0][0]
    expect(url).toMatch(/^steam:\/\/rungameid\/\d+$/)
  })

})

// ── D-11: SteamGame.isNative() — per-OS confirmed-not-native ─────────────────

describe('SteamGame.isNative() — D-11 per-OS confirmed-not-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('D-11: macOS confirmed-not-native (platformsCaptured:true, is_mac_native:false) — isNative() returns false', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(false)
  })

  it('D-11 (BLOCKER): macOS NOT-yet-captured (platformsCaptured not true) — isNative() returns true (do not bottle an unconfirmed game)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('macOS Mac-native game (platformsCaptured:true, is_mac_native:true) — isNative() returns true', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })

  it('macOS with no metadata entry at all — isNative() returns true (D-11 ambiguous-default fallback)', () => {
    envMock.isMac = true
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.launch() bottle routing ─────────────────

describe('SteamGame.launch() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToLaunch as jest.Mock).mockReset()
  })

  it('bottle-eligible + un-provisioned: launch() does NOT call shell.openExternal, emits steamBottleSetupRequired, resolves false', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
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
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToLaunch as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToLaunch).toHaveBeenCalledWith(APP_ID)
    expect(result).toBe(true)
  })

  it('D-10/scope-fence: NON-eligible (Mac-native) — launch() STILL calls shell.openExternal with steam://rungameid/<appId> (native path unchanged)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true
    })

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://rungameid/${APP_ID}`,
      { activate: false }
    )
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
    const game = new SteamGame(APP_ID)
    await expect(game.stop()).resolves.toBeUndefined()
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
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    // Spy on startInstallPolling so install() can call it without running the real poller
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('GAME-02: install() calls shell.openExternal with steam://install/{appId} for numeric appId', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
  })

  it('GAME-02/focus: native install HANDS FOCUS to Steam — openExternal is called WITHOUT { activate: false }, so the steam:// protocol handler foregrounds the native Steam client (OS-delegated parity with the CrossOver path\'s raiseInstallerWindow() System Events raise); contrast launch() which passes { activate: false } to avoid stealing foreground', async () => {
    const game = new SteamGame(APP_ID)
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
    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(result).toEqual({ status: 'done' })
  })

  it('install() does NOT show a hand-off toast (toast feature removed)', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('T-03-01: install() does NOT call shell.openExternal when appId is non-numeric', async () => {
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))

    const result = await badGame.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({ status: 'error' }))
  })

  it('GAME-02: install() does NOT call sendFrontendMessage directly (no optimistic flip — D-02)', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    // Badge flipped by ACF poller (D-07) or focus re-read (D-01), never by click (D-02)
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('GAME-02/D-07: install() calls startInstallPolling with this.appId after successful openExternal', async () => {
    const game = new SteamGame(APP_ID)
    await game.install({} as any)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID)
  })

  it('D-07: install() does NOT call startInstallPolling when appId is non-numeric (T-03-01 guard)', async () => {
    const badGame = new SteamGame('abc')
    library.set('abc', makeEntry({ app_name: 'abc', title: 'BadGame' }))
    await badGame.install({} as any)
    expect(startInstallPollingSpy).not.toHaveBeenCalled()
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.install() bottle routing ────────────────

describe('SteamGame.install() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  let startInstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2' }))
    startInstallPollingSpy = jest
      .spyOn(libraryModule, 'startInstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToInstall as jest.Mock).mockReset()
  })

  afterEach(() => {
    startInstallPollingSpy.mockRestore()
  })

  it('bottle-eligible + un-provisioned: install() does NOT call shell.openExternal and emits steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
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
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'steamBottleSetupRequired',
      { appName: APP_ID }
    )
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('bottle-eligible + provisioned: install() calls tellBottledSteamToInstall + bottle-scoped startInstallPolling, NOT shell.openExternal', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToInstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToInstall).toHaveBeenCalledWith(APP_ID)
    expect(startInstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
    expect(result).toEqual({ status: 'done' })
  })

  it('D-11 (BLOCKER): NOT-yet-captured macOS game — install() STILL takes the native steam://install path and does NOT emit steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: false,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
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

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
  })

  it('D-10/scope-fence: NON-eligible (non-mac) — install() STILL calls shell.openExternal with steam://install/<appId>', async () => {
    envMock.isMac = false
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Windows Only Game' }))
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
  })

  afterEach(() => {
    // Explicit reset (do not rely on test-order discipline in later describes).
    envMock.isMac = false
  })

  it('platformsCaptured-uncaptured macOS install does NOT fall through to native — forces a synchronous capture and routes to guided setup', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(windowsOnlyFixture)
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(axios.get).toHaveBeenCalled()
    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBottleSetupRequired', {
      appName: APP_ID
    })
    expect(result).toEqual({ status: 'done', deferredToSetup: true })
  })

  it('native-Mac game routes native after capture — install() calls shell.openExternal once platforms resolve is_mac_native:true', async () => {
    mockStatefulMetadataStore({ platformsCaptured: undefined })
    ;(axios.get as jest.Mock).mockResolvedValue(macNativeFixture)

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(axios.get).toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(result).toEqual({ status: 'done' })
  })

  it('non-macOS install skips platform capture — axios.get is NOT called by ensurePlatformsCaptured, native path used unchanged', async () => {
    envMock.isMac = false
    mockStatefulMetadataStore({ platformsCaptured: undefined })

    const game = new SteamGame(APP_ID)
    const result = await game.install({} as any)

    expect(axios.get).not.toHaveBeenCalled()
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://install/${APP_ID}`)
    expect(result).toEqual({ status: 'done' })
  })

  it('already-captured game skips the fetch — no redundant network on the hot path', async () => {
    mockStatefulMetadataStore({ platformsCaptured: true, is_mac_native: false })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
    await game.install({} as any)

    expect(axios.get).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith('steamBottleSetupRequired', {
      appName: APP_ID
    })
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
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    notifyMock = jest.requireMock('backend/dialog/dialog').notify as jest.Mock
    showDialogBoxModalAutoMock = jest.requireMock('backend/dialog/dialog')
      .showDialogBoxModalAuto as jest.Mock
    library.set(APP_ID, makeEntry({ title: 'Dota 2', is_installed: true }))
    // Spy on startUninstallPolling so uninstall() can call it without running the real poller
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  it('GAME-03: uninstall() calls shell.openExternal with steam://uninstall/{appId}', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledTimes(1)
    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
  })

  it('GAME-03: uninstall() resolves an ExecResult { stdout, stderr }', async () => {
    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(result).toEqual(expect.objectContaining({ stdout: '', stderr: '' }))
  })

  it('D-07: uninstall() calls startUninstallPolling with this.appId after successful openExternal', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)
    expect(startUninstallPollingSpy).toHaveBeenCalledWith(APP_ID)
  })

  it('D-07: uninstall() does NOT call startUninstallPolling when appId is non-numeric (T-03-01 guard)', async () => {
    const badGame = new SteamGame('abc')
    library.set(
      'abc',
      makeEntry({ app_name: 'abc', title: 'BadGame', is_installed: true })
    )
    await badGame.uninstall({} as any)
    expect(startUninstallPollingSpy).not.toHaveBeenCalled()
  })

  it('uninstall() does NOT show a hand-off toast (toast feature removed)', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(notifyMock).not.toHaveBeenCalled()
  })

  it('D-05: uninstall() does NOT show a GamerLib confirmation dialog', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    // Steam shows its own confirm dialog — GamerLib must not add a second one
    expect(showDialogBoxModalAutoMock).not.toHaveBeenCalled()
  })

  it('D-01/D-02: uninstall() does NOT call sendFrontendMessage (no optimistic flip, reconcile on focus)', async () => {
    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    // Badge state is reconciled only after the focus ACF re-read, never assumed from click
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })
})

// ── Phase 17 (D-10/D-11): SteamGame.uninstall() bottle routing ──────────────

describe('SteamGame.uninstall() — Phase 17 bottle routing (D-10/D-11)', () => {
  let shellOpenExternal: jest.Mock
  let startUninstallPollingSpy: jest.SpyInstance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    const { shell } = jest.requireMock('electron')
    shellOpenExternal = shell.openExternal as jest.Mock
    shellOpenExternal.mockResolvedValue(undefined)
    library.set(APP_ID, makeEntry({ title: 'Dota 2', is_installed: true }))
    startUninstallPollingSpy = jest
      .spyOn(libraryModule, 'startUninstallPolling')
      .mockImplementation(() => {})
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isWindows = false
    envMock.isLinux = false
    ;(isBottleReady as jest.Mock).mockReset()
    ;(tellBottledSteamToUninstall as jest.Mock).mockReset()
  })

  afterEach(() => {
    startUninstallPollingSpy.mockRestore()
  })

  it('bottle-eligible + provisioned: uninstall() calls tellBottledSteamToUninstall + bottle-scoped startUninstallPolling, NOT shell.openExternal', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(true)
    ;(tellBottledSteamToUninstall as jest.Mock).mockResolvedValue({
      status: 'done'
    })

    const game = new SteamGame(APP_ID)
    const result = await game.uninstall({} as any)

    expect(shellOpenExternal).not.toHaveBeenCalled()
    expect(tellBottledSteamToUninstall).toHaveBeenCalledWith(APP_ID)
    expect(startUninstallPollingSpy).toHaveBeenCalledWith(APP_ID, {
      source: 'bottle'
    })
    expect(result).toEqual({ stdout: '', stderr: '' })
  })

  it('bottle-eligible + un-provisioned: uninstall() does NOT call shell.openExternal and emits steamBottleSetupRequired', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })
    ;(isBottleReady as jest.Mock).mockReturnValue(false)

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
    await game.uninstall({} as any)

    expect(shellOpenExternal).toHaveBeenCalledWith(
      `steam://uninstall/${APP_ID}`
    )
    expect(tellBottledSteamToUninstall).not.toHaveBeenCalled()
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  it('major > 10: No Man\'s Sky resolves to 12.3', () => {
    expect(
      parseSteamMacMinOSVersion('<li><strong>OS:</strong> macOS Monterey 12.3<br></li>')
    ).toEqual({ major: 12, minor: 3 })
  })

  it('returns null for undefined input (empty-array proxy: mac_requirements: [] yields undefined via optional chaining)', () => {
    expect(parseSteamMacMinOSVersion(undefined)).toBeNull()
  })

  it('returns null without throwing when no OS line is present at all', () => {
    expect(parseSteamMacMinOSVersion('no os line here at all')).toBeNull()
  })

  it('returns null for non-string input (typeof guard)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      macArchFromMinOS('<li><strong>OS: OSX 10.9.5 - 10.11.6</strong> <br></li>')
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

  it('forceUninstall() deletes the appId from the in-memory library Map', async () => {
    expect(library.has(APP_ID)).toBe(true)

    const game = new SteamGame(APP_ID)
    await game.forceUninstall()

    expect(library.has(APP_ID)).toBe(false)
  })

  it('forceUninstall() calls sendFrontendMessage pushGameToLibrary with is_installed: false', async () => {
    const game = new SteamGame(APP_ID)
    await game.forceUninstall()

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, is_installed: false })
    )
  })
})

// ── Supporting read methods: getSettings, getExtraInfo, isGameAvailable ───────

describe('SteamGame supporting read methods — GAME-01 unblock', () => {
  let existsSyncMock: jest.Mock

  beforeEach(() => {
    library.clear()
    pendingFetches.clear()
    existsSyncMock = jest.requireMock('graceful-fs').existsSync as jest.Mock
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
    const game = new SteamGame(APP_ID)
    const settings = await game.getSettings()

    expect(settings).toBeDefined()
    expect(settings.autoSyncSaves).toBe(false)
  })

  it('getSettings() does not throw', async () => {
    const game = new SteamGame(APP_ID)
    await expect(game.getSettings()).resolves.not.toThrow()
  })

  // ── Phase 17 (D-11): getSettings() bottle-eligible resolution ────────────
  //
  // LAUNCH ORDERING: launcher.ts's launchEventCallback runs checkWineBeforeLaunch
  // BEFORE game.launch() for a bottle-eligible game (isNative()===false) — that
  // pre-step consumes THIS getSettings() result. It must resolve the dedicated
  // bottle store (getSteamBottleSettings), never fall through to an empty
  // per-appId GameConfig.get(<numeric appId>) (Pitfall-6 phantom-config guard).

  describe('bottle-eligible resolution (D-11)', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let envMock: any

    beforeEach(() => {
      envMock = jest.requireMock('backend/constants/environment')
      envMock.isMac = true
      envMock.isWindows = false
      envMock.isLinux = false
      ;(getSteamBottleSettings as jest.Mock).mockReset()
    })

    it('bottle-eligible game: getSettings() resolves getSteamBottleSettings(), NOT GameConfig.get(<appId>)', async () => {
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      const bottleSettings = {
        autoSyncSaves: false,
        wineVersion: { name: 'CrossOver', type: 'crossover', bin: '' },
        wineCrossoverBottle: 'GameLibSteam'
      }
      ;(getSteamBottleSettings as jest.Mock).mockReturnValue(bottleSettings)
      const gameConfigGetMock = jest.requireMock('backend/game_config')
        .GameConfig.get as jest.Mock
      gameConfigGetMock.mockClear()

      const game = new SteamGame(APP_ID)
      const settings = await game.getSettings()

      expect(settings).toBe(bottleSettings)
      expect(getSteamBottleSettings).toHaveBeenCalledTimes(1)
      expect(gameConfigGetMock).not.toHaveBeenCalled()
    })

    it('non-eligible macOS game (Mac-native): getSettings() falls back to GameConfig.get(<appId>) unchanged', async () => {
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

      const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
    const extra = await game.getExtraInfo()

    expect(extra).toEqual(extraData)
  })

  it('getExtraInfo() resolves a safe default when extra is absent', async () => {
    library.set(APP_ID, makeEntry({ extra: undefined }))

    const game = new SteamGame(APP_ID)
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
    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(true)
    expect(existsSyncMock).toHaveBeenCalledWith('/games/dota2')
  })

  it('isGameAvailable() resolves false when game is not installed', async () => {
    library.set(APP_ID, makeEntry({ is_installed: false, install: {} }))

    const game = new SteamGame(APP_ID)
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

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves false when game is delisted and installed (LIB-07)', async () => {
    existsSyncMock.mockReturnValue(true)
    library.set(
      APP_ID,
      makeEntry({
        is_installed: true,
        is_delisted: true,
        install: { install_path: '/games/dota2' }
      })
    )

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
  })

  it('isGameAvailable() resolves false when game is delisted and not installed (LIB-07)', async () => {
    library.set(
      APP_ID,
      makeEntry({ is_installed: false, is_delisted: true, install: {} })
    )

    const game = new SteamGame(APP_ID)
    const available = await game.isGameAvailable()

    expect(available).toBe(false)
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
    new SteamGame(APP_ID).getGameInfo()
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
    new SteamGame(APP_ID).getGameInfo()
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
    new SteamGame(APP_ID).getGameInfo()
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
    expect(() => new SteamGame(APP_ID).getGameInfo()).not.toThrow()
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
