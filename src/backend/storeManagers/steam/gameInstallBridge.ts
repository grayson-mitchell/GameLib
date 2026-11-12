/**
 * Bridge-bottle install lifted out of gameInstall (65-11, D-12 step 4).
 * Imports forward only (gameInstall, bridgeInstallState, gameInstallDepot);
 * references SteamGame only via `import type`.
 */
import i18next from 'i18next'
import { GameSettings, InstallArgs } from 'common/types'
import { InstallResult } from 'common/types/game_manager'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import { stopInstallPolling } from './library/installStop'
import * as pollState from './library/pollState'
import * as bottle from './bottle'
import * as bbLifecycle from './bridgeBottleLifecycle'
import * as bridgeBottle from './bridgeBottle'
import { buildFallbackGameSettings } from 'backend/engine/bottlePrimitives'
import type { NonCrossoverEngine } from 'backend/engine/engineTypes'
import { placeShimForGame } from './bridge/shimGenerate'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import {
  writeBridgeScanVerdict,
  setBridgeSteamApiPrescreen,
  setBridgeUserRoute
} from './bridge/bridgeVerdict'
import type SteamGame from './games'
import { ensureBuiltInEngineForInstall } from './gameInstall'
import { prefetchBridgeDrmDownloads } from './gameLaunch'
import {
  persistBridgeDrmSignal,
  reconcileBridgePrescreen,
  resolveBridgeGameInstallRoot,
  markBridgeGameInstalled
} from './bridgeInstallState'
import {
  installDepotDownload,
  installResultForRefusal
} from './gameInstallDepot'

export async function installBridgeGame(
  steamGame: SteamGame,
  args: InstallArgs
): Promise<InstallResult> {
  // quick/261016-u1w (D-A): new installs ALWAYS target this game's OWN
  // per-game bridge bottle directly — never via resolveBridgeBottleName
  // (D-B), which would let an existing legacy-bottle manifest for this
  // appId redirect a fresh install back into the shared bottle.
  const bridgeBottleName = bridgeBottle.bridgeBottleNameFor(steamGame.appId)
  if (!bridgeBottleName) {
    logWarning(
      `SteamGame: installBridgeGame rejected non-numeric appId ${steamGame.appId} — no per-game bottle name`,
      LogPrefix.Steam
    )
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
    return {
      status: 'error',
      error: `Invalid appId: "${steamGame.appId}"`
    }
  }

  // 59-UAT G2: sign-in is checked FIRST, so a refused session returns before
  // any engine download or bottle creation. Phase 54: the one lease now
  // spans provisioning, the download, shim placement and the install-time
  // shared-redist step (acquireAuthenticated may be held across long work;
  // only the idle timer after the last release closes the session).
  const lease = await steamGame.deps.steamUser.acquireAuthenticated({
    reason: 'user-install',
    guidedAction: 'install',
    appName: steamGame.appId,
    installPath: args.path,
    forceWindowsViaBottle: args.steamForceWindowsViaBottle
  })
  if (!lease.ok) {
    return installResultForRefusal(steamGame, lease.reason)
  }
  // Quick 261029-exu: the bridge poller no longer sends 'done' when the
  // manifest lands, so a path that stops after the download (CEG, shim
  // failure, a throw) must clear the "finishing" status itself.
  const clearFinishing = () => {
    steamGame.deps.steamInstallRuntime.polls.markBridgeInstallFinalized(
      steamGame.appId
    )
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
  }
  try {
    // 59-REVIEW WR-11 / CR-01 (install cancel): the download queue aborts an
    // install by id, so provisioning observes that controller's signal. A
    // live controller is reused; a missing or already-aborted one (IN-03) is
    // replaced. A controller this install created stays registered until the
    // depot run registers its own, so no cancel can land in a gap; the
    // finally removes it only if it is still ours.
    let installEngine: NonCrossoverEngine | 'crossover' | null = null
    let signal: AbortSignal | undefined
    let ownsController = false
    const stop = (): InstallResult => {
      sendGameStatusUpdate(steamGame.deps, {
        appName: steamGame.appId,
        runner: 'steam',
        status: 'done'
      })
      return { status: 'abort' }
    }
    try {
      if (
        !bridgeBottle.isBridgeBottleReady(
          steamGame.deps.paths,
          bridgeBottleName
        )
      ) {
        const reused =
          steamGame.deps.aborts.has(steamGame.appId) &&
          steamGame.deps.aborts.getSignal(steamGame.appId)?.aborted === false
        signal = reused
          ? steamGame.deps.aborts.getSignal(steamGame.appId)
          : steamGame.deps.aborts.create(steamGame.appId).signal
        ownsController = !reused
        const provisioned = await provisionBridgeBottleForInstall(
          steamGame,
          bridgeBottleName,
          signal,
          { forceWindowsViaBottle: args.steamForceWindowsViaBottle === true }
        )
        if ('result' in provisioned) return provisioned.result
        installEngine = provisioned.engine
        if (signal?.aborted) {
          if (provisioned.createdHere) {
            bbLifecycle.discardNewBridgeBottle(
              steamGame.deps.paths,
              bridgeBottleName
            )
          }
          return stop()
        }
      }
      const result = await installBridgeGameLeased(
        steamGame,
        args,
        bridgeBottleName,
        installEngine,
        signal
      )
      if (result.status === 'error') clearFinishing()
      return result
    } finally {
      if (
        ownsController &&
        signal &&
        steamGame.deps.aborts.getSignal(steamGame.appId) === signal
      ) {
        steamGame.deps.aborts.delete(steamGame.appId)
      }
    }
  } catch (error) {
    clearFinishing()
    throw error
  } finally {
    lease.release()
  }
}

