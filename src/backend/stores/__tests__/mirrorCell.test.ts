/**
 * The TS mirror against the full S1 protocol (Phase 85 plan 11, FND-06; rules in 85-SPIKES.md, model
 * in `.planning/spikes/092-store-mirror-protocol/sim.mjs`).
 *
 * Three layers. Hand-built cases pin each rule: read-your-writes, one cell per file path, a `changed`
 * event from another origin, a refused write, a cell created after an event, the stale-rev drop and
 * the defensive decode of a `changed` payload. Then the model's generator is ported into a seeded
 * property test of 2,000 random interleavings against a fake Rust peer that persists before it
 * emits, numbers revs under one lock and answers a failed persist with a refusal; the production
 * `MirrorCell` (reached through two `GameLibStore` names, as consumers reach it) must keep
 * read-your-writes after every step and converge to the peer's state, and a peer that never reports
 * a refusal must be caught, so the checker is known to be able to fail. Last, the boot's read-only
 * state: `GAMELIB_STORE_BOOT` entries make a cell read-only at construction and reach the root's
 * once-per-launch aggregate.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import GameLibStore from '../../store_backend'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'
import {
  isStoreMirrorEvent,
  MirrorCell,
  type StoreMirrorEvent
} from '../mirrorCell'
import type { StoreFrame, StoreFrameSink } from '../storeFrames'
import type { StoreRoot } from '../storeRoot'

const TRACER = 'store_cache/wikigameinfo'

let userData: string
let stderr: jest.SpiedFunction<typeof process.stderr.write>
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-mirror-cell-'))
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => {
  jest.restoreAllMocks()
  rmSync(userData, { recursive: true, force: true })
})

const plant = (text: string) => {
  mkdirSync(join(userData, 'store_cache'), { recursive: true })
  writeFileSync(join(userData, 'store_cache', 'wikigameinfo.json'), text)
}

function recording() {
  const frames: StoreFrame[] = []
  const sink: StoreFrameSink = { send: (frame) => void frames.push(frame) }
  return { frames, sink }
}

const rustRoot = (sink: StoreFrameSink, boot?: StoreRoot['boot']) =>
  createTestStoreRoot(userData, { frameSink: sink, boot })

const tracerStore = (root: StoreRoot) =>
  new GameLibStore({
    root,
    cwd: 'store_cache',
    name: 'wikigameinfo',
    declaration: { kind: 'cache' }
  })

const cellOf = (root: StoreRoot, store: GameLibStore) =>
  root.mirrors.cellFor({ path: store.path, storeKey: TRACER, dotPaths: true })

const ack = (
  frame: StoreFrame,
  rev: number,
  op: 'applied' | 'refused' = 'applied'
): StoreMirrorEvent => ({
  store: frame.store,
  rev,
  op,
  originSeq: frame.seq,
  ...(op === 'refused' ? { reason: 'io' as const } : {})
})

describe('read-your-writes', () => {
  it('every read after a local write returns it until a later op supersedes it, whenever events arrive', () => {
    const { frames, sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    store.set('a', 1)
    expect(store.get('a')).toBe(1)
    store.set('a', 2)
    expect(store.get('a')).toBe(2)
    // The first answer arrives: the view must not fall back to the first op's value.
    root.mirrors.applyEvent(ack(frames[0] as StoreFrame, 1))
    expect(store.get('a')).toBe(2)
    store.delete('a')
    expect(store.has('a')).toBe(false)
    root.mirrors.applyEvent(ack(frames[1] as StoreFrame, 2))
    expect(store.has('a')).toBe(false)
    store.store = { b: 1 }
    expect(store.store).toEqual({ b: 1 })
    store.set('c', 3)
    expect(store.store).toEqual({ b: 1, c: 3 })
    root.mirrors.applyEvent(ack(frames[2] as StoreFrame, 3))
    root.mirrors.applyEvent(ack(frames[3] as StoreFrame, 4))
    root.mirrors.applyEvent(ack(frames[4] as StoreFrame, 5))
    expect(store.store).toEqual({ b: 1, c: 3 })
    expect(cellOf(root, store).pendingCount).toBe(0)
  })
})

describe('one cell per file path (Pitfall 6)', () => {
  it('two TS stores and an ad hoc construction over one file see each other’s writes at once', () => {
    const { sink } = recording()
    const root = rustRoot(sink)
    const first = tracerStore(root)
    const second = tracerStore(root)
    // What storeWriteHandlers.ts and handlers.ts build for a cache name they only know at run time.
    const adHoc = new GameLibStore({
      root,
      cwd: 'store_cache',
      name: 'wikigameinfo',
      clearInvalidConfig: true
    })
    first.set('k', 'v')
    expect(second.get('k')).toBe('v')
    expect(adHoc.get('k')).toBe('v')
    adHoc.set('k.nested', 1)
    expect(first.get('k')).toEqual({ nested: 1 })
    second.clear()
    expect(adHoc.size).toBe(0)
    expect(cellOf(root, first)).toBe(cellOf(root, second))
    expect(cellOf(root, adHoc)).toBe(cellOf(root, first))
  })

  it('the registry returns one cell per resolved path, whatever name asks', () => {
    const { sink } = recording()
    const root = rustRoot(sink)
    const path = join(userData, 'steam_store', 'config.json')
    const a = root.mirrors.cellFor({
      path,
      storeKey: 'steam_store/config',
      dotPaths: true
    })
    const b = root.mirrors.cellFor({
      path,
      storeKey: 'steam_store/config',
      dotPaths: true
    })
    expect(a).toBe(b)
  })
})

describe('a change from another origin', () => {
  it('shows the local write until it is applied or refused, then the shell’s order decides', () => {
    const { frames, sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    const apply = (event: StoreMirrorEvent) => root.mirrors.applyEvent(event)

    store.set('a', 2)
    // The renderer's write reached the shell first: rev 1, then our frame at rev 2.
    apply({
      store: TRACER,
      rev: 1,
      op: 'changed',
      key: 'a',
      valueJson: '1'
    })
    expect(store.get('a')).toBe(2)
    apply(ack(frames[0] as StoreFrame, 2))
    expect(store.get('a')).toBe(2)

    // The other order: ours is refused, so what the renderer wrote is what is left.
    store.set('b', 5)
    apply({
      store: TRACER,
      rev: 3,
      op: 'changed',
      key: 'b',
      valueJson: '4'
    })
    expect(store.get('b')).toBe(5)
    apply(ack(frames[1] as StoreFrame, 3, 'refused'))
    expect(store.get('b')).toBe(4)
    expect(cellOf(root, store).pendingCount).toBe(0)
  })

  it('applies a change only above the cell’s rev and ignores a repeat or an older one', () => {
    const { sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    const cell = cellOf(root, store)
    const changed = (rev: number, valueJson: string): StoreMirrorEvent => ({
      store: TRACER,
      rev,
      op: 'changed',
      key: 'a',
      valueJson
    })
    root.mirrors.applyEvent(changed(5, '5'))
    expect(store.get('a')).toBe(5)
    expect(cell.baseRev).toBe(5)
    root.mirrors.applyEvent(changed(3, '3'))
    root.mirrors.applyEvent(changed(5, '99'))
    expect(store.get('a')).toBe(5)
    expect(cell.baseRev).toBe(5)
    root.mirrors.applyEvent(changed(6, '6'))
    expect(store.get('a')).toBe(6)
  })

  it('decodes set, delete, replace and clear the way a frame names them', () => {
    const { sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    const send = (event: Omit<StoreMirrorEvent, 'store' | 'op'>) =>
      root.mirrors.applyEvent({ store: TRACER, op: 'changed', ...event })
    send({ rev: 1, key: 'a.b', valueJson: '{"x":1}' })
    expect(store.store).toEqual({ a: { b: { x: 1 } } })
    send({ rev: 2, valueJson: '{"z":9,"__internal__":{"gamelib":{}}}' })
    expect(store.store).toEqual({ z: 9 })
    send({ rev: 3, key: 'z' })
    expect(store.store).toEqual({})
    send({ rev: 4, key: 'k', valueJson: '1' })
    send({ rev: 5 })
    expect(store.store).toEqual({})
  })

  it('drops a change it cannot read, with a reason word only and without moving its rev', () => {
    const { sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    const cell = cellOf(root, store)
    const send = (event: Omit<StoreMirrorEvent, 'store' | 'op'>) =>
      root.mirrors.applyEvent({ store: TRACER, op: 'changed', ...event })
    send({ rev: 1, key: 'k', valueJson: '{not json TOKEN-VALUE' })
    send({ rev: 2, key: '__internal__.gamelib', valueJson: '1' })
    send({ rev: 3, key: 'a.__proto__.x', valueJson: '1' })
    send({ rev: 4, valueJson: '[1,2]' })
    expect(store.store).toEqual({})
    expect(cell.baseRev).toBe(0)
    const logged = stderr.mock.calls.map((c) => String(c[0])).join('')
    expect(logged.match(/change event dropped/g)).toHaveLength(4)
    expect(logged).toContain('(value-json)')
    expect(logged).toContain('(reserved-key)')
    expect(logged).toContain('(key-path)')
    expect(logged).not.toContain('TOKEN-VALUE')
  })

  it('never lets a value reach the prototype chain (T-85-27)', () => {
    const { sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    root.mirrors.applyEvent({
      store: TRACER,
      rev: 1,
      op: 'changed',
      key: 'k',
      valueJson: '{"__proto__":{"polluted":1},"constructor":{"x":2}}'
    })
    root.mirrors.applyEvent({
      store: TRACER,
      rev: 2,
      op: 'changed',
      valueJson: '{"__proto__":{"polluted":1}}'
    })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    // An own key named `__proto__` holding data, not a changed prototype.
    expect(Object.keys(store.store)).toEqual(['__proto__'])
    expect(
      Object.getOwnPropertyDescriptor(store.store, '__proto__')?.value
    ).toEqual({ polluted: 1 })
  })
})

describe('a cell created after an event was persisted', () => {
  it('converges when an event its file already reflects is applied again', () => {
    // The file shows the store after rev 2 (a: 1 then a: 2); the events for revs 1 and 2 were
    // still on their way when the cell was built, so they arrive over a base that has the result.
    plant('{"a":2}')
    const { sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    const apply = (rev: number, valueJson: string) =>
      root.mirrors.applyEvent({
        store: TRACER,
        rev,
        op: 'changed',
        key: 'a',
        valueJson
      })
    apply(1, '1')
    apply(2, '2')
    expect(store.get('a')).toBe(2)
    expect(cellOf(root, store).baseRev).toBe(2)
    // And an event that is a repeat of one already applied is dropped.
    apply(1, '1')
    expect(store.get('a')).toBe(2)
  })
})

describe('flushStores: the quit barrier', () => {
  it('resolves at once, sending nothing, when no write is waiting for an answer', async () => {
    const { frames, sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    await root.mirrors.flushStores(2000)
    store.set('a', 1)
    root.mirrors.applyEvent(ack(frames[0] as StoreFrame, 1))
    frames.length = 0
    await root.mirrors.flushStores(2000)
    expect(frames).toEqual([])
  })

  it('sends one flush frame behind the pending writes and resolves on its flushed event', async () => {
    const { frames, sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    store.set('a', 1)
    store.set('b', 2)
    let done = false
    const flushing = root.mirrors.flushStores(2000).then(() => {
      done = true
    })
    expect(frames.map((f) => f.op)).toEqual(['set', 'set', 'flush'])
    root.mirrors.applyEvent(ack(frames[0] as StoreFrame, 1))
    root.mirrors.applyEvent(ack(frames[1] as StoreFrame, 2))
    await Promise.resolve()
    expect(done).toBe(false)
    root.mirrors.applyEvent({
      store: TRACER,
      rev: 0,
      op: 'flushed',
      originSeq: (frames[2] as StoreFrame).seq
    })
    await flushing
    expect(done).toBe(true)
  })

  it('never rejects: a deadline and a refusal each cost one warning, and the deadline timer is unref’d', async () => {
    const timeouts = jest.spyOn(global, 'setTimeout')
    const { frames, sink } = recording()
    const root = rustRoot(sink)
    const store = tracerStore(root)
    store.set('a', 1)
    const timedOut = root.mirrors.flushStores(15)
    const handle = timeouts.mock.results[0]?.value as NodeJS.Timeout
    expect(handle.hasRef()).toBe(false)
    await expect(timedOut).resolves.toBeUndefined()

    const refused = root.mirrors.flushStores(2000)
    root.mirrors.applyEvent({
      store: TRACER,
      rev: 0,
      op: 'refused',
      originSeq: (frames[frames.length - 1] as StoreFrame).seq,
      reason: 'not-owned'
    })
    await expect(refused).resolves.toBeUndefined()
    const logged = stderr.mock.calls.map((c) => String(c[0])).join('')
    expect(logged).toContain('timed out')
    expect(logged).toContain('refused: not-owned')
  })
})

describe('isStoreMirrorEvent', () => {
  it('accepts an answer with an originSeq and a change with or without a key and value, and nothing else', () => {
    const base = { store: TRACER, rev: 1 }
    expect(isStoreMirrorEvent({ ...base, op: 'applied', originSeq: 1 })).toBe(
      true
    )
    expect(isStoreMirrorEvent({ ...base, op: 'flushed', originSeq: 1 })).toBe(
      true
    )
    expect(isStoreMirrorEvent({ ...base, op: 'applied' })).toBe(false)
    expect(isStoreMirrorEvent({ ...base, op: 'changed' })).toBe(true)
    expect(isStoreMirrorEvent({ ...base, op: 'changed', key: 'k' })).toBe(true)
    expect(
      isStoreMirrorEvent({ ...base, op: 'changed', key: 'k', valueJson: '1' })
    ).toBe(true)
    expect(isStoreMirrorEvent({ ...base, op: 'changed', key: 4 })).toBe(false)
    expect(isStoreMirrorEvent({ ...base, op: 'changed', valueJson: {} })).toBe(
      false
    )
    expect(isStoreMirrorEvent({ ...base, op: 'other' })).toBe(false)
    expect(isStoreMirrorEvent({ rev: 1, op: 'changed' })).toBe(false)
    expect(isStoreMirrorEvent(null)).toBe(false)
  })
})

// ---- the property test ----------------------------------------------------------------------

const KEYS = ['a', 'b', 'c'] as const

type Op =
  | { t: 'set'; k: string; v: number }
  | { t: 'delete'; k: string }
  | { t: 'clear' }
  | { t: 'replace'; obj: Record<string, number> }

type State = Record<string, number>

function mulberry32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function applyModel(state: State, op: Op): State {
  switch (op.t) {
    case 'set':
      return { ...state, [op.k]: op.v }
    case 'delete': {
      const next = { ...state }
      delete next[op.k]
      return next
    }
    case 'clear':
      return {}
    case 'replace':
      return { ...op.obj }
  }
}

/** What an op leaves at key `k`: nothing said, or present with a value, or absent. */
function effect(
  op: Op,
  k: string
): { touched: false } | { touched: true; has: boolean; v?: number } {
  switch (op.t) {
    case 'set':
      return op.k === k
        ? { touched: true, has: true, v: op.v }
        : { touched: false }
    case 'delete':
      return op.k === k ? { touched: true, has: false } : { touched: false }
    case 'clear':
      return { touched: true, has: false }
    case 'replace':
      return k in op.obj
        ? { touched: true, has: true, v: op.obj[k] }
        : { touched: true, has: false }
  }
}

