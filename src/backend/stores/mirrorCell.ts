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
 *   8. `rev` only ever rises: `baseRev` is the highest rev seen. The shell counts a store's
 *      changes from its own open, and this plan has one writer per store (this cell), so a late
 *      cell needs no rev handshake yet; the renderer-native writes of 85-17 add one.
 *
 * A write refused by this cell itself (a read-only store, the reserved `__internal__` namespace, a
 * frame the shell would reject) changes nothing and sends nothing, as the conf store did.
 *
 * Values cross as JSON text. `JSON.stringify(value)` is the frame's `valueJson` and the same text
 * is parsed back for the pending op, so what the view holds is exactly what the disk will hold.
 *
 * Sidecar exit contract: the only timer is `flush`'s deadline, and it is `unref()`ed.
 * Pure otherwise: no logger (stderr lines name the store key and a reason word, never a value).
 */
import { readFileSync } from 'fs'
import { STORE_FRAME_KIND } from 'common/types/sidecarTransport'
import {
  validateStoreFrame,
  type StoreFrame,
  type StoreFrameSink
} from './storeFrames'
import type { StoreBootEnv } from './storeOwnership'

const RESERVED_KEY = '__internal__'
const DISALLOWED_SEGMENTS: readonly string[] = [
  '__proto__',
  'prototype',
  'constructor'
]

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

export type StoreMirrorEventOp = 'applied' | 'refused' | 'flushed'

export interface StoreMirrorEvent {
  store: string
  rev: number
  op: StoreMirrorEventOp
  originSeq: number
  reason?: 'read-only' | 'evicted' | 'rejected' | 'io' | 'not-owned'
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

const own = (o: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, key)

const isContainer = (v: unknown): v is Doc | unknown[] =>
  typeof v === 'object' && v !== null

/** A value copied so nothing the cell holds is shared with a caller (JSON values only). */
function cloneJson<V>(value: V): V {
  return isContainer(value) ? (structuredClone(value) as V) : value
}

// ---- dot paths -----------------------------------------------------------------------------
// The minimal subset 85-11 replaces with the vector-proven `dotPath.ts` (dot-prop 6). Same
// behaviour as `gamelib-store`'s `dotpath.rs`: `\.` escapes a dot, a `__proto__`, `prototype` or
// `constructor` segment refuses the whole path, an array segment is a canonical decimal index.

function segmentsOf(path: string, dotPaths: boolean): string[] | null {
  if (!dotPaths) return [path]
  const pieces = path.split('.')
  const parts: string[] = []
  for (let i = 0; i < pieces.length; i++) {
    let part = pieces[i] as string
    while (part.endsWith('\\') && i + 1 < pieces.length) {
      part = `${part.slice(0, -1)}.${pieces[++i] as string}`
    }
    parts.push(part)
  }
  return parts.some((s) => DISALLOWED_SEGMENTS.includes(s)) ? null : parts
}

function arrayIndex(segment: string): number | null {
  if (!/^(0|[1-9][0-9]{0,9})$/.test(segment)) return null
  const n = Number(segment)
  return n <= 0xffffffff ? n : null
}

function childOf(node: unknown, segment: string): unknown {
  if (Array.isArray(node)) {
    const i = arrayIndex(segment)
    return i === null ? undefined : node[i]
  }
  if (isContainer(node) && own(node, segment)) return (node as Doc)[segment]
  return undefined
}

function getPath(root: Doc, path: string, dotPaths: boolean): unknown {
  const segments = segmentsOf(path, dotPaths)
  if (segments === null) return undefined
  let cur: unknown = root
  for (const segment of segments) {
    cur = childOf(cur, segment)
    if (cur === undefined) return undefined
  }
  return cur
}

function setPath(
  root: Doc,
  path: string,
  value: unknown,
  dotPaths: boolean
): void {
  const segments = segmentsOf(path, dotPaths)
  if (segments === null || segments.length === 0) return
  let cur: Doc | unknown[] = root
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as string
    const last = i === segments.length - 1
    if (Array.isArray(cur)) {
      const index = arrayIndex(segment)
      if (index === null) return
      while (cur.length <= index) cur.push(null)
      if (last) {
        cur[index] = value
        return
      }
      if (!isContainer(cur[index])) cur[index] = {}
      cur = cur[index] as Doc | unknown[]
    } else {
      if (last) {
        cur[segment] = value
        return
      }
      if (!isContainer(cur[segment])) cur[segment] = {}
      cur = cur[segment] as Doc | unknown[]
    }
  }
}

