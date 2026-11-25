/**
 * Unit tests for the dedicated Steam CrossOver bottle foundation module
 * (Phase 17 Plan 02) — path resolution, the provisioned-state signal, the
 * T-17-01 sanitizer chokepoint, and the GameSettings composition helper.
 *
 * Mock strategy follows steam/__tests__/games.test.ts:
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in each test
 *  - graceful-fs mocked (existsSync) — no real filesystem access
 */
import { engineSelectionView } from 'backend/enginewine/selectionView'
import { createFakeBottleRust } from 'backend/testUtils/fakeBottleRust'
import { setSteamEngineSelection } from '../engine/engineSync'
import {
  RUST_ENGINE_BOTTLE_CANCEL_CREATE,
  RUST_ENGINE_BOTTLE_CREATE_FALLBACK,
  RUST_ENGINE_BOTTLE_KILL_WINESERVER,
  RUST_ENGINE_BOTTLE_RECORD_PINNED,
  RUST_ENGINE_BOTTLE_REMOVE_CREATED,
  RUST_SAFETY_CHECK_REMOVAL,
  RUST_SAFETY_REMOVE_TREE
} from 'common/types/sidecarTransport'
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
import { basename as basenameOf, join as joinPath } from 'node:path'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'
import { downloadFile } from 'backend/utils'
import * as bottlesModule from 'backend/enginewine/bottles'
import { ENGINE_PINS, getBottleDir } from 'backend/enginewine/twin'
import {
  createTestManagers,
  createTestStores
} from 'backend/testUtils/testServices'
import {
  fakeSafetyRustInvoke,
  type FakeSafetyOptions
} from 'backend/testUtils/fakeSafetyRust'
import type { RequestRustInvoke } from 'backend/host'
import {
  createSteamBottle,
  bottleWineArch,
  DEFAULT_BRIDGE_BOTTLE_NAME,
  CROSSOVER_CREATE_FAILED,
  CROSSOVER_CREATE_TIMEOUT,
  CROSSOVER_MISSING,
  PROVISION_ABORTED
} from '../bottle'
import {
  provisionBridgeBottle,
  discardNewBridgeBottle,
  removePerGameBridgeBottle,
  stopPerGameBridgeBottle,
  endPerGameBridgeBottleSession,
  killBridgeBottleWineServer,
  type BottleRemovalDeps
} from '../bridgeBottleLifecycle'
import { getBridgeBottleSettings } from '../bridgeBottle'
import type { DrmBridgeRunner } from '../bridgeBottle'
import { createTestSteamLaunchRuntime } from 'backend/testUtils/testSteamLaunchRuntime'
import { createGlobalTimerClock } from 'backend/testUtils/globalTimerClock'
const setEngineSelection = setSteamEngineSelection
const clearEngineSelection = (key: string) => engineSelectionView.clear(key)
import type { NonCrossoverSelection } from 'common/types/engine'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'
import type { ManagerDeps, Stores } from 'backend/services/types'

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
  downloadFile: jest.fn()
}))

// GAP C (17-16): force isMac true so the macOS raise poll loop is exercised
// deterministically on every host (the loop is dynamically imported by
// bottle.ts). isSnap is provided for the environment consumers.
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
// 87-42: the selections the bridge reads are the process-wide view. The bottle kill, removal, creation and markers are
// Rust's, answered here by `fakeBottleRust`, which records the calls (a case that needs another answer scripts it).
const bottleRustOthers: Record<string, (arg: unknown) => unknown> = {}
const bottleRust = createFakeBottleRust({
  others: bottleRustOthers,
  crossoverBinDir: () => cxState.binDir
})
beforeEach(() => {
  bottleRust.calls.length = 0
  for (const key of Object.keys(bottleRustOthers)) delete bottleRustOthers[key]
})
/** The `engine_bottle_kill_wineserver` calls the code under test sent, in order. */
const killCalls = () =>
  bottleRust.calls
    .filter((c) => c.channel === RUST_ENGINE_BOTTLE_KILL_WINESERVER)
    .map(
      (c) =>
        c.arg as {
          bottleName: string
          wineserverBin: string
          extraEnv: Record<string, string>
          timeoutMs?: number
        }
    )
const rustTransport = {
  requestRustInvoke: bottleRust.requestRustInvoke
}
// One per-boot Steam launch runtime for this suite, on the global-timer clock so jest fake timers drive it (66.4-06).
const steamLaunchRuntime = createTestSteamLaunchRuntime({
  clock: createGlobalTimerClock()
})
const { setDrmBridgeRunner, clearDrmBridgeRunner } =
  steamLaunchRuntime.drmRunners
const { userHome } = createContainedHomeAppPaths()
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
  paths,
  stores: createTestStores({ steam: { steamBottleConfigStore } as never }),
  config: { getSettings: () => mockedGlobalConfigGet().getSettings() },
  crossover
})
// The config slice the lifecycle guards and the settings resolvers read (66.3-08), through the mock.
const bridgeDeps = {
  config: { getSettings: () => mockedGlobalConfigGet().getSettings() },
  steamBottle,
  paths,
  steamLaunchRuntime
}
// Recording fakes handed to the code under test through its deps slice (66.1 R5).
const mockedSpawnAsync = jest.fn()
// Phase 82: the removal asks the Rust guard first; every manager answers an empty library so the
// known-installs list reads, and the fake answers the two safety channels (`yes` unless a case says so).
const emptyLibraries = Object.fromEntries(
  Object.entries(createTestManagers().library).map(([runner, manager]) => [
    runner,
    { ...manager, getListOfGames: () => [] }
  ])
) as unknown as ManagerDeps['libraryManagers']
// One transport on the deps: the two safety channels go to the safety fake, every other channel to the bottle fake.
const withSafety = (
  safetyRustInvoke: RequestRustInvoke = fakeSafetyRustInvoke().requestRustInvoke
) =>
  ({
    spawnAsync: mockedSpawnAsync,
    config: bridgeDeps.config,
    steamBottle,
    paths,
    steamLaunchRuntime,
    libraryManagers: emptyLibraries,
    requestRustInvoke: ((channel: string, args: unknown[]) =>
      channel === RUST_SAFETY_CHECK_REMOVAL ||
      channel === RUST_SAFETY_REMOVE_TREE
        ? (safetyRustInvoke as (c: string, a: unknown[]) => unknown)(
            channel,
            args
          )
        : (
            bottleRust.requestRustInvoke as (c: string, a: unknown[]) => unknown
          )(channel, args)) as RequestRustInvoke
  }) as unknown as BottleRemovalDeps & {
    config: { getSettings(): GameSettings }
  }
