// Phase 84 plan 04: the per-target LogWriter facade. It writes no file; every assertion is on the
// frames the process-wide forwarder hands to a captured transport.

import { LOG_FLUSH_TIMEOUT_MS } from '../forwarder'

import type {
  LogFrame,
  LogFrameBatch,
  LogFrameTarget
} from 'common/types/sidecarTransport'

type LoggerIndex = typeof import('../index')
type TargetWriterModule = typeof import('../targetWriter')

interface Loaded {
  index: LoggerIndex
  LogWriter: TargetWriterModule['default']
  frames: LogFrame[]
}

/** Loads a fresh module graph; `targetWriterFirst` requires the facade before `index.ts`. */
function load(targetWriterFirst = false): Loaded {
  let index: LoggerIndex | undefined
  let mod: TargetWriterModule | undefined
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    if (targetWriterFirst) {
      mod = require('../targetWriter') as TargetWriterModule
      index = require('../index') as LoggerIndex
    } else {
      index = require('../index') as LoggerIndex
      mod = require('../targetWriter') as TargetWriterModule
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  })
  if (!index || !mod) throw new Error('modules did not load')
  const frames: LogFrame[] = []
  index.bindLogTransport({
    send(frame, onWritten) {
      frames.push(frame)
      onWritten()
      return true
    },
    onReady() {
      // Never backed up.
    }
  })
  return { index, LogWriter: mod.default, frames }
}

const GAME: LogFrameTarget = {
  kind: 'game',
  appName: '480',
  runner: 'steam',
  type: 'launch'
}

function batchesFor(frames: LogFrame[], kind: string): LogFrameBatch[] {
  return frames.flatMap((f) => f.batch).filter((b) => b.target.kind === kind)
}

