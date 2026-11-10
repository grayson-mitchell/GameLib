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
import type { StoreRegistry } from 'backend/stores/storeRegistry'
import type { SpawnAsync } from 'backend/spawnAsync'
import type { QuitHandler } from 'backend/quitHandler'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type { StoreLaunchHooks } from 'backend/storeManagers'
import type { DownloadQueue } from 'backend/downloadmanager/downloadqueue'
import type { Launcher } from 'backend/launcher'
import type { Clock, ProcessRunner } from 'backend/process/types'
import type { CommandRunner as CommandRunnerImpl } from 'backend/commandRunner'
import type GOGLibraryManager from 'backend/storeManagers/gog/library'
import type LegendaryLibraryManager from 'backend/storeManagers/legendary/library'
import type NileLibraryManager from 'backend/storeManagers/nile/library'
import type SideloadLibraryManager from 'backend/storeManagers/sideload/library'
import type SteamLibraryManager from 'backend/storeManagers/steam/library'
import type { SteamProcesses } from 'backend/storeManagers/steam/steamProcesses'

/** One entry per store family; each is what the family's `createXStores` factory returns. */
export interface Stores {
  kvs: ReturnType<
    typeof import('backend/constants/key_value_stores').createKvsStores
  >
  crossoverIndex: ReturnType<
    typeof import('backend/crossover_index/stores').createCrossoverIndexStores
  >
  downloadManager: ReturnType<
    typeof import('backend/downloadmanager/stores').createDownloadManagerStores
  >
  gameOverrides: ReturnType<
    typeof import('backend/game_overrides/stores').createGameOverridesStores
  >
  humble: ReturnType<typeof import('backend/humble/stores').createHumbleStores>
  logger: ReturnType<typeof import('backend/logger/stores').createLoggerStores>
  macArch: ReturnType<
    typeof import('backend/macArch/stores').createMacArchStores
  >
  migration: ReturnType<
    typeof import('backend/migration/stores').createMigrationStores
  >
  runsForMe: ReturnType<
    typeof import('backend/runsForMe/stores').createRunsForMeStores
  >
  gog: ReturnType<
    typeof import('backend/storeManagers/gog/stores').createGogStores
  >
  legendary: ReturnType<
    typeof import('backend/storeManagers/legendary/stores').createLegendaryStores
  >
  nile: ReturnType<
    typeof import('backend/storeManagers/nile/stores').createNileStores
  >
  sideload: ReturnType<
    typeof import('backend/storeManagers/sideload/stores').createSideloadStores
  >
  steam: ReturnType<
    typeof import('backend/storeManagers/steam/stores').createSteamStores
  >
  wikiGameInfo: ReturnType<
    typeof import('backend/wiki_game_info/stores').createWikiGameInfoStores
  >
  wineManager: ReturnType<
    typeof import('backend/wine/manager/stores').createWineManagerStores
  >
}

export interface StoreManagers {
  /** `gog` keeps its concrete type: boot drains the queued playtime through it. */
  library: Omit<
    Record<Runner, LibraryManager>,
    'gog' | 'legendary' | 'nile' | 'sideload' | 'steam'
  > & {
    gog: GOGLibraryManager
    legendary: LegendaryLibraryManager
    nile: NileLibraryManager
    /** `sideload` keeps its concrete type: game-details adds a sideloaded app through it. */
    sideload: SideloadLibraryManager
    /** `steam` keeps its concrete type: the manager holds the per-boot launch-watch registry. */
    steam: SteamLibraryManager
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
  runner: Pick<ProcessRunner, 'killTracked' | 'spawnLongLived' | 'run'>
  /** The boot clock; timers are unref'd by default (D-04). */
  clock: Clock
  /** The process-wide Steam instances (running poller, download monitor), built once at boot. */
  steamProcesses: SteamProcesses
  /**
   * A call-time accessor, never a queue value: the download queue is built by the
   * 'download-queue' boot step, after the managers exist.
   */
  getDownloadQueue: () => DownloadQueue
}

export interface BootServices {
  stores: Stores
  /** The registry `stores` were built against; the name-keyed store RPC handlers resolve through it. */
  storeRegistry: StoreRegistry
  managers: StoreManagers
  launcher: Launcher
  commandRunner: CommandRunner
  /** ctx.runner: the process runner commandRunner is built on (one registry). */
  runner: ManagerDeps['runner']
  /** ctx.clock: the boot clock, read by ManagerDeps.clock (66.2). */
  clock: ManagerDeps['clock']
  /** The boot's Steam process instances, shared by every ManagerDeps built from these services. */
  steamProcesses: ManagerDeps['steamProcesses']
  spawnAsync: SpawnAsync
  quit: QuitHandler
  downloadQueue: DownloadQueue
}
