/**
 * The user-state family moves to the Rust owner (Phase 85 plan 13, FND-06, D-01 second family).
 *
 * `storeOwnership.json` sets `families.user-state`, so under `GAMELIB_STORE=rust` (the default)
 * every `family: user-state` row of `storeTable.json` is a window onto a mirror cell and each write
 * is a frame for the shell's single writer; under `GAMELIB_STORE=ts` the same stores are conf-backed
 * exactly as before. `store/migrations` is the one user-state looking store that stays TS-owned (its
 * family is `excluded`, D-07) until plan 21 deletes it. The Rust half of these cases is
 * `cargo test --bin gamelib-shell store_boot` and `store_frame`.
 */
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import type { StoreFrame } from '../storeFrames'
import { isRustOwned } from '../storeOwnership'
import type { StoreMode } from '../storeOwnership'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

const USER_STATE_ROWS = tableFile.rows.filter(
  (row) => row.family === 'user-state' && row.name !== null
)

interface Probe {
  set(key: string, value: unknown): void
  get(key: string, fallback?: unknown): unknown
  readonly path?: string
}

/** The TS store a table row names, found by the file path it was built over. */
function storeOfRow(
  userData: string,
  rowKey: string,
  stores: ReturnType<typeof createStores>
): Probe {
  const expected = join(userData, `${rowKey}.json`)
  for (const family of Object.values(stores)) {
    for (const store of Object.values(family as Record<string, unknown>)) {
      const backing = (store as { store?: { path?: string } } | undefined)
        ?.store
      if (backing?.path === expected) return store as Probe
    }
  }
  throw new Error(`createStores built no store for ${rowKey}`)
}

function build(userData: string, mode: StoreMode, frames: StoreFrame[]) {
  const root = createTestStoreRoot(userData, {
    storeMode: mode,
    recordFrames: frames
  })
  const stores = createStores({ registry: createStoreRegistry(), root })
  return { root, stores }
}

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-user-state-family-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe(`the user-state family (${USER_STATE_ROWS.length} user-state rows)`, () => {
  it('is flipped by the family flag alone, next to the cache family', () => {
    expect(ownershipFile.families['user-state']).toBe(true)
    expect(ownershipFile.families.cache).toBe(true)
    // 85-14 flipped the account family after this one; settings is the last to move.
    expect(ownershipFile.families.account).toBe(true)
    expect(ownershipFile.families.settings).toBe(false)
    expect(Object.keys(ownershipFile.stores)).toEqual([])
  })

  it('names every store the plan moves (D-11)', () => {
    const keys = USER_STATE_ROWS.map((row) => row.key)
    expect(keys.length).toBeGreaterThanOrEqual(26)
    expect(keys).toEqual(
      expect.arrayContaining([
        'store/timestamp',
        'store/download-manager',
        'store/game-overrides',
        'store/mac-arch',
        'store/runs-for-me',
        'gog_store/installed',
        'gog_store/privateBranches',
        'gog_store/saveTimestamps',
        'sideload_apps/library',
        'store_cache/steam_library',
        'store_cache/gog_library',
        'store_cache/legendary_library',
        'store_cache/nile_library',
        'store_cache/steam_pending_adoption',
        'store_cache/steam_update_prompt_ack',
        'store_cache/steam_known_fix_reports',
        'store_cache/steam_engine_notices',
        'store_cache/gog_playtime_sync_queue',
        'store_cache/humble_library'
      ])
    )
    expect(keys).not.toContain('store/migrations')
  })

  it('owns the cache, user-state, account and native rows under rust and only the native ones under ts', () => {
    for (const row of tableFile.rows) {
      if (row.name === null) continue
      const rust = isRustOwned(row.key, 'rust')
      const ts = isRustOwned(row.key, 'ts')
      expect(rust).toBe(
        row.family === 'cache' ||
          row.family === 'user-state' ||
          row.family === 'account' ||
          row.family === 'native'
      )
      expect(ts).toBe(row.family === 'native')
    }
  })

  it('never owns store/migrations: its family is excluded (D-07), in either mode', () => {
    const row = tableFile.rows.find((r) => r.key === 'store/migrations')
    expect(row?.family).toBe('excluded')
    expect(isRustOwned('store/migrations', 'rust')).toBe(false)
    expect(isRustOwned('store/migrations', 'ts')).toBe(false)
  })

  describe.each(USER_STATE_ROWS.map((row) => [row.key, row] as const))(
    '%s',
    (_key, row) => {
      const write = (mode: StoreMode) => {
        const frames: StoreFrame[] = []
        const { stores } = build(userData, mode, frames)
        storeOfRow(userData, row.key, stores).set('userStateFamilyProbe', {
          n: 1
        })
        return frames
      }

      it('is mirror-backed under rust: a write is a frame for this store', () => {
        const frames = write('rust')
        expect(frames.length).toBeGreaterThanOrEqual(1)
        for (const frame of frames) expect(frame.store).toBe(row.key)
        expect(frames[0]).toMatchObject({
          op: 'set',
          key: expect.stringMatching(
            /userStateFamilyProbe/
          ) as unknown as string
        })
        // The disk sink stood in for the shell: the file sits at <userData>/<key>.json.
        expect(
          readFileSync(join(userData, `${row.key}.json`), 'utf8')
        ).toContain('userStateFamilyProbe')
      })

      it('is conf-backed under GAMELIB_STORE=ts: a write sends no frame and conf writes the file', () => {
        expect(write('ts')).toEqual([])
        expect(
          readFileSync(join(userData, `${row.key}.json`), 'utf8')
        ).toContain('userStateFamilyProbe')
      })
    }
  )
})

