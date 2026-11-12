/**
 * The Steam install pipeline's per-boot state (D-05, 66.4-09): the depot appinfo order tap, the CDN
 * auth schema cache, the shared-redist lock table, the Rust depot job registry, the install poll
 * state, the Steam restart-hold bookkeeping and the uninstall poll registry. Each was a module-level
 * Map, Set, WeakMap or counter; they are now closure fields of the factories below, built once by
 * the 'steam-install-runtime' boot step and read through ManagerDeps.steamInstallRuntime.
 *
 * Construction allocates empty containers and counters only: no I/O, no timer, no handle (sidecar
 * exit contract). The interval handles the poll registries hold are created and unref'd where the
 * poll starts and are cleared when it ends. The RunningAppID poller (steam-running-poll step) is not
 * part of this runtime.
 */
import { createAppinfoOrder, type AppinfoOrder } from './depot/appinfoOrder'
import { createCdnSchemaCache, type CdnSchemaCache } from './depot/cdnAuth'
import {
  createSharedRedistLocks,
  type SharedRedistLocks
} from './depot/sharedRedistLocks'
import {
  createDepotJobRegistry,
  type DepotJobRegistry
} from './depotRust/jobRegistry'
import {
  createInstallPollState,
  createUninstallPolls,
  type InstallPollState,
  type UninstallPolls
} from './library/pollState'
import {
  createSteamRestartHold,
  type SteamRestartHold
} from './library/restartHold'

export interface SteamInstallRuntime {
  appinfoOrder: AppinfoOrder
  cdnSchema: CdnSchemaCache
  sharedRedistLocks: SharedRedistLocks
  depotJobs: DepotJobRegistry
  polls: InstallPollState
  restartHold: SteamRestartHold
  uninstallPolls: UninstallPolls
}

/** The slice the depot pipeline (plan build, Rust jobs, shared redists) reads. */
export type DepotRuntime = Pick<
  SteamInstallRuntime,
  'appinfoOrder' | 'cdnSchema' | 'sharedRedistLocks' | 'depotJobs'
>

export function createSteamInstallRuntime(): SteamInstallRuntime {
  const polls = createInstallPollState()
  return {
    appinfoOrder: createAppinfoOrder(),
    cdnSchema: createCdnSchemaCache(),
    sharedRedistLocks: createSharedRedistLocks(),
    depotJobs: createDepotJobRegistry(),
    polls,
    restartHold: createSteamRestartHold({ polls }),
    uninstallPolls: createUninstallPolls()
  }
}