/**
 * The inline bridge-bottle creation of installBridgeGame (BLOCKER 1), now
 * run under the install lease. Returns the engine that owns the new bottle,
 * or the InstallResult to stop with.
 */
export async function provisionBridgeBottleForInstall(
  steamGame: SteamGame,
  bridgeBottleName: string,
  signal?: AbortSignal,
  opts?: { forceWindowsViaBottle?: boolean }
): Promise<
  | { engine: NonCrossoverEngine | 'crossover'; createdHere: boolean }
  | { result: InstallResult }
> {
  const abortResult = (): { result: InstallResult } => {
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    return { result: { status: 'abort' } }
  }
  // G21 (59-36): the bottle-creation stage the Downloads tab and game page
  // render (59-37 maps the context to its label).
  const sendCreatingBottle = () =>
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'engine-download',
      context: 'creating-bottle'
    })
  logInfo(
    `SteamGame: bridge bottle "${bridgeBottleName}" not yet provisioned for appId ${steamGame.appId} — provisioning inline (BLOCKER 1, no consent dialog needed)`,
    LogPrefix.Steam
  )
  const { decideCreationEngine } = await import('backend/engine/engineDecision')
  const { steamDecisionDeps, steamDecisionServices } =
    await import('./engine/steamEngineDeps')
  const creation = await decideCreationEngine(
    { key: steamGame.appId },
    steamDecisionDeps(steamDecisionServices(steamGame.deps))
  )
  logInfo(
    `SteamGame: bridge bottle creation engine for appId ${steamGame.appId}: ${creation.kind}${creation.kind === 'pinned' ? ` (${creation.reason})` : ''}`,
    LogPrefix.Steam
  )
  if (signal?.aborted) return abortResult()
  let provisionResult: Awaited<
    ReturnType<typeof bbLifecycle.provisionBridgeBottle>
  >
  let engineUsed: NonCrossoverEngine | 'crossover' = 'crossover'
  if (creation.kind === 'pinned') {
    const engine = await ensureBuiltInEngineForInstall(
      steamGame,
      creation.pin,
      signal
    )
    // 59-REVIEW WR-11: an aborted download (quit, or the install cancelled)
    // must stop here; wineboot after quit breaks the sidecar exit contract.
    if ('status' in engine) return { result: engine }
    engineUsed = engine
    if (signal?.aborted) return abortResult()
    sendCreatingBottle()
    provisionResult = await bbLifecycle.provisionBridgeBottle(steamGame.deps, {
      bottleName: bridgeBottleName,
      fallbackEngine: engine,
      signal
    })
  } else {
    sendCreatingBottle()
    provisionResult = await bbLifecycle.provisionBridgeBottle(steamGame.deps, {
      bottleName: bridgeBottleName,
      createTimeoutMs: creation.createTimeoutMs,
      signal
    })
    if (provisionResult.errorCode === bottle.PROVISION_ABORTED) {
      return abortResult()
    }
    if (
      provisionResult.errorCode === bottle.CROSSOVER_CREATE_TIMEOUT ||
      provisionResult.errorCode === bottle.CROSSOVER_MISSING ||
      // 59-REVIEW WR-02 / D-09: a failed create is a broken CrossOver too.
      provisionResult.errorCode === bottle.CROSSOVER_CREATE_FAILED
    ) {
      // D-12 (59-01 create_under_expiry): cxbottle --create can hang or
      // fail under an expired/broken CrossOver, and CrossOver can vanish
      // after the gate. Create the same bottle with the built-in engine.
      logWarning(
        `SteamGame: CrossOver bottle creation for appId ${steamGame.appId} returned ${provisionResult.errorCode} — creating with the built-in engine`,
        LogPrefix.Steam
      )
      const { ENGINE_PINS } = await import('backend/engine/enginePins')
      const engine = await ensureBuiltInEngineForInstall(
        steamGame,
        ENGINE_PINS.current,
        signal
      )
      // 59-REVIEW WR-11: see above.
      if ('status' in engine) return { result: engine }
      engineUsed = engine
      if (signal?.aborted) return abortResult()
      sendCreatingBottle()
      provisionResult = await bbLifecycle.provisionBridgeBottle(
        steamGame.deps,
        {
          bottleName: bridgeBottleName,
          fallbackEngine: engine,
          signal
        }
      )
    }
  }
  if (provisionResult.errorCode === bottle.PROVISION_ABORTED)
    return abortResult()
  if (provisionResult.status !== 'done') {
    logWarning(
      `SteamGame: bridge bottle provisioning failed for appId ${steamGame.appId}: ${provisionResult.error}`,
      LogPrefix.Steam
    )
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    steamGame.deps.sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'bridge-bottle-provision-failed',
      fallbackAvailable: true,
      ...(opts?.forceWindowsViaBottle
        ? { forceWindowsViaBottle: true as const }
        : {})
    })
    return { result: { status: 'done', deferredToSetup: true } }
  }
  // G1 (59-22) / G21 (59-36): the creating-bottle stage precedes both
  // engines and nothing else replaces it, so hand the state back to
  // installing whatever engine was used.
  sendGameStatusUpdate(steamGame.deps, {
    appName: steamGame.appId,
    runner: 'steam',
    status: 'installing'
  })
  return {
    engine: engineUsed,
    createdHere: provisionResult.createdHere === true
  }
}

