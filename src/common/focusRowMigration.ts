/**
 * Focus-row selection: the single validity guard and the one-time seed from the
 * retired `libraryTopSection` setting (Phase 48 Plan 05, SPEC R7).
 *
 * Unlike `trayIconVariant.ts`, this module is NOT self-contained: that file is
 * self-contained only because `common/types.ts` imports `TrayIconVariant` from
 * it. Here the dependency runs the other way (`FocusRowSelection` is declared
 * in `common/types.ts`), so there is no cycle.
 */
import { FocusRowSelection } from 'common/types'

/**
 * A real shape guard over an untrusted persisted value -- the mitigation for
 * T-48-03. Precedent: `engineWiring.ts`'s WR-04 note, where a malformed
 * localStorage value threw out of a memo and blanked the whole Library
 * screen. Checks shape only (object, non-null, `kind` one of the four
 * literals, `value` a non-empty string) -- it does not validate that
 * `value` is itself a legitimate view/collection/store/runnability member;
 * an unrecognised `value` simply selects no games (or, for `kind: 'view'`,
 * falls through `passesView`'s existing default arm), never throws.
 *
 * Defined HERE (a `src/common` module cannot import from `src/frontend`) and
 * re-exported from `focusRowSelectors.ts`, so there is exactly one definition
 * of "a valid focus-row selection" in the tree.
 */
export function isValidFocusRowSelection(
  value: unknown
): value is NonNullable<FocusRowSelection> {
  if (value === null || value === undefined) {
    return false
  }
  if (typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  const { kind, value: pickValue } = candidate
  if (
    kind !== 'view' &&
    kind !== 'collection' &&
    kind !== 'store' &&
    kind !== 'runnability'
  ) {
    return false
  }
  if (typeof pickValue !== 'string' || pickValue.length === 0) {
    return false
  }
  return true
}

/**
 * Derives the persisted `focusRow` from a profile's RAW stored settings.
 * Precedence:
 *
 * 1. `focusRow` PRESENT and valid -> returned unchanged. A present `null` is
 *    a legitimate "off" selection (the user cleared the row) and wins over
 *    any legacy value, so a cleared row is never resurrected on relaunch.
 * 2. Otherwise the legacy `libraryTopSection` seeds it once:
 *    `recently_played` and `recently_played_installed` -> the recentlyPlayed
 *    view (operator ruling: recency kept, the installed-only qualifier is
 *    dropped -- the shape has no slot for a modifier); `favourites` -> the
 *    favourites view; `disabled`, absent or unrecognised -> `null`.
 *
 * Total: never throws; every degenerate input yields `null`.
 *
 * ORDERING TRAP: pass the RAW on-disk object, never the factory-default-merged
 * one. The factory default carries `focusRow: null`, and `null` is a
 * legitimate present value, so migrating the merged object would always
 * short-circuit on rule 1 and silently discard every legacy
 * `libraryTopSection`. That is a sharper version of the trap in
 * `migrateTrayIconVariant`: there the default merely out-ranked the legacy
 * value, here it is indistinguishable from a deliberate user clear.
 */
export function migrateFocusRowSelection(
  stored: { focusRow?: unknown; libraryTopSection?: unknown } | null | undefined
): FocusRowSelection {
  // `in`, not `stored?.focusRow !== undefined`: only `in` tells "key present
  // with value null" apart from "key absent", and that is the whole guard.
  if (stored !== null && stored !== undefined && 'focusRow' in stored) {
    if (stored.focusRow === null) {
      return null
    }
    if (isValidFocusRowSelection(stored.focusRow)) {
      return stored.focusRow
    }
    // Present but invalid: never hand it to the renderer; fall through.
  }

  switch (stored?.libraryTopSection) {
    case 'recently_played':
    case 'recently_played_installed':
      return { kind: 'view', value: 'recentlyPlayed' }
    case 'favourites':
      return { kind: 'view', value: 'favourites' }
    default:
      return null
  }
}
