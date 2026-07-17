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
  buildBottleInstalledMap,
  readAcfState,
  startInstallPolling,
  stopInstallPolling,
  pollInstallOnce,
  pollUninstallOnce,
  startUninstallPolling,
  stopUninstallPolling,
  scanDownloadingAppIds,
  readRunningAppId,
  pollRunningOnce,
  startRunningPoll,
  stopRunningPoll,
  machOArchsOf,
  verdictFromArchs,
  locateMachOBinary,
  verifyMacArchGroundTruth
} from '../library'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  mkdirSync as realMkdirSync,
  mkdtempSync,
  readFileSync as realReadFileSync,
  rmSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import * as vdf from '@node-steam/vdf'
import { spawnSync, execFileSync } from 'child_process'
import { dialog, shell } from 'electron'
import { getSteamLibraries, getFileSize } from 'backend/utils'
import { sendFrontendMessage } from '../../../ipc'
import { notify } from '../../../dialog/dialog'
import { SteamUser } from '../user'
import {
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore
} from '../electronStores'
import {
  getBottleSteamappsDir,
  getSteamBottleSettings,
  isBottleProvisioned,
  tellBottledSteamToInstall
} from '../bottle'
import {
  finalizeToSteam,
  downloadSteamDepots,
  buildDepotPlan,
  healReconciledFileModes
} from '../depot'
import { reconcilePartialState } from '../depot/reconcile'
import { runWineCommand } from 'backend/launcher'
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

// ── backend/utils mock — provides getSteamLibraries() and getFileSize() ─────
// Note: resetMocks:true wipes any factory-provided implementation before each
// test, so getFileSize's return value must be re-established per-describe
// (see beforeEach blocks below) — same pattern as games.test.ts.
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn(),
  getFileSize: jest.fn()
}))

// ── graceful-fs mock — readdirSync, readFileSync, existsSync ─────────────────
jest.mock('graceful-fs')

// ── @node-steam/vdf mock — parse() ───────────────────────────────────────────
jest.mock('@node-steam/vdf')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── dialog/dialog mock — notify (GAME-02/03: poller fires confirmed toast) ───
jest.mock('../../../dialog/dialog', () => ({
  notify: jest.fn()
}))

// ── i18next mock — returns the fallback string for body assertions ────────────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    t: (_key: string, fallback = '') => fallback
  }
}))

// ── SteamUser mock — controls getClient() / isLoggedIn() return values ───────
jest.mock('../user')

// ── online_monitor mock — prevents electron/net import at module load time ───
jest.mock('backend/online_monitor', () => ({
  runOnceWhenOnline: jest.fn(),
  isOnline: jest.fn().mockReturnValue(false)
}))

// ── child_process mock — spawnSync (Windows reg.exe) + execFileSync (Linux ps,
// MAC32-03 lipo/file) ─────────────────────────────────────────────────────────
jest.mock('child_process', () => ({
  spawnSync: jest.fn(),
  execFileSync: jest.fn()
}))

// ── electron mock — dialog.showMessageBox (MAC32-03 i386 recovery confirm) +
// app.getPath (backend/constants/paths reads this at module load time) ───────
// library.ts's only electron usage is `dialog`; games.ts's `shell` import
// (pulled in transitively via `import SteamGame from './games'`) resolves to
// undefined here, which is fine — SteamGame.install()/forceUninstall() are
// only reached via a CONFIRMED promptI386Recovery, and this file's tests
// keep the dialog mocked to a cancel response unless a test explicitly opts
// into the confirm path.
jest.mock('electron', () => ({
  dialog: { showMessageBox: jest.fn() },
  app: { getPath: jest.fn().mockReturnValue('/tmp/mock-path') },
  shell: { openExternal: jest.fn() }
}))

// ── backend/constants/environment mock — platform-switching for reader tests ──
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true
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

// ── bottle mock — getBottleSteamappsDir/getSteamBottleSettings/isBottleProvisioned ─
// tellBottledSteamToInstall included so the D-05 no-auto-drive regression test
// (folded-todo guard) can assert init() never dispatches to the bottled client.
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  isBottleProvisioned: jest.fn(),
  tellBottledSteamToInstall: jest.fn()
}))

// ── depot mock — finalizeToSteam (D-05 startup finalize) / downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download) /
// buildDepotPlan (Phase 23, 23-03, D-04 — startup resume rebuilds a real plan) ─
// healReconciledFileModes included so buildResumeFinalizeOpts (CR-01 gap
// closure, 23-code-review) can be exercised — defaulted to a successful heal
// in the shared beforeEach below so pre-existing resume tests that don't care
// about mode-healing still earn StateFlags=4 as before.
jest.mock('../depot', () => ({
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  downloadSteamDepots: jest.fn(),
  buildDepotPlan: jest.fn(),
  healReconciledFileModes: jest.fn()
}))

// ── depot/reconcile mock — reconcilePartialState (Phase 23, 23-03, D-04) ────
jest.mock('../depot/reconcile', () => ({
  reconcilePartialState: jest.fn()
}))

// ── backend/launcher mock — runWineCommand (D-05 no-auto-drive regression) ────
jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

/** Bottle steamapps root used consistently across the bottle-path tests below. */
const BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteam',
  'drive_c/Program Files (x86)/Steam/steamapps'
)

/**
 * GAP-17-PFX86-PATH regression fixture: the same bottle steamapps root but
 * under a win32-prefix layout (no "(x86)" segment — 32-bit Steam installs
 * directly under `Program Files`). getBottleSteamappsDir is mocked in this
 * file, so this fixture proves the bottle-source ACF scan resolves manifests
 * identically regardless of which root the (real, unmocked) resolver in
 * bottle.ts returns.
 */
