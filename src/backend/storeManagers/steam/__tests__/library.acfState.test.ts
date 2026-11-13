/**
 * Unit tests for steam/library/acfState.ts (ACF reads, install-copy
 * enumeration/removal, downloading scan). Moved out of library.test.ts by
 * Phase 65 plan 03 (D-03); mock preamble copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { AcfRecord, ScanResult } from '../localFiles/steamFilesTypes'
import { createEngineRegistry } from 'backend/engine/engineRegistry'
import {
  findOtherManifestsWithInstalldir,
  readAcfState,
  scanDownloadingAppIds
} from '../library/acfState'
import { createTestSteamSession } from 'backend/testUtils/testSteamSession'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  vdf,
  mockedFsSteamFiles
} from '../localFiles/__tests__/fixtures/mockedFsSteamFiles'
import { getSteamLibraries } from 'backend/utils'
import { t as i18nextT } from 'i18next'
import { backfillBridgeLaunchTargets } from '../bridge/launchTarget'
import { getBottleSteamappsDir } from '../bottle'
import {
  getBridgeBottleSettings,
  listReadyBridgeBottleNames
} from '../bridgeBottle'
import { join } from 'path'

import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestSteamLaunchRuntime } from 'backend/testUtils/testSteamLaunchRuntime'

/** The config slice the Steam library lookups read; getSteamLibraries is mocked here. */
// The boot-owned Steam library state the scan reads (D-66.3-13): one instance for this file.
const steamSession = createTestSteamSession()
const library = steamSession.libraryState.library
// 66.3-15: the bottle settings are read through the deps slice, so they are a plain mock here.
const getSteamBottleSettings = jest.fn()
const libDeps = {
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  config: createTestGlobalConfig(),
  steamSession,
  steamBottle: { getSteamBottleSettings, resolveCrossoverWine: jest.fn() },
  paths: { userHome: '/test-gamelib/home' },
  engineRuntime: { registry: createEngineRegistry() },
  steamLaunchRuntime: createTestSteamLaunchRuntime()
}

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
  logDebug: jest.fn(),
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

// Phase 75: removed with the flag in plan 34
const priorSteamFilesText = process.env.GAMELIB_STEAMFILES_TEXT
process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
afterAll(() => {
  if (priorSteamFilesText === undefined)
    delete process.env.GAMELIB_STEAMFILES_TEXT
  else process.env.GAMELIB_STEAMFILES_TEXT = priorSteamFilesText
})

// ── dialog/dialog mock — notify (GAME-02/03: poller fires confirmed toast) ───
jest.mock('../../../dialog/dialog', () => ({
  notify: jest
    .requireActual('backend/testUtils/propsOnlyMock')
    .propsOnly(jest.fn())
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
  isSteamBottleProvisioned: jest.fn()
}))
jest.mock('../bridgeBottle', () => ({
  createDrmBridgeRunners: () => ({}),
  getBridgeBottleSettings: jest.fn(),
  listReadyBridgeBottleNames: jest.fn(),
  resolveBridgeBottleName: jest.fn()
}))

// ── depot mock — finalizeToSteam (D-05 startup finalize) / downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download) ─
jest.mock('../depot', () => ({
  finalizeToSteam: jest.fn().mockResolvedValue(undefined),
  downloadSteamDepots: jest.fn()
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
jest.mock('../bridge/launchTarget', () => ({
  backfillBridgeLaunchTargets: jest.fn()
}))
jest.mock('../platformCapture', () => ({
  createPlatformCaptureQueue: () => ({}),
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

// ── D-07: readAcfState(libDeps) ─────────────────────────────────────────────────────

describe('readAcfState(libDeps)', () => {
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
    const result = await readAcfState(libDeps, '730')
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
    const result = await readAcfState(libDeps, '730')
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
    const result = await readAcfState(libDeps, '730')
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
    const result = await readAcfState(libDeps, '730')
    expect(result.bytesDownloaded).toBe(0)
    expect(result.bytesToDownload).toBe(0)
    expect(result.bytesStaged).toBe(0)
    expect(result.bytesToStage).toBe(0)
  })

  it('returns state:"absent" when no manifest file is found for the appId', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)
    const result = await readAcfState(libDeps, '730')
    expect(result.state).toBe('absent')
  })

  it('skips a corrupt ACF and returns state:"absent" (T-2-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })
    const result = await readAcfState(libDeps, '730')
    expect(result.state).toBe('absent')
  })
})

// ── D-05/D-15: regression-guard the "poller unchanged" claim ──────────────────
// Locks in RESEARCH Pattern 4/Pitfall 4's "already works unmodified" finding —
// readAcfState/pollInstallOnce/startInstallPolling are NEVER touched by this
// plan; these tests feed a GameLib-shaped manifest (exactly writeAppManifest's
// field set — depot/manifest.ts) through the UNCHANGED read side and lock the
// round-trip so a future change can't silently break D-05/D-15 reuse.

describe('readAcfState(libDeps) — D-05/D-15 regression: GameLib-written manifest round-trip', () => {
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
    const result = await readAcfState(libDeps, '730')
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
    const result = await readAcfState(libDeps, '730')
    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'csgo')
    )
  })
})

