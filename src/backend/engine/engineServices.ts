/**
 * The injected capabilities the engine's bottle-creation path needs (66.1-22d).
 * Type-only imports: the engine never value-imports tools or the services layer.
 */
import type { Dialogs } from 'backend/host/dialogs'
import type { SettingsDocRoot } from 'backend/stores/settingsDocs'
import type { AppRuntimeSlice } from 'backend/appRuntime'
import type { OnlineMonitor } from 'backend/online_monitor'
import type { DialogBoxDeps, NotifyDeps } from 'backend/dialog/dialog'
import type { AppState } from 'backend/host/appState'
import type { ProcessRunner } from 'backend/process/types'
import type { GameSettings } from 'common/types'
import type { SpawnAsync } from 'backend/spawnAsync'
import type { WineManagerRelease } from './engineDecision'
import type { EngineStateService } from './engineState'
import type { EngineRuntime } from './engineRuntime'
import type { AppPaths } from 'backend/process/context'

/**
 * The DXVK family's install or remove for one prefix, which Rust does (`dxvkInstallRemove`, 87-34): the game's
 * merged settings, the tool, backup or restore, and the engine's pinned `{ dir, version }` when it has one (Phase 59:
 * the tools-dir `latest_<tool>` lookup is then skipped). Resolves whether the install went through.
 */
export type InstallRemove = (
  gameSettings: GameSettings,
  tool: 'dxvk' | 'dxvk-nvapi' | 'vkd3d' | 'dxvk-macOS',
  action: 'backup' | 'restore',
  source?: { dir: string; version: string }
) => Promise<boolean>

export interface EngineServices {
  spawnAsync: SpawnAsync
  /** Probes the engine spawns: runTool, demo-status (66.2-03). */
  runner: Pick<ProcessRunner, 'run'>
  installRemove: InstallRemove
  /** The connectivity slice the pinned-engine download gate reads. */
  onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  /** The boot-owned engine decision/notice state (D-66.3-12). */
  engineState: EngineStateService
  /** The path roots the engine reads (66.4-05). */
  paths: Pick<
    AppPaths,
    'userHome' | 'toolsPath' | 'gamesConfigPath' | 'configPath' | 'userData'
  >
  /** The boot-owned engine runtime: ledger, registry, deadlines, single-flight maps (66.4-05). */
  engineRuntime: EngineRuntime
  /**
   * The boot's store root (85-15): the stored game config is read through its mirror when the shell
   * owns the settings family. Absent (a test), the config is read from disk.
   */
  storeRoot?: SettingsDocRoot
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
