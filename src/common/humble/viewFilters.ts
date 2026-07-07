import { HumbleKey, HumbleKeyState } from '../types/humble'
import { GENERIC_KEY_PLATFORM } from './groupKeys'

/**
 * Pure view-membership + sort helpers for the Keys-waiting and Giftable-
 * spares tabs (D-53/D-54/D-55/D-56, Phase 13). Kept in common/ (no React, no
 * i18n, no I/O) so it is unit-testable from the backend jest project — the
 * frontend tabs only map the returned flat arrays to `HumbleKeyRow`s. Same
 * tier/convention as `groupKeys.ts` and `expirationDisplay.ts`.
 */

// D-53: the "claim this" set — Keys waiting includes UNPICKED Choice-month
// pseudo-entries (a silently-expiring pick deadline is exactly the failure
// this view exists to prevent) plus UNREVEALED/REVEALED keys still needing
// activation. REDEEMED/UNREDEEMABLE are terminal and never appear here.
export const WAITING_STATES: Set<HumbleKeyState> = new Set([
  'UNPICKED',
  'UNREVEALED',
  'REVEALED'
])

// D-56: dated keys sort soonest-expiring first; a dated key always precedes
// an undated one; undated keys tiebreak alphabetically by title. Single flat
// list — no groups (unlike groupKeys.ts's byExpiringSoonest, which sorts
// within already-partitioned state groups).
function compareWaiting(a: HumbleKey, b: HumbleKey): number {
  if (a.expiration !== null && b.expiration !== null) {
    return new Date(a.expiration).getTime() - new Date(b.expiration).getTime()
  }
  if (a.expiration !== null) return -1
  if (b.expiration !== null) return 1
  return a.title.localeCompare(b.title)
}

/**
 * D-53: game keys the user does not yet own elsewhere AND are in a waiting
 * state. Scoped to game keys only — generic-platform entries (PDF/ebook/
 * publisher-redemption items, `GENERIC_KEY_PLATFORM` from groupKeys.ts) are
 * excluded here regardless of state; they still surface via the All tab's
 * "Other" bucket (round-7 decision), never in Keys waiting. `ownedElsewhere`
 * is the sole owner signal, consumed as-is regardless of `matchConfidence`
 * (D-54) — Plan 03/04 preserve the D-42 override safety valve so a corrected
 * fuzzy match moves back here via the existing recompute path, not a new
 * mechanism in this file.
 */
export function selectKeysWaiting(keys: HumbleKey[]): HumbleKey[] {
  return keys
    .filter(
      (k) =>
        !k.ownedElsewhere &&
        k.platform !== GENERIC_KEY_PLATFORM &&
        WAITING_STATES.has(k.state)
    )
    .sort(compareWaiting)
}

/**
 * D-54/D-55: keys already owned elsewhere AND still UNREVEALED. Owned +
 * REVEALED keys are deliberately excluded — reveal forfeits the gift link
 * (spec §2.1), so those rows appear in All keys only, never here.
 */
export function selectGiftableSpares(keys: HumbleKey[]): HumbleKey[] {
  return keys.filter((k) => k.ownedElsewhere && k.state === 'UNREVEALED')
}
