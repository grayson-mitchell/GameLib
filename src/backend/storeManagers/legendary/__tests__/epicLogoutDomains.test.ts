/**
 * Epic logout — multi-domain cookie clear (Phase 35 plan 09, REQ-35-07,
 * D-09-CORRECTED, threats T-35-37/-38/-39/-40/-41).
 *
 * What this file exists to prove, and why each half is load-bearing:
 *
 *  1. EVERY Epic-owned apex is attempted, not just `epicgames.com`. The defect
 *     this plan closes is an INCOMPLETE clear: `35-AB-RETEST.md` Item 7 measured
 *     `EPIC_DEVICE` surviving a logout on `.fortnite.com`, `.twinmotion.com`,
 *     `.unrealengine.com` and `.metahuman.com`, which an `epicgames.com` suffix
 *     filter cannot match BY CONSTRUCTION.
 *  2. The per-domain deltas are SUMMED, and a zero TOTAL fails the logout. The
 *     asymmetry is deliberate and is asserted in both directions: an individual
 *     domain returning 0 is legitimate (a user may never have visited
 *     twinmotion.com), so only a zero total may reject.
 *  3. ONE hidden window for the whole sweep — opened once, closed once — never
 *     one window per domain.
 *  4. Counts and domain names only ever reach a log sink. This repo is PUBLIC
 *     (T-35-04), so a cookie name, value, token or account identifier in a log
 *     line is a disclosure, not a debugging convenience.
 *  5. The TS list and `main.rs`'s `EPIC_COOKIE_DOMAINS` are the SAME list. A
 *     domain present on one side only is a silent half-fix (T-35-41): the Rust
 *     macOS fallback guard only admits members of ITS set, so a TS-only addition
 *     returns `humble_login:no-window:{label}` — an error, not a clear.
 *
 * Every assertion here was RED-proven against a deliberately broken
 * implementation before being accepted; the mutations and the failures they
 * produced are recorded in `35-09-SUMMARY.md`. A green-on-first-write source
 * gate is worth nothing (35-08's start/stop pairing test passed against a
 * broken `stop`).
 *
 * Mock boundaries mirror `user.test.ts`'s exactly — see that file's header for
 * why each one is needed. `../../../humble/loginWindowSeam` is deliberately NOT
 * mocked: it is a plain module-scoped holder, driven here the same way
 * production drives it.
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

jest.mock('electron', () => ({
  session: {
    fromPartition: (...args: unknown[]) => mockFromPartition(...args)
  }
}))

jest.mock('../constants', () => ({
  legendaryUserInfo: '/tmp/gamelib-legendary-epic-domains-test/user.json'
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

import { readFileSync } from 'fs'
import { join } from 'path'
import { LegendaryUser } from '../user'
import { logError, logInfo, logWarning } from 'backend/logger'
import {
  setLoginWindowSeam,
  type LoginWindowSeam
} from '../../../humble/loginWindowSeam'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '../../../../..')
const MAIN_RS = join(REPO_ROOT, 'src-tauri/src/main.rs')
const LEGENDARY_USER_TS = join(__dirname, '../user.ts')

/**
 * The domains this plan's operator decision (D-09-CORRECTED) approved, written
 * out HERE rather than imported from `user.ts`. Importing the production
 * constant would make every assertion below tautological — the gate would agree
 * with whatever the code happened to say. This is the independent copy the code
 * is checked AGAINST.
 */
const EXPECTED_EPIC_DOMAINS = [
  'epicgames.com',
  'fortnite.com',
  'unrealengine.com',
  'twinmotion.com',
  'metahuman.com'
]

/**
 * Cookie names measured live on Epic domains (`35-AB-RETEST.md` Item 7) plus a
 * synthetic secret. NONE of these may appear in any log line. Real values are
 * never used — the synthetic token below is what a leak would look like, and
 * this file must not itself become the disclosure it is guarding against
 * (T-35-04: this repo is public, and that includes test fixtures).
 */
const FORBIDDEN_LOG_SUBSTRINGS = [
  'EPIC_SESSION_AP',
  'EPIC_DEVICE',
  'EPIC_LOGIN_ID',
  '_epicSID',
  '_tald',
  '__cf_bm',
  'synthetic-not-a-real-token'
]

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
    cookiesForDomain: jest.fn(),
    takeEvents: jest.fn(),
    close: jest.fn().mockResolvedValue(true),
    clearCookies: jest.fn().mockResolvedValue(3),
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

/** The domains passed to `seam.clearCookies`, in call order. */
function clearedDomains(seam: { clearCookies: jest.Mock }): string[] {
  return seam.clearCookies.mock.calls.map((call) => String(call[1]))
}

