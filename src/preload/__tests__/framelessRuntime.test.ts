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
 * jest.config sets `resetMocks: true` -- every `jest.fn()` below loses its
 * implementation before each test, so every mock return value this file depends on is
 * (re)established in the top-level `beforeEach`, never assumed to survive from a
 * factory's own initializer.
 */

jest.mock('electron', () => ({
  ipcRenderer: {
    send: (...args: unknown[]) => electronIpcSendMock(...args)
  }
}))

const electronIpcSendMock = jest.fn()

const mockWindow = {
  setDecorations: jest.fn(),
  startDragging: jest.fn(),
  toggleMaximize: jest.fn()
}
const getCurrentWindow = jest.fn()

jest.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => getCurrentWindow()
}))

jest.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ setZoom: jest.fn().mockResolvedValue(undefined) })
}))

jest.mock('../tauriTransport', () => ({
  isTauri: jest.fn(() => true),
  snapshotGet: jest.fn(),
  send: jest.fn(),
  invoke: jest.fn(),
  listen: jest.fn()
}))

import {
  applyFramelessDecorations,
  installDragRegionHandlers
} from '../api/tauriWindowChrome'
import { isTauri, snapshotGet } from '../tauriTransport'
import { setSetting } from '../api/settings'

const mockedIsTauri = isTauri as jest.MockedFunction<typeof isTauri>
const mockedSnapshotGet = snapshotGet as jest.MockedFunction<typeof snapshotGet>

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
    let el: FakeElement | null = this
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
  getPropertyValue: (prop: string) =>
    prop === '-webkit-app-region' ? (el as FakeElement).appRegion : ''
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
  mockWindow.startDragging.mockResolvedValue(undefined)
  mockWindow.toggleMaximize.mockResolvedValue(undefined)
  mockedIsTauri.mockReturnValue(true)
  mockedSnapshotGet.mockReturnValue(undefined)
})

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
  })

  it('REQ-34.1-03: applyFramelessDecorations() with framelessWindow:false calls setDecorations(true)', () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: false })
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(true)
  })

  it('REQ-34.1-03: applyFramelessDecorations() with framelessWindow:true calls setDecorations(false)', () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: true })
    applyFramelessDecorations()
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(false)
  })

  it('REQ-34.1-03: applyFramelessDecorations(true) calls setDecorations(false) regardless of snapshot', () => {
    mockedSnapshotGet.mockReturnValue({ framelessWindow: false })
    applyFramelessDecorations(true)
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(false)
  })

  it('REQ-34.1-03: a setDecorations rejection is caught and warned, and does not reject out of the function', async () => {
    mockWindow.setDecorations.mockReturnValue(Promise.reject(new Error('denied')))
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => applyFramelessDecorations()).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
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
    mockedIsTauri.mockReturnValue(true)
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

describe('setSetting wrapper (REQ-34.1-03)', () => {
  it('REQ-34.1-03: calls applyFramelessDecorations when the written key is framelessWindow under Tauri', () => {
    mockedIsTauri.mockReturnValue(true)
    setSetting({ appName: 'default', key: 'framelessWindow', value: true })
    expect(mockWindow.setDecorations).toHaveBeenCalledWith(false)
  })

  it('REQ-34.1-03: does not call applyFramelessDecorations for a different key', () => {
    mockedIsTauri.mockReturnValue(true)
    setSetting({ appName: 'default', key: 'language', value: 'en' })
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: does not call applyFramelessDecorations for a game-scoped write, even with a matching key', () => {
    mockedIsTauri.mockReturnValue(true)
    setSetting({ appName: 'some-game', key: 'framelessWindow', value: true })
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03: never calls applyFramelessDecorations on the Electron path', () => {
    mockedIsTauri.mockReturnValue(false)
    setSetting({ appName: 'default', key: 'framelessWindow', value: true })
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
    expect(electronIpcSendMock).toHaveBeenCalledWith('setSetting', {
      appName: 'default',
      key: 'framelessWindow',
      value: true
    })
  })

  // WR-05 regression guard: `setSetting` was a pure, never-throwing passthrough before
  // this slice. It is reachable from untyped renderer code, so a malformed call must
  // still be forwarded harmlessly rather than throwing a TypeError back into the caller
  // AFTER the IPC send has already gone out. The unguarded `const [{ appName, key,
  // value }] = args` ran on BOTH paths and broke that.
  const malformed = [undefined, null] as unknown as [
    Parameters<typeof setSetting>[0]
  ]

  it('REQ-34.1-03/WR-05: a malformed argument does not throw on the ELECTRON path, and is still forwarded over IPC', () => {
    mockedIsTauri.mockReturnValue(false)
    for (const bad of malformed) {
      expect(() => setSetting(bad)).not.toThrow()
      expect(electronIpcSendMock).toHaveBeenCalledWith('setSetting', bad)
    }
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03/WR-05: a malformed argument does not throw on the TAURI path either', () => {
    mockedIsTauri.mockReturnValue(true)
    for (const bad of malformed) {
      expect(() => setSetting(bad)).not.toThrow()
    }
    expect(mockWindow.setDecorations).not.toHaveBeenCalled()
  })

  it('REQ-34.1-03/WR-05: a zero-argument call does not throw on either path', () => {
    const noArgs = setSetting as unknown as () => void
    mockedIsTauri.mockReturnValue(false)
    expect(() => noArgs()).not.toThrow()
    mockedIsTauri.mockReturnValue(true)
    expect(() => noArgs()).not.toThrow()
  })
})
