/**
 * The permanent identity and secret scan over every committed Phase 87 fixture (87-05, Pitfall 12,
 * T-87-10).
 *
 * The oracle recorder (`testUtils/engineWineOracle/recorder.ts`) redacts secrets and the harness
 * normalises profile paths to placeholders before anything is written. This test is the check that
 * nothing slipped past them, and the check on any fixture written some other way. It walks the
 * `tests/fixtures` tree of both the `gamelib-engine` and `gamelib-wine` crates and fails on:
 *   - a macOS, Linux or Windows home path naming an account (`/Users/<name>`, `/home/<name>`,
 *     `C:\Users\<name>`), whatever the JSON escaping, unless the name is one of the synthetic
 *     accounts in `SYNTHETIC_ACCOUNTS` (a Wine prefix's own `crossover` user is not the operator)
 *   - `key=` in a query string, `Bearer ` or an `Authorization` / `x-auth-token` value that is not
 *     `REDACTED`, and a long `"token"` field
 *   - a 36-character uppercase UUID in a `cxbottle.conf` fixture, or after `BottleID`, that is not
 *     one of the synthetic BottleIDs in `SYNTHETIC_BOTTLE_IDS`. Phase 87 fixture builders must draw
 *     their BottleIDs from that list; a real one names the operator's bottle.
 *
 * It imports no slice module, so it outlives every TS deletion in Phase 87. A failure names the
 * file and the rule, never the value. A fixture directory a crate does not have yet is skipped; the
 * scan as a whole is held to a floor, and later golden plans only raise it.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync
} from 'fs'
import { basename, dirname, join, relative } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

const CRATES_ROOT = join(__dirname, '..', '..', '..', 'src-tauri', 'crates')

/** The crates whose fixtures Phase 87 commits. */
const SCANNED_CRATES = ['gamelib-engine', 'gamelib-wine'] as const

/** The files 87-05 and 87-07 commit (the runtimes and wine-manager goldens and recordings): a half-scanned tree fails. */
const FILE_FLOOR = 210

/** Account names that name a role or a Wine prefix's own user, never a person. */
const SYNTHETIC_ACCOUNTS: readonly string[] = [
  'shared',
  'public',
  'default',
  'crossover',
  'steamuser'
]

/** The BottleIDs a Phase 87 fixture may carry. A real `cxbottle.conf` BottleID is never committed. */
const SYNTHETIC_BOTTLE_IDS: readonly string[] = [
  'AAAAAAAA-0000-4000-8000-000000000001',
  'AAAAAAAA-0000-4000-8000-000000000002',
  'AAAAAAAA-0000-4000-8000-000000000003',
  'AAAAAAAA-0000-4000-8000-000000000004'
]

const UUID_UPPER =
  '[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}'

interface Rule {
  name: string
  /** Matches the text; capture group 1 is the value the rule judges. */
  pattern: RegExp
  /** Whether a captured value is acceptable. */
  ok: (value: string) => boolean
  /** Restrict the rule to a file (by relative path). */
  only?: (relPath: string) => boolean
}

const isRedacted = (value: string): boolean => value === 'REDACTED'
const isSyntheticAccount = (value: string): boolean =>
  SYNTHETIC_ACCOUNTS.includes(value.toLowerCase())

// A path segment that follows `/Users/` or `/home/`. A `<` starts a placeholder (`<HOME>`).
const ACCOUNT = `([^/\\\\"'\\s<]+)`
// Not preceded by a word, dot or dash, so a URL path such as `github.com/home/x` is not a home dir.
const NOT_URL = `(?<![\\w.\\-])`

