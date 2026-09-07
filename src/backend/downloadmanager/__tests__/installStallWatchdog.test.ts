/**
 * 260817-dib: RED/GREEN coverage for the runner-agnostic install stall
 * watchdog. See installStallWatchdog.ts's top-of-file doc comment for the
 * full rationale — the short version: `withStallTimeout` re-arms its
 * deadline on an OBSERVED ADVANCE in `backendEvents`'s
 * `progressUpdate-${appName}` payloads (percent increased, or the `bytes`
 * string changed), never on event ARRIVAL. `steam/depot.ts` runs a 1s
 * heartbeat that emits progress whether or not bytes moved — an
 * arrival-armed watchdog would never trip for a wedged Steam install.
 */
import { backendEvents } from 'backend/backend_events'
import {
  INSTALL_NO_PROGRESS_TIMEOUT_MS,
  isStallError,
  withStallTimeout,
  type StallError
} from '../installStallWatchdog'
import {
  createAbortController,
  deleteAbortController
} from 'backend/utils/aborthandler/aborthandler'
import { logError } from 'backend/logger'

// 260907-sxp T-C: bare jest.fn()s with no implementation, per this project's
// jest.config.js `resetMocks: true` trap (see installStallWatchdog.test.ts's
// own describe block below) — a factory that spreads `jest.requireActual`
// and wraps a real implementation loses that implementation between tests
// under `resetMocks: true`. `aborthandler.ts` imports `logError` from this
// same `backend/logger` specifier, so this mock also covers the registry's
// own "Could not find a matching abort controller" ERROR log — the log T-C
// asserts the absence of.
jest.mock('backend/logger', () => ({
  LogPrefix: { Backend: 'Backend', DownloadManager: 'DownloadManager' },
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn()
}))

function emitProgress(
  appName: string,
  progress: { percent?: number; bytes?: string }
) {
  backendEvents.emit(`progressUpdate-${appName}`, {
    appName,
    runner: 'steam',
    status: 'installing',
    progress: { bytes: '', eta: '', ...progress }
  })
}

