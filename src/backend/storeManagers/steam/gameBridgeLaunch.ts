/**
 * Bridge launch cluster lifted out of SteamGame (62-07, D-06 mechanical
 * lift: this -> steamGame).
 * Public SteamGame entry points keep a delegating stub on the class;
 * internal helpers are called directly by sibling lifted modules, importing
 * forward only (gameEligibility/gameLaunchOverlay -> gameInstall ->
 * gameLaunch -> gameBridgeLaunch). A call a test spies on stays a
 * `steamGame.X()` call (quick-261107-an2).
 */
import i18next from 'i18next'
import { existsSync } from 'graceful-fs'
import { basename, dirname } from 'node:path'
import { GameSettings } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { checkConnectivityNow } from 'backend/connectivityNow'
import { notify } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import { sendFrontendMessage } from '../../ipc'
import {
  getBottleDir,
  isBridgeBottleReady,
  getBridgeBottleSettings,
  getDrmBridgeRunner
} from './bottle'
// Phase 60: Steam overlay in bridged games (macOS).
import {
  appendCxEnvTokens,
  mergeOverlayEnvVars,
  type OverlayLaunchPayload
} from './bridge/overlay/overlayLaunch'
import { isAbnormalOverlayExit } from './bridge/overlay/overlayPolicy'
import {
  watchOverlayAttach,
  OVERLAY_ATTACH_DRM_TIMEOUT_MS,
  macSteamConsoleLogPath
} from './bridge/overlay/overlayAttachWatch'
import {
  openOverlayWineLog,
  createShimLineForwarder
} from './bridge/overlay/overlayWineLog'
import { buildOverlayPaths } from './bridge/overlay/overlayPaths'
import { formatOverlayExitNoticeLine } from './bridge/overlay/overlayNotice'
import { publishOverlayExitNotice } from './engine/engineState'
import type { LaunchDeadline } from './engine/launchDeadline'
import { placeShimForGame } from './bridge/shimGenerate'
import { detectLaunchDrmWrapper } from './bridge/drm/drmScanExe'
import { drmLaunchSetup } from './bridge/drm/drmLaunchSetup'
import {
  resolveBridgeMode,
  drmStepError
} from './bridge/drm/steamclientLayerMode'
import {
  resolveBridgeLaunchExe,
  resolveBridgeLaunchWorkingDir
} from './bridge/launchTarget'
import {
  ensureBridgeHelperReady,
  stopBridgeHelper
} from './bridge/helperProcess'
import { writeBridgeConfig } from './bridge/bridgeConfig'
import {
  readBridgeVerdict,
  writeBridgeScanVerdict,
  writeBridgeModeVerdict
} from './bridge/bridgeVerdict'
import { appFolder, userHome } from 'backend/constants/paths'
import {
  bridgeLaunchesInFlight,
  bridgeLaunchBottles,
  markBridgeFailedThisSession
} from './gameSessionState'
import {
  DRM_DLLPATH_CHANNEL,
  DRM_DLLOVERRIDES_CHANNEL,
  DRM_REGISTRY_TIMEOUT_MS,
  buildDrmLaunchEnvironment,
  drmWineLogPathFor,
  drmWineDebugFromEnv,
  createDrmWineLogAppender,
  relogDrmTrace,
  type DrmWineLaunch
} from './gameDrmLaunch'
import type SteamGame from './games'
import {
  persistBridgeDrmSignal,
  reconcileBridgePrescreen,
  resolveBridgeGameInstallRoot
} from './gameInstall'
import {
  maybeNotifyBridgeLimited,
  maybeNotifyDrmModeFailed,
  notifyCrossoverRequired,
  onBridgeLaunchDeadline,
  readLaunchExeCegMarkers,
  selectLaunchEngine,
  sendLaunchDone
} from './gameLaunch'
import {
  notifyOverlaySetupFailed,
  prepareTcpOverlay
} from './gameLaunchOverlay'
/**
 * Phase 60 (D-10): how long after the process monitor reports the game gone we
 * wait for the wine wrapper's exit code before deciding on lifetime alone.
 */
const OVERLAY_EXIT_GRACE_MS = 3000

