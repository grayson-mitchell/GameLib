/**
 * The permanent secret scan over every committed gamelib-info fixture (86-04, Pitfall 10, T-86-08).
 *
 * The oracle recorder (`oracle/recorder.ts`) redacts the ITAD `key` query value, every
 * `Authorization` and `x-auth-token` header value and the HowLongToBeat search-init `token` before
 * it writes. This test is the check that nothing slipped past it, and the check on any fixture
 * written some other way. It fails on:
 *   - `key=` in a query string followed by anything but REDACTED
 *   - `Bearer ` followed by anything but REDACTED
 *   - an `Authorization` or `x-auth-token` value other than REDACTED
 *   - a `"token"` JSON field holding a 32+ character hex or base64 run (the HowLongToBeat token)
 *
 * It imports nothing from any slice module, so it outlives every TS deletion in Phase 86. A failure
 * names the file and the rule, never the value. Pure: no timers, no handles, no module state.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'

const FIXTURES = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-info',
  'tests',
  'fixtures'
)

/** The files the three 86-04 goldens (recent, overrides, anticheat) produced: a half-scanned tree fails. */
const FILE_FLOOR = 189

interface Rule {
  name: string
  /** Matches the secret-bearing text; capture group 1 is the value that must be REDACTED. */
  pattern: RegExp
  /** Whether a captured value is acceptable. */
  ok: (value: string) => boolean
}

const isRedacted = (value: string): boolean => value === 'REDACTED'

const RULES: Rule[] = [
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
    name: 'HowLongToBeat token field',
    pattern: /"token"\s*:\s*"([^"]*)"/g,
    ok: (value) => isRedacted(value) || !/^[A-Za-z0-9+/=_-]{32,}$/.test(value)
  }
]

/** The names of the rules `text` breaks. Never returns a value. */
export function findSecrets(text: string): string[] {
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

describe('fixture redaction scan', () => {
  it('no committed gamelib-info fixture carries a key, bearer token or auth value', () => {
    const files = walk(FIXTURES)
    assertAtOrAboveFloor(
      'gamelib-info fixtures scanned',
      files.length,
      FILE_FLOOR
    )
    const offenders: string[] = []
    for (const file of files) {
      const broken = findSecrets(readFileSync(file, 'latin1'))
      for (const rule of broken) {
        offenders.push(`${relative(FIXTURES, file)}: ${rule}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('an empty fixture tree fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('gamelib-info fixtures scanned', 0, FILE_FLOOR)
    ).toThrow(/below the floor/)
  })

  describe('self-tests: each rule fails on a planted value and passes on REDACTED', () => {
    it('key= in a query string', () => {
      expect(
        findSecrets('https://api.example.invalid/x?key=abc123def&a=1')
      ).toEqual(['query key= value'])
      expect(
        findSecrets('https://api.example.invalid/x?a=1&key=REDACTED')
      ).toEqual([])
    })

    it('Bearer token', () => {
      expect(
        findSecrets('"authorization": "Bearer abcdef0123456789"')
      ).toContain('Bearer token')
      expect(findSecrets('"authorization": "Bearer REDACTED"')).toEqual([])
    })

    it('Authorization value', () => {
      expect(findSecrets('{"authorization": "Basic dXNlcjpwYXNz"}')).toEqual([
        'Authorization value'
      ])
      expect(findSecrets('{"authorization": "REDACTED"}')).toEqual([])
    })

    it('x-auth-token value', () => {
      expect(findSecrets('{"x-auth-token": "0a1b2c3d4e5f"}')).toEqual([
        'x-auth-token value'
      ])
      expect(findSecrets('{"x-auth-token": "REDACTED"}')).toEqual([])
    })

    it('a HowLongToBeat token field of 32+ characters', () => {
      const planted = `{"token":"${'a1B2'.repeat(10)}"}`
      expect(findSecrets(planted)).toEqual(['HowLongToBeat token field'])
      expect(findSecrets('{"token":"REDACTED"}')).toEqual([])
      expect(findSecrets('{"token":"short"}')).toEqual([])
    })
  })
})
