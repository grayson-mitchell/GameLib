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

// Right-stick Y axis index on the non-standard PowerA pad. MEASURED
// 2026-09-25 (quick-260925-9de Task 1, operator checkpoint 1): pushing the
// right stick fully UP drove axis 5 NEGATIVE (-0.14510 -> -0.45882 ->
// -0.97647), then fully DOWN drove it back POSITIVE. This is a MEASURED
// value, not derived from `checkGamecube`'s axes[4], "one past axes[3]", or
// symmetry with the left stick -- all three were considered and rejected in
// the plan's <conditionality> section precisely because axes[4] never moved
// across the whole sitting.
const RIGHT_STICK_Y_NON_STANDARD = 5

// LEFT_X/LEFT_Y reproduce the always-true axes[0]/axes[1] read. RIGHT_X was
// CONFIRMED LIVE 2026-09-25 (M2) by the `[tauriGamepadInput] unhandled
// gamepad action "rightStickLeft"` warning reaching the default arm at
// tauriGamepadInput.ts:394 -- re-confirmed on this instrument at Task 1 step
// d.
const LEFT_X = 0
const LEFT_Y = 1
const RIGHT_X = 2

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

// OPT-IN ONLY -- built and used by ONE test (`rightClick follows the printed
// X cap`) via `buildHarness({ stubFocusedElement: true })`. Every other case
// in this file gets `fakeDocument.querySelector` returning `null`, exactly
// as before. A harness-wide focus stub would change `currentElement()` for
// every case, including the six byte-identical regression cases this whole
// suite exists to protect -- so this is threaded through as an explicit,
// per-call option rather than a default.
//
// `metadata()` (helpers/gamepad.ts) needs only `tagName` and
// `getBoundingClientRect()` off the focused element; `rightClick`'s dispatch
// path never touches `parentElement` or any other DOM API. `tagName: 'DIV'`
// is deliberate -- `currentElement()` special-cases `'svg'`, so a stub using
// that tag would exercise a different branch than a real focused button.
const fakeFocusedElement = {
  tagName: 'DIV',
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

function buildHarness(options: { stubFocusedElement?: boolean } = {}) {
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
    querySelector: () =>
      options.stubFocusedElement ? fakeFocusedElement : null
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
  opts?: PadOptions,
  harnessOpts?: { stubFocusedElement?: boolean }
): string[] {
  jest.resetModules()
  const harness = buildHarness(harnessOpts)
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

  // HARNESS PLUMBING, not a case edit: this body now delegates to `moveAxis`,
  // which does exactly what this function used to do inline (jest.resetModules,
  // buildHarness, initGamepad, makePad, connect, priming frame, write axis,
  // one more frame, return actions). `moveHat`'s SIGNATURE and BEHAVIOUR are
  // unchanged -- the six existing hat cases keep their exact current meaning.
  return moveAxis(id, opts.hatAxis, hatValue, opts)
}

/**
 * Moves an arbitrary axis to `value` for a single frame and returns the
 * actions dispatched. A SIBLING to `pressButton`/`moveHat`: same shape
 * (jest.resetModules, buildHarness, initGamepad, makePad, connect, priming
 * frame -- the released frame `checkAction` needs to seed `triggeredAt` --
 * write axis, one more frame), but takes the axis index EXPLICITLY instead of
 * reading `opts.hatAxis`, so it can drive any of the ten axes on the
 * measured PowerA pad, not just the hat.
 */
function moveAxis(
  id: string,
  axisIndex: number,
  value: number,
  opts: PadOptions
): string[] {
  jest.resetModules()
  const harness = buildHarness()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initGamepad } = require('../gamepad') as typeof import('../gamepad')
  initGamepad()

  const pad = makePad(0, id, opts)
  harness.connect(pad)

  // priming frame -- checkAction only seeds triggeredAt on a released frame
  harness.runFrame()

  pad.axes[axisIndex] = value
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
    // Task 2 flagged that `rightClick` is gated behind `metadata()`
    // (helpers/gamepad.ts), which needs `currentElement()` ->
    // `document.querySelector(':focus')` to return a real element --
    // structurally impossible with this harness's default `fakeDocument`,
    // pre-fix AND post-fix. Orchestrator decision (Task 3,
    // quick-260923-qe5): opt in to the scoped focused-element stub for THIS
    // case only, via `pressButton`'s 4th argument, so the assertion below is
    // a genuine positive rather than a vacuous or negative one. See the
    // `fakeFocusedElement`/`buildHarness` comment above for why this is
    // opt-in rather than harness-wide.
    expect(
      pressButton(POWERA_ID, RAW_X, NON_STANDARD, { stubFocusedElement: true })
    ).toContain('rightClick')
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

  it('guide toggles Console Mode via location.hash from the measured Home index on the non-standard pad', () => {
    // MEASURED 2026-09-25 (quick-260925-ms5 Task 2): Home reproduced at
    // index 12 twice in the same sitting, with a live positive control (the
    // A cap, index 2) confirmed BEFORE Home was pressed. This overturns the
    // 2026-09-23 (quick-260923-qe5 A5) null, which had no positive control.
    //
    // `guide` resolves to a `window.location.hash` toggle inside
    // `checkAction` (gamepad.ts), returning BEFORE the
    // `window.api.gamepadAction` call every other action here goes through
    // -- so it is NOT observable via `pressButton`'s `actions()` return
    // value (see the file header note on why `back`/`altAction` are the
    // observable half for other actions). Reading `location.hash` back off
    // the harness's `window` global is the only way to observe this action.
    pressButton(POWERA_ID, 12, NON_STANDARD)
    const win = (
      globalThis as unknown as { window: { location: { hash: string } } }
    ).window
    expect(win.location.hash).toBe('#/console')
  })

  // CONTRACT PRESERVATION, GREEN pre-fix BY DESIGN -- NOT RED evidence. Pins
  // that binding `guide` on the non-standard path did not touch the
  // standard path's own buttons[16] read.
  it('a standard-mapped Nintendo pad still reads guide from buttons[16], unchanged', () => {
    pressButton(SWITCH_PRO_ID, 16)
    const win = (
      globalThis as unknown as { window: { location: { hash: string } } }
    ).window
    expect(win.location.hash).toBe('#/console')
  })

  it('stick clicks (L3/R3) dispatch nothing on the non-standard pad -- measurement record only', () => {
    // MEASURED 2026-09-25 (quick-260925-ms5 Task 2): L3 at index 10, R3 at
    // index 11 -- confirming the "probably matches the shoulders" prior by
    // measurement. Nothing in this repo dispatches these indices on any
    // mapping; see
    // .planning/todos/completed/2026-09-25-no-layout-dispatches-l3-r3-stick-clicks.md.
    // This pins today's deliberate non-dispatch so a future accidental
    // wiring is caught.
    expect(pressButton(POWERA_ID, 10, NON_STANDARD)).toHaveLength(0)
    expect(pressButton(POWERA_ID, 11, NON_STANDARD)).toHaveLength(0)
  })
})

