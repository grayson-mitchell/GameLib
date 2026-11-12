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
import { userHome } from 'backend/constants/paths'
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
import { checkWineBeforeLaunch, downloadFile } from 'backend/utils'
import { createSteamBottle } from '../bottle'
import { getBottleDir } from 'backend/storeManagers/steam/bottleDirs'
import { createTestSteamLaunchRuntime } from 'backend/testUtils/testSteamLaunchRuntime'
import { createGlobalTimerClock } from 'backend/testUtils/globalTimerClock'
import { provisionBottle } from '../provisionBottle'
import { createTestStores } from 'backend/testUtils/testServices'
import { STEAM_SETUP_EXE_URL } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'
import type { Stores } from 'backend/services/types'
import { at } from './fixtures/indexed'

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
const paths = { userHome, steamSupportPath: '/test/steam_store' }

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
const mockedRunWineCommand = jest.fn()
const mockedDownloadFile = downloadFile as jest.Mock
// checkWineBeforeLaunch is mocked in this file, so the store slices are never read.
const provisionDeps = {
  // Reads through the recording config mock (66.3-08: provisionBottle takes the slice).
  config: { getSettings: () => mockedGlobalConfigGet().getSettings() },
  stores: createTestStores(),
  steamBottle,
  paths,
  engineRuntime,
  steamLaunchRuntime,
  spawnAsync: mockedSpawnAsync,
  commandRunner: { runWineCommand: mockedRunWineCommand }
} as unknown as Parameters<typeof provisionBottle>[0]
const mockedCheckWineBeforeLaunch = checkWineBeforeLaunch as jest.Mock

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

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'a/../b'
      })

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

        const result = await provisionBottle(provisionDeps, {
          bottleName: 'GameLib'
        })

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

        const result = await provisionBottle(provisionDeps, {
          bottleName: '  GameLib  '
        })

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

        const result = await provisionBottle(provisionDeps, {
          bottleName: 'GameLib'
        })

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
        mockedSpawnAsync.mockImplementation(() => {
          flags.conf = true
          return Promise.resolve({ code: 0, stdout: '', stderr: '' })
        })

        const result = await provisionBottle(provisionDeps, {
          bottleName: 'GameLibSteam'
        })

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
        mockedSpawnAsync.mockImplementation(() => {
          flags.conf = true
          return Promise.resolve({ code: 0, stdout: '', stderr: '' })
        })

        const result = await provisionBottle(provisionDeps, {
          bottleName: 'GameLibSteam'
        })

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

        const result = await provisionBottle(provisionDeps, {
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
        mockedSpawnAsync.mockImplementation(() => {
          flags.conf = true
          return Promise.resolve({ code: 0, stdout: '', stderr: '' })
        })
        const crossover: WineInstallation = {
          bin: '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/wine',
          name: 'CrossOver',
          type: 'crossover'
        }

        const result = await provisionBottle(provisionDeps, {
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

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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
      mockedSpawnAsync.mockImplementation(() => {
        flags.conf = true
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      })

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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
      mockedSpawnAsync.mockImplementation(() => {
        flags.conf = true
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      })

      await provisionBottle(provisionDeps, { bottleName: 'GameLibSteam' })

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
      mockedSpawnAsync.mockImplementation(() => {
        flags.conf = true
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      })

      await provisionBottle(provisionDeps, { bottleName: 'GameLibSteam' })

      expect(mockedMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('redist'),
        { recursive: true }
      )
      const mkdirOrder = at(mockedMkdirSync.mock.invocationCallOrder, 0)
      const downloadOrder = at(mockedDownloadFile.mock.invocationCallOrder, 0)
      expect(mkdirOrder).toBeLessThan(downloadOrder)
    })

    test('resumes a half-provisioned bottle without re-running cxbottle create', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      // conf present, steam.exe absent — half-provisioned.
      setBottleFs({ conf: true, steamExe: false, steamSetupExe: false })

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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
      mockedSpawnAsync.mockImplementation(() => {
        flags.conf = true
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      })

      await provisionBottle(provisionDeps, { bottleName: 'GameLibSteam' })

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

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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
      mockedSpawnAsync.mockImplementation(() => {
        flags.conf = true
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      })

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

      expect(result).toEqual({ status: 'done' })
      expect(mockedSet).toHaveBeenCalledWith('provisioned', true)
      expect(mockedSet).not.toHaveBeenCalledWith('provisioned', false)
    })

    test('a ready win64 bottle is NOT recreated — idempotent short-circuit still holds', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      setBottleFs({ conf: true, steamExe: true, steamSetupExe: false })
      mockedReadFileSync.mockReturnValue('"WineArch" = "win64"')

      const result = await provisionBottle(provisionDeps, {
        bottleName: 'GameLibSteam'
      })

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

      await provisionBottle(provisionDeps, { bottleName: 'GameLibSteam' })

      const killIdx = mockedSpawnAsync.mock.calls.findIndex((c) =>
        String(c[0]).endsWith('/bin/wineserver')
      )
      const deleteIdx = mockedSpawnAsync.mock.calls.findIndex((c) =>
        (c[1] as string[]).includes('--delete')
      )
      expect(killIdx).toBeGreaterThanOrEqual(0)
      expect(deleteIdx).toBeGreaterThanOrEqual(0)
      // Ordering by real invocation sequence: kill must precede delete.
      expect(
        at(mockedSpawnAsync.mock.invocationCallOrder, killIdx)
      ).toBeLessThan(at(mockedSpawnAsync.mock.invocationCallOrder, deleteIdx))
    })

    test('GAP-17-CEF-RECREATE-RUNNING: wineserver -k is scoped to the target bottle WINEPREFIX (never the shared GameLib bottle) and sets CX_ROOT', async () => {
      mockedGetNodefault.mockReturnValue(undefined)
      arrangeWin32Recreate({ conf: true, steamExe: true, steamSetupExe: false })

      await provisionBottle(provisionDeps, { bottleName: 'GameLibSteam' })

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
      mockedSpawnAsync.mockImplementation(() => {
        flags.conf = true
        return Promise.resolve({ code: 0, stdout: '', stderr: '' })
      })

      await provisionBottle(provisionDeps, { bottleName: 'GameLibSteam' })

      const killCall = mockedSpawnAsync.mock.calls.find((c) =>
        String(c[0]).endsWith('/bin/wineserver')
      )
      expect(killCall).toBeUndefined()
    })
  })
})