const canon = (state: State): string =>
  JSON.stringify(
    Object.keys(state)
      .sort()
      .map((k) => [k, state[k]])
  )

function genOp(rnd: () => number, counter: { n: number }): Op {
  const k = KEYS[Math.floor(rnd() * KEYS.length)] as string
  const x = rnd()
  if (x < 0.55) return { t: 'set', k, v: ++counter.n }
  if (x < 0.75) return { t: 'delete', k }
  if (x < 0.85) return { t: 'clear' }
  const obj: Record<string, number> = {}
  for (const key of KEYS) if (rnd() < 0.5) obj[key] = ++counter.n
  return { t: 'replace', obj }
}

interface Plan {
  rendererOps: Op[]
  sidecarOps: { op: Op; name: 'A' | 'B' }[]
  failMode: boolean
  /** The cell exists from the start (rev 0), instead of appearing at a random step. */
  earlyCell: boolean
  total: number
}

function genPlan(rnd: () => number): Plan {
  const counter = { n: 0 }
  const total = 2 + Math.floor(rnd() * 19)
  const rendererOps: Op[] = []
  const sidecarOps: Plan['sidecarOps'] = []
  for (let i = 0; i < total; i++) {
    const op = genOp(rnd, counter)
    if (rnd() < 0.5) rendererOps.push(op)
    else sidecarOps.push({ op, name: rnd() < 0.5 ? 'A' : 'B' })
  }
  return {
    rendererOps,
    sidecarOps,
    failMode: rnd() < 0.3,
    earlyCell: rnd() < 0.5,
    total
  }
}

