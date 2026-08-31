/**
 * Epic logout — per-host cookie CENSUS and the jar-liveness fatality rule
 * (Phase 35 plan 23, REQ-35-07, D-35-19-15, CR-04 part 2).
 *
 * What this file exists to prove, and why each half is load-bearing:
 *
 *  1. `35-VERIFICATION.md`'s REQ-35-07 gap (D-35-19-15): a bare per-domain
 *     delta cannot tell "no cookies were present" from "the clear did not
 *     work" — the live gate measured exactly that ambiguity (four of five
 *     Epic-owned domains returned a 0 delta, only `epicgames.com` exercised a
 *     real removal, and a bare sum could not distinguish the two). This ports
 *     `humble/user.ts`'s disconnect() before/after jar census to
 *     `clearEpicCookies` so a zero is self-interpreting per host, not just in
 *     aggregate.
 *  2. `35-REVIEW.md`'s CR-04 part 2: "distinguish 'cleared nothing because
 *     there was nothing' from 'cleared nothing because the clear is
 *     broken'" — use the unfiltered jar liveness proof to decide, instead of
 *     the matched-delta sum alone, so a genuinely empty Epic jar is `ok` and
 *     a jar proven populated with a zero delta is `fatal`.
 *  3. `cookiesForDomain` (NEVER `cookies` — the wrong direction for a fixed
 *     apex, spike 016) is called exactly THREE times per host — before the
 *     clear, after the clear, and once more in a final verification sweep taken
 *     after every mutation in the step is done — always with an EMPTY name
 *     filter. The first two mirror `humble/user.ts`'s census exactly. The third
 *     was added by the debug session `epic-cookie-clear-read-divergence`, which
 *     measured the before/after pair reporting `matched=0` on all five hosts
 *     while the jar three seconds later still held six live Epic records: a
 *     mid-sweep read can be honestly zero and still say nothing about the state
 *     the logout leaves behind. Only the third read can satisfy REQ-35-07's
 *     literal wording, "does not report success unless a post-clear read
 *     confirms it".
 *  4. A rejecting census read is non-fatal evidence, never a blocker: the
 *     clear is the user-visible operation; the census is evidence about it.
 *  5. Only counts, verdict enum values and domain names ever reach a log
 *     sink — never a cookie name, value, token or account identifier (this
 *     repo is PUBLIC, T-35-04).
 *
 * CR-04's OTHER half (routing a fatal logout to `window.api.logError` +
 * `showDialogModal`) is the RENDERER side and was already shipped by plan
 * 35-22 in `src/frontend/screens/Login/components/Runner/index.tsx` — not
 * this file's concern.
 *
 * D-35-19-15 is NOT closed by this plan: these are unit tests against mocked
 * `cookiesForDomain`/`clearCookies` calls. Live proof that a REAL secondary
 * Epic domain (fortnite.com/unrealengine.com/twinmotion.com/metahuman.com)
 * survives-then-clears correctly is deferred to plan 35-29's criterion-21
 * re-run, seeded with a non-primary-domain cookie confirmed present before
 * logout (see 35-23-SUMMARY.md).
 *
 * Mock boundaries mirror `epicLogoutDomains.test.ts`'s exactly — see that
 * file's header for why each one is needed. `../../../humble/loginWindowSeam`
 * is deliberately NOT mocked: it is a plain module-scoped holder + pure
 * classifier, driven here the same way production drives it.
 */

const mockClearStorageData = jest.fn()
const mockClearCache = jest.fn()
const mockClearAuthCache = jest.fn()
const mockClearHostResolverCache = jest.fn()
const mockClearData = jest.fn()

const mockFromPartitionReturn: Record<string, unknown> = {
  clearStorageData: mockClearStorageData,
  clearCache: mockClearCache,
  clearAuthCache: mockClearAuthCache,
  clearHostResolverCache: mockClearHostResolverCache,
  clearData: mockClearData
}

const mockFromPartition = jest.fn()

jest.mock('backend/platform', () => ({
  session: {
    fromPartition: (...args: unknown[]) => mockFromPartition(...args)
  }
}))

jest.mock('../constants', () => ({
  legendaryUserInfo: '/tmp/gamelib-legendary-epic-census-test/user.json'
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Legendary: 'Legendary',
    Backend: 'Backend'
  }
}))

