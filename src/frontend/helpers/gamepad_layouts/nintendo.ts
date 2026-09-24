// Holds layouts for different Nintendo official and clone controllers

import { ValidGamepadAction } from 'common/types'

export function checkGameCube(
  buttons: readonly GamepadButton[],
  axes: readonly number[],
  controllerIndex: number,
  checkAction: (
    action: ValidGamepadAction,
    pressed: boolean,
    ctrlIdx: number
  ) => void
) {
  const A = buttons[0],
    X = buttons[1],
    Y = buttons[2],
    B = buttons[3],
    // LT = buttons[4],
    // RT = buttons[5],
    // Z = buttons[6],
    // Start = buttons[7],
    up = buttons[8],
    down = buttons[9],
    left = buttons[10],
    right = buttons[11],
    leftAxisX = axes[0],
    leftAxisY = axes[1],
    rightAxisX = axes[3],
    rightAxisY = axes[4]

  checkAction('padUp', up.pressed, controllerIndex)
  checkAction('padDown', down.pressed, controllerIndex)
  checkAction('padLeft', left.pressed, controllerIndex)
  checkAction('padRight', right.pressed, controllerIndex)
  checkAction('leftStickLeft', leftAxisX < -0.5, controllerIndex)
  checkAction('leftStickRight', leftAxisX > 0.5, controllerIndex)
  checkAction('leftStickUp', leftAxisY < -0.5, controllerIndex)
  checkAction('leftStickDown', leftAxisY > 0.5, controllerIndex)
  checkAction('rightStickLeft', rightAxisX < -0.5, controllerIndex)
  checkAction('rightStickRight', rightAxisX > 0.5, controllerIndex)
  checkAction('rightStickUp', rightAxisY < -0.5, controllerIndex)
  checkAction('rightStickDown', rightAxisY > 0.5, controllerIndex)
  checkAction('mainAction', A.pressed, controllerIndex)
  checkAction('back', B.pressed, controllerIndex)
  checkAction('altAction', Y.pressed, controllerIndex)
  checkAction('rightClick', X.pressed, controllerIndex)
}

// Vendor 057e is Nintendo. The id strings also cover Joy-Cons and the
// third-party pads that report a Nintendo-style face layout, because the
// on-screen glyphs are chosen from this same predicate -- see
// `detectControllerLayout` in `screens/ConsoleMode/controller.ts`.
//
// KEEP THIS AS THE SINGLE SOURCE OF TRUTH. Console Mode's overlays read raw
// button indices through `getActionButtonIndex`/`getBackButtonIndex`, while
// global spatial navigation routes through `checkNintendo` below. If those two
// disagreed about whether a pad is Nintendo, the glyph would contradict the
// button that acts -- which is the original defect this whole layout exists to
// fix. Upstream Heroic dispatches on a narrower `057e.*(2006|2007|2009)` and
// has exactly that split for an id like "Nintendo Switch Pro Controller" that
// carries no product code.
const NINTENDO_ID = /nintendo|057e|switch|joy.?con|pro.?controller/i

// Some Microsoft pads carry "Pro Controller" in their product string, so an
// explicit Xbox match always wins over the Nintendo patterns.
const XBOX_ID = /microsoft|xbox/i

export function isNintendoControllerId(id: string): boolean {
  return !XBOX_ID.test(id) && NINTENDO_ID.test(id)
}

type NintendoFaceIndices = {
  action: number
  back: number
  alt: number
  menu: number
}

// THE SINGLE SOURCE OF TRUTH for which physical button index corresponds to
// the A-CONFIRMS convention on a given Nintendo pad, on EITHER wire format
// Chromium may report it with. Both `checkNintendo` below (global spatial
// navigation) and `getActionButtonIndex`/`getBackButtonIndex`
// (screens/ConsoleMode/controller.ts, Console Mode's overlays) resolve
// through `nintendoFaceIndices` so the two subsystems cannot disagree about a
// given pad -- see the SINGLE SOURCE OF TRUTH comment above
// `isNintendoControllerId`.
const STANDARD_FACE_INDICES: NintendoFaceIndices = {
  action: 1, // right cap (A)
  back: 0, // bottom cap (B)
  alt: 2, // left cap (Y)
  menu: 3 // top cap (X)
}

