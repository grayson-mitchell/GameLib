/**
 * Core launch cluster lifted out of SteamGame (62-07, D-06 mechanical
 * lift: this -> steamGame).
 * Public SteamGame entry points keep a delegating stub on the class;
 * internal helpers are called directly by sibling lifted modules, importing
 * forward only (gameEligibility/gameLaunchOverlay -> gameInstall ->
 * gameLaunch -> gameBridgeLaunch). A call a test spies on stays a
 * `steamGame.X()` call (quick-261107-an2).
 */
import i18next from 'i18next'
import { app, shell } from 'backend/platform'
import { existsSync } from 'graceful-fs'
import { join } from 'node:path'
import { GameSettings, LaunchOption } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { newDialogAckId, trackDialogDisplay } from 'backend/dialog/displayAck'
import { sendGameStatusUpdate } from 'backend/utils'
import type LogWriter from 'backend/logger/log_writer'
import { isMac, isWindows } from 'backend/constants/environment'
import { sendFrontendMessage } from '../../ipc'
import type { SteamBridgeVerdict } from './stores'
import {
  probeMacSteamPid,
  readAcfSnapshot,
  readPendingAdoption,
  clearPendingAdoption,
  pendingAdoptionStoreFrom,
  decidePlayAdoption,
  restartMacSteamForAdoption
} from './macSteamAdoption'
import { isBottleReady, getSteamBottleSettings } from './bottle'
import { killBridgeBottleWineServer } from './bridgeBottleLifecycle'
import {
  getBridgeBottleSettings,
  findBridgeInstallBottle
} from './bridgeBottle'
import { tellBottledSteamToLaunch } from './bottledSteam'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
// Phase 60: Steam overlay in bridged games (macOS).
import { prepareOverlayTokens } from './bridge/overlay/overlayLaunch'
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import type { CrossoverPreflight } from 'backend/engine/engineDecision'
import type { EngineSelection } from 'backend/engine/engineTypes'
import { noteSteamAuthTrigger } from './authTrigger'
import { detectLaunchDrmWrapper } from './bridge/drm/drmScanExe'
import { detectSteamDrmInPe } from './bridge/peScan'
import {
  prefetchDrmDownloads,
  type DrmLaunchReady
} from './bridge/drm/drmLaunchSetup'
import {
  resolveBridgeMode,
  formatDrmNoticeLine,
  formatBridgeDrmAnchor,
  drmStepError,
  type DrmStep
} from './bridge/drm/steamclientLayerMode'
import { stopBridgeHelper } from './bridge/helperRegistry'
import {
  markBridgeLimitedNoticeShown,
  setBridgeIdentityFallback,
  writeBridgeModeVerdict
} from './bridge/bridgeVerdict'
import {
  builtOverlayShimPath,
  appFolder,
  userHome
} from 'backend/constants/paths'
import { bridgeFailedThisSession } from './gameSessionState'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import {
  MAC_STEAM_CLIENT_SUBPATH,
  drmBottleWinPath,
  prepareDrmTraceFile,
  drmModeNoticeShownThisSession,
  engineLabelForLog,
  drmStepNoticeText
} from './gameDrmLaunch'
import type SteamGame from './games'
import {
  clearStaleBridgeVerdict,
  ensurePlatformsCaptured,
  isBottleEligible
} from './gameEligibility'
import { ensureBuiltInEngineForInstall } from './gameInstall'
import { launchBridgeGame } from './gameBridgeLaunchGate'
import { fireBridgeWineLaunch } from './gameBridgeWineLaunch'
import {
  notifyOverlaySetupFailed,
  overlayInputArg,
  overlayProbeArg,
  resolveLaunchOverlay
} from './gameLaunchOverlay'

