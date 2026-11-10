// Mock environment constants first, before any imports
const mockIsCLINoGui = jest.fn()
jest.mock('../constants/environment', () => ({
  get isCLINoGui() {
    return mockIsCLINoGui()
  },
  isSnap: false
}))

// Mock paths to avoid XDG_CONFIG_HOME issues
jest.mock('../constants/paths', () => ({
  windowIcon: 'mock-icon-path',
  appFolder: '/mock/app/folder',
  userHome: '/mock/home'
}))

// Mock GlobalConfig so we can toggle hideWindowOnProtocolLaunch per test
const mockHideWindowOnProtocolLaunch = jest.fn(() => false)
jest.mock('../config', () => ({
  GlobalConfig: {
    get: () => ({
      getSettings: () => ({
        hideWindowOnProtocolLaunch: mockHideWindowOnProtocolLaunch()
      })
    })
  }
}))

import { handleProtocol, markFrontendReady, RUNNERS } from '../protocol'
import i18next from 'i18next'
import { app, dialog } from 'backend/platform'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { logInfo, logError } from '../logger'
import { dispatchSteamLaunch } from '../storeManagers/steam/launchDispatch'

// Mock electron modules
jest.mock('backend/platform', () => ({
  app: {
    quit: jest.fn(),
    hideMainWindow: jest.fn(),
    raiseMainWindow: jest.fn(),
    inAppDialogRaiseCount: jest.fn(() => 0)
  },
  dialog: {
    showMessageBox: jest.fn()
  }
}))

// Mock other dependencies
jest.mock('../main_window', () => ({
  getMainWindow: jest.fn()
}))

jest.mock('../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// The managers and the launcher reach the protocol handler by deps (66.1-11), not by module mock.
const libraryManagerMap = {
  legendary: {
    getGame: jest.fn(),
    refreshInstalled: jest.fn(),
    loadGamesInAccount: jest.fn()
  },
  gog: {
    getGame: jest.fn(),
    refreshInstalled: jest.fn()
  },
  nile: {
    getGame: jest.fn()
  },
  sideload: {
    getGame: jest.fn()
  },
  steam: {
    getGame: jest.fn()
  }
}
const launchEventCallback = jest.fn()
const deps = {
  managers: { library: libraryManagerMap },
  launcher: { launchEventCallback }
} as never

// Phase 35 plan 20 (D-35-19-05/06): the Steam launch dispatch is now a separate module both
// `protocol.ts` (lazily) and `steamFlowRegistration.ts` import — mocked here so these tests
// assert DISPATCH (was the Steam path reached, not `launchEventCallback`) rather than a real
// Steam launch.
jest.mock('../storeManagers/steam/launchDispatch', () => ({
  dispatchSteamLaunch: jest.fn()
}))

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  LogPrefix: {
    ProtocolHandler: 'ProtocolHandler'
  }
}))

// Mock i18next
jest.mock('i18next', () => ({
  t: jest.fn((key: string, fallback?: string) => fallback || key)
}))

// Mock additional dependencies to avoid import issues
jest.mock('../storeManagers/legendary/constants', () => ({
  legendaryConfigPath: '/mock/legendary/config',
  legendaryUserInfo: '/mock/legendary/user.json',
  legendaryInstalled: '/mock/legendary/installed.json'
}))

jest.mock('process', () => ({
  env: {
    XDG_CONFIG_HOME: '/mock/xdg/config'
  }
}))

