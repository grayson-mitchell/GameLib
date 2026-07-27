/**
 * Behavioral unit tests for SteamSignOut.ts (Phase 34.4 gap fix,
 * REQ-34.4-02 / live-gate item 2). Proves items 2 and 3 of the gap-fix
 * task's required coverage directly, since `waitForSteamSignedOut` and
 * `performSteamLogout` are plain async functions with no `window`/DOM
 * dependency -- unlike GlobalState.tsx itself, which is not safely
 * importable under this project's `node`-environment frontend jest project
 * (see jest.config.js's docstring; GlobalStateSteamLogout.test.ts covers
 * item 1 via a source-text structural gate instead, for that reason).
 */
import type { SteamUserData } from 'common/types/steam'
import { performSteamLogout, waitForSteamSignedOut } from '../SteamSignOut'

const noopDelay = async (): Promise<void> => {
  // no-op: tests control iteration count via mock call counts, not real time
}

describe('waitForSteamSignedOut', () => {
  it('resolves true immediately when getSteamUserInfo already reports signed out (undefined)', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockResolvedValue(undefined)

    await expect(waitForSteamSignedOut(getSteamUserInfo)).resolves.toBe(true)
    expect(getSteamUserInfo).toHaveBeenCalledTimes(1)
  })

  it('polls until the signal flips to signed-out rather than trusting a single stale read', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo
      .mockResolvedValueOnce({ username: 'still-here-1' })
      .mockResolvedValueOnce({ username: 'still-here-2' })
      .mockResolvedValueOnce(undefined)

    const result = await waitForSteamSignedOut(getSteamUserInfo, {
      delay: noopDelay
    })

    expect(result).toBe(true)
    expect(getSteamUserInfo).toHaveBeenCalledTimes(3)
  })

  it('returns false and stops after maxAttempts when never signed out — bounded, not infinite', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockResolvedValue({ username: 'still-here' })

    const result = await waitForSteamSignedOut(getSteamUserInfo, {
      maxAttempts: 5,
      delay: noopDelay
    })

    expect(result).toBe(false)
    expect(getSteamUserInfo).toHaveBeenCalledTimes(5)
  })
})

describe('performSteamLogout', () => {
  it('always fires logoutSteam unconditionally — proves no guard suppresses the real send anymore', async () => {
    const logoutSteam = jest.fn()
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockResolvedValue(undefined)

    await performSteamLogout({
      logoutSteam,
      getSteamUserInfo,
      onSignedOut: jest.fn(),
      onSignOutFailed: jest.fn(),
      waitOptions: { delay: noopDelay }
    })

    expect(logoutSteam).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onSignedOut until the signed-out signal is confirmed — the race fix', async () => {
    const order: string[] = []
    let resolveFirstCheck: (value: SteamUserData | undefined) => void = () => {
      throw new Error('resolveFirstCheck not assigned')
    }
    const firstCheck = new Promise<SteamUserData | undefined>((resolve) => {
      resolveFirstCheck = resolve
    })

    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockImplementationOnce(() => {
      order.push('poll-1')
      return firstCheck
    })

    const logoutSteam = jest.fn(() => order.push('logoutSteam'))
    const onSignedOut = jest.fn(() => order.push('onSignedOut'))
    const onSignOutFailed = jest.fn(() => order.push('onSignOutFailed'))

    const flowPromise = performSteamLogout({
      logoutSteam,
      getSteamUserInfo,
      onSignedOut,
      onSignOutFailed,
      waitOptions: { delay: noopDelay }
    })

    // Flush pending microtasks so logoutSteam() and the first poll read run,
    // while the first read's own promise is still deliberately unresolved.
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(order).toEqual(['logoutSteam', 'poll-1'])
    expect(onSignedOut).not.toHaveBeenCalled()

    // Now let the poll observe the signed-out state.
    resolveFirstCheck(undefined)
    await flowPromise

    expect(order).toEqual(['logoutSteam', 'poll-1', 'onSignedOut'])
    expect(onSignOutFailed).not.toHaveBeenCalled()
  })

  it('surfaces onSignOutFailed — never onSignedOut — when the poll window is exhausted (honest failure, not a silent success)', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockResolvedValue({ username: 'still-here' })

    const logoutSteam = jest.fn()
    const onSignedOut = jest.fn()
    const onSignOutFailed = jest.fn()

    await performSteamLogout({
      logoutSteam,
      getSteamUserInfo,
      onSignedOut,
      onSignOutFailed,
      waitOptions: { maxAttempts: 3, delay: noopDelay }
    })

    expect(logoutSteam).toHaveBeenCalledTimes(1)
    expect(getSteamUserInfo).toHaveBeenCalledTimes(3)
    expect(onSignedOut).not.toHaveBeenCalled()
    expect(onSignOutFailed).toHaveBeenCalledTimes(1)
  })
})
