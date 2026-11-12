import { basename, dirname, join } from 'node:path'
import CacheStore from '../../cache'
import { TypeCheckedStoreBackend } from '../../typed_store'
import { defined } from '../../testUtils/indexed'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import { createStoreRoot } from '../storeRoot'
import {
  createTestStoreRoot,
  testUserDataDir
} from '../../testUtils/testStoreRoot'
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
      { registry: mine, root: createTestStoreRoot() }
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
      { kind: 'user-state' },
      { root: createTestStoreRoot() }
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
    createStores({ registry, root: createTestStoreRoot() })
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
        testUserDataDir(),
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
  let builtRoot = createTestStoreRoot()
  const kindOf = (path: string) => builtRoot.versioning.kindOf(path)
  function builtCacheStores(): Map<string, CacheInternals> {
    builtRoot = createTestStoreRoot()
    const stores = createStores({
      registry: createStoreRegistry(),
      root: builtRoot
    })
    const built = new Map<string, CacheInternals>()
    for (const family of Object.values(stores)) {
      for (const store of Object.values(family)) {
        if (!(store instanceof CacheStore)) continue
        const internals = store as unknown as CacheInternals
        const path = internals.store.path
        expect(dirname(path)).toBe(join(testUserDataDir(), 'store_cache'))
        const name = basename(path, '.json')
        expect(built.has(name)).toBe(false)
        built.set(name, internals)
      }
    }
    return built
  }

  // The fixture predates the engine family: `steam_engine_notices` joined createStores in 66.4
  // plan 04 (its on-disk name is unchanged), the pci_ids_* caches joined as `systemInfo`.
  const fixtureCaches = fixture.filter((entry) => entry.registeredAs === null)
  const ENGINE_NOTICE_CACHE = 'steam_engine_notices'

  it('builds exactly the fixture cache stores, each declared with the fixture kind', () => {
    const built = builtCacheStores()
    expect([...built.keys()].sort()).toEqual(
      [
        ...new Set(fixtureCaches.map((entry) => entry.options.name)),
        ENGINE_NOTICE_CACHE
      ].sort()
    )
    expect(
      kindOf(defined(built.get(ENGINE_NOTICE_CACHE), 'notices').store.path)
    ).toBe('user-state')
    for (const entry of fixtureCaches) {
      const name = defined(entry.options.name, 'fixture cache name')
      const path = defined(built.get(name), name).store.path
      expect(kindOf(path)).toBe(entry.declaration.kind)
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

  it('two roots build independent stores: engine notices and pci caches do not share cells', () => {
    const rootA = createStoreRoot({ userData: createTestStoreRoot().userData })
    const rootB = createStoreRoot({ userData: createTestStoreRoot().userData })
    const a = createStores({ registry: createStoreRegistry(), root: rootA })
    const b = createStores({ registry: createStoreRegistry(), root: rootB })
    expect(a.engine.noticeStore).not.toBe(b.engine.noticeStore)
    expect(a.systemInfo.deviceNameCache).not.toBe(b.systemInfo.deviceNameCache)
  })

  it('two boots get independent registries and instances, and no duplicate line', () => {
    const stderr = jest.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      const a = createStoreRegistry()
      const b = createStoreRegistry()
      const storesA = createStores({ registry: a, root: createTestStoreRoot() })
      const storesB = createStores({ registry: b, root: createTestStoreRoot() })
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
