// Phase 84 plan 03: the batch and cap calibration (replaces research assumption A2).
//
// A synthetic Wine-like emitter drives a LogForwarder through a modelled pipe in simulated time
// (jest fake timers, 1 ms steps). Every chunk goes to BOTH a game and a runner target, as
// `commandRunner.ts` does (a chunk is sent twice). The pipe models a Node stream: it accepts a frame,
// answers `false` once more than the 16 KiB high-water mark is buffered and signals ready when the
// buffer empties; a reader drains it at a fixed rate. The measured table is printed and recorded in
// the comment block beside the constants in forwarder.ts and in 84-03-SUMMARY.md.

import { createHash } from 'crypto'

import {
  LOG_BATCH_MAX_BYTES,
  LOG_BATCH_TICK_MS,
  LOG_QUEUE_MAX_BYTES,
  LOG_QUEUE_MAX_ENTRIES,
  LogForwarder
} from '../forwarder'

import type {
  LogFrame,
  LogFrameEntry,
  LogFrameTarget
} from 'common/types/sidecarTransport'
import type { LogTransport } from '../forwarder'

const GAME: LogFrameTarget = {
  kind: 'game',
  appName: '480',
  runner: 'steam',
  type: 'launch'
}
const RUNNER: LogFrameTarget = { kind: 'runner', runner: 'steam' }
const MiB = 1024 * 1024
const HIGH_WATER_BYTES = 16 * 1024
const READER_BYTES_PER_MS = (32 * MiB) / 1000

/** The per-chunk newline rule of the writer: a chunk is written with a newline appended if missing. */
function normalise(chunk: string): string {
  return chunk.endsWith('\n') ? chunk : `${chunk}\n`
}

class SimPipe implements LogTransport {
  buffered = 0
  frames = 0
  bytesSent = 0
  stalled = false
  readonly framesPerSecond: number[] = []
  readonly #writes: { bytes: number; cb: () => void }[] = []
  #ready: (() => void)[] = []
  second = 0

  constructor(private readonly onFrame: (frame: LogFrame) => void) {}

  send(frame: LogFrame, onWritten: () => void): boolean {
    const bytes = Buffer.byteLength(JSON.stringify(frame)) + 1
    this.onFrame(frame)
    this.frames += 1
    this.bytesSent += bytes
    this.framesPerSecond[this.second] =
      (this.framesPerSecond[this.second] ?? 0) + 1
    this.buffered += bytes
    this.#writes.push({ bytes, cb: onWritten })
    return this.buffered < HIGH_WATER_BYTES
  }

  onReady(listener: () => void): void {
    this.#ready.push(listener)
  }

