import { createMainWindow } from '../main_window'
import { sendFrontendMessage } from '../ipc'
import { BrowserWindow, Display, screen } from 'backend/platform'
import { overrideProcessPlatform } from './constants.test'
import { configStore } from 'backend/constants/key_value_stores'

jest.mock('../logger')

describe('main_window', () => {
  describe('sendFrontendMessage', () => {
    describe('if no main window', () => {
      beforeAll(() => {
        BrowserWindow.setAllWindows([])
      })

      it('returns false', () => {
        expect(sendFrontendMessage('message')).toBe(false)
      })
    })

    describe('if there is a main window', () => {
      const window = {
        webContents: {
          send: jest.fn(),
          isDestroyed: jest.fn().mockReturnValue(false)
        },
        isDestroyed: jest.fn().mockReturnValue(false)
      }

      // stub windows
      beforeAll(() => {
        BrowserWindow.setAllWindows([window])
      })

      // spy the `send` method
      beforeEach(() => {
        window.webContents.send = jest.fn()
        window.webContents.isDestroyed = jest.fn().mockReturnValue(false)
        window.isDestroyed = jest.fn().mockReturnValue(false)
      })

      // cleanup stubs
      afterAll(() => {
        BrowserWindow.setAllWindows([])
      })

      it('sends a message to its webContents', () => {
        sendFrontendMessage('message', 'param1', 'param2')

        expect(window.webContents.send).toBeCalledWith(
          'message',
          'param1',
          'param2'
        )
      })
    })

    // debug/steam-install-slow-start (Thread D-1): a download/install progress
    // heartbeat (GOG's onInstallOrUpdateOutput/sendProgressUpdate, or Steam's
    // ACF poller) firing during app-quit teardown found `getMainWindow()`
    // still returning a non-null reference to a window Electron had already
    // destroyed as part of `app.exit()`'s internal shutdown — the pre-fix
    // `if (!mainWindow) return false` guard doesn't cover "non-null but
    // destroyed", so `mainWindow.webContents.send(...)` threw "Object has been
    // destroyed" as an UNCAUGHT exception in the main process.
    describe('if the main window is destroyed (Thread D-1)', () => {
      const destroyedWindow = {
        webContents: {
          send: jest.fn(),
          isDestroyed: jest.fn().mockReturnValue(false)
        },
        isDestroyed: jest.fn().mockReturnValue(true)
      }

      beforeAll(() => {
        BrowserWindow.setAllWindows([destroyedWindow])
      })

      // `resetMocks: true` strips any `.mockReturnValue()` set at
      // describe-body-eval time before EVERY test body runs (same gotcha
      // documented in `__mocks__/electron.ts` for `app.getAppPath`) — so
      // these must be (re)assigned fresh in `beforeEach`, not just once above.
      beforeEach(() => {
        destroyedWindow.webContents.send = jest.fn()
        destroyedWindow.webContents.isDestroyed = jest
          .fn()
          .mockReturnValue(false)
        destroyedWindow.isDestroyed = jest.fn().mockReturnValue(true)
      })

      afterAll(() => {
        BrowserWindow.setAllWindows([])
      })

      it('returns false and never calls webContents.send', () => {
        expect(sendFrontendMessage('message', 'param1')).toBe(false)
        expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
      })
    })

    describe('if the main window is alive but its webContents is destroyed (Thread D-1)', () => {
      const windowWithDestroyedWebContents = {
        webContents: {
          send: jest.fn(),
          isDestroyed: jest.fn().mockReturnValue(true)
        },
        isDestroyed: jest.fn().mockReturnValue(false)
      }

      beforeAll(() => {
        BrowserWindow.setAllWindows([windowWithDestroyedWebContents])
      })

      // See the sibling describe block above re: `resetMocks: true`.
      beforeEach(() => {
        windowWithDestroyedWebContents.webContents.send = jest.fn()
        windowWithDestroyedWebContents.webContents.isDestroyed = jest
          .fn()
          .mockReturnValue(true)
        windowWithDestroyedWebContents.isDestroyed = jest
          .fn()
          .mockReturnValue(false)
      })

      afterAll(() => {
        BrowserWindow.setAllWindows([])
      })

      it('returns false and never calls webContents.send', () => {
        expect(sendFrontendMessage('message', 'param1')).toBe(false)
        expect(
          windowWithDestroyedWebContents.webContents.send
        ).not.toHaveBeenCalled()
      })
    })
  })

  describe('createMainWindow', () => {
    describe('with stored window geometry', () => {
      beforeEach(() => {
        jest.spyOn(configStore, 'has').mockReturnValue(true)
        jest.spyOn(configStore, 'get').mockReturnValue({
          width: 800,
          height: 600,
          x: 0,
          y: 0
        })
      })

      it('creates the new window with the given geometry', () => {
        const window = createMainWindow()
        const options = window.options

        expect(options.height).toBe(600)
        expect(options.width).toBe(800)
        expect(options.x).toBe(0)
        expect(options.y).toBe(0)
      })
    })

    describe('without stored window geometry', () => {
      beforeAll(() => {
        jest.spyOn(configStore, 'has').mockReturnValue(false)
      })

      it('creates the new window with the default geometry', () => {
        const window = createMainWindow()
        const options = window.options

        expect(options.height).toBe(690)
        expect(options.width).toBe(1200)
        expect(options.x).toBe(0)
        expect(options.y).toBe(0)
      })

      it('ensures windows is not bigger than the screen', () => {
        // mock a smaller screen info
        jest.spyOn(screen, 'getPrimaryDisplay').mockReturnValue({
          workAreaSize: {
            height: 768,
            width: 1024
          }
        } as Display)

        const window = createMainWindow()
        const options = window.options

        expect(options.height).toBe(690)
        expect(options.width).toBe(1024 * 0.8) // 80% of the workAreaSize.width
        expect(options.x).toBe(0)
        expect(options.y).toBe(0)
      })
    })

    describe('with frameless window enabled', () => {
      beforeEach(() => {
        jest.spyOn(configStore, 'has').mockReturnValue(false)
        jest.spyOn(configStore, 'get').mockReturnValue({
          framelessWindow: true
        })
      })

      it('creates a simple frameless window on Linux', () => {
        const originalPlatform = overrideProcessPlatform('linux')
        const window = createMainWindow()
        const options = window.options
        overrideProcessPlatform(originalPlatform)

        expect(options.frame).toBe(false)
        expect(options.titleBarStyle).toBeUndefined()
        expect(options.titleBarOverlay).toBeUndefined()
      })

      it('creates a frameless window with overlay controls on macOS and Windows', () => {
        ;['darwin', 'win32'].forEach((platform) => {
          const originalPlatform = overrideProcessPlatform(platform)
          const window = createMainWindow()
          const options = window.options
          overrideProcessPlatform(originalPlatform)

          expect(options.frame).toBeUndefined()
          expect(options.titleBarStyle).toBe('hidden')
          expect(options.titleBarOverlay).toBe(true)
        })
      })
    })

    describe('with frameless window disabled', () => {
      beforeAll(() => {
        jest.spyOn(configStore, 'has').mockReturnValue(false)
        jest.spyOn(configStore, 'get').mockReturnValue({
          framelessWindow: false
        })
      })

      it('creates the new window with default titlebar', () => {
        const window = createMainWindow()
        const options = window.options

        expect(options.frame).toBeUndefined()
        expect(options.titleBarStyle).toBeUndefined()
        expect(options.titleBarOverlay).toBeUndefined()
      })
    })
  })
})