export async function launch(
  steamGame: SteamGame,
  _logWriter: LogWriter,
  _launchArguments?: LaunchOption,
  _args?: string[],
  _skipVersionCheck?: boolean
): Promise<boolean> {
  // quick-260817-d61: Play is a deliberate Steam action — unlock the
  // keyring deferral gate before ensurePlatformsCaptured() or anything
  // else in this method runs.
  noteSteamAuthTrigger('user-play')
  // D-51-07: same auto-clear as install()'s top, before any routing
  // decision below reads the persisted verdict.
  clearStaleBridgeVerdict(steamGame)
  await ensurePlatformsCaptured(steamGame)
  if (isBottleEligible(steamGame)) {
    // quick/261024-gvu: single-flight. While a bottle/bridge monitor for
    // this appId is live (still starting, or already running) a second Play
    // must not queue another `-applaunch` / wine exe — the monitor keeps
    // owning the launching/playing status.
    const { getBottleProcessMonitorPhase } =
      await import('./bottleProcessMonitor')
    const livePhase = getBottleProcessMonitorPhase(steamGame.appId)
    if (livePhase) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} launch already ${livePhase} — not dispatching another`,
        LogPrefix.Steam
      )
      return true
    }
    // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility — launch()
    // must dispatch to wherever this install's bits actually live, never
    // to where a NEW install would be routed (isBridgeEligible() /
    // bridgeRoute() answers the latter question, which a never-scanned
    // title now defaults to 'bridge' on (rule 11, pending-scan) even
    // though nothing has been installed there yet). findBridgeInstallBottle
    // is non-null only when a bridge bottle actually holds this appId's
    // manifest — the FIRST check inside this block, mirroring install()'s
    // own bridge sub-branch above (BLOCKER 1 rationale: the bridge has its
    // own readiness gate, ensureBridgeHelperReady(), independent of the
    // unrelated Phase 17 GameLibSteam bottle's own state). The session
    // circuit breaker (finding #3) is orthogonal to location — a bridge
    // launch that already failed once this session must keep falling back
    // to the bottled flow even though the bits are still sitting in the
    // bridge bottle from the earlier attempt, so it is checked here too,
    // not folded into findBridgeInstallBottle itself.
    if (
      findBridgeInstallBottle(steamGame.appId) !== null &&
      !bridgeFailedThisSession.has(steamGame.appId)
    ) {
      return launchBridgeGame(steamGame)
    }

    if (!isBottleReady()) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of launching`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamBottleSetupRequired', {
        appName: steamGame.appId
      })
      return false
    }

    logInfo(
      `SteamGame: launching appId ${steamGame.appId} via the bottled Steam client`,
      LogPrefix.Steam
    )
    // Phase 59: bottled Steam stays CrossOver-only (no built-in engine).
    // A clear message beats a hang behind CrossOver's own dialog.
    const { preflightCrossover } = await import('backend/engine/engineDecision')
    const { steamDecisionDeps } = await import('./engine/steamEngineDeps')
    const pre = await preflightCrossover(
      getSteamBottleSettings()?.wineCrossoverBottle ??
        DEFAULT_STEAM_BOTTLE_NAME,
      steamDecisionDeps({ spawnAsync: steamGame.deps.spawnAsync })
    )
    if (pre.kind !== 'healthy') {
      notifyCrossoverRequired(steamGame, 'bottled', pre)
      sendLaunchDone(steamGame)
      return false
    }
    const result = await tellBottledSteamToLaunch(
      steamGame.deps,
      steamGame.appId
    )
    return result.status === 'done'
  }

  // On Windows, `rungameid` makes Steam show its "Starting game / LAUNCHING —
  // Open Steam" window on every Play, even with `steam.exe -silent`.
  // `steam://launch/<id>/Dialog` (Playnite's form) does not show it. The
  // operator measured this on 2026-10-29 with WazHack 264160 (quick
  // 261029-i1n). macOS and Linux stay on `rungameid` because the window has
  // not been seen there.
  const url = buildSteamProtocolUrl(
    isWindows ? 'launch' : 'rungameid',
    steamGame.appId
  )
  if (!url) {
    // Non-numeric appId — rejection already logged by buildSteamProtocolUrl
    return false
  }

  logInfo(
    `SteamGame: launching appId ${steamGame.appId} via ${url}`,
    LogPrefix.Steam
  )
  // activate:false asks the opener not to bring Steam forward. Its purpose is
  // macOS Console mode, where activating Steam pulls GameLib out of its
  // fullscreen Space and the desktop Space flashes before the game appears.
  // The option is currently dropped before it reaches the Rust opener (todo
  // 2026-10-29-open-external-drops-activate-false). It is not what controls
  // Windows Steam's "Starting game" window: the `rungameid` verb causes that,
  // which is why Windows uses the `launch` verb above. No effect on Linux.
  // Quick 261029-ji2: a GameLib-downloaded Mac install that the still-running
  // Steam never adopted makes rungameid open the install dialog, so Steam is
  // restarted once first. Only installs with a pending-adoption record (see
  // runNativeDepotDownload) ever probe or restart anything.
  if (isMac) {
    const record = readPendingAdoption(
      steamGame.appId,
      pendingAdoptionStoreFrom(steamGame.deps)
    )
    if (record) {
      const currentPid = await probeMacSteamPid().catch(() => null)
      const decision = decidePlayAdoption({
        record,
        currentPid,
        currentAcf: readAcfSnapshot(record.manifestPath)
      })
      if (decision === 'clear-and-launch') {
        clearPendingAdoption(
          steamGame.appId,
          pendingAdoptionStoreFrom(steamGame.deps)
        )
      } else if (decision === 'restart') {
        const outcome = await restartMacSteamForAdoption(steamGame.appId, {
          launchRunGameId: () => shell.openExternal(url, { activate: false })
        })
        if (outcome.kind === 'relaunched') {
          clearPendingAdoption(
            steamGame.appId,
            pendingAdoptionStoreFrom(steamGame.deps)
          )
          return true
        }
        // Refuse rather than fall back to a plain launch: an unadopted
        // install in a running Steam opens the install dialog (the failure
        // being removed), and quitting would end the user's game session.
        // Steam is never killed; the record stays pending.
        const game = steamGame.getGameInfo().title
        const body =
          outcome.kind === 'game-running'
            ? i18next.t(
                'gamelib:steam.adoptRestart.gameRunning',
                'Quit the game running in Steam, then press Play to finish setting up {{game}}.',
                { game }
              )
            : outcome.kind === 'steam-busy'
              ? i18next.t(
                  'gamelib:steam.adoptRestart.busy',
                  'Steam is busy with a GameLib sign-in. Try Play again in a moment.'
                )
              : i18next.t(
                  'gamelib:steam.adoptRestart.quitTimeout',
                  "Steam didn't quit, so {{game}} couldn't be set up. Quit Steam and press Play again.",
                  { game }
                )
        logWarning(
          `SteamGame: Play for ${steamGame.appId} not launched (${outcome.kind}); pending adoption kept`,
          LogPrefix.Steam
        )
        notify({ title: game, body })
        return false
      }
    }
  }
  await shell.openExternal(url, { activate: false })
  return true
}