// RAW HID, classic SNES/Nintendo face order Y, B, A, X. MEASURED against the
// operator's PowerA Advantage Wired Controller for Nintendo Switch 2 (Vendor:
// 20d6 Product: a720), 2026-09-23 21:01:12-16 (quick-260923-qe5 Task 1):
// Chromium reports this pad with mapping `''` (empty string, NOT
// 'standard'), and its face caps read A=2, B=1, X=3, Y=0.
const RAW_HID_FACE_INDICES: NintendoFaceIndices = {
  action: 2, // A
  back: 1, // B
  alt: 0, // Y
  menu: 3 // X
}

export function nintendoFaceIndices(
  mapping: GamepadMappingType
): NintendoFaceIndices {
  // 'xr-standard' is deliberately treated as non-standard: an XR device is
  // not a Switch pad, and the raw-HID row is no more wrong for it than the
  // standard row would be. A `mapping !== ''` test would silently route any
  // future mapping value back into the position-based assumption this whole
  // change exists to stop making, so this branches on the one value known to
  // be safe rather than the one that is merely familiar.
  return mapping === 'standard' ? STANDARD_FACE_INDICES : RAW_HID_FACE_INDICES
}

type NintendoStickAxes = {
  leftX: number
  leftY: number
  rightX: number
  rightY: number
}

// THE SINGLE SOURCE OF TRUTH for which axis index carries each stick, on
// EITHER wire format Chromium may report a Nintendo pad with. Mirrors the
// `nintendoFaceIndices` shape above -- do not invent a second shape.
//
// This row reproduces exactly what shipped before quick-260925-9de -- a
// refactor of the constants that used to sit inline in `checkNintendo`
// (leftAxisX = axes[0], leftAxisY = axes[1], rightAxisX = axes[2],
// rightAxisY = axes[3]), not a change to them.
const STANDARD_STICK_AXES: NintendoStickAxes = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 3
}

// MEASURED against the operator's PowerA Advantage Wired Controller for
// Nintendo Switch 2 (Vendor: 20d6 Product: a720), 2026-09-25
// (quick-260925-9de Task 1, operator checkpoint 1):
//   leftX: 0, leftY: 1 -- MEASURED 2026-09-25 (Task 1 step e), corroborated
//     by focus moving in all four directions.
//   rightX: 2 -- CONFIRMED LIVE 2026-09-25 by
//     `[tauriGamepadInput] unhandled gamepad action "rightStickLeft"`
//     reaching the default arm at tauriGamepadInput.ts:394; re-confirmed as
//     M2.
//   rightY: 5 -- MEASURED 2026-09-25 (Task 1 step b). Pushing the right
//     stick fully UP drove axis 5 to -0.97647 (via -0.14510, -0.45882);
//     fully DOWN drove it back positive. UP is therefore NEGATIVE on this
//     pad's axis 5, the same sign convention the left stick's axes[1] uses.
// `checkGamecube` at :27-30 uses axes[3]/axes[4] for a DIFFERENT device in
// this same file, and axes[3] was live-FALSIFIED as this pad's right-stick
// axis (it never moved) on 2026-09-25. Do not copy that row here. Same rule
// this file already applies to `checkN64Clone1`'s hat table: derive from
// observation and say so.
const RAW_HID_STICK_AXES: NintendoStickAxes = {
  leftX: 0,
  leftY: 1,
  rightX: 2,
  rightY: 5
}

// Module-private: unlike `nintendoFaceIndices`, there is no second consumer
// (Console Mode's `controller.ts` does not read stick axes), and Task 2's
// cases drive through `initGamepad` rather than importing this directly. An
// export nothing consumes is API surface that invites the next reader to
// consume it wrongly.
function nintendoStickAxes(mapping: GamepadMappingType): NintendoStickAxes {
  // Branches identically to `nintendoFaceIndices` -- including treating
  // 'xr-standard' as non-standard, for the reason already written in that
  // function's comment. Do NOT use a `!== ''` test.
  return mapping === 'standard' ? STANDARD_STICK_AXES : RAW_HID_STICK_AXES
}

