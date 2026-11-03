export {}

const mockLogInfo = jest.fn()
const mockLogWarning = jest.fn()
jest.mock('../logger', () => ({
  LogPrefix: { Connection: 'Connection' },
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logWarning: (...args: unknown[]) => mockLogWarning(...args)
}))
jest.mock('backend/online_monitor', () => ({
  getConnectivityStatus: jest.fn(() => 'online'),
  recheckConnectivity: jest.fn()
}))

import type { ConnectivityStatus } from 'common/types'
import { checkConnectivityNow, hasRoutableAddress } from '../connectivityNow'

const lan = {
  en0: [{ address: '192.168.1.20', family: 'IPv4', internal: false }]
} as never
const loopback = {
  lo0: [{ address: '127.0.0.1', family: 'IPv4', internal: true }]
} as never

const makeDeps = (over: Record<string, unknown> = {}) => ({
  status: jest.fn((): ConnectivityStatus => 'online'),
  hosts: ['a.test', 'b.test'],
  networkInterfaces: jest.fn(() => lan),
  lookup: jest.fn(() => Promise.resolve({ address: '1.2.3.4' })),
  onFreshOffline: jest.fn(),
  ...over
})

describe('hasRoutableAddress', () => {
  it('G25: loopback only is not routable', () => {
    expect(hasRoutableAddress(loopback)).toBe(false)
  })

  it('G25: link-local only is not routable', () => {
    expect(
      hasRoutableAddress({
        awdl0: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
        llw0: [{ address: 'fe80::2', family: 'IPv6', internal: false }],
        utun0: [{ address: '169.254.3.4', family: 'IPv4', internal: false }]
      } as never)
    ).toBe(false)
  })

  it.each([
    ['IPv4 string', { address: '192.168.1.20', family: 'IPv4' }],
    ['global IPv6', { address: '2001:db8::1', family: 'IPv6' }],
    ['numeric 4', { address: '10.0.0.2', family: 4 }],
    ['numeric 6', { address: '2001:db8::2', family: 6 }]
  ])('G25: %s is routable', (_name, entry) => {
    expect(
      hasRoutableAddress({ en0: [{ ...entry, internal: false }] } as never)
    ).toBe(true)
  })
})

