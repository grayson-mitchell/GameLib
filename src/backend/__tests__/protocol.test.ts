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

import { handleProtocol, shouldHideWindowForProtocolArgs } from '../protocol'
import { app, dialog } from 'backend/platform'
import { libraryManagerMap } from '../storeManagers'
import { getMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { logInfo } from '../logger'

// Mock electron modules
jest.mock('backend/platform', () => ({
  app: {
    quit: jest.fn()
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

jest.mock('../storeManagers', () => ({
  libraryManagerMap: {
    legendary: {
      getGame: jest.fn()
    },
    gog: {
      getGame: jest.fn()
    },
    nile: {
      getGame: jest.fn()
    },
    sideload: {
      getGame: jest.fn()
    }
  }
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

// Mock launcher
jest.mock('../launcher', () => ({
  launchEventCallback: jest.fn()
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
    ;(libraryManagerMap.legendary.getGame as jest.Mock).mockReturnValue(
      gameMock
    )

    // Mock other game managers to return empty objects
    ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue(
      emptyGameInfoMock
    )
    ;(libraryManagerMap.nile.getGame as jest.Mock).mockReturnValue(
      emptyGameInfoMock
    )
    ;(libraryManagerMap.sideload.getGame as jest.Mock).mockReturnValue(
      emptyGameInfoMock
    )
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

        await handleProtocol(['gamelib://launch/test-game'])

        expect(app.quit).toHaveBeenCalled()
      })

      test('should show GUI and install when user clicks Yes', async () => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })

        await handleProtocol(['gamelib://launch/test-game'])

        expect(mockMainWindow.show).toHaveBeenCalled()
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

        await handleProtocol(['gamelib://launch/test-game'])

        expect(app.quit).not.toHaveBeenCalled()
        expect(mockMainWindow.show).not.toHaveBeenCalled()
      })

      test('should install when user clicks Yes (normal behavior)', async () => {
        ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })

        await handleProtocol(['gamelib://launch/test-game'])

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

      await handleProtocol(['gamelib://launch/test-game'])

      // Should not show dialog for installed games
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })
  })

  describe('edge cases', () => {
    test('should handle invalid URLs gracefully', async () => {
      await handleProtocol(['not-a-heroic-url'])

      // Should not crash or call any dialog/app methods
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })

    test('should handle missing game info', async () => {
      // Mock gameManagerMap to return empty object for missing games
      ;(libraryManagerMap.legendary.getGame as jest.Mock).mockReturnValue(
        emptyGameInfoMock
      )

      await handleProtocol(['gamelib://launch/nonexistent-game'])

      // Should not show dialog if game info cannot be found
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })

    test('should handle missing main window', async () => {
      ;(getMainWindow as jest.Mock).mockReturnValue(null)
      mockIsCLINoGui.mockReturnValue(true)

      await handleProtocol(['gamelib://launch/test-game'])

      // Should return early if no main window available
      expect(dialog.showMessageBox).not.toHaveBeenCalled()
      expect(app.quit).not.toHaveBeenCalled()
    })
  })

  describe('hide window on protocol launch', () => {
    beforeEach(() => {
      mockIsCLINoGui.mockReturnValue(false)
      mockGameInfo.is_installed = true
    })

    test('hides window when URL carries gui=false', async () => {
      await handleProtocol([
        'gamelib://launch?appName=test-game&runner=legendary&gui=false'
      ])

      expect(mockMainWindow.hide).toHaveBeenCalled()
    })

    test('hides window when hideWindowOnProtocolLaunch setting is enabled', async () => {
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)

      await handleProtocol(['gamelib://launch/test-game'])

      expect(mockMainWindow.hide).toHaveBeenCalled()
    })

    test('does not hide window when neither setting nor URL param is set', async () => {
      await handleProtocol(['gamelib://launch/test-game'])

      expect(mockMainWindow.hide).not.toHaveBeenCalled()
    })

    test('does not hide window that is not visible', async () => {
      mockMainWindow.isVisible.mockReturnValue(false)
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)

      await handleProtocol(['gamelib://launch/test-game'])

      expect(mockMainWindow.hide).not.toHaveBeenCalled()
    })

    test('shows window when not-installed game needs install dialog, regardless of hide setting', async () => {
      mockGameInfo.is_installed = false
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      ;(dialog.showMessageBox as jest.Mock).mockResolvedValue({ response: 0 })

      await handleProtocol(['gamelib://launch/test-game'])

      expect(mockMainWindow.show).toHaveBeenCalled()
      expect(sendFrontendMessage).toHaveBeenCalledWith(
        'installGame',
        'test-game',
        'legendary'
      )
    })
  })

  describe('shouldHideWindowForProtocolArgs', () => {
    beforeEach(() => {
      mockHideWindowOnProtocolLaunch.mockReturnValue(false)
    })

    test('returns true when URL has gui=false', () => {
      expect(
        shouldHideWindowForProtocolArgs([
          'gamelib://launch?appName=foo&gui=false'
        ])
      ).toBe(true)
    })

    test('accepts gui=0 and gui=no as equivalent to false', () => {
      expect(
        shouldHideWindowForProtocolArgs(['gamelib://launch?appName=foo&gui=0'])
      ).toBe(true)
      expect(
        shouldHideWindowForProtocolArgs(['gamelib://launch?appName=foo&gui=no'])
      ).toBe(true)
    })

    test('returns true when setting is enabled', () => {
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      expect(
        shouldHideWindowForProtocolArgs(['gamelib://launch/test-game'])
      ).toBe(true)
    })

    test('returns false when setting is off and URL has no gui param', () => {
      expect(
        shouldHideWindowForProtocolArgs(['gamelib://launch/test-game'])
      ).toBe(false)
    })

    test('returns false for non-launch protocol URLs even with setting on', () => {
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      expect(shouldHideWindowForProtocolArgs(['gamelib://ping'])).toBe(false)
    })

    test('returns false when no heroic URL is present', () => {
      mockHideWindowOnProtocolLaunch.mockReturnValue(true)
      expect(
        shouldHideWindowForProtocolArgs(['/path/to/heroic', '--some-flag'])
      ).toBe(false)
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
      ;(libraryManagerMap.gog.getGame as jest.Mock).mockReturnValue({
        getGameInfo: () => installedGogGame,
        getSettings: () => installedGameSettings
      })
    })

    // RED direction: a shell that passed only the bare URL with no surrounding argv, or that
    // stripped the query string before handing it to handleProtocol, would fail this.
    test('dev sidecar argv shape: node + entry path + --no-gui + URL launches the named GOG game', async () => {
      await handleProtocol([
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
      await handleProtocol([
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
      await handleProtocol(['--no-gui', 'gamelib://launch?appName=1207659037'])

      // findGame (protocol.ts:181) iterates RUNNERS.options with no runner param -- legendary
      // is the first entry (RUNNERS = z.enum(['legendary','gog','nile','sideload'])).
      expect(libraryManagerMap.legendary.getGame).toHaveBeenCalledWith(
        '1207659037'
      )
    })

    // Pins that the Electron-shaped flags this shell now drops (--no-sandbox) — and any argv
    // with no gamelib:// URL at all — are inert: no game lookup, no Received log line.
    test('inert flags: --no-gui and --no-sandbox alone perform no getGame call and emit no Received log line', async () => {
      await handleProtocol(['--no-gui', '--no-sandbox'])

      expect(libraryManagerMap.legendary.getGame).not.toHaveBeenCalled()
      expect(libraryManagerMap.gog.getGame).not.toHaveBeenCalled()
      expect(libraryManagerMap.nile.getGame).not.toHaveBeenCalled()
      expect(libraryManagerMap.sideload.getGame).not.toHaveBeenCalled()
      expect(logInfo).not.toHaveBeenCalled()
    })
  })
})
