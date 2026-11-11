import SideloadLibraryManager from 'backend/storeManagers/sideload/library'
import GOGLibraryManager from 'backend/storeManagers/gog/library'
import LegendaryLibraryManager from 'backend/storeManagers/legendary/library'
import NileLibraryManager from 'backend/storeManagers/nile/library'
import SteamLibraryManager from 'backend/storeManagers/steam/library'

import gogSetup from 'backend/storeManagers/gog/setup'
import nileSetup from 'backend/storeManagers/nile/setup'
import { legendarySetup } from 'backend/storeManagers/legendary/setup'
import { resolveEpicOfflineMode } from 'backend/storeManagers/legendary/epicOfflineMode'
import gogPresence from 'backend/storeManagers/gog/presence'
import { isEnabled as isEosOverlayEnabled } from 'backend/storeManagers/legendary/eos_overlay/eos_overlay'
import { sendFrontendMessage } from 'backend/ipc'
import { createLauncher } from 'backend/launcher'
import type { Launcher } from 'backend/launcher'
import type { ManagerDeps, StoreManagers } from 'backend/services/types'

import { logInfo, logWarning, RunnerToLogPrefixMap } from 'backend/logger'
import type { DownloadQueue } from 'backend/downloadmanager/downloadqueue'

import type {
  DMQueueElement,
  GameInfo,
  Runner,
  WineInstallation
} from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type LogWriter from 'backend/logger/log_writer'

// launcher.ts reaches store-specific code only through this module (D-13).
export type { LegendaryCommand } from 'backend/storeManagers/legendary/commands'

interface OfflineModeInput {
  offlineMode: boolean
  runner: Runner
  canRunOffline: boolean
}

/**
 * Store-specific launch work that launcher.ts used to branch on by runner.
 * Members are optional because most runners have none of them; the Record type
 * below still forces every runner to have an entry. Each body is the exact
 * statement(s) launcher.ts ran for that runner before the hook existed.
 */
export interface StoreLaunchHooks {
  /** Setup that runs after the wine prefix is prepared, before the game starts. */
  prepareLaunch?: (appName: string, logWriter: LogWriter) => Promise<void>
  /** Presence announced just before the game process starts. */
  setPresence?: (appName: string) => Promise<void>
  /** Presence cleared after the game process ends. */
  clearPresence?: () => Promise<void>
  /** Turns offline mode on for an expired store; never turns it off. */
  resolveOfflineMode?: (input: OfflineModeInput) => boolean
  /** Whether the store's overlay is enabled for this game. */
  isOverlayEnabled?: (appName: string) => Promise<boolean>
  /** Persists the bottle wine version (lazy import keeps module load timing). */
  persistBottleWineVersion?: (wineVersion: WineInstallation) => Promise<void>
}

/**
 * The per-runner launch hooks, built from the boot's manager deps. Every body reads `deps` at
 * call time only (the managers it reaches are filled in after construction).
 */
export function buildLaunchHooks(
  deps: ManagerDeps
): Record<Runner, StoreLaunchHooks> {
  const hooks = {
    sideload: {},
    gog: {
      prepareLaunch: async (appName) => {
        await gogSetup(deps, appName)
        sendFrontendMessage('gameStatusUpdate', {
          appName,
          runner: 'gog',
          status: 'launching'
        })
      },
      setPresence: async (appName) => {
        gogPresence.setCurrentGame(appName)
        await gogPresence.setPresence(deps)
      },
      clearPresence: async () => {
        gogPresence.setCurrentGame('')
        await gogPresence.setPresence(deps)
      }
    },
    legendary: {
      prepareLaunch: async (appName, logWriter) => {
        await legendarySetup(deps, appName, logWriter)
      },
      // R8 (Phase 49): the expired flag is read here, once per launch.
      resolveOfflineMode: (input) =>
        resolveEpicOfflineMode({
          ...input,
          storeExpired: Boolean(
            deps.stores.legendary.legendaryConfigStore.get_nodefault('expired')
          )
        }),
      isOverlayEnabled: (appName) => isEosOverlayEnabled(deps, appName)
    },
    nile: {
      prepareLaunch: async (appName) => {
        await nileSetup(deps, appName)
      }
    },
    steam: {
      persistBottleWineVersion: async (wineVersion) => {
        const { persistBottleWineVersion } =
          await import('backend/storeManagers/steam/bottle')
        persistBottleWineVersion(wineVersion)
      }
    }
  } satisfies Record<Runner, StoreLaunchHooks>
  // Widened so a call site can write `launchHooks[runner].prepareLaunch?.()`.
  return hooks
}

