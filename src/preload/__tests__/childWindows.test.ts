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
;(globalThis as unknown as { window: { api: { getHeroicVersion: () => Promise<string> } } }).window = {
  api: { getHeroicVersion: () => mockedGetHeroicVersion() }
}

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

  // ── WR-04 (Phase 34.1 code review): labels must survive a renderer reload ──

  it('REQ-34.1-08/WR-04: external labels keep the "external-" prefix and are never "main"/"about"', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    const [label] = webviewWindowCtor.mock.calls[0] as [string, unknown]

    expect(label.startsWith('external-')).toBe(true)
    expect(label).not.toBe('main')
    expect(label).not.toBe('about')
    // The url must not leak into the label (T-34.1-27).
    expect(label).not.toContain('protondb')
  })

  it('REQ-34.1-08/WR-04: labels are NOT a bare reset-on-reload counter -- a fresh module registry (simulating F5) does not re-issue "external-1"', () => {
    tauriCreateNewWindow('https://www.protondb.com/app/1')
    const [labelBefore] = webviewWindowCtor.mock.calls[0] as [string, unknown]

    // Re-importing the module in a fresh registry is exactly what a renderer reload
    // does to `externalWindowCounter` -- while the child OS windows created before the
    // reload are still alive and still own their labels. A bare counter therefore
    // re-requested `external-1`, Tauri rejected the duplicate, and the click silently
    // did nothing.
    jest.resetModules()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reloaded = require('../api/tauriChildWindows')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    reloaded.tauriCreateNewWindow('https://www.protondb.com/app/2')
    const [labelAfter] = webviewWindowCtor.mock.calls[1] as [string, unknown]

    expect(labelAfter).not.toBe(labelBefore)
    expect(labelBefore).not.toBe('external-1')
    expect(labelAfter).not.toBe('external-1')
  })

  // ── WR-07: no first-party title on renderer-supplied REMOTE content ──

  it('REQ-34.1-08/WR-07: a createNewWindow child carries NO hard-coded title, so the remote page titles itself (Electron parity)', () => {
    tauriCreateNewWindow('https://evil.example/looks-official')
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]

    expect(options.title).toBeUndefined()
  })

  it('REQ-34.1-08/WR-07: the About window DOES keep its title -- it loads first-party static about.html, not remote content', async () => {
    tauriShowAboutWindow()
    await flush()

    const [, options] = webviewWindowCtor.mock.calls[0] as [string, Record<string, unknown>]
    expect(options.title).toBe('About GameLib')
  })

  // ── WR-06: the About window must not block on a wedged sidecar ──

  it('REQ-34.1-08/WR-06: a getHeroicVersion() that never settles still opens the About window, with v=unknown', async () => {
    // `advanceTimersByTimeAsync` (not the sync variant) is required: it yields to the
    // microtask queue between timer runs, which is what lets the `getByLabel('about')`
    // await and the `Promise.race` continuation settle inside the fake-timer clock.
    jest.useFakeTimers()
    // A wedged sidecar: the invoke hangs until the Rust shell's own 60s INVOKE_TIMEOUT.
    mockedGetHeroicVersion.mockReturnValue(new Promise(() => {}))

    tauriShowAboutWindow()
    await jest.advanceTimersByTimeAsync(1000)

    expect(webviewWindowCtor).toHaveBeenCalledTimes(1)
    const [, options] = webviewWindowCtor.mock.calls[0] as [string, { url: string }]
    expect(options.url).toBe('about.html?v=unknown')

    jest.useRealTimers()
  })

  // ── Phase 34.4.1 Plan 06 (T-34.1-27): extended label-discipline coverage ──
  //
  // The rule this whole block enforces -- generated window labels are never
  // reserved names and never derived from the caller-supplied url -- is
  // proven TWICE in this codebase, once per language: here, for the
  // renderer-side `external-<n>`/`about` labels `nextExternalWindowLabel()`
  // generates (tauriChildWindows.ts); and on the Rust side, for the
  // sidecar-owned `loginwin-<n>` labels `next_login_window_label()`
  // generates (src-tauri/src/main.rs's `#[cfg(test)] mod tests`, see
  // `humble_login_window_label_is_never_reserved`,
  // `humble_login_window_labels_differ_across_calls`, and
  // `humble_login_window_label_is_never_derived_from_url`). Both halves
  // implement the SAME rule independently (there is no shared code between a
  // renderer TS module and a Rust sidecar binary) -- this comment exists so
  // either side is discoverable from the other.

  it('REQ-34.1-08/T-34.1-27: labels across FIVE successive generations are pairwise unique, not merely adjacent-distinct', () => {
    for (let i = 0; i < 5; i += 1) {
      tauriCreateNewWindow(`https://www.protondb.com/app/${i}`)
    }

    const labels = webviewWindowCtor.mock.calls.map(([label]) => label as string)
    expect(labels).toHaveLength(5)
    expect(new Set(labels).size).toBe(5)
  })

  it('REQ-34.1-08/T-34.1-27: the SAME url called five times in a row never repeats a label', () => {
    for (let i = 0; i < 5; i += 1) {
      tauriCreateNewWindow('https://www.protondb.com/app/1')
    }

    const labels = webviewWindowCtor.mock.calls.map(([label]) => label as string)
    expect(new Set(labels).size).toBe(5)
  })

  it('REQ-34.1-08/T-34.1-27: no label from a batch of varied-url calls ever equals "main" or "about"', () => {
    const urls = [
      'https://www.protondb.com/app/1',
      'https://areweanticheatyet.com/game/2',
      'https://www.humblebundle.com/store/some-game',
      'https://appledb.dev/app/3'
    ]
    for (const url of urls) {
      tauriCreateNewWindow(url)
    }

    const labels = webviewWindowCtor.mock.calls.map(([label]) => label as string)
    for (const label of labels) {
      expect(label).not.toBe('main')
      expect(label).not.toBe('about')
    }
  })

  it("REQ-34.1-08/T-34.1-27: no generated label contains any substring of the url's host, including a humblebundle.com url", () => {
    tauriCreateNewWindow('https://www.humblebundle.com/store/some-game')
    const [label] = webviewWindowCtor.mock.calls[0] as [string, unknown]

    expect(label).not.toContain('humblebundle')
    expect(label).not.toContain('www')
    expect(label).not.toContain('store')
  })

  it('REQ-34.1-08: with isTauri() false, helpers.ts exports call the IPC path and never touch WebviewWindow', () => {
    mockedIsTauri.mockReturnValue(false)

    showAboutWindow()
    createNewWindow('https://www.protondb.com/app/1')

    expect(mockIpcRendererSend).toHaveBeenCalledWith('showAboutWindow')
    expect(mockIpcRendererSend).toHaveBeenCalledWith('createNewWindow', 'https://www.protondb.com/app/1')
    expect(webviewWindowCtor).not.toHaveBeenCalled()
    expect(getByLabelMock).not.toHaveBeenCalled()
  })
})
