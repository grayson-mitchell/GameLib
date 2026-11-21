/**
 * The sidecar's write path to the Rust store owner (Phase 85 plan 10, FND-06), TS half.
 *
 * `store_cache/wikigameinfo` is the tracer store: `storeOwnership.json` moves it to Rust, so a
 * `GameLibStore` over it is a window onto the root's `MirrorCell`. A recording fake stands in for
 * the shell: it captures the frames the store sends (order and shape), answers each with the
 * `storeMirrorEvent` the shell would, and the cell's pending list and reads are checked
 * throughout. The Rust half is `cargo test --bin gamelib-shell store_frame`, which feeds the same
 * ops into the shell's worker and compares the file with TS's own bytes.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import CacheStore from '../../cache'
import GameLibStore from '../../store_backend'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import { STORE_FRAME_KIND } from 'common/types/sidecarTransport'
import { MirrorCell, type StoreMirrorEvent } from '../mirrorCell'
import type { StoreFrame, StoreFrameSink } from '../storeFrames'
import { validateStoreFrame } from '../storeFrames'
import type { StoreRoot } from '../storeRoot'

const TRACER = 'store_cache/wikigameinfo'

/** Records every frame; `answer` is the shell: it applies nothing, it only acknowledges. */
function recordingSink() {
  const frames: StoreFrame[] = []
  const sink: StoreFrameSink = { send: (frame) => void frames.push(frame) }
  const answer = (
    root: StoreRoot,
    frame: StoreFrame,
    rev: number,
    op: StoreMirrorEvent['op'] = 'applied',
    reason?: StoreMirrorEvent['reason']
  ) =>
    root.mirrors.applyEvent({
      store: frame.store,
      rev,
      op,
      originSeq: frame.seq,
      ...(reason ? { reason } : {})
    })
  return { frames, sink, answer }
}

