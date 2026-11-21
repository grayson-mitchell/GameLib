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
 * Pure: no logger and no IPC. The output stream is injected (`createStdoutStoreFrameSink`).
 */
import { STORE_FRAME_KIND } from 'common/types/sidecarTransport'
import { isStoreKey } from './storeOwnership'

export type StoreFrameOp = 'set' | 'delete' | 'clear' | 'replace' | 'flush'

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

export type StoreFrameRejectReason =
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
 * argument is `unknown` because a vector is arbitrary JSON. `lineBytes` is the length of the
 * serialised line when the caller already has it.
 */
export function validateStoreFrame(
  value: unknown,
  lineBytes?: number
): StoreFrameVerdict {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return refuse('shape')
  }
  const frame = value as Record<string, unknown>
  const size = lineBytes ?? JSON.stringify(frame).length
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