/**
 * D-51-02/D-51-04 (Phase 51 Plan 12): the one-time "limited Steam
 * features" notice plus the every-launch `[bridge-notice]` log line.
 * Called from `launchBridgeGame()` once the helper has reported ready or
 * fallback-identity, and before `runWineCommand` fires -- never for the
 * no-steam-api branch, which spawns no helper and has nothing to stub.
 *
 * `setBridgeIdentityFallback` is persisted on EVERY call (true or false)
 * so a game that regains real-AppID init after a prior fallback clears
 * the stale flag -- the log line and `notify()` only fire when there is
 * something limited to report (stubbed interfaces or an identity
 * fallback); a clean verdict with no fallback logs nothing and never
 * calls `notify()`. `notify()` itself is gated separately, by
 * `verdict.limitedNoticeShown` (D-51-02: shown once per game, logged
 * every time) -- `markBridgeLimitedNoticeShown` persists that flag the
 * first time it fires.
 */
export function maybeNotifyBridgeLimited(
  steamGame: SteamGame,
  verdict: SteamBridgeVerdict | undefined,
  identityFallback: boolean
): void {
  setBridgeIdentityFallback(steamGame.deps, steamGame.appId, identityFallback)

  const stubbedInterfaces = verdict?.scan?.stubbedInterfaces ?? []
  const isLimited = identityFallback || stubbedInterfaces.length > 0
  if (!isLimited) {
    return
  }

  const reason = identityFallback
    ? 'identity-fallback'
    : `stubbed:${stubbedInterfaces.join(',')}`
  logInfo(
    `[bridge-notice] appId=${steamGame.appId} reason=${reason}`,
    LogPrefix.Steam
  )

  if (verdict?.limitedNoticeShown === true) {
    return
  }

  const bodyParts = [
    i18next.t(
      'gamelib:steam.bridge.limited.body',
      'Achievements and cloud saves do not sync for this game via the bridge.'
    )
  ]
  if (identityFallback) {
    bodyParts.push(
      i18next.t(
        'gamelib:steam.bridge.limited.identityFallback',
        'Steam would not run this game under its own ID, so it runs with your Steam identity only.'
      )
    )
  }

  notify({
    title: i18next.t(
      'gamelib:steam.bridge.limited.title',
      'Some Steam features are limited'
    ),
    body: bodyParts.join(' ')
  })
  markBridgeLimitedNoticeShown(steamGame.deps, steamGame.appId)
}