describe('store/migrations stays conf-backed in both modes', () => {
  it.each<StoreMode>(['rust', 'ts'])(
    'writes through conf, no frame, under %s',
    (mode) => {
      const frames: StoreFrame[] = []
      const { stores } = build(userData, mode, frames)
      const store = storeOfRow(userData, 'store/migrations', stores)
      store.set('userStateFamilyProbe', { n: 1 })
      expect(frames).toEqual([])
      expect(
        readFileSync(join(userData, 'store', 'migrations.json'), 'utf8')
      ).toContain('userStateFamilyProbe')
    }
  )
})

describe('stores with an absolute `<userData>/store` cwd resolve to the same file', () => {
  it.each(['game-overrides', 'mac-arch', 'runs-for-me'])(
    'store/%s resolves to <userData>/store/<name>.json under rust and under ts',
    (name) => {
      for (const mode of ['rust', 'ts'] as const) {
        const { stores } = build(userData, mode, [])
        const store = storeOfRow(userData, `store/${name}`, stores)
        expect(
          (store as unknown as { store: { path: string } }).store.path
        ).toBe(join(userData, 'store', `${name}.json`))
      }
    }
  )
})

describe('store/timestamp end to end: TS set -> frame -> bytes', () => {
  /** An integer-like app key written after a non-integer one: JS orders integer keys first. */
  const edits: [string, number][] = [
    ['zeta-app', 1_700_000_000],
    ['1245620', 1_700_000_001],
    ['alpha-app', 1_700_000_002],
    ['7', 1_700_000_003]
  ]

  function run(mode: StoreMode, dir: string, frames: StoreFrame[]) {
    const { root, stores } = build(dir, mode, frames)
    const store = storeOfRow(dir, 'store/timestamp', stores)
    for (const [key, value] of edits) store.set(key, value)
    return { root, path: join(dir, 'store', 'timestamp.json') }
  }

  it('sends one set frame per write, naming the store and the app key', () => {
    const frames: StoreFrame[] = []
    run('rust', userData, frames)
    expect(frames.map((frame) => [frame.store, frame.op, frame.key])).toEqual(
      edits.map(([key]) => ['store/timestamp', 'set', key])
    )
    for (const [index, [, value]] of edits.entries()) {
      expect(frames[index]?.valueJson).toBe(JSON.stringify(value))
    }
  })

  it('leaves bytes equal to JSON.stringify(stampedView, undefined, tab), integer keys first, equal to conf’s', () => {
    const tsDir = mkdtempSync(join(tmpdir(), 'gamelib-user-state-family-ts-'))
    try {
      const rust = run('rust', userData, [])
      const ts = run('ts', tsDir, [])
      const text = readFileSync(rust.path, 'utf8')
      const onDisk = JSON.parse(text) as Record<string, unknown>
      const { __internal__: envelope, ...data } = onDisk
      expect(envelope).toEqual({
        gamelib: {
          schemaVersion:
            rust.root.versioning.currentVersionOf('store/timestamp')
        }
      })
      expect(Object.keys(data)).toEqual([
        '7',
        '1245620',
        'zeta-app',
        'alpha-app'
      ])
      // The stamped view is the document the writer serialised: JS orders its integer keys first
      // and leaves the rest (the envelope included) where they were inserted.
      expect(text).toBe(JSON.stringify(onDisk, undefined, '\t'))
      expect(text.startsWith('{\n\t"7": 1700000003,\n\t"1245620": ')).toBe(true)
      expect(text).toBe(readFileSync(ts.path, 'utf8'))
    } finally {
      rmSync(tsDir, { recursive: true, force: true })
    }
  })
})

describe('queue state survives a restart', () => {
  const queue = [
    { params: { appName: 'Quail', runner: 'legendary' }, status: 'queued' },
    { params: { appName: '1245620', runner: 'steam' }, status: 'queued' }
  ]

  it('download-manager’s queue written through frames is loaded by a fresh StoreRoot over the same dir', () => {
    const frames: StoreFrame[] = []
    const first = build(userData, 'rust', frames)
    const store = storeOfRow(userData, 'store/download-manager', first.stores)
    store.set('queue', queue)
    store.set('finished', [])
    expect(frames.map((frame) => [frame.store, frame.op, frame.key])).toEqual([
      ['store/download-manager', 'set', 'queue'],
      ['store/download-manager', 'set', 'finished']
    ])

    // A restart: nothing of the first root is kept, only the directory.
    const second = build(userData, 'rust', [])
    const reopened = storeOfRow(
      userData,
      'store/download-manager',
      second.stores
    )
    expect(reopened.get('queue', [])).toEqual(queue)
    expect(reopened.get('finished', ['unset'])).toEqual([])
    const onDisk = JSON.parse(
      readFileSync(join(userData, 'store', 'download-manager.json'), 'utf8')
    ) as Record<string, unknown>
    expect(onDisk.queue).toEqual(queue)
  })
})