const WIN32_BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteam',
  'drive_c/Program Files/Steam/steamapps'
)

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
  getUserOwnedApps: jest
    .fn()
    .mockResolvedValue({ app_count: apps.length, apps })
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
    // Default: mode-healing succeeds (CR-01) — resume tests that don't
    // specifically exercise the healing-failure path still earn StateFlags=4.
    jest
      .mocked(healReconciledFileModes)
      .mockResolvedValue({ allModesHealed: true, failures: [] } as never)
  })

  // ── LIB-02: install state via ACF StateFlags (Task 1 — green) ─────────────

  it('LIB-02: buildInstalledMap marks is_installed true when StateFlags bit 4 is set (e.g. 4, 6, 516)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_570.acf',
      'appmanifest_440.acf',
      'appmanifest_730.acf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'game1',
          SizeOnDisk: '100'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '440',
          StateFlags: '6',
          installdir: 'game2',
          SizeOnDisk: '200'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '516',
          installdir: 'game3',
          SizeOnDisk: '300'
        }
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '570',
        StateFlags: '2',
        installdir: 'game1',
        SizeOnDisk: '100'
      }
    })

    const result = await buildInstalledMap()

    // StateFlags 2 has bit 4 clear → not installed → not in map
    expect(result.size).toBe(0)
  })

  it('LIB-02: a corrupt/unparseable ACF file is skipped without throwing', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_570.acf',
      'appmanifest_440.acf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('parse error')
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '440',
          StateFlags: '4',
          installdir: 'game2',
          SizeOnDisk: '200'
        }
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
      expect.objectContaining({
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2'
      })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        runner: 'steam',
        app_name: '440',
        title: 'Team Fortress 2'
      })
    )
    // steamLibraryStore and steamSyncStore are written after the loop
    expect(steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.any(Array)
    )
    expect(steamSyncStore.set).toHaveBeenCalledWith(
      'syncedAt',
      expect.any(Number)
    )
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

  // ── Phase 17 D-08 reconciliation (Plan 09): steamPlatformsCaptured ─────────

  it('D-08 reconciliation: synced GameInfo carries steamPlatformsCaptured:true when cachedMeta.platformsCaptured is true', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.steamPlatformsCaptured).toBe(true)
  })

  it('D-08 reconciliation: synced GameInfo carries steamPlatformsCaptured:false when cachedMeta is absent (never synced)', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.steamPlatformsCaptured).toBe(false)
  })

  // ── CR-01 gap closure (18-05): mac_arch survives refresh() resync ─────────

  it('CR-01: refresh() seeds mac_arch:\'32\' from cachedMeta so a cached Mach-O verdict survives resync', async () => {
    const apps = [
      makeOwnedApp(570, 'Old 32-bit Game', 120),
      makeOwnedApp(440, 'Never Checked Game', 60)
    ]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockImplementation(
      (appId: string) => {
        if (appId === '570') {
          return { mac_arch: '32', mac_arch_source: 'macho' }
        }
        return undefined
      }
    )

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed570 = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any
    const pushed440 = calls.find(
      ([_msg, info]) => (info as any).app_name === '440'
    )?.[1] as any

    expect(pushed570?.mac_arch).toBe('32')
    // Negative control: no cached mac_arch → 'unknown', never '32' by default
    // (T-18-05-02 false-flag-safe invariant)
    expect(pushed440?.mac_arch).toBe('unknown')
  })

  // ── Cache fallback ────────────────────────────────────────────────────────

  it('refresh() serves cached library from steamLibraryStore when getUserOwnedApps throws', async () => {
    const cachedGames = [
      {
        runner: 'steam',
        app_name: '570',
        title: 'Dota 2',
        is_installed: false
      } as any
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

  // ── GAP-17-BOTTLE-PLAY-REVERT: refresh() must be bottle-aware ──────────────
  // Regression coverage for the follow-on to bottle-install-not-recognized:
  // refresh() previously derived is_installed ONLY from buildInstalledMap()
  // (native ACF scan), so a bottle-only-installed game was always reported
  // not-installed by a full refresh() — which is reachable mid-session via the
  // launch-completion 'done' status (see .planning/debug/bottle-install-not-recognized.md).

  describe('SteamLibraryManager.refresh() bottle reconciliation', () => {
    const envMock = jest.requireMock('backend/constants/environment')

    beforeEach(() => {
      envMock.isMac = true
      envMock.isLinux = false
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${bytes} B`)
      // Native scan finds nothing by default in this block — only the bottle
      // root (mocked separately below) has manifests.
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('reports is_installed:true (platform Windows) for a game installed ONLY under the bottle root when isBottleProvisioned() is true', async () => {
      jest.mocked(isBottleProvisioned).mockReturnValue(true)
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206020.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '206020',
          StateFlags: '4',
          installdir: 'Avernum 4',
          SizeOnDisk: '123456'
        }
      })

      const apps = [makeOwnedApp(206020, 'Avernum 4', 30)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206020'
      )?.[1] as any

      // RED before the fix: pushed.is_installed was false (native-only scan
      // found nothing). GREEN after the fix: bottle fallback is consulted.
      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install).toEqual(
        expect.objectContaining({
          install_path: join(BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 4'),
          install_size: '123456 B',
          // Pitfall 3: bottle installs must always report 'Windows', regardless
          // of host OS (isMac is mocked true in this block).
          platform: 'Windows'
        })
      )
    })

    it('does NOT persist is_installed:false to steamLibraryStore for a bottle-only-installed game when refresh() runs mid-session', async () => {
      jest.mocked(isBottleProvisioned).mockReturnValue(true)
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206060.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '206060',
          StateFlags: '4',
          installdir: 'Avernum 6',
          SizeOnDisk: '654321'
        }
      })

      const apps = [makeOwnedApp(206060, 'Avernum 6', 10)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const persistedCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      const persistedGames = persistedCall?.[1] as any[]
      const persisted = persistedGames?.find((g) => g.app_name === '206060')

      expect(persisted?.is_installed).toBe(true)
    })

    it('falls back to native install data when BOTH native and bottle report the same appId (native wins)', async () => {
      jest.mocked(isBottleProvisioned).mockReturnValue(true)
      const NATIVE_ROOT = join('/native/steam', 'steamapps')
      jest.mocked(getSteamLibraries).mockResolvedValue(['/native/steam'])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
        if (dir === NATIVE_ROOT) return ['appmanifest_570.acf']
        if (dir === BOTTLE_STEAMAPPS_ROOT) return ['appmanifest_570.acf']
        return []
      })
      ;(readFileSync as jest.Mock).mockImplementation((file: string) => {
        if (file.includes(NATIVE_ROOT)) return 'native-content'
        return 'bottle-content'
      })
      ;(vdf.parse as jest.Mock).mockImplementation((content: string) =>
        content === 'native-content'
          ? {
              AppState: {
                appid: '570',
                StateFlags: '4',
                installdir: 'dota2-native',
                SizeOnDisk: '111'
              }
            }
          : {
              AppState: {
                appid: '570',
                StateFlags: '4',
                installdir: 'dota2-bottle',
                SizeOnDisk: '222'
              }
            }
      )

      const apps = [makeOwnedApp(570, 'Dota 2', 5)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '570'
      )?.[1] as any

      // Native must win — never double-count/conflate the two roots.
      expect(pushed?.install?.install_path).toBe(
        join(NATIVE_ROOT, 'common', 'dota2-native')
      )
    })

    it('performs NO bottle reconciliation when isBottleProvisioned() returns false (byte-for-byte native-only behavior preserved)', async () => {
      jest.mocked(isBottleProvisioned).mockReturnValue(false)
      // If the bottle path were consulted, readdirSync would be called on the
      // bottle root too — assert it's never scanned (native-only).
      ;(existsSync as jest.Mock).mockReturnValue(false)
      ;(readdirSync as jest.Mock).mockReturnValue([])

      const apps = [makeOwnedApp(206020, 'Avernum 4', 30)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206020'
      )?.[1] as any

      expect(pushed?.is_installed).toBe(false)
      expect(readdirSync).not.toHaveBeenCalledWith(BOTTLE_STEAMAPPS_ROOT)
    })
  })

  // ── Art URL migration (capsule_616x353 → library_600x900) ──────────────────

  describe('init() migrates stale cover art URLs', () => {
    const OLD =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/570/capsule_616x353.jpg'
    const NEW =
      'https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_600x900.jpg'

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
        {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          art_square: OLD
        } as any,
        {
          runner: 'steam',
          app_name: '440',
          title: 'TF2',
          art_square: ''
        } as any
      ])

      await manager.init()

      const setCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      expect(setCall).toBeDefined()
      const savedGames = setCall![1] as Array<{
        app_name: string
        art_square: string
      }>
      expect(savedGames.find((g) => g.app_name === '570')?.art_square).toBe(NEW)
    })

    it('does not rewrite the library list when no stale URLs are present', async () => {
      jest.mocked(steamLibraryStore.get).mockReturnValue([
        {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          art_square: NEW
        } as any
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
      // install_size is persisted via getFileSize(Number(sizeOnDisk)) — mock a
      // stable, distinguishable formatted string per byte count.
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${bytes} B`)
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
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'dota2',
          SizeOnDisk: '50000'
        }
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
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '570',
          StateFlags: '4',
          installdir: 'dota2',
          SizeOnDisk: '50000'
        }
      })

      await manager.refreshInstallState()

      const updatedGame = library.get('570')!
      expect(updatedGame.is_installed).toBe(true)
      expect(updatedGame.install).toEqual(
        expect.objectContaining({
          install_path: join('/steam', 'steamapps', 'common', 'dota2'),
          // install_size is persisted as a getFileSize-formatted string
          // (mocked here as `${bytes} B`) — matches legendary/gog/nile contract.
          install_size: '50000 B'
          // platform is host-derived (GAP 2 fix — no longer hardcoded 'Windows');
          // not asserted here since this test covers install_path/size detection.
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
        install: {
          install_path: '/steam/steamapps/common/dota2',
          install_size: '50000',
          platform: 'Windows'
        },
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

    // ── 17-03: bottle-aware reconciliation (MACSTEAM-05, T-17-03 gate) ───────

    describe('bottle reconciliation', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        envMock.isMac = true
        envMock.isLinux = false
        jest
          .mocked(getSteamBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
        jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('flips a bottle-installed game to installed (platform Windows) via pushGameToLibrary when isBottleProvisioned() is true', async () => {
        jest.mocked(isBottleProvisioned).mockReturnValue(true)
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

        // Native scan finds nothing; bottle scan finds the manifest.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        ;(vdf.parse as jest.Mock).mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '570',
            is_installed: true,
            install: expect.objectContaining({ platform: 'Windows' })
          })
        )
      })

      it('performs NO bottle reconciliation when isBottleProvisioned() returns false', async () => {
        jest.mocked(isBottleProvisioned).mockReturnValue(false)
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

        // Even though the bottle path mocks WOULD report installed, the gate
        // must prevent buildBottleInstalledMap() (and readdirSync) from ever
        // being consulted.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        ;(vdf.parse as jest.Mock).mockReturnValue({
          AppState: {
            appid: '570',
            StateFlags: '4',
            installdir: 'dota2',
            SizeOnDisk: '50000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('570')!.is_installed).toBe(false)
      })
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
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

  // ── D-05: startup resume finalizes to 1026 THEN watches (folded todo) ─────

  it('D-05: init() finalizes an interrupted GameLib depot download to a 1026 manifest and never re-invokes the depot orchestrator on startup', async () => {
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    await manager.init()

    expect(finalizeToSteam).toHaveBeenCalledWith(
      '730',
      expect.objectContaining({
        targetSteamappsDir: join('/steam', 'steamapps'),
        installdir: 'csgo',
        depots: []
      })
    )
    // Pitfall 4 / D-05: startup resume must NEVER re-drive a download.
    expect(downloadSteamDepots).not.toHaveBeenCalled()

    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('D-05: init() finalizes BEFORE it starts watching (finalize-then-startInstallPolling ordering)', async () => {
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    const order: string[] = []
    jest.mocked(finalizeToSteam).mockImplementation(async () => {
      order.push('finalize')
    })
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockImplementation((() => {
        order.push('watch')
        return { unref: () => undefined } as unknown as NodeJS.Timeout
      }) as unknown as typeof setInterval)

    await manager.init()

    expect(order).toEqual(['finalize', 'watch'])

    setIntervalSpy.mockRestore()
    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('D-05: init() never dispatches to Steam/CrossOver on startup resume (tellBottledSteamToInstall / shell.openExternal / runWineCommand — folded-todo regression guard)', async () => {
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    await manager.init()

    expect(tellBottledSteamToInstall).not.toHaveBeenCalled()
    expect(shell.openExternal).not.toHaveBeenCalled()
    expect(runWineCommand).not.toHaveBeenCalled()
    // Phase 23 (23-03, D-04) regression: rebuilding a real DepotPlan for
    // reconciliation must NEVER scan the bottle steamapps root — the resume
    // path stays native-only end to end.
    expect(getBottleSteamappsDir).not.toHaveBeenCalled()

    stopInstallPolling('730')
    jest.useRealTimers()
  })

  // ── Phase 23 (23-03, D-04): startup resume rebuilds a real plan + reconciles ─
  describe('startup resume reconciliation (D-04)', () => {
    let tmp: string

    beforeEach(() => {
      tmp = mkdtempSync(join(tmpdir(), 'gamelib-library-resume-test-'))
    })

    afterEach(() => {
      rmSync(tmp, { recursive: true, force: true })
    })

    function setupDownloadingFixture(appId: string, installdir: string) {
      // writeAppManifest opens appmanifest_{appId}.acf.tmp directly (no
      // mkdir) — the target steamapps dir must already exist.
      realMkdirSync(join(tmp, 'steamapps'), { recursive: true })

      library.set(appId, {
        runner: 'steam',
        app_name: appId,
        title: installdir,
        is_installed: false,
        install: {},
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      jest.mocked(getSteamLibraries).mockResolvedValue([tmp])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readdirSync as jest.Mock).mockReturnValue([`appmanifest_${appId}.acf`])
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: { appid: appId, StateFlags: '2', installdir, SizeOnDisk: '0' }
      })
    }

    it('a fully-reconciled-verified resume threads real depots/buildid/gate-inputs into finalizeToSteam and earns StateFlags=4', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')

      const file = { filename: 'game.bin', size: 10, sha_content: 'x', chunks: [] }
      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [
          { depotId: '111', gid: '9007199254740993', key: Buffer.from('key'), files: [file] }
        ],
        totalBytes: 10
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      jest
        .mocked(reconcilePartialState)
        .mockResolvedValue({ jobs: [], allFilesVerified: true } as never)

      const realFinalizeToSteam = jest.requireActual<typeof import('../depot')>(
        '../depot'
      ).finalizeToSteam
      jest.mocked(finalizeToSteam).mockImplementation(realFinalizeToSteam)

      await manager.init()

      const acfPath = join(tmp, 'steamapps', 'appmanifest_730.acf')
      const text = realReadFileSync(acfPath, 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"4"/)
      expect(text).toMatch(/"buildid"\s+"9044149"/)

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('CR-01: resume re-applies file modes via healReconciledFileModes (never inferred from content-only sha1 verification) before earning StateFlags=4', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')

      const file = {
        filename: 'game.bin',
        size: 10,
        sha_content: 'x',
        chunks: [],
        flags: 32
      }
      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [
          { depotId: '111', gid: '9007199254740993', key: Buffer.from('key'), files: [file] }
        ],
        totalBytes: 10
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      jest
        .mocked(reconcilePartialState)
        .mockResolvedValue({ jobs: [], allFilesVerified: true } as never)
      jest
        .mocked(healReconciledFileModes)
        .mockResolvedValue({ allModesHealed: true, failures: [] } as never)

      const realFinalizeToSteam = jest.requireActual<typeof import('../depot')>(
        '../depot'
      ).finalizeToSteam
      jest.mocked(finalizeToSteam).mockImplementation(realFinalizeToSteam)

      await manager.init()

      // CR-01: modes must be actually re-applied/healed THIS run — the
      // resume path must never earn StateFlags=4 by inferring "modes
      // applied" from allFilesVerified's content-only sha1 verdict alone.
      expect(healReconciledFileModes).toHaveBeenCalledWith(
        plan,
        expect.any(String),
        expect.any(Set)
      )

      const acfPath = join(tmp, 'steamapps', 'appmanifest_730.acf')
      const text = realReadFileSync(acfPath, 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"4"/)

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('CR-01: a mode-healing failure forces the resume to the safe StateFlags=1026 fallback — never 4, even when content sha1-verified 100% (the exact crash-window this gap closure targets)', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')

      const file = {
        filename: 'game.bin',
        size: 10,
        sha_content: 'x',
        chunks: [],
        flags: 32
      }
      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [
          { depotId: '111', gid: '9007199254740993', key: Buffer.from('key'), files: [file] }
        ],
        totalBytes: 10
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      // Content is fully sha1-verified (byte-perfect) — but the mode-heal
      // step fails, simulating a crash between an earlier session's
      // whole-file sha1 check succeeding and its own chmod call.
      jest
        .mocked(reconcilePartialState)
        .mockResolvedValue({ jobs: [], allFilesVerified: true } as never)
      jest.mocked(healReconciledFileModes).mockResolvedValue({
        allModesHealed: false,
        failures: [{ file: 'game.bin', error: 'chmod EACCES' }]
      } as never)

      const realFinalizeToSteam = jest.requireActual<typeof import('../depot')>(
        '../depot'
      ).finalizeToSteam
      jest.mocked(finalizeToSteam).mockImplementation(realFinalizeToSteam)

      await expect(manager.init()).resolves.toBeUndefined()

      const acfPath = join(tmp, 'steamapps', 'appmanifest_730.acf')
      const text = realReadFileSync(acfPath, 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
      expect(text).not.toMatch(/"StateFlags"\s+"4"/)

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('a resume where reconciliation finds genuinely missing/mismatched files fails CLOSED to StateFlags=1026 — never 4, never crashes init() (T-23-09)', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')

      const file = { filename: 'missing.bin', size: 10, sha_content: 'x', chunks: [] }
      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [
          { depotId: '111', gid: '9007199254740993', key: Buffer.from('key'), files: [file] }
        ],
        totalBytes: 10
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      jest.mocked(reconcilePartialState).mockResolvedValue({
        jobs: [{ depotId: '111', key: Buffer.from('key'), file, fileSeed: 0 }],
        allFilesVerified: false
      } as never)

      const realFinalizeToSteam = jest.requireActual<typeof import('../depot')>(
        '../depot'
      ).finalizeToSteam
      jest.mocked(finalizeToSteam).mockImplementation(realFinalizeToSteam)

      await expect(manager.init()).resolves.toBeUndefined()

      const acfPath = join(tmp, 'steamapps', 'appmanifest_730.acf')
      const text = realReadFileSync(acfPath, 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
      expect(text).not.toMatch(/"StateFlags"\s+"4"/)

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('a startup buildDepotPlan failure (offline/no CM connection) does not throw out of init() — degrades to the passive honest-empty 1026 fallback', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')

      jest
        .mocked(buildDepotPlan)
        .mockRejectedValue(new Error('no authenticated Steam CM connection'))

      await expect(manager.init()).resolves.toBeUndefined()

      expect(finalizeToSteam).toHaveBeenCalledWith(
        '730',
        expect.objectContaining({
          targetSteamappsDir: join(tmp, 'steamapps'),
          installdir: 'csgo',
          depots: []
        })
      )

      stopInstallPolling('730')
      jest.useRealTimers()
    })
  })
})

// ── D-07: readAcfState() ─────────────────────────────────────────────────────

describe('readAcfState()', () => {
  beforeEach(() => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(false)
  })

  it('returns state:"installed" with installPath/sizeOnDisk when StateFlags bit 4 is set', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'csgo')
    )
    expect(result.sizeOnDisk).toBe('9000')
  })

  it('returns state:"downloading" when manifest exists but StateFlags bit 4 is unset', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('downloading')
    expect(result.installPath).toBeUndefined()
  })

  // ── GAP-17-BOTTLE-PROGRESS: readAcfState surfaces ACF byte counts ─────────
  it('a downloading ACF with BytesDownloaded/BytesToDownload returns those numbers on the result', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5',
        BytesToDownload: '10',
        BytesStaged: '3',
        BytesToStage: '6'
      }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('downloading')
    expect(result.bytesDownloaded).toBe(5)
    expect(result.bytesToDownload).toBe(10)
    expect(result.bytesStaged).toBe(3)
    expect(result.bytesToStage).toBe(6)
  })

  it('defaults missing/non-numeric ACF byte fields to 0', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    const result = await readAcfState('730')
    expect(result.bytesDownloaded).toBe(0)
    expect(result.bytesToDownload).toBe(0)
    expect(result.bytesStaged).toBe(0)
    expect(result.bytesToStage).toBe(0)
  })

  it('returns state:"absent" when no manifest file is found for the appId', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)
    const result = await readAcfState('730')
    expect(result.state).toBe('absent')
  })

  it('skips a corrupt ACF and returns state:"absent" (T-2-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('absent')
  })
})

