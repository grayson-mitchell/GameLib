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

// MEASURED on the operator's PowerA Advantage Wired Controller for Nintendo
// Switch 2, 2026-09-23 (Task 1 of quick-260923-qe5). Chromium reports this
// pad with mapping `''` (empty string, NOT 'standard'), 17 buttons, 10 axes.
const POWERA_ID =
  'PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720)'

// Raw HID face order is Y, B, A, X (classic SNES/Nintendo order), MEASURED
// against this pad's face caps 2026-09-23 21:01:12-16. Named after the
// PRINTED CAP, not the array position, so the assertions below read as
// claims about the plastic.
const RAW_Y = 0
const RAW_B = 1
const RAW_A = 2
const RAW_X = 3

// Hat axis constants, MEASURED 2026-09-23 21:04-21:12. axes.length is 10 on
// this pad, so the hat is index 9 (indices 0-9).
//
// DIVERGENCE FROM THE PLAN'S PRIOR: the plan predicted neutral 1.28571 (the
// Chromium/W3C generic-hat convention). The MEASURED neutral is 3.28571.
// Every cardinal matched the documented convention; neutral did not. This
// file uses the measured value -- a test built on the predicted neutral
// would encode a phantom d-pad direction at rest.
const HAT_UP = -1
const HAT_RIGHT = -0.42857
const HAT_DOWN = 0.14286
const HAT_LEFT = 0.71429
const HAT_UP_RIGHT = -0.71429 // diagonal (A7) -- cardinals-only excludes this
const HAT_NEUTRAL = 3.28571

interface PadOptions {
  mapping?: string
  buttonCount?: number
  axisCount?: number
  hatAxis?: number
  hatNeutral?: number
}

// The non-standard PowerA pad's options bag, matching Task 1's A1/A2/A6
// observations.
const NON_STANDARD: PadOptions = {
  mapping: '',
  buttonCount: 17,
  axisCount: 10,
  hatAxis: 9,
  hatNeutral: HAT_NEUTRAL
}

