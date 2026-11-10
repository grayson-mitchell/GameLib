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
import { legacyManagerDeps } from 'backend/services/legacyFacades'

import { logInfo, RunnerToLogPrefixMap } from 'backend/logger'
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

export const libraryManagerMap = {
  sideload: new SideloadLibraryManager(legacyManagerDeps()),
  gog: new GOGLibraryManager(legacyManagerDeps()),
  legendary: new LegendaryLibraryManager(legacyManagerDeps()),
  nile: new NileLibraryManager(legacyManagerDeps()),
  steam: new SteamLibraryManager(legacyManagerDeps())
} satisfies Record<Runner, LibraryManager>

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

const launchHooks = {
  sideload: {},
  gog: {
    prepareLaunch: async (appName) => {
      await gogSetup(legacyManagerDeps(), appName)
      sendFrontendMessage('gameStatusUpdate', {
        appName,
        runner: 'gog',
        status: 'launching'
      })
    },
    setPresence: async (appName) => {
      gogPresence.setCurrentGame(appName)
      await gogPresence.setPresence(legacyManagerDeps())
    },
    clearPresence: async () => {
      gogPresence.setCurrentGame('')
      await gogPresence.setPresence(legacyManagerDeps())
    }
  },
  legendary: {
    prepareLaunch: async (appName, logWriter) => {
      await legendarySetup(legacyManagerDeps(), appName, logWriter)
    },
    // R8 (Phase 49): the expired flag is read here, once per launch.
    resolveOfflineMode: (input) =>
      resolveEpicOfflineMode({
        ...input,
        storeExpired: Boolean(
          legacyManagerDeps().stores.legendary.legendaryConfigStore.get_nodefault(
            'expired'
          )
        )
      }),
    isOverlayEnabled: (appName) =>
      isEosOverlayEnabled(legacyManagerDeps(), appName)
  },
  nile: {
    prepareLaunch: async (appName) => {
      await nileSetup(legacyManagerDeps(), appName)
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

// Widened so a call site can write `storeLaunchHooks[runner].prepareLaunch?.()`.
export const storeLaunchHooks: Record<Runner, StoreLaunchHooks> = launchHooks

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

/** `getDownloadQueue` is called only when an update is enqueued (the queue is built after the managers). */
export interface AutoUpdateDeps {
  getDownloadQueue: () => Pick<DownloadQueue, 'addToQueue'>
}

export function autoUpdate(
  runner: Runner,
  gamesToUpdate: string[],
  deps: AutoUpdateDeps
) {
  const logPrefix = RunnerToLogPrefixMap[runner]
  gamesToUpdate.forEach(async (appName) => {
    const game = libraryManagerMap[runner].getGame(appName)
    const { ignoreGameUpdates } = await game.getSettings()
    const gameInfo = game.getGameInfo()
    const gameIsAvailable = await game.isGameAvailable()
    if (!ignoreGameUpdates && gameIsAvailable) {
      logInfo(`Auto-Updating ${gameInfo.title}`, logPrefix)
      const dmQueueElement: DMQueueElement = getDMElement(gameInfo, appName)
      void deps.getDownloadQueue().addToQueue(dmQueueElement)
      // remove from the array to avoid downloading the same game twice
      gamesToUpdate = gamesToUpdate.filter((game) => game !== appName)
    } else {
      logInfo(`Skipping auto-update for ${gameInfo.title}`, logPrefix)
    }
  })
  return gamesToUpdate
}

export async function initStoreManagers() {
  return Promise.all(
    Object.values(libraryManagerMap).map((manager) => manager.init())
  )
}
