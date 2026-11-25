/**
 * The permanent identity and secret scan over every committed `gamelib-humble` fixture (94-06,
 * T-94-10).
 *
 * The Humble oracle (`testUtils/humbleOracle/`) redacts a recording before anything is written:
 * cookie values (`_simpleauth_sess`, `ory_session_*`), CSRF tokens, gamekeys, key values, email
 * addresses and account names become `REDACTED`. This test is the check that nothing slipped past
 * it, and the check on any fixture written some other way (a captured session, a hand-made case).
 * It walks the crate's `tests/fixtures` tree and fails on:
 *   - a cookie, CSRF or authorization value that is not `REDACTED`;
 *   - a gamekey in a `/home/library/<gamekey>` path or a `gamekey` field that has a real gamekey's
 *     shape (a run of 12 or more letters and digits; the synthetic fixtures' ids carry a hyphen);
 *   - a key value field (`redeemed_key_val`, `redeemed_key_value`, `key`, ...) holding a string
 *     that is not `REDACTED`;
 *   - an email address, an account-name field that is not `REDACTED`;
 *   - a macOS, Linux or Windows home path naming an account;
 *   - a Cloudflare block page, whose footer names the requester's public IP and a Ray ID (the first
 *     real capture, `recorded/real/sync/body-37.html`, was one; see `debug/humble-library-
 *     cloudflare-403`). The rule keys on the page's own markers, never on a dotted quad: Humble's
 *     public HTML and JS carry SVG path data such as `M10.5.25.75.125` that looks like an address.
 * A failure names the file and the rule, never the value.
 *
 * `recorded/real/` (94-10, T-94-19) is the one directory that holds a capture of the operator's
 * real account. The rules above cover it with the rest of the tree. Beyond them: a cookie header
 * of ANY name must carry only `REDACTED` values (the real session sets cookies no synthetic case
 * knows the name of), and when the operator hands the test their literal account name and email
 * through the environment (capture time only, never written to a file) every byte under
 * `recorded/real/` is searched for them, and a finding names the file and which of the two it
 * was, never the value.
 *
 * It imports no slice module, so it outlives every TypeScript deletion in Phase 94. The scan as a
 * whole is held to a floor, and later golden plans only raise it.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join, relative } from 'path'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import {
  literalsFrom,
  scanForLiterals
} from 'backend/testUtils/humbleOracle/literalScan'

const FIXTURES_ROOT = join(
  __dirname,
  '..',
  '..',
  '..',
  'src-tauri',
  'crates',
  'gamelib-humble',
  'tests',
  'fixtures'
)

/**
 * The files committed so far: the three recorded wire cases of 94-06 Task 1 (6 files), the 492 classify
 * goldens and the 61 dedup goldens of Task 2 with their two MANIFEST.json (561 in all), and 94-08's
 * adapter (89 goldens, 65 recorded cases with their body files), library (51 goldens and their
 * recordings) and state (9 goldens) slices: 1533 in all; 94-09's user (70 goldens, 60 recorded cases), secrets (23), alerts (11), app_id_resolver (11 goldens, 11 recorded cases) and user_agent (8) slices bring it to 1836. A half-scanned tree fails. Later plans raise it.
 */
const FILE_FLOOR = 1830

/** Account names that name a role, never a person. */
const SYNTHETIC_ACCOUNTS: readonly string[] = ['shared', 'public', 'default']

interface Rule {
  name: string
  /** Matches the text; capture group 1 is the value the rule judges. */
  pattern: RegExp
  /** Whether a captured value is acceptable. */
  ok: (value: string) => boolean
  /** When present, judges the whole match instead of `ok` judging group 1. */
  judge?: (match: RegExpMatchArray) => boolean
}

const isRedacted = (value: string): boolean => value === 'REDACTED'
const isSyntheticAccount = (value: string): boolean =>
  SYNTHETIC_ACCOUNTS.includes(value.toLowerCase())