class ProtocolViolation extends Error {}

interface Stats {
  changedApplied: number
  refusals: number
  lateCells: number
  lateReplays: number
  redeliveries: number
  conflicts: number
}

/**
 * One random run: a fake Rust peer (one writer, persist before emit, a rev per applied write under
 * one lock, a refusal for a failed persist and no rev for it), the production mirror reached through
 * two `GameLibStore` names, and every asynchronous step as an action the generator orders at random.
 */
class Interleaving {
  readonly stats: Stats = {
    changedApplied: 0,
    refusals: 0,
    lateCells: 0,
    lateReplays: 0,
    redeliveries: 0,
    conflicts: 0
  }
  private readonly dir: string
  private readonly root: StoreRoot
  private readonly frameQ: StoreFrame[] = []
  private readonly sideQ: StoreMirrorEvent[] = []
  private readonly delivered: StoreMirrorEvent[] = []
  private rust: { state: State; rev: number } = { state: {}, rev: 0 }
  private readonly history: State[] = [{}]
  private stores: { A: GameLibStore; B: GameLibStore } | null = null
  /** The sidecar's unacked local ops, kept independently of the cell: the oracle for read-your-writes. */
  private unacked: { seq: number; op: Op }[] = []
  private exactRev = false

  constructor(
    private readonly rnd: () => number,
    private readonly plan: Plan,
    private readonly options: { dropRefusals: boolean }
  ) {
    this.dir = mkdtempSync(join(tmpdir(), 'gamelib-interleave-'))
    this.root = createTestStoreRoot(this.dir, {
      frameSink: { send: (frame) => void this.frameQ.push(frame) }
    })
  }

