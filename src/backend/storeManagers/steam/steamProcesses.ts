/**
 * The process-wide Steam instances built once at boot (66.2 D-05/D-15) and handed out through
 * `ManagerDeps.steamProcesses`: the Steam DRM spawners and the Mac Steam client helper. The
 * running-game poll and the download monitor live in Rust since Phase 80.
 *
 * Sidecar exit contract: building the instances starts nothing (no timer, child or watcher).
 */
import type { RequestRustInvoke } from '../../host'
import type { SendFrontendMessage } from '../../host/frontendMessage'
import type { GlobalConfigSlice } from '../../config'
import type { Clock, ProcessRunner } from '../../process/types'
import type { AppPaths } from '../../process/context'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import { createSteamDrm } from './bridge/drm/drmLaunchSetup'
import { createMacSteamClient } from './macSteamClient'

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
  const { runner, platform, config, aborts } = deps
  return {
    // Mac Steam's running probe, detached open and the guided Go Offline Continue (the Rust CM
    // session owns the wrap and the owed record).
    macSteam: createMacSteamClient({ config, platform, runner }),
    // The Steam DRM spawners (pgrep, codesign, unzip) and their three single-flight Maps.
    drm: createSteamDrm({
      runner,
      aborts,
      requestRustInvoke: deps.requestRustInvoke
    })
  }
}

export type SteamProcesses = ReturnType<typeof createSteamProcesses>