beforeEach(() => {
  mockFromPartition.mockReturnValue(mockFromPartitionReturn)
  mockClearStorageData.mockResolvedValue(undefined)
  mockClearCache.mockResolvedValue(undefined)
  mockClearAuthCache.mockResolvedValue(undefined)
  mockClearHostResolverCache.mockResolvedValue(undefined)
  mockClearData.mockResolvedValue(undefined)
  // A clean CLI logout: no early return, so the wipe steps actually run.
  mockRunRunnerCommand.mockResolvedValue({ stdout: '', stderr: '' })
  setLoginWindowSeam(null)
})

afterEach(() => {
  setLoginWindowSeam(null)
})

describe('Epic logout clears every Epic-owned domain (T-35-37)', () => {
  it('attempts EVERY approved Epic-owned apex, exactly once each, against the SAME window label', async () => {
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    // Order is asserted, not just membership: `epicgames.com` staying first
    // keeps the pre-existing single-domain assertions in `user.test.ts`
    // meaningful, and a reordering is a review-worthy change either way.
    expect(clearedDomains(seam)).toEqual(EXPECTED_EPIC_DOMAINS)
    // Every call used the one label `seam.open` returned — a per-domain window
    // would show up here as a second label.
    for (const call of seam.clearCookies.mock.calls) {
      expect(call[0]).toBe('window-label-1')
    }
  })

  it('opens ONE hidden window for the whole sweep and closes it exactly once', async () => {
    const seam = makeMockSeam()
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    expect(seam.open).toHaveBeenCalledTimes(1)
    expect(seam.open).toHaveBeenCalledWith(
      expect.stringContaining('epicgames.com'),
      expect.objectContaining({ visible: false })
    )
    expect(seam.close).toHaveBeenCalledTimes(1)
    expect(seam.close).toHaveBeenCalledWith('window-label-1')
  })

  it('closes the single window exactly once even when a MIDDLE domain rejects', async () => {
    // The `finally` must fire on the throwing path too, or a failed sweep leaks
    // a hidden window. Rejecting the third domain also proves the loop is not
    // silently swallowing per-domain rejections.
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('rust-side clear failed'))
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      'rust-side clear failed'
    )

    expect(seam.open).toHaveBeenCalledTimes(1)
    expect(seam.close).toHaveBeenCalledTimes(1)
  })
})

describe('the per-domain deltas are summed, and only a ZERO TOTAL fails (T-35-39)', () => {
  it('logs a per-domain breakdown AND a total equal to the sum of the deltas', async () => {
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockResolvedValueOnce(6)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    const logged = allLoggedText()
    // The breakdown: every domain named with its own count, including the
    // zero. A bare total is what let the previous incompleteness hide.
    for (const [i, domain] of EXPECTED_EPIC_DOMAINS.entries()) {
      expect(logged).toContain(`${domain}=${[6, 1, 0, 1, 2][i]}`)
    }
    // 6 + 1 + 0 + 1 + 2 = 10, and the total is a SUM, not a last-value or a
    // count-of-domains.
    expect(logged).toContain('removed 10 cookie(s)')
  })

  it('a single domain returning 0 among non-zero others does NOT fail the logout', async () => {
    // The deliberate asymmetry: a user may simply never have visited
    // twinmotion.com. Treating that as a logout failure would make the gate
    // fire on correct behaviour.
    const seam = makeMockSeam({
      clearCookies: jest
        .fn()
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).resolves.toBeUndefined()
    expect(logError).not.toHaveBeenCalled()
  })

  it('a ZERO TOTAL across every domain REJECTS the logout', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow(
      /removed nothing across all 5 Epic-owned domains/
    )
  })

  it('a zero total still runs the credential-side cleanup BEFORE it rejects (T-34.5-19)', async () => {
    // The security boundary must never be skipped by the new failure path — a
    // sign-out that revoked the CLI session but left `userInfo` behind is
    // worse than one that left a stray cookie behind.
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow()

    expect(mockConfigStore.delete).toHaveBeenCalledWith('userInfo')
  })

  it('a zero total does not stop the LATER wipe steps from running', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow()

    expect(seam.clearStorage).toHaveBeenCalledTimes(1)
  })
})

