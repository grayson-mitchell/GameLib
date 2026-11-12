/**
 * Phase 57 plan 04: the known-fix report client. Every dependency is injected;
 * the real aborthandler (a pure Map) is used so the exit contract is exercised.
 */

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import axios from 'axios'
import {
  GAMELIB_FIX_RELAY_URL,
  RELAY_URL_PENDING_SENTINEL,
  knownFixReportDeps,
  reportDetectedFix,
  relayUrl,
  runKnownFixReport,
  type DetectedFix,
  type ReportDeps
} from '../knownFixReport'
import { createAbortRegistry } from '../utils/aborthandler/aborthandler'
import { parseKnownFixReport } from 'common/knownFixReport'
import { logInfo } from '../logger'
import { defined } from './helpers/defined'

// D-09: the real default deps read the setting through the injected config slice; drive it.
let mockSettings: Record<string, unknown> = {}
jest.mock('../constants/environment', () => ({ isMac: true }))

type PostCall = { url: string; body: unknown; signal: AbortSignal }

function makeDeps(over: Partial<ReportDeps> = {}) {
  const calls: PostCall[] = []
  const store = new Map<string, unknown>()
  const aborts = createAbortRegistry()
  const deps: ReportDeps = {
    aborts,
    post: (url, body, signal) => {
      calls.push({ url, body, signal })
      return Promise.resolve({ status: 200, data: { status: 'created' } })
    },
    isMac: () => true,
    isEnabled: () => true,
    readWinning: () => null,
    sentStore: {
      get: (k) => store.get(k),
      set: (k, v) => void store.set(k, v)
    },
    version: () => '0.8.0',
    now: () => 1234,
    relayUrl: () => 'http://relay.test/v1/reports',
    ...over
  }
  return { deps, calls, store, aborts }
}

const addArch: DetectedFix = {
  appId: '220',
  key: 'macArch',
  op: 'add',
  detector: 'macho'
}
const addCeg: DetectedFix = {
  appId: '220',
  key: 'drm',
  op: 'add',
  detector: 'ceg'
}
const removeArch: DetectedFix = { ...addArch, op: 'remove' }

describe('url', () => {
  const saved = process.env.GAMELIB_FIX_RELAY_URL
  afterEach(() => {
    if (saved === undefined) delete process.env.GAMELIB_FIX_RELAY_URL
    else process.env.GAMELIB_FIX_RELAY_URL = saved
  })

  it('env override wins, else the constant', () => {
    process.env.GAMELIB_FIX_RELAY_URL = 'http://x.test/r'
    expect(relayUrl()).toBe('http://x.test/r')
    delete process.env.GAMELIB_FIX_RELAY_URL
    expect(relayUrl()).toBe(GAMELIB_FIX_RELAY_URL)
  })

  it('the pending sentinel means nothing is sent', async () => {
    const { deps, calls } = makeDeps({
      relayUrl: () => `https://${RELAY_URL_PENDING_SENTINEL}.example/v1`
    })
    expect(await runKnownFixReport(addArch, deps)).toBe('no-relay')
    expect(calls).toHaveLength(0)
  })
})

describe('gate', () => {
  it('non-mac does not send', async () => {
    const { deps, calls } = makeDeps({ isMac: () => false })
    expect(await runKnownFixReport(addArch, deps)).toBe('not-mac')
    expect(calls).toHaveLength(0)
  })

  it('disabled does not send', async () => {
    const { deps, calls } = makeDeps({ isEnabled: () => false })
    expect(await runKnownFixReport(addArch, deps)).toBe('disabled')
    expect(calls).toHaveLength(0)
  })

  it('the setting is read on every call', async () => {
    let on = true
    const { deps, calls } = makeDeps({ isEnabled: () => on })
    expect(await runKnownFixReport(addArch, deps)).toBe('sent')
    on = false
    expect(await runKnownFixReport(addCeg, deps)).toBe('disabled')
    expect(calls).toHaveLength(1)
  })
})

