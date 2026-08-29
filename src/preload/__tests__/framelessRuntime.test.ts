/**
 * Frameless runtime test (Phase 34.1 Plan 03, REQ-34.1-03): D-05/D-06's
 * `applyFramelessDecorations`/`installDragRegionHandlers`, plus the `setSetting`
 * on-toggle re-apply (`src/preload/api/settings.ts`).
 *
 * The preload jest project's `testEnvironment` is `'node'` (jest-environment-jsdom is
 * not installed -- see `src/frontend/jest.config.js`'s own documented constraint), so
 * this file cannot use a real DOM. It builds minimal manual `document`/`Element`-shaped
 * stubs, mirroring `tauriAttach.test.ts`'s own `installWindowStub()` pattern -- plain
 * objects duck-typed to the exact surface `tauriWindowChrome.ts`'s drag-region code
 * reads (`parentElement`, `closest()`, and a `getComputedStyle` global returning
 * `-webkit-app-region`).
 *
 * `setSetting`'s own transport send (`../ipc.ts`'s `makeListenerCaller('setSetting')`)
 * used to branch on a Tauri-context check inside `../ipc.ts` itself; Phase 35 plan 16
 * collapsed that branch, so the send reaches the Tauri transport unconditionally.
 * `settings.ts`'s own Tauri-context guard around `applyFramelessDecorations` (the one
 * this file was still exercising) is now collapsed too, by this same plan (35-17) --
 * `setSetting` always applies frameless decorations for a matching key, there is no
 * longer a second branch to prove takes the transport-only path. The electron mock
 * below is now a THROW, not a working stub, matching `gamepadActionRouting.test.ts`'s
 * treatment of the same collapse.
 *
 * jest.config sets `resetMocks: true` -- every `jest.fn()` below loses its
 * implementation before each test, so every mock return value this file depends on is
 * (re)established in the top-level `beforeEach`, never assumed to survive from a
 * factory's own initializer.
 */

// Phase 35 Plan 18 (T-27-07): this suite used to guard against 'electron' being resolved on
// the Tauri preload path via a throw-on-require jest.mock('electron', ...) factory. Plan 18
// retired the 'electron' devDependency outright, so the guard is now structural: 'electron'
// cannot resolve on ANY path, in ANY suite, because it no longer exists in node_modules at
// all. A jest.mock('electron', ...) call here would itself throw "Cannot find module
// 'electron'" at REGISTRATION time (before this factory could ever run), which is a strictly
// stronger guarantee than the runtime throw it replaces. See meta/__tests__/electronAbsence.test.ts
// for the project-wide mechanized version of this same guarantee.

const mockWindow = {
  setDecorations: jest.fn(),
  setTitleBarStyle: jest.fn(),
  startDragging: jest.fn(),
  toggleMaximize: jest.fn()
}
const getCurrentWindow = jest.fn()

// Phase 34.1 gap cycle 1 (plan 34.1-10, G4): sets the webview's reported platform
// EXPLICITLY for a test. Stubs the INPUT `isMacWebview()` reads (via Node's built-in
// `navigator.platform`), rather than mocking `platformDetect` itself -- per this
// project's standing rule "a test must exercise the PRODUCTION call shape, not a
// hand-built ideal one". `Object.defineProperty` is required (not a plain assignment)
// because this Jest environment's Node runtime exposes `navigator.platform` as an
// accessor property inherited from `Navigator.prototype`, not an own writable field.
type WebviewPlatform = 'MacIntel' | 'Win32' | 'Linux x86_64'

function setWebviewPlatform(platform: WebviewPlatform): void {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    configurable: true
  })
}

jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => getCurrentWindow()
}))

jest.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ setZoom: jest.fn().mockResolvedValue(undefined) })
}))

jest.mock('../tauriTransport', () => ({
  snapshotGet: jest.fn(),
  send: jest.fn(),
  invoke: jest.fn(),
  listen: jest.fn()
}))

import { applyFramelessDecorations, installDragRegionHandlers } from '../api/tauriWindowChrome'
import { snapshotGet, send } from '../tauriTransport'
import { setSetting } from '../api/settings'

const mockedSnapshotGet = snapshotGet as jest.MockedFunction<typeof snapshotGet>
const mockedTauriSend = send as jest.MockedFunction<typeof send>

