import { sendFrontendMessage } from '../ipc'
import { BrowserWindow } from 'backend/platform'

// Phase 35 Plan 15: `backend/platform`'s manual mock must be requested BY NAME. The
// `electron` one it replaces was applied automatically because electron is a
// node_modules package; a user-module mock is opt-in. See
// src/backend/platform/__mocks__/index.ts.
jest.mock('backend/platform')
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

  // The `createMainWindow` describes were REMOVED by Phase 35 Plan 15 together with the
  // function itself: plan 35-14 deleted its only caller (src/backend/main.ts) and Tauri owns
  // the window, so its sole importer was this test. They asserted Electron BrowserWindow
  // geometry, frameless/titleBarOverlay behaviour and screen-size clamping -- none of which
  // has a Tauri equivalent here. The `sendFrontendMessage` describes above cover the half of
  // the module that survives (`getMainWindow`). See D-35-15-01.

})
