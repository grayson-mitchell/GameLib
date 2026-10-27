/**
 * Phase 54 source gate (ROADMAP SC3 / SC6): the Steam authenticated-session
 * policy, enforced structurally.
 *
 * What it proves: an authenticated CM logon is reachable only from user.ts,
 * the anonymous logon only from anonymousClient.ts, the lease entry points are
 * called only from an allow-list, the launch path calls none of them, every
 * steam-user construction sets `autoRelogin: false`, `.relog(` is gone, and
 * `allowLogon: true` has exactly one owner.
 *
 * What it does NOT prove: runtime behaviour (authSessionLifecycle.test.ts,
 * macSteamOfflineWrap.test.ts and steamStartupKeyringDeferral.test.ts cover
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
const ANON = `${S}anonymousClient.ts`
const GAMES = `${S}games.ts`

const ACQUIRE_AUTH_ALLOW = [USER, `${S}library.ts`, `${S}depot.ts`, GAMES]
const ACQUIRE_OPEN_ALLOW = [
  USER,
  `${S}library.ts`,
  `${S}depot.ts`,
  `${S}installLocation.ts`,
  `${S}bridge/launchTarget.ts`
]
const ENSURE_CONNECTED_ALLOW = [USER]
const LAUNCH_PATH = [
  `${S}installLocation.ts`,
  `${S}bridge/launchTarget.ts`,
  `${S}platformCapture.ts`,
  ANON,
  `${S}macSteamOffline.ts`,
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

/** Capture the argument text of the call whose '(' is at `open`, on stripped source. */
function captureParens(src: string, open: number): string {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return src.slice(open + 1, i)
    }
  }
  return src.slice(open + 1)
}

describe('Steam authenticated-session policy (Phase 54 ROADMAP SC3)', () => {
  it('floor: scans at least MIN_FILES_SCANNED files', () => {
    expect(scannedRelPaths.length).toBeGreaterThanOrEqual(MIN_FILES_SCANNED)
  })

  it('must-scan: every allow-listed and launch-path file is in the scanned set', () => {
    const must = new Set([
      USER,
      ANON,
      GAMES,
      ...ACQUIRE_AUTH_ALLOW,
      ...ACQUIRE_OPEN_ALLOW,
      ...ENSURE_CONNECTED_ALLOW,
      ...LAUNCH_PATH
    ])
    const missing = [...must].filter((f) => !scannedRelPaths.includes(f))
    expect(missing).toEqual([])
  })

  it('Rule A: authenticated logOn({ refreshToken }) appears only in user.ts', () => {
    const re = /logOn\(\s*\{[^}]*refreshToken/
    expect(countIn(USER, re)).toBeGreaterThanOrEqual(1)
    expect(offendersOutside(re, [USER], 'A')).toEqual([])
  })

  it('Rule B: anonymous logOn appears only in anonymousClient.ts', () => {
    const re = /logOn\(\s*\{\s*anonymous\s*:\s*true/
    expect(countIn(ANON, re)).toBeGreaterThanOrEqual(1)
    expect(offendersOutside(re, [ANON], 'B')).toEqual([])
  })

  it('Rule C: .relog( appears nowhere', () => {
    expect([...filesMatching(/\.relog\(/).keys()]).toEqual([])
  })

  it('Rule D: ensureConnected( is called only from user.ts', () => {
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

  it('Rule G: launch-path files call neither acquireAuthenticated( nor ensureConnected(', () => {
    const re = /\b(?:acquireAuthenticated|ensureConnected)\(/
    const offenders = LAUNCH_PATH.filter((f) => countIn(f, re) > 0).map(
      (f) => `${f} (G)`
    )
    expect(offenders).toEqual([])
  })

  it('Rule H: every steam-user construction passes autoRelogin: false', () => {
    const re = /new\s+SteamUser(?:Lib)?\s*\(/g
    let constructions = 0
    const offenders: string[] = []
    for (const rel of scannedRelPaths) {
      const src = stripped.get(rel) ?? ''
      for (const m of src.matchAll(re)) {
        const open = (m.index ?? 0) + m[0].length - 1
        constructions++
        if (!/autoRelogin\s*:\s*false/.test(captureParens(src, open))) {
          offenders.push(`${rel} (H)`)
        }
      }
    }
    expect(constructions).toBeGreaterThanOrEqual(2)
    expect(offenders).toEqual([])
  })

  it('Rule I: allowLogon: true occurs exactly once, in games.ts', () => {
    const hits = filesMatching(/allowLogon\s*:\s*true/)
    expect([...hits.entries()]).toEqual([[GAMES, 1]])
  })

  it('Rule J: getExtraInfo in games.ts calls nothing on SteamUser', () => {
    const src = stripped.get(GAMES) ?? ''
    const start = src.indexOf('async getExtraInfo(')
    expect(start).toBeGreaterThanOrEqual(0)
    const end = src.indexOf('\n  }\n', start)
    expect(end).toBeGreaterThan(start)
    expect(src.slice(start, end)).not.toMatch(/SteamUser\./)
  })

  it('Rule K: the CM logon log oracle lines each occur exactly once', () => {
    const auth = filesMatching(/CM logon mode=authenticated reason=/)
    const anon = filesMatching(/CM logon mode=anonymous reason=/)
    expect([...auth.entries()]).toEqual([[USER, 1]])
    expect([...anon.entries()]).toEqual([[ANON, 1]])
  })
})