// ---- Minimal manual DOM stand-in (no jest-environment-jsdom -- see header comment) ----

interface FakeElementOptions {
  className?: string
  appRegion?: string
}

class FakeElement {
  parentElement: FakeElement | null = null
  readonly appRegion: string
  private readonly tag: string
  private readonly classes: string[]

  constructor(tag: string, opts: FakeElementOptions = {}) {
    this.tag = tag
    this.appRegion = opts.appRegion ?? ''
    this.classes = (opts.className ?? '').split(' ').filter(Boolean)
  }

  matches(selector: string): boolean {
    return selector.split(',').some((raw) => {
      const part = raw.trim()
      if (part.startsWith('.')) return this.classes.includes(part.slice(1))
      if (part.startsWith('[')) return false
      return this.tag.toLowerCase() === part.toLowerCase()
    })
  }

  closest(selector: string): FakeElement | null {
    if (this.matches(selector)) return this
    let el: FakeElement | null = this.parentElement
    while (el) {
      if (el.matches(selector)) return el
      el = el.parentElement
    }
    return null
  }
}

function chain(...elements: FakeElement[]): FakeElement {
  for (let i = 1; i < elements.length; i++) {
    elements[i].parentElement = elements[i - 1]
  }
  return elements[elements.length - 1]
}

;(
  globalThis as unknown as {
    getComputedStyle: (el: unknown) => { getPropertyValue: (prop: string) => string }
  }
).getComputedStyle = (el: unknown) => ({
  getPropertyValue: (prop: string) => (prop === '-webkit-app-region' ? (el as FakeElement).appRegion : '')
})

const addEventListenerMock = jest.fn()
;(
  globalThis as unknown as {
    document: { addEventListener: typeof addEventListenerMock }
  }
).document = { addEventListener: addEventListenerMock }

beforeEach(() => {
  getCurrentWindow.mockReturnValue(mockWindow)
  mockWindow.setDecorations.mockResolvedValue(undefined)
  mockWindow.setTitleBarStyle.mockResolvedValue(undefined)
  mockWindow.startDragging.mockResolvedValue(undefined)
  mockWindow.toggleMaximize.mockResolvedValue(undefined)
  mockedSnapshotGet.mockReturnValue(undefined)
  // Phase 34.1 gap cycle 1 (plan 34.1-10, G4): default every test to a NON-macOS
  // platform so no test inherits macOS by accident -- this Jest environment's Node
  // runtime exposes a REAL `navigator.platform` reflecting the host OS (observed
  // "MacIntel" on a macOS dev machine), which is exactly the unstated-dependency
  // hazard this reset closes. Tests that need the macOS branch call
  // setWebviewPlatform('MacIntel') explicitly.
  setWebviewPlatform('Win32')
})

