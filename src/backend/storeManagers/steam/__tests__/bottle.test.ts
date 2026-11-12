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
import { createEngineRegistry } from 'backend/engine/engineRegistry'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync
} from 'graceful-fs'
import { userHome } from 'backend/constants/paths'
import { checkWineBeforeLaunch, downloadFile } from 'backend/utils'
import {
  createSteamBottle,
  getBottleSteamappsDir,
  getBottleSteamExePath,
  bottleWineArch,
  DEFAULT_BRIDGE_BOTTLE_NAME
} from '../bottle'
import { sanitizeBottleName } from 'backend/engine/bottlePrimitives'
import { getBottleDir, isBottleProvisioned } from '../bottleDirs'
import { createTestSteamLaunchRuntime } from 'backend/testUtils/testSteamLaunchRuntime'
import { createGlobalTimerClock } from 'backend/testUtils/globalTimerClock'
import { provisionBottle } from '../provisionBottle'
import { createTestStores } from 'backend/testUtils/testServices'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'
import type { Stores } from 'backend/services/types'

const { steamBottleConfigStore } =
  jest.requireMock<Stores['steam']>('../stores')

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

jest.mock('backend/utils', () => ({
  checkWineBeforeLaunch: jest.fn(),
  downloadFile: jest.fn()
}))

