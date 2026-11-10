import { TypeCheckedStoreBackend } from '../../typed_store'
import { createStoreRegistry } from '../storeRegistry'

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
