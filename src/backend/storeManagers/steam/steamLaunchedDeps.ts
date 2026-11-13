import { readlinkSync, realpathSync } from 'fs'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import { getSteamLibraries, sendGameStatusUpdate } from 'backend/utils'

import { readAcfInstalldir } from './acfInstalldir'
import { sanitizeInstalldir } from './installLocation'
import { readRunningAppId } from './library/runningPoll'
import { startSteamLaunchWatch } from './steamLaunchWatch'
import type { SteamLaunchWatchDeps } from './steamLaunchWatch'
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

function steamLaunchWatchDeps(deps: ManagerDeps): SteamLaunchWatchDeps {
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
    pollerReports: (appId) =>
      String(deps.steamProcesses.runningPoll.lastAppId()) === appId,
    pollerHold: (appId) => deps.steamProcesses.runningPoll.hold(Number(appId)),
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
