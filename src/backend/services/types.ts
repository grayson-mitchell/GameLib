/**
 * Per-boot services (66.1, D-02). Types only: every import is `import type`.
 *
 * These are held on the sidecar's `BootState` and handed down by the boot steps and
 * `registerHandlers`; they are never module state and never live on `AppContext`
 * (`backend/process/` is a leaf and cannot type-import stores or managers).
 *
 * D-01 slices: a consumer declares only what it uses, as `Pick<BootServices, ...>` or a
 * `{ managers: Pick<StoreManagers, 'library'> }` style interface. Only composition roots
 * see the whole `BootServices`.
 */
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import type { CommandRunner as CommandRunnerImpl } from 'backend/commandRunner'
import type GOGLibraryManager from 'backend/storeManagers/gog/library'
import type LegendaryLibraryManager from 'backend/storeManagers/legendary/library'

/** One entry per store family; each is the module's value exports. */
export interface Stores {
  kvs: typeof import('backend/constants/key_value_stores')
  crossoverIndex: typeof import('backend/crossover_index/stores')
  downloadManager: typeof import('backend/downloadmanager/stores')
  gameOverrides: typeof import('backend/game_overrides/stores')
  humble: typeof import('backend/humble/stores')
  logger: typeof import('backend/logger/stores')
  macArch: typeof import('backend/macArch/stores')
  migration: typeof import('backend/migration/stores')
  runsForMe: typeof import('backend/runsForMe/stores')
  gog: typeof import('backend/storeManagers/gog/stores')
  legendary: typeof import('backend/storeManagers/legendary/stores')
  nile: typeof import('backend/storeManagers/nile/stores')
  sideload: typeof import('backend/storeManagers/sideload/stores')
  steam: typeof import('backend/storeManagers/steam/stores')
  wikiGameInfo: typeof import('backend/wiki_game_info/stores')
  wineManager: typeof import('backend/wine/manager/stores')
}

export interface StoreManagers {
  /** `gog` keeps its concrete type: boot drains the queued playtime through it. */
  library: Record<Runner, LibraryManager> & {
    gog: GOGLibraryManager
    legendary: LegendaryLibraryManager
  }
  launchHooks: Record<Runner, StoreLaunchHooks>
  autoUpdate(runner: Runner, gamesToUpdate: string[]): string[]
  initAll(): Promise<unknown[]>
}

type LauncherModule = typeof import('backend/launcher')

/** The non-command launcher exports. */
export type Launcher = Pick<
  LauncherModule,
  | 'prepareLaunch'
  | 'launchCleanup'
  | 'prepareWineLaunch'
  | 'setupEnvVars'
  | 'setupWrapperEnvVars'
  | 'setupWineEnvVars'
  | 'setupWrappers'
  | 'launchEventCallback'
  | 'getKnownFixesEnvVariables'
  | 'validWine'
  | 'verifyWinePrefix'
>

export type CommandRunner = CommandRunnerImpl

export type SpawnAsync = typeof import('backend/utils').spawnAsync

export interface QuitHandler {
  handleExit(): Promise<void>
}

export interface BootServices {
  stores: Stores
  managers: StoreManagers
  launcher: Launcher
  commandRunner: CommandRunner
  spawnAsync: SpawnAsync
  quit: QuitHandler
}