const RULES: Rule[] = [
  {
    name: 'macOS home path',
    pattern: new RegExp(`${NOT_URL}/Users/${ACCOUNT}`, 'g'),
    ok: isSyntheticAccount
  },
  {
    name: 'Linux home path',
    pattern: new RegExp(`${NOT_URL}/home/${ACCOUNT}`, 'g'),
    ok: isSyntheticAccount
  },
  {
    name: 'Windows home path',
    // `C:\Users\x` as raw text, or `C:\\Users\\x` as JSON-escaped text, or with forward slashes.
    pattern: new RegExp(
      `[A-Za-z]:(?:\\\\\\\\|\\\\|/)Users(?:\\\\\\\\|\\\\|/)${ACCOUNT}`,
      'gi'
    ),
    ok: isSyntheticAccount
  },
  {
    name: 'query key= value',
    pattern: /[?&]key=([^&\s"'#\\]*)/gi,
    ok: isRedacted
  },
  {
    name: 'Bearer token',
    pattern: /Bearer\s+([^\s"'\\,}]+)/g,
    ok: isRedacted
  },
  {
    name: 'Authorization value',
    pattern: /["']?authorization["']?\s*[:=]\s*["']?([^"'\s,}\\]+)/gi,
    // A scheme word is followed by the credential, which the Bearer rule judges.
    ok: (value) => isRedacted(value) || /^bearer$/i.test(value)
  },
  {
    name: 'x-auth-token value',
    pattern: /x-auth-token["']?\s*[:=]\s*["']?([^"'\s,}\\]*)/gi,
    ok: isRedacted
  },
  {
    name: 'token field',
    pattern: /"token"\s*:\s*"([^"]*)"/g,
    ok: (value) => isRedacted(value) || !/^[A-Za-z0-9+/=_-]{32,}$/.test(value)
  },
  {
    name: 'BottleID value',
    pattern: new RegExp(`BottleID[^0-9A-Fa-f]{0,16}(${UUID_UPPER})`, 'g'),
    ok: (value) => SYNTHETIC_BOTTLE_IDS.includes(value)
  },
  {
    name: 'cxbottle.conf UUID',
    pattern: new RegExp(`(${UUID_UPPER})`, 'g'),
    ok: (value) => SYNTHETIC_BOTTLE_IDS.includes(value),
    only: (relPath) => basename(relPath) === 'cxbottle.conf'
  }
]

/** The names of the rules `text` (the content of the fixture at `relPath`) breaks. Never returns a value. */
export function findViolations(relPath: string, text: string): string[] {
  const broken: string[] = []
  for (const rule of RULES) {
    if (rule.only && !rule.only(relPath)) continue
    for (const match of text.matchAll(rule.pattern)) {
      if (!rule.ok(match[1] ?? '')) {
        broken.push(rule.name)
        break
      }
    }
  }
  return broken
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

/** Every `rel/path: rule` under `root`; a root that does not exist yields no files. */
function scanTree(root: string): { files: number; offenders: string[] } {
  if (!existsSync(root)) return { files: 0, offenders: [] }
  const files = walk(root)
  const offenders: string[] = []
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/')
    for (const rule of findViolations(rel, readFileSync(file, 'latin1'))) {
      offenders.push(`${rel}: ${rule}`)
    }
  }
  return { files: files.length, offenders }
}

describe('Phase 87 fixture redaction scan', () => {
  it('no committed engine or wine fixture names the operator or carries a secret', () => {
    let scanned = 0
    const offenders: string[] = []
    for (const crate of SCANNED_CRATES) {
      const result = scanTree(join(CRATES_ROOT, crate, 'tests', 'fixtures'))
      scanned += result.files
      offenders.push(...result.offenders.map((o) => `${crate}/${o}`))
    }
    assertAtOrAboveFloor('Phase 87 fixtures scanned', scanned, FILE_FLOOR)
    expect(offenders).toEqual([])
  })

  it('an empty fixture tree fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('Phase 87 fixtures scanned', 0, FILE_FLOOR)
    ).toThrow(/below the floor/)
  })

  describe('planted negatives: each rule fails on a planted value and passes on its safe form', () => {
    it('a planted /Users/<name> path fails, a placeholder does not', () => {
      expect(findViolations('x.json', '"/Users/alice/Library/x"')).toEqual([
        'macOS home path'
      ])
      expect(findViolations('x.json', '"<HOME>/Library/x"')).toEqual([])
      expect(findViolations('x.json', '"/Users/Shared/x"')).toEqual([])
    })

    it('a planted /home/<name> path fails, a URL path does not', () => {
      expect(findViolations('x.json', '"/home/bob/.config"')).toEqual([
        'Linux home path'
      ])
      expect(
        findViolations('x.json', '"https://example.invalid/home/page"')
      ).toEqual([])
    })

    it('a planted C:\\Users\\<name> path fails raw and JSON-escaped, Wine users do not', () => {
      expect(findViolations('x.txt', 'C:\\Users\\carol\\AppData')).toEqual([
        'Windows home path'
      ])
      expect(
        findViolations('x.json', '"C:\\\\Users\\\\carol\\\\AppData"')
      ).toEqual(['Windows home path'])
      expect(findViolations('x.txt', 'C:\\users\\crossover\\Desktop')).toEqual(
        []
      )
    })

    it('a planted Authorization Bearer value fails, REDACTED does not', () => {
      expect(
        findViolations('x.json', 'Authorization: Bearer abcdef0123456789')
      ).toContain('Bearer token')
      expect(
        findViolations('x.json', '{"authorization": "Bearer REDACTED"}')
      ).toEqual([])
      expect(
        findViolations('x.json', '{"authorization": "Basic dXNlcjpwYXNz"}')
      ).toEqual(['Authorization value'])
    })

    it('a planted query key= and x-auth-token fail, REDACTED does not', () => {
      expect(
        findViolations('x.json', 'https://x.invalid/a?key=abc123')
      ).toEqual(['query key= value'])
      expect(
        findViolations('x.json', 'https://x.invalid/a?key=REDACTED')
      ).toEqual([])
      expect(findViolations('x.json', '{"x-auth-token": "0a1b2c3d"}')).toEqual([
        'x-auth-token value'
      ])
    })

    it('a planted uppercase UUID in a cxbottle.conf fails unless it is synthetic', () => {
      const real = '5F3A9C2E-1B4D-4E6F-8A7B-9C0D1E2F3A4B'
      expect(
        findViolations('b/cxbottle.conf', `[Bottle]\n"BottleID" = "${real}"\n`)
      ).toEqual(expect.arrayContaining(['cxbottle.conf UUID']))
      expect(
        findViolations(
          'b/cxbottle.conf',
          `"BottleID" = "${SYNTHETIC_BOTTLE_IDS[0]}"`
        )
      ).toEqual([])
      // The same UUID in an ordinary fixture is not a bottle id, unless it follows BottleID.
      expect(findViolations('x.json', real)).toEqual([])
      expect(findViolations('x.json', `"BottleID": "${real}"`)).toEqual([
        'BottleID value'
      ])
    })

    it('a planted fixture in a walked tree is found and named without its value', () => {
      const profile = createFakeHomeProfile({ prefix: 'gamelib-redaction-' })
      try {
        const root = join(profile.root, 'fixtures')
        const bad = join(root, 'golden', 's', 'expected', 'c', 'tree.json')
        mkdirSync(dirname(bad), { recursive: true })
        writeFileSync(bad, '{"path": "/Users/alice/x"}')
        const clean = join(root, 'golden', 's', 'expected', 'c', 'result.json')
        writeFileSync(clean, '{"path": "<HOME>/x"}')
        const { files, offenders } = scanTree(root)
        expect(files).toBe(2)
        expect(offenders).toEqual([
          'golden/s/expected/c/tree.json: macOS home path'
        ])
        expect(offenders.join()).not.toContain('alice')
      } finally {
        profile.dispose()
      }
    })

    it('a missing fixture root scans nothing instead of throwing', () => {
      expect(scanTree(join(CRATES_ROOT, 'no-such-crate'))).toEqual({
        files: 0,
        offenders: []
      })
    })
  })
})
