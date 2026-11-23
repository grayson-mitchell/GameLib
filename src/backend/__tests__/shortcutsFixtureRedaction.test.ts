/**
 * The permanent identity and secret scan over every committed `gamelib-shortcuts` fixture (94-05,
 * T-94-09).
 *
 * The shortcut oracle harness (`testUtils/shortcutsOracle/harness.ts`) normalises profile paths to
 * placeholders before anything is written. This test is the check that nothing slipped past it, and
 * the check on any fixture written some other way. It walks the crate's `tests/fixtures` tree and
 * fails on a macOS, Linux or Windows home path naming an account (`/Users/<name>`, `/home/<name>`,
 * `C:\Users\<name>`, whatever the JSON escaping) and on an `Authorization` / `Bearer` value that is
 * not `REDACTED`. A failure names the file and the rule, never the value.
 *
 * It imports no slice module, so it outlives every TypeScript deletion in Phase 94. The scan as a
 * whole is held to a floor, and later golden plans only raise it.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, relative } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

const FIXTURES_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-shortcuts',
  'tests',
  'fixtures'
)

/** The files 94-05 commits (the text, sanitize, paths and exists goldens with their manifests); a half-scanned tree fails. */
const FILE_FLOOR = 133

/** Account names that name a role, never a person. */
const SYNTHETIC_ACCOUNTS: readonly string[] = ['shared', 'public', 'default']

interface Rule {
  name: string
  /** Matches the text; capture group 1 is the value the rule judges. */
  pattern: RegExp
  /** Whether a captured value is acceptable. */
  ok: (value: string) => boolean
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
    name: 'Bearer token',
    pattern: /Bearer\s+([^\s"'\\,}]+)/g,
    ok: isRedacted
  },
  {
    name: 'Authorization value',
    pattern: /["']?authorization["']?\s*[:=]\s*["']?([^"'\s,}\\]+)/gi,
    // A scheme word is followed by the credential, which the Bearer rule judges.
    ok: (value) => isRedacted(value) || /^bearer$/i.test(value)
  }
]

/** The names of the rules `text` breaks. Never returns a value. */
function findViolations(text: string): string[] {
  const broken: string[] = []
  for (const rule of RULES) {
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
  let files: string[]
  try {
    files = walk(root)
  } catch {
    return { files: 0, offenders: [] }
  }
  const offenders: string[] = []
  for (const file of files) {
    const rel = relative(root, file).split('\\').join('/')
    for (const rule of findViolations(readFileSync(file, 'utf8'))) {
      offenders.push(`${rel}: ${rule}`)
    }
  }
  return { files: files.length, offenders }
}

describe('Phase 94 shortcut fixture redaction scan', () => {
  it('no committed shortcut fixture names the operator or carries a secret', () => {
    const { files, offenders } = scanTree(FIXTURES_ROOT)
    assertAtOrAboveFloor(
      'Phase 94 shortcut fixtures scanned',
      files,
      FILE_FLOOR
    )
    expect(offenders).toEqual([])
  })

  it('an empty fixture tree fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('Phase 94 shortcut fixtures scanned', 0, FILE_FLOOR)
    ).toThrow(/below the floor/)
  })

  describe('planted negatives: each rule fails on a planted value and passes on its safe form', () => {
    it('a planted /Users/<name> path fails, a placeholder does not', () => {
      expect(findViolations('"/Users/alice/Applications/x.app"')).toEqual([
        'macOS home path'
      ])
      expect(findViolations('"<HOME>/Applications/x.app"')).toEqual([])
      expect(findViolations('"/Users/Shared/x"')).toEqual([])
    })

    it('a planted /home/<name> path fails, a URL path does not', () => {
      expect(findViolations('"/home/bob/.local/share/applications"')).toEqual([
        'Linux home path'
      ])
      expect(findViolations('"https://example.invalid/home/page"')).toEqual([])
    })

    it('a planted C:\\Users\\<name> path fails raw and JSON-escaped, a placeholder does not', () => {
      expect(findViolations('C:\\Users\\carol\\AppData')).toEqual([
        'Windows home path'
      ])
      expect(findViolations('"C:\\\\Users\\\\carol\\\\AppData"')).toEqual([
        'Windows home path'
      ])
      expect(findViolations('"<APPDATA>\\\\Microsoft\\\\Windows"')).toEqual([])
    })

    it('a planted Authorization Bearer value fails, REDACTED does not', () => {
      expect(
        findViolations('Authorization: Bearer abcdef0123456789')
      ).toContain('Bearer token')
      expect(findViolations('{"authorization": "Bearer REDACTED"}')).toEqual([])
      expect(findViolations('{"authorization": "Basic dXNlcjpwYXNz"}')).toEqual(
        ['Authorization value']
      )
    })

    it('a planted fixture in a walked tree is found and named without its value', () => {
      const profile = createFakeHomeProfile({ prefix: 'gamelib-redaction-' })
      try {
        const root = join(profile.root, 'fixtures')
        const bad = join(root, 'golden', 's', 'c.json')
        mkdirSync(dirname(bad), { recursive: true })
        writeFileSync(bad, '{"path": "/Users/alice/x"}')
        writeFileSync(
          join(root, 'golden', 's', 'd.json'),
          '{"path": "<HOME>/x"}'
        )
        const { files, offenders } = scanTree(root)
        expect(files).toBe(2)
        expect(offenders).toEqual(['golden/s/c.json: macOS home path'])
        expect(offenders.join()).not.toContain('alice')
      } finally {
        profile.dispose()
      }
    })

    it('a missing fixture root scans nothing instead of throwing', () => {
      expect(scanTree(join(FIXTURES_ROOT, 'no-such-dir'))).toEqual({
        files: 0,
        offenders: []
      })
    })
  })
})