// ── D-05/D-15: regression-guard the "poller unchanged" claim ──────────────────
// Locks in RESEARCH Pattern 4/Pitfall 4's "already works unmodified" finding —
// readAcfState/pollInstallOnce/startInstallPolling are NEVER touched by this
// plan; these tests feed a GameLib-shaped manifest (exactly writeAppManifest's
// field set — depot/manifest.ts) through the UNCHANGED read side and lock the
// round-trip so a future change can't silently break D-05/D-15 reuse.

describe('readAcfState() — D-05/D-15 regression: GameLib-written manifest round-trip', () => {
  beforeEach(() => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
  })

  it('a GameLib-written 1026 manifest (writeAppManifest field set) reads as state:"downloading"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        Universe: '1',
        StateFlags: '1026',
        installdir: 'csgo',
        name: 'CS:GO',
        LastUpdated: '1700000000',
        SizeOnDisk: '123',
        buildid: '0',
        LastOwner: '76561197960287930',
        BytesToDownload: '0',
        BytesDownloaded: '0',
        AutoUpdateBehavior: '0',
        InstalledDepots: {},
        UserConfig: {},
        MountedDepots: {}
      }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('downloading')
  })

  it('the SAME manifest with Steam-flipped StateFlags "4" reads as state:"installed"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        Universe: '1',
        StateFlags: '4',
        installdir: 'csgo',
        name: 'CS:GO',
        LastUpdated: '1700000000',
        SizeOnDisk: '123',
        buildid: '0',
        LastOwner: '76561197960287930',
        BytesToDownload: '0',
        BytesDownloaded: '0',
        AutoUpdateBehavior: '0',
        InstalledDepots: {},
        UserConfig: {},
        MountedDepots: {}
      }
    })
    const result = await readAcfState('730')
    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'csgo')
    )
  })
})

