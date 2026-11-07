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
  readRunningAppId,
  pollRunningOnce,
  startRunningPoll,
  stopRunningPoll
} from '../library'
import { stopInstallPolling } from '../library/installStop'
import {
  buildInstalledMap,
  buildIncompleteInstallSet
} from '../library/installedMap'
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
import { shell } from 'backend/platform'
import { getSteamLibraries, getFileSize } from 'backend/utils'
import { sendFrontendMessage } from '../../../ipc'
import { notify } from '../../../dialog/dialog'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { SteamUser } from '../user'
import {
  noteRefreshTrigger,
  resetSteamAuthTrigger,
  consumeSteamRefreshLogonGrant
} from '../authTrigger'
import { getAnonymousPicsClient } from '../anonymousClient'
import {
  steamLibraryStore,
  steamMetadataStore,
  steamSyncStore,
  steamRestartHoldStore
} from '../stores'
import {
  getBottleSteamappsDir,
  getSteamBottleSettings,
  getBridgeBottleSettings,
  isSteamBottleProvisioned,
  listReadyBridgeBottleNames,
  resolveBridgeBottleName
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
import * as gamesModule from '../gameSessionState'
import { bridgeAllowlist } from '../bridge/allowlist'
import { captureOwnedAppPlatforms } from '../platformCapture'
import { captureOwnedAppMetacritic } from '../metacriticCapture'
import {
  listSteamClientPids,
  readSteamProcessStartTokens
} from '../steamClientProcess'
import { logInfo } from 'backend/logger'
import {
  readSteamDownloadMonitor,
  startSteamDownloadMonitor,
  stopSteamDownloadMonitor
} from '../steamDownloadMonitor'
import { pollInstallOnce } from '../library/installPollOnce'
import { startInstallPolling } from '../library/installPolling'
import { resumeInterruptedSteamInstall } from '../library/resume'

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
// steam/games.ts imports the shared shortcuts module, whose import graph does not load under
// this file's mocks (quick 261026-c7r).
jest.mock('../../../shortcuts/shortcuts/shortcuts', () => ({
  addShortcuts: jest.fn(),
  removeShortcuts: jest.fn(),
  shortcutFiles: jest.fn()
}))

jest.mock('backend/knownFixReport', () => ({ reportDetectedFix: jest.fn() }))

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
// 23.2-04: t is a jest.fn (not a plain function) so its call args are
// inspectable — the fallback-string return value is unchanged, so every
// pre-existing body-text assertion in this file keeps passing byte-for-byte.
// This is what makes the interpolation options object provable: the fallback
// alone can only ever show the raw {{depots}} placeholder, never the actual
// depot id.
// The named `t` is the same jest.fn as `default.t`, so a test can reference it
// without a default-import member access (import-x/no-named-as-default-member).
jest.mock('i18next', () => {
  const t = jest.fn((_key: string, fallback = '') => fallback)
  return { __esModule: true, t, default: { t } }
})

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
jest.mock('backend/platform', () => ({
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

// ── stores mock — steamLibraryStore, steamMetadataStore, etc. ────────
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
    entries: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  // quick 261029-pkp: persisted restart-hold records. Map-backed in the
  // pkp describe; bare jest.fns elsewhere (entries() -> undefined is caught
  // by listSteamRestartHolds and reads as an empty store).
  steamRestartHoldStore: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    entries: jest.fn()
  }
}))

// ── bottle mock — getBottleSteamappsDir/getSteamBottleSettings/isBottleProvisioned ─
jest.mock('../bottle', () => ({
  getBottleSteamappsDir: jest.fn(),
  getSteamBottleSettings: jest.fn(),
  getBridgeBottleSettings: jest.fn(),
  isSteamBottleProvisioned: jest.fn(),
  listReadyBridgeBottleNames: jest.fn(),
  resolveBridgeBottleName: jest.fn()
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
  formatEta:
    jest.requireActual<typeof import('../depot')>('../depot').formatEta,
  rollingRateMiBs:
    jest.requireActual<typeof import('../depot')>('../depot').rollingRateMiBs
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
  bridgeAllowlist: { has: jest.fn(), knownBadReason: jest.fn() }
}))

