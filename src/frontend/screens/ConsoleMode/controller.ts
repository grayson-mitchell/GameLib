import { isNintendoControllerId } from 'frontend/helpers/gamepad_layouts'

export type ControllerLayout =
  | 'ps4'
  | 'ps5'
  | 'xbox'
  | 'nintendo'
  | 'steam-deck'

// Standard gamepad button indices (Chromium "standard" mapping). These are
// PHYSICAL POSITIONS, not printed glyphs -- index 0 is always the bottom cap
// and index 1 always the right cap. Module-private on purpose: everything
// outside this file must go through the layout-aware helpers below, or a
// Nintendo pad ends up confirming on the wrong cap.
const BTN_ACTION = 0
const BTN_BACK = 1
export const BTN_L1 = 4
export const BTN_R1 = 5
export const BTN_R2 = 7

export const getActionButtonLabel = (layout: ControllerLayout) =>
  layout.startsWith('ps') ? '✕' : 'A'

export const getBackButtonLabel = (layout: ControllerLayout) =>
  layout.startsWith('ps') ? '◯' : 'B'

// GameLib's convention is A CONFIRMS (operator decision 2026-08-22): the
// printed label is authoritative, so a Switch owner's muscle memory from the
// console itself carries over. Nintendo pads mirror A/B relative to Xbox at the
// same physical position, so confirm/back must swap indices to keep the glyph
// and the acting button in agreement.
//
// The alternative -- keeping the bottom cap as confirm on every brand, and
// swapping the LABELS instead -- was GameLib's shipped behaviour until this
// change. Do not reintroduce it on top of this: applying both swaps cancels
// them out and restores the original defect.
export const getActionButtonIndex = (layout: ControllerLayout) =>
  layout === 'nintendo' ? BTN_BACK : BTN_ACTION

export const getBackButtonIndex = (layout: ControllerLayout) =>
  layout === 'nintendo' ? BTN_ACTION : BTN_BACK

export function detectControllerLayout(id: string): ControllerLayout {
  if (/054c|PS3|054c.*09cc|0268|'2563.*0523/i.test(id)) return 'ps4'
  if (/054c.*0ce6/i.test(id)) return 'ps5'
  if (/28de.*11ff/.test(id)) return 'steam-deck'
  // Shares its predicate with `checkNintendo`'s dispatch in `gamepad.ts` so the
  // glyph and the acting button can never disagree about a given pad.
  if (isNintendoControllerId(id)) return 'nintendo'
  return 'xbox'
}
