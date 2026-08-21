/**
 * Unit tests for withTimeout (Phase 30 gap closure, 30-07, G-30-02) — the
 * reusable Promise.race timeout wrapper that bounds every pre-download
 * steam-user CM call. Self-contained: touches NO DecompressPool/worker_threads
 * (unlike most of depot.test.ts), so full jest fake timers are safe here
 * without the real-timer-dependent-suite caveats documented in depot.test.ts.
 */
import {
  withTimeout,
  isTimeoutError,
  STEAM_PICS_TIMEOUT_MS,
  STEAM_PICS_BULK_TIMEOUT_MS
} from '../withTimeout'

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('WR-02: stamps the timeout Error with isTimeout so the retry layer can fail fast, and isTimeoutError recognizes only that error', async () => {
    jest.useFakeTimers()
    const neverSettles = new Promise<string>(() => {})

    const race = withTimeout(neverSettles, 5000, 'getOwnedSets getProductInfo')
    // Attach the assertion BEFORE advancing so the rejection is handled.
    const assertion = race.then(
      () => {
        throw new Error('expected withTimeout to reject on timeout')
      },
      (err) => {
        expect(isTimeoutError(err)).toBe(true)
        expect((err as { isTimeout?: unknown }).isTimeout).toBe(true)
      }
    )

    await jest.advanceTimersByTimeAsync(5000)
    await assertion

    // A plain error / non-timeout value is NOT classified as a timeout — the
    // retry fail-fast must not over-broaden onto genuine transient drops.
    expect(isTimeoutError(new Error('ECONNRESET'))).toBe(false)
    expect(isTimeoutError({ isTimeout: false })).toBe(false)
    expect(isTimeoutError(null)).toBe(false)
    expect(isTimeoutError('timed out')).toBe(false)
  })

  it('WR-03: the bulk PICS bound is strictly larger than the single-app bound (large-library #144 headroom)', () => {
    expect(STEAM_PICS_BULK_TIMEOUT_MS).toBeGreaterThan(STEAM_PICS_TIMEOUT_MS)
  })

  it('resolves with the wrapped promise value when it settles before the bound (happy path — transparent, protects the Electron path)', async () => {
    const result = await withTimeout(
      Promise.resolve('healthy-value'),
      25000,
      'fetchInstalldir getProductInfo'
    )
    expect(result).toBe('healthy-value')
  })

  it('rejects with an Error whose message contains the label and the ms bound when the promise never settles past ms', async () => {
    jest.useFakeTimers()
    const neverSettles = new Promise<string>(() => {
      // Intentionally never resolves/rejects — simulates a stale-but-present
      // CM socket that queues the job and never answers.
    })

    const race = withTimeout(
      neverSettles,
      5000,
      'fetchInstalldir getProductInfo'
    )
    const assertion = expect(race).rejects.toThrow(
      /fetchInstalldir getProductInfo timed out after 5000ms/
    )

    await jest.advanceTimersByTimeAsync(5000)
    await assertion
  })

  it('rejects with the ORIGINAL error (does not mask it) when the wrapped promise rejects before ms, and leaves no dangling timer', async () => {
    jest.useFakeTimers()
    const originalError = new Error('boom: ECONNRESET')

    await expect(
      withTimeout(
        Promise.reject(originalError),
        5000,
        'fetchInstalldir getProductInfo'
      )
    ).rejects.toBe(originalError)

    // The race settled on the promise branch, not the timeout branch — the
    // setTimeout handle must have been cleared in withTimeout's finally, not
    // left dangling until the 5000ms bound fires.
    expect(jest.getTimerCount()).toBe(0)
  })
})
