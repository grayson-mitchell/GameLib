/**
 * Engine-dialog and DRM-mode engine preflight helpers lifted out of
 * gameLaunch.ts to keep it under the steam line ceiling (78-05). Imports forward
 * only (gameLaunch and gameBridgeLaunch import from here).
 */
import i18next from 'i18next'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import type { CrossoverPreflight } from 'backend/engine/engineDecision'
import type { EngineSelection } from 'backend/engine/engineTypes'
import type SteamGame from './games'

/**
 * Phase 59: notify plus an in-app dialog, copied from
 * maybeNotifyDrmModeFailed's surface. Never marks the bridge failed and
 * never sends steamBridgeSetupRequired (no path reroutes to bottled Steam).
 */
export function showEngineDialog(
  steamGame: SteamGame,
  title: string,
  body: string,
  tag: string
): void {
  notify(steamGame.deps, { title, body })
  steamGame.deps.appState.raiseMainWindow()
  const ackId = steamGame.deps.dialogs.displayAcks.newId()
  const appId = steamGame.appId
  steamGame.deps.dialogs.displayAcks.track(ackId, (result) => {
    logInfo(
      result.confirmed
        ? `[engine-notice] appId=${appId} tag=${tag} display=confirmed elapsedMs=${result.elapsedMs}`
        : `[engine-notice] appId=${appId} tag=${tag} display=unconfirmed timeout=${result.timeoutMs}`,
      LogPrefix.Steam
    )
  })
  const sent = showDialogBoxModalAuto(steamGame.deps, {
    title,
    message: body,
    type: 'MESSAGE',
    ackId
  })
  logInfo(
    `[engine-notice] appId=${steamGame.appId} tag=${tag} dispatched=in-app-dialog+notify dialog-frame-sent=${sent} display=pending`,
    LogPrefix.Steam
  )
}

/**
 * Phase 76 (audit S9, D-02/D-04): the TCP path's offline up-front refusal for a
 * DRM-mode launch. DRM mode is CrossOver-only, so the override is hard-coded to
 * 'crossover' (the per-game override is ineffective here). Runs before
 * preflightCrossover; only refuses, never selects or switches anything.
 */
export async function drmOfflinePrecheck(
  steamGame: SteamGame,
  bottleName: string,
  connectivity: { offline: boolean }
): Promise<{ ok: true } | { ok: false }> {
  if (!connectivity.offline) return { ok: true }
  const sw = await import('backend/engine/engineSwitch')
  const { isCrossoverMissing } = await import('backend/engine/engineDecision')
  const { steamDecisionDeps, steamDecisionServices } =
    await import('./engine/steamEngineDeps')
  const { isPinnedEngineInstalled } = steamGame.deps.engineRuntime.fallback
  const switchCtx = sw.switchContextFrom(steamGame.deps)
  const { ENGINE_PINS } = await import('backend/engine/enginePins')
  const { offlineLaunchCertainlyBlocked } =
    await import('backend/engine/offlineRefusal')
  const refusal = offlineLaunchCertainlyBlocked({
    offline: connectivity.offline,
    override: 'crossover',
    crossoverMissing: await isCrossoverMissing(
      steamDecisionDeps(steamDecisionServices(steamGame.deps))
    ),
    markerKind: sw.readBottleEngineMarkerKind(switchCtx, bottleName),
    currentPinInstalled: isPinnedEngineInstalled(ENGINE_PINS.current),
    restoreNeedsAbsentPin: sw.restoreNeedsAbsentPin(switchCtx, bottleName)
  })
  if (!refusal.blocked) return { ok: true }
  const why =
    refusal.arm === 'crossover-missing'
      ? `offline, CrossOver is missing and the built-in engine ${ENGINE_PINS.current.id} is not installed`
      : 'offline, and returning this bottle to CrossOver needs an engine pin that is not on disk'
  logWarning(
    `SteamGame: appId ${steamGame.appId} launch blocked before pre-flight: ${why} (${refusal.arm})`,
    LogPrefix.Steam
  )
  showEngineDialog(
    steamGame,
    steamGame.getGameInfo().title,
    i18next.t(
      'gamelib:steam.engine.downloadFailed',
      "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
      { reason: 'offline' }
    ),
    'engine-download-failed'
  )
  return { ok: false }
}

/**
 * Phase 76 (audit S9, D-01/D-03/D-05/D-06): after a healthy pre-flight, return the
 * bottle to CrossOver through the marker-based switch before a DRM-mode launch.
 * No decideLaunchEngine, no registry selection, no custom ledger (the switch's own
 * busy/game-running refusals are the guard). Silent on success; every refusal shows
 * one dialog and the caller sends the terminal done.
 */
export async function prepareDrmBottleForCrossover(
  steamGame: SteamGame,
  bottleName: string,
  pre: Extract<CrossoverPreflight, { kind: 'healthy' }>
): Promise<{ ok: true } | { ok: false }> {
  const { steamSwitchDeps } = await import('./engine/steamEngineDeps')
  const { steamEngineServicesFrom } =
    await import('backend/services/engineServices')
  const next: EngineSelection = {
    kind: 'crossover',
    reason: 'cx-healthy',
    crossoverBuild: pre.build,
    binDir: pre.binDir
  }
  const prep =
    await steamGame.deps.engineRuntime.switcher.prepareBottleForEngine({
      key: steamGame.appId,
      bottleName,
      next,
      deps: {
        ...steamSwitchDeps(steamEngineServicesFrom(steamGame.deps)),
        ensurePinEngine: steamGame.restorePinEngine
      },
      onSwitching: () =>
        sendGameStatusUpdate(steamGame.deps, {
          appName: steamGame.appId,
          runner: 'steam',
          status: 'engine-download',
          context: 'setting-up'
        })
    })
  if (prep.ok) return { ok: true }
  logWarning(
    `SteamGame: appId ${steamGame.appId} DRM launch cannot switch the bottle back to CrossOver (${prep.reason}: ${prep.detail}); not launching`,
    LogPrefix.Steam
  )
  const title = steamGame.getGameInfo().title
  let body: string
  let tag: string
  if (prep.reason === 'dxvk-failed') {
    body = i18next.t(
      'gamelib:steam.engine.restoreFailed',
      "GameLib couldn't finish switching {{title}} back to CrossOver, so it did not start. Check your connection and try again; GameLib retries the switch on the next launch.",
      { title }
    )
    tag = 'engine-restore-failed'
  } else if (prep.reason === 'shared-bottle' || prep.reason === 'bottle-busy') {
    body = i18next.t(
      'gamelib:steam.engine.sharedBottle',
      "{{title}} is installed in GameLib's shared bridge bottle, where changing engines could stop other games. It can only run there on CrossOver. Uninstall and reinstall it to give it its own bottle.",
      { title }
    )
    tag = 'engine-shared-bottle'
  } else if (prep.reason === 'marker-newer') {
    body = i18next.t(
      'gamelib:steam.engine.markerNewer',
      "{{title}}'s game files were last set up by a newer version of GameLib, so this version won't change its engine. Launch it with the engine it already uses, or update GameLib.",
      { title }
    )
    tag = 'engine-marker-newer'
  } else {
    body = i18next.t(
      'gamelib:steam.engine.drmSwitchRefused',
      "{{title}} could not start in Steam DRM mode because GameLib couldn't switch its game files back to CrossOver ({{reason}}). Close any game running from this bottle and try again.",
      { title, reason: prep.reason }
    )
    tag = 'engine-drm-switch-refused'
  }
  showEngineDialog(steamGame, title, body, tag)
  return { ok: false }
}
