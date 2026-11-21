// Phase 84 plan 03 (D-10, D-12, Phase 72 D-04): the forwarder's liveness and loss rules. Each test
// builds its own LogForwarder; the settle tests drive `logger/index.ts` through a fresh module.

import {
  LOG_BATCH_MAX_BYTES,
  LOG_ENTRY_MAX_UTF16,
  LOG_FLUSH_TIMEOUT_MS,
  LOG_QUEUE_MAX_ENTRIES,
  LogForwarder
} from '../forwarder'
import { stringifyLogValue } from '../stringifyLogValue'
import vectors from 'common/__fixtures__/logFrameVectors.json'

import type {
  LogFrame,
  LogFrameEntry,
  LogFrameTarget
} from 'common/types/sidecarTransport'
import type { LogTransport } from '../forwarder'

const GENERAL: LogFrameTarget = { kind: 'general' }
const GAME: LogFrameTarget = {
  kind: 'game',
  appName: '480',
  runner: 'steam',
  type: 'launch'
}

class FakeTransport implements LogTransport {
  frames: LogFrame[] = []
  readyListeners: (() => void)[] = []
  writeCallbacks: (() => void)[] = []
  /** What `send` returns, or 'throw'. */
  result: boolean | 'throw' = true
  /** Call `onWritten` inside `send`. */
  autoWritten = true

  send(frame: LogFrame, onWritten: () => void): boolean {
    if (this.result === 'throw') throw new Error('transport down')
    this.frames.push(frame)
    if (this.autoWritten) onWritten()
    else this.writeCallbacks.push(onWritten)
    return this.result
  }

  onReady(listener: () => void): void {
    this.readyListeners.push(listener)
  }

  fireReady(): void {
    for (const listener of this.readyListeners.splice(0)) listener()
  }

  entries(): LogFrameEntry[] {
    return this.frames.flatMap((f) => f.batch.flatMap((b) => b.entries))
  }

  messages(): string[] {
    return this.entries().map((e) => ('raw' in e ? e.raw : e.line.msg))
  }
}

function info(fw: LogForwarder, message: unknown): void {
  fw.logLine(GENERAL, false, 'INFO', 'Backend', message)
}