/**
 * 59-REVIEW CR-02 (D-01/D-04): the settings every install-time wine step
 * uses, from the engine that owns the bottle. null means no usable engine,
 * so the wine steps are skipped (they never fail an install).
 */
export async function resolveInstallEngineSettings(
  steamGame: SteamGame,
  bridgeBottleName: string,
  installEngine: NonCrossoverEngine | 'crossover' | null
): Promise<{ settings: GameSettings } | { skipped: string }> {
  if (installEngine === 'crossover') {
    return {
      settings: bridgeBottle.getBridgeBottleSettings(
        steamGame.deps,
        steamGame.appId
      )
    }
  }
  if (installEngine !== null) {
    return {
      settings: buildFallbackGameSettings(
        steamGame.deps.paths,
        bridgeBottleName,
        installEngine,
        steamGame.deps.config.getSettings()
      )
    }
  }
  // Bottle already existed: the same decision + preparation as a launch.
  const { decideLaunchEngine } = await import('backend/engine/engineDecision')
  const { prepareBottleForEngine } = steamGame.deps.engineRuntime.switcher
  const { isNonCrossover } = await import('backend/engine/engineTypes')
  const { steamDecisionDeps, steamDecisionServices, steamSwitchDeps } =
    await import('./engine/steamEngineDeps')
  const { steamEngineServicesFrom } =
    await import('backend/services/engineServices')
  const decision = await decideLaunchEngine(
    { key: steamGame.appId, bottleName: bridgeBottleName },
    steamDecisionDeps(steamDecisionServices(steamGame.deps))
  )
  if (decision.kind === 'unavailable') {
    return { skipped: `engine unavailable: ${decision.detail}` }
  }
  if (decision.needsDownload && decision.pin) {
    const engine = await ensureBuiltInEngineForInstall(steamGame, decision.pin)
    if ('status' in engine) return { skipped: 'engine download failed' }
  }
  const sel = decision.selection
  const prep = await prepareBottleForEngine({
    key: steamGame.appId,
    bottleName: bridgeBottleName,
    next: sel,
    crossoverHealthy: decision.preflight?.kind === 'healthy',
    deps: {
      ...steamSwitchDeps(steamEngineServicesFrom(steamGame.deps)),
      ensurePinEngine: steamGame.restorePinEngine
    }
  })
  if (!prep.ok && prep.reason !== 'dxvk-failed') {
    return { skipped: `${prep.reason}: ${prep.detail}` }
  }
  if (!prep.ok && sel.kind === 'crossover') {
    // CR-03: no redists on CrossOver over DXVK-macOS DLLs.
    return { skipped: `dxvk restore failed: ${prep.detail}` }
  }
  if (isNonCrossover(sel)) {
    return {
      settings: buildFallbackGameSettings(
        steamGame.deps.paths,
        bridgeBottleName,
        sel,
        steamGame.deps.config.getSettings()
      )
    }
  }
  return {
    settings: bridgeBottle.getBridgeBottleSettings(
      steamGame.deps,
      steamGame.appId
    )
  }
}

