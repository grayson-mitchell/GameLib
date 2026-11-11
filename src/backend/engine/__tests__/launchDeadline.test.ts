import { logInfo, logWarning } from 'backend/logger'
import { createFakeClock } from 'backend/testUtils/fakeClock'
import {
  LAUNCH_DEADLINE_MS,
  bindDeadlineToMonitor,
  createLaunchDeadlines
} from '../launchDeadline'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

let clock: ReturnType<typeof createFakeClock>
let deadlines: ReturnType<typeof createLaunchDeadlines>
let armLaunchDeadline: typeof deadlines.armLaunchDeadline
let cancelLaunchDeadline: typeof deadlines.cancelLaunchDeadline
const activeCount = () => deadlines.activeCount()
beforeEach(() => {
  clock = createFakeClock()
  deadlines = createLaunchDeadlines({ clock })
  armLaunchDeadline = deadlines.armLaunchDeadline
  cancelLaunchDeadline = deadlines.cancelLaunchDeadline
})

describe('launchDeadline', () => {
  test('fires once at the timeout, not before', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 1000, onDeadline })
    clock.advance(999)
    expect(onDeadline).not.toHaveBeenCalled()
    clock.advance(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
    expect(d.state).toBe('fired')
    expect(clock.pendingCount()).toBe(0)
    expect(activeCount()).toBe(0)
  })

  test('cancel before expiry prevents firing', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 1000, onDeadline })
    d.cancel('first-match')
    clock.advance(5000)
    expect(onDeadline).not.toHaveBeenCalled()
    expect(d.state).toBe('cancelled')
    expect(clock.pendingCount()).toBe(0)
  })

  test('cancel after fire is a no-op and a second fire is impossible', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 10, onDeadline })
    clock.advance(10)
    d.cancel('first-match')
    expect(d.state).toBe('fired')
    clock.advance(1000)
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  test('arming again for the same appId supersedes the first', () => {
    const first = jest.fn()
    const second = jest.fn()
    const d1 = armLaunchDeadline({
      key: '620',
      timeoutMs: 1000,
      onDeadline: first
    })
    armLaunchDeadline({ key: '620', timeoutMs: 1000, onDeadline: second })
    expect(d1.state).toBe('cancelled')
    clock.advance(1000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('cancelLaunchDeadline cancels active; unknown appId is a no-op', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 1000, onDeadline })
    cancelLaunchDeadline('999', 'launcher-exited')
    expect(d.state).toBe('armed')
    cancelLaunchDeadline('620', 'launcher-exited')
    expect(d.state).toBe('cancelled')
    expect(activeCount()).toBe(0)
  })

  test('throwing or rejecting onDeadline is caught and the entry removed', async () => {
    armLaunchDeadline({
      key: '620',
      timeoutMs: 10,
      onDeadline: () => {
        throw new Error('boom')
      }
    })
    clock.advance(10)
    expect(activeCount()).toBe(0)
    armLaunchDeadline({
      key: '620',
      timeoutMs: 10,
      onDeadline: () => Promise.reject(new Error('nope'))
    })
    clock.advance(10)
    await Promise.resolve()
    await Promise.resolve()
    expect(activeCount()).toBe(0)
    expect(
      (logWarning as jest.Mock).mock.calls.filter((c) =>
        JSON.stringify(c).includes('failed')
      ).length
    ).toBe(2)
    expect(logInfo).toBeDefined()
  })

  test('default timeout is 180_000 ms', () => {
    expect(LAUNCH_DEADLINE_MS).toBe(180_000)
    const onDeadline = jest.fn()
    armLaunchDeadline({ key: '620', onDeadline })
    clock.advance(179_999)
    expect(onDeadline).not.toHaveBeenCalled()
    clock.advance(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  test('the timer runs on the injected clock and is never keep-alive (unref d)', () => {
    armLaunchDeadline({ key: '620', onDeadline: jest.fn() })
    expect(clock.pendingCount()).toBe(1)
    expect(clock.keepAliveReasons()).toEqual([])
    clock.advance(LAUNCH_DEADLINE_MS)
    expect(clock.pendingCount()).toBe(0)
  })

  test('two registries share no deadline', () => {
    const other = createLaunchDeadlines({ clock })
    armLaunchDeadline({ key: '620', onDeadline: jest.fn() })
    expect(other.activeCount()).toBe(0)
  })

  test('non-numeric appId throws TypeError and arms nothing', () => {
    expect(() =>
      armLaunchDeadline({ key: '../x', onDeadline: jest.fn() })
    ).toThrow(TypeError)
    expect(activeCount()).toBe(0)
    expect(clock.pendingCount()).toBe(0)
  })

  describe('bindDeadlineToMonitor (CR-01)', () => {
    test('null handle stands the armed deadline down and never fires', () => {
      const onDeadline = jest.fn()
      const log = jest.fn()
      const d = armLaunchDeadline({ key: '620', onDeadline })
      expect(bindDeadlineToMonitor(d, null, log)).toBeNull()
      expect(d.state).toBe('cancelled')
      expect(log).toHaveBeenCalledTimes(1)
      expect(log.mock.calls[0][0]).toContain('monitor-unavailable')
      clock.advance(LAUNCH_DEADLINE_MS)
      expect(onDeadline).not.toHaveBeenCalled()
    })

    test('a live handle leaves the deadline armed and is returned', () => {
      const log = jest.fn()
      const handle = { stop: jest.fn() }
      const d = armLaunchDeadline({ key: '620', onDeadline: jest.fn() })
      expect(bindDeadlineToMonitor(d, handle, log)).toBe(handle)
      expect(d.state).toBe('armed')
      expect(log).not.toHaveBeenCalled()
    })

    test('an undefined deadline does not throw or log', () => {
      const log = jest.fn()
      expect(() => bindDeadlineToMonitor(undefined, null, log)).not.toThrow()
      expect(log).not.toHaveBeenCalled()
    })

    test('an already-fired deadline stays fired', () => {
      const log = jest.fn()
      const d = armLaunchDeadline({
        key: '620',
        timeoutMs: 10,
        onDeadline: jest.fn()
      })
      clock.advance(10)
      bindDeadlineToMonitor(d, null, log)
      expect(d.state).toBe('fired')
      expect(log).not.toHaveBeenCalled()
    })
  })
})

describe('launchDeadline store-prefixed keys', () => {
  test('arms a prefixed key independently of a Steam key', () => {
    const a = armLaunchDeadline({ key: 'gog:1', onDeadline: jest.fn() })
    const b = armLaunchDeadline({ key: '620', onDeadline: jest.fn() })
    expect(a.state).toBe('armed')
    expect(b.state).toBe('armed')
    expect(activeCount()).toBe(2)
  })

  test('an invalid key throws TypeError', () => {
    expect(() =>
      armLaunchDeadline({ key: 'gog:../x', onDeadline: jest.fn() })
    ).toThrow(TypeError)
  })

  test('the timer is not keep-alive (unref d by the clock default)', () => {
    armLaunchDeadline({ key: 'gog:1', onDeadline: jest.fn() })
    expect(clock.keepAliveReasons()).toEqual([])
  })
})
