/**
 * The sidecar's in-memory mirror of one Rust-owned store file (Phase 85, FND-06, research Pattern 3).
 *
 * ~60 consumer files read stores synchronously (`store.get(key)` straight after `init()`), so the
 * sidecar cannot become an async client of the Rust store. A `MirrorCell` is the synchronous face:
 * it loads the file once, serves every read from memory, applies a write to its own view at once
 * (read-your-writes) and sends one ordered `kind:"store"` frame to the shell, whose single writer
 * persists it. The shell answers each frame with a `storeMirrorEvent`; this cell uses it to move
 * the op from `pending` onto `base`, or to drop it when the shell refused it.
 *
 *   view = pending ops folded over base      (what every read returns)
 *
 * The protocol rules this implements are 85-SPIKES.md S1 (model-checked, 10,000 random traces):
 *   5. ONE CELL PER FILE PATH, not per TS instance: `steamConfigStore` and `steamBottleConfigStore`
 *      share a file and so share a cell (`MirrorRegistry`).
 *   4. Ops are idempotent state assignments (`set`, `delete`, `clear`, `replace`), never deltas.
 *   6. `originSeq` acks: an `applied` event removes exactly the pending op with that `seq`.
 *   7. A `refused` event (a failed persist, a read-only or not-owned store) drops the pending op
 *      and the view reverts to base plus what is still pending.
 *   8. `rev` only ever rises: `baseRev` is the highest rev seen. A `changed` event (another origin,
 *      emitted by the shell from 85-17) is applied to base when its rev is above `baseRev` and
 *      dropped otherwise; so is an `applied` ack (a no-op the shell acks with the rev it saw is
 *      already in base). The shell sends every event from one ordered queue, so revs arrive in
 *      order. A cell created late starts at rev 0 and loads whatever the file shows; because ops
 *      assign state, an event the file already reflects converges when it is applied once more.
 *
 * A write refused by this cell itself (a read-only store, the reserved `__internal__` namespace, a
 * frame the shell would reject) changes nothing and sends nothing, as the conf store did.
 *
 * Values cross as JSON text. `JSON.stringify(value)` is the frame's `valueJson` and the same text
 * is parsed back for the pending op, so what the view holds is exactly what the disk will hold.
 *
 * Dot paths are `dotPath.ts` (dot-prop 6, proven on the oracle vectors Rust also passes), so the
 * view after a local write is what the shell will persist for the same frame.
 *
 * Sidecar exit contract: the only timer is `flush`'s deadline, and it is `unref()`ed.
 * Pure otherwise: no logger (stderr lines name the store key and a reason word, never a value).
 */
import { readFileSync } from 'fs'
import { STORE_FRAME_KIND } from 'common/types/sidecarTransport'
import { deletePath, getPath, setPath } from './dotPath'
import {
  validateStoreFrame,
  type StoreFrame,
  type StoreFrameSink
} from './storeFrames'
import type { StoreBootEnv } from './storeRoot'

const RESERVED_KEY = '__internal__'

type Doc = Record<string, unknown>

type MirrorOp =
  | { kind: 'set'; key: string; value: unknown }
  | { kind: 'delete'; key: string }
  | { kind: 'clear' }
  | { kind: 'replace'; value: Doc }

interface PendingOp {
  seq: number
  op: MirrorOp
}

/**
 * What the shell tells the sidecar about a store. `applied`, `refused` and `flushed` answer one of
 * this process's own frames and carry its `originSeq`; `changed` reports a write from another
 * origin (the renderer, 85-17) and has none. A `changed` event names the write the way a frame
 * does: `key` and `valueJson` is a `set`, `key` alone a `delete`, `valueJson` alone a `replace`,
 * neither a `clear`.
 */
type StoreMirrorEventOp = 'applied' | 'refused' | 'flushed' | 'changed'

export interface StoreMirrorEvent {
  store: string
  rev: number
  op: StoreMirrorEventOp
  originSeq?: number
  reason?: 'read-only' | 'evicted' | 'rejected' | 'io' | 'not-owned'
  key?: string
  valueJson?: string
}

