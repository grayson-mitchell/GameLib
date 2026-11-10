import { basename, dirname, join } from 'node:path'
import CacheStore from '../../cache'
import { getPath } from '../../sidecar/pathShim'
import { TypeCheckedStoreBackend } from '../../typed_store'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
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
  const cacheNames = new Set(
    fixture
      .filter((entry) => entry.registeredAs === null)
      .map((entry) => entry.options.name)
  )

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

  it('keeps every cache store on its original file under store_cache', () => {
    const stores = createStores({ registry: createStoreRegistry() })
    const files: string[] = []
    for (const family of Object.values(stores)) {
      for (const store of Object.values(family)) {
        if (store instanceof CacheStore) {
          const path = (store as unknown as { store: { path: string } }).store
            .path
          expect(dirname(path)).toBe(join(getPath('userData'), 'store_cache'))
          files.push(basename(path, '.json'))
        }
      }
    }
    expect(files.length).toBeGreaterThanOrEqual(25)
    for (const file of files) {
      expect(cacheNames).toContain(file)
    }
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