  /** The reader takes up to `budget` bytes; a signalled-ready listener runs when the buffer empties. */
  consume(budget: number): void {
    if (this.stalled) return
    let left = budget
    while (left > 0 && this.#writes.length > 0) {
      const write = this.#writes[0]
      if (!write) break
      const take = Math.min(left, write.bytes)
      write.bytes -= take
      this.buffered -= take
      left -= take
      if (write.bytes === 0) {
        this.#writes.shift()
        write.cb()
      }
    }
    if (this.buffered === 0 && this.#ready.length > 0) {
      for (const listener of this.#ready.splice(0)) listener()
    }
  }
}

interface Profile {
  name: string
  seconds: number
  chunkBytes: number
  /** Chunks per simulated millisecond (each goes to the game and the runner target). */
  chunksPerMs: number
  stall?: { fromMs: number; toMs: number }
}

interface Result {
  name: string
  framesPerSecondMax: number
  framesPerSecondAvg: number
  maxQueuedEntries: number
  maxQueuedBytes: number
  droppedTotal: number
  reportedDropped: number
  dropLines: number
  inputDigest: Record<string, string>
  outputDigest: Record<string, string>
  seqMonotonic: boolean
  mibPerSecondIn: number
}

function rawText(entry: LogFrameEntry): string | undefined {
  return 'raw' in entry ? entry.raw : undefined
}

function keyOf(target: LogFrameTarget): string {
  return target.kind === 'game' ? 'game' : 'runner'
}

function run(profile: Profile): Result {
  const fw = new LogForwarder()
  const inHash = { game: createHash('sha256'), runner: createHash('sha256') }
  const outHash = { game: createHash('sha256'), runner: createHash('sha256') }
  let reportedDropped = 0
  let dropLines = 0
  let seqMonotonic = true
  const lastSeq = { game: -1, runner: -1 }
  const pipe = new SimPipe((frame) => {
    for (const batch of frame.batch) {
      const key = keyOf(batch.target) as 'game' | 'runner'
      for (const entry of batch.entries) {
        const text = rawText(entry)
        if (text !== undefined) {
          outHash[key].update(normalise(text))
          const seq = Number(/^#(\d+):/.exec(text)?.[1] ?? -1)
          if (seq < lastSeq[key]) seqMonotonic = false
          lastSeq[key] = seq
        } else if ('line' in entry) {
          const m = /^log forwarder: (\d+) lines dropped \(queue full\)$/.exec(
            entry.line.msg
          )
          if (m) {
            reportedDropped += Number(m[1])
            dropLines += 1
          }
        }
      }
    }
  })
  fw.bind(pipe)

  const totalMs = profile.seconds * 1000
  let seq = 0
  let carry = 0
  const filler = 'x'.repeat(Math.max(0, profile.chunkBytes - 16))
  const emit = (): void => {
    const text = `#${seq}:${filler}`.slice(0, profile.chunkBytes)
    seq += 1
    for (const [target, key] of [
      [GAME, 'game'],
      [RUNNER, 'runner']
    ] as const) {
      inHash[key].update(normalise(text))
      fw.enqueue(target, false, { raw: text })
    }
  }

  for (let ms = 0; ms < totalMs; ms += 1) {
    pipe.second = Math.floor(ms / 1000)
    pipe.stalled =
      profile.stall !== undefined &&
      ms >= profile.stall.fromMs &&
      ms < profile.stall.toMs
    carry += profile.chunksPerMs
    while (carry >= 1) {
      emit()
      carry -= 1
    }
    jest.advanceTimersByTime(1)
    pipe.consume(READER_BYTES_PER_MS)
  }
  // Let the pipe and the forwarder run dry (simulated time, bounded).
  pipe.stalled = false
  for (let extra = 0; extra < 20_000; extra += 1) {
    jest.advanceTimersByTime(1)
    pipe.consume(READER_BYTES_PER_MS)
    const s = fw.stats()
    if (
      s.queuedEntries === 0 &&
      s.pendingDropped === 0 &&
      pipe.buffered === 0
    ) {
      break
    }
  }

  const stats = fw.stats()
  const perSecond = pipe.framesPerSecond.filter((n) => n !== undefined)
  return {
    name: profile.name,
    framesPerSecondMax: Math.max(...perSecond),
    framesPerSecondAvg: pipe.frames / profile.seconds,
    maxQueuedEntries: stats.maxQueuedEntries,
    maxQueuedBytes: stats.maxQueuedBytes,
    droppedTotal: stats.droppedTotal,
    reportedDropped,
    dropLines,
    inputDigest: {
      game: inHash.game.digest('hex'),
      runner: inHash.runner.digest('hex')
    },
    outputDigest: {
      game: outHash.game.digest('hex'),
      runner: outHash.runner.digest('hex')
    },
    seqMonotonic,
    mibPerSecondIn: (seq * profile.chunkBytes) / profile.seconds / MiB
  }
}

/** The ceiling the frame rate may reach: one tick frame per tick plus the size-cut frames. */
function frameBudgetPerSecond(bytesPerSecond: number): number {
  return (
    1000 / LOG_BATCH_TICK_MS + Math.ceil(bytesPerSecond / LOG_BATCH_MAX_BYTES)
  )
}

const results: Result[] = []

describe('forwarder calibration (synthetic Wine-like emitter, replaces research assumption A2)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 20, 13, 5, 9) })
  })
  afterEach(() => {
    jest.useRealTimers()
  })
  afterAll(() => {
    const rows = results.map((r) => ({
      profile: r.name,
      'MiB/s in (x2 targets)': Number((r.mibPerSecondIn * 2).toFixed(2)),
      'frames/s avg': Number(r.framesPerSecondAvg.toFixed(1)),
      'frames/s max': r.framesPerSecondMax,
      'max queued entries': r.maxQueuedEntries,
      'max queued MiB': Number((r.maxQueuedBytes / MiB).toFixed(2)),
      dropped: r.droppedTotal
    }))
    // The measured table recorded beside the constants in forwarder.ts and in the plan SUMMARY.
    console.log(
      `forwarder calibration (tick ${LOG_BATCH_TICK_MS} ms, frame ${LOG_BATCH_MAX_BYTES} B, ` +
        `caps ${LOG_QUEUE_MAX_ENTRIES} entries / ${LOG_QUEUE_MAX_BYTES / MiB} MiB):\n` +
        JSON.stringify(rows, null, 2)
    )
  })

