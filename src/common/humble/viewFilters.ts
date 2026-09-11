import { HumbleKey, HumbleKeyState } from '../types/humble'
import { GENERIC_KEY_PLATFORM } from './genericKeyPlatform'

/**
 * Pure view-membership + sort helpers backing the unified Humble Keys list
 * (D-43-01) and its two backend consumers (StoreSearch, Discounts). Kept in
 * common/ (no React, no i18n, no I/O) so it is unit-testable from the backend
 * jest project — the frontend screen only maps the returned flat array to
 * `HumbleKeyRow`s. Same tier/convention as `expirationDisplay.ts`.
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

// 260911-t0p: backs ONLY the Humble Keys screen's "Redeemable keys only"
// checkbox (`screens/Humble/Keys/index.tsx`) -- nothing else reads this
// constant. It deliberately EXCLUDES REVEALED, where WAITING_STATES above
// includes it: a REVEALED key already has a redeemed_key_val (Phase 14
// gap closure 14-07's classification, see selectKeysWaiting's doc comment)
// and is not itself "redeemable" in the sense this checkbox's label
// promises, an operator override recorded in this quick task superseding
// the original Phase 43 D-43-08 selection. WAITING_STATES itself is
// UNCHANGED by this addition and continues to own `selectKeysWaiting` and
// the per-row claim gate (`hasClaimEligibleState`,
// `screens/Humble/Keys/index.tsx`) -- a future reader should not
// "deduplicate" these two sets into one; they answer different questions
// and are pinned as separate by `viewFilters.test.ts`.
export const REDEEMABLE_ONLY_STATES: Set<HumbleKeyState> = new Set([
  'UNPICKED',
  'UNREVEALED'
])

// D-56: dated keys sort soonest-expiring first; a dated key always precedes
// an undated one; undated keys tiebreak alphabetically by title. Single flat
// list — no groups.
//
// D-43-06: this is also the unified Humble Keys list's default "Expiring
// soonest" comparator. Plan 43-08 deleted the grouped presentation's own
// comparator (which tiebreaked two undated keys as equal, leaving whatever
// order the input happened to arrive in) rather than keeping a second
// implementation — this function's alphabetical tiebreak is therefore
// load-bearing, not incidental: it is the one behaviour that deletion could
// have silently lost.
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
 * publisher-redemption items, `GENERIC_KEY_PLATFORM`) are excluded here
 * regardless of state; under D-43-01 they still surface as ordinary rows on
 * the unified Humble Keys list, never in Keys waiting. `ownedElsewhere`
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
 * excluded — reveal forfeits the gift link (spec §2.1).
 */
export function isGiftableSpare(
  key: Pick<HumbleKey, 'ownedElsewhere' | 'state'>
): boolean {
  return key.ownedElsewhere && key.state === 'UNREVEALED'
}

/**
 * Quick task 260911-nyq. Whether the GIFT AFFORDANCE may be offered for this
 * key at all -- deliberately NOT the same question as `isGiftableSpare`
 * above, which classifies a key as a spare (you already own the game, so
 * this copy is surplus).
 *
 * Gating the affordance on the spare CLASSIFICATION was the defect: the claim
 * gate (`screens/Humble/Keys/index.tsx:421-424`) requires `!ownedElsewhere`
 * and the spare test requires `ownedElsewhere`, so no key could hold both and
 * `43-UI-SPEC.md:313` scenario 2's Claim+Gift pair was unreachable for every
 * key in every library. Owning a game elsewhere is not a precondition for
 * being allowed to give a key away.
 *
 * Two clauses, each load-bearing for a different reason:
 *
 * - `state === 'UNREVEALED'` is a DOMAIN constraint carried over from
 *   `isGiftableSpare`: revealing a key forfeits Humble's gift link (spec
 *   2.1), so a REVEALED key cannot be gifted no matter who owns it. Because
 *   `HumbleKeyState` is a single enum, this clause also excludes REDEEMED,
 *   UNREDEEMABLE (expired) and UNPICKED without naming them.
 * - `gog_keyless` is excluded because a keyless entitlement redeems
 *   server-side to the linked GOG account and carries no code to transfer --
 *   the same reason `REDEEM_URL_BUILDERS` (`keyTypePresentation.ts:121-125`)
 *   omits it. Offering "gift" there would promise a hand-off the user cannot
 *   complete.
 *
 * Both predicates take the narrow `Pick` they actually read rather than a
 * whole `HumbleKey`, so `resolveKeyScenario` -- which itself receives only a
 * projection -- can call them instead of re-deriving their bodies inline.
 *
 * `GENERIC_KEY_PLATFORM` is deliberately NOT excluded: the claim gate drops
 * it for want of a redeem destination, but `openGiftDialog` needs no
 * destination -- it records the open and sends the user to Humble's own keys
 * page, which is platform-agnostic.
 */
export function isGiftable(
  key: Pick<HumbleKey, 'state' | 'platform'>
): boolean {
  return key.state === 'UNREVEALED' && key.platform !== 'gog_keyless'
}
