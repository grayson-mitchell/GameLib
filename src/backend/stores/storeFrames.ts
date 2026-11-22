/**
 * The sidecar's store write frames (Phase 85, FND-06): what a mirror of a Rust-owned store sends,
 * how it is validated and where it goes.
 *
 * One frame is one write: `{kind:"store", seq, store, op, key?, valueJson?}` on a single stdout
 * line. The shell's single in-order reader hands each one to one worker that applies them in
 * arrival order (`src-tauri/src/store_dispatch.rs`), which is why a store write never travels as
 * a `rustInvoke` (those run one worker per call with no order, Pitfall 7). `valueJson` is the
 * value as JSON TEXT, so the shell's ordered parser sees the same key order this process holds.
 *
 * `validateStoreFrame` is the TS half of the shared contract in
 * `src/common/__fixtures__/storeFrameVectors.json`: it returns the same nine reason categories as
 * the shell's `parse_store_frame`, checked in the same order, so a frame one side accepts the other
 * does. It never carries a key or a value in its result.
 *
 * The store keys a frame may name come from the store table (`storeTable.json`, the same file the
 * shell reads): `isStoreKey` is the TS half of the shell's key check, and `isRustOwnedStoreKey`
 * says which keys the shell writes. Since 85-21 (D-03) there is no rollback flag and no ownership
 * file: every row the shell opens is Rust's (`native` rows and every family the phase moved), and
 * only an `excluded` row (`store/migrations`, D-07) is opened by neither side. A runtime
 * `store_cache/<name>` key the table does not list is a cache-family store (the stores `storeNew`
 * builds), Rust's only when `RECOGNIZED_CACHE_STORE_NAMES` names it (85-12, T-85-30): the shell
 * refuses every other runtime name `not-owned` and creates no file.
 *
 * Pure: no logger and no IPC. The output stream is injected (`createStdoutStoreFrameSink`).
 */
import tableFile from 'common/types/ipc/storeTable.json'
import { STORE_FRAME_KIND } from 'common/types/sidecarTransport'
import {
  CACHE_STORE_NAME_PATTERN,
  RECOGNIZED_CACHE_STORE_NAMES
} from 'common/types/storePolicy'

interface TableRowShape {
  key: string
  dir: string
  name: string | null
  family: string
  dotPaths: boolean
  tsNames?: readonly string[]
}

const ROWS: readonly TableRowShape[] = tableFile.rows
const rowByKey = (key: string): TableRowShape | undefined =>
  ROWS.find((row) => row.key === key)
const GAMES_CONFIG_PREFIX = 'GamesConfig/'
const CACHE_PREFIX = 'store_cache/'

/** A cache store the table does not list: `store_cache/<plain name>`. */
const RUNTIME_CACHE_ROW: Omit<TableRowShape, 'key' | 'name'> = {
  dir: 'store_cache',
  family: 'cache',
  dotPaths: true
}

/** What `GamesConfig/<app>` names: one plain file name, never a path. */
function isPlainAppName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    name !== '.' &&
    name !== '..' &&
    !/[/\\\0]/.test(name) &&
    !name.includes('..')
  )
}

/**
 * The table row a store key names. A listed row with a file name, the `settings/global` document,
 * `GamesConfig/<app>` (the `settings/game` pattern row) and a runtime `store_cache/<name>` resolve;
 * anything else (an unknown directory, a path escape, the pattern row's own key) is `undefined`.
 */
function rowForStoreKey(storeKey: string): TableRowShape | undefined {
  if (storeKey.startsWith(GAMES_CONFIG_PREFIX)) {
    const app = storeKey.slice(GAMES_CONFIG_PREFIX.length)
    const pattern = rowByKey('settings/game')
    return pattern && isPlainAppName(app) ? pattern : undefined
  }
  const row = rowByKey(storeKey)
  if (row) return row.name === null ? undefined : row
  if (storeKey.startsWith(CACHE_PREFIX)) {
    const name = storeKey.slice(CACHE_PREFIX.length)
    return CACHE_STORE_NAME_PATTERN.test(name)
      ? { ...RUNTIME_CACHE_ROW, key: storeKey, name }
      : undefined
  }
  return undefined
}

/** Whether a store key is one the shell would accept in a `store` frame. */
export function isStoreKey(storeKey: string): boolean {
  return rowForStoreKey(storeKey) !== undefined
}

/** Whether a store's keys are dot paths (every row but `store/uploadedLogs`). */
export function dotPathsFor(storeKey: string): boolean {
  return rowForStoreKey(storeKey)?.dotPaths ?? true
}

/**
 * Whether a TS mirror may be built over `storeKey`: every resolvable key but the `excluded` row
 * (`store/migrations`, D-07). A runtime cache outside the recognised list resolves too: production
 * builds none (createStores builds table caches only and the shell refuses an unrecognised
 * `storeNew`), and if one were built the shell would refuse its frames `not-owned`.
 */
export function isMirrorStoreKey(storeKey: string): boolean {
  const row = rowForStoreKey(storeKey)
  return row !== undefined && row.family !== 'excluded'
}

/**
 * Whether the shell owns the file behind `storeKey`: every resolvable row but an `excluded` one,
 * and a runtime cache only when `recognizedRuntimeCaches` names it (a seam for tests).
 */
