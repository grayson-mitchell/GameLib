/**
 * 66.4-09: the Steam install runtime holds per-instance state. Two runtimes share no app order,
 * lock or job entry; construction arms no timer.
 */
import * as logger from 'backend/logger'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createSteamInstallRuntime } from '../steamInstallRuntime'
import { createTestHostServices } from '../../../testUtils/testHostServices'
import type { RustJobEvent } from '../depotRust/types'

const transport = () => ({
  ...createTestHostServices(),
  appRuntime: createTestAppRuntime()
})

describe('createSteamInstallRuntime', () => {
  beforeEach(() => {
    // invokeSteamPoll logs the channel; no writer is initialised in a unit test.
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  it('arms no timer at construction', () => {
    jest.useFakeTimers()
    try {
      createSteamInstallRuntime(transport())
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })

  it('two runtimes share no appinfo order', async () => {
    const a = createSteamInstallRuntime(transport())
    const b = createSteamInstallRuntime(transport())
    await a.appinfoOrder.withAppInfoOrderCapture({}, () =>
      Promise.resolve({ apps: { 10: { depotOrder: ['3', '2', '1'] } } })
    )
    expect(a.appinfoOrder.getAppInfoDepotOrder('10')).toEqual(['3', '2', '1'])
    expect(b.appinfoOrder.getAppInfoDepotOrder('10')).toBeUndefined()
  })

  it('two runtimes share no shared-redist lock and the temp sequence is per instance', async () => {
    const a = createSteamInstallRuntime(transport())
    const b = createSteamInstallRuntime(transport())
    expect([
      a.sharedRedistLocks.nextTmpSeq(),
      a.sharedRedistLocks.nextTmpSeq()
    ]).toEqual([1, 2])
    expect(b.sharedRedistLocks.nextTmpSeq()).toBe(1)

    const order: string[] = []
    let releaseFirst: () => void = () => undefined
    const first = a.sharedRedistLocks.withSharedRedistLock('k', async () => {
      order.push('first-start')
      await new Promise<void>((r) => (releaseFirst = r))
      order.push('first-end')
    })
    const second = a.sharedRedistLocks.withSharedRedistLock('k', () => {
      order.push('second')
      return Promise.resolve()
    })
    // A lock on the other runtime does not wait for `k` on this one.
    await b.sharedRedistLocks.withSharedRedistLock('k', () => {
      order.push('other-runtime')
      return Promise.resolve()
    })
    await Promise.resolve()
    expect(order).toEqual(['first-start', 'other-runtime'])
    releaseFirst()
    await Promise.all([first, second])
    expect(order).toEqual([
      'first-start',
      'other-runtime',
      'first-end',
      'second'
    ])
  })

  it('depot job registries are independent and drop stale or foreign events', () => {
    const a = createSteamInstallRuntime(transport())
    const b = createSteamInstallRuntime(transport())
    const seen: number[] = []
    const dispose = a.depotJobs.registerActiveDepotJob('j', {
      appId: '1',
      refreshRequestCode: () => Promise.resolve(null),
      onEvent: (ev) => seen.push(ev.seq)
    })
    const ev = (seq: number): RustJobEvent =>
      ({
        jobId: 'j',
        seq,
        kind: 'warning',
        message: 'm',
        count: 1
      }) as RustJobEvent
    expect(a.depotJobs.dispatchDepotJobEvent(ev(0))).toBe(true)
    expect(a.depotJobs.dispatchDepotJobEvent(ev(0))).toBe(false)
    expect(b.depotJobs.dispatchDepotJobEvent(ev(1))).toBe(false)
    expect(b.depotJobs.lookupActiveDepotJob('j')).toBeUndefined()
    expect(seen).toEqual([0])
    dispose()
    expect(a.depotJobs.lookupActiveDepotJob('j')).toBeUndefined()
  })
})