jest.mock('../../../utils', () => ({
  clearCache: jest.fn()
}))

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

const mockRunRunnerCommand = jest.fn()
jest.mock('../..', () => ({
  libraryManagerMap: {
    legendary: {
      runRunnerCommand: (...args: unknown[]) => mockRunRunnerCommand(...args)
    }
  }
}))

jest.mock('../../../humble/userAgent', () => ({
  standardBrowserUserAgent: () =>
    'Mozilla/5.0 (Test) Chrome/100.0 Safari/537.36'
}))

// `clearEpicCookies` takes a different route per platform (debug session
// `epic-cookie-clear-read-divergence`): macOS opens NO window and passes a
// deliberately unresolvable label, because that is the precondition the Rust
// arms' `WKWebsiteDataStore::defaultDataStore()` fallback requires; every other
// platform still needs a real window and gets one, pointed at a non-resolving
// RFC 2606 host rather than Epic.
//
// Mocked rather than read from the real `process.platform` so BOTH branches are
// exercised on every runner. A test that silently checks only the macOS branch
// on a developer's Mac and only the non-macOS branch in Linux CI would leave
// each branch unproven exactly where it matters.
//
// `Object.defineProperty` over a spread copy, NOT `{ ...actual, get isMac() }`.
// The object-literal form silently does not work here: TypeScript downlevels
// object spread through its `__assign` helper, which COPIES property VALUES —
// it reads the getter once, at factory time, and installs the result as a plain
// data property. `mockIsMac` then has no effect and every test quietly measures
// the REAL `process.platform` instead. That shape was written first and was
// caught only because the off-macOS test failed loudly on a Mac; the macOS test
// beside it passed the whole time, for the wrong reason.
let mockIsMac = true
jest.mock('backend/constants/environment', () => {
  const actual = jest.requireActual('backend/constants/environment')
  return Object.defineProperty({ ...actual }, 'isMac', {
    get: () => mockIsMac
  })
})

import { LegendaryUser } from '../user'
import { logError, logInfo, logWarning } from 'backend/logger'
import {
  setLoginWindowSeam,
  type LoginWindowSeam,
  type LoginWindowCookieRead
} from '../../../humble/loginWindowSeam'

/**
 * The domains this plan's fatality rule is exercised against, written out
 * HERE rather than imported from `user.ts` — importing the production
 * constant would make every "exactly 2 * length" assertion tautological
 * (`epicLogoutDomains.test.ts` follows the same discipline for the same
 * reason). This is the independent copy the code is checked AGAINST; the
 * COUNT is what acceptance criterion (a) requires, not the specific names.
 */
const EPIC_HOSTS_UNDER_TEST = [
  'epicgames.com',
  'fortnite.com',
  'unrealengine.com',
  'twinmotion.com',
  'metahuman.com'
]

const FORBIDDEN_LOG_SUBSTRINGS = [
  'EPIC_SESSION_AP',
  'EPIC_DEVICE',
  'EPIC_LOGIN_ID',
  '_epicSID',
  '_tald',
  '__cf_bm',
  'synthetic-not-a-real-token'
]

function cookieRead(
  total: number,
  matchedCount = total
): LoginWindowCookieRead {
  return {
    total,
    matched: Array.from({ length: matchedCount }, (_, i) => ({
      name: `sentinel-cookie-${i}`,
      domain: null,
      value: 'synthetic-not-a-real-token'
    }))
  }
}

function makeMockSeam(
  overrides: Partial<LoginWindowSeam> = {}
): LoginWindowSeam & {
  open: jest.Mock
  cookiesForDomain: jest.Mock
  clearCookies: jest.Mock
  close: jest.Mock
  clearStorage: jest.Mock
} {
  return {
    open: jest.fn().mockResolvedValue('window-label-1'),
    cookies: jest.fn(),
    cookiesForDomain: jest.fn().mockResolvedValue(cookieRead(0)),
    takeEvents: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
    clearCookies: jest.fn().mockResolvedValue(0),
    revealPost: jest.fn(),
    clearStorage: jest.fn().mockResolvedValue({
      localStorage: 0,
      sessionStorage: 0,
      indexedDB: 0,
      caches: 0,
      serviceWorkers: 0
    }),
    ...overrides
  } as unknown as LoginWindowSeam & {
    open: jest.Mock
    cookiesForDomain: jest.Mock
    clearCookies: jest.Mock
    close: jest.Mock
    clearStorage: jest.Mock
  }
}

