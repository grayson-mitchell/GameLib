/**
 * The permanent secret scan over every committed gamelib-info fixture (86-04, Pitfall 10, T-86-08).
 *
 * The oracle recorder that redacted at write time is deleted (86-24), so this is the only check
 * left on what a fixture holds, including one a person or the Rust side writes some other way. The
 * recorder redacted the ITAD `key` query value, every `Authorization` and `x-auth-token` header
 * value, the HowLongToBeat search-init `token` and the `set-cookie` header (the committed
 * recordings carry `"set-cookie": "REDACTED"`). It fails on:
 *   - `key=` in a query string followed by anything but REDACTED
 *   - `apikey=`, `api_key=`, `access_token=`, `refresh_token=`, `id_token=` or `token=` in a query
 *     string followed by anything but REDACTED
 *   - `Bearer ` followed by anything but REDACTED
 *   - an `Authorization` or `x-auth-token` value other than REDACTED
 *   - a `Cookie` or `Set-Cookie` value other than REDACTED
 *   - an `x-api-key` header, or an `api_key`/`apikey`/`api-key` field, other than REDACTED or empty
 *   - an `access_token`, `refresh_token` or `id_token` field other than REDACTED or empty
 *   - a `"token"` JSON field holding a 32+ character hex or base64 run (the HowLongToBeat token)
 *
 * That is every shape named above and nothing else: a secret under another name is not seen. A
 * walk that loses a slice also fails, by the floor and the per-slice check below.
 *
 * It imports nothing from any slice module, so it outlives every TS deletion in Phase 86. A failure
 * names the file and the rule, never the value. Pure: no timers, no handles, no module state.
 */
import { readFileSync, readdirSync } from 'fs'
import { join, relative, sep } from 'path'
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

/**
 * Measured on the whole tree: 992 files across golden, recorded and state (86-REVIEW WR-61). The
 * floor sits a little under that, so a walk that silently loses a slice fails. Raise it when
 * fixtures are added.
 */
const FILE_FLOOR = 900

/** The eight slices that each hold fixtures, as `infoPortComplete`'s oracle slices enumerate them. */
const SLICES = [
  'anticheat',
  'crossover',
  'discounts',
  'overrides',
  'recent',
  'steamgrid',
  'storeSearch',
  'wiki'
]

/** The slices with recorded HTTP exchanges: where tokens, cookies and headers live. */
const RECORDED_SLICES = [
  'anticheat',
  'crossover',
  'discounts',
  'steamgrid',
  'storeSearch',
  'wiki'
]

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
    name: 'query token or api key',
    pattern:
      /[?&](?:api[_-]?key|access_token|refresh_token|id_token|token)=([^&\s"'#\\]*)/gi,
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
    name: 'Cookie or Set-Cookie value',
    pattern: /["']?(?:set-)?cookie["']?\s*[:=]\s*["']?([^"'\s,}\\]+)/gi,
    ok: isRedacted
  },
  {
    name: 'x-api-key or api key field',
    pattern:
      /["']?(?:x-api-key|api[_-]?key)["']?\s*[:=]\s*["']?([^"'\s,}\\&]*)/gi,
    ok: (value) => value === '' || isRedacted(value)
  },
  {
    name: 'access, refresh or id token field',
    pattern:
      /["']?(?:access|refresh|id)_token["']?\s*[:=]\s*["']?([^"'\s,}\\&]*)/gi,
    ok: (value) => value === '' || isRedacted(value)
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

/** How many of `files` sit under `<FIXTURES>/<prefix>/`. */
function filesUnder(files: string[], ...prefix: string[]): number {
  const root = join(FIXTURES, ...prefix) + sep
  return files.filter((file) => file.startsWith(root)).length
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

  it('every slice, and every recorded slice, contributes files to the walk', () => {
    const files = walk(FIXTURES)
    const empty: string[] = []
    for (const slice of SLICES) {
      const count = ['golden', 'recorded', 'state']
        .map((kind) => filesUnder(files, kind, slice))
        .reduce((a, b) => a + b, 0)
      if (count < 1) empty.push(slice)
    }
    for (const slice of RECORDED_SLICES) {
      if (filesUnder(files, 'recorded', slice) < 1) {
        empty.push(`recorded/${slice}`)
      }
    }
    expect(empty).toEqual([])
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

    it('a token or api key in a query string', () => {
      for (const name of ['token', 'apikey', 'api_key', 'access_token']) {
        // A key-shaped name can trip the field rule as well; the query rule must be among them.
        expect(findSecrets(`https://x.invalid/a?${name}=abc123&b=1`)).toContain(
          'query token or api key'
        )
        expect(findSecrets(`https://x.invalid/a?b=1&${name}=REDACTED`)).toEqual(
          []
        )
      }
    })

    it('a Cookie or Set-Cookie value', () => {
      expect(findSecrets('{"set-cookie": "sid=abc123; Path=/"}')).toEqual([
        'Cookie or Set-Cookie value'
      ])
      expect(findSecrets('{"cookie": "sid=abc123"}')).toEqual([
        'Cookie or Set-Cookie value'
      ])
      expect(findSecrets('{"set-cookie": "REDACTED"}')).toEqual([])
      expect(findSecrets('{"cookie": "REDACTED"}')).toEqual([])
    })

    it('an x-api-key header or an api key field', () => {
      expect(findSecrets('{"x-api-key": "0a1b2c3d"}')).toEqual([
        'x-api-key or api key field'
      ])
      expect(findSecrets('{"apiKey": "0a1b2c3d"}')).toEqual([
        'x-api-key or api key field'
      ])
      expect(findSecrets('{"x-api-key": "REDACTED"}')).toEqual([])
      expect(findSecrets('{"api_key": ""}')).toEqual([])
    })

    it('an access, refresh or id token field', () => {
      for (const name of ['access_token', 'refresh_token', 'id_token']) {
        expect(findSecrets(`{"${name}": "eyJhbGciOi.abc.def"}`)).toEqual([
          'access, refresh or id token field'
        ])
        expect(findSecrets(`{"${name}": "REDACTED"}`)).toEqual([])
      }
    })

    it('a HowLongToBeat token field of 32+ characters', () => {
      const planted = `{"token":"${'a1B2'.repeat(10)}"}`
      expect(findSecrets(planted)).toEqual(['HowLongToBeat token field'])
      expect(findSecrets('{"token":"REDACTED"}')).toEqual([])
      expect(findSecrets('{"token":"short"}')).toEqual([])
    })
  })
})
