import type { SignInStore } from 'common/signInState'
import type { SignInVerdictDeps } from '../verdict'

/**
 * Plain (non-jest.fn) stand-in for a TypeCheckedStoreBackend, so `resetMocks`
 * cannot wipe its behaviour between tests. Records every write.
 */
export interface FakeFlagStore {
  data: Map<string, unknown>
  sets: Array<[string, unknown]>
  deletes: string[]
  get_nodefault(key: string): unknown
  set(key: string, value: unknown): void
  delete(key: string): void
  reset(): void
}

export function makeFakeFlagStore(): FakeFlagStore {
  const store: FakeFlagStore = {
    data: new Map(),
    sets: [],
    deletes: [],
    get_nodefault: (key) => store.data.get(key),
    set: (key, value) => {
      store.sets.push([key, value])
      store.data.set(key, value)
    },
    delete: (key) => {
      store.deletes.push(key)
      store.data.delete(key)
    },
    reset: () => {
      store.data.clear()
      store.sets.length = 0
      store.deletes.length = 0
    }
  }
  return store
}

/**
 * The five sign-in families as fakes, in the shape `SignInVerdictDeps.stores`
 * expects (each family module exposes its config store under its own name).
 */
export function makeFakeSignInStores(): {
  fakes: Record<SignInStore, FakeFlagStore>
  stores: SignInVerdictDeps['stores']
} {
  const fakes: Record<SignInStore, FakeFlagStore> = {
    legendary: makeFakeFlagStore(),
    gog: makeFakeFlagStore(),
    nile: makeFakeFlagStore(),
    humble: makeFakeFlagStore(),
    steam: makeFakeFlagStore()
  }
  const stores = {
    legendary: { legendaryConfigStore: fakes.legendary },
    gog: { configStore: fakes.gog },
    nile: { configStore: fakes.nile },
    humble: { configStore: fakes.humble },
    steam: { configStore: fakes.steam }
  } as unknown as SignInVerdictDeps['stores']
  return { fakes, stores }
}
