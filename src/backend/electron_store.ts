import Store from 'electron-store'

import {
  StoreStructure,
  TypeCheckedStore,
  UnknownGuard,
  ValidStoreName
} from 'common/types/electron_store'
import { Get } from 'type-fest'

// REQ-29-01 / Pitfall 4: a `ValidStoreName` string is NOT the on-disk
// filename — `options.cwd` + (`options.name` ?? 'config') governs that, and
// `TypeCheckedStoreBackend`'s constructor drops its `name` parameter
// entirely once `new Store(options)` is called. Any generic, name-keyed
// dispatch (the sidecar's storeSet/storeGet handlers, plan 29-05) MUST
// resolve the live instance through this registry and must NEVER
// reconstruct a path/instance from the name string itself.
export interface RegisteredStore {
  instance: TypeCheckedStoreBackend<ValidStoreName>
  options: Store.Options<StoreStructure[ValidStoreName]>
}

const storeRegistry = new Map<string, RegisteredStore>()

export function getRegisteredStore(
  name: string
): TypeCheckedStoreBackend<ValidStoreName> | undefined {
  return storeRegistry.get(name)?.instance
}

export function getRegisteredStoreOptions(
  name: string
): Store.Options<StoreStructure[ValidStoreName]> | undefined {
  return storeRegistry.get(name)?.options
}

export function getRegisteredStoreNames(): string[] {
  return [...storeRegistry.keys()]
}

export class TypeCheckedStoreBackend<
  Name extends ValidStoreName
> implements TypeCheckedStore<Name> {
  private store: Store

  constructor(name: Name, options: Store.Options<StoreStructure[Name]>) {
    // @ts-expect-error This looks like a bug in electron-store's type definitions
    this.store = new Store(options)
    storeRegistry.set(name, {
      instance: this as unknown as TypeCheckedStoreBackend<ValidStoreName>,
      options: options as Store.Options<StoreStructure[ValidStoreName]>
    })
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

  public set<KeyType extends string>(
    key: KeyType,
    value: UnknownGuard<Get<StoreStructure[Name], KeyType>>
  ) {
    this.store.set(key, value)
  }

  public delete<KeyType extends string>(key: KeyType) {
    this.store.delete(key)
  }

  public clear() {
    this.store.clear()
  }

  public get raw_store() {
    return this.store.store as StoreStructure[Name]
  }
}
