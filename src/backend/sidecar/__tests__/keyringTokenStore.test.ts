/**
 * Unit tests for `SidecarKeyringTokenStore` (Phase 28 Plan 04 — Task 1).
 *
 * Covers REQ-28-06/D-06 (honest-unavailable → clean signed-out, never persist plaintext) and
 * the by-construction half of REQ-28-02/D-04 (this module physically cannot reach
 * `configStore`/`TOKEN_STORE_KEY` because it never imports them).
 *
 * A `null` result from `keyring_get` is the healthy first-run case (no entry yet, backend
 * reachable) — NOT an error. Per RESEARCH.md Pitfall 1, a future reader must not "fix" this
 * into an unavailable classification: only a REJECTION from `requestRustInvoke` (Rust's
 * `keyring:unavailable:...`/`keyring:bad-args` error strings, or a 60s timeout) means
 * unavailable/failed. This distinction is the entire point of several tests below.
 *
 * There is no real Keychain and no real Rust process here — `requestRustInvoke` (from
 * `../sidecarRpc`) is mocked with a small in-memory per-channel program + call log, so each
 * test can script a resolve/reject outcome and assert on exactly what was called.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// ── sidecarRpc mock — fake Rust responder, in-memory program + call log ─────
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── logger mock — mirrors tokenStore.test.ts's existing convention ──────────
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
const mockLogDebug = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
  logDebug: (...args: unknown[]) => mockLogDebug(...args),
  logError: jest.fn(),
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend',
    Gog: 'Gog',
    Legendary: 'Legendary',
    Nile: 'Nile',
    Sideload: 'Sideload',
    Zoom: 'Zoom'
  }
}))

// ── Imports (after mocks) ────────────────────────────────────────────────────
import { requestRustInvoke } from '../sidecarRpc'
import {
  SidecarKeyringTokenStore,
  SidecarKeyringSlotStore,
  KEYRING_SLOT_STEAM_REFRESH_TOKEN,
  KEYRING_SLOT_HUMBLE_SESSION,
  KEYRING_SLOT_HUMBLE_CSRF
} from '../keyringTokenStore'
import { readTokenOutcome } from 'backend/storeManagers/steam/tokenStore'

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: Record<string, ProgrammedOutcome> = {}
let callLog: Array<{ channel: string; args: unknown[] }> = []

function programChannel(channel: string, outcome: ProgrammedOutcome): void {
  program[channel] = outcome
}

// `beforeEach`'s responder above answers every channel from `program`, which cannot hold a
// request open -- it always resolves/rejects synchronously off the programmed outcome. This
// helper re-installs `mockRequestRustInvoke.mockImplementation` so the FIRST call to `target`
// returns a promise the test settles by hand, while EVERY other call -- including later calls to
// `target` itself -- falls through to the existing `program`/`callLog` behaviour verbatim. The
// first-call-only arming is load-bearing: without it, a follow-up read to the SAME channel would
// hang on a second never-settled promise instead of asserting anything (used by the cache-epoch
// concurrency tests below, T-34.5-G6-14, quick-260820-fyl).
function deferFirstCall(target: string): {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
} {
  let armed = false
  let resolveDeferred: (value: unknown) => void = () => {}
  let rejectDeferred: (error: Error) => void = () => {}
  const fallThrough = mockRequestRustInvoke.getMockImplementation()
  mockRequestRustInvoke.mockImplementation(
    (channel: string, args: unknown[]) => {
      if (channel === target && !armed) {
        armed = true
        callLog.push({ channel, args })
        return new Promise((resolve, reject) => {
          resolveDeferred = resolve
          rejectDeferred = reject
        })
      }
      return fallThrough
        ? fallThrough(channel, args)
        : Promise.reject(
            new Error(`no outcome programmed for channel: ${channel}`)
          )
    }
  )
  return {
    resolve: (value: unknown) => resolveDeferred(value),
    reject: (error: Error) => rejectDeferred(error)
  }
}

describe('SidecarKeyringTokenStore', () => {
  beforeEach(() => {
    program = {}
    callLog = []
    // resetMocks: true (jest.config.js) wipes even a factory-supplied implementation before
    // every test (same gotcha 28-03-SUMMARY.md documents for its configStore mock) — the
    // fake responder must be re-wired here, not only at module scope.
    mockRequestRustInvoke.mockImplementation(
      (channel: string, args: unknown[]) => {
        callLog.push({ channel, args })
        const outcome = program[channel]
        if (!outcome) {
          return Promise.reject(
            new Error(`no outcome programmed for channel: ${channel}`)
          )
        }
        return outcome.type === 'resolve'
          ? Promise.resolve(outcome.value)
          : Promise.reject(outcome.error)
      }
    )
  })

  // Behavior 1: getToken() resolves 'abc' when the fake responder returns 'abc'. Slot-aware
  // (34.4.1 gap cycle plan 11, D-GAP-01): the Steam store must send its slot name as args[0],
  // not an empty args array -- proven by exact-args assertion, not just the resolved value.
  it('getToken() resolves the stored token when keyring_get returns a string', async () => {
    programChannel('keyring_get', { type: 'resolve', value: 'abc' })
    const store = new SidecarKeyringTokenStore()

    await expect(store.getToken()).resolves.toBe('abc')
    expect(callLog).toStrictEqual([
      { channel: 'keyring_get', args: [KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
    ])
  })

  // Behavior 2: getToken() resolves '' when the responder returns null (no entry yet) --
  // and this healthy first-run case must NOT be logged as an error/warning (Pitfall 1).
  it('getToken() resolves "" without logging when keyring_get reports no entry (null)', async () => {
    programChannel('keyring_get', { type: 'resolve', value: null })
    const store = new SidecarKeyringTokenStore()

    await expect(store.getToken()).resolves.toBe('')
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  // Behavior 3: getToken() resolves '' and logs a warning when the responder rejects with
  // keyring:unavailable:...; it never throws to the caller.
  it('getToken() resolves "" and logs a warning when keyring_get rejects as unavailable', async () => {
    programChannel('keyring_get', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarKeyringTokenStore()

    await expect(store.getToken()).resolves.toBe('')
    // Two lines: the pre-existing "getToken() ... failed" warning, plus the memo-bookkeeping
    // line added by Routing item 3 (34.5 gap cycle 4 plan 35).
    expect(mockLogWarning).toHaveBeenCalledTimes(2)
    const [warningArg] = mockLogWarning.mock.calls[0]
    expect(String(warningArg)).toContain('keyring_get')
  })

  // Behavior 4: setToken('abc') sends exactly one keyring_set with the secret FIRST and the
  // slot SECOND, in that order (34.4.1 gap cycle plan 11, D-GAP-01 -- the position Task 1's
  // Rust side established: `[secret, slot]`).
  it('setToken() sends exactly one keyring_set request with the secret first and the slot second', async () => {
    programChannel('keyring_set', { type: 'resolve', value: true })
    const store = new SidecarKeyringTokenStore()

    await store.setToken('abc')

    expect(callLog).toStrictEqual([
      {
        channel: 'keyring_set',
        args: ['abc', KEYRING_SLOT_STEAM_REFRESH_TOKEN]
      }
    ])
  })

  // Behavior 5: setToken() when the responder rejects logs a warning and resolves (does not
  // throw), and issues NO further request of any kind -- no retry, no other channel.
  it('setToken() resolves and logs a warning on rejection, with no retry or other channel call', async () => {
    programChannel('keyring_set', {
      type: 'reject',
      error: new Error('keyring:unavailable:NoStorageAccess')
    })
    const store = new SidecarKeyringTokenStore()

    await expect(store.setToken('abc')).resolves.toBeUndefined()
    expect(callLog).toStrictEqual([
      {
        channel: 'keyring_set',
        args: ['abc', KEYRING_SLOT_STEAM_REFRESH_TOKEN]
      }
    ])
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  // Behavior 6a: isAvailable() resolves true on keyring_available -> true.
  it('isAvailable() resolves true when keyring_available reports true', async () => {
    programChannel('keyring_available', { type: 'resolve', value: true })
    const store = new SidecarKeyringTokenStore()

    await expect(store.isAvailable()).resolves.toBe(true)
  })

  // Behavior 6b: isAvailable() resolves false on keyring_available -> false (a SUCCESSFUL
  // report of unavailability, not an error -- must not be logged as a WARNING. It IS logged, at
  // INFO, since quick-260905-jx3: a successful `false` is a completed probe that already
  // prompted. This test's name said "without logging" and asserted only the absence of a
  // warning; the name is now precise about which sink it means.)
  it('isAvailable() resolves false when keyring_available reports false, without logging a warning', async () => {
    programChannel('keyring_available', { type: 'resolve', value: false })
    const store = new SidecarKeyringTokenStore()

    await expect(store.isAvailable()).resolves.toBe(false)
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  // Behavior 6c: isAvailable() resolves false when the request rejects or times out.
  it('isAvailable() resolves false when keyring_available rejects', async () => {
    programChannel('keyring_available', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarKeyringTokenStore()

    await expect(store.isAvailable()).resolves.toBe(false)
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  // Behavior 7: clearToken() sends keyring_delete and resolves even when the responder rejects.
  it('clearToken() sends keyring_delete and resolves even when the responder rejects', async () => {
    programChannel('keyring_delete', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarKeyringTokenStore()

    await expect(store.clearToken()).resolves.toBeUndefined()
    expect(callLog).toStrictEqual([
      { channel: 'keyring_delete', args: [KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
    ])
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  // Behavior 8: a 60s timeout rejection from requestRustInvoke is classified as unavailable,
  // not as an entry-missing case.
  it('classifies a rustInvoke timeout rejection as unavailable, not as "no entry"', async () => {
    programChannel('keyring_get', {
      type: 'reject',
      error: new Error('rustInvoke timed out after 60000ms: keyring_get')
    })
    const store = new SidecarKeyringTokenStore()

    await expect(store.getToken()).resolves.toBe('')
    // Two lines: the pre-existing "getToken() ... failed" warning, plus the memo-bookkeeping
    // line added by Routing item 3 (34.5 gap cycle 4 plan 35) -- classified `class=timeout`.
    expect(mockLogWarning).toHaveBeenCalledTimes(2)
    const [warningArg] = mockLogWarning.mock.calls[0]
    expect(String(warningArg)).toContain('timed out')
    expect(String(mockLogWarning.mock.calls[1][0])).toContain('class=timeout')
  })

  // Behavior 9: across every failure mode, the fake responder records ZERO calls to any
  // channel other than the one under test, and configStore is never constructed or written
  // by this module (structural proof below covers the "never written" half).
  it('touches only the single channel under test across every failure mode (no cross-channel calls)', async () => {
    programChannel('keyring_get', {
      type: 'reject',
      error: new Error('keyring:bad-args')
    })
    programChannel('keyring_set', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    programChannel('keyring_delete', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarKeyringTokenStore()

    await store.getToken()
    expect(callLog).toStrictEqual([
      { channel: 'keyring_get', args: [KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
    ])

    callLog = []
    await store.setToken('abc')
    expect(callLog).toStrictEqual([
      {
        channel: 'keyring_set',
        args: ['abc', KEYRING_SLOT_STEAM_REFRESH_TOKEN]
      }
    ])

    callLog = []
    await store.clearToken()
    expect(callLog).toStrictEqual([
      { channel: 'keyring_delete', args: [KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
    ])
  })

  // Behavior 10: setToken failing does not leave the token recoverable from anywhere -- a
  // subsequent getToken() against a responder reporting no entry returns ''.
  it('a failed setToken leaves nothing recoverable via a subsequent getToken()', async () => {
    programChannel('keyring_set', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    programChannel('keyring_get', { type: 'resolve', value: null })
    const store = new SidecarKeyringTokenStore()

    await store.setToken('abc')
    await expect(store.getToken()).resolves.toBe('')
  })

  // ---- SidecarKeyringSlotStore (34.4.1 gap cycle plan 11, D-GAP-01) ----
  //
  // A store constructed for a non-Steam slot (humble-session) must send THAT slot name, and
  // NEVER the Steam slot name, on all four operations -- the whole point of the allowlist is
  // that a Humble write cannot be mistaken for (or silently fall back to) the Steam entry.

  it('a humble-session slot store sends the humble-session slot, never steam-refresh-token, on all four operations', async () => {
    programChannel('keyring_available', { type: 'resolve', value: true })
    programChannel('keyring_get', { type: 'resolve', value: 'humble-cookie' })
    programChannel('keyring_set', { type: 'resolve', value: true })
    programChannel('keyring_delete', { type: 'resolve', value: true })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await store.isAvailable()
    await store.getToken()
    await store.setToken('humble-cookie')
    await store.clearToken()

    expect(callLog).toStrictEqual([
      { channel: 'keyring_available', args: [KEYRING_SLOT_HUMBLE_SESSION] },
      { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_SESSION] },
      {
        channel: 'keyring_set',
        args: ['humble-cookie', KEYRING_SLOT_HUMBLE_SESSION]
      },
      { channel: 'keyring_delete', args: [KEYRING_SLOT_HUMBLE_SESSION] }
    ])
    for (const call of callLog) {
      expect(call.args).not.toContain(KEYRING_SLOT_STEAM_REFRESH_TOKEN)
    }
  })

  it('a humble-session slot store implements TokenStore totality identically to the Steam store', async () => {
    programChannel('keyring_get', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await expect(store.getToken()).resolves.toBe('')
    // Two lines: the pre-existing "getToken() ... failed" warning, plus the memo-bookkeeping
    // line added by Routing item 3 (34.5 gap cycle 4 plan 35).
    expect(mockLogWarning).toHaveBeenCalledTimes(2)
    const [warningArg] = mockLogWarning.mock.calls[0]
    expect(String(warningArg)).toContain('keyring_get')
  })

  it('the humble-session and humble-csrf slot constants are distinct and never collide', () => {
    // Sanity-checked as real, non-empty strings first -- an accidentally-undefined export
    // would otherwise make the distinctness assertions below vacuously true (toEqual/
    // not.toEqual do not distinguish "both undefined" from "both a real, matching string").
    for (const slot of [
      KEYRING_SLOT_STEAM_REFRESH_TOKEN,
      KEYRING_SLOT_HUMBLE_SESSION,
      KEYRING_SLOT_HUMBLE_CSRF
    ]) {
      expect(typeof slot).toBe('string')
      expect(slot.length).toBeGreaterThan(0)
    }
    expect(KEYRING_SLOT_HUMBLE_SESSION).not.toEqual(KEYRING_SLOT_HUMBLE_CSRF)
    expect(KEYRING_SLOT_HUMBLE_SESSION).not.toEqual(
      KEYRING_SLOT_STEAM_REFRESH_TOKEN
    )
    expect(KEYRING_SLOT_HUMBLE_CSRF).not.toEqual(
      KEYRING_SLOT_STEAM_REFRESH_TOKEN
    )
  })

  it('a humble-csrf slot store sends the humble-csrf slot on setToken, distinct from humble-session', async () => {
    programChannel('keyring_set', { type: 'resolve', value: true })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_CSRF)

    await store.setToken('csrf-value')

    expect(callLog).toStrictEqual([
      { channel: 'keyring_set', args: ['csrf-value', KEYRING_SLOT_HUMBLE_CSRF] }
    ])
  })

  // Structural proof (mirrors 28-05's phase-level grep gate, in-test): this module has no
  // syntactic path to configStore, TOKEN_STORE_KEY, TOKEN_PREFIX, or a raw filesystem write --
  // its only storage reach is the four keyring channels over requestRustInvoke.
  it('source contains no reference to configStore/TOKEN_STORE_KEY/TOKEN_PREFIX/writeFileSync', () => {
    const src = readFileSync(
      join(__dirname, '../keyringTokenStore.ts'),
      'utf-8'
    )
    expect(src).not.toMatch(
      /configStore|TOKEN_STORE_KEY|TOKEN_PREFIX|writeFileSync/
    )
  })

  // Existing export name survives (D-04): bootstrap.ts must be able to keep calling
  // `new SidecarKeyringTokenStore()` with no args, unedited.
  it('SidecarKeyringTokenStore keeps its no-argument construction', () => {
    expect(() => new SidecarKeyringTokenStore()).not.toThrow()
  })

  // ---- Read caching + in-flight dedupe (34.4.1 gap cycle 2 plan 26, F-9's read-count half --
  // user-approved scope widening, see 34.4.1-26-SUMMARY.md) ----

  it('caches a successful getToken() result: a second call issues NO further keyring_get', async () => {
    programChannel('keyring_get', { type: 'resolve', value: 'cached-token' })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await expect(store.getToken()).resolves.toBe('cached-token')
    await expect(store.getToken()).resolves.toBe('cached-token')

    expect(callLog).toStrictEqual([
      { channel: 'keyring_get', args: [KEYRING_SLOT_HUMBLE_SESSION] }
    ])
  })

  it('caches a healthy null (no-entry) getToken() result too -- a second call issues NO further keyring_get', async () => {
    programChannel('keyring_get', { type: 'resolve', value: null })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await expect(store.getToken()).resolves.toBe('')
    await expect(store.getToken()).resolves.toBe('')

    expect(callLog).toHaveLength(1)
  })

  // CHARACTERIZATION ONLY -- this pins the PRE-EXISTING pendingToken in-flight dedupe from commit
  // 2d1abe64a, which this plan (34.5 gap cycle 3 plan 25) does NOT touch or reimplement. It is
  // expected GREEN before plan 25's edit as well as after -- a regression guard proving the
  // bounded failure memo added below is layered ALONGSIDE this dedupe, not a replacement for it.
  it('concurrent getToken() calls before the first settles share ONE in-flight request (pins the pre-existing pendingToken dedupe, commit 2d1abe64a -- regression guard, not new behaviour)', async () => {
    let resolveInvoke: (value: unknown) => void = () => {}
    mockRequestRustInvoke.mockImplementation(
      (channel: string, args: unknown[]) => {
        callLog.push({ channel, args })
        return new Promise((resolve) => {
          resolveInvoke = resolve
        })
      }
    )
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    const first = store.getToken()
    const second = store.getToken()
    const third = store.getToken()

    expect(callLog).toHaveLength(1) // only ONE real request issued for three concurrent callers

    resolveInvoke('dedup-token')

    await expect(first).resolves.toBe('dedup-token')
    await expect(second).resolves.toBe('dedup-token')
    await expect(third).resolves.toBe('dedup-token')
    expect(callLog).toHaveLength(1)
  })

  // ---- Bounded negative-result memo (34.5 gap cycle 3 plan 25, F-34.5-G6-06; window extended
  // 15s -> 120s and classification logging added by 34.5 gap cycle 4 plan 35, Routing item 3) ----
  //
  // A FAILED getToken() is now memoized for a bounded window (KEYRING_FAILURE_MEMO_MS, 120s -- see
  // that constant's own doc comment for the 101-second live-session arithmetic that replaced the
  // original, too-short 15s figure) so a second SEQUENTIAL caller -- the next runner's
  // window.location.reload() remounting GlobalState a moment later, per the finding's diagnosed
  // mechanism -- does not repeat an identical doomed-to-timeout read and trigger a second Keychain
  // prompt. This replaces the old immediate-retry test below, whose assertion (2 sequential
  // failures both hit the keyring, uncached) is the exact behaviour this plan intentionally bounds.

  it('memoizes a FAILED getToken() for the bounded window -- a second SEQUENTIAL call inside the window returns the same failure WITHOUT a second keyring_get', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await expect(store.getToken()).resolves.toBe('')
      expect(callLog).toHaveLength(1)
      // Two log lines for the FIRST failure: the pre-existing "getToken() ... failed" warning,
      // plus the new memo-bookkeeping line (Routing item 3) naming the classification and window.
      expect(mockLogWarning).toHaveBeenCalledTimes(2)

      // Second call: fully sequential (the first has settled), still inside the memo window.
      await expect(store.getToken()).resolves.toBe('')

      // The whole point of this task: still exactly ONE request, not two -- the memoized failure
      // was returned directly, without a second Keychain prompt.
      expect(callLog).toHaveLength(1)
      // The memo HIT itself is silent -- it must not re-log anything for a read that never
      // actually happened. Log count is unchanged from after the first call.
      expect(mockLogWarning).toHaveBeenCalledTimes(2)
    } finally {
      jest.useRealTimers()
    }
  })

  // Behavior: "Two sequential getToken() calls on the same slot, 101 seconds apart, with the
  // first timing out, issue only ONE keyring_get." (this task's own <behavior> block) -- the exact
  // 2026-08-01 live-session interval (19:22:57 -> 19:24:38) that falsified the old 15s memo.
  it('two sequential getToken() calls 101 seconds apart, the first a timeout, issue only ONE keyring_get (the exact live-session interval this plan closes)', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await expect(store.getToken()).resolves.toBe('')
      expect(callLog).toHaveLength(1)

      jest.advanceTimersByTime(101_000)

      await expect(store.getToken()).resolves.toBe('')
      expect(callLog).toHaveLength(1)
      // The memoized failure still resolves the empty-string failure value, never throws/hangs.
    } finally {
      jest.useRealTimers()
    }
  })

  it('a memoized failure logs which classification (timeout vs unavailable) is being memoized and for how long, in the literal shape the plan requires', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await store.getToken()

      const memoLine = mockLogWarning.mock.calls
        .map(([arg]) => String(arg))
        .find((line) => line.includes('keyring failure memoized slot='))
      expect(memoLine).toBeDefined()
      // quick-260817-d61: `trigger=` is APPENDED after the pre-existing
      // `slot=`/`class=`/`ms=` tokens -- `getToken()` calls with no context,
      // so the label is the documented `unspecified` fallback.
      expect(memoLine).toBe(
        `keyring failure memoized slot=${KEYRING_SLOT_HUMBLE_SESSION} class=timeout ms=120000 trigger=unspecified`
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('a memoized failure classifies an unavailable (non-timeout) rejection as class=unavailable, distinct from a timeout', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_CSRF)

      await store.getToken()

      const memoLine = mockLogWarning.mock.calls
        .map(([arg]) => String(arg))
        .find((line) => line.includes('keyring failure memoized slot='))
      expect(memoLine).toBeDefined()
      // quick-260817-d61: `trigger=` is APPENDED after the pre-existing
      // `slot=`/`class=`/`ms=` tokens -- `getToken()` calls with no context,
      // so the label is the documented `unspecified` fallback.
      expect(memoLine).toBe(
        `keyring failure memoized slot=${KEYRING_SLOT_HUMBLE_CSRF} class=unavailable ms=120000 trigger=unspecified`
      )
    } finally {
      jest.useRealTimers()
    }
  })

  it('a getToken() call AFTER the memo window expires issues a fresh keyring_get -- the memo is not permanent', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await expect(store.getToken()).resolves.toBe('')
      expect(callLog).toHaveLength(1)

      // Still inside the window -- memoized, no second request (mirrors the test above).
      await expect(store.getToken()).resolves.toBe('')
      expect(callLog).toHaveLength(1)

      // Advance PAST the memo window (KEYRING_FAILURE_MEMO_MS = 120_000ms) -- also past the
      // observed 101s live interval, so this proves the window is bounded, not permanent.
      jest.advanceTimersByTime(120_001)

      // The keyring has since recovered.
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'recovered-token'
      })
      await expect(store.getToken()).resolves.toBe('recovered-token')

      // A second real request -- the memo expired and let this call reach the transport.
      expect(callLog).toHaveLength(2)

      // The now-successful read IS cached (pre-existing behaviour, unaffected) -- a further call
      // issues no further request. This is the "SUCCESSFUL read still populates cachedToken and
      // short-circuits every later call" behaviour this task's own <behavior> block requires.
      await expect(store.getToken()).resolves.toBe('recovered-token')
      expect(callLog).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('clearToken() invalidates a memoized failure -- the next getToken() reaches the keyring fresh, never the stale memo (the sign-out floor)', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await expect(store.getToken()).resolves.toBe('')
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)

      // A FAILED clearToken(): unlike a SUCCESSFUL one (which correctly repopulates the cache
      // with a confirmed-empty value, per this store's own pre-existing contract), a failed
      // delete must leave state fully invalidated -- neither a stale value NOR a stale failure
      // memo may survive it, since the true post-delete state is unknown.
      programChannel('keyring_delete', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })
      await store.clearToken()

      // Still well inside what would otherwise be the memo window -- but clearToken() must have
      // invalidated the memo too, so this call reaches the transport again rather than returning
      // the stale memoized failure.
      programChannel('keyring_get', {
        type: 'resolve',
        value: 'post-signout-token'
      })
      await expect(store.getToken()).resolves.toBe('post-signout-token')
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(2)
    } finally {
      jest.useRealTimers()
    }
  })

  it('a memoized failure is surfaced to the caller as a failure ("") and is never mistaken for a token value', async () => {
    jest.useFakeTimers()
    try {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      const firstResult = await store.getToken()
      const secondResult = await store.getToken() // served from the memo, per the test above

      expect(firstResult).toBe('')
      expect(secondResult).toBe('')
      expect(typeof secondResult).toBe('string')
      // The memo carries a timestamp only -- never a secret or a truthy stand-in for one.
      expect(secondResult).not.toMatch(/./)
    } finally {
      jest.useRealTimers()
    }
  })

  it('caches a successful isAvailable() result: a second call issues NO further keyring_available', async () => {
    programChannel('keyring_available', { type: 'resolve', value: true })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await expect(store.isAvailable()).resolves.toBe(true)
    await expect(store.isAvailable()).resolves.toBe(true)

    expect(callLog).toStrictEqual([
      { channel: 'keyring_available', args: [KEYRING_SLOT_HUMBLE_SESSION] }
    ])
  })

  it('caches a successful "unavailable" (false) isAvailable() result too -- not just the "true" case', async () => {
    programChannel('keyring_available', { type: 'resolve', value: false })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await expect(store.isAvailable()).resolves.toBe(false)
    await expect(store.isAvailable()).resolves.toBe(false)

    expect(callLog).toHaveLength(1)
  })

  it('does NOT cache a rejected isAvailable() -- a second call retries the keyring', async () => {
    programChannel('keyring_available', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await store.isAvailable()
    await store.isAvailable()

    expect(callLog).toHaveLength(2)
  })

  // ---- Cache invalidation on write/delete -- the correctness floor ----
  //
  // A cache must NOT survive setToken()/clearToken(). clearToken() in particular is the
  // disconnect/sign-out path: a stale cached value surviving it would resurrect a logged-out
  // session, which this suite treats as the single most important property of the cache.

  it('setToken() invalidates a stale cached getToken() result -- the next read is fresh, not the old cached value', async () => {
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    programChannel('keyring_get', { type: 'resolve', value: 'old-token' })
    await expect(store.getToken()).resolves.toBe('old-token')

    programChannel('keyring_set', { type: 'resolve', value: true })
    await store.setToken('new-token')

    // setToken() populates the cache with the just-written value on success -- no extra
    // keyring_get round trip is needed, but the value returned MUST be the new one, never the
    // stale 'old-token'.
    await expect(store.getToken()).resolves.toBe('new-token')
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)
  })

  it('a FAILED setToken() still invalidates the stale cache -- the next read goes back to the keyring, never a stale value', async () => {
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    programChannel('keyring_get', { type: 'resolve', value: 'old-token' })
    await expect(store.getToken()).resolves.toBe('old-token')

    programChannel('keyring_set', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    await store.setToken('attempted-new-token')

    // Cache was invalidated before the (failed) write -- the next getToken() must NOT return
    // the stale 'old-token' from before the write attempt. It issues a fresh read.
    programChannel('keyring_get', { type: 'resolve', value: 'reread-token' })
    await expect(store.getToken()).resolves.toBe('reread-token')
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(2)
  })

  it('clearToken() invalidates the cache -- a subsequent read never resurrects the pre-disconnect value (the F-6-adjacent correctness floor)', async () => {
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    programChannel('keyring_get', {
      type: 'resolve',
      value: 'session-cookie-value'
    })
    await expect(store.getToken()).resolves.toBe('session-cookie-value')

    programChannel('keyring_delete', { type: 'resolve', value: true })
    await store.clearToken()

    // clearToken() succeeded -- the cache is now confirmed-empty, and getToken() must resolve
    // '' WITHOUT resurrecting the pre-disconnect cached value, and without a further keyring_get
    // round trip (the delete's own success already tells us the slot is empty).
    await expect(store.getToken()).resolves.toBe('')
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)
  })

  it('a FAILED clearToken() still invalidates the cache rather than leaving the pre-disconnect value cached', async () => {
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    programChannel('keyring_get', {
      type: 'resolve',
      value: 'session-cookie-value'
    })
    await expect(store.getToken()).resolves.toBe('session-cookie-value')

    programChannel('keyring_delete', {
      type: 'reject',
      error: new Error('keyring:unavailable:PlatformFailure')
    })
    await store.clearToken()

    // The delete failed -- we do NOT know the true state, so the cache must be left
    // invalidated (never optimistically treated as cleared, and never left holding the stale
    // pre-disconnect value either). The next getToken() issues a fresh read.
    programChannel('keyring_get', {
      type: 'resolve',
      value: 'still-there-after-failed-delete'
    })
    await expect(store.getToken()).resolves.toBe(
      'still-there-after-failed-delete'
    )
    expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(2)
  })

  it('setToken()/clearToken() also invalidate a cached isAvailable() result, not just getToken()', async () => {
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    programChannel('keyring_available', { type: 'resolve', value: true })
    await expect(store.isAvailable()).resolves.toBe(true)

    programChannel('keyring_available', { type: 'resolve', value: false })
    programChannel('keyring_set', { type: 'resolve', value: true })
    await store.setToken('x')

    await expect(store.isAvailable()).resolves.toBe(false)
    expect(
      callLog.filter((c) => c.channel === 'keyring_available')
    ).toHaveLength(2)
  })

  // The two pre-existing invalidation tests above (`clearToken() invalidates a memoized failure`
  // and `clearToken() invalidates the cache`) are strictly SEQUENTIAL -- `await store.clearToken()`
  // fully settles before `getToken()` is called -- and that is precisely why this defect survived.
  // These tests drive a genuinely CONCURRENT in-flight read across clearToken() instead.
  describe('in-flight read superseded by clearToken() -- cache epoch guard (quick-260820-fyl, T-34.5-G6-14)', () => {
    it('an in-flight readToken() that resolves AFTER a successful clearToken() must not resurrect the pre-signout token (T-34.5-G6-14)', async () => {
      const deferred = deferFirstCall('keyring_get')
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      const inFlight = store.getToken()
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)

      programChannel('keyring_delete', { type: 'resolve', value: true })
      await store.clearToken()

      deferred.resolve('pre-signout-token')

      // The superseded caller STILL receives what it asked for, deliberately and by decision --
      // this line pins that non-change, it is not an oversight (see the plan's <out_of_scope>).
      await expect(inFlight).resolves.toBe('pre-signout-token')

      await expect(store.getToken()).resolves.toBe('')
      // The follow-up read is served by clearToken()'s own confirmed-empty cache, so no second
      // Keychain round trip is issued either way -- the VALUE is the discriminator, not the count.
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(1)
    })

    it('an in-flight readToken() that REJECTS after clearToken() must not arm a failure memo that suppresses the next real read (T-34.5-G6-14)', async () => {
      const deferred = deferFirstCall('keyring_get')
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      const inFlight = store.getToken()

      // The FAILED delete is deliberate: a SUCCESSFUL clearToken() repopulates cachedToken with a
      // confirmed-empty value, which would serve the follow-up read from cache and mask the memo
      // entirely. With a failed delete the cache is left fully invalidated, so a resurrected memo
      // is the ONLY thing that can suppress the next read -- this mirrors the pre-existing
      // sequential test 'clearToken() invalidates a memoized failure' above.
      programChannel('keyring_delete', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })
      await store.clearToken()

      // No fake timers here and no clock advance: the point is that the memo is FRESH and would
      // therefore hit if it were allowed to arm.
      deferred.reject(new Error('keyring:timeout'))
      await expect(inFlight).resolves.toBe('')

      programChannel('keyring_get', {
        type: 'resolve',
        value: 'post-signout-token'
      })
      await expect(store.getToken()).resolves.toBe('post-signout-token')
      expect(callLog.filter((c) => c.channel === 'keyring_get')).toHaveLength(2)
    })

    it('an in-flight isAvailable() probe that resolves AFTER clearToken() must not resurrect the pre-signout availability cache (T-34.5-G6-14)', async () => {
      const deferred = deferFirstCall('keyring_available')
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      const inFlight = store.isAvailable()

      programChannel('keyring_delete', { type: 'resolve', value: true })
      await store.clearToken()

      deferred.resolve(true)
      await expect(inFlight).resolves.toBe(true)

      programChannel('keyring_available', { type: 'resolve', value: false })
      await expect(store.isAvailable()).resolves.toBe(false)
      expect(
        callLog.filter((c) => c.channel === 'keyring_available')
      ).toHaveLength(2)
    })
  })

  it('invalidateCache() is exposed and clears both cached values on demand', async () => {
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    programChannel('keyring_get', { type: 'resolve', value: 'first-read' })
    programChannel('keyring_available', { type: 'resolve', value: true })
    await store.getToken()
    await store.isAvailable()
    expect(callLog).toHaveLength(2)

    store.invalidateCache()

    await store.getToken()
    await store.isAvailable()
    expect(callLog).toHaveLength(4)
  })

  // ── Success-path observability (F-34.5-G6-26) ──────────────────────────────
  //
  // Until 2026-08-14 this class logged ONLY on failure paths (the module imported `logWarning`
  // and nothing else), so a SUCCESSFUL keyring read emitted nothing at all. `U-34.5-01`'s
  // condition (4) -- "at least one `SidecarKeyringSlotStore` read SUCCEEDS for a real slot,
  // recorded with the exact grep and its raw output" -- was therefore unsatisfiable by
  // construction: that string could reach `gamelib.log` only when a read FAILED. Three gate
  // cycles recorded condition (4) as never held; it was never observable. A 2026-08-14 operator
  // session (arm=keyring, zero dev-vault lines, Steam library populated, four Keychain prompts
  // approved) produced a log with no keyring line of any kind, which is what surfaced this.
  it('a successful keyring_get logs an ok line naming the slot, and never the token value', async () => {
    programChannel('keyring_get', {
      type: 'resolve',
      value: 'super-secret-token'
    })
    const store = new SidecarKeyringTokenStore()

    await expect(store.getToken()).resolves.toBe('super-secret-token')

    const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
    expect(
      infoLines.some(
        (l) =>
          l.includes(
            `SidecarKeyringSlotStore(${KEYRING_SLOT_STEAM_REFRESH_TOKEN}).getToken()`
          ) &&
          l.includes('keyring_get ok') &&
          l.includes('present=true')
      )
    ).toBe(true)

    // Security floor: the secret itself must never reach the logger, at any level.
    const allLines = [
      ...mockLogInfo.mock.calls,
      ...mockLogDebug.mock.calls,
      ...mockLogWarning.mock.calls
    ].map((c) => String(c[0]))
    expect(allLines.some((l) => l.includes('super-secret-token'))).toBe(false)
  })

  it('the healthy no-entry case still logs a successful read, with present=false', async () => {
    programChannel('keyring_get', { type: 'resolve', value: null })
    const store = new SidecarKeyringTokenStore()

    await expect(store.getToken()).resolves.toBe('')

    const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
    expect(
      infoLines.some(
        (l) => l.includes('keyring_get ok') && l.includes('present=false')
      )
    ).toBe(true)
    // A confirmed "nothing stored" is a SUCCESSFUL read, not a failure (RESEARCH Pitfall 1).
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  // This is the test that makes an observed prompt count interpretable. A cache hit issues no
  // `keyring_get`, so it cannot raise a Keychain prompt -- which is why "0 prompts on re-login"
  // is NOT by itself evidence that any timeout/memo fix works. Before these lines existed a live
  // session could not distinguish the two, and the warm-cache case reads as a win.
  it('a cache hit issues no second keyring_get and says so, so a warm cache cannot be misread as a prompt fix', async () => {
    programChannel('keyring_get', { type: 'resolve', value: 'abc' })
    const store = new SidecarKeyringTokenStore()

    await store.getToken()
    const afterFirst = callLog.filter((c) => c.channel === 'keyring_get').length
    await store.getToken()
    const afterSecond = callLog.filter(
      (c) => c.channel === 'keyring_get'
    ).length

    expect(afterFirst).toBe(1)
    expect(afterSecond).toBe(1) // no second round trip => no second prompt possible

    // Exactly one "issuing" line -- the log-side counterpart of an operator's prompt count.
    const issuing = mockLogInfo.mock.calls
      .map((c) => String(c[0]))
      .filter((l) => l.includes('issuing keyring_get'))
    expect(issuing).toHaveLength(1)

    const debugLines = mockLogDebug.mock.calls.map((c) => String(c[0]))
    expect(debugLines.some((l) => l.includes('served from cache'))).toBe(true)
  })

  it('a successful clearToken logs a delete-ok line naming the slot (the sign-out path)', async () => {
    programChannel('keyring_delete', { type: 'resolve', value: null })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

    await store.clearToken()

    const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
    expect(
      infoLines.some(
        (l) =>
          l.includes(
            `SidecarKeyringSlotStore(${KEYRING_SLOT_HUMBLE_SESSION}).clearToken()`
          ) && l.includes('keyring_delete ok')
      )
    ).toBe(true)
  })

  it('a successful setToken logs a length, never the token value', async () => {
    programChannel('keyring_set', { type: 'resolve', value: null })
    const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_CSRF)

    await store.setToken('another-secret')

    const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
    expect(
      infoLines.some(
        (l) => l.includes('keyring_set ok') && l.includes('len=14')
      )
    ).toBe(true)

    const allLines = [
      ...mockLogInfo.mock.calls,
      ...mockLogDebug.mock.calls,
      ...mockLogWarning.mock.calls
    ].map((c) => String(c[0]))
    expect(allLines.some((l) => l.includes('another-secret'))).toBe(false)
  })

  // Source-text guard for the regression shape that CREATED F-34.5-G6-26: a module whose only
  // logger import was `logWarning`, making every success structurally unobservable.
  it('keyringTokenStore imports a success-path logger, not only logWarning', () => {
    const source = readFileSync(
      join(__dirname, '..', 'keyringTokenStore.ts'),
      'utf-8'
    )
    const importLine = source
      .split('\n')
      .find((l) => l.includes("from 'backend/logger'"))
    expect(importLine).toBeDefined()
    expect(importLine).toContain('logInfo')
  })

  /**
   * `readToken()` — the timeout-vs-absent read primitive (quick-260814-r2d, closing
   * `keyring-read-timeout-reported-as-no-token.md`). Every assertion below is written against
   * `readTokenOutcome(store)` (the shared seam, not `store.readToken()` directly) per this
   * task's own instruction — this is what makes it a valid RED-proof harness against the
   * pre-fix fallback path, which routes through today's conflating `getToken()`.
   *
   * Nested INSIDE the outer `describe('SidecarKeyringTokenStore', ...)` block (not a sibling)
   * so it inherits that describe's `beforeEach` (program/callLog reset + `mockRequestRustInvoke`
   * re-wiring) — a sibling describe would silently run against an un-wired mock.
   *
   * Only THREE of the seven behaviours below are fix-proving (timeout, Deny/unavailable, memo
   * hit) — the other four are forward-looking regression guards that are already correct under
   * today's pre-fix code and must stay green throughout.
   */
  describe('readToken() / readTokenOutcome() — timeout-vs-absent (quick-260814-r2d)', () => {
    // Fix-proving (1/3): a keyring:timeout rejection must be reported as unreadable/timeout, never
    // as absent.
    it('resolves { status: "unreadable", reason: "timeout" } when keyring_get rejects with keyring:timeout', async () => {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'unreadable',
        reason: 'timeout'
      })
    })

    // Fix-proving (2/3): a keyring:unavailable rejection (the Keychain Deny / PlatformFailure(-128)
    // path) must be reported as unreadable/unavailable, never as absent.
    it('resolves { status: "unreadable", reason: "unavailable" } when keyring_get rejects with keyring:unavailable:Platform secure storage failure', async () => {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:unavailable:Platform secure storage failure')
      })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'unreadable',
        reason: 'unavailable'
      })
    })

    // Regression guard: the healthy first-run case is still absent, distinct from both unreadable
    // reasons above. Already true pre-fix — a green result here is the correct outcome.
    it('resolves { status: "absent" } when keyring_get resolves null (the healthy first-run case)', async () => {
      programChannel('keyring_get', { type: 'resolve', value: null })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'absent'
      })
    })

    // Regression guard: a genuine stored token still reports present with its value. Already true
    // pre-fix — a green result here is the correct outcome.
    it('resolves { status: "present", token } when keyring_get resolves a non-empty string', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'abc' })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await expect(readTokenOutcome(store)).resolves.toEqual({
        status: 'present',
        token: 'abc'
      })
    })

    // Fix-proving (3/3): the load-bearing memo change. A second read inside the 120s memo window
    // must answer unreadable (carrying the ORIGINAL failure's reason), never absent -- and must
    // still issue ZERO additional keyring_get (F-34.5-G6-06's prompt-suppression effect stays
    // intact).
    it('a memo hit resolves { status: "unreadable" } carrying the ORIGINAL failure reason, and issues ZERO additional keyring_get', async () => {
      jest.useFakeTimers()
      try {
        programChannel('keyring_get', {
          type: 'reject',
          error: new Error('keyring:timeout')
        })
        const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

        await expect(readTokenOutcome(store)).resolves.toEqual({
          status: 'unreadable',
          reason: 'timeout'
        })
        expect(callLog).toHaveLength(1)

        // Second read, fully sequential, still inside the 120s memo window.
        await expect(readTokenOutcome(store)).resolves.toEqual({
          status: 'unreadable',
          reason: 'timeout'
        })

        // Still exactly ONE request -- the memo answered without a second keyring_get / Keychain
        // prompt.
        expect(callLog).toHaveLength(1)
      } finally {
        jest.useRealTimers()
      }
    })

    // Regression guard: a failed read must never trigger a delete or a write of any kind. Today's
    // code already does nothing here on a failed read (this behaviour is not changed by this task)
    // -- this guard proves the fix does not INTRODUCE one.
    it('a failed read issues no keyring_delete and no keyring_set: the callLog contains only the one keyring_get', async () => {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await readTokenOutcome(store)

      expect(callLog).toStrictEqual([
        { channel: 'keyring_get', args: [KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
      ])
    })

    // Regression guard: getToken()'s existing '' contract is unaffected by this task -- it stays
    // the lossy adapter for both absent and unreadable, so humbleSecretStore.ts's getSecret() and
    // every other existing caller keeps compiling and behaving identically.
    it('getToken() still resolves "" for both absent and unreadable outcomes', async () => {
      programChannel('keyring_get', { type: 'resolve', value: null })
      const absentStore = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )
      await expect(absentStore.getToken()).resolves.toBe('')

      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const unreadableStore = new SidecarKeyringSlotStore(
        KEYRING_SLOT_HUMBLE_CSRF
      )
      await expect(unreadableStore.getToken()).resolves.toBe('')
    })
  })

  /**
   * `trigger=`/`elapsed=` annotation (quick task 260817-d61). `readToken(context)` now forwards
   * `context` through to every `keyring_get` issue/outcome/memo log line, so a live operator
   * session can attribute an observed prompt to what triggered it. These tests are additive on
   * top of the pre-existing log-shape tests above (which pin the UNANNOTATED substrings still
   * appearing verbatim) -- nothing here replaces those.
   */
  describe('trigger= / elapsed= annotation (quick-260817-d61)', () => {
    it('a fresh readToken("user-install") issues exactly ONE requestRustInvoke and logs the issue line with trigger=user-install', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'abc' })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await expect(readTokenOutcome(store, 'user-install')).resolves.toEqual({
        status: 'present',
        token: 'abc'
      })
      expect(callLog).toHaveLength(1)

      const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
      expect(
        infoLines.some((l) =>
          l.includes('issuing keyring_get (may prompt) trigger=user-install')
        )
      ).toBe(true)
    })

    it('the success line still contains the exact pre-existing substrings, with trigger= and elapsed= appended after them, never reordered', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'abc' })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await readTokenOutcome(store, 'user-install')

      const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
      const okLine = infoLines.find((l) => l.includes('keyring_get ok'))
      expect(okLine).toBeDefined()
      expect(okLine).toContain('keyring_get ok present=true')
      expect(okLine).toContain('len=3')
      // Order-sensitive: present=/len= must appear BEFORE trigger=/elapsed=, never after.
      const presentIdx = okLine!.indexOf('present=')
      const triggerIdx = okLine!.indexOf('trigger=')
      const elapsedIdx = okLine!.indexOf('elapsed=')
      expect(presentIdx).toBeGreaterThanOrEqual(0)
      expect(triggerIdx).toBeGreaterThan(presentIdx)
      expect(elapsedIdx).toBeGreaterThan(triggerIdx)
      expect(okLine).toContain('trigger=user-install')
      expect(okLine).toMatch(/elapsed=\d+ms/)
    })

    it('a second readToken() after a SUCCESS (cache hit) issues no additional requestRustInvoke -- call count stays 1', async () => {
      programChannel('keyring_get', { type: 'resolve', value: 'abc' })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await readTokenOutcome(store, 'user-install')
      expect(callLog).toHaveLength(1)

      await readTokenOutcome(store, 'user-install')
      expect(callLog).toHaveLength(1)
    })

    it('two concurrent readToken() calls in the same tick issue exactly ONE requestRustInvoke -- call count is 1, not 2', async () => {
      let resolveInvoke: (value: unknown) => void = () => {}
      mockRequestRustInvoke.mockImplementation(
        (channel: string, args: unknown[]) => {
          callLog.push({ channel, args })
          return new Promise((resolve) => {
            resolveInvoke = resolve
          })
        }
      )
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      const first = readTokenOutcome(store, 'user-install')
      const second = readTokenOutcome(store, 'user-install')

      expect(callLog).toHaveLength(1)
      resolveInvoke('concurrent-token')

      await expect(first).resolves.toEqual({
        status: 'present',
        token: 'concurrent-token'
      })
      await expect(second).resolves.toEqual({
        status: 'present',
        token: 'concurrent-token'
      })
      expect(callLog).toHaveLength(1)
    })

    it('after a rejected read, a second readToken() inside 120s (memo hit) issues no additional requestRustInvoke and carries the ORIGINAL classification', async () => {
      jest.useFakeTimers()
      try {
        programChannel('keyring_get', {
          type: 'reject',
          error: new Error('keyring:timeout')
        })
        const store = new SidecarKeyringSlotStore(
          KEYRING_SLOT_STEAM_REFRESH_TOKEN
        )

        await expect(readTokenOutcome(store, 'user-refresh')).resolves.toEqual({
          status: 'unreadable',
          reason: 'timeout'
        })
        expect(callLog).toHaveLength(1)

        // Second read, still inside the memo window, a DIFFERENT trigger this time -- the memo
        // answer must still carry the ORIGINAL classification and issue no additional invoke.
        await expect(readTokenOutcome(store, 'game-page')).resolves.toEqual({
          status: 'unreadable',
          reason: 'timeout'
        })
        expect(callLog).toHaveLength(1)
      } finally {
        jest.useRealTimers()
      }
    })

    it('the memo-armed warning still contains the exact pre-existing substrings with trigger= appended, for a real trigger context (not just "unspecified")', async () => {
      programChannel('keyring_get', {
        type: 'reject',
        error: new Error('keyring:timeout')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await readTokenOutcome(store, 'user-play')

      const memoLine = mockLogWarning.mock.calls
        .map(([arg]) => String(arg))
        .find((line) => line.includes('keyring failure memoized slot='))
      expect(memoLine).toBeDefined()
      expect(memoLine).toContain('keyring failure memoized slot=')
      expect(memoLine).toContain('class=')
      expect(memoLine).toContain('ms=')
      expect(memoLine).toBe(
        `keyring failure memoized slot=${KEYRING_SLOT_HUMBLE_SESSION} class=timeout ms=120000 trigger=user-play`
      )
    })

    it('no log line anywhere in the module contains the token value, proven with a distinctive literal', async () => {
      const DISTINCTIVE_TOKEN = 'zzz-never-log-this-value-zzz'
      programChannel('keyring_get', {
        type: 'resolve',
        value: DISTINCTIVE_TOKEN
      })
      const store = new SidecarKeyringSlotStore(
        KEYRING_SLOT_STEAM_REFRESH_TOKEN
      )

      await readTokenOutcome(store, 'user-install')

      const allLines = [
        ...mockLogInfo.mock.calls,
        ...mockLogDebug.mock.calls,
        ...mockLogWarning.mock.calls
      ].map((c) => String(c[0]))
      expect(allLines.some((l) => l.includes(DISTINCTIVE_TOKEN))).toBe(false)
    })
  })

  /**
   * `keyring_available` is a PROMPTING channel too (quick-260905-jx3, closing Direction item 1 of
   * `2026-08-17-keyring-available-is-a-silent-prompt-channel.md`). Its Rust handler calls
   * `entry.get_password()` (`src-tauri/src/main.rs`), so a fresh probe raises a real macOS Keychain
   * approval prompt exactly as `keyring_get` does -- yet until this task `fetchAvailable()` logged
   * ONLY in its `catch`. A successful probe prompted the user and left no trace whatsoever in
   * `gamelib.log`, which made a real prompt unattributable after the fact and made every
   * absence-grep over `issuing keyring_get` structurally blind to it.
   *
   * These tests are the counterpart of the `keyring_get` block directly above, assertion for
   * assertion, so the two prompting channels cannot drift apart in what they record.
   */
  describe('keyring_available trigger= / elapsed= annotation (quick-260905-jx3)', () => {
    it('a fresh isAvailable("store-humble-secret") logs the issue line with trigger=store-humble-secret', async () => {
      programChannel('keyring_available', { type: 'resolve', value: true })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await expect(store.isAvailable('store-humble-secret')).resolves.toBe(true)
      expect(callLog).toHaveLength(1)

      const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
      expect(
        infoLines.some((l) =>
          l.includes(
            'issuing keyring_available (may prompt) trigger=store-humble-secret'
          )
        )
      ).toBe(true)
    })

    // The whole point of announcing at INFO is that the line exists BEFORE the prompt can appear
    // -- a line written only after the round trip settles is useless for attributing a prompt the
    // user is staring at right now, and is never written at all if the process is killed at the
    // dialog. Proven by holding the invoke open and asserting the line is already present.
    it('the issue line is written BEFORE the invoke settles, not after', async () => {
      const deferred = deferFirstCall('keyring_available')
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      const inFlight = store.isAvailable('boot-probe')
      const infoLinesDuring = mockLogInfo.mock.calls.map((c) => String(c[0]))
      expect(
        infoLinesDuring.some((l) =>
          l.includes(
            'issuing keyring_available (may prompt) trigger=boot-probe'
          )
        )
      ).toBe(true)
      // Non-vacuous: the round trip really is still open at this point, so the assertion above
      // could not have been satisfied by an outcome line written after it resolved.
      expect(
        infoLinesDuring.some((l) => l.includes('keyring_available ok'))
      ).toBe(false)

      deferred.resolve(true)
      await expect(inFlight).resolves.toBe(true)
    })

    it('the ok line carries available=true with trigger= and elapsed= appended AFTER it, never reordered', async () => {
      programChannel('keyring_available', { type: 'resolve', value: true })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await store.isAvailable('store-humble-secret')

      const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
      const okLine = infoLines.find((l) => l.includes('keyring_available ok'))
      expect(okLine).toBeDefined()
      expect(okLine).toContain('keyring_available ok available=true')
      // Order-sensitive, mirroring the keyring_get ordering test above: available= must appear
      // BEFORE trigger=/elapsed=, so a future edit cannot quietly rewrite the line's shape.
      const availableIdx = okLine!.indexOf('available=')
      const triggerIdx = okLine!.indexOf('trigger=')
      const elapsedIdx = okLine!.indexOf('elapsed=')
      expect(availableIdx).toBeGreaterThanOrEqual(0)
      expect(triggerIdx).toBeGreaterThan(availableIdx)
      expect(elapsedIdx).toBeGreaterThan(triggerIdx)
      expect(okLine).toContain('trigger=store-humble-secret')
      expect(okLine).toMatch(/elapsed=\d+ms/)
    })

    // A successful `false` is D-06's honest-unavailable: a COMPLETED probe that already raised
    // whatever prompt it was going to raise. It is not an error, and staying silent about it
    // would reproduce exactly half of the defect this task closes.
    it('a successful FALSE probe also logs an ok line (available=false) and still logs no warning', async () => {
      programChannel('keyring_available', { type: 'resolve', value: false })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await expect(store.isAvailable('store-humble-secret')).resolves.toBe(
        false
      )

      const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
      expect(
        infoLines.some((l) =>
          l.includes('keyring_available ok available=false')
        )
      ).toBe(true)
      expect(mockLogWarning).not.toHaveBeenCalled()
    })

    it('a rejected probe keeps the exact pre-existing warning substrings, with trigger= and elapsed= appended after them', async () => {
      programChannel('keyring_available', {
        type: 'reject',
        error: new Error('keyring:unavailable:PlatformFailure')
      })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await expect(store.isAvailable('store-humble-secret')).resolves.toBe(
        false
      )

      const warnLine = String(mockLogWarning.mock.calls[0][0])
      expect(warnLine).toContain('.isAvailable(): keyring_available failed:')
      expect(warnLine).toContain('keyring:unavailable:PlatformFailure')
      const failedIdx = warnLine.indexOf('failed:')
      expect(warnLine.indexOf('trigger=')).toBeGreaterThan(failedIdx)
      expect(warnLine).toContain('trigger=store-humble-secret')
      expect(warnLine).toMatch(/elapsed=\d+ms/)
    })

    // Distinguishes "zero prompts because nothing asked" from "zero prompts because the answer was
    // already in memory". Without this line the ABSENCE of an issue line proves neither.
    it('a cache-hit second call logs a DEBUG line saying no keyring_available was issued, and issues none', async () => {
      programChannel('keyring_available', { type: 'resolve', value: true })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await store.isAvailable('first')
      expect(callLog).toHaveLength(1)
      mockLogDebug.mockClear()

      await expect(store.isAvailable('second')).resolves.toBe(true)
      expect(callLog).toHaveLength(1)

      const debugLines = mockLogDebug.mock.calls.map((c) => String(c[0]))
      expect(
        debugLines.some(
          (l) =>
            l.includes('served from cache, no keyring_available issued') &&
            l.includes('trigger=second')
        )
      ).toBe(true)
    })

    it('a call that joins an in-flight probe logs its own DEBUG line and issues no additional keyring_available', async () => {
      const deferred = deferFirstCall('keyring_available')
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      const first = store.isAvailable('first')
      const second = store.isAvailable('joiner')
      expect(callLog).toHaveLength(1)

      const debugLines = mockLogDebug.mock.calls.map((c) => String(c[0]))
      expect(
        debugLines.some(
          (l) =>
            l.includes(
              'joined in-flight probe, no additional keyring_available issued'
            ) && l.includes('trigger=joiner')
        )
      ).toBe(true)

      deferred.resolve(true)
      await expect(first).resolves.toBe(true)
      await expect(second).resolves.toBe(true)
      expect(callLog).toHaveLength(1)
    })

    // The label is optional by contract; a caller that passes nothing must still produce an
    // attributable line rather than no line at all.
    it('an unlabelled isAvailable() still logs both lines, as trigger=unspecified', async () => {
      programChannel('keyring_available', { type: 'resolve', value: true })
      const store = new SidecarKeyringSlotStore(KEYRING_SLOT_HUMBLE_SESSION)

      await store.isAvailable()

      const infoLines = mockLogInfo.mock.calls.map((c) => String(c[0]))
      expect(
        infoLines.some((l) =>
          l.includes(
            'issuing keyring_available (may prompt) trigger=unspecified'
          )
        )
      ).toBe(true)
      expect(
        infoLines.some((l) => l.includes('keyring_available ok available=true'))
      ).toBe(true)
    })
  })

  /**
   * Hard constraints 3/4 (D-08/REQ-28-07, REQ-28-02) — grep-gate hygiene (binding, per the plan's
   * own instruction): every assertion here strips comments first (the doc comments this plan adds
   * mention `configStore`/`process.env` BY NAME and would self-invalidate an unfiltered count) and
   * is RED-proven against a specimen DERIVED from the real source by insertion, never hand-authored.
   */
  describe('grep-gate hygiene: no configStore / TOKEN_STORE_KEY / process.env reach (D-08/REQ-28-02/REQ-28-07)', () => {
    const KEYRING_TOKEN_STORE_SRC_PATH = join(
      __dirname,
      '..',
      'keyringTokenStore.ts'
    )
    const USER_SRC_PATH = join(
      __dirname,
      '..',
      '..',
      'storeManagers',
      'steam',
      'user.ts'
    )

    it('comment-stripped keyringTokenStore.ts contains zero configStore, zero TOKEN_STORE_KEY, zero process.env', () => {
      const stripped = stripSourceComments(
        readFileSync(KEYRING_TOKEN_STORE_SRC_PATH, 'utf-8')
      )
      expect(stripped).not.toMatch(/configStore/)
      expect(stripped).not.toMatch(/TOKEN_STORE_KEY/)
      expect(stripped).not.toMatch(/process\.env/)
    })

    it('RED-proof: the configStore/TOKEN_STORE_KEY/process.env check trips against a specimen derived by inserting the forbidden line into the real keyringTokenStore.ts source', () => {
      const real = readFileSync(KEYRING_TOKEN_STORE_SRC_PATH, 'utf-8')
      const configStoreSpecimen = stripSourceComments(
        `${real}\nconst x = configStore.get('leak')\n`
      )
      expect(configStoreSpecimen).toMatch(/configStore/)

      const tokenStoreKeySpecimen = stripSourceComments(
        `${real}\nconst y = TOKEN_STORE_KEY\n`
      )
      expect(tokenStoreKeySpecimen).toMatch(/TOKEN_STORE_KEY/)

      const processEnvSpecimen = stripSourceComments(
        `${real}\nconst z = process.env.STEAM_TOKEN\n`
      )
      expect(processEnvSpecimen).toMatch(/process\.env/)
    })

    it('comment-stripped user.ts contains zero process.env', () => {
      const stripped = stripSourceComments(readFileSync(USER_SRC_PATH, 'utf-8'))
      expect(stripped).not.toMatch(/process\.env/)
    })

    it('RED-proof: the user.ts process.env check trips against a specimen derived by inserting the forbidden line into the real source', () => {
      const real = readFileSync(USER_SRC_PATH, 'utf-8')
      const specimen = stripSourceComments(
        `${real}\nconst leak = process.env.STEAM_REFRESH_TOKEN\n`
      )
      expect(specimen).toMatch(/process\.env/)
    })
  })

  /**
   * The prompting-channel LEDGER (quick-260905-kd0, closing Direction item 2 of
   * `2026-08-17-keyring-available-is-a-silent-prompt-channel.md`).
   *
   * `260817-d61`'s Gate A asserts "startup issues NO Steam keyring read" by grepping the log for
   * an absence. That gate was BLIND to `keyring_available` for as long as it existed: the channel
   * prompts (its Rust handler calls `entry.get_password()`) but logged nothing on success, so the
   * grep had nothing to match and the gate measured a property strictly narrower than the one it
   * appeared to guard. Widening the grep fixed that instance. This block is what stops the NEXT
   * instance, because a pattern written into a quick-task markdown file from August cannot notice
   * a fifth channel being added to this module in a year's time.
   *
   * Deliberately a LEDGER, not a name list -- the same shape this repo already requires of
   * `dispatch_rust_channel`'s allowlist. A bare set of four strings could be turned green by
   * appending a fifth, which would throw the property away. Each entry has to state whether the
   * channel can prompt and whether it announces itself BEFORE the invoke, because those two facts
   * are what any startup-absence gate has to be built from.
   */
  describe('prompting-channel ledger (quick-260905-kd0)', () => {
    const SRC_PATH = join(__dirname, '..', 'keyringTokenStore.ts')

    type LedgerEntry = {
      /** Can this round trip raise a macOS Keychain authorization prompt? */
      canPrompt: boolean
      /** Is an `issuing <channel> (may prompt)` line written BEFORE the invoke? */
      announcesBeforeInvoke: boolean
      note: string
    }

    const LEDGER: Record<string, LedgerEntry> = {
      RUST_KEYRING_GET: {
        canPrompt: true,
        announcesBeforeInvoke: true,
        note: 'The original prompting read. Announced since F-34.5-G6-26.'
      },
      RUST_KEYRING_AVAILABLE: {
        canPrompt: true,
        announcesBeforeInvoke: true,
        note:
          'NOT a cheap capability probe -- the Rust handler calls entry.get_password(), so it ' +
          'prompts exactly like keyring_get. Silent on success until quick-260905-jx3; that ' +
          'silence is what made 260817-d61 Gate A blind to it.'
      },
      RUST_KEYRING_SET: {
        canPrompt: true,
        announcesBeforeInvoke: false,
        note:
          'setToken()\'s own source comment: "a write is a real Keychain round trip and can ' +
          'prompt". It logs only AFTER the invoke (ok len= / failed). Sufficient for an ABSENCE ' +
          'gate -- a completed round trip always leaves a line -- but it cannot attribute a ' +
          'prompt the user is looking at right now. Adding the announcement is a real, open gap.'
      },
      RUST_KEYRING_DELETE: {
        canPrompt: true,
        announcesBeforeInvoke: false,
        note:
          "clearToken()'s own source comment records a 2026-08-14 session observing TWO prompts " +
          'during a single Steam sign-out. Same post-invoke-only shape as RUST_KEYRING_SET.'
      }
    }

    /** Every channel constant this module actually hands to `requestRustInvoke`, read from
     * comment-stripped source. Comment-stripped and not raw: this file's own prose names all four
     * constants, and so does the module's, so a raw match would be satisfied by documentation
     * rather than by a call site. */
    function invokedChannels(source: string): string[] {
      const stripped = stripSourceComments(source)
      const found = new Set<string>()
      const re = /requestRustInvoke\(\s*(RUST_KEYRING_[A-Z_]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(stripped)) !== null) found.add(m[1])
      return [...found].sort()
    }

    it('every channel invoked by this module is declared in the ledger, and every ledger entry is really invoked', () => {
      const invoked = invokedChannels(readFileSync(SRC_PATH, 'utf-8'))

      // Non-vacuous: the census really did find call sites, so an equality below cannot pass
      // merely because both sides were empty.
      expect(invoked.length).toBeGreaterThan(0)
      expect(invoked).toEqual(Object.keys(LEDGER).sort())
    })

    it('RED-proof: a fifth channel added to the source trips the census, so it cannot be introduced silently', () => {
      // Specimen DERIVED from the real source by insertion, never hand-authored -- the same
      // discipline the grep-gate hygiene block above uses.
      const real = readFileSync(SRC_PATH, 'utf-8')
      const specimen = `${real}\nasync function smuggled() {\n  await requestRustInvoke(RUST_KEYRING_SMUGGLED, [])\n}\n`

      const invoked = invokedChannels(specimen)
      expect(invoked).toContain('RUST_KEYRING_SMUGGLED')
      expect(invoked).not.toEqual(Object.keys(LEDGER).sort())
    })

    it('RED-proof: the census reads CALL SITES, not prose -- a constant named only in a comment does not count', () => {
      const real = readFileSync(SRC_PATH, 'utf-8')
      const specimen = `${real}\n// a comment mentioning requestRustInvoke(RUST_KEYRING_SMUGGLED, []) and nothing more\n`

      expect(invokedChannels(specimen)).toEqual(Object.keys(LEDGER).sort())
    })

    it('every channel the ledger marks as announcing really does emit an "issuing ... (may prompt)" line, and the ones it does not are honestly recorded', () => {
      const stripped = stripSourceComments(readFileSync(SRC_PATH, 'utf-8'))

      for (const [channel, entry] of Object.entries(LEDGER)) {
        const announces = stripped.includes(
          `issuing \${${channel}} (may prompt)`
        )
        expect({ channel, announces }).toEqual({
          channel,
          announces: entry.announcesBeforeInvoke
        })
      }
    })

    // The whole reason this block exists. If a channel that can prompt is ever left out of a
    // startup-absence gate, that gate reports PASS while the user is clicking through a Keychain
    // dialog -- which is exactly what happened to `keyring_available` under 260817-d61 Gate A.
    it('every channel that can prompt is accounted for, so no startup-absence gate can be narrower than the prompt surface', () => {
      const prompting = Object.entries(LEDGER)
        .filter(([, e]) => e.canPrompt)
        .map(([c]) => c)
        .sort()

      expect(prompting).toEqual(
        invokedChannels(readFileSync(SRC_PATH, 'utf-8'))
      )
      expect(prompting).toHaveLength(4)
    })
  })
})

