import { LOG_FRAME_KIND } from 'common/types/sidecarTransport'
import { LogPrefix } from './constants'
import { stringifyLogValue } from './stringifyLogValue'

import type {
  GameLogType,
  LogFrame,
  LogFrameBatch,
  LogFrameEntry,
  LogFrameTarget
} from 'common/types/sidecarTransport'
import type { LogLevel } from './constants'

/*
 * The sidecar's log forwarder (Phase 84, FND-05, D-05 / D-06 / D-10 / D-12).
 *
 * Every log call in the sidecar lands in one process-wide queue here. A frame (`kind:"log"`) is cut
 * from the queue and written to the sidecar's stdout, where the Rust shell's reader validates it
 * and hands it to the native writer. The forwarder is fire-and-forget: it never blocks and never
 * throws into its caller (~1,800 call sites), it holds a bounded queue (drop the OLDEST past the
 * caps, then report the count), and it honours backpressure (a false write pauses sending until the
 * stream drains).
 *
 * Constants (calibrated by `__tests__/forwarderCalibration.test.ts`, which replaces research
 * assumption A2; the test prints this table and 84-03-SUMMARY.md records it). Measured with the
 * defaults below (tick 50 ms, frame 32 KiB, 4,000 entries / 8 MiB), simulated for 5 s, every chunk
 * sent to both a game and a runner target as `commandRunner.ts` does, through a modelled pipe
 * (16 KiB high-water mark, reader at 32 MiB/s):
 *
 *   profile        input (both targets)      frames/s avg (max)  max queued          dropped
 *   burst          2 x 64 KiB at 8 MiB/s     256 (257)           1 entry, 0.06 MiB   0
 *   chatter        2 x 20,000 x 100 B per s  227 (228)           179 entries, 0.03   0
 *   stalled (2 s)  burst, reader stops 2 s   179 (382)           127 entries, 7.95   386, all reported
 *
 * No profile that keeps draining drops a line or comes near either cap, so the first-guess values
 * (50 ms, 32 KiB, 4,000, 8 MiB) stand. The 8 MiB byte cap binds first under a stalled reader
 * (127 x 64 KiB chunks), which is the intended bound on sidecar memory.
 *
 * The queue holds raw chunks as separate entries (never concatenated), so replaying a profile's
 * frames through the per-chunk newline rule reproduces the input bytes exactly.
 */

/** Past this many queued entries the OLDEST is dropped (D-10). */
export const LOG_QUEUE_MAX_ENTRIES = 4000
/** Past this many queued bytes (UTF-16 length plus a fixed per-entry overhead) the OLDEST is dropped. */
export const LOG_QUEUE_MAX_BYTES = 8 * 1024 * 1024
/** A frame is cut at least this often while anything is queued (D-06). */
export const LOG_BATCH_TICK_MS = 50
/** A frame is cut as soon as this many bytes are queued, whichever comes first (D-06). */
export const LOG_BATCH_MAX_BYTES = 32 * 1024
/**
 * The longest single entry, in UTF-16 code units. It is the shell's own cap (the shell rejects a
 * whole frame over it), so a clipped entry's marker is INSIDE the cap, never past it.
 */
export const LOG_ENTRY_MAX_UTF16 = 1024 * 1024
/** How long a settle (`flush`) waits for the stream's write callback at most. */
export const LOG_FLUSH_TIMEOUT_MS = 2000

/**
 * The runners the shell's path resolver accepts (`gamelib-core` `LogRunner::from_str`; a test pins
 * the pair). A game target additionally refuses `comet`, as the shell's `target_of` does.
 */
export const LOG_TARGET_RUNNERS: readonly string[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'steam',
  'comet'
]
/** The game log types the shell accepts (`gamelib-core` `GameLogType::from_str`; a test pins the pair). */
export const LOG_GAME_TYPES: readonly GameLogType[] = [
  'launch',
  'install',
  'import',
  'repair',
  'update',
  'setup'
]
/** What the Rust path resolver accepts for an appName (`gamelib-core` `validate_app_name`). */
const APP_NAME_MAX_BYTES = 255

/** Units kept free under the cap for the `…[truncated N bytes]` marker (the marker is under 40). */
const TRUNCATION_RESERVE = 64
/** Added to every entry's size so a flood of tiny entries still counts against the byte cap. */
const ENTRY_OVERHEAD_BYTES = 96