/**
 * D-13 (56-12): a steamclient-layer DRM mode step failed. Logs the
 * [bridge-notice] line on every attempt, and shows the dialog plus notify
 * once per (appId, step) per session, naming the failed step and its cause.
 * Does not launch, and has no fallback to the Phase 52 forwarder or to
 * bottled Steam. It never calls markBridgeFailedThisSession (RESEARCH A9 /
 * F10: that would send the next Play to bottled Steam) and never sends
 * steamBridgeSetupRequired, whose dialog offers the bottled fallback. The
 * cause in the body is the 56-04-normalised readable form; the log line
 * carries the tokenised form.
 */
export function maybeNotifyDrmModeFailed(
  steamGame: SteamGame,
  step: DrmStep,
  cause: string
): void {
  logInfo(formatDrmNoticeLine(steamGame.appId, step, cause), LogPrefix.Steam)
  const key = `${steamGame.appId}|${step}`
  if (drmModeNoticeShownThisSession.has(key)) {
    return
  }
  drmModeNoticeShownThisSession.add(key)
  const title = i18next.t(
    'gamelib:steam.bridge.drm.title',
    'This game could not start'
  )
  const body =
    drmStepNoticeText(step) +
    ' ' +
    i18next.t('gamelib:steam.bridge.drm.detail', 'Details: {{cause}}', {
      cause
    })
  notify({ title, body })
  // The failure usually lands while the game is in front. Bring GameLib up first, or the
  // dialog renders into a window nobody can see (display=unconfirmed in the 56-16 gate).
  app.raiseMainWindow()
  const ackId = newDialogAckId()
  const appId = steamGame.appId
  trackDialogDisplay(ackId, (result) => {
    logInfo(
      result.confirmed
        ? `[bridge-notice] appId=${appId} display=confirmed elapsedMs=${result.elapsedMs}`
        : `[bridge-notice] appId=${appId} display=unconfirmed timeout=${result.timeoutMs}`,
      LogPrefix.Steam
    )
  })
  const dialogFrameSent = showDialogBoxModalAuto({
    title,
    message: body,
    type: 'MESSAGE',
    ackId
  })
  logInfo(
    `[bridge-notice] appId=${steamGame.appId} dispatched=in-app-dialog+notify dialog-frame-sent=${dialogFrameSent} display=pending`,
    LogPrefix.Steam
  )
}