export interface MirrorCellOptions {
  /** The store file's absolute path: the cell's identity. */
  path: string
  /** The store table key the shell knows it by (`store_cache/wikigameinfo`). */
  storeKey: string
  /** Whether the store's keys are dot paths (every row but `store/uploadedLogs`). */
  dotPaths: boolean
  /** The shell opened this store read-only: every write is refused and nothing is sent. */
  readOnly: boolean
  /** The shell could not read this cache and continues empty: the cell starts empty too. */
  startEmpty: boolean
  sink: StoreFrameSink
  /** The next frame `seq`: shared by every cell of a root, so seqs are unique per boot. */
  nextSeq: () => number
}

const isContainer = (v: unknown): v is Doc | unknown[] =>
  typeof v === 'object' && v !== null

/** A value copied so nothing the cell holds is shared with a caller (JSON values only). */
function cloneJson<V>(value: V): V {
  return isContainer(value) ? (structuredClone(value) as V) : value
}

function emptyDoc(doc: Doc): void {
  for (const key of Object.keys(doc)) delete doc[key]
}

/** Applies one op to `doc` in place. The op's value is copied, so `doc` never shares it. */
function applyOp(doc: Doc, op: MirrorOp, dotPaths: boolean): void {
  switch (op.kind) {
    case 'set':
      setPath(doc, op.key, cloneJson(op.value), dotPaths)
      return
    case 'delete':
      deletePath(doc, op.key, dotPaths)
      return
    case 'clear':
      emptyDoc(doc)
      return
    case 'replace': {
      emptyDoc(doc)
      const next = cloneJson(op.value)
      // Own properties, never `Object.assign`: its [[Set]] would turn an own `__proto__` key of
      // the value into a write to the prototype.
      for (const key of Object.keys(next)) {
        Object.defineProperty(doc, key, {
          value: next[key],
          writable: true,
          enumerable: true,
          configurable: true
        })
      }
    }
  }
}

/** The file's store data, without the `__internal__` envelope; `{}` when it is missing or unreadable. */
function loadFile(path: string): Doc {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return {}
  }
  if (!isContainer(parsed) || Array.isArray(parsed)) return {}
  delete parsed[RESERVED_KEY]
  return parsed
}

/** conf refuses these values before it writes (`checkValueType`); the mirror refuses them the same way. */
function assertWritable(key: string, value: unknown): void {
  if (value === undefined) {
    throw new TypeError(`Use \`delete()\` to clear values (key: ${key})`)
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError(
      `Setting a value of type \`${typeof value}\` is not allowed as it's not supported by JSON (key: ${key})`
    )
  }
}

export class MirrorCell {
  readonly path: string
  readonly storeKey: string
  readonly readOnly: boolean

  private readonly dotPaths: boolean
  private readonly sink: StoreFrameSink
  private readonly nextSeq: () => number
  private readonly base: Doc
  /**
   * `base` with `pending` folded over it. `null` while nothing is pending, and also whenever a
   * change to `base` has made the cached fold stale: it is rebuilt on the next read.
   */
  private viewDoc: Doc | null = null
  private pending: PendingOp[] = []
  private baseRevValue = 0
  private readonly flushWaiters = new Map<
    number,
    {
      resolve: () => void
      reject: (error: Error) => void
      timer: NodeJS.Timeout
    }
  >()

  constructor(options: MirrorCellOptions) {
    this.path = options.path
    this.storeKey = options.storeKey
    this.dotPaths = options.dotPaths
    this.readOnly = options.readOnly
    this.sink = options.sink
    this.nextSeq = options.nextSeq
    this.base = options.startEmpty ? {} : loadFile(options.path)
  }

  /** The highest `rev` the shell has told this cell about (`lastRev` of S1 rule 8). */
  get baseRev(): number {
    return this.baseRevValue
  }

