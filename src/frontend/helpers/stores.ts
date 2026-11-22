// Phase 27 Plan 05 (blank-screen fix): real dependency edge on the Tauri attach module —
// this file constructs TypeCheckedStoreFrontends at module scope (bottom of file), each of
// whose constructors calls `window.api.storeNew(...)` synchronously. Same reasoning as
// `frontend/helpers/index.ts`: the renderer entry's import order does not survive Rollup's
// chunking, so the ordering requirement must be expressed as an actual import. Idempotent;
// it no-oped identically back when this ran under the old Electron build.
import '../../preload/tauriAttach'

import { Get } from 'type-fest'

import {
  ValidStoreName,
  StoreOptions,
  StoreStructure,
  TypeCheckedStore,
  UnknownGuard
} from 'common/types/typed_store'
import type { LegendaryGameInfo } from 'common/types/legendary'
import type { GogGameInfo } from 'common/types/gog'
import type { SteamGameInfo } from 'common/types/steam'
import type { NileGameInfo } from 'common/types/nile'

class TypeCheckedStoreFrontend<
  Name extends ValidStoreName
> implements TypeCheckedStore<Name> {
  private storeName: ValidStoreName

  constructor(name: Name, options: StoreOptions<StoreStructure[Name]>) {
    this.storeName = name
    window.api.storeNew(name, options)
  }

  public has(key: string) {
    return window.api.storeHas(this.storeName, key)
  }

  public get<KeyType extends string>(
    key: KeyType,
    defaultValue: NonNullable<UnknownGuard<Get<StoreStructure[Name], KeyType>>>
  ) {
    return window.api.storeGet(
      this.storeName,
      key,
      defaultValue
    ) as NonNullable<UnknownGuard<Get<StoreStructure[Name], KeyType>>>
  }

  public get_nodefault<KeyType extends string>(key: KeyType) {
    return window.api.storeGet(this.storeName, key) as UnknownGuard<
      Get<StoreStructure[Name], KeyType> | undefined
    >
  }

  public set<KeyType extends string>(
    key: KeyType,
    value: UnknownGuard<Get<StoreStructure[Name], KeyType>>
  ) {
    window.api.storeSet(this.storeName, key, value)
  }

  /**
   * Awaitable `set`: resolves `true` only after the sidecar persisted the write, `false` when it
   * was refused or failed. The renderer snapshot is left unchanged on `false`.
   */
  public setChecked<KeyType extends string>(
    key: KeyType,
    value: UnknownGuard<Get<StoreStructure[Name], KeyType>>
  ): Promise<boolean> {
    return window.api.storeSetChecked(this.storeName, key, value)
  }

  public delete<KeyType extends string>(key: KeyType) {
    window.api.storeDelete(this.storeName, key)
  }

  public clear() {
    throw new Error('Not implemented for TypeCheckedStoreFrontend')
  }

  /**
   * Calls `callback` after this store's renderer snapshot changes (a backend write reaching the
   * renderer, or a re-fetch). Returns the unsubscribe function.
   */
  public onChange(callback: () => void): () => void {
    return window.api.storeOnChanged(this.storeName, callback)
  }
}

class CacheStore<ValueType, KeyType extends string = string> {
  private readonly storeName: string
  private readonly lifespan: number | null

  /**
   * Creates a new cache store
   * @param filename
   * @param max_value_lifespan How long an individual entry in the store will
   *                           be cached (in minutes)
   */
  constructor(filename: string, max_value_lifespan: number | null = 60 * 6) {
    this.storeName = filename
    window.api.storeNew(filename, {
      cwd: 'store_cache',
      name: filename,
      clearInvalidConfig: true
    })
    this.lifespan = max_value_lifespan
  }

