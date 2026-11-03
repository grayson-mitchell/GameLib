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
 *
 * WR-03: this is also the single-flight point for Steam launches. A second
 * Play for the same appId (library card context-menu Play, grid card plus
 * GamePage, the `gamelib://launch` deep link, the SteamBridgeSetup fallback)
 * joins the first launch here, before `SteamGame.launch()`'s pre-routing or a
 * second `addRecentGame` runs, and the user sees one "already starting"
 * notification.
 */

import i18next from 'i18next'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { singleFlightLaunch } from 'backend/launchSingleFlight'
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
export function dispatchSteamLaunch(appName: string): Promise<boolean> {
  return singleFlightLaunch(
    'steam',
    appName,
    () => notifyAlreadyLaunching(appName),
    () => runDispatch(appName)
  )
}

async function notifyAlreadyLaunching(appName: string): Promise<void> {
  try {
    logInfo(
      `dispatchSteamLaunch: appId ${appName} launch already in progress; joining it (WR-03)`,
      LogPrefix.Steam
    )
    const { libraryManagerMap } = await import('backend/storeManagers')
    const title = libraryManagerMap.steam.getGame(appName).getGameInfo().title
    notify({
      title,
      // Same call shape as the file's other i18next.t uses; the lint ceiling counts warnings.
      // eslint-disable-next-line import-x/no-named-as-default-member
      body: i18next.t(
        'gamelib:steam.bridge.alreadyLaunching',
        'This game is already starting. Wait for its window to open.'
      )
    })
  } catch (err) {
    logWarning(
      ['dispatchSteamLaunch: already-launching notice failed:', err],
      LogPrefix.Steam
    )
  }
}

async function runDispatch(appName: string): Promise<boolean> {
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
