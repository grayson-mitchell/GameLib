/**
 * `showAboutWindow` preload contract (quick `260905-d33`).
 *
 * This name is a SEAM, not an implementation detail, and it is load-bearing in a
 * way nothing else in `helpers.ts` is: the macOS tray's "About GameLib" item
 * reaches it from Rust by evaluating `window.api?.showAboutWindow?.()` in the
 * main window (`open_about_window_from_tray`, `src-tauri/src/main.rs`).
 *
 * That eval is OPTIONAL-CHAINED. If the export is renamed or removed, the tray
 * item silently does nothing -- no throw, no console output, nothing in the Rust
 * log either, because `window.eval` still succeeds. Converting About from an OS
 * window to an in-app modal broke it exactly that way once, mid-task, and no
 * suite noticed. These tests exist so the next edit cannot repeat it.
 */
const dispatched: Event[] = []

jest.mock('../ipc', () => ({
  frontendListenerSlot: jest.fn(),
  makeHandlerInvoker: () => jest.fn(),
  makeListenerCaller: () => jest.fn()
}))

jest.mock('../api/tauriChildWindows', () => ({
  tauriCreateNewWindow: jest.fn()
}))

// The preload jest project's testEnvironment is 'node' -- there is no `window`.
;(globalThis as unknown as { window: unknown }).window = {
  dispatchEvent: (event: Event) => {
    dispatched.push(event)
    return true
  }
}

import { showAboutWindow } from '../api/helpers'
import { SHOW_ABOUT_DIALOG_EVENT } from 'common/aboutDialogEvent'

describe('showAboutWindow (the tray + Settings seam)', () => {
  beforeEach(() => {
    dispatched.length = 0
  })

  it('is exported and callable -- the tray eval is optional-chained, so its ABSENCE is silent', () => {
    expect(typeof showAboutWindow).toBe('function')
  })

  it('dispatches SHOW_ABOUT_DIALOG_EVENT, which is what AboutDialogHost listens for', () => {
    showAboutWindow()

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].type).toBe(SHOW_ABOUT_DIALOG_EVENT)
  })

  it('constructs no WebviewWindow -- About stopped being an OS window', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const childWindows = jest.requireMock<{
      tauriCreateNewWindow: jest.Mock
    }>('../api/tauriChildWindows')

    showAboutWindow()

    expect(childWindows.tauriCreateNewWindow).not.toHaveBeenCalled()
  })

  it('raises one event per call, so a second click reopens rather than no-opping', () => {
    showAboutWindow()
    showAboutWindow()

    expect(dispatched).toHaveLength(2)
  })
})
