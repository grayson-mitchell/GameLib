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
  buildBridgeInstalledMap,
  readAcfState,
  startInstallPolling,
  stopInstallPolling,
  pollInstallOnce,
  pollUninstallOnce,
  startUninstallPolling,
  stopUninstallPolling,
  scanDownloadingAppIds,
  resumeInterruptedSteamInstall,
  readRunningAppId,
  pollRunningOnce,
  startRunningPoll,
  stopRunningPoll,
  machOArchsOf,
  verdictFromArchs,
  locateMachOBinary,
  verifyMacArchGroundTruth,
  isFullyInstalledStateFlags,
  markSteamInstallIncomplete,
  buildIncompleteInstallSet
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
  getBridgeBottleSettings,
  isBottleProvisioned,
  isBridgeBottleReady,
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
import * as gamesModule from '../games'
import { bridgeAllowlist } from '../bridge/allowlist'

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
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    // Plain method (survives resetMocks) -- publicDir resolves it at module load.
    getAppPath: () => '/tmp/mock-path'
  },
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
  getBridgeBottleSettings: jest.fn(),
  isBottleProvisioned: jest.fn(),
  isBridgeBottleReady: jest.fn(),
  tellBottledSteamToInstall: jest.fn()
}))

// ── depot mock — finalizeToSteam (D-05 startup finalize) / downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download) /
// buildDepotPlan (Phase 23, 23-03, D-04 — startup resume rebuilds a real plan) ─
// healReconciledFileModes included so buildResumeFinalizeOpts (CR-01 gap
// closure, 23-code-review) can be exercised — defaulted to a successful heal
// in the shared beforeEach below so pre-existing resume tests that don't care
// about mode-healing still earn StateFlags=4 as before.
// formatEta/rollingRateMiBs (T-AOG, quick/260719-aog) are pure/deterministic
// helpers pollInstallOnce reuses for its speed/ETA derivation — pulled from
// the REAL module rather than re-implemented as jest.fn() stubs so this
// suite exercises the actual formatting/smoothing behavior.
jest.mock('../depot', () => ({
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  downloadSteamDepots: jest.fn(),
  buildDepotPlan: jest.fn(),
  healReconciledFileModes: jest.fn(),
  formatEta: jest.requireActual<typeof import('../depot')>('../depot').formatEta,
  rollingRateMiBs: jest.requireActual<typeof import('../depot')>('../depot')
    .rollingRateMiBs
}))

// ── depot/reconcile mock — reconcilePartialState (Phase 23, 23-03, D-04) ────
jest.mock('../depot/reconcile', () => ({
  reconcilePartialState: jest.fn()
}))

// ── backend/launcher mock — runWineCommand (D-05 no-auto-drive regression) ────
jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

