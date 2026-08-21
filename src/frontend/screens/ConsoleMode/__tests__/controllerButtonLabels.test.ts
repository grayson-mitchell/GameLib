/**
 * Regression suite for `getActionButtonLabel` / `getBackButtonLabel`
 * (quick task 260821-ooq). `controller.ts` has no imports, so this suite
 * imports it directly -- no harness required.
 *
 * DEFECT GATES -- each of these currently returns the OTHER value on the
 * pre-fix source (the 'nintendo' layout fell through to the Xbox default),
 * so each is RED against pre-fix and GREEN after:
 *   - getActionButtonLabel('nintendo') === 'B'   (pre-fix returned 'A')
 *   - getBackButtonLabel('nintendo')   === 'A'   (pre-fix returned 'B')
 *
 * REGRESSION GUARDS -- these pass both before and after; they are NOT
 * defect coverage, only proof the fix didn't disturb the other layouts.
 *
 * REACHABILITY GUARD -- also passes both before and after; it proves the
 * 'nintendo' branch is reachable from a real device id rather than dead.
 */
import {
  detectControllerLayout,
  getActionButtonLabel,
  getBackButtonLabel,
  type ControllerLayout
} from '../controller'

const EXPECTED_LABELS: Record<
  ControllerLayout,
  { action: string; back: string }
> = {
  nintendo: { action: 'B', back: 'A' },
  xbox: { action: 'A', back: 'B' },
  'steam-deck': { action: 'A', back: 'B' },
  ps4: { action: '✕', back: '◯' },
  ps5: { action: '✕', back: '◯' }
}

describe('ConsoleMode/controller: getActionButtonLabel / getBackButtonLabel', () => {
  it.each(Object.entries(EXPECTED_LABELS))(
    '%s layout: action=%p back=%p',
    (layout, { action, back }) => {
      expect(getActionButtonLabel(layout as ControllerLayout)).toBe(action)
      expect(getBackButtonLabel(layout as ControllerLayout)).toBe(back)
    }
  )

  it("detects a real Switch Pro Controller id as the 'nintendo' layout", () => {
    expect(
      detectControllerLayout('Pro Controller (Vendor: 057e Product: 2009)')
    ).toBe('nintendo')
  })
})
