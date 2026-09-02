/**
 * Unit tests for LegendaryUser.logout() (Phase 34.5 Plan 06, T-34.5-19/T-34.5-20,
 * REQ-34.5-04).
 *
 * No test file existed for this module before Phase 34.5 Plan 06. These tests originally
 * covered the defect that plan fixed: under the Tauri sidecar, `session.fromPartition(
 * 'persist:epicstore')` resolved the sidecar's `{}` stub (electronStub.ts) which had no
 * `clear*` methods, so the FIRST `ses.clearStorageData()` call used to throw a TypeError and
 * abort logout() before `configStore.delete('userInfo')`/`clearCache('legendary')` ever ran —
 * leaving the stored profile behind despite CLI credential revocation succeeding.
 *
 * Phase 39 Plan 04 Task 1 collapsed logout()'s `if (seam === null) { ...5-step
 * session.fromPartition wipe... } else { ...seam-driven wipe... }` shape into a single,
 * unconditional, seam-driven `wipeSteps` array — the `session.fromPartition('persist:
 * epicstore')` branch this file used to mock no longer exists in source at all (`user.ts` no
 * longer imports `session` from `backend/platform`). The tests that drove that branch directly
 * (the deleted five-clear-call-order tests, and the "no clear* methods" defect-fix test) were
 * either deleted as duplicates of an equivalent seam-based test or re-pointed at the seam — see
 * Phase 39 Plan 04's SUMMARY for exactly which and why.
 *
 * Mock boundaries:
 *  - backend/logger                    -> logInfo/logError/logWarning
 *  - ../../../utils                    -> clearCache
 *  - backend/constants/key_value_stores -> configStore
 *  - '..' (storeManagers/index)        -> libraryManagerMap['legendary'].runRunnerCommand
 *  - ../../../humble/userAgent         -> standardBrowserUserAgent (fixed string)
 *
 * `../../../humble/loginWindowSeam` is NOT mocked — it is a plain module-scoped holder +
 * pure classifier (no platform imports), so tests drive it directly via
 * `setLoginWindowSeam(seam | null)`/`getLoginWindowSeam()`, exactly as production code does.
 */

// `./constants` transitively pulls in `backend/constants/paths.ts`, which
// reads `app.getPath`/`app.getAppPath`/`app.isPackaged` at MODULE SCOPE
// (config-folder resolution + legacy-Heroic migration + `publicDir`
// anchoring) — none of it relevant to logout(), so the whole chain is
// mocked out rather than hand-stubbing electron's `app` surface.
jest.mock('../constants', () => ({
  legendaryUserInfo: '/tmp/gamelib-legendary-user-test/user.json'
}))

// ── backend/logger mock ───────────────────────────────────────────────────────────────────
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Legendary: 'Legendary',
    Backend: 'Backend'
  }
}))

// ── ../../../utils mock (clearCache) ──────────────────────────────────────────────────────
jest.mock('../../../utils', () => ({
  clearCache: jest.fn()
}))

// ── backend/constants/key_value_stores mock (configStore) ────────────────────────────────
const mockConfigStore = {
  get: jest.fn(),
  get_nodefault: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn()
}
jest.mock('backend/constants/key_value_stores', () => ({
  configStore: mockConfigStore
}))

