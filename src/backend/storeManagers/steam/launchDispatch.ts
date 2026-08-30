/**
 * The single Steam launch dispatch shared by the sidecar `launch` handler
 * (`sidecar/steamFlowRegistration.ts`'s `handleLaunch`) and the `gamelib://`
 * deep-link handler (`protocol.ts`'s `is_installed` branch).
 *
 * WHY THIS IS A SHARED MODULE RATHER THAN A LINE INSIDE `handleLaunch`. Two
 * callers must produce the identical recent-games side effect on a
 * successful Steam launch, and duplicating that logic across two call sites
 * is how they drifted in the first place (D-35-19-06 / live-gate criteria 6
 * and 10): `handleLaunch`'s `runner === 'steam'` branch called
 * `game.launch()` and returned — deliberately bypassing `launcher.ts`'s
 * `launchEventCallback` (whose `existsSync`/`askForceUninstall` precheck
 * would wrongly abort a valid Steam launch, see that branch's own comment)
 * — but bypassing `launchEventCallback` also bypassed the ONE place that
 * called `addRecentGame`. `protocol.ts`'s deep-link branch never reached a
 * Steam title at all until this same plan widened `RUNNERS` to include
 * `'steam'`. This module is the single place that now decides what "a Steam
 * launch succeeded" means for the recent-games list, so both callers stay in
 * sync by construction rather than by convention.
 */

import { logWarning, LogPrefix } from 'backend/logger'
import { addRecentGame } from 'backend/recent_games/recent_games'
import type LogWriter from 'backend/logger/log_writer'

/**
 * Launches a Steam title and, on success, records it as a recent game.
 *
 * Resolves `libraryManagerMap` lazily (`await import('backend/storeManagers')`)
 * to avoid adding a new static edge into the `launcher.ts <->
 * storeManagers/index.ts` circular-import seam — the same reason
 * `launcher.ts`'s own `launchEventCallback` resolves it lazily (see the
 * comment at that call site).
 *
 * A launch that never started is not a recent game: on a `false` result this
 * returns `false` immediately and writes NO `games.recent` entry.
 *
 * The `addRecentGame` call is wrapped in its own try/catch. Recording a
 * recent game is bookkeeping; a store-write failure must never turn a
 * successful launch into a reported failure — so a rejection here is logged
 * and swallowed, and `dispatchSteamLaunch` still resolves `true`.
 */
export async function dispatchSteamLaunch(appName: string): Promise<boolean> {
  const { libraryManagerMap } = await import('backend/storeManagers')
  const game = libraryManagerMap.steam.getGame(appName)
  const launched = await game.launch(undefined as unknown as LogWriter)

  if (!launched) {
    return false
  }

  try {
    await addRecentGame(game.getGameInfo())
  } catch (err) {
    logWarning(
      ['dispatchSteamLaunch: addRecentGame failed:', err],
      LogPrefix.Steam
    )
  }

  return true
}
