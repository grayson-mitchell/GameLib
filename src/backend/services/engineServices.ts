/**
 * Builds the engine's injected `EngineServices` (and the matching `Tools`) from slices a caller
 * already holds (66.1-22d). Value-imports backend/tools, so steam modules reach it lazily.
 */
import type { EngineServices } from 'backend/engine/engineServices'
import { wineManagerReleasesFrom } from 'backend/engine/wineManagerReleases'
import { createTools } from 'backend/tools'
import type { Tools, ToolsDeps } from 'backend/tools'
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
  > & {
    /** The probes the engine spawns (66.2-03): only `run`, so the launcher's slice qualifies. */
    runner: Pick<ManagerDeps['runner'], 'run'>
    /** The members createTools reads; a launcher still being built can supply just these. */
    launcher: Pick<Launcher, 'setupEnvVars' | 'setupWineEnvVars' | 'validWine'>
    stores: Pick<ManagerDeps['stores'], 'wineManager'>
  }

export function toolsFrom(deps: EngineServicesSource): Tools {
  return createTools({
    managers: { library: deps.libraryManagers },
    commandRunner: deps.commandRunner,
    launcher: deps.launcher,
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    stores: deps.stores,
    config: deps.config,
    gameConfigs: deps.gameConfigs,
    appInfo: deps.appInfo,
    dialogs: deps.dialogs,
    appState: deps.appState,
    notifications: deps.notifications
  })
}

export function engineServicesFrom(deps: EngineServicesSource): EngineServices {
  return {
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    installRemove: (...a) => toolsFrom(deps).DXVK.installRemove(...a),
    wineManagerReleases: wineManagerReleasesFrom(deps),
    globalSettings: () =>
      deps.config.getSettings() as unknown as Record<string, unknown>,
    globalGameSettings: () => deps.config.getSettings(),
    notices: {
      dialogs: deps.dialogs,
      appState: deps.appState,
      notifications: deps.notifications
    }
  }
}