describe('protocol.ts --no-gui behavior', () => {
  const mockMainWindow = {
    show: jest.fn(),
    hide: jest.fn(),
    isVisible: jest.fn(() => true)
  }

  const mockGameInfo = {
    app_name: 'test-game',
    title: 'Test Game',
    runner: 'legendary' as const,
    is_installed: false
  }

  const mockGameSettings = {
    ignoreGameUpdates: false
  }
  const emptyGameInfoMock = { getGameInfo: () => ({}) }

  beforeEach(() => {
    jest.clearAllMocks()
    mockHideWindowOnProtocolLaunch.mockReturnValue(false)
    mockMainWindow.isVisible.mockReturnValue(true)

    const gameMock = {
      getGameInfo: () => mockGameInfo,
      getSettings: () => mockGameSettings
    }

    ;(getMainWindow as jest.Mock).mockReturnValue(mockMainWindow)
    libraryManagerMap.legendary.getGame.mockReturnValue(gameMock)

    // Mock other game managers to return empty objects
    libraryManagerMap.gog.getGame.mockReturnValue(emptyGameInfoMock)
    libraryManagerMap.nile.getGame.mockReturnValue(emptyGameInfoMock)
    libraryManagerMap.sideload.getGame.mockReturnValue(emptyGameInfoMock)
    libraryManagerMap.steam.getGame.mockReturnValue(emptyGameInfoMock)
    ;(dispatchSteamLaunch as jest.Mock).mockResolvedValue(true)
  })

  describe('when game is not installed', () => {
    beforeEach(() => {
      mockGameInfo.is_installed = false
    })

    describe('with --no-gui flag', () => {
      beforeEach(() => {
        mockIsCLINoGui.mockReturnValue(true)
      })

      test('should exit app when user clicks No', async () => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })

        await handleProtocol(deps, ['gamelib://launch/test-game'])

        expect(app.quit).toHaveBeenCalled()
      })

      test('should show GUI and install when user clicks Yes', async () => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })

        await handleProtocol(deps, ['gamelib://launch/test-game'])

        expect(app.raiseMainWindow).toHaveBeenCalled()
        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'installGame',
          'test-game',
          'legendary'
        )
        expect(app.quit).not.toHaveBeenCalled()
      })
    })

    describe('without --no-gui flag', () => {
      beforeEach(() => {
        mockIsCLINoGui.mockReturnValue(false)
      })

      test('should not exit app when user clicks No', async () => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })

        await handleProtocol(deps, ['gamelib://launch/test-game'])

        expect(app.quit).not.toHaveBeenCalled()
        expect(mockMainWindow.show).not.toHaveBeenCalled()
      })

      test('should install when user clicks Yes (normal behavior)', async () => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })

        await handleProtocol(deps, ['gamelib://launch/test-game'])

        expect(sendFrontendMessage).toHaveBeenCalledWith(
          'installGame',
          'test-game',
          'legendary'
        )
        expect(app.quit).not.toHaveBeenCalled()
        expect(mockMainWindow.show).not.toHaveBeenCalled()
      })
    })
  })

  describe('when game is installed', () => {
    beforeEach(() => {
      mockGameInfo.is_installed = true
    })

    test('should launch game directly regardless of --no-gui flag', async () => {
      mockIsCLINoGui.mockReturnValue(true)

      // Mock launchEventCallback to avoid complex setup
      const mockLaunchEventCallback = jest.fn()
      jest.doMock('../launcher', () => ({
        launchEventCallback: mockLaunchEventCallback
      }))
      launchEventCallback.mockResolvedValue({ status: 'done' })
      await handleProtocol(deps, ['gamelib://launch/test-game'])

      // Should not show dialog for installed games
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })
  })

  describe('--no-gui launch that ends without a game session exits (cold-start-link-not-installed #3)', () => {
    const inAppDialogRaiseCount = app.inAppDialogRaiseCount as jest.Mock
    beforeEach(() => {
      mockGameInfo.is_installed = true
      mockIsCLINoGui.mockReturnValue(true)
      inAppDialogRaiseCount.mockReturnValue(0)
    })

    test('aborted launch with the window still hidden quits', async () => {
      launchEventCallback.mockResolvedValue({ status: 'abort' })
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.quit).toHaveBeenCalledTimes(1)
    })

    test('a thrown launch error with the window still hidden quits', async () => {
      launchEventCallback.mockRejectedValue(new Error('boom'))
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.quit).toHaveBeenCalledTimes(1)
    })

    test('an in-app dialog that raised the window keeps GameLib open', async () => {
      launchEventCallback.mockImplementation(async () => {
        inAppDialogRaiseCount.mockReturnValue(1)
        return { status: 'error' }
      })
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.quit).not.toHaveBeenCalled()
    })

    test('normal completion is left to the launcher (no second exit)', async () => {
      launchEventCallback.mockResolvedValue({ status: 'done' })
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.quit).not.toHaveBeenCalled()
    })

    test('without --no-gui an abort does not quit', async () => {
      mockIsCLINoGui.mockReturnValue(false)
      launchEventCallback.mockResolvedValue({ status: 'abort' })
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.quit).not.toHaveBeenCalled()
    })
  })

  describe('cold-start link waits for installed state (cold-start-link-not-installed)', () => {
    const gogGame = {
      app_name: '1542190742',
      title: 'Bloody Hell',
      runner: 'gog' as const,
      is_installed: false
    }

    beforeEach(() => {
      mockIsCLINoGui.mockReturnValue(true)
      gogGame.is_installed = false
      libraryManagerMap.gog.getGame.mockReturnValue({
        getGameInfo: () => gogGame,
        getSettings: () => ({ ignoreGameUpdates: false })
      })
      // The manager only reports the game as installed once refreshInstalled() has run.
      libraryManagerMap.gog.refreshInstalled.mockImplementation(() => {
        gogGame.is_installed = true
      })
    })

    test('loads installed state before resolving the game, so an installed game launches', async () => {
      await handleProtocol(deps, [
        'gamelib://launch?appName=1542190742&runner=gog'
      ])

      expect(libraryManagerMap.gog.refreshInstalled).toHaveBeenCalled()
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(launchEventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ appName: '1542190742', runner: 'gog' })
      )
    })

    test('legendary also loads its account games and installed state', async () => {
      await handleProtocol(deps, [
        'gamelib://launch?appName=test-game&runner=legendary'
      ])

      expect(libraryManagerMap.legendary.loadGamesInAccount).toHaveBeenCalled()
      expect(libraryManagerMap.legendary.refreshInstalled).toHaveBeenCalled()
    })
  })

  describe('dialog buttons fall back to English when i18next is uninitialized', () => {
    test('not-installed dialog shows Yes/No, not raw keys or undefined', async () => {
      mockIsCLINoGui.mockReturnValue(false)
      mockGameInfo.is_installed = false
      // Uninitialized i18next returns undefined even when given a default.
      ;(i18next.t as unknown as jest.Mock).mockImplementation(() => undefined)
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 1 })

      await handleProtocol(deps, ['gamelib://launch/test-game'])

      expect(dialog.showMessageBox).toHaveBeenCalledWith(
        mockMainWindow,
        expect.objectContaining({ buttons: ['Yes', 'No'] })
      )
      ;(i18next.t as unknown as jest.Mock).mockImplementation(
        (key: string, fallback?: string) => fallback || key
      )
    })
  })

  describe('edge cases', () => {
    test('should handle invalid URLs gracefully', async () => {
      await handleProtocol(deps, ['not-a-heroic-url'])

      // Should not crash or call any dialog/app methods
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })

    test('should handle missing game info', async () => {
      // Mock gameManagerMap to return empty object for missing games
      libraryManagerMap.legendary.getGame.mockReturnValue(emptyGameInfoMock)

      await handleProtocol(deps, ['gamelib://launch/nonexistent-game'])

      // Should not show dialog if game info cannot be found
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })

    test('should handle missing main window', async () => {
      ;(getMainWindow as jest.Mock).mockReturnValue(null)
      mockIsCLINoGui.mockReturnValue(true)

      await handleProtocol(deps, ['gamelib://launch/test-game'])

      // Should return early if no main window available; under --no-gui nothing is left to
      // wait for, so the process exits (Steam's shortcut button must not stay on Stop)
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).toHaveBeenCalledTimes(1)
    })
  })

  describe('hide window on protocol launch', () => {
    let uptimeSpy: jest.SpyInstance
    beforeEach(() => {
      mockIsCLINoGui.mockReturnValue(false)
      mockGameInfo.is_installed = true
      // Default: well past the cold-start window; individual tests override.
      uptimeSpy = jest.spyOn(process, 'uptime').mockReturnValue(1000)
    })
    afterEach(() => uptimeSpy.mockRestore())

    test('cold start (renderer never ready) + setting on hides once, before dispatch', async () => {
      // Fresh module state: frontendReady has not been seen in this isolate.
      let isolatedHandle!: typeof handleProtocol
      let isolatedApp!: typeof app
      await jest.isolateModulesAsync(async () => {
        isolatedHandle = (await import('../protocol')).handleProtocol
        isolatedApp = (await import('backend/platform')).app
      })
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)

      await isolatedHandle(deps, ['gamelib://launch/test-game'])

      expect(isolatedApp.hideMainWindow).toHaveBeenCalledTimes(1)
    })

    test('cold start hides on the Steam branch too, before dispatch', async () => {
      uptimeSpy.mockReturnValue(1)
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      libraryManagerMap.steam.getGame.mockReturnValue({
        getGameInfo: () => ({
          app_name: 'steam-appid-123',
          title: 'Steam Game',
          runner: 'steam',
          is_installed: true
        }),
        getSettings: () => mockGameSettings
      })
      libraryManagerMap.legendary.getGame.mockReturnValue(emptyGameInfoMock)
      const order: string[] = []
      ;(app.hideMainWindow as jest.Mock).mockImplementation(() =>
        order.push('hide')
      )
      ;(dispatchSteamLaunch as jest.Mock).mockImplementation(async () => {
        order.push('dispatch')
        return true
      })

      await handleProtocol(deps, ['gamelib://launch/steam-appid-123'])

      expect(order).toEqual(['hide', 'dispatch'])
    })

    test('cold start + gui=false + setting off hides', async () => {
      uptimeSpy.mockReturnValue(1)
      await handleProtocol(deps, [
        'gamelib://launch?appName=test-game&runner=legendary&gui=false'
      ])
      expect(app.hideMainWindow).toHaveBeenCalledTimes(1)
    })

    test('uptime inside the cold window still counts as cold after frontendReady', async () => {
      markFrontendReady()
      uptimeSpy.mockReturnValue(5)
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.hideMainWindow).toHaveBeenCalledTimes(1)
    })

    test('warm link + setting on + no gui param does NOT hide', async () => {
      markFrontendReady()
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.hideMainWindow).not.toHaveBeenCalled()
    })

    test('warm link + gui=false still hides', async () => {
      markFrontendReady()
      await handleProtocol(deps, [
        'gamelib://launch?appName=test-game&runner=legendary&gui=false'
      ])
      expect(app.hideMainWindow).toHaveBeenCalledTimes(1)
    })

    test('does not hide when neither setting nor URL param is set', async () => {
      uptimeSpy.mockReturnValue(1)
      await handleProtocol(deps, ['gamelib://launch/test-game'])
      expect(app.hideMainWindow).not.toHaveBeenCalled()
    })

    test('declined URL-arg confirmation neither hides nor launches', async () => {
      uptimeSpy.mockReturnValue(1)
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      // response 0 = Decline in the URL-arg confirmation dialog.
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })
      await handleProtocol(deps, [
        'gamelib://launch?appName=test-game&runner=legendary&arg=--foo'
      ])
      expect(app.hideMainWindow).not.toHaveBeenCalled()
      expect(launchEventCallback).not.toHaveBeenCalled()
    })

    test('raises the window when a not-installed game needs the install dialog while hidden for this launch', async () => {
      uptimeSpy.mockReturnValue(1)
      mockGameInfo.is_installed = false
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })

      await handleProtocol(deps, ['gamelib://launch/test-game'])

      expect(app.raiseMainWindow).toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'installGame',
        'test-game',
        'legendary'
      )
    })
  })

  // Phase 34.5 gap cycle 6 plan 44 (F-34.5-G6-09, REQ-34.5-01/05/12): exercises the exact
  // production argv SHAPES `sidecar_forward_args`/`deliverStartupProtocolUrl` deliver — the
  // real dev-sidecar and packaged-SEA argv arrays (not a hand-built ideal), the D-44-C
  // runner-less truncated shape, and the inert-Electron-flags rejection case.
  describe('production argv shapes (Phase 34.5 gap cycle 6 plan 44, F-34.5-G6-09)', () => {
    const installedGogGame = {
      app_name: '1207659037',
      title: 'Installed GOG Game',
      runner: 'gog' as const,
      is_installed: true
    }
    const installedGameSettings = { ignoreGameUpdates: false }

    beforeEach(() => {
      mockIsCLINoGui.mockReturnValue(true)
      // Deterministic regardless of test order: the outer describe's own `mockGameInfo`
      // (shared by `libraryManagerMap.legendary.getGame`'s mock) is mutated by sibling
      // describes elsewhere in this file, so this block sets its own installed state rather
      // than inheriting whatever the previous test left behind.
      mockGameInfo.is_installed = true
      libraryManagerMap.gog.getGame.mockReturnValue({
        getGameInfo: () => installedGogGame,
        getSettings: () => installedGameSettings
      })
    })

    // RED direction: a shell that passed only the bare URL with no surrounding argv, or that
    // stripped the query string before handing it to handleProtocol, would fail this.
    test('dev sidecar argv shape: node + entry path + --no-gui + URL launches the named GOG game', async () => {
      await handleProtocol(deps, [
        '/usr/local/bin/node',
        '/repo/build/main/sidecar.js',
        '--no-gui',
        'gamelib://launch?appName=1207659037&runner=gog'
      ])

      expect(libraryManagerMap.gog.getGame).toHaveBeenCalledWith('1207659037')
      expect(logInfo).toHaveBeenCalledWith(
        ['Received', 'gamelib://launch?appName=1207659037&runner=gog'],
        'ProtocolHandler'
      )
    })

    // The two spawn paths (spawn_sidecar_dev / spawn_sidecar_packaged, src-tauri/src/main.rs)
    // produce DIFFERENT argv shapes and only the dev one is exercised by a `tauri:dev` session
    // — this case exists so the packaged shape is not assumed identical without proof.
    test('packaged SEA argv shape: gamelib-sidecar entry + --no-gui + URL launches the named GOG game', async () => {
      await handleProtocol(deps, [
        '/Applications/GameLib.app/Contents/MacOS/gamelib-sidecar',
        '--no-gui',
        'gamelib://launch?appName=1207659037&runner=gog'
      ])

      expect(libraryManagerMap.gog.getGame).toHaveBeenCalledWith('1207659037')
      expect(logInfo).toHaveBeenCalledWith(
        ['Received', 'gamelib://launch?appName=1207659037&runner=gog'],
        'ProtocolHandler'
      )
    })

    // D-44-C / U-34.5-19: shortcuts.ts:227's unquoted run.sh template makes bash split the
    // command on the unescaped `&`, so the macOS .app path delivers exactly this
    // runner-less, truncated URL. RED direction: an implementation that required a `runner`
    // param would return early with "Could not receive game data" and never call getGame at
    // all.
    test('runner-less truncated shape (D-44-C / U-34.5-19): findGame all-runner search runs, legendary first', async () => {
      await handleProtocol(deps, [
        '--no-gui',
        'gamelib://launch?appName=1207659037'
      ])

      // findGame (protocol.ts:181) iterates RUNNERS.options with no runner param -- legendary
      // is the first entry (RUNNERS = z.enum(['legendary','gog','nile','sideload'])).
      expect(libraryManagerMap.legendary.getGame).toHaveBeenCalledWith(
        '1207659037'
      )
    })

    // Pins that the Electron-shaped flags this shell now drops (--no-sandbox) — and any argv
    // with no gamelib:// URL at all — are inert: no game lookup, no Received log line.
    test('inert flags: --no-gui and --no-sandbox alone perform no getGame call and emit no Received log line', async () => {
      await handleProtocol(deps, ['--no-gui', '--no-sandbox'])

      expect(libraryManagerMap.legendary.getGame).not.toHaveBeenCalled()
      expect(libraryManagerMap.gog.getGame).not.toHaveBeenCalled()
      expect(libraryManagerMap.nile.getGame).not.toHaveBeenCalled()
      expect(libraryManagerMap.sideload.getGame).not.toHaveBeenCalled()
      expect(logInfo).not.toHaveBeenCalled()
    })
  })

  // Phase 35 plan 20 (D-35-19-05, gap-closure cycle 1): closes live-gate criterion 10 — a
  // `gamelib://launch?appName=<steam appId>` deep link used to log "Could not receive game
  // data" because `RUNNERS` excluded `steam`, so neither the explicit `?runner=steam` path nor
  // the runner-less fallback loop could ever resolve a Steam title.
  describe('RUNNERS enum includes steam (D-35-19-05)', () => {
    // RED-proven: reverting RUNNERS to `z.enum(['legendary', 'gog', 'nile', 'sideload'])`
    // fails this by name — `options` has length 4 and does not contain 'steam'.
    test('RUNNERS.options has length 5 and contains steam', () => {
      expect(RUNNERS.options).toHaveLength(5)
      expect(RUNNERS.options).toContain('steam')
    })
  })

  describe('findGame resolves a Steam appId via the runner-less fallback loop (D-35-19-05)', () => {
    const steamGameInfo = {
      app_name: 'steam-appid-123',
      title: 'Steam Game',
      runner: 'steam' as const,
      is_installed: true
    }

    test('resolves through libraryManagerMap.steam when every other manager is empty', async () => {
      libraryManagerMap.steam.getGame.mockReturnValue({
        getGameInfo: () => steamGameInfo,
        getSettings: () => mockGameSettings
      })
      // legendary is populated by the outer beforeEach (mockGameInfo) -- override it to empty
      // so this case genuinely exercises "every other manager returns nothing".
      libraryManagerMap.legendary.getGame.mockReturnValue(emptyGameInfoMock)

      await handleProtocol(deps, ['gamelib://launch/steam-appid-123'])

      expect(libraryManagerMap.steam.getGame).toHaveBeenCalledWith(
        'steam-appid-123'
      )
      // Confirms findGame resolved the Steam title (not `undefined`) by observing the launch
      // dispatch that only runs once gameInfo.is_installed is truthy for a resolved game.
      expect(dispatchSteamLaunch).toHaveBeenCalledWith(
        expect.anything(),
        'steam-appid-123'
      )
    })
  })

  describe('Steam is_installed launch dispatches through dispatchSteamLaunch, not launchEventCallback (D-35-19-05/06)', () => {
    const installedSteamGame = {
      app_name: 'steam-appid-999',
      title: 'Installed Steam Game',
      runner: 'steam' as const,
      is_installed: true
    }
    const installedGogGame = {
      app_name: 'gog-appid-1',
      title: 'Installed GOG Game',
      runner: 'gog' as const,
      is_installed: true
    }

    beforeEach(() => {
      libraryManagerMap.steam.getGame.mockReturnValue({
        getGameInfo: () => installedSteamGame,
        getSettings: () => mockGameSettings
      })
      libraryManagerMap.gog.getGame.mockReturnValue({
        getGameInfo: () => installedGogGame,
        getSettings: () => mockGameSettings
      })
    })

    // RED-proven: with the `gameInfo.runner === 'steam'` branch removed from `protocol.ts`,
    // this fails on the `dispatchSteamLaunch` assertion -- the launch instead reaches
    // `launchEventCallback`, whose `existsSync`/`askForceUninstall` precheck is exactly the
    // abort `steamFlowRegistration.ts` avoids for this same runner.
    test('a Steam protocol launch calls dispatchSteamLaunch and never launchEventCallback', async () => {
      await handleProtocol(deps, [
        'gamelib://launch?appName=steam-appid-999&runner=steam'
      ])

      expect(dispatchSteamLaunch).toHaveBeenCalledWith(
        expect.anything(),
        'steam-appid-999'
      )
      expect(launchEventCallback).not.toHaveBeenCalled()
    })

    test('a GOG protocol launch calls launchEventCallback and never dispatchSteamLaunch (inverse case)', async () => {
      await handleProtocol(deps, [
        'gamelib://launch?appName=gog-appid-1&runner=gog'
      ])

      expect(launchEventCallback).toHaveBeenCalled()
      expect(dispatchSteamLaunch).not.toHaveBeenCalled()
    })
  })
  // Quick task 260907-f2g (class 6 of 260907-e7a's census). `findGame()`'s explicit-runner
  // branch returned `getGameInfo()` unguarded, so the `{}` cross-runner sentinel (D-01) came
  // back TRUTHY and defeated `handleLaunch`'s own `if (!gameInfo)` guard at protocol.ts:116.
  // The launch then rejected at protocol.ts:124 with
  // `TypeError: Cannot read properties of undefined (reading 'getGame')`, because
  // `gameInfo.runner` on a `{}` is undefined -- a silent no-op deep link, no dialog, no error.
  describe('findGame explicit-runner branch guards the {} sentinel (260907-f2g)', () => {
    // RED-proven: hand-editing protocol.ts back to the single-line
    // `if (runner) return libraryManagerMap[runner].getGame(appName).getGameInfo()`
    // fails this by name with:
    //   Received promise rejected instead of resolved
    //   Rejected to value: [TypeError: Cannot read properties of undefined (reading 'getGame')]
    test('an explicit-runner link whose manager returns the {} sentinel resolves and logs', async () => {
      // `libraryManagerMap.steam.getGame` returns `emptyGameInfoMock` from the outer beforeEach.
      await expect(
        handleProtocol(deps, ['gamelib://launch?appName=steam-1&runner=steam'])
      ).resolves.toBeUndefined()

      expect(logError).toHaveBeenCalledWith(
        'Could not receive game data for steam-1!',
        'ProtocolHandler'
      )
      expect(dispatchSteamLaunch).not.toHaveBeenCalled()
      expect(launchEventCallback).not.toHaveBeenCalled()
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
    })

    // Inverse case -- the guard only ever narrows. A populated GameInfo on the same
    // explicit-runner path must still reach its launch dispatch.
    test('an explicit-runner link with a populated GameInfo still dispatches', async () => {
      libraryManagerMap.steam.getGame.mockReturnValue({
        getGameInfo: () => ({
          app_name: 'steam-2',
          title: 'Populated Steam Game',
          runner: 'steam' as const,
          is_installed: true
        }),
        getSettings: () => mockGameSettings
      })

      await handleProtocol(deps, [
        'gamelib://launch?appName=steam-2&runner=steam'
      ])

      expect(dispatchSteamLaunch).toHaveBeenCalledWith(
        expect.anything(),
        'steam-2'
      )
      expect(logError).not.toHaveBeenCalledWith(
        'Could not receive game data for steam-2!',
        'ProtocolHandler'
      )
    })
  })

  // Todo 2026-10-05-gamelib-deep-link-launch-args-reach-runner-cli-options (critical). A
  // `gamelib://launch?...&arg=...&altExe=...` link is attacker-authored: any web page can
  // emit one. URL-supplied args/altExe must never reach an installed game's launch without
  // an explicit in-app confirmation showing the exact executable and args, whose dismiss /
  // fail-safe answer (cancelId) is "don't launch". altExe must resolve inside the game's
  // install path. gogdl cannot take a `--` separator, so `-`-prefixed URL args are stripped
  // for it before they reach the dialog or the launch.
  describe('URL-supplied arg/altExe need confirmation (deep-link launch-args todo)', () => {
    const installedLegendaryGame = {
      app_name: 'Fortnite',
      title: 'Fortnite',
      runner: 'legendary' as const,
      is_installed: true,
      install: { install_path: '/games/Fortnite' }
    }
    const installedGogGame = {
      app_name: '1207659037',
      title: 'Installed GOG Game',
      runner: 'gog' as const,
      is_installed: true,
      install: { install_path: '/games/gog' }
    }
    const DECLINE = 0
    const LAUNCH = 1

    beforeEach(() => {
      mockIsCLINoGui.mockReturnValue(false)
      libraryManagerMap.legendary.getGame.mockReturnValue({
        getGameInfo: () => installedLegendaryGame,
        getSettings: () => mockGameSettings
      })
      libraryManagerMap.gog.getGame.mockReturnValue({
        getGameInfo: () => installedGogGame,
        getSettings: () => mockGameSettings
      })
    })

    const attackUrl =
      'gamelib://launch?appName=Fortnite&runner=legendary&arg=--wrapper%20%22cmd%20/c%20calc%22'
    const lastDialogOptions = () =>
      (dialog.showMessageBox as jest.Mock).mock.calls[0].at(-1)

    test('a URL with `arg` asks first, and declining launches nothing', async () => {
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
        response: DECLINE
      })

      await handleProtocol(deps, [attackUrl])

      expect(dialog.showMessageBox).toHaveBeenCalledTimes(1)
      expect(launchEventCallback).not.toHaveBeenCalled()
    })

    test("the dialog's dismiss answer (cancelId) is the safe, don't-launch button", async () => {
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
        response: DECLINE
      })

      await handleProtocol(deps, [attackUrl])

      const options = lastDialogOptions()
      expect(options.cancelId).toBe(DECLINE)
      expect(options.defaultId).toBe(DECLINE)
      expect(options.buttons).toHaveLength(2)
    })

    test('the dialog shows the title, the exact executable and the exact args', async () => {
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
        response: DECLINE
      })

      await handleProtocol(deps, [
        attackUrl + '&altExe=' + encodeURIComponent('/games/Fortnite/bin/x.exe')
      ])

      const options = lastDialogOptions()
      const shown = `${options.title}\n${options.message}\n${options.detail}`
      expect(shown).toContain('Fortnite')
      expect(shown).toContain('/games/Fortnite/bin/x.exe')
      expect(shown).toContain('--wrapper "cmd /c calc"')
    })

    test('accepting launches with exactly the URL-supplied args and altExe', async () => {
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
        response: LAUNCH
      })

      await handleProtocol(deps, [
        attackUrl + '&altExe=' + encodeURIComponent('/games/Fortnite/bin/x.exe')
      ])

      expect(launchEventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          appName: 'Fortnite',
          args: ['--wrapper "cmd /c calc"'],
          launchArguments: {
            type: 'altExe',
            executable: '/games/Fortnite/bin/x.exe'
          }
        })
      )
    })

    test.each([
      ['outside the install path', '/usr/bin/evil'],
      ['a `..` escape', '/games/Fortnite/../evil/x.exe'],
      ['a sibling sharing the prefix', '/games/Fortnite-evil/x.exe'],
      ['a UNC-style remote share', '//host/share/x.exe']
    ])(
      'an altExe %s is refused: no dialog, no launch',
      async (_label, altExe) => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
          response: LAUNCH
        })

        await handleProtocol(deps, [
          'gamelib://launch?appName=Fortnite&runner=legendary&altExe=' +
            encodeURIComponent(altExe)
        ])

        expect(launchEventCallback).not.toHaveBeenCalled()
        expect(dialog.showMessageBox).not.toHaveBeenCalled()
      }
    )

    test('gog: `-`-prefixed URL args are stripped before the dialog and the launch', async () => {
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
        response: LAUNCH
      })

      await handleProtocol(deps, [
        'gamelib://launch?appName=1207659037&runner=gog&arg=--wrapper&arg=calc&arg=--wra=x&arg=-skipintro'
      ])

      expect(launchEventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ appName: '1207659037', args: ['calc'] })
      )
      expect(lastDialogOptions().detail).not.toContain('--wrapper')
    })

    test('an arg cannot forge a line in the dialog: newlines and bidi overrides are escaped', async () => {
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({
        response: DECLINE
      })

      await handleProtocol(deps, [
        'gamelib://launch?appName=Fortnite&runner=legendary&arg=x%0AExecutable%3A%20safe&arg=%E2%80%AEexe'
      ])

      const { detail } = lastDialogOptions()
      expect(detail).toContain('"x\\u{a}Executable: safe"')
      expect(detail).toContain('"\\u{202e}exe"')
      expect(detail.split('\n')).toHaveLength(4)
    })

    test('a URL with no arg/altExe launches unchanged, without a dialog', async () => {
      await handleProtocol(deps, [
        'gamelib://launch?appName=Fortnite&runner=legendary'
      ])

      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(launchEventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ appName: 'Fortnite', args: [] })
      )
    })
  })
})