// ── 17-03: readAcfState('bottle') — bottle-scoped ACF scan, never conflated ───

describe('readAcfState(appId, "bottle") — bottle-scoped ACF root', () => {
  beforeEach(() => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
  })

  it('reads a manifest placed under the mocked bottle steamapps root and returns state:"installed" (bit 4 set)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })

    const result = await readAcfState('730', 'bottle')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join(BOTTLE_STEAMAPPS_ROOT, 'common', 'csgo')
    )
    // Bottle scan must never consult getSteamLibraries() (the native root)
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('returns state:"absent" when the bottle root has no manifest, even though the native root is separately mocked as installed (proves no conflation)', async () => {
    // Simulate a native library ALSO configured with an installed manifest for
    // the same appId — if the bottle scan ever fell back to or merged with the
    // native root, this would incorrectly report 'installed'.
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockImplementation(
      (path: string) => path === '/steam' || path === join('/steam', 'steamapps')
    )
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })

    const result = await readAcfState('730', 'bottle')

    expect(result.state).toBe('absent')
    // The bottle scan must never even consult the native library-path resolver
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  // ── GAP-17-PFX86-PATH: win32-layout bottle (no "(x86)" root) ──────────────
  it('resolves an installed manifest identically under a win32-layout bottle steamapps root (Program Files, no x86)', async () => {
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(WIN32_BOTTLE_STEAMAPPS_ROOT)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })

    const result = await readAcfState('730', 'bottle')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join(WIN32_BOTTLE_STEAMAPPS_ROOT, 'common', 'csgo')
    )
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('existing native readAcfState(appId) behavior is unchanged when no source arg is passed (same fixture, same result)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })

    const result = await readAcfState('730')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'csgo')
    )
    // Native scan must never consult the bottle path resolver
    expect(getBottleSteamappsDir).not.toHaveBeenCalled()
  })
})

