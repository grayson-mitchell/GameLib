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
import { join, resolve } from 'path'
import CacheStore from '../../cache'
import GameLibStore from '../../store_backend'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import vectors from 'common/__fixtures__/storeFrameVectors.json'
import {
  STORE_FRAME_KIND,
  STORE_MIRROR_EVENT_CHANNEL
} from 'common/types/sidecarTransport'
import { registerStoreWriteHandlers } from '../../sidecar/storeWriteHandlers'
import { createStoreRegistry } from '../storeRegistry'
import { MirrorCell, type StoreMirrorEvent } from '../mirrorCell'
import type { StoreFrame, StoreFrameSink } from '../storeFrames'
import { STORE_FRAME_MAX_BYTES, validateStoreFrame } from '../storeFrames'
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

  it('a dotted set through the tracer store leaves the view the golden file the shell’s store_frame test writes byte for byte', () => {
    // The same four ops as the Rust test `store_frame_golden_ops_write_the_bytes_ts_wrote…`, which
    // replays these frames and compares the file with this golden. Here the view (key order and
    // tab indentation included) is compared with the golden's data, so the dot paths the mirror
    // applies locally and the ones Rust applies to the file agree.
    const { frames, sink, answer } = recordingSink()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    store.set('480', {
      title: 'Half-Life',
      score: 96,
      tags: ['fps', 'classic']
    })
    store.set('480.title', 'x')
    store.set('__timestamp.480', 1700000000000)
    store.delete('480.title')
    frames.forEach((frame, i) => answer(root, frame, i + 1))

    const golden = JSON.parse(
      readFileSync(
        resolve(
          __dirname,
          '../../../../src-tauri/crates/gamelib-store/tests/fixtures/golden/expected/cache-ops-dotpath-intkey/store_cache/wikigameinfo.json'
        ),
        'utf8'
      )
    )
    delete golden.__internal__
    expect(JSON.stringify(store.store, undefined, '\t')).toBe(
      JSON.stringify(golden, undefined, '\t')
    )
    expect(Object.keys(store.store)).toEqual(['480', '__timestamp'])
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

// ---- Task 2: the shared frame vectors, refusals and the flush barrier -----------------------

interface VectorFrame {
  kind?: string
  seq?: number
  store?: string
  op?: string
  key?: string
  valueJson?: string
}
interface Vector {
  name: string
  reason?: string
  frame: VectorFrame & { generate?: { valueJsonBytes: number } }
}

/** A `generate` stanza is expanded into a `set` whose `valueJson` is that many ASCII bytes. */
function frameOf(vector: Vector): unknown {
  const generate = vector.frame.generate
  if (generate === undefined) return vector.frame
  return {
    kind: STORE_FRAME_KIND,
    seq: 1,
    store: 'store/config',
    op: 'set',
    key: 'k',
    valueJson: `"${'a'.repeat(generate.valueJsonBytes - 2)}"`
  }
}

describe('the shared storeFrameVectors contract', () => {
  const valid = vectors.valid as Vector[]
  const invalid = vectors.invalid as Vector[]

  it('is the same cap on both sides, and cannot pass vacuously', () => {
    expect(vectors.maxFrameBytes).toBe(STORE_FRAME_MAX_BYTES)
    expect(valid.length).toBeGreaterThanOrEqual(16)
    expect(invalid.length).toBeGreaterThanOrEqual(31)
  })

  it.each(valid.map((v) => [v.name, v] as const))(
    'accepts the valid vector: %s',
    (_name, vector) => {
      expect(validateStoreFrame(frameOf(vector))).toEqual({ ok: true })
    }
  )

  it.each(invalid.map((v) => [v.name, v] as const))(
    'rejects the invalid vector with its reason: %s',
    (_name, vector) => {
      expect(validateStoreFrame(frameOf(vector))).toEqual({
        ok: false,
        reason: vector.reason
      })
    }
  )

  it('exercises all nine reason categories', () => {
    expect(new Set(invalid.map((v) => v.reason)).size).toBe(9)
  })

  it('the TS frame builder produces only frames the valid vectors’ rules accept, with the vectors’ ops, keys and values', async () => {
    for (const vector of valid) {
      const { frame } = vector
      const frames: StoreFrame[] = []
      let seq = 0
      const cell = new MirrorCell({
        path: '/unused/by/a/startEmpty/cell.json',
        storeKey: frame.store as string,
        dotPaths: true,
        readOnly: false,
        startEmpty: true,
        sink: { send: (f) => void frames.push(f) },
        nextSeq: () => ++seq
      })
      const value =
        frame.valueJson === undefined ? undefined : JSON.parse(frame.valueJson)
      switch (frame.op) {
        case 'set':
          cell.set(frame.key as string, value)
          break
        case 'delete':
          cell.delete(frame.key as string)
          break
        case 'clear':
          cell.clear()
          break
        case 'replace':
          cell.replace(value)
          break
        case 'flush': {
          const flushed = cell.flush(1000)
          const sent = frames[0] as StoreFrame
          cell.applyEvent({
            store: sent.store,
            rev: 0,
            op: 'flushed',
            originSeq: sent.seq
          })
          await flushed
          break
        }
      }
      expect(frames).toHaveLength(1)
      const built = frames[0] as StoreFrame
      expect(validateStoreFrame(built)).toEqual({ ok: true })
      expect(built).toMatchObject({
        kind: STORE_FRAME_KIND,
        store: frame.store,
        op: frame.op
      })
      expect(built.key).toBe(frame.key)
      if (frame.valueJson !== undefined) {
        // Same value; the text may differ only in number spelling (1e21 -> 1e+21).
        expect(JSON.parse(built.valueJson as string)).toEqual(value)
      } else {
        expect(built.valueJson).toBeUndefined()
      }
    }
  })
})

describe('refusals and the flush barrier', () => {
  let userData: string
  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'gamelib-write-path-'))
  })
  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  const cellOver = (options: { fileText?: string; frames: StoreFrame[] }) => {
    const path = join(userData, 'store_cache', 'wikigameinfo.json')
    if (options.fileText !== undefined) {
      mkdirSync(join(userData, 'store_cache'), { recursive: true })
      writeFileSync(path, options.fileText)
    }
    let seq = 0
    const cell = new MirrorCell({
      path,
      storeKey: TRACER,
      dotPaths: true,
      readOnly: false,
      startEmpty: false,
      sink: { send: (f) => void options.frames.push(f) },
      nextSeq: () => ++seq
    })
    const event = (
      frame: StoreFrame,
      op: StoreMirrorEvent['op'],
      rev = 0,
      reason?: StoreMirrorEvent['reason']
    ): StoreMirrorEvent => ({
      store: TRACER,
      rev,
      op,
      originSeq: frame.seq,
      ...(reason ? { reason } : {})
    })
    return { cell, event }
  }

  it('a refused write reverts the view to base plus what is still pending, logging only the reason', () => {
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    const frames: StoreFrame[] = []
    const { cell, event } = cellOver({ fileText: '{"x":1}', frames })
    cell.set('x', 2)
    cell.set('secret', 'TOKEN-VALUE')
    cell.set('y', 3)
    expect(cell.get('x')).toBe(2)

    cell.applyEvent(event(frames[0] as StoreFrame, 'refused', 0, 'read-only'))
    // x is back to its base value; the later writes are still folded over it.
    expect(cell.get('x')).toBe(1)
    expect(cell.get('secret')).toBe('TOKEN-VALUE')
    expect(cell.get('y')).toBe(3)
    expect(cell.pendingCount).toBe(2)

    cell.applyEvent(event(frames[1] as StoreFrame, 'applied', 1))
    cell.applyEvent(event(frames[2] as StoreFrame, 'applied', 2))
    expect(cell.pendingCount).toBe(0)
    expect(cell.data).toEqual({ x: 1, secret: 'TOKEN-VALUE', y: 3 })

    const logged = stderr.mock.calls.map((c) => String(c[0])).join('')
    expect(logged).toContain('refused by the shell (read-only)')
    expect(logged).not.toContain('TOKEN-VALUE')
  })

  it('refusing the only pending write drops the view back to base', () => {
    const frames: StoreFrame[] = []
    jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const { cell, event } = cellOver({ fileText: '{"x":1}', frames })
    cell.set('x', 2)
    cell.delete('x')
    expect(cell.has('x')).toBe(false)
    cell.applyEvent(event(frames[0] as StoreFrame, 'refused', 0, 'io'))
    cell.applyEvent(event(frames[1] as StoreFrame, 'refused', 0, 'io'))
    expect(cell.get('x')).toBe(1)
    expect(cell.pendingCount).toBe(0)
  })

  it('an event for a seq that is not pending changes nothing', () => {
    const frames: StoreFrame[] = []
    const { cell } = cellOver({ frames })
    cell.set('a', 1)
    cell.applyEvent({ store: TRACER, rev: 9, op: 'applied', originSeq: 999 })
    expect(cell.pendingCount).toBe(1)
    expect(cell.baseRev).toBe(0)
  })

  it('flush resolves only on the flushed event for its own frame, after the earlier frames', async () => {
    const frames: StoreFrame[] = []
    const { cell, event } = cellOver({ frames })
    cell.set('a', 1)
    cell.set('b', 2)
    cell.set('c', 3)
    let resolved = false
    const flushed = cell.flush(5000).then(() => {
      resolved = true
    })
    expect(frames.map((f) => f.op)).toEqual(['set', 'set', 'set', 'flush'])
    for (const f of frames.slice(0, 3)) cell.applyEvent(event(f, 'applied', 1))
    await Promise.resolve()
    expect(resolved).toBe(false)
    cell.applyEvent(event(frames[3] as StoreFrame, 'flushed'))
    await flushed
    expect(resolved).toBe(true)
    expect(cell.pendingCount).toBe(0)
  })

  it('flush rejects when the shell refuses it, and when the deadline passes', async () => {
    const frames: StoreFrame[] = []
    const { cell, event } = cellOver({ frames })
    const refused = cell.flush(5000)
    cell.applyEvent(event(frames[0] as StoreFrame, 'refused', 0, 'not-owned'))
    await expect(refused).rejects.toThrow(/refused: not-owned/)
    await expect(cell.flush(15)).rejects.toThrow(/timed out/)
  })

  it('flush’s deadline timer is unref()ed (the sidecar exit contract)', () => {
    const timeouts = jest.spyOn(global, 'setTimeout')
    const frames: StoreFrame[] = []
    const { cell, event } = cellOver({ frames })
    const pending = cell.flush(60_000)
    const handle = timeouts.mock.results[0]?.value as NodeJS.Timeout
    expect(handle.hasRef()).toBe(false)
    cell.applyEvent(event(frames[0] as StoreFrame, 'flushed'))
    return pending
  })
})