export function isRustOwnedStoreKey(
  storeKey: string,
  recognizedRuntimeCaches: readonly string[] = RECOGNIZED_CACHE_STORE_NAMES
): boolean {
  const row = rowForStoreKey(storeKey)
  if (row === undefined || row.family === 'excluded') return false
  return (
    !storeKey.startsWith(CACHE_PREFIX) ||
    rowByKey(storeKey) !== undefined ||
    recognizedRuntimeCaches.includes(storeKey.slice(CACHE_PREFIX.length))
  )
}

/**
 * Whether the shell owns the file a TS store NAME writes (85-17): a typed store's name or a cache
 * store's file name, resolved through the table's `tsNames`, else as a runtime `store_cache/<name>`.
 * The shell announces every change of such a store to the renderer itself (one push source per
 * store), so the sidecar must not push it too.
 */
export function isRustOwnedStoreName(storeName: string): boolean {
  const row = ROWS.find((r) => r.tsNames?.includes(storeName) === true)
  return isRustOwnedStoreKey(row?.key ?? `${CACHE_PREFIX}${storeName}`)
}

type StoreFrameOp = 'set' | 'delete' | 'clear' | 'replace' | 'flush'

export interface StoreFrame {
  kind: typeof STORE_FRAME_KIND
  /** Per-boot, 1-based, increasing; echoed back as the event's `originSeq`. */
  seq: number
  /** The store table key (`store_cache/wikigameinfo`). */
  store: string
  op: StoreFrameOp
  key?: string
  valueJson?: string
}

export interface StoreFrameSink {
  /** Queues one frame. Never throws and never waits: the frame is on its way or held for the output. */
  send(frame: StoreFrame): void
}

/** The shell rejects a frame whose line is longer than this (`MAX_FRAME_BYTES` in store_dispatch.rs). */
export const STORE_FRAME_MAX_BYTES = 10 * 1024 * 1024

type StoreFrameRejectReason =
  | 'unknown-field'
  | 'shape'
  | 'seq'
  | 'op'
  | 'store-key'
  | 'key-path'
  | 'reserved-key'
  | 'value-json'
  | 'too-large'

export type StoreFrameVerdict =
  | { ok: true }
  | { ok: false; reason: StoreFrameRejectReason }

const OPS: readonly string[] = ['set', 'delete', 'clear', 'replace', 'flush']
const FIELDS: readonly string[] = [
  'kind',
  'seq',
  'store',
  'op',
  'key',
  'valueJson'
]
const DISALLOWED_SEGMENTS: readonly string[] = [
  '__proto__',
  'prototype',
  'constructor'
]
const RESERVED_KEY = '__internal__'

const refuse = (reason: StoreFrameRejectReason): StoreFrameVerdict => ({
  ok: false,
  reason
})

/**
 * Whether `value` is a frame the shell accepts, as one of the nine categories when it is not. The
 * argument is `unknown` because a vector is arbitrary JSON. `lineBytes` is the length in UTF-8
 * bytes of the serialised line when the caller already has it; the shell counts bytes, so counting
 * UTF-16 units would let a frame of non-ASCII text through that the shell then refuses `too-large`.
 */
export function validateStoreFrame(
  value: unknown,
  lineBytes?: number
): StoreFrameVerdict {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return refuse('shape')
  }
  const frame = value as Record<string, unknown>
  const size = lineBytes ?? Buffer.byteLength(JSON.stringify(frame), 'utf8')
  if (size > STORE_FRAME_MAX_BYTES) return refuse('too-large')
  if (frame.kind !== STORE_FRAME_KIND) return refuse('shape')
  if (Object.keys(frame).some((field) => !FIELDS.includes(field))) {
    return refuse('unknown-field')
  }
  const { seq, store, op, key, valueJson } = frame
  if (seq === undefined || typeof seq !== 'number') return refuse('shape')
  if (!Number.isSafeInteger(seq) || seq < 1) return refuse('seq')
  if (typeof store !== 'string' || typeof op !== 'string')
    return refuse('shape')
  if (!OPS.includes(op)) return refuse('op')
  if (!isStoreKey(store)) return refuse('store-key')

  const needsKey = op === 'set' || op === 'delete'
  const needsValue = op === 'set' || op === 'replace'
  if (needsKey !== (key !== undefined)) return refuse('shape')
  if (needsValue !== (valueJson !== undefined)) return refuse('shape')
  if (key !== undefined && typeof key !== 'string') return refuse('shape')
  if (valueJson !== undefined && typeof valueJson !== 'string') {
    return refuse('shape')
  }

  if (typeof key === 'string') {
    const segments = key.split('.')
    if (segments[0] === RESERVED_KEY) return refuse('reserved-key')
    if (
      segments.some(
        (segment) => segment === '' || DISALLOWED_SEGMENTS.includes(segment)
      )
    ) {
      return refuse('key-path')
    }
  }
  if (typeof valueJson === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(valueJson)
    } catch {
      return refuse('value-json')
    }
    if (
      op === 'replace' &&
      (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    ) {
      return refuse('value-json')
    }
  }
  return { ok: true }
}

/**
 * The sink the sidecar's stdout transport hands out. `writeLine` takes one serialised frame (no
 * newline) and owns the newline, the buffering until the output stream is attached and the
 * stream's own backpressure (`sidecarRpc`'s writer holds lines in order until `start()` attaches
 * the output). Frames are written in call order, one line each.
 */
export function createStdoutStoreFrameSink(
  writeLine: (line: string) => void
): StoreFrameSink {
  return {
    send(frame) {
      writeLine(JSON.stringify(frame))
    }
  }
}