// ── 17-03: buildBottleInstalledMap() ──────────────────────────────────────────

describe('buildBottleInstalledMap()', () => {
  beforeEach(() => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
  })

  it('returns an empty Map when the bottle steamapps dir does not exist', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = await buildBottleInstalledMap()

    expect(result.size).toBe(0)
  })

  it('marks a bottle-installed appId (StateFlags bit 4 set), rooted at the bottle steamapps dir', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })

    const result = await buildBottleInstalledMap()

    expect(result.has(730)).toBe(true)
    expect(result.get(730)?.installPath).toBe(
      join(BOTTLE_STEAMAPPS_ROOT, 'common', 'csgo')
    )
    // Bottle map build must never consult the native library-path resolver
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('skips a corrupt bottle ACF file without throwing (T-2-01/T-17-05)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })

    const result = await buildBottleInstalledMap()

    expect(result.size).toBe(0)
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    jest
      .mocked(getFileSize)
      .mockImplementation((bytes: unknown) => `${bytes} B`)
  })

  afterEach(() => {
    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('sends gameStatusUpdate { status:"installing" } when state is "downloading"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing'
      })
    )
  })

  // ── GAP-17-BOTTLE-PROGRESS: pollInstallOnce derives percent from ACF bytes ─

  it('emits progressUpdate with progress.percent === 50 for a mid-download ACF (BytesDownloaded=5, BytesToDownload=10)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5',
        BytesToDownload: '10'
      }
    })
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('falls back to BytesStaged/BytesToStage when BytesToDownload is 0 (percent 50 via staged fallback)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '0',
        BytesStaged: '3',
        BytesToStage: '6'
      }
    })
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        progress: expect.objectContaining({ percent: 50 })
      })
    )
  })

  it('does NOT emit progressUpdate (and never a non-finite percent) when BOTH BytesToDownload and BytesToStage are 0', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '0',
        BytesToDownload: '0',
        BytesStaged: '0',
        BytesToStage: '0'
      }
    })
    await pollInstallOnce('730')
    const progressCalls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls).toHaveLength(0)
    // Belt-and-suspenders: no call anywhere ever carries a non-finite percent.
    for (const [, payload] of (sendFrontendMessage as jest.Mock).mock.calls) {
      if (payload?.progress?.percent !== undefined) {
        expect(Number.isFinite(payload.progress.percent)).toBe(true)
      }
    }
  })

  it('sends pushGameToLibrary + gameStatusUpdate { status:"done" } when state is "installed"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling('730', 60000) // register entry so stopInstallPolling has something to clear
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '730', is_installed: true })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  // ── GAME-02: poller fires confirmed completion toast (RED gate) ────────────

  it('GAME-02: fires notify with Installation Finished on the "installed" branch (confirmed ACF state)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling('730', 60000) // register entry so stopInstallPolling has something to clear
    await pollInstallOnce('730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Installation Finished'
    })
  })

  it('GAME-02: does NOT fire notify on the "downloading" branch (interim tick, no toast)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce('730')
    expect(notify).not.toHaveBeenCalled()
  })

  // ── D-UAT-04 (21-16): GameLib handoff (StateFlags===1026) waiting signal ──

  it('emits gameStatusUpdate with context "steam-waiting-for-restart" when StateFlags parses to exactly 1026 (GameLib handoff)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing',
        context: 'steam-waiting-for-restart'
      })
    )
  })

  it('does NOT set a context on the plain active-download branch (StateFlags=2, non-1026)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    await pollInstallOnce('730')
    const call = (sendFrontendMessage as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(call![1].context).toBeUndefined()
  })

  it('fires the "restart Steam" notification exactly once across multiple poll calls while StateFlags stays 1026', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    startInstallPolling('730', 60000) // register the activePolls entry so notifiedWaiting can gate
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Restart Steam to finish installing {{game}}'
    })
  })

  it('does NOT fire the waiting notification for a non-1026 active download', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    startInstallPolling('730', 60000)
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    expect(notify).not.toHaveBeenCalled()
  })

  // ── 17-03: pollInstallOnce(appId, 'bottle') — Pitfall 3 platform label ─────

  it('a bottle-sourced install object has platform === "Windows" even when isMac is mocked true', async () => {
    const envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    envMock.isLinux = false
    try {
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '730',
          StateFlags: '4',
          installdir: 'csgo',
          SizeOnDisk: '50000'
        }
      })
      startInstallPolling('730', { intervalMs: 60000, source: 'bottle' })
      await pollInstallOnce('730', 'bottle')
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({
          app_name: '730',
          is_installed: true,
          install: expect.objectContaining({ platform: 'Windows' })
        })
      )
    } finally {
      envMock.isMac = false
      envMock.isLinux = true
    }
  })

  // ── GAP-17-PFX86-PATH: win32-layout bottle platform label ──────────────────
  it('a bottle-sourced install object from a win32-layout bottle still has platform === "Windows"', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(WIN32_BOTTLE_STEAMAPPS_ROOT)
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startInstallPolling('730', { intervalMs: 60000, source: 'bottle' })
    await pollInstallOnce('730', 'bottle')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: '730',
        is_installed: true,
        install: expect.objectContaining({ platform: 'Windows' })
      })
    )
  })

  // ── D-05/D-15: bottle-source poller reads a hand-written GameLib manifest
  // identically to native — no poller code change required for D-15 reuse ────
  it('D-15: a hand-written GameLib 1026 manifest in the bottle steamapps root reads as "installing" via the UNCHANGED bottle poller', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        Universe: '1',
        StateFlags: '1026',
        installdir: 'csgo',
        name: 'CS:GO',
        LastUpdated: '1700000000',
        SizeOnDisk: '123',
        buildid: '0',
        LastOwner: '76561197960287930',
        BytesToDownload: '0',
        BytesDownloaded: '0',
        AutoUpdateBehavior: '0',
        InstalledDepots: {},
        UserConfig: {},
        MountedDepots: {}
      }
    })
    startInstallPolling('730', { intervalMs: 60000, source: 'bottle' })
    await pollInstallOnce('730', 'bottle')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing'
      })
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

  // CR-01 regression: cancelling Steam's install dialog (no manifest ever
  // appears) must emit a terminal 'done' after the grace window so the DM queue
  // badge clears — removeFromQueue suppresses 'done' for steam and relies on
  // this poller. Symmetric to the uninstall grace path.
  it('emits gameStatusUpdate { status:"done" } after the grace window when no manifest ever appears (CR-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest never appears
    jest.mocked(sendFrontendMessage).mockClear()
    const interval = 10
    startInstallPolling('730', interval)
    // GRACE_TICKS (20) + 1 ticks so the grace branch fires
    await jest.advanceTimersByTimeAsync(interval * 21)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  // ── 17-03: startInstallPolling(appId, { source: 'bottle' }) ────────────────

  it('startInstallPolling(appId, { source: "bottle" }) polls the bottle steamapps root, not the native one', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2', // downloading — keeps the poll alive for the assertion
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })

    startInstallPolling('730', { source: 'bottle' })
    await jest.advanceTimersByTimeAsync(3000)

    expect(getSteamLibraries).not.toHaveBeenCalled()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'installing'
      })
    )
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
      install: {
        install_path: '/steam/steamapps/common/csgo',
        platform: 'Windows'
      },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
  })

  afterEach(() => {
    stopUninstallPolling('730')
    jest.useRealTimers()
  })

  it('flips the badge to not-installed + sends done when the manifest is absent (uninstall complete)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone
    startUninstallPolling('730', 60000) // register entry so stop has something to clear
    await pollUninstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: '730', is_installed: false })
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'done'
      })
    )
  })

  it('sends gameStatusUpdate { status:"uninstalling" } while StateFlags bit 0x800 is set', async () => {
    // 4 (installed) | 2048 (uninstalling) = 2052
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2052',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling('730', 60000)
    await pollUninstallOnce('730')
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({
        appName: '730',
        runner: 'steam',
        status: 'uninstalling'
      })
    )
  })

  it('does NOT flip the badge while the game is still fully installed (no uninstalling bit)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling('730', 60000)
    await pollUninstallOnce('730')
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.anything()
    )
  })

  // ── GAME-03: poller fires confirmed uninstall toast (RED gate) ─────────────

  it('GAME-03: fires notify with Game Uninstalled on the "absent" branch (confirmed ACF removal)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false) // manifest gone = uninstall complete
    startUninstallPolling('730', 60000) // register entry so stop has something to clear
    await pollUninstallOnce('730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Game Uninstalled'
    })
  })

  it('GAME-03: does NOT fire notify while the manifest is still present (interim uninstalling tick)', async () => {
    // 4 (installed) | 2048 (uninstalling) = 2052
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2052',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    startUninstallPolling('730', 60000)
    await pollUninstallOnce('730')
    expect(notify).not.toHaveBeenCalled()
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([])
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
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
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
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '50000'
      }
    })
    const result = await scanDownloadingAppIds()
    expect(result).not.toContain('730')
  })

  it('does NOT return appIds not present in the in-memory library Map', async () => {
    // library is empty — no '730' entry
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    const result = await scanDownloadingAppIds()
    expect(result).not.toContain('730')
  })
})

