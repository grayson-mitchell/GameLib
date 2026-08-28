import Store from 'backend/store_backend'
import CacheStore from '../cache'
import { mkdirSync, writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join as joinPath } from 'path'

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

// ─────────────────────────────────────────────────────────────────────────────
// Phase 35 Plan 05 (D-04) — store path parity gate.
//
// WHAT THIS CATCHES: the swap from `electron-store` to `conf` silently
// relocating, or outright collapsing, every persisted store.
//
// `conf` has NO `name` option — it reads `configName`
// (conf/dist/source/index.js:130). `electron-store` translated `name` ->
// `configName` and joined a RELATIVE `cwd` onto `app.getPath('userData')`;
// `conf` resolves a relative `cwd` against `process.cwd()` instead. The plan
// for this work said to pass `name` through unchanged, which would have sent
// all ~24 cache stores to a single `store_cache/config.json` inside the repo
// working directory, with every previously-persisted value reading back
// `undefined`. `backend/store_backend.ts` owns that translation now; these
// tests are the gate that would have caught it.
//
// Deliberately uses `requireActual` — the suite above mocks the store backend,
// and the whole point here is to exercise the REAL derivation.
// ─────────────────────────────────────────────────────────────────────────────
describe('store path parity (Phase 35 D-04)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { translateStoreOptions } = jest.requireActual('../store_backend')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getPath } = jest.requireActual('../sidecar/pathShim')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RawConf =
    jest.requireActual('conf').default ?? jest.requireActual('conf')

  const derivedPath = (name?: string, cwd = 'store_cache') => {
    const t = translateStoreOptions({ cwd, name, clearInvalidConfig: true })
    return joinPath(t.cwd, `${t.configName}.json`)
  }

  /**
   * The cache-store filenames observed on a real GameLib profile. Hardcoded
   * rather than derived, because the point of the gate is to pin the on-disk
   * reality that users already have — a derivation that drifted with the code
   * would move in lockstep with a regression and assert nothing.
   */
  const REAL_CACHE_STORE_NAMES = [
    'crossover_index',
    'gog_achievements',
    'gog_api_info',
    'gog_install_info',
    'gog_library',
    'gog_playtime_sync_queue',
    'humble_audit',
    'humble_library',
    'humble_local_redeemed',
    'humble_notified_expiration',
    'humble_revealed',
    'humble_sync',
    'legendary_gameinfo',
    'legendary_games_override',
    'legendary_install_info',
    'legendary_library',
    'nile_install_info',
    'nile_library',
    'pci_ids_device',
    'pci_ids_vendor',
    'steam_library',
    'steam_metadata',
    'steam_sync',
    'wikigameinfo'
  ]

  test('every cache store resolves to its OWN distinct file', () => {
    const paths = REAL_CACHE_STORE_NAMES.map((n) => derivedPath(n))
    expect(new Set(paths).size).toBe(REAL_CACHE_STORE_NAMES.length)
    expect(REAL_CACHE_STORE_NAMES.length).toBe(24)
  })

  test('each resolves to <userData>/store_cache/<name>.json, never a shared config.json', () => {
    const expectedDir = joinPath(getPath('userData'), 'store_cache')
    for (const name of REAL_CACHE_STORE_NAMES) {
      expect(derivedPath(name)).toBe(joinPath(expectedDir, `${name}.json`))
      expect(derivedPath(name).endsWith('/config.json')).toBe(false)
    }
  })

  test('resolves under userData, never under the repo working directory', () => {
    for (const name of REAL_CACHE_STORE_NAMES) {
      const p = derivedPath(name)
      expect(p.startsWith(getPath('userData'))).toBe(true)
      expect(p.startsWith(process.cwd())).toBe(false)
    }
  })

  // NON-VACUITY. The three tests above must be able to FAIL. This reproduces
  // the naive swap the plan prescribed — hand `conf` the very same
  // `{cwd, name}` object the production call sites pass — and shows it does
  // exactly the damage described: 24 distinct stores collapse onto ONE path,
  // and that path is not under userData at all.
  test('NON-VACUITY: the naive {cwd, name} passthrough collapses all 24 onto one file', () => {
    // `conf` mkdirs its `cwd` during construction, and with a RELATIVE cwd that
    // lands in `process.cwd()` — the repo working directory under jest. That is
    // precisely the defect being demonstrated, so run it from a disposable cwd
    // rather than leaving a stray `store_cache/` in the repo (measured: it does
    // create the directory, even though it writes no file).
    const scratch = mkdtempSync(joinPath(tmpdir(), 'gamelib-nonvacuity-'))
    const previousCwd = process.cwd()
    try {
      process.chdir(scratch)
      // macOS: tmpdir() yields /var/... while process.cwd() resolves the
      // /private/var symlink, so compare against the post-chdir real path.
      const scratchReal = process.cwd()
      const naive = REAL_CACHE_STORE_NAMES.map(
        (name) =>
          new RawConf({ cwd: 'store_cache', name, clearInvalidConfig: true })
            .path
      )
      expect(new Set(naive).size).toBe(1)
      expect(naive[0].endsWith('/config.json')).toBe(true)
      expect(naive[0].startsWith(getPath('userData'))).toBe(false)
      expect(naive[0].startsWith(scratchReal)).toBe(true)
    } finally {
      process.chdir(previousCwd)
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  // ROUND-TRIP against a store file laid out the way the OLD electron-store
  // backend wrote them: <userData>/<cwd>/<name>.json, nested objects, and a
  // dot-notation path. `isSecretStoreKey`'s `key.startsWith(`${secret}.`)`
  // matching depends on dot-notation still resolving (threat T-35-17), so that
  // assertion is required, not optional.
  test('reads a pre-existing store file written in the OLD backend layout', () => {
    const cwd = 'phase35_roundtrip'
    const dir = joinPath(getPath('userData'), cwd)
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      joinPath(dir, 'config.json'),
      JSON.stringify({
        theme: 'midnightMirage',
        games: { recent: [{ title: 'Phoenix Point' }] },
        'window-props': { width: 1427 }
      })
    )

    // Production option shape: relative cwd, no explicit name.
    const store = new (jest.requireActual('../store_backend').default)({ cwd })

    expect(store.path).toBe(joinPath(dir, 'config.json'))
    expect(store.get('theme')).toBe('midnightMirage')
    expect(store.get('games.recent')).toHaveLength(1)
    expect(store.get('games.recent.0.title')).toBe('Phoenix Point')
    expect(store.get('window-props.width')).toBe(1427)

    // A write must land on the SAME file, not a relocated one.
    store.set('theme', 'someOtherTheme')
    expect(store.path).toBe(joinPath(dir, 'config.json'))
    expect(
      JSON.parse(readFileSync(joinPath(dir, 'config.json'), 'utf-8')).theme
    ).toBe('someOtherTheme')
  })

  test('refuses a store name that tries to escape its cwd', () => {
    expect(() =>
      translateStoreOptions({ cwd: 'store_cache', name: '../../evil' })
    ).toThrow(/outside/)
  })
})
