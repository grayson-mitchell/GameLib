/**
 * Unit tests for steam/library/installedMap.ts (installed-map builders).
 * Moved out of library.test.ts by Phase 65 plan 02 (D-03); mock preamble copied.
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import { createEngineRegistry } from 'backend/engine/engineRegistry'
import { readAcfState } from '../library/acfState'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { AcfRecord, ScanResult } from '../localFiles/steamFilesTypes'
import {
  buildInstalledMap,
  buildBottleInstalledMap,
  buildBridgeInstalledMap,
  buildIncompleteInstallSet,
  isFullyInstalledStateFlags
} from '../library/installedMap'
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
  listReadyBridgeBottleNames,
  resolveBridgeBottleName
} from '../bridgeBottle'
import { join } from 'path'

import { createTestGlobalConfig } from 'backend/testUtils/testConfig'
import { createTestSteamLaunchRuntime } from 'backend/testUtils/testSteamLaunchRuntime'

/** The config slice the Steam library lookups read; getSteamLibraries is mocked here. */
// 66.3-15: the bottle settings are read through the deps slice, so they are a plain mock here.
const getSteamBottleSettings = jest.fn()
const libDeps = {
  requestRustInvoke: mockedFsSteamFiles().requestRustInvoke,
  config: createTestGlobalConfig(),
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

// ── depot mock — downloadSteamDepots
// (must NEVER be invoked from startup resume — Pitfall 4, no silent re-download) ─
jest.mock('../depot', () => ({
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
 * Bridge bottle steamapps root used across the 'bridge' source tests
 * (D-UAT-24-05). Distinct bottle name (GameLibSteamBridge) from the Phase 17
 * bottle (GameLibSteam) — proves the two bottle roots are never conflated.
 */
const BRIDGE_BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteamBridge',
  'drive_c/Program Files (x86)/Steam/steamapps'
)

/**
 * A per-game bridge bottle's steamapps root (quick/261016-u1w, D-C) — distinct
 * from both the Phase 17 bottle and the legacy shared bridge bottle above, so
 * tests can prove buildBridgeInstalledMap(testPaths, libDeps) scans a per-game bottle under its
 * own name rather than conflating it with the legacy bridge root.
 */
const PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT = join(
  '/Users/tester/Library/Application Support/CrossOver/Bottles',
  'GameLibSteamBridge-206060',
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

// ── D-UAT-09 (21-17): isFullyInstalledStateFlags() + detector regression lock ─

const testPaths = { userHome: '/test-home' }

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
    vdf.parse
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

    const result = await buildInstalledMap(libDeps)

    expect(result.has(100)).toBe(false)
    expect(result.has(200)).toBe(true)
  })

  it('Test B: readAcfState returns "downloading" for a 1026 fixture and "installed" for a 4 fixture', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/steam'])
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '100',
        StateFlags: '1026',
        installdir: 'incomplete-game',
        SizeOnDisk: '0'
      }
    })

    const incomplete = await readAcfState(libDeps, '100')
    expect(incomplete.state).toBe('downloading')
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '200',
        StateFlags: '4',
        installdir: 'complete-game',
        SizeOnDisk: '500'
      }
    })

    const complete = await readAcfState(libDeps, '200')
    expect(complete.state).toBe('installed')
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

    const result = await buildBottleInstalledMap(libDeps)

    expect(result.size).toBe(0)
  })

  it('marks a bottle-installed appId (StateFlags bit 4 set), rooted at the bottle steamapps dir', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_730.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '730',
        StateFlags: '4',
        installdir: 'csgo',
        SizeOnDisk: '9000'
      }
    })

    const result = await buildBottleInstalledMap(libDeps)

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

    const result = await buildBottleInstalledMap(libDeps)

    expect(result.size).toBe(0)
  })
})

