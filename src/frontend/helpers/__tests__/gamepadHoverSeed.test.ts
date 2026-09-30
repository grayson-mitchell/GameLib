/**
 * Behavioural proof for the mouse-to-controller handoff focus seed (quick
 * 260930-iws), closing
 * `2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`. Node-env, no
 * DOM (see `src/frontend/jest.config.js` header) -- `window`/`document`/
 * `navigator`/`requestAnimationFrame` are stubbed directly on `globalThis`,
 * following `gamepadRepeatTiming.test.ts`'s harness conventions
 * (`jest.resetModules()` + `require('../gamepad')` per test, one priming
 * frame before any press, `resetMocks: true` so every `jest.fn` is built
 * fresh here rather than at module scope).
 *
 * Two families of cases live in this file:
 *
 * - `resolveHoveredCard`/`isDirectionalAction` UNIT cases (R-prefixed):
 *   exercise `gamepadHoverSeed.ts` directly, against a minimal
 *   `{ querySelectorAll }` document double -- no gamepad, no window.
 * - `initGamepad()` INTEGRATION cases (I-prefixed): drive the real rAF loop
 *   through the same `checkStandard` dispatch path every other gamepad
 *   suite in this directory uses, so a case here proves the seed is REACHED
 *   from a real controller press, not merely that the resolver works in
 *   isolation.
 */
jest.mock('../virtualKeyboard', () => ({
  VirtualKeyboardController: {
    isButtonFocused: () => false,
    isActive: () => mockVkActive,
    initOrFocus: () => undefined,
    destroy: () => undefined,
    space: () => undefined,
    backspace: () => undefined,
    typeCharacter: () => undefined
  }
}))

// Referenced (not declared) inside the hoisted factory above --
// babel-plugin-jest-hoist allow-lists identifiers starting with `mock`, so
// this is safe despite `jest.mock` calls being hoisted above this file's own
// statement order. Reset in `beforeEach` below.
let mockVkActive = false

// button indices on the standard layout (gamepad_layouts/standard.ts).
const MAIN_ACTION = 0
const ALT_ACTION = 3
const PAD_DOWN = 13
const PAD_LEFT = 14

interface FakeElement {
  tagName: string
  type?: string
  classList: { contains: (cls: string) => boolean }
  parentElement: FakeElement | null
  children: FakeElement[]
  closest: (selector: string) => FakeElement | null
  contains: (other: FakeElement) => boolean
  appendChild: (child: FakeElement) => void
  focus: jest.Mock
  click: jest.Mock
  getBoundingClientRect: () => {
    x: number
    y: number
    width: number
    height: number
    top: number
    left: number
    right: number
    bottom: number
  }
}

/**
 * Shared fake-element factory for both the unit (R-) and integration (I-)
 * cases below. `closest` only understands class selectors (comma-separated,
 * walking self then parents) and `contains` only walks `parentElement`
 * chains -- both are all `gamepadHoverSeed.ts`/`gamepad.ts` ever ask of a
 * real `Element` on this path.
 */
function makeElement(
  tagName: string,
  classes: string[] = [],
  opts: { type?: string; onFocus?: (el: FakeElement) => void } = {}
): FakeElement {
  const el: FakeElement = {
    tagName,
    type: opts.type,
    classList: { contains: (cls: string) => classes.includes(cls) },
    parentElement: null,
    children: [],
    closest(selector: string) {
      const wanted = selector.split(',').map((s) => s.trim().replace(/^\./, ''))
      let node: FakeElement | null = el
      while (node) {
        if (wanted.some((cls) => node!.classList.contains(cls))) return node
        node = node.parentElement
      }
      return null
    },
    contains(other: FakeElement) {
      let node: FakeElement | null = other
      while (node) {
        if (node === el) return true
        node = node.parentElement
      }
      return false
    },
    appendChild(child: FakeElement) {
      child.parentElement = el
      el.children.push(child)
    },
    focus: jest.fn(() => opts.onFocus?.(el)),
    click: jest.fn(),
    getBoundingClientRect: () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0
    })
  }
  return el
}

/** Mirrors GameCard/index.tsx:535-559: a status SPAN then a direct-child A. */
function buildCard(
  opts: {
    list?: boolean
    withLink?: boolean
    onFocus?: (el: FakeElement) => void
  } = {}
) {
  const card = makeElement('DIV', [opts.list ? 'gameListItem' : 'gameCard'])
  const status = makeElement('SPAN', ['gameCardStatus'])
  card.appendChild(status)
  let link: FakeElement | undefined
  if (opts.withLink !== false) {
    link = makeElement('A', [], { onFocus: opts.onFocus })
    card.appendChild(link)
  }
  return { card, link }
}

