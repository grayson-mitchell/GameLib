/**
 * Unit tests for steam/library/installRoot.ts (resolveInstallRoot, hostInstallPlatform).
 * Moved out of library.test.ts by Phase 65 plan 02 (D-03); mock preamble copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import SteamLibraryManager from '../library'
import { resolveInstallRoot } from '../library/installRoot'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import * as vdf from '@node-steam/vdf'
import { getSteamLibraries, getFileSize } from 'backend/utils'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { steamLibraryStore, steamMetadataStore } from '../stores'
import { getBottleSteamappsDir, getSteamBottleSettings } from '../bottle'
import { listReadyBridgeBottleNames } from '../bridgeBottle'
import { join } from 'path'
import { library } from '../state'

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
  isSteamBottleProvisioned: jest.fn()
}))
jest.mock('../bridgeBottle', () => ({
  getBridgeBottleSettings: jest.fn(),
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

// ── Shared fixtures ───────────────────────────────────────────────────────────

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

// ── debug/steam-bottle-uninstall-reverts (OPERATOR PRODUCT DECISION, LOCKED):
// resolveInstallRoot() — the SOLE source of truth games.ts's uninstall()
// consults for bottle-vs-native-vs-refuse routing. ──────────────────────────

describe('resolveInstallRoot() (debug/steam-bottle-uninstall-reverts, OPERATOR DECISION LOCKED)', () => {
  let envMock: any

  beforeEach(() => {
    envMock = jest.requireMock('backend/constants/environment')
    envMock.isMac = true
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
  })

  afterEach(() => {
    envMock.isMac = false
  })

  it('returns "bottle" for an install_path inside the bottle steamapps/common/', async () => {
    const installPath = join(BOTTLE_STEAMAPPS_ROOT, 'common', 'Hoard')
    await expect(resolveInstallRoot(installPath)).resolves.toBe('bottle')
  })

  it('returns "native" for an install_path inside a registered native library steamapps/common/', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    const installPath = join('/steam', 'steamapps', 'common', 'CS:GO')
    await expect(resolveInstallRoot(installPath)).resolves.toBe('native')
  })

  it('checks EVERY registered native library root, not just the first', async () => {
    jest
      .mocked(getSteamLibraries)
      .mockResolvedValue(['/steam-primary', '/mnt/second-drive/SteamLibrary'])
    const installPath = join(
      '/mnt/second-drive/SteamLibrary',
      'steamapps',
      'common',
      'CS:GO'
    )
    await expect(resolveInstallRoot(installPath)).resolves.toBe('native')
  })

  it('returns null for a stale/empty install_path — never falls through to a root', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    await expect(resolveInstallRoot(undefined)).resolves.toBeNull()
    await expect(resolveInstallRoot('')).resolves.toBeNull()
    await expect(resolveInstallRoot('   ')).resolves.toBeNull()
  })

  it('returns null for an install_path resolving OUTSIDE every known root (bottle AND all native libraries)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    await expect(
      resolveInstallRoot('/completely/unrelated/place/Game')
    ).resolves.toBeNull()
  })

  it('never treats the bottle/native common/ root itself as "contained" (no installdir segment)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    await expect(
      resolveInstallRoot(join(BOTTLE_STEAMAPPS_ROOT, 'common'))
    ).resolves.toBeNull()
  })

  it('rejects a traversal attempt disguised as a bottle-common child ("path.join is not containment", Phase 18)', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    const traversal = join(
      BOTTLE_STEAMAPPS_ROOT,
      'common',
      '..',
      '..',
      'etc',
      'passwd'
    )
    await expect(resolveInstallRoot(traversal)).resolves.toBeNull()
  })

  it('never consults the bottle root at all on a non-mac host — a bottle-shaped path still resolves null there', async () => {
    envMock.isMac = false
    jest.mocked(getSteamLibraries).mockResolvedValue([])
    const installPath = join(BOTTLE_STEAMAPPS_ROOT, 'common', 'Hoard')
    await expect(resolveInstallRoot(installPath)).resolves.toBeNull()
    expect(getSteamBottleSettings).not.toHaveBeenCalled()
  })
})

// ── DETAIL-01 GAP2: hostInstallPlatform() — install.platform reflects host OS ──
//
// Verifies that the module-private hostInstallPlatform() helper in library.ts
// returns the correct InstallPlatform for each OS, observable through
// refreshInstallState() → install.platform on the resulting library entry.
// Pattern: same envMock flipping used by readRunningAppId() describe (L1122-1261).

describe('hostInstallPlatform() via refreshInstallState() — install.platform reflects host OS (DETAIL-01 GAP2)', () => {
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
      .mockImplementation((bytes: unknown) => `${String(bytes)} B`)
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