// ── bridge/allowlist mock — bridgeAllowlist.has (D-UAT-24-02, 24-17) ────────
// Defaulted to false in the shared beforeEach below so EVERY pre-existing
// test is unaffected — non-eligible by default means the existing
// native ?? bottle ?? bridge precedence holds unless a test explicitly
// opts a game into bridge eligibility.
jest.mock('../bridge/allowlist', () => ({
  bridgeAllowlist: { has: jest.fn() }
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

/**
 * Bridge bottle steamapps root used across the 'bridge' source tests
 * (D-UAT-24-05). Distinct bottle name (GameLibSteamBridge) from the Phase 17
 * bottle (GameLibSteam) — proves the two bottle roots are never conflated.
 */
const BRIDGE_BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteamBridge',
  'drive_c/Program Files (x86)/Steam/steamapps'
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
    // Default: no game is bridge-eligible (D-UAT-24-02, 24-17) — every
    // pre-existing test keeps the native ?? bottle ?? bridge precedence.
    jest.mocked(bridgeAllowlist.has).mockReturnValue(false)
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

  // ── D-17: is_windows_native hydration ──────────────────────────────────────

  it('D-17: synced GameInfo carries is_windows_native:true when cachedMeta.is_windows_native is true', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: true
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.is_windows_native).toBe(true)
  })

  it('D-17 false-safe: synced GameInfo carries is_windows_native:false when cachedMeta is absent', async () => {
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

    expect(pushed?.is_windows_native).toBe(false)
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

  // ── D-UAT-24-07: refresh() must ALSO be bridge-aware ────────────────────────
  // The periodic library sync previously derived install-state from ONLY the
  // native + Phase 17 bottle maps — a bridge-installed game (24-12's install
  // poll already flips is_installed:true at install time) got clobbered back
  // to not-installed on the very next sync, causing the Play→Install→Play
  // badge flap (24-UAT.md RETEST RUN 1 NEW-2).

  describe('SteamLibraryManager.refresh() bridge reconciliation (D-UAT-24-07)', () => {
    const envMock = jest.requireMock('backend/constants/environment')

    beforeEach(() => {
      envMock.isMac = true
      envMock.isLinux = false
      jest.mocked(isBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      jest
        .mocked(getBottleSteamappsDir)
        .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${bytes} B`)
      // Native scan finds nothing by default — only the bridge root has manifests.
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('reports is_installed:true (platform Windows) for a game installed ONLY under the bridge root when isBridgeBottleReady() is true, and STAYS installed across a second refresh (no revert)', async () => {
      jest.mocked(isBridgeBottleReady).mockReturnValue(true)
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206040.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '206040',
          StateFlags: '4',
          installdir: 'Avernum 5',
          SizeOnDisk: '9000'
        }
      })

      const apps = [makeOwnedApp(206040, 'Avernum 5', 15)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      let calls = jest.mocked(sendFrontendMessage).mock.calls
      let pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206040'
      )?.[1] as any

      // RED before the fix: pushed.is_installed was false (native+bottle-only
      // scan found nothing). GREEN after the fix: bridge fallback is consulted.
      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install).toEqual(
        expect.objectContaining({
          install_path: join(
            BRIDGE_BOTTLE_STEAMAPPS_ROOT,
            'common',
            'Avernum 5'
          ),
          install_size: '9000 B',
          // Pitfall 3 (D-UAT-24-07-B): a bridge install must always report
          // 'Windows', never the host 'Mac'.
          platform: 'Windows'
        })
      )

      // Second refresh — D-UAT-24-07: must NOT clobber the badge back to false.
      jest.mocked(sendFrontendMessage).mockClear()
      await manager.refresh()

      calls = jest.mocked(sendFrontendMessage).mock.calls
      pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206040'
      )?.[1] as any

      expect(pushed?.is_installed).toBe(true)
    })

    it('performs NO bridge reconciliation when isBridgeBottleReady() returns false (byte-for-byte native/bottle-only behavior preserved)', async () => {
      jest.mocked(isBridgeBottleReady).mockReturnValue(false)
      // If the bridge path were consulted, readdirSync would be called on the
      // bridge root too — assert it's never scanned.
      ;(existsSync as jest.Mock).mockReturnValue(false)
      ;(readdirSync as jest.Mock).mockReturnValue([])

      const apps = [makeOwnedApp(206040, 'Avernum 5', 15)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206040'
      )?.[1] as any

      expect(pushed?.is_installed).toBe(false)
      expect(readdirSync).not.toHaveBeenCalledWith(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
    })
  })

  // ── D-UAT-24-02 (24-17): install-state is bridge-authoritative for a
  // bridge-eligible title — a native/Phase-17-bottle copy must NOT shadow
  // the bridge (Play routes a bridge-eligible title through the bridge
  // regardless of where a non-bridge copy lives). Hardware-confirmed
  // dead-end: Avernum 6 / Hoard "installed" natively/in the Phase 17 bottle
  // but absent from the bridge bottle (24-UAT.md).

  describe('SteamLibraryManager.refresh() bridge-authoritative install-state (D-UAT-24-02)', () => {
    const envMock = jest.requireMock('backend/constants/environment')

    beforeEach(() => {
      envMock.isMac = true
      envMock.isLinux = false
      jest
        .mocked(getSteamBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      // Differentiate the Phase 17 bottle root from the bridge root by the
      // requested bottle name — both real functions share this jest.fn(),
      // so tests must not collapse the two roots into one mockReturnValue.
      jest
        .mocked(getBottleSteamappsDir)
        .mockImplementation((bottleName: string) =>
          bottleName === 'GameLibSteamBridge'
            ? BRIDGE_BOTTLE_STEAMAPPS_ROOT
            : BOTTLE_STEAMAPPS_ROOT
        )
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${bytes} B`)
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('Test A: a bridge-eligible game present ONLY in the Phase 17 bottle map (absent from the bridge map) is is_installed:false (Avernum 6 / Hoard dead-end case)', async () => {
      jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      jest.mocked(isBottleProvisioned).mockReturnValue(true)
      jest.mocked(isBridgeBottleReady).mockReturnValue(true)
      jest.mocked(getSteamLibraries).mockResolvedValue([])
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
          SizeOnDisk: '123456'
        }
      })

      const apps = [makeOwnedApp(206060, 'Avernum 6', 10)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206060'
      )?.[1] as any

      // Bridge-authoritative: the Phase 17 bottle copy must NOT satisfy
      // is_installed for a bridge-eligible title.
      expect(pushed?.is_installed).toBe(false)
    })

    it('Test B: a bridge-eligible game present in the bridge bottle is is_installed:true with platform Windows (Avernum 5 stays installed)', async () => {
      jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
      ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
        platformsCaptured: true,
        is_mac_native: false
      })
      jest.mocked(isBottleProvisioned).mockReturnValue(false)
      jest.mocked(isBridgeBottleReady).mockReturnValue(true)
      jest.mocked(getSteamLibraries).mockResolvedValue([])
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_206040.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '206040',
          StateFlags: '4',
          installdir: 'Avernum 5',
          SizeOnDisk: '9000'
        }
      })

      const apps = [makeOwnedApp(206040, 'Avernum 5', 15)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206040'
      )?.[1] as any

      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install).toEqual(
        expect.objectContaining({
          install_path: join(
            BRIDGE_BOTTLE_STEAMAPPS_ROOT,
            'common',
            'Avernum 5'
          ),
          install_size: '9000 B',
          platform: 'Windows'
        })
      )
    })

    it('Test C: a NON-bridge-eligible game present only in the native map is is_installed:true (existing native ?? bottle precedence unchanged)', async () => {
      jest.mocked(bridgeAllowlist.has).mockReturnValue(false)
      const NATIVE_ROOT = join('/native/steam', 'steamapps')
      jest.mocked(getSteamLibraries).mockResolvedValue(['/native/steam'])
      jest.mocked(isBottleProvisioned).mockReturnValue(false)
      jest.mocked(isBridgeBottleReady).mockReturnValue(false)
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === NATIVE_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === NATIVE_ROOT ? ['appmanifest_999.acf'] : []
      )
      ;(readFileSync as jest.Mock).mockReturnValue('content')
      ;(vdf.parse as jest.Mock).mockReturnValue({
        AppState: {
          appid: '999',
          StateFlags: '4',
          installdir: 'Non-Eligible Game',
          SizeOnDisk: '111'
        }
      })

      const apps = [makeOwnedApp(999, 'Non-Eligible Game', 5)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '999'
      )?.[1] as any

      expect(pushed?.is_installed).toBe(true)
      expect(pushed?.install?.install_path).toBe(
        join(NATIVE_ROOT, 'common', 'Non-Eligible Game')
      )
    })
  })

  // ── WR-01 (21-17): refresh() re-seeds steamResumePending from on-disk ACF ──
  // Before the fix, refresh() derived each GameInfo's install object purely
  // from buildInstalledMap() (bit-4-set only). A mid-session resync
  // (reachable via the launch-completion 'done' status) therefore silently
  // wiped the same-session steamResumePending marker set by
  // markSteamInstallIncomplete — reverting the distinct "Finish in Steam"
  // affordance back to a bare "Install" (the D-UAT-09 symptom). The flag is
  // now derived durably from the on-disk incomplete (bit-4-unset) manifest,
  // so it survives any number of refreshes.

  describe('SteamLibraryManager.refresh() re-seeds steamResumePending (WR-01)', () => {
    const NATIVE_ROOT = join('/native/steam', 'steamapps')

    beforeEach(() => {
      jest.mocked(isBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${bytes} B`)
      jest.mocked(getSteamLibraries).mockResolvedValue(['/native/steam'])
      ;(existsSync as jest.Mock).mockReturnValue(true)
      // One incomplete manifest (1026, bit 4 unset) and one fully-installed
      // manifest (4, bit 4 set) sitting side-by-side in the native root.
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === NATIVE_ROOT
          ? ['appmanifest_570.acf', 'appmanifest_440.acf']
          : []
      )
      ;(readFileSync as jest.Mock).mockImplementation((file: string) =>
        file.includes('appmanifest_570') ? 'incomplete' : 'installed'
      )
      ;(vdf.parse as jest.Mock).mockImplementation((content: string) =>
        content === 'incomplete'
          ? {
              AppState: {
                appid: '570',
                StateFlags: '1026',
                installdir: 'Dota 2',
                SizeOnDisk: '999'
              }
            }
          : {
              AppState: {
                appid: '440',
                StateFlags: '4',
                installdir: 'Team Fortress 2',
                SizeOnDisk: '654321'
              }
            }
      )
    })

    it('an incomplete on-disk native install (bit-4-unset) survives refresh() as is_installed:false + steamResumePending:true', async () => {
      const apps = [
        makeOwnedApp(570, 'Dota 2', 120),
        makeOwnedApp(440, 'Team Fortress 2', 60)
      ]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const incomplete = calls.find(
        ([_msg, info]) => (info as any).app_name === '570'
      )?.[1] as any

      // Play-safety invariant: never is_installed for a bit-4-unset manifest.
      expect(incomplete?.is_installed).toBe(false)
      // The durable resume affordance is re-derived from disk, not wiped.
      expect(incomplete?.install?.steamResumePending).toBe(true)
    })

    it('a fully-installed on-disk native install (bit-4-set) yields is_installed:true and no steamResumePending (no regression)', async () => {
      const apps = [
        makeOwnedApp(570, 'Dota 2', 120),
        makeOwnedApp(440, 'Team Fortress 2', 60)
      ]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const installed = calls.find(
        ([_msg, info]) => (info as any).app_name === '440'
      )?.[1] as any

      expect(installed?.is_installed).toBe(true)
      expect(installed?.install?.steamResumePending).toBeUndefined()
      expect(installed?.install?.install_path).toBe(
        join(NATIVE_ROOT, 'common', 'Team Fortress 2')
      )
    })

    it('the re-seeded steamResumePending is persisted to steamLibraryStore (survives a restart mid-session)', async () => {
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const persistedCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      const persistedGames = persistedCall?.[1] as any[]
      const persisted = persistedGames?.find((g) => g.app_name === '570')

      expect(persisted?.is_installed).toBe(false)
      expect(persisted?.install?.steamResumePending).toBe(true)
    })

    it('buildIncompleteInstallSet returns only the bit-4-unset appId (shares the isFullyInstalledStateFlags predicate)', async () => {
      const set = await buildIncompleteInstallSet()

      expect(set.has(570)).toBe(true) // 1026 → incomplete
      expect(set.has(440)).toBe(false) // 4 → fully installed, excluded
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

    // ── D-UAT-24-07: refreshInstallState() must ALSO be bridge-aware ─────────
    // The focus/post-launch reconciliation had the identical native+bottle-only
    // blind spot as refresh() — a bridge-installed game's badge got clobbered
    // back to false on focus/post-launch reconciliation too.

    describe('bridge reconciliation (D-UAT-24-07)', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        envMock.isMac = true
        envMock.isLinux = false
        jest.mocked(isBottleProvisioned).mockReturnValue(false)
        jest
          .mocked(getBridgeBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
        jest
          .mocked(getBottleSteamappsDir)
          .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('does NOT clobber a bridge-installed game back to is_installed:false (flips to installed, platform Windows) when isBridgeBottleReady() is true', async () => {
        jest.mocked(isBridgeBottleReady).mockReturnValue(true)
        library.set('206040', {
          runner: 'steam',
          app_name: '206040',
          title: 'Avernum 5',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Native scan finds nothing; bridge scan finds the manifest.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue([
          'appmanifest_206040.acf'
        ])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        ;(vdf.parse as jest.Mock).mockReturnValue({
          AppState: {
            appid: '206040',
            StateFlags: '4',
            installdir: 'Avernum 5',
            SizeOnDisk: '9000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({
            app_name: '206040',
            is_installed: true,
            install: expect.objectContaining({ platform: 'Windows' })
          })
        )
      })

      it('performs NO bridge reconciliation when isBridgeBottleReady() returns false', async () => {
        jest.mocked(isBridgeBottleReady).mockReturnValue(false)
        library.set('206040', {
          runner: 'steam',
          app_name: '206040',
          title: 'Avernum 5',
          is_installed: false,
          install: {},
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Even though the bridge path mocks WOULD report installed, the gate
        // must prevent buildBridgeInstalledMap() (and readdirSync) from ever
        // being consulted.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockReturnValue(true)
        ;(readdirSync as jest.Mock).mockReturnValue([
          'appmanifest_206040.acf'
        ])
        ;(readFileSync as jest.Mock).mockReturnValue('content')
        ;(vdf.parse as jest.Mock).mockReturnValue({
          AppState: {
            appid: '206040',
            StateFlags: '4',
            installdir: 'Avernum 5',
            SizeOnDisk: '9000'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('206040')!.is_installed).toBe(false)
      })
    })

    // ── Test D (D-UAT-24-02, 24-17): refreshInstallState() applies the SAME
    // bridge-authoritative selection as refresh() — a bridge-eligible game
    // whose in-memory entry is is_installed:true but present only in the
    // Phase 17 bottle/native map (absent from the bridge map) must be
    // reconciled DOWN to is_installed:false (badge correctly clobbered),
    // while a non-eligible native/bottle game is left unflipped.

    describe('bridge-authoritative install-state (D-UAT-24-02)', () => {
      const envMock = jest.requireMock('backend/constants/environment')

      beforeEach(() => {
        envMock.isMac = true
        envMock.isLinux = false
        jest
          .mocked(getSteamBottleSettings)
          .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
        jest
          .mocked(getBridgeBottleSettings)
          .mockReturnValue({
            wineCrossoverBottle: 'GameLibSteamBridge'
          } as any)
        jest
          .mocked(getBottleSteamappsDir)
          .mockImplementation((bottleName: string) =>
            bottleName === 'GameLibSteamBridge'
              ? BRIDGE_BOTTLE_STEAMAPPS_ROOT
              : BOTTLE_STEAMAPPS_ROOT
          )
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('flips a bridge-eligible game present only in the Phase 17 bottle/native map (absent from bridge) to is_installed:false', async () => {
        jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: false
        })
        jest.mocked(isBottleProvisioned).mockReturnValue(true)
        jest.mocked(isBridgeBottleReady).mockReturnValue(true)
        library.set('206060', {
          runner: 'steam',
          app_name: '206060',
          title: 'Avernum 6',
          is_installed: true,
          install: {
            install_path: join(BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 6'),
            install_size: '123456',
            platform: 'Windows'
          },
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        // Present ONLY in the Phase 17 bottle map — the bridge root has no
        // manifest for this appId.
        jest.mocked(getSteamLibraries).mockResolvedValue([])
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
            SizeOnDisk: '123456'
          }
        })

        await manager.refreshInstallState()

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'pushGameToLibrary',
          expect.objectContaining({ app_name: '206060', is_installed: false })
        )
        expect(library.get('206060')!.is_installed).toBe(false)
      })

      it('does NOT flip a NON-bridge-eligible game present in the native/bottle map (unaffected by the bridge-authoritative gate)', async () => {
        jest.mocked(bridgeAllowlist.has).mockReturnValue(false)
        jest.mocked(isBottleProvisioned).mockReturnValue(true)
        jest.mocked(isBridgeBottleReady).mockReturnValue(false)
        library.set('570', {
          runner: 'steam',
          app_name: '570',
          title: 'Dota 2',
          is_installed: true,
          install: {
            install_path: join(BOTTLE_STEAMAPPS_ROOT, 'common', 'dota2'),
            install_size: '50000',
            platform: 'Windows'
          },
          art_cover: '',
          art_square: '',
          extra: { reqs: [] },
          canRunOffline: true,
          installable: true
        } as any)

        jest.mocked(getSteamLibraries).mockResolvedValue([])
        ;(existsSync as jest.Mock).mockImplementation(
          (path: string) => path === BOTTLE_STEAMAPPS_ROOT
        )
        ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
          dir === BOTTLE_STEAMAPPS_ROOT ? ['appmanifest_570.acf'] : []
        )
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

        // No change → no push (state stayed installed via the unchanged
        // native ?? bottle ?? bridge precedence).
        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('570')!.is_installed).toBe(true)
      })
    })
  })

  // ── D-07 / steam-startup-resume-crash (2026-07-18), D-04 softened: startup
  // now only DETECTS+SURFACES a leftover interrupted download via
  // scanDownloadingAppIds — it never auto-drives finalize/reconcile/poll
  // unattended anymore (that unattended path was the confirmed crash
  // trigger). The heavy work moved to resumeInterruptedSteamInstall(), only
  // invoked by the user's own Install click (see games.test.ts). ───────────

  it('init() surfaces (does NOT auto-resume) an in-progress download detected on startup — no setInterval, no finalize, no depot plan', async () => {
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

    // Nothing heavy may run on boot for a detected interrupted install.
    expect(setIntervalSpy).not.toHaveBeenCalled()
    expect(finalizeToSteam).not.toHaveBeenCalled()
    expect(buildDepotPlan).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()

    // It IS surfaced: the library entry is flagged resumable and pushed.
    expect(library.get('730')?.install?.steamResumePending).toBe(true)
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: '730',
        install: expect.objectContaining({ steamResumePending: true })
      })
    )
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'CS:GO' })
    )

    setIntervalSpy.mockRestore()
    jest.useRealTimers()
  })

  it('init() never throws when surfacing a resumable install fails for one appId, and does not block startup', async () => {
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
    ;(notify as jest.Mock).mockImplementation(() => {
      throw new Error('desktop notification backend unavailable')
    })

    await expect(manager.init()).resolves.toBeUndefined()

    // The failure surfacing the notification must not stop the library
    // entry from still being flagged resumable.
    expect(library.get('730')?.install?.steamResumePending).toBe(true)

    jest.useRealTimers()
  })

  // ── T-23-14: startup resume reconciles against the in-flight registry ────
  //
  // A stale on-disk StateFlags=1026 manifest for an appId already owned by a
  // live in-process install (games.ts's nativeInstallsInFlight) must never
  // spawn a phantom concurrent resume path racing the live download.

  it('T-23-14: init() skips startup-resume for an appId already owned by a live in-process install (isNativeInstallInFlight)', async () => {
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

    const isNativeInstallInFlightSpy = jest
      .spyOn(gamesModule, 'isNativeInstallInFlight')
      .mockReturnValue(true)

    await manager.init()

    // A live install already owns '730' — startup resume must not finalize
    // or re-drive the depot orchestrator for it, and must not even surface
    // it as a separate resumable game (the live install already owns the
    // badge/poll for this appId).
    expect(finalizeToSteam).not.toHaveBeenCalled()
    expect(downloadSteamDepots).not.toHaveBeenCalled()
    expect(library.get('730')?.install?.steamResumePending).toBeUndefined()

    isNativeInstallInFlightSpy.mockRestore()
    jest.useRealTimers()
  })

  it('T-23-14: an appId NOT in the in-flight registry is still surfaced as resumable on startup (no regression)', async () => {
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

    // isNativeInstallInFlight is the REAL (unmocked) games.ts function here —
    // '730' was never registered by a real install(), so it returns false.
    await manager.init()

    expect(library.get('730')?.install?.steamResumePending).toBe(true)
    expect(finalizeToSteam).not.toHaveBeenCalled()

    jest.useRealTimers()
  })

  // ── D-05 / steam-startup-resume-crash (2026-07-18): resumeInterruptedSteamInstall()
  // finalizes to 1026 THEN watches (folded todo) — this logic used to run
  // automatically from init(); it is now invoked ONLY by the user's own
  // Install click (games.ts), so these regression tests call it directly. ──

  it('D-05: resumeInterruptedSteamInstall() finalizes an interrupted GameLib depot download to a 1026 manifest and never re-invokes the depot orchestrator', async () => {
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

    await resumeInterruptedSteamInstall('730')

    expect(finalizeToSteam).toHaveBeenCalledWith(
      '730',
      expect.objectContaining({
        targetSteamappsDir: join('/steam', 'steamapps'),
        installdir: 'csgo',
        depots: []
      })
    )
    // Pitfall 4 / D-05: resume must NEVER re-drive a full download itself —
    // any genuine gap is left for the caller's own subsequent install flow.
    expect(downloadSteamDepots).not.toHaveBeenCalled()

    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('D-05: resumeInterruptedSteamInstall() finalizes BEFORE it starts watching (finalize-then-startInstallPolling ordering)', async () => {
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

    await resumeInterruptedSteamInstall('730')

    expect(order).toEqual(['finalize', 'watch'])

    setIntervalSpy.mockRestore()
    stopInstallPolling('730')
    jest.useRealTimers()
  })

  it('D-05: resumeInterruptedSteamInstall() never dispatches to Steam/CrossOver (tellBottledSteamToInstall / shell.openExternal / runWineCommand — folded-todo regression guard)', async () => {
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

    await resumeInterruptedSteamInstall('730')

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

      await resumeInterruptedSteamInstall('730')

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

      await resumeInterruptedSteamInstall('730')

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

      await expect(
        resumeInterruptedSteamInstall('730')
      ).resolves.toBeUndefined()

      const acfPath = join(tmp, 'steamapps', 'appmanifest_730.acf')
      const text = realReadFileSync(acfPath, 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
      expect(text).not.toMatch(/"StateFlags"\s+"4"/)

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('a resume where reconciliation finds genuinely missing/mismatched files fails CLOSED to StateFlags=1026 — never 4, never crashes resumeInterruptedSteamInstall() (T-23-09)', async () => {
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

      await expect(
        resumeInterruptedSteamInstall('730')
      ).resolves.toBeUndefined()

      const acfPath = join(tmp, 'steamapps', 'appmanifest_730.acf')
      const text = realReadFileSync(acfPath, 'utf8')
      expect(text).toMatch(/"StateFlags"\s+"1026"/)
      expect(text).not.toMatch(/"StateFlags"\s+"4"/)

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('WR-03 (23-code-review): a hostile installdir read off the on-disk ACF is sanitized to the safe appId-derived fallback before reaching buildDepotPlan/resolve()', async () => {
      jest.useFakeTimers()
      library.clear()
      // A hostile/malformed installdir the on-disk ACF could contain (an
      // attacker who can already write into steamapps/ plants this) — must
      // never reach buildDepotPlan or the installRoot resolve() unsanitized.
      setupDownloadingFixture('730', '../evil')

      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [],
        totalBytes: 0
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      jest
        .mocked(reconcilePartialState)
        .mockResolvedValue({ jobs: [], allFilesVerified: true } as never)

      await expect(
        resumeInterruptedSteamInstall('730')
      ).resolves.toBeUndefined()

      // sanitizeInstalldir's fallback shape: `app_${safeFallbackId(appId)}`.
      expect(buildDepotPlan).toHaveBeenCalledWith(
        '730',
        expect.objectContaining({ installdir: 'app_730' })
      )
      expect(buildDepotPlan).not.toHaveBeenCalledWith(
        '730',
        expect.objectContaining({ installdir: '../evil' })
      )

      stopInstallPolling('730')
      jest.useRealTimers()
    })

    it('a buildDepotPlan failure (offline/no CM connection) does not throw out of resumeInterruptedSteamInstall() — degrades to the passive honest-empty 1026 fallback', async () => {
      jest.useFakeTimers()
      library.clear()
      setupDownloadingFixture('730', 'csgo')

      jest
        .mocked(buildDepotPlan)
        .mockRejectedValue(new Error('no authenticated Steam CM connection'))

      await expect(
        resumeInterruptedSteamInstall('730')
      ).resolves.toBeUndefined()

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

// ── D-UAT-24-05 (24-12): readAcfState('bridge') — bridge-bottle-scoped ACF
// root, distinct from both 'native' and the Phase 17 'bottle' root ─────────

describe('readAcfState(appId, "bridge") — bridge-bottle-scoped ACF root', () => {
  beforeEach(() => {
    jest
      .mocked(getBridgeBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
    // Distinguish by bottle name so a test can mock BOTH getSteamBottleSettings
    // (Phase 17 'bottle') and getBridgeBottleSettings ('bridge') at once
    // without one root's mocked value clobbering the other's.
    jest
      .mocked(getBottleSteamappsDir)
      .mockImplementation((bottleName: string) =>
        bottleName === 'GameLibSteamBridge'
          ? BRIDGE_BOTTLE_STEAMAPPS_ROOT
          : BOTTLE_STEAMAPPS_ROOT
      )
  })

  it('reads a StateFlags=4 manifest placed under the mocked bridge bottle steamapps root and returns state:"installed"', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '206040',
        StateFlags: '4',
        installdir: 'Avernum 5',
        SizeOnDisk: '9000'
      }
    })

    const result = await readAcfState('206040', 'bridge')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join(BRIDGE_BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 5')
    )
    // Bridge scan must never consult the native library-path resolver
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('returns state:"absent" when the bridge bottle steamapps dir does not exist (no throw)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = await readAcfState('206040', 'bridge')

    expect(result.state).toBe('absent')
  })

  it('returns state:"absent" for an ACF present only in the native root — proves no conflation with "native"', async () => {
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

    const result = await readAcfState('730', 'bridge')

    expect(result.state).toBe('absent')
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('returns state:"absent" for an ACF present only in the bridge root when read under "native" or "bottle" — proves no reverse conflation', async () => {
    // Bridge root has the manifest, but the native/bottle scans must not see it.
    ;(existsSync as jest.Mock).mockImplementation(
      (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
    )
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '206040',
        StateFlags: '4',
        installdir: 'Avernum 5',
        SizeOnDisk: '9000'
      }
    })

    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    const nativeResult = await readAcfState('206040', 'native')
    expect(nativeResult.state).toBe('absent')

    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    const bottleResult = await readAcfState('206040', 'bottle')
    expect(bottleResult.state).toBe('absent')
  })
})

// ── D-UAT-09 (21-17): isFullyInstalledStateFlags() + detector regression lock ─

describe('isFullyInstalledStateFlags()', () => {
  it('Test A: bit 4 set (4, 6, 516) -> true; bit 4 clear (1026, 2) -> false', () => {
    expect(isFullyInstalledStateFlags(4)).toBe(true)
    expect(isFullyInstalledStateFlags(6)).toBe(true) // bit 4 set alongside bit 2
    expect(isFullyInstalledStateFlags(516)).toBe(true) // bit 4 set alongside bit 512
    expect(isFullyInstalledStateFlags(1026)).toBe(false) // the GameLib handoff literal — bit 4 unset
    expect(isFullyInstalledStateFlags(2)).toBe(false)
  })
})

describe('detector regression lock (D-UAT-09): buildInstalledMap / readAcfState route through isFullyInstalledStateFlags', () => {
  it('Test B: buildInstalledMap over a mixed 1026/4 fixture returns ONLY the bit-4 appId', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_100.acf',
      'appmanifest_200.acf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '100',
          StateFlags: '1026',
          installdir: 'incomplete-game',
          SizeOnDisk: '0'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '200',
          StateFlags: '4',
          installdir: 'complete-game',
          SizeOnDisk: '500'
        }
      })

    const result = await buildInstalledMap()

    expect(result.has(100)).toBe(false)
    expect(result.has(200)).toBe(true)
  })

  it('Test B: readAcfState returns "downloading" for a 1026 fixture and "installed" for a 4 fixture', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '100',
        StateFlags: '1026',
        installdir: 'incomplete-game',
        SizeOnDisk: '0'
      }
    })

    const incomplete = await readAcfState('100')
    expect(incomplete.state).toBe('downloading')

    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '200',
        StateFlags: '4',
        installdir: 'complete-game',
        SizeOnDisk: '500'
      }
    })

    const complete = await readAcfState('200')
    expect(complete.state).toBe('installed')
  })
})

// ── D-UAT-09 (21-17): markSteamInstallIncomplete() — same-session cancel ─────

describe('markSteamInstallIncomplete()', () => {
  beforeEach(() => {
    library.clear()
    jest.mocked(sendFrontendMessage).mockClear()
    ;(steamLibraryStore.set as jest.Mock).mockClear()
  })

  it('Test E: flips is_installed to false and steamResumePending to true, persists, and pushes to the frontend', () => {
    library.set('730', {
      runner: 'steam',
      app_name: '730',
      title: 'CS:GO',
      is_installed: true,
      install: { install_path: '/steam/steamapps/common/csgo' },
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      canRunOffline: true,
      installable: true
    } as any)

    markSteamInstallIncomplete('730')

    expect(library.get('730')?.is_installed).toBe(false)
    expect(library.get('730')?.install?.steamResumePending).toBe(true)
    // Prior install fields must survive the merge, not be clobbered.
    expect(library.get('730')?.install?.install_path).toBe(
      '/steam/steamapps/common/csgo'
    )
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      expect.objectContaining({
        app_name: '730',
        is_installed: false,
        install: expect.objectContaining({ steamResumePending: true })
      })
    )
  })

  it('Test E: is a no-op (never throws) when the appId has no in-memory library entry', () => {
    library.clear()
    expect(() => markSteamInstallIncomplete('nonexistent')).not.toThrow()
    expect(sendFrontendMessage).not.toHaveBeenCalled()
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

// ── D-UAT-24-07 (24-16): buildBridgeInstalledMap() ────────────────────────────
// Bridge-bottle-scoped sibling of buildBottleInstalledMap() — rooted at the
// DEDICATED bridge bottle (GameLibSteamBridge) via getBridgeBottleSteamappsRoot()
// instead of the Phase 17 bottle, so a bridge-installed game's badge survives
// the periodic library sync and focus reconciliation (D-UAT-24-07).

describe('buildBridgeInstalledMap()', () => {
  beforeEach(() => {
    jest
      .mocked(getBridgeBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
  })

  it('returns an empty Map when the bridge bottle steamapps dir does not exist', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = await buildBridgeInstalledMap()

    expect(result.size).toBe(0)
  })

  it('marks a bridge-installed appId (StateFlags bit 4 set), rooted at the bridge bottle steamapps dir', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '206040',
        StateFlags: '4',
        installdir: 'Avernum 5',
        SizeOnDisk: '9000'
      }
    })

    const result = await buildBridgeInstalledMap()

    expect(result.has(206040)).toBe(true)
    expect(result.get(206040)?.installPath).toBe(
      join(BRIDGE_BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 5')
    )
    // Bridge map build must never consult the native library-path resolver
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('skips a corrupt bridge ACF file without throwing (T-2-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })

    const result = await buildBridgeInstalledMap()

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

  // ── T-AOG (quick/260719-aog): download speed + ETA derivation ─────────────

  it('emits no downSpeed and eta "" on a direct call with no active poll (poll undefined never throws)', async () => {
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
    await expect(pollInstallOnce('730')).resolves.toBeUndefined()
    const call = (sendFrontendMessage as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(call![1].progress.percent).toBe(50)
    expect(call![1].progress.downSpeed).toBeUndefined()
    expect(call![1].progress.eta).toBe('')
  })

  it('emits a finite downSpeed > 0 and a non-empty decreasing eta on the second tick of a rising download (first tick has no baseline yet)', async () => {
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '5000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '8000000',
          BytesToDownload: '10000000'
        }
      })

    startInstallPolling('730', 60000) // register activePolls entry for the speed baseline
    await pollInstallOnce('730')
    jest.advanceTimersByTime(3000) // 3s elapsed between ticks
    await pollInstallOnce('730')

    const progressCalls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls).toHaveLength(2)

    const [firstCall, secondCall] = progressCalls
    // First tick: no prior baseline, so no speed yet — percent still fires.
    expect(firstCall[1].progress.percent).toBe(50)
    expect(firstCall[1].progress.downSpeed).toBeUndefined()
    expect(firstCall[1].progress.eta).toBe('')

    // Second tick: (8M - 5M) bytes over 3s -> a finite, positive MiB/s rate
    // and a non-empty ETA string derived from the remaining bytes.
    expect(secondCall[1].progress.percent).toBe(80)
    expect(secondCall[1].progress.downSpeed).toBeGreaterThan(0)
    expect(Number.isFinite(secondCall[1].progress.downSpeed)).toBe(true)
    expect(typeof secondCall[1].progress.eta).toBe('string')
    expect(secondCall[1].progress.eta.length).toBeGreaterThan(0)
  })

  it('never emits a non-finite/negative downSpeed or eta when two ticks land back-to-back with zero elapsed time (preallocation-jump guard)', async () => {
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '0',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          // Simulates a Steam preallocation jump landing on the very next
          // tick with no elapsed wall-clock time between polls.
          BytesDownloaded: '9000000',
          BytesToDownload: '10000000'
        }
      })

    startInstallPolling('730', 60000)
    await pollInstallOnce('730')
    await pollInstallOnce('730') // no jest.advanceTimersByTime — zero elapsed ms

    const progressCalls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    for (const [, payload] of progressCalls) {
      if (payload.progress.downSpeed !== undefined) {
        expect(Number.isFinite(payload.progress.downSpeed)).toBe(true)
        expect(payload.progress.downSpeed).toBeGreaterThanOrEqual(0)
      }
      expect(typeof payload.progress.eta).toBe('string')
      expect(Number.isFinite(payload.progress.percent)).toBe(true)
    }
  })

  it('regression (GAP-17-BOTTLE-PROGRESS): staged-fallback ACF (BytesToDownload=0) still emits percent, with no downSpeed/eta', async () => {
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
    startInstallPolling('730', 60000)
    await pollInstallOnce('730')
    jest.advanceTimersByTime(3000)
    await pollInstallOnce('730')

    const progressCalls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls.length).toBeGreaterThan(0)
    for (const [, payload] of progressCalls) {
      expect(payload.progress.percent).toBe(50)
      expect(payload.progress.downSpeed).toBeUndefined()
      expect(payload.progress.eta).toBe('')
    }
  })

  // ── T-AOG (quick/260719-aog, Task 2): paused/stalled detection ─────────────

  it('emits gameStatusUpdate context "steam-paused" after STALLED_TICKS_THRESHOLD consecutive frozen-bytes ticks on a real in-flight download', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '2',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5000000',
        BytesToDownload: '10000000'
      }
    })
    startInstallPolling('730', 60000)
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce('730')
      jest.advanceTimersByTime(3000)
    }

    const calls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(calls[calls.length - 1][1].context).toBe('steam-paused')
  })

  it('never emits "steam-paused" while BytesDownloaded keeps rising across ticks (active download resets the stalled counter)', async () => {
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '1000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '2000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '3000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '2',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '4000000',
          BytesToDownload: '10000000'
        }
      })
    startInstallPolling('730', 60000)
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce('730')
      jest.advanceTimersByTime(3000)
    }

    const calls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of calls) {
      expect(payload.context).not.toBe('steam-paused')
    }
  })

  it('keeps "steam-waiting-for-restart" (never "steam-paused") for a frozen 1026 handoff manifest on a native-ON handoff poll, even with a real in-flight download\'s frozen bytes', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5000000',
        BytesToDownload: '10000000'
      }
    })
    // debug/steam-1026-download-restart: isNativeHandoff:true — this poll
    // stands in for games.ts's post-depot.ts-download handoff poll, the ONLY
    // scenario where StateFlags 1026 genuinely means "waiting for restart".
    startInstallPolling('730', { intervalMs: 60000, isNativeHandoff: true })
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce('730')
      jest.advanceTimersByTime(3000)
    }

    const calls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of calls) {
      expect(payload.context).toBe('steam-waiting-for-restart')
    }
  })

  it('does NOT flag "steam-paused" for a staged-fallback ACF (BytesToDownload=0) even though BytesDownloaded stays frozen at 0', async () => {
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
    startInstallPolling('730', 60000)
    for (let i = 0; i < 4; i++) {
      await pollInstallOnce('730')
      jest.advanceTimersByTime(3000)
    }

    const calls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of calls) {
      expect(payload.context).toBeUndefined()
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

  it('emits gameStatusUpdate with context "steam-waiting-for-restart" when StateFlags parses to exactly 1026 on a native-ON handoff poll (GameLib handoff)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    // debug/steam-1026-download-restart: StateFlags 1026 alone is NOT enough
    // — must also be a poll started for GameLib's own finished handoff.
    startInstallPolling('730', { intervalMs: 60000, isNativeHandoff: true })
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

  // ── debug/steam-1026-download-restart: the 1026-collision regression ──────

  it('regression: an OFF-path poll (Steam owns the download, no isNativeHandoff) at StateFlags 1026 with advancing bytes emits normal "installing" progress, NEVER "steam-waiting-for-restart"', async () => {
    ;(vdf.parse as jest.Mock)
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '1026',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '1000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '1026',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '3000000',
          BytesToDownload: '10000000'
        }
      })
      .mockReturnValueOnce({
        AppState: {
          appid: '730',
          StateFlags: '1026',
          installdir: 'csgo',
          SizeOnDisk: '0',
          BytesDownloaded: '5000000',
          BytesToDownload: '10000000'
        }
      })
    // No isNativeHandoff — mirrors games.ts's OFF-path startInstallPolling
    // calls (steam://install handoff / legacy tellBottledSteamToInstall).
    startInstallPolling('730', 60000)
    for (let i = 0; i < 3; i++) {
      await pollInstallOnce('730')
      jest.advanceTimersByTime(3000)
    }

    const statusCalls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    for (const [, payload] of statusCalls) {
      expect(payload.status).toBe('installing')
      expect(payload.context).not.toBe('steam-waiting-for-restart')
    }
    expect(notify).not.toHaveBeenCalled()

    const progressCalls = (sendFrontendMessage as jest.Mock).mock.calls.filter(
      ([channel]) => channel === 'progressUpdate'
    )
    expect(progressCalls.length).toBeGreaterThan(0)
    for (const [, payload] of progressCalls) {
      expect(Number.isFinite(payload.progress.percent)).toBe(true)
      expect(payload.progress.percent).toBeGreaterThan(0)
    }
  })

  it('regression: the cold-start tick of an OFF-path 1026 poll (no prior baseline) never flashes "steam-waiting-for-restart"', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '1000000',
        BytesToDownload: '10000000'
      }
    })
    startInstallPolling('730', 60000) // OFF-path, no isNativeHandoff
    await pollInstallOnce('730') // very first tick — no lastBytesDownloaded baseline yet

    const call = (sendFrontendMessage as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(call![1].context).not.toBe('steam-waiting-for-restart')
  })

  it('regression: StateFlags 1042 (0x400|0x2|0x10, active download, never === 1026) still emits normal progress regardless of isNativeHandoff', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1042',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '5',
        BytesToDownload: '10'
      }
    })
    await pollInstallOnce('730')
    const call = (sendFrontendMessage as jest.Mock).mock.calls.find(
      ([channel]) => channel === 'gameStatusUpdate'
    )
    expect(call![1].status).toBe('installing')
    expect(call![1].context).toBeUndefined()
    expect(sendFrontendMessage).toHaveBeenCalledWith(
      'progressUpdate',
      expect.objectContaining({
        progress: expect.objectContaining({ percent: 50 })
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

  it('fires the "restart Steam" notification exactly once across multiple poll calls while StateFlags stays 1026 (native-ON handoff poll)', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0'
      }
    })
    // debug/steam-1026-download-restart: isNativeHandoff:true — register the
    // activePolls entry AS a native-ON handoff poll so notifiedWaiting can gate.
    startInstallPolling('730', { intervalMs: 60000, isNativeHandoff: true })
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith({
      title: 'CS:GO',
      body: 'Restart Steam to finish installing {{game}}'
    })
  })

  it('regression: does NOT fire the waiting notification for an OFF-path poll (no isNativeHandoff) even while StateFlags stays 1026', async () => {
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '1026',
        installdir: 'csgo',
        SizeOnDisk: '0',
        BytesDownloaded: '1000000',
        BytesToDownload: '10000000'
      }
    })
    startInstallPolling('730', 60000) // OFF-path, no isNativeHandoff
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    await pollInstallOnce('730')
    expect(notify).not.toHaveBeenCalled()
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