function makePad(index: number, id: string, opts: PadOptions = {}) {
  const {
    mapping = 'standard',
    buttonCount = 17,
    axisCount = 4,
    hatAxis,
    hatNeutral = 0
  } = opts

  // Defaults above reproduce today's pad EXACTLY -- mapping 'standard', 17
  // buttons, 4 axes, no hat -- so every existing case above keeps its
  // current meaning untouched.
  const axes = Array.from({ length: axisCount }, () => 0)
  if (hatAxis !== undefined) {
    // Seed the hat with its resting value rather than 0, so the priming
    // frame models a real resting hat.
    axes[hatAxis] = hatNeutral
  }

  return {
    index,
    id,
    buttons: Array.from({ length: buttonCount }, () => ({
      pressed: false,
      touched: false,
      value: 0
    })) as MutableButton[],
    axes,
    connected: true,
    mapping,
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
function pressButton(
  id: string,
  buttonIndex: number,
  opts?: PadOptions
): string[] {
  jest.resetModules()
  const harness = buildHarness()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
  initGamepad()

  const pad = makePad(0, id, opts)
  harness.connect(pad)

  // priming frame -- `checkAction` only seeds `triggeredAt` on a released
  // frame; see the gamepadRepeatTiming.test.ts header note.
  harness.runFrame()

  pad.buttons[buttonIndex].pressed = true
  harness.runFrame()

  return harness.actions()
}

/**
 * Moves the hat axis to `hatValue` for a single frame and returns the
 * actions dispatched. A SIBLING to `pressButton` rather than an overload,
 * because a hat motion is an axis write, not a button press: the pad is
 * built with the hat at `opts.hatNeutral` (seeded by `makePad`), the priming
 * frame runs first -- the released frame `checkAction` needs to seed
 * `triggeredAt`, same as `pressButton` -- and only THEN is `hatValue`
 * written, so the transition is from a modelled resting hat rather than 0.
 */
function moveHat(id: string, hatValue: number, opts: PadOptions): string[] {
  if (opts.hatAxis === undefined) {
    throw new Error('moveHat requires opts.hatAxis')
  }

  jest.resetModules()
  const harness = buildHarness()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
  initGamepad()

  const pad = makePad(0, id, opts)
  harness.connect(pad)

  // priming frame, hat at rest (opts.hatNeutral)
  harness.runFrame()

  pad.axes[opts.hatAxis] = hatValue
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

/**
 * Non-standard mapping coverage, driven by Task 1's live measurement of the
 * operator's PowerA Advantage Wired Controller for Nintendo Switch 2
 * (2026-09-23). Chromium reports this pad with mapping `''`, not
 * 'standard', and passes raw HID through untouched.
 */
describe('helpers/gamepad: Nintendo layout routing, non-standard mapping (measured PowerA pad, 2026-09-23)', () => {
  afterEach(cleanupGlobals)

  it('binds back to the printed B cap, not the bottom cap', () => {
    expect(pressButton(POWERA_ID, RAW_B, NON_STANDARD)).toContain('back')
  })

  it('the printed A cap confirms rather than backing', () => {
    // mainAction resolves to currentElement()?.click(), invisible in this
    // DOM-less harness -- see the file header. The not-back assertion is
    // what carries the weight; a mainAction assertion here would pass
    // vacuously.
    expect(pressButton(POWERA_ID, RAW_A, NON_STANDARD)).not.toContain('back')
  })

  it('altAction follows the printed Y cap', () => {
    expect(pressButton(POWERA_ID, RAW_Y, NON_STANDARD)).toContain('altAction')
    expect(pressButton(POWERA_ID, RAW_X, NON_STANDARD)).not.toContain(
      'altAction'
    )
  })

  it('rightClick follows the printed X cap', () => {
    // FLAGGED, NOT REDESIGNED (executor note, quick-260923-qe5 Task 2):
    // `rightClick` is gated behind `metadata()` in gamepad.ts, which needs
    // `currentElement()` -> `document.querySelector(':focus')` to return a
    // real element. This harness's fakeDocument always returns null, so
    // `rightClick` can NEVER reach `window.api.gamepadAction` here --
    // structurally impossible in this DOM-less harness, pre-fix AND
    // post-fix. This assertion is left as the plan specifies rather than
    // improvised around; it is expected to keep failing after Task 3 too.
    // See SUMMARY.md for the full writeup and the decision this needs.
    expect(pressButton(POWERA_ID, RAW_X, NON_STANDARD)).toContain('rightClick')
  })

  it('presses the same raw index to different actions across mappings (cross-mapping contrast)', () => {
    // Without this, an implementation that simply moved every Nintendo pad
    // onto the raw table would satisfy the cases above while destroying the
    // standard-mapping regression bar.
    expect(pressButton(SWITCH_PRO_ID, 0)).toContain('back')
    expect(pressButton(POWERA_ID, 0, NON_STANDARD)).toContain('altAction')
  })

  it('dispatches padUp from the hat axis', () => {
    const actions = moveHat(POWERA_ID, HAT_UP, NON_STANDARD)
    expect(actions).toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  it('dispatches padDown from the hat axis', () => {
    const actions = moveHat(POWERA_ID, HAT_DOWN, NON_STANDARD)
    expect(actions).toContain('padDown')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  it('dispatches padLeft from the hat axis', () => {
    const actions = moveHat(POWERA_ID, HAT_LEFT, NON_STANDARD)
    expect(actions).toContain('padLeft')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padRight')
  })

  it('dispatches padRight from the hat axis', () => {
    const actions = moveHat(POWERA_ID, HAT_RIGHT, NON_STANDARD)
    expect(actions).toContain('padRight')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
  })

  it('dispatches no d-pad action on a diagonal hat value', () => {
    // Pins the cardinals-only decision: a diagonal that fired both of its
    // components would move spatial navigation twice in one frame.
    const actions = moveHat(POWERA_ID, HAT_UP_RIGHT, NON_STANDARD)
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  it('dispatches no d-pad action at the neutral hat value', () => {
    // Guards against a constant that accidentally equals the rest value.
    const actions = moveHat(POWERA_ID, HAT_NEUTRAL, NON_STANDARD)
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  // CONTRACT PRESERVATION, GREEN pre-fix BY DESIGN. This is NOT RED
  // evidence -- it pins that a standard-mapped Nintendo pad's d-pad is
  // unaffected by this change.
  it('a standard-mapped Nintendo pad still reads its d-pad from buttons[12-15]', () => {
    expect(pressButton(SWITCH_PRO_ID, 12)).toContain('padUp')
  })

  it('a non-standard pad does not read its d-pad from buttons[12-15] (index 12 is Home on raw HID Switch)', () => {
    // On the raw HID Switch layout, buttons[12] is Home, not a d-pad
    // direction. Given a populated button array, the pre-fix code would
    // make Home dispatch padUp.
    const actions = pressButton(POWERA_ID, 12, NON_STANDARD)
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })
})

// Held in module scope so the harness helper names cannot collide with the
// sibling gamepad suites -- see gamepadRepeatTiming.test.ts.
export {}
