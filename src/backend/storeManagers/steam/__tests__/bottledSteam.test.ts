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
import { join as joinPath } from 'node:path'
import { GlobalConfig } from 'backend/config'
import { logWarning } from 'backend/logger'
import { checkWineBeforeLaunch, downloadFile } from 'backend/utils'
import { createTestStores } from 'backend/testUtils/testServices'
import { createTestSteamSession } from 'backend/testUtils/testSteamSession'
import {
  startBottleProcessMonitor,
  stopBottleProcessMonitor
} from '../bottleProcessMonitor'
import { bindBottleStores, getBottleSteamExePath } from '../bottle'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import {
  tellBottledSteamToLaunch,
  tellBottledSteamToUninstall,
  __stopBottledRaiseLoops,
  type BottledSteamDeps
} from '../bottledSteam'
import { DEFAULT_STEAM_BOTTLE_NAME } from '../constants'
import type { WineInstallation, GameSettings } from 'common/types'
import type { Stores } from 'backend/services/types'
import { at } from './fixtures/indexed'

const { steamBottleConfigStore } =
  jest.requireMock<Stores['steam']>('../stores')

jest.mock('backend/platform', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/tmp/mock-path'),
    // Plain method (survives resetMocks) -- publicDir resolves it at module load.
    getAppPath: () => '/tmp/mock-path'
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

// quick/261016-t3e: the 'launch' verb now lazily imports this module to
// start a process monitor fire-and-forget — mocked so the launch-verb
// wiring assertion below can observe the call without exercising the real
// polling loop (that loop has its own dedicated bottleProcessMonitor.test.ts).
jest.mock('../bottleProcessMonitor', () => ({
  startBottleProcessMonitor: jest.fn(),
  stopBottleProcessMonitor: jest.fn(),
  __stopAllBottleProcessMonitors: jest.fn()
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
const mockedDownloadFile = downloadFile as jest.Mock
const mockedCheckWineBeforeLaunch = checkWineBeforeLaunch as jest.Mock
const mockedRunWineCommand = jest.fn()
const mockedAppHide = jest.fn()
// The boot-owned Steam library state the dispatch reads (D-66.3-13): one instance for this file.
const steamSession = createTestSteamSession()
const library = steamSession.libraryState.library
const bottledDeps = {
  steamSession,
  appState: { hide: () => mockedAppHide() },
  spawnAsync: mockedSpawnAsync,
  commandRunner: { runWineCommand: mockedRunWineCommand }
} as unknown as BottledSteamDeps
const mockedLogWarning = logWarning as jest.Mock
const mockedStartBottleProcessMonitor = jest.mocked(startBottleProcessMonitor)
const mockedStopBottleProcessMonitor = jest.mocked(stopBottleProcessMonitor)

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
  describe('tellBottledSteamTo{Launch,Uninstall}', () => {
    const BAD_APP_ID = '123; rm -rf /'
    const GOOD_APP_ID = '440'

    test('rejects a non-numeric appId for launch without calling runWineCommand', async () => {
      const result = await tellBottledSteamToLaunch(bottledDeps, BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('rejects a non-numeric appId for uninstall without calling runWineCommand', async () => {
      const result = await tellBottledSteamToUninstall(bottledDeps, BAD_APP_ID)
      expect(result.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('returns an error (no spawn) when the bottle is not provisioned', async () => {
      mockedExistsSync.mockReturnValue(false) // isBottleReady() -> false (neither conf nor steam.exe)

      const launchResult = await tellBottledSteamToLaunch(
        bottledDeps,
        GOOD_APP_ID
      )
      const uninstallResult = await tellBottledSteamToUninstall(
        bottledDeps,
        GOOD_APP_ID
      )

      expect(launchResult.status).toBe('error')
      expect(uninstallResult.status).toBe('error')
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('returns an error (no spawn) when the bottle is half-provisioned (conf exists, steam.exe missing)', async () => {
      mockedExistsSync.mockImplementation((path: string) =>
        path.includes('cxbottle.conf')
      )

      const launchResult = await tellBottledSteamToLaunch(
        bottledDeps,
        GOOD_APP_ID
      )

      expect(launchResult.status).toBe('error')
      expect(launchResult.error).toMatch(/not ready/)
      expect(mockedRunWineCommand).not.toHaveBeenCalled()
    })

    test('launch dispatches -applaunch <appId> as discrete argv elements targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true) // isBottleReady() -> true (conf + steam.exe)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToLaunch(bottledDeps, GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(
        getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME)
      )
      expect(commandParts).toContain('-applaunch')
      expect(commandParts).toContain(GOOD_APP_ID)
    })

    // quick/261016-t3e: regression guard for LD-1 + the new launch-verb wiring.
    describe('bottle process monitor wiring (quick/261016-t3e)', () => {
      const seededInstallPath = joinPath(
        getBottleDir(DEFAULT_STEAM_BOTTLE_NAME),
        'drive_c',
        'Program Files (x86)',
        'Steam',
        'steamapps',
        'common',
        'Fallout 2'
      )

      afterEach(() => {
        // The library Map is module-global and survives between tests — a
        // leaked entry would silently change what a later test observes.
        library.delete(GOOD_APP_ID)
      })

      test('launch starts the bottle process monitor with the appId and install_path from the library Map', async () => {
        mockedExistsSync.mockReturnValue(true)
        mockedGetNodefault.mockReturnValue(undefined)
        library.set(GOOD_APP_ID, {
          install: { install_path: seededInstallPath }
        } as never)

        await tellBottledSteamToLaunch(bottledDeps, GOOD_APP_ID)
        await Promise.resolve()
        await Promise.resolve()

        expect(mockedStartBottleProcessMonitor).toHaveBeenCalledTimes(1)
        expect(mockedStartBottleProcessMonitor).toHaveBeenCalledWith(
          bottledDeps,
          expect.objectContaining({
            appId: GOOD_APP_ID,
            installPath: seededInstallPath
          })
        )
      })

      test('launch starts the monitor BEFORE runWineCommand (261024-gvu)', async () => {
        mockedExistsSync.mockReturnValue(true)
        mockedGetNodefault.mockReturnValue(undefined)
        library.set(GOOD_APP_ID, {
          install: { install_path: seededInstallPath }
        } as never)

        await tellBottledSteamToLaunch(bottledDeps, GOOD_APP_ID)

        const startOrder = at(
          mockedStartBottleProcessMonitor.mock.invocationCallOrder,
          0
        )
        const wineOrder = at(mockedRunWineCommand.mock.invocationCallOrder, 0)
        expect(startOrder).toBeLessThan(wineOrder)
        expect(mockedStopBottleProcessMonitor).not.toHaveBeenCalled()
      })

      test('launch whose runWineCommand rejects stops the monitor and returns error (261024-gvu)', async () => {
        mockedExistsSync.mockReturnValue(true)
        mockedGetNodefault.mockReturnValue(undefined)
        library.set(GOOD_APP_ID, {
          install: { install_path: seededInstallPath }
        } as never)
        mockedRunWineCommand.mockRejectedValue(new Error('wine down'))

        const result = await tellBottledSteamToLaunch(bottledDeps, GOOD_APP_ID)

        expect(result.status).toBe('error')
        expect(mockedStopBottleProcessMonitor).toHaveBeenCalledWith(GOOD_APP_ID)
      })

      test('uninstall does NOT start a bottle process monitor (LD-1)', async () => {
        mockedExistsSync.mockReturnValue(true)
        mockedGetNodefault.mockReturnValue(undefined)
        library.set(GOOD_APP_ID, {
          install: { install_path: seededInstallPath }
        } as never)

        await tellBottledSteamToUninstall(bottledDeps, GOOD_APP_ID)
        await Promise.resolve()
        await Promise.resolve()

        expect(mockedStartBottleProcessMonitor).not.toHaveBeenCalled()
      })

      test('launch with no known install_path logs a warning and does not start a monitor', async () => {
        mockedExistsSync.mockReturnValue(true)
        mockedGetNodefault.mockReturnValue(undefined)
        // No library entry seeded for GOOD_APP_ID in this test.

        const result = await tellBottledSteamToLaunch(bottledDeps, GOOD_APP_ID)
        await Promise.resolve()
        await Promise.resolve()

        expect(result.status).toBe('done')
        expect(mockedStartBottleProcessMonitor).not.toHaveBeenCalled()
        expect(mockedLogWarning).toHaveBeenCalledWith(
          expect.stringContaining(GOOD_APP_ID),
          'Steam'
        )
      })
    })

    test('uninstall dispatches steam://uninstall/<appId> targeting the bottle Steam.exe', async () => {
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      const result = await tellBottledSteamToUninstall(bottledDeps, GOOD_APP_ID)

      expect(result.status).toBe('done')
      const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
      expect(commandParts[0]).toBe(
        getBottleSteamExePath(DEFAULT_STEAM_BOTTLE_NAME)
      )
      expect(commandParts.some((p: string) => p.includes(GOOD_APP_ID))).toBe(
        true
      )
    })

    test.each([
      ['launch', tellBottledSteamToLaunch],
      ['uninstall', tellBottledSteamToUninstall]
    ])(
      '%s passes -silent right after Steam.exe so a cold start skips the main window and offers popup',
      async (_verb, dispatch) => {
        mockedExistsSync.mockReturnValue(true)
        mockedGetNodefault.mockReturnValue(undefined)

        await dispatch(bottledDeps, GOOD_APP_ID)

        const { commandParts } = mockedRunWineCommand.mock.calls[0][0]
        expect(commandParts[1]).toBe('-silent')
      }
    )
  })

  // ── GAP C (17-16): leak-safe raise loop ────────────────────────────────────
  describe('raise-loop leak safety (__stopBottledRaiseLoops)', () => {
    const flushMicrotasks = async (times = 10) => {
      for (let i = 0; i < times; i++) await Promise.resolve()
    }

    test('a fired raise loop schedules a retry timer that __stopBottledRaiseLoops clears (jest.getTimerCount() returns to 0)', async () => {
      // Ready bottle so the uninstall dispatch reaches `void raiseInstallerWindow`.
      mockedExistsSync.mockReturnValue(true)
      mockedGetNodefault.mockReturnValue(undefined)

      jest.useFakeTimers()
      // Fire-and-forget, exactly as dispatchToBottledSteam does. The raise loop
      // awaits the (mocked) isMac import, then schedules the first unref'd
      // sleep(1500) retry timer.
      void tellBottledSteamToUninstall(bottledDeps, '440')
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
      void tellBottledSteamToUninstall(bottledDeps, '440')
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
      void tellBottledSteamToUninstall(bottledDeps, '440')

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
      void tellBottledSteamToUninstall(bottledDeps, '440')

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
})
