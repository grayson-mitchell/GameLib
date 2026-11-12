/**
 * The injected capabilities the engine's bottle-creation path needs (66.1-22d).
 * Type-only imports: the engine never value-imports tools or the services layer.
 */
import type { Dialogs } from 'backend/host/dialogs'
import type { StoreVersioning } from 'backend/storeVersioning/engine'
import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { OnlineMonitor } from 'backend/online_monitor'
import type { DialogBoxDeps, NotifyDeps } from 'backend/dialog/dialog'
import type { AppState } from 'backend/host/appState'
import type { ProcessRunner } from 'backend/process/types'
import type { GameSettings } from 'common/types'
import type { SpawnAsync } from 'backend/spawnAsync'
import type { Tools } from 'backend/tools'
import type { WineManagerRelease } from './engineDecision'
import type { EngineStateService } from './engineState'
import type { EngineRuntime } from './engineRuntime'
import type { AppPaths } from 'backend/process/context'

export interface EngineServices {
  spawnAsync: SpawnAsync
  /** Probes the engine spawns: runTool, demo-status (66.2-03). */
  runner: Pick<ProcessRunner, 'run'>
  installRemove: Tools['DXVK']['installRemove']
  /** The connectivity slice the pinned-engine download gate reads. */
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  /** The boot-owned engine decision/notice state (D-66.3-12). */
  engineState: EngineStateService
  /** The path roots the engine reads (66.4-05). */
  paths: Pick<
    AppPaths,
    'userHome' | 'toolsPath' | 'gamesConfigPath' | 'configPath'
  >
  /** The boot-owned engine runtime: ledger, registry, deadlines, single-flight maps (66.4-05). */
  engineRuntime: EngineRuntime
  /** The boot's store-versioning engine (`StoreRoot.versioning`): game configs and bottle markers migrate through it. */
  versioning: StoreVersioning
  /** The installed Wine Manager release list, read from the injected wineManager store. */
  wineManagerReleases: () => WineManagerRelease[]
  /** The global settings snapshot the engine's config reads inherit from (66.3-06). */
  globalSettings: () => Record<string, unknown>
  /** The same snapshot typed as the GameSettings base a fallback bottle's settings overlay (66.3-06). */
  globalGameSettings: () => GameSettings
  /** The dialog and notification slices the engine's user-facing notices go through. */
  notices: DialogBoxDeps &
    NotifyDeps &
    AppRuntimeSlice<'events'> & {
      appState: Pick<AppState, 'raiseMainWindow'>
      dialogs: Pick<Dialogs, 'displayAcks'>
    }
}