  public get(key: KeyType): ValueType | undefined
  public get(key: KeyType, fallback: ValueType): ValueType
  public get(key: KeyType, fallback?: ValueType) {
    if (!window.api.storeHas(this.storeName, key)) {
      return fallback
    }

    const lastUpdateTimestamp = window.api.storeGet(
      this.storeName,
      `__timestamp.${key}`
    ) as string | undefined
    if (!lastUpdateTimestamp) {
      return fallback
    }
    const updateDate = new Date(lastUpdateTimestamp)
    const msSinceUpdate = Date.now() - updateDate.getTime()
    const minutesSinceUpdate = msSinceUpdate / 1000 / 60
    if (this.lifespan && minutesSinceUpdate > this.lifespan) {
      window.api.storeDelete(this.storeName, key)
      window.api.storeDelete(this.storeName, `__timestamp.${key}`)
      return
    }

    return window.api.storeGet(this.storeName, key) as ValueType
  }

  public set(key: KeyType, value: ValueType) {
    window.api.storeSet(this.storeName, key, value)
    window.api.storeSet(this.storeName, `__timestamp.${key}`, Date())
  }

  /**
   * Calls `callback` after this store's renderer snapshot changes (a backend write reaching the
   * renderer, or a re-fetch). Returns the unsubscribe function.
   */
  public onChange(callback: () => void): () => void {
    return window.api.storeOnChanged(this.storeName, callback)
  }
}

const configStore = new TypeCheckedStoreFrontend('configStore', {
  cwd: 'store'
})

const libraryStore = new CacheStore<LegendaryGameInfo[], 'library'>(
  'legendary_library',
  null
)

const wineDownloaderInfoStore = new TypeCheckedStoreFrontend(
  'wineDownloaderInfoStore',
  {
    cwd: 'store',
    name: 'wine-downloader-info'
  }
)

const gogLibraryStore = new CacheStore<GogGameInfo[], 'games'>(
  'gog_library',
  null
)
const gogInstalledGamesStore = new TypeCheckedStoreFrontend(
  'gogInstalledGamesStore',
  {
    cwd: 'gog_store',
    name: 'installed'
  }
)
const gogConfigStore = new TypeCheckedStoreFrontend('gogConfigStore', {
  cwd: 'gog_store'
})

const steamConfigStore = new TypeCheckedStoreFrontend('steamConfigStore', {
  cwd: 'steam_store'
})

const steamLibraryStore = new CacheStore<SteamGameInfo[], 'games'>(
  'steam_library',
  null
)

const humbleConfigStore = new TypeCheckedStoreFrontend('humbleConfigStore', {
  cwd: 'humble_store'
})

const nileLibraryStore = new CacheStore<NileGameInfo[], 'library'>(
  'nile_library',
  null
)
const nileConfigStore = new TypeCheckedStoreFrontend('nileConfigStore', {
  cwd: 'nile_store'
})

const legendaryConfigStore = new TypeCheckedStoreFrontend(
  'legendaryConfigStore',
  { cwd: 'legendary_store' }
)

const timestampStore = new TypeCheckedStoreFrontend('timestampStore', {
  cwd: 'store',
  name: 'timestamp'
})

const sideloadLibrary = new TypeCheckedStoreFrontend('sideloadedStore', {
  cwd: 'sideload_apps',
  name: 'library'
})

const downloadManagerStore = new TypeCheckedStoreFrontend('downloadManager', {
  cwd: 'store',
  name: 'download-manager'
})

const gameOverridesStore = new TypeCheckedStoreFrontend('gameOverridesStore', {
  cwd: 'store',
  name: 'game-overrides'
})

export {
  configStore,
  gogLibraryStore,
  gogInstalledGamesStore,
  gogConfigStore,
  libraryStore,
  timestampStore,
  sideloadLibrary,
  wineDownloaderInfoStore,
  downloadManagerStore,
  nileLibraryStore,
  nileConfigStore,
  legendaryConfigStore,
  steamConfigStore,
  steamLibraryStore,
  humbleConfigStore,
  gameOverridesStore
}
