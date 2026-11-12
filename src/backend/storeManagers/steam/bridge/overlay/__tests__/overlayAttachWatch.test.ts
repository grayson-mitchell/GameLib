import { createAbortRegistry } from 'backend/utils/aborthandler/aborthandler'

import {
  findOverlayAttach,
  macSteamConsoleLogPath,
  watchOverlayAttach
} from '../overlayAttachWatch'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

const pad = (n: number) => String(n).padStart(2, '0')
const stamp = (ms: number) => {
  const d = new Date(ms)
  return `[${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}]`
}
const attachLine = (ms: number, overlayPid = 41644, gamePid = 41590) =>
  `${stamp(ms)} GameOverlay: started '/Users/u/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS/gameoverlayui' (pid ${overlayPid}) for game process ${gamePid}`

const T0 = new Date(2026, 10, 2, 9, 0, 10).getTime()

describe('findOverlayAttach', () => {
  it('returns a line at or after the cutoff', () => {
    const m = findOverlayAttach(attachLine(T0), T0)
    expect(m).toMatchObject({ overlayPid: 41644, gamePid: 41590 })
  })
  it('ignores a line older than launchStartedAt - 5000', () => {
    expect(findOverlayAttach(attachLine(T0 - 10_000), T0)).toBeNull()
  })
  it('prefers the line whose game process equals gamePid', () => {
    const tail = [attachLine(T0, 1, 111), attachLine(T0, 2, 222)].join('\n')
    expect(findOverlayAttach(tail, T0, 222)?.overlayPid).toBe(2)
    expect(findOverlayAttach(tail, T0)?.overlayPid).toBe(1)
  })
  it('rejects look-alike lines', () => {
    const base = attachLine(T0)
    expect(findOverlayAttach(base.replace(' (pid 41644)', ''), T0)).toBeNull()
    expect(
      findOverlayAttach(base.replace('pid 41644', 'pid abc'), T0)
    ).toBeNull()
    expect(
      findOverlayAttach(base.replace('41644', '12345678901'), T0)
    ).toBeNull()
    expect(
      findOverlayAttach(base.replace('/gameoverlayui', '/other'), T0)
    ).toBeNull()
  })
  it('caps the line at 512 chars and strips control chars', () => {
    const long = attachLine(T0).replace('Users/u', 'Users/' + 'a'.repeat(600))
    const m = findOverlayAttach(
      long.replace('Steam.App', 'Steam\u0001.App'),
      T0
    )
    expect(m).not.toBeNull()
    expect(m!.line.length).toBeLessThanOrEqual(512)
    expect(m!.line.includes('\u0001')).toBe(false)
  })
})

describe('macSteamConsoleLogPath', () => {
  it('joins the Mac Steam log path', () => {
    expect(macSteamConsoleLogPath('/Users/u')).toBe(
      '/Users/u/Library/Application Support/Steam/logs/console_log.txt'
    )
  })
})

