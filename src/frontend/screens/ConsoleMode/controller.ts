export type ControllerLayout =
  | 'ps4'
  | 'ps5'
  | 'xbox'
  | 'nintendo'
  | 'steam-deck'

// Standard gamepad button indices (Chromium "standard" mapping).
export const BTN_ACTION = 0
export const BTN_BACK = 1
export const BTN_L1 = 4
export const BTN_R1 = 5
export const BTN_R2 = 7

// The Chromium "standard" gamepad mapping is POSITION-based: buttons[0]
// (BTN_ACTION, drives mainAction) and buttons[1] (BTN_BACK, drives back) are
// keyed by physical slot, not by printed glyph. On a Nintendo Switch Pro
// Controller / Joy-Con the face buttons are mirrored relative to Xbox at the
// same physical position, so buttons[0] sits under the physical **B** cap
// and buttons[1] sits under the physical **A** cap -- the opposite of every
// other layout this function handles. Only the LABEL differs; which index
// drives which action is unchanged (see gamepad_layouts/standard.ts).
export const getActionButtonLabel = (layout: ControllerLayout) => {
  if (layout.startsWith('ps')) return '✕'
  if (layout === 'nintendo') return 'B'
  return 'A'
}

export function detectControllerLayout(id: string): ControllerLayout {
  if (/054c|PS3|054c.*09cc|0268|'2563.*0523/i.test(id)) return 'ps4'
  if (/054c.*0ce6/i.test(id)) return 'ps5'
  if (/28de.*11ff/.test(id)) return 'steam-deck'
  if (/microsoft|xbox/i.test(id)) return 'xbox'
  if (/nintendo|057e|switch|joy.?con|pro.?controller/i.test(id))
    return 'nintendo'
  return 'xbox'
}

export const getBackButtonLabel = (layout: ControllerLayout) => {
  if (layout.startsWith('ps')) return '◯'
  if (layout === 'nintendo') return 'A'
  return 'B'
}