// ── 17-03: readAcfState(libDeps, 'bottle') — bottle-scoped ACF scan, never conflated ───

describe('readAcfState(libDeps, appId, "bottle") — bottle-scoped ACF root', () => {
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

    const result = await readAcfState(libDeps, '730', 'bottle')

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
      (path: string) =>
        path === '/steam' || path === join('/steam', 'steamapps')
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

    const result = await readAcfState(libDeps, '730', 'bottle')

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

    const result = await readAcfState(libDeps, '730', 'bottle')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join(WIN32_BOTTLE_STEAMAPPS_ROOT, 'common', 'csgo')
    )
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('existing native readAcfState(libDeps, appId) behavior is unchanged when no source arg is passed (same fixture, same result)', async () => {
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

    const result = await readAcfState(libDeps, '730')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join('/steam', 'steamapps', 'common', 'csgo')
    )
    // Native scan must never consult the bottle path resolver
    expect(getBottleSteamappsDir).not.toHaveBeenCalled()
  })
})

// ── D-UAT-24-05 (24-12): readAcfState(libDeps, 'bridge') — bridge-bottle-scoped ACF
// root, distinct from both 'native' and the Phase 17 'bottle' root ─────────

describe('readAcfState(libDeps, appId, "bridge") — bridge-bottle-scoped ACF root', () => {
  beforeEach(() => {
    jest
      .mocked(getBridgeBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteamBridge' } as any)
    // Distinguish by bottle name so a test can mock BOTH getSteamBottleSettings
    // (Phase 17 'bottle') and getBridgeBottleSettings ('bridge') at once
    // without one root's mocked value clobbering the other's.
    jest
      .mocked(getBottleSteamappsDir)
      .mockImplementation((_paths: unknown, bottleName: string) =>
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

    const result = await readAcfState(libDeps, '206040', 'bridge')

    expect(result.state).toBe('installed')
    expect(result.installPath).toBe(
      join(BRIDGE_BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 5')
    )
    // Bridge scan must never consult the native library-path resolver
    expect(getSteamLibraries).not.toHaveBeenCalled()
    // quick/261016-u1w (D-B threading): the bridge root resolver now threads
    // the appId through to getBridgeBottleSettings, so a per-game bridge
    // bottle can be resolved instead of always the shared legacy name.
    expect(getBridgeBottleSettings).toHaveBeenCalledWith(
      expect.anything(),
      '206040'
    )
  })

  it('returns state:"absent" when the bridge bottle steamapps dir does not exist (no throw)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = await readAcfState(libDeps, '206040', 'bridge')

    expect(result.state).toBe('absent')
  })

  it('returns state:"absent" for an ACF present only in the native root — proves no conflation with "native"', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockImplementation(
      (path: string) =>
        path === '/steam' || path === join('/steam', 'steamapps')
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

    const result = await readAcfState(libDeps, '730', 'bridge')

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
    const nativeResult = await readAcfState(libDeps, '206040', 'native')
    expect(nativeResult.state).toBe('absent')

    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    const bottleResult = await readAcfState(libDeps, '206040', 'bottle')
    expect(bottleResult.state).toBe('absent')
  })
})

// ── 34.13 review A-13: findOtherManifestsWithInstalldir() ────────────────────
//
// uninstallBottleGameDirectly's JSDoc used to call over-deleting
// "structurally impossible rather than runtime-checked". True for the
// SharedDepots shape its real-filesystem test proves; false for the shape the
// argument assumed away — two installed appIds declaring the SAME installdir.
// This is the runtime check that makes the (now narrowed) claim true.

describe('findOtherManifestsWithInstalldir() (34.13 review A-13)', () => {
  const STEAMAPPS = '/bottle/steamapps'

  it('returns [] when the steamapps dir does not exist', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)
    expect(
      await findOtherManifestsWithInstalldir(
        libDeps,
        STEAMAPPS,
        'Hoard',
        '63000'
      )
    ).toEqual([])
  })

  it('finds another appId declaring the SAME installdir', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_63000.acf',
      'appmanifest_228980.acf'
    ])
    ;(readFileSync as jest.Mock).mockImplementation((path: string) =>
      String(path).includes('228980') ? 'other' : 'self'
    )
    ;(vdf.parse as jest.Mock).mockImplementation((content: string) =>
      content === 'other'
        ? { AppState: { appid: '228980', installdir: 'Hoard' } }
        : { AppState: { appid: '63000', installdir: 'Hoard' } }
    )

    expect(
      await findOtherManifestsWithInstalldir(
        libDeps,
        STEAMAPPS,
        'Hoard',
        '63000'
      )
    ).toEqual(['228980'])
  })

  it('DISCRIMINATOR: a SIBLING installdir (the SharedDepots shape) is not a conflict', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'appmanifest_63000.acf',
      'appmanifest_228980.acf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('x')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: {
        appid: '228980',
        installdir: 'Steamworks Common Redistributables'
      }
    })

    expect(
      await findOtherManifestsWithInstalldir(
        libDeps,
        STEAMAPPS,
        'Hoard',
        '63000'
      )
    ).toEqual([])
  })

  it('never reports THIS appId as its own conflict', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_63000.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('x')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '63000', installdir: 'Hoard' }
    })

    expect(
      await findOtherManifestsWithInstalldir(
        libDeps,
        STEAMAPPS,
        'Hoard',
        '63000'
      )
    ).toEqual([])
  })

  it('skips a corrupt ACF without throwing (T-2-01/T-17-05)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_228980.acf'])
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })

    await expect(
      findOtherManifestsWithInstalldir(libDeps, STEAMAPPS, 'Hoard', '63000')
    ).resolves.toBeDefined()
    expect(
      await findOtherManifestsWithInstalldir(
        libDeps,
        STEAMAPPS,
        'Hoard',
        '63000'
      )
    ).toEqual([])
  })

  it('ignores non-manifest files in the directory', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue([
      'common',
      'downloading',
      'libraryfolders.vdf'
    ])
    ;(readFileSync as jest.Mock).mockReturnValue('x')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { appid: '228980', installdir: 'Hoard' }
    })

    expect(
      await findOtherManifestsWithInstalldir(
        libDeps,
        STEAMAPPS,
        'Hoard',
        '63000'
      )
    ).toEqual([])
    expect(readFileSync).not.toHaveBeenCalled()
  })
})