function fakeDocFromHoverChain(
  chain: FakeElement[]
): Pick<Document, 'querySelectorAll'> {
  return {
    querySelectorAll: ((selector: string) =>
      selector === ':hover'
        ? chain
        : []) as unknown as Document['querySelectorAll']
  }
}

describe('gamepadHoverSeed: resolveHoveredCard', () => {
  it('R1: a :hover chain whose deepest element sits inside a .gameCard wrapper resolves to the wrapper and its link', () => {
    const { card, link } = buildCard()
    const icon = makeElement('BUTTON', ['icons'])
    card.appendChild(icon)
    const doc = fakeDocFromHoverChain([card, icon])

    const {
      resolveHoveredCard
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('../gamepadHoverSeed') as typeof import('../gamepadHoverSeed')

    const result = resolveHoveredCard(doc)
    expect(result).not.toBeNull()
    expect(result?.card).toBe(card)
    expect(result?.link).toBe(link)
  })

  it('R2: a :hover chain with no .gameCard/.gameListItem ancestor returns null', () => {
    const el = makeElement('DIV', ['someUnrelatedThing'])
    const doc = fakeDocFromHoverChain([el])

    const {
      resolveHoveredCard
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('../gamepadHoverSeed') as typeof import('../gamepadHoverSeed')

    expect(resolveHoveredCard(doc)).toBeNull()
  })

  it('R3: a document with no querySelectorAll, and one whose querySelectorAll throws, both return null', () => {
    const {
      resolveHoveredCard
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('../gamepadHoverSeed') as typeof import('../gamepadHoverSeed')

    expect(resolveHoveredCard({} as unknown as Document)).toBeNull()
    expect(
      resolveHoveredCard({
        querySelectorAll: () => {
          throw new Error('boom')
        }
      } as unknown as Document)
    ).toBeNull()
  })

  it('R4: a hovered .gameCard wrapper with no direct-child A returns null', () => {
    const { card } = buildCard({ withLink: false })
    const doc = fakeDocFromHoverChain([card])

    const {
      resolveHoveredCard
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('../gamepadHoverSeed') as typeof import('../gamepadHoverSeed')

    expect(resolveHoveredCard(doc)).toBeNull()
  })

  it('R5: a hovered .gameListItem wrapper resolves to its direct-child A', () => {
    const { card, link } = buildCard({ list: true })
    const doc = fakeDocFromHoverChain([card])

    const {
      resolveHoveredCard
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('../gamepadHoverSeed') as typeof import('../gamepadHoverSeed')

    const result = resolveHoveredCard(doc)
    expect(result?.card).toBe(card)
    expect(result?.link).toBe(link)
  })

  it('R6: a deepest hovered element nested inside the card but not the link still resolves to the card link', () => {
    const { card, link } = buildCard()
    const iconButton = makeElement('BUTTON', ['icons'])
    card.appendChild(iconButton)
    const svg = makeElement('svg')
    iconButton.appendChild(svg)
    const doc = fakeDocFromHoverChain([card, iconButton, svg])

    const {
      resolveHoveredCard
      // eslint-disable-next-line @typescript-eslint/no-require-imports
    } = require('../gamepadHoverSeed') as typeof import('../gamepadHoverSeed')

    const result = resolveHoveredCard(doc)
    expect(result?.card).toBe(card)
    expect(result?.link).toBe(link)
  })
})

type Listener = (event: unknown) => void

interface ListenerEntry {
  cb: Listener
  once?: boolean
}

interface MutableButton {
  pressed: boolean
  touched: boolean
  value: number
}

interface MutablePad {
  index: number
  id: string
  buttons: MutableButton[]
  axes: number[]
  connected: boolean
  mapping: string
  timestamp: number
}

function makePad(index: number): MutablePad {
  return {
    index,
    id: `Test Pad ${index} (Vendor: 1234 Product: 5678)`,
    buttons: Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0
    })),
    axes: [0, 0, 0, 0],
    connected: true,
    mapping: 'standard',
    timestamp: 0
  }
}

function asGamepad(pad: MutablePad): Gamepad {
  return pad as unknown as Gamepad
}

interface AppSettingsStub {
  disableController: boolean
}

function buildHarness(
  settings: AppSettingsStub = { disableController: false }
) {
  const listeners = new Map<string, ListenerEntry[]>()
  const rafQueue: FrameRequestCallback[] = []
  const pads: (Gamepad | null)[] = []
  const gamepadAction = jest.fn((_payload: { action: string }) =>
    Promise.resolve()
  )

  let focused: FakeElement | null = null
  let hoverChain: FakeElement[] = []

  const fakeWindow = {
    addEventListener: (
      type: string,
      cb: Listener,
      options?: { once?: boolean }
    ) => {
      const existing = listeners.get(type) ?? []
      existing.push({ cb, once: options?.once })
      listeners.set(type, existing)
    },
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    location: { hash: '#/' },
    api: {
      requestAppSettings: () => Promise.resolve(settings),
      gamepadAction,
      setFullscreen: () => undefined
    }
  }

  const fakeDocument = {
    body: { classList: { contains: () => false } },
    querySelector: (selector: string) =>
      selector === ':focus' ? focused : null,
    querySelectorAll: (selector: string) =>
      selector === ':hover' ? hoverChain : []
  }

  const fakeNavigator = { getGamepads: () => pads }

  const requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafQueue.push(cb)
    return rafQueue.length
  }

  ;(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow
  ;(globalThis as unknown as { navigator: typeof fakeNavigator }).navigator =
    fakeNavigator
  ;(globalThis as unknown as { document: typeof fakeDocument }).document =
    fakeDocument
  ;(
    globalThis as unknown as {
      requestAnimationFrame: typeof requestAnimationFrame
    }
  ).requestAnimationFrame = requestAnimationFrame

  function fire(type: 'gamepadconnected', pad: Gamepad) {
    ;(listeners.get(type) ?? []).forEach((entry) => entry.cb({ gamepad: pad }))
  }

  function fireMouseMove() {
    const entries = listeners.get('mousemove') ?? []
    entries.forEach((entry) => entry.cb({}))
    listeners.set(
      'mousemove',
      entries.filter((entry) => !entry.once)
    )
  }

  function runFrame() {
    rafQueue.shift()?.(0)
  }

  function createElement(
    tagName: string,
    classes: string[] = [],
    opts: { type?: string } = {}
  ) {
    return makeElement(tagName, classes, {
      type: opts.type,
      onFocus: (el) => {
        focused = el
      }
    })
  }

  function createCard(opts: { list?: boolean; withLink?: boolean } = {}) {
    return buildCard({
      ...opts,
      onFocus: (el) => {
        focused = el
      }
    })
  }

  function setFocused(el: FakeElement | null | undefined) {
    focused = el ?? null
  }

  function getFocused() {
    return focused
  }

  function setHoverChain(chain: FakeElement[]) {
    hoverChain = chain
  }

  return {
    pads,
    fire,
    fireMouseMove,
    runFrame,
    gamepadAction,
    createElement,
    createCard,
    setFocused,
    getFocused,
    setHoverChain
  }
}

function cleanupGlobals() {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
  delete (globalThis as unknown as { document?: unknown }).document
  delete (globalThis as unknown as { requestAnimationFrame?: unknown })
    .requestAnimationFrame
}

describe('helpers/gamepad: mouse-to-controller handoff focus seed', () => {
  beforeEach(() => {
    mockVkActive = false
  })

  afterEach(() => {
    cleanupGlobals()
  })

  it('I1: a handoff press with a card hovered lands focus on its link and consumes the press; the next press navigates', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))

    // priming frame -- see gamepadRepeatTiming.test.ts's header note
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).toHaveBeenCalledTimes(1)
    expect(link?.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(harness.gamepadAction).not.toHaveBeenCalled()
    expect(harness.getFocused()).toBe(link)

    // release frame
    pad.buttons[PAD_LEFT].pressed = false
    harness.runFrame()

    // second press -- the card is now focused, so this one navigates from it
    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(harness.gamepadAction).toHaveBeenCalledTimes(1)
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
    expect(link?.focus).toHaveBeenCalledTimes(1)
  })

  it('I2: no card hovered dispatches exactly as before and focuses nothing', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    harness.setHoverChain([])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))

    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(harness.gamepadAction).toHaveBeenCalledTimes(1)
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
    expect(harness.getFocused()).toBeNull()
  })

  it('I3: no controller input -- several idle frames plus a mousemove never move focus off the search field', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const searchInput = harness.createElement('INPUT', [], { type: 'text' })
    harness.setFocused(searchInput)

    const { link } = harness.createCard()
    const { card: hoveredCard } = harness.createCard()
    harness.setHoverChain([hoveredCard])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))

    harness.runFrame()
    harness.runFrame()
    harness.runFrame()
    harness.fireMouseMove()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(harness.getFocused()).toBe(searchInput)
  })

  it('I4: a handoff press with the search input focused lands on the hovered card instead, without opening the virtual keyboard', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const searchInput = harness.createElement('INPUT', [], { type: 'text' })
    harness.setFocused(searchInput)
    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_DOWN].pressed = true
    harness.runFrame()

    expect(link?.focus).toHaveBeenCalledTimes(1)
    expect(harness.gamepadAction).not.toHaveBeenCalled()
    expect(harness.getFocused()).toBe(link)

    pad.buttons[PAD_DOWN].pressed = false
    harness.runFrame()

    pad.buttons[PAD_DOWN].pressed = true
    harness.runFrame()

    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padDown' })
  })

  it('I5: stale focus on a different card does not survive a handoff onto the hovered card', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { link: staleLinkB } = harness.createCard()
    harness.setFocused(staleLinkB)
    staleLinkB?.focus.mockClear()

    const { card: cardA, link: linkA } = harness.createCard()
    harness.setHoverChain([cardA])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(linkA?.focus).toHaveBeenCalledTimes(1)
    expect(staleLinkB?.focus).not.toHaveBeenCalled()
    expect(harness.getFocused()).toBe(linkA)
  })

  it("I6a: no re-seed when focus is already on the hovered card's own link", () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { card, link } = harness.createCard()
    harness.setFocused(link)
    link?.focus.mockClear()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
  })

  it('I6b: no re-seed when focus is on an inner settings button inside the hovered card', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { card, link } = harness.createCard()
    const settingsButton = harness.createElement('BUTTON', ['gameCardSettings'])
    card.appendChild(settingsButton)
    harness.setFocused(settingsButton)
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
  })

  it('I7: a mid-session press never reseeds without an intervening mousemove; a later mousemove re-arms it', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    // handoff press seeds the card
    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()
    expect(link?.focus).toHaveBeenCalledTimes(1)

    pad.buttons[PAD_LEFT].pressed = false
    harness.runFrame()

    // focus moves to some unrelated element, with NO mousemove -- the
    // pointer is still resting over the same card
    const elementC = harness.createElement('DIV', ['somethingElse'])
    harness.setFocused(elementC)

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    // mid-session: this controller is already current, so it is not a
    // handoff -- navigates normally, does not reseed the card
    expect(link?.focus).toHaveBeenCalledTimes(1)
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })

    pad.buttons[PAD_LEFT].pressed = false
    harness.runFrame()

    // the mouse actually moves now -- re-arms the handoff
    harness.fireMouseMove()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).toHaveBeenCalledTimes(2)
  })

  it('I8: no seed while the virtual keyboard is active', () => {
    jest.resetModules()
    mockVkActive = true
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
  })

  it('I9a: no seed when focus is inside a MuiDialog-root overlay', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const dialog = harness.createElement('DIV', ['MuiDialog-root'])
    const dialogButton = harness.createElement('BUTTON', [])
    dialog.appendChild(dialogButton)
    harness.setFocused(dialogButton)

    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
  })

  it('I9b: no seed when focus is inside a dropdown overlay', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const dropdown = harness.createElement('DIV', ['dropdown'])
    const dropdownButton = harness.createElement('BUTTON', [])
    dropdown.appendChild(dropdownButton)
    harness.setFocused(dropdownButton)

    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[PAD_LEFT].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(harness.gamepadAction).toHaveBeenCalledWith({ action: 'padLeft' })
  })

  it('I10: mainAction and altAction never seed on a merely-hovered card', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const { card, link } = harness.createCard()
    harness.setHoverChain([card])

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))
    harness.runFrame()

    pad.buttons[MAIN_ACTION].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(link?.click).not.toHaveBeenCalled()

    pad.buttons[MAIN_ACTION].pressed = false
    harness.runFrame()

    pad.buttons[ALT_ACTION].pressed = true
    harness.runFrame()

    expect(link?.focus).not.toHaveBeenCalled()
    expect(link?.click).not.toHaveBeenCalled()
  })
})

// Held in module scope so the harness helper names cannot collide with the
// sibling gamepad suites -- see gamepadRepeatTiming.test.ts.
export {}
