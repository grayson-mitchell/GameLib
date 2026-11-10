/**
 * The injected capabilities the engine's bottle-creation path needs (66.1-22d).
 * Type-only imports: the engine never value-imports tools or the services layer.
 */
import type { SpawnAsync } from 'backend/spawnAsync'
import type { Tools } from 'backend/tools'
import type { WineManagerRelease } from './engineDecision'

export interface EngineServices {
  spawnAsync: SpawnAsync
  installRemove: Tools['DXVK']['installRemove']
  /** The installed Wine Manager release list, read from the injected wineManager store. */
  wineManagerReleases: () => WineManagerRelease[]
}