/**
 * Right-stick vertical axis coverage, driven by Task 1's live measurement of
 * the operator's PowerA Advantage Wired Controller for Nintendo Switch 2
 * (2026-09-25, quick-260925-9de). `checkNintendo` assigned all four stick
 * axes above the mapping branch (rightAxisY = axes[3]), unbranched, and this
 * pad's real right-stick Y is axes[5] -- MEASURED, not axes[3] and not
 * `checkGamecube`'s axes[4].
 */
describe('helpers/gamepad: Nintendo layout routing, right stick (measured PowerA pad, 2026-09-25)', () => {
  afterEach(cleanupGlobals)

  it('dispatches rightStickUp from its MEASURED Y axis', () => {
    // MEASURED 2026-09-25 (Task 1 step b): UP drove axis 5 NEGATIVE, the same
    // sign convention the left stick's axes[1] already uses -- no inversion
    // needed here or in case (B) below.
    const actions = moveAxis(
      POWERA_ID,
      RIGHT_STICK_Y_NON_STANDARD,
      -1,
      NON_STANDARD
    )
    expect(actions).toContain('rightStickUp')
    expect(actions).not.toContain('rightStickDown')
  })

  it('dispatches rightStickDown from the same axis pushed the other way', () => {
    const actions = moveAxis(
      POWERA_ID,
      RIGHT_STICK_Y_NON_STANDARD,
      1,
      NON_STANDARD
    )
    expect(actions).toContain('rightStickDown')
    expect(actions).not.toContain('rightStickUp')
  })

  it('cross-mapping contrast: axes[3] is not this pad right stick Y, but it is the Switch Pro Controller', () => {
    // Without this pair, an implementation that simply moved EVERY Nintendo
    // pad to the new index would satisfy the two cases above while silently
    // destroying standard-mapped pads. axes[3] was live-FALSIFIED as this
    // pad's right-stick Y on 2026-09-25 -- it is this pad's unused axis, not
    // its stick.
    const nonStandardActions = moveAxis(POWERA_ID, 3, -1, NON_STANDARD)
    expect(nonStandardActions).not.toContain('rightStickUp')
    expect(nonStandardActions).not.toContain('rightStickDown')

    const standardActions = moveAxis(SWITCH_PRO_ID, 3, -1, {})
    expect(standardActions).toContain('rightStickUp')
  })

  // CONTRACT PRESERVATION, GREEN pre-fix BY DESIGN -- NOT RED evidence. Pins
  // that a standard-mapped pad's right stick is unaffected by this change,
  // both vertical directions plus the horizontal axis. `makePad`'s default
  // `axisCount` is 4, so indices 0-3 exist with no options bag.
  it('a standard-mapped pad still reads its right stick from axes[2]/axes[3]', () => {
    expect(moveAxis(SWITCH_PRO_ID, 3, -1, {})).toContain('rightStickUp')
    expect(moveAxis(SWITCH_PRO_ID, 3, 1, {})).toContain('rightStickDown')
    expect(moveAxis(SWITCH_PRO_ID, 2, -1, {})).toContain('rightStickLeft')
  })

  // GREEN pre-fix -- contract preservation, NOT a re-fix of the horizontal
  // no-op. axes[2] is this pad's right-stick X, CONFIRMED LIVE 2026-09-25
  // (M2) by the `unhandled gamepad action "rightStickLeft"` warning.
  // rightStickLeft/rightStickRight DO reach window.api.gamepadAction from
  // gamepad.ts:296 and are observable here; they become a no-op only later,
  // in the PRELOAD switch's default arm, which is out of scope. This case
  // asserts DISPATCH, not effect.
  it('right stick horizontal still dispatches on the non-standard pad (axes[2])', () => {
    expect(moveAxis(POWERA_ID, RIGHT_X, -1, NON_STANDARD)).toContain(
      'rightStickLeft'
    )
    expect(moveAxis(POWERA_ID, RIGHT_X, 1, NON_STANDARD)).toContain(
      'rightStickRight'
    )
  })

  // GREEN pre-fix -- contract preservation. The fix touches the axis-read
  // block serving all four sticks; this pins that it moved only the one axis
  // it was supposed to.
  it('left stick unmoved on the non-standard pad', () => {
    expect(moveAxis(POWERA_ID, LEFT_X, -1, NON_STANDARD)).toContain(
      'leftStickLeft'
    )
    expect(moveAxis(POWERA_ID, LEFT_Y, -1, NON_STANDARD)).toContain(
      'leftStickUp'
    )
  })

  // Case (G) from the plan -- "a resting deflected axis dispatches no
  // right-stick action" -- is DELIBERATELY NOT WRITTEN. M3 (Task 1's resting
  // baseline) showed every axis compared against the +/-0.5 threshold in
  // checkNintendo's right-stick reads (0, 1, 2, 5) resting inside +/-0.5:
  // 0=0.00392, 1=0.00392, 2=0.00392, 5=0.00392. Axis 9 rests at 3.28571,
  // outside +/-0.5, but it is never compared against that threshold -- only
  // `nintendoHatDirection`'s rounded-value switch reads it. No axis warrants
  // this case; manufacturing one to look thorough is explicitly against the
  // plan's instruction.
})

