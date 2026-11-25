import { basename, dirname, join, sep } from 'node:path'
import CacheStore from '../../cache'
import { TypeCheckedStoreBackend } from '../../typed_store'
import { defined } from '../../testUtils/indexed'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
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
      // An absolute cwd (runsForMe, macArch) is pinned relative to userData.
      // The declared pins are `/`-separated, so a win32 host's `\` is read in that form.
      const cwd = String(actualOptions.cwd)
        .replace(testUserDataDir(), '<userData>')
        .split(sep)
        .join('/')
      expect({ ...actualOptions, cwd }).toEqual(options)
      expect(schema ? Object.keys(schema).sort() : null).toEqual(schemaKeys)
      expect(registry.getDeclaration(name)).toEqual(entry.declaration)
    }
  })

  type CacheInternals = {
    store: { path: string; declaration?: { kind: string } }
    lifespan: number | null
    invalidateCheck: (data: unknown) => boolean
  }

  /**
   * The kind a built cache store was declared with at its construction site (its StoreDeclaration,
   * which the store keeps). Since 85-21 no TS engine records a per-path kind: the conf
   * composition's prepare step that fed it is gone with the TS owner path.
   */
  const kindOf = (store: CacheInternals) => store.store.declaration?.kind

  /** Every CacheStore `createStores` builds, keyed by its file name under store_cache. */
  function builtCacheStores(): Map<string, CacheInternals> {
    const stores = createStores({
      registry: createStoreRegistry(),
      root: createTestStoreRoot()
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

  // 88.1-18: the pci_ids_* caches lost their TS registration with the TS system-information tree (no `systemInfo` family).
  // 87-56c: the `steam_engine_notices` cache lost its TS registration (the engine state is Rust's); its file name
  // stays on disk and its `storeTable.json` row stays for the Rust host, so no cache of that name is built here.
  const fixtureCaches = fixture.filter((entry) => entry.registeredAs === null)
  // Phase 74 (D-06) added the pre-launch update prompt's "don't ask again" acknowledgements.
  const UPDATE_PROMPT_ACK_CACHE = 'steam_update_prompt_ack'

  it('builds exactly the fixture cache stores, each declared with the fixture kind', () => {
    const built = builtCacheStores()
    expect([...built.keys()].sort()).toEqual(
      [
        ...new Set(fixtureCaches.map((entry) => entry.options.name)),
        UPDATE_PROMPT_ACK_CACHE
      ].sort()
    )
    expect(
      kindOf(defined(built.get(UPDATE_PROMPT_ACK_CACHE), 'update prompt ack'))
    ).toBe('user-state')
    for (const entry of fixtureCaches) {
      const name = defined(entry.options.name, 'fixture cache name')
      expect(kindOf(defined(built.get(name), name))).toBe(
        entry.declaration.kind
      )
    }
  })

  it('builds no steam_engine_notices cache: the engine state and its notices are Rust-owned (87-56c)', () => {
    const built = builtCacheStores()
    expect(built.has('steam_engine_notices')).toBe(false)
  })

  it('builds no umu, wikigameinfo or crossover_index cache: the wiki and CrossOver slices are Rust-owned (86-24)', () => {
    const built = builtCacheStores()
    for (const name of ['umu', 'wikigameinfo', 'crossover_index']) {
      expect(built.has(name)).toBe(false)
    }
  })

  it('builds no wine-downloader-info store: the wine manager and its store are Rust-owned (87-37)', () => {
    const stores = createStores({
      registry: createStoreRegistry(),
      root: createTestStoreRoot()
    })
    expect(Object.keys(stores)).not.toContain('wineManager')
  })

  it('builds no itad_prices or itad_steam_gids cache: the ITAD store search is Rust-owned (86-17)', () => {
    const built = builtCacheStores()
    expect(built.has('itad_prices')).toBe(false)
    expect(built.has('itad_steam_gids')).toBe(false)
  })

  it('builds no pci_ids_device or pci_ids_vendor cache: system information and its name caches are Rust-owned (88.1-18)', () => {
    const built = builtCacheStores()
    expect(built.has('pci_ids_device')).toBe(false)
    expect(built.has('pci_ids_vendor')).toBe(false)
  })

  it('two roots build independent stores: the gog caches do not share cells', () => {
    const rootA = createTestStoreRoot()
    const rootB = createTestStoreRoot()
    const a = createStores({ registry: createStoreRegistry(), root: rootA })
    const b = createStores({ registry: createStoreRegistry(), root: rootB })
    expect(a.gog.apiInfoCache).not.toBe(b.gog.apiInfoCache)
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
