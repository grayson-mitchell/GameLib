/**
 * Test fakes for the per-boot services (66.1, R5). Plain objects, no jest APIs, so meta/ and
 * non-jest callers can use them. Mirrors scriptedRunner: an unscripted call fails loudly,
 * because a default result would hide a missing script.
 *
 * `createTestStores` resolves every family it was not given lazily, on first access (a getter),
 * from a fresh `createStores` against its own registry (the jest fake HOME), so a test that
 * never touches a family never builds it.
 */
import {
  createStoreRegistry,
  type StoreRegistry
} from '../stores/storeRegistry'
import { createKvsStores } from '../constants/key_value_stores'
import { createCrossoverIndexStores } from '../crossover_index/stores'
import { createDownloadManagerStores } from '../downloadmanager/stores'
import { createGameOverridesStores } from '../game_overrides/stores'
import { createHumbleStores } from '../humble/stores'
import { createLoggerStores } from '../logger/stores'
import { createMacArchStores } from '../macArch/stores'
import { createMigrationStores } from '../migration/stores'
import { createRunsForMeStores } from '../runsForMe/stores'
import { createGogStores } from '../storeManagers/gog/stores'
import { createLegendaryStores } from '../storeManagers/legendary/stores'
import { createNileStores } from '../storeManagers/nile/stores'
import { createSideloadStores } from '../storeManagers/sideload/stores'
import { createSteamStores } from '../storeManagers/steam/stores'
import { createWikiGameInfoStores } from '../wiki_game_info/stores'
import { createWineManagerStores } from '../wine/manager/stores'
import type { EngineServices } from '../engine/engineServices'
import type { Runner } from 'common/types'
import type { LibraryManager } from 'common/types/game_manager'
import type {
  BootServices,
  CommandRunner,
  Launcher,
  ManagerDeps,
  QuitHandler,
  SpawnAsync,
  StoreManagers,
  Stores
} from '../services/types'

const RUNNERS = [
  'sideload',
  'gog',
  'legendary',
  'nile',
  'steam'
] as const satisfies readonly Runner[]

/** An object whose every member not in `given` throws when CALLED. */
function unscriptedMembers<T extends object>(
  label: string,
  given: Partial<T>,
  memberPrefix = ''
): T {
  return new Proxy(given as T, {
    get(target, prop, receiver) {
      if (typeof prop === 'symbol' || prop in target) {
        return Reflect.get(target, prop, receiver) as unknown
      }
      // then/toJSON etc. must stay undefined so awaiting or serialising a fake is safe.
      if (prop === 'then' || prop === 'toJSON') return undefined
      return () => {
        throw new Error(
          `unscripted ${label} call: ${memberPrefix}${String(prop)}`
        )
      }
    }
  })
}

export function createTestManagers(
  overrides: {
    library?: { [R in Runner]?: Partial<LibraryManager> }
    launchHooks?: Partial<StoreManagers['launchHooks']>
    autoUpdate?: StoreManagers['autoUpdate']
    initAll?: StoreManagers['initAll']
  } = {}
): StoreManagers {
  const library = {} as Record<string, unknown>
  for (const runner of RUNNERS) {
    library[runner] = unscriptedMembers<LibraryManager>(
      'manager',
      overrides.library?.[runner] ?? {},
      `${runner}.`
    )
  }
  // The one cast: each runner object is a Proxy that throws on any unscripted member.
  const typedLibrary = library as unknown as StoreManagers['library']
  const launchHooks = {} as Record<string, unknown>
  for (const runner of RUNNERS) {
    launchHooks[runner] = overrides.launchHooks?.[runner] ?? {}
  }
  return {
    library: typedLibrary,
    launchHooks: launchHooks as StoreManagers['launchHooks'],
    autoUpdate:
      overrides.autoUpdate ??
      (() => {
        throw new Error('unscripted manager call: autoUpdate')
      }),
    initAll:
      overrides.initAll ??
      (() => {
        throw new Error('unscripted manager call: initAll')
      })
  }
}

const STORE_KEYS = [
  'kvs',
  'crossoverIndex',
  'downloadManager',
  'gameOverrides',
  'humble',
  'logger',
  'macArch',
  'migration',
  'runsForMe',
  'gog',
  'legendary',
  'nile',
  'sideload',
  'steam',
  'wikiGameInfo',
  'wineManager'
] as const satisfies readonly (keyof Stores)[]

/** Builds one family against the shared registry; each call is lazy (see createTestStores). */
type FamilyBuilders = {
  [K in keyof Stores]: (registry: StoreRegistry) => Stores[K]
}