/** Terminal 'done' status for a launch that will not start (idempotent). */
export function sendLaunchDone(steamGame: SteamGame): void {
  sendGameStatusUpdate({
    appName: steamGame.appId,
    runner: 'steam',
    status: 'done'
  })
}

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
  notify({ title, body })
  app.raiseMainWindow()
  const ackId = newDialogAckId()
  const appId = steamGame.appId
  trackDialogDisplay(ackId, (result) => {
    logInfo(
      result.confirmed
        ? `[engine-notice] appId=${appId} tag=${tag} display=confirmed elapsedMs=${result.elapsedMs}`
        : `[engine-notice] appId=${appId} tag=${tag} display=unconfirmed timeout=${result.timeoutMs}`,
      LogPrefix.Steam
    )
  })
  const sent = showDialogBoxModalAuto({
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
 * Phase 59: DRM-mode and bottled-Steam launches are CrossOver-only. Shown on
 * every blocked attempt (the user pressed Play and nothing else will tell
 * them why it did nothing).
 */
export function notifyCrossoverRequired(
  steamGame: SteamGame,
  kind: 'drm' | 'bottled',
  pre: CrossoverPreflight
): void {
  const reason =
    pre.kind === 'expired'
      ? i18next.t(
          'gamelib:steam.engine.reason.cxExpired',
          'CrossOver trial expired'
        )
      : pre.kind === 'broken'
        ? i18next.t(
            'gamelib:steam.engine.reason.cxBroken',
            "CrossOver isn't working"
          )
        : i18next.t(
            'gamelib:steam.engine.reason.cxMissing',
            'CrossOver not found'
          )
  logWarning(
    `SteamGame: appId ${steamGame.appId} ${kind} launch needs CrossOver but pre-flight is ${pre.kind}; not launching (no built-in engine, no fallback)`,
    LogPrefix.Steam
  )
  const body =
    kind === 'drm'
      ? i18next.t(
          'gamelib:steam.engine.crossoverRequired.drm',
          'This game uses Steam DRM support that needs CrossOver ({{reason}}). Install or renew CrossOver, then try again.',
          { reason }
        )
      : i18next.t(
          'gamelib:steam.engine.crossoverRequired.bottled',
          'This game runs through Windows Steam, which needs CrossOver ({{reason}}). Install or renew CrossOver, then try again.',
          { reason }
        )
  showEngineDialog(
    steamGame,
    steamGame.getGameInfo().title,
    body,
    `crossover-required-${kind}`
  )
}

/**
 * Phase 59 (D-05/D-06/D-07/D-09/D-14/D-15): a fresh pre-flight and engine
 * decision for every TCP bridge launch. Downloads the built-in engine on
 * first need, registers the choice, prepares the bottle for it, and
 * re-reads the settings so every later spawn uses the registered engine.
 */
export async function selectLaunchEngine(
  steamGame: SteamGame,
  current: GameSettings,
  connectivity: { offline: boolean }
): Promise<{ ok: true; settings: GameSettings } | { ok: false }> {
  const bottleName = current.wineCrossoverBottle
  const { decideLaunchEngine } = await import('backend/engine/engineDecision')
  const { setEngineSelection, clearEngineSelection } =
    await import('backend/engine/engineRegistry')
  const { prepareBottleForEngine } = await import('backend/engine/engineSwitch')
  const { recordLaunchDecision } = await import('backend/engine/engineState')
  const { STEAM_ENGINE_RUNNER, steamEngineStateDeps } =
    await import('./engine/steamEngineDeps')
  const { isNonCrossover } = await import('backend/engine/engineTypes')
  const title = steamGame.getGameInfo().title

  // G22/G25: offline, some launches cannot start on any branch: CrossOver missing needs the
  // current pin downloaded, and a built-in-engine bottle whose restore needs the absent pin
  // cannot restore under a healthy CrossOver (59-26). The probe's result cannot change that,
  // so refuse now instead of waiting it out. The offline reading is a fresh check taken at
  // Play (the monitor status can be stale, 59-40 diagnosis). This only refuses: no engine is
  // selected and nothing is routed or launched, so D-07/D-09 hold, and every launch that can
  // start still probes below.
  const { isCrossoverMissing } = await import('backend/engine/engineDecision')
  const { steamDecisionDeps, steamSwitchDeps, readSteamEngineOverride } =
    await import('./engine/steamEngineDeps')
  const { engineServicesFrom } = await import('backend/services/engineServices')
  const { parseEngineOverride } = await import('backend/engine/engineIds')
  const earlyOverride = parseEngineOverride(
    readSteamEngineOverride(steamGame.appId)
  )
  if (
    connectivity.offline &&
    (earlyOverride === 'automatic' || earlyOverride === 'crossover')
  ) {
    const { readBottleEngineMarkerKind, restoreNeedsAbsentPin } =
      await import('backend/engine/engineSwitch')
    const { isPinnedEngineInstalled } =
      await import('backend/engine/fallbackEngine')
    const { ENGINE_PINS } = await import('backend/engine/enginePins')
    const { offlineLaunchCertainlyBlocked } =
      await import('backend/engine/offlineRefusal')
    const refusal = offlineLaunchCertainlyBlocked({
      offline: connectivity.offline,
      override: earlyOverride,
      crossoverMissing: await isCrossoverMissing(
        steamDecisionDeps({ spawnAsync: steamGame.deps.spawnAsync })
      ),
      markerKind: readBottleEngineMarkerKind(bottleName),
      currentPinInstalled: isPinnedEngineInstalled(ENGINE_PINS.current),
      restoreNeedsAbsentPin: restoreNeedsAbsentPin(bottleName)
    })
    if (refusal.blocked) {
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
        title,
        i18next.t(
          'gamelib:steam.engine.downloadFailed',
          "GameLib couldn't download its built-in engine ({{reason}}). Check your connection and try again.",
          { reason: 'offline' }
        ),
        'engine-download-failed'
      )
      return { ok: false }
    }
  }

  const decision = await decideLaunchEngine(
    { key: steamGame.appId, bottleName },
    steamDecisionDeps({ spawnAsync: steamGame.deps.spawnAsync })
  )
  if (decision.kind === 'unavailable') {
    logWarning(
      `SteamGame: appId ${steamGame.appId} engine override ${decision.override} is unavailable: ${decision.detail}`,
      LogPrefix.Steam
    )
    showEngineDialog(
      steamGame,
      title,
      i18next.t(
        'gamelib:steam.engine.overrideUnavailable',
        'The engine chosen for this game in Wine settings is not available ({{detail}}). Choose Automatic or install it.',
        { detail: decision.detail }
      ),
      'override-unavailable'
    )
    return { ok: false }
  }

  if (decision.needsDownload && decision.pin) {
    const engine = await ensureBuiltInEngineForInstall(steamGame, decision.pin)
    if ('status' in engine && engine.status === 'abort') {
      return { ok: false }
    }
    if ('status' in engine) {
      showEngineDialog(
        steamGame,
        title,
        engine.error ?? '',
        'engine-download-failed'
      )
      return { ok: false }
    }
  }

  const sel: EngineSelection = decision.selection
  if (!setEngineSelection(steamGame.appId, sel)) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} engine selection was rejected (${engineLabelForLog(sel)}); not launching`,
      LogPrefix.Steam
    )
    showEngineDialog(
      steamGame,
      title,
      i18next.t(
        'gamelib:steam.engine.selectionRejected',
        "GameLib couldn't set up {{engine}} for this game, so it did not start. Check the launch log (Settings > Logs).",
        { engine: sel.kind === 'crossover' ? 'CrossOver' : sel.label }
      ),
      'engine-selection-rejected'
    )
    return { ok: false }
  }
  const prep = await prepareBottleForEngine({
    key: steamGame.appId,
    bottleName,
    next: sel,
    // 59-UAT G10: an override to CrossOver on an expired bottle must not run
    // the DXVK restore through CrossOver.
    crossoverHealthy: decision.preflight?.kind === 'healthy',
    // WR-05: a restore's pin download reports the same progress as a launch download.
    deps: {
      ...steamSwitchDeps(engineServicesFrom(steamGame.deps)),
      ensurePinEngine: steamGame.restorePinEngine
    },
    // IN-05 (59-22): a real engine switch is "setting up", not a stale
    // "Downloading (100%)", until the monitor's launching status.
    onSwitching: () =>
      sendGameStatusUpdate({
        appName: steamGame.appId,
        runner: 'steam',
        status: 'engine-download',
        context: 'setting-up'
      })
  })
  if (!prep.ok) {
    if (prep.reason === 'dxvk-failed' && sel.kind === 'crossover') {
      // CR-03 (D-03/D-07): never start on CrossOver over DXVK-macOS DLLs. No reroute to
      // bottled Steam; the switch is retried on the next launch.
      clearEngineSelection(steamGame.appId)
      logWarning(
        `SteamGame: appId ${steamGame.appId} could not switch back to CrossOver (${prep.detail}); not launching`,
        LogPrefix.Steam
      )
      showEngineDialog(
        steamGame,
        title,
        i18next.t(
          'gamelib:steam.engine.restoreFailed',
          "GameLib couldn't finish switching {{title}} back to CrossOver, so it did not start. Check your connection and try again; GameLib retries the switch on the next launch.",
          { title }
        ),
        'engine-restore-failed'
      )
      return { ok: false }
    }
    if (prep.reason === 'dxvk-failed') {
      // The built-in engine is best-effort: missing DXVK degrades Direct3D
      // but is not a launch blocker.
      logWarning(
        `SteamGame: appId ${steamGame.appId} DXVK setup failed (${prep.detail}); continuing`,
        LogPrefix.Steam
      )
    } else if (
      prep.reason === 'shared-bottle' ||
      prep.reason === 'bottle-busy'
    ) {
      // 59-REVIEW WR-06: refuse, kill nothing, and say why.
      clearEngineSelection(steamGame.appId)
      logWarning(
        `SteamGame: appId ${steamGame.appId} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
        LogPrefix.Steam
      )
      showEngineDialog(
        steamGame,
        title,
        i18next.t(
          'gamelib:steam.engine.sharedBottle',
          "{{title}} is installed in GameLib's shared bridge bottle, where changing engines could stop other games. It can only run there on CrossOver. Uninstall and reinstall it to give it its own bottle.",
          { title }
        ),
        'engine-shared-bottle'
      )
      return { ok: false }
    } else if (prep.reason === 'marker-newer') {
      // Quick 261109-w52: the bottle's engine marker is from a newer GameLib build.
      clearEngineSelection(steamGame.appId)
      logWarning(
        `SteamGame: appId ${steamGame.appId} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
        LogPrefix.Steam
      )
      showEngineDialog(
        steamGame,
        title,
        i18next.t(
          'gamelib:steam.engine.markerNewer',
          "{{title}}'s game files were last set up by a newer version of GameLib, so this version won't change its engine. Launch it with the engine it already uses, or update GameLib.",
          { title }
        ),
        'engine-marker-newer'
      )
      return { ok: false }
    } else {
      clearEngineSelection(steamGame.appId)
      logWarning(
        `SteamGame: appId ${steamGame.appId} cannot switch engine (${prep.reason}: ${prep.detail}); not launching`,
        LogPrefix.Steam
      )
      return { ok: false }
    }
  }

  // Engine and version on every launch (D-14) plus the untested-build line
  // (D-15), written from the decision so they cannot drift from it.
  for (const line of decision.logLines) {
    logInfo(`SteamGame: appId ${steamGame.appId} ${line}`, LogPrefix.Steam)
  }
  recordLaunchDecision(
    { runner: STEAM_ENGINE_RUNNER, appName: steamGame.appId },
    decision,
    bottleName,
    steamEngineStateDeps(steamGame.deps, steamGame.appId)
  )

  if (
    isNonCrossover(sel) &&
    decision.override === 'automatic' &&
    sel.reason !== 'cx-inconclusive'
  ) {
    const body =
      sel.reason === 'cx-expired'
        ? i18next.t(
            'gamelib:steam.engine.toast.cxExpired',
            'CrossOver trial expired — using built-in engine'
          )
        : sel.reason === 'cx-broken'
          ? i18next.t(
              'gamelib:steam.engine.toast.cxBroken',
              "CrossOver isn't working — using built-in engine"
            )
          : i18next.t(
              'gamelib:steam.engine.toast.cxMissing',
              'CrossOver not found — using built-in engine'
            )
    notify({ title, body })
  }
  // 59-01 `nag_blocks: no`: a CrossOver trial reminder does not block a
  // launch, so no nag handling exists here. An expired bottle does hang
  // behind CodeWeavers' own dialog; the launch deadline in
  // fireBridgeWineLaunch bounds that. GameLib never edits NagTime, the
  // registry or the licence and never suppresses CodeWeavers' prompts.

  return { ok: true, settings: getBridgeBottleSettings(steamGame.appId) }
}

/**
 * Phase 59 (D-10/D-11): the launch deadline fired with no game process
 * seen. Stops the bottle with the running engine's own wineserver (before
 * the registry entry that names it is cleared), stops the helper, and tells
 * the user. No fallback retry, no markBridgeFailedThisSession, no
 * steamBridgeSetupRequired: a game that never appeared on CrossOver is not
 * evidence that the bridge is broken, and retrying on the built-in engine
 * would hide the problem the user needs to see.
 */
export async function onBridgeLaunchDeadline(
  steamGame: SteamGame,
  clearLaunchRecord: () => void,
  armedSelection: EngineSelection | undefined
): Promise<void> {
  const { stopBottleProcessMonitor } = await import('./bottleProcessMonitor')
  const { clearEngineSelection, getEngineSelection } =
    await import('backend/engine/engineRegistry')
  const { engineLogLabel } = await import('backend/engine/engineTypes')
  const { LAUNCH_DEADLINE_MS } = await import('backend/engine/launchDeadline')
  // Phase 59 UAT (G5): the monitor's onStopped can clear the registry entry
  // before the deadline fires, so fall back to the selection seen at arm time.
  const sel = getEngineSelection(steamGame.appId) ?? armedSelection
  logWarning(
    `SteamGame: appId ${steamGame.appId} launch deadline fired (${sel ? engineLogLabel(sel) : 'engine=crossover'}); stopping the bottle`,
    LogPrefix.Steam
  )
  stopBottleProcessMonitor(steamGame.appId)
  await killBridgeBottleWineServer(steamGame.deps, steamGame.appId, 15_000)
  stopBridgeHelper(steamGame.appId)
  clearLaunchRecord()
  clearEngineSelection(steamGame.appId)
  sendLaunchDone(steamGame)
  showEngineDialog(
    steamGame,
    i18next.t('gamelib:steam.engine.didntStart.title', "Game didn't start"),
    i18next.t(
      'gamelib:steam.engine.didntStart.body',
      "{{title}} did not start within {{seconds}} seconds, so GameLib stopped it. Check the launch log (Settings > Logs) and this game's known fixes.",
      {
        title: steamGame.getGameInfo().title,
        seconds: LAUNCH_DEADLINE_MS / 1000
      }
    ),
    'didnt-start'
  )
}

export async function prefetchBridgeDrmDownloads(
  steamGame: SteamGame,
  exePath: string,
  bridgeBottleName: string
): Promise<void> {
  const { drmWrapper, drmExe } = await detectLaunchDrmWrapper(
    getBottleDir(bridgeBottleName),
    exePath
  )
  // CEG markers are read once, and only for a steamstub exe.
  const cegMarkers =
    drmWrapper === 'steamstub'
      ? await readLaunchExeCegMarkers(
          steamGame,
          drmExe,
          'prefetchBridgeDrmDownloads'
        )
      : []
  // 59-REVIEW WR-04 / 59-15: persist the mode this install resolves so a
  // fresh DRM-mode title is excluded from the override before first launch.
  writeBridgeModeVerdict(
    steamGame.deps,
    steamGame.appId,
    resolveBridgeMode(drmWrapper, cegMarkers) === 'steamclient-layer'
      ? 'steamclient-layer'
      : 'tcp'
  )
  if (drmWrapper !== 'steamstub') return
  await prefetchDrmDownloads({
    appId: steamGame.appId,
    appFolder,
    drmWrapper,
    cegMarkers
  })
}

/**
 * Reads the launch exe's CEG markers through the path-based scanner (Rust
 * ranged reads; never the whole exe). 56-04's resolveBridgeMode sends a
 * CEG-marked exe to 'tcp', so the existing CEG refusal keeps handling it;
 * the markers are therefore read BEFORE drmLaunchSetup. Never throws.
 */
export async function readLaunchExeCegMarkers(
  steamGame: SteamGame,
  exePath: string,
  caller: string
): Promise<string[]> {
  const result = await detectSteamDrmInPe(exePath, caller)
  if (result.readError !== null) {
    logWarning(
      `SteamGame: CEG detection could not read the exe for appId ${steamGame.appId}: ${result.readError}`,
      LogPrefix.Steam
    )
    return []
  }
  if (result.parsed) return result.cegMarkers
  logWarning(
    `SteamGame: CEG detection could not parse the exe as a PE for appId ${steamGame.appId} -- treating as not CEG`,
    LogPrefix.Steam
  )
  return []
}

export async function launchDrmModeGame(
  steamGame: SteamGame,
  exePath: string,
  installRoot: string,
  ready: DrmLaunchReady
): Promise<boolean> {
  const macSteamClientDir = join(userHome, ...MAC_STEAM_CLIENT_SUBPATH)
  if (!existsSync(join(macSteamClientDir, 'steamclient.dylib'))) {
    maybeNotifyDrmModeFailed(
      steamGame,
      'steam-not-running',
      drmStepError(
        'steam-not-running',
        `Mac Steam's steamclient.dylib was not found in ${macSteamClientDir}`
      ).cause
    )
    return false
  }
  const trace = prepareDrmTraceFile(appFolder, steamGame.appId)
  if (trace.status === 'error') {
    maybeNotifyDrmModeFailed(
      steamGame,
      'bottle-stage',
      drmStepError('bottle-stage', trace.cause).cause
    )
    return false
  }
  const anchorLine = formatBridgeDrmAnchor({
    appId: steamGame.appId,
    crossover: ready.anchor.crossover,
    client: ready.anchor.client,
    trace: trace.traceFile
  })
  if (!anchorLine) {
    maybeNotifyDrmModeFailed(
      steamGame,
      'bottle-stage',
      drmStepError('bottle-stage', 'invalid [bridge-drm] anchor fields').cause
    )
    return false
  }
  const gameWinPath = drmBottleWinPath(
    getBottleDir(ready.bottleSettings.wineCrossoverBottle),
    exePath
  )
  if (!gameWinPath) {
    maybeNotifyDrmModeFailed(
      steamGame,
      'bottle-stage',
      drmStepError('bottle-stage', "game exe is not under the bottle's drive_c")
        .cause
    )
    return false
  }
  logInfo(
    `SteamGame: DRM launch for appId ${steamGame.appId} install root ${installRoot}`,
    LogPrefix.Steam
  )
  // Not ready.bottleSettings-from-before: the settings computed before
  // drmLaunchSetup predate the runner swap (56-11 contract).
  // Phase 60 (D-05/D-08): the overlay rides the DRM clone only when its
  // wineloader is re-signed; any failure launches the clone without tokens.
  let overlayTokens: string[] | undefined
  if (resolveLaunchOverlay(steamGame).enabled) {
    if (ready.runner.wineloaderResigned !== true) {
      notifyOverlaySetupFailed(
        steamGame,
        'resign',
        'DRM runner wineloader not re-signed'
      )
    } else {
      const r = await prepareOverlayTokens({
        appId: steamGame.appId,
        shimPath: builtOverlayShimPath,
        steamBinDir: macSteamClientDir,
        ...overlayInputArg(steamGame, 'drm'),
        ...overlayProbeArg(steamGame)
      })
      if (r.status === 'ok') overlayTokens = r.tokens
      else notifyOverlaySetupFailed(steamGame, r.step, r.cause)
    }
  }
  return fireBridgeWineLaunch(steamGame, exePath, ready.bottleSettings, {
    ready,
    gameWinPath,
    traceFile: trace.traceFile,
    anchorLine,
    macSteamClientDir,
    ...(overlayTokens ? { overlayTokens } : {})
  })
}