// A path segment that follows `/Users/` or `/home/`. A `<` starts a placeholder (`<HOME>`).
const ACCOUNT = `([^/\\\\"'\\s<]+)`
// Not preceded by a word, dot or dash, so a URL path such as `github.com/home/x` is not a home dir.
const NOT_URL = `(?<![\\w.\\-])`
// A JSON key, plain or escaped inside another string (`\\"key\\"`), then its string value.
const field = (names: string): RegExp =>
  new RegExp(
    `\\\\?"(?:${names})\\\\?"\\s*:\\s*\\\\?"((?:[^"\\\\]|\\\\(?!"))*)(?=\\\\?")`,
    'gi'
  )

/** A real Humble gamekey is a run of letters and digits; the synthetic ids carry a hyphen. */
const looksLikeRealGamekey = (value: string): boolean =>
  /^[A-Za-z0-9]{12,}$/.test(value)

/**
 * The cookie pairs of a `Cookie` header value (all of them) or a `Set-Cookie` one (the first pair
 * only: the rest are attributes such as `Path` and `Expires`). Each value must be `REDACTED`.
 */
const cookiePairsRedacted = (name: string, value: string): boolean => {
  const pairs = value.split(';')
  const judged = name.toLowerCase() === 'cookie' ? pairs : pairs.slice(0, 1)
  return judged.every((pair) => {
    const eq = pair.indexOf('=')
    return eq < 0 || pair.slice(eq + 1).trim() === 'REDACTED'
  })
}