// The real deps builder over a throwaway in-memory steam store slice.
const realDeps = () =>
  knownFixReportDeps({
    stores: { steam: { steamKnownFixReportStore: new Map() } },
    appInfo: { version: '0.8.0' },
    config: { getSettings: () => mockSettings },
    aborts: createAbortRegistry()
  } as never)

describe('gate with the real default deps (D-09)', () => {
  afterEach(() => {
    mockSettings = {}
    jest.restoreAllMocks()
  })

  it('an absent shareDetectedFixes setting posts nothing', async () => {
    const post = jest.spyOn(axios, 'post')
    mockSettings = {}
    expect(await runKnownFixReport(addArch, realDeps())).toBe('disabled')
    reportDetectedFix(addCeg, realDeps())
    await new Promise((r) => setImmediate(r))
    expect(post).not.toHaveBeenCalled()
  })

  it('an explicit false posts nothing', async () => {
    const post = jest.spyOn(axios, 'post')
    mockSettings = { shareDetectedFixes: false }
    expect(await runKnownFixReport(addArch, realDeps())).toBe('disabled')
    expect(post).not.toHaveBeenCalled()
  })
})

describe('skip', () => {
  const win = (fix: Record<string, unknown>, layer = 'bundled') => ({
    fix,
    layer
  })

  it('add macArch skipped when already 32', async () => {
    const { deps, calls } = makeDeps({
      readWinning: () => win({ macArch: '32' })
    })
    expect(await runKnownFixReport(addArch, deps)).toBe('skipped-known')
    expect(calls).toHaveLength(0)
  })

  it('add drm sent when winning has only macArch', async () => {
    const { deps, calls } = makeDeps({
      readWinning: () => win({ macArch: '32' })
    })
    expect(await runKnownFixReport(addCeg, deps)).toBe('sent')
    expect(calls).toHaveLength(1)
  })

  it('add drm skipped when already ceg', async () => {
    const { deps } = makeDeps({ readWinning: () => win({ drm: 'ceg' }) })
    expect(await runKnownFixReport(addCeg, deps)).toBe('skipped-known')
  })

  it('remove sent when winning says 32', async () => {
    const { deps, calls } = makeDeps({
      readWinning: () => win({ macArch: '32' })
    })
    expect(await runKnownFixReport(removeArch, deps)).toBe('sent')
    expect(calls).toHaveLength(1)
  })

  it('remove skipped when winning is null or lacks macArch 32', async () => {
    const a = makeDeps({ readWinning: () => null })
    expect(await runKnownFixReport(removeArch, a.deps)).toBe('skipped-not-32')
    const b = makeDeps({ readWinning: () => win({ drm: 'ceg' }) })
    expect(await runKnownFixReport(removeArch, b.deps)).toBe('skipped-not-32')
    expect(a.calls.length + b.calls.length).toBe(0)
  })

  it('local layer wins and nothing is sent', async () => {
    const { deps, calls } = makeDeps({
      readWinning: () => win({ macArch: '32' }, 'local')
    })
    expect(await runKnownFixReport(addCeg, deps)).toBe('skipped-local')
    expect(await runKnownFixReport(removeArch, deps)).toBe('skipped-local')
    expect(calls).toHaveLength(0)
  })

  it('readWinning throwing yields error and no post', async () => {
    const { deps, calls } = makeDeps({
      readWinning: () => {
        throw new Error('boom')
      }
    })
    expect(await runKnownFixReport(addArch, deps)).toBe('error')
    expect(calls).toHaveLength(0)
  })
})

