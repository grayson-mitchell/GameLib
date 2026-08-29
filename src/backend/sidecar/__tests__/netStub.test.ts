/**
 * Proves D-06 (Phase 34.4 Plan 06, REQ-34.4-11): `electronStub.net.request()`'s hardened
 * `on()` actually fires, and the error it names reaches `humblePostRequest`
 * (`backend/humble/adapter.ts`)'s own already-wired `request.on('error', ...)` handler --
 * not merely that the stub itself emits something in isolation.
 *
 * RETIREMENT UPDATE (Phase 34.4.1 Plan 04, per 34.4.1-RESEARCH.md Discretion Finding (c)): the
 * stub's error message no longer names a specific phase as "the missing seam" -- Plan 04
 * wired the real `rustInvoke` seam that message used to point at, so a stale phase pointer
 * would send a future reader chasing work that already shipped. The MECHANISM this file pins
 * (async, non-synchronous `'error'` emission; reached through `humblePostRequest`'s real
 * `request.on('error', ...)` handler; settles without `REQUEST_TIMEOUT_MS` ever firing) is
 * UNCHANGED -- only the exact wording asserted below moved from a phase-specific string to a
 * generic one.
 *
 * Group 1 pins the stub's own contract in isolation (imports `net` directly from
 * `../electronStub`, mirroring `dialogStub.test.ts`'s direct-import convention for members
 * under test).
 *
 * Group 2 is the actual requirement: it drives `revealKey` (`backend/humble/adapter.ts`'s one
 * exported caller of the un-exported `humblePostRequest`) against the REAL, unmocked hardened
 * `net` stub -- never a fake `net.request` the way `adapter.test.ts`'s own suite drives it --
 * and asserts the rejection is D-06's seam-naming error, not the pre-fix
 * "Humble reveal request timed out" message, and that it settles WITHOUT ever needing
 * `REQUEST_TIMEOUT_MS`'s `setTimeout` to be advanced (fake timers with `setImmediate`/
 * `nextTick` left real -- `user.test.ts:437`'s own precedent for this exact combination). A
 * test that only checked "it rejected" would pass identically against the pre-fix code, since
 * the pre-fix code also rejects (just 15s later, with the wrong cause) -- this is precisely the
 * failure mode D-06 exists to remove. This test only exercises the Electron path (no seam is
 * ever installed in this suite) -- `getLoginWindowSeam()` returns `null`, so
 * `humblePostRequest` still falls through to this exact `net.request` stub.
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
 * `app.userAgentFallback` and is called INSIDE `humblePostRequest`, BEFORE
 * `request.on('error', ...)` is ever reached -- on the real, unmocked stub this throws a
 * `TypeError` synchronously (regex `.exec(undefined)` -> no match -> `undefined.replace(...)`),
 * which would reject `humblePostRequest`'s promise with an unrelated crash and mask D-06's fix
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
jest.mock('electron', () => {
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

describe("humblePostRequest reaches its own on('error') handler through the real stub (D-06 integration, REQ-34.4-11)", () => {
  it('revealKey rejects with the seam-naming cause, not the pre-fix timeout message, and settles without REQUEST_TIMEOUT_MS ever being advanced', async () => {
    // `doNotFake: ['setImmediate', 'nextTick']` (mirrors user.test.ts:437's own precedent):
    // REQUEST_TIMEOUT_MS's setTimeout is faked and NEVER advanced below — if this promise
    // settles at all, it can only be via the real (unfaked) setImmediate D-06's net.request
    // uses, proving the on('error') path fired rather than the timeout path. Against the
    // pre-fix stub this test hangs until Jest's own test timeout, which is the RED signal
    // recorded in 34.4-06-SUMMARY.md's hand RED proof.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
    try {
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
      expect(message).toContain('not implemented in the sidecar')
      // The retired message must NOT resurrect a stale phase pointer.
      expect(message).not.toContain('34.4.1')
      expect(message).not.toContain('Humble reveal request timed out')

      // The 15s REQUEST_TIMEOUT_MS fake timer was cleared by humblePostRequest's
      // request.on('error', ...) handler (clearRequestTimeout()) -- if the timeout path had
      // fired instead this would still be outstanding, since it was never advanced.
      expect(jest.getTimerCount()).toBe(0)
    } finally {
      jest.useRealTimers()
    }
  })
})
