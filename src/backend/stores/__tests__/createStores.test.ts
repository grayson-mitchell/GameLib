import { basename, dirname, join } from 'node:path'
import CacheStore from '../../cache'
import { getPath } from '../../sidecar/pathShim'
import { TypeCheckedStoreBackend } from '../../typed_store'
import { defined } from '../../testUtils/indexed'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import { __kindOfForTest } from '../../storeVersioning/engine'
import fixture from './fixtures/registeredStores.json'

/**
 * The registry is per boot: a typed store joins only the registry it is handed, and two
 * registries never see each other's stores. No jest.mock: stores are built on the jest fake HOME
 * (`jest.setupContainment.ts`).
 */
describe('createStoreRegistry', () => {
  it('registers a typed store into the registry it was given and nowhere else', () => {
    const mine = createStoreRegistry()
    const other = createStoreRegistry()
    const store = new TypeCheckedStoreBackend(
      'configStore',
      { cwd: 'store' },
      { kind: 'user-state' },
      mine
    )
    expect(mine.get('configStore')).toBe(store)
    expect(mine.getOptions('configStore')).toEqual({ cwd: 'store' })
    expect(mine.getDeclaration('configStore')).toEqual({ kind: 'user-state' })
    expect(mine.names()).toEqual(['configStore'])
    expect(other.get('configStore')).toBeUndefined()
    expect(other.names()).toEqual([])
  })

  it('a store constructed with no registry is not visible through any registry', () => {
    const registry = createStoreRegistry()
    new TypeCheckedStoreBackend(
      'timestampStore',
      { cwd: 'store', name: 'timestamp' },
      { kind: 'user-state' }
    )
    expect(registry.get('timestampStore')).toBeUndefined()
    expect(registry.names()).toEqual([])
  })

  it('two registries hold independent entries under the same name', () => {
    const a = createStoreRegistry()
    const b = createStoreRegistry()
    const instanceA = {} as never
    const instanceB = {} as never
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      a.register('configStore', instanceA, { cwd: 'store' })
      b.register('configStore', instanceB, { cwd: 'store' })
      expect(stderr).not.toHaveBeenCalled()
    } finally {
      stderr.mockRestore()
    }
    expect(a.get('configStore')).toBe(instanceA)
    expect(b.get('configStore')).toBe(instanceB)
  })

  it('keeps the first instance and reports a duplicate inside one registry', () => {
    const registry = createStoreRegistry()
    const first = {} as never
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      registry.register('configStore', first, { cwd: 'store' })
      registry.register('configStore', {} as never, { cwd: 'store' })
      expect(stderr).toHaveBeenCalledTimes(1)
    } finally {
      stderr.mockRestore()
    }
    expect(registry.get('configStore')).toBe(first)
  })
})

/**
 * Parity with the pre-change singletons: `fixtures/registeredStores.json` was captured from the
 * module-level stores before any `stores.ts` became a factory (every store construction, with
 * its options and declaration, and the registry name where it had one).
 */
describe('createStores', () => {
  const registered = fixture.filter((entry) => entry.registeredAs !== null)

  it('registers exactly the stores the singletons registered, with identical options and declarations', () => {
    const registry = createStoreRegistry()
    createStores({ registry })
    expect(registry.names().sort()).toEqual(
      registered.map((entry) => entry.registeredAs).sort()
    )
    for (const entry of registered) {
      const name = entry.registeredAs
      const { schemaKeys, ...options } = entry.options
      const actual = registry.getOptions(name) as unknown as Record<
        string,
        unknown
      >
      const { schema, ...actualOptions } = actual
      // An absolute cwd (game_overrides, runsForMe, macArch) is pinned relative to userData.
      const cwd = String(actualOptions.cwd).replace(
        getPath('userData'),
        '<userData>'
      )
      expect({ ...actualOptions, cwd }).toEqual(options)
      expect(schema ? Object.keys(schema).sort() : null).toEqual(schemaKeys)
      expect(registry.getDeclaration(name)).toEqual(entry.declaration)
    }
  })

  type CacheInternals = {
    store: { path: string }
    lifespan: number | null
    invalidateCheck: (data: unknown) => boolean
  }

  /** Every CacheStore `createStores` builds, keyed by its file name under store_cache. */
  function builtCacheStores(): Map<string, CacheInternals> {
    const stores = createStores({ registry: createStoreRegistry() })
    const built = new Map<string, CacheInternals>()
    for (const family of Object.values(stores)) {
      for (const store of Object.values(family)) {
        if (!(store instanceof CacheStore)) continue
        const internals = store as unknown as CacheInternals
        const path = internals.store.path
        expect(dirname(path)).toBe(join(getPath('userData'), 'store_cache'))
        const name = basename(path, '.json')
        expect(built.has(name)).toBe(false)
        built.set(name, internals)
      }
    }
    return built
  }

  // The pci_ids_* caches are built outside createStores (the systeminfo module), so they are in
  // the fixture but not in this factory's output.
  const fixtureCaches = fixture.filter(
    (entry) =>
      entry.registeredAs === null && !entry.options.name.startsWith('pci_ids_')
  )

  it('builds exactly the fixture cache stores, each declared with the fixture kind', () => {
    const built = builtCacheStores()
    expect([...built.keys()].sort()).toEqual(
      [...new Set(fixtureCaches.map((entry) => entry.options.name))].sort()
    )
    for (const entry of fixtureCaches) {
      const name = defined(entry.options.name, 'fixture cache name')
      const path = defined(built.get(name), name).store.path
      expect(__kindOfForTest(path)).toBe(entry.declaration.kind)
    }
  })

  it('pins the TTL and invalidateCheck of the umu, wikigameinfo and crossover_index caches', () => {
    const built = builtCacheStores()
    const umu = built.get('umu')
    expect(umu?.lifespan).toBe(60 * 6)
    expect(umu?.invalidateCheck(null)).toBe(true) // a cached "no umu id" is re-resolved
    expect(umu?.invalidateCheck('umu-123')).toBe(false)
    const wiki = built.get('wikigameinfo')
    expect(wiki?.lifespan).toBe(60 * 24 * 30)
    expect(wiki?.invalidateCheck({})).toBe(true) // the CacheStore default
    const crossover = built.get('crossover_index')
    expect(crossover?.lifespan).toBe(60 * 24)
    expect(crossover?.invalidateCheck({})).toBe(false) // keep-last-good (D-09)
  })

  it('two boots get independent registries and instances, and no duplicate line', () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      const a = createStoreRegistry()
      const b = createStoreRegistry()
      const storesA = createStores({ registry: a })
      const storesB = createStores({ registry: b })
      expect(stderr).not.toHaveBeenCalled()
      expect(a.names().sort()).toEqual(b.names().sort())
      expect(a.get('configStore')).toBe(storesA.kvs.configStore)
      expect(b.get('configStore')).toBe(storesB.kvs.configStore)
      expect(a.get('configStore')).not.toBe(b.get('configStore'))
    } finally {
      stderr.mockRestore()
    }
  })
})