/** Every string that reached any of the three log sinks, flattened. */
function allLoggedText(): string {
  const sinks = [logInfo, logWarning, logError] as unknown as jest.Mock[]
  return sinks
    .flatMap((sink) => sink.mock.calls)
    .map((call) => JSON.stringify(call))
    .join('\n')
}

beforeEach(() => {
  mockFromPartition.mockReturnValue(mockFromPartitionReturn)
  mockClearStorageData.mockResolvedValue(undefined)
  mockClearCache.mockResolvedValue(undefined)
  mockClearAuthCache.mockResolvedValue(undefined)
  mockClearHostResolverCache.mockResolvedValue(undefined)
  mockClearData.mockResolvedValue(undefined)
  mockRunRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })
  mockIsMac = true
  setLoginWindowSeam(null)
})

afterEach(() => {
  setLoginWindowSeam(null)
})

describe('Task 1: per-host cookie census (REQ-35-07, D-35-19-15)', () => {
  it('(a) calls cookiesForDomain exactly 3 * EPIC_COOKIE_HOSTS.length times (before + after + final verification), with an EMPTY name filter', async () => {
    // A healthy nonzero clear on every host — this test's subject is the
    // CALL COUNT/SHAPE of the census reads, not the fatality decision
    // (covered separately under Task 2), so the fixture stays clear of it.
    const seam = makeMockSeam({ clearCookies: jest.fn().mockResolvedValue(1) })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    // THREE per host, not two (debug session
    // `epic-cookie-clear-read-divergence`). The before/after pair is taken
    // mid-sweep, while later hosts are still uncleared and — before that
    // session's fix — while the step's own hidden window was still loading
    // Epic's live login page and re-seeding the jar behind it. Every one of
    // those reads can be truthfully zero while the jar still ends up holding
    // Epic cookies, which is exactly what was measured live: `matched=0` on
    // all five hosts, and six live Epic records in the jar three seconds
    // later. The third read is the sweep taken AFTER every mutation, and it
    // is the only one whose zero means "the jar is clean" rather than "the jar
    // was clean at one moment during a sequence that was still running".
    //
    // Derived from the array's OWN length, never hardcoded — a future
    // addition/removal of an Epic-owned host must not require touching this
    // assertion.
    expect(seam.cookiesForDomain).toHaveBeenCalledTimes(
      3 * EPIC_HOSTS_UNDER_TEST.length
    )
    // ONE label for the whole sweep, asserted as an invariant rather than as a
    // literal: the literal differs per platform now, but "a second label would
    // mean a second window" is the property this has always been protecting.
    const labels = new Set(seam.cookiesForDomain.mock.calls.map((c) => c[0]))
    expect(labels.size).toBe(1)
    for (const call of seam.cookiesForDomain.mock.calls) {
      expect(call[2]).toEqual([])
    }
    // Every approved host was queried (membership, not just count).
    const queriedHosts = seam.cookiesForDomain.mock.calls.map((c) => c[1])
    for (const host of EPIC_HOSTS_UNDER_TEST) {
      expect(queriedHosts).toContain(host)
    }
  })

  it('(b) a host with before.total > 0 and matched=0 carries SUPPORTED_NONEMPTY in the emitted log line', async () => {
    // epicgames.com: the jar-wide total is populated by an UNRELATED cookie
    // (some other runner's session in the same shared browser jar), but
    // NOTHING matches the epicgames.com domain filter specifically. This is
    // exactly what proves the log-facing verdict is computed from the
    // JAR-WIDE total (mirroring Humble), not the domain-matched count.
    // clearCookies resolves a healthy nonzero delta for every host so this
    // test's outcome is independent of the fatality decision (that decision
    // is Task 2's subject, tested separately below) — this test's only
    // subject is the LOG-facing verdict computed from the jar-wide total.
    const seam = makeMockSeam({
      cookiesForDomain: jest
        .fn()
        .mockResolvedValueOnce(cookieRead(3, 0)) // epicgames.com before: total=3, matched=0
        .mockResolvedValue(cookieRead(0, 0)),
      clearCookies: jest.fn().mockResolvedValue(1)
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    const logged = allLoggedText()
    expect(logged).toContain('total=3, matched=0, verdict=SUPPORTED_NONEMPTY')
  })

  it('(c) a rejecting census read does not throw out of the step and does not block clearCookies for that host or later hosts', async () => {
    const seam = makeMockSeam({
      cookiesForDomain: jest
        .fn()
        .mockRejectedValueOnce(new Error('rust-side census read failed')) // epicgames.com before
        .mockResolvedValue(cookieRead(0, 0)),
      clearCookies: jest.fn().mockResolvedValue(2)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    // clearCookies still ran for EVERY host, including the one whose census
    // read rejected, and every host after it.
    expect(seam.clearCookies).toHaveBeenCalledTimes(
      EPIC_HOSTS_UNDER_TEST.length
    )
    const clearedHosts = seam.clearCookies.mock.calls.map((c) => c[1])
    expect(clearedHosts).toEqual(EPIC_HOSTS_UNDER_TEST)
    // The rejection was logged as non-fatal evidence, not swallowed silently.
    expect(logWarning).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining(
          'cookie census read failed (non-fatal, evidence unavailable for this side)'
        )
      ]),
      'Legendary'
    )
  })

  it('(d) no cookie name or value ever reaches a log sink (sentinel-cookie check)', async () => {
    // The sweep's before/after reads return populated, matched cookies (that
    // is what makes the sentinel meaningful); the final verification sweep —
    // the last EPIC_HOSTS_UNDER_TEST.length calls — returns an empty jar, so
    // this test exercises the CLEAN path and stays about log hygiene rather
    // than about the fatality rule. Test (e) below owns the dirty path.
    let readCall = 0
    const seam = makeMockSeam({
      cookiesForDomain: jest
        .fn()
        .mockImplementation(async () =>
          ++readCall <= 2 * EPIC_HOSTS_UNDER_TEST.length
            ? cookieRead(4, 2)
            : cookieRead(0, 0)
        ),
      clearCookies: jest.fn().mockResolvedValue(2)
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    const logged = allLoggedText()
    expect(logged.length).toBeGreaterThan(0)
    for (const forbidden of FORBIDDEN_LOG_SUBSTRINGS) {
      expect(logged).not.toContain(forbidden)
    }
    // The synthetic cookie fixtures built by `cookieRead()` above are the
    // sentinel: if the census ever logged raw cookie objects instead of
    // integers, this name would leak.
    expect(logged).not.toContain('sentinel-cookie-')
  })

  /**
   * (e)–(h) are the regression guard for the debug session
   * `epic-cookie-clear-read-divergence`.
   *
   * What was measured live, twice (a dev jar and a packaged jar): the product
   * logged `after(total=54, matched=0)` on every one of the five Epic hosts and
   * summarised "Epic cookie clear removed 7 cookie(s)", and an index-walking
   * parse of the same jar three seconds later found six live Epic-owned
   * records. Nothing lied about the moment it measured. The step's own hidden
   * window — opened at Epic's LIVE login page purely to obtain a handle the
   * macOS code path then never used — was re-seeding the jar while the loop
   * ran and for a second after it finished, and the origin-scoped storage step
   * re-seeded it again afterwards with nothing left to sweep.
   *
   * These four tests pin the three properties that fix rests on: the residual
   * sweep exists and is fatal, a clean jar still resolves, and neither
   * platform's branch opens a window at Epic.
   */
  it('(e) a jar that still holds Epic cookies AFTER every clear is FATAL, even when every per-host delta was healthy and every mid-sweep read said matched=0', async () => {
    // The exact measured shape. Each host's mid-sweep `after` read is honestly
    // zero, and each host's clear reports a healthy nonzero delta — this is a
    // run that, before the fix, reported unqualified success. The jar is dirty
    // by the time everything has finished, and only the final sweep can see it.
    let readCall = 0
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockImplementation(async () => {
        readCall += 1
        const isMidSweep = readCall <= 2 * EPIC_HOSTS_UNDER_TEST.length
        // Mid-sweep: jar alive (total=9) but nothing matched for this host.
        // Final sweep: one Epic cookie per host has reappeared.
        return isMidSweep ? cookieRead(9, 0) : cookieRead(9, 1)
      }),
      clearCookies: jest.fn().mockResolvedValue(3)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      /post-clear verification found 5 Epic-owned cookie\(s\) still present/
    )
  })

  it('(f) the fatal residual is reported per host and names only domains and counts', async () => {
    let readCall = 0
    const seam = makeMockSeam({
      cookiesForDomain: jest
        .fn()
        .mockImplementation(async () =>
          ++readCall <= 2 * EPIC_HOSTS_UNDER_TEST.length
            ? cookieRead(9, 0)
            : cookieRead(9, 1)
        ),
      clearCookies: jest.fn().mockResolvedValue(3)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow()

    const logged = allLoggedText()
    expect(logged).toContain('post-clear verification')
    for (const host of EPIC_HOSTS_UNDER_TEST) {
      expect(logged).toContain(`${host}=1`)
    }
    // The new failure path is held to the same T-35-04 bar as every other line
    // this file emits — a residual report must not become the leak.
    for (const forbidden of FORBIDDEN_LOG_SUBSTRINGS) {
      expect(logged).not.toContain(forbidden)
    }
    expect(logged).not.toContain('sentinel-cookie-')
  })

  it('(g) on macOS the cookie step opens NO window and passes a label that cannot resolve to one', async () => {
    mockIsMac = true
    const seam = makeMockSeam({ clearCookies: jest.fn().mockResolvedValue(1) })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    // No window at all — not merely "not Epic's login page". The window was
    // never consulted by the macOS Rust arms (they gate their default-data-store
    // path on `existing_window.is_none()`), so opening one bought nothing and
    // cost a live page load against the service being logged out of.
    expect(seam.open).not.toHaveBeenCalled()
    expect(seam.close).not.toHaveBeenCalled()
    const labels = new Set(seam.clearCookies.mock.calls.map((c) => c[0]))
    expect(labels.size).toBe(1)
    expect([...labels][0]).toBe('epic-cookie-clear-no-window')
  })

  it('(h) off macOS the cookie step still opens exactly one window, and it is NOT pointed at Epic', async () => {
    mockIsMac = false
    const seam = makeMockSeam({ clearCookies: jest.fn().mockResolvedValue(1) })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    expect(seam.open).toHaveBeenCalledTimes(1)
    expect(seam.close).toHaveBeenCalledTimes(1)
    // The load-bearing assertion, and the one that would have caught the
    // original defect: whatever url this window gets, it must not reach Epic.
    const openedUrl = seam.open.mock.calls[0][0] as string
    expect(openedUrl).not.toContain('epicgames.com')
    expect(openedUrl.startsWith('https://')).toBe(true)
    expect(seam.open).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ visible: false })
    )
  })
})

describe('Task 2: jar-liveness fatality rule (CR-04 part 2, D-35-19-15)', () => {
  it('(1) a genuinely empty Epic jar (every host proven SUPPORTED_BUT_EMPTY) is NOT fatal', async () => {
    // `everProvedLive` becomes true from the FIRST read (any host, any side)
    // that reports a nonzero jar-wide total — here, an unrelated cookie
    // (e.g. a GOG/Humble session in the same shared jar) proves the channel
    // is alive, while every Epic-owned host's domain-scoped `matched` count
    // stays genuinely zero throughout — a legendary CLI-only auth, or a
    // profile migrated from another launcher, with no Epic cookies of its
    // own.
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue(cookieRead(1, 0)),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    expect(logError).not.toHaveBeenCalled()
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('Epic cookie jar was already empty'),
      'Legendary'
    )
  })

  it('(2) a host proven SUPPORTED_NONEMPTY with a zero delta is FATAL, naming the broken host, regardless of the overall summed total', async () => {
    // epicgames.com clears healthily (delta=5, masking the sum), but
    // fortnite.com's BEFORE census proves 2 cookies were present and its
    // measured post-removal delta is 0 — the clear is broken for that host
    // specifically. This is the exact shape D-35-19-15 measured live: a
    // healthy primary domain hiding a broken secondary domain inside a
    // nonzero sum.
    const cookiesForDomain = jest
      .fn()
      .mockResolvedValueOnce(cookieRead(5, 5)) // epicgames.com before
      .mockResolvedValueOnce(cookieRead(0, 0)) // epicgames.com after
      .mockResolvedValueOnce(cookieRead(2, 2)) // fortnite.com before
      .mockResolvedValueOnce(cookieRead(2, 2)) // fortnite.com after (unchanged — broken)
      .mockResolvedValue(cookieRead(0, 0)) // remaining hosts
    const clearCookies = jest
      .fn()
      .mockResolvedValueOnce(5) // epicgames.com: healthy
      .mockResolvedValueOnce(0) // fortnite.com: broken
      .mockResolvedValue(0)
    const seam = makeMockSeam({ cookiesForDomain, clearCookies })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing for fortnite\.com despite the jar proving cookies were present beforehand/
    )

    // The credential-side security boundary still ran (T-34.5-19).
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')

    // RED-PROOF (recorded verbatim in 35-23-SUMMARY.md): a naive
    // `total === 0`-only implementation computes the SUMMED total as
    // 5 + 0 + 0 + 0 + 0 = 5, which is NOT zero — the naive version would
    // therefore RESOLVE this exact scenario instead of rejecting it,
    // silently missing the broken fortnite.com clear. Mutating this test's
    // production code back to `if (total === 0) throw ...` (deleting the
    // `brokenHosts` branch) is the single mutation that flips this test from
    // red to green-on-the-wrong-thing — i.e. makes it pass by NOT rejecting.
  })

  it('(3c) census UNSUPPORTED_OR_ERROR on every side falls back to legacy fail-closed behavior (a rejecting/erroring read)', async () => {
    // cookiesForDomain unmocked-shaped: every read rejects, so every side's
    // domain verdict is UNSUPPORTED_OR_ERROR, never SUPPORTED_BUT_EMPTY —
    // the fallback must fail CLOSED, exactly as before this plan.
    const seam = makeMockSeam({
      cookiesForDomain: jest
        .fn()
        .mockRejectedValue(new Error('rust-side census read failed')),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing across all 5 Epic-owned domains/
    )
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
  })

  it('(3d) census UNDECIDABLE on every side (resolves, but never proves liveness) ALSO falls back to legacy fail-closed behavior', async () => {
    // Every read RESOLVES (does not reject) but always reports a jar-wide
    // total of 0 — `everProvedLive` never becomes true, so every side's
    // domain verdict is UNDECIDABLE, distinct from (3c)'s
    // UNSUPPORTED_OR_ERROR. Named as a SEPARATE test so a future collapse of
    // the two fail-closed paths (e.g. one bucket accidentally treated as
    // "proven empty") is caught by name, not silently merged.
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue(cookieRead(0, 0)),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing across all 5 Epic-owned domains/
    )
    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
  })

  it('EPIC_COOKIE_HOSTS stays byte-identical to before this plan (T-35-41 paired-list invariant untouched)', () => {
    // This plan's `files_modified` list is `user.ts` (the clearEpicCookies
    // step body) and this test file only — `EPIC_COOKIE_HOSTS` itself must
    // never move. `epicLogoutDomains.test.ts` already asserts the full
    // main.rs/user.ts parity in detail; this is a narrower reminder living
    // next to the code this plan actually touched.
    expect(EPIC_HOSTS_UNDER_TEST).toEqual([
      'epicgames.com',
      'fortnite.com',
      'unrealengine.com',
      'twinmotion.com',
      'metahuman.com'
    ])
  })
})

