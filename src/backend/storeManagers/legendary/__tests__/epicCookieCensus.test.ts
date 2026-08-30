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
 *     apex, spike 016) is called exactly twice per host — once before the
 *     clear, once after — with an EMPTY name filter, mirroring
 *     `humble/user.ts`'s census exactly.
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

function cookieRead(total: number, matchedCount = total): LoginWindowCookieRead {
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
  setLoginWindowSeam(null)
})

afterEach(() => {
  setLoginWindowSeam(null)
})

describe('Task 1: per-host cookie census (REQ-35-07, D-35-19-15)', () => {
  it('(a) calls cookiesForDomain exactly 2 * EPIC_COOKIE_HOSTS.length times, with an EMPTY name filter', async () => {
    // A healthy nonzero clear on every host — this test's subject is the
    // CALL COUNT/SHAPE of the census reads, not the fatality decision
    // (covered separately under Task 2), so the fixture stays clear of it.
    const seam = makeMockSeam({ clearCookies: jest.fn().mockResolvedValue(1) })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    // Derived from the array's OWN length, never hardcoded — a future
    // addition/removal of an Epic-owned host must not require touching this
    // assertion.
    expect(seam.cookiesForDomain).toHaveBeenCalledTimes(
      2 * EPIC_HOSTS_UNDER_TEST.length
    )
    for (const call of seam.cookiesForDomain.mock.calls) {
      expect(call[0]).toBe('window-label-1')
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
    const seam = makeMockSeam({
      cookiesForDomain: jest.fn().mockResolvedValue(cookieRead(4, 2)),
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
})