  dispose(): void {
    rmSync(this.dir, { recursive: true, force: true })
  }

  private fail(code: string, message: string): never {
    throw new ProtocolViolation(`${code}: ${message}`)
  }

  private get cell(): MirrorCell {
    const stores = this.stores as { A: GameLibStore }
    return this.root.mirrors.cellFor({
      path: stores.A.path,
      storeKey: TRACER,
      dotPaths: true
    })
  }

  private view(name: 'A' | 'B'): State {
    return (this.stores as Record<'A' | 'B', GameLibStore>)[name].store as State
  }

  // ---- the peer ---------------------------------------------------------------------------

  private decode(frame: StoreFrame): Op {
    switch (frame.op) {
      case 'set':
        return {
          t: 'set',
          k: frame.key as string,
          v: JSON.parse(frame.valueJson as string) as number
        }
      case 'delete':
        return { t: 'delete', k: frame.key as string }
      case 'clear':
        return { t: 'clear' }
      default:
        return {
          t: 'replace',
          obj: JSON.parse(frame.valueJson as string) as Record<string, number>
        }
    }
  }

  private persistFails(): boolean {
    return this.plan.failMode && this.rnd() < 0.12
  }

  private commit(op: Op): number {
    const next = applyModel(this.rust.state, op)
    this.rust = { state: next, rev: this.rust.rev + 1 }
    this.history[this.rust.rev] = next
    return this.rust.rev
  }

