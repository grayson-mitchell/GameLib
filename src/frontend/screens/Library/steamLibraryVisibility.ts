import type { SteamSyncStatus } from 'common/types/ipc'

/**
 * debug/steam-library-shows-logged-out -- the executable form of the Games
 * grid's Steam visibility decision.
 *
 * WHY this is a standalone, zero-runtime-import module rather than logic
 * inlined in `Library/index.tsx`: that file's very first line is
 * `import './index.css'`, and this repo's Frontend jest project has no jsdom
 * and no CSS transform. Any test importing anything -- even a named, pure
 * export -- from `index.tsx` dies at that import before the first assertion
 * runs. This is the same extraction `librarySyncIndicator.ts` already uses,
 * for the same reason; see that file's header.
 *
 * The defect this module exists to kill
 * (`Library/index.tsx`, verbatim, before the fix):
 *
 *   const showSteam = !!steam?.username
 *   const steamLibrary = showSteam ? steam.library : []
 *
 * `steam.username` is seeded at boot from a PERSISTED config value
 * (`steamConfigStore` -> `userData.username`, read in `GlobalState.tsx`) and
 * is never re-verified against a live connection. `SteamUser.ensureConnected()`
 * deliberately leaves `userData`/`isLoggedIn` untouched when a reconnect fails
 * or the stored token reads back empty (`steam/user.ts`) -- by design, so a
 * transient keyring hiccup cannot flip-flop the login badge. That same field
 * was then reused here as the library-visibility gate, so an EXPIRED session
 * kept `showSteam` truthy and rendered the entire cached library, installed
 * and not-installed alike, as live actionable cards -- while the banner,
 * reading the live `steamSyncStatus`, correctly said "signed out".
 *
 * The split this module enforces:
 *
 *  - INSTALLED titles need no Steam session to be real. Their
 *    `appmanifest_*.acf` is on local disk and they stay launchable. They are
 *    shown regardless of session state.
 *  - NOT-INSTALLED titles are the "online collection": owned-but-absent
 *    entries that only an authenticated sync can vouch for. Once a sync has
 *    provably failed to authenticate they are hidden, because an Install
 *    button on one of them cannot work.
 *
 * KNOWN LIMITATION, recorded here so it is not mistaken for a guarantee:
 * `steam/library.ts`'s `refresh()` enumerates the library from an
 * AUTHENTICATED `ownedApps()` call (`library.clear()`, then
 * `for (const app of ownedApps)`), merging local install state on afterwards
 * via `is_installed`. There is no local-ACF-only enumeration path. So this
 * function filters a CACHE of a previous successful sync -- it cannot
 * resurrect installed games for a profile that never completed one. "Installed
 * games always show" is therefore true after any successful sync, and NOT true
 * on a never-synced profile. Delivering the unconditional form means adding
 * ACF-driven enumeration in the backend, which is out of scope here.
 */

/**
 * The only field of a library entry this decision reads. Deliberately
 * structural rather than `GameInfo`, so a test can state its fixtures as the
 * two bits that matter; the generic below keeps the real call site's
 * `GameInfo[]` in and `GameInfo[]` out.
 */
export interface SteamVisibilityGame {
  is_installed: boolean
}

export interface SteamLibraryVisibilityInput<
  TGame extends SteamVisibilityGame
> {
  /** The cached Steam library, exactly as held in global state. */
  library: TGame[]
  /**
   * `steam?.username`. Presence of a persisted Steam identity -- NOT proof of
   * an active session. See this module's header.
   *
   * `null` is in the type because global state genuinely carries it: logout
   * sets the field to `null` rather than deleting it, while a never-connected
   * profile leaves it `undefined`. Both mean "no identity" and both are
   * handled by the same falsy check below -- but the union has to say so, or
   * the call site does not compile.
   */
  steamUsername: string | null | undefined
  /**
   * The live tri-state from the backend. `'failed'` is the only value that
   * proves a sync attempt could not authenticate; `'idle'` and `'syncing'`
   * are both consistent with a healthy session.
   */
  steamSyncStatus: SteamSyncStatus
}