// ── GAME-05: readRunningAppId() — per-platform dispatch ───────────────────────

describe('readRunningAppId() — per-platform dispatch', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    // Default: Linux
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
  })

  describe('Windows platform', () => {
    beforeEach(() => {
      envMock.isWindows = true
      envMock.isMac = false
    })

    it('windowsRunningAppId: parses REG_DWORD 0x1b58 → 7000', () => {
      ;(spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: 'RunningAppID    REG_DWORD    0x1b58'
      })
      expect(readRunningAppId()).toBe(7000)
    })

    it('windowsRunningAppId: returns 0 when reg.exe exits with non-zero status', () => {
      ;(spawnSync as jest.Mock).mockReturnValue({ status: 1, stdout: '' })
      expect(readRunningAppId()).toBe(0)
    })

    it('windowsRunningAppId: returns 0 when spawnSync throws', () => {
      ;(spawnSync as jest.Mock).mockImplementation(() => {
        throw new Error('reg.exe not available')
      })
      expect(readRunningAppId()).toBe(0)
    })

    it('windowsRunningAppId: returns 0 when RunningAppID not present in output', () => {
      ;(spawnSync as jest.Mock).mockReturnValue({
        status: 0,
        stdout: 'ERROR: The system was unable to find the specified registry key'
      })
      expect(readRunningAppId()).toBe(0)
    })
  })

  describe('macOS platform', () => {
    beforeEach(() => {
      envMock.isWindows = false
      envMock.isMac = true
      envMock.isLinux = false
    })

    it('macOsRunningAppId: parses registry.vdf and returns numeric RunningAppID', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('vdf-content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '440' } } } }
        }
      })
      expect(readRunningAppId()).toBe(440)
    })

    it('macOsRunningAppId: returns 0 when registry.vdf does not exist', () => {
      ;(existsSync as jest.Mock).mockReturnValue(false)
      expect(readRunningAppId()).toBe(0)
    })

    it('macOsRunningAppId: returns 0 when vdf.parse throws', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockImplementation(() => {
        throw new Error('parse error')
      })
      expect(readRunningAppId()).toBe(0)
    })

    it('macOsRunningAppId: returns 0 when RunningAppID key is missing in VDF', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({ Registry: {} })
      expect(readRunningAppId()).toBe(0)
    })
  })

  describe('Linux platform', () => {
    it('linuxRegistryVdfRunningAppId: returns VDF RunningAppID when non-zero', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '570' } } } }
        }
      })
      expect(readRunningAppId()).toBe(570)
    })

    it('linuxFallbackRunningAppId: falls back to reaper process scan when VDF RunningAppID is 0', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '0' } } } }
        }
      })
      ;(execFileSync as jest.Mock).mockReturnValue(
        'reaper SteamLaunch --AppId 440 -- /path/to/game'
      )
      expect(readRunningAppId()).toBe(440)
    })

    it('linuxFallbackRunningAppId: returns 0 when VDF is 0 and reaper scan finds nothing', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '0' } } } }
        }
      })
      ;(execFileSync as jest.Mock).mockReturnValue('no reaper here')
      expect(readRunningAppId()).toBe(0)
    })

    it('linuxFallbackRunningAppId: returns 0 when execFileSync throws', () => {
      ;(existsSync as jest.Mock).mockReturnValue(true)
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        Registry: {
          HKCU: { Software: { Valve: { Steam: { RunningAppID: '0' } } } }
        }
      })
      ;(execFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('ps not available')
      })
      expect(readRunningAppId()).toBe(0)
    })
  })
})

// ── GAME-05: pollRunningOnce() ────────────────────────────────────────────────

describe('pollRunningOnce()', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  // Helper: configure vdf.parse to return a specific RunningAppID value
  const mockRunningAppId = (appId: number): void => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      Registry: {
        HKCU: {
          Software: { Valve: { Steam: { RunningAppID: String(appId) } } }
        }
      }
    })
  }

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    // Use macOS path for simple VDF-based control
    envMock.isWindows = false
    envMock.isMac = true
    envMock.isLinux = false
    // Reset lastKnownRunningAppId to 0 between tests
    stopRunningPoll()
  })

  it('sends gameStatusUpdate { status: "playing" } when RunningAppID goes 0→X', () => {
    mockRunningAppId(440)
    pollRunningOnce()
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '440',
      runner: 'steam',
      status: 'playing'
    })
  })

  it('does NOT send a "done" message on 0→X transition (no prior game)', () => {
    mockRunningAppId(440)
    pollRunningOnce()
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'done' })
    )
  })

  it('sends gameStatusUpdate { status: "done" } when RunningAppID goes X→0', () => {
    // Establish X=440 as the known running game
    mockRunningAppId(440)
    pollRunningOnce()
    ;(sendFrontendMessage as jest.Mock).mockClear()

    mockRunningAppId(0)
    pollRunningOnce()

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '440',
      runner: 'steam',
      status: 'done'
    })
    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'gameStatusUpdate',
      expect.objectContaining({ status: 'playing' })
    )
  })

  it('sends no message when RunningAppID is unchanged', () => {
    mockRunningAppId(440)
    pollRunningOnce() // 0→440
    ;(sendFrontendMessage as jest.Mock).mockClear()

    // Same value — no delta
    pollRunningOnce()
    expect(sendFrontendMessage).not.toHaveBeenCalled()
  })

  it('sends done for old ID and playing for new ID on X→Y transition', () => {
    mockRunningAppId(440)
    pollRunningOnce() // 0→440
    ;(sendFrontendMessage as jest.Mock).mockClear()

    mockRunningAppId(570)
    pollRunningOnce() // 440→570

    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '440',
      runner: 'steam',
      status: 'done'
    })
    expect(sendFrontendMessage).toHaveBeenCalledWith('gameStatusUpdate', {
      appName: '570',
      runner: 'steam',
      status: 'playing'
    })
  })
})