describe('the storeMirrorEvent registration', () => {
  it('routes a shell event to the mirror cell of its store and drops a malformed payload with one line', () => {
    const userData = mkdtempSync(join(tmpdir(), 'gamelib-write-path-'))
    try {
      const frames: StoreFrame[] = []
      const root = createTestStoreRoot(userData, {
        storeMode: 'rust',
        frameSink: { send: (f) => void frames.push(f) }
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
      const listener = listeners.get(STORE_MIRROR_EVENT_CHANNEL)
      expect(listener).toBeDefined()

      const store = new GameLibStore({
        root,
        cwd: 'store_cache',
        name: 'wikigameinfo',
        declaration: { kind: 'cache' }
      })
      const cell = root.mirrors.cellFor({
        path: store.path,
        storeKey: TRACER,
        dotPaths: true
      })
      store.set('k', 1)
      expect(cell.pendingCount).toBe(1)

      const stderr = jest
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true)
      listener?.(undefined, { not: 'an event' })
      listener?.(undefined)
      expect(cell.pendingCount).toBe(1)
      expect(
        stderr.mock.calls.filter((c) => String(c[0]).includes('malformed'))
      ).toHaveLength(2)

      listener?.(undefined, {
        store: TRACER,
        rev: 1,
        op: 'applied',
        originSeq: (frames[0] as StoreFrame).seq
      })
      expect(cell.pendingCount).toBe(0)
      expect(cell.baseRev).toBe(1)
    } finally {
      jest.restoreAllMocks()
      rmSync(userData, { recursive: true, force: true })
    }
  })
})