describe('LogForwarder', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 20, 13, 5, 9) })
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('keeps the newest 4000 entries when 4001 queue unbound, then reports the drop first', () => {
    const fw = new LogForwarder()
    for (let i = 0; i <= LOG_QUEUE_MAX_ENTRIES; i += 1) info(fw, `m${i}`)
    expect(fw.stats().queuedEntries).toBe(LOG_QUEUE_MAX_ENTRIES)
    const transport = new FakeTransport()
    fw.bind(transport)
    const first = transport.frames[0]?.batch[0]?.entries[0]
    expect(first).toMatchObject({
      line: {
        level: 'WARNING',
        prefix: 'Backend',
        msg: 'log forwarder: 1 lines dropped (queue full)'
      }
    })
    const msgs = transport.messages().slice(1)
    expect(msgs).toHaveLength(LOG_QUEUE_MAX_ENTRIES)
    expect(msgs[0]).toBe('m1')
    expect(msgs[msgs.length - 1]).toBe(`m${LOG_QUEUE_MAX_ENTRIES}`)
    expect(fw.stats().pendingDropped).toBe(0)
  })

  it('delivers lines logged before the transport bound (early boot kept)', () => {
    const fw = new LogForwarder()
    info(fw, 'first')
    info(fw, 'second')
    const transport = new FakeTransport()
    expect(transport.frames).toHaveLength(0)
    fw.bind(transport)
    expect(transport.messages()).toEqual(['first', 'second'])
  })

  it('arms its tick with an unref d timer (convention 3)', () => {
    jest.useRealTimers()
    const spy = jest.spyOn(global, 'setTimeout')
    try {
      const fw = new LogForwarder()
      fw.bind(new FakeTransport())
      info(fw, 'tick me')
      const timers = spy.mock.results
        .map((r) => r.value as NodeJS.Timeout)
        .filter((t) => typeof t?.hasRef === 'function')
      expect(timers.length).toBeGreaterThanOrEqual(1)
      for (const timer of timers) expect(timer.hasRef()).toBe(false)
    } finally {
      spy.mockRestore()
    }
  })

  it('sends a frame on the 50 ms tick, not before', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    info(fw, 'tick')
    expect(transport.frames).toHaveLength(0)
    jest.advanceTimersByTime(49)
    expect(transport.frames).toHaveLength(0)
    jest.advanceTimersByTime(1)
    expect(transport.frames).toHaveLength(1)
    expect(transport.frames[0]?.kind).toBe('log')
  })

  it('pauses on a false write until the transport reports ready, queueing meanwhile', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    transport.result = false
    fw.bind(transport)
    info(fw, 'one')
    jest.advanceTimersByTime(50)
    expect(transport.frames).toHaveLength(1)
    info(fw, 'two')
    jest.advanceTimersByTime(500)
    expect(transport.frames).toHaveLength(1)
    expect(fw.stats().queuedEntries).toBe(1)
    transport.result = true
    transport.fireReady()
    jest.advanceTimersByTime(50)
    expect(transport.messages()).toEqual(['one', 'two'])
  })

  it('does not throw into its caller when send throws, and retries once ready', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    transport.result = 'throw'
    fw.bind(transport)
    expect(() => info(fw, 'kept')).not.toThrow()
    jest.advanceTimersByTime(50)
    expect(transport.frames).toHaveLength(0)
    expect(transport.readyListeners).toHaveLength(1)
    transport.result = true
    transport.fireReady()
    jest.advanceTimersByTime(50)
    expect(transport.messages()).toEqual(['kept'])
  })

  it('cuts 40 KiB of small lines into at least two frames within the size cap plus one entry', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    const kib = 'x'.repeat(1024)
    for (let i = 0; i < 40; i += 1) info(fw, kib)
    jest.advanceTimersByTime(50)
    expect(transport.frames.length).toBeGreaterThanOrEqual(2)
    for (const frame of transport.frames) {
      const size = frame.batch
        .flatMap((b) => b.entries)
        .reduce((n, e) => n + ('raw' in e ? e.raw : e.line.msg).length, 0)
      expect(size).toBeLessThanOrEqual(LOG_BATCH_MAX_BYTES + 1024 + 96)
    }
    expect(transport.messages()).toHaveLength(40)
  })

  it('starts a new batch for a rotate-true item even on the same target', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    fw.enqueue(GAME, true, { raw: 'a\n' })
    fw.enqueue(GAME, false, { raw: 'b\n' })
    fw.enqueue(GAME, true, { raw: 'c\n' })
    jest.advanceTimersByTime(50)
    const batches = transport.frames.flatMap((f) => f.batch)
    expect(batches.map((b) => [b.rotate, b.entries.length])).toEqual([
      [true, 2],
      [true, 1]
    ])
    expect(batches[0]?.target).toEqual(GAME)
  })

  it('clips an entry past the cap with a marker that stays inside the shell cap', () => {
    expect(LOG_ENTRY_MAX_UTF16).toBe(vectors.maxEntryUtf16)
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    const original = 'a'.repeat(LOG_ENTRY_MAX_UTF16 + 1)
    fw.enqueue(GAME, false, { raw: original })
    jest.advanceTimersByTime(50)
    const [text] = transport.messages()
    expect(text).toBeDefined()
    expect((text ?? '').length).toBeLessThanOrEqual(LOG_ENTRY_MAX_UTF16)
    const marker = /…\[truncated (\d+) bytes\]$/.exec(text ?? '')
    expect(marker).not.toBeNull()
    const kept = (text ?? '').length - (marker?.[0].length ?? 0)
    expect(Number(marker?.[1])).toBe(original.length - kept)
  })

  it('never cuts a surrogate pair when it clips', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    // Every unit is half of a pair, so whichever index the cut lands on, a naive slice splits one.
    fw.enqueue(GAME, false, { raw: '😀'.repeat(LOG_ENTRY_MAX_UTF16) })
    jest.advanceTimersByTime(50)
    const text = transport.messages()[0] ?? ''
    const body = text.slice(0, text.indexOf('…'))
    const last = body.charCodeAt(body.length - 1)
    expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
  })

  it('takes ts and tz at call time, not at send time', () => {
    const fw = new LogForwarder()
    const at = Date.now()
    info(fw, 'early')
    jest.setSystemTime(at + 3_600_000)
    const transport = new FakeTransport()
    fw.bind(transport)
    const entry = transport.entries()[0]
    expect(entry).toBeDefined()
    if (!entry || 'raw' in entry) throw new Error('expected a line entry')
    expect(entry.line.ts).toBe(at)
    expect(entry.line.tz).toBe(-new Date(at).getTimezoneOffset())
  })

  it('keeps a Promise-valued message ahead of later lines of the same writer', async () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    let release: (v: string) => void = () => undefined
    info(
      fw,
      new Promise<string>((resolve) => {
        release = resolve
      })
    )
    info(fw, 'second')
    jest.advanceTimersByTime(100)
    expect(transport.messages()).toEqual([])
    release('first')
    await fw.flush()
    expect(transport.messages()).toEqual(['first', 'second'])
  })

  it('logs undefined as the line "undefined" and skips an empty body', () => {
    const fw = new LogForwarder()
    const transport = new FakeTransport()
    fw.bind(transport)
    expect(() => info(fw, undefined)).not.toThrow()
    info(fw, '')
    info(fw, [])
    jest.advanceTimersByTime(50)
    expect(transport.messages()).toEqual(['undefined'])
  })

  it('counts drops by bytes as well as entries', () => {
    const fw = new LogForwarder({ maxBytes: 1000, maxEntries: 100 })
    for (let i = 0; i < 10; i += 1)
      fw.enqueue(GAME, false, { raw: 'y'.repeat(300) })
    expect(fw.stats().droppedTotal).toBeGreaterThan(0)
    expect(fw.stats().queuedBytes).toBeLessThanOrEqual(1000)
  })

  describe('settle (logErrorSettled / logInfoSettled, the CR-01 contract)', () => {
    type Index = typeof import('../index')
    function freshIndex(): Index {
      let loaded: Index | undefined
      jest.isolateModules(() => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loaded = require('../index') as Index
      })
      if (!loaded) throw new Error('logger index did not load')
      return loaded
    }

    it('exports promise-returning settled siblings', () => {
      const index = freshIndex()
      expect(index.logErrorSettled('x')).toBeInstanceOf(Promise)
      expect(index.logInfoSettled('x')).toBeInstanceOf(Promise)
    })

    it('resolves at once when no transport is bound', async () => {
      const index = freshIndex()
      await expect(index.logErrorSettled('unbound')).resolves.toBeUndefined()
    })

    it('resolves after the transport calls onWritten', async () => {
      const index = freshIndex()
      const transport = new FakeTransport()
      transport.autoWritten = false
      index.bindLogTransport(transport)
      let resolved = false
      const settled = index.logErrorSettled('boom', 'Backend')
      void settled.then(() => {
        resolved = true
      })
      await Promise.resolve()
      await Promise.resolve()
      expect(resolved).toBe(false)
      expect(transport.writeCallbacks).toHaveLength(1)
      for (const cb of transport.writeCallbacks) cb()
      await settled
      expect(resolved).toBe(true)
      expect(transport.messages()).toEqual(['boom'])
    })

    it('resolves within LOG_FLUSH_TIMEOUT_MS when onWritten never fires', async () => {
      const index = freshIndex()
      const transport = new FakeTransport()
      transport.autoWritten = false
      index.bindLogTransport(transport)
      const settled = index.logInfoSettled('stuck')
      await Promise.resolve()
      jest.advanceTimersByTime(LOG_FLUSH_TIMEOUT_MS)
      await expect(settled).resolves.toBeUndefined()
    })

    it('never rejects, even when the transport throws', async () => {
      const index = freshIndex()
      const transport = new FakeTransport()
      transport.result = 'throw'
      index.bindLogTransport(transport)
      const settled = index.logErrorSettled(new Error('fatal'))
      await Promise.resolve()
      jest.advanceTimersByTime(LOG_FLUSH_TIMEOUT_MS)
      await expect(settled).resolves.toBeUndefined()
    })
  })
})

describe('stringifyLogValue', () => {
  it('follows the old formatter rules', async () => {
    expect(stringifyLogValue('s')).toBe('s')
    expect(stringifyLogValue(7)).toBe('7')
    expect(stringifyLogValue(false)).toBe('false')
    expect(stringifyLogValue(['a', ['b', 'c']])).toBe('a b c')
    expect(stringifyLogValue({ a: 1 })).toBe('{\n  "a": 1\n}')
    const error = new Error('bad')
    error.stack = 'Error: bad\n    at x'
    expect(stringifyLogValue(error)).toBe('Error: bad\n    at x')
    await expect(stringifyLogValue(['a', Promise.resolve('b')])).resolves.toBe(
      'a b'
    )
  })

  it('never throws for a value JSON cannot serialise', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(typeof stringifyLogValue(circular)).toBe('string')
    expect(typeof stringifyLogValue(BigInt(1))).toBe('string')
    expect(stringifyLogValue(undefined)).toBe('undefined')
  })
})
