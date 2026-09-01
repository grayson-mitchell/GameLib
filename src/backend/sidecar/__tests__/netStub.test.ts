/**
 * Proves D-06 (Phase 34.4 Plan 06, REQ-34.4-11): a transport failure that arrives
 * asynchronously (never synchronously) reaches `humblePostRequest`
 * (`backend/humble/adapter.ts`)'s caller with the transport's own named cause -- never
 * masked behind the pre-fix "Humble reveal request timed out" message, and never requiring
 * `REQUEST_TIMEOUT_MS`'s 15s fake timer to be advanced before the rejection settles.
 *
 * RETIREMENT UPDATE (Phase 34.4.1 Plan 04, per 34.4.1-RESEARCH.md Discretion Finding (c)): the
 * original Electron `net.request` stub's error message no longer names a specific phase as
 * "the missing seam" -- Plan 04 wired the real `rustInvoke` seam that message used to point
 * at. The MECHANISM this file pins (async, non-synchronous transport failure; settles without
 * `REQUEST_TIMEOUT_MS` ever firing) is UNCHANGED.
 *
 * RE-POINT (Phase 39 Plan 03): `humblePostRequest` no longer has an Electron-transport
 * fallback branch -- Plan 39-01 deleted that fallback function and the
 * `getLoginWindowSeam() === null` dispatch it depended on, so `getLoginWindowSeam()` returning
 * `null` (this suite's original no-seam-installed setup) now makes `humblePostRequest` throw
 * synchronously via `getLoginWindowSeamOrThrow()`, never reaching a transport at all. Group 2
 * below no longer drives the real `net` stub -- it installs a FAKE login-window seam whose
 * `revealPost` rejects asynchronously (via a real, unfaked `setImmediate`, mirroring the
 * original stub's own async-emission timing) with a named cause, and asserts that cause -- not
 * the pre-fix timeout message -- reaches `revealKey`'s caller, with `REQUEST_TIMEOUT_MS`'s
 * fake timer never advanced. Group 1 (below) is UNCHANGED: it still pins
 * `electronStub.net.request()`'s own isolated contract directly, independent of whether
 * `humblePostRequest` ever calls it -- `backend/platform`'s `net` export is unrelated to this
 * plan's login-window-seam collapse.
 *
 * `backend/logger` is mocked (mirrors `adapter.test.ts`'s own mock boundary) purely to avoid a
 * real log write from `mapAxiosError`'s `logError` call on the "genuinely unexpected error"
 * path Group 2 deliberately exercises -- it is not a "cookie/store dependency" and does not
 * touch the transport under test.
 *
 * `app.userAgentFallback` gap (found while writing this suite, unrelated to D-06): the real
 * sidecar's `electronStub.ts` `app` object has no `userAgentFallback` member (confirmed absent
 * by direct read; `adapter.test.ts`/`user.test.ts` both work around it with their own full
 * `electron` mocks). `humble/userAgent.ts`'s `standardBrowserUserAgent()` reads
 * `app.userAgentFallback` and is called INSIDE `humblePostRequest`, BEFORE the seam's
 * `revealPost` is ever invoked -- on the real, unmocked stub this throws a `TypeError`
 * synchronously (regex `.exec(undefined)` -> no match -> `undefined.replace(...)`), which
 * would reject `humblePostRequest`'s promise with an unrelated crash and mask D-06's fix
 * entirely. `humbleGetLoginUserAgent` and `user.ts`'s `watchForLogin` (the two OTHER real
 * callers of `standardBrowserUserAgent()`) are both deferred to Phase 34.4.1 per D-01/D-02, so
 * this gap is currently dormant in production -- nothing in the ported 34.4 scope reaches it
 * except `humblePostRequest` itself. Patched HERE, at this suite's own `electron` mock factory
 * (not in `electronStub.ts`), to keep Task 1's diff scoped to the D-06 `net.request` fix this
 * plan owns; recorded as a Rule 3 deviation in `34.4-06-SUMMARY.md`.
 */

