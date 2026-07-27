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

  // WR-01 (34.4-REVIEW.md): a rejecting getSteamUserInfo must not propagate
  // out of this promise -- performSteamLogout depends on it always settling
  // so it can call exactly one of onSignedOut / onSignOutFailed.
  it('does not reject when a poll attempt rejects — a transient read failure must not escape the promise', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockRejectedValue(new Error('transport error'))

    await expect(
      waitForSteamSignedOut(getSteamUserInfo, {
        maxAttempts: 3,
        delay: noopDelay
      })
    ).resolves.toBe(false)
  })

  it('treats a rejection as "not yet confirmed" and keeps polling within the existing budget — transient, not terminal', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo
      .mockRejectedValueOnce(new Error('transport error'))
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce(undefined)

    const result = await waitForSteamSignedOut(getSteamUserInfo, {
      maxAttempts: 5,
      delay: noopDelay
    })

    // A signed-out confirmation after two failed reads still counts —
    // failed reads are retried, not treated as a definitive failure.
    expect(result).toBe(true)
    expect(getSteamUserInfo).toHaveBeenCalledTimes(3)
  })

  it('returns false (never throws) when every single poll attempt rejects — exhausting the budget is an honest timeout, not a crash', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockRejectedValue(new Error('transport error'))

    const result = await waitForSteamSignedOut(getSteamUserInfo, {
      maxAttempts: 4,
      delay: noopDelay
    })

    expect(result).toBe(false)
    expect(getSteamUserInfo).toHaveBeenCalledTimes(4)
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

  // WR-01: the module's own docstring promises "never both, never neither".
  // Before the fix, a rejecting getSteamUserInfo propagated straight out of
  // performSteamLogout and NEITHER callback ran -- this proves that can no
  // longer happen, for every poll attempt rejecting, not just one.
  it('calls exactly one of onSignedOut / onSignOutFailed even when every getSteamUserInfo read rejects — never neither', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo.mockRejectedValue(new Error('transport error'))

    const logoutSteam = jest.fn()
    const onSignedOut = jest.fn()
    const onSignOutFailed = jest.fn()

    await expect(
      performSteamLogout({
        logoutSteam,
        getSteamUserInfo,
        onSignedOut,
        onSignOutFailed,
        waitOptions: { maxAttempts: 3, delay: noopDelay }
      })
    ).resolves.toBeUndefined()

    const totalCallbackInvocations =
      onSignedOut.mock.calls.length + onSignOutFailed.mock.calls.length
    expect(totalCallbackInvocations).toBe(1)
    expect(onSignedOut).not.toHaveBeenCalled()
    expect(onSignOutFailed).toHaveBeenCalledTimes(1)
  })

  it('calls onSignedOut when a rejecting read is followed by a confirmed signed-out read', async () => {
    const getSteamUserInfo = jest.fn<Promise<SteamUserData | undefined>, []>()
    getSteamUserInfo
      .mockRejectedValueOnce(new Error('transport error'))
      .mockResolvedValueOnce(undefined)

    const logoutSteam = jest.fn()
    const onSignedOut = jest.fn()
    const onSignOutFailed = jest.fn()

    await performSteamLogout({
      logoutSteam,
      getSteamUserInfo,
      onSignedOut,
      onSignOutFailed,
      waitOptions: { maxAttempts: 5, delay: noopDelay }
    })

    const totalCallbackInvocations =
      onSignedOut.mock.calls.length + onSignOutFailed.mock.calls.length
    expect(totalCallbackInvocations).toBe(1)
    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(onSignOutFailed).not.toHaveBeenCalled()
  })
})