export function launchBridgeGame(steamGame: SteamGame): Promise<boolean> {
  const appId = steamGame.appId
  const existing = bridgeLaunchesInFlight.get(appId)
  if (existing) {
    logInfo(
      `SteamGame: appId ${appId} bridge launch already in progress; joining it instead of starting a second (G26)`,
      LogPrefix.Steam
    )
    notify({
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

export async function runBridgeLaunch(steamGame: SteamGame): Promise<boolean> {
  let started = false
  try {
    started = await steamGame.launchBridgeGameBody()
    return started
  } finally {
    if (!started) {
      const { clearEngineSelection } = await import('./engine/engineRegistry')
      clearEngineSelection(steamGame.appId)
    }
  }
}

export async function launchBridgeGameBody(
  steamGame: SteamGame
): Promise<boolean> {
  // G25: one fresh connectivity check at Play (the monitor can be stale); the launch-target
  // read and the early offline refusal both use this result.
  const connectivity = await checkConnectivityNow(`launch ${steamGame.appId}`)
  const exePath = await resolveBridgeLaunchExe(steamGame.appId, {
    offline: connectivity.offline
  })
  if (!exePath) {
    logWarning(
      `SteamGame: could not resolve a Windows launch executable for appId ${steamGame.appId} — not launching a bare/undefined path`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'launch-exe-not-resolved',
      fallbackAvailable: true
    })
    return false
  }

  // D-UAT-24-02: a bridge-eligible game can be is_installed:true via a
  // native 32-bit Mac build or an old (Phase 17) bottle install, so the
  // bridge bottle/exe this method resolves above may never have actually
  // been placed on disk. Firing runWineCommand({wait:false}) at a
  // non-existent exe in a non-existent bottle is a silent no-op — wine
  // exits instantly, launch.log stays empty, the Play button reverts with
  // no explanation. Verify the resolved exe genuinely exists (and,
  // defensively, that the bridge bottle itself is ready) BEFORE ever
  // firing wine. This is a RECOVERABLE install-state mismatch, not a
  // bridge failure — do NOT markBridgeFailedThisSession here, since that
  // would poison the session against the very bridge install the
  // resulting dialog steers the user toward.
  // quick/261016-u1w (D-B threading): resolve THIS game's bottle once —
  // per-game bottle if ready, else the legacy shared bottle if that's
  // actually where this appId's manifest lives — and reuse it for the
  // existence gate, the shim refresh, the readiness gate, the config
  // handoff, AND the runWineCommand() gameSettings below, so the game
  // launches from the SAME bottle its exe was resolved against.
  let bridgeBottleSettings = getBridgeBottleSettings(steamGame.appId)
  if (
    !isBridgeBottleReady(bridgeBottleSettings.wineCrossoverBottle) ||
    !existsSync(exePath)
  ) {
    logWarning(
      `SteamGame: appId ${steamGame.appId} is bridge-eligible and marked installed, but the bridge bottle/exe is absent on disk (installed via a non-bridge path) — not firing wine at a non-existent exe (D-UAT-24-02)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'bridge-not-installed',
      fallbackAvailable: true
    })
    return false
  }

  // Phase 56 (D-12): steamclient-layer DRM mode branch, before any shim
  // placement (RESEARCH F10).
  const { drmWrapper: launchDrmWrapper, drmExe } = await detectLaunchDrmWrapper(
    getBottleDir(bridgeBottleSettings.wineCrossoverBottle),
    exePath
  )
  if (launchDrmWrapper === 'steamstub' && drmExe !== exePath) {
    logInfo(
      `SteamGame: appId ${steamGame.appId} SteamStub .bind found on ${basename(drmExe)} (UE runtime exe)`,
      LogPrefix.Steam
    )
  }
  // CEG markers come from the exe that carries .bind (T-56-21-02).
  const launchCegMarkers =
    launchDrmWrapper === 'steamstub'
      ? readLaunchExeCegMarkers(steamGame, drmExe)
      : []
  const previousRunner = getDrmBridgeRunner(steamGame.appId)
  // Only a DRM runner's absence changes the settings drmLaunchSetup clears;
  // an overlay entry is handled by prepareTcpOverlay below.
  const hadDrmRunner = previousRunner?.kind === 'drm'
  let overlayLaunch: OverlayLaunchPayload | undefined
  const wantsDrm =
    resolveBridgeMode(launchDrmWrapper, launchCegMarkers) ===
    'steamclient-layer'
  // 59-REVIEW WR-04 / 59-15: persist what this launch routed on so the engine
  // state keeps the override off DRM-mode titles.
  writeBridgeModeVerdict(
    steamGame.appId,
    wantsDrm ? 'steamclient-layer' : 'tcp'
  )
  const drmInstallRoot = wantsDrm
    ? resolveBridgeGameInstallRoot(
        steamGame,
        exePath,
        bridgeBottleSettings.wineCrossoverBottle
      )
    : undefined
  if (wantsDrm && !drmInstallRoot) {
    maybeNotifyDrmModeFailed(
      steamGame,
      'bottle-stage',
      drmStepError('bottle-stage', 'install root not resolved').cause
    )
    return false
  }
  if (wantsDrm) {
    // DRM mode stays CrossOver-only (phase 59 out of scope): a clear message
    // instead of a hang, never the built-in engine, never decideLaunchEngine.
    const { preflightCrossover } = await import('./engine/engineDecision')
    const pre = await preflightCrossover(
      bridgeBottleSettings.wineCrossoverBottle
    )
    if (pre.kind !== 'healthy') {
      notifyCrossoverRequired(steamGame, 'drm', pre)
      sendLaunchDone(steamGame)
      return false
    }
  } else {
    const engine = await selectLaunchEngine(
      steamGame,
      bridgeBottleSettings,
      connectivity
    )
    if (!engine.ok) {
      sendLaunchDone(steamGame)
      return false
    }
    bridgeBottleSettings = engine.settings
  }
  // No signal is passed: the bridge launch has no abort controller.
  const drm = await drmLaunchSetup({
    appId: steamGame.appId,
    appFolder,
    bottleName: bridgeBottleSettings.wineCrossoverBottle,
    exePath,
    installRoot: drmInstallRoot ?? '',
    installdir: drmInstallRoot ? basename(drmInstallRoot) : '',
    drmWrapper: launchDrmWrapper,
    cegMarkers: launchCegMarkers,
    drmExe
  })
  if (drm.status === 'not-applicable') {
    // drmLaunchSetup cleared the clone runner, so the TCP launch must not
    // keep the clone wineVersion (D-11).
    if (hadDrmRunner) {
      bridgeBottleSettings = getBridgeBottleSettings(steamGame.appId)
    }
    // Phase 60: on by default (D-01); with the overlay off a TCP-mode game
    // runs on stock CrossOver exactly as before (D-04). Runs on every TCP
    // launch so a runner change always ends the old wineserver.
    const tcp = await prepareTcpOverlay(
      steamGame,
      bridgeBottleSettings,
      previousRunner
    )
    bridgeBottleSettings = tcp.settings
    overlayLaunch = tcp.overlayLaunch
  } else if (drm.status === 'error') {
    // D-13: no markBridgeFailedThisSession, no steamBridgeSetupRequired, no
    // bottled Steam. drmLaunchSetup's fail() sends the terminal 'done' when
    // it sent 'drm-setup' progress: the Steam launch is dispatched by
    // dispatchSteamLaunch (steamFlowRegistration.ts) and never reaches
    // launcher.ts's 'done' (IN-01, D-05).
    maybeNotifyDrmModeFailed(steamGame, drm.step, drm.cause)
    return false
  } else {
    // WR-01 (quick 261029-m68): 'done' is sent on every non-launch (a false
    // return or a throw). Success is excluded so the launching/playing set
    // by startBottleProcessMonitor is not clobbered. fireBridgeWineLaunch's
    // known-fixes / shared-redist steps send winetricks/redist before
    // DRM-only exits, progressSent is usually false since quick 261029-e2t
    // prefetches at install, and dispatchSteamLaunch bypasses launcher.ts's
    // 'done'. 'done' is idempotent in GlobalState.handleGameStatus. No catch:
    // a throw propagates untouched.
    let launched = false
    try {
      launched = await steamGame.launchDrmModeGame(
        exePath,
        drmInstallRoot as string,
        drm
      )
      return launched
    } finally {
      if (!launched) {
        sendGameStatusUpdate({
          appName: steamGame.appId,
          runner: 'steam',
          status: 'done'
        })
        logInfo(
          `SteamGame: drm launch appId ${steamGame.appId} sent terminal status done after launch failure`,
          LogPrefix.Steam
        )
      }
    }
  }

  // D-51-01: byte-identity no-op on every normal launch — only does real
  // work when the placed shim has gone stale (e.g. a shim-version bump
  // shipped after this game was installed). quick 261026-lif: an
  // `already-placed` result is no longer guaranteed when a `.gamelib-orig`
  // is new or its fingerprint changed; placement then rescans.
  // D-51-09 (Task 2): the previously-persisted scan verdict's own
  // interfaceVersions pool is threaded through as persistedInterfaceVersions
  // -- per placeShimForGame's own header, this is the ONLY source left for
  // an already-shimmed target (an older GameLib shim has no "original"
  // dll version strings left to read).
  // 51-REVIEW WR-01: once an auto-clear has removed `scan`, the pool
  // `clearBridgeScanVerdict` retained at the top level is the fallback
  // (also used when the current scan's own pool is empty).
  const persistedVerdict = readBridgeVerdict(steamGame.appId)
  const persistedScan = persistedVerdict?.scan
  const scanPool = persistedScan?.interfaceVersions
  const persistedInterfaceVersions =
    scanPool && Object.keys(scanPool).length > 0
      ? scanPool
      : (persistedVerdict?.interfaceVersions ?? scanPool)
  // `??` on purpose: the scan's own map (even empty) describes the current
  // scan; the retained copy is never empty (see clearBridgeScanVerdict).
  const persistedOriginalFingerprints =
    persistedScan?.originalFingerprints ??
    persistedVerdict?.originalFingerprints
  const shimResult = await placeShimForGame(steamGame.appId, exePath, {
    bottleName: bridgeBottleSettings.wineCrossoverBottle,
    gameInstallRoot:
      resolveBridgeGameInstallRoot(
        steamGame,
        exePath,
        bridgeBottleSettings.wineCrossoverBottle
      ) ?? undefined,
    ...(persistedInterfaceVersions ? { persistedInterfaceVersions } : {}),
    // quick 261026-lif: lets placement notice a new or changed
    // `.gamelib-orig` and rescan instead of trusting this verdict.
    // quick 261026-u1a: after an auto-clear the fingerprints
    // `clearBridgeScanVerdict` kept at the top level are the fallback. A
    // stale top-level copy cannot shadow a fresher scan: scan wins, and
    // every new scan write re-persists into scan.
    ...(persistedOriginalFingerprints ? { persistedOriginalFingerprints } : {})
  })

  if (shimResult.status === 'shim-not-built' || shimResult.status === 'error') {
    logWarning(
      `SteamGame: launchBridgeGame could not (re)place the shim for appId ${steamGame.appId}: ${shimResult.status === 'error' ? shimResult.error : `shim-not-built (arch=${shimResult.arch})`}`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      // D-51-13: a missing Win64 shim is its own named reason -- the
      // target does not exist at all until 51-15, a different story from
      // a generic placement failure.
      reason:
        shimResult.status === 'shim-not-built' && shimResult.arch === 'x64'
          ? 'win64-no-shim'
          : 'shim-refresh-failed',
      fallbackAvailable: true
    })
    return false
  }

  // Remaining statuses: 'placed' | 'placed-miss' | 'already-placed' |
  // 'no-steam-api' | 'withheld' (quick 261024-j4l: launched direct above). Amended 2026-10-23 (quick 261023-oq7): a coverage miss
  // no longer aborts the launch -- the shim was placed anyway and the
  // title runs through the bridge. A static-import miss will most likely
  // fail at load with a Windows entry-point error INSIDE the wine
  // process; that happens after runWineCommand returns and is not
  // detected as a launch failure. Only real failures below (helper not
  // ready, cfg write, wine launch) arm the breaker.
  // 'placed', 'placed-miss' and 'no-steam-api' all carry a fresh verdict to persist
  // (D-51-07); 'already-placed' is a true no-op with no verdict at all --
  // the caller keeps whatever it already persisted (shimGenerate.ts's own
  // header, D-UAT-24-04).
  if (shimResult.verdict) {
    writeBridgeScanVerdict(steamGame.appId, shimResult.verdict)
  }

  // shimGenerate stamps a fresh `drmWrapper` ('steamstub' | 'none') on most
  // results. A fresh 'none' clears a stale persisted 'steamstub', so the
  // persisted scan that meta/bridgeCensus.ts and the stores record
  // read stays honest. Routing reads the exe directly in the 56-12 DRM
  // branch above (D-12), not this value.
  const freshDrm =
    'drmWrapper' in shimResult ? shimResult.drmWrapper : undefined
  if (
    freshDrm === 'none' &&
    !shimResult.verdict &&
    persistedScan?.drmWrapper === 'steamstub'
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { drmWrapper: _cleared, ...scanWithoutDrm } = persistedScan
    writeBridgeScanVerdict(steamGame.appId, scanWithoutDrm)
    logInfo(
      `SteamGame: cleared stale persisted drmWrapper=steamstub for appId ${steamGame.appId} (fresh scan says none)`,
      LogPrefix.Steam
    )
  }

  // Quick 261024-br4: an already-installed Steam CEG title (XCOM 200510)
  // would otherwise idle ~30s and exit silently. Same dialog as install,
  // but the bottle is NOT removed -- launch never deletes (mirrors the
  // win64-no-shim handling above). A forced 'bridge' proceeds.
  const cegMarkers = persistBridgeDrmSignal(
    steamGame,
    shimResult.drm,
    'launchBridgeGame'
  )
  if (cegMarkers) {
    logWarning(
      `SteamGame: launchBridgeGame found Steam CEG DRM in the exe for appId ${steamGame.appId} (${cegMarkers.join(', ')}) -- CEG needs the Windows Steam client, which a bridge bottle does not have; not launching`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'drm-wrapped',
      fallbackAvailable: true
    })
    return false
  }

  // CR-04: already-installed titles self-heal a wrong persisted 'none'.
  reconcileBridgePrescreen(steamGame, shimResult)

  // D-51-09 (Task 2): a title that imports nothing from
  // steam_api(64)?.dll at all has nothing for the bridge helper to
  // interpose on -- skip ensureBridgeHelperReady/writeBridgeConfig
  // entirely and launch directly (mirrors there being no helper to spawn
  // for a no-steam-api install in the first place).
  if (
    shimResult.status === 'no-steam-api' ||
    shimResult.status === 'withheld'
  ) {
    logInfo(
      shimResult.status === 'withheld'
        ? `SteamGame: launching appId ${steamGame.appId} via the Steam bridge bottle directly (shim withheld: coverage gaps ${shimResult.verdict.missingSymbols.join(', ')}, no helper)`
        : `SteamGame: launching appId ${steamGame.appId} via the Steam bridge bottle directly (no-steam-api, no helper)`,
      LogPrefix.Steam
    )
    return steamGame.fireBridgeWineLaunch(
      exePath,
      bridgeBottleSettings,
      undefined,
      overlayLaunch
    )
  }

  // 261027-aue: InitFlat fails fast while Steam is quit or signing in, so the
  // helper layer waits (bounded) for it -- tell the user, who would
  // otherwise see up to a minute of silence after pressing Play.
  const helperReady = await ensureBridgeHelperReady(steamGame.appId, {
    onWaitingForSteam: (cause) =>
      notify({
        title: i18next.t(
          'gamelib:steam.bridge.waiting.title',
          'Waiting for Steam'
        ),
        body:
          cause === 'steam-not-running'
            ? i18next.t(
                'gamelib:steam.bridge.waiting.notRunning',
                'Starting Steam. The game will launch once Steam has signed in.'
              )
            : i18next.t(
                'gamelib:steam.bridge.waiting.signingIn',
                'Waiting for Steam to finish signing in. The game will launch once it has.'
              )
      })
  })
  if (
    !helperReady.ready ||
    helperReady.port === undefined ||
    helperReady.secret === undefined
  ) {
    logWarning(
      `SteamGame: bridge helper not ready for appId ${steamGame.appId} (status=${helperReady.status}) — not launching (no no-identity launch, D-05/D-06)`,
      LogPrefix.Steam
    )
    // 261027-aue: a Steam-state cause is about Steam, not this game's bridge:
    // do not poison the session (the next Play retries the bridge) and do
    // not offer the bottled-Steam fallback. The setup message itself was
    // already sent by ensureBridgeHelperReady for these statuses.
    const steamStateCause =
      helperReady.status === 'steam-not-running' ||
      helperReady.status === 'steam-not-signed-in'
    if (!steamStateCause) {
      markBridgeFailedThisSession(steamGame.appId)
    }
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: helperReady.status,
      fallbackAvailable: !steamStateCause
    })
    return false
  }

  // D-51-02/D-51-04 (Phase 51 Plan 12): the helper is ready (status
  // 'ready') or has fallen back to identity-only (status
  // 'fallback-identity') -- either way the game IS about to launch, so
  // this is the right point to log/notify about any limited
  // functionality BEFORE runWineCommand fires. Re-reads the verdict
  // fresh (not the `persistedScan` captured before placeShimForGame
  // ran) so a 'placed'/'no-steam-api' write above is reflected.
  maybeNotifyBridgeLimited(
    steamGame,
    readBridgeVerdict(steamGame.appId),
    helperReady.status === 'fallback-identity'
  )

  // D-51-09 (Task 2): hand the shim's required interface-version pool to
  // the cfg -- the FRESH verdict's own pool when this call just (re)placed
  // or no-op-confirmed one ('placed' only has a verdict; 'already-placed'
  // has none, so the previously-persisted scan's pool is reused since the
  // shim itself did not change; 51-REVIEW WR-01: or the pool retained when
  // that scan was auto-cleared).
  const interfaceVersionsForConfig =
    shimResult.verdict?.interfaceVersions ?? persistedInterfaceVersions
  // quick 261023-ue0: the shim reads the cfg beside ITS OWN module, so
  // hand writeBridgeConfig every shim path (rewritten on every launch,
  // including 'already-placed').
  const shimPaths =
    shimResult.status === 'placed-miss'
      ? shimResult.shimPaths
      : (shimResult.shimPaths ?? [shimResult.shimPath])
  // Spike 034: the tier-2 profile's shimFeatures ride in the same cfg.
  const { steamShimFeatureCfgLines } = await import('./bridgeKnownFixes')
  const configResult = writeBridgeConfig({
    exePath,
    bottleName: bridgeBottleSettings.wineCrossoverBottle,
    appId: steamGame.appId,
    port: helperReady.port,
    // WR-03: the secret of the exact helper entry whose port this is.
    secret: helperReady.secret,
    shimPaths,
    fixLines: steamShimFeatureCfgLines(steamGame.appId),
    ...(interfaceVersionsForConfig
      ? { interfaceVersions: interfaceVersionsForConfig }
      : {})
  })
  if (configResult.status === 'error') {
    logWarning(
      `SteamGame: launchBridgeGame failed to write gamelib_bridge.cfg for appId ${steamGame.appId}: ${configResult.error}`,
      LogPrefix.Steam
    )
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'bridge-config-write-failed',
      fallbackAvailable: true
    })
    return false
  }

  logInfo(
    `SteamGame: launching appId ${steamGame.appId} via the Steam bridge (${exePath}, helper port=${helperReady.port}, cfg copies=${1 + (configResult.extraPaths?.length ?? 0)})`,
    LogPrefix.Steam
  )
  return steamGame.fireBridgeWineLaunch(
    exePath,
    bridgeBottleSettings,
    undefined,
    overlayLaunch
  )
}

export async function fireBridgeWineLaunch(
  steamGame: SteamGame,
  exePath: string,
  bridgeBottleSettings: GameSettings,
  drm?: DrmWineLaunch,
  overlay?: OverlayLaunchPayload
): Promise<boolean> {
  const reportLaunchFailure = (error: unknown) => {
    logWarning(
      [`SteamGame: bridge launch failed for appId ${steamGame.appId}`, error],
      LogPrefix.Steam
    )
    if (drm) {
      // D-13: no session mark, no steamBridgeSetupRequired.
      maybeNotifyDrmModeFailed(
        steamGame,
        'bottle-stage',
        drmStepError('bottle-stage', 'wine launch failed: ' + String(error))
          .cause
      )
      return
    }
    markBridgeFailedThisSession(steamGame.appId)
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: steamGame.appId,
      reason: 'bridge-launch-failed',
      fallbackAvailable: true
    })
  }

  // quick 261024-urq: this launch's own record (see bridgeLaunchBottles).
  const launchRecord = { bottle: bridgeBottleSettings.wineCrossoverBottle }
  const clearLaunchRecord = () => {
    if (bridgeLaunchBottles.get(steamGame.appId) === launchRecord) {
      bridgeLaunchBottles.delete(steamGame.appId)
    }
  }
  // D-15: the trace is re-logged once, when the game is gone.
  let relogged = false
  const relogOnce = () => {
    if (!drm || relogged) return
    relogged = true
    relogDrmTrace(steamGame.appId, drm.traceFile)
  }

  // Phase 59 (D-10/D-11): declared before the try so the catch can cancel it.
  let deadline: LaunchDeadline | undefined
  const deadlineFired = () => deadline?.state === 'fired'

  // Phase 60: true only where overlay tokens were actually applied to this
  // launch. Gates the attach watch, wine-log sink and D-10 check.
  let overlayInjected = false

  try {
    const { runWineCommand } = await import('backend/launcher')
    const { startBottleProcessMonitor, getBottleProcessMonitorPhase } =
      await import('./bottleProcessMonitor')
    const { armLaunchDeadline, bindDeadlineToMonitor } =
      await import('./engine/launchDeadline')
    const { getEngineSelection, clearEngineSelection } =
      await import('./engine/engineRegistry')
    const { applySteamBridgeKnownFixes, steamBridgeLaunchCommandParts } =
      await import('./bridgeKnownFixes')
    const { applyBridgeBottleDllOverrides } =
      await import('./bridge/bottleDllOverrides')
    const { installSteamBridgeSharedRedists } =
      await import('./bridge/sharedRedistInstall')

    // Phase 51 Plan 01 Task 2 (D-51-01): the helper's lifetime is tied to
    // THIS game's own process lifetime, never to the whole app session —
    // the monitor's onStopped fires exactly once, when the matched
    // process(es) are gone, and tears down only this appId's helper.
    // stopBridgeHelper is a safe no-op when no-steam-api never spawned one.
    //
    // Plan 51-23 (51-UAT item 2): the monitor MUST start before the wine
    // child is awaited. runWineCommand resolves only on the child's
    // `close`, and CrossOver's `winewrapper.exe --run` lives as long as the
    // game, so starting the monitor after the await meant it started after
    // its own game had exited. The wine promise is therefore never awaited:
    // its settlement is routed to the monitor's launcherExited() instead.
    const installRoot = resolveBridgeGameInstallRoot(
      steamGame,
      exePath,
      bridgeBottleSettings.wineCrossoverBottle
    )

    // Phase 59 (D-10/D-11): armed before the shared-redist step so the
    // default covers a first-run prefix update and the redists. Cancelled
    // when the monitor first sees the game process. Needs a monitor to be
    // cancellable; the monitor matches built-in-engine processes by host path
    // (1a5b750bb, G8), and bindDeadlineToMonitor stands the deadline down
    // when no monitor starts (59-REVIEW CR-01).
    const sel = getEngineSelection(steamGame.appId)
    if (!installRoot) {
      logInfo(
        `SteamGame: appId ${steamGame.appId} has no process monitor, so no launch deadline is armed`,
        LogPrefix.Steam
      )
    } else {
      deadline = armLaunchDeadline({
        appId: steamGame.appId,
        onDeadline: () =>
          onBridgeLaunchDeadline(steamGame, clearLaunchRecord, sel)
      })
    }

    // quick 261024-tny: the known-fixes hook for the bridge path. It runs
    // BEFORE the monitor because the monitor's start sends 'launching',
    // which supersedes the 'winetricks'/'redist' statuses the applier sends,
    // while the monitor must still start before the wine child is awaited
    // (Plan 51-23). It runs on every launch (D2: verbs re-run, no ledger).
    // The applier never rejects by contract; the .catch is belt-and-braces so
    // a fix problem can never reach the outer catch, whose
    // reportLaunchFailure would mark the bridge failed for the session.
    const fixedSettings = await applySteamBridgeKnownFixes(
      steamGame.appId,
      bridgeBottleSettings,
      installRoot,
      // quick 261028-k7l: exePath feeds the generic GameMaker D3D11 runner default.
      exePath
    ).catch((error: unknown) => {
      logWarning(
        `SteamGame: known-fixes application failed for appId ${steamGame.appId}: ${String(error)}`,
        LogPrefix.Steam
      )
      return bridgeBottleSettings
    })
    if (deadlineFired()) return false

    // quick 261025-rkj: Steam's first-launch "Installing ..." step for the
    // Steamworks Common Redistributables (VC++/DirectX) the game's appinfo
    // declares, run in this appId's own bridge bottle under the 'redist'
    // status. After the known fixes so a trusted `registry` fix can pre-write
    // a HasRunKey and suppress a component; before the monitor because its
    // 'launching' supersedes 'redist'. Never rejects by contract; the .catch is
    // belt-and-braces so nothing reaches the outer catch (markBridgeFailedThisSession).
    // No signal is passed: the bridge launch has no abort signal, and stop() has no
    // handle on this step (bridgeLaunchBottles is recorded after it). The helper accepts
    // one (WR-06) for when a launch-scoped AbortController exists.
    //
    // Phase 54: Play passes no allowLogon, so a Play can reuse an open session
    // but never opens an authenticated logon. Unsettled redists are fetched by
    // the bridge install step (plan 08 Task 2) or the next session-holding action.
    await installSteamBridgeSharedRedists(
      steamGame.appId,
      bridgeBottleSettings
    ).catch((error: unknown) => {
      logWarning(
        `SteamGame: shared redist install failed for appId ${steamGame.appId}: ${String(error)}`,
        LogPrefix.Steam
      )
    })
    if (deadlineFired()) return false

    // 53-19 (D-53-06): measured per-title DLL override in this appId's own
    // bridge bottle (Overlooting nvapi64). Never rejects; .catch is
    // belt-and-braces for the same reason as above.
    let launchSettings = await applyBridgeBottleDllOverrides(
      steamGame.appId,
      fixedSettings
    ).catch((error: unknown) => {
      logWarning(
        `SteamGame: DLL override application failed for appId ${steamGame.appId}: ${String(error)}`,
        LogPrefix.Steam
      )
      return fixedSettings
    })
    if (deadlineFired()) return false

    let drmCommandPrefix: string[] = []
    if (drm) {
      const { ready } = drm
      // One runner per bottle (D-11): a known fix must not swap it back.
      if (
        launchSettings.wineVersion.bin !== ready.bottleSettings.wineVersion.bin
      ) {
        logWarning(
          `SteamGame: a launch step changed the wine runner for appId ${steamGame.appId}; restoring the DRM clone runner (D-11)`,
          LogPrefix.Steam
        )
        launchSettings = {
          ...launchSettings,
          wineVersion: ready.bottleSettings.wineVersion,
          winePrefix: ready.bottleSettings.winePrefix
        }
      }
      const env = (drm.buildEnv ?? buildDrmLaunchEnvironment)({
        appId: steamGame.appId,
        traceFile: drm.traceFile,
        macSteamClientDir: drm.macSteamClientDir,
        steamDirHost: ready.bottle.steamDirHost,
        windowsDllDir: ready.runner.windowsDllDir,
        unixDllDir: ready.runner.unixDllDir,
        launchForm: ready.launchForm,
        dllPathChannel: DRM_DLLPATH_CHANNEL,
        dllOverridesChannel: DRM_DLLOVERRIDES_CHANNEL,
        base: launchSettings.enviromentOptions ?? [],
        ...(drm.overlayTokens ? { overlayTokens: drm.overlayTokens } : {})
      })
      if (env.status === 'error') {
        maybeNotifyDrmModeFailed(
          steamGame,
          'bottle-stage',
          drmStepError('bottle-stage', env.cause).cause
        )
        deadline?.cancel('launch-error')
        return false
      }
      launchSettings = {
        ...launchSettings,
        enviromentOptions: env.enviromentOptions
      }
      // Dev-only diagnostic channel list (56-20); validated, DRM launches only.
      const wineDebug = drmWineDebugFromEnv(process.env.GAMELIB_DRM_WINEDEBUG)
      if (wineDebug) {
        launchSettings = {
          ...launchSettings,
          enviromentOptions: [
            ...(launchSettings.enviromentOptions ?? []),
            { key: 'WINEDEBUG', value: wineDebug }
          ]
        }
        logInfo(
          `SteamGame: drm launch appId ${steamGame.appId}: WINEDEBUG=${wineDebug} (GAMELIB_DRM_WINEDEBUG)`,
          LogPrefix.Steam
        )
      }
      drmCommandPrefix = env.commandPrefix
      if (drm.overlayTokens?.length) overlayInjected = true

      for (const cmd of env.registryCommands) {
        let timer: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<'timeout'>((resolveTimeout) => {
          timer = setTimeout(
            () => resolveTimeout('timeout'),
            DRM_REGISTRY_TIMEOUT_MS
          )
          timer.unref?.()
        })
        let failure: string | undefined
        try {
          const res = await Promise.race([
            runWineCommand({
              gameSettings: launchSettings,
              commandParts: [...cmd],
              wait: true,
              protonVerb: 'run',
              skipPrefixCheckIKnowWhatImDoing: true
            }),
            timeout
          ])
          if (res === 'timeout') {
            failure = `timed out after ${DRM_REGISTRY_TIMEOUT_MS} ms`
          } else if (res.code !== 0) {
            // log-secret-gate-exempt: reg.exe stderr is wine's own diagnostic text, no credential.
            failure = `code=${String(res.code)}, stderr=${String(res.stderr ?? '').slice(0, 200)}`
          }
        } catch (error) {
          failure = String(error)
        } finally {
          if (timer) clearTimeout(timer)
        }
        if (failure !== undefined) {
          maybeNotifyDrmModeFailed(
            steamGame,
            'bottle-stage',
            drmStepError(
              'bottle-stage',
              `DLL override registry write failed: ${failure}`
            ).cause
          )
          deadline?.cancel('launch-error')
          return false
        }
        if (deadlineFired()) return false
      }
    }

    if (!drm && overlay?.kind === 'env') {
      // Fallback engine (D-07): its own runner stands; no restore.
      try {
        launchSettings = {
          ...launchSettings,
          enviromentOptions: mergeOverlayEnvVars(
            launchSettings.enviromentOptions ?? [],
            overlay.vars
          )
        }
        overlayInjected = true
      } catch (error) {
        notifyOverlaySetupFailed(steamGame, 'env', String(error))
      }
    } else if (!drm && overlay?.kind === 'cx-env') {
      // One runner per bottle (T-60-08-04): a known fix must not swap it.
      if (launchSettings.wineVersion.bin !== overlay.runnerBin) {
        logWarning(
          `SteamGame: a launch step changed the wine runner for appId ${steamGame.appId}; restoring the overlay clone runner`,
          LogPrefix.Steam
        )
        launchSettings = {
          ...launchSettings,
          wineVersion: getBridgeBottleSettings(steamGame.appId).wineVersion
        }
      }
      const merged = appendCxEnvTokens(
        launchSettings.enviromentOptions ?? [],
        overlay.tokens
      )
      if (merged.status === 'ok') {
        launchSettings = { ...launchSettings, enviromentOptions: merged.env }
        overlayInjected = true
      } else {
        notifyOverlaySetupFailed(steamGame, 'env', merged.cause)
      }
    }

    const launchStartedAt = Date.now()

    // D-11: diagnostic only (no UI, no toast). The watcher is bounded,
    // unref'd and abortable (sidecar exit contract); it reads Mac Steam's
    // console_log under the real HOME, the declared real-profile read arm.
    // Never awaited by the launch.
    let attachStarted = false
    const startAttachWatch = () => {
      if (attachStarted || !overlayInjected) return
      attachStarted = true
      void Promise.resolve(
        watchOverlayAttach({
          appId: steamGame.appId,
          consoleLogPath: macSteamConsoleLogPath(userHome),
          launchStartedAt,
          // 60-UAT G2: the DRM helper hop attaches about 13 s in.
          ...(drm ? { timeoutMs: OVERLAY_ATTACH_DRM_TIMEOUT_MS } : {})
        })
      ).catch(() => undefined)
    }

    // D-10: an overlay launch whose game vanishes within the window gets a
    // text pointer to Run > Steam overlay (orchestrator resolution 4: an
    // inline button would need a settings deep link the app does not have).
    // Never retries, never changes settings.
    let firstMatchAt: number | undefined
    let stoppedAt: number | undefined
    let wrapperSettled = false
    let wrapperCode: number | undefined
    let overlayExitDecided = false
    let graceTimer: ReturnType<typeof setTimeout> | undefined
    const maybeReportOverlayAbnormalExit = (graceFired: boolean) => {
      if (!overlayInjected || overlayExitDecided) return
      if (stoppedAt === undefined) return
      if (!wrapperSettled && !graceFired) return
      overlayExitDecided = true
      if (graceTimer) clearTimeout(graceTimer)
      graceTimer = undefined
      if (
        !isAbnormalOverlayExit({
          firstMatchAt,
          stoppedAt,
          wrapperCode
        })
      ) {
        return
      }
      logWarning(formatOverlayExitNoticeLine(steamGame.appId), LogPrefix.Steam)
      const pushed = publishOverlayExitNotice(steamGame.appId)
      logInfo(
        `SteamGame: appId ${steamGame.appId} overlay exit notice surface=in-app pushed=${pushed}`,
        LogPrefix.Steam
      )
      notify({
        title: i18next.t(
          'gamelib:steam.overlay.exit.title',
          'Game closed soon after starting'
        ),
        body: i18next.t(
          'gamelib:steam.overlay.exit.body',
          "The game exited within 30 seconds with the Steam overlay on. If this is a crash and keeps happening, try turning the overlay off in this game's settings: Run > Steam overlay."
        )
      })
    }

    let handle: ReturnType<typeof startBottleProcessMonitor> = null
    if (installRoot) {
      handle = bindDeadlineToMonitor(
        deadline,
        startBottleProcessMonitor({
          appId: steamGame.appId,
          installPath: installRoot,
          bottleDir: getBottleDir(bridgeBottleSettings.wineCrossoverBottle),
          kind: 'bridge',
          onFirstMatch: () => {
            deadline?.cancel('first-match')
            if (overlayInjected) {
              firstMatchAt ??= Date.now()
              startAttachWatch()
            }
          },
          onUnavailable: () => deadline?.cancel('monitor-unavailable'),
          onStopped: () => {
            clearLaunchRecord()
            stopBridgeHelper(steamGame.appId)
            clearEngineSelection(steamGame.appId)
            relogOnce()
            if (overlayInjected && stoppedAt === undefined) {
              stoppedAt = Date.now()
              if (!wrapperSettled && !overlayExitDecided) {
                graceTimer = setTimeout(
                  () => maybeReportOverlayAbnormalExit(true),
                  OVERLAY_EXIT_GRACE_MS
                )
                graceTimer.unref?.()
              }
              maybeReportOverlayAbnormalExit(false)
            }
          }
        }),
        (m) =>
          logInfo(`SteamGame: appId ${steamGame.appId} ${m}`, LogPrefix.Steam)
      )
    } else {
      logWarning(
        `SteamGame: launchBridgeGame could not resolve an install root for appId ${steamGame.appId} — no process monitor started, helper will outlive the game until app quit`,
        LogPrefix.Steam
      )
    }

    bridgeLaunchBottles.set(steamGame.appId, launchRecord)
    if (drm) {
      logInfo(drm.anchorLine, LogPrefix.Steam)
      logInfo(
        `SteamGame: launching appId ${steamGame.appId} in steamclient-layer DRM mode (helper=${drm.ready.bottle.helperWinPath}, crossover=${drm.ready.anchor.crossover}, client=${drm.ready.anchor.client}, form=${drm.ready.launchForm})`,
        LogPrefix.Steam
      )
    }
    // The DRM launch is the declared real-profile arm of the two-profile
    // rule (gamelib-conventions): it needs the user's real CrossOver bottle
    // and Mac Steam's steamclient.dylib under the real HOME, so it inherits
    // process.env and no HOME/XDG entry is assigned.
    // Real Steam starts the game in the install root (or the launch entry's
    // workingdir), not the exe's own dir: Grim Dawn (x64/Grim Dawn.exe)
    // finds database/ and Resources/ relative to its cwd. The helper's
    // CreateProcessW passes a NULL lpCurrentDirectory, so the game inherits
    // this cwd as its Windows current directory.
    const launchCwd =
      resolveBridgeLaunchWorkingDir(steamGame.appId) ??
      resolveBridgeGameInstallRoot(
        steamGame,
        exePath,
        bridgeBottleSettings.wineCrossoverBottle
      ) ??
      dirname(exePath)
    const wineLog = drm
      ? createDrmWineLogAppender(drmWineLogPathFor(drm.traceFile))
      : null
    if (drm) {
      logInfo(
        `SteamGame: drm launch appId ${steamGame.appId}: wine log ${drmWineLogPathFor(drm.traceFile)}`,
        LogPrefix.Steam
      )
    }
    // D-15: TCP overlay launches get their own bounded wine log; DRM keeps its
    // one. Shim lines (capped, sanitised) are copied into the launch log on
    // both routes.
    const overlayWineLog =
      overlayInjected && !drm
        ? openOverlayWineLog(
            buildOverlayPaths(appFolder)?.traceRoot ?? '',
            steamGame.appId,
            Date.now()
          )
        : null
    if (overlayWineLog) {
      logInfo(
        `SteamGame: overlay launch appId ${steamGame.appId}: wine log ${overlayWineLog.path}`,
        LogPrefix.Steam
      )
    }
    const shimForward = overlayInjected
      ? createShimLineForwarder(
          (line) =>
            logInfo(
              `SteamGame: appId ${steamGame.appId} ${line}`,
              LogPrefix.Steam
            ),
          50
        )
      : null
    const winePromise = runWineCommand({
      commandParts: drm
        ? [...drmCommandPrefix, drm.ready.bottle.helperWinPath, drm.gameWinPath]
        : steamBridgeLaunchCommandParts(steamGame.appId, exePath, installRoot),
      gameSettings: launchSettings,
      wait: false,
      protonVerb: 'run',
      startFolder: launchCwd,
      skipPrefixCheckIKnowWhatImDoing: true,
      ...(wineLog || overlayWineLog || shimForward
        ? {
            options: {
              onOutput: (chunk: string) => {
                wineLog?.write(chunk)
                overlayWineLog?.write(chunk)
                shimForward?.(chunk)
              }
            }
          }
        : {})
    })
    if (!handle) startAttachWatch()
    void winePromise
      .finally(() => {
        wineLog?.close()
        overlayWineLog?.close()
      })
      .catch(() => undefined)
    void winePromise.then(
      (res) => {
        wrapperSettled = true
        wrapperCode = typeof res?.code === 'number' ? res.code : undefined
        maybeReportOverlayAbnormalExit(false)
        // With a monitor, its onStopped clears the record when the game is
        // gone; the launcher process exiting says nothing about the game.
        if (!handle) {
          clearLaunchRecord()
          clearEngineSelection(steamGame.appId)
          relogOnce()
        }
        if (getBottleProcessMonitorPhase(steamGame.appId) !== 'running') {
          deadline?.cancel('launcher-exited')
        }
        handle?.launcherExited()
      },
      (error: unknown) => {
        wrapperSettled = true
        maybeReportOverlayAbnormalExit(false)
        deadline?.cancel('launch-error')
        clearEngineSelection(steamGame.appId)
        clearLaunchRecord()
        relogOnce()
        reportLaunchFailure(error)
        handle?.launcherExited()
      }
    )

    return true
  } catch (error) {
    deadline?.cancel('launch-error')
    void import('./engine/engineRegistry').then((m) =>
      m.clearEngineSelection(steamGame.appId)
    )
    clearLaunchRecord()
    reportLaunchFailure(error)
    return false
  }
}
