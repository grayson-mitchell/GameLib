/**
 * The jest stand-in for the Rust store owner (Phase 85 plan 11, Pitfall 12): a real-store suite
 * writes through a store and reads the file back, and the bytes are the shell's. The golden is the
 * same one `store_dispatch.rs`'s `store_frame_golden_ops_*` test compares the shell's file with.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import GameLibStore from '../../store_backend'
import type { StoreFrame } from '../../stores/storeFrames'
import { createDiskStoreSink } from '../diskStoreSink'
import { createTestStoreRoot } from '../testStoreRoot'

const GOLDEN = resolve(
  __dirname,
  '../../../../src-tauri/crates/gamelib-store/tests/fixtures/golden/expected/cache-ops-dotpath-intkey/store_cache/wikigameinfo.json'
)

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-disk-sink-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

const tracer = (root: ReturnType<typeof createTestStoreRoot>) =>
  new GameLibStore({
    root,
    cwd: 'store_cache',
    name: 'wikigameinfo',
    declaration: { kind: 'cache' }
  })

describe('createTestStoreRoot with its default disk sink', () => {
  it('writes the golden bytes for the golden ops and leaves nothing pending', () => {
    const root = createTestStoreRoot(userData)
    const store = tracer(root)
    store.set('480', {
      title: 'Half-Life',
      score: 96,
      tags: ['fps', 'classic']
    })
    store.set('480.title', 'x')
    store.set('__timestamp.480', 1700000000000)
    store.delete('480.title')
    expect(readFileSync(store.path, 'utf8')).toBe(readFileSync(GOLDEN, 'utf8'))
    const cell = root.mirrors.cellFor({
      path: store.path,
      storeKey: 'store_cache/wikigameinfo',
      dotPaths: true
    })
    expect(cell.pendingCount).toBe(0)
    expect(cell.baseRev).toBe(4)
  })

  it('serves a second store over the file and a second root from the bytes it wrote', () => {
    const root = createTestStoreRoot(userData)
    tracer(root).set('k', { a: 1 })
    expect(tracer(root).get('k')).toEqual({ a: 1 })
    const later = tracer(createTestStoreRoot(userData))
    expect(later.get('k')).toEqual({ a: 1 })
    later.clear()
    expect(JSON.parse(readFileSync(later.path, 'utf8'))).toEqual({
      __internal__: { gamelib: { schemaVersion: 1 } }
    })
    later.store = { z: 1 }
    expect(JSON.parse(readFileSync(later.path, 'utf8')).z).toBe(1)
  })

  it('records every frame in order when asked, and still applies them', () => {
    const frames: StoreFrame[] = []
    const root = createTestStoreRoot(userData, {
      recordFrames: frames
    })
    const store = tracer(root)
    store.set('a', 1)
    store.delete('a')
    expect(frames.map((f) => [f.seq, f.op, f.key])).toEqual([
      [1, 'set', 'a'],
      [2, 'delete', 'a']
    ])
    expect(store.has('a')).toBe(false)
  })

  it('answers a flush frame, so the quit barrier resolves under jest', async () => {
    const root = createTestStoreRoot(userData)
    tracer(root).set('a', 1)
    await expect(root.mirrors.flushStores(1000)).resolves.toBeUndefined()
    const store = tracer(root)
    // Nothing is pending, so there is nothing to wait for; with one forced pending write the
    // flush frame is answered by the sink synchronously.
    const cell = root.mirrors.cellFor({
      path: store.path,
      storeKey: 'store_cache/wikigameinfo',
      dotPaths: true
    })
    await expect(cell.flush(1000)).resolves.toBeUndefined()
  })

  it('an explicit frame sink replaces the disk sink, and the suite owns the answers', () => {
    const frames: StoreFrame[] = []
    const root = createTestStoreRoot(userData, {
      frameSink: { send: (f) => void frames.push(f) }
    })
    const store = tracer(root)
    store.set('a', 1)
    expect(frames).toHaveLength(1)
    expect(() => readFileSync(store.path)).toThrow()
  })

  it('a native store is the shell’s in ts mode too, and its file is written the same way', () => {
    const root = createTestStoreRoot(userData)
    const store = new GameLibStore({
      root,
      cwd: 'store',
      name: 'uploadedLogs',
      declaration: { kind: 'user-state' }
    })
    store.set('log name.txt', 'https://example.invalid/log')
    // `store/uploadedLogs` keys are literal, never dot paths.
    expect(JSON.parse(readFileSync(store.path, 'utf8'))['log name.txt']).toBe(
      'https://example.invalid/log'
    )
  })
})

describe('createDiskStoreSink', () => {
  const frame = (over: Partial<StoreFrame> & Pick<StoreFrame, 'op'>) =>
    ({
      kind: 'store',
      seq: 1,
      store: 'store/timestamp',
      ...over
    }) as StoreFrame

  it('throws, rather than drop a frame, when it was never attached to a root', () => {
    const { sink } = createDiskStoreSink({ userData })
    expect(() => sink.send(frame({ op: 'clear' }))).toThrow(
      /not attached|before the sink was attached/
    )
  })

  it('writes a settings document two-space with no version envelope, a conf store tab-indented with one', () => {
    const events: unknown[] = []
    const disk = createDiskStoreSink({ userData })
    disk.attach({
      mirrors: { applyEvent: (e) => (events.push(e), true) }
    })
    // `settings/global` is the app folder's config.json (85-15, the shell's path_for), written
    // whole by a replace; a GamesConfig document sits at its own key's path.
    disk.sink.send(
      frame({ store: 'settings/global', op: 'replace', valueJson: '{"a":1}' })
    )
    expect(readFileSync(join(userData, 'config.json'), 'utf8')).toBe(
      '{\n  "a": 1\n}'
    )
    disk.sink.send(
      frame({
        seq: 2,
        store: 'store/timestamp',
        op: 'set',
        key: 'a',
        valueJson: '1'
      })
    )
    expect(readFileSync(join(userData, 'store/timestamp.json'), 'utf8')).toBe(
      '{\n\t"a": 1,\n\t"__internal__": {\n\t\t"gamelib": {\n\t\t\t"schemaVersion": 1\n\t\t}\n\t}\n}'
    )
    expect(events).toEqual([
      { store: 'settings/global', rev: 1, op: 'applied', originSeq: 1 },
      { store: 'store/timestamp', rev: 1, op: 'applied', originSeq: 2 }
    ])
  })

  it('answers a write it cannot persist with a refusal and forgets the copy it held', () => {
    const events: unknown[] = []
    const disk = createDiskStoreSink({
      // A path under a file cannot be created.
      userData: join(userData, 'blocker', 'x')
    })
    disk.attach({
      mirrors: { applyEvent: (e) => (events.push(e), true) }
    })
    // `blocker` is a plain file, so mkdir beneath it fails.
    writeFileSync(join(userData, 'blocker'), 'x')
    disk.sink.send(frame({ op: 'set', key: 'a', valueJson: '1' }))
    expect(events).toEqual([
      {
        store: 'store/timestamp',
        rev: 0,
        op: 'refused',
        originSeq: 1,
        reason: 'io'
      }
    ])
  })
})
