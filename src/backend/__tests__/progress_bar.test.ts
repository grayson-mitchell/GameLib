import { BrowserWindow } from 'backend/platform'
import { backendEvents } from '../backend_events'
import { sendGameStatusUpdate, sendProgressUpdate } from '../utils'
import '../progress_bar'

// Phase 35 Plan 15: `setAllWindows` is a helper that exists only on the jest DOUBLE
// (src/backend/__mocks__/electron.ts), never on the real `backend/platform` stub, so it is
// unavailable in the production type. Typing it properly means augmenting the mock's own
// declarations -- src/common/typedefs/extra-mock-function.ts -- which is D-35-13-02 and is
// PLAN 35-16's to do. A test-local alias keeps that boundary rather than doing 35-16's job
// badly from here. See D-35-15-01.
const MockBrowserWindow = BrowserWindow as unknown as {
  setAllWindows: (windows: unknown[]) => void
}

// Phase 35 Plan 15: `backend/platform`'s manual mock must be requested BY NAME. The
// `electron` one it replaces was applied automatically because electron is a
// node_modules package; a user-module mock is opt-in. See
// src/backend/platform/__mocks__/index.ts.
jest.mock('backend/platform')
jest.mock('../logger')

describe('progress_bar', () => {
  const window = {
    webContents: {
      send: jest.fn(),
      isDestroyed: jest.fn().mockReturnValue(false)
    },
    setProgressBar: jest.fn(),
    isDestroyed: jest.fn().mockReturnValue(false)
  }

  // stub windows
  beforeAll(() => {
    MockBrowserWindow.setAllWindows([window])
  })

  // cleanup stubs
  afterAll(() => {
    MockBrowserWindow.setAllWindows([])
  })

  // spy on `setProgressBar` method
  // debug/steam-install-slow-start (Thread D-1): `resetMocks: true` strips
  // any `.mockReturnValue()` set at describe-body-eval time before every test
  // body runs, so `isDestroyed` must be (re)assigned fresh here too, not just
  // once above (same gotcha documented in `__mocks__/electron.ts`).
  beforeEach(() => {
    window.setProgressBar = jest.fn()
    window.webContents.isDestroyed = jest.fn().mockReturnValue(false)
    window.isDestroyed = jest.fn().mockReturnValue(false)
  })

  describe('on gameStatusUpdate with status="queued"', () => {
    it('does nothing', () => {
      sendGameStatusUpdate({
        appName: 'Test',
        status: 'queued'
      })

      expect(window.setProgressBar).not.toBeCalled()
    })
  })

  describe('on gameStatusUpdate with status other than "done"', () => {
    it('sets progress bar to indeterminate', () => {
      sendGameStatusUpdate({
        appName: 'Test',
        status: 'installing'
      })

      expect(window.setProgressBar).toBeCalledWith(2)
    })

    it('starts listening for progress updates', () => {
      jest.spyOn(backendEvents, 'on')

      sendGameStatusUpdate({
        appName: 'Test',
        status: 'installing'
      })

      expect(backendEvents.on).toBeCalledWith(
        'progressUpdate-Test',
        expect.any(Function)
      )
    })
  })

  describe('on progressUpdate-${appName}', () => {
    it('sets progress bar according to progress', () => {
      sendProgressUpdate({
        appName: 'Test',
        status: 'installing',
        progress: { percent: 42, bytes: '', eta: '' }
      })

      expect(window.setProgressBar).toBeCalledWith(0.42)
    })
  })

  describe('on gameStatusUpdate with status="done"', () => {
    it('removes the progress bar', () => {
      sendGameStatusUpdate({
        appName: 'Test',
        status: 'done'
      })

      expect(window.setProgressBar).toBeCalledWith(-1)
    })

    it('stops listening for progress updates', () => {
      jest.spyOn(backendEvents, 'off')

      sendGameStatusUpdate({
        appName: 'Test',
        status: 'done'
      })

      expect(backendEvents.off).toBeCalledWith(
        'progressUpdate-Test',
        expect.any(Function)
      )
    })
  })
})
