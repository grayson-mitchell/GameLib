/**
 * 66.4-09: the Steam install runtime holds per-instance state. Two runtimes share no app order,
 * lock, job, poll or hold entry; construction arms no timer.
 */
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createSteamInstallRuntime } from '../steamInstallRuntime'
import { createTestHostServices } from '../../../testUtils/testHostServices'
import type { RustJobEvent } from '../depotRust/types'

const transport = () => ({
  ...createTestHostServices(),
  appRuntime: createTestAppRuntime()
})

describe('createSteamInstallRuntime', () => {
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

  it('install poll state, notice sequence and bridge-finalized set are per instance', () => {
    const a = createSteamInstallRuntime(transport())
    const b = createSteamInstallRuntime(transport())
    a.polls.markBridgeInstallFinalized('730')
    expect(a.polls.isBridgeInstallFinalized('730')).toBe(true)
    expect(b.polls.isBridgeInstallFinalized('730')).toBe(false)
    a.polls.clearBridgeInstallFinalized('730')
    expect(a.polls.isBridgeInstallFinalized('730')).toBe(false)
    expect([
      a.polls.nextSteamRequestNoticeSeq(),
      a.polls.nextSteamRequestNoticeSeq()
    ]).toEqual([1, 2])
    expect(b.polls.nextSteamRequestNoticeSeq()).toBe(1)
    a.polls.activePolls.set('1', {} as never)
    expect(b.polls.activePolls.size).toBe(0)
    expect(a.uninstallPolls.activeUninstallPolls).not.toBe(
      b.uninstallPolls.activeUninstallPolls
    )
  })

  it('restart-hold bookkeeping fails closed through a rearm cycle and reads its own polls', async () => {
    const a = createSteamInstallRuntime(transport())
    const b = createSteamInstallRuntime(transport())
    const { restartHold } = a
    a.polls.activePolls.set('5', { steamHold: 'holding' } as never)
    a.polls.activePolls.set('6', { steamHold: 'unprobed' } as never)
    restartHold.pendingSteamHoldRearm.add('7')
    const installed = new Map<number, string>([
      [5, 'x'],
      [6, 'y'],
      [7, 'z'],
      [8, 'w']
    ])
    expect([
      ...(await restartHold.withoutSteamRestartHolds(installed)).keys()
    ]).toEqual([6, 8])
    expect(restartHold.getReconcileRanDuringRearm()).toBe(true)
    restartHold.setReconcileRanDuringRearm(false)
    restartHold.pendingSteamHoldRearm.delete('7')
    expect(restartHold.getReconcileRanDuringRearm()).toBe(false)
    // Another runtime has no hold for any of these apps.
    const other = new Map<number, string>([[5, 'x']])
    expect((await b.restartHold.withoutSteamRestartHolds(other)).size).toBe(1)
  })
})

// Plan 80-26: the polls flag now defaults to rust; this file exercises the ts arm, so pin it.
const prevPollsImpl = process.env.GAMELIB_STEAM_POLLS
beforeAll(() => {
  process.env.GAMELIB_STEAM_POLLS = 'ts'
})
afterAll(() => {
  if (prevPollsImpl === undefined) delete process.env.GAMELIB_STEAM_POLLS
  else process.env.GAMELIB_STEAM_POLLS = prevPollsImpl
})