describe('sent', () => {
  const withStatus = (status: number) =>
    makeDeps({
      post: () => Promise.resolve({ status, data: { status: 'rejected' } })
    })

  it('2xx marks and returns sent; a repeat is already-sent', async () => {
    for (const s of [200, 201]) {
      const { deps, store } = withStatus(s)
      expect(await runKnownFixReport(addArch, deps)).toBe('sent')
      expect(store.get('220:macArch:add')).toEqual({ at: 1234, status: s })
      expect(await runKnownFixReport(addArch, deps)).toBe('already-sent')
    }
  })

  it('terminal 4xx marks and returns rejected', async () => {
    for (const s of [400, 413, 415, 422]) {
      const { deps, store } = withStatus(s)
      expect(await runKnownFixReport(addArch, deps)).toBe('rejected')
      expect(store.has('220:macArch:add')).toBe(true)
    }
  })

  it('408, 429, 5xx are retryable and not marked', async () => {
    for (const s of [408, 429, 500, 503]) {
      const { deps, store } = withStatus(s)
      expect(await runKnownFixReport(addArch, deps)).toBe('retryable')
      expect(store.size).toBe(0)
    }
  })

  it('a network failure is retryable and not marked', async () => {
    const { deps, store } = makeDeps({
      post: () => Promise.reject(new Error('ECONNRESET'))
    })
    expect(await runKnownFixReport(addArch, deps)).toBe('retryable')
    expect(store.size).toBe(0)
  })

  it('posts exactly the allowed body', async () => {
    const { deps, calls } = makeDeps()
    await runKnownFixReport(addCeg, deps)
    expect(defined(calls[0], 'first post').url).toBe(
      'http://relay.test/v1/reports'
    )
    expect(defined(calls[0], 'first post').body).toEqual({
      v: 1,
      store: 'steam',
      appId: '220',
      key: 'drm',
      value: 'ceg',
      op: 'add',
      gamelibVersion: '0.8.0'
    })
    expect(
      Object.keys(defined(calls[0], 'first post').body as object)
    ).not.toContain('title')
    expect(parseKnownFixReport(defined(calls[0], 'first post').body).ok).toBe(
      true
    )
  })

  it('malformed persisted values count as not sent', async () => {
    for (const bad of ['yes', { at: 'x' }, null]) {
      const { deps, calls, store } = makeDeps()
      store.set('220:macArch:add', bad)
      expect(await runKnownFixReport(addArch, deps)).toBe('sent')
      expect(calls).toHaveLength(1)
    }
  })

  it('an invalid appId is rejected locally', async () => {
    const { deps, calls } = makeDeps()
    expect(await runKnownFixReport({ ...addArch, appId: '../x' }, deps)).toBe(
      'invalid'
    )
    expect(calls).toHaveLength(0)
  })

  it('logs the report before and the status after, never the body', async () => {
    const { deps } = makeDeps({
      post: () =>
        Promise.resolve({
          status: 201,
          data: { status: 'created', detail: 'SECRET', pr: 9 }
        })
    })
    await runKnownFixReport(addArch, deps)
    const lines = (logInfo as jest.Mock).mock.calls.map((c) => String(c[0]))
    expect(
      lines.some(
        (l) =>
          l.includes('220') &&
          l.includes('macArch=32') &&
          l.includes('add') &&
          l.includes('0.8.0')
      )
    ).toBe(true)
    expect(lines.some((l) => l.includes('201') && l.includes('created'))).toBe(
      true
    )
    expect(lines.some((l) => l.includes('SECRET'))).toBe(false)
  })
})

describe('abort', () => {
  const id = 'known-fix-report:220:macArch:add'
  const hanging =
    (calls: PostCall[]): ReportDeps['post'] =>
    (url, body, signal) => {
      calls.push({ url, body, signal })
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')))
      })
    }

  it('is registered in flight, aborted by aborts.abortAll, then released', async () => {
    const calls: PostCall[] = []
    const { deps, store, aborts } = makeDeps({ post: hanging(calls) })
    const run = runKnownFixReport(addArch, deps)
    await new Promise((r) => setImmediate(r))
    expect(aborts.has(id)).toBe(true)
    expect(await runKnownFixReport(addArch, deps)).toBe('in-flight')
    expect(calls).toHaveLength(1)
    aborts.abortAll()
    expect(await run).toBe('retryable')
    expect(store.size).toBe(0)
    expect(aborts.has(id)).toBe(false)
  })

  it('reportDetectedFix returns undefined synchronously and never throws', () => {
    const { deps } = makeDeps({
      isMac: () => {
        throw new Error('sync boom')
      }
    })
    let result: unknown = 'unset'
    expect(() => {
      result = reportDetectedFix(addArch, deps)
    }).not.toThrow()
    expect(result).toBeUndefined()
  })
})
