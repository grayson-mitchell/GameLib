/**
 * The cache family moves to the Rust owner (Phase 85 plan 12, FND-06, D-01 first family).
 *
 * Every `family: cache` row of `storeTable.json` is a window onto a mirror cell and each write is a
 * frame for the shell's single writer (no flag and no conf owner since 85-21, D-03).
 * `CacheStore.commit()` (the whole-object write after in-memory mode) is one `replace`
 * frame. The Rust half of these cases is `cargo test --bin gamelib-shell store_boot` and
 * `store_frame`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import tableFile from 'common/types/ipc/storeTable.json'
import CacheStore from '../../cache'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import { isRustOwnedStoreKey, type StoreFrame } from '../storeFrames'
import {
  createTestStoreRoot,
  testUserDataDir
} from '../../testUtils/testStoreRoot'
import { storeSchemaVersionOf } from '../../testUtils/storeSchemaVersions'

const CACHE_ROWS = tableFile.rows.filter(
  (row) => row.family === 'cache' && row.name !== null
)

interface Probe {
  set(key: string, value: unknown): void
}

/** The TS store a cache row names, out of everything `createStores` built. */
function storeOfRow(
  row: (typeof CACHE_ROWS)[number],
  stores: ReturnType<typeof createStores>
): Probe {
  if (row.key === 'store/wine-downloader-info') {
    return stores.wineManager.wineDownloaderInfoStore as unknown as Probe
  }
  for (const family of Object.values(stores)) {
    for (const store of Object.values(family)) {
      if (!(store instanceof CacheStore)) continue
      const { store: backing } = store as unknown as { store: { path: string } }
      if (backing.path === join(testUserDataDir(), `${row.key}.json`)) {
        return store as unknown as Probe
      }
    }
  }
  throw new Error(`createStores built no store for ${row.key}`)
}

describe(`the cache family (${CACHE_ROWS.length} cache rows)`, () => {
  it('has at least 20 cache rows', () => {
    expect(CACHE_ROWS.length).toBeGreaterThanOrEqual(20)
  })

  it('covers the wine downloader info store and both pci_ids caches as cache rows', () => {
    const keys = CACHE_ROWS.map((row) => row.key)
    expect(keys).toEqual(
      expect.arrayContaining([
        'store/wine-downloader-info',
        'store_cache/pci_ids_device',
        'store_cache/pci_ids_vendor',
        'store_cache/crossover_index'
      ])
    )
  })

  it('owns every cache row', () => {
    for (const row of CACHE_ROWS)
      expect(isRustOwnedStoreKey(row.key)).toBe(true)
  })

  describe.each(CACHE_ROWS.map((row) => [row.key, row] as const))(
    '%s',
    (_key, row) => {
      const write = () => {
        const frames: StoreFrame[] = []
        const root = createTestStoreRoot(undefined, { recordFrames: frames })
        const stores = createStores({
          registry: createStoreRegistry(),
          root
        })
        storeOfRow(row, stores).set('cacheFamilyProbe', { n: 1 })
        return frames
      }

      it('is mirror-backed: a write is a frame for this store', () => {
        const frames = write()
        expect(frames.length).toBeGreaterThanOrEqual(1)
        for (const frame of frames) expect(frame.store).toBe(row.key)
        expect(frames[0]).toMatchObject({
          op: 'set',
          key: expect.stringMatching(/cacheFamilyProbe/) as unknown as string
        })
      })
    }
  )
})