/**
 * The stream a forwarder writes frames to. `send` returns false when the caller must stop sending
 * until `onReady` fires: either the stream is backed up (the frame WAS accepted) or no output is
 * attached yet (the frame is held by the transport). It throws only when the frame was NOT taken.
 * `onWritten` runs once the stream has taken the bytes.
 */
export interface LogTransport {
  send(frame: LogFrame, onWritten: () => void): boolean
  /** Runs `listener` once, when the transport can accept more (a drain, or an output being attached). */
  onReady(listener: () => void): void
}

export interface LogForwarderCaps {
  maxEntries?: number
  maxBytes?: number
  batchTickMs?: number
  batchMaxBytes?: number
  flushTimeoutMs?: number
}

export interface LogForwarderStats {
  queuedEntries: number
  queuedBytes: number
  maxQueuedEntries: number
  maxQueuedBytes: number
  /** Entries dropped and not yet reported by a `lines dropped` line. */
  pendingDropped: number
  droppedTotal: number
  /** Entries never queued because their target is one the shell would reject (WR-01). */
  refusedTotal: number
  framesSent: number
  bound: boolean
}

interface QueuedEntry {
  target: LogFrameTarget
  key: string
  rotate: boolean
  entry: LogFrameEntry
  bytes: number
}

function isValidAppName(appName: string): boolean {
  if (appName.length === 0) return false
  // serde_json refuses a lone surrogate, which would cost the shell the whole frame.
  if (!appName.isWellFormed()) return false
  if (Buffer.byteLength(appName, 'utf8') > APP_NAME_MAX_BYTES) return false
  if (appName.includes('\0')) return false
  if (appName.includes('/') || appName.includes('\\')) return false
  if (appName.includes('..')) return false
  return true
}

/**
 * Why the shell would reject a frame carrying this target, or null when it accepts it (WR-01). The
 * one predicate the forwarder (never queue such an entry) and the per-target facade (refuse at
 * construction) share, so a target is judged the same way in both places.
 */
export function logTargetRefusal(target: LogFrameTarget): string | null {
  switch (target.kind) {
    case 'general':
    case 'gogRedist':
      return null
    case 'runner':
      return LOG_TARGET_RUNNERS.includes(target.runner)
        ? null
        : 'invalid runner'
    case 'game':
      if (
        !LOG_TARGET_RUNNERS.includes(target.runner) ||
        target.runner === 'comet'
      )
        return 'invalid runner'
      if (!LOG_GAME_TYPES.includes(target.type)) return 'invalid type'
      return isValidAppName(target.appName) ? null : 'invalid appName'
    default:
      return 'invalid kind'
  }
}

function targetKey(target: LogFrameTarget): string {
  switch (target.kind) {
    case 'general':
    case 'gogRedist':
      return target.kind
    case 'runner':
      return `runner:${target.runner}`
    case 'game':
      return `game:${target.appName}:${target.runner}:${target.type}`
  }
}

function textOf(entry: LogFrameEntry): string {
  return 'raw' in entry ? entry.raw : entry.line.msg
}

/** Cuts text over the cap to a prefix plus a marker, never splitting a surrogate pair. */
function clipText(text: string): string {
  if (text.length <= LOG_ENTRY_MAX_UTF16) return text
  let keep = LOG_ENTRY_MAX_UTF16 - TRUNCATION_RESERVE
  const last = text.charCodeAt(keep - 1)
  if (last >= 0xd800 && last <= 0xdbff) keep -= 1
  return `${text.slice(0, keep)}…[truncated ${text.length - keep} bytes]`
}

function clipEntry(entry: LogFrameEntry): LogFrameEntry {
  if (textOf(entry).length <= LOG_ENTRY_MAX_UTF16) return entry
  if ('raw' in entry) return { raw: clipText(entry.raw) }
  return { line: { ...entry.line, msg: clipText(entry.line.msg) } }
}

function wellFormed(text: string): string {
  return text.isWellFormed() ? text : text.toWellFormed()
}

/**
 * Makes one entry acceptable to the shell (WR-01): a lone surrogate (which serde_json refuses,
 * costing the shell the whole frame) becomes U+FFFD, and a line prefix outside the closed
 * `LogPrefix` set becomes `Backend`. Returns the same object when nothing needs changing.
 */
