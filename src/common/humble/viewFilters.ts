import { HumbleKey, HumbleKeyState } from '../types/humble'
import { GENERIC_KEY_PLATFORM } from './genericKeyPlatform'
import { getUrgencyTier } from './urgencyBadge'

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
//
// D-43-06: this is now also the unified Humble Keys list's default
// "Expiring soonest" comparator. `groupKeys.ts`'s `byExpiringSoonest` is
// DELETED in plan 43-08 rather than kept as a second implementation — the
// two differ ONLY in the two-undated case (this function tiebreaks
// alphabetically by title; `byExpiringSoonest` returns 0, leaving whatever
// order the input happened to arrive in). That tiebreak is therefore
// load-bearing, not incidental: it is the one behaviour a caller of the
// deleted comparator would silently lose.
export function compareWaiting(a: HumbleKey, b: HumbleKey): number {
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
 * Phase 14 gap closure (14-07) realignment: `redeemed_key_val` presence now
 * classifies REVEALED (Humble's reveal endpoint is literally
 * `/humbler/redeemkey` — it never means Steam-activated), so a key revealed
 * through GameLib naturally stays REVEALED — and therefore in
 * `WAITING_STATES` — across every subsequent sync, with no annotation
 * cross-reference needed (this superseded the WR-02 keep-visible
 * workaround). REDEEMED is now produced ONLY by the user's explicit "Mark as
 * redeemed" action and is ALWAYS a local, undoable overlay — every REDEEMED
 * key is therefore included here too, so its "Redeemed {{date}}" + Undo row
 * stays visible and survives sync (this superseded the CR-01
 * `locallyRedeemedPending` special-casing).
 */
export function selectKeysWaiting(keys: HumbleKey[]): HumbleKey[] {
  return keys
    .filter((k) => {
      if (k.ownedElsewhere || k.platform === GENERIC_KEY_PLATFORM) {
        return false
      }
      return WAITING_STATES.has(k.state) || k.state === 'REDEEMED'
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

/**
 * D-43-10: case-insensitive substring match against `key.title` ONLY — no
 * other field is searched. An empty or whitespace-only query matches every
 * key. `origin` is deliberately excluded: 20 of 33 live Humble keys carry
 * the junk gift string "A very special gift just for you" in that field,
 * which names no game, so matching it would surface hits a user could not
 * explain. Compares copies rather than mutating `key.title`.
 */
export function matchesKeySearch(key: HumbleKey, query: string): boolean {
  const trimmedQuery = query.trim()
  if (trimmedQuery === '') {
    return true
  }
  return key.title.toLowerCase().includes(trimmedQuery.toLowerCase())
}

/**
 * D-54/D-55, per-row form: true for a key already owned elsewhere AND still
 * UNREVEALED — the trigger for scenario 3's "you already own this, want to
 * gift the spare?" affordance. Owned + REVEALED keys are deliberately
 * excluded — reveal forfeits the gift link (spec §2.1). Supersedes the
 * array-returning `selectGiftableSpares` above, which plan 43-08 deletes
 * once its last caller is gone.
 */
export function isGiftableSpare(key: HumbleKey): boolean {
  return key.ownedElsewhere && key.state === 'UNREVEALED'
}

/**
 * D-86/D-87/D-88/D-89 (Phase 15): splits an already-`selectKeysWaiting`-
 * filtered/sorted list into a pinned "Expiring soon" set and everything else,
 * for the Keys-waiting view's pinned section. Membership is decided entirely
 * by the existing urgency-tier helper (D-87 — zero new threshold logic, no
 * new numeric literal here): a key is pinned exactly when its urgency badge
 * would be live (`getUrgencyTier(...) !== null`). Single pass over the input
 * so `pinned` and `rest` are guaranteed disjoint and together equal the input
 * (D-88 — a key can never be duplicated or dropped), and both outputs inherit
 * `selectKeysWaiting`'s soonest-first ordering since insertion order is
 * preserved relative to the input.
 */
export function partitionWaitingByUrgency(waiting: HumbleKey[]): {
  pinned: HumbleKey[]
  rest: HumbleKey[]
} {
  const pinned: HumbleKey[] = []
  const rest: HumbleKey[] = []
  for (const key of waiting) {
    if (getUrgencyTier(key.state, key.expiration) !== null) {
      pinned.push(key)
    } else {
      rest.push(key)
    }
  }
  return { pinned, rest }
}
