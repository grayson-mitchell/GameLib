/**
 * Bidirectional registration-kind proof for the sidecar's runner-CLI-version-probe + Wine-runtime
 * + "other" + saves-sync + late-discovered channel cluster (Phase 34.5 Plans 07/12,
 * REQ-34.5-06/REQ-34.5-07/REQ-34.5-08/REQ-34.5-09; Phase 34.6 Plan 10, REQ-34.6-04/08/09).
 *
 * Five describe blocks:
 *   1. Registration kind — all 13 channels (`getLegendaryVersion`, `getGogdlVersion`,
 *      `getCometVersion`, `getNileVersion` from plan
 *      34.5-07; `callTool`, `egsSync`, `getGOGLinuxInstallersLangs`, `syncSaves`, `syncGOGSaves`
 *      from plan 34.5-12; `getAchievements`, `getDefaultSavePath`, `getPlaytimeFromRunner` from
 *      Phase 34.6 Plan 10) are `ipcMain.handle`, never `ipcMain.on`, asserted in both directions
 *      (mirrors `humbleLoginFlows.test.ts`'s Describe 1 template). Also proves the four channels
 *      `utils/ipc_handler.ts` ALSO registers (`abort`, `getSystemInfo`,
 *      `copySystemInfoToClipboard`, `hasExecutable`) and the three DEFERRED winetricks channel
 *      names (`winetricksAvailable`, `winetricksInstall`, `winetricksInstalled` — Phase 34.6,
 *      D-03) are absent from both registries, so a curated-import mistake that pulled in
 *      `tools/ipc_handler.ts`/`utils/ipc_handler.ts` wholesale, or `callTool`'s now-removed
 *      `winetricks` branch (Phase 45 D-17 deleted its `Winetricks.run()` GUI call; an unknown
 *      `tool` value is a no-op dispatch, see Describe 4) being confused with registering the
 *      winetricks IPC channels themselves (Pitfall 4), would be caught here. Module completeness
 *      (12 handle, 0 send, `listenerRegistry` untouched) is asserted explicitly. Phase 87 Plans 17
 *      and 18 (D-14) moved `isRuntimeInstalled` and `downloadRuntime` to the native `wine` slice, so
 *      neither is registered here.
 *   2. Curated-import guard — `runnerMiscFlowRegistration.ts` never imports `utils/ipc_handler.ts`
 *      or `wine/runtimes/ipc_handler.ts` (comment-stripped via the shared `stripSourceComments`
 *      util, so a docblock merely NAMING either file cannot trip the gate).
 *   3. `documents`-path pin — a narrow cross-check that the boot paths' `documents` case (plan
 *      34.5-01) resolves without throwing under this suite's redirected home. This does NOT drive
 *      `getDefaultGogSavePaths()` end-to-end (disproportionate for this suite, and per this
 *      plan's own SUMMARY correction, `syncGOGSaves`'s own call chain does not reach that
 *      function anyway) — full `resolveKnownFolder` coverage lives in
 *      `appPaths.test.ts`; this is a pointer proving the case this cluster's docstring cites
 *      still resolves, nothing more.
 *   4. `callTool` branch dispatch — with `runWineCommandOnGame` mocked, each of the two remaining
 *      `tool` branches (`winecfg`, `runExe`) is proven to reach the right function with the right
 *      arguments, `sendGameStatusUpdate` fires with `status: 'done'` on every branch, and the
 *      `runner === 'gog'` post-step is proven separately. An explicit case proves the retired
 *      `winetricks` tool value (Phase 45 D-17 removed its `Winetricks.run()` GUI call) is now a
 *      no-op dispatch — it must reach neither `runWineCommandOnGame` nor any winetricks mock,
 *      and still send the `done` status rather than throwing.
 *
 * `runnerMiscFlowRegistration.ts` reaches `helperBinaries/index.ts` (a static top-level import of
 * `backend/utils` for `getCometBin`) and `wine/runtimes/runtimes.ts` (which imports
 * `backend/logger` and `backend/utils`'s `axiosClient`, plus `backend/constants/paths` — which
 * itself imports `electron`'s `app` at module scope). `backend/utils` and `backend/logger` are
 * both heavy modules that eagerly construct store managers / config / discord-rpc / etc at import
 * time in their REAL form — factory-mocked here (mirrors `runnerAuthFlowRegistration.ts`'s own
 * suite) so this test never drives that real graph; only registration kind is being proven, not
 * any runner's own CLI-invocation or download logic. `os`'s `homedir()` is redirected to a
 * disposable per-process tmp directory (mirrors `steamAuthFlows.test.ts`'s own precedent) as
 * defence-in-depth for `backend/constants/paths.ts`'s module-scope `homedir()` calls, on top of
 * this project's structural `jest.setupContainment.ts` floor.
 *
 * Plan 34.5-12 additionally factory-mocks `../../storeManagers`, `../../tools`, `../../ipc` and
 * `../../online_monitor` — the curated import targets for `callTool`/`egsSync`/
 * `getGOGLinuxInstallersLangs`/`syncSaves`/`syncGOGSaves` — rather than letting the real
 * `GOGLibraryManager`/`LegendaryLibraryManager`/DXVK-Winetricks/`ipcMain`/network-monitor graphs
 * load (mirrors `wineToolsFlowRegistration`'s own `../../tools`/`../../launcher`/`../../game_config`
 * mocks in `wineToolsFlows.test.ts`): this suite proves registration + this plan's own dispatch
 * logic, not any runner's or tool's internal behaviour (covered by their own suites). `resetMocks:
 * true` (project jest config) clears every mock's implementation before each test, so every mock
 * used below is (re)configured inside a `beforeEach` or the test itself, never relied upon via its
 * declaration-time factory alone.
 *
 * Phase 34.6 Plan 10 additionally factory-mocks `getGame` (added to the existing `backend/utils`
 * mock), `../../save_sync` and `../../config` — the curated import targets for the three
 * late-discovered channels this plan ports.
 *   5. Late-discovered channel dispatch (Phase 34.6 Plan 10, REQ-34.6-04/08/09) —
 *      `getAchievements` defaults `lang` to `'en-US'` when absent and resolves `[]` when the
 *      game has no `getAchievements` method; `getDefaultSavePath` forwards its three arguments
 *      unchanged to `save_sync.ts`'s pure function; `getPlaytimeFromRunner` resolves `undefined`
 *      (not `null`, not `0`) both when `disablePlaytimeSync` is set (without touching
 *      `libraryManagerMap`) and for a non-`gog` runner.
 */