function sanitiseEntry(entry: LogFrameEntry): LogFrameEntry {
  if ('raw' in entry) {
    const raw = wellFormed(entry.raw)
    return raw === entry.raw ? entry : { raw }
  }
  const { msg, prefix } = entry.line
  const cleanMsg = wellFormed(msg)
  const cleanPrefix = Object.values(LogPrefix).includes(prefix)
    ? prefix
    : LogPrefix.Backend
  if (cleanMsg === msg && cleanPrefix === prefix) return entry
  return { line: { ...entry.line, msg: cleanMsg, prefix: cleanPrefix } }
}

function entryBytes(entry: LogFrameEntry): number {
  return textOf(entry).length + ENTRY_OVERHEAD_BYTES
}

export class LogForwarder {
  readonly #maxEntries: number
  readonly #maxBytes: number
  readonly #tickMs: number
  readonly #batchMaxBytes: number
  readonly #flushTimeoutMs: number

  /** A simple array with a head index: dropping the oldest is O(1), compacted lazily. */
  #queue: QueuedEntry[] = []
  #head = 0
  #queuedBytes = 0
  /** Entries dropped since the last `lines dropped` line was sent. */
  #dropped = 0
  #droppedTotal = 0
  #refusedTotal = 0
  #maxQueuedEntries = 0
  #maxQueuedBytes = 0
  #framesSent = 0

  #transport: LogTransport | null = null
  /** True after a false return (or a throw) until the transport reports ready. */
  #blocked = false
  #awaitingReady = false
  #pumping = false
  #inFlight = 0
  #timer: ReturnType<typeof setTimeout> | null = null

  /** Per writer key: the tail of the chain of Promise-valued messages not yet enqueued. */
  readonly #chains = new Map<string, Promise<void>>()
  /**
   * Links a target writer holds on its own chain (a Promise-valued message and the writes queued
   * behind it, WR-09): `flush` waits on these exactly as it does on `#chains`. A link leaves the set
   * when it settles, so the set holds only work in flight.
   */
  readonly #writerLinks = new Set<Promise<unknown>>()
  /**
   * Targets whose rotation was claimed by an entry that never reached a frame (evicted, or its
   * Promise message rejected): the next entry enqueued for the target carries the rotation instead.
   * Instance state, not module state (moduleStateCensus).
   */
  readonly #owedRotations = new Set<string>()
  /** The (target kind, reason) pairs already reported as refused (IN-05): bounded, a few pairs. */
  readonly #refusalsReported = new Set<string>()
  #waiters: (() => void)[] = []

  constructor(caps: LogForwarderCaps = {}) {
    this.#maxEntries = caps.maxEntries ?? LOG_QUEUE_MAX_ENTRIES
    this.#maxBytes = caps.maxBytes ?? LOG_QUEUE_MAX_BYTES
    this.#tickMs = caps.batchTickMs ?? LOG_BATCH_TICK_MS
    this.#batchMaxBytes = caps.batchMaxBytes ?? LOG_BATCH_MAX_BYTES
    this.#flushTimeoutMs = caps.flushTimeoutMs ?? LOG_FLUSH_TIMEOUT_MS
  }

  /** Binds the stream frames are written to, and sends what queued up before it existed. */
  bind(transport: LogTransport): void {
    this.#transport = transport
    this.#blocked = false
    this.#awaitingReady = false
    this.#pump()
  }

