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
import { existsSync, mkdirSync, readFileSync, rmSync } from 'graceful-fs'
// Real (unmocked) fs — used ONLY to grep bottle.ts's own source text for the
// R6 "no Windows Steam installer reference in provisionBridgeBottle" guard
// below. Distinct local name so it never collides with the mocked
// `graceful-fs` `readFileSync` import above (manifest.test.ts precedent).
import { readFileSync as readRealFile } from 'node:fs'
import { join as joinPath } from 'node:path'
import { app } from 'backend/platform'
import { userHome } from 'backend/constants/paths'
import { GlobalConfig } from 'backend/config'
import { logWarning } from 'backend/logger'
import { checkWineBeforeLaunch, downloadFile, spawnAsync } from 'backend/utils'
import { runWineCommand } from 'backend/launcher'
import { steamBottleConfigStore } from '../electronStores'
import {
  getBottleDir,
  getBottleSteamappsDir,
  getBottleSteamExePath,
  isBottleProvisioned,
  isBottleReady,
  bottleWineArch,
  sanitizeBottleName,
  getSteamBottleSettings,
  provisionBottle,
  tellBottledSteamToInstall,
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  __stopBottledRaiseLoops,
  DEFAULT_BRIDGE_BOTTLE_NAME,
  isBridgeBottleReady,
  getBridgeBottleSettings,
  provisionBridgeBottle
} from '../bottle'
import { DEFAULT_STEAM_BOTTLE_NAME, STEAM_SETUP_EXE_URL } from '../constants'
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
  readFileSync: jest.fn(),
  rmSync: jest.fn()
}))

jest.mock('../electronStores', () => ({
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
  downloadFile: jest.fn(),
  spawnAsync: jest.fn()
}))

