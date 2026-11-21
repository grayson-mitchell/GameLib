/**
 * The cache family moves to the Rust owner (Phase 85 plan 12, FND-06, D-01 first family).
 *
 * `storeOwnership.json` sets `families.cache`, so under `GAMELIB_STORE=rust` (the default) every
 * `family: cache` row of `storeTable.json` is a window onto a mirror cell and each write is a frame
 * for the shell's single writer; under `GAMELIB_STORE=ts` the same stores are conf-backed exactly
 * as before. `CacheStore.commit()` (the whole-object write after in-memory mode) is one `replace`
 * frame. The Rust half of these cases is `cargo test --bin gamelib-shell store_boot` and
 * `store_frame`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import CacheStore from '../../cache'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import type { StoreFrame } from '../storeFrames'
import { isRustOwned } from '../storeOwnership'
import type { StoreMode } from '../storeOwnership'
import {
  createTestStoreRoot,
  testUserDataDir
} from '../../testUtils/testStoreRoot'

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
  it('is flipped by the family flag alone: the 85-10 tracer override is gone', () => {
    expect(ownershipFile.families.cache).toBe(true)
    expect(Object.keys(ownershipFile.stores)).toEqual([])
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

  it('owns exactly the cache rows (and the native one) under rust, none of them under ts', () => {
    for (const row of tableFile.rows) {
      if (row.name === null) continue
      const rust = isRustOwned(row.key, 'rust')
      const ts = isRustOwned(row.key, 'ts')
      expect(rust).toBe(row.family === 'cache' || row.family === 'native')
      expect(ts).toBe(row.family === 'native')
    }
  })

  describe.each(CACHE_ROWS.map((row) => [row.key, row] as const))(
    '%s',
    (_key, row) => {
      const write = (mode: StoreMode) => {
        const frames: StoreFrame[] = []
        const root = createTestStoreRoot(undefined, {
          storeMode: mode,
          recordFrames: frames
        })
        const stores = createStores({
          registry: createStoreRegistry(),
          root
        })
        storeOfRow(row, stores).set('cacheFamilyProbe', { n: 1 })
        return frames
      }

      it('is mirror-backed under rust: a write is a frame for this store', () => {
        const frames = write('rust')
        expect(frames.length).toBeGreaterThanOrEqual(1)
        for (const frame of frames) expect(frame.store).toBe(row.key)
        expect(frames[0]).toMatchObject({
          op: 'set',
          key: expect.stringMatching(/cacheFamilyProbe/) as unknown as string
        })
      })

      it('is conf-backed under GAMELIB_STORE=ts: a write sends no frame', () => {
        expect(write('ts')).toEqual([])
      })
    }
  )
})

describe('CacheStore.commit() on a Rust-owned cache', () => {
  const FIXED_NOW = new Date('2026-11-22T10:00:00Z')
  let rustDir: string
  let tsDir: string

  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW })
    rustDir = mkdtempSync(join(tmpdir(), 'gamelib-cache-family-rust-'))
    tsDir = mkdtempSync(join(tmpdir(), 'gamelib-cache-family-ts-'))
  })
  afterEach(() => {
    jest.useRealTimers()
    rmSync(rustDir, { recursive: true, force: true })
    rmSync(tsDir, { recursive: true, force: true })
  })

  /** The same edit sequence on `crossover_index`: two entries, then an in-memory batch that removes one. */
  function run(mode: StoreMode, userData: string, frames: StoreFrame[]) {
    const root = createTestStoreRoot(userData, {
      storeMode: mode,
      recordFrames: frames
    })
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
    const { before } = run('rust', rustDir, frames)
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

  it('leaves disk bytes equal to JSON.stringify(stampedView, undefined, tab) and equal to what conf writes under ts', () => {
    const frames: StoreFrame[] = []
    const rust = run('rust', rustDir, frames)
    const ts = run('ts', tsDir, [])
    const view = rust.cache.entries()
    expect(view.map(([key]) => key).sort()).toEqual(['added', 'kept'])
    const onDisk = JSON.parse(readFileSync(rust.path, 'utf8')) as Record<
      string,
      unknown
    >
    const { __internal__: envelope, ...data } = onDisk
    expect(envelope).toEqual({
      gamelib: {
        schemaVersion: rust.root.versioning.currentVersionOf(
          'store_cache/crossover_index'
        )
      }
    })
    const stamped = { ...data, __internal__: envelope }
    expect(readFileSync(rust.path, 'utf8')).toBe(
      JSON.stringify(stamped, undefined, '\t')
    )
    // The conf owner (GAMELIB_STORE=ts) writes the same bytes for the same edits.
    expect(readFileSync(rust.path, 'utf8')).toBe(readFileSync(ts.path, 'utf8'))
    expect(data).not.toHaveProperty('removed')
  })

  it('reads the committed entries back through the mirror', () => {
    const frames: StoreFrame[] = []
    const { cache } = run('rust', rustDir, frames)
    expect(cache.get('kept')).toEqual({ y: 2 })
    expect(cache.has('added')).toBe(true)
    expect(cache.has('removed')).toBe(false)
    expect(cache.readOnly).toBe(false)
  })
})