// ── D-UAT-24-07 (24-16), quick/261016-u1w (D-C) ───────────────────────────────
// Bridge-bottle-scoped sibling of buildBottleInstalledMap() — scans EVERY
// ready bridge bottle (the legacy shared GameLibSteamBridge, plus any
// per-game GameLibSteamBridge-<appId> bottle) via listReadyBridgeBottleNames(),
// attributing each manifest to its resolveBridgeBottleName() owner, so a
// bridge-installed game's badge survives the periodic library sync and focus
// reconciliation regardless of which bottle it actually lives in.

describe('buildBridgeInstalledMap(testPaths, libDeps)', () => {
  beforeEach(() => {
    // quick/261016-u1w (D-C): buildBridgeInstalledMap(testPaths, libDeps) no longer resolves a
    // single settings object — it loops over listReadyBridgeBottleNames() and
    // resolves each name's steamapps dir directly via getBottleSteamappsDir.
    jest
      .mocked(listReadyBridgeBottleNames)
      .mockReturnValue(['GameLibSteamBridge'])
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(BRIDGE_BOTTLE_STEAMAPPS_ROOT)
    jest.mocked(resolveBridgeBottleName).mockReturnValue('GameLibSteamBridge')
  })

  it('(i) returns an empty Map when there are no ready bottles, and never calls readdirSync', async () => {
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.size).toBe(0)
    expect(readdirSync).not.toHaveBeenCalled()
  })

  it('returns an empty Map when the bridge bottle steamapps dir does not exist', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.size).toBe(0)
  })

  it('marks a bridge-installed appId (StateFlags bit 4 set), rooted at the bridge bottle steamapps dir', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '206040',
        StateFlags: '4',
        installdir: 'Avernum 5',
        SizeOnDisk: '9000'
      }
    })

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.has(206040)).toBe(true)
    expect(result.get(206040)?.installPath).toBe(
      join(BRIDGE_BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 5')
    )
    // Bridge map build must never consult the native library-path resolver
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('(ii) scans every ready bottle — legacy holding 206040 (resolver -> legacy) and a per-game bottle holding 206060 (resolver -> per-game) both appear, each rooted at its own steamapps/common', async () => {
    jest
      .mocked(listReadyBridgeBottleNames)
      .mockReturnValue(['GameLibSteamBridge', 'GameLibSteamBridge-206060'])
    jest
      .mocked(getBottleSteamappsDir)
      .mockImplementation((_paths: unknown, name: string) =>
        name === 'GameLibSteamBridge-206060'
          ? PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT
          : BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
    jest
      .mocked(resolveBridgeBottleName)
      .mockImplementation((_paths: unknown, appId: string) =>
        appId === '206060' ? 'GameLibSteamBridge-206060' : 'GameLibSteamBridge'
      )
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
      dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT
        ? ['appmanifest_206040.acf']
        : dir === PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT
          ? ['appmanifest_206060.acf']
          : []
    )
    ;(readFileSync as jest.Mock).mockImplementation((file: string) =>
      file.includes('206040') ? 'legacy-manifest' : 'per-game-manifest'
    )
    vdf.parse.mockImplementation((content: string) =>
      content === 'legacy-manifest'
        ? {
            AppState: {
              appid: '206040',
              StateFlags: '4',
              installdir: 'Avernum 5',
              SizeOnDisk: '9000'
            }
          }
        : {
            AppState: {
              appid: '206060',
              StateFlags: '4',
              installdir: 'Avernum 6',
              SizeOnDisk: '123456'
            }
          }
    )

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.has(206040)).toBe(true)
    expect(result.get(206040)?.installPath).toBe(
      join(BRIDGE_BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 5')
    )
    expect(result.has(206060)).toBe(true)
    expect(result.get(206060)?.installPath).toBe(
      join(PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT, 'common', 'Avernum 6')
    )
  })

  it('(iii) a per-game bottle holding a different appId manifest than its own does not contribute it', async () => {
    jest
      .mocked(listReadyBridgeBottleNames)
      .mockReturnValue(['GameLibSteamBridge-206060'])
    jest
      .mocked(getBottleSteamappsDir)
      .mockReturnValue(PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT)
    // resolveBridgeBottleName(206040) resolves to the OTHER per-game bottle,
    // not this one -- so even though this bottle's dir happens to hold a
    // 206040 manifest, it must not be attributed to this bottle.
    jest
      .mocked(resolveBridgeBottleName)
      .mockReturnValue('GameLibSteamBridge-206040')
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    vdf.parse.mockReturnValue({
      AppState: {
        appid: '206040',
        StateFlags: '4',
        installdir: 'Avernum 5',
        SizeOnDisk: '9000'
      }
    })

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.size).toBe(0)
  })

  it('(iv) a legacy manifest for an appId whose resolver answer is its per-game bottle is ignored, and the per-game entry wins', async () => {
    jest
      .mocked(listReadyBridgeBottleNames)
      .mockReturnValue(['GameLibSteamBridge', 'GameLibSteamBridge-206040'])
    jest
      .mocked(getBottleSteamappsDir)
      .mockImplementation((_paths: unknown, name: string) =>
        name === 'GameLibSteamBridge-206040'
          ? PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT
          : BRIDGE_BOTTLE_STEAMAPPS_ROOT
      )
    // The resolver says 206040 belongs to its per-game bottle -- so the
    // legacy bottle's own manifest for 206040 must be ignored.
    jest
      .mocked(resolveBridgeBottleName)
      .mockReturnValue('GameLibSteamBridge-206040')
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockImplementation((dir: string) =>
      dir === BRIDGE_BOTTLE_STEAMAPPS_ROOT
        ? ['appmanifest_206040.acf']
        : dir === PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT
          ? ['appmanifest_206040.acf']
          : []
    )
    ;(readFileSync as jest.Mock).mockImplementation((file: string) =>
      file.includes(PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT)
        ? 'per-game-manifest'
        : 'legacy-manifest'
    )
    vdf.parse.mockImplementation((content: string) =>
      content === 'legacy-manifest'
        ? {
            AppState: {
              appid: '206040',
              StateFlags: '4',
              installdir: 'Legacy Install Dir',
              SizeOnDisk: '1'
            }
          }
        : {
            AppState: {
              appid: '206040',
              StateFlags: '4',
              installdir: 'Per-Game Install Dir',
              SizeOnDisk: '9000'
            }
          }
    )

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.has(206040)).toBe(true)
    expect(result.get(206040)?.installPath).toBe(
      join(
        PER_GAME_BRIDGE_BOTTLE_STEAMAPPS_ROOT,
        'common',
        'Per-Game Install Dir'
      )
    )
  })

  it('(v) skips a corrupt bridge ACF file without throwing (T-2-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readdirSync as jest.Mock).mockReturnValue(['appmanifest_206040.acf'])
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt file')
    })

    const result = await buildBridgeInstalledMap(testPaths, libDeps)

    expect(result.size).toBe(0)
  })
})

