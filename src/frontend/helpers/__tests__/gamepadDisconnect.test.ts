/**
 * Behavioral proof for `removegamepad` (quick task 260821-ooq). Node-env, no
 * DOM (see `src/frontend/jest.config.js` header) -- `window`/`navigator`/
 * `document`/`requestAnimationFrame` are stubbed directly on `globalThis`,
 * following the precedent in `declaredUnavailable.test.ts`.
 *
 * `../virtualKeyboard` imports `simple-keyboard/build/css/index.css` at
 * module top level, which fails under this jest config (no CSS
 * moduleNameMapper). A factory mock keeps the real module -- and its CSS
 * import -- from ever loading (verified during planning).
 *
 * This is a BEHAVIOURAL suite: it drives the real `initGamepad()` and
 * asserts on the `controller-changed` CustomEvent actually handed to
 * `window.dispatchEvent`, not on a source-text gate or a proxy.
 *
 * A NOTE ON A CASE DELIBERATELY NOT WRITTEN: "an untracked pad (e.g. a
 * Logitech G29) disconnects while currentController is already -1" is not
 * observable through the emitted event -- `emitControllerEvent(-1)`
 * early-returns whenever `currentController` already equals -1, so pre-fix
 * and post-fix behaviour are identical for that path. A test asserting on it
 * would pass both before and after the fix and would guard nothing.
 */
jest.mock('../virtualKeyboard', () => ({
  VirtualKeyboardController: {
    isButtonFocused: () => false,
    isActive: () => false,
    initOrFocus: () => undefined,
    destroy: () => undefined,
    space: () => undefined,
    backspace: () => undefined,
    typeCharacter: () => undefined
  }
}))

type Listener = (event: { gamepad: Gamepad }) => void

interface ControllerChangedEvent {
  type: string
  detail: { controllerId: string }
}

// `GamepadButton.pressed` is readonly on the real lib.dom type, but this
// harness needs to flip it between frames -- so pads are built and mutated
// against a locally-mutable shape and only cast to `Gamepad` at the
// boundary where the real module expects one (`fire`, `pads[i] = ...`).
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
  const buttons: MutableButton[] = Array.from({ length: 17 }, () => ({
    pressed: false,
    touched: false,
    value: 0
  }))
  return {
    index,
    id: `Test Pad ${index} (Vendor: 1234 Product: 5678)`,
    buttons,
    axes: [0, 0, 0, 0],
    connected: true,
    mapping: 'standard',
    timestamp: 0
  }
}

function asGamepad(pad: MutablePad): Gamepad {
  return pad as unknown as Gamepad
}

function buildHarness() {
  const listeners = new Map<string, Listener[]>()
  const emitted: ControllerChangedEvent[] = []
  const rafQueue: FrameRequestCallback[] = []
  const pads: (Gamepad | null)[] = []

  const fakeWindow = {
    addEventListener: (type: string, cb: Listener) => {
      const existing = listeners.get(type) ?? []
      existing.push(cb)
      listeners.set(type, existing)
    },
    removeEventListener: () => undefined,
    dispatchEvent: (event: CustomEvent<{ controllerId: string }>) => {
      emitted.push({ type: event.type, detail: event.detail })
      return true
    },
    location: { hash: '#/' },
    api: {
      requestAppSettings: () => Promise.resolve({ disableController: false }),
      gamepadAction: () => Promise.resolve(),
      setFullscreen: () => undefined
    }
  }

  const fakeDocument = {
    body: { classList: { contains: () => false } },
    querySelector: () => null
  }

  const fakeNavigator = {
    getGamepads: () => pads
  }

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

  function fire(
    type: 'gamepadconnected' | 'gamepaddisconnected',
    pad: Gamepad
  ) {
    const handlers = listeners.get(type) ?? []
    handlers.forEach((handler) => handler({ gamepad: pad }))
  }

  function runFrame() {
    const cb = rafQueue.shift()
    cb?.(0)
  }

  return { emitted, pads, fire, runFrame }
}

function cleanupGlobals() {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
  delete (globalThis as unknown as { document?: unknown }).document
  delete (globalThis as unknown as { requestAnimationFrame?: unknown })
    .requestAnimationFrame
}

describe('helpers/gamepad: removegamepad index-vs-position', () => {
  afterEach(() => {
    cleanupGlobals()
  })

  it('CASE 1 -- disconnecting the ACTIVE pad emits a reset even when its gamepad.index differs from its array position', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const pad0 = makePad(0)
    const pad3 = makePad(3)
    harness.pads[0] = asGamepad(pad0)
    harness.pads[3] = asGamepad(pad3)

    harness.fire('gamepadconnected', asGamepad(pad0))
    harness.fire('gamepadconnected', asGamepad(pad3))

    // idle frame: seeds triggeredAt so the next pressed frame isn't
    // swallowed by checkAction's "first press" guard
    harness.runFrame()

    pad3.buttons[0].pressed = true
    harness.runFrame()

    expect(harness.emitted).toHaveLength(1)
    expect(harness.emitted[0].detail.controllerId).toBe(pad3.id)

    harness.pads[3] = null
    harness.fire('gamepaddisconnected', asGamepad(pad3))

    expect(harness.emitted).toHaveLength(2)
    expect(harness.emitted[1].detail.controllerId).toBe('')
  })

  it('CASE 2 -- disconnecting a NON-active pad whose array position equals currentController emits nothing further', () => {
    jest.resetModules()
    const harness = buildHarness()
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const pad5 = makePad(5)
    const pad0 = makePad(0)
    harness.pads[5] = asGamepad(pad5)
    harness.pads[0] = asGamepad(pad0)

    harness.fire('gamepadconnected', asGamepad(pad5))
    harness.fire('gamepadconnected', asGamepad(pad0))

    // idle frame
    harness.runFrame()

    pad0.buttons[0].pressed = true
    harness.runFrame()

    expect(harness.emitted).toHaveLength(1)
    expect(harness.emitted[0].detail.controllerId).toBe(pad0.id)

    harness.pads[5] = null
    harness.fire('gamepaddisconnected', asGamepad(pad5))

    expect(harness.emitted).toHaveLength(1)
  })
})
