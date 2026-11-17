/**
 * quick 261117-p38: "Launch without Steam" for games that use no Steam API and
 * carry no Steam DRM wrapper.
 *
 * - Mac-native: GameLib spawns the game's own Mach-O binary with the PICS launch
 *   arguments and owns the process (tracked, so Stop ends it). No Steam env.
 * - Bridge (Windows): the existing bridge launch runs the exe in its bottle with
 *   no shim, no helper, no overlay and no DRM mode (`withoutSteam`).
 *
 * The sidecar re-derives the verdict here and refuses an ineligible game
 * whatever the renderer sent. Nothing in this folder writes, copies or
 * emulates steam_api (DRM boundary).
 */
import i18next from 'i18next'
import { existsSync } from 'graceful-fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { notify } from 'backend/dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import type { ProcessRunner } from 'backend/process/types'
import type SteamGame from '../games'
import { launchBridgeGame } from '../gameBridgeLaunchGate'
import { getSteamDirectLaunchVerdict } from './directLaunchProbes'
import {
  STEAM_DIRECT_TRACK_RUNNER,
  type DirectLaunchPlan
} from './directLaunchVerdict'

export interface MacNativeLaunchDeps {
  runner: Pick<ProcessRunner, 'run'>
  sendStatus(status: 'playing' | 'done'): void
  log(message: string): void
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
          deps.sendStatus('playing')
          resolveStarted(true)
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

function notifyNotEligible(steamGame: SteamGame): void {
  notify(steamGame.deps, {
    title: steamGame.getGameInfo().title,
    // eslint-disable-next-line import-x/no-named-as-default-member
    body: i18next.t(
      'gamelib:steam.directLaunch.notEligible',
      'This game can no longer launch without Steam. Use Play instead.'
    )
  })
}

function notifyFailed(steamGame: SteamGame): void {
  const game = steamGame.getGameInfo().title
  notify(steamGame.deps, {
    title: game,
    // eslint-disable-next-line import-x/no-named-as-default-member
    body: i18next.t(
      'gamelib:steam.directLaunch.failed',
      'Could not launch {{game}} without Steam.',
      { game }
    )
  })
}

export async function launchWithoutSteam(
  steamGame: SteamGame
): Promise<boolean> {
  const { appId, deps } = steamGame
  const verdict = await getSteamDirectLaunchVerdict(steamGame)
  if (!verdict.eligible) {
    logWarning(
      `direct launch refused for appId ${appId}: ${verdict.reason}`,
      LogPrefix.Steam
    )
    notifyNotEligible(steamGame)
    return false
  }
  if (verdict.kind === 'bridge') {
    logInfo(
      `direct launch of bridge appId ${appId} (no shim, no helper, no overlay)`,
      LogPrefix.Steam
    )
    return launchBridgeGame(steamGame, {
      withoutSteam: { args: verdict.launch.args }
    })
  }
  const installPath = steamGame.getGameInfo().install?.install_path
  if (typeof installPath !== 'string' || installPath.length === 0) {
    notifyNotEligible(steamGame)
    return false
  }
  const started = await launchMacNativeWithoutSteam(
    {
      runner: deps.runner,
      sendStatus: (status) =>
        sendGameStatusUpdate(deps, { appName: appId, runner: 'steam', status }),
      log: (m) => logWarning(m, LogPrefix.Steam)
    },
    appId,
    installPath,
    verdict.launch
  )
  if (!started) notifyFailed(steamGame)
  return started
}
