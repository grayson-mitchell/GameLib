/**
 * Builds the engine's injected `EngineServices` from slices a caller already holds (66.1-22d).
 * `installRemove` reaches Rust through the `dxvkInstallRemove` shim (87-34); the TS tools module and its
 * `toolsFrom` builder were deleted in 87-37.
 */
import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { Dialogs } from 'backend/host/dialogs'
import type { AppState } from 'backend/host/appState'
import type { DialogBoxDeps, NotifyDeps } from 'backend/dialog/dialog'
import type { EngineServices } from 'backend/engine/engineServices'
import { wineManagerReleasesFrom } from 'backend/engine/wineManagerReleases'
import { dxvkInstallRemove } from 'backend/enginewine/tools'
import type { GlobalConfigSlice } from '../config'
import type { GameConfigs } from '../game_config'
import type { OnlineMonitor } from '../online_monitor'
import type { AppInfo } from '../process/context'
import type { AbortRegistry } from '../utils/aborthandler/aborthandler'
import type { SteamEngineBottle } from 'backend/storeManagers/steam/bottle'
import type { AppPaths } from 'backend/process/context'
import type { Launcher, ManagerDeps } from './types'

/**
 * The boot-service slices the engine's bottle-creation path reads (66.1, 66.3-15, 66.4-06, 66.4-13, 66.4-18). They
 * were the members of the TS tools' `ToolsDeps` until 87-37 deleted that module.
 */
export interface EngineSourceSlices
  extends DialogBoxDeps, NotifyDeps, AppRuntimeSlice<'events'> {
  /** Also the boot's display-ack table: the engine's refused-launch dialogs track their acks in it (66.4-18). */
  dialogs: DialogBoxDeps['dialogs'] & Pick<Dialogs, 'displayAcks'>
  /** The boot-owned abort registry the tool downloads register in (66.4-13). */
  aborts: Pick<AbortRegistry, 'create'>
  /** The Steam bottle's wine-bin hint and CrossOver resolver, for the Steam Wine-tool resolver (66.3-15). */
  steamBottle: SteamEngineBottle['steamBottle']
  /** The boot's monitor phase and DRM runner registry the Steam Wine-tool resolver reads (66.4-06). */
  steamLaunchRuntime: SteamEngineBottle['steamLaunchRuntime']
  gameConfigs: Pick<GameConfigs, 'get'>
  appInfo: Pick<AppInfo, 'version'>
  /** `raiseMainWindow` is for the engine's refused-launch dialog (66.3-06). */
  appState: Pick<AppState, 'raiseMainWindowForInAppDialog' | 'raiseMainWindow'>
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  config: Pick<GlobalConfigSlice, 'getSettings' | 'setSetting'>
}

export type EngineServicesSource = Pick<
  ManagerDeps,
  'libraryManagers' | 'commandRunner' | 'spawnAsync'
> &
  Pick<
    EngineSourceSlices,
    | 'config'
    | 'gameConfigs'
    | 'appInfo'
    | 'dialogs'
    | 'appState'
    | 'notifications'
    | 'sendFrontendMessage'
    | 'onlineMonitor'
    | 'steamBottle'
    | 'steamLaunchRuntime'
    | 'aborts'
    | 'appRuntime'
  > & {
    /** The boot-owned engine decision/notice state (D-66.3-12). */
    engineState: EngineServices['engineState']
    /** The boot's sidecar -> Rust transport (the engine runtime that carried it is gone, 87-56c). */
    requestRustInvoke: ManagerDeps['requestRustInvoke']
    /** The boot's store root: the stored game config is read through it (85-15). */
    storeRoot?: EngineServices['storeRoot']
    /** The path roots the engine reads (66.4-05). */
    paths: EngineServices['paths'] &
      Pick<AppPaths, 'defaultUmuPath' | 'publicDir' | 'runtimePath'>
    /** The probes the engine spawns (66.2-03): only `run`, so the launcher's slice qualifies. */
    runner: Pick<ManagerDeps['runner'], 'run'>
    /** The members the engine reads; a launcher still being built can supply just these. */
    launcher: Pick<Launcher, 'setupEnvVars' | 'setupWineEnvVars' | 'validWine'>
  }

export function engineServicesFrom(
  deps: EngineServicesSource
): Omit<EngineServices, 'engineRuntime'> {
  return {
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    onlineMonitor: deps.onlineMonitor,
    engineState: deps.engineState,
    storeRoot: deps.storeRoot,
    paths: deps.paths,
    // The TS `installRemove` resolved a boolean; the Rust op does too, and anything else is a failure.
    installRemove: async (settings, tool, action, source) =>
      (await dxvkInstallRemove(
        { requestRustInvoke: deps.requestRustInvoke },
        { settings, tool, action, source }
      )) === true,
    wineManagerReleases: wineManagerReleasesFrom(deps),
    globalSettings: () =>
      deps.config.getSettings() as unknown as Record<string, unknown>,
    globalGameSettings: () => deps.config.getSettings(),
    notices: {
      dialogs: deps.dialogs,
      appState: deps.appState,
      notifications: deps.notifications,
      sendFrontendMessage: deps.sendFrontendMessage,
      appRuntime: deps.appRuntime
    }
  }
}

/** The engine services plus the bottle slice the Steam engine deps read (66.3-15). */
export function steamEngineServicesFrom(
  deps: EngineServicesSource
): Omit<EngineServices, 'engineRuntime'> & SteamEngineBottle {
  return {
    ...engineServicesFrom(deps),
    steamBottle: deps.steamBottle,
    steamLaunchRuntime: deps.steamLaunchRuntime
  }
}
