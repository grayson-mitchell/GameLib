/**
 * Phase 54 source gate (ROADMAP SC3 / SC6): the Steam authenticated-session
 * policy, enforced structurally.
 *
 * What it proves: no steam-user logon (authenticated or anonymous) or construction exists any
 * more (79-39), the lease entry points are called only from an allow-list, the launch path calls
 * none of them, `.relog(` is gone, and `allowLogon: true` has exactly one owner.
 *
 * What it does NOT prove: runtime behaviour (authSessionLifecycle.test.ts,
 * steamStartupKeyringDeferral.test.ts covers
 * that), nor that the Friends list stays signed in -- only the Mac UAT can.
 *
 * Every match runs on COMMENT-STRIPPED source. Known limitation: a trailing
 * `//` comment on a code line is not stripped (see stripSourceComments).
 *
 * Scans `src/` only, excluding `__tests__` directories and `*.test.*` files
 * (tests legitimately mock `logOn`/`relog`). Modelled on
 * fakeHomeIsolation.test.ts.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { stripSourceComments } from '../testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const SCAN_ROOTS = ['src']
const PRUNED_DIRS = new Set([
  'node_modules',
  'build',
  'dist',
  '.git',
  'coverage',
  '__tests__'
])
const SCANNED_EXT = /\.(ts|tsx|cjs|js)$/
const TEST_FILE = /\.test\.(ts|tsx|js)$/

/**
 * Anti-vacuity floor. Measured 2026-10-27: 839 files under `src/` with the
 * prunes above. Set near half so a rename, bad prune or broken walk turns the
 * gate RED instead of passing by scanning nothing.
 */
const MIN_FILES_SCANNED = 420

const S = 'src/backend/storeManagers/steam/'
const USER = `${S}user.ts`
// 65-12: the sign-in flows were lifted out of user.ts into free functions; they
// are the only other caller of acquireAuthenticatedWithToken (D-15).
const USER_SIGN_IN = `${S}userSignIn.ts`
const USER_SIGN_IN_STATE = `${S}userSignInState.ts`
// 65-12: redeemKey was lifted out of user.ts; it leases through acquireAuthenticated.
const USER_REDEEM = `${S}userRedeem.ts`
const ACQUIRE_WITH_TOKEN_ALLOW = [USER, USER_SIGN_IN]
const ANON = `${S}anonymousClient.ts`
const GAMES = `${S}games.ts`
// 62-06: the install cluster (acquireAuthenticated, allowLogon: true) was lifted out of games.ts.
const INSTALL = `${S}gameInstall.ts`
// 65-11: gameInstall was split; the depot engine holds an acquireAuthenticated( call.
const INSTALL_DEPOT = `${S}gameInstallDepot.ts`
const INSTALL_BRIDGE = `${S}gameInstallBridge.ts`

// Every game*.ts module (the 62 split lifted games.ts into these), discovered
// from the directory so a module dropping out of the walk fails must-scan.
const GAME_MODULES = readdirSync(join(REPO_ROOT, S))
  .filter((f) => /^game.*\.ts$/.test(f))
  .map((f) => `${S}${f}`)

