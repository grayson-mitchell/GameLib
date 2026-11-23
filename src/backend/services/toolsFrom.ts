/**
 * Builds the TS `Tools` (Winetricks, `runWineCommandOnGame`) from slices a caller already holds (66.1-22d).
 * Value-imports `backend/tools`, so steam modules reach it lazily.
 *
 * Phase 87 (87-34): this left `services/engineServices.ts`, which no longer value-imports the tools module
 * (its DXVK `installRemove` reaches Rust through the `dxvkInstallRemove` shim). What it still builds is the
 * Winetricks and wine-command tools: the launcher's known-fix step and the Steam bridge's known fixes call them
 * until 87-35 (Winetricks) and 87-36 (the wine-command family) flip those to Rust, and 87-37 deletes the TS
 * tools. The DXVK member of the `Tools` it returns has no live caller.
 */
import { createTools } from 'backend/tools'
import type { Tools } from 'backend/tools'
import type { EngineServicesSource } from './engineServices'

export function toolsFrom(deps: EngineServicesSource): Tools {
  return createTools({
    managers: { library: deps.libraryManagers },
    commandRunner: deps.commandRunner,
    launcher: deps.launcher,
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    aborts: deps.aborts,
    toolsState: deps.toolsState,
    stores: deps.stores,
    steamBottle: deps.steamBottle,
    steamLaunchRuntime: deps.steamLaunchRuntime,
    config: deps.config,
    gameConfigs: deps.gameConfigs,
    appInfo: deps.appInfo,
    dialogs: deps.dialogs,
    appState: deps.appState,
    notifications: deps.notifications,
    sendFrontendMessage: deps.sendFrontendMessage,
    onlineMonitor: deps.onlineMonitor,
    engineState: deps.engineState,
    engineRuntime: deps.engineRuntime,
    storeRoot: deps.storeRoot,
    appRuntime: deps.appRuntime,
    paths: deps.paths
  })
}