// Phase 34.1 gap cycle 1 (plan 34.1-10, G4): these ten assertions (this describe block's
// six, plus the setSetting wrapper describe block's four) now pin the WINDOWS/LINUX
// branch SPECIFICALLY -- they rely on the `beforeEach` default of a non-macOS platform,
// which is now an explicit, asserted precondition rather than an accident of whatever
// `navigator.platform` happens to report in the host Jest environment. Each case below
// also asserts `setTitleBarStyle` was NOT called: without that assertion, a bug that
// fired BOTH mechanisms on Windows/Linux would still pass every pre-existing assertion
// here, because none of them ever inspected `setTitleBarStyle` at all.
describe('applyFramelessDecorations (REQ-34.1-03)', () => {
  // CLARIFIED TEST CONTRACT (CR-02, Phase 34.1 code review). This assertion is correct
  // about the FUNCTION in isolation -- with no data, the default is DECORATED, matching
  // Electron's shipped default -- but on its own it read as if the empty-snapshot case
  // were the steady state. It is not: it is only ever the PRE-HYDRATION paint that
  // `preload/tauriAttach`'s module body performs before `hydrateStoreSnapshot()` has
  // run. The correcting second pass is pinned by the sequence test below; without that
  // one, this test alone leaves the shipped `framelessWindow: true` bug green.
  it('REQ-34.1-03: applyFramelessDecorations() with no settings snapshot yet (the pre-hydration paint) calls setDecorations(true)', () => {
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(true)
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  // CR-02 regression guard: reproduces `src/frontend/index.tsx`'s real two-phase startup
  // sequence -- tauriAttach's pre-paint call against an EMPTY snapshot, then the
  // post-`hydrateStoreSnapshot()` re-apply against the real settings. A build that drops
  // the second call (the shipped bug) leaves a `framelessWindow: true` user with the
  // native titlebar restored AND GameLib's own overlay controls drawn on top of it.
  it('REQ-34.1-03/CR-02: a frameless user gets setDecorations(false) once the snapshot hydrates, not the pre-hydration default', () => {
    // Phase 1 -- tauriAttach module body, snapshot still empty.
    mockedSnapshotGet.mockReturnValue(undefined)
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenNthCalledWith(1, true)

    // Phase 2 -- index.tsx, immediately after `await hydrateStoreSnapshot()`.
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenNthCalledWith(2, false)
    expect(mockWindow.setDecorations).toHaveBeenLastCalledWith(false)
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: applyFramelessDecorations() with framelessWindow:false calls setDecorations(true)', () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: false })
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(true)
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: applyFramelessDecorations() with framelessWindow:true calls setDecorations(false)', () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(false)
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: applyFramelessDecorations(true) calls setDecorations(false) regardless of snapshot', () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: false })
    applyFramelessDecorations(true)
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(false)
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: a setDecorations rejection is caught and warned, and does not reject out of the function', async () => {
    mockWindow.setDecorations.mockReturnValue(Promise.reject(new Error('denied')))
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => applyFramelessDecorations()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(warnSpy).toHaveBeenCalled()
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

// Phase 34.1 gap cycle 1 (plan 34.1-10, G4): the macOS branch of `applyFramelessDecorations`
// -- `framelessWindow` ON -> `setTitleBarStyle('overlay')`, OFF -> `setTitleBarStyle('visible')`,
// `setDecorations` UNREACHABLE. Every case here calls `setWebviewPlatform('MacIntel')`
// explicitly; nothing here relies on the `beforeEach` default.
describe('applyFramelessDecorations (macOS branch, REQ-34.1-03/REQ-34.1-09, gap cycle 1 G4)', () => {
  it('REQ-34.1-09: framelessWindow:true on macOS calls setTitleBarStyle("overlay") exactly once, and setDecorations ZERO times -- setDecorations(false) strips the native traffic lights (gap G4 / UAT test 9)', () => {
    setWebviewPlatform('MacIntel')
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations()
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledTimes(1)
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledWith('overlay')
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-09: framelessWindow:false on macOS calls setTitleBarStyle("visible") exactly once, and setDecorations ZERO times -- proves the setting is decoration-EFFECTING on macOS, not inert (REQ-34.1-03)', () => {
    setWebviewPlatform('MacIntel')
    mockedSnapshotGet.mockReturnValue({ framelessWindow: false })
    applyFramelessDecorations()
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledTimes(1)
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledWith('visible')
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-09: the explicit-argument form (the on-toggle path) maps true -> "overlay" on macOS with setDecorations untouched', () => {
    setWebviewPlatform('MacIntel')
    mockedSnapshotGet.mockReturnValue({ framelessWindow: false })
    applyFramelessDecorations(true)
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledWith('overlay')
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-09: the explicit-argument form maps false -> "visible" on macOS with setDecorations untouched', () => {
    setWebviewPlatform('MacIntel')
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations(false)
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledWith('visible')
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-09: the setTitleBarStyle argument is the exact lowercase literal, never the capitalised config-file spelling -- the JS API does not accept "Overlay"/"Visible"', () => {
    setWebviewPlatform('MacIntel')
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations()
    const [[calledWith]] = mockWindow.setTitleBarStyle.mock.calls
    expect(calledWith).toBe('overlay')
    expect(calledWith).not.toBe('Overlay')
  })

  it('REQ-34.1-09/CR-02: the pre-paint call then the post-hydration call both issue, in order, on macOS -- the second call is not suppressed by any memoisation', () => {
    setWebviewPlatform('MacIntel')
    // Phase 1 -- tauriAttach module body, empty snapshot -> resolves to false -> 'visible'.
    mockedSnapshotGet.mockReturnValue(undefined)
    applyFramelessDecorations()
    expect(mockWindow.setTitleBarStyle).toHaveBeenNthCalledWith(1, 'visible')

    // Phase 2 -- index.tsx, immediately after `await hydrateStoreSnapshot()`.
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations()
    expect(mockWindow.setTitleBarStyle).toHaveBeenNthCalledWith(2, 'overlay')
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledTimes(2)
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-09: a setTitleBarStyle rejection on macOS is caught and warned, and does not reject out of the function (SEAM Invariant A holds on the new async failure site)', async () => {
    setWebviewPlatform('MacIntel')
    mockWindow.setTitleBarStyle.mockReturnValue(Promise.reject(new Error('denied')))
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => applyFramelessDecorations()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
    expect(warnSpy).toHaveBeenCalled()
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it("REQ-34.1-09: on macOS, readFramelessSetting's backing store THROWING still returns normally (SEAM Invariant A)", () => {
    setWebviewPlatform('MacIntel')
    mockedSnapshotGet.mockImplementation(() => {
      throw new Error('store unavailable')
    })
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => applyFramelessDecorations()).not.toThrow()
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})

describe('installDragRegionHandlers (REQ-34.1-03)', () => {
  let mousedownHandler: ((event: { button: number; target: unknown }) => void) | undefined
  let dblclickHandler: ((event: { target: unknown }) => void) | undefined
  let mousedownRegistrations = 0
  let dblclickRegistrations = 0

  beforeAll(() => {
    installDragRegionHandlers()
    installDragRegionHandlers() // second call must be a no-op

    const calls = addEventListenerMock.mock.calls
    mousedownRegistrations = calls.filter((call) => call[0] === 'mousedown').length
    dblclickRegistrations = calls.filter((call) => call[0] === 'dblclick').length
    mousedownHandler = calls.find((call) => call[0] === 'mousedown')?.[1]
    dblclickHandler = calls.find((call) => call[0] === 'dblclick')?.[1]
  })

  it('REQ-34.1-03: installs listeners only once across two calls', () => {
    expect(mousedownRegistrations).toBe(1)
    expect(dblclickRegistrations).toBe(1)
    expect(mousedownHandler).toBeDefined()
    expect(dblclickHandler).toBeDefined()
  })

  it('REQ-34.1-03: a mousedown on an element whose computed -webkit-app-region is drag calls startDragging', () => {
    const el = new FakeElement('div', { appRegion: 'drag' })
    mousedownHandler?.({ button: 0, target: el })
    expect(mockWindow.startDragging).toHaveBeenCalledTimes(1)
  })

  it('REQ-34.1-03: a mousedown on an element whose computed -webkit-app-region is no-drag does not call startDragging', () => {
    const el = new FakeElement('div', { appRegion: 'no-drag' })
    mousedownHandler?.({ button: 0, target: el })
    expect(mockWindow.startDragging).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: a right-button mousedown never calls startDragging, even in a drag region', () => {
    const el = new FakeElement('div', { appRegion: 'drag' })
    mousedownHandler?.({ button: 2, target: el })
    expect(mockWindow.startDragging).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: with the property unsupported, a mousedown inside a .NavShell__navbar element calls startDragging', () => {
    const navbar = new FakeElement('div', { className: 'NavShell__navbar' })
    const child = new FakeElement('span')
    chain(navbar, child)
    mousedownHandler?.({ button: 0, target: child })
    expect(mockWindow.startDragging).toHaveBeenCalledTimes(1)
  })

  it('REQ-34.1-03: with the property unsupported, a mousedown on a button inside .NavShell__navbar does not call startDragging', () => {
    const navbar = new FakeElement('div', { className: 'NavShell__navbar' })
    const button = new FakeElement('button')
    chain(navbar, button)
    mousedownHandler?.({ button: 0, target: button })
    expect(mockWindow.startDragging).not.toHaveBeenCalled()
  })

  // WR-01 regression guard. The class name here is copied from the REAL render --
  // `WindowControls/index.tsx` renders `<div className="windowControls">` and
  // `WindowControls/index.scss` styles `.windowControls`. The exclusion selector
  // previously read `.WindowControls` (capital W), which is case-sensitively different
  // and matched nothing, so this test would have failed against the shipped code.
  it('REQ-34.1-03/WR-01: with the property unsupported, a mousedown inside the REAL .windowControls container does not call startDragging', () => {
    const navbar = new FakeElement('div', { className: 'NavShell__navbar' })
    const controls = new FakeElement('div', { className: 'windowControls' })
    const gap = new FakeElement('span')
    chain(navbar, controls, gap)
    mousedownHandler?.({ button: 0, target: gap })
    expect(mockWindow.startDragging).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: a dblclick in a drag region calls toggleMaximize', () => {
    const el = new FakeElement('div', { appRegion: 'drag' })
    dblclickHandler?.({ target: el })
    expect(mockWindow.toggleMaximize).toHaveBeenCalledTimes(1)
  })

  it('REQ-34.1-03: a dblclick outside a drag region does not call toggleMaximize', () => {
    const el = new FakeElement('div', { appRegion: 'no-drag' })
    dblclickHandler?.({ target: el })
    expect(mockWindow.toggleMaximize).not.toHaveBeenCalled()
  })
})

// Phase 34.1 gap cycle 1 (plan 34.1-10, G4): the four assertions below now pin the
// WINDOWS/LINUX branch specifically, relying on the `beforeEach` default of a non-macOS
// platform -- see the comment above the `applyFramelessDecorations` describe block for
// why that default exists. The macOS case is covered by its own new test at the end of
// this describe block.
describe('setSetting wrapper (REQ-34.1-03)', () => {
  it('REQ-34.1-03: calls applyFramelessDecorations when the written key is framelessWindow', () => {
    setSetting({ appName: 'default', key: 'framelessWindow', value: true })
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(false)
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: does not call applyFramelessDecorations for a different key', () => {
    setSetting({ appName: 'default', key: 'language', value: 'en' })
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: does not call applyFramelessDecorations for a game-scoped write, even with a matching key', () => {
    setSetting({ appName: 'some-game', key: 'framelessWindow', value: true })
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
    expect(mockWindow.setTitleBarStyle).not.toHaveBeenCalled()
  })

  // Phase 35 plan 17: `settings.ts`'s Tauri-context early return around this call is
  // gone -- `setSetting` always sends over the transport AND (for a matching key)
  // always applies frameless decorations now, so the prior "guard is false" test that
  // asserted the opposite is gone with it. This assertion covers the send side.
  it('REQ-34.1-03: a matching-key write is also forwarded over the transport', () => {
    setSetting({ appName: 'default', key: 'framelessWindow', value: true })
    expect(mockedTauriSend).toHaveBeenCalledWith('setSetting', [
      { appName: 'default', key: 'framelessWindow', value: true }
    ])
  })

  // Phase 34.1 gap cycle 1 (plan 34.1-10, G4): the setSetting wrapper is NOT
  // platform-branched -- it always routes through applyFramelessDecorations, which is
  // where the platform branch lives. This proves that routing holds on macOS too: a
  // write to framelessWindow results in setTitleBarStyle with the value matching what
  // was written, and setDecorations is never touched.
  it('REQ-34.1-09: on macOS, writing framelessWindow still routes through applyFramelessDecorations and results in setTitleBarStyle, never setDecorations', () => {
    setWebviewPlatform('MacIntel')
    setSetting({ appName: 'default', key: 'framelessWindow', value: true })
    expect(mockWindow.setTitleBarStyle).toHaveBeenCalledWith('overlay')
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  // WR-05 regression guard: `setSetting` was a pure, never-throwing passthrough before
  // this slice. It is reachable from untyped renderer code, so a malformed call must
  // still be forwarded harmlessly rather than throwing a TypeError back into the caller
  // AFTER the IPC send has already gone out. The unguarded `const [{ appName, key,
  // value }] = args` ran on BOTH paths and broke that. Phase 35 plan 17 collapsed the
  // two paths this used to cover (guard true/false) into one -- there is only one now.
  const malformed = [undefined, null] as unknown as [Parameters<typeof setSetting>[0]]

  it('REQ-34.1-03/WR-05: a malformed argument does not throw, and is still forwarded over the transport', () => {
    for (const bad of malformed) {
      expect(() => setSetting(bad)).not.toThrow()
      expect(mockedTauriSend).toHaveBeenCalledWith('setSetting', [bad])
    }
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03/WR-05: a zero-argument call does not throw', () => {
    const noArgs = setSetting as unknown as () => void
    expect(() => noArgs()).not.toThrow()
  })
})
