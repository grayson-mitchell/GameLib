import Store from 'backend/store_backend'
import CacheStore from '../cache'

jest.mock('backend/store_backend')

describe('backend/cache.ts', () => {
  const testStore = new CacheStore<string>('test_store')
  const internalStore = new Store({
    cwd: 'store_cache',
    name: 'test_store'
  })

  const now = new Date()
  jest.useFakeTimers().setSystemTime(now)

  afterEach(testStore.clear)
  afterAll(jest.useRealTimers)

  test('Value is written', () => {
    testStore.set('foo', 'bar')
    expect(internalStore.get('foo')).toBe('bar')
  })

  test('Timestamp is written', () => {
    testStore.set('foo', 'bar')
    expect(internalStore.get('__timestamp.foo')).toBe(now.toString())
  })

  test('Valid value is returned', () => {
    testStore.set('foo', 'bar')
    expect(testStore.get('foo')).toBe('bar')
  })

  test('Invalid value is cleared', () => {
    const eight_hours_ago = new Date(now).setHours(now.getHours() - 8)
    jest.setSystemTime(eight_hours_ago)
    testStore.set('foo', 'bar')
    jest.setSystemTime(now)
    expect(testStore.get('foo')).toBe(undefined)
    expect(internalStore.has('foo')).toBe(false)
    expect(internalStore.has('__timestamp.foo')).toBe(false)
  })

  test('Custom lifetime works', () => {
    const testStore2 = new CacheStore<string>('test_store_2', 60)
    const three_hours_ago = new Date(now).setHours(now.getHours() - 3)
    jest.setSystemTime(three_hours_ago)
    testStore2.set('foo', 'bar')
    jest.setSystemTime(now)
    expect(testStore2.get('foo')).toBe(undefined)
  })

  test('Allows having no expiration time', () => {
    const testStore2 = new CacheStore<string>('test_store_2', null)
    const three_hours_ago = new Date(now).setHours(now.getHours() - 3)
    jest.setSystemTime(three_hours_ago)
    testStore2.set('foo', 'bar')
    jest.setSystemTime(now)
    expect(testStore2.get('foo')).toBe('bar')
  })

  // Regression (debug: humble-sync-spinner-never-ends): electron-store's
  // dot-notation nests `__timestamp.foo` under a TOP-LEVEL `__timestamp`
  // object on the file-backed path. entries() must exclude that group too —
  // leaking it as a ['__timestamp', {…}] pseudo-entry crashed
  // HumbleLibrary.getKeys() (spread of `entry.keys` on the timestamp object).
  test('entries() excludes timestamp bookkeeping on the file-backed store', () => {
    testStore.set('foo', 'bar')
    testStore.set('baz', 'qux')

    // The nested bookkeeping group really is on disk…
    expect(internalStore.has('__timestamp')).toBe(true)
    // …but never leaks through entries().
    expect(testStore.entries()).toEqual([
      ['foo', 'bar'],
      ['baz', 'qux']
    ])
  })

  test('entries() excludes timestamp bookkeeping on the in-memory store', () => {
    const memStore = new CacheStore<string>('test_store_mem')
    memStore.use_in_memory()
    memStore.set('foo', 'bar')

    expect(memStore.entries()).toEqual([['foo', 'bar']])

    memStore.commit()
  })
})
