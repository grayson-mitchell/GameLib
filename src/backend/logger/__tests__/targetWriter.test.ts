// Phase 84 plan 04: the per-target LogWriter facade. It writes no file; every assertion is on the
// frames the process-wide forwarder hands to a captured transport.

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