jest.mock('backend/engine/adoptBottle', () => ({
  writeCxbottleConf: jest.fn()
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
// 66.4-05: the locator is a plain fake over that state, handed to the code under test through
// the engine-runtime slice (a fresh selection registry per suite).
const crossover = {
  resolveCrossoverBinDir: () => cxState.binDir,
  resolveCrossoverBinDirAsync: () => Promise.resolve(cxState.binDir)
}
const engineRuntime = { crossover, registry: createEngineRegistry() }
// One per-boot Steam launch runtime for this suite, on the global-timer clock so jest fake timers drive it (66.4-06).
const steamLaunchRuntime = createTestSteamLaunchRuntime({
  clock: createGlobalTimerClock()
})
const paths = { userHome }

const mockedExistsSync = existsSync as jest.Mock
const mockedMkdirSync = mkdirSync as jest.Mock
const mockedReaddirSync = readdirSync as jest.Mock
const mockedReadFileSync = readFileSync as jest.Mock
const mockedRmSync = rmSync as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedSet = steamBottleConfigStore.set as jest.Mock

// The settings the injected config slice reads; each test points it at its own object.
const mockedGlobalConfigGet = jest.fn()
// 66.3-15: the bottle helpers are an instance over the suite's mocked store and config.
const steamBottle = createSteamBottle({
  stores: createTestStores({ steam: { steamBottleConfigStore } as never }),
  config: { getSettings: () => mockedGlobalConfigGet().getSettings() },
  crossover
})
// Recording fakes handed to the code under test through its deps slice (66.1 R5).
const mockedSpawnAsync = jest.fn()
const mockedDownloadFile = downloadFile as jest.Mock
const mockedCheckWineBeforeLaunch = checkWineBeforeLaunch as jest.Mock
const mockedRunWineCommand = jest.fn()

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
    steamLaunchRuntime.raiser.cancelRaiseLoops()
    jest.useRealTimers()
  })

  describe('getBottleDir / getBottleSteamappsDir', () => {
    test('getBottleDir joins userHome + CrossOver Bottles path + name', () => {
      const dir = getBottleDir('GameLibSteam')
      expect(dir).toBe(
        `${userHome}/Library/Application Support/CrossOver/Bottles/GameLibSteam`
      )
    })

    test('getBottleSteamappsDir defaults to the x86 root when neither steam.exe path exists on disk', () => {
      mockedExistsSync.mockReturnValue(false)
      const dir = getBottleSteamappsDir('GameLibSteam')
      expect(dir).toContain('drive_c/Program Files (x86)/Steam/steamapps')
      expect(dir).toContain('GameLibSteam')
    })
  })

  // ── GAP-17-PFX86-PATH: both-root resolver (win64 x86 layout vs win32 layout) ──
  describe('getBottleSteamExePath / getBottleSteamappsDir — both prefix layouts', () => {
    test('win64 layout: resolves under "Program Files (x86)/Steam" when steam.exe exists there', () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('Program Files (x86)/Steam/steam.exe')
      )

      expect(getBottleSteamExePath('GameLibSteam')).toBe(
        `${getBottleDir('GameLibSteam')}/drive_c/Program Files (x86)/Steam/steam.exe`
      )
      expect(getBottleSteamappsDir('GameLibSteam')).toBe(
        `${getBottleDir('GameLibSteam')}/drive_c/Program Files (x86)/Steam/steamapps`
      )
    })

    test('win32 layout (self-heal): resolves under "Program Files/Steam" when steam.exe exists ONLY there (no x86 dir)', () => {
      mockedExistsSync.mockImplementation(
        (path: string) =>
          path.endsWith('/Program Files/Steam/steam.exe') ||
          path.includes('cxbottle.conf')
      )

      expect(getBottleSteamExePath('GameLibSteam')).toBe(
        `${getBottleDir('GameLibSteam')}/drive_c/Program Files/Steam/steam.exe`
      )
      expect(getBottleSteamappsDir('GameLibSteam')).toBe(
        `${getBottleDir('GameLibSteam')}/drive_c/Program Files/Steam/steamapps`
      )
    })

    test('neither root has steam.exe: getBottleSteamExePath falls back to the default x86 path', () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('cxbottle.conf')
      )

      expect(getBottleSteamExePath('GameLibSteam')).toBe(
        `${getBottleDir('GameLibSteam')}/drive_c/Program Files (x86)/Steam/steam.exe`
      )
    })
  })

  describe('isBottleProvisioned', () => {
    test('returns true when cxbottle.conf exists', () => {
      mockedExistsSync.mockReturnValue(true)
      expect(isBottleProvisioned('GameLibSteam')).toBe(true)
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('cxbottle.conf')
      )
    })

    test('returns false when cxbottle.conf does not exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(isBottleProvisioned('GameLibSteam')).toBe(false)
    })

    test('defaults to the stored bottle name when none is passed', () => {
      mockedGetNodefault.mockReturnValue('StoredBottle')
      mockedExistsSync.mockReturnValue(true)
      steamBottle.isSteamBottleProvisioned()
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('StoredBottle')
      )
    })

    test('defaults to DEFAULT_STEAM_BOTTLE_NAME when nothing is stored', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedExistsSync.mockReturnValue(false)
      steamBottle.isSteamBottleProvisioned()
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining(DEFAULT_STEAM_BOTTLE_NAME)
      )
    })
  })

  describe('isBottleReady', () => {
    test('is false when cxbottle.conf exists but steam.exe is missing (half-provisioned)', () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('cxbottle.conf')
      )
      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(false)
    })

    test('is true only when both cxbottle.conf and steam.exe exist', () => {
      mockedExistsSync.mockReturnValue(true)
      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(true)
    })

    test('is false when neither cxbottle.conf nor steam.exe exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(false)
    })

    test('GAP-17-PFX86-PATH self-heal: is true when steam.exe exists ONLY under "Program Files" (win32 prefix, no x86 dir)', () => {
      mockedExistsSync.mockImplementation(
        (path: string) =>
          path.includes('cxbottle.conf') ||
          path.endsWith('/Program Files/Steam/steam.exe')
      )
      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(true)
    })

    // ── GAP-17-PROVISIONED-FLAG-STUCK: lazy readiness reconcile ──────────────
    test('GAP-17-PROVISIONED-FLAG-STUCK: a ready bottle lazily reconciles the stored provisioned flag to true', () => {
      mockedExistsSync.mockReturnValue(true) // conf + steam.exe both present
      mockedGetNodefault.mockReturnValue(undefined) // provisioned not yet stored

      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(true)
      expect(mockedSet).toHaveBeenCalledWith('provisioned', true)
    })

    test('GAP-17-PROVISIONED-FLAG-STUCK: a half-provisioned bottle (conf only) does NOT write the provisioned flag', () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('cxbottle.conf')
      )

      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(false)
      expect(mockedSet).not.toHaveBeenCalledWith(
        'provisioned',
        expect.anything()
      )
    })

    test('GAP-17-PROVISIONED-FLAG-STUCK: when provisioned is already true, a ready observation does not re-write it (get_nodefault guard)', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(true) // provisioned already persisted true

      expect(steamBottle.isBottleReady('GameLibSteam')).toBe(true)
      expect(mockedSet).not.toHaveBeenCalledWith('provisioned', true)
      expect(mockedSet).not.toHaveBeenCalledWith('provisioned', false)
    })
  })

  // ── GAP-17-CEF-RENDER: win32/win64 detector used by provisionBottle's ──────
  // recreate pre-guard.
  describe('bottleWineArch', () => {
    test('returns "win32" when cxbottle.conf contains WineArch = win32', () => {
      mockedReadFileSync.mockReturnValue('"WineArch" = "win32"')
      expect(bottleWineArch('GameLibSteam')).toBe('win32')
    })

    test('returns "win64" when cxbottle.conf contains WineArch = win64', () => {
      mockedReadFileSync.mockReturnValue('"WineArch" = "win64"')
      expect(bottleWineArch('GameLibSteam')).toBe('win64')
    })

    test('returns null when cxbottle.conf is missing/unreadable', () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      expect(bottleWineArch('GameLibSteam')).toBeNull()
    })

    test('returns null when cxbottle.conf has no recognizable WineArch value', () => {
      mockedReadFileSync.mockReturnValue('"SomeOtherKey" = "value"')
      expect(bottleWineArch('GameLibSteam')).toBeNull()
    })
  })

  describe('sanitizeBottleName', () => {
    test('a clean name passes through unchanged', () => {
      expect(sanitizeBottleName('GameLibSteam')).toBe('GameLibSteam')
    })

    test('rejects a path-traversal sequence', () => {
      expect(sanitizeBottleName('a/../b')).toBeNull()
    })

    test('rejects forward slashes', () => {
      expect(sanitizeBottleName('foo/bar')).toBeNull()
    })

    test('rejects backslashes', () => {
      expect(sanitizeBottleName('foo\\bar')).toBeNull()
    })

    test('rejects a NUL byte', () => {
      expect(sanitizeBottleName('foo\0bar')).toBeNull()
    })

    test('rejects an empty/whitespace-only name', () => {
      expect(sanitizeBottleName('')).toBeNull()
      expect(sanitizeBottleName('   ')).toBeNull()
    })

    test('trims surrounding whitespace on an otherwise-clean name', () => {
      expect(sanitizeBottleName('  GameLibSteam  ')).toBe('GameLibSteam')
    })
  })

  describe('getSteamBottleSettings', () => {
    test('falls back to DEFAULT_STEAM_BOTTLE_NAME and the global default Wine when nothing is stored', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () =>
          ({
            wineVersion: defaultWine
          }) as GameSettings
      })

      const settings = steamBottle.getSteamBottleSettings()
      expect(settings.wineCrossoverBottle).toBe(DEFAULT_STEAM_BOTTLE_NAME)
      expect(settings.wineVersion).toEqual(defaultWine)
    })

    test('uses the stored wineVersion/wineCrossoverBottle when present', () => {
      const storedWine: WineInstallation = {
        bin: '/opt/crossover/bin/wine',
        name: 'CrossOver',
        type: 'crossover'
      }
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineVersion') return storedWine
        if (key === 'wineCrossoverBottle') return 'CustomBottle'
        return undefined
      })
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () =>
          ({
            wineVersion: defaultWine
          }) as GameSettings
      })

      const settings = steamBottle.getSteamBottleSettings()
      expect(settings.wineCrossoverBottle).toBe('CustomBottle')
      expect(settings.wineVersion).toEqual(storedWine)
    })

    // ── debug/steam-bottle-uninstall-reverts root-cause regression ──────────
    // A non-CrossOver wineVersion (typically Game Porting Toolkit, 'toolkit')
    // can end up persisted in steamBottleConfigStore via an unguarded
    // self-heal write (persistBottleWineVersion / provisionBottle step 6).
    // setupWineEnvVars only wires CX_BOTTLE for type 'crossover' — any other
    // type routes dispatchToBottledSteam's wine command through the wrong
    // WINEPREFIX entirely, so every delegated install/launch/uninstall fails
    // near-instantly. Mirrors getBridgeBottleSettings()'s existing D-UAT-24-06
    // test trio.
    const gptkStoredWine: WineInstallation = {
      bin: '/Users/example/Library/Application Support/GameLib/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/bin/wine64',
      name: 'Game-Porting-Toolkit-latest',
      type: 'toolkit'
    }

    test('root-cause regression: resolves a CrossOver WineInstallation (not the stored GPTK/toolkit engine) when CrossOver is present on disk', () => {
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineVersion') return gptkStoredWine
        return undefined
      })
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
      })
      mockedExistsSync.mockImplementation((path: string) =>
        path.endsWith('/CrossOver/bin/wine')
      )

      const settings = steamBottle.getSteamBottleSettings()

      expect(settings.wineVersion.type).toBe('crossover')
      expect(settings.wineVersion.bin).toMatch(/\/CrossOver\/bin\/wine$/)
      expect(settings.wineVersion.wineserver).toMatch(
        /\/CrossOver\/bin\/wineserver$/
      )
      expect(settings.wineVersion).not.toEqual(gptkStoredWine)
      expect(settings.wineVersion.type).not.toBe('toolkit')
    })

    test('root-cause regression: falls back to the stored GPTK/toolkit engine when CrossOver is absent from disk', () => {
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineVersion') return gptkStoredWine
        return undefined
      })
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
      })
      mockedExistsSync.mockReturnValue(false)

      const settings = steamBottle.getSteamBottleSettings()

      expect(settings.wineVersion).toEqual(gptkStoredWine)
    })

    test('root-cause regression: an already-crossover stored wineVersion is kept as-is (no needless re-resolution)', () => {
      const storedWine: WineInstallation = {
        bin: '/opt/crossover/bin/wine',
        name: 'CrossOver',
        type: 'crossover'
      }
      mockedGetNodefault.mockImplementation((key: string) => {
        if (key === 'wineVersion') return storedWine
        return undefined
      })
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
      })
      // If existsSync were consulted here it would resolve a DIFFERENT
      // CrossOver binary path than the already-correct stored one — assert
      // the stored value passes through untouched.
      mockedExistsSync.mockReturnValue(true)

      const settings = steamBottle.getSteamBottleSettings()

      expect(settings.wineVersion).toEqual(storedWine)
    })

    // ── 34.13 review A-20 ────────────────────────────────────────────────
    // library.ts's getBottleSteamappsRoot() calls this getter SOLELY for
    // `wineCrossoverBottle`, and that sits on readAcfState('bottle')'s hot
    // path: every install poll tick, every uninstall poll tick,
    // buildBottleInstalledMap, refreshInstallState. 539bc979c turned the
    // previously-tolerant `storedWineVersion ?? globalSettings.wineVersion`
    // into an UNGUARDED `.type` dereference, so a GlobalConfig.getSettings()
    // result without a wineVersion turns pure path resolution into a
    // TypeError propagating through the ACF readers. The sidecar's config
    // layer is a different code path from Electron's and this repo has
    // ledgered several hollow sidecar stubs. None of the three specs above
    // covers this — all three supply a wineVersion.
    test('A-20: does not throw when NEITHER a stored nor a global wineVersion exists, and still resolves the bottle name', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({}) as GameSettings
      })
      mockedExistsSync.mockReturnValue(false)

      expect(() => steamBottle.getSteamBottleSettings()).not.toThrow()
      expect(steamBottle.getSteamBottleSettings().wineCrossoverBottle).toBe(
        DEFAULT_STEAM_BOTTLE_NAME
      )
    })

    test('A-20: with no wineVersion anywhere but CrossOver ON DISK, the getter still resolves CrossOver', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({}) as GameSettings
      })
      mockedExistsSync.mockImplementation((path: string) =>
        path.endsWith('/CrossOver/bin/wine')
      )

      expect(steamBottle.getSteamBottleSettings().wineVersion.type).toBe(
        'crossover'
      )
    })

    // ── 34.13 review A-21 ────────────────────────────────────────────────
    // 539bc979c named the defect as "a GPTK engine WAS PERSISTED for the
    // Steam bottle" and then fixed it in the GETTER, so the store kept the
    // broken value and every OTHER reader of that key still saw it —
    // notably getSteamBottleEligibilityVerdict, which reads
    // steamBottleConfigStore directly and deliberately (installFormIpc.ts
    // documents why), i.e. the surface the user chooses from on this very
    // phase. The getter now self-heals the store ONCE.
    test('A-21: the getter PERSISTS its CrossOver correction, so the store self-heals for every other reader', () => {
      mockedGetNodefault.mockImplementation((key: string) =>
        key === 'wineVersion' ? gptkStoredWine : undefined
      )
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
      })
      mockedExistsSync.mockImplementation((path: string) =>
        path.endsWith('/CrossOver/bin/wine')
      )
      mockedSet.mockClear()

      const settings = steamBottle.getSteamBottleSettings()

      expect(mockedSet).toHaveBeenCalledWith(
        'wineVersion',
        settings.wineVersion
      )
      expect(
        (
          mockedSet.mock.calls.find(([k]) => k === 'wineVersion')?.[1] as
            | WineInstallation
            | undefined
        )?.type
      ).toBe('crossover')
    })

    test('A-21 DISCRIMINATOR: an ALREADY-crossover stored engine is not needlessly re-written', () => {
      const storedWine: WineInstallation = {
        bin: '/opt/crossover/bin/wine',
        name: 'CrossOver',
        type: 'crossover'
      }
      mockedGetNodefault.mockImplementation((key: string) =>
        key === 'wineVersion' ? storedWine : undefined
      )
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
      })
      mockedExistsSync.mockReturnValue(true)
      mockedSet.mockClear()

      steamBottle.getSteamBottleSettings()

      expect(mockedSet).not.toHaveBeenCalledWith(
        'wineVersion',
        expect.anything()
      )
    })

    test('A-21 DISCRIMINATOR: when CrossOver is ABSENT the broken engine is NOT persisted back (no write of an uncorrected value)', () => {
      mockedGetNodefault.mockImplementation((key: string) =>
        key === 'wineVersion' ? gptkStoredWine : undefined
      )
      mockedGlobalConfigGet.mockReturnValue({
        getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
      })
      mockedExistsSync.mockReturnValue(false)
      mockedSet.mockClear()

      steamBottle.getSteamBottleSettings()

      expect(mockedSet).not.toHaveBeenCalledWith(
        'wineVersion',
        expect.anything()
      )
    })
  })

  // ── 24-04: dedicated bridge bottle provisioning ───────────────────────────
  describe('bridge bottle (24-04)', () => {
    test('DEFAULT_BRIDGE_BOTTLE_NAME is distinct from DEFAULT_STEAM_BOTTLE_NAME (Pitfall 1)', () => {
      expect(DEFAULT_BRIDGE_BOTTLE_NAME).not.toBe(DEFAULT_STEAM_BOTTLE_NAME)
      expect(DEFAULT_BRIDGE_BOTTLE_NAME).toBe('GameLibSteamBridge')
    })
  })
})

