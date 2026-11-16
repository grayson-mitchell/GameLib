/**
 * The Steam install pipeline's per-boot state (D-05, 66.4-09): the depot appinfo order tap, the CDN
 * auth schema cache, the shared-redist lock table, the Rust depot job registry and the update-state
 * caches. Each is a closure field of the factory below, built once by the 'steam-install-runtime'
 * boot step and read through ManagerDeps.steamInstallRuntime. The install/uninstall/running polls
 * and the restart hold live in Rust since Phase 80.
 *
 * Construction allocates empty containers and counters only: no I/O, no timer, no handle (sidecar
 * exit contract).
 */
import { createAppinfoOrder, type AppinfoOrder } from './depot/appinfoOrder'
import {
  createSharedRedistLocks,
  type SharedRedistLocks
} from './depot/sharedRedistLocks'
import {
  createDepotJobRegistry,
  type DepotJobRegistry,
  type DepotTransport
} from './depotRust/jobRegistry'
import {
  createSteamUpdateStateCache,
  type SteamUpdateStateCache
} from './updateDetection'

export interface SteamInstallRuntime {
  appinfoOrder: AppinfoOrder
  sharedRedistLocks: SharedRedistLocks
  depotJobs: DepotJobRegistry
  /** Per-app update-detection results (74-04); closure Map only. */
  updateStates: SteamUpdateStateCache
  /** CR-02: appId -> target build of the last unattended auto-update attempt; per boot, closure Map only. */
  autoUpdateAttempts: Map<string, string>
}

/** The slice the depot pipeline (plan build, Rust jobs, shared redists) reads. */
export type DepotRuntime = Pick<
  SteamInstallRuntime,
  'appinfoOrder' | 'sharedRedistLocks' | 'depotJobs'
>

export function createSteamInstallRuntime(
  transport: DepotTransport
): SteamInstallRuntime {
  return {
    appinfoOrder: createAppinfoOrder(),
    sharedRedistLocks: createSharedRedistLocks(),
    depotJobs: createDepotJobRegistry(transport),
    updateStates: createSteamUpdateStateCache(),
    autoUpdateAttempts: new Map()
  }
}