// ── GAME-05: startRunningPoll() / stopRunningPoll() lifecycle ─────────────────

describe('startRunningPoll() and stopRunningPoll()', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    stopRunningPoll() // reset state (clears timer + lastKnownRunningAppId)
  })

  afterEach(() => {
    stopRunningPoll()
    jest.useRealTimers()
  })

  it('startRunningPoll is idempotent — second call does not create a second timer', () => {
    const spy = jest.spyOn(global, 'setInterval')
    startRunningPoll(5000)
    startRunningPoll(5000) // second call is a no-op
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('stopRunningPoll clears the timer so a subsequent startRunningPoll creates a new one', () => {
    const spy = jest.spyOn(global, 'setInterval')
    startRunningPoll(5000)
    stopRunningPoll()
    startRunningPoll(5000) // new registration after stop
    expect(spy).toHaveBeenCalledTimes(2)
    spy.mockRestore()
  })
})

// ── DETAIL-01 GAP2: hostInstallPlatform() — install.platform reflects host OS ──
//
// Verifies that the module-private hostInstallPlatform() helper in library.ts
// returns the correct InstallPlatform for each OS, observable through
// refreshInstallState() → install.platform on the resulting library entry.
// Pattern: same envMock flipping used by readRunningAppId() describe (L1122-1261).

describe('hostInstallPlatform() via refreshInstallState() — install.platform reflects host OS (DETAIL-01 GAP2)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any
  let manager: SteamLibraryManager

  // Seed library with an uninstalled game, set up ACF mocks, call refreshInstallState.
  // Uses the same ACF/vdf mock setup as the L508 refreshInstallState test.
  const installGame570 = async (): Promise<void> => {
    library.clear()
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
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_570.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '570',
        StateFlags: '4',
        installdir: 'dota2',
        SizeOnDisk: '50000'
      }
    })

    await manager.refreshInstallState()
  }

  beforeEach(() => {
    manager = new SteamLibraryManager()
    envMock = jest.requireMock('backend/constants/environment')
    // Default to Linux (matches the top-level module mock declaration at L99-104)
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    // Provide empty caches so init()/migrateStaleArtUrls() are no-ops if called
    ;(steamMetadataStore.entries as jest.Mock).mockReturnValue([])
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    jest
      .mocked(getFileSize)
      .mockImplementation((bytes: unknown) => `${bytes} B`)
  })

  afterEach(() => {
    // Restore Linux defaults to prevent cross-test bleed
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    library.clear()
  })

  it('install.platform resolves to "Mac" when host OS is macOS', async () => {
    envMock.isWindows = false
    envMock.isMac = true
    envMock.isLinux = false

    await installGame570()

    expect(library.get('570')!.install.platform).toBe('Mac')
  })

  it('install.platform resolves to "linux" when host OS is Linux', async () => {
    // envMock already set to Linux in beforeEach — no override needed
    await installGame570()

    expect(library.get('570')!.install.platform).toBe('linux')
  })

  it('install.platform resolves to "Windows" when host OS is Windows', async () => {
    envMock.isWindows = true
    envMock.isMac = false
    envMock.isLinux = false

    await installGame570()

    expect(library.get('570')!.install.platform).toBe('Windows')
  })
})

// ── MAC32-03: Mach-O classification primitives ───────────────────────────────

/** Flush pending microtask/macrotask queues (real timers only). */
const flushAsync = () => new Promise<void>((resolve) => setImmediate(resolve))

describe('machOArchsOf()', () => {
  it('runs lipo -archs argv-form and returns the space-split arch list', () => {
    ;(execFileSync as jest.Mock).mockReturnValue('x86_64 arm64\n')

    const result = machOArchsOf('/Games/Foo.app/Contents/MacOS/Foo')

    expect(execFileSync).toHaveBeenCalledWith(
      'lipo',
      ['-archs', '/Games/Foo.app/Contents/MacOS/Foo'],
      expect.objectContaining({ encoding: 'utf8' })
    )
    expect(result).toEqual(['x86_64', 'arm64'])
  })

  it('falls back to `file` when lipo throws, and still classifies correctly', () => {
    ;(execFileSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd === 'lipo') throw new Error('lipo not found')
      if (cmd === 'file') {
        return '/Games/Foo.app/Contents/MacOS/Foo: Mach-O executable i386\n'
      }
      throw new Error(`unexpected command ${cmd}`)
    })

    const result = machOArchsOf('/Games/Foo.app/Contents/MacOS/Foo')

    expect(execFileSync).toHaveBeenCalledWith(
      'file',
      ['/Games/Foo.app/Contents/MacOS/Foo'],
      expect.objectContaining({ encoding: 'utf8' })
    )
    expect(result).toEqual(['i386'])
  })

  it('returns [] (inconclusive) when BOTH lipo and file fail — never a 32-bit verdict', () => {
    ;(execFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('neither tool available')
    })

    const result = machOArchsOf('/Games/Foo.app/Contents/MacOS/Foo')

    expect(result).toEqual([])
  })
})

describe('verdictFromArchs()', () => {
  it("maps ['i386'] to '32'", () => {
    expect(verdictFromArchs(['i386'])).toBe('32')
  })

  it("maps ['x86_64'] to '64'", () => {
    expect(verdictFromArchs(['x86_64'])).toBe('64')
  })

  it("maps ['x86_64','arm64'] to '64'", () => {
    expect(verdictFromArchs(['x86_64', 'arm64'])).toBe('64')
  })

  it("maps ['i386','x86_64'] to '64' — any 64 wins over i386 (universal binary)", () => {
    expect(verdictFromArchs(['i386', 'x86_64'])).toBe('64')
  })

  it('maps [] to null — inconclusive, must NOT be coerced to 32', () => {
    expect(verdictFromArchs([])).toBeNull()
  })
})

describe('locateMachOBinary()', () => {
  const INSTALL_PATH = join('/steam', 'steamapps', 'common', 'oldgame')

  beforeEach(() => {
    ;(existsSync as jest.Mock).mockReset()
    ;(readdirSync as jest.Mock).mockReset()
  })

  it('prefers a supplied launch executable path when it exists', () => {
    const launchExe = join('OldGame.app', 'Contents', 'MacOS', 'OldGame')
    ;(existsSync as jest.Mock).mockImplementation(
      (p: string) => p === join(INSTALL_PATH, launchExe)
    )

    const result = locateMachOBinary(INSTALL_PATH, launchExe)

    expect(result).toBe(join(INSTALL_PATH, launchExe))
    expect(readdirSync).not.toHaveBeenCalled()
  })

  it('scans for a top-level *.app bundle and returns Contents/MacOS/<first bin> when no launch executable is supplied', () => {
    const macOsDir = join(INSTALL_PATH, 'OldGame.app', 'Contents', 'MacOS')
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app', 'readme.txt']
      if (dir === macOsDir) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)

    const result = locateMachOBinary(INSTALL_PATH)

    expect(result).toBe(join(macOsDir, 'OldGame'))
  })

  it('returns null (no throw) when no *.app bundle is found', () => {
    ;(readdirSync as jest.Mock).mockReturnValue(['readme.txt'])

    expect(locateMachOBinary(INSTALL_PATH)).toBeNull()
  })

  it('returns null (no throw) when readdirSync throws', () => {
    ;(readdirSync as jest.Mock).mockImplementation(() => {
      throw new Error('ENOENT')
    })

    expect(locateMachOBinary(INSTALL_PATH)).toBeNull()
  })

  it('returns null when the *.app bundle has no Contents/MacOS dir', () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
      dir === INSTALL_PATH ? ['OldGame.app'] : []
    )
    ;(existsSync as jest.Mock).mockReturnValue(false)

    expect(locateMachOBinary(INSTALL_PATH)).toBeNull()
  })

  // T-18-03-04: a launchExecutable that escapes installPath's subtree must be
  // rejected, never filesystem-touched — join() alone does not contain '../'.
  it('rejects a launchExecutable that escapes installPath via ".." traversal (never touches the filesystem)', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true) // even if it "exists", it must be refused
    ;(readdirSync as jest.Mock).mockReturnValue([]) // fall-through scan finds nothing

    const result = locateMachOBinary(INSTALL_PATH, '../../../../etc/passwd')

    expect(result).toBeNull()
    // The escaped candidate must never be returned, and existsSync must never
    // be consulted for it (containment is checked before the fs probe).
    expect(existsSync).not.toHaveBeenCalledWith(
      join(INSTALL_PATH, '../../../../etc/passwd')
    )
  })

  it('rejects a launchExecutable that resolves to an absolute path outside installPath', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([])

    const result = locateMachOBinary(INSTALL_PATH, '/etc/passwd')

    expect(result).toBeNull()
  })
})

