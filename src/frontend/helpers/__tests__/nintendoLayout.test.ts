/**
 * Behavioural proof of the **A CONFIRMS** convention (operator decision
 * 2026-08-22) for Nintendo pads, driven through the real `initGamepad()` loop.
 *
 * WHY THIS IS NOT A UNIT TEST ON `checkNintendo`: calling the layout function
 * directly would prove it maps indices correctly while saying nothing about
 * whether `gamepad.ts` ever *reaches* it. The dispatch is an `id.match()` chain
 * — the easiest thing to get wrong here is the routing, not the mapping. So
 * these cases drive a fake Switch Pro Controller through the same rAF loop the
 * app uses and read the action that actually comes out.
 *
 * WHAT IS OBSERVED, AND WHY IT IS `back` RATHER THAN `mainAction`:
 * `mainAction` resolves to `currentElement()?.click()`, which is invisible in a
 * DOM-less harness with nothing focused. `back` and `altAction` both reach
 * `window.api.gamepadAction({ action })`, so they are the observable half. That
 * is sufficient: confirm and back are bound to the two indices as a pair, so
 * pinning which index yields `back` pins which index yields confirm.
 *
 * The Xbox rows are not decoration — they are the contrast that makes the
 * Nintendo rows meaningful. An implementation that returned `back` for the
 * bottom cap on *every* layout would satisfy the Nintendo assertions alone.
 *
 * See the header of `gamepadRepeatTiming.test.ts` for the shared harness
 * conventions (node env, globals stubbed on `globalThis`, priming frame).
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

type PadListener = (event: { gamepad: Gamepad }) => void

interface MutableButton {
  pressed: boolean
  touched: boolean
  value: number
}

// Chromium "standard" mapping is by PHYSICAL POSITION, not printed glyph.
const BOTTOM_CAP = 0
const RIGHT_CAP = 1
const LEFT_CAP = 2
const TOP_CAP = 3

const SWITCH_PRO_ID = 'Pro Controller (Vendor: 057e Product: 2009)'
const XBOX_ID = 'Xbox 360 Controller (Vendor: 045e Product: 028e)'

function makePad(index: number, id: string) {
  return {
    index,
    id,
    buttons: Array.from({ length: 17 }, () => ({
      pressed: false,
      touched: false,
      value: 0
    })) as MutableButton[],
    axes: [0, 0, 0, 0],
    connected: true,
    mapping: 'standard',
    timestamp: 0
  }
}

type MutablePad = ReturnType<typeof makePad>

function buildHarness() {
  const listeners = new Map<string, PadListener[]>()
  const rafQueue: FrameRequestCallback[] = []
  const pads: (Gamepad | null)[] = []
  const gamepadAction = jest.fn((_payload: { action: string }) =>
    Promise.resolve()
  )

  const fakeWindow = {
    addEventListener: (type: string, cb: PadListener) => {
      const existing = listeners.get(type) ?? []
      existing.push(cb)
      listeners.set(type, existing)
    },
    removeEventListener: () => undefined,
    dispatchEvent: () => true,
    location: { hash: '#/' },
    api: {
      requestAppSettings: () => Promise.resolve({ disableController: false }),
      gamepadAction,
      setFullscreen: () => undefined
    }
  }

  const fakeDocument = {
    body: { classList: { contains: () => false } },
    querySelector: () => null
  }

  const requestAnimationFrame = (cb: FrameRequestCallback) => {
    rafQueue.push(cb)
    return rafQueue.length
  }

  ;(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow
  ;(
    globalThis as unknown as { navigator: { getGamepads: () => unknown } }
  ).navigator = { getGamepads: () => pads }
  ;(globalThis as unknown as { document: typeof fakeDocument }).document =
    fakeDocument
  ;(
    globalThis as unknown as {
      requestAnimationFrame: typeof requestAnimationFrame
    }
  ).requestAnimationFrame = requestAnimationFrame

  function connect(pad: MutablePad) {
    pads[pad.index] = pad as unknown as Gamepad
    ;(listeners.get('gamepadconnected') ?? []).forEach((handler) =>
      handler({ gamepad: pad as unknown as Gamepad })
    )
  }

  function runFrame() {
    rafQueue.shift()?.(0)
  }

  function actions() {
    return gamepadAction.mock.calls.map((call) => call[0]?.action)
  }

  return { connect, runFrame, actions }
}

function cleanupGlobals() {
  delete (globalThis as unknown as { window?: unknown }).window
  delete (globalThis as unknown as { navigator?: unknown }).navigator
  delete (globalThis as unknown as { document?: unknown }).document
  delete (globalThis as unknown as { requestAnimationFrame?: unknown })
    .requestAnimationFrame
}

/** Presses one button for a single frame and returns the actions dispatched. */
function pressButton(id: string, buttonIndex: number): string[] {
  jest.resetModules()
  const harness = buildHarness()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
  initGamepad()

  const pad = makePad(0, id)
  harness.connect(pad)

  // priming frame -- `checkAction` only seeds `triggeredAt` on a released
  // frame; see the gamepadRepeatTiming.test.ts header note.
  harness.runFrame()

  pad.buttons[buttonIndex].pressed = true
  harness.runFrame()

  return harness.actions()
}

describe('helpers/gamepad: Nintendo layout routing (A confirms)', () => {
  afterEach(cleanupGlobals)

  it('routes a Switch Pro Controller so the BOTTOM cap (B) goes back', () => {
    expect(pressButton(SWITCH_PRO_ID, BOTTOM_CAP)).toContain('back')
  })

  it('routes a Switch Pro Controller so the RIGHT cap (A) confirms, not backs', () => {
    // A confirms -> `mainAction` -> a click, which is invisible here. The
    // assertion that carries the weight is that it is NOT `back`.
    expect(pressButton(SWITCH_PRO_ID, RIGHT_CAP)).not.toContain('back')
  })

  it('leaves Xbox pads on the opposite indices', () => {
    expect(pressButton(XBOX_ID, RIGHT_CAP)).toContain('back')
    expect(pressButton(XBOX_ID, BOTTOM_CAP)).not.toContain('back')
  })

  it('swaps X/Y too, so altAction follows the printed Y cap', () => {
    // Switch prints Y on the LEFT cap; Xbox prints Y on the TOP cap.
    expect(pressButton(SWITCH_PRO_ID, LEFT_CAP)).toContain('altAction')
    expect(pressButton(SWITCH_PRO_ID, TOP_CAP)).not.toContain('altAction')

    expect(pressButton(XBOX_ID, TOP_CAP)).toContain('altAction')
    expect(pressButton(XBOX_ID, LEFT_CAP)).not.toContain('altAction')
  })

  it('treats a Switch pad reporting no product code as Nintendo', () => {
    // Upstream Heroic dispatches on `057e.*(2006|2007|2009)` and would fall
    // through to the standard layout here, contradicting the glyph Console
    // Mode picks for the same id. This is why the predicate is shared.
    expect(pressButton('Nintendo Switch Pro Controller', BOTTOM_CAP)).toContain(
      'back'
    )
  })

  it('does not let an Xbox pad advertising "Pro Controller" fall into the Nintendo layout', () => {
    expect(
      pressButton('Xbox Wireless Pro Controller (Vendor: 045e)', RIGHT_CAP)
    ).toContain('back')
  })
})

// Held in module scope so the harness helper names cannot collide with the
// sibling gamepad suites -- see gamepadRepeatTiming.test.ts.
export {}