describe('the sidecar write path to a Rust-owned store', () => {
  let userData: string
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'gamelib-write-path-'))
  })
  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  const rustRoot = (sink: StoreFrameSink, boot?: StoreRoot['boot']) =>
    createTestStoreRoot(userData, { storeMode: 'rust', frameSink: sink, boot })

  const tracerStore = (root: StoreRoot) =>
    new GameLibStore({
      root,
      cwd: 'store_cache',
      name: 'wikigameinfo',
      clearInvalidConfig: true,
      declaration: { kind: 'cache' }
    })

  const plant = (name: string, text: string) => {
    mkdirSync(join(userData, 'store_cache'), { recursive: true })
    writeFileSync(join(userData, 'store_cache', `${name}.json`), text)
  }

  it('sends the golden cache-ops-dotpath-intkey ops as ordered frames and clears pending on each applied event', () => {
    const { frames, sink, answer } = recordingSink()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    const cell = root.mirrors.cellFor({
      path: store.path,
      storeKey: TRACER,
      dotPaths: true
    })

    store.set('480', {
      title: 'Half-Life',
      score: 96,
      tags: ['fps', 'classic']
    })
    expect(store.get('480')).toEqual({
      title: 'Half-Life',
      score: 96,
      tags: ['fps', 'classic']
    })
    store.set('480.title', 'x')
    expect(store.get('480.title')).toBe('x')
    store.set('__timestamp.480', 1700000000000)
    store.delete('480.title')
    // Read-your-writes before any answer: the view is base plus everything pending.
    expect(store.has('480.title')).toBe(false)
    expect(store.get('480')).toEqual({ score: 96, tags: ['fps', 'classic'] })
    expect(store.get('__timestamp.480')).toBe(1700000000000)
    expect(cell.pendingCount).toBe(4)

    expect(frames).toEqual([
      {
        kind: STORE_FRAME_KIND,
        seq: 1,
        store: TRACER,
        op: 'set',
        key: '480',
        valueJson: '{"title":"Half-Life","score":96,"tags":["fps","classic"]}'
      },
      {
        kind: STORE_FRAME_KIND,
        seq: 2,
        store: TRACER,
        op: 'set',
        key: '480.title',
        valueJson: '"x"'
      },
      {
        kind: STORE_FRAME_KIND,
        seq: 3,
        store: TRACER,
        op: 'set',
        key: '__timestamp.480',
        valueJson: '1700000000000'
      },
      {
        kind: STORE_FRAME_KIND,
        seq: 4,
        store: TRACER,
        op: 'delete',
        key: '480.title'
      }
    ])
    for (const frame of frames) {
      expect(validateStoreFrame(frame)).toEqual({ ok: true })
    }

    frames.forEach((frame, i) => {
      expect(answer(root, frame, i + 1)).toBe(true)
      // Reads agree before, during and after every answer.
      expect(store.get('480')).toEqual({ score: 96, tags: ['fps', 'classic'] })
      expect(store.get('__timestamp.480')).toBe(1700000000000)
    })
    expect(cell.pendingCount).toBe(0)
    expect(cell.baseRev).toBe(4)
    expect(store.store).toEqual({
      '480': { score: 96, tags: ['fps', 'classic'] },
      __timestamp: { '480': 1700000000000 }
    })
  })

  it('writes nothing to disk itself: the file is the shell’s to write', () => {
    const { sink } = recordingSink()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    store.set('480', 1)
    expect(() =>
      readFileSync(join(userData, 'store_cache', 'wikigameinfo.json'))
    ).toThrow()
  })

  it('loads the file once, without the __internal__ envelope', () => {
    plant(
      'wikigameinfo',
      '{\n\t"480": {\n\t\t"title": "t"\n\t},\n\t"__internal__": {\n\t\t"gamelib": {\n\t\t\t"version": 1\n\t\t}\n\t}\n}'
    )
    const { sink } = recordingSink()
    const store = tracerStore(rustRoot(sink))
    expect(store.store).toEqual({ '480': { title: 't' } })
    expect(store.has('__internal__')).toBe(false)
    expect(store.get('__internal__.gamelib')).toBeUndefined()
    expect(store.size).toBe(1)
    // Later changes to the file are not re-read: the cell is the sidecar's one copy.
    plant('wikigameinfo', '{"other": 1}')
    expect(store.has('480')).toBe(true)
    expect(store.has('other')).toBe(false)
  })

  it('starts empty when the shell says the cache could not be read, and refuses writes when it is read-only', () => {
    plant('wikigameinfo', '{"480": 1}')
    const { frames, sink } = recordingSink()
    const empty = tracerStore(
      rustRoot(sink, {
        readOnly: new Map(),
        startEmpty: new Set([TRACER])
      })
    )
    expect(empty.store).toEqual({})

    const ro = rustRoot(sink, {
      readOnly: new Map([[TRACER, 'newer' as const]]),
      startEmpty: new Set()
    })
    const roStore = tracerStore(ro)
    expect(roStore.readOnly).toBe(true)
    expect(roStore.get('480')).toBe(1)
    roStore.set('480', 2)
    roStore.delete('480')
    roStore.clear()
    roStore.store = { a: 1 }
    expect(roStore.get('480')).toBe(1)
    expect(frames).toEqual([])
  })

  it('serves two TS names over one file from one cell (S1 rule 5)', () => {
    const { sink } = recordingSink()
    const root = rustRoot(sink)
    const first = tracerStore(root)
    const second = tracerStore(root)
    first.set('k', 'v')
    expect(second.get('k')).toBe('v')
    second.delete('k')
    expect(first.has('k')).toBe(false)
  })

  it('keeps every other store on conf, and every store on conf in ts mode', () => {
    const { frames, sink } = recordingSink()
    const root = rustRoot(sink)
    const config = new GameLibStore({
      root,
      cwd: 'store',
      name: 'config',
      declaration: { kind: 'user-state' }
    })
    config.set('k', 1)
    expect(JSON.parse(readFileSync(config.path, 'utf8')).k).toBe(1)

    const tsRoot = createTestStoreRoot(userData)
    const traced = new GameLibStore({
      root: tsRoot,
      cwd: 'store_cache',
      name: 'wikigameinfo',
      declaration: { kind: 'cache' }
    })
    traced.set('k', 1)
    expect(JSON.parse(readFileSync(traced.path, 'utf8')).k).toBe(1)
    expect(frames).toEqual([])
  })

  it('refuses a Rust-owned store whose path is not its table path under the user-data directory', () => {
    const { sink } = recordingSink()
    const root = rustRoot(sink)
    const elsewhere = mkdtempSync(join(tmpdir(), 'gamelib-elsewhere-'))
    try {
      expect(
        () =>
          new GameLibStore({
            root,
            cwd: join(elsewhere, 'store_cache'),
            name: 'wikigameinfo'
          })
      ).toThrow(/table path/)
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('refuses the reserved namespace and the writes conf refuses, sending nothing', () => {
    const { frames, sink } = recordingSink()
    const store = tracerStore(rustRoot(sink))
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    store.set('__internal__.gamelib', 9)
    store.delete('__internal__')
    store.set('a.__proto__.x', 1)
    expect(frames).toEqual([])
    expect(() => store.set('k', undefined)).toThrow(TypeError)
  })

  it('is what CacheStore writes through: a set sends the value and its timestamp, commit sends one replace', () => {
    const { frames, sink, answer } = recordingSink()
    const root = rustRoot(sink)
    const cache = new CacheStore<{ title: string }>('wikigameinfo', null, {
      root,
      kind: 'cache'
    })
    cache.set('480', { title: 'Half-Life' })
    expect(frames.map((f) => [f.op, f.key])).toEqual([
      ['set', '480'],
      ['set', '__timestamp.480']
    ])
    expect(cache.get('480')).toEqual({ title: 'Half-Life' })
    frames.forEach((frame, i) => answer(root, frame, i + 1))

    frames.length = 0
    cache.use_in_memory()
    cache.set('481', { title: 'Portal' })
    expect(frames).toEqual([])
    cache.commit()
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({ op: 'replace', store: TRACER })
    const replaced = JSON.parse(frames[0]?.valueJson ?? '{}')
    // The in-memory map is flat: the new timestamp is a literal dotted key, as it always was on
    // this path (integer-like keys first, then insertion order).
    expect(Object.keys(replaced)).toEqual([
      '480',
      '481',
      '__timestamp',
      '__timestamp.481'
    ])
    expect(replaced.__internal__).toBeUndefined()
    expect(cache.get('481')).toEqual({ title: 'Portal' })
  })

  it('a MirrorCell never shares nested state with what a caller passed or got back', () => {
    const { sink } = recordingSink()
    const cell = new MirrorCell({
      path: join(userData, 'store_cache', 'wikigameinfo.json'),
      storeKey: TRACER,
      dotPaths: true,
      readOnly: false,
      startEmpty: true,
      sink,
      nextSeq: (() => {
        let n = 0
        return () => ++n
      })()
    })
    const value = { list: [1, 2] }
    cell.set('k', value)
    value.list.push(3)
    const read = cell.get('k') as { list: number[] }
    read.list.push(4)
    expect(cell.get('k')).toEqual({ list: [1, 2] })
  })
})