  /** How many writes are sent and not yet answered. */
  get pendingCount(): number {
    return this.pending.length
  }

  /** The fold of `pending` over `base`, built on demand and kept until `base` or `pending` changes. */
  private materialize(): Doc {
    if (this.viewDoc === null) {
      const doc = cloneJson(this.base)
      for (const { op } of this.pending) applyOp(doc, op, this.dotPaths)
      this.viewDoc = doc
    }
    return this.viewDoc
  }

  private get view(): Doc {
    return this.pending.length === 0 ? this.base : this.materialize()
  }

  // ---- reads: always from the view -------------------------------------------------------

  /** The whole store data, without the version envelope. A copy. */
  get data(): Doc {
    return cloneJson(this.view)
  }

  get size(): number {
    return Object.keys(this.view).length
  }

  has(key: string): boolean {
    if (key.split('.')[0] === RESERVED_KEY) return false
    return getPath(this.view, key, this.dotPaths) !== undefined
  }

  get(key: string): unknown {
    if (key.split('.')[0] === RESERVED_KEY) return undefined
    return cloneJson(getPath(this.view, key, this.dotPaths))
  }

  // ---- writes: view now, frame to the shell ----------------------------------------------

  set(key: string, value: unknown): void {
    assertWritable(key, value)
    this.write({ kind: 'set', key, value: JSON.parse(JSON.stringify(value)) })
  }

  delete(key: string): void {
    this.write({ kind: 'delete', key })
  }

  clear(): void {
    this.write({ kind: 'clear' })
  }

  /** `store.store = obj`: the whole document is replaced. The version envelope is not the caller's. */
  replace(value: Doc): void {
    const copy = JSON.parse(JSON.stringify(value)) as Doc
    delete copy[RESERVED_KEY]
    this.write({ kind: 'replace', value: copy })
  }

  private write(op: MirrorOp): void {
    if (this.readOnly) return
    const frame = this.frameFor(op)
    const verdict = validateStoreFrame(frame)
    if (!verdict.ok) {
      // A frame the shell would refuse is refused here, before the view can claim it. The reason
      // word is the only thing logged: a key or a value can be a token.
      process.stderr.write(
        `[mirrorCell] ${this.storeKey}: write refused (${verdict.reason})\n`
      )
      return
    }
    // The fold before this op joins `pending`, then the op on top of it.
    applyOp(this.materialize(), op, this.dotPaths)
    this.pending.push({ seq: frame.seq, op })
    this.sink.send(frame)
  }

  private frameFor(op: MirrorOp): StoreFrame {
    const frame: StoreFrame = {
      kind: STORE_FRAME_KIND,
      seq: this.nextSeq(),
      store: this.storeKey,
      op: op.kind
    }
    if (op.kind === 'set') {
      frame.key = op.key
      frame.valueJson = JSON.stringify(op.value)
    } else if (op.kind === 'delete') {
      frame.key = op.key
    } else if (op.kind === 'replace') {
      frame.valueJson = JSON.stringify(op.value)
    }
    return frame
  }