const RULES: Rule[] = [
  {
    name: 'cookie value',
    pattern:
      /\b(?:_simpleauth_sess|ory_session_[A-Za-z0-9_-]*|__cf_bm|cf_clearance|csrf[A-Za-z0-9_-]*)=([^;\s"'\\,]+)/gi,
    ok: isRedacted
  },
  {
    name: 'cookie header value of any name',
    // A header pair `["Cookie", "a=b; c=d"]`; the rule judges name and value together.
    pattern: /\[\s*"(cookie|set-cookie)"\s*,\s*"([^"]*)"/gi,
    ok: () => true,
    judge: (match) => cookiePairsRedacted(match[1] ?? '', match[2] ?? '')
  },
  {
    name: 'CSRF or authorization header value',
    pattern:
      /\[\s*"(?:x-csrf-token|csrf-token|x-xsrf-token|x-csrftoken|x-auth-token|authorization|proxy-authorization)"\s*,\s*"([^"]*)"/gi,
    ok: isRedacted
  },
  {
    name: 'gamekey in a path',
    pattern:
      /\/(?:home\/library|api\/v1\/order|api\/v1\/orders)\/([^/?#\s"'\\]+)/g,
    ok: (value) => isRedacted(value)
  },
  {
    name: 'gamekey field',
    pattern: field('gamekey|game_key|gamekeys'),
    ok: (value) => isRedacted(value) || !looksLikeRealGamekey(value)
  },
  {
    name: 'key value field',
    pattern: field(
      'redeemed_key_val|redeemed_key_value|key_value|keyvalue|key|revealedKeyValue'
    ),
    ok: (value) => isRedacted(value) || value === ''
  },
  {
    name: 'account name field',
    pattern: field(
      'username|user_name|account_name|accountname|displayname|display_name|handle|email|email_address'
    ),
    ok: (value) => isRedacted(value) || value === ''
  },
  {
    name: 'email address',
    pattern: /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
    ok: () => false
  },
  {
    name: 'macOS home path',
    pattern: new RegExp(`${NOT_URL}/Users/${ACCOUNT}`, 'g'),
    ok: isSyntheticAccount
  },
  {
    name: 'Linux home path',
    pattern: new RegExp(`${NOT_URL}/home/${ACCOUNT}`, 'g'),
    // `/home/library` is Humble's own page path, not an account's home.
    ok: (value) =>
      isSyntheticAccount(value) || /^library(?:[?#].*)?$/.test(value)
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
    // A real Cloudflare block page identifies the requester: `Your IP: <ip>` and `Cloudflare Ray
    // ID: <id>` in its footer, inside the `cf-error-details` wrapper. A hand-made access-denied
    // fixture can carry the page title or the words "blocked" without any of these markers.
    name: 'Cloudflare block page',
    pattern: /cf-error-details|Cloudflare Ray ID|cf-footer-ip|Your IP\b/g,
    ok: () => false
  }
]

/** The names of the rules `text` breaks. Never returns a value. */
function findViolations(text: string): string[] {
  const broken: string[] = []
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (!(rule.judge ? rule.judge(match) : rule.ok(match[1] ?? ''))) {
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

/** `recorded/real`: the operator's one real capture (94-10). It may not exist yet. */
const REAL_DIR = join(FIXTURES_ROOT, 'recorded', 'real')

describe('Phase 94 Humble fixture redaction scan', () => {
  it('no committed Humble fixture carries a secret or an identity', () => {
    const { files, offenders } = scanTree(FIXTURES_ROOT)
    assertAtOrAboveFloor('Phase 94 Humble fixtures scanned', files, FILE_FLOOR)
    expect(offenders).toEqual([])
  })

  describe('recorded/real: the operator account capture (94-10, T-94-19)', () => {
    it('carries no secret or identity the rules can name', () => {
      // An absent directory scans nothing: the capture is committed by a later task.
      expect(scanTree(REAL_DIR).offenders).toEqual([])
    })

    it("holds neither the operator's account name nor their email, when the environment supplies them", () => {
      const literals = literalsFrom(
        process.env.GAMELIB_HUMBLE_REDACT_ACCOUNT,
        process.env.GAMELIB_HUMBLE_REDACT_EMAIL
      )
      if (literals.length === 0) {
        console.info(
          'humbleFixtureRedaction: the account and email literals are not supplied, so only the pattern rules ran over recorded/real'
        )
        return
      }
      // A literal scan over nothing would pass for the wrong reason.
      const { files, findings } = scanForLiterals(REAL_DIR, literals)
      expect(files).toBeGreaterThan(0)
      expect(findings).toEqual([])
    })

    it('a planted account name or email in a walked tree is found and named without its value', () => {
      const profile = createFakeHomeProfile({ prefix: 'gamelib-redaction-' })
      try {
        const root = join(profile.root, 'real')
        mkdirSync(join(root, 'sync'), { recursive: true })
        writeFileSync(
          join(root, 'sync', 'body-1.html'),
          '<p>Welcome back, Some Person</p>'
        )
        writeFileSync(
          join(root, 'sync', 'body-2.json'),
          '{"next":"/u/some.person%40mail.test/library"}'
        )
        writeFileSync(join(root, 'clean.txt'), 'Someone else entirely')
        const literals = literalsFrom('Some Person', 'some.person@mail.test')
        const { files, findings } = scanForLiterals(root, literals)
        expect(files).toBe(3)
        expect(findings.sort()).toEqual([
          'sync/body-1.html: account',
          'sync/body-2.json: email'
        ])
        expect(findings.join()).not.toContain('Some Person')
        expect(findings.join()).not.toContain('some.person')
      } finally {
        profile.dispose()
      }
    })

    it('an account name inside a longer word is not a match, a blank literal is not scanned', () => {
      const profile = createFakeHomeProfile({ prefix: 'gamelib-redaction-' })
      try {
        writeFileSync(join(profile.root, 'a.txt'), 'bobbing and weaving; Bob!')
        expect(
          scanForLiterals(profile.root, literalsFrom('bob', undefined)).findings
        ).toEqual(['a.txt: account'])
        writeFileSync(join(profile.root, 'a.txt'), 'bobbing and weaving')
        expect(
          scanForLiterals(profile.root, literalsFrom('bob', undefined)).findings
        ).toEqual([])
        expect(literalsFrom('  ', '')).toEqual([])
      } finally {
        profile.dispose()
      }
    })

    it('a planted cookie of any name fails, REDACTED values and set-cookie attributes do not', () => {
      expect(findViolations('["Cookie","tracker=abc123"]')).toEqual([
        'cookie header value of any name'
      ])
      expect(findViolations('["Cookie","a=REDACTED; tracker=abc123"]')).toEqual(
        ['cookie header value of any name']
      )
      expect(findViolations('["Cookie","a=REDACTED; b=REDACTED"]')).toEqual([])
      expect(
        findViolations('["set-cookie","tracker=abc123; Path=/; HttpOnly"]')
      ).toEqual(['cookie header value of any name'])
      expect(
        findViolations('["set-cookie","tracker=REDACTED; Path=/; Secure"]')
      ).toEqual([])
    })
  })

  it('an empty fixture tree fails the floor', () => {
    expect(() =>
      assertAtOrAboveFloor('Phase 94 Humble fixtures scanned', 0, FILE_FLOOR)
    ).toThrow(/below the floor/)
  })

  describe('planted negatives: each rule fails on a planted value and passes on its safe form', () => {
    it('a planted cookie value fails, REDACTED does not', () => {
      expect(findViolations('"_simpleauth_sess=abc123"')).toEqual([
        'cookie value'
      ])
      expect(findViolations('"ory_session_slug=abc123; Path=/"')).toEqual([
        'cookie value'
      ])
      expect(findViolations('"_simpleauth_sess=REDACTED"')).toEqual([])
    })

    it('a planted CSRF token header fails, REDACTED does not', () => {
      expect(findViolations('["X-CSRF-Token", "tok123"]')).toEqual([
        'CSRF or authorization header value'
      ])
      expect(findViolations('["X-CSRF-Token", "REDACTED"]')).toEqual([])
    })

    it('a planted gamekey in a path or field fails, REDACTED and a synthetic id do not', () => {
      expect(findViolations('"/home/library/AbCdEfGhIjKlMnOp"')).toEqual([
        'gamekey in a path'
      ])
      expect(findViolations('"/home/library/REDACTED"')).toEqual([])
      expect(findViolations('"/home/library?page=2"')).toEqual([])
      expect(findViolations('{"gamekey": "AbCdEfGhIjKlMnOp"}')).toEqual([
        'gamekey field'
      ])
      expect(findViolations('{"gameKey": "REDACTED"}')).toEqual([])
      expect(findViolations('{"gamekey": "order-real-redeemed"}')).toEqual([])
      expect(
        findViolations('1:"{\\"gameKey\\":\\"AbCdEfGhIjKlMnOp\\"}"')
      ).toEqual(['gamekey field'])
    })

    it('a planted key value fails, REDACTED, empty and non-strings do not', () => {
      expect(
        findViolations('{"redeemed_key_val": "AAAAA-BBBBB-CCCCC"}')
      ).toEqual(['key value field'])
      expect(findViolations('{"key": "AAAAA-BBBBB-CCCCC"}')).toEqual([
        'key value field'
      ])
      expect(findViolations('{"redeemed_key_val": "REDACTED"}')).toEqual([])
      expect(findViolations('{"redeemed_key_val": null}')).toEqual([])
      expect(findViolations('{"redeemed_key_value": ""}')).toEqual([])
    })

    it('a planted email or account name fails, REDACTED does not', () => {
      expect(findViolations('{"email": "someone@example.test"}')).toEqual([
        'account name field',
        'email address'
      ])
      expect(findViolations('{"username": "someone"}')).toEqual([
        'account name field'
      ])
      expect(
        findViolations('{"email": "REDACTED", "username": "REDACTED"}')
      ).toEqual([])
    })

    it('a planted Cloudflare block page fails by its markers, and never by a dotted quad or the word alone', () => {
      const footer =
        '<span class="cf-footer-item">Your IP: <span id="cf-footer-ip">203.0.113.7</span></span> ' +
        '<span class="cf-footer-item">Cloudflare Ray ID: <strong>8c1f2e3d4a5b6c7d</strong></span>'
      expect(findViolations(footer)).toEqual(['Cloudflare block page'])
      expect(
        findViolations(
          '<div id="cf-error-details" class="cf-error-details-wrapper">'
        )
      ).toEqual(['Cloudflare block page'])
      expect(findViolations('Cloudflare Ray ID: abc')).toEqual([
        'Cloudflare block page'
      ])
      // Each marker alone is enough.
      expect(findViolations('<span id="cf-footer-ip">x</span>')).toEqual([
        'Cloudflare block page'
      ])
      expect(findViolations('Your IP address is blocked')).toEqual([
        'Cloudflare block page'
      ])
      // Not markers: a bare dotted quad, SVG path data that reads like one, the word Cloudflare
      // in a script, and the page title a synthetic access-denied fixture may carry.
      expect(findViolations('203.0.113.7')).toEqual([])
      expect(findViolations('<path d="M10.5.25.75.125 3 4.5.6.7z"/>')).toEqual(
        []
      )
      expect(
        findViolations('"cdn-cgi/challenge-platform" // Cloudflare')
      ).toEqual([])
      expect(
        findViolations('<title>Attention Required! | Cloudflare</title>')
      ).toEqual([])
    })

    it('a planted block page in a walked tree is found and named without its address', () => {
      const profile = createFakeHomeProfile({ prefix: 'gamelib-redaction-' })
      try {
        const root = join(profile.root, 'fixtures')
        mkdirSync(join(root, 'recorded', 'real', 'sync'), { recursive: true })
        writeFileSync(
          join(root, 'recorded', 'real', 'sync', 'body-37.html'),
          '<title>Attention Required! | Cloudflare</title>Your IP: 203.0.113.7 Cloudflare Ray ID: 8c1f'
        )
        writeFileSync(
          join(root, 'recorded', 'real', 'sync', 'body-1.json'),
          '{"ok":true}'
        )
        const { files, offenders } = scanTree(root)
        expect(files).toBe(2)
        expect(offenders).toEqual([
          'recorded/real/sync/body-37.html: Cloudflare block page'
        ])
        expect(offenders.join()).not.toContain('203.0.113.7')
      } finally {
        profile.dispose()
      }
    })

    it('a planted /Users/<name> path fails, a placeholder does not', () => {
      expect(findViolations('"/Users/alice/Library/x"')).toEqual([
        'macOS home path'
      ])
      expect(findViolations('"<HOME>/Library/x"')).toEqual([])
    })

    it('a planted C:\\Users\\<name> path fails raw and JSON-escaped, a placeholder does not', () => {
      expect(findViolations('C:\\Users\\carol\\AppData')).toEqual([
        'Windows home path'
      ])
      expect(findViolations('"C:\\\\Users\\\\carol\\\\AppData"')).toEqual([
        'Windows home path'
      ])
      expect(findViolations('"<USERDATA>\\\\x"')).toEqual([])
    })

    it('a planted fixture in a walked tree is found and named without its value', () => {
      const profile = createFakeHomeProfile({ prefix: 'gamelib-redaction-' })
      try {
        const root = join(profile.root, 'fixtures')
        const bad = join(root, 'recorded', 's', 'c', 'exchanges.json')
        mkdirSync(dirname(bad), { recursive: true })
        writeFileSync(bad, '[["Cookie","_simpleauth_sess=hunter2"]]')
        writeFileSync(
          join(root, 'recorded', 's', 'c', 'ok.json'),
          '[["Cookie","_simpleauth_sess=REDACTED"]]'
        )
        const { files, offenders } = scanTree(root)
        expect(files).toBe(2)
        // Both rules name it: the specific cookie rule and the any-name cookie header rule.
        expect(offenders).toEqual([
          'recorded/s/c/exchanges.json: cookie value',
          'recorded/s/c/exchanges.json: cookie header value of any name'
        ])
        expect(offenders.join()).not.toContain('hunter2')
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