describe('CacheStore.commit() on a Rust-owned cache', () => {
  const FIXED_NOW = new Date('2026-11-22T10:00:00Z')
  let rustDir: string

  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW })
    rustDir = mkdtempSync(join(tmpdir(), 'gamelib-cache-family-rust-'))
  })
  afterEach(() => {
    jest.useRealTimers()
    rmSync(rustDir, { recursive: true, force: true })
  })

  /** The same edit sequence on `crossover_index`: two entries, then an in-memory batch that removes one. */
  function run(userData: string, frames: StoreFrame[]) {
    const root = createTestStoreRoot(userData, { recordFrames: frames })
    const cache = new CacheStore<unknown>('crossover_index', 60 * 24, {
      root,
      kind: 'cache',
      invalidateCheck: () => false
    })
    cache.set('removed', { x: 1 })
    cache.set('kept', { y: 2 })
    const before = frames.length
    cache.use_in_memory()
    cache.delete('removed')
    cache.set('added', { z: 3 })
    cache.commit()
    const path = join(userData, 'store_cache', 'crossover_index.json')
    return { root, cache, before, path }
  }

  it('is exactly one replace frame whose value lacks the removed key', () => {
    const frames: StoreFrame[] = []
    const { before } = run(rustDir, frames)
    const sent = frames.slice(before)
    expect(sent).toHaveLength(1)
    const [frame] = sent as [StoreFrame]
    expect(frame.op).toBe('replace')
    expect(frame.store).toBe('store_cache/crossover_index')
    expect(frame.key).toBeUndefined()
    const value = JSON.parse(frame.valueJson as string) as Record<
      string,
      unknown
    >
    expect(value).not.toHaveProperty('removed')
    expect(value).toHaveProperty('kept')
    expect(value).toHaveProperty('added')
  })

  it('leaves disk bytes equal to JSON.stringify(stampedView, undefined, tab)', () => {
    const frames: StoreFrame[] = []
    const rust = run(rustDir, frames)
    const view = rust.cache.entries()
    expect(view.map(([key]) => key).sort()).toEqual(['added', 'kept'])
    const onDisk = JSON.parse(readFileSync(rust.path, 'utf8')) as Record<
      string,
      unknown
    >
    const { __internal__: envelope, ...data } = onDisk
    expect(envelope).toEqual({
      gamelib: {
        schemaVersion: storeSchemaVersionOf('store_cache/crossover_index')
      }
    })
    const stamped = { ...data, __internal__: envelope }
    expect(readFileSync(rust.path, 'utf8')).toBe(
      JSON.stringify(stamped, undefined, '\t')
    )
    expect(data).not.toHaveProperty('removed')
  })

  it('reads the committed entries back through the mirror', () => {
    const frames: StoreFrame[] = []
    const { cache } = run(rustDir, frames)
    expect(cache.get('kept')).toEqual({ y: 2 })
    expect(cache.has('added')).toBe(true)
    expect(cache.has('removed')).toBe(false)
    expect(cache.readOnly).toBe(false)
  })
})

describe('a cache the shell could not read (D-18, GAMELIB_STORE_BOOT startEmpty)', () => {
  let userData: string
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'gamelib-cache-family-boot-'))
    mkdirSync(join(userData, 'store_cache'), { recursive: true })
  })
  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
  })

  const bootListing = (...keys: string[]) => ({
    readOnly: new Map<string, 'newer' | 'failed'>(),
    startEmpty: new Set(keys)
  })

  it('starts empty and writable over a corrupt file, and the first write replaces it through the sink', () => {
    const file = join(userData, 'store_cache', 'umu.json')
    writeFileSync(file, '{ not json, a cache nobody can read')
    const frames: StoreFrame[] = []
    const root = createTestStoreRoot(userData, {
      boot: bootListing('store_cache/umu'),
      recordFrames: frames
    })
    const cache = new CacheStore<string>('umu', 60 * 6, { root, kind: 'cache' })
    expect(cache.entries()).toEqual([])
    expect(cache.readOnly).toBe(false)
    // The file is still the unreadable one: nothing is written until the first write.
    expect(frames).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe(
      '{ not json, a cache nobody can read'
    )
    cache.set('game', 'umu-1')
    expect(cache.get('game')).toBe('umu-1')
    expect(frames.map((frame) => frame.op)).toEqual(['set', 'set'])
    const written = JSON.parse(readFileSync(file, 'utf8')) as Record<
      string,
      unknown
    >
    expect(written.game).toBe('umu-1')
  })

  it('starts empty over a readable file when the shell says so: the shell’s verdict, not the file, decides', () => {
    writeFileSync(
      join(userData, 'store_cache', 'umu.json'),
      JSON.stringify({ stale: 'entry' })
    )
    const empty = createTestStoreRoot(userData, {
      boot: bootListing('store_cache/umu')
    })
    expect(
      new CacheStore<string>('umu', 60 * 6, {
        root: empty,
        kind: 'cache'
      }).entries()
    ).toEqual([])
    const normal = createTestStoreRoot(userData)
    expect(
      new CacheStore<string>('umu', 60 * 6, {
        root: normal,
        kind: 'cache'
      }).entries()
    ).toEqual([['stale', 'entry']])
  })
})