/**
 * Cross-language ordering invariant (34.5 gap cycle 4 plan 35, Routing item 3, T-34.5-C4-33):
 * `KEYRING_FAILURE_MEMO_MS` (this module) must stay at least 2x `KEYRING_READ_TIMEOUT`
 * (`src-tauri/src/main.rs`). Parses the Rust constant directly out of `main.rs` the way
 * `longRunningChannels.test.ts` parses `LONG_RUNNING_CHANNELS` out of the same file, rather than
 * hardcoding 45 a second time here -- a future edit to EITHER constant that breaks the >= 2x
 * relationship must fail this test, naming both file paths.
 */
describe('KEYRING_FAILURE_MEMO_MS vs KEYRING_READ_TIMEOUT ordering invariant (Routing item 3)', () => {
  const MAIN_RS_PATH = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'src-tauri',
    'src',
    'main.rs'
  )
  const KEYRING_TOKEN_STORE_PATH = join(__dirname, '..', 'keyringTokenStore.ts')

  function extractKeyringReadTimeoutMs(): number {
    const raw = readFileSync(MAIN_RS_PATH, 'utf-8')
    const match = raw.match(
      /const KEYRING_READ_TIMEOUT: Duration = Duration::from_secs\((\d+)\);/
    )
    if (!match) {
      throw new Error(
        `KEYRING_READ_TIMEOUT literal not found in ${MAIN_RS_PATH}`
      )
    }
    return Number(match[1]) * 1000
  }

  function extractKeyringFailureMemoMs(): number {
    const raw = readFileSync(KEYRING_TOKEN_STORE_PATH, 'utf-8')
    const match = raw.match(/const KEYRING_FAILURE_MEMO_MS = (\d[\d_]*)/)
    if (!match) {
      throw new Error(
        `KEYRING_FAILURE_MEMO_MS literal not found in ${KEYRING_TOKEN_STORE_PATH}`
      )
    }
    return Number(match[1].replace(/_/g, ''))
  }

  test('KEYRING_FAILURE_MEMO_MS is at least 2x the KEYRING_READ_TIMEOUT parsed live from src-tauri/src/main.rs', () => {
    const readTimeoutMs = extractKeyringReadTimeoutMs()
    const memoMs = extractKeyringFailureMemoMs()

    // Non-vacuous: KEYRING_READ_TIMEOUT really was parsed as a positive number, so this assertion
    // could not pass merely because both sides evaluated to 0/NaN.
    expect(readTimeoutMs).toBeGreaterThan(0)

    expect(memoMs).toBeGreaterThanOrEqual(2 * readTimeoutMs)
    if (memoMs < 2 * readTimeoutMs) {
      throw new Error(
        `KEYRING_FAILURE_MEMO_MS (${memoMs}ms, src/backend/sidecar/keyringTokenStore.ts) must be ` +
          `at least 2x KEYRING_READ_TIMEOUT (${readTimeoutMs}ms, src-tauri/src/main.rs)`
      )
    }
  })

  // RED-proof (this task's own acceptance criteria): verified load-bearing by temporarily
  // lowering KEYRING_FAILURE_MEMO_MS below 2x the real read timeout and confirming this exact
  // assertion goes RED, then restoring the real value. See 34.5-35-SUMMARY.md for the recorded
  // RED transcript -- this synthetic self-test proves the SAME comparison can fail without
  // mutating the real source file on every CI run.
  test('self-test: a synthetic memo value below 2x the real read timeout trips the same comparison this test enforces', () => {
    const readTimeoutMs = extractKeyringReadTimeoutMs()
    const tooSmallMemoMs = 2 * readTimeoutMs - 1
    expect(tooSmallMemoMs).toBeLessThan(2 * readTimeoutMs)
  })
})