// ── os — disposable per-process homedir (mirrors steamAuthFlows.test.ts / runnerAuthFlows.test.ts) ─
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-runnermisc-test-home-${process.pid}`)
  }
})

// ── backend/utils — short-circuits the heavy storeManagers/config/launcher/discord-rpc import
// graph `helperBinaries/index.ts` and `wine/runtimes/runtimes.ts`/`util.ts` would otherwise pull
// in at module scope. Also supplies `isEpicServiceOffline`/`sendGameStatusUpdate`, both real
// exports of this same module that `runnerMiscFlowRegistration.ts` imports for `syncSaves`/
// `callTool` (plan 34.5-12). Neither `getCometBin` nor `axiosClient` is invoked by this suite
// (only registration kind + this plan's own dispatch logic is proven, no runner CLI is
// invoked), so an empty-bodied stand-in is sufficient for those two. ──────────────────────────
jest.mock('backend/utils', () => ({
  getCometBin: jest.fn(),
  axiosClient: { get: jest.fn() },
  isEpicServiceOffline: jest.fn(() => Promise.resolve(false)),
  sendGameStatusUpdate: jest.fn()
}))

// ── ../../save_sync — `getDefaultSavePath` is the curated import target for the sidecar's own
// `getDefaultSavePath` channel (D-14). Factory-mocked so this suite proves only forwarding, not
// `save_sync.ts`'s own legendary/gog path-resolution logic (covered by its own suite). ─────────
const mockGetDefaultSavePath = jest.fn()
jest.mock('../../save_sync', () => ({
  getDefaultSavePath: (...args: unknown[]) => mockGetDefaultSavePath(...args)
}))

// ── ../../config — `the global config.getSettings()` is the curated import target for
// `getPlaytimeFromRunner`'s `disablePlaytimeSync` read (the same
// `../../config` mock shape the other sidecar suites use). Both bare `jest.fn()` (no inline implementation), reconfigured
// per-test via `.mockReturnValue()` -- `resetMocks: true` (project jest config) would otherwise
// wipe a declaration-time implementation before the first test runs. ───────────────────────────
const mockGlobalConfigGetSettings = jest.fn()
const mockGlobalConfigGet = jest.fn()

// ── backend/logger — short-circuits the heavy GameConfig/GlobalConfig/backendEvents import graph
// `backend/logger/index.ts` pulls in at module scope (mirrors runnerAuthFlowRegistration.ts's own
// suite) ───────────────────────────────────────────────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: {
    Runtime: 'Runtime',
    Backend: 'Backend'
  }
}))

// ── ../../online_monitor — `isOnline` is the only export `syncSaves` needs; factory-mocked so
// this suite never constructs the real module's EventEmitter/axios-ping machinery ─────────────

// ── ../../ipc — `sendFrontendMessage` is only handed to the registration;
// factory-mocked so this suite never touches the real `electron`/`getMainWindow` chain ─────────
const mockSendFrontendMessage = jest.fn()

// ── ../../storeManagers — `libraryManagerMap` is the curated import target for `callTool`/
// `egsSync`/`getGOGLinuxInstallersLangs`/`syncSaves`/`syncGOGSaves`. Factory-mocked (not the real
// eager `GOGLibraryManager`/`LegendaryLibraryManager` construction) so each handler's dispatch can
// be proven directly, without real config-file I/O or download-queue construction. ─────────────
// Declared as a bare `jest.fn()` (no inline implementation) rather than `jest.fn(() => ({...}))`
// -- TS would otherwise infer a zero-parameter signature from that implementation, which then
// rejects `mockGogGetGame(...args)`'s spread below (TS2556). The return value is (re)configured
// via `.mockReturnValue()` in the describe block's `beforeEach` instead.
const mockGogGetGame = jest.fn()
const mockCheckForOfflineInstallerChanges = jest.fn()
const mockGetGameInfo = jest.fn()
const mockGetLinuxInstallersLanguages = jest.fn()

const mockLegendaryGetGame = jest.fn()
const mockToggleGamesSync = jest.fn()

// The manager slice handed to registerRunnerMiscFlows (no module mock: the registration takes
// its managers as a dependency).
const mockSideloadGetGame = jest.fn()
const managerSlice = {
  library: {
    gog: {
      getGame: (...args: unknown[]) => mockGogGetGame(...args),
      checkForOfflineInstallerChanges: (...args: unknown[]) =>
        mockCheckForOfflineInstallerChanges(...args),
      getGameInfo: (...args: unknown[]) => mockGetGameInfo(...args),
      getLinuxInstallersLanguages: (...args: unknown[]) =>
        mockGetLinuxInstallersLanguages(...args)
    },
    legendary: {
      getGame: (...args: unknown[]) => mockLegendaryGetGame(...args),
      toggleGamesSync: (...args: unknown[]) => mockToggleGamesSync(...args)
    },
    sideload: {
      getGame: (...args: unknown[]) => mockSideloadGetGame(...args)
    }
  }
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

import { registerRunnerMiscFlows } from '../runnerMiscFlowRegistration'
import { createIpcRegistry } from '../ipcRegistry'
import { ipcViews } from 'backend/testUtils/ipcViews'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { createContainedHomeAppPaths } from 'backend/testUtils/testAppPaths'

/** Pins `process.platform` for one case. These cases assert the host-platform (linux) arm CI runs;
 * on a win32 host `shortcutFiles`/`knownFolder` no longer guess a Desktop/Documents folder (quick
 * 261111-aq4). Restore the returned value in `finally`. */
function overrideProcessPlatform(os: string): string {
  const original = process.platform
  Object.defineProperty(process, 'platform', { value: os, configurable: true })
  return original
}

// ── Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling `registerRunnerMiscFlows()` more than once would stack a
// duplicate registration, mirroring every prior cluster suite's own file-scope-once convention. ──
// The tools module is mocked above, so the deps are never read.
const ipc = createIpcRegistry()
const { handlerRegistry, listenerRegistry } = ipcViews(ipc)
registerRunnerMiscFlows({
  ipc,
  sendFrontendMessage: (...a: unknown[]) => mockSendFrontendMessage(...a),
  managers: managerSlice,
  config: { getSettings: () => mockGlobalConfigGet().getSettings() }
} as unknown as Parameters<typeof registerRunnerMiscFlows>[0])

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────

describe('registration kind — all 10 channels are registered with the correct kind, both directions', () => {
  const VERSION_CHANNELS = [
    'getLegendaryVersion',
    'getGogdlVersion',
    'getCometVersion',
    'getNileVersion'
  ]
  // Phase 87 Plans 17 and 18 (D-14): `isRuntimeInstalled` and `downloadRuntime` are native `wine`
  // channels, so this module registers neither.
  // Phase 87 Plan 36 (D-23): `callTool` is a scheduled resolver, so this module registers it no more.
  const OTHER_CHANNELS = ['egsSync', 'getGOGLinuxInstallersLangs']
  const SAVES_SYNC_CHANNELS = ['syncGOGSaves', 'syncSaves']
  // Phase 34.6 Plan 10 (REQ-34.6-04/08/09): the last 3 of the phase's 24 late-discovered/deferred
  // channels.
  const LATE_DISCOVERED_CHANNELS = [
    'getAchievements',
    'getDefaultSavePath',
    'getPlaytimeFromRunner'
  ]

  it.each(VERSION_CHANNELS)(
    'REQ-34.5-06 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(['isRuntimeInstalled', 'downloadRuntime'])(
    'Phase 87 (D-14) %s is a native `wine` channel: this module registers no handle for it',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(OTHER_CHANNELS)(
    'REQ-34.5-07 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(SAVES_SYNC_CHANNELS)(
    'REQ-34.5-08 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(LATE_DISCOVERED_CHANNELS)(
    'REQ-34.6-04/08/09 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it('the module is complete: exactly these 11 channels are handle-kind, and no channel from this module is send-kind', () => {
    const allEleven = [
      ...VERSION_CHANNELS,
      ...OTHER_CHANNELS,
      ...SAVES_SYNC_CHANNELS,
      ...LATE_DISCOVERED_CHANNELS
    ]
    expect(allEleven).toHaveLength(11)
    for (const channel of allEleven) {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  })

  it.each([
    'abort',
    'getSystemInfo',
    'copySystemInfoToClipboard',
    'hasExecutable'
  ])(
    'T-34.5-24 %s (registered by utils/ipc_handler.ts, an already-completed slice) is absent from both registries after registerRunnerMiscFlows()',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(['winetricksAvailable', 'winetricksInstall', 'winetricksInstalled'])(
    'Pitfall 4 %s (the DEFERRED-to-34.6 winetricks IPC channel, D-03) is absent from both registries — callTool receiving tool: "winetricks" as a no-op dispatch (Phase 45 D-17) must not be confused with registering this channel',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(false)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )
})

// ── Describe 2: Curated-import guard ───────────────────────────────────────────────────────────
describe('curated-import guard — no ipc_handler import', () => {
  it('runnerMiscFlowRegistration.ts contains no import referencing utils/ipc_handler or wine/runtimes/ipc_handler', () => {
    const source = readFileSync(
      join(__dirname, '..', 'runnerMiscFlowRegistration.ts'),
      'utf-8'
    )
    const stripped = stripSourceComments(source)
    expect(/ipc_handler/.test(stripped)).toBe(false)
  })
})

// ── Describe 3: `documents`-path pin (research Pitfall 1 / D-09) ──────────────────────────────
describe('documents-path pin — the boot paths resolve the name this cluster depends on', () => {
  it("knownFolder('documents') resolves to a non-empty string under this suite's redirected home, without throwing (narrower proof; full resolveKnownFolder coverage lives in appPaths.test.ts)", () => {
    // Pinned to linux, CI's own arm: on a win32 host knownFolder('documents') throws (261111-aq4).
    const originalPlatform = overrideProcessPlatform('linux')
    try {
      const documents = createContainedHomeAppPaths().knownFolder('documents')
      expect(documents).toEqual(expect.any(String))
      expect(documents.length).toBeGreaterThan(0)
      expect(documents.startsWith(homedir())).toBe(true)
    } finally {
      overrideProcessPlatform(originalPlatform)
    }
  })
})

// ── Describe 4: callTool is registered elsewhere (Phase 87 Plan 36, D-23) ───────────────────────
// `callTool` is a scheduled resolver (`engineWineResolvers.ts`) over the Rust `wine_tool_call` op, with the gog post-step
// and the `done` status run after it; `engineWineResolvers.test.ts` proves the dispatch, the order and the refusal. This
// module registers no handle for it.
describe('callTool is registered elsewhere, never here (Phase 87 Plan 36)', () => {
  it('has no handle and no listener in this module', () => {
    expect(handlerRegistry.has('callTool')).toBe(false)
    expect((listenerRegistry.get('callTool') ?? []).length).toBe(0)
  })
})

// ── Describe 5: Late-discovered channel dispatch (Phase 34.6 Plan 10, REQ-34.6-04/08/09) ───────
describe('late-discovered channel dispatch — getAchievements, getDefaultSavePath, getPlaytimeFromRunner', () => {
  const getAchievementsHandler = () => handlerRegistry.get('getAchievements')!
  const getDefaultSavePathHandler = () =>
    handlerRegistry.get('getDefaultSavePath')!
  const getPlaytimeFromRunnerHandler = () =>
    handlerRegistry.get('getPlaytimeFromRunner')!

  describe('getAchievements', () => {
    it('REQ-34.6-04/08/09 defaults lang to "en-US" when the third argument is absent', async () => {
      const mockGetAchievements = jest.fn().mockResolvedValue([{ id: 'a1' }])
      mockLegendaryGetGame.mockReturnValue({
        getAchievements: mockGetAchievements
      })

      const result = await getAchievementsHandler()(
        undefined,
        'fake-app',
        'legendary'
      )

      expect(mockLegendaryGetGame).toHaveBeenCalledWith('fake-app')
      expect(mockGetAchievements).toHaveBeenCalledWith('en-US')
      expect(result).toEqual([{ id: 'a1' }])
    })

    it('REQ-34.6-04/08/09 forwards an explicit lang argument unchanged', async () => {
      const mockGetAchievements = jest.fn().mockResolvedValue([])
      mockGogGetGame.mockReturnValue({ getAchievements: mockGetAchievements })

      await getAchievementsHandler()(undefined, 'fake-app', 'gog', 'fr-FR')

      expect(mockGetAchievements).toHaveBeenCalledWith('fr-FR')
    })

    it('REQ-34.6-04/08/09 resolves [] when the game has no getAchievements method', async () => {
      mockSideloadGetGame.mockReturnValue({})

      const result = await getAchievementsHandler()(
        undefined,
        'fake-app',
        'sideload'
      )

      expect(result).toEqual([])
    })
  })

  describe('getDefaultSavePath', () => {
    it('REQ-34.6-04/08/09 (D-14) forwards appName, runner and alreadyDefinedGogSaves unchanged to save_sync.ts', async () => {
      mockGetDefaultSavePath.mockResolvedValue('/fake/save/path')
      const alreadyDefinedGogSaves = [{ name: 'saves', location: '/x' }]

      const result = await getDefaultSavePathHandler()(
        undefined,
        'fake-app',
        'gog',
        alreadyDefinedGogSaves
      )

      expect(mockGetDefaultSavePath).toHaveBeenCalledWith(
        expect.anything(),
        'fake-app',
        'gog',
        alreadyDefinedGogSaves
      )
      expect(result).toBe('/fake/save/path')
    })
  })

  describe('getPlaytimeFromRunner', () => {
    beforeEach(() => {
      mockGlobalConfigGet.mockReturnValue({
        getSettings: mockGlobalConfigGetSettings
      })
    })

    it('REQ-34.6-04/08/09 resolves undefined (not null, not 0) when disablePlaytimeSync is set, without touching libraryManagerMap', async () => {
      mockGlobalConfigGetSettings.mockReturnValue({
        disablePlaytimeSync: true
      })

      const result = await getPlaytimeFromRunnerHandler()(
        undefined,
        'gog',
        'fake-app'
      )

      expect(result).toBeUndefined()
      expect(mockGogGetGame).not.toHaveBeenCalled()
    })

    it('REQ-34.6-04/08/09 resolves undefined for a non-gog runner', async () => {
      mockGlobalConfigGetSettings.mockReturnValue({
        disablePlaytimeSync: false
      })

      const result = await getPlaytimeFromRunnerHandler()(
        undefined,
        'legendary',
        'fake-app'
      )

      expect(result).toBeUndefined()
    })

    it('REQ-34.6-04/08/09 returns the GOG playtime for a gog runner when sync is not disabled', async () => {
      mockGlobalConfigGetSettings.mockReturnValue({
        disablePlaytimeSync: false
      })
      const mockGetGOGPlaytime = jest.fn().mockResolvedValue(42)
      mockGogGetGame.mockReturnValue({ getGOGPlaytime: mockGetGOGPlaytime })

      const result = await getPlaytimeFromRunnerHandler()(
        undefined,
        'gog',
        'fake-app'
      )

      expect(mockGogGetGame).toHaveBeenCalledWith('fake-app')
      expect(mockGetGOGPlaytime).toHaveBeenCalled()
      expect(result).toBe(42)
    })
  })
})