  private rendererWrite(): void {
    const op = this.plan.rendererOps.shift() as Op
    if (this.unacked.length > 0) this.stats.conflicts++
    if (this.persistFails()) return // rolled back: no rev, no event
    const rev = this.commit(op)
    const event: StoreMirrorEvent = { store: TRACER, rev, op: 'changed' }
    if (op.t === 'set') {
      event.key = op.k
      event.valueJson = JSON.stringify(op.v)
    } else if (op.t === 'delete') {
      event.key = op.k
    } else if (op.t === 'replace') {
      event.valueJson = JSON.stringify(op.obj)
    }
    this.sideQ.push(event)
  }

  private processFrame(): void {
    const frame = this.frameQ.shift() as StoreFrame
    const op = this.decode(frame)
    if (this.persistFails()) {
      this.stats.refusals++
      if (!this.options.dropRefusals) {
        this.sideQ.push({
          store: TRACER,
          rev: this.rust.rev,
          op: 'refused',
          originSeq: frame.seq,
          reason: 'io'
        })
      }
      return
    }
    const rev = this.commit(op)
    this.sideQ.push({
      store: TRACER,
      rev,
      op: 'applied',
      originSeq: frame.seq
    })
  }

  // ---- the sidecar ------------------------------------------------------------------------

  private createCells(): void {
    // The file is what the shell has persisted so far (the state at its current rev).
    mkdirSync(join(this.dir, 'store_cache'), { recursive: true })
    writeFileSync(
      join(this.dir, 'store_cache', 'wikigameinfo.json'),
      JSON.stringify(this.rust.state)
    )
    const make = () =>
      new GameLibStore({
        root: this.root,
        cwd: 'store_cache',
        name: 'wikigameinfo',
        declaration: { kind: 'cache' }
      })
    this.stores = { A: make(), B: make() }
    if (this.rust.rev > 0) {
      this.stats.lateCells++
      this.stats.lateReplays += this.sideQ.length
    }
    this.exactRev = this.rust.rev === 0
  }

