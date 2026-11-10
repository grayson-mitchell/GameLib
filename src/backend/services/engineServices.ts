/**
 * Builds the engine's injected `EngineServices` (and the matching `Tools`) from slices a caller
 * already holds (66.1-22d). Value-imports backend/tools, so steam modules reach it lazily.
 */
import type { EngineServices } from 'backend/engine/engineServices'
import { wineManagerReleasesFrom } from 'backend/engine/wineManagerReleases'
import { createTools } from 'backend/tools'
import type { Tools } from 'backend/tools'
import type { ManagerDeps } from './types'

export type EngineServicesSource = Pick<
  ManagerDeps,
  'libraryManagers' | 'commandRunner' | 'launcher' | 'spawnAsync'
> & { stores: Pick<ManagerDeps['stores'], 'wineManager'> }

export function toolsFrom(deps: EngineServicesSource): Tools {
  return createTools({
    managers: { library: deps.libraryManagers },
    commandRunner: deps.commandRunner,
    launcher: deps.launcher,
    spawnAsync: deps.spawnAsync,
    stores: deps.stores
  })
}

export function engineServicesFrom(deps: EngineServicesSource): EngineServices {
  return {
    spawnAsync: deps.spawnAsync,
    installRemove: (...a) => toolsFrom(deps).DXVK.installRemove(...a),
    wineManagerReleases: wineManagerReleasesFrom(deps)
  }
}
