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

// ── sidecarRpc mock — fake Rust responder, in-memory program + call log ─────
jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

// ── logger mock — mirrors tokenStore.test.ts's existing convention ──────────
const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
jest.mock('backend/logger', () => ({
  logInfo: (...args: unknown[]) => mockLogInfo(...args),
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

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

let program: Record<string, ProgrammedOutcome> = {}
let callLog: Array<{ channel: string; args: unknown[] }> = []

function programChannel(channel: string, outcome: ProgrammedOutcome): void {
  program[channel] = outcome
}

describe('SidecarKeyringTokenStore', () => {
  beforeEach(() => {
    program = {}
    callLog = []
    // resetMocks: true (jest.config.js) wipes even a factory-supplied implementation before
    // every test (same gotcha 28-03-SUMMARY.md documents for its configStore mock) — the
    // fake responder must be re-wired here, not only at module scope.
    mockRequestRustInvoke.mockImplementation((channel: string, args: unknown[]) => {
      callLog.push({ channel, args })
      const outcome = program[channel]
      if (!outcome) {
        return Promise.reject(new Error(`no outcome programmed for channel: ${channel}`))
      }
      return outcome.type === 'resolve'
        ? Promise.resolve(outcome.value)
        : Promise.reject(outcome.error)
    })
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
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
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
      { channel: 'keyring_set', args: ['abc', KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
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
      { channel: 'keyring_set', args: ['abc', KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
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
  // report of unavailability, not an error -- must not be logged as a warning).
  it('isAvailable() resolves false when keyring_available reports false, without logging', async () => {
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
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    const [warningArg] = mockLogWarning.mock.calls[0]
    expect(String(warningArg)).toContain('timed out')
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
      { channel: 'keyring_set', args: ['abc', KEYRING_SLOT_STEAM_REFRESH_TOKEN] }
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
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
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
    expect(KEYRING_SLOT_HUMBLE_SESSION).not.toEqual(KEYRING_SLOT_STEAM_REFRESH_TOKEN)
    expect(KEYRING_SLOT_HUMBLE_CSRF).not.toEqual(KEYRING_SLOT_STEAM_REFRESH_TOKEN)
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
    const src = readFileSync(join(__dirname, '../keyringTokenStore.ts'), 'utf-8')
    expect(src).not.toMatch(/configStore|TOKEN_STORE_KEY|TOKEN_PREFIX|writeFileSync/)
  })

  // Existing export name survives (D-04): bootstrap.ts must be able to keep calling
  // `new SidecarKeyringTokenStore()` with no args, unedited.
  it('SidecarKeyringTokenStore keeps its no-argument construction', () => {
    expect(() => new SidecarKeyringTokenStore()).not.toThrow()
  })
})