  private sidecarWrite(): void {
    const { op, name } = this.plan.sidecarOps.shift() as Plan['sidecarOps'][0]
    const before = { A: this.view('A'), B: this.view('B') }
    const store = (this.stores as Record<'A' | 'B', GameLibStore>)[name]
    const framesBefore = this.frameQ.length
    switch (op.t) {
      case 'set':
        store.set(op.k, op.v)
        break
      case 'delete':
        store.delete(op.k)
        break
      case 'clear':
        store.clear()
        break
      case 'replace':
        store.store = { ...op.obj }
        break
    }
    const frame = this.frameQ[this.frameQ.length - 1] as StoreFrame
    if (this.frameQ.length !== framesBefore + 1) {
      this.fail('V', 'a local write did not send exactly one frame')
    }
    this.unacked.push({ seq: frame.seq, op })
    // V: visible at once, through every TS name over the file.
    for (const n of ['A', 'B'] as const) {
      const want = applyModel(before[n], op)
      if (canon(this.view(n)) !== canon(want)) {
        this.fail(
          'V',
          `after a local ${op.t} the view via name ${n} is ${canon(this.view(n))}, expected ${canon(want)}`
        )
      }
    }
  }

  private deliver(event: StoreMirrorEvent): void {
    if (event.originSeq !== undefined) {
      this.unacked = this.unacked.filter((p) => p.seq !== event.originSeq)
    }
    const had = this.cellExists()
    this.root.mirrors.applyEvent(event)
    if (had && event.op === 'changed') this.stats.changedApplied++
  }

  private cellExists(): boolean {
    return this.stores !== null
  }

  private deliverSide(): void {
    const event = this.sideQ.shift() as StoreMirrorEvent
    // Only what a cell actually received can arrive again; an event that found no cell was dropped.
    if (this.stores !== null) this.delivered.push(event)
    this.deliver(event)
  }

  /** An old event arrives again: a repeat is already reflected, so it must change nothing. */
  private redeliver(): void {
    const event = this.delivered[
      Math.floor(this.rnd() * this.delivered.length)
    ] as StoreMirrorEvent
    this.stats.redeliveries++
    const before = this.stores ? canon(this.view('A')) : ''
    const pendingBefore = this.stores ? this.cell.pendingCount : 0
    this.root.mirrors.applyEvent(event)
    if (this.stores) {
      if (
        canon(this.view('A')) !== before ||
        this.cell.pendingCount !== pendingBefore
      ) {
        this.fail(
          'G',
          `a repeated event (rev ${event.rev}, ${event.op}) changed the mirror`
        )
      }
    }
  }

  // ---- invariants -------------------------------------------------------------------------