function deletePath(root: Doc, path: string, dotPaths: boolean): void {
  const segments = segmentsOf(path, dotPaths)
  if (segments === null || segments.length === 0) return
  const leaf = segments[segments.length - 1] as string
  let cur: unknown = root
  for (const segment of segments.slice(0, -1)) {
    cur = childOf(cur, segment)
    if (!isContainer(cur)) return
  }
  if (Array.isArray(cur)) {
    const index = arrayIndex(leaf)
    if (index !== null && index < cur.length) cur[index] = null
  } else if (isContainer(cur)) {
    delete (cur as Doc)[leaf]
  }
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
    case 'replace':
      emptyDoc(doc)
      Object.assign(doc, cloneJson(op.value))
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
  /** `base` with `pending` folded over it; only held while something is pending. */
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

  /** The highest `rev` the shell has told this cell about. */
  get baseRev(): number {
    return this.baseRevValue
  }

  /** How many writes are sent and not yet answered. */
  get pendingCount(): number {
    return this.pending.length
  }

  private get view(): Doc {
    return this.viewDoc ?? this.base
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
    if (this.viewDoc === null) this.viewDoc = cloneJson(this.base)
    applyOp(this.viewDoc, op, this.dotPaths)
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

  // ---- the shell's answers ---------------------------------------------------------------

  applyEvent(event: StoreMirrorEvent): void {
    const waiter = this.flushWaiters.get(event.originSeq)
    if (waiter) {
      this.flushWaiters.delete(event.originSeq)
      clearTimeout(waiter.timer)
      if (event.op === 'flushed') waiter.resolve()
      else {
        waiter.reject(
          new Error(`store flush refused: ${event.reason ?? 'unknown'}`)
        )
      }
      return
    }
    const index = this.pending.findIndex((p) => p.seq === event.originSeq)
    if (index === -1) return
    const [settled] = this.pending.splice(index, 1) as [PendingOp]
    if (event.op === 'applied') {
      applyOp(this.base, settled.op, this.dotPaths)
      this.baseRevValue = Math.max(this.baseRevValue, event.rev)
      if (this.pending.length === 0) this.viewDoc = null
      return
    }
    // refused: the view reverts to base plus what is still pending.
    process.stderr.write(
      `[mirrorCell] ${this.storeKey}: store write refused by the shell (${event.reason ?? 'unknown'})\n`
    )
    if (this.pending.length === 0) {
      this.viewDoc = null
      return
    }
    const rebuilt = cloneJson(this.base)
    for (const { op } of this.pending) applyOp(rebuilt, op, this.dotPaths)
    this.viewDoc = rebuilt
  }
}

const EVENT_OPS: readonly string[] = ['applied', 'refused', 'flushed']

/** Whether `value` has the shape of a `storeMirrorEvent` payload (the channel's schema already ran). */
export function isStoreMirrorEvent(value: unknown): value is StoreMirrorEvent {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.store === 'string' &&
    typeof e.rev === 'number' &&
    typeof e.originSeq === 'number' &&
    typeof e.op === 'string' &&
    EVENT_OPS.includes(e.op)
  )
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

  /** Routes a shell event to the cell of its store. `false` when no cell exists for that store. */
  applyEvent(event: StoreMirrorEvent): boolean {
    const cell = this.byStoreKey.get(event.store)
    if (!cell) return false
    cell.applyEvent(event)
    return true
  }
}