describe('logs carry counts and domains only — never a cookie name or value (T-35-40)', () => {
  it('no Epic cookie name or secret-shaped string reaches any log sink', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(3)
    })
    setLoginWindowSeam(seam)

    await LegendaryUser.logout()

    const logged = allLoggedText()
    // Non-vacuity FIRST: the corpus must be non-empty and must actually carry
    // the counts and domains, or "contains no cookie name" is trivially true.
    expect(logged.length).toBeGreaterThan(0)
    expect(logged).toContain('epicgames.com')
    expect(logged).toContain('metahuman.com')
    expect(logged).toContain('removed 15 cookie(s)')

    for (const forbidden of FORBIDDEN_LOG_SUBSTRINGS) {
      expect(logged).not.toContain(forbidden)
    }
  })

  it('the failure path logs no cookie name or value either', async () => {
    const seam = makeMockSeam({
      clearCookies: jest.fn().mockResolvedValue(0)
    })
    setLoginWindowSeam(seam)

    await expect(LegendaryUser.logout()).rejects.toThrow()

    const logged = allLoggedText()
    expect(logged.length).toBeGreaterThan(0)
    expect(logged).toContain('epicgames.com')
    for (const forbidden of FORBIDDEN_LOG_SUBSTRINGS) {
      expect(logged).not.toContain(forbidden)
    }
  })
})

describe('the TS list and main.rs EPIC_COOKIE_DOMAINS are the SAME list (T-35-41)', () => {
  /**
   * Pulls the quoted entries out of a `const NAME ... [ ... ]` array literal in
   * the given (comment-stripped) source. Deliberately shared by both sides so
   * the two extractions cannot disagree about what "the list" means.
   */
  function extractQuotedList(source: string, marker: string): string[] {
    const start = source.indexOf(marker)
    if (start === -1) {
      throw new Error(
        `epicLogoutDomains: could not find '${marker}' — has the constant been ` +
          `renamed? Re-derive this gate by hand; do not soften it.`
      )
    }
    // Anchor on the ASSIGNMENT, not the first `[` after the name: Rust's
    // declaration is `const EPIC_COOKIE_DOMAINS: &[&str] = &[`, whose first
    // `[` belongs to the TYPE (`&[&str]`), not the value. Anchoring on the
    // name alone silently extracted `&str` and compared an EMPTY list — which
    // is how this gate first failed, and why it is written this way now.
    const assign = source.indexOf('=', start)
    if (assign === -1) {
      throw new Error(
        `epicLogoutDomains: found '${marker}' but no '=' after it — re-derive ` +
          `this gate by hand; do not soften it.`
      )
    }
    const open = source.indexOf('[', assign)
    const close = source.indexOf(']', open)
    const body = source.slice(open + 1, close)
    return [...body.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
  }

  it('main.rs EPIC_COOKIE_DOMAINS is exactly the approved set', () => {
    const raw = readFileSync(MAIN_RS, 'utf-8')
    // Stripper-integrity guard: `stripSourceComments` drops every line starting
    // with `*`, so a source gate over Rust can go silently vacuous. Prove the
    // entries survive the strip by counting them in the RAW file first — a drop
    // to zero here is the stripper, not an absent feature.
    const rawHits = (raw.match(/^\s+"epicgames\.com",$/gm) ?? []).length
    expect(rawHits).toBeGreaterThan(0)

    const stripped = stripSourceComments(raw)
    const rustDomains = extractQuotedList(stripped, 'const EPIC_COOKIE_DOMAINS')
    expect(rustDomains).toEqual(EXPECTED_EPIC_DOMAINS)
  })

  it('legendary/user.ts EPIC_COOKIE_HOSTS is exactly the approved set', () => {
    const stripped = stripSourceComments(
      readFileSync(LEGENDARY_USER_TS, 'utf-8')
    )
    const tsHosts = extractQuotedList(stripped, 'const EPIC_COOKIE_HOSTS')
    expect(tsHosts).toEqual(EXPECTED_EPIC_DOMAINS)
  })

  it('anti-vacuity: extractQuotedList genuinely reports a DIFFERENT list when one is present', () => {
    // Without this, a bug that made `extractQuotedList` always return
    // `EXPECTED_EPIC_DOMAINS` (or always the same thing) would make both
    // assertions above pass regardless of what the real files say.
    const synthetic = 'const EPIC_COOKIE_HOSTS = [\n  "a.com",\n  "b.com"\n]'
    expect(extractQuotedList(synthetic, 'const EPIC_COOKIE_HOSTS')).toEqual([
      'a.com',
      'b.com'
    ])
    expect(extractQuotedList(synthetic, 'const EPIC_COOKIE_HOSTS')).not.toEqual(
      EXPECTED_EPIC_DOMAINS
    )
  })

  it('anti-vacuity: a missing constant THROWS rather than silently comparing an empty list', () => {
    expect(() =>
      extractQuotedList('const SOMETHING_ELSE = []', 'const EPIC_COOKIE_HOSTS')
    ).toThrow(/could not find/)
  })
})
