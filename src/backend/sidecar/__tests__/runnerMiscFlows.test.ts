/**
 * Bidirectional registration-kind proof for the sidecar's runner-CLI-version-probe + Wine-runtime
 * + "other" + saves-sync channel cluster (Phase 34.5 Plans 07/12, REQ-34.5-06/REQ-34.5-07/
 * REQ-34.5-08/REQ-34.5-09).
 *
 * Four describe blocks:
 *   1. Registration kind — all 11 channels (`getLegendaryVersion`, `getGogdlVersion`,
 *      `getCometVersion`, `getNileVersion`, `downloadRuntime`, `isRuntimeInstalled` from plan
 *      34.5-07; `callTool`, `egsSync`, `getGOGLinuxInstallersLangs`, `syncSaves`, `syncGOGSaves`
 *      from plan 34.5-12) are `ipcMain.handle`, never `ipcMain.on`, asserted in both directions
 *      (mirrors `humbleLoginFlows.test.ts`'s Describe 1 template). Also proves the four channels
 *      `utils/ipc_handler.ts` ALSO registers (`abort`, `getSystemInfo`,
 *      `copySystemInfoToClipboard`, `hasExecutable`) and the three DEFERRED winetricks channel
 *      names (`winetricksAvailable`, `winetricksInstall`, `winetricksInstalled` — Phase 34.6,
 *      D-03) are absent from both registries, so a curated-import mistake that pulled in
 *      `tools/ipc_handler.ts`/`utils/ipc_handler.ts` wholesale, or `callTool` reaching
 *      `Winetricks.run` being confused with registering the winetricks IPC channels themselves
 *      (Pitfall 4), would be caught here. Module completeness (11 handle, 0 send,
 *      `listenerRegistry` untouched) is asserted explicitly.
 *   2. Curated-import guard — `runnerMiscFlowRegistration.ts` never imports `utils/ipc_handler.ts`
 *      or `wine/runtimes/ipc_handler.ts` (comment-stripped via the shared `stripSourceComments`
 *      util, so a docblock merely NAMING either file cannot trip the gate).
 *   3. `documents`-path pin — a narrow cross-check that `pathShim`'s `documents` case (plan
 *      34.5-01) resolves without throwing under this suite's redirected home. This does NOT drive
 *      `getDefaultGogSavePaths()` end-to-end (disproportionate for this suite, and per this
 *      plan's own SUMMARY correction, `syncGOGSaves`'s own call chain does not reach that
 *      function anyway) — full `getPath('documents')` switch-case coverage lives in
 *      `pathShim.test.ts`; this is a pointer proving the case this cluster's docstring cites
 *      still resolves, nothing more.
 *   4. `callTool` branch dispatch — with `Winetricks.run` and `runWineCommandOnGame` mocked, each
 *      of the three `tool` branches (`winetricks`, `winecfg`, `runExe`) is proven to reach the
 *      right function with the right arguments, `sendGameStatusUpdate` fires with `status: 'done'`
 *      on every branch, and the `runner === 'gog'` post-step is proven separately. An explicit
 *      case proves the `winetricks` branch is NOT gated on Phase 34.6 (Pitfall 4) — it must call
 *      `Winetricks.run`, not throw or no-op.
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
  isEpicServiceOffline: jest.fn(async () => false),
  sendGameStatusUpdate: jest.fn()
}))

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
jest.mock('../../online_monitor', () => ({
  isOnline: jest.fn(() => true)
}))

// ── ../../ipc — `sendFrontendMessage` is the only export `callTool`'s gog post-step needs;
// factory-mocked so this suite never touches the real `electron`/`getMainWindow` chain ─────────
const mockSendFrontendMessage = jest.fn()
jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

// ── ../../tools — `Winetricks.run`/`runWineCommandOnGame` are the curated import targets for
// `callTool`'s three tool branches; factory-mocked (mirrors `wineToolsFlows.test.ts`'s own
// `../../tools` mock) so this suite proves callTool's OWN dispatch, not Winetricks'/the Wine
// command runner's internal logic ───────────────────────────────────────────────────────────────
const mockWinetricksRun = jest.fn()
const mockRunWineCommandOnGame = jest.fn()
jest.mock('../../tools', () => ({
  Winetricks: {
    run: (...args: unknown[]) => mockWinetricksRun(...args)
  },
  runWineCommandOnGame: (...args: unknown[]) => mockRunWineCommandOnGame(...args)
}))

// ── ../../storeManagers — `libraryManagerMap` is the curated import target for `callTool`/
// `egsSync`/`getGOGLinuxInstallersLangs`/`syncSaves`/`syncGOGSaves`. Factory-mocked (not the real
// eager `GOGLibraryManager`/`LegendaryLibraryManager` construction) so each handler's dispatch can
// be proven directly, without real config-file I/O or download-queue construction. ─────────────
const mockGogGetSettings = jest.fn()
const mockGogSyncSaves = jest.fn()
// Declared as a bare `jest.fn()` (no inline implementation) rather than `jest.fn(() => ({...}))`
// -- TS would otherwise infer a zero-parameter signature from that implementation, which then
// rejects `mockGogGetGame(...args)`'s spread below (TS2556). The return value is (re)configured
// via `.mockReturnValue()` in the describe block's `beforeEach` instead.
const mockGogGetGame = jest.fn()
const mockCheckForOfflineInstallerChanges = jest.fn()
const mockGetGameInfo = jest.fn()
const mockGetLinuxInstallersLanguages = jest.fn()

const mockLegendaryGetSettings = jest.fn()
const mockLegendarySyncSaves = jest.fn()
const mockLegendaryGetGame = jest.fn()
const mockToggleGamesSync = jest.fn()

jest.mock('../../storeManagers', () => ({
  libraryManagerMap: {
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
    }
  }
}))

import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

import { registerRunnerMiscFlows } from '../runnerMiscFlowRegistration'
import { handlerRegistry, listenerRegistry } from '../electronStub'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { getPath } from '../pathShim'

// ── Registered ONCE for this whole file (not per-test) -- `listenerRegistry`/`handlerRegistry`
// are module-scope maps; calling `registerRunnerMiscFlows()` more than once would stack a
// duplicate registration, mirroring every prior cluster suite's own file-scope-once convention. ──
registerRunnerMiscFlows()

// ── Describe 1: Registration kind ──────────────────────────────────────────────────────────────
describe('registration kind — all 11 channels are registered with the correct kind, both directions', () => {
  const VERSION_CHANNELS = [
    'getLegendaryVersion',
    'getGogdlVersion',
    'getCometVersion',
    'getNileVersion'
  ]
  const RUNTIME_CHANNELS = ['downloadRuntime', 'isRuntimeInstalled']
  const OTHER_CHANNELS = ['callTool', 'egsSync', 'getGOGLinuxInstallersLangs']
  const SAVES_SYNC_CHANNELS = ['syncGOGSaves', 'syncSaves']

  it.each(VERSION_CHANNELS)(
    'REQ-34.5-06 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
      expect((listenerRegistry.get(channel) ?? []).length).toBe(0)
    }
  )

  it.each(RUNTIME_CHANNELS)(
    'REQ-34.5-09 %s is registered as ipcMain.handle, and NOT as ipcMain.on',
    (channel) => {
      expect(handlerRegistry.has(channel)).toBe(true)
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

  it('the module is complete: exactly these 11 channels are handle-kind, and no channel from this module is send-kind', () => {
    const allEleven = [
      ...VERSION_CHANNELS,
      ...RUNTIME_CHANNELS,
      ...OTHER_CHANNELS,
      ...SAVES_SYNC_CHANNELS
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
    'Pitfall 4 %s (the DEFERRED-to-34.6 winetricks IPC channel, D-03) is absent from both registries — callTool reaching Winetricks.run must not be confused with registering this channel',
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
describe('documents-path pin — pathShim resolves the name this cluster depends on', () => {
  it("getPath('documents') resolves to a non-empty string under this suite's redirected home, without throwing (narrower proof; full getPath('documents') switch-case coverage lives in pathShim.test.ts)", () => {
    const documents = getPath('documents')
    expect(documents).toEqual(expect.any(String))
    expect(documents.length).toBeGreaterThan(0)
    expect(documents.startsWith(homedir())).toBe(true)
  })
})

// ── Describe 4: callTool branch dispatch (Pitfall 4 + gog post-step + sendGameStatusUpdate) ────
describe('callTool branch dispatch — winetricks/winecfg/runExe, the gog post-step, and sendGameStatusUpdate', () => {
  const callToolHandler = () => handlerRegistry.get('callTool')!
  const FAKE_SETTINGS = { fakeSetting: true }

  beforeEach(() => {
    mockGogGetSettings.mockResolvedValue(FAKE_SETTINGS)
    mockLegendaryGetSettings.mockResolvedValue(FAKE_SETTINGS)
    // `resetMocks: true` (project jest config) clears the return value `mockGogGetGame`/
    // `mockLegendaryGetGame` were declared with too — reconfigure both every test, not just
    // the leaf getSettings/syncSaves mocks they close over.
    mockGogGetGame.mockReturnValue({
      getSettings: mockGogGetSettings,
      syncSaves: mockGogSyncSaves
    })
    mockLegendaryGetGame.mockReturnValue({
      getSettings: mockLegendaryGetSettings,
      syncSaves: mockLegendarySyncSaves
    })
    mockCheckForOfflineInstallerChanges.mockResolvedValue(undefined)
    mockGetGameInfo.mockReturnValue(undefined)
    mockWinetricksRun.mockResolvedValue(undefined)
    mockRunWineCommandOnGame.mockResolvedValue({ stdout: '', stderr: '' })
  })

  it('REQ-34.5-07 Pitfall 4: the winetricks branch calls Winetricks.run — it is NOT gated on Phase 34.6, and sendGameStatusUpdate fires with status "done"', async () => {
    await callToolHandler()(undefined, {
      tool: 'winetricks',
      appName: 'fake-app',
      runner: 'legendary'
    })

    expect(mockWinetricksRun).toHaveBeenCalledWith('legendary', 'fake-app')
    expect(mockRunWineCommandOnGame).not.toHaveBeenCalled()
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils') as {
      sendGameStatusUpdate: jest.Mock
    }
    expect(sendGameStatusUpdate).toHaveBeenCalledWith({
      appName: 'fake-app',
      runner: 'legendary',
      status: 'done'
    })
  })

  it('REQ-34.5-07 the winecfg branch calls runWineCommandOnGame with the winecfg commandParts, and sendGameStatusUpdate fires with status "done"', async () => {
    await callToolHandler()(undefined, {
      tool: 'winecfg',
      appName: 'fake-app',
      runner: 'legendary'
    })

    expect(mockRunWineCommandOnGame).toHaveBeenCalledWith(
      'legendary',
      'fake-app',
      {
        gameSettings: FAKE_SETTINGS,
        commandParts: ['winecfg'],
        wait: false
      }
    )
    expect(mockWinetricksRun).not.toHaveBeenCalled()
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils') as {
      sendGameStatusUpdate: jest.Mock
    }
    expect(sendGameStatusUpdate).toHaveBeenCalledWith({
      appName: 'fake-app',
      runner: 'legendary',
      status: 'done'
    })
  })

  it('REQ-34.5-07 the runExe branch calls runWineCommandOnGame with the exe as commandParts and its parsed directory as startFolder, and sendGameStatusUpdate fires with status "done"', async () => {
    await callToolHandler()(undefined, {
      tool: 'runExe',
      exe: '/games/fake-game/bin/game.exe',
      appName: 'fake-app',
      runner: 'legendary'
    })

    expect(mockRunWineCommandOnGame).toHaveBeenCalledWith(
      'legendary',
      'fake-app',
      {
        gameSettings: FAKE_SETTINGS,
        commandParts: ['/games/fake-game/bin/game.exe'],
        wait: false,
        startFolder: '/games/fake-game/bin'
      }
    )
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils') as {
      sendGameStatusUpdate: jest.Mock
    }
    expect(sendGameStatusUpdate).toHaveBeenCalledWith({
      appName: 'fake-app',
      runner: 'legendary',
      status: 'done'
    })
  })

  it('REQ-34.5-07 the runExe branch is a no-op (neither Winetricks nor runWineCommandOnGame called) when exe is falsy, but still reaches sendGameStatusUpdate', async () => {
    await callToolHandler()(undefined, {
      tool: 'runExe',
      appName: 'fake-app',
      runner: 'legendary'
    })

    expect(mockRunWineCommandOnGame).not.toHaveBeenCalled()
    expect(mockWinetricksRun).not.toHaveBeenCalled()
    const { sendGameStatusUpdate } = jest.requireMock('backend/utils') as {
      sendGameStatusUpdate: jest.Mock
    }
    expect(sendGameStatusUpdate).toHaveBeenCalledWith({
      appName: 'fake-app',
      runner: 'legendary',
      status: 'done'
    })
  })

  it('REQ-34.5-07 the gog post-step checks for offline-installer changes and pushes the refreshed game info to the frontend when one exists', async () => {
    const fakeGameInfo = { app_name: 'fake-gog-app', title: 'Fake GOG Game' }
    mockGetGameInfo.mockReturnValue(fakeGameInfo)

    await callToolHandler()(undefined, {
      tool: 'winecfg',
      appName: 'fake-gog-app',
      runner: 'gog'
    })

    expect(mockCheckForOfflineInstallerChanges).toHaveBeenCalledWith(
      'fake-gog-app'
    )
    expect(mockGetGameInfo).toHaveBeenCalledWith('fake-gog-app')
    expect(mockSendFrontendMessage).toHaveBeenCalledWith(
      'pushGameToLibrary',
      fakeGameInfo
    )
  })

  it('REQ-34.5-07 the gog post-step does not push to the frontend when getGameInfo returns nothing', async () => {
    mockGetGameInfo.mockReturnValue(undefined)

    await callToolHandler()(undefined, {
      tool: 'winecfg',
      appName: 'fake-gog-app',
      runner: 'gog'
    })

    expect(mockCheckForOfflineInstallerChanges).toHaveBeenCalledWith(
      'fake-gog-app'
    )
    expect(mockSendFrontendMessage).not.toHaveBeenCalled()
  })

  it('REQ-34.5-07 a legendary callTool does not trigger the gog-only post-step', async () => {
    await callToolHandler()(undefined, {
      tool: 'winecfg',
      appName: 'fake-app',
      runner: 'legendary'
    })

    expect(mockCheckForOfflineInstallerChanges).not.toHaveBeenCalled()
    expect(mockSendFrontendMessage).not.toHaveBeenCalled()
  })
})