/**
 * checkN64Clone1 hat-axis coverage (Generic USB Joystick, Vendor 0079
 * Product 0006), closing
 * .planning/todos/pending/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md.
 *
 * WHAT THESE CASES DO AND DO NOT PROVE: they pin `checkN64Clone1`'s code
 * (nintendo.ts:299-352) against the convention its OWN comment table
 * (nintendo.ts:323-337) documents -- which is the entire content of the todo
 * above. They do NOT confirm that real Vendor 0079 Product 0006 hardware
 * emits these values -- that table is inherited and UNMEASURED on any pad
 * available here. The convention itself was measured live on a DIFFERENT pad
 * (PowerA, 2026-09-23, quick-260923-qe5's `nintendoHatDirection` cases above)
 * and every cardinal matched, which is the strongest evidence available and
 * is not the same as a measurement of this device.
 */
describe('helpers/gamepad: N64-clone layout routing (checkN64Clone1, hat axis)', () => {
  afterEach(cleanupGlobals)

  // CONSTRUCTED to satisfy gamepad.ts:575's `/0079.*0006/i` dispatch regex --
  // NOT measured off hardware. No Vendor 0079 Product 0006 pad exists on this
  // machine, which is why the todo this plan closes is `ready: code`.
  const N64_CLONE_ID = 'USB Gamepad (Vendor: 0079 Product: 0006)'

  // From checkN64Clone1's own `dPadAxis = axes[9]` (nintendo.ts:321).
  const N64_HAT_AXIS = 9

  // RAW table values (nintendo.ts:323-337), not the rounded ones -- each case
  // must exercise the `Math.round(v * 10)` transform at nintendo.ts:338
  // rather than bypassing it.
  const N64_HAT_UP = -1
  const N64_HAT_RIGHT = -0.42857
  const N64_HAT_DOWN = 0.14286
  const N64_HAT_LEFT = 0.71429
  const N64_HAT_DOWN_RIGHT = -0.14286
  const N64_HAT_DOWN_LEFT = 0.42857

  // buttonCount 10: checkN64Clone1 reads `B = buttons[8]` UNGUARDED
  // (`B.pressed`, not `B?.pressed`) -- a shorter array throws into
  // gamepad.ts's swallowing catch, which would make every `not.toContain`
  // assertion below pass vacuously. axisCount 10: the hat lives at axes[9].
  // hatAxis/hatNeutral are deliberately OMITTED from this bag: this pad's
  // resting hat value has never been measured. `makePad` would seed the hat
  // with `hatNeutral`'s default `0`, and `0` appears nowhere in the comment
  // table -- a "no d-pad action at rest" case would assert against a harness
  // default dressed up as a device fact, green both pre- and post-fix,
  // proving nothing. Mirrors the precedent at case (G) above (:592-600),
  // deliberately not written for the same reason. The hat is driven via
  // `moveAxis` (explicit axis index) rather than `moveHat`, so
  // `moveHat`'s `opts.hatAxis` requirement is never triggered.
  const N64_CLONE: PadOptions = { buttonCount: 10, axisCount: 10 }

  it('dispatches padDown from the hat axis (DOWN)', () => {
    // Pre-fix: checkN64Clone1 compares padDown against -1 (the table's
    // DOWN-RIGHT row), so this cardinal's raw value 0.14286 -> rounded 1
    // dispatches nothing at all.
    const actions = moveAxis(
      N64_CLONE_ID,
      N64_HAT_AXIS,
      N64_HAT_DOWN,
      N64_CLONE
    )
    expect(actions).toContain('padDown')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  it('dispatches padRight from the hat axis (RIGHT)', () => {
    // Pre-fix: checkN64Clone1 compares padRight against 4 (the table's
    // DOWN-LEFT row), so this cardinal's raw value -0.42857 -> rounded -4
    // dispatches nothing at all.
    const actions = moveAxis(
      N64_CLONE_ID,
      N64_HAT_AXIS,
      N64_HAT_RIGHT,
      N64_CLONE
    )
    expect(actions).toContain('padRight')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
  })

  it('dispatches no d-pad action on the DOWN-RIGHT diagonal', () => {
    // Pre-fix: this diagonal's rounded value -1 is what padDown wrongly
    // tests against, so padDown incorrectly fires here.
    const actions = moveAxis(
      N64_CLONE_ID,
      N64_HAT_AXIS,
      N64_HAT_DOWN_RIGHT,
      N64_CLONE
    )
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  it('dispatches no d-pad action on the DOWN-LEFT diagonal', () => {
    // Pre-fix: this diagonal's rounded value 4 is what padRight wrongly
    // tests against, so padRight incorrectly fires here.
    const actions = moveAxis(
      N64_CLONE_ID,
      N64_HAT_AXIS,
      N64_HAT_DOWN_LEFT,
      N64_CLONE
    )
    expect(actions).not.toContain('padRight')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
  })

  // GREEN pre-fix BY DESIGN -- contract preservation, NOT RED evidence. UP
  // already matches the table (`-10`) before this plan's fix.
  it('dispatches padUp from the hat axis (UP)', () => {
    const actions = moveAxis(N64_CLONE_ID, N64_HAT_AXIS, N64_HAT_UP, N64_CLONE)
    expect(actions).toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padLeft')
    expect(actions).not.toContain('padRight')
  })

  // GREEN pre-fix BY DESIGN -- contract preservation, NOT RED evidence. LEFT
  // already matches the table (`7`) before this plan's fix.
  it('dispatches padLeft from the hat axis (LEFT)', () => {
    const actions = moveAxis(
      N64_CLONE_ID,
      N64_HAT_AXIS,
      N64_HAT_LEFT,
      N64_CLONE
    )
    expect(actions).toContain('padLeft')
    expect(actions).not.toContain('padUp')
    expect(actions).not.toContain('padDown')
    expect(actions).not.toContain('padRight')
  })

  // GREEN pre-fix BY DESIGN -- contract preservation, NOT RED evidence. This
  // is the NON-VACUITY PROOF, not decoration: checkN64Clone1 reads
  // `buttons[8].pressed` unguarded, so a mis-sized pad makes the function
  // throw into gamepad.ts's swallowing catch, and all four `not.toContain`
  // assertions above would then pass for entirely the wrong reason. This
  // case proves the pad is sized correctly and the cases above are reaching
  // checkN64Clone1 at all.
  it('routing positive control: buttons[8] reaches back', () => {
    expect(pressButton(N64_CLONE_ID, 8, N64_CLONE)).toContain('back')
  })
})

// Held in module scope so the harness helper names cannot collide with the
// sibling gamepad suites -- see gamepadRepeatTiming.test.ts.
export {}