describe('quick 261024-cjq: CrossOver precondition', () => {
  beforeEach(() => {
    cxState.binDir = CX_BIN_DIR
    mockedExistsSync.mockReset()
    mockedSpawnAsync.mockReset()
    mockedSet.mockReset()
    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ wineCrossoverBottle: 'GameLib' })
    })
  })

  test('provisionBottle returns crossover-missing before any store write or spawn', async () => {
    cxState.binDir = undefined
    mockedExistsSync.mockReturnValue(false)
    const result = await provisionBottle({
      config: { getSettings: () => mockedGlobalConfigGet().getSettings() },
      stores: createTestStores(),
      steamBottle,
      paths,
      engineRuntime,
      steamLaunchRuntime,
      spawnAsync: mockedSpawnAsync,
      commandRunner: { runWineCommand: mockedRunWineCommand }
    } as unknown as Parameters<typeof provisionBottle>[0])
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('crossover-missing')
    expect(result.error).toMatch(/CrossOver is required/)
    expect(mockedSet).not.toHaveBeenCalled()
    expect(mockedSpawnAsync).not.toHaveBeenCalled()
  })
})

describe('createSteamBottle construction (66.3-15)', () => {
  test('construction reads and writes nothing', () => {
    const getStores = jest.fn(() => ({ steamBottleConfigStore }))
    const getSettings = jest.fn()
    mockedGetNodefault.mockReset()
    mockedSet.mockReset()

    createSteamBottle({
      crossover,
      stores: {
        get steam() {
          return getStores() as never
        }
      } as never,
      config: { getSettings }
    })

    expect(getStores).not.toHaveBeenCalled()
    expect(getSettings).not.toHaveBeenCalled()
    expect(mockedGetNodefault).not.toHaveBeenCalled()
    expect(mockedSet).not.toHaveBeenCalled()
  })

  test('two instances over different stores never share state', () => {
    const other = {
      get: jest.fn(),
      get_nodefault: jest.fn().mockReturnValue({ bin: '/other/wine' }),
      set: jest.fn()
    }
    const second = createSteamBottle({
      crossover,
      stores: createTestStores({
        steam: { steamBottleConfigStore: other } as never
      }),
      config: { getSettings: () => ({}) as never }
    })
    mockedGetNodefault.mockReturnValue({ bin: '/first/wine' })

    expect(steamBottle.persistedWineBins()).toEqual(['/first/wine'])
    expect(second.persistedWineBins()).toEqual(['/other/wine'])
  })

  test('the deps are required: constructing without stores is a type error', () => {
    // @ts-expect-error stores and config have no default; there is no static fallback holder
    const build = () => createSteamBottle({})
    // Reading through the missing stores fails at first use, never silently against a global.
    expect(build().persistedWineBins).toThrow()
  })
})
