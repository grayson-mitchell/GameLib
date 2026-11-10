/**
 * Unit tests for the dedicated Steam CrossOver bottle foundation module
 * (Phase 17 Plan 02) — path resolution, the provisioned-state signal, the
 * T-17-01 sanitizer chokepoint, and the GameSettings composition helper.
 *
 * Mock strategy follows steam/__tests__/games.test.ts:
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - graceful-fs mocked (existsSync) — no real filesystem access
 *  - electron mocked (app.getPath) — backend/constants/paths imports it
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'graceful-fs'
// Real (unmocked) fs — used ONLY to grep bottle.ts's own source text for the
// R6 "no Windows Steam installer reference in provisionBridgeBottle" guard
// below. Distinct local name so it never collides with the mocked
// `graceful-fs` `readFileSync` import above (manifest.test.ts precedent).
import { readFileSync as readRealFile } from 'node:fs'
import { dirname as dirnameOf, join as joinPath } from 'node:path'
import { userHome } from 'backend/constants/paths'
import { GlobalConfig } from 'backend/config'
import { checkWineBeforeLaunch, downloadFile } from 'backend/utils'
import { runWineCommand } from 'backend/launcher'
import { steamBottleConfigStore } from '../stores'
import { createTestStores } from 'backend/testUtils/testServices'
import { bindBottleStores, DEFAULT_BRIDGE_BOTTLE_NAME } from '../bottle'
import {
  stopPerGameBridgeBottle,
  endPerGameBridgeBottleSession,
  endPerGameBridgeBottleSessionWith
} from '../bridgeBottleLifecycle'
import {
  isBridgeBottleReady,
  getBridgeBottleSettings,
  bridgeBottleNameFor,
  resolveBridgeBottleName,
  listReadyBridgeBottleNames,
  findBridgeInstallBottle,
  DRM_LAUNCH_FORM,
  drmRunnerWineInstallation,
  getDrmBridgeBottleSettings,
  setDrmBridgeRunner,
  setOverlayBridgeRunner,
  getBridgeRunnerKind,
  clearDrmBridgeRunner,
  getDrmBridgeRunner
} from '../bridgeBottle'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import type { DrmBridgeRunner } from '../bridgeBottle'
import { __stopBottledRaiseLoops } from '../bottledSteam'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'

jest.mock('backend/platform', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    // Plain method (survives resetMocks) -- publicDir resolves it at module load.
    getAppPath: () => '/tmp/mock-path',
    // quick/260815-vvz Task 2: bottle.ts now statically `import { app } from 'electron'`,
    // so the raise-loop miss fallback's `app.hide()` call is reachable from this mock.
    hide: jest.fn()
  }
}))

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  rmSync: jest.fn()
}))

jest.mock('../stores', () => ({
  steamBottleConfigStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn()
  }
}))

jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: jest.fn()
  }
}))

jest.mock('backend/utils', () => ({
  checkWineBeforeLaunch: jest.fn(),
  downloadFile: jest.fn()
}))

jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
}))

jest.mock('backend/engine/adoptBottle', () => ({
  writeCxbottleConf: jest.fn()
}))

// quick 261027-tot: setupDownloads.ts (the SteamSetup.exe fetch wrapper) emits
// its progress push through ipc; mocked so the real ipc module never loads.
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// GAP C (17-16): force isMac true so the macOS raise poll loop is exercised
// deterministically on every host (the loop is dynamically imported by
// bottle.ts). isSnap is provided because backend/constants/paths reads it.
jest.mock('backend/constants/environment', () => ({
  isMac: true,
  isWindows: false,
  isLinux: false,
  isSnap: false
}))

jest.mock('backend/logger', () => ({
  getRunnerLogWriter: jest.fn().mockReturnValue({}),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

// quick 261024-cjq: the CrossOver location resolver is mocked with PLAIN
// functions closing over mutable state (they survive resetMocks). Default: a
// CrossOver at /Applications. Its own behaviour is covered by
// crossoverLocation.test.ts.
const CX_BIN_DIR =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const cxState: { binDir: string | undefined } = { binDir: CX_BIN_DIR }
jest.mock('backend/engine/crossoverLocation', () => ({
  resolveCrossoverBinDir: () => cxState.binDir,
  resolveCrossoverBinDirAsync: () => Promise.resolve(cxState.binDir),
  crossoverBinDirFromWineBin: (bin: string) => bin
}))

const mockedExistsSync = existsSync as jest.Mock
const mockedMkdirSync = mkdirSync as jest.Mock
const mockedReaddirSync = readdirSync as jest.Mock
const mockedReadFileSync = readFileSync as jest.Mock
const mockedRmSync = rmSync as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedSet = steamBottleConfigStore.set as jest.Mock

// 66.1-22g: bottle readers use the slice bound at boot; bind the suite's mocked store.
bindBottleStores({
  stores: createTestStores({ steam: { steamBottleConfigStore } as never })
})
const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
// Recording fake handed to the code under test through its deps slice (66.1 R5).
const mockedSpawnAsync = jest.fn()
const spawnDeps = { spawnAsync: mockedSpawnAsync }
const mockedDownloadFile = downloadFile as jest.Mock
const mockedCheckWineBeforeLaunch = checkWineBeforeLaunch as jest.Mock
const mockedRunWineCommand = runWineCommand as jest.Mock

const defaultWine: WineInstallation = {
  bin: '/usr/bin/wine',
  name: 'Default Wine',
  type: 'wine'
}

describe('bottle.ts', () => {
  beforeEach(() => {
    cxState.binDir = CX_BIN_DIR
    mockedExistsSync.mockReset()
    mockedMkdirSync.mockReset()
    mockedReaddirSync.mockReset()
    mockedReadFileSync.mockReset()
    mockedRmSync.mockReset()
    mockedGetNodefault.mockReset()
    mockedGlobalConfigGet.mockReset()
    mockedSet.mockReset()
    mockedSpawnAsync.mockReset()
    mockedDownloadFile.mockReset()
    mockedCheckWineBeforeLaunch.mockReset()
    mockedRunWineCommand.mockReset()

    // Sensible defaults so provisionBottle()/dispatch tests that don't care
    // about GlobalConfig still have a valid GameSettings to compose from.
    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
    })
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    mockedDownloadFile.mockResolvedValue(undefined)
    mockedCheckWineBeforeLaunch.mockResolvedValue(true)
    mockedRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
    // Default cxbottle.conf contents to a win64 prefix so the new
    // GAP-17-CEF-RENDER pre-guard in provisionBottle() (bottleWineArch check)
    // never fires unless a test explicitly arranges a win32 conf string.
    mockedReadFileSync.mockReturnValue('"WineArch" = "win64"')
  })

  // GAP C (17-16): several tests fire `void raiseInstallerWindow(...)` /
  // `void raiseBottledGameWindow(...)` indirectly (provisionBottle step 7,
  // the install/launch dispatch). Cancel any in-flight raise loop after every
  // test so its ~18s poll cannot survive teardown, keep the worker alive, or
  // fire a dynamic import post-teardown. Restore real timers for the fake-timer
  // leak test.
  afterEach(() => {
    __stopBottledRaiseLoops()
    jest.useRealTimers()
  })

  describe('bridge bottle (24-04)', () => {
    describe('bridgeBottleNameFor (D-A)', () => {
      test('returns DEFAULT_BRIDGE_BOTTLE_NAME-<appId> for a numeric appId', () => {
        expect(bridgeBottleNameFor('206040')).toBe(
          `${DEFAULT_BRIDGE_BOTTLE_NAME}-206040`
        )
      })

      test('returns null for a non-numeric appId', () => {
        expect(bridgeBottleNameFor('not-numeric')).toBeNull()
        expect(bridgeBottleNameFor('123abc')).toBeNull()
        expect(bridgeBottleNameFor('')).toBeNull()
      })
    })

    describe('resolveBridgeBottleName (D-B)', () => {
      test('returns null for a non-numeric appId', () => {
        expect(resolveBridgeBottleName('not-numeric')).toBeNull()
      })

      test('resolves to the per-game bottle name when it is ready', () => {
        mockedExistsSync.mockImplementation(
          (path: string) =>
            path.includes('GameLibSteamBridge-206040') &&
            path.includes('cxbottle.conf')
        )

        expect(resolveBridgeBottleName('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })

      test('falls back to the legacy bridge bottle when it is ready AND holds this appId manifest, and the per-game bottle is NOT ready', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path.includes('GameLibSteamBridge-206040')) return false
          if (
            path.includes('GameLibSteamBridge') &&
            path.includes('cxbottle.conf')
          ) {
            return true
          }
          if (path.includes('appmanifest_206040.acf')) return true
          return false
        })

        expect(resolveBridgeBottleName('206040')).toBe(
          DEFAULT_BRIDGE_BOTTLE_NAME
        )
      })

      test('resolves to the per-game bottle name when the legacy bottle is ready but does NOT hold this appId manifest', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path.includes('GameLibSteamBridge-206040')) return false
          if (
            path.includes('GameLibSteamBridge') &&
            path.includes('cxbottle.conf')
          ) {
            return true
          }
          return false
        })

        expect(resolveBridgeBottleName('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })

      test('resolves to the per-game bottle name (even though not yet provisioned) when neither bottle is ready', () => {
        mockedExistsSync.mockReturnValue(false)

        expect(resolveBridgeBottleName('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })

      test('the per-game bottle wins even when the legacy bottle is ready and holds this appId manifest, if the per-game bottle is ALSO ready', () => {
        mockedExistsSync.mockImplementation(
          (path: string) =>
            path.includes('cxbottle.conf') ||
            path.includes('appmanifest_206040.acf')
        )

        expect(resolveBridgeBottleName('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })

      // 51-REVIEW WR-09: a ready per-game bottle with NO manifest (a bridge
      // reinstall whose download failed after provisioning) must not beat a
      // legacy bottle that holds this appId -- the resolver has to agree with
      // findBridgeInstallBottle, which launch/uninstall decide on.
      test('WR-09: a ready but manifest-less per-game bottle loses to a legacy bottle holding this appId manifest, agreeing with findBridgeInstallBottle', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path.includes('cxbottle.conf')) return true
          return (
            path.includes('appmanifest_206040.acf') &&
            !path.includes('GameLibSteamBridge-206040')
          )
        })

        expect(findBridgeInstallBottle('206040')).toBe(
          DEFAULT_BRIDGE_BOTTLE_NAME
        )
        expect(resolveBridgeBottleName('206040')).toBe(
          DEFAULT_BRIDGE_BOTTLE_NAME
        )
      })

      test('WR-09: a ready but manifest-less per-game bottle still resolves to itself when no legacy bottle holds this appId (fresh install target)', () => {
        mockedExistsSync.mockImplementation((path: string) =>
          path.includes('cxbottle.conf')
        )

        expect(resolveBridgeBottleName('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })
    })

    describe('isBridgeBottleReady', () => {
      test('is true when cxbottle.conf exists for the bridge bottle — even with NO steam.exe present (R6: never requires a bottled Steam client)', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path.includes('cxbottle.conf')) return true
          return false
        })

        expect(isBridgeBottleReady(DEFAULT_BRIDGE_BOTTLE_NAME)).toBe(true)
      })

      test('is false when the bridge bottle has not been created', () => {
        mockedExistsSync.mockReturnValue(false)

        expect(isBridgeBottleReady(DEFAULT_BRIDGE_BOTTLE_NAME)).toBe(false)
      })

      // quick/261016-u1w (D-E): isBridgeBottleReady now REQUIRES a name and
      // probes EXACTLY that name — a per-game name must never touch the
      // legacy or Phase 17 dir (no silent default).
      test('probes exactly the name passed, never any other bottle', () => {
        const seenPaths: string[] = []
        mockedExistsSync.mockImplementation((path: string) => {
          seenPaths.push(path)
          return false
        })
        mockedGetNodefault.mockReturnValue(DEFAULT_STEAM_BOTTLE_NAME)

        isBridgeBottleReady('GameLibSteamBridge-206040')

        expect(
          seenPaths.every((p) => p.includes('GameLibSteamBridge-206040'))
        ).toBe(true)
        expect(
          seenPaths.some(
            (p) =>
              p.includes(DEFAULT_STEAM_BOTTLE_NAME) &&
              !p.includes('GameLibSteamBridge-206040')
          )
        ).toBe(false)
        expect(
          seenPaths.some(
            (p) =>
              p.includes(DEFAULT_BRIDGE_BOTTLE_NAME) &&
              !p.includes('GameLibSteamBridge-206040')
          )
        ).toBe(false)
      })
    })

    // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility -- answers "where
    // does an EXISTING install's bits already live", for launch()/uninstall()
    // to dispatch on. Deliberately NOT the same question resolveBridgeBottleName
    // answers (D-B, "where should THIS be probed/provisioned next") -- a
    // never-scanned title can resolve a per-game bottle NAME via D-B while
    // findBridgeInstallBottle correctly returns null for it, because nothing
    // has actually been placed there yet.
    describe('findBridgeInstallBottle (D-51-09)', () => {
      test('returns null for a non-numeric appId (never calls bridgeBottleNameFor past the guard)', () => {
        expect(findBridgeInstallBottle('not-numeric')).toBeNull()
        expect(findBridgeInstallBottle('')).toBeNull()
      })

      test('returns the per-game bottle name when it is ready AND holds this appId manifest', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (
            path.includes('GameLibSteamBridge-206040') &&
            path.includes('cxbottle.conf')
          ) {
            return true
          }
          if (
            path.includes('GameLibSteamBridge-206040') &&
            path.includes('appmanifest_206040.acf')
          ) {
            return true
          }
          return false
        })

        expect(findBridgeInstallBottle('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })

      test('returns null when the per-game bottle is ready but holds NO manifest for this appId (provisioned, never installed into)', () => {
        mockedExistsSync.mockImplementation(
          (path: string) =>
            path.includes('GameLibSteamBridge-206040') &&
            path.includes('cxbottle.conf')
        )

        expect(findBridgeInstallBottle('206040')).toBeNull()
      })

      test('falls back to the legacy bridge bottle when it is ready AND holds this appId manifest, and the per-game bottle is not ready', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path.includes('GameLibSteamBridge-206040')) return false
          if (
            path.includes(DEFAULT_BRIDGE_BOTTLE_NAME) &&
            path.includes('cxbottle.conf')
          ) {
            return true
          }
          if (
            path.includes(DEFAULT_BRIDGE_BOTTLE_NAME) &&
            path.includes('appmanifest_206040.acf') &&
            !path.includes('GameLibSteamBridge-206040')
          ) {
            return true
          }
          return false
        })

        expect(findBridgeInstallBottle('206040')).toBe(
          DEFAULT_BRIDGE_BOTTLE_NAME
        )
      })

      test('returns null when the legacy bottle is ready but holds no manifest for this appId, and the per-game bottle is not ready either (existing GameLibSteam-only install)', () => {
        mockedExistsSync.mockImplementation(
          (path: string) =>
            path.includes(DEFAULT_BRIDGE_BOTTLE_NAME) &&
            !path.includes('GameLibSteamBridge-206040') &&
            path.includes('cxbottle.conf')
        )

        expect(findBridgeInstallBottle('206040')).toBeNull()
      })

      test('returns null when neither bottle is ready at all', () => {
        mockedExistsSync.mockReturnValue(false)

        expect(findBridgeInstallBottle('206040')).toBeNull()
      })

      test('the per-game bottle wins even when the legacy bottle is ALSO ready and holds this appId manifest', () => {
        mockedExistsSync.mockImplementation(
          (path: string) =>
            path.includes('cxbottle.conf') ||
            path.includes('appmanifest_206040.acf')
        )

        expect(findBridgeInstallBottle('206040')).toBe(
          'GameLibSteamBridge-206040'
        )
      })
    })

    describe('getBridgeBottleSettings', () => {
      // quick/261016-u1w (D-E): appId is now REQUIRED. With no bridge bottle
      // ready (mockedExistsSync default-false), resolveBridgeBottleName
      // falls through to the per-game name — never the Phase 17 bottle.
      test('resolves the per-game bridge bottle name, not GameLibSteam', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })

        const settings = getBridgeBottleSettings('206040')

        expect(settings.wineCrossoverBottle).toBe('GameLibSteamBridge-206040')
        expect(settings.wineCrossoverBottle).not.toBe(DEFAULT_STEAM_BOTTLE_NAME)
      })

      test('never reads the stored steamBottleConfigStore bottle-name override', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
        mockedGetNodefault.mockReturnValue('some-other-bottle')

        const settings = getBridgeBottleSettings('206040')

        expect(settings.wineCrossoverBottle).toBe('GameLibSteamBridge-206040')
      })

      // ── D-UAT-24-06 (24-15 gap closure) ─────────────────────────────────
      // The bridge bottle is created by cxbottle (CrossOver); the LAUNCH
      // getter must resolve that same CrossOver runtime, never inherit the
      // GPTK/toolkit global default — otherwise a 32-bit bridge game exe
      // aborts instantly under GPTK's wine64-only loader.
      const gptkGlobalWine: WineInstallation = {
        bin: '/Applications/Game Porting Toolkit.app/.../wine64',
        name: 'Game-Porting-Toolkit-latest',
        type: 'toolkit'
      }

      test('D-UAT-24-06: resolves a CrossOver WineInstallation (not the GPTK global default) when CrossOver is present on disk', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: gptkGlobalWine }) as GameSettings
        })
        mockedExistsSync.mockImplementation((path: string) =>
          path.endsWith('/CrossOver/bin/wine')
        )

        const settings = getBridgeBottleSettings('206040')

        expect(settings.wineVersion.type).toBe('crossover')
        expect(settings.wineVersion.bin).toMatch(/\/CrossOver\/bin\/wine$/)
        expect(settings.wineVersion.wineserver).toMatch(
          /\/CrossOver\/bin\/wineserver$/
        )
        expect(settings.wineVersion).not.toEqual(gptkGlobalWine)
        expect(settings.wineVersion.type).not.toBe('toolkit')
      })

      test('D-UAT-24-06: falls back to globalSettings.wineVersion when CrossOver is absent from disk', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: gptkGlobalWine }) as GameSettings
        })
        mockedExistsSync.mockReturnValue(false)

        const settings = getBridgeBottleSettings('206040')

        expect(settings.wineVersion).toEqual(gptkGlobalWine)
      })

      test('D-UAT-24-06: stays synchronous and still resolves a bridge bottle name', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: gptkGlobalWine }) as GameSettings
        })
        mockedExistsSync.mockImplementation((path: string) =>
          path.endsWith('/CrossOver/bin/wine')
        )

        const result = getBridgeBottleSettings('206040')

        expect(result).not.toBeInstanceOf(Promise)
        expect(result.wineCrossoverBottle).toBe('GameLibSteamBridge-206040')
      })

      // ── Per-game bottle threading (D-B) ────────────────────────────────
      test('resolves the per-game bottle name when an appId is given and its per-game bottle is ready', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
        mockedExistsSync.mockImplementation(
          (path: string) =>
            path.includes('GameLibSteamBridge-206040') &&
            path.includes('cxbottle.conf')
        )

        const settings = getBridgeBottleSettings('206040')

        expect(settings.wineCrossoverBottle).toBe('GameLibSteamBridge-206040')
      })

      test('resolves to the per-game bottle name (not the legacy shared one) when no bridge bottle is ready at all', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
        mockedExistsSync.mockReturnValue(false)

        const settings = getBridgeBottleSettings('206040')

        expect(settings.wineCrossoverBottle).toBe('GameLibSteamBridge-206040')
      })

      test('throws when given a non-numeric appId -- a caller that passed an appId has a specific game in mind, so resolving the WRONG (shared) bottle silently would be worse than failing loudly', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })

        expect(() => getBridgeBottleSettings('abc')).toThrow(/abc/)
      })
    })

    describe('Phase 56 DRM runner (56-11)', () => {
      const CX_ROOT =
        '/Users/a b/Library/Application Support/GameLib/steam-bridge/drm/runners/crossover-26.3.0.39832/CrossOver'
      const R: DrmBridgeRunner = {
        crossoverBuild: '26.3.0.39832',
        runnerDir: dirnameOf(CX_ROOT),
        cxRoot: CX_ROOT,
        wrapperBin: CX_ROOT + '/bin/wine',
        wineloaderBin: CX_ROOT + '/bin/wineloader',
        wineserverBin: CX_ROOT + '/bin/wineserver',
        windowsDllDir: CX_ROOT + '/lib/wine/x86_64-windows',
        unixDllDir: CX_ROOT + '/lib/wine/x86_64-unix'
      }
      const CX = 'bin/wine+CX_BOTTLE' as const
      const RAW = 'raw WINELOADER+WINEPREFIX' as const

      beforeEach(() => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              enviromentOptions: [{ key: 'winedebug', value: '-all' }]
            }) as unknown as GameSettings
        })
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      })
      afterEach(() => {
        for (const id of ['219990', '206040']) clearDrmBridgeRunner(id)
      })

      test('DRM_LAUNCH_FORM equals launch_form in 56-01-SUMMARY.md', () => {
        const text = readRealFile(
          joinPath(
            __dirname,
            '..',
            '..',
            '..',
            '..',
            '..',
            '.planning',
            'milestones',
            'v0.9-phases',
            '56-bridge-steamclient-layer-drm-mode-for-steamstub-titles',
            '56-01-SUMMARY.md'
          ),
          'utf8'
        )
        const m = /^launch_form: (.+)$/m.exec(text)
        expect(m?.[1]).toBe(DRM_LAUNCH_FORM)
      })

      test('wine installation for both forms', () => {
        expect(drmRunnerWineInstallation(R, CX)).toEqual({
          bin: CX_ROOT + '/bin/wine',
          wineserver: CX_ROOT + '/bin/wineserver',
          type: 'crossover',
          name: 'CrossOver 26.3.0.39832 (GameLib DRM runner)'
        })
        expect(drmRunnerWineInstallation(R, RAW)).toEqual({
          bin: CX_ROOT + '/bin/wineloader',
          wineserver: CX_ROOT + '/bin/wineserver',
          type: 'wine',
          name: 'CrossOver 26.3.0.39832 (GameLib DRM runner)'
        })
      })

      test('rejects invalid runners and forms', () => {
        const bad = (o: Partial<DrmBridgeRunner>) =>
          drmRunnerWineInstallation({ ...R, ...o }, CX)
        expect(
          bad({
            cxRoot:
              'relative/steam-bridge/drm/runners/crossover-26.3.0.39832/CrossOver'
          })
        ).toBeNull()
        expect(bad({ cxRoot: '/x/CrossOver' })).toBeNull()
        expect(bad({ crossoverBuild: '26.3.0.1' })).toBeNull()
        expect(bad({ crossoverBuild: '26.3' })).toBeNull()
        expect(
          bad({
            wrapperBin:
              '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine'
          })
        ).toBeNull()
        expect(bad({ wineserverBin: R.wineserverBin + '\n' })).toBeNull()
        expect(bad({ wineloaderBin: R.wineloaderBin + '\0' })).toBeNull()
        expect(
          drmRunnerWineInstallation(R, 'other' as unknown as typeof CX)
        ).toBeNull()
      })

      test('CX variant keeps the bottle name and swaps only the runner', () => {
        const stock = getBridgeBottleSettings('219990')
        const drm = getDrmBridgeBottleSettings('219990', R, CX)
        expect(drm.wineCrossoverBottle).toBe('GameLibSteamBridge-219990')
        expect(drm.wineCrossoverBottle).toBe(stock.wineCrossoverBottle)
        expect(drm.wineVersion).toEqual(drmRunnerWineInstallation(R, CX))
        expect({ ...drm, wineVersion: undefined }).toEqual({
          ...stock,
          wineVersion: undefined
        })
      })

      test('raw variant sets prefix and replaces WINELOADER/WINESERVER entries', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              enviromentOptions: [
                { key: 'wineloader', value: '/old' },
                { key: 'FOO', value: '1' }
              ]
            }) as unknown as GameSettings
        })
        const drm = getDrmBridgeBottleSettings('219990', R, RAW)
        expect(drm.wineVersion.type).toBe('wine')
        expect(drm.winePrefix).toBe(getBottleDir('GameLibSteamBridge-219990'))
        const env = drm.enviromentOptions
        expect(env.filter((e) => e.key === 'WINELOADER')).toEqual([
          { key: 'WINELOADER', value: R.wineloaderBin }
        ])
        expect(env.filter((e) => e.key === 'WINESERVER')).toEqual([
          { key: 'WINESERVER', value: R.wineserverBin }
        ])
        expect(env.some((e) => e.key === 'wineloader')).toBe(false)
        expect(env.some((e) => e.key === 'FOO')).toBe(true)
      })

      test('getDrmBridgeBottleSettings throws on bad appId or runner', () => {
        expect(() => getDrmBridgeBottleSettings('abc', R, CX)).toThrow('abc')
        expect(() =>
          getDrmBridgeBottleSettings('219990', { ...R, cxRoot: '/x' }, CX)
        ).toThrow('invalid DRM runner')
      })

      test('registry routes only the registered appId, and clears', () => {
        const stock206 = getBridgeBottleSettings('206040').wineVersion
        expect(setDrmBridgeRunner('219990', R)).toBe(true)
        expect(getBridgeBottleSettings('219990').wineVersion).toEqual(
          drmRunnerWineInstallation(R, DRM_LAUNCH_FORM)
        )
        expect(getDrmBridgeRunner('219990')?.runner.runnerDir).toBe(R.runnerDir)
        expect(getBridgeBottleSettings('206040').wineVersion).toEqual(stock206)
        clearDrmBridgeRunner('219990')
        expect(getDrmBridgeRunner('219990')).toBeUndefined()
        expect(getBridgeBottleSettings('219990').wineVersion).toEqual(
          defaultWine
        )
      })

      test('registry refuses bad appId or runner', () => {
        expect(setDrmBridgeRunner('abc', R)).toBe(false)
        expect(setDrmBridgeRunner('219990', { ...R, cxRoot: '/x' })).toBe(false)
        expect(getDrmBridgeRunner('219990')).toBeUndefined()
        expect(getDrmBridgeRunner('abc')).toBeUndefined()
      })

      test('H2: a registered DRM runner wins over an engine hint', async () => {
        const dir = getBottleDir('GameLibSteamBridge-219990')
        mockedExistsSync.mockImplementation(
          (path: string) => path === dir || path === '/abs/hint/wineserver'
        )
        setDrmBridgeRunner('219990', R)
        await endPerGameBridgeBottleSession(
          spawnDeps,
          '219990',
          'GameLibSteamBridge-219990',
          5000,
          { wineserverBin: '/abs/hint/wineserver' }
        )
        const call = mockedSpawnAsync.mock.calls.at(-1)!
        expect(call[0]).toBe(CX_ROOT + '/bin/wineserver')
      })

      test('stop and end-session run the clone wineserver', async () => {
        const dir = getBottleDir('GameLibSteamBridge-219990')
        mockedExistsSync.mockImplementation((path: string) => path === dir)
        setDrmBridgeRunner('219990', R)
        await stopPerGameBridgeBottle(spawnDeps, '219990')
        let call = mockedSpawnAsync.mock.calls.at(-1)!
        expect(call[0]).toBe(CX_ROOT + '/bin/wineserver')
        expect(call[1]).toEqual(['-k'])
        expect(call[2]?.env?.WINEPREFIX).toBe(dir)
        expect(call[2]?.env?.CX_ROOT).toBe(CX_ROOT)
        mockedSpawnAsync.mockClear()
        await endPerGameBridgeBottleSession(
          spawnDeps,
          '219990',
          'GameLibSteamBridge-219990',
          5000
        )
        call = mockedSpawnAsync.mock.calls.at(-1)!
        expect(call[0]).toBe(CX_ROOT + '/bin/wineserver')
        expect(call[2]?.timeout).toBe(5000)
      })

      describe('Phase 60 overlay runner (60-07)', () => {
        const OV_ROOT =
          '/Users/a b/Library/Application Support/GameLib/steam-bridge/overlay/runners/crossover-26.3.0.39832/CrossOver'
        const OV: DrmBridgeRunner = {
          ...R,
          runnerDir: dirnameOf(OV_ROOT),
          cxRoot: OV_ROOT,
          wrapperBin: OV_ROOT + '/bin/wine',
          wineloaderBin: OV_ROOT + '/bin/wineloader',
          wineserverBin: OV_ROOT + '/bin/wineserver',
          windowsDllDir: OV_ROOT + '/lib/wine/x86_64-windows',
          unixDllDir: OV_ROOT + '/lib/wine/x86_64-unix'
        }

        test('registers and routes the overlay clone', () => {
          expect(setOverlayBridgeRunner('620', OV)).toBe(true)
          expect(getBridgeBottleSettings('620').wineVersion).toEqual({
            bin: OV_ROOT + '/bin/wine',
            wineserver: OV_ROOT + '/bin/wineserver',
            type: 'crossover',
            name: 'CrossOver 26.3.0.39832 (GameLib overlay runner)'
          })
          expect(getBridgeRunnerKind('620')).toBe('overlay')
          expect(getDrmBridgeRunner('620')?.kind).toBe('overlay')
          clearDrmBridgeRunner('620')
          expect(getBridgeRunnerKind('620')).toBeUndefined()
        })

        test('kind must match the runner root', () => {
          expect(setOverlayBridgeRunner('620', R)).toBe(false)
          expect(setDrmBridgeRunner('620', OV)).toBe(false)
          expect(setOverlayBridgeRunner('abc', OV)).toBe(false)
        })

        test('stop uses the overlay clone wineserver', async () => {
          const dir = getBottleDir('GameLibSteamBridge-620')
          mockedExistsSync.mockImplementation((path: string) => path === dir)
          setOverlayBridgeRunner('620', OV)
          await stopPerGameBridgeBottle(spawnDeps, '620')
          const call = mockedSpawnAsync.mock.calls.at(-1)!
          expect(call[0]).toBe(OV_ROOT + '/bin/wineserver')
        })

        test('endPerGameBridgeBottleSessionWith uses the given bin dir', async () => {
          const dir = getBottleDir('GameLibSteamBridge-620')
          mockedExistsSync.mockImplementation((path: string) => path === dir)
          await endPerGameBridgeBottleSessionWith(
            spawnDeps,
            '620',
            'GameLibSteamBridge-620',
            OV_ROOT + '/bin',
            15000
          )
          const call = mockedSpawnAsync.mock.calls.at(-1)!
          expect(call[0]).toBe(OV_ROOT + '/bin/wineserver')
          expect(call[2]?.timeout).toBe(15000)
        })

        test('endPerGameBridgeBottleSessionWith refuses bad names', async () => {
          mockedExistsSync.mockReturnValue(true)
          mockedSpawnAsync.mockClear()
          expect(
            await endPerGameBridgeBottleSessionWith(
              spawnDeps,
              '620',
              'GameLibSteamBridge-621',
              undefined,
              1000
            )
          ).toBe(false)
          expect(
            await endPerGameBridgeBottleSessionWith(
              spawnDeps,
              '620',
              'GameLibSteamBridge',
              undefined,
              1000
            )
          ).toBe(false)
          expect(mockedSpawnAsync).not.toHaveBeenCalled()
        })
      })
    })

    // quick/261016-u1w (D-C): every ready bridge bottle — legacy first (if
    // ready), then per-game bottles sorted by ascending numeric appId.
    describe('listReadyBridgeBottleNames', () => {
      const bottlesRoot = joinPath(
        userHome,
        'Library/Application Support/CrossOver/Bottles'
      )

      test('returns [] when the Bottles dir does not exist, and never calls readdirSync', () => {
        mockedExistsSync.mockReturnValue(false)

        const result = listReadyBridgeBottleNames()

        expect(result).toEqual([])
        expect(mockedReaddirSync).not.toHaveBeenCalled()
      })

      test('lists the legacy bottle first, then per-game bottles sorted by ascending numeric appId', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path === bottlesRoot) return true
          // every candidate bottle's cxbottle.conf is "ready"
          if (path.includes('cxbottle.conf')) {
            return (
              path.includes(DEFAULT_BRIDGE_BOTTLE_NAME) &&
              !path.includes('NotReady')
            )
          }
          return false
        })
        mockedReaddirSync.mockImplementation((path: string) => {
          if (path === bottlesRoot) {
            return [
              'GameLibSteamBridge-206060',
              'GameLibSteam',
              'GameLibSteamBridge',
              'SomeUsersOwnBottle',
              'GameLibSteamBridge-206040',
              'GameLibSteamBridge-NotNumeric',
              'GameLibSteamBridge-NotReady'
            ]
          }
          return []
        })

        const result = listReadyBridgeBottleNames()

        expect(result).toEqual([
          'GameLibSteamBridge',
          'GameLibSteamBridge-206040',
          'GameLibSteamBridge-206060'
        ])
      })

      test('readdirSync throwing returns [] without throwing', () => {
        mockedExistsSync.mockReturnValue(true)
        mockedReaddirSync.mockImplementation(() => {
          throw new Error('EPERM')
        })

        expect(() => listReadyBridgeBottleNames()).not.toThrow()
        expect(listReadyBridgeBottleNames()).toEqual([])
      })

      test('when the legacy bottle is not ready, only the ready per-game names are returned', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path === bottlesRoot) return true
          if (path.includes('cxbottle.conf')) {
            return path.includes('GameLibSteamBridge-206040')
          }
          return false
        })
        mockedReaddirSync.mockImplementation((path: string) => {
          if (path === bottlesRoot) {
            return ['GameLibSteamBridge', 'GameLibSteamBridge-206040']
          }
          return []
        })

        const result = listReadyBridgeBottleNames()

        expect(result).toEqual(['GameLibSteamBridge-206040'])
      })
    })
  })
})