/**
 * Quick 260831-q93 (D-35-29-01) — EVIDENCE PRODUCTION, not absence-of-throw.
 *
 * Every test above this block passed, unchanged, throughout the entire period the
 * Rust census probe produced NOTHING. It could, because none of them asserts the
 * one property the defect violated: that a live logout emits a verdict OTHER than
 * `UNSUPPORTED_OR_ERROR`. Live, all five hosts logged
 * `before(total=unavailable, matched=unavailable, verdict=UNSUPPORTED_OR_ERROR)`
 * on every logout, which made BOTH consuming branches structurally unreachable —
 * `brokenHosts` needs a `SUPPORTED_NONEMPTY` domain verdict, the non-fatal
 * already-empty branch needs `SUPPORTED_BUT_EMPTY`, and a rejecting read can
 * produce neither. The broken-per-host detector was dead code on the only path it
 * serves, and test (3c) above — "every read rejects, fail closed" — was not a
 * hypothetical edge case but a verbatim description of production.
 *
 * WHAT THESE TESTS DO NOT PROVE, stated plainly because getting this wrong is how
 * the defect survived a whole phase: they run against a SEAM DOUBLE. They prove
 * branch REACHABILITY given reads that resolve — nothing more. They are NOT
 * evidence that the Rust probe reads a real cookie out of a real jar. Only a live
 * Epic logout emitting numeric `total=`/`matched=` for all five hosts is evidence
 * of that (this quick task's Task 3), and no green run of this file may be
 * substituted for it.
 */