// ── os — per-pid tmp home, same convention as dialogStub.test.ts / lifecycleStub.test.ts
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-netstub-test-home-${process.pid}`)
  }
})

// ── electron / electron-store — route Jest's own module resolution at the REAL sidecar shim,
// supplementing only `app.userAgentFallback` (see module docstring's Rule 3 note above) --
// `net` here is the REAL, unmocked, hardened D-06 implementation, spread unchanged.
jest.mock('backend/platform', () => {
  const real = jest.requireActual('../../platform')
  return {
    ...real,
    app: {
      ...real.app,
      userAgentFallback:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/128.0.6613.36 Electron/32.0.1 Safari/537.36'
    }
  }
})
jest.mock('backend/store_backend', () => ({
  __esModule: true,
  default: jest.requireActual('../fileStore').default
}))

// ── backend/logger — avoid a real log write from mapAxiosError's logError() call on the
// "genuinely unexpected error" path Group 2 exercises; not a cookie/store dependency.
const mockLogInfo = jest.fn()
const mockLogError = jest.fn()
const mockLogWarning = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logError: (...args: unknown[]) => mockLogError(...args),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Backend: 'Backend' }
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { net } from '../../platform'
import { revealKey } from '../../humble/adapter'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../../humble/loginWindowSeam'

/** Flushes real setImmediate turns so the stub's asynchronous 'error' emission can run. */
function flushImmediate(times = 3): Promise<void> {
  return (async () => {
    for (let i = 0; i < times; i++) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  })()
}

describe('electronStub net.request — D-06 own contract (Phase 34.4 Plan 06, REQ-34.4-11)', () => {
  it('returns an object exposing on/end/write/setHeader', () => {
    const req = net.request()
    expect(typeof req.on).toBe('function')
    expect(typeof req.end).toBe('function')
    expect(typeof req.write).toBe('function')
    expect(typeof req.setHeader).toBe('function')
  })

  it("invokes a registered 'error' handler exactly once, after a flush, naming the missing seam (generic, no stale phase pointer -- Phase 34.4.1 retirement)", async () => {
    const req = net.request()
    const errorSpy = jest.fn()
    req.on('error', errorSpy)

    await flushImmediate()

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const [err] = errorSpy.mock.calls[0]
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain('not implemented in the sidecar')
    // The retired message must NOT resurrect a stale phase pointer.
    expect((err as Error).message).not.toContain('34.4.1')
  })

  it("does NOT invoke the 'error' handler synchronously — nothing has fired before any flush", () => {
    const req = net.request()
    const errorSpy = jest.fn()
    req.on('error', errorSpy)

    // Deliberately no await/flush here: this assertion pins the setImmediate deferral
    // (constraint 1) — a regression to a synchronous emission would still pass every OTHER
    // test in this describe block but would fail exactly this one.
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('registering no error handler at all produces neither a throw nor an unhandled rejection', async () => {
    const unhandledRejectionSpy = jest.fn()
    process.on('unhandledRejection', unhandledRejectionSpy)
    try {
      expect(() => {
        const req = net.request()
        // No req.on('error', ...) registered at all.
        void req
      }).not.toThrow()

      await flushImmediate()

      expect(unhandledRejectionSpy).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandledRejectionSpy)
    }
  })

  it('isOnline() still returns true — the untouched-neighbour regression guard', () => {
    expect(net.isOnline()).toBe(true)
  })
})

/** Builds a fake login-window seam whose `revealPost` is the only exercised member. */
function fakeSeam(
  revealPost: LoginWindowSeam['revealPost']
): LoginWindowSeam {
  return {
    open: jest.fn(),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn(),
    takeEvents: jest.fn(),
    close: jest.fn(),
    clearCookies: jest.fn(),
    revealPost,
    clearStorage: jest.fn()
  } as unknown as LoginWindowSeam
}

/**
 * A `revealPost` that rejects ASYNCHRONOUSLY, via a real (unfaked) `setImmediate` turn --
 * mirrors the original hardened `net.request` stub's own async-emission timing (constraint 1
 * this file has pinned since Phase 34.4 Plan 06), rather than a same-tick synchronous
 * rejection that would prove nothing about the timeout-vs-real-failure race.
 */
function asyncRejectingRevealPost(message: string): LoginWindowSeam['revealPost'] {
  return () =>
    new Promise((_resolve, reject) => {
      setImmediate(() => reject(new Error(message)))
    })
}

describe("humblePostRequest surfaces a named transport failure through the login-window seam (D-06 integration, REQ-34.4-11)", () => {
  it('revealKey rejects with the seam-naming cause, not the pre-fix timeout message, and settles without REQUEST_TIMEOUT_MS ever being advanced', async () => {
    // `doNotFake: ['setImmediate', 'nextTick']` (mirrors user.test.ts:437's own precedent):
    // REQUEST_TIMEOUT_MS's setTimeout is faked and NEVER advanced below — if this promise
    // settles at all, it can only be via the real (unfaked) setImmediate the fake seam's
    // revealPost uses, proving the async-rejection path fired rather than the timeout path.
    // Against a hung/never-settling seam this test would hang until Jest's own test timeout,
    // which is the RED signal this file has pinned since 34.4-06-SUMMARY.md's hand RED proof.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
    try {
      setLoginWindowSeam(
        fakeSeam(
          asyncRejectingRevealPost(
            'login-window-seam:revealPost-failed (D-06 named-cause fixture)'
          )
        )
      )

      const promise = revealKey('csrf-token-value', {
        gamekey: 'gamekey-1',
        machineName: 'machine-1',
        keyindex: 0
      })

      let caught: unknown
      try {
        await promise
        throw new Error(
          'expected revealKey(...) to reject, it resolved instead'
        )
      } catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(Error)
      const message = (caught as Error).message
      expect(message).toContain(
        'login-window-seam:revealPost-failed (D-06 named-cause fixture)'
      )
      expect(message).not.toContain('Humble reveal request timed out')

      // The 15s REQUEST_TIMEOUT_MS fake timer was cleared by
      // humblePostRequestViaSeam's `finally` block (clearTimeout(timeoutHandle)) -- if the
      // timeout path had fired instead this would still be outstanding, since it was never
      // advanced.
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      setLoginWindowSeam(null)
      jest.useRealTimers()
    }
  })
})
