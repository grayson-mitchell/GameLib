import { readlinkSync, realpathSync } from 'fs'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import { getSteamLibraries, sendGameStatusUpdate } from 'backend/utils'

import { readAcfInstalldir } from './acfInstalldir'
import { sanitizeInstalldir } from './installLocation'
import { readRunningAppId } from './library/runningPoll'
import {
  RUST_STEAMPOLL_RUNNING_HOLD,
  RUST_STEAMPOLL_RUNNING_LAST_APP_ID,
  RUST_STEAMPOLL_RUNNING_RELEASE
} from 'common/types/sidecarTransport'
import { invokeSteamPoll } from './pollRust/rustSteamPoll'
import { startSteamLaunchWatch } from './steamLaunchWatch'
import type { PollerRelease, SteamLaunchWatchDeps } from './steamLaunchWatch'
import type { StopSteamLaunchedGameDeps } from './stopSteamLaunchedGame'

export function steamLaunchedStopDeps(
  deps: ManagerDeps
): StopSteamLaunchedGameDeps {
  return {
    runner: deps.runner,
    clock: deps.clock,
    platform: process.platform,
    log: {
      info: (msg) => logInfo(`SteamGame.stop: ${msg}`, LogPrefix.Steam),
      warn: (msg) => logWarning(`SteamGame.stop: ${msg}`, LogPrefix.Steam)
    },
    getSteamLibraries: () => getSteamLibraries(deps),
    readAcfInstalldir: (steamappsDir, appId) =>
      readAcfInstalldir(deps, steamappsDir, appId),
    sanitizeInstalldir,
    signal: (pid, sig) => void process.kill(pid, sig),
    readExe: (pid) => {
      try {
        return readlinkSync(`/proc/${pid}/exe`)
      } catch {
        return undefined
      }
    },
    realpath: (p) => {
      try {
        return realpathSync(p)
      } catch {
        return p
      }
    },
    selfPids: [process.pid, process.ppid]
  }
}

/**
 * D-13: the running poll lives in Rust. The claim id comes from an awaited steampoll_running_hold;
 * the release closure stays synchronous for the launch watch by capturing that promise, and its
 * first call sends steampoll_running_release once the id has resolved. A failed hold or release is
 * logged and never fails the watch.
 *
 * The claim's rejection handler is attached when the hold is sent, not when the release runs
 * (80-REVIEW C-WR-04): the release comes minutes later, so a rejected hold would otherwise be an
 * unhandled rejection in between. A failed hold has nothing to release.
 */
function rustPollerHold(deps: ManagerDeps, appId: string): PollerRelease {
  const claim: Promise<number | null> = invokeSteamPoll(
    deps,
    RUST_STEAMPOLL_RUNNING_HOLD,
    { appId: Number(appId) }
  ).then(
    (claimId) => claimId as number,
    (e: unknown) => {
      logWarning(
        `SteamGame.watch: running poll claim for ${appId} failed: ${String(e)}`,
        LogPrefix.Steam
      )
      return null
    }
  )
  let released = false
  const release: PollerRelease = (terminalSent) => {
    if (released) return
    released = true
    void claim
      .then((claimId) =>
        claimId === null
          ? undefined
          : invokeSteamPoll(deps, RUST_STEAMPOLL_RUNNING_RELEASE, {
              claimId,
              terminalSent
            })
      )
      .catch((e: unknown) =>
        logWarning(
          `SteamGame.watch: running poll release for ${appId} failed: ${String(e)}`,
          LogPrefix.Steam
        )
      )
  }
  // The claim never rejects (its handler is attached above), so the watch can wait on it.
  release.held = claim
  return release
}

async function rustPollerReports(
  deps: ManagerDeps,
  appId: string
): Promise<boolean> {
  try {
    const last = (await deps.requestRustInvoke(
      RUST_STEAMPOLL_RUNNING_LAST_APP_ID,
      []
    )) as number
    return String(last) === appId
  } catch {
    return false
  }
}

export function steamLaunchWatchDeps(deps: ManagerDeps): SteamLaunchWatchDeps {
  const { signal: _signal, ...stop } = steamLaunchedStopDeps(deps)
  return {
    ...stop,
    log: {
      info: (msg) => logInfo(`SteamGame.watch: ${msg}`, LogPrefix.Steam),
      warn: (msg) => logWarning(`SteamGame.watch: ${msg}`, LogPrefix.Steam)
    },
    registry: deps.libraryManagers.steam.launchWatches,
    sendStatus: (appId, status) =>
      sendGameStatusUpdate(deps, { appName: appId, runner: 'steam', status }),
    pollerReports: (appId) => rustPollerReports(deps, appId),
    pollerHold: (appId) => rustPollerHold(deps, appId),
    readRunningAppId: () =>
      readRunningAppId(
        {
          runner: deps.runner,
          paths: deps.paths,
          requestRustInvoke: deps.requestRustInvoke
        },
        process.platform
      ),
    pidAlive: (pid) => {
      try {
        process.kill(pid, 0)
        return true
      } catch (e) {
        return (e as { code?: string } | null)?.code === 'EPERM'
      }
    }
  }
}

/** Start the launch watch; a watch problem must never fail a launch. */
export function watchSteamLaunch(deps: ManagerDeps, appId: string): void {
  try {
    void startSteamLaunchWatch(steamLaunchWatchDeps(deps), appId)
  } catch (e) {
    logWarning(
      `SteamGame.watch: could not start for ${appId}: ${String(e)}`,
      LogPrefix.Steam
    )
  }
}
