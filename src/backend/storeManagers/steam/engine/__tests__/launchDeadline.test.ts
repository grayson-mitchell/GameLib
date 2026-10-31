import { logInfo, logWarning } from 'backend/logger'
import {
  LAUNCH_DEADLINE_MS,
  armLaunchDeadline,
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
    const d = armLaunchDeadline({ appId: '620', timeoutMs: 1000, onDeadline })
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
    const d = armLaunchDeadline({ appId: '620', timeoutMs: 1000, onDeadline })
    d.cancel('first-match')
    jest.advanceTimersByTime(5000)
    expect(onDeadline).not.toHaveBeenCalled()
    expect(d.state).toBe('cancelled')
    expect(jest.getTimerCount()).toBe(0)
  })

  test('cancel after fire is a no-op and a second fire is impossible', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ appId: '620', timeoutMs: 10, onDeadline })
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
      appId: '620',
      timeoutMs: 1000,
      onDeadline: first
    })
    armLaunchDeadline({ appId: '620', timeoutMs: 1000, onDeadline: second })
    expect(d1.state).toBe('cancelled')
    jest.advanceTimersByTime(1000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  test('cancelLaunchDeadline cancels active; unknown appId is a no-op', () => {
    const onDeadline = jest.fn()
    const d = armLaunchDeadline({ appId: '620', timeoutMs: 1000, onDeadline })
    cancelLaunchDeadline('999', 'launcher-exited')
    expect(d.state).toBe('armed')
    cancelLaunchDeadline('620', 'launcher-exited')
    expect(d.state).toBe('cancelled')
    expect(__activeLaunchDeadlineCount()).toBe(0)
  })

  test('throwing or rejecting onDeadline is caught and the entry removed', async () => {
    armLaunchDeadline({
      appId: '620',
      timeoutMs: 10,
      onDeadline: () => {
        throw new Error('boom')
      }
    })
    jest.advanceTimersByTime(10)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    armLaunchDeadline({
      appId: '620',
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
    armLaunchDeadline({ appId: '620', onDeadline })
    jest.advanceTimersByTime(179_999)
    expect(onDeadline).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(onDeadline).toHaveBeenCalledTimes(1)
  })

  test('timer handle is unref d', () => {
    const unref = jest.fn()
    armLaunchDeadline({
      appId: '620',
      onDeadline: jest.fn(),
      setTimer: () => ({ unref }),
      clearTimer: jest.fn()
    })
    expect(unref).toHaveBeenCalledTimes(1)
  })

  test('non-numeric appId throws TypeError and arms nothing', () => {
    expect(() =>
      armLaunchDeadline({ appId: '../x', onDeadline: jest.fn() })
    ).toThrow(TypeError)
    expect(__activeLaunchDeadlineCount()).toBe(0)
    expect(jest.getTimerCount()).toBe(0)
  })
})
