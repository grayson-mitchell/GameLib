/**
 * Behavioural proof for the gamepad key-repeat tuning ported from Heroic
 * `8eb7fe7f9`. Node-env, no DOM (see `src/frontend/jest.config.js` header) --
 * `window`/`navigator`/`document`/`requestAnimationFrame` are stubbed directly
 * on `globalThis`, following the precedent in `gamepadDisconnect.test.ts`.
 *
 * Two properties are guarded here, and they fail against DIFFERENT defects:
 *
 * 1. "input is live before the settings round-trip resolves". The port moved
 *    `actions` out of `initGamepad()`'s body and into the async
 *    `updateGamepadActions()`. Read literally that leaves `actions` undefined
 *    for every frame between `initGamepad()` and the settings promise
 *    resolving -- and `checkAction`'s only caller (`updateStatus`) wraps it in
 *    a `try/catch` that logs and swallows, so the symptom is SILENTLY DROPPED
 *    INPUT, not a crash. That is exactly the shape a green suite misses, hence
 *    the dedicated case.
 *
 * 2. "the configured delays actually reach the repeat logic". Asserting the
 *    settings are merely read would pass against a build that stores them and
 *    never consults them, so this drives the clock across the activation +
 *    repeat boundaries and counts dispatches.
 *
 * A HARNESS DETAIL THAT IS NOT A TEST SMELL: each case runs one frame with
 * nothing pressed before pressing anything. `checkAction` seeds
 * `triggeredAt[controllerIndex]` to 0 only on a released frame, and reads a
 * still-`undefined` slot as "already active" (`undefined !== 0`), so a button
 * held from the very first frame never registers. That is pre-existing upstream
 * behaviour, unchanged by this port, and unreachable in practice because the
 * rAF loop always observes a released frame first -- the priming frame
 * reproduces real conditions rather than papering over a defect.
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

// dpad "down" on the standard layout (gamepad_layouts/standard.ts).
const DPAD_DOWN = 13

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
  gamepadRepeatDelay?: number
  gamepadInitialRepeatDelay?: number
}

function buildHarness(settings: AppSettingsStub) {
  const listeners = new Map<string, Listener[]>()
  const rafQueue: FrameRequestCallback[] = []
  const pads: (Gamepad | null)[] = []
  const gamepadAction = jest.fn((_payload: { action: string }) =>
    Promise.resolve()
  )

  const fakeWindow = {
    addEventListener: (type: string, cb: Listener) => {
      const existing = listeners.get(type) ?? []
      existing.push(cb)
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
    querySelector: () => null
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
    ;(listeners.get(type) ?? []).forEach((handler) => handler({ gamepad: pad }))
  }

  // `updateStatus` re-queues itself, so each call drains exactly one frame.
  function runFrame() {
    rafQueue.shift()?.(0)
  }

  function padDownCalls() {
    return gamepadAction.mock.calls.filter(
      (call) => call[0]?.action === 'padDown'
    ).length
  }

  return { pads, fire, runFrame, padDownCalls }
}

function cleanupGlobals() {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
  delete (globalThis as unknown as { document?: unknown }).document
  delete (globalThis as unknown as { requestAnimationFrame?: unknown })
    .requestAnimationFrame
}

describe('helpers/gamepad: key-repeat timing', () => {
  afterEach(() => {
    cleanupGlobals()
    jest.useRealTimers()
  })

  it('dispatches input on a frame that runs BEFORE the settings round-trip resolves', () => {
    jest.resetModules()
    const harness = buildHarness({
      disableController: false,
      gamepadRepeatDelay: 50,
      gamepadInitialRepeatDelay: 300
    })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))

    // Deliberately NOT awaiting: `requestAppSettings()` is still pending, so
    // both of these frames land in the window where `actions` would be
    // undefined -- pre-fix, the priming frame is swallowed too, so
    // `triggeredAt` never even reaches 0.
    harness.runFrame()

    pad.buttons[DPAD_DOWN].pressed = true
    harness.runFrame()

    expect(harness.padDownCalls()).toBe(1)
  })

  it('honours the configured activation delay before the first repeat, then the repeat delay', async () => {
    jest.useFakeTimers({ doNotFake: ['requestAnimationFrame'] })
    // Non-zero epoch: `checkAction` treats a `triggeredAt` of 0 as "inactive",
    // so a run starting at time 0 could never register as already-active.
    const t0 = 1_000_000
    jest.setSystemTime(t0)

    jest.resetModules()
    // Deliberately NOT the factory defaults (50 / 300): if these matched, a
    // build that ignored the settings entirely and kept its seeded defaults
    // would still satisfy every assertion below.
    const harness = buildHarness({
      disableController: false,
      gamepadRepeatDelay: 20,
      gamepadInitialRepeatDelay: 120
    })
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
    initGamepad()

    // let `updateGamepadActions()` apply the configured timings
    await Promise.resolve()
    await Promise.resolve()

    const pad = makePad(0)
    harness.pads[0] = asGamepad(pad)
    harness.fire('gamepadconnected', asGamepad(pad))

    // priming frame -- see the header note
    harness.runFrame()

    pad.buttons[DPAD_DOWN].pressed = true

    // initial press fires immediately
    harness.runFrame()
    expect(harness.padDownCalls()).toBe(1)

    // exactly ON the activation + repeat boundary (120 + 20): the comparison
    // is strictly greater-than, so this must NOT repeat yet
    jest.setSystemTime(t0 + 140)
    harness.runFrame()
    expect(harness.padDownCalls()).toBe(1)

    // one tick past it -- first repeat
    jest.setSystemTime(t0 + 141)
    harness.runFrame()
    expect(harness.padDownCalls()).toBe(2)

    // subsequent repeats no longer pay the activation delay, just the 20ms
    jest.setSystemTime(t0 + 141 + 21)
    harness.runFrame()
    expect(harness.padDownCalls()).toBe(3)
  })
})

// This suite and `gamepadDisconnect.test.ts` share helper names (`Listener`,
// `makePad`, `buildHarness`, ...). Without a top-level import or export a file
// is a SCRIPT under tsc, so those declarations would be global and collide
// across the two suites. Keep this export to hold the file in module scope.
export {}