const ACQUIRE_AUTH_ALLOW = [
  USER,
  USER_REDEEM,
  `${S}library/refresh.ts`,
  // depot/plan.ts keeps only withPlanBuildRetry's reconnect lease. depot/outcome.ts left this
  // list in 73-19: it delegates to depotRust/ and holds no lease of its own.
  `${S}depot/plan.ts`,
  `${S}depot/sharedRedist.ts`,
  // Phase 73 plans 13/14: the Rust-pipeline entry points take the same authenticated lease
  // depot/plan.ts does, for the CM half (appinfo, keys, request codes) before handing CDN work
  // to Rust.
  `${S}depotRust/install.ts`,
  `${S}depotRust/secondary.ts`,
  // Phase 74 plan 10 (D-09/D-14): the bridge update size estimate takes the same depot lease for
  // its CM half (appinfo, request codes) before a manifest-to-manifest summary in Rust. It runs
  // only from an explicit "Show update size" click or from updateBridgeGame itself, never on
  // refresh or page open (updateInfo.ts gates it on computeSize).
  `${S}depotRust/updateEstimate.ts`,
  // quick 261120-p2j: the bridge Verify job takes the same depot lease for its CM half (appinfo,
  // keys for installed depots, request codes) before the chunk-level repair in Rust. It runs only
  // from an explicit Verify click (verifyBridge.ts), never on refresh or page open.
  `${S}depotRust/verify.ts`,
  INSTALL,
  INSTALL_DEPOT,
  INSTALL_BRIDGE
]
const ACQUIRE_OPEN_ALLOW = [
  USER,
  `${S}library/refresh.ts`,
  `${S}depot/sharedRedist.ts`,
  `${S}installLocation.ts`,
  `${S}bridge/launchTarget.ts`
]
// Phase 79 (79-38): rustSession.ts is the Rust-session half of user.ts. SteamUser delegates its
// session ownership to it, and it DEFINES `ensureConnected()` (it is the method's implementation,
// not a second caller). It acquires nothing on its own initiative.
const ENSURE_CONNECTED_ALLOW = [USER, `${S}rustSession.ts`]
const LAUNCH_PATH = [
  `${S}installLocation.ts`,
  `${S}bridge/launchTarget.ts`,
  `${S}platformCapture.ts`,
  ANON,
  `${S}authTrigger.ts`
]

function toRepoRel(abs: string): string {
  return relative(REPO_ROOT, abs).split(sep).join('/')
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (PRUNED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (SCANNED_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) {
      out.push(full)
    }
  }
}

const found: string[] = []
for (const root of SCAN_ROOTS) walk(join(REPO_ROOT, root), found)
const scannedRelPaths = found.map(toRepoRel)

const stripped = new Map<string, string>()
for (const abs of found) {
  stripped.set(toRepoRel(abs), stripSourceComments(readFileSync(abs, 'utf8')))
}

function countIn(rel: string, re: RegExp): number {
  const src = stripped.get(rel) ?? ''
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g'
  return (src.match(new RegExp(re.source, flags)) ?? []).length
}

/** Files (other than none) where `re` matches, with counts. */
function filesMatching(re: RegExp): Map<string, number> {
  const out = new Map<string, number>()
  for (const rel of scannedRelPaths) {
    const n = countIn(rel, re)
    if (n > 0) out.set(rel, n)
  }
  return out
}

function offendersOutside(
  re: RegExp,
  allow: readonly string[],
  rule: string
): string[] {
  return [...filesMatching(re).keys()]
    .filter((f) => !allow.includes(f))
    .map((f) => `${f} (${rule})`)
}