describe('withStallTimeout', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  it('RED vs the old ceiling (decisive): advancing progress every 100s survives 20 minutes of fake time', async () => {
    jest.useFakeTimers()
    const appName = 'never-settles-advancing'
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      INSTALL_NO_PROGRESS_TIMEOUT_MS,
      'test'
    )

    let settled = false
    guarded.then(
      () => (settled = true),
      () => (settled = true)
    )

    let percent = 0
    // 12 * 100s = 1200s = 20 minutes, each tick reports a genuine advance.
    for (let i = 0; i < 12; i++) {
      await jest.advanceTimersByTimeAsync(100_000)
      percent += 1
      emitProgress(appName, { percent, bytes: `${percent} MB` })
    }

    expect(settled).toBe(false)
  })

  it('anti-vacuity vs the Steam heartbeat (decisive): the SAME payload every 1000ms does not re-arm; rejects at ~stallMs', async () => {
    jest.useFakeTimers()
    const appName = 'heartbeat-only'
    const stallMs = 5 * 60 * 1000
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'test'
    )
    const rejection = guarded.catch((err: unknown) => err)

    // depot.ts's literal heartbeat behaviour: identical payload every 1000ms.
    for (let i = 0; i < 400; i++) {
      await jest.advanceTimersByTimeAsync(1000)
      emitProgress(appName, { percent: 14, bytes: '5.23 GB' })
    }

    const err = await rejection
    expect(isStallError(err)).toBe(true)
  })

  it('`bytes` advance alone re-arms even when `percent` is unchanged', async () => {
    jest.useFakeTimers()
    const appName = 'bytes-only'
    const stallMs = 5000
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'test'
    )
    let settled = false
    guarded.then(
      () => (settled = true),
      () => (settled = true)
    )

    // Baseline advance (percent -1 -> 10).
    emitProgress(appName, { percent: 10, bytes: '10 MB' })
    await jest.advanceTimersByTimeAsync(4000)
    // percent unchanged, bytes changed -> must re-arm.
    emitProgress(appName, { percent: 10, bytes: '11 MB' })
    await jest.advanceTimersByTimeAsync(4000)

    expect(settled).toBe(false)

    await jest.advanceTimersByTimeAsync(2000)
    expect(settled).toBe(true)
  })

  it('`percent` advance alone re-arms even when `bytes` is unchanged', async () => {
    jest.useFakeTimers()
    const appName = 'percent-only'
    const stallMs = 5000
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'test'
    )
    let settled = false
    guarded.then(
      () => (settled = true),
      () => (settled = true)
    )

    emitProgress(appName, { percent: 5, bytes: '10 MB' })
    await jest.advanceTimersByTimeAsync(4000)
    // bytes unchanged, percent changed -> must re-arm.
    emitProgress(appName, { percent: 6, bytes: '10 MB' })
    await jest.advanceTimersByTimeAsync(4000)

    expect(settled).toBe(false)

    await jest.advanceTimersByTimeAsync(2000)
    expect(settled).toBe(true)
  })

  it('no progress ever rejects at exactly stallMs (sideload / never-reports case)', async () => {
    jest.useFakeTimers()
    const appName = 'never-reports'
    const stallMs = 5000
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'test'
    )
    const rejection = guarded.catch((err: unknown) => err)

    await jest.advanceTimersByTimeAsync(stallMs)
    const err = await rejection
    expect(isStallError(err)).toBe(true)
  })

  it('the rejection is a StallError naming the observed no-progress window, not a connection', async () => {
    jest.useFakeTimers()
    const appName = 'stall-error-shape'
    const stallMs = 5000
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'label-x'
    )
    const rejection = guarded.catch((err: unknown) => err)

    await jest.advanceTimersByTimeAsync(stallMs)
    const err = (await rejection) as StallError

    expect(isStallError(err)).toBe(true)
    expect(err.msSinceProgress).toBeGreaterThanOrEqual(stallMs)
    expect(err.message).not.toMatch(/connection/i)
    expect(err.message).toMatch(/no progress/i)
  })

  it('transparent pass-through: a promise resolving before stallMs resolves with its own value', async () => {
    jest.useFakeTimers()
    const appName = 'resolves-fast'
    const stallMs = 5000
    const inner = new Promise((resolve) => {
      setTimeout(() => resolve('ok'), 1000)
    })
    const guarded = withStallTimeout(inner, appName, stallMs, 'test')

    await jest.advanceTimersByTimeAsync(1000)
    await expect(guarded).resolves.toBe('ok')
  })

  it('transparent pass-through: a promise rejecting before stallMs rejects with its own error, not a StallError', async () => {
    jest.useFakeTimers()
    const appName = 'rejects-fast'
    const stallMs = 5000
    const boom = new Error('boom')
    const inner = new Promise((_resolve, reject) => {
      setTimeout(() => reject(boom), 1000)
    })
    const guarded = withStallTimeout(inner, appName, stallMs, 'test')
    const rejection = guarded.catch((err: unknown) => err)

    await jest.advanceTimersByTimeAsync(1000)
    const err = await rejection
    expect(err).toBe(boom)
    expect(isStallError(boom)).toBe(false)
  })

  it('listener hygiene: listenerCount returns to its pre-call baseline on BOTH the resolve and the reject path', async () => {
    jest.useFakeTimers()
    const appName = 'hygiene-check'
    const eventName = `progressUpdate-${appName}` as const
    const baseline = backendEvents.listenerCount(eventName)

    const resolved = withStallTimeout(
      Promise.resolve('x'),
      appName,
      5000,
      'test'
    )
    await resolved
    expect(backendEvents.listenerCount(eventName)).toBe(baseline)

    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      5000,
      'test'
    )
    const rejection = guarded.catch((err: unknown) => err)
    await jest.advanceTimersByTimeAsync(5000)
    await rejection
    expect(backendEvents.listenerCount(eventName)).toBe(baseline)
  })

  it('scoping: a progress event for a DIFFERENT appName does not re-arm this watchdog', async () => {
    jest.useFakeTimers()
    const appName = 'scoped-a'
    const otherAppName = 'scoped-b'
    const stallMs = 5000
    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'test'
    )
    const rejection = guarded.catch((err: unknown) => err)

    await jest.advanceTimersByTimeAsync(3000)
    emitProgress(otherAppName, { percent: 50, bytes: '50 MB' })
    await jest.advanceTimersByTimeAsync(3000)

    const err = await rejection
    expect(isStallError(err)).toBe(true)
  })

  // 260907-sxp: T-A through T-D assert the SIGNAL a trip sends to the
  // wrapped install's own abort registry, not merely the rejection — see
  // .planning/todos/pending/2026-08-27-stall-watchdog-leaves-the-download-running.md.

  it('T-A: a trip aborts the appName\'s registered controller, not just the race', async () => {
    jest.useFakeTimers()
    const appName = 'trip-signals-abort'
    const stallMs = 5000
    const controller = createAbortController(appName)
    try {
      const guarded = withStallTimeout(
        new Promise(() => {}),
        appName,
        stallMs,
        'test'
      )
      const rejection = guarded.catch((err: unknown) => err)

      await jest.advanceTimersByTimeAsync(stallMs)
      const err = await rejection

      expect(controller.signal.aborted).toBe(true)
      expect(isStallError(err)).toBe(true)
    } finally {
      deleteAbortController(appName)
    }
  })

  it('T-B: the abort fires strictly before the rejection is observed by the caller', async () => {
    jest.useFakeTimers()
    const appName = 'trip-abort-before-reject'
    const stallMs = 5000
    const controller = createAbortController(appName)
    try {
      let tick = 0
      let abortTick: number | undefined
      let rejectTick: number | undefined
      controller.signal.addEventListener('abort', () => {
        abortTick = ++tick
      })

      const guarded = withStallTimeout(
        new Promise(() => {}),
        appName,
        stallMs,
        'test'
      )
      const rejection = guarded.catch(() => {
        rejectTick = ++tick
      })

      await jest.advanceTimersByTimeAsync(stallMs)
      await rejection

      expect(abortTick).toBeDefined()
      expect(rejectTick).toBeDefined()
      expect(abortTick as number).toBeLessThan(rejectTick as number)
    } finally {
      deleteAbortController(appName)
    }
  })

  it('T-C: no controller registered signals nothing, logs no ERROR, and still rejects with a StallError', async () => {
    jest.useFakeTimers()
    const appName = 'trip-no-controller-no-error'
    const stallMs = 5000

    const guarded = withStallTimeout(
      new Promise(() => {}),
      appName,
      stallMs,
      'test'
    )
    const rejection = guarded.catch((err: unknown) => err)

    await jest.advanceTimersByTimeAsync(stallMs)
    const err = await rejection

    expect(isStallError(err)).toBe(true)
    expect(logError).not.toHaveBeenCalled()
  })

  it('T-D: a late inner rejection after the trip does not surface as an unhandledRejection (F6 pin)', async () => {
    jest.useFakeTimers()
    const appName = 'trip-late-rejection-absorbed'
    const stallMs = 5000
    let rejectInner: (err: Error) => void = () => {}
    const inner = new Promise((_resolve, reject) => {
      rejectInner = reject
    })

    const unhandled: unknown[] = []
    const onUnhandledRejection = (reason: unknown) => unhandled.push(reason)
    process.prependListener('unhandledRejection', onUnhandledRejection)

    try {
      const guarded = withStallTimeout(inner, appName, stallMs, 'test')
      const rejection = guarded.catch((err: unknown) => err)

      await jest.advanceTimersByTimeAsync(stallMs)
      await rejection

      // Promise.race already holds a handler on `inner` (F6) — a real clock
      // is required here because jest's fake timers do not reliably surface
      // Node's `unhandledRejection` event, which fires on a later real turn
      // of the event loop once a rejected promise remains unhandled at the
      // end of a microtask checkpoint.
      jest.useRealTimers()
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          rejectInner(new Error('late inner failure'))
          resolve()
        }, 1000)
      })
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(unhandled).toHaveLength(0)
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection)
    }
  })
})
