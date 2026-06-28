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
import SteamGame from '../games'
import SteamLibraryManager from '../library'
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
jest.mock('backend/utils', () => ({ getSteamLibraries: jest.fn() }))
jest.mock('../user', () => ({
  SteamUser: { isLoggedIn: jest.fn(), getClient: jest.fn() }
}))
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn()
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
    const entry = makeEntry({ title: 'Dota 2', art_cover: 'https://example.com/art.jpg' })
    library.set(APP_ID, entry)

    const result = new SteamGame(APP_ID).getGameInfo()

    expect(result).toBe(entry)
    // Synchronous return — axios must NOT have been called yet
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
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}`
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
    expect(updated.extra?.about?.description).toBe('A multiplayer online battle arena game.')
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
        title: 'Dota 2'
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
    // steamMetadataStore.set and sendFrontendMessage must NOT have been called
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalled()
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
      `https://store.steampowered.com/api/appdetails?appids=${APP_ID}`
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
    expect(shellOpenExternal).toHaveBeenCalledWith(`steam://rungameid/${APP_ID}`)
  })

  it('GAME-01: launch() resolves true for a valid numeric appId', async () => {
    const game = new SteamGame(APP_ID)
    const result = await game.launch({} as any)

    expect(result).toBe(true)
  })

  it('D-03: launch() fires notify with hand-off toast before/around openExternal', async () => {
    const game = new SteamGame(APP_ID)
    await game.launch({} as any)

    expect(notifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Opening in Steam…' })
    )
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
    library.set('not-a-number', makeEntry({ app_name: 'not-a-number', title: 'BadGame' }))

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

  it('GAME-01: isNative() still returns true (unchanged — Wine branch is skipped in launcher.ts)', () => {
    const game = new SteamGame(APP_ID)
    expect(game.isNative()).toBe(true)
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
    ;(jest.requireMock('backend/game_config').GameConfig.get as jest.Mock).mockReturnValue({
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
})