/**
 * Returns the Steam entries the Games grid should render.
 *
 * Three outcomes: no Steam identity -> nothing; identity plus a live-enough
 * session -> everything; identity plus a provably failed sync -> installed
 * only.
 */
export function selectVisibleSteamLibrary<TGame extends SteamVisibilityGame>(
  input: SteamLibraryVisibilityInput<TGame>
): TGame[] {
  // Branch 1: no Steam identity at all -> render nothing. Preserves the
  // `!!steam?.username` half of the old guard. Evaluated FIRST so no later
  // branch can leak Steam cards to a user with no Steam account.
  if (!input.steamUsername) {
    return []
  }

  // Branch 2: THIS IS WHERE THE DEFECT DIES. A failed sync means the session
  // could not authenticate, so the not-installed half of the cache is no
  // longer vouched for and is dropped. Installed titles survive -- their ACF
  // is on local disk and they remain launchable with no session at all.
  if (input.steamSyncStatus === 'failed') {
    return input.library.filter((game) => game.is_installed)
  }

  // Branch 3: an identity plus a sync that has not failed -> the full cached
  // library, unchanged from the shipped behaviour.
  return input.library
}

/** The pair `resolveSteamVisibility` hands back to each call site. */
export interface SteamVisibility<TGame extends SteamVisibilityGame> {
  /** The Games grid slice -- exactly `selectVisibleSteamLibrary`'s return. */
  games: TGame[]
  /** Whether the Store facet panel should render a Steam row at all. */
  storeConnected: boolean
}

/**
 * quick/260924-g7r -- the Store-facet half of threat T-34.11-12 (Spoofing).
 *
 * Before this function existed, `Library/index.tsx`'s `connectedStores` memo
 * pushed `'steam'` on `steam?.username` alone, while `makeLibrary` ran the
 * auth-aware `selectVisibleSteamLibrary` above. For a persisted identity with
 * a `'failed'` sync and zero installed games, those two disagreed: the panel
 * advertised a Steam row over a grid with no Steam games -- a permanently-0
 * row, the exact shape T-34.11-12 exists to prevent, and one that already
 * shipped once for Amazon (`connectedStores` read `amazon.username` while
 * `makeLibrary` read `amazon.user_id`). This function is the single value
 * both sites now read, so the panel and the grid cannot drift apart again.
 *
 * `'failed'` is the term that is NEW relative to `selectVisibleSteamLibrary`
 * alone. On a provably-failed sync the grid above already drops the
 * not-installed half (branch 2); if that also empties the installed half,
 * `storeConnected` goes false too, so a user with zero INSTALLED Steam games
 * on an expired session gets no Steam row rather than a permanently-0 one.
 *
 * On a NON-failed sync the row is kept even when `games` is empty,
 * DELIBERATELY: that matches every other store (a connected account with an
 * empty library still shows a 0 row) and such a row is not PERMANENTLY 0 -- a
 * future sync can still fill it. Only a `'failed'` sync with nothing
 * installed is disqualified, because no future event un-fails it.
 *
 * UX consequence, and its measured refutation: Steam does not vanish from the
 * Library screen when the row goes. `SteamSyncNotice` renders in
 * `signedOut`/`failed` mode on this same screen whenever `steam?.username` is
 * truthy (`librarySyncIndicator.ts` branches 2-3, rendered at
 * `index.tsx:1185` for any mode but `'hidden'`), so the user gets a banner
 * naming the real problem instead of a filter row that filters to nothing.
 */
export function resolveSteamVisibility<TGame extends SteamVisibilityGame>(
  input: SteamLibraryVisibilityInput<TGame>
): SteamVisibility<TGame> {
  const games = selectVisibleSteamLibrary(input)
  const storeConnected =
    Boolean(input.steamUsername) &&
    (input.steamSyncStatus !== 'failed' || games.length > 0)
  return { games, storeConnected }
}
