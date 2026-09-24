/**
 * Regression suite for Console Mode's face-button convention.
 *
 * GameLib's convention is **A CONFIRMS** (operator decision 2026-08-22): the
 * printed label is authoritative, so on a Nintendo pad the physical A cap
 * confirms and the physical B cap goes back — matching a Switch owner's muscle
 * memory from the console itself.
 *
 * That convention is enforced in TWO places that must agree, and this suite
 * pins both together on purpose:
 *   - the LABEL shown on screen (`getActionButtonLabel`/`getBackButtonLabel`)
 *   - the button INDEX that acts (`getActionButtonIndex`/`getBackButtonIndex`)
 *
 * The original defect was precisely a disagreement between those two, so a
 * suite that checked only one half could go green while the bug was live.
 * `labels and indices agree` below is the case that actually names that
 * property, rather than checking each half in isolation.
 *
 * HISTORY — DO NOT "FINISH THE PORT": GameLib previously shipped the opposite
 * convention (bottom cap confirms, labels swapped) in commit `c60eb9776`.
 * Heroic upstream `0ee91ab2f` swaps the indices instead. Applying both swaps
 * cancels them out and reintroduces the original defect.
 */
import {
  detectControllerLayout,
  getActionButtonIndex,
  getActionButtonLabel,
  getBackButtonIndex,
  getBackButtonLabel,
  type ControllerLayout
} from '../controller'
import { nintendoFaceIndices } from 'frontend/helpers/gamepad_layouts'

// Chromium "standard" mapping is by physical position: 0 = bottom, 1 = right.
const BOTTOM_CAP = 0
const RIGHT_CAP = 1

// Raw HID Switch face order is Y, B, A, X, MEASURED on the operator's PowerA
// Advantage Wired Controller for Nintendo Switch 2, 2026-09-23 (Task 1 of
// quick-260923-qe5). Named after the PRINTED CAP, matching
// nintendoLayout.test.ts's constants. Only A/B are needed here -- Console
// Mode's index helpers only ever resolve action/back, never alt/menu.
const RAW_B = 1
const RAW_A = 2

const EXPECTED: Record<
  ControllerLayout,
  { action: string; back: string; actionIndex: number; backIndex: number }
> = {
  // A is the RIGHT cap on a Switch pad, B is the bottom cap -- mirrored
  // relative to every other layout here.
  nintendo: {
    action: 'A',
    back: 'B',
    actionIndex: RIGHT_CAP,
    backIndex: BOTTOM_CAP
  },
  xbox: {
    action: 'A',
    back: 'B',
    actionIndex: BOTTOM_CAP,
    backIndex: RIGHT_CAP
  },
  'steam-deck': {
    action: 'A',
    back: 'B',
    actionIndex: BOTTOM_CAP,
    backIndex: RIGHT_CAP
  },
  ps4: {
    action: '✕',
    back: '◯',
    actionIndex: BOTTOM_CAP,
    backIndex: RIGHT_CAP
  },
  ps5: { action: '✕', back: '◯', actionIndex: BOTTOM_CAP, backIndex: RIGHT_CAP }
}

describe('ConsoleMode/controller: face-button labels and indices', () => {
  it.each(Object.entries(EXPECTED))(
    '%s layout maps to the expected labels and indices',
    (layout, { action, back, actionIndex, backIndex }) => {
      const l = layout as ControllerLayout
      expect(getActionButtonLabel(l)).toBe(action)
      expect(getBackButtonLabel(l)).toBe(back)
      expect(getActionButtonIndex(l, 'standard')).toBe(actionIndex)
      expect(getBackButtonIndex(l, 'standard')).toBe(backIndex)
    }
  )

  it('gives Nintendo the OPPOSITE confirm index from every other layout', () => {
    // Names the swap itself: if a future change flips the labels instead of
    // the indices, this fires even though each half stays self-consistent.
    expect(getActionButtonIndex('nintendo', 'standard')).not.toBe(
      getActionButtonIndex('xbox', 'standard')
    )
    expect(getBackButtonIndex('nintendo', 'standard')).not.toBe(
      getBackButtonIndex('xbox', 'standard')
    )
  })

  it('never binds confirm and back to the same index', () => {
    for (const layout of Object.keys(EXPECTED) as ControllerLayout[]) {
      expect(getActionButtonIndex(layout, 'standard')).not.toBe(
        getBackButtonIndex(layout, 'standard')
      )
    }
  })

  it.each([
    ['Pro Controller (Vendor: 057e Product: 2009)', 'nintendo'],
    ['Joy-Con L (Vendor: 057e Product: 2006)', 'nintendo'],
    // No product code -- upstream's narrower dispatch regex misses this one,
    // which is why the predicate is shared rather than duplicated.
    ['Nintendo Switch Pro Controller', 'nintendo'],
    // "Pro Controller" also appears on some Microsoft pads; Xbox must win.
    ['Xbox Wireless Pro Controller (Vendor: 045e Product: 02fd)', 'xbox'],
    ['Xbox 360 Controller (Vendor: 045e Product: 028e)', 'xbox'],
    // PRE-EXISTING QUIRK, recorded rather than asserted-away: the ps4 branch
    // matches bare `054c`, so it shadows the ps5 branch for every PlayStation
    // id. Not user-visible -- both PS layouts render the same ✕/◯ glyphs and
    // the same indices -- and out of scope for the A-confirms change.
    ['Wireless Controller (Vendor: 054c Product: 0ce6)', 'ps4']
  ])('detects %p as the %p layout', (id, expected) => {
    expect(detectControllerLayout(id)).toBe(expected)
  })

  it('a non-standard Nintendo pad confirms and backs on the raw HID indices', () => {
    expect(getActionButtonIndex('nintendo', '')).toBe(RAW_A)
    expect(getBackButtonIndex('nintendo', '')).toBe(RAW_B)
  })

  it('a non-standard mapping does not move any NON-Nintendo layout', () => {
    // Nothing here claims a non-standard PlayStation pad is handled
    // correctly; it claims this change did not touch it.
    for (const layout of ['xbox', 'ps4', 'ps5', 'steam-deck'] as const) {
      expect(getActionButtonIndex(layout, '')).toBe(
        getActionButtonIndex(layout, 'standard')
      )
      expect(getBackButtonIndex(layout, '')).toBe(
        getBackButtonIndex(layout, 'standard')
      )
    }
  })

  it('the LABEL never depends on the mapping', () => {
    // The printed cap is a property of the plastic, not of the HID report --
    // getActionButtonLabel/getBackButtonLabel take ONE argument, and
    // `pnpm codecheck` would fail if a mapping parameter were added. Making
    // the label mapping-dependent would reintroduce the glyph/button
    // disagreement from the other side.
    for (const layout of Object.keys(EXPECTED) as ControllerLayout[]) {
      const { action, back } = EXPECTED[layout]
      expect(getActionButtonLabel(layout)).toBe(action)
      expect(getBackButtonLabel(layout)).toBe(back)
    }
  })

  it('Console Mode and global spatial navigation resolve Nintendo indices through the SAME table', () => {
    // THE INVARIANT CASE: names the single-source-of-truth property
    // directly, so a future edit that re-hard-codes an index in
    // controller.ts fires this even if it happens to pick the right number.
    for (const mapping of ['standard', ''] as const) {
      expect(getActionButtonIndex('nintendo', mapping)).toBe(
        nintendoFaceIndices(mapping).action
      )
      expect(getBackButtonIndex('nintendo', mapping)).toBe(
        nintendoFaceIndices(mapping).back
      )
    }
  })
})
