import { ClaimAnnotation, HumbleKey, HumbleKeyState } from '../types/humble'
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
 *
 * Phase 14 (D-75/D-77) addition: a key locally marked REDEEMED
 * (`locallyRedeemedPending`) stays in this view rather than being treated as
 * terminal — its row renders the "Redeemed {{date}}" annotation + Undo
 * affordance (HumbleKeyRow's claimAction). Without this, `markRedeemed`
 * flipping the state to REDEEMED would drop the row out of Keys-waiting
 * before the Undo affordance could ever be seen, since REDEEMED is
 * otherwise terminal-and-excluded. A server-confirmed redeem never carries
 * `locallyRedeemedPending`, so it remains excluded as before.
 *
 * WR-02 (14-REVIEW) addition: Humble's reveal endpoint populates
 * `redeemed_key_val` SERVER-side, so the next sync after a wizard reveal
 * classifies the key REDEEMED (server truth, no `locallyRedeemedPending`).
 * Without special handling that sync silently dropped the D-66 "Finish
 * activation" resume for any reveal not finished in one sitting — the
 * persisted key value was still on disk but unreachable from every view.
 * The optional `annotations` map (composite `gamekey:machineName` keys, the
 * same shape `humbleGetClaimAnnotations` returns) keeps a REDEEMED key
 * visible while it carries a reveal annotation (`revealedAt` set) and the
 * user has NOT yet marked it redeemed (`redeemedAt` unset) — the row drops
 * only after the explicit "Mark as redeemed" acknowledgment.
 */
export function selectKeysWaiting(
  keys: HumbleKey[],
  annotations?: Record<string, ClaimAnnotation>
): HumbleKey[] {
  return keys
    .filter((k) => {
      if (k.ownedElsewhere || k.platform === GENERIC_KEY_PLATFORM) {
        return false
      }
      if (WAITING_STATES.has(k.state)) {
        return true
      }
      if (k.state !== 'REDEEMED') {
        return false
      }
      // D-77: a local-only mark keeps the row for its Undo affordance.
      if (k.locallyRedeemedPending === true) {
        return true
      }
      // WR-02: revealed through GameLib, later server-classified REDEEMED,
      // never acknowledged by the user — keep the "Finish activation" resume.
      const annotation = annotations?.[`${k.gamekey}:${k.machineName}`]
      return (
        annotation?.revealedAt !== undefined &&
        annotation?.redeemedAt === undefined
      )
    })
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
