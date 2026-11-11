/**
 * The G26 in-flight dedupe wrapper around the bridge launch body. It lives
 * apart from launchBridgeGameBody (gameBridgeLaunch) so the wrapper reaches the
 * body across a module boundary, where a test can spy on the export
 * (quick-261108-ca6).
 */
import i18next from 'i18next'
import { logInfo, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { launchBridgeGameBody } from './gameBridgeLaunch'
import type SteamGame from './games'

/**
 * Phase 24 Plan 08 (R4/R6/R7), reordered by Phase 51 Plan 01 (D-51-01):
 * allowlisted-title bridge launch path. Runs the game's OWN resolved
 * Windows `.exe` (resolveBridgeLaunchExe, Task 1) directly via
 * `runWineCommand` against THIS game's own bridge bottle
 * (getBridgeBottleSettings(appId), quick/261016-u1w D-B) — NEVER `tellBottledSteamToLaunch` /
 * `dispatchToBottledSteam`, since the bridge bottle has no bottled Steam
 * client to `-applaunch` through (RESEARCH Pattern 4's single largest
 * routing-shape delta).
 *
 * D-51-01 reorders the readiness gate to AFTER the exe/bottle existence
 * gate: `placeShimForGame()` (byte-identity no-op, refreshes a stale
 * pre-phase shim after an upgrade) and `ensureBridgeHelperReady()` both
 * now run only once we already know there is a real exe to launch, then
 * `writeBridgeConfig()` hands the per-appId helper's real, OS-assigned
 * port to the game's own regenerated shim via `gamelib_bridge.cfg`
 * beside the exe — there is no fixed port left for the shim to guess.
 * On ANY of these steps failing, this marks the appId
 * bridge-failed-this-session (finding #3) and fires
 * `steamBridgeSetupRequired` itself (defensive — never assumes the
 * signal was already fired upstream) before returning `false` — never
 * optimistically flips any running state.
 *
 */
export function launchBridgeGame(steamGame: SteamGame): Promise<boolean> {
  const appId = steamGame.appId
  const { bridgeLaunchesInFlight } = steamGame.deps.steamSession.gameSession
  const existing = bridgeLaunchesInFlight.get(appId)
  if (existing) {
    logInfo(
      `SteamGame: appId ${appId} bridge launch already in progress; joining it instead of starting a second (G26)`,
      LogPrefix.Steam
    )
    notify(steamGame.deps, {
      title: steamGame.getGameInfo().title,
      // Same call shape as the file's other i18next.t uses; the lint ceiling counts warnings.
      // eslint-disable-next-line import-x/no-named-as-default-member
      body: i18next.t(
        'gamelib:steam.bridge.alreadyLaunching',
        'This game is already starting. Wait for its window to open.'
      )
    })
    return existing
  }
  const run = runBridgeLaunch(steamGame)
  bridgeLaunchesInFlight.set(appId, run)
  run
    .finally(() => {
      if (bridgeLaunchesInFlight.get(appId) === run) {
        bridgeLaunchesInFlight.delete(appId)
      }
    })
    .catch(() => undefined)
  return run
}

/**
 * Phase 59: the engine registered for this launch (launchBridgeGameBody)
 * must not outlive a launch that did not start. A started launch keeps it
 * until the process monitor's onStopped clears it.
 */
export async function runBridgeLaunch(steamGame: SteamGame): Promise<boolean> {
  let started = false
  try {
    started = await launchBridgeGameBody(steamGame)
    return started
  } finally {
    if (!started) {
      const { clearEngineSelection } =
        await import('backend/engine/engineRegistry')
      clearEngineSelection(steamGame.appId)
    }
  }
}
