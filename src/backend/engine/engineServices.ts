/**
 * The injected capabilities the engine's bottle-creation path needs (66.1-22d).
 * Type-only imports: the engine never value-imports tools or the services layer.
 */
import type { SpawnAsync } from 'backend/spawnAsync'
import type { Tools } from 'backend/tools'

export interface EngineServices {
  spawnAsync: SpawnAsync
  installRemove: Tools['DXVK']['installRemove']
}