// ── Phase 75-15: rust readers ───────────────────
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

function useRustBranch() {}

describe('installed-map builders, rust branch', () => {
  useRustBranch()

  it('buildInstalledMap makes one scan call over every library and keeps last-wins for a repeated appid', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/a', '/b'])
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanOf(
          [
            {
              dir: '/a/steamapps',
              rec: {
                appid: '10',
                stateFlags: 4,
                installdir: 'First',
                sizeOnDisk: '1'
              }
            },
            {
              dir: '/b/steamapps',
              rec: {
                appid: '10',
                stateFlags: 4,
                installdir: 'Second',
                sizeOnDisk: '2'
              }
            },
            { dir: '/a/steamapps', rec: { appid: '20', stateFlags: 1026 } },
            { dir: '/a/steamapps', rec: { appid: null, stateFlags: 4 } },
            { dir: '/a/steamapps', rec: { appid: '30', stateFlags: 4 } }
          ],
          [
            {
              steamappsDir: '/a/steamapps',
              fileName: 'appmanifest_99.acf',
              reason: 'corrupt'
            }
          ]
        )
    })

    const result = await buildInstalledMap({ ...libDeps, ...stub })

    expect([...result.keys()].sort()).toEqual([10, 30])
    expect(result.get(10)).toEqual({
      installPath: join('/b/steamapps', 'common', 'Second'),
      sizeOnDisk: '2'
    })
    expect(result.get(30)).toEqual({
      installPath: join('/a/steamapps', 'common'),
      sizeOnDisk: '0'
    })
    expect(stub.calls).toEqual([
      {
        channel: 'steamfiles_scan_acfs',
        args: { steamappsDirs: ['/a/steamapps', '/b/steamapps'] }
      }
    ])
  })

  it('buildInstalledMap and buildIncompleteInstallSet fail soft when the invoke rejects', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/a'])
    const stub = stubRustSteamFiles({})

    expect((await buildInstalledMap({ ...libDeps, ...stub })).size).toBe(0)
    expect(
      (await buildIncompleteInstallSet({ ...libDeps, ...stub })).size
    ).toBe(0)
  })

  it('buildIncompleteInstallSet keeps only present-but-incomplete manifests with a numeric StateFlags', async () => {
    jest.mocked(getSteamLibraries).mockResolvedValue(['/a'])
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanOf([
          { dir: '/a/steamapps', rec: { appid: '10', stateFlags: 4 } },
          { dir: '/a/steamapps', rec: { appid: '20', stateFlags: 1026 } },
          { dir: '/a/steamapps', rec: { appid: '30', stateFlags: null } },
          { dir: '/a/steamapps', rec: { appid: 'x', stateFlags: 2 } }
        ])
    })

    const result = await buildIncompleteInstallSet({ ...libDeps, ...stub })

    expect([...result]).toEqual([20])
  })

  it('buildBottleInstalledMap scans the bottle steamapps root once', async () => {
    jest
      .mocked(getSteamBottleSettings)
      .mockReturnValue({ wineCrossoverBottle: 'GameLibSteam' } as any)
    jest.mocked(getBottleSteamappsDir).mockReturnValue(BOTTLE_STEAMAPPS_ROOT)
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanOf([
          {
            dir: BOTTLE_STEAMAPPS_ROOT,
            rec: { appid: '730', stateFlags: 4, installdir: 'csgo' }
          }
        ])
    })

    const result = await buildBottleInstalledMap({ ...libDeps, ...stub })

    expect(result.get(730)?.installPath).toBe(
      join(BOTTLE_STEAMAPPS_ROOT, 'common', 'csgo')
    )
    expect(stub.calls).toHaveLength(1)
    expect(getSteamLibraries).not.toHaveBeenCalled()
  })

  it('buildBridgeInstalledMap claims an appId only for the bottle the resolver names', async () => {
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue(['Mine', 'Other'])
    jest
      .mocked(getBottleSteamappsDir)
      .mockImplementation((_p, name) => `/bottles/${name}/steamapps`)
    jest
      .mocked(resolveBridgeBottleName)
      .mockImplementation((_p, appId) => (appId === '10' ? 'Mine' : 'Other'))
    const stub = stubRustSteamFiles({
      steamfiles_scan_acfs: () =>
        scanOf([
          {
            dir: '/bottles/Mine/steamapps',
            rec: { appid: '10', stateFlags: 4, installdir: 'Own' }
          },
          {
            dir: '/bottles/Other/steamapps',
            rec: { appid: '10', stateFlags: 4, installdir: 'Stray' }
          }
        ])
    })

    const result = await buildBridgeInstalledMap(testPaths, stub)

    expect(result.get(10)?.installPath).toBe(
      join('/bottles/Mine/steamapps', 'common', 'Own')
    )
    expect(stub.calls).toHaveLength(1)
  })

  it('buildBridgeInstalledMap makes no call when no bridge bottle is ready', async () => {
    jest.mocked(listReadyBridgeBottleNames).mockReturnValue([])
    const stub = stubRustSteamFiles({})

    expect((await buildBridgeInstalledMap(testPaths, stub)).size).toBe(0)
    expect(stub.calls).toHaveLength(0)
  })
})