  it('burst profile: 64 KiB chunks at 8 MiB/s for 5 s to a game and a runner, zero drops', () => {
    const result = run({
      name: 'burst',
      seconds: 5,
      chunkBytes: 64 * 1024,
      chunksPerMs: (8 * MiB) / (64 * 1024) / 1000 // 8 MiB/s of 64 KiB chunks = 128 chunks/s
    })
    results.push(result)
    expect(result.droppedTotal).toBe(0)
    expect(result.dropLines).toBe(0)
    expect(result.maxQueuedBytes).toBeLessThan(LOG_QUEUE_MAX_BYTES)
    expect(result.maxQueuedEntries).toBeLessThan(LOG_QUEUE_MAX_ENTRIES)
    // Replaying the frames through the per-chunk rule reproduces the input bytes (Pitfall 1).
    expect(result.outputDigest).toEqual(result.inputDigest)
    expect(result.seqMonotonic).toBe(true)
  })

  it('chatter profile: 20,000 chunks of 100 bytes per second for 5 s, zero drops, bounded frame rate', () => {
    const result = run({
      name: 'chatter',
      seconds: 5,
      chunkBytes: 100,
      chunksPerMs: 20
    })
    results.push(result)
    expect(result.droppedTotal).toBe(0)
    expect(result.maxQueuedBytes).toBeLessThan(LOG_QUEUE_MAX_BYTES)
    expect(result.maxQueuedEntries).toBeLessThan(LOG_QUEUE_MAX_ENTRIES)
    const bytesPerSecond = 20_000 * 2 * (100 + 96)
    expect(result.framesPerSecondMax).toBeLessThanOrEqual(
      frameBudgetPerSecond(bytesPerSecond)
    )
    expect(result.outputDigest).toEqual(result.inputDigest)
    expect(result.seqMonotonic).toBe(true)
  })

  it('stalled-consumer profile: the reader stops for 2 s, drops only past the caps, one report on resume', () => {
    const result = run({
      name: 'stalled (2 s)',
      seconds: 5,
      chunkBytes: 64 * 1024,
      chunksPerMs: (8 * MiB) / (64 * 1024) / 1000,
      stall: { fromMs: 1000, toMs: 3000 }
    })
    results.push(result)
    // 2 s x 16 MiB/s of queued input is past the 8 MiB byte cap: drops must have happened ...
    expect(result.droppedTotal).toBeGreaterThan(0)
    // ... memory stayed bounded by the caps (the newest entry may sit one entry over before the drop) ...
    expect(result.maxQueuedBytes).toBeLessThanOrEqual(
      LOG_QUEUE_MAX_BYTES + 64 * 1024 + 96
    )
    expect(result.maxQueuedEntries).toBeLessThanOrEqual(LOG_QUEUE_MAX_ENTRIES)
    // ... every drop is reported by a `lines dropped (queue full)` line once the consumer resumed ...
    expect(result.dropLines).toBeGreaterThanOrEqual(1)
    expect(result.reportedDropped).toBe(result.droppedTotal)
    // ... and what survived stayed in order. The caller never awaited: `enqueue` is synchronous void.
    expect(result.seqMonotonic).toBe(true)
  })
})
