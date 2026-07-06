import { HumbleKeyState } from '../types/humble'

/**
 * Pure per-state decision for what a Humble key row renders in its expiration
 * slot (live-UAT round 5 polish). Kept in common/ (no React, no i18n, no I/O)
 * so it is unit-testable from the backend jest project while the frontend row
 * component maps each kind to its translated string:
 *
 *  - 'date'          -> "Expires {{date}}" with the ISO timestamp
 *  - 'no-expiration' -> "No expiration"
 *  - 'no-deadline'   -> "No pick deadline available" (UNPICKED only)
 *  - 'blank'         -> render nothing at all (no placeholder text)
 */
export type HumbleExpirationDisplay =
  | { kind: 'date'; iso: string }
  | { kind: 'no-expiration' }
  | { kind: 'no-deadline' }
  | { kind: 'blank' }

/**
 * State rules (tester-driven, round 5):
 *  - REDEEMED: always blank — a redeemed key's expiration is irrelevant, and
 *    "No expiration" reads as if it still mattered.
 *  - UNREDEEMABLE ("Expired" label): the date when known (useful context),
 *    blank otherwise — NEVER "No expiration" next to an Expired badge.
 *  - UNPICKED: deadline date when known, otherwise the pick-deadline
 *    placeholder (D-27 pseudo-entry, unchanged).
 *  - UNREVEALED / REVEALED: date when known, otherwise "No expiration"
 *    (unchanged — for live keys the absence of an expiry IS the information).
 */
export function getExpirationDisplay(
  state: HumbleKeyState,
  expiration: string | null
): HumbleExpirationDisplay {
  if (state === 'REDEEMED') {
    return { kind: 'blank' }
  }
  if (expiration) {
    return { kind: 'date', iso: expiration }
  }
  if (state === 'UNREDEEMABLE') {
    return { kind: 'blank' }
  }
  if (state === 'UNPICKED') {
    return { kind: 'no-deadline' }
  }
  return { kind: 'no-expiration' }
}