const spawnDeps = withSafety()
const depsWithSafety = (options: FakeSafetyOptions) =>
  withSafety(fakeSafetyRustInvoke(options).requestRustInvoke)
const mockedDownloadFile = downloadFile as jest.Mock
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
    mockedRunWineCommand.mockReset()

    // Sensible defaults so provisionBottle()/dispatch tests that don't care
    // about GlobalConfig still have a valid GameSettings to compose from.
    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
    })
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    mockedDownloadFile.mockResolvedValue(undefined)
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

  describe('bridge bottle (24-04)', () => {
    test('provisionBridgeBottle source contains NO SteamSetup.exe / STEAM_SETUP_EXE_URL reference (R6 grep guard)', () => {
      const source = readRealFile(
        joinPath(__dirname, '../bridgeBottleLifecycle.ts'),
        'utf8'
      )
      const fnStart = source.indexOf(
        'export async function provisionBridgeBottle'
      )
      expect(fnStart).toBeGreaterThan(-1)
      // provisionBridgeBottle is the LAST export in bridgeBottleLifecycle.ts — slicing to
      // EOF isolates exactly its own source text (docstring + body).
      const fnSource = source.slice(fnStart)
      expect(fnSource).not.toContain('SteamSetup.exe')
      expect(fnSource).not.toContain('STEAM_SETUP_EXE_URL')
    })

    describe('provisionBridgeBottle', () => {
      test('rejects an unsafe bottle name and does NOT call cxbottle', async () => {
        mockedGetNodefault.mockReturnValue(undefined)

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: 'a/../b'
        })

        expect(result.status).toBe('error')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('D-08: rejects a non-CrossOver wineVersion (toolkit/GPTK) before any cxbottle call', async () => {
        const gptk: WineInstallation = {
          bin: '/usr/bin/gptk-wine',
          name: 'Game Porting Toolkit',
          type: 'toolkit'
        }

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME,
          wineVersion: gptk
        })

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

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME,
          wineVersion: crossover
        })

        expect(result.status).toBe('done')
      })

      test('short-circuits to {status:"done"} when the bridge bottle already exists — no cxbottle call', async () => {
        mockedExistsSync.mockImplementation((path: string) =>
          path.includes('cxbottle.conf')
        )

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME
        })

        expect(result).toEqual({ status: 'done', createdHere: false })
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

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME
        })

        expect(result.status).toBe('done')
        expect(mockedSpawnAsync).toHaveBeenCalledWith(
          expect.stringContaining('cxbottle'),
          expect.arrayContaining([
            '--create',
            '--bottle',
            DEFAULT_BRIDGE_BOTTLE_NAME,
            '--template',
            'win10_64'
          ]),
          expect.anything()
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

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: 'CustomBridge'
        })

        expect(result.status).toBe('done')
        expect(mockedSpawnAsync).toHaveBeenCalledWith(
          expect.stringContaining('cxbottle'),
          expect.arrayContaining(['--bottle', 'CustomBridge']),
          expect.anything()
        )
      })

      // quick/261016-u1w (D-C/D-E): a per-game bottle name provisions exactly
      // like any other named bottle — no special-casing in provisionBridgeBottle.
      test('provisions a per-game bottle name via cxbottle --bottle <name>', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation((bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: 'GameLibSteamBridge-206040'
        })

        expect(result.status).toBe('done')
        expect(mockedSpawnAsync).toHaveBeenCalledWith(
          expect.stringContaining('cxbottle'),
          expect.arrayContaining(['--bottle', 'GameLibSteamBridge-206040']),
          expect.anything()
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

        await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME
        })

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

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME
        })

        expect(result.status).toBe('error')
      })

      test('returns an error when cxbottle create throws', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockRejectedValue(new Error('spawn failed'))

        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME
        })

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

        await provisionBridgeBottle(spawnDeps, {
          bottleName: DEFAULT_BRIDGE_BOTTLE_NAME
        })

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

    // quick/261016-u1w (D-D): deletes exactly GameLibSteamBridge-<appId>,
    // behind a guard chain that can never name any other bottle.
    describe('removePerGameBridgeBottle', () => {
      const perGameName = 'GameLibSteamBridge-206040'
      const perGameDir = getBottleDir(paths, perGameName)

      beforeEach(() => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
      })

      test('present dir: stops the wineserver (WINEPREFIX exactly the per-game bottle dir), runs cxbottle --bottle <name> --delete --force, and returns removed with no rmSync', async () => {
        let present = true
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir && present
        )
        mockedSpawnAsync.mockImplementation((bin: string) => {
          if (String(bin).includes('cxbottle')) {
            present = false
          }
          return Promise.resolve({ code: 0, stdout: '', stderr: '' })
        })

        const result = await removePerGameBridgeBottle(spawnDeps, '206040')

        expect(result).toEqual({ status: 'removed' })
        const wineserverCall = mockedSpawnAsync.mock.calls.find(([bin]) =>
          String(bin).includes('wineserver')
        )
        expect(wineserverCall).toBeDefined()
        expect(wineserverCall?.[1]).toEqual(['-k'])
        expect(wineserverCall?.[2]?.env?.WINEPREFIX).toBe(perGameDir)
        const deleteCall = mockedSpawnAsync.mock.calls.find(([bin]) =>
          String(bin).includes('cxbottle')
        )
        expect(deleteCall).toBeDefined()
        expect(deleteCall?.[1]).toEqual([
          '--bottle',
          perGameName,
          '--delete',
          '--force'
        ])
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('when the dir survives cxbottle, the guarded delete runs and removal still succeeds', async () => {
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
        // The guarded delete is the safety channel: its reply is what makes the dir go away here.
        const safety = fakeSafetyRustInvoke()
        const result = await removePerGameBridgeBottle(
          withSafety((channel, args) => {
            if (channel === 'safety_remove_tree') {
              mockedExistsSync.mockImplementation(() => false)
            }
            return safety.requestRustInvoke(channel, args)
          }),
          '206040'
        )

        expect(result).toEqual({ status: 'removed' })
        // Pre-check, the WR-09 re-check after cxbottle, then guardedRemoveTree's own check and delete.
        expect(safety.calls.map((c) => c.channel)).toEqual([
          'safety_check_removal',
          'safety_check_removal',
          'safety_check_removal',
          'safety_remove_tree'
        ])
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('when the guarded delete fails and the dir still exists, returns error without throwing', async () => {
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

        const result = await removePerGameBridgeBottle(
          depsWithSafety({ rejectRemove: true }),
          '206040'
        )

        expect(result.status).toBe('error')
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('absent dir: returns absent with no spawnAsync and no rmSync', async () => {
        mockedExistsSync.mockReturnValue(false)

        const result = await removePerGameBridgeBottle(spawnDeps, '206040')

        expect(result).toEqual({ status: 'absent' })
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test.each(['', 'abc', '../1', '206040/..', ' '])(
        'rejects an invalid appId %j with no spawnAsync and no rmSync',
        async (appId) => {
          const result = await removePerGameBridgeBottle(spawnDeps, appId)

          expect(result.status).toBe('error')
          expect(mockedSpawnAsync).not.toHaveBeenCalled()
          expect(mockedRmSync).not.toHaveBeenCalled()
        }
      )

      test('refuses when the stored Phase 17 bottle name equals the per-game name (trimmed)', async () => {
        mockedGetNodefault.mockImplementation((key: string) =>
          key === 'bottleName' ? `  ${perGameName}  ` : undefined
        )
        mockedExistsSync.mockReturnValue(true)

        const result = await removePerGameBridgeBottle(spawnDeps, '206040')

        expect(result.status).toBe('error')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('refuses when the shared GOG/Epic bottle equals the per-game name (trimmed)', async () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: `  ${perGameName}  `
            }) as GameSettings
        })
        mockedExistsSync.mockReturnValue(true)

        const result = await removePerGameBridgeBottle(spawnDeps, '206040')

        expect(result.status).toBe('error')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('never spawns against or rmSyncs the legacy bridge bottle or the Phase 17 GameLibSteam bottle dir, across every case above', async () => {
        const legacyDir = getBottleDir(paths, DEFAULT_BRIDGE_BOTTLE_NAME)
        const steamDir = getBottleDir(paths, DEFAULT_STEAM_BOTTLE_NAME)
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })

        await removePerGameBridgeBottle(spawnDeps, '206040')

        for (const call of mockedSpawnAsync.mock.calls) {
          const [bin, args, opts] = call
          expect(bin).not.toBe(legacyDir)
          expect(bin).not.toBe(steamDir)
          if (Array.isArray(args)) {
            expect(args).not.toContain(legacyDir)
            expect(args).not.toContain(steamDir)
          }
          expect(opts?.env?.WINEPREFIX).not.toBe(legacyDir)
          expect(opts?.env?.WINEPREFIX).not.toBe(steamDir)
        }
        for (const call of mockedRmSync.mock.calls) {
          expect(call[0]).not.toBe(legacyDir)
          expect(call[0]).not.toBe(steamDir)
        }
      })

      test('source contains no reference to the Windows Steam installer (R6-style grep guard)', () => {
        const source = readRealFile(
          joinPath(__dirname, '../bridgeBottleLifecycle.ts'),
          'utf8'
        )
        const fnStart = source.indexOf(
          'export async function removePerGameBridgeBottle'
        )
        const fnEnd = source.indexOf(
          'export async function provisionBridgeBottle'
        )
        expect(fnStart).toBeGreaterThan(-1)
        expect(fnEnd).toBeGreaterThan(fnStart)
        const fnSource = source.slice(fnStart, fnEnd)
        expect(fnSource).not.toContain('SteamSetup.exe')
        expect(fnSource).not.toContain('STEAM_SETUP_EXE_URL')
      })
    })

    describe('stopPerGameBridgeBottle', () => {
      const perGameName = 'GameLibSteamBridge-206040'
      const perGameDir = getBottleDir(paths, perGameName)

      beforeEach(() => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
      })

      test('present dir: one wineserver -k scoped to the per-game WINEPREFIX; no cxbottle, no rmSync', async () => {
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )

        const result = await stopPerGameBridgeBottle(spawnDeps, '206040')

        expect(result).toEqual({ status: 'stopped' })
        const wineserverCalls = mockedSpawnAsync.mock.calls.filter(([bin]) =>
          String(bin).includes('wineserver')
        )
        expect(wineserverCalls).toHaveLength(1)
        expect(wineserverCalls[0][1]).toEqual(['-k'])
        expect(wineserverCalls[0][2]?.env?.WINEPREFIX).toBe(perGameDir)
        expect(wineserverCalls[0][2]?.env?.CX_ROOT).toBeTruthy()
        expect(
          mockedSpawnAsync.mock.calls.some(([bin]) =>
            String(bin).includes('cxbottle')
          )
        ).toBe(false)
        expect(mockedRmSync).not.toHaveBeenCalled()
      })

      test('non-numeric appId is refused with no spawn', async () => {
        mockedExistsSync.mockReturnValue(true)

        const result = await stopPerGameBridgeBottle(spawnDeps, 'abc')

        expect(result.status).toBe('refused')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('refuses when the stored Phase 17 bottle name equals the per-game name', async () => {
        mockedGetNodefault.mockImplementation((key: string) =>
          key === 'bottleName' ? `  ${perGameName}  ` : undefined
        )
        mockedExistsSync.mockReturnValue(true)

        const result = await stopPerGameBridgeBottle(spawnDeps, '206040')

        expect(result.status).toBe('refused')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('refuses when the shared GOG/Epic bottle equals the per-game name', async () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: perGameName
            }) as GameSettings
        })
        mockedExistsSync.mockReturnValue(true)

        const result = await stopPerGameBridgeBottle(spawnDeps, '206040')

        expect(result.status).toBe('refused')
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('absent dir: returns absent with no spawn', async () => {
        mockedExistsSync.mockReturnValue(false)

        const result = await stopPerGameBridgeBottle(spawnDeps, '206040')

        expect(result).toEqual({ status: 'absent' })
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
        expect(mockedRmSync).not.toHaveBeenCalled()
      })
    })

    describe('endPerGameBridgeBottleSession', () => {
      const perGameName = 'GameLibSteamBridge-206040'
      const perGameDir = getBottleDir(paths, perGameName)

      beforeEach(() => {
        mockedGetNodefault.mockReturnValue(undefined)
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () => ({ wineVersion: defaultWine }) as GameSettings
        })
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )
      })

      test('present dir: one bounded wineserver -k scoped to the per-game WINEPREFIX', async () => {
        const ok = await endPerGameBridgeBottleSession(
          spawnDeps,
          '206040',
          perGameName,
          20_000
        )

        expect(ok).toBe(true)
        const calls = mockedSpawnAsync.mock.calls.filter(([bin]) =>
          String(bin).includes('wineserver')
        )
        expect(calls).toHaveLength(1)
        expect(calls[0][1]).toEqual(['-k'])
        expect(calls[0][2]?.env?.WINEPREFIX).toBe(perGameDir)
        expect(calls[0][2]?.timeout).toBe(20_000)
      })

      test.each(['GameLib', 'GameLibSteamBridge', 'GameLibSteamBridge-999'])(
        'bottle %s is not this appId per-game bottle: false, no spawn',
        async (name) => {
          expect(
            await endPerGameBridgeBottleSession(spawnDeps, '206040', name, 1)
          ).toBe(false)
          expect(mockedSpawnAsync).not.toHaveBeenCalled()
        }
      )

      test('non-numeric appId: false, no spawn', async () => {
        expect(
          await endPerGameBridgeBottleSession(spawnDeps, 'abc', perGameName, 1)
        ).toBe(false)
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('shared bottle configured as the per-game name: false, no spawn', async () => {
        mockedGlobalConfigGet.mockReturnValue({
          getSettings: () =>
            ({
              wineVersion: defaultWine,
              wineCrossoverBottle: perGameName
            }) as GameSettings
        })
        expect(
          await endPerGameBridgeBottleSession(
            spawnDeps,
            '206040',
            perGameName,
            1
          )
        ).toBe(false)
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('absent dir: false, no spawn', async () => {
        mockedExistsSync.mockReturnValue(false)
        expect(
          await endPerGameBridgeBottleSession(
            spawnDeps,
            '206040',
            perGameName,
            1
          )
        ).toBe(false)
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      })

      test('spawn rejects: false', async () => {
        mockedSpawnAsync.mockRejectedValue(new Error('boom'))
        expect(
          await endPerGameBridgeBottleSession(
            spawnDeps,
            '206040',
            perGameName,
            1
          )
        ).toBe(false)
      })

      describe('H2: engine hint', () => {
        const HINT = '/abs/engine/bin/wineserver'
        const spawnedBins = () => [
          ...mockedSpawnAsync.mock.calls.map(([bin]) => String(bin)),
          ...killCalls().map((c) => c.wineserverBin)
        ]

        test('H2: hint wineserver is spawned with -k, USER=crossover and the bottle WINEPREFIX', async () => {
          mockedExistsSync.mockImplementation(
            (path: string) => path === perGameDir || path === HINT
          )
          const ok = await endPerGameBridgeBottleSession(
            spawnDeps,
            '206040',
            perGameName,
            20_000,
            { wineserverBin: HINT }
          )
          expect(ok).toBe(true)
          // The hinted wineserver is a non-CrossOver one, so Rust runs the kill with the bottle's own WINEPREFIX.
          expect(mockedSpawnAsync).not.toHaveBeenCalled()
          expect(killCalls()).toEqual([
            expect.objectContaining({
              bottleName: perGameName,
              wineserverBin: HINT,
              extraEnv: expect.objectContaining({ USER: 'crossover' })
            })
          ])
        })

        test('H2: registered non-CrossOver engine wins over the hint', async () => {
          const REG = '/pins/bin/wineserver'
          mockedExistsSync.mockImplementation(
            (path: string) =>
              path === perGameDir || path === HINT || path.startsWith('/pins/')
          )
          expect(
            setEngineSelection('206040', {
              kind: 'pinned',
              pinId: 'pin-1',
              reason: 'cx-missing',
              wineBin: '/pins/bin/wine',
              wineserverBin: REG,
              label: 'Pinned Wine',
              version: '9.0',
              dxvk: { dir: '/pins/dxvk', version: '2.4' }
            })
          ).toBe(true)
          try {
            await endPerGameBridgeBottleSession(
              spawnDeps,
              '206040',
              perGameName,
              20_000,
              {
                wineserverBin: HINT
              }
            )
          } finally {
            clearEngineSelection('206040')
          }
          expect(spawnedBins()).toContain(REG)
          expect(spawnedBins()).not.toContain(HINT)
        })

        test.each(['relative/wineserver', '/abs/missing/wineserver'])(
          'H2: unusable hint %s is ignored and the CrossOver arm runs',
          async (bin) => {
            await endPerGameBridgeBottleSession(
              spawnDeps,
              '206040',
              perGameName,
              20_000,
              {
                wineserverBin: bin
              }
            )
            expect(spawnedBins()).not.toContain(bin)
            expect(
              spawnedBins().filter((b) => b.includes('wineserver'))
            ).toHaveLength(1)
          }
        )
      })

      test('timeout kill (code null): false', async () => {
        mockedSpawnAsync.mockResolvedValue({
          code: null,
          stdout: '',
          stderr: ''
        })
        expect(
          await endPerGameBridgeBottleSession(
            spawnDeps,
            '206040',
            perGameName,
            1
          )
        ).toBe(false)
      })
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

  test('provisionBridgeBottle returns crossover-missing without spawning when no cxbottle resolves', async () => {
    cxState.binDir = undefined
    mockedExistsSync.mockReturnValue(false)
    const result = await provisionBridgeBottle(spawnDeps, {
      bottleName: 'GameLibSteamBridge'
    })
    expect(result.status).toBe('error')
    expect(result.errorCode).toBe('crossover-missing')
    expect(result.error).toMatch(/CrossOver is required/)
    expect(mockedSpawnAsync).not.toHaveBeenCalled()
    expect(mockedSet).not.toHaveBeenCalled()
  })

  test('spawns the cxbottle of the resolved (~/Applications) install, not /Applications', async () => {
    cxState.binDir = `${userHome}/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin`
    mockedExistsSync.mockReturnValue(false)
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    await provisionBridgeBottle(spawnDeps, { bottleName: 'GameLibSteamBridge' })
    expect(mockedSpawnAsync.mock.calls[0][0]).toBe(
      joinPath(
        userHome,
        'Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle'
      )
    )
  })
})

describe('Phase 59 engine registry', () => {
  const pinned: NonCrossoverSelection = {
    kind: 'pinned',
    pinId: 'pin-1',
    reason: 'cx-missing',
    wineBin: '/pins/bin/wine',
    wineserverBin: '/pins/bin/wineserver',
    label: 'Pinned Wine',
    version: '9.0',
    dxvk: { dir: '/pins/dxvk', version: '2.4' }
  }
  const bottle = 'GameLibSteamBridge-620'

  beforeAll(() => {
    cxState.binDir = CX_BIN_DIR
  })

  beforeEach(() => {
    mockedExistsSync.mockReset()
    mockedExistsSync.mockImplementation((p: string) =>
      String(p).startsWith('/pins/')
    )
    mockedGetNodefault.mockReset()
    mockedSpawnAsync.mockReset()
    mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
    mockedGlobalConfigGet.mockReset()
    mockedGlobalConfigGet.mockReturnValue({
      getSettings: () =>
        ({
          wineVersion: defaultWine,
          enviromentOptions: [
            { key: 'USER', value: 'mac' },
            { key: 'WINEPREFIX', value: '/x' },
            { key: 'CX_BOTTLE', value: 'x' },
            { key: 'CX_ROOT', value: 'x' },
            { key: 'WINELOADER', value: 'x' },
            { key: 'WINESERVER', value: 'x' },
            { key: 'WINEDEBUG', value: '+all' },
            { key: 'FOO', value: 'bar' }
          ]
        }) as unknown as GameSettings
    })
    clearEngineSelection('620')
    clearDrmBridgeRunner('620')
  })
  afterEach(() => {
    clearEngineSelection('620')
    clearDrmBridgeRunner('620')
  })

  test('unregistered: stock CrossOver settings', () => {
    const s = getBridgeBottleSettings(bridgeDeps, '620')
    expect(s.wineVersion.type).not.toBe('wine-staging')
    expect(s.wineVersion.bin).not.toBe(pinned.wineBin)
  })

  test('pinned selection yields wine settings with USER=crossover', () => {
    expect(setEngineSelection('620', pinned)).toBe(true)
    const s = getBridgeBottleSettings(bridgeDeps, '620')
    expect(s.wineVersion).toEqual({
      type: 'wine',
      bin: pinned.wineBin,
      wineserver: pinned.wineserverBin,
      name: pinned.label
    })
    expect(s.winePrefix).toBe(getBottleDir(paths, bottle))
    expect(s.wineCrossoverBottle).toBe(bottle)
    expect(s.autoInstallDxvk).toBe(false)
    expect(s.autoInstallDxvkNvapi).toBe(false)
    expect(s.autoInstallVkd3d).toBe(false)
    const env = s.enviromentOptions
    for (const [k, v] of [
      ['USER', 'crossover'],
      ['WINEDEBUG', '-all'],
      ['MVK_CONFIG_LOG_LEVEL', '0']
    ]) {
      expect(env.filter((e) => e.key === k)).toEqual([{ key: k, value: v }])
    }
    expect(env.map((e) => e.key)).toEqual(
      expect.not.arrayContaining(['WINEPREFIX', 'CX_BOTTLE', 'CX_ROOT'])
    )
    expect(env).toContainEqual({ key: 'FOO', value: 'bar' })
  })

  test('wine-manager selection dispatches like a pinned one', () => {
    const wm: NonCrossoverSelection = {
      ...pinned,
      kind: 'wine-manager',
      managerVersion: 'Wine-9',
      reason: 'override'
    } as NonCrossoverSelection
    expect(setEngineSelection('620', wm)).toBe(true)
    expect(getBridgeBottleSettings(bridgeDeps, '620').wineVersion.bin).toBe(
      pinned.wineBin
    )
  })

  test('crossover selection stays on the stock path', () => {
    setEngineSelection('620', {
      kind: 'crossover',
      reason: 'override',
      crossoverBuild: '24',
      binDir: CX_BIN_DIR
    })
    expect(getBridgeBottleSettings(bridgeDeps, '620').wineVersion.bin).not.toBe(
      pinned.wineBin
    )
  })

  test('DRM runner wins over an engine registration', () => {
    setEngineSelection('620', pinned)
    const drmRunner = {
      cxRoot: '/drm/cx',
      wineBin: '/drm/cx/bin/wine',
      wineserverBin: '/drm/cx/bin/wineserver',
      wineloaderBin: '/drm/cx/bin/wineloader',
      crossoverBuild: '24'
    } as unknown as DrmBridgeRunner
    mockedExistsSync.mockReturnValue(true)
    if (setDrmBridgeRunner('620', drmRunner)) {
      expect(
        getBridgeBottleSettings(bridgeDeps, '620').wineVersion.bin
      ).not.toBe(pinned.wineBin)
    }
  })

  test('registration is rejected for bad appId or missing binaries', () => {
    expect(setEngineSelection('abc', pinned)).toBe(false)
    mockedExistsSync.mockReturnValue(false)
    expect(setEngineSelection('620', pinned)).toBe(false)
    mockedExistsSync.mockImplementation((p: string) =>
      String(p).startsWith('/pins/')
    )
    expect(getBridgeBottleSettings(bridgeDeps, '620').wineVersion.bin).not.toBe(
      pinned.wineBin
    )
  })

  test('clearEngineSelection restores stock settings', () => {
    setEngineSelection('620', pinned)
    clearEngineSelection('620')
    expect(getBridgeBottleSettings(bridgeDeps, '620').wineVersion.bin).not.toBe(
      pinned.wineBin
    )
  })

  describe('wineserver kill', () => {
    test('killBridgeBottleWineServer uses the registered engine wineserver', async () => {
      setEngineSelection('620', pinned)
      await killBridgeBottleWineServer(spawnDeps, '620', 5000)
      const [call] = killCalls()
      expect(call?.wineserverBin).toBe(pinned.wineserverBin)
      expect(call?.extraEnv.USER).toBe('crossover')
      expect(call?.extraEnv.CX_ROOT).toBeUndefined()
    })

    test('killBridgeBottleWineServer uses CrossOver when nothing is registered', async () => {
      await killBridgeBottleWineServer(spawnDeps, '620', 5000)
      expect(mockedSpawnAsync.mock.calls[0][0]).toBe(
        joinPath(CX_BIN_DIR, 'wineserver')
      )
    })

    test('killBridgeBottleWineServer refuses a non-numeric appId', async () => {
      expect(await killBridgeBottleWineServer(spawnDeps, 'abc', 5000)).toBe(
        false
      )
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(killCalls()).toEqual([])
    })

    test('stop/end per-game use the registered engine wineserver', async () => {
      setEngineSelection('620', pinned)
      mockedExistsSync.mockReturnValue(true)
      await stopPerGameBridgeBottle(spawnDeps, '620')
      await endPerGameBridgeBottleSession(spawnDeps, '620', bottle, 5000)
      expect(killCalls().map((c) => c.wineserverBin)).toEqual([
        pinned.wineserverBin,
        pinned.wineserverBin
      ])
    })
  })
  describe('provisionBridgeBottle with a fallback engine (D-01/D-02/D-03/D-12)', () => {
    const engine = {
      wineBin: '/pins/bin/wine',
      wineserverBin: '/pins/bin/wineserver',
      label: 'Pinned Wine',
      version: '9.0',
      dxvk: { dir: '/pins/dxvk', version: '2.4' }
    }
    const name = 'GameLibSteamBridge-620'
    const order: string[] = []
    let dxvkMarker: boolean

    beforeEach(() => {
      order.length = 0
      dxvkMarker = false
      mockedExistsSync.mockReset()
      mockedExistsSync.mockImplementation((p: string) =>
        String(p).endsWith('current_dxvk-macOS') ? dxvkMarker : false
      )
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${basenameOf(bin)} ${args.join(' ')}`)
          return { code: 0, stdout: '', stderr: '' }
        }
      )
    })

    /** The `engine_bottle_create_fallback` calls the code under test sent, in order. */
    const createCalls = () =>
      bottleRust.calls
        .filter((c) => c.channel === RUST_ENGINE_BOTTLE_CREATE_FALLBACK)
        .map((c) => c.arg as { bottleName: string; engine: unknown })

    /** The names the code under test asked Rust to remove (`engine_bottle_remove_created`), in order. */
    const removeCalls = () =>
      bottleRust.calls
        .filter((c) => c.channel === RUST_ENGINE_BOTTLE_REMOVE_CREATED)
        .map((c) => (c.arg as { bottleName: string }).bottleName)
    /** The CrossOver arm's kill is the TS spawn of `wineserver -k`; a non-CrossOver one is Rust's. */
    const killed = () =>
      order.some((o) => o.startsWith('wineserver -k')) || killCalls().length > 0
    const killIndex = () =>
      order.findIndex((o) => o.startsWith('wineserver -k'))
    // What the creation does (the wineboot, the DXVK step, the conf, the wineserver stop, the cleanup of a failed or
    // cancelled one) is Rust's: gamelib-engine's `golden_bottles.rs` replays every branch. Here the TS side sends one
    // call and uses the answer.
    test('creates the bottle through one Rust call, never spawning cxbottle', async () => {
      cxState.binDir = undefined
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine
      })
      cxState.binDir = CX_BIN_DIR
      expect(result).toEqual({ status: 'done', createdHere: true })
      expect(createCalls()).toEqual([
        expect.objectContaining({ bottleName: name, engine })
      ])
      expect(
        mockedSpawnAsync.mock.calls.some((c) =>
          String(c[0]).includes('cxbottle')
        )
      ).toBe(false)
    })

    test('a creation Rust reports as failed is returned as an error and records no marker', async () => {
      bottleRustOthers[RUST_ENGINE_BOTTLE_CREATE_FALLBACK] = () => ({
        status: 'error',
        error: 'boom'
      })
      cxState.binDir = undefined
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine
      })
      cxState.binDir = CX_BIN_DIR
      expect(result.status).toBe('error')
      expect(
        bottleRust.calls.filter(
          (c) => c.channel === RUST_ENGINE_BOTTLE_RECORD_PINNED
        )
      ).toEqual([])
    })

    test('an already ready bottle short-circuits with no spawn', async () => {
      mockedExistsSync.mockImplementation((p: string) =>
        String(p).endsWith('cxbottle.conf')
      )
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine
      })
      expect(result).toEqual({ status: 'done', createdHere: false })
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    describe('creation-time engine marker (76-04, D-07a)', () => {
      let pinned: jest.SpyInstance
      let crossover: jest.SpyInstance
      beforeEach(() => {
        pinned = jest
          .spyOn(bottlesModule, 'recordPinnedBottleEngine')
          .mockResolvedValue(true)
        crossover = jest
          .spyOn(bottlesModule, 'recordCrossoverBottleEngine')
          .mockResolvedValue(true)
      })
      afterEach(() => {
        pinned.mockRestore()
        crossover.mockRestore()
      })

      test('a successful fallback creation records the pinned marker once with the pin id', async () => {
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine,
          fallbackPinId: 'wine-staging-11.20'
        })
        expect(result).toEqual({ status: 'done', createdHere: true })
        expect(pinned).toHaveBeenCalledTimes(1)
        expect(pinned).toHaveBeenCalledWith(
          expect.anything(),
          name,
          'wine-staging-11.20',
          engine
        )
        expect(crossover).not.toHaveBeenCalled()
      })

      test('fallbackPinId omitted records ENGINE_PINS.current.id', async () => {
        await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine
        })
        expect(pinned).toHaveBeenCalledWith(
          expect.anything(),
          name,
          ENGINE_PINS.current.id,
          engine
        )
      })

      test('a failed creation records nothing', async () => {
        bottleRustOthers[RUST_ENGINE_BOTTLE_CREATE_FALLBACK] = () => ({
          status: 'error',
          error: 'boom'
        })
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine
        })
        expect(result.status).toBe('error')
        expect(pinned).not.toHaveBeenCalled()
        expect(crossover).not.toHaveBeenCalled()
      })

      test('an aborted creation records nothing', async () => {
        const ac = new AbortController()
        ac.abort()
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine,
          signal: ac.signal
        })
        expect(result.status).toBe('error')
        expect(pinned).not.toHaveBeenCalled()
        expect(crossover).not.toHaveBeenCalled()
      })

      test('the already-ready short-circuit records nothing', async () => {
        mockedExistsSync.mockImplementation((p: string) =>
          String(p).endsWith('cxbottle.conf')
        )
        await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine
        })
        await provisionBridgeBottle(spawnDeps, { bottleName: name })
        expect(pinned).not.toHaveBeenCalled()
        expect(crossover).not.toHaveBeenCalled()
      })

      test('a successful CrossOver creation records the crossover marker once, not pinned', async () => {
        mockedExistsSync.mockReturnValue(false)
        mockedSpawnAsync.mockImplementation(async (bin: string) => {
          if (bin.includes('cxbottle')) {
            mockedExistsSync.mockImplementation((path: string) =>
              path.includes('cxbottle.conf')
            )
          }
          return { code: 0, stdout: '', stderr: '' }
        })
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name
        })
        expect(result.status).toBe('done')
        expect(crossover).toHaveBeenCalledTimes(1)
        expect(crossover).toHaveBeenCalledWith(
          expect.anything(),
          name,
          CX_BIN_DIR
        )
        expect(pinned).not.toHaveBeenCalled()
      })

      test('a CrossOver create timeout records nothing', async () => {
        mockedSpawnAsync.mockImplementation(async (bin: string) =>
          bin.includes('cxbottle')
            ? { code: null, stdout: '', stderr: '' }
            : { code: 0, stdout: '', stderr: '' }
        )
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          createTimeoutMs: 1000
        })
        expect(result.status).toBe('error')
        expect(crossover).not.toHaveBeenCalled()
      })

      test('a CrossOver create without a conf records nothing', async () => {
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name
        })
        expect(result.status).toBe('error')
        expect(crossover).not.toHaveBeenCalled()
      })

      test('a thrown CrossOver create records nothing', async () => {
        mockedSpawnAsync.mockRejectedValue(new Error('spawn failed'))
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name
        })
        expect(result.status).toBe('error')
        expect(crossover).not.toHaveBeenCalled()
      })
    })

    test('a toolkit wineVersion without a fallback engine is still rejected', async () => {
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        wineVersion: { bin: '/x/gptk', name: 'GPTK', type: 'toolkit' }
      })
      expect(result.status).toBe('error')
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    test('CrossOver absent and no fallback engine is still CROSSOVER_MISSING', async () => {
      cxState.binDir = undefined
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      cxState.binDir = CX_BIN_DIR
      expect(result.errorCode).toBe(CROSSOVER_MISSING)
    })

    test('cxbottle --create timing out returns CROSSOVER_CREATE_TIMEOUT, kills the wineserver, removes the new dir', async () => {
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${basenameOf(bin)} ${args.join(' ')}`)
          return bin.includes('cxbottle')
            ? { code: null, stdout: '', stderr: '' }
            : { code: 0, stdout: '', stderr: '' }
        }
      )
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        createTimeoutMs: 1000
      })
      expect(result.status).toBe('error')
      expect(result.errorCode).toBe(CROSSOVER_CREATE_TIMEOUT)
      expect(mockedSpawnAsync.mock.calls[0][2]).toEqual({ timeout: 1000 })
      expect(killed()).toBe(true)
      expect(removeCalls()).toEqual([name])
    })

    test('cxbottle --create exiting without a conf returns CROSSOVER_CREATE_FAILED and removes the new dir', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 1, stdout: '', stderr: 'x' })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result.status).toBe('error')
      expect(result.errorCode).toBe(CROSSOVER_CREATE_FAILED)
      expect(removeCalls()).toEqual([name])
    })

    test('CROSSOVER_CREATE_FAILED keeps a bottle dir that existed before the call', async () => {
      mockedExistsSync.mockImplementation(
        (p: string) => String(p) === getBottleDir(paths, name)
      )
      mockedSpawnAsync.mockResolvedValue({ code: 1, stdout: '', stderr: 'x' })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result.errorCode).toBe(CROSSOVER_CREATE_FAILED)
      expect(removeCalls()).toEqual([])
    })

    test('cxbottle --create throwing returns CROSSOVER_CREATE_FAILED and removes the new dir', async () => {
      mockedSpawnAsync.mockRejectedValue(new Error('spawn failed'))
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result.errorCode).toBe(CROSSOVER_CREATE_FAILED)
      expect(removeCalls()).toEqual([name])
    })

    test('WR-04: create-failed branches stop the wineserver before removing the dir', async () => {
      bottleRustOthers[RUST_ENGINE_BOTTLE_REMOVE_CREATED] = () => {
        order.push('rm')
        return true
      }
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${basenameOf(bin)} ${args.join(' ')}`)
          return { code: 1, stdout: '', stderr: 'x' }
        }
      )
      await provisionBridgeBottle(spawnDeps, { bottleName: name })
      expect(order.indexOf('rm')).toBeGreaterThan(killIndex())
      expect(killed()).toBe(true)
      order.length = 0
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${basenameOf(bin)} ${args.join(' ')}`)
          if (bin.includes('cxbottle')) throw new Error('spawn failed')
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      await provisionBridgeBottle(spawnDeps, { bottleName: name })
      expect(order.indexOf('rm')).toBeGreaterThan(killIndex())
    })

    test('an already-aborted signal returns PROVISION_ABORTED with no side effect', async () => {
      const ac = new AbortController()
      ac.abort()
      for (const fallbackEngine of [undefined, engine]) {
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine,
          signal: ac.signal
        })
        expect(result.errorCode).toBe(PROVISION_ABORTED)
      }
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
      expect(bottleRust.calls).toEqual([])
      expect(mockedMkdirSync).not.toHaveBeenCalled()
    })

    // The wineboot, the wineserver stop, the cleanup of what the creation made and the conf that is never written after
    // a cancel are Rust's (`golden_bottles.rs`, the cancel cases); here the TS signal must reach Rust as the creation's
    // cancel id and the answer must come back as PROVISION_ABORTED.
    test('an abort during the Rust creation cancels it by its id and returns PROVISION_ABORTED', async () => {
      const ac = new AbortController()
      let finish: (v: unknown) => void = () => undefined
      bottleRustOthers[RUST_ENGINE_BOTTLE_CREATE_FALLBACK] = () =>
        new Promise((resolve) => void (finish = resolve))
      bottleRustOthers[RUST_ENGINE_BOTTLE_CANCEL_CREATE] = () => {
        finish({
          status: 'error',
          errorCode: PROVISION_ABORTED,
          error: 'cancelled'
        })
        return true
      }
      const pending = provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine,
        signal: ac.signal
      })
      for (let i = 0; i < 20; i++) await Promise.resolve()
      ac.abort()
      const result = await pending
      expect(result.errorCode).toBe(PROVISION_ABORTED)
      const create = bottleRust.calls.find(
        (c) => c.channel === RUST_ENGINE_BOTTLE_CREATE_FALLBACK
      )?.arg as { cancelId?: string }
      const cancels = bottleRust.calls.filter(
        (c) => c.channel === RUST_ENGINE_BOTTLE_CANCEL_CREATE
      )
      expect(cancels).toHaveLength(1)
      expect((cancels[0]?.arg as { cancelId: string }).cancelId).toBe(
        create.cancelId
      )
    })

    test('abort during cxbottle --create stops the wineserver and removes the new dir, no fallback', async () => {
      const ac = new AbortController()
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${basenameOf(bin)} ${args.join(' ')}`)
          if (bin.includes('cxbottle')) {
            ac.abort()
            throw Object.assign(new Error('aborted'), { name: 'AbortError' })
          }
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        signal: ac.signal
      })
      expect(result.errorCode).toBe(PROVISION_ABORTED)
      expect(killed()).toBe(true)
      expect(removeCalls()).toEqual([name])
      expect(mockedSpawnAsync.mock.calls[0][2].signal).toBe(ac.signal)
      expect(createCalls()).toEqual([])
    })

    // Which names the removal refuses and that a sibling bottle is never touched are Rust's (`golden_bottles.rs`,
    // cases `remove-created-refused-names` and `remove-created-inside-root-sibling-untouched`).
    test('discardNewBridgeBottle asks Rust to remove the bottle it created', async () => {
      await discardNewBridgeBottle(rustTransport, name)
      expect(removeCalls()).toEqual([name])
    })

    test('createdHere is true for a fresh CrossOver bottle', async () => {
      mockedSpawnAsync.mockImplementation(async (bin: string) => {
        if (bin.includes('cxbottle')) {
          mockedExistsSync.mockImplementation((p: string) =>
            String(p).includes('cxbottle.conf')
          )
        }
        return { code: 0, stdout: '', stderr: '' }
      })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result).toMatchObject({ status: 'done', createdHere: true })
    })

    test('createdHere is false for a pre-existing not-ready bottle dir', async () => {
      mockedExistsSync.mockImplementation(
        (p: string) =>
          String(p) === getBottleDir(paths, name) ||
          (String(p).includes('cxbottle.conf') && order.length > 0)
      )
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${basenameOf(bin)} ${args.join(' ')}`)
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result).toMatchObject({ status: 'done', createdHere: false })
    })

    test('a minimal win64 conf reads back as win64 (Pitfall 7)', () => {
      mockedReadFileSync.mockReturnValue(
        '[Bottle]\n"BottleID" = "A"\n"WineArch" = "win64"\n'
      )
      expect(bottleWineArch(paths, name)).toBe('win64')
    })
  })
})
