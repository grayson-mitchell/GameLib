/**
 * quick 261117-p38: "Launch without Steam" for games that use no Steam API and
 * carry no Steam DRM wrapper.
 *
 * - Mac-native: GameLib spawns the game's own Mach-O binary with the PICS launch
 *   arguments and owns the process (tracked, so Stop ends it). No Steam env.
 * - Bridge (Windows): the existing bridge launch runs the exe in its bottle with
 *   no shim, no helper, no overlay and no DRM mode (`withoutSteam`).
 *
 * quick 261117-q1t: now a per-game setting honoured by Play. The sidecar
 * re-derives the verdict here; DRM and every non-launchable case fall back to
 * the normal Steam launch, never a failure. Nothing in this folder writes, copies or
 * emulates steam_api (DRM boundary).
 */
import { existsSync } from 'graceful-fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendGameStatusUpdate } from 'backend/utils'
import type LogWriter from 'backend/logger/targetWriter'
import type { ProcessRunner } from 'backend/process/types'
import type SteamGame from '../games'
import { launchBridgeGame } from '../gameBridgeLaunchGate'
import {
  formatDirectLaunchStartedLine,
  isDirectLaunchEarlyExit,
  pushDirectLaunchNotice,
  reportDirectLaunchEarlyExit
} from './directLaunchOutcome'
import { getSteamDirectLaunchVerdict } from './directLaunchProbes'
import {
  STEAM_DIRECT_TRACK_RUNNER,
  type DirectLaunchPlan,
  type DirectLaunchVerdict
} from './directLaunchVerdict'

export interface MacNativeLaunchDeps {
  runner: Pick<ProcessRunner, 'run'>
  sendStatus(status: 'playing' | 'done'): void
  log(message: string): void
  info(message: string): void
  now(): number
  /** quick 261120-8hb: the binary exited on its own within DIRECT_LAUNCH_EARLY_EXIT_MS of spawn. */
  onEarlyExit(elapsedMs: number): void
}

function isInside(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Spawns the binary; resolves true once it has started, false when it never
 * did. The run itself is not awaited: its settlement sends the terminal 'done'.
 */
export function launchMacNativeWithoutSteam(
  deps: MacNativeLaunchDeps,
  appId: string,
  installPath: string,
  launch: DirectLaunchPlan
): Promise<boolean> {
  const { binaryPath } = launch
  if (!binaryPath || !isInside(installPath, binaryPath)) {
    deps.log(
      `direct launch refused for appId ${appId}: binary is outside the install folder`
    )
    return Promise.resolve(false)
  }
  if (!existsSync(binaryPath)) {
    deps.log(`direct launch refused for appId ${appId}: binary is missing`)
    return Promise.resolve(false)
  }
  const cwd =
    launch.workingDir && isInside(installPath, launch.workingDir)
      ? launch.workingDir
      : dirname(binaryPath)

  return new Promise<boolean>((resolveStarted) => {
    let started = false
    let spawnedAt = 0
    deps.runner
      .run(binaryPath, launch.args, {
        cwd,
        track: { runner: STEAM_DIRECT_TRACK_RUNNER, key: appId },
        timeout: {
          none: true,
          reason: 'a game session lasts as long as the player keeps it open'
        },
        resolveOn: 'exit',
        onSpawn: () => {
          started = true
          spawnedAt = deps.now()
          deps.info(
            formatDirectLaunchStartedLine(appId, 'mac-native', binaryPath)
          )
          deps.sendStatus('playing')
          resolveStarted(true)
        }
      })
      .then((res) => {
        // Stop sets killedByUs, so a user Stop never reads as "needs Steam".
        if (!started || res.killedByUs === true) return
        const stoppedAt = deps.now()
        if (!isDirectLaunchEarlyExit(spawnedAt, stoppedAt)) return
        try {
          deps.onEarlyExit(stoppedAt - spawnedAt)
        } catch {
          // A notice can never change the launch's result or log a false failure.
        }
      })
      .catch((err: unknown) => {
        deps.log(`direct launch of appId ${appId} failed: ${String(err)}`)
      })
      .finally(() => {
        deps.sendStatus('done')
        if (!started) resolveStarted(false)
      })
  })
}

export interface LaunchWithoutSteamSeams {
  getVerdict(steamGame: SteamGame): Promise<DirectLaunchVerdict>
}

export async function launchWithoutSteam(
  steamGame: SteamGame,
  seams: LaunchWithoutSteamSeams = { getVerdict: getSteamDirectLaunchVerdict }
): Promise<boolean> {
  const { appId, deps } = steamGame
  // quick 261117-q1t: the setting never fails a launch; anything not launchable goes through Steam.
  const viaSteam = (
    reason: string,
    level: 'info' | 'warn'
  ): Promise<boolean> => {
    const message = `launch without Steam skipped for appId ${appId} (${reason}); using the normal Steam launch`
    if (level === 'info') logInfo(message, LogPrefix.Steam)
    else logWarning(message, LogPrefix.Steam)
    return steamGame.launch(undefined as unknown as LogWriter)
  }
  const verdict = await seams.getVerdict(steamGame)
  if (!verdict.applies) {
    return viaSteam(
      verdict.reason,
      verdict.reason === 'steam-drm' ? 'warn' : 'info'
    )
  }
  if (verdict.warning !== 'none') {
    logInfo(
      `launch without Steam for appId ${appId} carries warning ${verdict.warning}`,
      LogPrefix.Steam
    )
  }
  if (verdict.kind === 'bridge') {
    logInfo(
      `direct launch of bridge appId ${appId} (no shim, no helper, no overlay)`,
      LogPrefix.Steam
    )
    let needsSteam = false
    const launched = await launchBridgeGame(steamGame, {
      withoutSteam: {
        args: verdict.launch.args,
        onNeedsSteam: () => {
          needsSteam = true
        }
      }
    })
    // The bridge in-flight entry is released by now; launch() cannot join itself.
    if (!launched && needsSteam) return viaSteam('late Steam DRM', 'warn')
    return launched
  }
  const installPath = steamGame.getGameInfo().install?.install_path
  if (
    typeof installPath !== 'string' ||
    installPath.length === 0 ||
    !verdict.launch.binaryPath
  ) {
    return viaSteam('no launch binary', 'warn')
  }
  const started = await launchMacNativeWithoutSteam(
    {
      runner: deps.runner,
      sendStatus: (status) =>
        sendGameStatusUpdate(deps, { appName: appId, runner: 'steam', status }),
      log: (m) => logWarning(m, LogPrefix.Steam),
      info: (m) => logInfo(m, LogPrefix.Steam),
      now: () => Date.now(),
      onEarlyExit: (ms) =>
        void reportDirectLaunchEarlyExit(steamGame, 'mac-native', ms)
    },
    appId,
    installPath,
    verdict.launch
  )
  if (!started) await pushDirectLaunchNotice(steamGame, 'direct-launch-failed')
  return started
}