// ── platformCapture mock — captureOwnedAppPlatforms (34.15 D-03/D-04) ──────
// This module is unit-tested in isolation (Plan 01's own suite). Mocking it
// here isolates refresh()'s own wiring/instrumentation from the real bulk
// PICS scoping and merge logic — the shared beforeEach below defaults it to
// a no-op success so every pre-existing refresh() test is unaffected; the
// 'D-03 fail-soft' describe block below overrides this default per-test.
jest.mock('../anonymousClient', () => ({
  getAnonymousPicsClient: jest.fn()
}))
jest.mock('../bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: jest.fn()
}))
jest.mock('../platformCapture', () => ({
  captureOwnedAppPlatforms: jest.fn()
}))
jest.mock('../metacriticCapture', () => ({
  captureOwnedAppMetacritic: jest.fn()
}))
// D-UAT-13: the install poller asks which Steam client PIDs are alive when a
// native handoff finalizes. A bare jest.fn() resolves undefined = "inconclusive"
// = fail open (no hold), so every pre-existing test keeps its old behaviour;
// the D-UAT-13 describe below drives it explicitly. Never a real child spawn.
// quick 261029-sex: bare jest.fn = undefined = no live signal = ACF behaviour.
jest.mock('../steamDownloadMonitor', () => ({
  startSteamDownloadMonitor: jest.fn(),
  readSteamDownloadMonitor: jest.fn(),
  stopSteamDownloadMonitor: jest.fn()
}))
jest.mock('../steamClientProcess', () => ({
  listSteamClientPids: jest.fn(),
  // quick 261029-pkp: start-time identity probe (bare jest.fn = undefined =
  // "unknown": no record is persisted, so pre-existing tests are unaffected).
  readSteamProcessStartTokens: jest.fn()
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

// 23.2-04: this project's jest config sets `resetMocks: true`, which strips
// jest.fn() implementations (not just call history) before EVERY test — so
// the i18nextT mock's fallback-returning implementation (set once at
// jest.mock() factory time, above) must be re-established file-wide, or any
// test anywhere in this file that asserts on a notify() body derived from
// i18nextT would see `undefined` instead of the fallback string. A plain
// (non-jest.fn) function is immune to resetMocks, which is why this was not
// needed before this key was added to observe the call args.
beforeEach(() => {
  ;(i18nextT as jest.Mock).mockImplementation(
    (_key: string, fallback = '') => fallback
  )
  // quick/261016-u1w (D-C): default to "no ready bridge bottle" so every
  // describe block that doesn't care about the bridge path (and therefore
  // never arms this mock) gets the same falsy short-circuit the old
  // isBridgeBottleReady()-returns-undefined default gave it, rather than a
  // TypeError from calling .length on an un-mocked return value.
  jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
  jest.mocked(backfillBridgeLaunchTargets).mockResolvedValue(0)
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
  let leaseRelease: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    manager = new SteamLibraryManager()
    // Phase 54: refresh() logs on only for a granted (explicit) Refresh. This
    // suite tests refresh()'s BEHAVIOR, so arm the one-shot grant the way the
    // IPC handler does; the grant is consumed by the first refresh() call, so
    // tests that refresh twice re-arm it. The grant gate itself has its own
    // describe below and the structural launch test.
    resetSteamAuthTrigger()
    noteRefreshTrigger('steam', 'action-icons-refresh-button')
    // Default lease: the client the test installed via SteamUser.getClient().
    leaseRelease = jest.fn()
    jest.mocked(SteamUser.acquireOpenAuthenticated).mockReturnValue(null)
    jest.mocked(SteamUser.acquireAuthenticated).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        client: SteamUser.getClient(),
        release: leaseRelease
      } as never)
    )
    jest.mocked(getAnonymousPicsClient).mockResolvedValue(null)
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
    // Default: the bulk platform capture (34.15 D-03/D-04) reports a
    // no-op success — every pre-existing refresh() test is unaffected.
    // Individual tests below override this per-case.
    jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
      scopedCount: 0,
      capturedCount: 0,
      skippedCount: 0,
      failed: false
    })
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

    // 34.15 D-07: refresh() now ALSO emits on the steamSyncStatus channel
    // (entry 'syncing' + terminal 'idle'), so the total sendFrontendMessage
    // call count is no longer 1:1 with pushGameToLibrary pushes — filter to
    // the pushGameToLibrary channel specifically, matching this test's own
    // name and intent.
    const pushCalls = jest
      .mocked(sendFrontendMessage)
      .mock.calls.filter(([channel]) => channel === 'pushGameToLibrary')
    expect(pushCalls).toHaveLength(2)
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
    // Quick task 260816-hdg: `is_windows_native` is what makes this fixture
    // mean what its name says — a LEGITIMATELY-WRITTEN post-D-17 entry. Every
    // real write persists it in the same object literal as `platformsCaptured`
    // (games.ts fetchMetadataIfNeeded), so an entry without it is pre-D-17
    // residue, not a captured entry. See the residue counterpart below.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_windows_native: true,
      is_mac_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.steamPlatformsCaptured).toBe(true)
  })

  it('260816-hdg: synced GameInfo carries steamPlatformsCaptured:FALSE for a pre-D-17 residue entry (platformsCaptured:true, no is_windows_native)', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    // THE 370-ENTRY RESIDUE SHAPE. The mac answer is real and is left alone;
    // only the depot claim is cleared, so the frontend stops being told a
    // depot signal was captured when the field that fetch owes is absent.
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.steamPlatformsCaptured).toBe(false)
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

  // NARROWED by 34.13 review WR-16 (was: `toBe(false)`). The SAFETY
  // property D-17 actually requires is "never `true` when nothing was
  // captured" — every consumer tests `=== true`, so that is what makes a
  // Windows install un-offerable. Pinning the literal `false` additionally
  // asserted that a never-captured entry is INDISTINGUISHABLE from a
  // confirmed-no-Windows-depot one, which contradicts the three-valued
  // contract both `common/types.ts` and `stores.ts` document. The
  // assertions below pin the safety property AND the preserved
  // distinction.
  it('D-17 false-safe: synced GameInfo never carries is_windows_native:true when cachedMeta is absent, and preserves undefined ("never captured")', async () => {
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

    // The load-bearing half: an uncaptured verdict can never offer Windows.
    expect(pushed?.is_windows_native).not.toBe(true)
    // The contract half: "never captured" stays distinguishable from
    // "confirmed no Windows depot" (`false`).
    expect(pushed?.is_windows_native).toBeUndefined()
  })

  it('261029-sbi: synced GameInfo carries metacritic_score from cachedMeta', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    jest
      .mocked(SteamUser.getClient)
      .mockReturnValue(makeFakeClient(apps) as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      metacritic_score: 90
    })

    await manager.refresh()

    const pushed = jest
      .mocked(sendFrontendMessage)
      .mock.calls.find(
        ([_m, info]) => (info as any).app_name === '570'
      )?.[1] as any
    expect(pushed?.metacritic_score).toBe(90)
  })

  it('261029-sbi: absent cachedMeta gives metacritic_score undefined, never 0', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    jest
      .mocked(SteamUser.getClient)
      .mockReturnValue(makeFakeClient(apps) as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue(undefined)

    await manager.refresh()

    const pushed = jest
      .mocked(sendFrontendMessage)
      .mock.calls.find(
        ([_m, info]) => (info as any).app_name === '570'
      )?.[1] as any
    expect(pushed).toBeDefined()
    expect(pushed.metacritic_score).toBeUndefined()
  })

  it('D-17: a CONFIRMED-false cachedMeta stays false -- distinct from the never-captured case above', async () => {
    const apps = [makeOwnedApp(570, 'Dota 2', 120)]
    const fakeClient = makeFakeClient(apps)
    jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
    jest.mocked(steamLibraryStore.get).mockReturnValue([])
    ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
      platformsCaptured: true,
      is_mac_native: true,
      is_windows_native: false
    })

    await manager.refresh()

    const calls = jest.mocked(sendFrontendMessage).mock.calls
    const pushed = calls.find(
      ([_msg, info]) => (info as any).app_name === '570'
    )?.[1] as any

    expect(pushed?.is_windows_native).toBe(false)
    expect(pushed?.is_windows_native).not.toBeUndefined()
  })

  // ── CR-01 gap closure (18-05): mac_arch survives refresh() resync ─────────

  it("CR-01: refresh() seeds mac_arch:'32' from cachedMeta so a cached Mach-O verdict survives resync", async () => {
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

  // ── 34.15 D-07: refresh() sync status emission, one test per exit path ─────

  /** Filters the sendFrontendMessage mock's calls to the steamSyncStatus
   *  channel and returns the payloads in call order, so every assertion
   *  below reads as an ordered SEQUENCE rather than a magic call index. */
  const steamSyncEmits = () =>
    jest
      .mocked(sendFrontendMessage)
      .mock.calls.filter(([channel]) => channel === 'steamSyncStatus')
      .map(([, payload]) => payload)

  describe('SteamLibraryManager.refresh() sync status emission (34.15 D-07)', () => {
    const refuse = (reason: string) =>
      jest
        .mocked(SteamUser.acquireAuthenticated)
        .mockResolvedValue({ ok: false, reason } as never)

    it('exit path 1 (client not ready): emits [failed/client-not-ready] and resolves null', async () => {
      refuse('client-not-ready')

      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamSyncEmits()).toEqual([
        { status: 'failed', reason: 'client-not-ready' }
      ])
    })

    it('exit path 1 (CM rejected the logon): still ONE failed emit, but names it logon-rejected so it never reads as a readiness race', async () => {
      // `jest.mocked(SteamUser).x` rather than `jest.mocked(SteamUser.x)`:
      // the latter is a bare method reference and trips unbound-method.
      refuse('logon-rejected')
      jest.mocked(SteamUser).getLogonFailure.mockReturnValue({
        message: 'AccessDenied',
        eresult: 15
      })

      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamSyncEmits()).toEqual([
        { status: 'failed', reason: 'logon-rejected' }
      ])
    })

    it.each(['token-absent', 'token-unreadable', 'not-signed-in'])(
      'exit path 1 (%s): maps to the generic client-not-ready reason',
      async (reason) => {
        refuse(reason)

        await manager.refresh()

        expect(steamSyncEmits()).toEqual([
          { status: 'failed', reason: 'client-not-ready' }
        ])
      }
    )

    it('refused go-offline-required: exactly one idle emit, no logon, cached library untouched', async () => {
      refuse('go-offline-required')

      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
      expect(sendFrontendMessage).not.toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.anything()
      )
    })

    it('a granted Refresh asks for the guided Go Offline step', async () => {
      const fakeClient = makeFakeClient([])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(SteamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
      expect(SteamUser.acquireAuthenticated).toHaveBeenCalledWith({
        reason: 'user-refresh',
        guidedAction: 'refresh'
      })
      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })

    it('a sign-in grant acquires with reason login', async () => {
      resetSteamAuthTrigger()
      noteRefreshTrigger('steam', 'login-success')
      jest
        .mocked(SteamUser.getClient)
        .mockReturnValue(makeFakeClient([]) as any)

      await manager.refresh()

      expect(SteamUser.acquireAuthenticated).toHaveBeenCalledWith({
        reason: 'login',
        guidedAction: 'refresh'
      })
    })

    it('the grant is one-shot: a second refresh without a new grant does not acquire', async () => {
      jest
        .mocked(SteamUser.getClient)
        .mockReturnValue(makeFakeClient([]) as any)

      await manager.refresh()
      await manager.refresh()

      expect(SteamUser.acquireAuthenticated).toHaveBeenCalledTimes(1)
    })

    it('exit path 2 (getUserOwnedApps throws): emits [syncing, failed/owned-apps-failed] AFTER cached games are pushed', async () => {
      const cachedGames = [
        { runner: 'steam', app_name: '570', title: 'Dota 2' } as any,
        { runner: 'steam', app_name: '440', title: 'Team Fortress 2' } as any
      ]
      const fakeClient = {
        steamID: 'STEAMID_TEST',
        getUserOwnedApps: jest
          .fn()
          .mockRejectedValue(new Error('CM unreachable'))
      }
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue(cachedGames)

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'failed', reason: 'owned-apps-failed' }
      ])
      // The "notice renders above a populated grid" requirement: both cached
      // games must have been pushed BEFORE the failure emit, not after.
      const calls = jest.mocked(sendFrontendMessage).mock.calls
      const pushIndices = calls
        .map(([channel], i) => (channel === 'pushGameToLibrary' ? i : -1))
        .filter((i) => i !== -1)
      const failedEmitIndex = calls.findIndex(
        ([channel, payload]) =>
          channel === 'steamSyncStatus' && (payload as any).status === 'failed'
      )
      expect(pushIndices).toHaveLength(2)
      expect(Math.max(...pushIndices)).toBeLessThan(failedEmitIndex)
    })

    it('exit path 3 (success): emits [syncing, idle] and NO failed payload', async () => {
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
    })

    it('exit path 4 (previously-uncaught Steps 2-4 hydration span): emits [syncing, failed/sync-failed], rejects, and NEVER emits idle', async () => {
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])
      // Forcing seam: steamLibraryStore.set is called at the tail of the
      // Steps 2-4 span with no catch above it at HEAD — this is exactly the
      // previously-silent unhandled-rejection path reachable from init()'s
      // unscoped runOnceWhenOnline(() => this.refresh()).
      jest.mocked(steamLibraryStore.set).mockImplementation(() => {
        throw new Error('disk write failed')
      })

      await expect(manager.refresh()).rejects.toThrow('disk write failed')

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'failed', reason: 'sync-failed' }
      ])
      // Negative gate: the regression a `finally` block would introduce.
      expect(steamSyncEmits()).not.toContainEqual({ status: 'idle' })
    })
  })

  describe('Phase 54 ungranted (automatic) refresh', () => {
    beforeEach(() => {
      // Drop the grant the shared beforeEach armed.
      consumeSteamRefreshLogonGrant()
    })

    it('with no open session: no logon, one idle emit, install state reconciled locally', async () => {
      const result = await manager.refresh()

      expect(result).toBeNull()
      expect(SteamUser.acquireAuthenticated).not.toHaveBeenCalled()
      expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
    })

    it('a throwing local reconcile still yields exactly one idle emit', async () => {
      jest.mocked(getSteamLibraries).mockRejectedValue(new Error('boom'))

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([{ status: 'idle' }])
    })

    it('with an open session: full sync on that client, no new logon, lease released', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest
        .mocked(SteamUser.acquireOpenAuthenticated)
        .mockReturnValue({ client: fakeClient, release: leaseRelease } as never)

      await manager.refresh()

      expect(SteamUser.acquireAuthenticated).not.toHaveBeenCalled()
      expect(fakeClient.getUserOwnedApps).toHaveBeenCalledTimes(1)
      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })

    it('releases the open-session lease on the hydration-catch rethrow', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest
        .mocked(SteamUser.acquireOpenAuthenticated)
        .mockReturnValue({ client: fakeClient, release: leaseRelease } as never)
      jest.mocked(steamLibraryStore.set).mockImplementation(() => {
        throw new Error('disk write failed')
      })

      await expect(manager.refresh()).rejects.toThrow('disk write failed')

      expect(leaseRelease).toHaveBeenCalledTimes(1)
    })
  })

  describe('Phase 54 platform capture runs anonymous first', () => {
    const anon = { tag: 'anon' }

    it('a complete anonymous pass is the only pass', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 1,
        capturedCount: 1,
        skippedCount: 0,
        failed: false
      })

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(1)
      expect(captureOwnedAppPlatforms).toHaveBeenCalledWith(anon, [570])
    })

    it('an incomplete anonymous pass gets a second pass on the held session', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 1,
        capturedCount: 0,
        skippedCount: 0,
        failed: false
      })

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(2)
      expect(captureOwnedAppPlatforms).toHaveBeenNthCalledWith(1, anon, [570])
      expect(captureOwnedAppPlatforms).toHaveBeenNthCalledWith(
        2,
        fakeClient,
        [570]
      )
    })

    it('a failed anonymous pass gets a second pass', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 1,
        capturedCount: 1,
        skippedCount: 0,
        failed: true
      })

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(2)
    })

    it('261029-sbi: metacritic capture gets the anonymous client and runs before the first push', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(getAnonymousPicsClient).mockResolvedValue(anon as never)
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 0,
        capturedCount: 0,
        skippedCount: 0,
        failed: false
      })

      await manager.refresh()

      expect(captureOwnedAppMetacritic).toHaveBeenCalledWith(anon, [570])
      const capOrder = jest.mocked(captureOwnedAppMetacritic).mock
        .invocationCallOrder[0]
      const pushIdx = jest
        .mocked(sendFrontendMessage)
        .mock.calls.findIndex(([m]) => m === 'pushGameToLibrary')
      expect(pushIdx).toBeGreaterThanOrEqual(0)
      expect(capOrder).toBeLessThan(
        jest.mocked(sendFrontendMessage).mock.invocationCallOrder[pushIdx]
      )
    })

    it('261029-sbi: no anonymous client falls back to the held session', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(captureOwnedAppMetacritic).toHaveBeenCalledWith(fakeClient, [570])
    })

    it('no anonymous client: one pass on the held session', async () => {
      const fakeClient = makeFakeClient([makeOwnedApp(570, 'Dota 2', 120)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(captureOwnedAppPlatforms).toHaveBeenCalledTimes(1)
      expect(captureOwnedAppPlatforms).toHaveBeenCalledWith(fakeClient, [570])
    })
  })

  // ── 34.15 D-03 fail-soft: the library survives a dead/failing PICS call ────

  describe('D-03 fail-soft', () => {
    it('refresh() still completes normally when captureOwnedAppPlatforms reports failed:true', async () => {
      jest.mocked(captureOwnedAppPlatforms).mockResolvedValue({
        scopedCount: 3,
        capturedCount: 0,
        skippedCount: 3,
        failed: true
      })
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      const result = await manager.refresh()

      expect(result).toEqual({ stdout: '1 games synced', stderr: '' })
      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570' })
      )
    })

    it('pins current behaviour when captureOwnedAppPlatforms itself rejects (contract violation, defence in depth): the call sits OUTSIDE the Step 2-4 try, so the rejection propagates un-emitted, not as exit path 4', async () => {
      jest
        .mocked(captureOwnedAppPlatforms)
        .mockRejectedValue(new Error('PICS contract violated'))
      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      // Pinned, not silently absorbed: captureOwnedAppPlatforms's own
      // contract is "never throws" (Plan 01) -- refresh() deliberately does
      // NOT add a second, redundant try/catch around a call that is already
      // contracted not to need one. A violation therefore does NOT surface
      // as exit path 4 (that try starts at the Step 2 banner, AFTER this
      // call) -- it propagates as an un-emitted rejection, exactly as any
      // other unexpected exception upstream of Step 2 always has. This is a
      // deliberately narrower net than "catch everything downstream of
      // owned-apps", not a silent-absorption gap: the module this call
      // reaches into is unit-tested (Plan 01) to never take this branch.
      await expect(manager.refresh()).rejects.toThrow('PICS contract violated')
      expect(steamSyncEmits()).toEqual([{ status: 'syncing' }])
    })
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
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
      // Native scan finds nothing by default in this block — only the bottle
      // root (mocked separately below) has manifests.
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('reports is_installed:true (platform Windows) for a game installed ONLY under the bottle root when isBottleProvisioned() is true', async () => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(getBridgeBottleSettings)
        .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
      jest
        .mocked(getBottleSteamappsDir)
        .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
      // Native scan finds nothing by default — only the bridge root has manifests.
      jest.mocked(getSteamLibraries).mockResolvedValue([])
    })

    afterEach(() => {
      envMock.isMac = false
      envMock.isLinux = true
    })

    it('reports is_installed:true (platform Windows) for a game installed ONLY under the bridge root when listReadyBridgeBottleNames() is non-empty, and STAYS installed across a second refresh (no revert)', async () => {
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
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
      noteRefreshTrigger('steam', 'action-icons-refresh-button')
      await manager.refresh()

      calls = jest.mocked(sendFrontendMessage).mock.calls
      pushed = calls.find(
        ([_msg, info]) => (info as any).app_name === '206040'
      )?.[1] as any

      expect(pushed?.is_installed).toBe(true)
    })

    const armBridgeInstalled = () => {
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
      ;(existsSync as jest.Mock).mockImplementation(
        (path: string) => path === BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
      ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
        dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT
          ? ['appmanifest_206040.acf', 'appmanifest_206041.acf']
          : []
      )
      ;(readFileSync as jest.Mock).mockImplementation((p: string) =>
        String(p).includes('206041') ? 'two' : 'one'
      )
      ;(vdf.parse as jest.Mock).mockImplementation((c: string) => ({
        AppState: {
          appid: c === 'two' ? '206041' : '206040',
          StateFlags: '4',
          installdir: c === 'two' ? 'Game Two' : 'Avernum 5',
          SizeOnDisk: '9000'
        }
      }))
      jest.mocked(steamLibraryStore.get).mockReturnValue([])
    }

    it('Phase 54: a granted refresh backfills launch targets for the installed bridge titles on its held client, once', async () => {
      armBridgeInstalled()
      const fakeClient = makeFakeClient([
        makeOwnedApp(206040, 'Avernum 5', 15),
        makeOwnedApp(206041, 'Game Two', 15)
      ])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).toHaveBeenCalledTimes(1)
      expect(backfillBridgeLaunchTargets).toHaveBeenCalledWith(
        fakeClient,
        expect.arrayContaining(['206040', '206041'])
      )
      expect(
        jest.mocked(backfillBridgeLaunchTargets).mock.calls[0][1]
      ).toHaveLength(2)
    })

    it('Phase 54: an ungranted refresh never backfills', async () => {
      armBridgeInstalled()
      jest.mocked(SteamUser.acquireAuthenticated).mockResolvedValue({
        ok: false,
        reason: 'go-offline-required'
      } as never)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).not.toHaveBeenCalled()
    })

    it('Phase 54: a rejecting backfill leaves the refresh to its single idle terminal emit', async () => {
      armBridgeInstalled()
      jest
        .mocked(backfillBridgeLaunchTargets)
        .mockRejectedValue(new Error('pics down'))
      const fakeClient = makeFakeClient([makeOwnedApp(206040, 'Avernum 5', 15)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(steamSyncEmits()).toEqual([
        { status: 'syncing' },
        { status: 'idle' }
      ])
    })

    it('Phase 54: with no ready bridge bottle the backfill is not called', async () => {
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
      const fakeClient = makeFakeClient([makeOwnedApp(206040, 'Avernum 5', 15)])
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)

      await manager.refresh()

      expect(backfillBridgeLaunchTargets).not.toHaveBeenCalled()
    })

    it('performs NO bridge reconciliation when listReadyBridgeBottleNames() returns [] (byte-for-byte native/bottle-only behavior preserved)', async () => {
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
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
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(listReadyBridgeBottleNames)
        .mockReturnValue(['GameLibSteamBridge'])
      jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
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
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
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
  // markSteamInstallIncomplete — reverting the distinct "Resume Install"
  // affordance back to a bare "Install" (the D-UAT-09 symptom). The flag is
  // now derived durably from the on-disk incomplete (bit-4-unset) manifest,
  // so it survives any number of refreshes.

  describe('SteamLibraryManager.refresh() re-seeds steamResumePending (WR-01)', () => {
    const NATIVE_ROOT = join('/native/steam', 'steamapps')

    beforeEach(() => {
      jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
      jest
        .mocked(getFileSize)
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
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

  // ── 260821-rb5: refresh() must not wipe an install-start breadcrumb ────────
  //
  // Closes case C of aborted-depot-residue todo
  // (.planning/todos/pending/2026-08-16-aborted-depot-residue-has-no-acf.md):
  // a hard-killed native install has no `.acf` at all, so unlike WR-01's
  // bit-4-unset manifest, `buildIncompleteInstallSet` can never see it. The
  // ONLY record of it is the breadcrumb this quick task adds to the
  // in-memory `library` entry (and steamLibraryStore). refresh() rebuilds
  // every GameInfo from ACF + ownership data and unconditionally
  // `library.clear()`s first (library.ts ~L842) — the same wipe shape
  // WR-01/D-UAT-09 already had to fix for the ACF-derived flag, but for a
  // field ACF can never re-derive, so it must be captured from the PRIOR
  // library entry before the clear, not recomputed from disk.
  describe('260821-rb5: refresh() preserves an install-start breadcrumb', () => {
    const BREADCRUMB_APP_ID = '570'
    const TARGET = {
      targetSteamappsDir: '/mock/steam/steamapps',
      installdir: 'Dota 2'
    }

    it('a still-not-installed game (no fully-installed ACF, no incomplete ACF) keeps its steamResumePending breadcrumb through refresh()', async () => {
      // No ACF at all for this appId — buildInstalledMap AND
      // buildIncompleteInstallSet both come back empty (default outer
      // beforeEach: getSteamLibraries → []). This is the load-bearing
      // precondition that distinguishes this from WR-01's ACF-derived case.
      library.set(BREADCRUMB_APP_ID, {
        runner: 'steam',
        app_name: BREADCRUMB_APP_ID,
        title: 'Dota 2',
        is_installed: false,
        install: {
          steamResumePending: true,
          steamResumeTargetSteamappsDir: TARGET.targetSteamappsDir,
          steamResumeInstalldir: TARGET.installdir
        },
        art_cover: '',
        art_square: '',
        extra: { reqs: [] },
        canRunOffline: true,
        installable: true
      } as any)

      const apps = [makeOwnedApp(570, 'Dota 2', 120)]
      const fakeClient = makeFakeClient(apps)
      jest.mocked(SteamUser.getClient).mockReturnValue(fakeClient as any)
      jest.mocked(steamLibraryStore.get).mockReturnValue([])

      await manager.refresh()

      const rebuilt = library.get(BREADCRUMB_APP_ID)
      expect(rebuilt?.install?.steamResumePending).toBe(true)
      expect(rebuilt?.install?.steamResumeTargetSteamappsDir).toBe(
        TARGET.targetSteamappsDir
      )
      expect(rebuilt?.install?.steamResumeInstalldir).toBe(TARGET.installdir)

      const persistedCall = jest
        .mocked(steamLibraryStore.set)
        .mock.calls.find(([key]) => key === 'games')
      const persistedGames = persistedCall?.[1] as any[]
      const persisted = persistedGames?.find(
        (g) => g.app_name === BREADCRUMB_APP_ID
      )
      expect(persisted?.install?.steamResumePending).toBe(true)
      expect(persisted?.install?.steamResumeTargetSteamappsDir).toBe(
        TARGET.targetSteamappsDir
      )
      expect(persisted?.install?.steamResumeInstalldir).toBe(TARGET.installdir)
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
        .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
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
          // (mocked here as `${String(bytes)} B`) — matches legendary/gog/nile contract.
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

    it("D-UAT-13: a game holding for a Steam restart is NOT flipped to installed by the window-focus reconcile (it would show Play, and Play opens Steam's install dialog) — it is once the hold ends", async () => {
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
      jest.mocked(listSteamClientPids).mockResolvedValue([111])
      // GameLib's own finalize just wrote the StateFlags=4 manifest while the
      // Steam client (pid 111) was running: the poller enters the hold.
      startInstallPolling('570', { intervalMs: 60000, isNativeHandoff: true })
      try {
        await pollInstallOnce('570')
        jest.mocked(sendFrontendMessage).mockClear()

        // The user alt-tabs back from Steam: the focus reconcile re-reads the
        // ACF (bit 4 set) but must leave the held game alone.
        await manager.refreshInstallState()
        expect(sendFrontendMessage).not.toHaveBeenCalled()
        expect(library.get('570')?.is_installed).toBe(false)
      } finally {
        stopInstallPolling('570') // hold ends (e.g. released/cap/uninstalled)
      }

      // Control: the identical ACF DOES flip it once nothing is holding it, so
      // the assertion above is not vacuous.
      await manager.refreshInstallState()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'pushGameToLibrary',
        expect.objectContaining({ app_name: '570', is_installed: true })
      )
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
        jest
          .mocked(getBottleSteamappsDir)
          .mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
      })

      afterEach(() => {
        envMock.isMac = false
        envMock.isLinux = true
      })

      it('flips a bottle-installed game to installed (platform Windows) via pushGameToLibrary when isBottleProvisioned() is true', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
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
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
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

      // ── S1-S2: D-17 (34.13-14) install-state non-regression pin ──────────

      it('S1: a forced game reconciles as installed from the BOTTLE map (platform Windows)', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: true,
          is_windows_native: true,
          forcedWindowsViaBottle: true
        })
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

      it('S2: the Phase 24 bridge never becomes authoritative for a forced game, even when allowlisted', async () => {
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        jest.mocked(bridgeAllowlist.has).mockReturnValue(true)
        ;(steamMetadataStore.get as jest.Mock).mockReturnValue({
          platformsCaptured: true,
          is_mac_native: true,
          is_windows_native: true,
          forcedWindowsViaBottle: true
        })
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

        // listReadyBridgeBottleNames() stays [] (default) — the bridge scan is
        // never even attempted, matching an EMPTY bridge map. The persisted
        // forced verdict deliberately does not flow into library.ts's
        // duplicate predicate (isBridgeAuthoritativeForInstallState), which
        // gates on is_mac_native===false and stays false for this
        // mac-native fixture regardless of the flag or the allowlist —
        // mirrors Task 2's isBridgeEligible() pin.
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
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(false)
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

      it('does NOT clobber a bridge-installed game back to is_installed:false (flips to installed, platform Windows) when listReadyBridgeBottleNames() is non-empty', async () => {
        jest
          .mocked(listReadyBridgeBottleNames)
          .mockReturnValue(['GameLibSteamBridge'])
        jest
          .mocked(resolveBridgeBottleName)
          .mockReturnValue('GameLibSteamBridge')
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

      it('performs NO bridge reconciliation when listReadyBridgeBottleNames() returns []', async () => {
        jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
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
        jest.mocked(getBridgeBottleSettings).mockReturnValue({
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
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        jest
          .mocked(listReadyBridgeBottleNames)
          .mockReturnValue(['GameLibSteamBridge'])
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
        jest.mocked(isSteamBottleProvisioned).mockReturnValue(true)
        jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
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
    jest.mocked(finalizeToSteam).mockImplementation(() => {
      order.push('finalize')
      return Promise.resolve()
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

  it('D-05: resumeInterruptedSteamInstall() never dispatches to Steam/CrossOver (shell.openExternal / runWineCommand — folded-todo regression guard)', async () => {
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

      const file = {
        filename: 'game.bin',
        size: 10,
        sha_content: 'x',
        chunks: []
      }
      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [
          {
            depotId: '111',
            gid: '9007199254740993',
            key: Buffer.from('key'),
            files: [file]
          }
        ],
        totalBytes: 10
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      jest
        .mocked(reconcilePartialState)
        .mockResolvedValue({ jobs: [], allFilesVerified: true } as never)

      const realFinalizeToSteam =
        jest.requireActual<typeof import('../depot')>(
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
          {
            depotId: '111',
            gid: '9007199254740993',
            key: Buffer.from('key'),
            files: [file]
          }
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

      const realFinalizeToSteam =
        jest.requireActual<typeof import('../depot')>(
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
          {
            depotId: '111',
            gid: '9007199254740993',
            key: Buffer.from('key'),
            files: [file]
          }
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

      const realFinalizeToSteam =
        jest.requireActual<typeof import('../depot')>(
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

      const file = {
        filename: 'missing.bin',
        size: 10,
        sha_content: 'x',
        chunks: []
      }
      const plan = {
        appId: '730',
        name: 'CS:GO',
        buildid: '9044149',
        depots: [
          {
            depotId: '111',
            gid: '9007199254740993',
            key: Buffer.from('key'),
            files: [file]
          }
        ],
        totalBytes: 10
      }
      jest.mocked(buildDepotPlan).mockResolvedValue(plan as never)
      jest.mocked(reconcilePartialState).mockResolvedValue({
        jobs: [{ depotId: '111', key: Buffer.from('key'), file, fileSeed: 0 }],
        allFilesVerified: false
      } as never)

      const realFinalizeToSteam =
        jest.requireActual<typeof import('../depot')>(
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

    it('WR-03/D-02/D-04 (23-code-review): a hostile installdir read off the on-disk ACF degrades the resume to the honest-empty 1026 fallback — REWRITTEN from the old "sanitized to a safe fallback name, then still planned" assertion, which is wrong under D-04 (a containment/denylist violation is a security event, not a value to silently launder into buildDepotPlan); it never reaches buildDepotPlan/resolve() unsanitized, and buildResumeFinalizeOpts still never throws (its own NEVER-throws contract), degrading exactly like a planning failure does', async () => {
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

      // sanitizeInstalldir throws UnsafeInstalldirError before buildDepotPlan
      // is ever called with the hostile value — buildResumeFinalizeOpts's
      // dedicated guard catches it and degrades to the SAME honest-empty
      // `depots: []` shape a planning failure produces (never launders
      // '../evil' into buildDepotPlan, never crashes resumeInterruptedSteamInstall).
      expect(buildDepotPlan).not.toHaveBeenCalled()
      expect(finalizeToSteam).toHaveBeenCalledWith(
        '730',
        expect.objectContaining({
          targetSteamappsDir: join(tmp, 'steamapps'),
          installdir: 'app_730',
          depots: []
        })
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

// ── GAME-05: readRunningAppId() — per-platform dispatch ───────────────────────

describe('readRunningAppId() — per-platform dispatch', () => {
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
        stdout:
          'ERROR: The system was unable to find the specified registry key'
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