// ── D-07: scanDownloadingAppIds(libDeps) ────────────────────────────────────────────

describe('scanDownloadingAppIds(libDeps)', () => {
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
    const result = await scanDownloadingAppIds(libDeps)
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
    const result = await scanDownloadingAppIds(libDeps)
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
    const result = await scanDownloadingAppIds(libDeps)
    expect(result).not.toContain('730')
  })
})

// ── Phase 75-15: rust branch (GAMELIB_STEAMFILES_TEXT=rust) ───────────────────
// The wrappers are driven by programmed steamfiles results (stubRustSteamFiles); real parsing is
// proven by the crate tests and libraryReplay.test.ts.

function acfRecord(over: Partial<AcfRecord>): AcfRecord {
  return {
    appid: null,
    name: null,
    installdir: null,
    stateFlags: null,
    stateFlagsRaw: null,
    sizeOnDisk: null,
    buildid: null,
    lastOwner: null,
    bytesDownloaded: null,
    bytesToDownload: null,
    bytesStaged: null,
    bytesToStage: null,
    targetBuildId: null,
    scheduledAutoUpdate: null,
    betaKey: null,
    installedDepots: [],
    ...over
  }
}

function scanOf(
  records: { dir: string; rec: Partial<AcfRecord> }[],
  skipped: ScanResult['skipped'] = []
): ScanResult {
  return {
    records: records.map(({ dir, rec }, i) => ({
      steamappsDir: dir,
      fileName: `appmanifest_${i}.acf`,
      record: acfRecord(rec)
    })),
    skipped,
    missingDirs: []
  }
}

function useRustBranch() {
  const prior = process.env.GAMELIB_STEAMFILES_TEXT
  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
  })
  afterEach(() => {
    if (prior === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = prior
  })
}