// Hat-axis index on the non-standard PowerA pad above. MEASURED 2026-09-23
// (Task 1): axes.length is 10 on this pad, and the hat lives at index 9.
// This is specific to the measured device's raw HID report, not a general
// convention -- if a future non-standard Nintendo pad reports its hat at a
// different index, this constant needs a new measurement, not a guess.
const NON_STANDARD_HAT_AXIS = 9

// Measured hat-axis values for the pad above, 2026-09-23 21:04-21:12:
//   up:      -1.00000  -> Math.round(v*10) === -10
//   right:   -0.42857  -> Math.round(v*10) === -4
//   down:     0.14286  -> Math.round(v*10) === 1
//   left:     0.71429  -> Math.round(v*10) === 7
//   up-right: -0.71429 -> Math.round(v*10) === -7 (diagonal, A7 -- excluded)
//   neutral:   3.28571 -> Math.round(v*10) === 33 (excluded)
// Every cardinal matched the Chromium/W3C generic-hat convention; NEUTRAL DID
// NOT -- that convention predicts 1.28571, the measured value is 3.28571.
// This function uses the MEASURED value: a constant of 1.28571 would encode
// a phantom d-pad direction at rest.
// `checkN64Clone1` below uses DIFFERENT constants for a DIFFERENT device, and
// its own comment and code already disagree with each other -- do not copy
// that row here, and this function does not change it.
function nintendoHatDirection(
  hatValue: number
): 'up' | 'down' | 'left' | 'right' | null {
  switch (Math.round(hatValue * 10)) {
    case -10:
      return 'up'
    case 1:
      return 'down'
    case 7:
      return 'left'
    case -4:
      return 'right'
    default:
      // Diagonals, neutral, and NaN (an absent hat axis -- `undefined * 10`
      // -- e.g. on a standard-mapped pad, which never reaches this branch
      // anyway) all land here, and none of them should dispatch a d-pad
      // action.
      return null
  }
}

// Nintendo Switch Pro Controller / Joy-Cons (Vendor: 057e)
// Chromium normalises SOME Nintendo pads to the "standard" mapping (by
// physical position -- buttons[0] is the bottom cap, buttons[1] is the right
// cap) and passes OTHERS through as raw HID, unchanged, reporting `mapping`
// as the empty string. The mapping is now READ here, not assumed:
// `nintendoFaceIndices` above resolves the four face indices for whichever
// mapping this pad reports. On raw HID the face order is the classic
// SNES/Nintendo order Y, B, A, X.
//
// Either way we bind the ACTIONS to the PRINTED LABEL -- A confirms, B goes
// back -- which is what a Switch owner's muscle memory expects from the
// console itself, and is what makes the on-screen glyph and the acting
// button agree. Observed non-standard device: PowerA Advantage Wired
// Controller for Nintendo Switch 2 (Vendor: 20d6 Product: a720), 2026-09-23.
// The STICK AXES are read from the mapping too (quick-260925-9de) -- closing
// the gap quick-260923-qe5 deliberately left open when it branched only the
// buttons and the hat.
export function checkNintendo(
  buttons: readonly GamepadButton[],
  axes: readonly number[],
  controllerIndex: number,
  checkAction: (
    action: ValidGamepadAction,
    pressed: boolean,
    ctrlIdx: number
  ) => void,
  mapping: GamepadMappingType
) {
  const faceIndices = nintendoFaceIndices(mapping)
  const A = buttons[faceIndices.action],
    B = buttons[faceIndices.back],
    Y = buttons[faceIndices.alt],
    X = buttons[faceIndices.menu]

  const stickAxes = nintendoStickAxes(mapping)
  const leftAxisX = axes[stickAxes.leftX],
    leftAxisY = axes[stickAxes.leftY],
    rightAxisX = axes[stickAxes.rightX],
    rightAxisY = axes[stickAxes.rightY]

  checkAction('mainAction', A?.pressed, controllerIndex)
  checkAction('back', B?.pressed, controllerIndex)
  checkAction('altAction', Y?.pressed, controllerIndex)
  checkAction('rightClick', X?.pressed, controllerIndex)
  checkAction('leftStickLeft', leftAxisX < -0.5, controllerIndex)
  checkAction('leftStickRight', leftAxisX > 0.5, controllerIndex)
  checkAction('leftStickUp', leftAxisY < -0.5, controllerIndex)
  checkAction('leftStickDown', leftAxisY > 0.5, controllerIndex)
  checkAction('rightStickLeft', rightAxisX < -0.5, controllerIndex)
  checkAction('rightStickRight', rightAxisX > 0.5, controllerIndex)
  checkAction('rightStickUp', rightAxisY < -0.5, controllerIndex)
  checkAction('rightStickDown', rightAxisY > 0.5, controllerIndex)

  if (mapping === 'standard') {
    // Standard mapping's d-pad is four discrete buttons at fixed positions.
    checkAction('padUp', buttons[12]?.pressed, controllerIndex)
    checkAction('padDown', buttons[13]?.pressed, controllerIndex)
    checkAction('padLeft', buttons[14]?.pressed, controllerIndex)
    checkAction('padRight', buttons[15]?.pressed, controllerIndex)
    checkAction('guide', buttons[16]?.pressed, controllerIndex)
  } else {
    // Raw HID: the d-pad is a single hat axis, NOT buttons[12-15] -- on this
    // device's raw layout those indices are Home and Capture, so reading
    // them as a d-pad would make Home dispatch padUp given a populated
    // button array. Cardinals only: a diagonal that fired both of its
    // components would move spatial navigation twice in one frame.
    const hatDirection = nintendoHatDirection(axes[NON_STANDARD_HAT_AXIS])
    checkAction('padUp', hatDirection === 'up', controllerIndex)
    checkAction('padDown', hatDirection === 'down', controllerIndex)
    checkAction('padLeft', hatDirection === 'left', controllerIndex)
    checkAction('padRight', hatDirection === 'right', controllerIndex)
    // `guide` is deliberately NOT dispatched on the non-standard path: Task 1
    // of quick-260923-qe5 pressed Home and Capture on the operator's pad and
    // neither produced an observable button index (measured 2026-09-23). A
    // guessed guide index is worse than an absent one.
  }
}

