/**
 * Core launch cluster lifted out of SteamGame (62-07, D-06 mechanical
 * lift: this -> steamGame).
 * Public SteamGame entry points keep a delegating stub on the class;
 * internal helpers are called directly by sibling lifted modules, importing
 * forward only (gameEligibility/gameLaunchOverlay -> gameInstall ->
 * gameLaunch -> gameBridgeLaunch). A call a test spies on stays a
 * `steamGame.X()` call (quick-261107-an2).
 */
import { createRustRunTool } from './engine/rustRunTool'
import i18next from 'i18next'
import { existsSync } from 'graceful-fs'
import { join } from 'node:path'
import { GameSettings, LaunchOption } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify, showDialogBoxModalAuto } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import type LogWriter from 'backend/logger/targetWriter'
import { isWindows } from 'backend/constants/environment'
import type { SteamBridgeVerdict } from './stores'
import { gatePlayOnAdoption } from './playAdoption'
import { killBridgeBottleWineServer } from './bridgeBottleLifecycle'
import {
  getBridgeBottleSettings,
  findBridgeInstallBottle
} from './bridgeBottle'
import { gateBridgeLaunchOnUpdate } from './updateLaunchPrompt'
import { tellBottledSteamToLaunch } from './bottledSteam'
import { getBottleDir } from 'backend/enginewine/twin'
// Phase 60: Steam overlay in bridged games (macOS).
import { prepareOverlayTokens } from './bridge/overlay/overlayLaunch'
import { DEFAULT_STEAM_BOTTLE_NAME } from './constants'
import type { CrossoverPreflight } from 'backend/enginewine/decision'
import type { EngineSelection } from 'common/types/engine'
import {
  dropEngineSelection,
  setSteamEngineSelection
} from './engine/engineSync'
import { engineSelectionView } from 'backend/enginewine/selectionView'
import { detectLaunchDrmWrapper } from './bridge/drm/drmScanExe'
import { detectSteamDrmInPe } from './bridge/peScan'
import { type DrmLaunchReady } from './bridge/drm/drmLaunchSetup'
import {
  resolveBridgeMode,
  formatDrmNoticeLine,
  formatBridgeDrmAnchor,
  drmStepError,
  type DrmStep
} from './bridge/drm/steamclientLayerMode'
import {
  markBridgeLimitedNoticeShown,
  readBridgeVerdict,
  setBridgeIdentityFallback,
  writeBridgeModeVerdict
} from './bridge/bridgeVerdict'
import { buildSteamProtocolUrl } from './gameProtocolUrl'
import { watchSteamLaunch } from './steamLaunchedDeps'
import {
  MAC_STEAM_CLIENT_SUBPATH,
  drmBottleWinPath,
  prepareDrmTraceFile,
  engineLabelForLog,
  drmStepNoticeText
} from './gameDrmLaunch'
import type SteamGame from './games'
import { showEngineDialog } from './gameEngineDialogs'
import {
  clearStaleBridgeVerdict,
  ensurePlatformsCaptured,
  isBottleEligible
} from './gameEligibility'
import { ensureBuiltInEngineForInstall } from './gameInstall'
import { pinnedEngineReader } from './engine/pinnedEngine'
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
  steamGame.deps.steamSession.authTrigger.noteSteamAuthTrigger('user-play')
  // D-51-07: same auto-clear as install()'s top, before any routing
  // decision below reads the persisted verdict.
  clearStaleBridgeVerdict(steamGame)
  await ensurePlatformsCaptured(steamGame)
  if (isBottleEligible(steamGame)) {
    // quick/261024-gvu: single-flight. While a bottle/bridge monitor for this
    // appId is live (starting or running) a second Play must not queue another
    // `-applaunch` / wine exe; the monitor keeps owning the status.
    const livePhase =
      steamGame.deps.steamLaunchRuntime.monitors.getBottleProcessMonitorPhase(
        steamGame.appId
      )
    if (livePhase) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} launch already ${livePhase} — not dispatching another`,
        LogPrefix.Steam
      )
      return true
    }
    // Phase 51 Plan 09 (D-51-09): LOCATION, not eligibility — launch()
    // must dispatch to wherever this install's bits actually live, never
    // to where a NEW install would be routed (isBridgeEligible() / bridgeRoute()
    // answers the latter question, which a never-scanned title now defaults
    // to 'bridge' on (rule 11, pending-scan) even
    // though nothing has been installed there yet). findBridgeInstallBottle
    // is non-null only when a bridge bottle actually holds this appId's
    // manifest — the FIRST check inside this block, mirroring install()'s
    // own bridge sub-branch above (BLOCKER 1 rationale: the bridge has its
    // own readiness gate, ensureBridgeHelperReady(), independent of the
    // unrelated Phase 17 GameLibSteam bottle's own state).
    //
    // The session circuit breaker (finding #3) is about where a NEW install
    // goes, not where the bits are. It must NOT divert a launch of bits that
    // sit in a bridge bottle: bottled Steam has no copy of them, so
    // `-applaunch` answers AppError_18 and Steam starts a full re-download
    // into its own library (Gothic 1 Remake 1297900, 2026-11-21: a 33 GB
    // bridge copy was complete, a shim-placement failure set the breaker, and
    // the next Play fetched the game again). Such a launch retries the bridge,
    // which re-resolves everything and surfaces its own steamBridgeSetupRequired
    // message on a real failure.
    //
    // The one exception is a persisted Steam CEG verdict: CEG needs the
    // Windows Steam client, so bottled Steam is the only place the title can
    // run, and it is the user's explicit "Fall back to bottled Steam" choice
    // in the setup dialog that re-enters launch() after the breaker is set.
    const bridgeBottleName = findBridgeInstallBottle(
      steamGame.deps.paths,
      steamGame.appId
    )
    if (bridgeBottleName !== null) {
      const failedThisSession =
        steamGame.deps.steamSession.gameSession.bridgeFailedThisSession.has(
          steamGame.appId
        )
      const needsWindowsSteamClient =
        readBridgeVerdict(steamGame.deps, steamGame.appId)?.drm === 'ceg'
      if (!(failedThisSession && needsWindowsSteamClient)) {
        if (failedThisSession) {
          logInfo(
            `SteamGame: appId ${steamGame.appId} bridge failed earlier this session but its bits live in ${bridgeBottleName}; retrying the bridge launch, never bottled Steam`,
            LogPrefix.Steam
          )
        }
        if ((await gateBridgeLaunchOnUpdate(steamGame)) === 'abort') {
          return false
        }
        return launchBridgeGame(steamGame)
      }
    }

    if (!steamGame.deps.steamBottle.isBottleReady()) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} is bottle-eligible but the bottle is not yet provisioned — requesting guided setup instead of launching`,
        LogPrefix.Steam
      )
      steamGame.deps.sendFrontendMessage('steamBottleSetupRequired', {
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
    const { preflightCrossover } = await import('backend/enginewine/decision')
    const { preflightFrom } = await import('./engine/engineDecisionReply')
    const { steamWineBinHints } = await import('./engine/steamEngineDeps')
    const pre = preflightFrom(
      await preflightCrossover(steamGame.deps, {
        bottleName:
          steamGame.deps.steamBottle.getSteamBottleSettings()
            ?.wineCrossoverBottle ?? DEFAULT_STEAM_BOTTLE_NAME,
        hintWineBins: steamWineBinHints(steamGame.deps)
      })
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
  // Quick 261029-ji2 / Phase 81 D-14: a GameLib-downloaded install that the still-running
  // Steam never adopted makes rungameid open the install dialog, so Steam is restarted once
  // first (or opened, when signed out). The gate lives in playAdoption.ts and only acts for
  // installs with a pending-adoption record (see runNativeDepotDownload).
  const gate = await gatePlayOnAdoption(steamGame)
  if (gate === 'launched') return true
  if (gate === 'opened-steam' || gate === 'refused') return false
  await steamGame.deps.openExternal.openExternal(url, { activate: false })
  // The launch IPC must not resolve before the watch's `launching` frame, or the Play click
  // latch drops onto Play for a frame (quick 261119-p3z).
  await watchSteamLaunch(steamGame.deps, steamGame.appId)
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

  notify(steamGame.deps, {
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
  if (!steamGame.deps.steamLaunchRuntime.drmNotice.claim(key)) {
    return
  }
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
  notify(steamGame.deps, { title, body })
  // The failure usually lands while the game is in front. Bring GameLib up first, or the
  // dialog renders into a window nobody can see (display=unconfirmed in the 56-16 gate).
  steamGame.deps.appState.raiseMainWindow()
  const ackId = steamGame.deps.dialogs.displayAcks.newId()
  const appId = steamGame.appId
  steamGame.deps.dialogs.displayAcks.track(ackId, (result) => {
    logInfo(
      result.confirmed
        ? `[bridge-notice] appId=${appId} display=confirmed elapsedMs=${result.elapsedMs}`
        : `[bridge-notice] appId=${appId} display=unconfirmed timeout=${result.timeoutMs}`,
      LogPrefix.Steam
    )
  })
  const dialogFrameSent = showDialogBoxModalAuto(steamGame.deps, {
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
  sendGameStatusUpdate(steamGame.deps, {
    appName: steamGame.appId,
    runner: 'steam',
    status: 'done'
  })
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
  const { decideLaunchEngine } = await import('backend/enginewine/decision')
  const { recordLaunchDecision } = await import('backend/enginewine/state')
  const { launchDecisionFrom } = await import('./engine/engineDecisionReply')
  const clearEngineSelection = (key: string) =>
    dropEngineSelection(steamGame.deps, key)
  const { prepareBottle } = await import('./engine/prepareBottle')
  const { STEAM_ENGINE_RUNNER, steamEngineStateFacts } =
    await import('./engine/steamEngineDeps')
  const { isNonCrossover } = await import('backend/enginewine/twin')
  const title = steamGame.getGameInfo().title

  // G22/G25: offline, some launches cannot start on any branch: CrossOver missing needs the
  // current pin downloaded, and a built-in-engine bottle whose restore needs the absent pin
  // cannot restore under a healthy CrossOver (59-26). The probe's result cannot change that,
  // so refuse now instead of waiting it out. The offline reading is a fresh check taken at
  // Play (the monitor status can be stale, 59-40 diagnosis). This only refuses: no engine is
  // selected and nothing is routed or launched, so D-07/D-09 hold, and every launch that can
  // start still probes below.
  const { isCrossoverMissing } = await import('backend/enginewine/decision')
  const { steamPrepareFacts, steamEngineFacts, readSteamEngineOverride } =
    await import('./engine/steamEngineDeps')
  const { parseEngineOverride } = await import('backend/enginewine/twin')
  const earlyOverride = parseEngineOverride(
    readSteamEngineOverride(steamGame.deps, steamGame.appId)
  )
  if (
    connectivity.offline &&
    (earlyOverride === 'automatic' || earlyOverride === 'crossover')
  ) {
    const twin = await import('backend/enginewine/twin')
    const fallback = pinnedEngineReader(steamGame.deps.paths)
    const { isPinnedEngineInstalled } = fallback
    const switchCtx = { paths: steamGame.deps.paths, fallback }
    const { ENGINE_PINS } = twin
    const { offlineLaunchCertainlyBlocked } =
      await import('./engine/offlineRefusal')
    const refusal = offlineLaunchCertainlyBlocked({
      offline: connectivity.offline,
      override: earlyOverride,
      // An error in the lookup is "unknown", which never refuses (G25), so only `true` counts.
      crossoverMissing:
        (await isCrossoverMissing(steamGame.deps, {
          hintWineBins: steamEngineFacts(steamGame.deps, steamGame.appId)
            .hintWineBins
        })) === true,
      markerKind: twin.readBottleEngineMarkerKind(switchCtx, bottleName),
      currentPinInstalled: isPinnedEngineInstalled(ENGINE_PINS.current),
      restoreNeedsAbsentPin: twin.restoreNeedsAbsentPin(switchCtx, bottleName)
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

  // 87-54: the decision is Rust's; the stored override, the monitor's phase and the wine-binary hints go as values.
  const decision = launchDecisionFrom(
    await decideLaunchEngine(steamGame.deps, {
      key: steamGame.appId,
      bottleName,
      ...steamEngineFacts(steamGame.deps, steamGame.appId)
    })
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
  if (!setSteamEngineSelection(steamGame.appId, sel)) {
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
  const prep = await prepareBottle(
    {
      paths: steamGame.deps.paths,
      requestRustInvoke: steamGame.deps.requestRustInvoke
    },
    {
      key: steamGame.appId,
      bottleName,
      next: sel,
      // 59-UAT G10: an override to CrossOver on an expired bottle must not run
      // the DXVK restore through CrossOver.
      crossoverHealthy: decision.preflight?.kind === 'healthy',
      ...steamPrepareFacts(steamGame.deps, steamGame.appId, sel),
      // WR-05: a restore's pin download reports the same progress as a launch download.
      ensurePinEngine: steamGame.restorePinEngine,
      // IN-05 (59-22): a real engine switch is "setting up", not a stale
      // "Downloading (100%)", until the monitor's launching status.
      onSwitching: () =>
        sendGameStatusUpdate(steamGame.deps, {
          appName: steamGame.appId,
          runner: 'steam',
          status: 'engine-download',
          context: 'setting-up'
        })
    }
  )
  if (!prep.ok) {
    if (prep.reason === 'dxvk-failed' && sel.kind === 'crossover') {
      // CR-03 (D-03/D-07): never start on CrossOver over DXVK-macOS DLLs. No reroute to
      // bottled Steam; the switch is retried on the next launch.
      await clearEngineSelection(steamGame.appId)
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
      await clearEngineSelection(steamGame.appId)
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
      await clearEngineSelection(steamGame.appId)
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
      await clearEngineSelection(steamGame.appId)
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
  // 87-54: the record is Rust's now (it pushes `engineStateChanged` itself); the bridge's facts go as values. A refused
  // record must not stop a launch that is otherwise ready.
  try {
    await recordLaunchDecision(steamGame.deps, {
      runner: STEAM_ENGINE_RUNNER,
      appName: steamGame.appId,
      bottleName,
      override: decision.override,
      selection: decision.selection,
      preflight: decision.preflight,
      facts: steamEngineStateFacts(steamGame.deps, steamGame.appId)
    })
  } catch (error) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} could not record the launch decision: ${String(error)}`,
      LogPrefix.Steam
    )
  }

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
    notify(steamGame.deps, { title, body })
  }
  // 59-01 `nag_blocks: no`: a CrossOver trial reminder does not block a
  // launch, so no nag handling exists here. An expired bottle does hang
  // behind CodeWeavers' own dialog; the launch deadline in
  // fireBridgeWineLaunch bounds that. GameLib never edits NagTime, the
  // registry or the licence and never suppresses CodeWeavers' prompts.

  return {
    ok: true,
    settings: getBridgeBottleSettings(steamGame.deps, steamGame.appId)
  }
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
  const { engineLogLabel } = await import('backend/enginewine/twin')
  const { LAUNCH_DEADLINE_MS } = await import('common/types/engine')
  // Phase 59 UAT (G5): the monitor's onStopped can clear the registry entry
  // before the deadline fires, so fall back to the selection seen at arm time.
  const sel = engineSelectionView.get(steamGame.appId) ?? armedSelection
  logWarning(
    `SteamGame: appId ${steamGame.appId} launch deadline fired (${sel ? engineLogLabel(sel) : 'engine=crossover'}); stopping the bottle`,
    LogPrefix.Steam
  )
  steamGame.deps.steamLaunchRuntime.monitors.stopBottleProcessMonitor(
    steamGame.appId
  )
  await killBridgeBottleWineServer(steamGame.deps, steamGame.appId, 15_000)
  steamGame.deps.bridgeHelpers.stop(steamGame.appId)
  clearLaunchRecord()
  await dropEngineSelection(steamGame.deps, steamGame.appId)
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
    steamGame.deps,
    getBottleDir(steamGame.deps.paths, bridgeBottleName),
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
  await steamGame.deps.steamProcesses.drm.prefetchDrmDownloads(
    {
      appId: steamGame.appId,
      appFolder: steamGame.deps.paths.appFolder,
      drmWrapper,
      cegMarkers
    },
    {
      runTool: createRustRunTool(steamGame.deps),
      runner: steamGame.deps.runner,
      sendFrontendMessage: steamGame.deps.sendFrontendMessage,
      appRuntime: steamGame.deps.appRuntime,
      requestRustInvoke: steamGame.deps.requestRustInvoke,
      paths: steamGame.deps.paths,
      bridgeRuntime: steamGame.deps.bridgeRuntime
    }
  )
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
  const result = await detectSteamDrmInPe(steamGame.deps, exePath, caller)
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
  const { appFolder, userHome, builtOverlayShimPath } = steamGame.deps.paths
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
  const { paths } = steamGame.deps
  const gameWinPath = drmBottleWinPath(
    getBottleDir(paths, ready.bottleSettings.wineCrossoverBottle),
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
      await notifyOverlaySetupFailed(
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
      else await notifyOverlaySetupFailed(steamGame, r.step, r.cause)
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