describe('verifyMacArchGroundTruth() — MAC32-03', () => {
  const APP_ID = '226840'
  const INSTALL_PATH = join('/steam', 'steamapps', 'common', 'oldgame')
  const MACOS_DIR = join(INSTALL_PATH, 'OldGame.app', 'Contents', 'MacOS')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let envMock: any

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isWindows = false
    envMock.isMac = true
    envMock.isLinux = false
    ;(existsSync as jest.Mock).mockReset()
    ;(readdirSync as jest.Mock).mockReset()
    ;(execFileSync as jest.Mock).mockReset()
    ;(steamMetadataStore.get as jest.Mock).mockReset()
    ;(steamMetadataStore.set as jest.Mock).mockReset()
    // Default to a cancel response — tests that exercise the confirm path
    // (games.test.ts, MAC32-03 Task 3) override this explicitly. Prevents an
    // unhandled rejection from the fire-and-forget promptI386Recovery call
    // on an i386 flip.
    ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })
  })

  afterEach(() => {
    envMock.isWindows = false
    envMock.isMac = false
    envMock.isLinux = true
    // CR-01 regression test seeds the real library Map (imported from
    // '../state') — clean it up so it never leaks into sibling tests.
    library.delete(APP_ID)
  })

  it("skips entirely (no subprocess, no cache write) when source==='bottle'", async () => {
    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'bottle')

    expect(execFileSync).not.toHaveBeenCalled()
    expect(readdirSync).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('skips when !isMac (non-macOS host)', async () => {
    envMock.isMac = false

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(execFileSync).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it("skips when mac_arch is already '32' (nothing to correct)", async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({ mac_arch: '32' })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(execFileSync).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('skips when mac_arch_verified is already true (already resolved)', async () => {
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      mac_arch: '64',
      mac_arch_verified: true
    })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(execFileSync).not.toHaveBeenCalled()
    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('logs+skips (no cache write) when locateMachOBinary finds nothing', async () => {
    ;(readdirSync as jest.Mock).mockReturnValue(['readme.txt'])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it('inconclusive verdict (both tools fail) does NOT overwrite an existing mac_arch hint', async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(execFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('neither tool available')
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      mac_arch: 'unknown',
      mac_arch_source: 'minos'
    })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(steamMetadataStore.set).not.toHaveBeenCalled()
  })

  it("i386-only binary — persists mac_arch '32', mac_arch_source 'macho', mac_arch_verified true, spreading existing fields", async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(execFileSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: 'cover.jpg',
      art_square: 'square.jpg',
      extra: { reqs: [] },
      is_mac_native: true,
      platformsCaptured: true
    })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        art_cover: 'cover.jpg',
        art_square: 'square.jpg',
        is_mac_native: true,
        platformsCaptured: true,
        mac_arch: '32',
        mac_arch_source: 'macho',
        mac_arch_verified: true
      })
    )
  })

  it("x86_64 present — persists mac_arch '64' confirmed (Mach-O ground truth)", async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(execFileSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'x86_64\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(steamMetadataStore.set).toHaveBeenCalledWith(
      APP_ID,
      expect.objectContaining({
        mac_arch: '64',
        mac_arch_source: 'macho',
        mac_arch_verified: true
      })
    )
  })

  it('MAC32-03/CONTEXT D-6: an i386 flip triggers the user-consent dialog (never a silent uninstall) — decoupled fire-and-forget, cancel leaves the cached verdict untouched', async () => {
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(execFileSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })
    ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')
    // Fire-and-forget: the dialog call itself runs synchronously up to its
    // own first await when promptI386Recovery is invoked, so it has already
    // been recorded by the time verifyMacArchGroundTruth returns.
    await flushAsync()

    expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
    // Cancelled — the '32' verdict persisted just above is left untouched
    // (no second steamMetadataStore.set call from the recovery path).
    expect(steamMetadataStore.set).toHaveBeenCalledTimes(1)
  })

  // ── CR-01 gap closure (18-05): verdict reaches the frontend-visible ───────
  // in-memory library Map + pushGameToLibrary payload, not just
  // steamMetadataStore (backend disk cache).

  it('CR-01: an i386 verdict updates the in-memory library Map and pushes the updated GameInfo to the frontend', async () => {
    // Seed the real library Map (imported from '../state') with an existing
    // GameInfo for APP_ID — the propagation fix only updates entries already
    // present in the Map (never fabricates one).
    library.set(APP_ID, {
      runner: 'steam',
      app_name: APP_ID,
      title: 'Old Game',
      is_installed: true,
      install: { install_path: INSTALL_PATH },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(execFileSync as jest.Mock).mockImplementation((cmd: string) => {
      if (cmd === 'lipo') return 'i386\n'
      throw new Error(`unexpected command ${cmd}`)
    })
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })
    // Cancel path — promptI386Recovery is a no-op, keeps this test focused
    // on the propagation fix rather than the recovery dialog flow.
    ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })

    await verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')

    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID, mac_arch: '32' })
    )
    expect(library.get(APP_ID)?.mac_arch).toBe('32')
    expect(steamLibraryStore.set).toHaveBeenCalledWith(
      'games',
      expect.arrayContaining([
        expect.objectContaining({ app_name: APP_ID, mac_arch: '32' })
      ])
    )
  })

  it('CR-01: does not push or throw when appId is not present in the in-memory library Map', async () => {
    // library does not have APP_ID (afterEach deletes it)
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) => {
      if (dir === INSTALL_PATH) return ['OldGame.app']
      if (dir === MACOS_DIR) return ['OldGame']
      return []
    })
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(execFileSync as jest.Mock).mockImplementation((cmd: string) =>
      cmd === 'lipo'
        ? 'i386\n'
        : (() => {
            throw new Error('unexpected')
          })()
    )
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      art_cover: '',
      art_square: '',
      extra: { reqs: [] }
    })
    ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })

    await expect(
      verifyMacArchGroundTruth(APP_ID, INSTALL_PATH, 'native')
    ).resolves.not.toThrow()

    expect(sendFrontendMessage).not.toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({ app_name: APP_ID })
    )
    expect(library.has(APP_ID)).toBe(false)
  })
})
