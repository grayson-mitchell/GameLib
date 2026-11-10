/**
 * fireBridgeWineLaunch lifted out of gameBridgeLaunch (65-14, pure move).
 * Free function taking `steamGame`; references the class only via
 * `import type`.
 */
import i18next from 'i18next'
import { dirname } from 'node:path'
import { GameSettings } from 'common/types'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { sendFrontendMessage } from '../../ipc'
import { getBridgeBottleSettings } from './bridgeBottle'
import { getBottleDir } from 'backend/engine/bottlePrimitives'
import { markGameRunning, markGameStopped } from 'backend/engine/bottleLedger'
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
import { publishOverlayExitNotice } from 'backend/engine/engineState'
import { STEAM_ENGINE_RUNNER } from './engine/steamEngineDeps'
import type { LaunchDeadline } from 'backend/engine/launchDeadline'
import { drmStepError } from './bridge/drm/steamclientLayerMode'
import { resolveBridgeLaunchWorkingDir } from './bridge/launchTarget'
import { stopBridgeHelper } from './bridge/helperRegistry'
import { appFolder, userHome } from 'backend/constants/paths'
import {
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
import { resolveBridgeGameInstallRoot } from './bridgeInstallState'
import { maybeNotifyDrmModeFailed, onBridgeLaunchDeadline } from './gameLaunch'
import { notifyOverlaySetupFailed } from './gameLaunchOverlay'
/**
 * Phase 60 (D-10): how long after the process monitor reports the game gone we
 * wait for the wine wrapper's exit code before deciding on lifetime alone.
 */
const OVERLAY_EXIT_GRACE_MS = 3000

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
    const { runWineCommand } = steamGame.deps.commandRunner
    const { startBottleProcessMonitor, getBottleProcessMonitorPhase } =
      await import('./bottleProcessMonitor')
    const { armLaunchDeadline, bindDeadlineToMonitor } =
      await import('backend/engine/launchDeadline')
    const { getEngineSelection, clearEngineSelection } =
      await import('backend/engine/engineRegistry')
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
        key: steamGame.appId,
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
      steamGame.deps,
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
      steamGame.deps,
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
      steamGame.deps,
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
      const pushed = publishOverlayExitNotice({
        runner: STEAM_ENGINE_RUNNER,
        appName: steamGame.appId
      })
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
    const ledgerBottle = bridgeBottleSettings.wineCrossoverBottle
    if (installRoot) {
      markGameRunning(ledgerBottle, steamGame.appId)
      handle = bindDeadlineToMonitor(
        deadline,
        startBottleProcessMonitor(steamGame.deps, {
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
            markGameStopped(ledgerBottle, steamGame.appId)
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
          markGameStopped(ledgerBottle, steamGame.appId)
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
        markGameStopped(ledgerBottle, steamGame.appId)
        clearLaunchRecord()
        relogOnce()
        reportLaunchFailure(error)
        handle?.launcherExited()
      }
    )

    return true
  } catch (error) {
    deadline?.cancel('launch-error')
    void import('backend/engine/engineRegistry').then((m) =>
      m.clearEngineSelection(steamGame.appId)
    )
    markGameStopped(bridgeBottleSettings.wineCrossoverBottle, steamGame.appId)
    clearLaunchRecord()
    reportLaunchFailure(error)
    return false
  }
}