  /**
   * Resolves once the shell has applied every frame this cell sent before the call (the shell
   * answers a `flush` frame only after all earlier ones). Rejects at `timeoutMs`, or when the
   * shell refuses the flush (a store it does not own). The deadline timer is `unref()`ed.
   */
  flush(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const seq = this.nextSeq()
      const timer = setTimeout(() => {
        this.flushWaiters.delete(seq)
        reject(new Error(`store flush timed out: ${this.storeKey}`))
      }, timeoutMs)
      timer.unref()
      this.flushWaiters.set(seq, { resolve, reject, timer })
      this.sink.send({
        kind: STORE_FRAME_KIND,
        seq,
        store: this.storeKey,
        op: 'flush'
      })
    })
  }

  // ---- the shell's events ----------------------------------------------------------------

  applyEvent(event: StoreMirrorEvent): void {
    if (event.op === 'changed') {
      this.applyChanged(event)
      return
    }
    const { originSeq } = event
    if (originSeq === undefined) return
    const waiter = this.flushWaiters.get(originSeq)
    if (waiter) {
      this.flushWaiters.delete(originSeq)
      clearTimeout(waiter.timer)
      if (event.op === 'flushed') waiter.resolve()
      else {
        waiter.reject(
          new Error(`store flush refused: ${event.reason ?? 'unknown'}`)
        )
      }
      return
    }
    const index = this.pending.findIndex((p) => p.seq === originSeq)
    if (index === -1) return
    const [settled] = this.pending.splice(index, 1) as [PendingOp]
    if (event.op === 'applied') {
      // The shell answers in apply order, so the op it names is the oldest pending one and moving
      // it onto base leaves base plus the rest exactly what the view already was. Anything else
      // (an answer out of order) rebuilds the view rather than trust that.
      //
      // 85-17: only an ack whose rev is above `baseRev` moved the store. The shell acks a no-op
      // (the store already held the value, so no rev was consumed) with the rev it saw, after any
      // change that raced it: that rev is at or below `baseRev`, base already reflects the op, and
      // folding it again would put an older value over a newer change from another origin.
      if (event.rev > this.baseRevValue) {
        applyOp(this.base, settled.op, this.dotPaths)
        this.baseRevValue = event.rev
        if (this.pending.length === 0 || index !== 0) this.viewDoc = null
      } else {
        this.viewDoc = null
      }
      return
    }
    // refused: the view reverts to base plus what is still pending.
    process.stderr.write(
      `[mirrorCell] ${this.storeKey}: store write refused by the shell (${event.reason ?? 'unknown'})\n`
    )
    this.viewDoc = null
  }

  /**
   * A write from another origin, in the shell's rev order (S1 rule 8). A rev at or below `baseRev`
   * is already reflected (this cell was created after it, or the event is a repeat) and is dropped;
   * anything above it moves `base`, and the view is recomputed from base plus what this cell still
   * has pending, so a local write the shell has not answered yet stays visible until it is applied
   * or refused. Ops assign state, so a late cell whose file already shows an event converges when
   * the same event is applied once more. A change that cannot be read as one of the four ops is
   * dropped with one stderr line that names the reason, never the key or the value.
   */
  private applyChanged(event: StoreMirrorEvent): void {
    if (event.rev <= this.baseRevValue) return
    const op = this.opOfChange(event)
    if (op === null) return
    applyOp(this.base, op, this.dotPaths)
    this.baseRevValue = event.rev
    this.viewDoc = null
  }

  private opOfChange(event: StoreMirrorEvent): MirrorOp | null {
    const { key, valueJson } = event
    const shape: StoreFrame = {
      kind: STORE_FRAME_KIND,
      seq: 1,
      store: this.storeKey,
      op:
        key !== undefined
          ? valueJson !== undefined
            ? 'set'
            : 'delete'
          : valueJson !== undefined
            ? 'replace'
            : 'clear'
    }
    if (key !== undefined) shape.key = key
    if (valueJson !== undefined) shape.valueJson = valueJson
    // The same checks the shell applies to a frame: a reserved or prototype path, text that is not
    // JSON, a `replace` that is not an object.
    const verdict = validateStoreFrame(shape)
    if (!verdict.ok) {
      process.stderr.write(
        `[mirrorCell] ${this.storeKey}: change event dropped (${verdict.reason})\n`
      )
      return null
    }
    const value =
      valueJson === undefined ? undefined : (JSON.parse(valueJson) as unknown)
    switch (shape.op) {
      case 'set':
        return { kind: 'set', key: key as string, value }
      case 'delete':
        return { kind: 'delete', key: key as string }
      case 'replace': {
        // The freshly parsed object itself, not a spread of it: a copy made with `Object.assign`
        // semantics would turn an own `__proto__` key into a write to the prototype.
        const doc = value as Doc
        delete doc[RESERVED_KEY]
        return { kind: 'replace', value: doc }
      }
      default:
        return { kind: 'clear' }
    }
  }
}

