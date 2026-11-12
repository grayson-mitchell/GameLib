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
  | 'host'
  | 'config'
  | 'gameConfigs'
  | 'paths'
  | 'appInfo'
  | 'onlineMonitor'
  | 'engineState'
  | 'engineRuntime'
  | 'steamLaunchRuntime'
  | 'bridgeRuntime'
  | 'steamInstallRuntime'
  | 'gogRuntime'
  | 'legendaryRuntime'
  | 'nileRuntime'
  | 'signInProbe'
  | 'steamSession'
  | 'tokenStore'
  | 'anonymousClient'
  | 'bridgeHelpers'
  | 'steamBottle'
  | 'steamUser'
  | 'humble'
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
    getDownloadQueue: () => source.downloadQueue,
    config: source.config,
    gameConfigs: source.gameConfigs,
    paths: source.paths,
    appInfo: source.appInfo,
    dialogs: source.host.dialogs,
    openExternal: source.host.openExternal,
    notifications: source.host.notifications,
    appState: source.host.appState,
    imageTools: source.host.imageTools,
    onlineMonitor: source.onlineMonitor,
    engineState: source.engineState,
    engineRuntime: source.engineRuntime,
    steamLaunchRuntime: source.steamLaunchRuntime,
    bridgeRuntime: source.bridgeRuntime,
    steamInstallRuntime: source.steamInstallRuntime,
    gogRuntime: source.gogRuntime,
    legendaryRuntime: source.legendaryRuntime,
    nileRuntime: source.nileRuntime,
    signIn: {
      epochs: source.signInProbe.epochs,
      outcomes: source.signInProbe.outcomes
    },
    steamSession: source.steamSession,
    tokenStore: source.tokenStore,
    anonymousClient: source.anonymousClient,
    bridgeHelpers: source.bridgeHelpers,
    steamBottle: source.steamBottle,
    steamUser: source.steamUser,
    loginWindowSeam: source.humble.loginWindowSeam
  }
}
