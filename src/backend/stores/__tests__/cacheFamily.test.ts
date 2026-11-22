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
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import {
  STORE_TS_NEW_CHANNEL,
  STORE_TS_SET_CHANNEL
} from 'common/types/sidecarTransport'
import CacheStore from '../../cache'
import { registerStoreWriteHandlers } from '../../sidecar/storeWriteHandlers'
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

  it('owns the cache rows (with the native one and, since 85-13, 85-14 and 85-15, the user-state, account and settings ones) under rust, none of the cache rows under ts', () => {
    for (const row of tableFile.rows) {
      if (row.name === null) continue
      const rust = isRustOwned(row.key, 'rust')
      const ts = isRustOwned(row.key, 'ts')
      expect(rust).toBe(
        row.family === 'cache' ||
          row.family === 'user-state' ||
          row.family === 'account' ||
          row.family === 'settings' ||
          row.family === 'native'
      )
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
      storeMode: 'rust',
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
      storeMode: 'rust',
      boot: bootListing('store_cache/umu')
    })
    expect(
      new CacheStore<string>('umu', 60 * 6, {
        root: empty,
        kind: 'cache'
      }).entries()
    ).toEqual([])
    const normal = createTestStoreRoot(userData, { storeMode: 'rust' })
    expect(
      new CacheStore<string>('umu', 60 * 6, {
        root: normal,
        kind: 'cache'
      }).entries()
    ).toEqual([['stale', 'entry']])
  })
})

/**
 * `storeNew` and the write handler build a cache store from a recognised name. Every recognised
 * name is a user-state table row, so the user-state family decides it: Rust's since plan 13 flipped
 * it in the file. The cases set the family explicitly for their length (and restore it) so each
 * proves one side: the ad hoc construction reaching the root's one mirror cell for the file, and
 * the conf-backed fallback while the family is off.
 */
describe('runtime cache stores built by storeNew', () => {
  let userData: string
  const families = ownershipFile.families as Record<string, boolean>
  const userStateBefore = families['user-state'] ?? false
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'gamelib-cache-family-new-'))
  })
  afterEach(() => {
    families['user-state'] = userStateBefore
    rmSync(userData, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  function layer(frames: StoreFrame[]) {
    const root = createTestStoreRoot(userData, {
      storeMode: 'rust',
      recordFrames: frames
    })
    const listeners = new Map<string, (...args: unknown[]) => void>()
    registerStoreWriteHandlers({
      ipc: {
        on: (channel: string, listener: (...args: unknown[]) => void) => {
          listeners.set(channel, listener)
        },
        handle: () => undefined
      } as never,
      registry: createStoreRegistry(),
      root,
      pushFrontendMessage: () => undefined
    })
    return { root, listeners }
  }

  const libraryPath = () => join(userData, 'store_cache', 'steam_library.json')

  it('constructs a mirror-backed store sharing the root’s cell when the family is Rust’s', () => {
    families['user-state'] = true
    const frames: StoreFrame[] = []
    const { root, listeners } = layer(frames)
    listeners.get(STORE_TS_NEW_CHANNEL)?.(undefined, 'steam_library')
    const cell = root.mirrors.cellFor({
      path: libraryPath(),
      storeKey: 'store_cache/steam_library',
      dotPaths: true
    })
    // storeNew left a cell behind (the file was never touched by conf: no file, no frames).
    expect(existsSync(libraryPath())).toBe(false)
    expect(frames).toEqual([])
    // A write through the handler is a frame on that same cell.
    listeners.get(STORE_TS_SET_CHANNEL)?.(undefined, 'steam_library', 'k', 1)
    expect(frames.map((frame) => [frame.store, frame.op])).toEqual([
      ['store_cache/steam_library', 'set']
    ])
    // The disk sink answered the frame at once: the cell holds it on base, at rev 1.
    expect(cell.pendingCount).toBe(0)
    expect(cell.baseRev).toBe(1)
    expect(cell.get('k')).toBe(1)
    expect(
      root.mirrors.cellFor({
        path: libraryPath(),
        storeKey: 'store_cache/steam_library',
        dotPaths: true
      })
    ).toBe(cell)
  })

  it('stays conf-backed while the family is not Rust’s: a write sends no frame', () => {
    families['user-state'] = false
    const frames: StoreFrame[] = []
    const { listeners } = layer(frames)
    listeners.get(STORE_TS_NEW_CHANNEL)?.(undefined, 'steam_library')
    listeners.get(STORE_TS_SET_CHANNEL)?.(undefined, 'steam_library', 'k', 1)
    expect(frames).toEqual([])
    expect(JSON.parse(readFileSync(libraryPath(), 'utf8'))).toMatchObject({
      k: 1
    })
  })

  it('refuses an unrecognised runtime name: no store, no file, no frame', () => {
    families['user-state'] = true
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const frames: StoreFrame[] = []
    const { listeners } = layer(frames)
    listeners.get(STORE_TS_NEW_CHANNEL)?.(undefined, 'brand_new_cache')
    listeners.get(STORE_TS_SET_CHANNEL)?.(undefined, 'brand_new_cache', 'k', 1)
    expect(frames).toEqual([])
    expect(
      existsSync(join(userData, 'store_cache', 'brand_new_cache.json'))
    ).toBe(false)
    expect(
      stderr.mock.calls.some((c) =>
        String(c[0]).includes('storeNew rejected an unrecognized store name')
      )
    ).toBe(true)
  })
})
