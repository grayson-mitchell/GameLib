/**
 * The process-wide Steam instances built once at boot (66.2 D-05/D-15) and handed out through
 * `ManagerDeps.steamProcesses`: the running-game poller, the nettop download monitor and the Mac
 * Steam client helper. Their former module state (a timer, a last-seen appId, the monitors
 * Map) is closure state of
 * the instances built here, so a test builds its own and nothing leaks between boots.
 *
 * Sidecar exit contract: building the instances starts nothing (no timer, child or watcher);
 * the 'steam-running-poll' boot step arms the poller's clock interval, which is unref'd by
 * default and stopped at stdin EOF; the monitors spawn only per polled install and are stopped at
 * stdin EOF.
 */
import type { RequestRustInvoke } from '../../host'
import type { SendFrontendMessage } from '../../host/frontendMessage'
import type { GlobalConfigSlice } from '../../config'
import type { Clock, ProcessRunner } from '../../process/types'
import type { AppPaths } from '../../process/context'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import { createSteamDrm } from './bridge/drm/drmLaunchSetup'
import { createRunningPoll, readRunningAppId } from './library/runningPoll'
import { createMacSteamClient } from './macSteamClient'
import { listSteamClientPids } from './steamClientProcess'
import {
  createSteamDownloadMonitor,
  readContentLogTail
} from './steamDownloadMonitor'

export function createSteamProcesses(deps: {
  runner: Pick<ProcessRunner, 'run' | 'spawnLongLived' | 'openDetached'>
  clock: Clock
  platform: NodeJS.Platform
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<AppPaths, 'appFolder' | 'userHome'>
  /** The boot-owned abort registry the DRM component and Valve client downloads register in (66.4-13). */
  aborts: Pick<AbortRegistry, 'create' | 'delete'>
  sendFrontendMessage: SendFrontendMessage
  /** The sidecar -> Rust transport (75 D-05: the Valve manifest guards run on Rust). */
  requestRustInvoke: RequestRustInvoke
}) {
  const { runner, clock, platform, config, paths, aborts } = deps
  return {
    // Mac Steam's running probe, detached open and the guided Go Offline Continue (the Rust CM
    // session owns the wrap and the owed record).
    macSteam: createMacSteamClient({ config, platform, runner }),
    // The Steam DRM spawners (pgrep, codesign, unzip) and their three single-flight Maps.
    drm: createSteamDrm({
      runner,
      aborts,
      requestRustInvoke: deps.requestRustInvoke
    }),
    runningPoll: createRunningPoll({
      clock,
      readRunningAppId: () =>
        readRunningAppId(
          {
            runner,
            paths,
            requestRustInvoke: deps.requestRustInvoke
          },
          platform
        ),
      notify: (appId, status) =>
        deps.sendFrontendMessage('gameStatusUpdate', {
          appName: String(appId),
          runner: 'steam',
          status
        })
    }),
    downloadMonitor: createSteamDownloadMonitor({
      runner,
      platform,
      listPids: () => listSteamClientPids({ runner }, 'darwin'),
      readTail: (offset) => readContentLogTail(config, offset),
      now: () => clock.now(),
      parentPid: process.pid
    })
  }
}

export type SteamProcesses = ReturnType<typeof createSteamProcesses>