  /**
   * Formats nothing: stamps the call-time clock (D-12), converts the value to text and queues one
   * line. A Promise-valued message holds the later lines of the same writer until it settles, so
   * one writer's lines keep their call order. Never throws and never waits. `at` is the call-time
   * clock when the caller took it earlier than this call (a target writer queues a line behind a
   * Promise message and reaches here later, WR-10); it defaults to now.
   */
  logLine(
    target: LogFrameTarget,
    rotate: boolean,
    level: LogLevel,
    prefix: string,
    message: unknown,
    at?: number
  ): void {
    try {
      const ts = at ?? Date.now()
      const tz = -new Date(ts).getTimezoneOffset()
      const emit = (msg: string): void => {
        // Prefixes alone make no line (the old formatter's empty-body rule). A rotation the call
        // claimed is not spent on that nothing: the next entry for the target carries it (IN-06).
        if (msg.length === 0) {
          if (rotate) this.oweRotation(target)
          return
        }
        this.enqueue(target, rotate, { line: { ts, tz, level, prefix, msg } })
      }
      const body = stringifyLogValue(message)
      const key = targetKey(target)
      const tail = this.#chains.get(key)
      if (typeof body === 'string' && tail === undefined) {
        emit(body)
        return
      }
      if (typeof body !== 'string') body.catch(() => undefined)
      const link = (tail ?? Promise.resolve())
        .then(() => body)
        .then(emit, () => {
          // The line never reaches a frame: its rotation is not spent (WR-05).
          if (rotate) this.oweRotation(target)
        })
      this.#chains.set(key, link)
      void link.then(() => {
        if (this.#chains.get(key) === link) this.#chains.delete(key)
      })
    } catch {
      // A log call never throws into its caller.
    }
  }

  /**
   * Registers a pending link of a target writer's own chain, so `flush` waits for it (bounded, like
   * the forwarder's own chains). Never throws. A link that rejects counts as settled: it is dropped
   * from the set, and `flush` goes on waiting for the other links and the transport (WR-11).
   */
  trackSettle(link: Promise<unknown>): void {
    this.#writerLinks.add(link)
    const drop = (): void => {
      this.#writerLinks.delete(link)
    }
    link.then(drop, drop)
  }

  /**
   * Records that a rotation claimed for `target` did not reach a frame, so the next entry queued for
   * that target carries it (WR-05). A general target never rotates, so it owes nothing.
   */
  oweRotation(target: LogFrameTarget): void {
    if (target.kind === 'general' || logTargetRefusal(target) !== null) return
    this.#owedRotations.add(targetKey(target))
  }

  /** Queues one entry (a line with its own timestamp, or a raw chunk). Never throws. */
  enqueue(target: LogFrameTarget, rotate: boolean, entry: LogFrameEntry): void {
    try {
      const refusal = logTargetRefusal(target)
      if (refusal !== null) {
        // One bad target would cost the shell a whole frame of other writers' lines.
        this.#refusedTotal += 1
        this.#reportRefusal(target, refusal)
        return
      }
      const clipped = sanitiseEntry(clipEntry(entry))
      const bytes = entryBytes(clipped)
      const key = targetKey(target)
      this.#queue.push({
        target,
        key,
        // An owed rotation is spent here, on an entry that is queued.
        rotate: this.#owedRotations.delete(key) || rotate,
        entry: clipped,
        bytes
      })
      this.#queuedBytes += bytes
      this.#enforceCaps()
      const count = this.#queue.length - this.#head
      if (count > this.#maxQueuedEntries) this.#maxQueuedEntries = count
      if (this.#queuedBytes > this.#maxQueuedBytes) {
        this.#maxQueuedBytes = this.#queuedBytes
      }
      this.#schedule()
    } catch {
      // A log call never throws into its caller.
    }
  }

  /**
   * Says once per (target kind, reason) that entries are being refused (IN-05), so a direct caller
   * that builds a bad target does not lose its lines without a trace. Kind and reason only: the
   * target's own text (an appName, a runner) is never echoed.
   */
  #reportRefusal(target: LogFrameTarget, reason: string): void {
    const kind = (
      ['general', 'gogRedist', 'runner', 'game'] as string[]
    ).includes(target.kind)
      ? target.kind
      : 'unknown'
    const seen = `${kind}/${reason}`
    if (this.#refusalsReported.has(seen)) return
    this.#refusalsReported.add(seen)
    this.logLine(
      { kind: 'general' },
      false,
      'WARNING',
      'Backend',
      `log entry refused: ${reason} (${kind} target)`
    )
  }