describe('checkConnectivityNow', () => {
  beforeEach(() => {
    mockLogInfo.mockClear()
    mockLogWarning.mockClear()
  })

  it('IN-02: an empty host list fails open, no hook fired', async () => {
    const deps = makeDeps({ hosts: [] })
    const r = await checkConnectivityNow('t', deps as never)
    expect(r.offline).toBe(false)
    expect(r.source).toBe('error')
    expect(r.detail).toMatch(/no DNS probe hosts/)
    expect(deps.lookup).not.toHaveBeenCalled()
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('G25: monitor offline -> offline, no lookup, no recheck', async () => {
    const deps = makeDeps({
      status: jest.fn((): ConnectivityStatus => 'offline')
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: true, source: 'monitor' })
    expect(deps.lookup).not.toHaveBeenCalled()
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('G25: no routable address -> offline without a lookup, recheck once', async () => {
    const deps = makeDeps({ networkInterfaces: jest.fn(() => loopback) })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: true, source: 'no-interface' })
    expect(deps.lookup).not.toHaveBeenCalled()
    expect(deps.onFreshOffline).toHaveBeenCalledTimes(1)
    expect(deps.onFreshOffline).toHaveBeenCalledWith('launch', 'no-interface')
  })

  it('G25: failed lookup -> offline dns-failed with the code, recheck once', async () => {
    const deps = makeDeps({
      lookup: jest.fn(() =>
        Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))
      )
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({
      offline: true,
      source: 'dns-failed',
      detail: 'ENOTFOUND'
    })
    expect(deps.onFreshOffline).toHaveBeenCalledTimes(1)
  })

  it('G25: resolved lookup -> online dns-ok, no recheck', async () => {
    const deps = makeDeps()
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: false, source: 'dns-ok' })
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('G25: lookup that never settles -> dns-timeout, not offline, timer cleared', async () => {
    jest.useFakeTimers()
    try {
      const deps = makeDeps({ lookup: jest.fn(() => new Promise(() => {})) })
      const p = checkConnectivityNow('launch', { ...deps, timeoutMs: 1500 })
      await jest.advanceTimersByTimeAsync(1500)
      const r = await p
      expect(r).toMatchObject({ offline: false, source: 'dns-timeout' })
      expect(deps.onFreshOffline).not.toHaveBeenCalled()
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('G25: the cap timer is unref()d', async () => {
    const unref = jest.fn()
    const realSetTimeout = global.setTimeout
    const spy = jest
      .spyOn(global, 'setTimeout')
      .mockImplementation(((handler: () => void, ms?: number) =>
        Object.assign(realSetTimeout(handler, ms), { unref })) as never)
    try {
      await checkConnectivityNow('launch', makeDeps())
      expect(unref).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('G25: a throwing dep resolves error, never rejects', async () => {
    const deps = makeDeps({
      networkInterfaces: jest.fn(() => {
        throw new Error('boom')
      })
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: false, source: 'error' })
  })

  it('CR-01: check-online + routable + resolving lookup -> online dns-ok, no hook', async () => {
    const deps = makeDeps({
      status: jest.fn((): ConnectivityStatus => 'check-online')
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: false, source: 'dns-ok' })
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('CR-01: check-online + no routable interface -> offline, hook not called', async () => {
    const deps = makeDeps({
      status: jest.fn((): ConnectivityStatus => 'check-online'),
      networkInterfaces: jest.fn(() => loopback)
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: true, source: 'no-interface' })
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('CR-01: check-online + every lookup rejects -> dns-failed, hook not called', async () => {
    const deps = makeDeps({
      status: jest.fn((): ConnectivityStatus => 'check-online'),
      lookup: jest.fn(() =>
        Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))
      )
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: true, source: 'dns-failed' })
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('WR-03: throwing hook on no-interface keeps the offline result and warns', async () => {
    const deps = makeDeps({
      networkInterfaces: jest.fn(() => loopback),
      onFreshOffline: jest.fn(() => {
        throw new Error('hook')
      })
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: true, source: 'no-interface' })
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('WR-03: throwing hook on dns-failed keeps the offline result', async () => {
    const deps = makeDeps({
      lookup: jest.fn(() =>
        Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))
      ),
      onFreshOffline: jest.fn(() => {
        throw new Error('hook')
      })
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: true, source: 'dns-failed' })
  })

  it('WR-01: first host fails, second resolves -> dns-ok', async () => {
    const deps = makeDeps({
      lookup: jest.fn((host: string) =>
        host === 'a.test'
          ? Promise.reject(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))
          : Promise.resolve({ address: '1.2.3.4' })
      )
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({ offline: false, source: 'dns-ok' })
    expect(deps.onFreshOffline).not.toHaveBeenCalled()
  })

  it('WR-01: both hosts fail -> dns-failed naming the first host code', async () => {
    const deps = makeDeps({
      lookup: jest.fn((host: string) =>
        Promise.reject(
          Object.assign(new Error('x'), {
            code: host === 'a.test' ? 'ENOTFOUND' : 'ETIMEOUT'
          })
        )
      )
    })
    const r = await checkConnectivityNow('launch', deps)
    expect(r).toMatchObject({
      offline: true,
      source: 'dns-failed',
      detail: 'ENOTFOUND'
    })
  })

  it('WR-01: first fails, second never settles -> dns-timeout, timer cleared', async () => {
    jest.useFakeTimers()
    try {
      const deps = makeDeps({
        lookup: jest.fn((host: string) =>
          host === 'a.test'
            ? Promise.reject(
                Object.assign(new Error('x'), { code: 'ENOTFOUND' })
              )
            : new Promise(() => {})
        )
      })
      const p = checkConnectivityNow('launch', { ...deps, timeoutMs: 1500 })
      await jest.advanceTimersByTimeAsync(1500)
      const r = await p
      expect(r).toMatchObject({ offline: false, source: 'dns-timeout' })
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('G25: logs exactly one line per call', async () => {
    await checkConnectivityNow('launch', makeDeps())
    expect(mockLogInfo).toHaveBeenCalledTimes(1)
    expect(String(mockLogInfo.mock.calls[0][0])).toMatch(
      /^Connectivity: fresh check \(launch\) -> online via dns-ok in \d+ms$/
    )
  })
})
