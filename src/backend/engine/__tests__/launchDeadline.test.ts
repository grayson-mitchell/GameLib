import { logInfo, logWarning } from 'backend/logger'
import {
  LAUNCH_DEADLINE_MS,
  armLaunchDeadline,
  bindDeadlineToMonitor,
  cancelLaunchDeadline,
  __activeLaunchDeadlineCount
} from '../launchDeadline'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

describe('launchDeadline', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    cancelLaunchDeadline('620', 'launch-error')
    jest.useRealTimers()
  })

  test('fires once at the timeout, not before', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 1000, onDeadline })
    jest.advanceTimersByTime(999)
    expect(onDeadline).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
    expect(d.state).toBe('fired')
    expect(jest.getTimerCount()).toBe(0)
    expect(__activeLaunchDeadlineCount()).toBe(0)
  })

  test('cancel before expiry prevents firing', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 1000, onDeadline })
    d.cancel('first-match')
    jest.advanceTimersByTime(5000)
    expect(onDeadline).not.toHaveBeenCalled()
    expect(d.state).toBe('cancelled')
    expect(jest.getTimerCount()).toBe(0)
  })

  test('cancel after fire is a no-op and a second fire is impossible', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ key: '620', timeoutMs: 10, onDeadline })
    jest.advanceTimersByTime(10)
    d.cancel('first-match')
    expect(d.state).toBe('fired')
    jest.advanceTimersByTime(1000)
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
    jest.advanceTimersByTime(1000)
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
    expect(__activeLaunchDeadlineCount()).toBe(0)
  })

  test('throwing or rejecting onDeadline is caught and the entry removed', async () => {
    armLaunchDeadline({
      key: '620',
      timeoutMs: 10,
      onDeadline: () => {
        throw new Error('boom')
      }
    })
    jest.advanceTimersByTime(10)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    armLaunchDeadline({
      key: '620',
      timeoutMs: 10,
      onDeadline: () => Promise.reject(new Error('nope'))
    })
    jest.advanceTimersByTime(10)
    await Promise.resolve()
    await Promise.resolve()
    expect(__activeLaunchDeadlineCount()).toBe(0)
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
    jest.advanceTimersByTime(179_999)
    expect(onDeadline).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  test('timer handle is unref d', () => {
    const unref = jest.fn()
    armLaunchDeadline({
      key: '620',
      onDeadline: jest.fn(),
      setTimer: () => ({ unref }),
      clearTimer: jest.fn()
    })
    expect(unref).toHaveBeenCalledTimes(1)
  })

  test('non-numeric appId throws TypeError and arms nothing', () => {
    expect(() =>
      armLaunchDeadline({ key: '../x', onDeadline: jest.fn() })
    ).toThrow(TypeError)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
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
      jest.advanceTimersByTime(LAUNCH_DEADLINE_MS)
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
      jest.advanceTimersByTime(10)
      bindDeadlineToMonitor(d, null, log)
      expect(d.state).toBe('fired')
      expect(log).not.toHaveBeenCalled()
    })
  })
})

describe('launchDeadline store-prefixed keys', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    cancelLaunchDeadline('gog:1', 'launch-error')
    cancelLaunchDeadline('620', 'launch-error')
    jest.useRealTimers()
  })

  test('arms a prefixed key independently of a Steam key', () => {
    const a = armLaunchDeadline({ key: 'gog:1', onDeadline: jest.fn() })
    const b = armLaunchDeadline({ key: '620', onDeadline: jest.fn() })
    expect(a.state).toBe('armed')
    expect(b.state).toBe('armed')
    expect(__activeLaunchDeadlineCount()).toBe(2)
  })

  test('an invalid key throws TypeError', () => {
    expect(() =>
      armLaunchDeadline({ key: 'gog:../x', onDeadline: jest.fn() })
    ).toThrow(TypeError)
  })

  test('unref is called on the timer handle', () => {
    const unref = jest.fn()
    armLaunchDeadline({
      key: 'gog:1',
      onDeadline: jest.fn(),
      setTimer: () => ({ unref })
    })
    expect(unref).toHaveBeenCalled()
  })
})
