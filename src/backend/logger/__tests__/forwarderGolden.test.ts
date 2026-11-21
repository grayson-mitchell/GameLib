// Phase 84 plan 03: the TS forwarder held to the native-logger golden (criterion 1, the tracer).
//
// For every general-target case in cases.json, a fresh copy of `logger/index.ts` is driven under the
// oracle's own fake time with a capturing LogTransport bound through `bindLogTransport`, and the
// entries it sends must equal the case's frames in entries.json. Timestamps are compared as wall-clock
// time (`ts + tz * 60000`) so the fixtures hold on any host timezone. The shell side of the same
// frames is `sidecar::log_frame_tests` in src-tauri (the Rust reader arm into a Logger).

import { readFileSync } from 'fs'
import { join, resolve } from 'path'

import { LogPrefix } from '../constants'

import type {
  LogFrame,
  LogFrameEntry,
  LogFrameTarget
} from 'common/types/sidecarTransport'
import type { LogTransport } from '../forwarder'

type LoggerIndex = typeof import('../index')
type TargetWriterModule = typeof import('../targetWriter')

const FIXTURE_ROOT = resolve(
  __dirname,
  '../../../../src-tauri/crates/gamelib-log/tests/fixtures/golden'
)

/** The oracle's fixed wall-clock instant: 2026-11-20 13:05:09 local time. */
const FAKE_NOW = new Date(2026, 10, 20, 13, 5, 9)

interface GoldenCase {
  id: string
  kind: 'line' | 'chunks' | 'rotate' | 'close' | 'renderer'
  oracle?: boolean
  target?: LogFrameTarget
  forceLog?: boolean
  chunks?: (string | { text: string; forceLog: boolean })[]
  method?: 'debug' | 'info' | 'warning' | 'error'
  message?: unknown
  messageKind?: string
  prefix?: string
  disabled?: boolean
  writers?: {
    message: string
    raw?: boolean
    disabled?: boolean
    forceLog?: boolean
  }[]
}

interface CaseEntries {
  id: string
  frames?: {
    target: LogFrameTarget
    rotate: boolean
    entries: LogFrameEntry[]
  }[]
}

const cases: GoldenCase[] = JSON.parse(
  readFileSync(join(FIXTURE_ROOT, 'cases.json'), 'utf-8')
)
const entries: CaseEntries[] = JSON.parse(
  readFileSync(join(FIXTURE_ROOT, 'entries.json'), 'utf-8')
)

function expandGen(value: unknown): unknown {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    '$gen' in value
  ) {
    const gen = (value as { $gen: { repeat: string; count: number } }).$gen
    return gen.repeat.repeat(gen.count)
  }
  if (Array.isArray(value)) return value.map(expandGen)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, expandGen(v)])
    )
  }
  return value
}

function buildMessage(c: GoldenCase): unknown {
  const raw = expandGen(c.message)
  switch (c.messageKind) {
    case 'empty':
      return ''
    case 'error': {
      const d = raw as { name: string; message: string; stack: string }
      const error = new Error(d.message)
      error.name = d.name
      error.stack = d.stack
      return error
    }
    case 'promise':
      return Promise.resolve(raw)
    default:
      return raw
  }
}

function prefixValue(key: string | undefined): string {
  if (key === undefined) return LogPrefix.General
  const value = (LogPrefix as Record<string, string>)[key]
  if (value === undefined) throw new Error(`unknown LogPrefix key ${key}`)
  return value
}

/** Replaces `ts` by wall-clock time so the comparison does not depend on the host's timezone. */
function wallClock(entry: LogFrameEntry): unknown {
  if ('raw' in entry) return entry
  const { ts, tz, ...rest } = entry.line
  return { line: { ...rest, wallClockMs: ts + tz * 60_000 } }
}

function loadIndex(): LoggerIndex {
  let loaded: LoggerIndex | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('../index') as LoggerIndex
  })
  if (!loaded) throw new Error('logger index did not load')
  return loaded
}

