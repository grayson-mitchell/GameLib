/**
 * Engine channel registration (Phase 61 Plan 13, D-09/D-12/D-17); empty since Phase 87 Plan 52.
 *
 *   invoke: none. `getEngineState` is a scheduled resolver in `engineWineResolvers.ts` (D-23); `listEngineOptions`,
 *     `getDefaultEngine` and `getPerGameBottleName` are native `engine` channels since 87-28, `dismissEngineNotice`
 *     since 87-49.
 *   push (sendFrontendMessage): engineStateChanged
 *
 * 87-53 deletes this file with the engine TypeScript it still imports types from.
 */
import type { GlobalConfigSlice } from 'backend/config'
import type { IpcRegistry } from './ipcRegistry'
import type {
  BootServices,
  StoreManagers,
  Stores
} from 'backend/services/types'
import type { EngineServices } from 'backend/engine/engineServices'
import type { SteamEngineBottle } from 'backend/storeManagers/steam/bottle'

/** Narrow slice (66.1 D-01): only the library managers are read. */
export interface EngineFlowDeps {
  ipc: Pick<IpcRegistry, 'handle'>
  managers: Pick<StoreManagers, 'library'>
  stores: Pick<Stores, 'steam'>
  spawnAsync: BootServices['spawnAsync']
  /** The boot process runner (66.2); consumers converted by 66.2-03. */
  runner: BootServices['runner']
  /** The global config slice the engine reads its inherited settings from (66.3-06). */
  config: Pick<GlobalConfigSlice, 'getSettings'>
  /** The boot-owned engine state; its publisher is built by the 'engine-state' boot step (D-66.3-12). */
  engineState: EngineServices['engineState']
  /** The boot-owned engine runtime and path roots (66.4-05). */
  engineRuntime: EngineServices['engineRuntime']
  /** The boot's store root: the stored game config is read through it (85-15). */
  storeRoot?: EngineServices['storeRoot']
  paths: EngineServices['paths']
  /** The Steam bottle slice the Steam engine state reads (66.3-15). */
  steamBottle: SteamEngineBottle['steamBottle']
  /** The boot's monitor phase and DRM runner registry (66.4-06). */
  steamLaunchRuntime: SteamEngineBottle['steamLaunchRuntime']
}

/**
 * Registers nothing (87-52, D-23): `getEngineState` was the last handle of this file and is the scheduled resolver
 * `getEngineState` in `engineWineResolvers.ts` now, registered once by `registerEngineWineResolvers`; the other four
 * engine channels are native `engine` channels (87-28, 87-49). The file and its call in `handlers.ts` go in 87-53. The
 * `engineStateChanged` push is the boot-built engine state's publisher, not a registration.
 */
export function registerEngineFlows(deps: EngineFlowDeps): void {
  // One owner per channel (D-06): nothing is registered here.
  void deps
}
