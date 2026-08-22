import type { SteamSyncStatus } from 'common/types/ipc'

/**
 * 34.15 D-09 -- the executable form of D-06/D-08/D-10's render decision.
 *
 * WHY this is a standalone, zero-runtime-import module rather than logic
 * inlined in `Library/index.tsx`: that file's very first line is
 * `import './index.css'` (NOT `.scss` -- do not grep for `.scss` to confirm
 * this constraint on THIS file, it will false-negative), and this repo's
 * Frontend jest project has no jsdom and no CSS transform. Any test
 * importing anything -- even a named, pure export -- from `index.tsx` dies
 * at that import before the first assertion runs. This module is therefore
 * the only part of the D-06/D-08/D-10 decision Jest can prove directly, the
 * same extraction pattern `steamPlatformRow.ts`, `steamSectionGating.ts` and
 * `steamEligibilityProbe.ts` already use.
 *
 * The decision this module replaces
 * (`Library/index.tsx:1013-1018`, verbatim):
 *
 *   {steam?.username &&
 *     steam?.library?.length === 0 &&
 *     refreshingInTheBackground && (
 *       <UpdateComponent message={t('steam.syncing', 'Syncing your Steam library…')} />
 *     )}
 *
 * `refreshingInTheBackground` defaults `true` and is reset to `true` after
 * every unscoped refresh (`GlobalState.tsx`), so it never actually means "a
 * refresh is running" -- the guard above reduces to "Steam is logged in AND
 * the Steam library is empty", permanently, on failure AND on a genuinely
 * empty library. `resolveSteamSyncIndicator` below replaces that flag with
 * the real `steamSyncStatus` tri-state (34.15 D-06/D-07) so the terminal
 * state is structural rather than a boolean that happens to clear.
 */

/** The render mode this resolver decides. `'hidden'` covers BOTH "nothing to
 * report" and "logged out" -- see branch 1 and branch 4 below. */
export type SteamSyncIndicatorMode =
  | 'hidden'
  | 'syncing'
  | 'failed'
  | 'signedOut'

export interface SteamSyncIndicatorInput {
  steamLoggedIn: boolean
  steamSyncStatus: SteamSyncStatus
  steamLibraryCount: number
  /**
   * `steamConfigStore.credentialsMissing` -- the backend's latched verdict that
   * a SUCCESSFUL credential read came back empty, so the stored token the sync
   * needs is provably gone (quick task 260822-vov).
   *
   * REQUIRED, not optional, on purpose. There is exactly one production call
   * site (`Library/index.tsx`) and the Frontend jest project has no jsdom, so
   * no test can observe whether that call site passes this field -- a compile
   * error is the only thing that can prove it. Optional would let a forgotten
   * argument ship a banner that silently never appears.
   */
  steamCredentialsMissing: boolean
}

export interface SteamSyncIndicatorOutput {
  mode: SteamSyncIndicatorMode
}

export function resolveSteamSyncIndicator(
  input: SteamSyncIndicatorInput
): SteamSyncIndicatorOutput {
  // Branch 1: a user with no Steam account must never see a Steam sync
  // surface. This preserves the `steam?.username` half of the old guard,
  // moved somewhere testable. Evaluated FIRST so no other branch can leak
  // the indicator to a logged-out user.
  if (!input.steamLoggedIn) {
    return { mode: 'hidden' }
  }

  // Branch 1b: a failure whose CAUSE is a proven-missing credential gets its
  // own surface, because the generic one is actively wrong here -- it says
  // "check that Steam is reachable" (Steam is reachable; the session is
  // unauthenticated) and offers a Retry that re-enters the same path, hits the
  // same empty keyring read, and fails identically. Phase 37 already settled
  // this reasoning for the INSTALL path in steam/depotErrors.ts: "Deliberately
  // offers no 'Retry' wording: retrying without first signing in can only fail
  // again in the identical way." This is that decision, applied to sync.
  //
  // BEFORE branch 2 so it wins over the generic failure, and AFTER branch 1 so
  // it can never leak a Steam surface to a user with no Steam account.
  //
  // Deliberately gated on `'failed'` too, rather than firing on the flag
  // alone: the Manage Accounts tile already reports the signed-out state, and
  // an always-on banner here would be a second permanent surface competing
  // with it. This one speaks only when a sync actually failed.
  if (input.steamSyncStatus === 'failed' && input.steamCredentialsMissing) {
    return { mode: 'signedOut' }
  }

  // Branch 2: a failure is surfaced REGARDLESS of `steamLibraryCount`. A
  // failure must be surfaced even when a cached library rendered -- exit
  // path 2 in `library.ts` serves the cached games and then reports the
  // failure, and telling the user nothing because "there are games on
  // screen" would hide a stale library behind a successful-looking render
  // (34.15 D-08).
  if (input.steamSyncStatus === 'failed') {
    return { mode: 'failed' }
  }

  // Branch 3: this preserves the SHIPPED intent of the old guard's
  // `library.length === 0` term -- show the sync indicator only when there
  // is nothing else to look at. A refresh of an already-populated library
  // is covered by the `steamMetadataSyncing` indicator in `LibraryHeader`
  // and does not need a second surface.
  if (input.steamSyncStatus === 'syncing' && input.steamLibraryCount === 0) {
    return { mode: 'syncing' }
  }

  // Branch 4: everything else -> 'hidden'. THIS IS WHERE THE DEFECT DIED.
  // `'idle'` with an empty library now renders nothing, where the old guard
  // (driven by a flag that never actually cleared) spun forever.
  return { mode: 'hidden' }
}