describe('readAcfState and scanDownloadingAppIds, rust branch', () => {
  useRustBranch()

  const found = (rec: Partial<AcfRecord>, dir = '/steam/steamapps') => ({
    found: true,
    steamappsDir: dir,
    record: acfRecord(rec)
  })

  beforeEach(() => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam', '/missing'])
    ;(existsSync as jest.Mock).mockImplementation(
      (p: string) => !p.startsWith('/missing')
    )
  })

  it('reports installed with the install path under the dir the record was found in', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_find_acf: () =>
        found({
          appid: '730',
          stateFlags: 4,
          installdir: 'csgo',
          sizeOnDisk: '9000'
        })
    })

    const result = await readAcfState({ ...libDeps, ...stub }, '730')

    expect(result).toEqual({
      state: 'installed',
      stateFlags: 4,
      installPath: join('/steam/steamapps', 'common', 'csgo'),
      sizeOnDisk: '9000'
    })
    // One call per poll tick, over the dirs that exist.
    expect(stub.calls).toEqual([
      {
        channel: 'steamfiles_find_acf',
        args: { steamappsDirs: ['/steam/steamapps'], appId: '730' }
      }
    ])
  })

  it('reports downloading with numeric byte counters, defaulting non-numeric to 0', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_find_acf: () =>
        found({
          appid: '730',
          stateFlags: 1026,
          bytesDownloaded: '500',
          bytesToDownload: '1000',
          bytesStaged: 'junk',
          bytesToStage: null
        })
    })

    expect(await readAcfState({ ...libDeps, ...stub }, '730')).toEqual({
      state: 'downloading',
      stateFlags: 1026,
      bytesDownloaded: 500,
      bytesToDownload: 1000,
      bytesStaged: 0,
      bytesToStage: 0
    })
  })

  it('reports absent when nothing is found, and when the invoke rejects', async () => {
    const none = stubRustSteamFiles({
      steamfiles_find_acf: () => ({
        found: false,
        steamappsDir: null,
        record: null
      })
    })
    expect(await readAcfState({ ...libDeps, ...none }, '1')).toEqual({
      state: 'absent'
    })

    const rejecting = stubRustSteamFiles({})
    expect(await readAcfState({ ...libDeps, ...rejecting }, '1')).toEqual({
      state: 'absent'
    })
  })

  it('scanDownloadingAppIds makes one scan call and keeps bit-4-unset appIds present in the library map', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanOf(
          [
            { dir: '/steam/steamapps', rec: { appid: '10', stateFlags: 1026 } },
            { dir: '/steam/steamapps', rec: { appid: '20', stateFlags: 4 } },
            { dir: '/steam/steamapps', rec: { appid: '30', stateFlags: 2 } },
            { dir: '/steam/steamapps', rec: { appid: 'x', stateFlags: 2 } },
            { dir: '/steam/steamapps', rec: { appid: '40', stateFlags: null } }
          ],
          [
            {
              steamappsDir: '/steam/steamapps',
              fileName: 'appmanifest_9.acf',
              reason: 'corrupt'
            }
          ]
        )
    })
    const deps = {
      ...libDeps,
      ...stub,
      steamSession: {
        libraryState: {
          library: new Map([
            ['10', {}],
            ['20', {}],
            ['40', {}]
          ])
        }
      }
    } as never

    expect(await scanDownloadingAppIds(deps)).toEqual(['10'])
    expect(stub.calls).toHaveLength(1)
  })

  it('scanDownloadingAppIds returns an empty list when the invoke rejects', async () => {
    const deps = {
      ...libDeps,
      ...stubRustSteamFiles({}),
      steamSession: { libraryState: { library: new Map() } }
    } as never

    expect(await scanDownloadingAppIds(deps)).toEqual([])
  })
})

describe('findOtherManifestsWithInstalldir, rust branch', () => {
  useRustBranch()
  const DIR = '/lib/steamapps'

  const scanWith = (
    recs: { file: string; rec: Partial<AcfRecord> }[]
  ): ScanResult => ({
    records: recs.map(({ file, rec }) => ({
      steamappsDir: DIR,
      fileName: file,
      record: acfRecord(rec)
    })),
    skipped: [
      { steamappsDir: DIR, fileName: 'appmanifest_9.acf', reason: 'corrupt' }
    ],
    missingDirs: []
  })

  it('makes one scan call for the dir and reports other appIds sharing the installdir', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanWith([
          {
            file: 'appmanifest_63000.acf',
            rec: { appid: '63000', installdir: 'Hoard' }
          },
          {
            file: 'appmanifest_228980.acf',
            rec: { appid: '228980', installdir: 'Hoard' }
          },
          {
            file: 'appmanifest_5.acf',
            rec: { appid: '5', installdir: 'hoard' }
          },
          {
            file: 'appmanifest_6.acf',
            rec: { appid: '6', installdir: 'Other' }
          }
        ])
    })
    expect(
      await findOtherManifestsWithInstalldir(stub, DIR, 'Hoard', '63000')
    ).toEqual(['228980'])
    expect(stub.calls).toEqual([
      { channel: 'steamfiles_scan_acfs', args: { steamappsDirs: [DIR] } }
    ])
  })

  it('skips its own manifest file and records without an appid', async () => {
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanWith([
          {
            file: 'appmanifest_63000.acf',
            rec: { appid: '63000', installdir: 'Hoard' }
          },
          {
            file: 'appmanifest_7.acf',
            rec: { appid: null, installdir: 'Hoard' }
          }
        ])
    })
    expect(
      await findOtherManifestsWithInstalldir(stub, DIR, 'Hoard', '63000')
    ).toEqual([])
  })

  it('returns the conflicting sentinel when the invoke rejects (T-75-55)', async () => {
    const stub = stubRustSteamFiles({})
    expect(
      await findOtherManifestsWithInstalldir(stub, DIR, 'Hoard', '63000')
    ).toEqual(['<unknown>'])
  })
})
