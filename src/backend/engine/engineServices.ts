/**
 * The injected capabilities the engine's bottle-creation path needs (66.1-22d).
 * Type-only imports: the engine never value-imports tools or the services layer.
 */
import type { DialogBoxDeps, NotifyDeps } from 'backend/dialog/dialog'
import type { ProcessRunner } from 'backend/process/types'
import type { SpawnAsync } from 'backend/spawnAsync'
import type { Tools } from 'backend/tools'
import type { WineManagerRelease } from './engineDecision'

export interface EngineServices {
  spawnAsync: SpawnAsync
  /** Probes the engine spawns: runTool, demo-status (66.2-03). */
  runner: Pick<ProcessRunner, 'run'>
  installRemove: Tools['DXVK']['installRemove']
  /** The installed Wine Manager release list, read from the injected wineManager store. */
  wineManagerReleases: () => WineManagerRelease[]
  /** The dialog and notification slices the engine's user-facing notices go through. */
  notices: DialogBoxDeps & NotifyDeps
}