const ACK_OPS: readonly string[] = ['applied', 'refused', 'flushed']

/**
 * Whether `value` has the shape of a `storeMirrorEvent` payload (the channel's schema already ran).
 * An answer to one of this process's frames names its `originSeq`; a `changed` event may carry a
 * `key` and a `valueJson` instead (strings only) and has no `originSeq`.
 */
export function isStoreMirrorEvent(value: unknown): value is StoreMirrorEvent {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  if (typeof e.store !== 'string' || typeof e.rev !== 'number') return false
  if (typeof e.op !== 'string') return false
  if (e.op === 'changed') {
    return (
      (e.key === undefined || typeof e.key === 'string') &&
      (e.valueJson === undefined || typeof e.valueJson === 'string')
    )
  }
  return ACK_OPS.includes(e.op) && typeof e.originSeq === 'number'
}

export interface MirrorRegistryDeps {
  sink: StoreFrameSink
  boot: StoreBootEnv
}

/** One per `StoreRoot`: the cells of a boot, one per resolved file path (S1 rule 5). */
export class MirrorRegistry {
  private readonly cells = new Map<string, MirrorCell>()
  private readonly byStoreKey = new Map<string, MirrorCell>()
  private seq = 0

  constructor(private readonly deps: MirrorRegistryDeps) {}

  /** The cell for `path`, created on first use and shared by every store name over the file. */
  cellFor(options: {
    path: string
    storeKey: string
    dotPaths: boolean
  }): MirrorCell {
    const existing = this.cells.get(options.path)
    if (existing) return existing
    const cell = new MirrorCell({
      ...options,
      readOnly: this.deps.boot.readOnly.has(options.storeKey),
      startEmpty: this.deps.boot.startEmpty.has(options.storeKey),
      sink: this.deps.sink,
      nextSeq: () => ++this.seq
    })
    this.cells.set(options.path, cell)
    this.byStoreKey.set(options.storeKey, cell)
    return cell
  }

  /** The cell for `path` when one exists; never creates one. */
  peek(path: string): MirrorCell | undefined {
    return this.cells.get(path)
  }

  /**
   * Forgets the cell for `path` (its file was deleted: a reset or an uninstall), so the next read
   * goes to disk and the next write starts a new cell over whatever the file is then. An answer
   * still owed to the dropped cell routes nowhere. `true` when a cell was dropped.
   */
  drop(path: string): boolean {
    const cell = this.cells.get(path)
    if (cell === undefined) return false
    this.cells.delete(path)
    if (this.byStoreKey.get(cell.storeKey) === cell) {
      this.byStoreKey.delete(cell.storeKey)
    }
    return true
  }

  /** Routes a shell event to the cell of its store. `false` when no cell exists for that store. */
  applyEvent(event: StoreMirrorEvent): boolean {
    const cell = this.byStoreKey.get(event.store)
    if (!cell) return false
    cell.applyEvent(event)
    return true
  }

  /**
   * Quit durability: resolves once the shell has applied every frame this boot sent, or after
   * `timeoutMs`, whichever is first. It never rejects, so a missing or slow peer cannot hold the
   * exit: the cases that would reject (a deadline, a refused flush) cost one stderr line.
   *
   * The shell applies frames in one FIFO, so the barrier for the whole sink is a single `flush`
   * frame behind them, sent through a cell that still has something unanswered (that store is one
   * the shell owns, which a flush must name). No pending write anywhere means nothing to wait for.
   * The deadline timer is `unref()`ed, so it never keeps the sidecar open.
   */
  async flushStores(timeoutMs: number): Promise<void> {
    const waiting = [...this.cells.values()].find(
      (cell) => cell.pendingCount > 0
    )
    if (waiting === undefined) return
    try {
      await waiting.flush(timeoutMs)
    } catch (error) {
      process.stderr.write(
        `[mirrorCell] store flush at quit did not complete: ${error instanceof Error ? error.message : 'unknown'}\n`
      )
    }
  }
}
