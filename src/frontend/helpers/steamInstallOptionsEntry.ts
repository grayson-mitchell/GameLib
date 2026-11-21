import { Runner } from 'common/types'
import { hasCapability } from 'common/storeCapabilities'

/**
 * D-27 row 3 (`GameCard`) and the `MainButton` caret each
 * add an "Install with options…" affordance, and D-28 requires both of them to
 * be Steam-only. This module is the SINGLE site where `runner === 'steam'` is
 * evaluated for those entries — every `.tsx` file calls these exports rather
 * than inlining the conjunct, so a future runner extension is one edit and one
 * test here, not a grep across component files that could silently drift
 * apart.
 *
 * 34.13 review C-04: that claim was FALSE the moment it was written. The
 * `MainButton` caret — added by the same phase — inlined its own conjunct and
 * was the only one of the entries not gated on `is_delisted`, so a delisted
 * Steam game (documented in `common/types.ts` as "confirmed unavailable on
 * Steam … not activatable") still got a caret opening an install-options
 * dialog for a game that cannot be installed. Neither candidate guard covered
 * it: `notInstallable` is set only inside a `runner !== 'steam'` block, and
 * `notSupportedGame` keys on `thirdPartyManagedApp`, never `is_delisted`.
 * `showSteamMainButtonInstallOptions` below is that third shape, added HERE
 * rather than inlined a fourth time.
 *
 * `showSteamCardInstallOptions`'s expression deliberately MIRRORS
 * `GameCard/index.tsx`'s pre-existing plain install `Item`'s own `show:`
 * expression (`!isInstalled && !isQueued && isInstallable && !isDelisted`),
 * plus the Steam gate. The new entry may appear only where the plain install
 * entry already appears — that containment is what makes "every non-Steam
 * runner is unaffected" a structural fact about this module rather than a
 * claim the two `.tsx` files individually have to uphold.
 *
 * Phase 100 removed the ⋮ menu (`GameSubMenu`), which carried a third entry
 * (D-27 row 5); its predicate went with it.
 */

export interface SteamCardInstallOptionsState {
  runner: Runner
  isInstalled: boolean
  isQueued: boolean
  isInstallable: boolean
  isDelisted: boolean
}

export function showSteamCardInstallOptions({
  runner,
  isInstalled,
  isQueued,
  isInstallable,
  isDelisted
}: SteamCardInstallOptionsState): boolean {
  return (
    hasCapability(runner, 'installHandOffToClient') &&
    !isInstalled &&
    !isQueued &&
    isInstallable &&
    !isDelisted
  )
}

/**
 * 34.13 review C-04 — the `MainButton` split-button caret.
 *
 * A distinct shape rather than a reuse of the card's, for the same
 * reason: this site is the only one carrying
 * `installDisabled` (GamePage's own `disabledInstallButtons`, which folds in
 * offline/updating/third-party-managed state), and the card has no
 * vocabulary for it. What it ADDS over the pre-fix inline conjunct is the
 * `!isDelisted` term.
 */
export interface SteamMainButtonInstallOptionsState {
  runner: Runner
  isInstalled: boolean
  isQueued: boolean
  isDelisted: boolean
  installDisabled: boolean
}

export function showSteamMainButtonInstallOptions({
  runner,
  isInstalled,
  isQueued,
  isDelisted,
  installDisabled
}: SteamMainButtonInstallOptionsState): boolean {
  return (
    hasCapability(runner, 'installHandOffToClient') &&
    !isInstalled &&
    !isQueued &&
    !isDelisted &&
    !installDisabled
  )
}
