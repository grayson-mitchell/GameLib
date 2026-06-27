/**
 * Unit test scaffold for SteamLibraryManager — LIB-01, LIB-02, LIB-03.
 *
 * Task 1 converts the buildInstalledMap todos (LIB-02) to real tests.
 * Task 2 converts the refresh / playtime / fallback todos (LIB-01, LIB-03) to real tests.
 *
 * Mock strategy:
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
 *  - resetMocks: true in jest.config means all mock implementations must be
 *    re-established in beforeEach or within each test
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { buildInstalledMap } from '../library'
import * as gfs from 'graceful-fs'
import * as vdf from '@node-steam/vdf'
import { getSteamLibraries } from 'backend/utils'
import { join } from 'path'

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
    set: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── Describe block ────────────────────────────────────────────────────────────

describe('SteamLibraryManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── LIB-01: refresh() and owned app fetch ─────────────────────────────────

  it.todo('LIB-01: refresh() calls getUserOwnedApps and builds a GameInfo per owned app')

  it.todo('LIB-01: refresh() calls sendFrontendMessage pushGameToLibrary once per game')

  // ── LIB-02: install state via ACF StateFlags ──────────────────────────────

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

  // ── LIB-03: playtime mapping ───────────────────────────────────────────────

  it.todo('LIB-03: GameInfo.extra.steamPlaytimeMinutes equals app.playtime_forever')

  // ── Cache fallback ────────────────────────────────────────────────────────

  it.todo('refresh() serves cached library from steamLibraryStore when getUserOwnedApps throws')
})
