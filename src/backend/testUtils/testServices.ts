/**
 * Test fakes for the per-boot services (66.1, R5). Plain objects, no jest APIs, so meta/ and
 * non-jest callers can use them. Mirrors scriptedRunner: an unscripted call fails loudly,
 * because a default result would hide a missing script.
 *
 * `createTestStores` resolves every family it was not given lazily to the real facade family on
 * first access (a getter), so a test that never touches a family never loads it. Plan 25
 * switches that default to a fresh `createStores` on the test context's userData.
 */
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

export function createTestStores(overrides: Partial<Stores> = {}): Stores {
  const stores = {} as Stores
  let facade: Stores | undefined
  for (const key of STORE_KEYS) {
    const given = overrides[key]
    Object.defineProperty(stores, key, {
      enumerable: true,
      get: () => {
        if (given) return given
        // Lazy on purpose: the facade module pulls in the launcher and every store module.
        /* eslint-disable @typescript-eslint/no-require-imports */
        const facades =
          require('../services/legacyFacades') as typeof import('../services/legacyFacades')
        /* eslint-enable @typescript-eslint/no-require-imports */
        facade ??= facades.buildStoresFacade()
        return facade[key]
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
