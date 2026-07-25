/**
 * Tauri child-window contract test (Phase 34.1 Plan 07, D-12, REQ-34.1-08).
 *
 * Covers `tauriChildWindows.ts`'s two exports directly (mocking
 * `@tauri-apps/api/webviewWindow`'s `WebviewWindow` class) AND `helpers.ts`'s
 * `isTauri()` routing decision for `showAboutWindow`/`createNewWindow` -- unlike
 * `gamepadActionRouting.test.ts`, this does NOT need a separate file for the routing
 * case because `electron` is mocked here as a working stub (not a throw), letting both
 * the Tauri path and the Electron IPC fallback run in the same suite.
 *
 * jest.config sets `resetMocks: true` -- every mock's implementation/return value is
 * (re)established in `beforeEach`.
 */

const mockedIsTauri = jest.fn()
jest.mock('../tauriTransport', () => ({
  isTauri: () => mockedIsTauri(),
  send: jest.fn(),
  invoke: jest.fn(),
  listen: jest.fn(),
  snapshotGet: jest.fn(),
  snapshotSet: jest.fn(),
  snapshotHas: jest.fn(),
  snapshotDelete: jest.fn(),
  registerStore: jest.fn()
}))

const mockIpcRendererSend = jest.fn()
jest.mock('electron', () => ({
  ipcRenderer: { send: (...args: unknown[]) => mockIpcRendererSend(...args) }
}))

const onceMock = jest.fn().mockResolvedValue(undefined)
const setFocusMock = jest.fn().mockResolvedValue(undefined)
const getByLabelMock = jest.fn()
const webviewWindowCtor = jest.fn()

function MockWebviewWindow(label: string, options: unknown) {
  webviewWindowCtor(label, options)
  return { label, options, once: onceMock, setFocus: setFocusMock }
}
MockWebviewWindow.getByLabel = (...args: unknown[]) => getByLabelMock(...args)

jest.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: MockWebviewWindow
}))

import { tauriCreateNewWindow, tauriShowAboutWindow } from '../api/tauriChildWindows'
import { showAboutWindow, createNewWindow } from '../api/helpers'

const mockedGetHeroicVersion = jest.fn()

// The preload jest project's testEnvironment is 'node' (see windowChrome.test.ts's own
// documented constraint). tauriChildWindows.ts reads `window.api.getHeroicVersion` only
// inside a function body (never at import time), so a minimal manual stub suffices.
;(
  globalThis as unknown as { window: { api: { getHeroicVersion: () => Promise<string> } } }
).window = { api: { getHeroicVersion: () => mockedGetHeroicVersion() } }

// Flush the microtask queue so tauriShowAboutWindow's floated internal promise settles
// before assertions run (it is intentionally fire-and-forget from the caller's side).
const flush = () => new Promise((resolve) => setImmediate(resolve))

describe('tauriChildWindows (REQ-34.1-08)', () => {
  beforeEach(() => {
    mockedIsTauri.mockReturnValue(true)
    getByLabelMock.mockResolvedValue(null)
    mockedGetHeroicVersion.mockResolvedValue('1.2.3')
  })

  it('REQ-34.1-08: tauriCreateNewWindow constructs a WebviewWindow with width 1200, height 700, and the passed url', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')

    expect(webviewWindowCtor).toHaveBeenCalledTimes(1)
    const [, options] = webviewWindowCtor.mock.calls[0]
    expect(options).toMatchObject({
      url: 'https://www.protondb.com/app/1',
      width: 1200,
      height: 700
    })
  })

  it('REQ-34.1-08: two successive tauriCreateNewWindow calls use two different labels, neither "main" nor "about"', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    tauriCreateNewWindow('https://www.protondb.com/app/2')

    const [label1] = webviewWindowCtor.mock.calls[0]
    const [label2] = webviewWindowCtor.mock.calls[1]
    expect(label1).not.toBe(label2)
    expect(label1).not.toBe('main')
    expect(label1).not.toBe('about')
    expect(label2).not.toBe('main')
    expect(label2).not.toBe('about')
  })

  it('REQ-34.1-08: the label is not derived from the url -- calling twice with the SAME url still yields two different labels', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    tauriCreateNewWindow('https://www.protondb.com/app/1')

    const [label1] = webviewWindowCtor.mock.calls[0]
    const [label2] = webviewWindowCtor.mock.calls[1]
    expect(label1).not.toBe(label2)
  })

  it('REQ-34.1-08: tauriShowAboutWindow with no existing about window constructs one labelled "about" whose url starts with "about.html?v="', async () => {
    tauriShowAboutWindow()
    await flush()

    expect(getByLabelMock).toHaveBeenCalledWith('about')
    expect(webviewWindowCtor).toHaveBeenCalledTimes(1)
    const [label, options] = webviewWindowCtor.mock.calls[0]
    expect(label).toBe('about')
    expect((options as { url: string }).url).toMatch(/^about\.html\?v=/)
  })

  it('REQ-34.1-08: tauriShowAboutWindow when getByLabel("about") resolves an existing window calls setFocus() and does NOT construct a second window', async () => {
    getByLabelMock.mockResolvedValue({ setFocus: setFocusMock })

    tauriShowAboutWindow()
    await flush()

    expect(setFocusMock).toHaveBeenCalledTimes(1)
    expect(webviewWindowCtor).not.toHaveBeenCalled()
  })

  it('REQ-34.1-08: a getHeroicVersion() rejection still results in a window being constructed, with v=unknown', async () => {
    mockedGetHeroicVersion.mockRejectedValue(new Error('sidecar unreachable'))

    tauriShowAboutWindow()
    await flush()

    expect(webviewWindowCtor).toHaveBeenCalledTimes(1)
    const [, options] = webviewWindowCtor.mock.calls[0]
    expect((options as { url: string }).url).toBe('about.html?v=unknown')
  })

  it('REQ-34.1-08: a constructor throw is caught and warned, and the function does not throw', () => {
    webviewWindowCtor.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    expect(() => tauriCreateNewWindow('https://www.protondb.com/app/1')).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('REQ-34.1-08: with isTauri() false, helpers.ts exports call the IPC path and never touch WebviewWindow', () => {
    mockedIsTauri.mockReturnValue(false)

    showAboutWindow()
    createNewWindow('https://www.protondb.com/app/1')

    expect(mockIpcRendererSend).toHaveBeenCalledWith('showAboutWindow')
    expect(mockIpcRendererSend).toHaveBeenCalledWith(
      'createNewWindow',
      'https://www.protondb.com/app/1'
    )
    expect(webviewWindowCtor).not.toHaveBeenCalled()
    expect(getByLabelMock).not.toHaveBeenCalled()
  })
})