// ── '..' mock (storeManagers/index -> libraryManagerMap) ─────────────────────────────────
const mockRunRunnerCommand = jest.fn()
jest.mock('../..', () => ({
  libraryManagerMap: {
    legendary: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
}))

// ── backend/constants/environment mock (isMac) ───────────────────────────────────────────
// See `epicCookieCensus.test.ts`'s copy of this mock for why it is a
// `defineProperty` and not an object-literal getter — the literal form is
// silently inert under TypeScript's `__assign` spread helper and would make
// every platform branch below measure the real `process.platform` instead.
let mockIsMac = true
jest.mock('backend/constants/environment', () => {
  const actual = jest.requireActual('backend/constants/environment')
  return Object.defineProperty({ ...actual }, 'isMac', {
    get: () => mockIsMac
  })
})

// ── ../../../humble/userAgent mock (standardBrowserUserAgent) ────────────────────────────
jest.mock('../../../humble/userAgent', () => ({
  standardBrowserUserAgent: () =>
    'Mozilla/5.0 (Test) Chrome/100.0 Safari/537.36'
}))

import { LegendaryUser } from '../user'
import { clearCache } from '../../../utils'
import { logError, logInfo, logWarning } from 'backend/logger'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../../../humble/loginWindowSeam'

function makeMockSeam(
  overrides: Partial<LoginWindowSeam> = {}
): LoginWindowSeam & {
  open: jest.Mock
  clearCookies: jest.Mock
  close: jest.Mock
  clearStorage: jest.Mock
} {
  return {
    open: jest.fn().mockResolvedValue('window-label-1'),
    cookies: jest.fn(),
    // A LIVE jar (total=9) holding no Epic-owned cookies — what production
    // looks like once Epic's have been removed from a shared jar that still
    // holds other runners' sessions. Previously a bare `jest.fn()`, i.e. every
    // census read rejected; that is the pre-9106ccbea production shape, and the
    // post-clear verification sweep now treats an unreadable jar as fatal
    // rather than silently certifying "0 remain" (see epicCookieCensus.test.ts
    // (e2)-(e4)). Tests in this file that are ABOUT a failing read override it.
    cookiesForDomain: jest.fn().mockResolvedValue({ total: 9, matched: [] }),
    takeEvents: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
    clearCookies: jest.fn().mockResolvedValue(3),
    revealPost: jest.fn(),
    // Phase 34.4.1 gap-cycle plan 16 (F-6's verbatim twin): LoginWindowSeam
    // gained clearStorage in plan 15; logout()'s Tauri branch now calls it
    // (this task). Default a healthy, fully-numeric report.
    clearStorage: jest.fn().mockResolvedValue({
      localStorage: 0,
      sessionStorage: 0,
      indexedDB: 0,
      caches: 0,
      serviceWorkers: 0
    }),
    ...overrides
  } as LoginWindowSeam & {
    open: jest.Mock
    clearCookies: jest.Mock
    close: jest.Mock
    clearStorage: jest.Mock
  }
}

describe('LegendaryUser.logout()', () => {
  beforeEach(() => {
    mockIsMac = true
    // Re-arm default mock behavior. Jest's project-wide `resetMocks: true` (jest.config.js)
    // already stripped every mock's calls history AND implementation before this hook ran, so
    // everything the module-under-test needs a resolved value/return value for must be
    // (re-)established here, not relied on from module-scope `jest.fn(impl)`/`mockResolvedValue`
    // calls (those are stripped too).
    setLoginWindowSeam(null)
    mockRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: undefined,
      abort: false
    })
  })

  afterEach(() => {
    setLoginWindowSeam(null)
  })

  it('REQ-34.5-04: the CLI-error early return is unchanged — no cookie step or configStore.delete runs', async () => {
    mockRunRunnerCommand.mockResolvedValue({
      stdout: '',
      stderr: '',
      error: 'boom',
      abort: false
    })

    await LegendaryUser.logout()

    expect(logError).toHaveBeenCalledWith(
      ['Failed to logout:', 'boom'],
      'Legendary'
    )
    expect(mockConfigStore.delete).not.toHaveBeenCalled()
    expect(clearCache).not.toHaveBeenCalled()
  })

  // Phase 39 Plan 04 Task 3: the test that used to live here — "with a session object exposing
  // no clear* methods, logout() does NOT throw and configStore.delete('userInfo') STILL runs" —
  // drove the now-deleted `if (seam === null)` Electron branch directly (it simulated
  // electronStub.ts's `{}` session stub). Task 1 removed that branch from source entirely, so
  // the scenario is unreachable. Its invariant — the credential-side cleanup
  // (configStore.delete('userInfo') + clearCache('legendary')) runs even when the ENTIRE
  // partition wipe fails — survives, unweakened, in "F-6 twin: the credential-side cleanup runs
  // even when BOTH the cookie step and the storage step reject" below, which exercises the same
  // property through the surviving seam path instead.

  it('REQ-34.5-04: asserts call ORDER — auth --delete runs before any cookie step, and cookie steps run before configStore.delete', async () => {
    const callOrder: string[] = []
    mockRunRunnerCommand.mockImplementation(async () => {
      callOrder.push('auth-delete')
      return { stdout: '', stderr: '', error: undefined, abort: false }
    })
    // Phase 39 Plan 04 Task 3: this test used to drive the deleted Electron
    // `session.fromPartition('persist:epicstore').clearStorageData()` call to prove the
    // ordering; the seam-driven `clearCookies` step is the surviving equivalent "a cookie-side
    // wipe step ran" signal (it is also the LAST wipeSteps entry per the ORDER-IS-LOAD-BEARING
    // comment in user.ts, so proving it precedes configStore.delete proves the whole loop does).
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockImplementation(async () => {
        callOrder.push('clearCookies')
        return 3
      })
    })
    setLoginWindowSeam(seam)
    mockConfigStore.delete.mockImplementation((key: string) => {
      callOrder.push(`configStore.delete:${key}`)
    })

    await LegendaryUser.logout()

    const authIdx = callOrder.indexOf('auth-delete')
    const cookieIdx = callOrder.indexOf('clearCookies')
    const deleteIdx = callOrder.indexOf('configStore.delete:userInfo')

    expect(authIdx).toBeGreaterThanOrEqual(0)
    expect(cookieIdx).toBeGreaterThan(authIdx)
    expect(deleteIdx).toBeGreaterThan(cookieIdx)
  })

  // Phase 39 Plan 04 Task 3: the test that used to live here — "with a full Electron-shaped
  // session, all five clear calls run in order" — asserted the exact call order of the FIVE
  // deleted `session.fromPartition()` clear methods (clearStorageData/clearCache/
  // clearAuthCache/clearHostResolverCache/clearData). Task 1 deleted the only call site for all
  // five; the assertion has nothing left to check. The NEW two-step wipe order
  // (`clearEpicStorage` before `clearEpicCookies`) is deliberately covered by a SOURCE gate, not
  // a live call-order test, in `epicLogoutDomains.test.ts`'s "wipe-step ORDER: the storage step
  // runs BEFORE the cookie sweep" describe — its own header comment explains why a live/mocked
  // test cannot observe this property (a mocked `clearStorage` never re-seeds cookies the way
  // the real Epic origin load does, so a live test would stay green even with the steps
  // reversed — exactly the blind spot that caused this ordering bug in production the first
  // time). That gate is untouched by this plan and was green before and after Task 1.

  it('REQ-34.5-04 (T-34.5-20): with a seam installed, clearCookies is called with the Epic host, and off macOS the window is closed even when the clear rejects', async () => {
    // Driven off macOS deliberately: this test's subject is the window
    // lifecycle (`the window is closed even when the clear rejects`), and
    // macOS no longer opens one. The macOS branch's own contract — that it
    // opens nothing to leak — is asserted in `epicLogoutDomains.test.ts` and
    // `epicCookieCensus.test.ts`.
    mockIsMac = false
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust-side clear failed'))
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09 (T-35-39): a FAILED cookie clear is now fatal to
    // logout()'s reported outcome — it used to resolve, swallowing the
    // failure. This test's original subject is unchanged and still asserted
    // below: the window is closed and the credential-side cleanup still runs
    // regardless.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust-side clear failed'
    )

    // Phase 39 Plan 04 Task 3: this used to also assert
    // `expect(mockFromPartition).not.toHaveBeenCalled()` — session.fromPartition() has no
    // remaining call site anywhere in user.ts (Task 1 deleted it), so that assertion would be
    // vacuously true regardless of what logout() does and was removed.
    // The url must NOT be Epic's. Opening this hidden window at Epic's live
    // login page is the root cause recorded in
    // `.planning/debug/resolved/epic-cookie-clear-read-divergence.md`: the load
    // re-seeded the cookies the sweep had just removed. This assertion
    // previously required the opposite (`stringContaining('epicgames.com')`).
    expect(seam.open).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ visible: false })
    )
    expect(seam.open.mock.calls[0][0]).not.toContain('epicgames.com')
    expect(seam.clearCookies).toHaveBeenCalledWith(
      'window-label-1',
      'epicgames.com'
    )
    expect(seam.close).toHaveBeenCalledWith('window-label-1')
    // Credential-side cleanup still ran despite the rejected clear.
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
  })

  it('REQ-34.5-04 (T-34.5-20): with a seam installed and a healthy clear, the domain passed is never a blanket/empty value', async () => {
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    const [, domainArg] = seam.clearCookies.mock.calls[0]
    expect(domainArg).toBe('epicgames.com')
    expect(domainArg).not.toBe('')
    // T-34.5-20: never a blanket clear — this repo-wide invariant is also grep-asserted at the
    // phase level against the forbidden Rust-side blanket-wipe method name (see 34.5-06-PLAN.md's
    // verification block).
  })

  // ── Phase 34.4.1 gap-cycle plan 16 (F-6's verbatim twin, BLOCKING closure) ──────────────
  // The Tauri wipeSteps array now has MORE THAN ONE entry — the same shape plan 16 closed in
  // humble/user.ts's disconnect(), mirrored here so the two test files can be diffed for parity.

  it('F-6 twin: the Tauri wipeSteps run BOTH a cookie step and a storage step (more than one entry)', async () => {
    const seam = makeMockSeam({
      clearStorage: jest.fn().mockResolvedValue({
        localStorage: 4,
        sessionStorage: 2,
        indexedDB: 1,
        caches: 0,
        serviceWorkers: 0
      })
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    expect(seam.clearCookies).toHaveBeenCalled()
    expect(seam.clearStorage).toHaveBeenCalledWith(
      expect.stringContaining('epicgames.com'),
      expect.any(String)
    )
  })

  it('F-6 twin: the credential-side cleanup runs even when BOTH the cookie step and the storage step reject', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust cookie clear failed')),
      clearStorage: jest
        .fn()
        .mockRejectedValue(new Error('rust storage clear failed'))
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09: logout REJECTS now (the cookie step is fatal), but the
    // credential-side cleanup — this test's actual subject, T-34.5-19's
    // security boundary — still runs unconditionally before the rethrow.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust cookie clear failed'
    )

    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
    // The NON-fatal storage step keeps its warn-and-continue behaviour.
    expect(logWarning).toHaveBeenCalled()
    // The fatal step is logged at ERROR, not merely warned about.
    expect(logError).toHaveBeenCalled()
  })

  it('CR-01 (T-34.5-19): with NO seam installed, the credential-side cleanup still runs and the wiring diagnostic still reaches the caller', async () => {
    // Phase 39 CR-01: `beforeEach` above already leaves the seam unset
    // (`setLoginWindowSeam(null)`) and arms `mockRunRunnerCommand` with a
    // success result, so this test installs NOTHING — that absence is its
    // whole subject. This is the FIRST test in this file to drive logout()
    // past the CLI-success point with no seam installed at all.
    //
    // Neither existing seam instrument can catch this defect class:
    // `src/backend/sidecar/__tests__/seamBranchParity.test.ts` compares
    // wipe-step capability SHAPE by parsing source, and
    // `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` matches
    // predicate TEXT. Statement ORDERING — whether the seam is acquired
    // before or after the credential-side cleanup — is invisible to both,
    // which is why this defect shipped through a green Phase 39.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'no login-window seam is installed'
    )

    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
  })

  it('F-6 twin: a rejecting clearStorage step still leaves logout() resolving, and the cookie step ran anyway', async () => {
    const seam = makeMockSeam({
      clearStorage: jest
        .fn()
        .mockRejectedValue(new Error('rust storage clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    expect(seam.clearCookies).toHaveBeenCalled()
    expect(logWarning).toHaveBeenCalled()
  })

  it('F-6 twin: a rejecting clearCookies step does not prevent the storage step from running', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockRejectedValue(new Error('rust cookie clear failed'))
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09: the fatal cookie step is captured and rethrown AFTER
    // the loop, so the remaining steps still run — that is this test's subject
    // and it survives the change intact.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust cookie clear failed'
    )

    expect(seam.clearStorage).toHaveBeenCalledWith(
      expect.stringContaining('epicgames.com'),
      expect.any(String)
    )
  })

  // Phase 39 Plan 04 Task 3: "with a full Electron-shaped session, all five clear calls still
  // run in order (unchanged by plan 16)" — a byte-identical duplicate of the deleted
  // "all five clear calls run in order" test above — was removed for the same reason: Task 1
  // deleted the only call site for all five Electron session clear methods. See the comment
  // above the first deletion for the surviving coverage of the new two-step order.

  // ── Phase 34.4.1 Plan 23 (F-6 Defect B): Epic's clearEpicCookies step is the second, ──────
  // already-shipped caller of the SAME humble_login_clear_cookies Rust arm humble/user.ts's
  // disconnect() uses. It carried Defect B verbatim since Phase 34.5 plan 06 and was never
  // independently verified -- these tests give it the same observability Humble already had.

  it('REQ-34.4.1-06 (Plan 23, F-6 Defect B): clearEpicCookies logs the measured count the clear returned', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(4)
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('cleared 4 epicgames.com cookie(s)'),
      'Legendary'
    )
    // States the count is a measured post-removal delta, not an attempted count.
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('measured post-removal delta'),
      'Legendary'
    )
  })

  it('REQ-34.4.1-06 (Plan 23, F-6 Defect B) / T-35-39: a clearCookies total of 0 FAILS the logout (it used to be a swallowed warning)', async () => {
    const seam = makeMockSeam({
      // The census reads are left UNREADABLE here on purpose. This test's
      // subject is the legacy fail-closed path for a zero total, and that path
      // is only reachable when the jar does NOT prove itself Epic-empty. With
      // the file's live-jar default the three-case rule would (correctly)
      // classify every host SUPPORTED_BUT_EMPTY and resolve instead — which is
      // Task 2 case (1)'s subject, not this one.
      cookiesForDomain: jest.fn(),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    // Phase 35 plan 09 (operator decision D-09-CORRECTED): this used to
    // `logWarning('... removed nothing for epicgames.com')` and let the wipe
    // loop swallow it, which is the defect class that produced the original
    // lying self-report. It is now a rejection.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing across all 5 Epic-owned domains/
    )

    // The credential-side security boundary still ran (T-34.5-19).
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
    expect(clearCache).toHaveBeenCalledWith('legendary')
  })

  it('REQ-34.4.1-06 (Plan 23, F-6 Defect B) / T-35-39: a healthy non-zero total resolves and warns about nothing', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(2)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    const removedNothingCall = (logWarning as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes('removed nothing')
    )
    expect(removedNothingCall).toBeUndefined()
    expect(logError).not.toHaveBeenCalled()
  })
})
