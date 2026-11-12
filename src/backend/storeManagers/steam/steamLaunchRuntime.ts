/**
 * The boot-owned Steam launch-path runtime (66.4-06, D-05).
 *
 * The maps, chains, latches and timers a Steam launch touches live in per-file `createX()` closures:
 * the bottle process monitors, the bottled-Steam raise loop, the DRM / overlay runner registry, the
 * DRM-mode notice latch and the platform-capture chain. This bundle builds one of each, once per
 * boot, in the 'steam-launch-runtime' boot step; consumers reach it through `Pick<>` slices on
 * ManagerDeps (D-01).
 *
 * Construction only allocates empty collections: no I/O and no timer (sidecar exit contract). The
 * monitor and raise-loop timers a launch arms later run on the injected clock, which unref's them.
 */
import type { Clock } from 'backend/process/types'
import { createBottleProcessMonitors } from './bottleProcessMonitor'
import type { BottleProcessMonitors } from './bottleProcessMonitor'
import { createBottledSteamRaiser } from './bottledSteam'
import type { BottledSteamRaiser } from './bottledSteam'
import { createDrmBridgeRunners } from './bridgeBottle'
import type { DrmBridgeRunners } from './bridgeBottle'
import { createDrmModeNoticeLatch } from './gameDrmLaunch'
import type { DrmModeNoticeLatch } from './gameDrmLaunch'
import { createPlatformCaptureQueue } from './platformCapture'
import type { PlatformCaptureQueue } from './platformCapture'

export interface SteamLaunchRuntime {
  monitors: BottleProcessMonitors
  raiser: BottledSteamRaiser
  drmRunners: DrmBridgeRunners
  drmNotice: DrmModeNoticeLatch
  platformCapture: PlatformCaptureQueue
}

export interface SteamLaunchRuntimeDeps {
  clock: Clock
}

export function createSteamLaunchRuntime(
  deps: SteamLaunchRuntimeDeps
): SteamLaunchRuntime {
  return {
    monitors: createBottleProcessMonitors({ clock: deps.clock }),
    raiser: createBottledSteamRaiser({ clock: deps.clock }),
    drmRunners: createDrmBridgeRunners(),
    drmNotice: createDrmModeNoticeLatch(),
    platformCapture: createPlatformCaptureQueue()
  }
}