describe('LogWriter facade over the forwarder', () => {
  it('a disabled writer sends nothing', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, true)
    await w.writeString('dropped\n')
    await w.logInfo('dropped too')
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toEqual([])
  })

  it('forceLog on a disabled writer is sent and claims the rotation', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, true)
    await w.writeString('hidden\n')
    await w.writeString('forced\n', true)
    await w.writeString('hidden again\n')
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toEqual([
      { target: GAME, rotate: true, entries: [{ raw: 'forced\n' }] }
    ])
  })

  it('the first accepted entry carries rotate, later ones do not, even in one tick', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, false)
    // Neither call is awaited before the next: the claim is made before any await.
    const a = w.writeString('one\n')
    const b = w.writeString('two\n')
    void w.logInfo('three')
    await Promise.all([a, b])
    await index.flushLogForwarder()
    const batches = batchesFor(frames, 'game')
    expect(batches).toHaveLength(1)
    expect(batches[0]?.rotate).toBe(true)
    expect(batches[0]?.entries).toHaveLength(3)
    expect(batches[0]?.entries.slice(0, 2)).toEqual([
      { raw: 'one\n' },
      { raw: 'two\n' }
    ])
  })

  it('a second instance on the same target carries rotate again', async () => {
    const { index, LogWriter, frames } = load()
    await new LogWriter(GAME, false).writeString('first instance\n')
    await new LogWriter(GAME, false).writeString('second instance\n')
    await index.flushLogForwarder()
    const batches = batchesFor(frames, 'game')
    expect(batches.map((b) => b.rotate)).toEqual([true, true])
  })

  it('keeps raw chunks as separate entries, unaltered (D-06, D-15)', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, false)
    const chunks = ['a\r\n', '  \n', 'no newline', 'é世界\n']
    for (const c of chunks) await w.writeString(c)
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')[0]?.entries).toEqual(
      chunks.map((raw) => ({ raw }))
    )
  })

  it('close sends the End of log raw then every write rejects', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, false)
    await w.writeString('output\n')
    await w.close()
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')[0]?.entries).toEqual([
      { raw: 'output\n' },
      { raw: '============= End of log =============' }
    ])
    await expect(w.writeString('late\n')).rejects.toThrow(/after it was closed/)
    await expect(w.logInfo('late')).rejects.toThrow(/after it was closed/)
  })

  it('close on a disabled writer sends nothing', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, true)
    await w.close()
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toEqual([])
  })

  it('a general target never carries rotate', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter({ kind: 'general' }, false)
    await w.writeString('x\n')
    await w.logInfo('y')
    await index.flushLogForwarder()
    const batches = batchesFor(frames, 'general')
    expect(batches.length).toBeGreaterThan(0)
    for (const b of batches) expect(b.rotate).toBe(false)
  })

  it('structured lines carry the level, the option prefix and the target', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter({ kind: 'runner', runner: 'nile' }, false)
    await w.logError('boom', { prefix: 'Nile' as never })
    await w.logWarning('careful', 'Backend' as never)
    await index.flushLogForwarder()
    const [batch] = batchesFor(frames, 'runner')
    expect(batch?.target).toEqual({ kind: 'runner', runner: 'nile' })
    expect(batch?.rotate).toBe(true)
    const lines = (batch?.entries ?? []).map((e) =>
      'line' in e ? [e.line.level, e.line.prefix, e.line.msg] : e
    )
    expect(lines).toEqual([
      ['ERROR', 'Nile', 'boom'],
      ['WARNING', 'Backend', 'careful']
    ])
  })

  it('a Promise message keeps the writer order', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter({ kind: 'gogRedist' }, false)
    let release: (v: string) => void = () => undefined
    const slow = new Promise<string>((resolve) => {
      release = resolve
    })
    const first = w.writeString(slow)
    const second = w.writeString('second\n')
    release('first\n')
    await Promise.all([first, second])
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'gogRedist')[0]?.entries).toEqual([
      { raw: 'first\n' },
      { raw: 'second\n' }
    ])
  })

  it('refuses an appName Rust would reject: one general WARNING, nothing sent', async () => {
    const { index, LogWriter, frames } = load()
    const bad = ['', 'a'.repeat(256), 'a/b', 'a\\b', 'a\0b', '..', 'x..y']
    for (const appName of bad) {
      const w = new LogWriter({ ...GAME, appName } as LogFrameTarget, false)
      await w.writeString('x\n')
      await w.logInfo('x')
      await w.close()
    }
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toEqual([])
    const general = batchesFor(frames, 'general').flatMap((b) => b.entries)
    const warnings = general.filter(
      (e) =>
        'line' in e &&
        e.line.level === 'WARNING' &&
        e.line.msg === 'log target refused: invalid appName'
    )
    expect(warnings).toHaveLength(bad.length)
  })

  it('refuses a runner Rust would reject: one general WARNING, nothing sent (WR-01)', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter({ kind: 'runner', runner: 'bogus' }, false)
    await w.writeString('x\n')
    await w.logInfo('x')
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'runner')).toEqual([])
    const general = batchesFor(frames, 'general').flatMap((b) => b.entries)
    const warnings = general.filter(
      (e) =>
        'line' in e &&
        e.line.level === 'WARNING' &&
        e.line.msg.includes('log target refused: invalid runner')
    )
    expect(warnings).toHaveLength(1)
  })

  it('a rejected Promise write passes its rotate claim to the next write (WR-05)', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, false)
    await expect(w.writeString(Promise.reject(new Error('x')))).rejects.toThrow(
      'x'
    )
    await w.writeString('next\n')
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toEqual([
      { target: GAME, rotate: true, entries: [{ raw: 'next\n' }] }
    ])
  })

  it('a Promise message that rejects keeps later writes behind it, so the owed rotation precedes them (WR-08)', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, false)
    let rejectSlow: (reason: Error) => void = () => undefined
    const slow = new Promise<string>((_, reject) => {
      rejectSlow = reject
    })
    // The writer's first call claims the rotation on a Promise message that has not settled yet.
    const first = w.logError(slow)
    // A later write for the same target must not overtake it: if it were queued now with
    // `rotate: false`, the owed rotation would land on a LATER entry and move this line away.
    const second = w.writeString('current session line\n')
    rejectSlow(new Error('never produced'))
    await Promise.all([first, second])
    await w.writeString('later line\n')
    await index.flushLogForwarder()
    const batches = batchesFor(frames, 'game')
    expect(batches.map((b) => b.rotate)).toEqual([true])
    expect(batches.flatMap((b) => b.entries)).toEqual([
      { raw: 'current session line\n' },
      { raw: 'later line\n' }
    ])
  })

  it('a Promise message in a structured call keeps the writer order (WR-08)', async () => {
    const { index, LogWriter, frames } = load()
    const w = new LogWriter(GAME, false)
    let release: (v: string) => void = () => undefined
    const slow = new Promise<string>((resolve) => {
      release = resolve
    })
    const first = w.logInfo(slow)
    const second = w.writeString('after\n')
    release('before')
    await Promise.all([first, second])
    await index.flushLogForwarder()
    const batches = batchesFor(frames, 'game')
    expect(batches.map((b) => b.rotate)).toEqual([true])
    const entries = batches.flatMap((b) => b.entries)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ line: { level: 'INFO', msg: 'before' } })
    expect(entries[1]).toEqual({ raw: 'after\n' })
  })

  describe('flush waits for the writer-held Promise messages (WR-09)', () => {
    /** True once `promise` has settled, checked after a few real macrotask turns. */
    async function settledAfterTurns(promise: Promise<void>): Promise<boolean> {
      let settled = false
      void promise.then(() => {
        settled = true
      })
      for (let i = 0; i < 5; i += 1) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
      return settled
    }

    it('a flush during a pending structured Promise message waits for it and for the write queued behind it', async () => {
      const { index, LogWriter, frames } = load()
      const w = new LogWriter(GAME, false)
      let release: (v: string) => void = () => undefined
      const slow = new Promise<string>((resolve) => {
        release = resolve
      })
      void w.logInfo(slow)
      void w.writeString('queued behind\n')
      const flushing = index.flushLogForwarder()
      expect(await settledAfterTurns(flushing)).toBe(false)
      release('slow line')
      await flushing
      const entries = batchesFor(frames, 'game').flatMap((b) => b.entries)
      expect(entries).toHaveLength(2)
      expect(entries[0]).toMatchObject({
        line: { level: 'INFO', msg: 'slow line' }
      })
      expect(entries[1]).toEqual({ raw: 'queued behind\n' })
    })

    it('a flush during a pending writeString(promise) waits for it and for the write queued behind it', async () => {
      const { index, LogWriter, frames } = load()
      const w = new LogWriter(GAME, false)
      let release: (v: string) => void = () => undefined
      const slow = new Promise<string>((resolve) => {
        release = resolve
      })
      void w.writeString(slow)
      void w.logInfo('queued behind')
      const flushing = index.flushLogForwarder()
      expect(await settledAfterTurns(flushing)).toBe(false)
      release('slow chunk\n')
      await flushing
      const entries = batchesFor(frames, 'game').flatMap((b) => b.entries)
      expect(entries).toHaveLength(2)
      expect(entries[0]).toEqual({ raw: 'slow chunk\n' })
      expect(entries[1]).toMatchObject({ line: { msg: 'queued behind' } })
    })

    it('a flush still resolves within its bound when the Promise message never settles', async () => {
      jest.useFakeTimers()
      try {
        const { index, LogWriter, frames } = load()
        const w = new LogWriter(GAME, false)
        void w.logInfo(new Promise<string>(() => undefined))
        void w.logInfo('stuck behind')
        // Another writer's line is still handed to the transport.
        void new LogWriter({ kind: 'runner', runner: 'steam' }, false).logInfo(
          'other writer'
        )
        let flushed = false
        const flushing = index.flushLogForwarder().then(() => {
          flushed = true
        })
        await jest.advanceTimersByTimeAsync(LOG_FLUSH_TIMEOUT_MS - 1)
        expect(flushed).toBe(false)
        await jest.advanceTimersByTimeAsync(2)
        await flushing
        expect(flushed).toBe(true)
        expect(batchesFor(frames, 'runner')).toHaveLength(1)
        expect(batchesFor(frames, 'game')).toEqual([])
      } finally {
        jest.useRealTimers()
      }
    })
  })

  describe('timestamps are taken at the call, not when the chain reaches the line (WR-10, D-12)', () => {
    afterEach(() => {
      jest.useRealTimers()
    })

    it('a Promise message and a line behind it keep their call-time ts and tz', async () => {
      jest.useFakeTimers({ now: new Date(2026, 10, 20, 13, 5, 9) })
      const { index, LogWriter, frames } = load()
      const w = new LogWriter(GAME, false)
      let release: (v: string) => void = () => undefined
      const slow = new Promise<string>((resolve) => {
        release = resolve
      })
      const promiseCall = Date.now()
      void w.logInfo(slow)
      jest.setSystemTime(promiseCall + 10_000)
      const behindCall = Date.now()
      void w.logWarning('logged behind the promise')
      jest.setSystemTime(promiseCall + 30_000)
      release('slow line')
      await index.flushLogForwarder()
      const entries = batchesFor(frames, 'game').flatMap((b) => b.entries)
      expect(entries).toHaveLength(2)
      expect(entries[0]).toMatchObject({
        line: {
          ts: promiseCall,
          tz: -new Date(promiseCall).getTimezoneOffset(),
          msg: 'slow line'
        }
      })
      expect(entries[1]).toMatchObject({
        line: {
          ts: behindCall,
          tz: -new Date(behindCall).getTimezoneOffset(),
          msg: 'logged behind the promise'
        }
      })
    })

    it('a Promise message that is already queued behind another keeps its own call time too', async () => {
      jest.useFakeTimers({ now: new Date(2026, 10, 20, 13, 5, 9) })
      const { index, LogWriter, frames } = load()
      const w = new LogWriter(GAME, false)
      let releaseFirst: (v: string) => void = () => undefined
      const first = new Promise<string>((resolve) => {
        releaseFirst = resolve
      })
      void w.logInfo(first)
      jest.setSystemTime(Date.now() + 5_000)
      const secondCall = Date.now()
      void w.logInfo(Promise.resolve('second'))
      jest.setSystemTime(secondCall + 20_000)
      releaseFirst('first')
      await index.flushLogForwarder()
      const entries = batchesFor(frames, 'game').flatMap((b) => b.entries)
      expect(entries[1]).toMatchObject({
        line: { ts: secondCall, msg: 'second' }
      })
    })
  })

  it('accepts a 255-byte appName and one with spaces', async () => {
    const { index, LogWriter, frames } = load()
    await new LogWriter(
      { ...GAME, appName: 'a'.repeat(255) } as LogFrameTarget,
      false
    ).writeString('x\n')
    await new LogWriter(
      { ...GAME, appName: 'Game Name' } as LogFrameTarget,
      false
    ).writeString('x\n')
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toHaveLength(2)
  })

  it('requiring the facade before index.ts still works (no load-time call)', async () => {
    const { index, LogWriter, frames } = load(true)
    await new LogWriter(GAME, false).writeString('x\n')
    await index.flushLogForwarder()
    expect(batchesFor(frames, 'game')).toHaveLength(1)
  })
})