describe('Steam authenticated-session policy (Phase 54 ROADMAP SC3)', () => {
  it('floor: scans at least MIN_FILES_SCANNED files', () => {
    expect(scannedRelPaths.length).toBeGreaterThanOrEqual(MIN_FILES_SCANNED)
  })

  it('floor: every game*.ts module is discovered (anti-vacuity)', () => {
    expect(GAME_MODULES).toContain(GAMES)
    expect(GAME_MODULES.length).toBeGreaterThanOrEqual(13)
  })

  it('must-scan: every allow-listed and launch-path file is in the scanned set', () => {
    const must = new Set([
      USER,
      USER_SIGN_IN,
      USER_SIGN_IN_STATE,
      ANON,
      GAMES,
      ...GAME_MODULES,
      ...ACQUIRE_AUTH_ALLOW,
      ...ACQUIRE_OPEN_ALLOW,
      ...ENSURE_CONNECTED_ALLOW,
      ...LAUNCH_PATH
    ])
    const missing = [...must].filter((f) => !scannedRelPaths.includes(f))
    expect(missing).toEqual([])
  })

  it('Rule A: no authenticated steam-user logOn({ refreshToken }) exists (the Rust CM session is the only path, 79-39)', () => {
    const re = /logOn\(\s*\{[^}]*refreshToken/
    expect([...filesMatching(re).keys()]).toEqual([])
  })

  it('Rule B: no anonymous steam-user logOn exists (the Rust anon actor is the only path, 79-39)', () => {
    const re = /logOn\(\s*\{\s*anonymous\s*:\s*true/
    expect([...filesMatching(re).keys()]).toEqual([])
  })

  it('Rule C: .relog( appears nowhere', () => {
    expect([...filesMatching(/\.relog\(/).keys()]).toEqual([])
  })

  it('Rule D: ensureConnected( is called only from user.ts (and defined in rustSession.ts)', () => {
    const re = /\bensureConnected\(/
    expect(countIn(USER, re)).toBeGreaterThanOrEqual(1)
    expect(offendersOutside(re, ENSURE_CONNECTED_ALLOW, 'D')).toEqual([])
  })

  it('Rule E: acquireAuthenticated( appears only in its allow-list', () => {
    const re = /\bacquireAuthenticated\(/
    for (const f of ACQUIRE_AUTH_ALLOW) {
      expect({ f, n: countIn(f, re) > 0 }).toEqual({ f, n: true })
    }
    expect(offendersOutside(re, ACQUIRE_AUTH_ALLOW, 'E')).toEqual([])
  })

  it('Rule F: acquireOpenAuthenticated( appears only in its allow-list', () => {
    const re = /\bacquireOpenAuthenticated\(/
    for (const f of ACQUIRE_OPEN_ALLOW) {
      expect({ f, n: countIn(f, re) > 0 }).toEqual({ f, n: true })
    }
    expect(offendersOutside(re, ACQUIRE_OPEN_ALLOW, 'F')).toEqual([])
  })

  it('Rule L: acquireAuthenticatedWithToken( appears only in user.ts and userSignIn.ts', () => {
    const re = /\bacquireAuthenticatedWithToken\(/
    for (const f of ACQUIRE_WITH_TOKEN_ALLOW) {
      expect({ f, n: countIn(f, re) > 0 }).toEqual({ f, n: true })
    }
    expect(offendersOutside(re, ACQUIRE_WITH_TOKEN_ALLOW, 'L')).toEqual([])
  })

  it('Rule G: launch-path files call neither acquireAuthenticated( nor ensureConnected(', () => {
    const re = /\b(?:acquireAuthenticated|ensureConnected)\(/
    const offenders = LAUNCH_PATH.filter((f) => countIn(f, re) > 0).map(
      (f) => `${f} (G)`
    )
    expect(offenders).toEqual([])
  })

  it('Rule H: no steam-user library client is constructed anywhere (79-39)', () => {
    // The SteamUser class (createSteamUser's `new SteamUser(deps)`) is not a CM client; only the
    // steam-user LIBRARY constructor is matched.
    expect([...filesMatching(/new\s+SteamUserLib\s*\(/).keys()]).toEqual([])
  })

  it('Rule I: allowLogon: true occurs exactly once, in gameInstallBridge.ts', () => {
    const hits = filesMatching(/allowLogon\s*:\s*true/)
    expect([...hits.entries()]).toEqual([[INSTALL_BRIDGE, 1]])
  })

  it('Rule J: getExtraInfo in games.ts calls nothing on SteamUser', () => {
    const src = stripped.get(GAMES) ?? ''
    const start = src.indexOf('async getExtraInfo(')
    expect(start).toBeGreaterThanOrEqual(0)
    const end = src.indexOf('\n  }\n', start)
    expect(end).toBeGreaterThan(start)
    expect(src.slice(start, end)).not.toMatch(/SteamUser\./)
  })

  it('Rule M: the Rust adapters under steam/cm/ never acquire a session themselves (79-23)', () => {
    // The adapters wrap a lease handed to them (SteamCmClient); only callers lease.
    const CM_DIR = `${S}cm/`
    const cmFiles = scannedRelPaths.filter((f) => f.startsWith(CM_DIR))
    expect(cmFiles).toContain(`${CM_DIR}RustCmClient.ts`)
    const re =
      /\b(?:acquireAuthenticated|acquireAuthenticatedWithToken|acquireOpenAuthenticated|ensureConnected)\(/
    const offenders = cmFiles
      .filter((f) => countIn(f, re) > 0)
      .map((f) => `${f} (M)`)
    expect(offenders).toEqual([])
  })

  it('Rule K: the steam-user CM logon log oracle lines are gone (79-39)', () => {
    expect([
      ...filesMatching(/CM logon mode=authenticated reason=/).keys()
    ]).toEqual([])
    expect([
      ...filesMatching(/CM logon mode=anonymous reason=/).keys()
    ]).toEqual([])
  })
})
