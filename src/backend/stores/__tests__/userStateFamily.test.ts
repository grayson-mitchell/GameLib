/**
 * The user-state family moves to the Rust owner (Phase 85 plan 13, FND-06, D-01 second family).
 *
 * Every `family: user-state` row of `storeTable.json` is a window onto a mirror cell and each write
 * is a frame for the shell's single writer (no flag and no conf owner since 85-21, D-03).
 * `store/migrations` lost its TS store in plan 21 (D-06); its row stays `excluded` (D-07), so
 * neither side opens it. The Rust half of these cases is `cargo test --bin gamelib-shell
 * store_boot` and `store_frame`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import tableFile from 'common/types/ipc/storeTable.json'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import type { StoreFrame } from '../storeFrames'
import { isRustOwnedStoreKey } from '../storeFrames'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { storeSchemaVersionOf } from '../../testUtils/storeSchemaVersions'

/**
 * Rows whose TS store a Phase 86 or 87 plan deleted: the row stays (D-29 row 5) so the shell still opens
 * the file as user-state, but `createStores` builds nothing over it, so there is no mirror to probe.
 * 87-56c added `store_cache/steam_engine_notices` (the engine state and its notices are Rust's).
 */
const NO_TS_STORE: readonly string[] = [
  'store/game-overrides',
  'store_cache/steam_engine_notices'
]

const USER_STATE_ROWS = tableFile.rows.filter(
  (row) =>
    row.family === 'user-state' &&
    row.name !== null &&
    !NO_TS_STORE.includes(row.key)
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

function build(userData: string, frames: StoreFrame[]) {
  const root = createTestStoreRoot(userData, { recordFrames: frames })
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
  it('names every store the plan moves (D-11)', () => {
    // Every user-state row, the ones whose TS store is gone included: the plan still moves them.
    const keys = tableFile.rows
      .filter((row) => row.family === 'user-state' && row.name !== null)
      .map((row) => row.key)
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

  it('owns every row but the excluded store/migrations (D-07)', () => {
    for (const row of tableFile.rows) {
      if (row.name === null) continue
      expect([row.key, isRustOwnedStoreKey(row.key)]).toEqual([
        row.key,
        row.family !== 'excluded'
      ])
    }
    const row = tableFile.rows.find((r) => r.key === 'store/migrations')
    expect(row?.family).toBe('excluded')
  })

  describe.each(USER_STATE_ROWS.map((row) => [row.key, row] as const))(
    '%s',
    (_key, row) => {
      const write = () => {
        const frames: StoreFrame[] = []
        const { stores } = build(userData, frames)
        storeOfRow(userData, row.key, stores).set('userStateFamilyProbe', {
          n: 1
        })
        return frames
      }

      it('is mirror-backed: a write is a frame for this store', () => {
        const frames = write()
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
    }
  )
})

describe('store/migrations has no TS store (85-21, D-06) and stays on disk (D-07)', () => {
  it('createStores builds no store over it and leaves the file alone', () => {
    const file = join(userData, 'store', 'migrations.json')
    mkdirSync(join(userData, 'store'), { recursive: true })
    writeFileSync(file, '{"appliedMigrations":["x"]}')
    const frames: StoreFrame[] = []
    const { stores } = build(userData, frames)
    expect(() => storeOfRow(userData, 'store/migrations', stores)).toThrow(
      /built no store/
    )
    expect(frames).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe('{"appliedMigrations":["x"]}')
  })
})

describe('store/game-overrides has no TS store (86-11, D-29 row 5) and keeps its user-state row', () => {
  it('createStores builds no store over it, and the table still lists it as user-state', () => {
    const { stores } = build(userData, [])
    expect(() => storeOfRow(userData, 'store/game-overrides', stores)).toThrow(
      /built no store/
    )
    expect(
      tableFile.rows.find((r) => r.key === 'store/game-overrides')
    ).toMatchObject({ family: 'user-state', kind: 'user-state' })
  })
})

describe('stores with an absolute `<userData>/store` cwd resolve to the same file', () => {
  it.each(['mac-arch', 'runs-for-me'])(
    'store/%s resolves to <userData>/store/<name>.json',
    (name) => {
      const { stores } = build(userData, [])
      const store = storeOfRow(userData, `store/${name}`, stores)
      expect((store as unknown as { store: { path: string } }).store.path).toBe(
        join(userData, 'store', `${name}.json`)
      )
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

  function run(dir: string, frames: StoreFrame[]) {
    const { root, stores } = build(dir, frames)
    const store = storeOfRow(dir, 'store/timestamp', stores)
    for (const [key, value] of edits) store.set(key, value)
    return { root, path: join(dir, 'store', 'timestamp.json') }
  }

  it('sends one set frame per write, naming the store and the app key', () => {
    const frames: StoreFrame[] = []
    run(userData, frames)
    expect(frames.map((frame) => [frame.store, frame.op, frame.key])).toEqual(
      edits.map(([key]) => ['store/timestamp', 'set', key])
    )
    for (const [index, [, value]] of edits.entries()) {
      expect(frames[index]?.valueJson).toBe(JSON.stringify(value))
    }
  })

  it('leaves bytes equal to JSON.stringify(stampedView, undefined, tab), integer keys first', () => {
    const rust = run(userData, [])
    const text = readFileSync(rust.path, 'utf8')
    const onDisk = JSON.parse(text) as Record<string, unknown>
    const { __internal__: envelope, ...data } = onDisk
    expect(envelope).toEqual({
      gamelib: {
        schemaVersion: storeSchemaVersionOf('store/timestamp')
      }
    })
    expect(Object.keys(data)).toEqual(['7', '1245620', 'zeta-app', 'alpha-app'])
    // The stamped view is the document the writer serialised: JS orders its integer keys first
    // and leaves the rest (the envelope included) where they were inserted.
    expect(text).toBe(JSON.stringify(onDisk, undefined, '\t'))
    expect(text.startsWith('{\n\t"7": 1700000003,\n\t"1245620": ')).toBe(true)
  })
})

describe('queue state survives a restart', () => {
  const queue = [
    { params: { appName: 'Quail', runner: 'legendary' }, status: 'queued' },
    { params: { appName: '1245620', runner: 'steam' }, status: 'queued' }
  ]

  it('download-manager’s queue written through frames is loaded by a fresh StoreRoot over the same dir', () => {
    const frames: StoreFrame[] = []
    const first = build(userData, frames)
    const store = storeOfRow(userData, 'store/download-manager', first.stores)
    store.set('queue', queue)
    store.set('finished', [])
    expect(frames.map((frame) => [frame.store, frame.op, frame.key])).toEqual([
      ['store/download-manager', 'set', 'queue'],
      ['store/download-manager', 'set', 'finished']
    ])

    // A restart: nothing of the first root is kept, only the directory.
    const second = build(userData, [])
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
