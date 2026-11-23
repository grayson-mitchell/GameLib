/**
 * Builds the engine's injected `EngineServices` from slices a caller already holds (66.1-22d). It holds
 * no value import of `backend/tools` (87-34): `installRemove` reaches Rust through the `dxvkInstallRemove`
 * shim, so steam modules can reach it without the tools module (`toolsFrom` lives in `./toolsFrom`).
 */
import type { EngineServices } from 'backend/engine/engineServices'
import { wineManagerReleasesFrom } from 'backend/engine/wineManagerReleases'
import { dxvkInstallRemove } from 'backend/enginewine/tools'
import type { ToolsDeps } from '../tools'
import type { SteamEngineBottle } from 'backend/storeManagers/steam/bottle'
import type { AppPaths } from 'backend/process/context'
import type { Launcher, ManagerDeps } from './types'

export type EngineServicesSource = Pick<
  ManagerDeps,
  'libraryManagers' | 'commandRunner' | 'spawnAsync'
> &
  Pick<
    ToolsDeps,
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
    | 'toolsState'
    | 'appRuntime'
  > & {
    /** The boot-owned engine decision/notice state (D-66.3-12). */
    engineState: EngineServices['engineState']
    /** The boot-owned engine runtime (66.4-05). */
    engineRuntime: EngineServices['engineRuntime']
    /** The boot's store root: the stored game config is read through it (85-15). */
    storeRoot?: EngineServices['storeRoot']
    /** The path roots the engine reads (66.4-05). */
    paths: EngineServices['paths'] &
      Pick<AppPaths, 'defaultUmuPath' | 'publicDir' | 'runtimePath'>
    /** The probes the engine spawns (66.2-03): only `run`, so the launcher's slice qualifies. */
    runner: Pick<ManagerDeps['runner'], 'run'>
    /** The members the tools (`toolsFrom`) read; a launcher still being built can supply just these. */
    launcher: Pick<Launcher, 'setupEnvVars' | 'setupWineEnvVars' | 'validWine'>
    stores: Pick<ManagerDeps['stores'], 'wineManager'>
  }

export function engineServicesFrom(deps: EngineServicesSource): EngineServices {
  return {
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    onlineMonitor: deps.onlineMonitor,
    engineState: deps.engineState,
    engineRuntime: deps.engineRuntime,
    storeRoot: deps.storeRoot,
    paths: deps.paths,
    // The TS `installRemove` resolved a boolean; the Rust op does too, and anything else is a failure.
    installRemove: async (settings, tool, action, source) =>
      (await dxvkInstallRemove(
        { requestRustInvoke: deps.engineRuntime.requestRustInvoke },
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
): EngineServices & SteamEngineBottle {
  return {
    ...engineServicesFrom(deps),
    steamBottle: deps.steamBottle,
    steamLaunchRuntime: deps.steamLaunchRuntime
  }
}