function getDMElement(gameInfo: GameInfo, appName: string) {
  const {
    install: { install_path, platform },
    runner
  } = gameInfo
  const dmQueueElement: DMQueueElement = {
    params: {
      appName,
      gameInfo,
      runner,
      path: install_path!,
      platformToInstall: platform!
    },
    type: 'update',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  return dmQueueElement
}

export interface CreateStoreManagersDeps {
  stores: ManagerDeps['stores']
  commandRunner: ManagerDeps['commandRunner']
  spawnAsync: ManagerDeps['spawnAsync']
  /** The runner commandRunner is built on: stop paths kill through the registry spawns use. */
  runner: ManagerDeps['runner']
  clock: ManagerDeps['clock']
  steamProcesses: ManagerDeps['steamProcesses']
  /** Called only when an update is enqueued (the queue is built after the managers). */
  getDownloadQueue: () => DownloadQueue
  /** Config, paths and host slices (D-66.3-01/03), passed through to every manager's deps. */
  config: ManagerDeps['config']
  gameConfigs: ManagerDeps['gameConfigs']
  paths: ManagerDeps['paths']
  appInfo: ManagerDeps['appInfo']
  dialogs: ManagerDeps['dialogs']
  openExternal: ManagerDeps['openExternal']
  notifications: ManagerDeps['notifications']
  appState: ManagerDeps['appState']
  imageTools: ManagerDeps['imageTools']
  onlineMonitor: ManagerDeps['onlineMonitor']
}

/**
 * Builds the five library managers and the launcher for one boot (D-02). The manager table is
 * allocated first and handed to every constructor by reference (RESEARCH Pattern B); no
 * constructor reads a sibling, so filling it afterwards is safe.
 */
export function createStoreManagers(
  deps: CreateStoreManagersDeps
): StoreManagers & { launcher: Launcher } {
  const library = {} as StoreManagers['library']
  const managerDeps: ManagerDeps = {
    libraryManagers: library,
    stores: deps.stores,
    commandRunner: deps.commandRunner,
    // The launcher is built below from the same map; managers reach it at call time.
    get launcher() {
      return launcher
    },
    spawnAsync: deps.spawnAsync,
    runner: deps.runner,
    clock: deps.clock,
    steamProcesses: deps.steamProcesses,
    getDownloadQueue: deps.getDownloadQueue,
    config: deps.config,
    gameConfigs: deps.gameConfigs,
    paths: deps.paths,
    appInfo: deps.appInfo,
    dialogs: deps.dialogs,
    openExternal: deps.openExternal,
    notifications: deps.notifications,
    appState: deps.appState,
    imageTools: deps.imageTools,
    onlineMonitor: deps.onlineMonitor
  }
  const launchHooks = buildLaunchHooks(managerDeps)
  const launcher = createLauncher({
    libraryManagers: library,
    launchHooks,
    commandRunner: deps.commandRunner,
    runner: deps.runner,
    spawnAsync: deps.spawnAsync,
    stores: deps.stores,
    config: deps.config,
    gameConfigs: deps.gameConfigs,
    appInfo: deps.appInfo,
    dialogs: deps.dialogs,
    appState: deps.appState,
    notifications: deps.notifications,
    onlineMonitor: deps.onlineMonitor
  })
  Object.assign(library, {
    sideload: new SideloadLibraryManager(managerDeps),
    gog: new GOGLibraryManager(managerDeps),
    legendary: new LegendaryLibraryManager(managerDeps),
    nile: new NileLibraryManager(managerDeps),
    steam: new SteamLibraryManager(managerDeps)
  } satisfies Record<Runner, LibraryManager>)

  function autoUpdate(runner: Runner, gamesToUpdate: string[]) {
    const logPrefix = RunnerToLogPrefixMap[runner]
    gamesToUpdate.forEach(async (appName) => {
      const game = library[runner].getGame(appName)
      const { ignoreGameUpdates } = await game.getSettings()
      const gameInfo = game.getGameInfo()
      const gameIsAvailable = await game.isGameAvailable()
      if (!ignoreGameUpdates && gameIsAvailable) {
        logInfo(`Auto-Updating ${gameInfo.title}`, logPrefix)
        const dmQueueElement: DMQueueElement = getDMElement(gameInfo, appName)
        deps
          .getDownloadQueue()
          .addToQueue(dmQueueElement)
          .catch((error: unknown) => {
            logWarning(
              `Auto-update could not queue ${gameInfo.title}: ${String(error)}`,
              logPrefix
            )
          })
        // remove from the array to avoid downloading the same game twice
        gamesToUpdate = gamesToUpdate.filter((game) => game !== appName)
      } else {
        logInfo(`Skipping auto-update for ${gameInfo.title}`, logPrefix)
      }
    })
    return gamesToUpdate
  }

  return {
    library,
    launchHooks,
    autoUpdate,
    initAll: () =>
      Promise.all(
        Object.values(library as Record<Runner, LibraryManager>).map(
          (manager) => manager.init()
        )
      ),
    launcher
  }
}