function capturingTransport(frames: LogFrame[]): LogTransport {
  return {
    send(frame, onWritten) {
      frames.push(frame)
      onWritten()
      return true
    },
    onReady() {
      // Never backed up.
    }
  }
}

const GENERAL_LINE_CASES = cases.filter(
  (c) => c.kind === 'line' && c.target?.kind === 'general' && c.oracle !== false
)
const GENERAL_ROTATE_CASES = cases.filter(
  (c) => c.kind === 'rotate' && c.target?.kind === 'general'
)
const METHOD_BY_LEVEL = {
  debug: 'logDebug',
  info: 'logInfo',
  warning: 'logWarning',
  error: 'logError'
} as const

describe('forwarder golden (general-target cases)', () => {
  beforeEach(() => {
    jest.useFakeTimers({
      now: FAKE_NOW,
      // Only `Date` is faked: promises and timers stay real, as in the oracle.
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout'
      ]
    })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  async function replay(
    id: string,
    drive: (index: LoggerIndex) => void
  ): Promise<void> {
    const index = loadIndex()
    const frames: LogFrame[] = []
    index.bindLogTransport(capturingTransport(frames))
    drive(index)
    await index.flushLogForwarder()

    const expected = entries.find((e) => e.id === id)
    if (!expected?.frames)
      throw new Error(`case ${id} has no entries.json frames`)
    const got = frames.flatMap((f) => f.batch)
    for (const batch of got) {
      expect(batch.target).toEqual({ kind: 'general' })
      expect(batch.rotate).toBe(false)
    }
    for (const frame of frames) expect(frame.kind).toBe('log')
    expect(got.flatMap((b) => b.entries.map(wallClock))).toEqual(
      expected.frames.flatMap((f) => f.entries.map(wallClock))
    )
  }

  it('replays the general-target cases', () => {
    // Guards the filters above: a rename in cases.json must not leave the loops below empty.
    expect(GENERAL_LINE_CASES.length).toBeGreaterThanOrEqual(25)
    expect(GENERAL_ROTATE_CASES.length).toBeGreaterThanOrEqual(1)
  })

  it.each(GENERAL_LINE_CASES.map((c) => [c.id, c] as const))(
    'line case %s matches entries.json',
    async (_id, c) => {
      await replay(c.id, (index) => {
        const method = METHOD_BY_LEVEL[c.method ?? 'info']
        index[method](buildMessage(c), prefixValue(c.prefix))
      })
    }
  )

  it.each(GENERAL_ROTATE_CASES.map((c) => [c.id, c] as const))(
    'rotate case %s matches entries.json (the writer rotates in Rust)',
    async (_id, c) => {
      await replay(c.id, (index) => {
        for (const w of c.writers ?? []) {
          index.logInfo(w.message, LogPrefix.Backend)
        }
      })
    }
  )
})

// The non-general cases: a game, runner or gog redist writer built through the facade, driven the way
// the oracle drove the old writer. One batch per writer instance (a rotate batch opens a new one), so
// the batch list is compared as is.
describe('forwarder golden (game, runner, redist, close and rotate cases)', () => {
  const NON_GENERAL_LINE = cases.filter(
    (c) =>
      c.kind === 'line' && c.target?.kind !== 'general' && c.oracle !== false
  )
  const NON_GENERAL_CHUNKS = cases.filter(
    (c) => c.kind === 'chunks' && c.target?.kind !== 'general'
  )
  const NON_GENERAL_ROTATE = cases.filter(
    (c) => c.kind === 'rotate' && c.target?.kind !== 'general'
  )
  const CLOSE = cases.filter((c) => c.kind === 'close')

  beforeEach(() => {
    jest.useFakeTimers({
      now: FAKE_NOW,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout'
      ]
    })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  async function replayWriters(
    id: string,
    drive: (
      make: (target: LogFrameTarget, disabled: boolean) => WriterLike
    ) => Promise<void>
  ): Promise<void> {
    let index: LoggerIndex | undefined
    let facade: TargetWriterModule | undefined
    jest.isolateModules(() => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      index = require('../index') as LoggerIndex
      facade = require('../targetWriter') as TargetWriterModule
      /* eslint-enable @typescript-eslint/no-require-imports */
    })
    if (!index || !facade) throw new Error('logger did not load')
    const frames: LogFrame[] = []
    index.bindLogTransport(capturingTransport(frames))
    const Writer = facade.default
    await drive((target, disabled) => new Writer(target, disabled))
    await index.flushLogForwarder()

    const expected = entries.find((e) => e.id === id)
    if (!expected?.frames)
      throw new Error(`case ${id} has no entries.json frames`)
    const normalise = (
      batches: {
        target: LogFrameTarget
        rotate: boolean
        entries: LogFrameEntry[]
      }[]
    ) =>
      batches.map((b) => ({
        target: b.target,
        rotate: b.rotate,
        entries: b.entries.map(wallClock)
      }))
    for (const frame of frames) expect(frame.kind).toBe('log')
    expect(normalise(frames.flatMap((f) => f.batch))).toEqual(
      normalise(expected.frames)
    )
  }

  it('replays the non-general cases', () => {
    // Guards the filters: a rename in cases.json must not leave the loops below empty.
    expect(NON_GENERAL_LINE.length).toBeGreaterThanOrEqual(3)
    expect(NON_GENERAL_CHUNKS.length).toBeGreaterThanOrEqual(8)
    expect(NON_GENERAL_ROTATE.length).toBeGreaterThanOrEqual(8)
    expect(CLOSE.length).toBeGreaterThanOrEqual(1)
  })

  it.each(NON_GENERAL_LINE.map((c) => [c.id, c] as const))(
    'line case %s matches entries.json',
    async (_id, c) => {
      await replayWriters(c.id, async (make) => {
        const writer = make(c.target as LogFrameTarget, c.disabled === true)
        const method = METHOD_BY_LEVEL[c.method ?? 'info']
        await writer[method](buildMessage(c), {
          prefix: prefixValue(c.prefix) as never,
          forceLog: c.forceLog
        })
      })
    }
  )

  it.each(NON_GENERAL_CHUNKS.map((c) => [c.id, c] as const))(
    'chunks case %s matches entries.json',
    async (_id, c) => {
      await replayWriters(c.id, async (make) => {
        const writer = make(c.target as LogFrameTarget, c.disabled === true)
        for (const chunk of c.chunks ?? []) {
          const text = typeof chunk === 'string' ? chunk : chunk.text
          const forceLog = typeof chunk === 'string' ? false : chunk.forceLog
          await writer.writeString(text, forceLog)
        }
      })
    }
  )

  it.each(NON_GENERAL_ROTATE.map((c) => [c.id, c] as const))(
    'rotate case %s matches entries.json',
    async (_id, c) => {
      await replayWriters(c.id, async (make) => {
        for (const w of c.writers ?? []) {
          const writer = make(c.target as LogFrameTarget, w.disabled === true)
          if (w.raw) await writer.writeString(w.message, w.forceLog === true)
          else
            await writer.logInfo(w.message, {
              prefix: LogPrefix.Backend,
              forceLog: w.forceLog
            })
        }
      })
    }
  )

  it.each(CLOSE.map((c) => [c.id, c] as const))(
    'close case %s matches entries.json and a later write throws',
    async (_id, c) => {
      await replayWriters(c.id, async (make) => {
        const writer = make(c.target as LogFrameTarget, false)
        for (const chunk of c.chunks ?? []) {
          await writer.writeString(
            typeof chunk === 'string' ? chunk : chunk.text
          )
        }
        await writer.close()
        await expect(writer.writeString('after close\n')).rejects.toThrow(
          /after it was closed/
        )
      })
    }
  )
})

interface WriterLike {
  writeString(message: string, forceLog?: boolean): Promise<void>
  logDebug(message: unknown, options?: unknown): Promise<void>
  logInfo(message: unknown, options?: unknown): Promise<void>
  logWarning(message: unknown, options?: unknown): Promise<void>
  logError(message: unknown, options?: unknown): Promise<void>
  close(): Promise<void>
}
