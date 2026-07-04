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
  getSteamInstallSize
} from '../games'
import SteamLibraryManager from '../library'
import * as libraryModule from '../library'
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
      install: { install_size: '16106127360', install_path: '/games/tf2' }
    })
    const result = await getSteamInstallSize('440', gameInfo)
    expect(jest.mocked(axios.get)).not.toHaveBeenCalled()
    expect(result).toBe('15.00 GiB')
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
    // Assert: no frontend push — owned game must remain visible.
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('CONSOLE-01/B4: network error (axios throw) does NOT write is_delisted — catch block must never mark owned games delisted', async () => {
    // Arrange: axios rejects — simulates offline / network timeout.
    ;(axios.get as jest.Mock).mockRejectedValue(new Error('Network timeout'))
    library.set(APP_ID, makeEntry())

    // Act — must not throw synchronously or cause an unhandled rejection.
    expect(() => new SteamGame(APP_ID).getGameInfo()).not.toThrow()
    await flushAsync()

    // Assert: catch block only logs; no store write, no frontend push.
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })
})