describe('watchOverlayAttach', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  // A fresh registry per call: the watch registers its controller in it (66.4-13).
  const makeDeps = (readTail: jest.Mock) => {
    const unrefs: jest.Mock[] = []
    const log = jest.fn()
    const aborts = createAbortRegistry()
    const deps = {
      aborts,
      readTail,
      log,
      now: () => Date.now(),
      setTimeout: (fn: () => void, ms: number) => {
        const h = setTimeout(fn, ms)
        const unref = jest.fn()
        unrefs.push(unref)
        return { unref, h } as never
      },
      clearTimeout: (h: unknown) => clearTimeout((h as { h: never }).h)
    }
    return { deps, unrefs, log, aborts }
  }

  it('resolves attached on the 3rd read and logs once', async () => {
    const readTail = jest
      .fn()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('')
      .mockResolvedValue(attachLine(Date.now()))
    const { deps, log, unrefs } = makeDeps(readTail)
    const p = watchOverlayAttach(
      { appId: '620', consoleLogPath: '/x', launchStartedAt: Date.now() },
      deps
    )
    await jest.advanceTimersByTimeAsync(2000)
    const r = await p
    expect(r.attached).toBe(true)
    expect(readTail).toHaveBeenCalledTimes(3)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain(
      'overlay attach: attached gameoverlayui pid='
    )
    expect(log.mock.calls[0][0]).toContain('after')
    unrefs.forEach((u) => expect(u).toHaveBeenCalled())
  })

  it('times out after at most 10 reads and logs once', async () => {
    const readTail = jest.fn().mockResolvedValue('')
    const { deps, log, unrefs } = makeDeps(readTail)
    const p = watchOverlayAttach(
      { appId: '620', consoleLogPath: '/x', launchStartedAt: Date.now() },
      deps
    )
    await jest.advanceTimersByTimeAsync(12_000)
    const r = await p
    expect(r.attached).toBe(false)
    expect(readTail.mock.calls.length).toBeLessThanOrEqual(10)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain(
      'overlay attach: not attached within 10s'
    )
    expect(unrefs.length).toBeGreaterThan(0)
    unrefs.forEach((u) => expect(u).toHaveBeenCalled())
  })

  describe('timeoutMs (60-UAT G2)', () => {
    const feed = (matchOnRead: number) => {
      let n = 0
      return jest.fn(async () => {
        n += 1
        return n >= matchOnRead ? attachLine(Date.now()) : ''
      })
    }
    const run = async (
      readTail: jest.Mock,
      timeoutMs: number | undefined,
      advance: number
    ) => {
      const { deps, log } = makeDeps(readTail)
      const p = watchOverlayAttach(
        {
          appId: '620',
          consoleLogPath: '/x',
          launchStartedAt: Date.now(),
          ...(timeoutMs === undefined ? {} : { timeoutMs })
        },
        deps
      )
      await jest.advanceTimersByTimeAsync(advance)
      return { r: await p, log }
    }

    it('attaches at about 13 s with a 30 s window', async () => {
      const { r, log } = await run(feed(14), 30_000, 31_000)
      expect(r.attached).toBe(true)
      expect(log.mock.calls[0][0]).toContain(
        'overlay attach: attached gameoverlayui pid='
      )
    })

    it('the default window misses the same feed and logs 10s', async () => {
      const { r, log } = await run(feed(14), undefined, 12_000)
      expect(r.attached).toBe(false)
      expect(log.mock.calls[0][0]).toMatch(
        /overlay attach: not attached within 10s$/
      )
    })

    it('logs the actual window length after 30 reads', async () => {
      const readTail = jest.fn().mockResolvedValue('')
      const { r, log } = await run(readTail, 30_000, 35_000)
      expect(r.attached).toBe(false)
      expect(readTail).toHaveBeenCalledTimes(30)
      expect(log.mock.calls[0][0]).toMatch(/not attached within 30s$/)
    })

    it('clamps to [1000, 60000]', async () => {
      const low = jest.fn().mockResolvedValue('')
      await run(low, 500, 5000)
      expect(low).toHaveBeenCalledTimes(1)
      const high = jest.fn().mockResolvedValue('')
      await run(high, 120_000, 70_000)
      expect(high).toHaveBeenCalledTimes(60)
    })
  })

  it('aborts mid-watch with no further reads and deletes the controller', async () => {
    const readTail = jest.fn().mockResolvedValue('')
    const { deps, aborts } = makeDeps(readTail)
    const del = jest.spyOn(aborts, 'delete')
    const startedAt = Date.now()
    const p = watchOverlayAttach(
      { appId: '620', consoleLogPath: '/x', launchStartedAt: startedAt },
      deps
    )
    await jest.advanceTimersByTimeAsync(1500)
    const reads = readTail.mock.calls.length
    aborts.call(`overlay-attach:620:${startedAt}`)
    const r = await p
    expect(r).toEqual({ attached: false, aborted: true })
    await jest.advanceTimersByTimeAsync(5000)
    expect(readTail.mock.calls.length).toBe(reads)
    expect(del).toHaveBeenCalledWith(`overlay-attach:620:${startedAt}`)
  })

  it('resolves immediately for an invalid appId', async () => {
    const readTail = jest.fn()
    const { deps } = makeDeps(readTail)
    const r = await watchOverlayAttach(
      { appId: '../x', consoleLogPath: '/x', launchStartedAt: 1 },
      deps
    )
    expect(r).toEqual({ attached: false })
    expect(readTail).not.toHaveBeenCalled()
  })

  it('never rejects when the reader throws', async () => {
    const readTail = jest.fn().mockRejectedValue(new Error('boom'))
    const { deps } = makeDeps(readTail)
    await expect(
      watchOverlayAttach(
        { appId: '620', consoleLogPath: '/x', launchStartedAt: 1 },
        deps
      )
    ).resolves.toEqual({ attached: false })
  })
})
