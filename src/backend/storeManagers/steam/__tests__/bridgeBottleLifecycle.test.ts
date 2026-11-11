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
import * as engineServicesModule from 'backend/services/engineServices'
import type { EngineServicesSource } from 'backend/services/engineServices'
import { writeCxbottleConf } from 'backend/engine/adoptBottle'
import { createTestStores } from 'backend/testUtils/testServices'
import {
  bindBottleStores,
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
  killBridgeBottleWineServer
} from '../bridgeBottleLifecycle'
import {
  getBridgeBottleSettings,
  setDrmBridgeRunner,
  clearDrmBridgeRunner
} from '../bridgeBottle'
import {
  getBottleDir,
  killBottleWineServerWith
} from 'backend/engine/bottlePrimitives'
import type { DrmBridgeRunner } from '../bridgeBottle'
import { __stopBottledRaiseLoops } from '../bottledSteam'
import {
  setEngineSelection,
  clearEngineSelection
} from 'backend/engine/engineRegistry'
import type { NonCrossoverSelection } from 'backend/engine/engineTypes'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'
import type { Stores } from 'backend/services/types'

const { steamBottleConfigStore } =
  jest.requireMock<Stores['steam']>('../stores')

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
// Recording fakes handed to the code under test through its deps slice (66.1 R5).
const mockedSpawnAsync = jest.fn()
// provisionBridgeBottle also takes the manager slices engineServicesFrom reads; only the fallback
// cases reach them, and those spy engineServicesFrom (below), so the spawn fake is all that is real.
const spawnDeps = {
  spawnAsync: mockedSpawnAsync
} as unknown as { spawnAsync: typeof mockedSpawnAsync } & EngineServicesSource
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
    __stopBottledRaiseLoops()
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
      const perGameDir = getBottleDir(perGameName)

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

      test('when the dir survives cxbottle, rmSync runs and removal still succeeds', async () => {
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )
        mockedSpawnAsync.mockImplementation((bin: string) => {
          if (String(bin).includes('cxbottle')) {
            mockedRmSync.mockImplementation((path: string) => {
              if (path === perGameDir) {
                mockedExistsSync.mockImplementation(() => false)
              }
            })
          }
          return Promise.resolve({ code: 0, stdout: '', stderr: '' })
        })

        const result = await removePerGameBridgeBottle(spawnDeps, '206040')

        expect(result).toEqual({ status: 'removed' })
        expect(mockedRmSync).toHaveBeenCalledWith(perGameDir, {
          recursive: true,
          force: true
        })
      })

      test('when rmSync throws and the dir still exists, returns error without throwing', async () => {
        mockedExistsSync.mockImplementation(
          (path: string) => path === perGameDir
        )
        mockedSpawnAsync.mockResolvedValue({ code: 0, stdout: '', stderr: '' })
        mockedRmSync.mockImplementation(() => {
          throw new Error('EPERM')
        })

        const result = await removePerGameBridgeBottle(spawnDeps, '206040')

        expect(result.status).toBe('error')
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
        const legacyDir = getBottleDir(DEFAULT_BRIDGE_BOTTLE_NAME)
        const steamDir = getBottleDir(DEFAULT_STEAM_BOTTLE_NAME)
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
      const perGameDir = getBottleDir(perGameName)

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
      const perGameDir = getBottleDir(perGameName)

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
        const spawnedBins = () =>
          mockedSpawnAsync.mock.calls.map(([bin]) => String(bin))

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
          expect(mockedSpawnAsync).toHaveBeenCalledTimes(1)
          const [bin, args, opts] = mockedSpawnAsync.mock.calls[0]
          expect(bin).toBe(HINT)
          expect(args).toEqual(['-k'])
          expect(opts?.env?.USER).toBe('crossover')
          expect(opts?.env?.WINEPREFIX).toBe(perGameDir)
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
      `${userHome}/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin/cxbottle`
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
    const s = getBridgeBottleSettings('620')
    expect(s.wineVersion.type).not.toBe('wine-staging')
    expect(s.wineVersion.bin).not.toBe(pinned.wineBin)
  })

  test('pinned selection yields wine settings with USER=crossover', () => {
    expect(setEngineSelection('620', pinned)).toBe(true)
    const s = getBridgeBottleSettings('620')
    expect(s.wineVersion).toEqual({
      type: 'wine',
      bin: pinned.wineBin,
      wineserver: pinned.wineserverBin,
      name: pinned.label
    })
    expect(s.winePrefix).toBe(getBottleDir(bottle))
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
    expect(getBridgeBottleSettings('620').wineVersion.bin).toBe(pinned.wineBin)
  })

  test('crossover selection stays on the stock path', () => {
    setEngineSelection('620', {
      kind: 'crossover',
      reason: 'override',
      crossoverBuild: '24',
      binDir: CX_BIN_DIR
    })
    expect(getBridgeBottleSettings('620').wineVersion.bin).not.toBe(
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
      expect(getBridgeBottleSettings('620').wineVersion.bin).not.toBe(
        pinned.wineBin
      )
    }
  })

  test('registration is rejected for bad appId or missing binaries', () => {
    expect(setEngineSelection('abc', pinned)).toBe(false)
    mockedExistsSync.mockReturnValue(false)
    expect(setEngineSelection('620', pinned)).toBe(false)
    mockedExistsSync.mockImplementation((p: string) =>
      String(p).startsWith('/pins/')
    )
    expect(getBridgeBottleSettings('620').wineVersion.bin).not.toBe(
      pinned.wineBin
    )
  })

  test('clearEngineSelection restores stock settings', () => {
    setEngineSelection('620', pinned)
    clearEngineSelection('620')
    expect(getBridgeBottleSettings('620').wineVersion.bin).not.toBe(
      pinned.wineBin
    )
  })

  describe('wineserver kill', () => {
    test('killBottleWineServerWith spawns the given wineserver', async () => {
      const ok = await killBottleWineServerWith(
        spawnDeps,
        bottle,
        '/pins/wineserver',
        { USER: 'crossover', WINEPREFIX: '/evil' },
        5000
      )
      expect(ok).toBe(true)
      const [bin, args, opts] = mockedSpawnAsync.mock.calls[0]
      expect(bin).toBe('/pins/wineserver')
      expect(args).toEqual(['-k'])
      expect(opts.env.WINEPREFIX).toBe(getBottleDir(bottle))
      expect(opts.env.USER).toBe('crossover')
      expect(opts.timeout).toBe(5000)
    })

    test('killBottleWineServerWith returns false on timeout', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: null })
      expect(
        await killBottleWineServerWith(spawnDeps, bottle, '/w', {}, 1)
      ).toBe(false)
    })

    test.each(['../evil', 'a/b', ''])(
      'killBottleWineServerWith refuses unsafe bottle %j',
      async (name) => {
        expect(
          await killBottleWineServerWith(spawnDeps, name, '/w', {}, 1)
        ).toBe(false)
        expect(mockedSpawnAsync).not.toHaveBeenCalled()
      }
    )

    test('killBridgeBottleWineServer uses the registered engine wineserver', async () => {
      setEngineSelection('620', pinned)
      await killBridgeBottleWineServer(spawnDeps, '620', 5000)
      const [bin, , opts] = mockedSpawnAsync.mock.calls[0]
      expect(bin).toBe(pinned.wineserverBin)
      expect(opts.env.USER).toBe('crossover')
      expect(opts.env.CX_ROOT).toBeUndefined()
    })

    test('killBridgeBottleWineServer uses CrossOver when nothing is registered', async () => {
      await killBridgeBottleWineServer(spawnDeps, '620', 5000)
      expect(mockedSpawnAsync.mock.calls[0][0]).toBe(`${CX_BIN_DIR}/wineserver`)
    })

    test('killBridgeBottleWineServer refuses a non-numeric appId', async () => {
      expect(await killBridgeBottleWineServer(spawnDeps, 'abc', 5000)).toBe(
        false
      )
      expect(mockedSpawnAsync).not.toHaveBeenCalled()
    })

    test('stop/end per-game use the registered engine wineserver', async () => {
      setEngineSelection('620', pinned)
      mockedExistsSync.mockReturnValue(true)
      await stopPerGameBridgeBottle(spawnDeps, '620')
      await endPerGameBridgeBottleSession(spawnDeps, '620', bottle, 5000)
      expect(mockedSpawnAsync.mock.calls.map((c) => c[0])).toEqual([
        pinned.wineserverBin,
        pinned.wineserverBin
      ])
    })
  })
  describe('provisionBridgeBottle with a fallback engine (D-01/D-02/D-03/D-12)', () => {
    afterEach(() => {
      servicesSpy.mockRestore()
    })
    const engine = {
      wineBin: '/pins/bin/wine',
      wineserverBin: '/pins/bin/wineserver',
      label: 'Pinned Wine',
      version: '9.0',
      dxvk: { dir: '/pins/dxvk', version: '2.4' }
    }
    const name = 'GameLibSteamBridge-620'
    const order: string[] = []
    const mockedInstallRemove = jest.fn()
    let servicesSpy: jest.SpyInstance
    const mockedWriteConf = writeCxbottleConf as jest.Mock
    let dxvkMarker: boolean

    beforeEach(() => {
      order.length = 0
      dxvkMarker = false
      mockedInstallRemove.mockReset()
      servicesSpy = jest
        .spyOn(engineServicesModule, 'engineServicesFrom')
        .mockImplementation((d) => ({
          spawnAsync: d.spawnAsync,
          runner: d.runner,
          notices: d,
          installRemove: mockedInstallRemove,
          wineManagerReleases: () => []
        }))
      mockedExistsSync.mockReset()
      mockedExistsSync.mockImplementation((p: string) =>
        String(p).endsWith('current_dxvk-macOS') ? dxvkMarker : false
      )
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      mockedInstallRemove.mockImplementation(async () => {
        order.push('dxvk')
        dxvkMarker = true
        return true
      })
      mockedWriteConf.mockImplementation(() => {
        order.push('conf')
        return true
      })
    })

    test('creates the bottle itself in the right order, never spawning cxbottle', async () => {
      cxState.binDir = undefined
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine
      })
      cxState.binDir = CX_BIN_DIR
      expect(result).toEqual({ status: 'done', createdHere: true })
      expect(order).toEqual([
        'wine wineboot -i',
        'wineserver -w',
        'dxvk',
        'conf',
        'wineserver -k'
      ])
      expect(mockedMkdirSync).toHaveBeenCalledWith(
        dirnameOf(getBottleDir(name)),
        { recursive: true }
      )
      const [, , bootOpts] = mockedSpawnAsync.mock.calls[0]
      expect(bootOpts.env).toMatchObject({
        WINEPREFIX: getBottleDir(name),
        USER: 'crossover',
        WINEDLLOVERRIDES: 'mshtml=',
        WINEDEBUG: '-all'
      })
      expect(bootOpts.timeout).toBe(180_000)
      expect(mockedSpawnAsync.mock.calls[1][2].timeout).toBe(60_000)
      expect(mockedInstallRemove.mock.calls[0][1]).toBe('dxvk')
      expect(mockedInstallRemove.mock.calls[0][2]).toBe('backup')
      expect(mockedInstallRemove.mock.calls[0][3]).toBe(engine.dxvk)
      expect(
        mockedSpawnAsync.mock.calls.some((c) =>
          String(c[0]).includes('cxbottle')
        )
      ).toBe(false)
    })

    test.each([1, null])(
      'wineboot exit code %p -> error, partial dir removed, no conf',
      async (code) => {
        mockedSpawnAsync.mockImplementation(async (bin: string) =>
          bin === engine.wineBin
            ? { code, stdout: '', stderr: 'boom' }
            : { code: 0, stdout: '', stderr: '' }
        )
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine
        })
        expect(result.status).toBe('error')
        expect(mockedWriteConf).not.toHaveBeenCalled()
        expect(mockedRmSync).toHaveBeenCalledWith(getBottleDir(name), {
          recursive: true,
          force: true
        })
      }
    )

    test('does not remove a bottle dir that existed before the call', async () => {
      mockedExistsSync.mockImplementation(
        (p: string) => String(p) === getBottleDir(name)
      )
      mockedSpawnAsync.mockResolvedValue({ code: 1, stdout: '', stderr: '' })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine
      })
      expect(result.status).toBe('error')
      expect(mockedRmSync).not.toHaveBeenCalled()
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
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
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
      expect(order.some((o) => o.startsWith('wineserver -k'))).toBe(true)
      expect(mockedRmSync).toHaveBeenCalledWith(getBottleDir(name), {
        recursive: true,
        force: true
      })
    })

    test('cxbottle --create exiting without a conf returns CROSSOVER_CREATE_FAILED and removes the new dir', async () => {
      mockedSpawnAsync.mockResolvedValue({ code: 1, stdout: '', stderr: 'x' })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result.status).toBe('error')
      expect(result.errorCode).toBe(CROSSOVER_CREATE_FAILED)
      expect(mockedRmSync).toHaveBeenCalledWith(getBottleDir(name), {
        recursive: true,
        force: true
      })
    })

    test('CROSSOVER_CREATE_FAILED keeps a bottle dir that existed before the call', async () => {
      mockedExistsSync.mockImplementation(
        (p: string) => String(p) === getBottleDir(name)
      )
      mockedSpawnAsync.mockResolvedValue({ code: 1, stdout: '', stderr: 'x' })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result.errorCode).toBe(CROSSOVER_CREATE_FAILED)
      expect(mockedRmSync).not.toHaveBeenCalled()
    })

    test('cxbottle --create throwing returns CROSSOVER_CREATE_FAILED and removes the new dir', async () => {
      mockedSpawnAsync.mockRejectedValue(new Error('spawn failed'))
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name
      })
      expect(result.errorCode).toBe(CROSSOVER_CREATE_FAILED)
      expect(mockedRmSync).toHaveBeenCalledWith(getBottleDir(name), {
        recursive: true,
        force: true
      })
    })

    const rmCall = () => [getBottleDir(name), { recursive: true, force: true }]
    const killed = () => order.some((o) => o.startsWith('wineserver -k'))

    test('WR-04: create-failed branches stop the wineserver before removing the dir', async () => {
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
          return { code: 1, stdout: '', stderr: 'x' }
        }
      )
      mockedRmSync.mockImplementation(() => {
        order.push('rm')
      })
      await provisionBridgeBottle(spawnDeps, { bottleName: name })
      expect(order.indexOf('rm')).toBeGreaterThan(
        order.findIndex((o) => o.startsWith('wineserver -k'))
      )
      expect(killed()).toBe(true)
      order.length = 0
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
          if (bin.includes('cxbottle')) throw new Error('spawn failed')
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      await provisionBridgeBottle(spawnDeps, { bottleName: name })
      expect(order.indexOf('rm')).toBeGreaterThan(
        order.findIndex((o) => o.startsWith('wineserver -k'))
      )
      mockedRmSync.mockReset()
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
      expect(mockedRmSync).not.toHaveBeenCalled()
      expect(mockedMkdirSync).not.toHaveBeenCalled()
    })

    test('abort during wineboot removes the partly created bottle', async () => {
      const ac = new AbortController()
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
          if (bin === engine.wineBin) {
            ac.abort()
            throw Object.assign(new Error('aborted'), { name: 'AbortError' })
          }
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine,
        signal: ac.signal
      })
      expect(result.errorCode).toBe(PROVISION_ABORTED)
      expect(killed()).toBe(true)
      expect(mockedRmSync).toHaveBeenCalledWith(...rmCall())
      expect(mockedWriteConf).not.toHaveBeenCalled()
      expect(mockedSpawnAsync.mock.calls[0][2].signal).toBe(ac.signal)
    })

    test.each(['wineserver -w', 'dxvk'])(
      'abort observed after %s cleans up and never writes the conf',
      async (step) => {
        const ac = new AbortController()
        mockedSpawnAsync.mockImplementation(
          async (bin: string, args: string[]) => {
            order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
            if (step === 'wineserver -w' && args[0] === '-w') ac.abort()
            return { code: 0, stdout: '', stderr: '' }
          }
        )
        mockedInstallRemove.mockImplementation(async () => {
          dxvkMarker = true
          if (step === 'dxvk') ac.abort()
          return true
        })
        const result = await provisionBridgeBottle(spawnDeps, {
          bottleName: name,
          fallbackEngine: engine,
          signal: ac.signal
        })
        expect(result.errorCode).toBe(PROVISION_ABORTED)
        expect(mockedWriteConf).not.toHaveBeenCalled()
        expect(mockedRmSync).toHaveBeenCalledWith(...rmCall())
        expect(mockedSpawnAsync.mock.calls[1][2].signal).toBe(ac.signal)
      }
    )

    test('abort during cxbottle --create stops the wineserver and removes the new dir, no fallback', async () => {
      const ac = new AbortController()
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
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
      expect(mockedRmSync).toHaveBeenCalledWith(...rmCall())
      expect(mockedSpawnAsync.mock.calls[0][2].signal).toBe(ac.signal)
      expect(order.some((o) => o.startsWith('wine wineboot'))).toBe(false)
    })

    test('abort never removes a bottle dir that existed before the call', async () => {
      const ac = new AbortController()
      mockedExistsSync.mockImplementation(
        (p: string) => String(p) === getBottleDir(name)
      )
      mockedSpawnAsync.mockImplementation(async () => {
        ac.abort()
        throw new Error('aborted')
      })
      const result = await provisionBridgeBottle(spawnDeps, {
        bottleName: name,
        fallbackEngine: engine,
        signal: ac.signal
      })
      expect(result.errorCode).toBe(PROVISION_ABORTED)
      expect(mockedRmSync).not.toHaveBeenCalled()
    })

    test('discardNewBridgeBottle removes the dir and refuses an unsafe name', () => {
      discardNewBridgeBottle(name)
      expect(mockedRmSync).toHaveBeenCalledWith(...rmCall())
      mockedRmSync.mockClear()
      discardNewBridgeBottle('a/../b')
      expect(mockedRmSync).not.toHaveBeenCalled()
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
          String(p) === getBottleDir(name) ||
          (String(p).includes('cxbottle.conf') && order.length > 0)
      )
      mockedSpawnAsync.mockImplementation(
        async (bin: string, args: string[]) => {
          order.push(`${bin.split('/').pop()} ${args.join(' ')}`)
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
      expect(bottleWineArch(name)).toBe('win64')
    })
  })
})
