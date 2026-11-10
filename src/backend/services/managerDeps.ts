/**
 * Builds the `ManagerDeps` shape from the per-boot services (66.1, D-01). The Steam flow
 * registrations call steam functions that take the whole manager-deps bundle; they hold a
 * narrow slice of `BootServices` and assemble the bundle here at call time.
 */
import type { BootServices, ManagerDeps } from './types'

export type ManagerDepsSource = Pick<
  BootServices,
  | 'managers'
  | 'stores'
  | 'launcher'
  | 'commandRunner'
  | 'runner'
  | 'clock'
  | 'steamProcesses'
  | 'spawnAsync'
  | 'downloadQueue'
>

export function managerDepsFromServices(
  source: ManagerDepsSource
): ManagerDeps {
  return {
    libraryManagers: source.managers.library,
    stores: source.stores,
    commandRunner: source.commandRunner,
    launcher: source.launcher,
    spawnAsync: source.spawnAsync,
    runner: source.runner,
    clock: source.clock,
    steamProcesses: source.steamProcesses,
    getDownloadQueue: () => source.downloadQueue
  }
}