  private check(): void {
    if (this.stores === null) return
    const touched = new Map<string, { has: boolean; v?: number }>()
    for (const { op } of this.unacked) {
      for (const k of KEYS) {
        const e = effect(op, k)
        if (e.touched) touched.set(k, { has: e.has, v: e.v })
      }
    }
    for (const name of ['A', 'B'] as const) {
      const view = this.view(name)
      // R: per key, the effect of the LAST unacked local op touching it.
      for (const [k, want] of touched) {
        const has = k in view
        if (has !== want.has || (has && view[k] !== want.v)) {
          this.fail(
            'R',
            `name ${name} reads ${k}=${has ? view[k] : '<absent>'}; the last unacked local op says ${want.has ? want.v : '<absent>'}`
          )
        }
      }
      // P: a cell that began at rev 0 holds the shell's state at its rev, key by key where no local
      // op speaks. (A cell created later starts at rev 0 over a file at a later rev, so only
      // convergence, below, applies to it.)
      if (this.exactRev) {
        const state = this.history[this.cell.baseRev] as State
        for (const k of KEYS) {
          if (touched.has(k)) continue
          if (k in view !== k in state || view[k] !== state[k]) {
            this.fail(
              'P',
              `name ${name} reads ${k}=${k in view ? view[k] : '<absent>'}; the shell's state at rev ${this.cell.baseRev} has ${k in state ? state[k] : '<absent>'}`
            )
          }
        }
      }
    }
  }

  private checkQuiescent(): void {
    const cell = this.cell
    if (cell.pendingCount !== 0) {
      this.fail('C', `${cell.pendingCount} op(s) still pending at quiescence`)
    }
    for (const name of ['A', 'B'] as const) {
      if (canon(this.view(name)) !== canon(this.rust.state)) {
        this.fail(
          'C',
          `view ${name} ${canon(this.view(name))} != the shell ${canon(this.rust.state)}`
        )
      }
    }
  }

  run(): void {
    if (this.plan.earlyCell) this.createCells()
    for (let guard = 0; guard < 5000; guard++) {
      const enabled: (() => void)[] = []
      if (this.plan.rendererOps.length) enabled.push(() => this.rendererWrite())
      if (this.stores === null) enabled.push(() => this.createCells())
      if (this.stores !== null && this.plan.sidecarOps.length) {
        enabled.push(() => this.sidecarWrite())
      }
      if (this.frameQ.length) enabled.push(() => this.processFrame())
      if (this.sideQ.length) enabled.push(() => this.deliverSide())
      if (this.delivered.length && this.rnd() < 0.15) {
        enabled.push(() => this.redeliver())
      }
      if (enabled.length === 0) break
      const act = enabled[Math.floor(this.rnd() * enabled.length)] as () => void
      act()
      this.check()
    }
    this.checkQuiescent()
  }
}

const RUNS = 2000
const SEED = 85

function runMany(options: {
  dropRefusals: boolean
  runs: number
  failOnly?: boolean
}) {
  const totals: Stats = {
    changedApplied: 0,
    refusals: 0,
    lateCells: 0,
    lateReplays: 0,
    redeliveries: 0,
    conflicts: 0
  }
  const interleavings = new Set<string>()
  for (let i = 0; i < options.runs; i++) {
    const rnd = mulberry32((SEED * 100003 + i) >>> 0)
    const plan = genPlan(rnd)
    if (options.failOnly) plan.failMode = true
    const run = new Interleaving(rnd, plan, {
      dropRefusals: options.dropRefusals
    })
    try {
      run.run()
    } catch (error) {
      if (error instanceof ProtocolViolation) {
        throw new ProtocolViolation(`run ${i} (seed ${SEED}): ${error.message}`)
      }
      throw error
    } finally {
      run.dispose()
    }
    for (const key of Object.keys(totals) as (keyof Stats)[]) {
      totals[key] += run.stats[key]
    }
    interleavings.add(`${plan.total}:${i}`)
  }
  return { totals, runs: interleavings.size }
}

