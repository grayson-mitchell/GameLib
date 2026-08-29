import { BrowserWindow } from 'backend/platform'
import { backendEvents } from '../backend_events'
import { sendGameStatusUpdate, sendProgressUpdate } from '../utils'
import '../progress_bar'

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
    BrowserWindow['setAllWindows']([window])
  })

  // cleanup stubs
  afterAll(() => {
    BrowserWindow['setAllWindows']([])
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
