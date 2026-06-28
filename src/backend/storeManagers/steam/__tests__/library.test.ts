/**
 * Unit tests for SteamLibraryManager — LIB-01, LIB-02, LIB-03.
 *
 * Task 1 converted the buildInstalledMap todos (LIB-02) — those tests are now green.
 * Task 2 converts the refresh / playtime / fallback todos (LIB-01, LIB-03).
 *
 * Mock strategy:
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in jest.config means all mock implementations must be
 *    re-established in beforeEach or within each test
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import SteamLibraryManager, {
  buildInstalledMap,
  readAcfState,
  startInstallPolling,
  stopInstallPolling,
  pollInstallOnce,
  pollUninstallOnce,
  startUninstallPolling,
  stopUninstallPolling,
  scanDownloadingAppIds
} from '../library'
import * as gfs from 'graceful-fs'
import * as vdf from '@node-steam/vdf'
import { getSteamLibraries } from 'backend/utils'
import { sendFrontendMessage } from '../../../ipc'
import { SteamUser } from '../user'
import {
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore
} from '../electronStores'
import { runOnceWhenOnline } from 'backend/online_monitor'
import { join } from 'path'
import { library } from '../state'

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

// ── backend/utils mock — provides getSteamLibraries() ───────────────────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn()
}))

// ── graceful-fs mock — readdirSync, readFileSync, existsSync ─────────────────
jest.mock('graceful-fs')

// ── @node-steam/vdf mock — parse() ───────────────────────────────────────────
jest.mock('@node-steam/vdf')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── SteamUser mock — controls getClient() / isLoggedIn() return values ───────
jest.mock('../user')

// ── online_monitor mock — prevents electron/net import at module load time ───
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn().mockReturnValue(false)
}))

// ── electronStores mock — steamLibraryStore, steamMetadataStore, etc. ────────
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
    set: jest.fn(),
    entries: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── Shared fixtures ───────────────────────────────────────────────────────────

const makeOwnedApp = (
  appid: number,
  name: string,
  playtime_forever: number,
  rtime_last_played = 0
) => ({
  appid,
  name,
  playtime_forever,
  rtime_last_played,
  img_icon_url: ''
})

const makeFakeClient = (apps: ReturnType<typeof makeOwnedApp>[]) => ({
  steamID: 'STEAMID_TEST',
  getUserOwnedApps: jest.fn().mockResolvedValue({ app_count: apps.length, apps })
})

// ── Describe block ────────────────────────────────────────────────────────────

describe('SteamLibraryManager', () => {
  let manager: SteamLibraryManager

  beforeEach(() => {
    jest.clearAllMocks()
    manager = new SteamLibraryManager()
    // Default: client reconnect succeeds so refresh() proceeds past the guard
    jest.mocked(SteamUser.ensureConnected).mockResolvedValue(true)
    // Default: getSteamLibraries returns empty so buildInstalledMap is fast
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    // Default: metadata store returns undefined (no cached artwork)
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)
    // Defaults so init()/migrateStaleArtUrls have empty caches to scan
    ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([])
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
  })

  // ── LIB-02: install state via ACF StateFlags (Task 1 — green) ─────────────

  it('LIB-02: buildInstalledMap marks is_installed true when StateFlags bit 4 is set (e.g. 4, 6, 516)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_570.acf',
      'appmanifest_440.acf',
      'appmanifest_730.acf'
    ])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: { appid: '570', StateFlags: '4', installdir: 'game1', SizeOnDisk: '100' }
      })
      .mockReturnValueOnce({
        AppState: { appid: '440', StateFlags: '6', installdir: 'game2', SizeOnDisk: '200' }
      })
      .mockReturnValueOnce({
        AppState: { appid: '730', StateFlags: '516', installdir: 'game3', SizeOnDisk: '300' }
      })

    const result = await buildInstalledMap()

    expect(result.has(570)).toBe(true)
    expect(result.has(440)).toBe(true)
    expect(result.has(730)).toBe(true)
    // installPath is join(steamappsDir, 'common', installdir)
    expect(result.get(570)?.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'game1')
    )
  })

  it('LIB-02: buildInstalledMap marks is_installed false when StateFlags bit 4 is clear', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '570', StateFlags: '2', installdir: 'game1', SizeOnDisk: '100' }
    })

    const result = await buildInstalledMap()

    // StateFlags 2 has bit 4 clear → not installed → not in map
    expect(result.size).toBe(0)
  })

  it('LIB-02: a corrupt/unparseable ACF file is skipped without throwing', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_570.acf',
      'appmanifest_440.acf'
    ])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('parse error')
      })
      .mockReturnValueOnce({
        AppState: { appid: '440', StateFlags: '4', installdir: 'game2', SizeOnDisk: '200' }
      })

    // Should not throw
    const result = await buildInstalledMap()

    expect(result.has(440)).toBe(true)
    expect(result.has(570)).toBe(false)
  })

  // ── LIB-01: refresh() and owned app fetch ─────────────────────────────────

  it('LIB-01: refresh() calls getUserOwnedApps and builds a GameInfo per owned app', async () => {
    const apps = [
      makeOwnedApp(570, 'Dota 2', 120),
      makeOwnedApp(440, 'Team Fortress 2', 60)
    ]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    const result = await manager.refresh()

    expect(fakeClient.getUserOwnedApps).toHaveBeenCalledTimes(1)
    expect(fakeClient.getUserOwnedApps).toHaveBeenCalledWith('STEAMID_TEST', {
      includePlayedFreeGames: true
    })
    expect(result).not.toBeNull()
  })

  it('LIB-01: refresh() calls sendFrontendMessage pushGameToLibrary once per game', async () => {
    const apps = [
      makeOwnedApp(570, 'Dota 2', 120),
      makeOwnedApp(440, 'Team Fortress 2', 60)
    ]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await manager.refresh()

    expect(sendFrontendMessage).toHaveBeenCalledTimes(2)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ runner: 'steam', app_name: '570', title: 'Dota 2' })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ runner: 'steam', app_name: '440', title: 'Team Fortress 2' })
    )
    // steamLibraryStore and steamSyncStore are written after the loop
    expect(steamLibraryStore.set).toHaveBeenCalledWith('games', expect.any(Array))
    expect(steamSyncStore.set).toHaveBeenCalledWith('syncedAt', expect.any(Number))
  })

  // ── LIB-03: playtime mapping ───────────────────────────────────────────────

  it('LIB-03: GameInfo.extra.steamPlaytimeMinutes equals app.playtime_forever', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 4200)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.extra?.steamPlaytimeMinutes).toBe(4200)
  })

  it('LIB-03: GameInfo.extra.steamLastPlayed equals app.rtime_last_played', async () => {
    const LAST_PLAYED_TS = 1750000000 // arbitrary Unix-seconds timestamp
    const apps = [makeOwnedApp(570, 'Dota 2', 4200, LAST_PLAYED_TS)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.extra?.steamLastPlayed).toBe(LAST_PLAYED_TS)
  })

  // ── Cache fallback ────────────────────────────────────────────────────────

  it('refresh() serves cached library from steamLibraryStore when getUserOwnedApps throws', async () => {
    const cachedGames = [
      { runner: 'steam', app_name: '570', title: 'Dota 2', is_installed: false } as any
    ]
    const fakeClient = {
      steamID: 'STEAMID_TEST',
      getUserOwnedApps: jest.fn().mockRejectedValue(new Error('CM unreachable'))
    }
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue(cachedGames)

    const result = await manager.refresh()

    // Should NOT throw — returns error result
    expect(result).not.toBeNull()
    expect((result as any).stderr).toContain('CM unreachable')
    // Should push each cached game to the frontend
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      cachedGames[0]
    )
    // Should NOT write a new list to the store on failure
    expect(steamLibraryStore.set).not.toHaveBeenCalled()
  })

  // ── Art URL migration (capsule_616x353 → library_600x900) ──────────────────

  describe('init() migrates stale cover art URLs', () => {
    const OLD = 'https://cdn.cloudflare.steamstatic.com/steam/apps/570/capsule_616x353.jpg'
    const NEW = 'https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_600x900.jpg'

    it('rewrites the landscape capsule URL in the metadata cache', async () => {
      ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([
        ['570', { art_cover: 'x', art_square: OLD, extra: {} }]
      ])

      await manager.init()

      expect(steamMetadataStore.set).toHaveBeenCalledWith(
        '570',
        expect.objectContaining({ art_square: NEW })
      )
    })

    it('rewrites the landscape capsule URL in the persisted library list', async () => {
      jest.mocked(steamLibraryStore.get).mockReturnValue([
        { runner: 'steam', app_name: '570', title: 'Dota 2', art_square: OLD } as any,
        { runner: 'steam', app_name: '440', title: 'TF2', art_square: '' } as any
      ])

      await manager.init()

      const setCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      expect(setCall).toBeDefined()
      const savedGames = setCall![1] as Array<{ app_name: string; art_square: string }>
      expect(savedGames.find((g) => g.app_name === '570')?.art_square).toBe(NEW)
    })

    it('does not rewrite the library list when no stale URLs are present', async () => {
      jest.mocked(steamLibraryStore.get).mockReturnValue([
        { runner: 'steam', app_name: '570', title: 'Dota 2', art_square: NEW } as any
      ])

      await manager.init()

      const setGames = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.filter(([key]) => key === 'games')
      expect(setGames).toHaveLength(0)
    })
  })

  // ── refreshInstallState() — D-01/D-02 focus-driven ACF re-read ───────────────

  describe('SteamLibraryManager.refreshInstallState()', () => {
    beforeEach(() => {
      library.clear()
      // Default: getSteamLibraries returns empty → buildInstalledMap returns empty Map
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    it('refreshInstallState() calls buildInstalledMap and pushes update when is_installed changes false→true', async () => {
      // Seed library with a game that is NOT installed
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      // buildInstalledMap will now report it as installed
      jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
      ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
      ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: { appid: '570', StateFlags: '4', installdir: 'dota2', SizeOnDisk: '50000' }
      })

      await manager.refreshInstallState()

      // Should have pushed updated GameInfo with is_installed: true
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: true })
      )
    })

    it('refreshInstallState() sets install_path and install_size when game becomes installed', async () => {
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
      ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
      ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: { appid: '570', StateFlags: '4', installdir: 'dota2', SizeOnDisk: '50000' }
      })

      await manager.refreshInstallState()

      const updatedGame = library.get('570')!
      expect(updatedGame.is_installed).toBe(true)
      expect(updatedGame.install).toEqual(
        expect.objectContaining({
          install_path: join('/steam', 'steamapps', 'common', 'dota2'),
          install_size: '50000',
          platform: 'Windows'
        })
      )
    })

    it('refreshInstallState() pushes update when is_installed changes true→false', async () => {
      // Seed library with a game that IS installed
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: true,
        install: { install_path: '/steam/steamapps/common/dota2', install_size: '50000', platform: 'Windows' },
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      // buildInstalledMap returns empty — game is no longer installed
      jest.mocked(getSteamLibraries).mockResolvedValue([])

      await manager.refreshInstallState()

      // Should push with is_installed: false and empty install object
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: false })
      )
      const updatedGame = library.get('570')!
      expect(updatedGame.install).toEqual({})
    })

    it('refreshInstallState() does NOT call sendFrontendMessage when install state did not change', async () => {
      // Game is NOT installed and buildInstalledMap returns empty — no change
      library.set('570', {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      // buildInstalledMap returns empty — still not installed
      jest.mocked(getSteamLibraries).mockResolvedValue([])

      await manager.refreshInstallState()

      // No change → no push to avoid flooding frontend
      expect(sendFrontendMessage).not.toHaveBeenCalled()
    })

    it('installState() is a no-op (install state is ACF-derived, not boolean-driven)', () => {
      // installState must exist and not throw; it should do nothing
      expect(() => manager.installState('570', true)).not.toThrow()
      // No side effects
      expect(sendFrontendMessage).not.toHaveBeenCalled()
    })
  })

  // ── D-07: startup resume via scanDownloadingAppIds ────────────────────────

  it('init() resumes polling for in-progress downloads detected on startup', async () => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    // Set up ACF mocks so scanDownloadingAppIds finds '730' downloading
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    const setIntervalSpy = jest.spyOn(global, 'setInterval')

    await manager.init()

    // If init() called startInstallPolling for '730', setInterval should have been invoked
    expect(setIntervalSpy).toHaveBeenCalled()

    setIntervalSpy.mockRestore()
    stopInstallPolling('730')
    jest.useRealTimers()
  })
})

// ── D-07: readAcfState() ─────────────────────────────────────────────────────

describe('readAcfState()', () => {
  beforeEach(() => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(false)
  })

  it('returns state:"installed" with installPath/sizeOnDisk when StateFlags bit 4 is set', async () => {
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '4', installdir: 'csgo', SizeOnDisk: '9000' }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(join('/steam', 'steamapps', 'common', 'csgo'))
    expect(result.sizeOnDisk).toBe('9000')
  })

  it('returns state:"downloading" when manifest exists but StateFlags bit 4 is unset', async () => {
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '2', installdir: 'csgo', SizeOnDisk: '0' }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('downloading')
    expect(result.installPath).toBeUndefined()
  })

  it('returns state:"absent" when no manifest file is found for the appId', async () => {
    ;(gfs.existsSync as jest.Mock).mockReturnValue(false)
    const result = await readAcfState('730')
    expect(result.state).toBe('absent')
  })

  it('skips a corrupt ACF and returns state:"absent" (T-2-01)', async () => {
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('absent')
  })
})

// ── D-07: pollInstallOnce() ──────────────────────────────────────────────────

describe('pollInstallOnce()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
  })

  afterEach(() => {
    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('sends gameStatusUpdate { status:"installing" } when state is "downloading"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '2', installdir: 'csgo', SizeOnDisk: '0' }
    })
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ appName: '730', runner: 'steam', status: 'installing' })
    )
  })

  it('sends pushGameToLibrary + gameStatusUpdate { status:"done" } when state is "installed"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '4', installdir: 'csgo', SizeOnDisk: '50000' }
    })
    startInstallPolling('730', 60000) // register entry so stopInstallPolling has something to clear
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '730', is_installed: true })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ appName: '730', runner: 'steam', status: 'done' })
    )
  })
})

// ── D-07: startInstallPolling / stopInstallPolling ────────────────────────────

describe('startInstallPolling() idempotency and stopInstallPolling()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  afterEach(() => {
    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('calling startInstallPolling twice for the same appId creates only one setInterval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startInstallPolling('730', 3000)
    startInstallPolling('730', 3000) // idempotent — second call is a no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    setIntervalSpy.mockRestore()
  })

  it('stopInstallPolling clears the entry so startInstallPolling can register a new interval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startInstallPolling('730', 3000)
    stopInstallPolling('730')
    startInstallPolling('730', 3000) // new registration — entry was cleared by stop
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    setIntervalSpy.mockRestore()
  })
})

// ── D-07: pollUninstallOnce() ────────────────────────────────────────────────

describe('pollUninstallOnce()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    library.clear()
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: { install_path: '/steam/steamapps/common/csgo', platform: 'Windows' },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
  })

  afterEach(() => {
    stopUninstallPolling('730')
    jest.useRealTimers()
  })

  it('flips the badge to not-installed + sends done when the manifest is absent (uninstall complete)', async () => {
    ;(gfs.existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    startUninstallPolling('730', 60000) // register entry so stop has something to clear
    await pollUninstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '730', is_installed: false })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ appName: '730', runner: 'steam', status: 'done' })
    )
  })

  it('sends gameStatusUpdate { status:"uninstalling" } while StateFlags bit 0x800 is set', async () => {
    // 4 (installed) | 2048 (uninstalling) = 2052
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '2052', installdir: 'csgo', SizeOnDisk: '50000' }
    })
    startUninstallPolling('730', 60000)
    await pollUninstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ appName: '730', runner: 'steam', status: 'uninstalling' })
    )
  })

  it('does NOT flip the badge while the game is still fully installed (no uninstalling bit)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '4', installdir: 'csgo', SizeOnDisk: '50000' }
    })
    startUninstallPolling('730', 60000)
    await pollUninstallOnce('730')
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })
})

// ── D-07: startUninstallPolling / stopUninstallPolling ────────────────────────

describe('startUninstallPolling() idempotency and stopUninstallPolling()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    library.clear()
    jest.mocked(getSteamLibraries).mockResolvedValue([])
  })

  afterEach(() => {
    stopUninstallPolling('730')
    jest.useRealTimers()
  })

  it('calling startUninstallPolling twice for the same appId creates only one setInterval', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startUninstallPolling('730', 3000)
    startUninstallPolling('730', 3000) // idempotent — second call is a no-op
    expect(setIntervalSpy).toHaveBeenCalledTimes(1)
    setIntervalSpy.mockRestore()
  })

  it('stopUninstallPolling clears the entry so a new interval can register', () => {
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startUninstallPolling('730', 3000)
    stopUninstallPolling('730')
    startUninstallPolling('730', 3000) // new registration — entry was cleared by stop
    expect(setIntervalSpy).toHaveBeenCalledTimes(2)
    setIntervalSpy.mockRestore()
  })
})

// ── D-07: scanDownloadingAppIds() ────────────────────────────────────────────

describe('scanDownloadingAppIds()', () => {
  beforeEach(() => {
    library.clear()
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(gfs.existsSync as jest.Mock).mockReturnValue(true)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue([])
  })

  it('returns appIds whose manifest has bit 4 unset AND the appId is in the library', async () => {
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: false,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '2', installdir: 'csgo', SizeOnDisk: '0' }
    })
    const result = await scanDownloadingAppIds()
    expect(result).toContain('730')
  })

  it('does NOT return appIds whose manifest has bit 4 set (fully installed)', async () => {
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: {},
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '4', installdir: 'csgo', SizeOnDisk: '50000' }
    })
    const result = await scanDownloadingAppIds()
    expect(result).not.toContain('730')
  })

  it('does NOT return appIds not present in the in-memory library Map', async () => {
    // library is empty — no '730' entry
    ;(gfs.readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(gfs.readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '730', StateFlags: '2', installdir: 'csgo', SizeOnDisk: '0' }
    })
    const result = await scanDownloadingAppIds()
    expect(result).not.toContain('730')
  })
})
