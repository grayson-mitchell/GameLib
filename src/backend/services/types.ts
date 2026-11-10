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
import type { SpawnAsync } from 'backend/spawnAsync'
import type { QuitHandler } from 'backend/quitHandler'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import type { DownloadQueue } from 'backend/downloadmanager/downloadqueue'
import type { Launcher } from 'backend/launcher'
import type { ProcessRunner } from 'backend/process/types'
import type { CommandRunner as CommandRunnerImpl } from 'backend/commandRunner'
import type GOGLibraryManager from 'backend/storeManagers/gog/library'
import type LegendaryLibraryManager from 'backend/storeManagers/legendary/library'
import type NileLibraryManager from 'backend/storeManagers/nile/library'
import type SideloadLibraryManager from 'backend/storeManagers/sideload/library'

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
  library: Omit<
    Record<Runner, LibraryManager>,
    'gog' | 'legendary' | 'nile' | 'sideload'
  > & {
    gog: GOGLibraryManager
    legendary: LegendaryLibraryManager
    nile: NileLibraryManager
    /** `sideload` keeps its concrete type: game-details adds a sideloaded app through it. */
    sideload: SideloadLibraryManager
  }
  launchHooks: Record<Runner, StoreLaunchHooks>
  autoUpdate(runner: Runner, gamesToUpdate: string[]): string[]
  initAll(): Promise<unknown[]>
}

/** The launcher built by createLauncher (the non-command launcher members). */
export type { Launcher }

export type CommandRunner = CommandRunnerImpl

export type { SpawnAsync, QuitHandler }

/** What every library manager receives through its constructor (66.1, R2). */
export interface ManagerDeps {
  libraryManagers: StoreManagers['library']
  stores: Stores
  commandRunner: CommandRunner
  launcher: Launcher
  spawnAsync: SpawnAsync
  /**
   * The boot's process runner (the one commandRunner is built on), so a manager's stop path
   * kills through the same registry its spawns are tracked in.
   */
  runner: Pick<ProcessRunner, 'killTracked' | 'spawnLongLived'>
  /**
   * A call-time accessor, never a queue value: the download queue is built by the
   * 'download-queue' boot step, after the managers exist.
   */
  getDownloadQueue: () => DownloadQueue
}

export interface BootServices {
  stores: Stores
  managers: StoreManagers
  launcher: Launcher
  commandRunner: CommandRunner
  /** ctx.runner: the process runner commandRunner is built on (one registry). */
  runner: ManagerDeps['runner']
  spawnAsync: SpawnAsync
  quit: QuitHandler
  downloadQueue: DownloadQueue
}