describe('the S1 property test against a fake Rust peer', () => {
  it(`${RUNS} seeded random interleavings keep read-your-writes after every step and converge`, () => {
    const { totals, runs } = runMany({ dropRefusals: false, runs: RUNS })
    expect(runs).toBe(RUNS)
    // Not vacuous: every protocol path the rules name was exercised many times.
    expect(totals.changedApplied).toBeGreaterThan(1000)
    expect(totals.refusals).toBeGreaterThan(100)
    expect(totals.lateCells).toBeGreaterThan(300)
    expect(totals.lateReplays).toBeGreaterThan(100)
    expect(totals.redeliveries).toBeGreaterThan(500)
    expect(totals.conflicts).toBeGreaterThan(500)
  }, 120_000)

  it('catches a peer that never reports a failed persist (the checker can fail)', () => {
    expect(() =>
      runMany({ dropRefusals: true, runs: 500, failOnly: true })
    ).toThrow(/still pending at quiescence|reads/)
  })
})

// ---- the boot's read-only state ---------------------------------------------------------------

describe('read-only stores the shell reported at boot', () => {
  it('make that store’s cell read-only at construction and refuse every write without a frame', () => {
    plant('{"480":1}')
    const { frames, sink } = recording()
    const root = rustRoot(sink, {
      readOnly: new Map([[TRACER, 'newer' as const]]),
      startEmpty: new Set()
    })
    const store = tracerStore(root)
    expect(store.readOnly).toBe(true)
    expect(cellOf(root, store).readOnly).toBe(true)
    store.set('480', 2)
    store.delete('480')
    store.clear()
    store.store = { x: 1 }
    expect(store.get('480')).toBe(1)
    expect(frames).toEqual([])
  })

  it('logs once when the report was truncated and the store is in neither list, and stays writable', () => {
    plant('{"480":1}')
    const { sink } = recording()
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      const root = rustRoot(sink, {
        readOnly: new Map(),
        startEmpty: new Set(),
        truncated: true
      })
      const store = tracerStore(root)
      expect(store.readOnly).toBe(false)
      const lines = stderr.mock.calls
        .map((c) => String(c[0]))
        .filter((l) => l.includes('boot report was truncated'))
      expect(lines).toHaveLength(1)
    } finally {
      stderr.mockRestore()
    }
  })

  it('stays silent for a listed store, and for any store when the report was not truncated', () => {
    plant('{"480":1}')
    const { sink } = recording()
    const stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true)
    try {
      tracerStore(
        rustRoot(sink, {
          readOnly: new Map([[TRACER, 'newer' as const]]),
          startEmpty: new Set(),
          truncated: true
        })
      )
      tracerStore(
        rustRoot(sink, { readOnly: new Map(), startEmpty: new Set() })
      )
      expect(
        stderr.mock.calls.some((c) =>
          String(c[0]).includes('boot report was truncated')
        )
      ).toBe(false)
    } finally {
      stderr.mockRestore()
    }
  })
})

describe('MirrorRegistry.dropWhere', () => {
  it('drops every cell whose path the predicate accepts, through drop, and returns the count', () => {
    plant('{"480":1}')
    const { sink } = recording()
    const root = rustRoot(sink)
    const wikiPath = join(userData, 'store_cache', 'wikigameinfo.json')
    const configPath = join(userData, 'config.json')
    const gamePath = join(userData, 'GamesConfig', 'a.json')
    root.mirrors.cellFor({
      path: configPath,
      storeKey: 'settings/global',
      dotPaths: true
    })
    root.mirrors.cellFor({
      path: gamePath,
      storeKey: 'GamesConfig/a',
      dotPaths: true
    })
    const wiki = root.mirrors.cellFor({
      path: wikiPath,
      storeKey: TRACER,
      dotPaths: true
    })

    expect(root.mirrors.dropWhere((p) => p !== wikiPath)).toBe(2)

    expect(root.mirrors.peek(configPath)).toBeUndefined()
    expect(root.mirrors.peek(gamePath)).toBeUndefined()
    expect(root.mirrors.peek(wikiPath)).toBe(wiki)
    // an answer still owed to a dropped cell routes nowhere
    expect(
      root.mirrors.applyEvent({
        store: 'GamesConfig/a',
        rev: 1,
        op: 'applied',
        originSeq: 1
      })
    ).toBe(false)
    const fresh = root.mirrors.cellFor({
      path: gamePath,
      storeKey: 'GamesConfig/a',
      dotPaths: true
    })
    expect(fresh.baseRev).toBe(0)

    expect(root.mirrors.dropWhere(() => true)).toBe(2)
    expect(root.mirrors.dropWhere(() => true)).toBe(0)
  })
})
