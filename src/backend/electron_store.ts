import Store from './store_backend'

import {
  StoreOptions,
  StoreStructure,
  TypeCheckedStore,
  UnknownGuard,
  ValidStoreName
} from 'common/types/electron_store'
import { Get } from 'type-fest'
import {
  notifyStoreChanged,
  notifyStoreInvalidated
} from './storeChangeNotifier'

// REQ-29-01 / Pitfall 4: a `ValidStoreName` string is NOT the on-disk
// filename — `options.cwd` + (`options.name` ?? 'config') governs that, and
// `TypeCheckedStoreBackend`'s constructor drops its `name` parameter
// entirely once `new Store(options)` is called. Any generic, name-keyed
// dispatch (the sidecar's storeSet/storeGet handlers, plan 29-05) MUST
// resolve the live instance through this registry and must NEVER
// reconstruct a path/instance from the name string itself.
export interface RegisteredStore {
  instance: TypeCheckedStoreBackend<ValidStoreName>
  options: StoreOptions<StoreStructure[ValidStoreName]>
}

const storeRegistry = new Map<string, RegisteredStore>()

export function getRegisteredStore(
  name: string
): TypeCheckedStoreBackend<ValidStoreName> | undefined {
  return storeRegistry.get(name)?.instance
}

export function getRegisteredStoreOptions(
  name: string
): StoreOptions<StoreStructure[ValidStoreName]> | undefined {
  return storeRegistry.get(name)?.options
}

export function getRegisteredStoreNames(): string[] {
  return [...storeRegistry.keys()]
}

export class TypeCheckedStoreBackend<
  Name extends ValidStoreName
> implements TypeCheckedStore<Name> {
  private store: Store
  /**
   * Retained so writes can name the store they changed when notifying the renderer.
   *
   * This does NOT contradict the REQ-29-01 note above: that note says the name is not the
   * on-disk FILENAME and must never be used to reconstruct a path. It is still the store's
   * IDENTITY — `storeRegistry` above is already keyed by it, and it is exactly the
   * identifier `StoreChangedPayload.store` carries. Used for identity only, never for
   * path resolution.
   */
  private readonly storeName: Name

  constructor(name: Name, options: StoreOptions<StoreStructure[Name]>) {
    this.storeName = name
    // @ts-expect-error Pre-existing generic variance between the per-store
    // `StoreStructure[Name]` shape and the store's own `Record<string, unknown>`
    // default. Carried over verbatim from the electron-store-backed version.
    this.store = new Store(options)
    // WR-08 (Phase 29 code review): FIRST registration wins. This used to be an
    // unconditional `set`, so a second construction under the same `ValidStoreName`
    // silently re-pointed every name-keyed dispatch (`getRegisteredStore`, and
    // therefore the whole renderer-driven write path) at a different instance with no
    // warning at all. Now that the registry is load-bearing for writes,
    // last-writer-wins is not an acceptable default; a duplicate is a real defect and
    // must at least be greppable.
    if (storeRegistry.has(name)) {
      process.stderr.write(
        `[electron_store] duplicate registration for '${name}' — keeping the first instance\n`
      )
    } else {
      storeRegistry.set(name, {
        instance: this as unknown as TypeCheckedStoreBackend<ValidStoreName>,
        options: options as StoreOptions<StoreStructure[ValidStoreName]>
      })
    }
  }

  public has(key: string) {
    return this.store.has(key)
  }

  public get<KeyType extends string>(
    key: KeyType,
    defaultValue: NonNullable<UnknownGuard<Get<StoreStructure[Name], KeyType>>>
  ) {
    return this.store.get(key, defaultValue) as NonNullable<
      UnknownGuard<Get<StoreStructure[Name], KeyType>>
    >
  }

  public get_nodefault<KeyType extends string>(key: KeyType) {
    return this.store.get(key) as UnknownGuard<
      Get<StoreStructure[Name], KeyType> | undefined
    >
  }

  // The three write methods below each announce the change to the renderer AFTER the
  // write succeeds. See `../storeChangeNotifier` for why this is an injected function
  // rather than a direct `pushFrontendMessage` call, and why it is a no-op under Electron.
  // A write that throws must NOT notify — the renderer would then cache a value that is
  // not on disk, which is the exact divergence this mechanism exists to prevent.

  public set<KeyType extends string>(
    key: KeyType,
    value: UnknownGuard<Get<StoreStructure[Name], KeyType>>
  ) {
    this.store.set(key, value)
    notifyStoreChanged({ store: this.storeName, key, value })
  }

  public delete<KeyType extends string>(key: KeyType) {
    this.store.delete(key)
    notifyStoreChanged({ store: this.storeName, key, deleted: true })
  }

  public clear() {
    this.store.clear()
    // Whole-store change: no single key describes it, and a per-key encoding could not
    // express the removals at all.
    notifyStoreInvalidated(this.storeName)
  }

  public get raw_store() {
    return this.store.store as StoreStructure[Name]
  }
}