/**
 * The factories are imported eagerly (importing a stores module has no side effect: the
 * 16 modules only declare factories, and diPhaseGates pins that none constructs at import).
 * What stays lazy is the factory CALL, in the getters of createTestStores, so a family a suite
 * never reads never touches the real store backend.
 */
function familyBuilders(): FamilyBuilders {
  return {
    kvs: (registry) => createKvsStores({ registry }),
    crossoverIndex: () => createCrossoverIndexStores(),
    downloadManager: (registry) => createDownloadManagerStores({ registry }),
    gameOverrides: (registry) => createGameOverridesStores({ registry }),
    humble: (registry) => createHumbleStores({ registry }),
    logger: (registry) => createLoggerStores({ registry }),
    macArch: (registry) => createMacArchStores({ registry }),
    migration: (registry) => createMigrationStores({ registry }),
    runsForMe: (registry) => createRunsForMeStores({ registry }),
    gog: (registry) => createGogStores({ registry }),
    legendary: (registry) => createLegendaryStores({ registry }),
    nile: (registry) => createNileStores({ registry }),
    sideload: (registry) => createSideloadStores({ registry }),
    steam: (registry) => createSteamStores({ registry }),
    wikiGameInfo: () => createWikiGameInfoStores(),
    wineManager: (registry) => createWineManagerStores({ registry })
  }
}

export function createTestStores(overrides: Partial<Stores> = {}): Stores {
  const stores = {} as Stores
  const registry = createStoreRegistry()
  const builders = familyBuilders()
  for (const key of STORE_KEYS) {
    const given = overrides[key]
    let built: Stores[typeof key] | undefined
    Object.defineProperty(stores, key, {
      enumerable: true,
      get: () => {
        if (given) return given
        // Lazy and per family on purpose: building a family touches the real store backend,
        // which a suite that overrides only the slices it reads must never reach, and a
        // suite that mocks one family's module must not break the others.
        built ??= builders[key](registry)
        return built
      }
    })
  }
  return stores
}

export function createTestServices(
  overrides: Partial<BootServices> = {}
): BootServices {
  const spawnAsync: SpawnAsync = () => {
    throw new Error('unscripted spawnAsync call')
  }
  const quit: QuitHandler = {
    handleExit: () => {
      throw new Error('unscripted quit call: handleExit')
    }
  }
  return {
    stores: overrides.stores ?? createTestStores(),
    storeRegistry: overrides.storeRegistry ?? createStoreRegistry(),
    managers: overrides.managers ?? createTestManagers(),
    launcher: overrides.launcher ?? unscriptedMembers<Launcher>('launcher', {}),
    commandRunner:
      overrides.commandRunner ??
      unscriptedMembers<CommandRunner>('command runner', {}),
    runner:
      overrides.runner ??
      unscriptedMembers<BootServices['runner']>('process runner', {}),
    spawnAsync: overrides.spawnAsync ?? spawnAsync,
    quit: overrides.quit ?? quit,
    downloadQueue:
      overrides.downloadQueue ??
      unscriptedMembers<BootServices['downloadQueue']>('download queue', {})
  }
}

/** Deps for a library manager under test; any member not given throws when called. */
export function createTestManagerDeps(
  overrides: Partial<ManagerDeps> = {}
): ManagerDeps {
  return {
    libraryManagers: overrides.libraryManagers ?? createTestManagers().library,
    stores: overrides.stores ?? createTestStores(),
    commandRunner:
      overrides.commandRunner ??
      unscriptedMembers<CommandRunner>('command runner', {}),
    launcher: overrides.launcher ?? unscriptedMembers<Launcher>('launcher', {}),
    spawnAsync:
      overrides.spawnAsync ??
      (() => {
        throw new Error('unscripted spawnAsync call')
      }),
    runner:
      overrides.runner ??
      unscriptedMembers<ManagerDeps['runner']>('process runner', {}),
    getDownloadQueue:
      overrides.getDownloadQueue ??
      (() => {
        throw new Error('unscripted call: getDownloadQueue')
      })
  }
}

/** The engine's injected capabilities (66.1-22i): an unscripted installRemove fails loudly; no releases. */
export function createTestEngineServices(
  overrides: Partial<EngineServices> = {}
): EngineServices {
  return {
    spawnAsync: createTestServices().spawnAsync,
    installRemove: () => {
      throw new Error('unscripted installRemove call')
    },
    wineManagerReleases: () => [],
    ...overrides
  }
}