  /**
   * Resolves once everything queued so far has been handed to the transport and its write callback
   * has run. It always waits for the Promise-valued messages in flight first (bounded): those held
   * in the forwarder's own chains and those a target writer holds on its own chain, with the writes
   * queued behind them (`trackSettle`, WR-09). So with no transport bound it returns after that
   * chain wait, without a transport wait, and not at once: a message that never settles holds it
   * for the whole timeout. The whole call, the wait on Promise-valued messages and the wait on the
   * transport together, takes at most `LOG_FLUSH_TIMEOUT_MS` (one deadline taken at entry, WR-06),
   * so a message that never settles cannot hold it longer, and the lines of other writers are
   * still handed to the transport. The deadline is on the monotonic clock (`performance.now()`), so
   * a wall-clock step back (NTP, a manual change, a VM resume) cannot stretch either wait (WR-12).
   * Never rejects. The fatal `uncaughtException` guard awaits this before exiting, so it must not
   * hang.
   */
  async flush(): Promise<void> {
    const deadline = performance.now() + this.#flushTimeoutMs
    try {
      await this.#settleChains(deadline)
      if (this.#transport === null) return
      this.#pump()
      if (this.#isIdle()) return
      // Whatever is left of the one (monotonic) deadline.
      const left = Math.max(0, deadline - performance.now())
      await new Promise<void>((resolve) => {
        const done = (): void => {
          clearTimeout(timer)
          this.#waiters = this.#waiters.filter((w) => w !== done)
          resolve()
        }
        const timer = setTimeout(done, left)
        timer.unref?.()
        this.#waiters.push(done)
      })
    } catch {
      // Settling never rejects.
    }
  }

  /**
   * Waits for the Promise-valued messages in flight, the forwarder's own and the target writers'
   * (WR-09), giving up at `deadline` (WR-06), a `performance.now()` reading (WR-12).
   */
  async #settleChains(deadline: number): Promise<void> {
    while (this.#chains.size > 0 || this.#writerLinks.size > 0) {
      const left = deadline - performance.now()
      if (left <= 0) return
      let timer: ReturnType<typeof setTimeout> | undefined
      const expired = new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), left)
        // convention 3 (the sidecar's exit contract): never hold the loop.
        timer.unref?.()
      })
      // allSettled, not all: a link that rejects must not end the wait for the other links or
      // skip the transport wait that follows (WR-11).
      const timedOut = await Promise.race([
        Promise.allSettled([
          ...this.#chains.values(),
          ...this.#writerLinks
        ]).then(() => false),
        expired
      ])
      clearTimeout(timer)
      if (timedOut) return
    }
  }

  stats(): LogForwarderStats {
    return {
      queuedEntries: this.#queue.length - this.#head,
      queuedBytes: this.#queuedBytes,
      maxQueuedEntries: this.#maxQueuedEntries,
      maxQueuedBytes: this.#maxQueuedBytes,
      pendingDropped: this.#dropped,
      droppedTotal: this.#droppedTotal,
      refusedTotal: this.#refusedTotal,
      framesSent: this.#framesSent,
      bound: this.#transport !== null
    }
  }

  #isIdle(): boolean {
    return (
      this.#queue.length === this.#head &&
      this.#dropped === 0 &&
      this.#inFlight === 0
    )
  }

  #checkWaiters(): void {
    if (this.#waiters.length === 0 || !this.#isIdle()) return
    for (const done of [...this.#waiters]) done()
  }

  /** Drops the oldest entries past either cap and counts them. */
  #enforceCaps(): void {
    while (
      this.#queue.length - this.#head > this.#maxEntries ||
      this.#queuedBytes > this.#maxBytes
    ) {
      const oldest = this.#queue[this.#head]
      if (oldest === undefined) break
      this.#head += 1
      this.#queuedBytes -= oldest.bytes
      this.#dropped += 1
      this.#droppedTotal += 1
      if (oldest.rotate) this.#passRotation(oldest)
    }
    this.#compact()
  }

  /** An evicted entry carried a rotation: hand it to the target's next queued entry, or owe it (WR-05). */
  #passRotation(evicted: QueuedEntry): void {
    for (let i = this.#head; i < this.#queue.length; i += 1) {
      const next = this.#queue[i]
      if (next !== undefined && next.key === evicted.key) {
        next.rotate = true
        return
      }
    }
    this.oweRotation(evicted.target)
  }

  #compact(): void {
    if (this.#head === this.#queue.length) {
      this.#queue = []
      this.#head = 0
    } else if (this.#head > 1024 && this.#head * 2 > this.#queue.length) {
      this.#queue = this.#queue.slice(this.#head)
      this.#head = 0
    }
  }

  /** Sends now when a full frame is queued, otherwise arms the (unref'd) tick. */
  #schedule(): void {
    if (this.#transport === null || this.#blocked) return
    if (this.#queuedBytes >= this.#batchMaxBytes) {
      this.#pump()
      return
    }
    this.#armTimer()
  }

  #armTimer(): void {
    if (this.#timer !== null) return
    const timer = setTimeout(() => {
      this.#timer = null
      this.#pump()
    }, this.#tickMs)
    // convention 3 (the sidecar's exit contract): never hold the loop. `?.` because jest's fake
    // timers need not implement unref. Lines still queued at stdin EOF are handed over by the
    // explicit flush in releaseOnStdinEof, not by this timer.
    timer.unref?.()
    this.#timer = timer
  }

  #clearTimer(): void {
    if (this.#timer === null) return
    clearTimeout(this.#timer)
    this.#timer = null
  }

  /** Sends frames until the queue is empty or the transport pushes back. */
  #pump(): void {
    const transport = this.#transport
    if (transport === null || this.#pumping) return
    this.#pumping = true
    try {
      this.#clearTimer()
      while (
        !this.#blocked &&
        (this.#queue.length > this.#head || this.#dropped > 0)
      ) {
        const built = this.#buildFrame()
        let accepted = false
        let taken = true
        this.#inFlight += 1
        try {
          accepted = transport.send(built.frame, () => this.#onWritten())
        } catch {
          taken = false
        }
        if (!taken) {
          // The frame was not taken: keep it queued and retry once the transport is ready.
          this.#inFlight -= 1
          this.#block(transport)
          break
        }
        this.#framesSent += 1
        this.#consume(built.count, built.reportedDrops)
        if (!accepted) {
          this.#block(transport)
          break
        }
      }
    } finally {
      this.#pumping = false
    }
    this.#checkWaiters()
  }

  #block(transport: LogTransport): void {
    this.#blocked = true
    if (this.#awaitingReady) return
    this.#awaitingReady = true
    try {
      transport.onReady(() => {
        this.#awaitingReady = false
        this.#blocked = false
        // A settle in flight wants the queue out now. Otherwise coalesce: a pipe that drains every
        // millisecond must not turn into one tiny frame per drain, so send on the tick or at the
        // size cut, like any other entry.
        if (this.#waiters.length > 0) this.#pump()
        else this.#schedule()
      })
    } catch {
      // No ready signal to wait for: retry on the tick rather than stay blocked forever.
      this.#awaitingReady = false
      this.#blocked = false
      this.#armTimer()
    }
  }

  #onWritten(): void {
    this.#inFlight = Math.max(0, this.#inFlight - 1)
    this.#checkWaiters()
  }

  /** The next frame: a `lines dropped` line when entries were lost, then queued entries to the size cut. */
  #buildFrame(): {
    frame: LogFrame
    count: number
    reportedDrops: number
  } {
    const batches: LogFrameBatch[] = []
    let lastKey = ''
    let bytes = 0
    const reportedDrops = this.#dropped
    if (reportedDrops > 0) {
      const ts = Date.now()
      const entry: LogFrameEntry = {
        line: {
          ts,
          tz: -new Date(ts).getTimezoneOffset(),
          level: 'WARNING',
          prefix: 'Backend',
          msg: `log forwarder: ${reportedDrops} lines dropped (queue full)`
        }
      }
      batches.push({
        target: { kind: 'general' },
        rotate: false,
        entries: [entry]
      })
      lastKey = 'general'
      bytes += entryBytes(entry)
    }
    let count = 0
    for (
      let i = this.#head;
      i < this.#queue.length && bytes < this.#batchMaxBytes;
      i += 1
    ) {
      const item = this.#queue[i]
      if (item === undefined) break
      const open = batches[batches.length - 1]
      if (open !== undefined && !item.rotate && item.key === lastKey) {
        open.entries.push(item.entry)
      } else {
        batches.push({
          target: item.target,
          rotate: item.rotate,
          entries: [item.entry]
        })
        lastKey = item.key
      }
      bytes += item.bytes
      count += 1
    }
    return {
      frame: { kind: LOG_FRAME_KIND, batch: batches },
      count,
      reportedDrops
    }
  }

  /** Removes what a taken frame carried. */
  #consume(count: number, reportedDrops: number): void {
    for (let i = 0; i < count; i += 1) {
      this.#queuedBytes -= this.#queue[this.#head + i]?.bytes ?? 0
    }
    this.#head += count
    this.#dropped -= reportedDrops
    this.#compact()
  }
}
