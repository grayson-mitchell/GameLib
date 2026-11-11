/**
 * Bridge launch cluster lifted out of SteamGame (62-07, D-06 mechanical
 * lift: this -> steamGame).
 * The G26 in-flight dedupe wrapper lives in gameBridgeLaunchGate so this
 * body is reachable as a module export (quick-261108-ca6). Cross-module calls
 * are free functions, so a test spies on the module export.
 */
import { createRunTool } from 'backend/engine/runTool'
import i18next from 'i18next'
import { existsSync } from 'graceful-fs'
import { basename } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { checkConnectivityNow } from 'backend/connectivityNow'
import { notify } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import { sendFrontendMessage } from '../../ipc'
import {
  isBridgeBottleReady,
  getBridgeBottleSettings,
  getDrmBridgeRunner
} from './bridgeBottle'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
// Phase 60: Steam overlay in bridged games (macOS).
import { type OverlayLaunchPayload } from './bridge/overlay/overlayLaunch'
import { placeShimForGame } from './bridge/shimGenerate'
import { detectLaunchDrmWrapper } from './bridge/drm/drmScanExe'
import {
  resolveBridgeMode,
  drmStepError
} from './bridge/drm/steamclientLayerMode'
import { resolveBridgeLaunchExe } from './bridge/launchTarget'
import { ensureBridgeHelperReady } from './bridge/helperProcess'
import { writeBridgeConfig } from './bridge/bridgeConfig'
import {
  readBridgeVerdict,
  writeBridgeScanVerdict,
  writeBridgeModeVerdict
} from './bridge/bridgeVerdict'
import { appFolder } from 'backend/constants/paths'
import type SteamGame from './games'
import {
  persistBridgeDrmSignal,
  reconcileBridgePrescreen,
  resolveBridgeGameInstallRoot
} from './bridgeInstallState'
import {
  maybeNotifyBridgeLimited,
  maybeNotifyDrmModeFailed,
  notifyCrossoverRequired,
  readLaunchExeCegMarkers,
  selectLaunchEngine,
  sendLaunchDone,
  launchDrmModeGame
} from './gameLaunch'
import { fireBridgeWineLaunch } from './gameBridgeWineLaunch'
import { prepareTcpOverlay } from './gameLaunchOverlay'

export async function launchBridgeGameBody(
  steamGame: SteamGame
): Promise<boolean> {
  // G25: one fresh connectivity check at Play (the monitor can be stale); the launch-target
  // read and the early offline refusal both use this result.
  const connectivity = await checkConnectivityNow(
    `launch ${steamGame.appId}`,
    steamGame.deps.onlineMonitor
  )
  const exePath = await resolveBridgeLaunchExe(
    steamGame.deps,
    steamGame.appId,
    {
      offline: connectivity.offline
    }
  )
  if (!exePath) {
    logWarning(
      `SteamGame: could not resolve a Windows launch executable for appId ${steamGame.appId} — not launching a bare/undefined path`,
      LogPrefix.Steam
    )
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
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
  let bridgeBottleSettings = getBridgeBottleSettings(
    steamGame.deps,
    steamGame.appId
  )
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
      ? await readLaunchExeCegMarkers(steamGame, drmExe, 'launchBridgeGameBody')
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
    steamGame.deps,
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
    const { preflightCrossover } = await import('backend/engine/engineDecision')
    const { steamDecisionDeps, steamDecisionServices } =
      await import('./engine/steamEngineDeps')
    const pre = await preflightCrossover(
      bridgeBottleSettings.wineCrossoverBottle,
      steamDecisionDeps(steamDecisionServices(steamGame.deps))
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
  const drm = await steamGame.deps.steamProcesses.drm.drmLaunchSetup(
    {
      appId: steamGame.appId,
      appFolder,
      bottleName: bridgeBottleSettings.wineCrossoverBottle,
      exePath,
      installRoot: drmInstallRoot ?? '',
      installdir: drmInstallRoot ? basename(drmInstallRoot) : '',
      drmWrapper: launchDrmWrapper,
      cegMarkers: launchCegMarkers,
      drmExe
    },
    {
      ...steamGame.deps,
      runTool: createRunTool({ runner: steamGame.deps.runner })
    }
  )
  if (drm.status === 'not-applicable') {
    // drmLaunchSetup cleared the clone runner, so the TCP launch must not
    // keep the clone wineVersion (D-11).
    if (hadDrmRunner) {
      bridgeBottleSettings = getBridgeBottleSettings(
        steamGame.deps,
        steamGame.appId
      )
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
      launched = await launchDrmModeGame(
        steamGame,
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
  const persistedVerdict = readBridgeVerdict(steamGame.deps, steamGame.appId)
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
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
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
    writeBridgeScanVerdict(steamGame.deps, steamGame.appId, shimResult.verdict)
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
    const { drmWrapper: _cleared, ...scanWithoutDrm } = persistedScan
    writeBridgeScanVerdict(steamGame.deps, steamGame.appId, scanWithoutDrm)
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
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
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
    return fireBridgeWineLaunch(
      steamGame,
      exePath,
      bridgeBottleSettings,
      undefined,
      overlayLaunch
    )
  }

  // 261027-aue: InitFlat fails fast while Steam is quit or signing in, so the
  // helper layer waits (bounded) for it -- tell the user, who would
  // otherwise see up to a minute of silence after pressing Play.
  const helperReady = await ensureBridgeHelperReady(
    steamGame.deps,
    steamGame.appId,
    {
      onWaitingForSteam: (cause) =>
        notify(steamGame.deps, {
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
    }
  )
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
      steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
        steamGame.appId
      )
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
    readBridgeVerdict(steamGame.deps, steamGame.appId),
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
    steamGame.deps.steamSession.gameSession.markBridgeFailedThisSession(
      steamGame.appId
    )
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
  return fireBridgeWineLaunch(
    steamGame,
    exePath,
    bridgeBottleSettings,
    undefined,
    overlayLaunch
  )
}