/**
 * Phase 54 Rule I: the single owner of a shared-redist run that may log on.
 * Only a user-started depot transfer reaches it (the install below, and the
 * Phase 74 bridge update follow-ups); Play passes no allowLogon.
 */
export function installSharedRedistsWithLogon(
  steamGame: SteamGame,
  settings: GameSettings
): Promise<void> {
  return steamGame.deps.bridgeRuntime.sharedRedist.installSteamBridgeSharedRedists(
    steamGame.deps,
    steamGame.appId,
    settings,
    undefined,
    { allowLogon: true }
  )
}

/** The lease-held part of installBridgeGame: download, shim, redists. */
export async function installBridgeGameLeased(
  steamGame: SteamGame,
  args: InstallArgs,
  bridgeBottleName: string,
  installEngine: NonCrossoverEngine | 'crossover' | null,
  signal?: AbortSignal
): Promise<InstallResult> {
  // 59-REVIEW CR-01: synchronous with the depot run's controller
  // registration, so a cancel cannot fall in between.
  if (signal?.aborted) {
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    return { status: 'abort' }
  }
  // a new install must show finishing again (quick 261031-ihs)
  steamGame.deps.steamInstallRuntime.polls.clearBridgeInstallFinalized(
    steamGame.appId
  )
  const targetSteamappsDir = bottle.getBottleSteamappsDir(
    steamGame.deps.paths,
    bridgeBottleName
  )
  const downloadResult = await installDepotDownload(steamGame, args, {
    targetSteamappsDirOverride: targetSteamappsDir,
    os: 'windows',
    pollerSource: 'bridge',
    signal
  })

  // A refusal wrapped by the go-offline step, or (quick 261027-tot) a
  // Steam client that is not installed / never launched, reports `done`
  // with deferredToSetup: a dialog owns the next step, nothing was
  // downloaded, and it is not a bridge failure.
  if (downloadResult.deferredToSetup) return downloadResult

  // 59-REVIEW CR-02: a user cancel is not a bridge failure; marking it would
  // route the reinstall to bottled Steam.
  if (downloadResult.status === 'abort') return downloadResult

  if (downloadResult.status !== 'done') {
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
    return downloadResult
  }

  // R3: place the shim automatically — no manual copy step. Resolves the
  // real installed exe path via resolveBridgeLaunchExe (finding #2)
  // rather than guessing/joining an unverified name.
  const exePath = await resolveBridgeLaunchExe(steamGame.deps, steamGame.appId)
  if (!exePath) {
    logWarning(
      `SteamGame: installBridgeGame could not resolve a Windows launch executable for appId ${steamGame.appId} — shim not placed`,
      LogPrefix.Steam
    )
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
    steamGame.deps.sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'launch-exe-not-resolved',
      fallbackAvailable: true,
      ...(args.steamForceWindowsViaBottle === true
        ? { forceWindowsViaBottle: true as const }
        : {})
    })
    return {
      status: 'error',
      error: `Could not resolve a Windows launch executable for appId ${steamGame.appId}`
    }
  }

  const shimResult = await placeShimForGame(
    steamGame.deps,
    steamGame.deps.paths,
    steamGame.appId,
    exePath,
    {
      bottleName: bridgeBottleName,
      gameInstallRoot:
        resolveBridgeGameInstallRoot(steamGame, exePath, bridgeBottleName) ??
        undefined
    }
  )
  // Phase 51 Plan 07 (fix during integration, Rule 1): placeShimForGame
  // returns typed statuses rather than throwing. 'no-steam-api' is
  // deliberately NOT a failure here -- nothing needed placing. Amended
  // 2026-10-23 (quick 261023-oq7, user: "Place shim anyway"): a coverage
  // miss is 'placed-miss' -- the shim WAS placed -- and falls through to
  // the success path below (verdict persisted, install completes). It is
  // no longer a failure here.
  if (shimResult.status === 'error' || shimResult.status === 'shim-not-built') {
    const shimError =
      shimResult.status === 'shim-not-built'
        ? 'Bridge shim has not been built yet (packaging step pending)'
        : shimResult.error
    logWarning(
      `SteamGame: installBridgeGame shim placement failed for appId ${steamGame.appId}: ${shimError}`,
      LogPrefix.Steam
    )

    // Phase 51 Plan 09 (D-51-05/D-51-11), Task 3: a win64 'shim-not-built'
    // (no 64-bit shim was ever built to try) is a dead end for the bits
    // already downloaded into the per-game bridge bottle -- re-download
    // through the proven Phase 17 bottled path is the chosen fallback
    // (D-51-05: move, not re-download, was rejected), so the per-game
    // bottle is deleted rather than left holding orphaned bits a later
    // retry would never reuse. Amended 2026-10-23 (quick 261023-oq7):
    // this applies to win64-no-shim ONLY; an import-scan miss no longer
    // takes this path. A plain 'shim-not-built' with no x64 arch
    // (packaging step pending) and a bare 'error' keep the pre-51-09
    // behavior below unchanged.
    const isWin64NoShim =
      shimResult.status === 'shim-not-built' && shimResult.arch === 'x64'
    if (isWin64NoShim) {
      const missingSymbols = ['steam_api64.dll']
      // The forced "Try the bridge anyway" attempt (D-51-11) is spent --
      // clearing userRoute lets a later install() fall through to its
      // ordinary route instead of re-forcing the bridge into the same
      // dead end.
      setBridgeUserRoute(steamGame.deps, steamGame.appId, undefined)
      // 51-REVIEW WR-07: persist the arch so the resolver's win64-no-shim
      // row short-circuits the next install(). Without it the session-only
      // circuit breaker is the sole memory of this dead end, and every new
      // session re-downloads the full game into a bridge bottle only to
      // delete it again. The row is gated on win64ShimPresent, so a later
      // build that bundles steam_api64.dll is not held back by this.
      setBridgeSteamApiPrescreen(steamGame.deps, steamGame.appId, 'x64')
      stopInstallPolling(steamGame.deps, steamGame.appId)
      const removeResult = await bbLifecycle.removePerGameBridgeBottle(
        steamGame.deps,
        steamGame.appId
      )
      if (removeResult.status === 'error') {
        logWarning(
          `SteamGame: installBridgeGame could not remove the per-game bridge bottle for appId ${steamGame.appId} after a win64-no-shim: ${removeResult.error}`,
          LogPrefix.Steam
        )
      }
      steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
        steamGame.appId
      )
      steamGame.deps.sendFrontendMessage('steamBridgeSetupRequired', {
        appName: steamGame.appId,
        reason: 'win64-no-shim',
        missingSymbols,
        fallbackAvailable: true,
        ...(args.steamForceWindowsViaBottle === true
          ? { forceWindowsViaBottle: true as const }
          : {})
      })
      return { status: 'error', error: shimError }
    }

    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
    return { status: 'error', error: shimError }
  }

  // Phase 51 Plan 09 (D-51-06/D-51-07), Task 3: persist the scan verdict
  // produced by THIS placement for every status that carries one --
  // 'placed' and 'no-steam-api' both do, 'already-placed' (a byte-
  // identical no-op) does not and leaves whatever was already persisted
  // untouched, mirroring launchBridgeGame()'s identical truthy check.
  // 'placed-miss' (quick 261023-oq7) also carries one: the miss verdict is
  // persisted so the resolver keeps routing the title with its symbols. The
  // user's explicit 'bridge' choice (D-51-11) is NOT cleared here -- that
  // clear existed so a forced bridge would not be re-forced into a failing
  // miss, and a miss is no longer a failure.
  if (shimResult.verdict) {
    writeBridgeScanVerdict(steamGame.deps, steamGame.appId, shimResult.verdict)
  }

  // Quick 261024-br4: Steam CEG DRM (XCOM 200510's silent ~30s exit). A
  // CEG exe asks the Windows Steam client for a per-user build key, and a
  // bridge bottle has no Windows Steam client -- so it can never run here.
  // DRM is the one justified route into bottled Steam (a narrow fallback).
  // Mirrors the win64-no-shim dead end above: the downloaded bits are
  // orphaned (D-51-05: the fallback re-downloads, nothing is moved), so
  // the per-game bridge bottle is removed. userRoute is NOT cleared: by
  // construction it is not 'bridge' here, and a forced 'bridge' proceeds.
  const cegMarkers = persistBridgeDrmSignal(
    steamGame,
    shimResult.drm,
    'installBridgeGame'
  )
  if (cegMarkers) {
    logWarning(
      `SteamGame: installBridgeGame found Steam CEG DRM in the exe for appId ${steamGame.appId} (${cegMarkers.join(', ')}) -- CEG needs the Windows Steam client, which a bridge bottle does not have; stopping the bridge install`,
      LogPrefix.Steam
    )
    stopInstallPolling(steamGame.deps, steamGame.appId)
    const removeResult = await bbLifecycle.removePerGameBridgeBottle(
      steamGame.deps,
      steamGame.appId
    )
    if (removeResult.status === 'error') {
      logWarning(
        `SteamGame: installBridgeGame could not remove the per-game bridge bottle for appId ${steamGame.appId} after detecting Steam CEG DRM: ${removeResult.error}`,
        LogPrefix.Steam
      )
    }
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
    steamGame.deps.sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'drm-wrapped',
      fallbackAvailable: true,
      ...(args.steamForceWindowsViaBottle === true
        ? { forceWindowsViaBottle: true as const }
        : {})
    })
    return {
      status: 'error',
      error: `Steam CEG DRM detected (${cegMarkers.join(', ')}): this game needs the Windows Steam client`
    }
  }

  if (shimResult.status === 'placed-miss') {
    logWarning(
      `SteamGame: installBridgeGame shim coverage miss for appId ${steamGame.appId}: ${shimResult.verdict.missingSymbols.join(', ')} -- shim placed anyway; a static-import miss is expected to fail at load with a Windows entry-point error`,
      LogPrefix.Steam
    )
  }
  reconcileBridgePrescreen(steamGame, shimResult)

  // 24-13 (D-UAT-24-05 wiring, was Rule-2 deviation during Task 3): the
  // `pollerSource: 'bridge'` passed to installDepotDownload above starts a
  // poller that watches the BRIDGE bottle's OWN steamapps root
  // (library.ts's AcfSource now includes 'bridge', 24-12's
  // getBridgeBottleSteamappsRoot()) — previously this was hardcoded to
  // `'bottle'`, which watches the unrelated Phase 17 GameLibSteam bottle
  // and NEVER observes this appId's manifest, so the install would time
  // out / never be reflected. The poller reading the correct bottle is
  // now a genuine (if redundant) completion signal, not dead weight — but
  // the REAL completion signal for the bridge path remains this
  // synchronous flip below: depot download AND shim placement have
  // already both succeeded by this point, so is_installed is set directly
  // (mirrors library.ts's pollInstallOnce() 'installed' branch shape)
  // rather than relying solely on the poller.
  const installRoot = resolveBridgeGameInstallRoot(
    steamGame,
    exePath,
    bridgeBottleName
  )
  if (installRoot) {
    markBridgeGameInstalled(steamGame, installRoot)
  }

  // D-UAT-24-03 cascade (a): a successful (re)install un-poisons the
  // session so a subsequent isBridgeEligible() check (install OR launch)
  // for this appId routes back to the bridge instead of staying stuck on
  // an earlier recoverable failure.
  steamGame.deps.steamSession.gameSession.clearBridgeFailedThisSession(
    steamGame.appId
  )

  // Plan 05 decision: the Steamworks shared redists download under THIS
  // install's logon, so Play never needs one. Never fails the install.
  // The download queue suppresses Steam's own 'done', and on the bridge the
  // ACF poller leaves completion to this method (quick 261029-exu) and stays
  // silent once this method has marked the install finalized (261031-ihs), so the
  // final update below is the only status that clears a lingering 'redist'
  // or 'drm-setup' (56-16 Gap 3) and ends the "finishing" state.
  const sendFinishing = () =>
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'installing',
      context: pollState.STEAM_BRIDGE_FINISHING_CONTEXT
    })
  sendFinishing()
  try {
    // 59-REVIEW CR-02, D-01/D-04: the redists run on the engine that owns
    // the bottle, never stock CrossOver on a built-in-engine bottle.
    const redistEngine = await resolveInstallEngineSettings(
      steamGame,
      bridgeBottleName,
      installEngine
    ).catch((error: unknown) => ({ skipped: String(error) }))
    if ('skipped' in redistEngine) {
      logWarning(
        `SteamGame: appId ${steamGame.appId} install-time shared redists skipped: no usable engine (${redistEngine.skipped})`,
        LogPrefix.Steam
      )
    } else {
      await installSharedRedistsWithLogon(
        steamGame,
        redistEngine.settings
      ).catch((error: unknown) => {
        logWarning(
          `SteamGame: install-time shared redist step failed for appId ${steamGame.appId}: ${String(error)}`,
          LogPrefix.Steam
        )
      })
    }
    // Quick 261029-e2t: fetch DRM mode's runner and Valve client now, so
    // the first Play only stages the bottle. Never fails the install.
    sendFinishing()
    await prefetchBridgeDrmDownloads(
      steamGame,
      exePath,
      bridgeBottleName
    ).catch((error: unknown) => {
      logWarning(
        `SteamGame: install-time DRM prefetch failed for appId ${steamGame.appId}: ${String(error)}`,
        LogPrefix.Steam
      )
    })
  } finally {
    steamGame.deps.steamInstallRuntime.polls.markBridgeInstallFinalized(
      steamGame.appId
    )
    sendGameStatusUpdate(steamGame.deps, {
      appName: steamGame.appId,
      runner: 'steam',
      status: 'done'
    })
    // GAME-02's one completion toast; the bridge poller skips it.
    notify(steamGame.deps, {
      title: steamGame.getGameInfo().title,
      body: i18next.t('notify.install.finished', 'Installation Finished')
    })
  }

  return { status: 'done' }
}
