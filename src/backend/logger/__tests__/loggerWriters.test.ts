import type { LogFrame, LogFrameBatch } from 'common/types/sidecarTransport'

type LoggerIndex = typeof import('../index')

// A disabled writer sends nothing, so a frame on the (captured) transport is the observable
// "this writer is enabled" signal. The writers no longer touch the file system: Rust writes.
function loadIndex(): { index: LoggerIndex; frames: LogFrame[] } {
  let index: LoggerIndex | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    index = require('../index') as LoggerIndex
  })
  if (!index) throw new Error('logger index did not load')
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
  return { index, frames }
}

describe('logger writers take their settings from the caller (66.3-06)', () => {
  const sentBatches = (frames: LogFrame[]): LogFrameBatch[] =>
    frames.flatMap((f) => f.batch)

  const isEnabled = async (
    index: LoggerIndex,
    frames: LogFrame[],
    writer: { logInfo: (m: string) => Promise<void> }
  ): Promise<boolean> => {
    const before = sentBatches(frames).length
    await writer.logInfo('probe')
    await index.flushLogForwarder()
    return sentBatches(frames).length > before
  }

  test('getRunnerLogWriter caches the first writer per runner', async () => {
    const { index, frames } = loadIndex()
    const first = index.getRunnerLogWriter('legendary', { disableLogs: true })
    const second = index.getRunnerLogWriter('legendary', { disableLogs: false })
    expect(second).toBe(first)
    expect(first.target).toEqual({ kind: 'runner', runner: 'legendary' })
    expect(await isEnabled(index, frames, second)).toBe(false)
  })

  test('getRunnerLogWriter honours disableLogs false on first use', async () => {
    const { index, frames } = loadIndex()
    expect(
      await isEnabled(
        index,
        frames,
        index.getRunnerLogWriter('nile', { disableLogs: false })
      )
    ).toBe(true)
  })

  test('launch log is disabled when verboseLogs is off', async () => {
    const { index, frames } = loadIndex()
    const w = await index.createGameLogWriter('app', 'gog', 'launch', {
      disableLogs: false,
      verboseLogs: false
    })
    expect(await isEnabled(index, frames, w)).toBe(false)
  })

  test('launch log is enabled with verboseLogs on and logs not disabled', async () => {
    const { index, frames } = loadIndex()
    const w = await index.createGameLogWriter('app', 'gog', 'launch', {
      disableLogs: false,
      verboseLogs: true
    })
    expect(await isEnabled(index, frames, w)).toBe(true)
  })

  test('install log ignores verboseLogs but honours disableLogs', async () => {
    const { index, frames } = loadIndex()
    const on = await index.createGameLogWriter('app', 'gog', 'install', {
      disableLogs: false,
      verboseLogs: false
    })
    const off = await index.createGameLogWriter('app', 'gog', 'install', {
      disableLogs: true,
      verboseLogs: true
    })
    expect(await isEnabled(index, frames, on)).toBe(true)
    expect(await isEnabled(index, frames, off)).toBe(false)
  })

  test('createGameLogWriter returns a fresh writer per call with a typed target', async () => {
    const { index } = loadIndex()
    const settings = { disableLogs: false, verboseLogs: true }
    const a = await index.createGameLogWriter(
      'app',
      'steam',
      'launch',
      settings
    )
    const b = await index.createGameLogWriter(
      'app',
      'steam',
      'launch',
      settings
    )
    expect(b).not.toBe(a)
    expect(a.target).toEqual({
      kind: 'game',
      appName: 'app',
      runner: 'steam',
      type: 'launch'
    })
  })
})
