/**
 * TEMPORARY (66.1, A3 expand/contract): identity facades that only GROUP today's singletons
 * and functions into the per-boot `BootServices` shapes. Nothing is constructed here, so the
 * behaviour is unchanged; consumers convert once onto the slices and each owner plan later
 * swaps its facade for the real factory.
 *
 * Deletion schedule: command runner (plan 05), spawnAsync and quit (plan 06), managers and
 * launcher (plan 23, with the legacyManagerDeps added by plan 08), stores (plan 25). The file
 * is deleted by plan 25 with the last one.
 *
 * Everything is inside a function: no top-level `let`/`const` binding for the ratchet.
 */
import * as kvs from 'backend/constants/key_value_stores'
import * as crossoverIndex from 'backend/crossover_index/stores'
import * as downloadManager from 'backend/downloadmanager/stores'
import * as gameOverrides from 'backend/game_overrides/stores'
import * as humble from 'backend/humble/stores'
import * as loggerStores from 'backend/logger/stores'
import * as macArch from 'backend/macArch/stores'
import * as migration from 'backend/migration/stores'
import * as runsForMe from 'backend/runsForMe/stores'
import * as gog from 'backend/storeManagers/gog/stores'
import * as legendary from 'backend/storeManagers/legendary/stores'
import * as nile from 'backend/storeManagers/nile/stores'
import * as sideload from 'backend/storeManagers/sideload/stores'
import * as steam from 'backend/storeManagers/steam/stores'
import * as wikiGameInfo from 'backend/wiki_game_info/stores'
import * as wineManager from 'backend/wine/manager/stores'
import {
  autoUpdate,
  initStoreManagers,
  libraryManagerMap,
  storeLaunchHooks
} from 'backend/storeManagers'
import * as launcherModule from 'backend/launcher'
import * as utilsModule from 'backend/utils'
import type { Launcher, ManagerDeps, StoreManagers, Stores } from './types'

export function buildStoresFacade(): Stores {
  return {
    kvs,
    crossoverIndex,
    downloadManager,
    gameOverrides,
    humble,
    logger: loggerStores,
    macArch,
    migration,
    runsForMe,
    gog,
    legendary,
    nile,
    sideload,
    steam,
    wikiGameInfo,
    wineManager
  }
}

export function buildManagersFacade(): StoreManagers {
  return {
    library: libraryManagerMap,
    launchHooks: storeLaunchHooks,
    autoUpdate,
    initAll: initStoreManagers
  }
}

export function buildLauncherFacade(): Launcher {
  return {
    prepareLaunch: launcherModule.prepareLaunch,
    launchCleanup: launcherModule.launchCleanup,
    prepareWineLaunch: launcherModule.prepareWineLaunch,
    setupEnvVars: launcherModule.setupEnvVars,
    setupWrapperEnvVars: launcherModule.setupWrapperEnvVars,
    setupWineEnvVars: launcherModule.setupWineEnvVars,
    setupWrappers: launcherModule.setupWrappers,
    launchEventCallback: launcherModule.launchEventCallback,
    getKnownFixesEnvVariables: launcherModule.getKnownFixesEnvVariables,
    validWine: launcherModule.validWine,
    verifyWinePrefix: launcherModule.verifyWinePrefix
  }
}

/**
 * The legacy launcher functions take a `ChildProcess` where the service types hand out a
 * `ChildHandle`; the handle is a subset, so forwarding is safe. Wrappers resolve the function
 * at call time (R4).
 */
function legacyCommandRunner(): ManagerDeps['commandRunner'] {
  const forward =
    (
      name: 'callRunner' | 'runWineCommand' | 'getWinePath' | 'runScriptForGame'
    ) =>
    (...a: unknown[]): unknown =>
      (launcherModule[name] as (...x: unknown[]) => unknown)(...a)
  return {
    callRunner: forward('callRunner'),
    runWineCommand: forward('runWineCommand'),
    getWinePath: forward('getWinePath'),
    runScriptForGame: forward('runScriptForGame')
  } as unknown as ManagerDeps['commandRunner']
}

/**
 * TEMPORARY (plan 08, deleted by plan 23): deps for the library managers that the import-time
 * `libraryManagerMap` still constructs. Every member defers to the legacy value at CALL time
 * (R4): this module is evaluated inside the storeManagers/launcher import cycle, so nothing
 * here may capture a function reference or dereference the map while loading.
 */
export function legacyManagerDeps(): ManagerDeps {
  return {
    get libraryManagers() {
      return libraryManagerMap
    },
    stores: buildStoresFacade(),
    commandRunner: legacyCommandRunner(),
    launcher: {
      prepareLaunch: (...a) => launcherModule.prepareLaunch(...a),
      launchCleanup: (...a) => launcherModule.launchCleanup(...a),
      prepareWineLaunch: (...a) => launcherModule.prepareWineLaunch(...a),
      setupEnvVars: (...a) => launcherModule.setupEnvVars(...a),
      setupWrapperEnvVars: (...a) => launcherModule.setupWrapperEnvVars(...a),
      setupWineEnvVars: (...a) => launcherModule.setupWineEnvVars(...a),
      setupWrappers: (...a) => launcherModule.setupWrappers(...a),
      launchEventCallback: (...a) => launcherModule.launchEventCallback(...a),
      getKnownFixesEnvVariables: (...a) =>
        launcherModule.getKnownFixesEnvVariables(...a),
      validWine: (...a) => launcherModule.validWine(...a),
      verifyWinePrefix: (...a) => launcherModule.verifyWinePrefix(...a)
    },
    spawnAsync: (...a) => utilsModule.spawnAsync(...a)
  }
}