// Generic USB Joystick (Vendor: 0079 Product: 0006)
export function checkN64Clone1(
  buttons: readonly GamepadButton[],
  axes: readonly number[],
  controllerIndex: number,
  checkAction: (
    action: ValidGamepadAction,
    pressed: boolean,
    ctrlIdx: number
  ) => void
) {
  const // CUp = buttons[0],
    // CRight = buttons[1],
    CDown = buttons[2],
    // CUp = buttons[3],
    // L = buttons[4],
    // R = buttons[5],
    A = buttons[6],
    Z = buttons[7],
    B = buttons[8],
    // Start = buttons[9],
    axisX = axes[0],
    axisY = axes[1],
    dPadAxis = axes[9]

  // dPad values are mapped to AXIS 9 as:
  // up: -1
  // up-right: -0.71429
  // right: -0.42857
  // down-right: -0.14286
  // down: 0.14286
  // down-left: 0.42857
  // left: 0.71429
  // up-left: 1

  // we multiply by 10 and round to digit we want
  // -1 -> -10
  // -0.71429 -> -7
  // -0.42857 -> -4
  // etc ...
  const dPadVal = Math.round(dPadAxis * 10)

  checkAction('padUp', dPadVal === -10, controllerIndex)
  checkAction('padDown', dPadVal === -1, controllerIndex)
  checkAction('padLeft', dPadVal === 7, controllerIndex)
  checkAction('padRight', dPadVal === 4, controllerIndex)
  checkAction('leftStickLeft', axisX < -0.5, controllerIndex)
  checkAction('leftStickRight', axisX > 0.5, controllerIndex)
  checkAction('leftStickUp', axisY < -0.5, controllerIndex)
  checkAction('leftStickDown', axisY > 0.5, controllerIndex)
  checkAction('mainAction', A.pressed, controllerIndex)
  checkAction('back', B.pressed, controllerIndex)
  checkAction('altAction', CDown.pressed, controllerIndex)
  checkAction('rightClick', Z.pressed, controllerIndex)
}
