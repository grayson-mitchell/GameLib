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
