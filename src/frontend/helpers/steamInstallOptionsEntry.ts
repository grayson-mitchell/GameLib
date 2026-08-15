import { Runner } from 'common/types'

/**
 * D-27 rows 3 (`GameCard`) and 5 (`GameSubMenu`) each add an "Install with
 * options…" affordance, and D-28 requires both to be Steam-only. This module
 * is the SINGLE site where `runner === 'steam'` is evaluated for these two
 * entries — both `.tsx` files call these exports rather than inlining the
 * conjunct, so a future runner extension is one edit and one test here, not
 * a grep across two component files that could silently drift apart.
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
