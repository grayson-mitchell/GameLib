/**
 * The process-wide Steam instances built once at boot (66.2 D-05/D-15) and handed out through
 * `ManagerDeps.steamProcesses`: the running-game poller, the nettop download monitor and the Mac
 * Steam go-offline instance. Their former module state (a timer, a last-seen appId, the monitors
 * Map, the owed-goonline debt and guided arm) is closure state of
 * the instances built here, so a test builds its own and nothing leaks between boots.
 *
 * Sidecar exit contract: building the instances starts nothing (no timer, child or watcher);
 * the 'steam-running-poll' boot step arms the poller's clock interval, which is unref'd by
 * default and stopped at stdin EOF; the monitors spawn only per polled install and are stopped at
 * stdin EOF.
 */
import { sendFrontendMessage } from '../../ipc'
import type { Clock, ProcessRunner } from '../../process/types'
import { createSteamDrm } from './bridge/drm/drmLaunchSetup'
import { createRunningPoll, readRunningAppId } from './library/runningPoll'
import {
  createMacSteamOffline,
  createMacSteamOfflineEnvDeps
} from './macSteamOffline'
import { listSteamClientPids } from './steamClientProcess'
import {
  createSteamDownloadMonitor,
  readContentLogTail
} from './steamDownloadMonitor'

export function createSteamProcesses(deps: {
  runner: Pick<ProcessRunner, 'run' | 'spawnLongLived' | 'openDetached'>
  clock: Clock
  platform: NodeJS.Platform
}) {
  const { runner, clock, platform } = deps
  return {
    // Mac Steam's go-offline debt and shutdown signal: one instance per boot, handed to SteamUser
    // (bindStores), the guided Go Offline flows and the boot/quit restore.
    macSteamOffline: createMacSteamOffline({
      ...createMacSteamOfflineEnvDeps(),
      platform,
      runner,
      clock
    }),
    // The Steam DRM spawners (pgrep, codesign, unzip) and their three single-flight Maps.
    drm: createSteamDrm({ runner }),
    runningPoll: createRunningPoll({
      clock,
      readRunningAppId: () => readRunningAppId({ runner }, platform),
      notify: (appId, status) =>
        sendFrontendMessage('gameStatusUpdate', {
          appName: String(appId),
          runner: 'steam',
          status
        })
    }),
    downloadMonitor: createSteamDownloadMonitor({
      runner,
      platform,
      listPids: () => listSteamClientPids({ runner }, 'darwin'),
      readTail: readContentLogTail,
      now: () => clock.now(),
      parentPid: process.pid
    })
  }
}

export type SteamProcesses = ReturnType<typeof createSteamProcesses>