describe('D-35-29-01 (quick q93) the census produces EVIDENCE, and both consuming branches are reachable', () => {
  it('(e1) a populated primary host reaches the SUPPORTED_NONEMPTY consumer (brokenHosts) — unreachable while every read rejected', async () => {
    // The post-fix live shape: epicgames.com populated, the other four Epic-owned
    // hosts domain-empty inside the same (jar-wide nonzero) shared jar, so
    // `everProvedLive` is true from the very first read.
    const cookiesForDomain = jest
      .fn()
      .mockResolvedValueOnce(cookieRead(10, 6)) // epicgames.com before: jar=10, epic-matched=6
      .mockResolvedValueOnce(cookieRead(10, 6)) // epicgames.com after: UNCHANGED — the clear did nothing
      .mockResolvedValue(cookieRead(10, 0)) // every other host: jar alive, nothing of theirs
    const seam = makeMockSeam({
      cookiesForDomain,
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing for epicgames\.com despite the jar proving cookies were present beforehand/
    )

    const logged = allLoggedText()
    // THE property this defect violated on every single live run. Asserted as an
    // ABSENCE because that is the shape of the failure: the probe did not return a
    // wrong number, it returned no number at all.
    expect(logged).not.toContain('UNSUPPORTED_OR_ERROR')
    expect(logged).not.toContain('total=unavailable')
    expect(logged).not.toContain('matched=unavailable')
    // And the positive half: a real reading reached the log.
    expect(logged).toContain('total=10, matched=6, verdict=SUPPORTED_NONEMPTY')

    // DISCRIMINATING against the pre-fix behaviour, which is why this test is not
    // a restatement of Task 2's (2): drive the SAME fixture with the reads the
    // Rust arm actually produced pre-fix (all rejecting) and the domain verdict
    // can never be SUPPORTED_NONEMPTY, so this exact rejection message is
    // unreachable — logout takes the (3c) fail-closed path with a DIFFERENT
    // message instead. That divergence is the whole defect.
  })

  it('(e2) the pre-fix read shape CANNOT produce (e1) outcome — same fixture, rejecting reads, different failure', async () => {
    // Byte-for-byte (e1)'s clear-side fixture (delta 0 on every host); only the
    // census reads differ, reproducing exactly what the Rust arm returned before
    // this fix: `humble_login_cookies_for_domain:no-window:{label}` on all five.
    const seam = makeMockSeam({
      cookiesForDomain: jest
        .fn()
        .mockRejectedValue(
          new Error(
            'humble_login_cookies_for_domain:no-window:loginwin-0-18d0cf3d9b97abd0-7652f0f6'
          )
        ),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    // NOT the broken-host message — the generic fail-closed one. The detector
    // never ran.
    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing across all 5 Epic-owned domains/
    )
    const logged = allLoggedText()
    expect(logged).toContain('verdict=UNSUPPORTED_OR_ERROR')
    expect(logged).toContain('total=unavailable, matched=unavailable')
    expect(logged).not.toContain('SUPPORTED_NONEMPTY')
  })

  it('(e3) a genuinely Epic-empty jar reaches the SUPPORTED_BUT_EMPTY non-fatal branch, with no UNSUPPORTED_OR_ERROR anywhere', async () => {
    // Jar-wide alive (7 cookies belonging to other runners), zero matching any
    // Epic-owned host, zero removed. Strengthens Task 2's (1) with the absence
    // assertion that (1) does not make — (1) would pass on a jar full of
    // `unavailable` reads if the classifier ever regressed to treating an
    // unreadable jar as an empty one, which is the exact substitution CR-04
    // part 2 exists to prevent.
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue(cookieRead(7, 0)),
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()

    const logged = allLoggedText()
    expect(logged).not.toContain('UNSUPPORTED_OR_ERROR')
    expect(logged).not.toContain('total=unavailable')
    expect(logged).toContain('total=7, matched=0, verdict=SUPPORTED_NONEMPTY')
    expect(logInfo).toHaveBeenCalledWith(
      expect.stringContaining('Epic cookie jar was already empty'),
      'Legendary'
    )
    expect(logError).not.toHaveBeenCalled()
  })
})