jest.mock('backend/launcher', () => ({
  runWineCommand: jest.fn()
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

const mockedExistsSync = existsSync as jest.Mock
const mockedMkdirSync = mkdirSync as jest.Mock
const mockedReadFileSync = readFileSync as jest.Mock
const mockedRmSync = rmSync as jest.Mock
const mockedGetNodefault = steamBottleConfigStore.get_nodefault as jest.Mock
const mockedSet = steamBottleConfigStore.set as jest.Mock
const mockedGlobalConfigGet = GlobalConfig.get as jest.Mock
const mockedSpawnAsync = spawnAsync as jest.Mock
const mockedDownloadFile = downloadFile as jest.Mock
const mockedCheckWineBeforeLaunch = checkWineBeforeLaunch as jest.Mock
const mockedRunWineCommand = runWineCommand as jest.Mock
const mockedAppHide = app.hide as jest.Mock
const mockedLogWarning = logWarning as jest.Mock

const defaultWine: WineInstallation = {
  bin: '/usr/bin/wine',
  name: 'Default Wine',
  type: 'wine'
}

describe('bottle.ts', () => {
  beforeEach(() => {
    mockedExistsSync.mockReset()
    mockedMkdirSync.mockReset()
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
      isBottleProvisioned()
      expect(mockedExistsSync).toHaveBeenCalledWith(
        expect.stringContaining('StoredBottle')
      )
    })

    test('defaults to DEFAULT_STEAM_BOTTLE_NAME when nothing is stored', () => {
      mockedGetNodefault.mockReturnValue(undefined)
      mockedExistsSync.mockReturnValue(false)
      isBottleProvisioned()
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
      expect(isBottleReady('GameLibSteam')).toBe(false)
    })

    test('is true only when both cxbottle.conf and steam.exe exist', () => {
      mockedExistsSync.mockReturnValue(true)
      expect(isBottleReady('GameLibSteam')).toBe(true)
    })

    test('is false when neither cxbottle.conf nor steam.exe exist', () => {
      mockedExistsSync.mockReturnValue(false)
      expect(isBottleReady('GameLibSteam')).toBe(false)
    })

    test('GAP-17-PFX86-PATH self-heal: is true when steam.exe exists ONLY under "Program Files" (win32 prefix, no x86 dir)', () => {
      mockedExistsSync.mockImplementation(
        (path: string) =>
          path.includes('cxbottle.conf') ||
          path.endsWith('/Program Files/Steam/steam.exe')
      )
      expect(isBottleReady('GameLibSteam')).toBe(true)
    })

    // ── GAP-17-PROVISIONED-FLAG-STUCK: lazy readiness reconcile ──────────────
    test('GAP-17-PROVISIONED-FLAG-STUCK: a ready bottle lazily reconciles the stored provisioned flag to true', () => {
      mockedExistsSync.mockReturnValue(true) // conf + steam.exe both present
      mockedGetNodefault.mockReturnValue(undefined) // provisioned not yet stored

      expect(isBottleReady('GameLibSteam')).toBe(true)
      expect(mockedSet).toHaveBeenCalledWith('provisioned', true)
    })

    test('GAP-17-PROVISIONED-FLAG-STUCK: a half-provisioned bottle (conf only) does NOT write the provisioned flag', () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('cxbottle.conf')
      )

      expect(isBottleReady('GameLibSteam')).toBe(false)
      expect(mockedSet).not.toHaveBeenCalledWith(
        'provisioned',
        expect.anything()
      )
    })

    test('GAP-17-PROVISIONED-FLAG-STUCK: when provisioned is already true, a ready observation does not re-write it (get_nodefault guard)', () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(true) // provisioned already persisted true

      expect(isBottleReady('GameLibSteam')).toBe(true)
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

      const settings = getSteamBottleSettings()
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

      const settings = getSteamBottleSettings()
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

      const settings = getSteamBottleSettings()

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

      const settings = getSteamBottleSettings()

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

      const settings = getSteamBottleSettings()

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

      expect(() => getSteamBottleSettings()).not.toThrow()
      expect(getSteamBottleSettings().wineCrossoverBottle).toBe(
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

      expect(getSteamBottleSettings().wineVersion.type).toBe('crossover')
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

      const settings = getSteamBottleSettings()

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

      getSteamBottleSettings()

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

      getSteamBottleSettings()

      expect(mockedSet).not.toHaveBeenCalledWith(
        'wineVersion',
        expect.anything()
      )
    })
  })

  describe('provisionBottle', () => {
    // Path-aware existsSync double — robust to the exact call order/count of
    // isBottleProvisioned()/isBottleReady() checks inside provisionBottle().
    // `flags` is mutable so a test can simulate a filesystem effect (e.g. a
    // successful `cxbottle --create` producing cxbottle.conf) via a
    // spawnAsync/downloadFile mockImplementation side effect.
    type FsFlags = { conf: boolean; steamExe: boolean; steamSetupExe: boolean }
    function setBottleFs(flags: FsFlags) {
      mockedExistsSync.mockImplementation((path: string) => {
        if (path.includes('cxbottle.conf')) return flags.conf
        if (path.includes('SteamSetup.exe')) return flags.steamSetupExe
        if (path.endsWith('steam.exe')) return flags.steamExe
        return false
      })
    }

    test('rejects an unsafe bottle name and does NOT call downloadFile', async () => {
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await provisionBottle({ bottleName: 'a/../b' })

      expect(result.status).toBe('error')
      expect(mockedDownloadFile).not.toHaveBeenCalled()
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    // ── CR-01 (17-17): authoritative shared-bottle scope guard (D-01) ──────────
    // provisionBottle must refuse the shared GameLib GOG/Epic Wine bottle name
    // BEFORE any store write, cxbottle --delete/--create, or rmSync — otherwise
    // the win32-recreate branch would destroy the shared bottle (data loss).
    describe('CR-01 shared-bottle guard', () => {
      test('rejects bottleName === the shared wineCrossoverBottle, returning an error that mentions the shared bottle, with NO set/spawn/rmSync', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: 'GameLib'
            }) as GameSettings
        })
        // Even if the FS "looks" like a stale win32 bottle (which would drive the
        // destructive recreate branch), the guard must fire first.
        setBottleFs({ conf: true, steamExe: true, steamSetupExe: false })
        mockedReadFileSync.mockReturnValue('"WineArch" = "win32"')

        const result = await provisionBottle({ bottleName: 'GameLib' })

        expect(result.status).toBe('error')
        expect(result.error).toMatch(/shared/i)
        // No store write, no cxbottle delete/create, no rmSync — guard returns
        // BEFORE any destructive op.
        expect(mockedSet).not.toHaveBeenCalled()
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
        expect(mockedDownloadFile).not.toHaveBeenCalled()
      })

      test('fires on a whitespace-padded equivalent — "  GameLib  " (sanitized to "GameLib") is rejected the same way', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: 'GameLib'
            }) as GameSettings
        })
        setBottleFs({ conf: false, steamExe: false, steamSetupExe: false })

        const result = await provisionBottle({ bottleName: '  GameLib  ' })

        expect(result.status).toBe('error')
        expect(mockedSet).not.toHaveBeenCalled()
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('also fires when the shared config value itself is whitespace-padded ("  GameLib  ") vs a clean bottleName "GameLib"', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: '  GameLib  '
            }) as GameSettings
        })
        setBottleFs({ conf: false, steamExe: false, steamSetupExe: false })

        const result = await provisionBottle({ bottleName: 'GameLib' })

        expect(result.status).toBe('error')
        expect(mockedSet).not.toHaveBeenCalled()
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('does NOT over-fire: the dedicated GameLibSteam bottle proceeds normally even when the shared bottle is "GameLib"', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: 'GameLib'
            }) as GameSettings
        })
        const flags: FsFlags = {
          conf: false,
          steamExe: false,
          steamSetupExe: false
        }
        setBottleFs(flags)
        mockedSpawnAsync.mockImplementation(async () => {
          flags.conf = true
          return { code: 0, stdout: '', stderr: '' }
        })

        const result = await provisionBottle({ bottleName: 'GameLibSteam' })

        expect(result.status).toBe('done')
        // Normal create path still runs for the dedicated bottle.
        expect(mockedSet).toHaveBeenCalledWith('bottleName', 'GameLibSteam')
        expect(mockedDownloadFile).toHaveBeenCalledWith(
          expect.objectContaining({ url: STEAM_SETUP_EXE_URL })
        )
      })

      test('is inert when the shared config value is unset — the default GameLibSteam path is never blocked', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        // Default beforeEach GlobalConfig mock has NO wineCrossoverBottle.
        const flags: FsFlags = {
          conf: false,
          steamExe: false,
          steamSetupExe: false
        }
        setBottleFs(flags)
        mockedSpawnAsync.mockImplementation(async () => {
          flags.conf = true
          return { code: 0, stdout: '', stderr: '' }
        })

        const result = await provisionBottle({ bottleName: 'GameLibSteam' })

        expect(result.status).toBe('done')
        expect(mockedSet).toHaveBeenCalledWith('bottleName', 'GameLibSteam')
      })
    })

    // ── (1c): CrossOver-only guard, mirroring provisionBridgeBottle's D-08 ──
    // guard. Uses bottleName 'GameLibSteam' (not the shared 'GameLib') so the
    // CR-01 guard above cannot be the one that fires — the shared value is
    // primed to 'GameLib' precisely to demonstrate that.
    describe('D-08: CrossOver-only guard (mirrors provisionBridgeBottle)', () => {
      test('rejects a non-CrossOver wineVersion (toolkit/GPTK) before any store write or cxbottle call', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: 'GameLib'
            }) as GameSettings
        })
        setBottleFs({ conf: false, steamExe: false, steamSetupExe: false })
        const gptk: WineInstallation = {
          bin: '/usr/bin/gptk-wine',
          name: 'Game Porting Toolkit',
          type: 'toolkit'
        }

        const result = await provisionBottle({
          bottleName: 'GameLibSteam',
          wineVersion: gptk
        })

        expect(result.status).toBe('error')
        expect(result.error).toMatch(/crossover/i)
        expect(mockedSet).not.toHaveBeenCalled()
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
        expect(mockedDownloadFile).not.toHaveBeenCalled()
      })

      // Discriminator: without this, a guard that rejected UNCONDITIONALLY
      // would also pass the test above.
      test('does NOT over-fire: a CrossOver wineVersion is still persisted', async () => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: 'GameLib'
            }) as GameSettings
        })
        const flags: FsFlags = {
          conf: false,
          steamExe: false,
          steamSetupExe: false
        }
        setBottleFs(flags)
        mockedSpawnAsync.mockImplementation(async () => {
          flags.conf = true
          return { code: 0, stdout: '', stderr: '' }
        })
        const crossover: WineInstallation = {
          bin: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
          name: 'CrossOver',
          type: 'crossover'
        }

        const result = await provisionBottle({
          bottleName: 'GameLibSteam',
          wineVersion: crossover
        })

        expect(result.status).toBe('done')
        expect(mockedSet).toHaveBeenCalledWith('wineVersion', crossover)
      })
    })

    test('short-circuits to {status:"done"} when the bottle is fully ready — conf + steam.exe (no download, no create)', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      setBottleFs({ conf: true, steamExe: true, steamSetupExe: false })

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result).toEqual({ status: 'done' })
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(mockedDownloadFile).not.toHaveBeenCalled()
      expect(mockedMkdirSync).not.toHaveBeenCalled()
    })

    test('downloads SteamSetup.exe from the HTTPS STEAM_SETUP_EXE_URL when un-provisioned', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      const flags: FsFlags = {
        conf: false,
        steamExe: false,
        steamSetupExe: false
      }
      setBottleFs(flags)
      // Simulate `cxbottle --create` producing cxbottle.conf on disk.
      mockedSpawnAsync.mockImplementation(async () => {
        flags.conf = true
        return { code: 0, stdout: '', stderr: '' }
      })

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result.status).toBe('done')
      expect(mockedSpawnAsync).toHaveBeenCalledTimes(1)
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ url: STEAM_SETUP_EXE_URL })
      )
      expect(STEAM_SETUP_EXE_URL.startsWith('https://')).toBe(true)
    })

    test('runs SteamSetup.exe non-silently via runWineCommand with skipPrefixCheckIKnowWhatImDoing', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      const flags: FsFlags = {
        conf: false,
        steamExe: false,
        steamSetupExe: false
      }
      setBottleFs(flags)
      mockedSpawnAsync.mockImplementation(async () => {
        flags.conf = true
        return { code: 0, stdout: '', stderr: '' }
      })

      await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(mockedRunWineCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          commandParts: expect.arrayContaining([
            expect.stringContaining('SteamSetup.exe')
          ]),
          skipPrefixCheckIKnowWhatImDoing: true,
          wait: false
        })
      )
      const call = mockedRunWineCommand.mock.calls[0][0]
      expect(call.commandParts.some((p: string) => p === '/VERYSILENT')).toBe(
        false
      )
      expect(call.commandParts.some((p: string) => p === '/S')).toBe(false)
    })

    test("provisionBottle mkdir's the redist dir before downloading SteamSetup.exe", async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      const flags: FsFlags = {
        conf: false,
        steamExe: false,
        steamSetupExe: false
      }
      setBottleFs(flags)
      mockedSpawnAsync.mockImplementation(async () => {
        flags.conf = true
        return { code: 0, stdout: '', stderr: '' }
      })

      await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(mockedMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('redist'),
        { recursive: true }
      )
      const mkdirOrder = mockedMkdirSync.mock.invocationCallOrder[0]
      const downloadOrder = mockedDownloadFile.mock.invocationCallOrder[0]
      expect(mkdirOrder).toBeLessThan(downloadOrder)
    })

    test('resumes a half-provisioned bottle without re-running cxbottle create', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // conf present, steam.exe absent — half-provisioned.
      setBottleFs({ conf: true, steamExe: false, steamSetupExe: false })

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result.status).toBe('done')
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(mockedDownloadFile).toHaveBeenCalledWith(
        expect.objectContaining({ url: STEAM_SETUP_EXE_URL })
      )
    })

    test('short-circuits only when fully ready (conf + steam.exe) — half-provisioned does NOT short-circuit', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // Both present: full short-circuit, no spawn, no download.
      setBottleFs({ conf: true, steamExe: true, steamSetupExe: false })

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result).toEqual({ status: 'done' })
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(mockedDownloadFile).not.toHaveBeenCalled()
    })

    // ── GAP-17-CEF-RENDER (17-15): win10_64 create template + win32 detect/recreate ──
    test('create uses --template win10_64 (not win10) — GAP-17-CEF-RENDER regression guard', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      const flags: FsFlags = {
        conf: false,
        steamExe: false,
        steamSetupExe: false
      }
      setBottleFs(flags)
      mockedSpawnAsync.mockImplementation(async () => {
        flags.conf = true
        return { code: 0, stdout: '', stderr: '' }
      })

      await provisionBottle({ bottleName: 'GameLibSteam' })

      const createCall = mockedSpawnAsync.mock.calls.find((call) =>
        (call[1] as string[]).includes('--create')
      )
      expect(createCall).toBeDefined()
      const argv = createCall![1] as string[]
      expect(argv).toContain('win10_64')
      expect(argv.includes('win10')).toBe(false)
    })

    test('an existing win32 bottle is deleted and recreated as win10_64, preserving Steam account auth', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // Bottle "looks ready" (conf + steam.exe present) but is win32 — must
      // still be recreated, proving the pre-guard runs BEFORE isBottleReady.
      const flags: FsFlags = {
        conf: true,
        steamExe: true,
        steamSetupExe: false
      }
      setBottleFs(flags)
      mockedReadFileSync.mockReturnValue('"WineArch" = "win32"')

      mockedSpawnAsync.mockImplementation(
        async (_bin: string, argv: string[]) => {
          if (argv.includes('--delete')) {
            // Simulate the delete clearing the stale bottle from disk.
            flags.conf = false
            flags.steamExe = false
          } else if (argv.includes('--create')) {
            // Simulate the recreate producing a fresh bottle.
            flags.conf = true
          }
          return { code: 0, stdout: '', stderr: '' }
        }
      )

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result.status).toBe('done')

      const deleteCall = mockedSpawnAsync.mock.calls.find((call) =>
        (call[1] as string[]).includes('--delete')
      )
      expect(deleteCall).toBeDefined()
      expect(deleteCall![1]).toEqual([
        '--bottle',
        'GameLibSteam',
        '--delete',
        '--force'
      ])

      const createCall = mockedSpawnAsync.mock.calls.find((call) =>
        (call[1] as string[]).includes('--create')
      )
      expect(createCall).toBeDefined()
      expect(createCall![1]).toEqual(
        expect.arrayContaining(['--template', 'win10_64'])
      )

      expect(mockedSet).toHaveBeenCalledWith('provisioned', false)
      expect(mockedSet).not.toHaveBeenCalledWith(
        'refreshToken',
        expect.anything()
      )
      expect(mockedSet).not.toHaveBeenCalledWith(
        'isLoggedIn',
        expect.anything()
      )
      expect(mockedSet).not.toHaveBeenCalledWith('userData', expect.anything())
    })

    // ── GAP-17-PROVISIONED-FLAG-STUCK: step 8 must never persist `false` ──────
    test('GAP-17-PROVISIONED-FLAG-STUCK: provisioned is NEVER persisted false during the wait:false SteamSetup window (steam.exe still absent)', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // Un-provisioned bottle: create produces cxbottle.conf but steam.exe never
      // appears within this call (installer is fire-and-forget, wait:false).
      const flags: FsFlags = {
        conf: false,
        steamExe: false,
        steamSetupExe: false
      }
      setBottleFs(flags)
      mockedSpawnAsync.mockImplementation(async () => {
        flags.conf = true
        return { code: 0, stdout: '', stderr: '' }
      })

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result.status).toBe('done')
      // The race that GAP-17-PROVISIONED-FLAG-STUCK describes: step 8 used to
      // clobber the flag false while steam.exe was legitimately still absent.
      expect(mockedSet).not.toHaveBeenCalledWith('provisioned', false)
    })

    test('GAP-17-PROVISIONED-FLAG-STUCK: provisioned flips true the moment provisionBottle observes a ready bottle (conf + steam.exe)', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // Fully ready from the start — the step-3 isBottleReady() short-circuit
      // observes readiness and the lazy reconcile persists provisioned:true.
      setBottleFs({ conf: true, steamExe: true, steamSetupExe: false })

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result).toEqual({ status: 'done' })
      expect(mockedSet).toHaveBeenCalledWith('provisioned', true)
      expect(mockedSet).not.toHaveBeenCalledWith('provisioned', false)
    })

    test('a ready win64 bottle is NOT recreated — idempotent short-circuit still holds', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      setBottleFs({ conf: true, steamExe: true, steamSetupExe: false })
      mockedReadFileSync.mockReturnValue('"WineArch" = "win64"')

      const result = await provisionBottle({ bottleName: 'GameLibSteam' })

      expect(result).toEqual({ status: 'done' })
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(mockedDownloadFile).not.toHaveBeenCalled()
    })

    // ── GAP-17-CEF-RECREATE-RUNNING: WINEPREFIX-scoped wineserver -k before delete ──
    // Helper: arrange a win32 bottle whose delete/create side-effects mutate
    // `flags`, so provisionBottle runs the full recreate path.
    function arrangeWin32Recreate(flags: FsFlags) {
      setBottleFs(flags)
      mockedReadFileSync.mockReturnValue('"WineArch" = "win32"')
      mockedSpawnAsync.mockImplementation(
        async (_bin: string, argv: string[]) => {
          if (argv.includes('--delete')) {
            flags.conf = false
            flags.steamExe = false
          } else if (argv.includes('--create')) {
            flags.conf = true
          }
          return { code: 0, stdout: '', stderr: '' }
        }
      )
    }

    test('GAP-17-CEF-RECREATE-RUNNING: win32 recreate runs a wineserver -k BEFORE cxbottle --delete', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      arrangeWin32Recreate({ conf: true, steamExe: true, steamSetupExe: false })

      await provisionBottle({ bottleName: 'GameLibSteam' })

      const killIdx = mockedSpawnAsync.mock.calls.findIndex((c) =>
        String(c[0]).endsWith('/bin/wineserver')
      )
      const deleteIdx = mockedSpawnAsync.mock.calls.findIndex((c) =>
        (c[1] as string[]).includes('--delete')
      )
      expect(killIdx).toBeGreaterThanOrEqual(0)
      expect(deleteIdx).toBeGreaterThanOrEqual(0)
      // Ordering by real invocation sequence: kill must precede delete.
      expect(mockedSpawnAsync.mock.invocationCallOrder[killIdx]).toBeLessThan(
        mockedSpawnAsync.mock.invocationCallOrder[deleteIdx]
      )
    })

    test('GAP-17-CEF-RECREATE-RUNNING: wineserver -k is scoped to the target bottle WINEPREFIX (never the shared GameLib bottle) and sets CX_ROOT', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      arrangeWin32Recreate({ conf: true, steamExe: true, steamSetupExe: false })

      await provisionBottle({ bottleName: 'GameLibSteam' })

      const killCall = mockedSpawnAsync.mock.calls.find((c) =>
        String(c[0]).endsWith('/bin/wineserver')
      )
      expect(killCall).toBeDefined()
      // Binary resolves under the CrossOver bin dir (same dir as cxbottle).
      expect(String(killCall![0])).toMatch(/\/bin\/wineserver$/)
      // args are discrete words — never a shell string (T-17-01).
      expect(killCall![1]).toEqual(['-k'])
      // SCOPE-FENCE (T-17-DoS): WINEPREFIX is the dedicated Steam bottle's own
      // dir, not the shared GameLib GOG/Epic bottle, and never unset/empty.
      const opts = killCall![2] as { env: NodeJS.ProcessEnv }
      expect(opts.env.WINEPREFIX).toBe(getBottleDir('GameLibSteam'))
      expect(opts.env.WINEPREFIX).not.toBe(getBottleDir('GameLib'))
      expect(opts.env.WINEPREFIX).toContain('GameLibSteam')
      expect(opts.env.CX_ROOT).toBeTruthy()
    })

    test('GAP-17-CEF-RECREATE-RUNNING: wineserver -k is NOT spawned when the recreate branch is not taken (win64 bottle)', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      const flags: FsFlags = {
        conf: false,
        steamExe: false,
        steamSetupExe: false
      }
      setBottleFs(flags)
      mockedReadFileSync.mockReturnValue('"WineArch" = "win64"')
      mockedSpawnAsync.mockImplementation(async () => {
        flags.conf = true
        return { code: 0, stdout: '', stderr: '' }
      })

      await provisionBottle({ bottleName: 'GameLibSteam' })

      const killCall = mockedSpawnAsync.mock.calls.find((c) =>
        String(c[0]).endsWith('/bin/wineserver')
      )
      expect(killCall).toBeUndefined()
    })
  })

  describe('tellBottledSteamTo{Install,Launch,Uninstall}', () => {
    const BAD_APP_ID = '123; rm -rf /'
    const GOOD_APP_ID = '440'

    test('rejects a non-numeric appId for install without calling runWineCommand', async () => {
      const result = await tellBottledSteamToInstall(BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('rejects a non-numeric appId for launch without calling runWineCommand', async () => {
      const result = await tellBottledSteamToLaunch(BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('rejects a non-numeric appId for uninstall without calling runWineCommand', async () => {
      const result = await tellBottledSteamToUninstall(BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('returns an error (no spawn) when the bottle is not provisioned', async () => {
      mockedExistsSync.mockReturnValue(false) // isBottleReady() -> false (neither conf nor steam.exe)

      const installResult = await tellBottledSteamToInstall(GOOD_APP_ID)
      const launchResult = await tellBottledSteamToLaunch(GOOD_APP_ID)
      const uninstallResult = await tellBottledSteamToUninstall(GOOD_APP_ID)

      expect(installResult.status).toBe('error')
      expect(launchResult.status).toBe('error')
      expect(uninstallResult.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('returns an error (no spawn) when the bottle is half-provisioned (conf exists, steam.exe missing)', async () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('cxbottle.conf')
      )

      const installResult = await tellBottledSteamToInstall(GOOD_APP_ID)

      expect(installResult.status).toBe('error')
      expect(installResult.error).toMatch(/not ready/)
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('launch dispatches -applaunch <appId> as discrete argv elements targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true) // isBottleReady() -> true (conf + steam.exe)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToLaunch(GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(
        getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME)
      )
      expect(commandParts).toContain('-applaunch')
      expect(commandParts).toContain(GOOD_APP_ID)
    })

    test('install dispatches steam://install/<appId> targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToInstall(GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(
        getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME)
      )
      expect(commandParts.some((p: string) => p.includes(GOOD_APP_ID))).toBe(
        true
      )
    })

    test('uninstall dispatches steam://uninstall/<appId> targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToUninstall(GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(
        getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME)
      )
      expect(commandParts.some((p: string) => p.includes(GOOD_APP_ID))).toBe(
        true
      )
    })
  })

  // ── GAP C (17-16): leak-safe raise loop ────────────────────────────────────
  describe('raise-loop leak safety (__stopBottledRaiseLoops)', () => {
    const flushMicrotasks = async (times = 10) => {
      for (let i = 0; i < times; i++) await Promise.resolve()
    }

    test('a fired raise loop schedules a retry timer that __stopBottledRaiseLoops clears (jest.getTimerCount() returns to 0)', async () => {
      // Ready bottle so the install dispatch reaches `void raiseInstallerWindow`.
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      jest.useFakeTimers()
      // Fire-and-forget, exactly as dispatchToBottledSteam does. The raise loop
      // awaits the (mocked) isMac import, then schedules the first unref'd
      // sleep(1500) retry timer.
      void tellBottledSteamToInstall('440')
      await flushMicrotasks()

      // The pending retry timer is what previously survived Jest teardown.
      expect(jest.getTimerCount()).toBeGreaterThan(0)

      // The teardown hook cancels the loop and clears every tracked timer.
      __stopBottledRaiseLoops()
      expect(jest.getTimerCount()).toBe(0)

      jest.useRealTimers()
    })

    // debug/steam-bottle-uninstall-reverts: previously 'uninstall' raised NO
    // window at all — Steam's own confirm dialog was left invisible behind
    // GameLib's window, so it was never confirmed and the ACF poller's own
    // grace-window fallback silently reverted the badge to installed ~60s
    // later. Regression guard: uninstall must schedule a raise loop exactly
    // like install does.
    test('a fired uninstall dispatch ALSO schedules a raise-loop retry timer (regression: uninstall previously raised no window)', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      jest.useFakeTimers()
      void tellBottledSteamToUninstall('440')
      await flushMicrotasks()

      expect(jest.getTimerCount()).toBeGreaterThan(0)

      __stopBottledRaiseLoops()
      expect(jest.getTimerCount()).toBe(0)

      jest.useRealTimers()
    })
  })

  // ── quick/260815-vvz Task 2: raise-loop MISS branch calls app.hide() ───────
  //
  // IMPORTANT: these two tests are GREEN against the code as it stood BEFORE this plan's fix
  // and therefore PROVE NOTHING about defect 1 (the dynamic-import bypass). Under ts-jest/CJS,
  // `await import('electron')` downlevels to a `require()` through jest's own module registry,
  // which resolves to the `jest.mock('backend/platform', ...)` factory above -- so `app` was never
  // `undefined` here even when bottle.ts's source still had the broken dynamic import. The
  // production failure lived only in the esbuild output (a native ESM dynamic import that
  // bypasses `Module._load`), which only `../../sidecar/__tests__/externalDynamicImportGate.test.ts`
  // (the AST gate) and Task 3's production-shape `grep` check can see. Do not mistake these two
  // tests for the defect-1 guard, and do not delete the AST gate as "redundant" with these --
  // they cover a DIFFERENT property (the miss branch's behavioral shape once `app.hide` is
  // reachable at all), not the compiled-artifact bypass.
  describe('raise-loop MISS branch falls back to app.hide() (behavioral guard, not a defect-1 prover)', () => {
    test('after all 12 poll iterations miss, app.hide() is called exactly once', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)
      // Default mockedSpawnAsync resolves { stdout: '' } (set in the outer beforeEach) -- tryRaise
      // reads an empty/'' stdout as a miss, so every one of the 12 poll attempts misses.

      jest.useFakeTimers()
      void tellBottledSteamToUninstall('440')

      for (let i = 0; i < 12; i++) {
        await jest.advanceTimersByTimeAsync(1500)
      }
      // Flush any remaining microtasks queued by the final tryRaise() call.
      await Promise.resolve()
      await Promise.resolve()

      expect(mockedAppHide).toHaveBeenCalledTimes(1)

      __stopBottledRaiseLoops()
      jest.useRealTimers()
    })

    test('the miss is logged with the falling-back-to-app.hide() message', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      jest.useFakeTimers()
      void tellBottledSteamToUninstall('440')

      for (let i = 0; i < 12; i++) {
        await jest.advanceTimersByTimeAsync(1500)
      }
      await Promise.resolve()
      await Promise.resolve()

      expect(mockedLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('falling back to app.hide()'),
        'Steam'
      )

      __stopBottledRaiseLoops()
      jest.useRealTimers()
    })
  })

  // ── 24-04: dedicated bridge bottle provisioning ───────────────────────────
  describe('bridge bottle (24-04)', () => {
    test('DEFAULT_BRIDGE_BOTTLE_NAME is distinct from DEFAULT_STEAM_BOTTLE_NAME (Pitfall 1)', () => {
      expect(DEFAULT_BRIDGE_BOTTLE_NAME).not.toBe(DEFAULT_STEAM_BOTTLE_NAME)
      expect(DEFAULT_BRIDGE_BOTTLE_NAME).toBe('GameLibSteamBridge')
    })

    test('provisionBridgeBottle source contains NO SteamSetup.exe / STEAM_SETUP_EXE_URL reference (R6 grep guard)', () => {
      const source = readRealFile(joinPath(__dirname, '../bottle.ts'), 'utf8')
      const fnStart = source.indexOf(
        'export async function provisionBridgeBottle'
      )
      expect(fnStart).toBeGreaterThan(-1)
      // provisionBridgeBottle is the LAST export in bottle.ts — slicing to
      // EOF isolates exactly its own source text (docstring + body).
      const fnSource = source.slice(fnStart)
      expect(fnSource).not.toContain('SteamSetup.exe')
      expect(fnSource).not.toContain('STEAM_SETUP_EXE_URL')
    })

    describe('isBridgeBottleReady', () => {
      test('is true when cxbottle.conf exists for the bridge bottle — even with NO steam.exe present (R6: never requires a bottled Steam client)', () => {
        mockedExistsSync.mockImplementation((path: string) => {
          if (path.includes('cxbottle.conf')) return true
          return false
        })

        expect(isBridgeBottleReady()).toBe(true)
        expect(isBridgeBottleReady(DEFAULT_BRIDGE_BOTTLE_NAME)).toBe(true)
      })

      test('is false when the bridge bottle has not been created', () => {
        mockedExistsSync.mockReturnValue(false)

        expect(isBridgeBottleReady()).toBe(false)
      })

      test('resolves DEFAULT_BRIDGE_BOTTLE_NAME by default, not the stored Phase 17 bottle name', () => {
        const seenPaths: string[] = []
        mockedExistsSync.mockImplementation((path: string) => {
          seenPaths.push(path)
          return false
        })
        mockedGetNodefault.mockReturnValue(DEFAULT_STEAM_BOTTLE_NAME)

        isBridgeBottleReady()

        expect(
          seenPaths.some((p) => p.includes(DEFAULT_BRIDGE_BOTTLE_NAME))
        ).toBe(true)
        expect(
          seenPaths.some(
            (p) =>
              p.includes(DEFAULT_STEAM_BOTTLE_NAME) &&
              !p.includes(DEFAULT_BRIDGE_BOTTLE_NAME)
          )
        ).toBe(false)
      })
    })

    describe('getBridgeBottleSettings', () => {
      test('resolves the bridge bottle name, not GameLibSteam', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })

        const settings = getBridgeBottleSettings()

        expect(settings.wineCrossoverBottle).toBe(DEFAULT_BRIDGE_BOTTLE_NAME)
        expect(settings.wineCrossoverBottle).not.toBe(DEFAULT_STEAM_BOTTLE_NAME)
      })

      test('never reads the stored steamBottleConfigStore bottle-name override', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
        mockedGetNodefault.mockReturnValue('some-other-bottle')

        const settings = getBridgeBottleSettings()

        expect(settings.wineCrossoverBottle).toBe(DEFAULT_BRIDGE_BOTTLE_NAME)
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

        const settings = getBridgeBottleSettings()

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

        const settings = getBridgeBottleSettings()

        expect(settings.wineVersion).toEqual(gptkGlobalWine)
      })

      test('D-UAT-24-06: stays synchronous and still sets wineCrossoverBottle to the bridge default', () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: gptkGlobalWine }) as GameSettings
        })
        mockedExistsSync.mockImplementation((path: string) =>
          path.endsWith('/CrossOver/bin/wine')
        )

        const result = getBridgeBottleSettings()

        expect(result).not.toBeInstanceOf(Promise)
        expect(result.wineCrossoverBottle).toBe(DEFAULT_BRIDGE_BOTTLE_NAME)
      })
    })

    describe('provisionBridgeBottle', () => {
      test('rejects an unsafe bottle name and does NOT call cxbottle', async () => {
        mockedGetNodefault.mockReturnValue(undefined)

        const result = await provisionBridgeBottle({ bottleName: 'a/../b' })

        expect(result.status).toBe('error')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('D-08: rejects a non-CrossOver wineVersion (toolkit/GPTK) before any cxbottle call', async () => {
        const gptk: WineInstallation = {
          bin: '/usr/bin/gptk-wine',
          name: 'Game Porting Toolkit',
          type: 'toolkit'
        }

        const result = await provisionBridgeBottle({ wineVersion: gptk })

        expect(result.status).toBe('error')
        expect(result.error).toMatch(/crossover/i)
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('D-08: accepts a CrossOver wineVersion', async () => {
        const crossover: WineInstallation = {
          bin: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
          name: 'CrossOver',
          type: 'crossover'
        }
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation(async (bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })

        const result = await provisionBridgeBottle({ wineVersion: crossover })

        expect(result.status).toBe('done')
      })

      test('short-circuits to {status:"done"} when the bridge bottle already exists — no cxbottle call', async () => {
        mockedExistsSync.mockImplementation((path: string) =>
          path.includes('cxbottle.conf')
        )

        const result = await provisionBridgeBottle()

        expect(result).toEqual({ status: 'done' })
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('creates the bridge bottle via cxbottle --create --template win10_64 (argv-form)', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation(async (bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })

        const result = await provisionBridgeBottle()

        expect(result.status).toBe('done')
        expect(mockedSpawnAsync).toHaveBeenCalledWith(
          expect.stringContaining('cxbottle'),
          expect.arrayContaining([
            '--create',
            '--bottle',
            DEFAULT_BRIDGE_BOTTLE_NAME,
            '--template',
            'win10_64'
          ])
        )
      })

      test('uses a custom bottleName when provided', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation(async (bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })

        const result = await provisionBridgeBottle({
          bottleName: 'CustomBridge'
        })

        expect(result.status).toBe('done')
        expect(mockedSpawnAsync).toHaveBeenCalledWith(
          expect.stringContaining('cxbottle'),
          expect.arrayContaining(['--bottle', 'CustomBridge'])
        )
      })

      test('never calls downloadFile — no Windows Steam installer is fetched (R6)', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation(async (bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })

        await provisionBridgeBottle()

        expect(mockedDownloadFile).not.toHaveBeenCalled()
        expect(mockedRunWineCommand).not.toHaveBeenCalled()
      })

      test('returns an error when cxbottle create does not produce cxbottle.conf', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockResolvedValue({
          code: 1,
          stdout: '',
          stderr: 'boom'
        })

        const result = await provisionBridgeBottle()

        expect(result.status).toBe('error')
      })

      test('returns an error when cxbottle create throws', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockRejectedValue(new Error('spawn failed'))

        const result = await provisionBridgeBottle()

        expect(result.status).toBe('error')
        expect(result.error).toContain('spawn failed')
      })

      test('kills the wineserver (best-effort) after a successful create, scoped to the bridge bottle prefix', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation(async (bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })

        await provisionBridgeBottle()

        const wineserverCall = mockedSpawnAsync.mock.calls.find(([bin]) =>
          String(bin).includes('wineserver')
        )
        expect(wineserverCall).toBeDefined()
        expect(wineserverCall?.[1]).toEqual(['-k'])
        expect(wineserverCall?.[2]?.env?.WINEPREFIX).toContain(
          DEFAULT_BRIDGE_BOTTLE_NAME
        )
      })
    })
  })
})
