import { PassThrough } from 'node:stream'

jest.mock('../../logger', () => ({
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' },
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  flushLogForwarder: jest.fn()
}))
const callAll = jest.fn()
const running = jest.fn(() => false)
const pause = jest.fn()
const downloadQueue = {
  isRunning: () => running(),
  pauseCurrentDownload: () => pause()
}
const destroyHttp = jest.fn()
const markShuttingDown = jest.fn()
const deps = {
  outboundHttp: {
    markShuttingDown: () => markShuttingDown(),
    destroyAll: () => destroyHttp()
  },
  downloadQueue,
  // The abort registry is injected (66.4-13): the release path only needs abortAll.
  aborts: { abortAll: () => callAll() }
}

import { flushLogForwarder, logInfo, logWarning } from '../../logger'
import { RESIDUAL_HOLDER_DIAG_MS, releaseOnStdinEof } from '../stdinEofRelease'

describe('releaseOnStdinEof (debug/sidecar-survives-force-quit)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    destroyHttp.mockReturnValue({
      destroyed: 2,
      hosts: ['a.example', 'b.example']
    })
  })

  it('does nothing while stdin is open', () => {
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.write('x\n')
    expect(callAll).not.toHaveBeenCalled()
    expect(destroyHttp).not.toHaveBeenCalled()
  })

  it('aborts downloads and releases once at EOF', () => {
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(callAll).toHaveBeenCalledTimes(1)
      expect(destroyHttp).toHaveBeenCalledTimes(1)
    })
  })

  it('flushes the log forwarder once, after the other release steps and their log lines (Phase 84)', async () => {
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    await new Promise<void>((resolve) => setImmediate(resolve))
    const flush = flushLogForwarder as jest.Mock
    expect(flush).toHaveBeenCalledTimes(1)
    const flushedAt = flush.mock.invocationCallOrder[0] ?? 0
    const lastLine = Math.max(
      ...(logInfo as jest.Mock).mock.invocationCallOrder
    )
    expect(flushedAt).toBeGreaterThan(lastLine)
    expect(flushedAt).toBeGreaterThan(callAll.mock.invocationCallOrder[0] ?? 0)
    expect(flushedAt).toBeGreaterThan(
      destroyHttp.mock.invocationCallOrder[0] ?? 0
    )
  })

  it('pauses a running download before aborting, so it stays in the persisted queue', () => {
    running.mockReturnValueOnce(true)
    const order: string[] = []
    pause.mockImplementationOnce(() => order.push('pause'))
    callAll.mockImplementationOnce(() => order.push('abort'))
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(order).toEqual(['pause', 'abort'])
      expect(destroyHttp).toHaveBeenCalledTimes(1)
    })
  })

  it('does not pause an idle queue', () => {
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(pause).not.toHaveBeenCalled()
      expect(callAll).toHaveBeenCalledTimes(1)
    })
  })

  it('still destroys outbound HTTP if aborting throws', () => {
    callAll.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    return new Promise<void>((resolve) => setImmediate(resolve)).then(() => {
      expect(destroyHttp).toHaveBeenCalledTimes(1)
    })
  })

  it('logs the stdin-closed line', async () => {
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    await new Promise<void>((resolve) => setImmediate(resolve))
    const lines = (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(lines).toContain(
      '[sidecar] stdin closed: aborting in-flight downloads'
    )
  })

  it('destroys outbound HTTP once and logs count and hosts', async () => {
    destroyHttp.mockImplementationOnce(() => ({
      destroyed: 2,
      hosts: ['a.example', 'b.example']
    }))
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(destroyHttp).toHaveBeenCalledTimes(1)
    const lines = (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
    const line = lines.find((l) =>
      l.includes('destroyed 2 in-flight outbound HTTP')
    )
    expect(line).toContain('a.example')
    expect(line).toContain('b.example')
  })

  it('still completes release if destroying outbound HTTP throws', async () => {
    destroyHttp.mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const input = new PassThrough()
    releaseOnStdinEof(input, deps)
    input.resume()
    input.end()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(markShuttingDown).toHaveBeenCalledTimes(1)
  })

  it('arms an unref d residual-holder diagnostic that names active resources', () => {
    jest.useFakeTimers()
    const spy = jest
      .spyOn(process, 'getActiveResourcesInfo')
      .mockReturnValue(['TCPSocketWrap', 'Timeout'])
    const unref = jest.fn()
    const realSetTimeout = global.setTimeout
    const stSpy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      const h = realSetTimeout(fn, ms) as unknown as { unref?: () => void }
      h.unref = unref
      return h
    }) as unknown as typeof setTimeout)
    try {
      const input = new PassThrough()
      releaseOnStdinEof(input, deps)
      input.emit('end')
      expect(unref).toHaveBeenCalled()
      jest.advanceTimersByTime(RESIDUAL_HOLDER_DIAG_MS)
      const warn = (logWarning as jest.Mock).mock.calls
        .map((c) => String(c[0]))
        .find((l) => l.includes('still alive'))
      expect(warn).toContain('TCPSocketWrap, Timeout')
    } finally {
      stSpy.mockRestore()
      spy.mockRestore()
      jest.useRealTimers()
    }
  })
})
