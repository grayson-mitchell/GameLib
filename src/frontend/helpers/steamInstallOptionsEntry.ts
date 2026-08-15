import { Runner } from 'common/types'

/**
 * D-27 rows 3 (`GameCard`), 5 (`GameSubMenu`) and the `MainButton` caret each
 * add an "Install with options…" affordance, and D-28 requires all of them to
 * be Steam-only. This module is the SINGLE site where `runner === 'steam'` is
 * evaluated for those entries — every `.tsx` file calls these exports rather
 * than inlining the conjunct, so a future runner extension is one edit and one
 * test here, not a grep across three component files that could silently drift
 * apart.
 *
 * 34.13 review C-04: that claim was FALSE the moment it was written. The
 * `MainButton` caret — added by the same phase — inlined its own conjunct and
 * was the only one of the three not gated on `is_delisted`, so a delisted
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
 * `showSteamCardInstallOptions` and `showSteamSubMenuInstallOptions` are
 * deliberately NOT the same function (pinned by this module's test spec B4):
 * the card carries a queue/installable/delisted vocabulary the submenu does
 * not — `GameSubMenu` has no download-queue concept of its own, so folding
 * the two into one shared predicate would either fabricate queue/delisted
 * inputs for the submenu or silently drop them from the card.
 */

export interface SteamCardInstallOptionsState {
  runner: Runner
  isInstalled: boolean
  isQueued: boolean
  isInstallable: boolean
  isDelisted: boolean
}

export interface SteamSubMenuInstallOptionsState {
  runner: Runner
  isInstalled: boolean
  /** 34.13 review WR-05. The card/submenu split above is justified by the
   * submenu having no download-QUEUE concept and no installability
   * vocabulary — it says nothing about delisted, and `gameInfo` (hence
   * `is_delisted`) IS in scope at the submenu call site. A delisted Steam
   * game is documented in `common/types.ts` as "confirmed unavailable on
   * Steam … not activatable", so offering it an install-options door is
   * offering a door to nothing. */
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
    runner === 'steam' &&
    !isInstalled &&
    !isQueued &&
    isInstallable &&
    !isDelisted
  )
}

export function showSteamSubMenuInstallOptions({
  runner,
  isInstalled,
  isDelisted
}: SteamSubMenuInstallOptionsState): boolean {
  return runner === 'steam' && !isInstalled && !isDelisted
}

/**
 * 34.13 review C-04 — the `MainButton` split-button caret.
 *
 * A third distinct shape rather than a reuse of either sibling, for the same
 * reason those two are separate: this site is the only one carrying
 * `installDisabled` (GamePage's own `disabledInstallButtons`, which folds in
 * offline/updating/third-party-managed state), and neither sibling has a
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
    runner === 'steam' &&
    !isInstalled &&
    !isQueued &&
    !isDelisted &&
    !installDisabled
  )
}
