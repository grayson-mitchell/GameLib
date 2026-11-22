/**
 * The Phase 85 store corpus (D-09) cannot pass vacuously and carries no account data.
 *
 * MANIFEST.json pins every corpus file by sha256 together with its source, flavour and expected outcome, and a floor.
 * This suite fails when a listed file is absent, an unlisted file exists, a hash differs, the count falls below the
 * floor, or a source has no files. It also scans every committed value for the shapes account data takes (tokens, JWTs,
 * cookies, ciphertext, long hex or base64 runs, SteamID64s, emails, Humble gamekeys, the OS account name) and checks that
 * every denylisted key holds its placeholder. The scan is written here, independently of the harvester's redaction, so a
 * harvester that leaks cannot also hide the leak from the test.
 */
import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { userInfo } from 'os'
import { join, relative, sep } from 'path'

import { buildStoreTable } from '../genStoreTable'
import {
  CHAIN_CURRENT,
  CORPUS_DIR,
  expectFor,
  flavourOf,
  GAMEKEY_PREFIX_RE,
  PASTE_URL_RE,
  isDenylistedKey,
  isPlaceholder,
  newRedactionContext,
  redactValue,
  serialise,
  tableKeyOf,
  type Expect,
  type Flavour,
  type Manifest,
  type ManifestEntry
} from '../harvestStoreCorpus'

const EXPECTS: readonly Expect[] = [
  'roundtrip',
  'migrate',
  'readOnly-failed',
  'readOnly-newer',
  'startEmpty',
  'missing'
]
/** A source's top-level directory under corpus/: the backups live in `backups/`, every other source in its own name. */
const sourceDir = (source: string): string =>
  source === 'backup' ? 'backups' : source
const FLAVOURS: readonly Flavour[] = ['store', 'settings']

/** Sources every complete corpus must carry. Task-by-task the harvester adds to it; see NOTES.md. */
const REQUIRED_SOURCES: readonly string[] = ['operator', 'backup', 'edge']

/** Keys that legitimately hold a long hex or base64-looking string (content hashes and build ids). */
const HASH_KEYS = new Set([
  'sha',
  'sha1',
  'sha256',
  'hash',
  'checksum',
  'buildid',
  'build_id',
  'md5',
  'etag',
  // GOG catalogue content ids (40 hex chars): public database identifiers, not credentials.
  'external_id'
])

const manifest = JSON.parse(
  readFileSync(join(CORPUS_DIR, 'MANIFEST.json'), 'utf8')
) as Manifest

function corpusFiles(dir: string = CORPUS_DIR): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) out.push(...corpusFiles(abs))
    else out.push(relative(CORPUS_DIR, abs).split(sep).join('/'))
  }
  return out
}

// ---- the redaction scan -----------------------------------------------------------------------------------------

const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}/
const CIPHERTEXT_RE = /(steam|humble):v1:/
const HEX_RUN_RE = /^[A-Fa-f0-9]+$/
const BASE64_RUN_RE = /^[A-Za-z0-9+/=_-]+$/
/** Bits per character of `text`; random base64 sits near 5, a slug or an identifier name well under 4.3. */
function shannonEntropy(text: string): number {
  const counts = new Map<string, number>()
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let bits = 0
  for (const n of counts.values()) {
    const p = n / text.length
    bits -= p * Math.log2(p)
  }
  return bits
}

/** Share of the letters in `text` that are vowels: about 0.38 in English-derived identifiers, about 0.19 in random base64. */
function vowelShare(text: string): number {
  const letters = text.match(/[A-Za-z]/g) ?? []
  const vowels = letters.filter((c) => 'aeiouAEIOU'.includes(c))
  return letters.length === 0 ? 0 : vowels.length / letters.length
}

/**
 * A 40+ char run of base64-alphabet characters that reads as random: not a path, mixed letters and digits in both cases,
 * high entropy and few vowels. Game titles in PascalCase, kebab-case slugs and SHOUTING_CASE interface names share the alphabet and
 * have none of that.
 */
function looksLikeBase64Secret(text: string): boolean {
  return (
    BASE64_RUN_RE.test(text) &&
    !PATH_LIKE_RE.test(text) &&
    /\d/.test(text) &&
    /[a-z]/.test(text) &&
    /[A-Z]/.test(text) &&
    shannonEntropy(text) >= 4.4 &&
    vowelShare(text) <= 0.3
  )
}

/** An absolute path is a long run of base64 characters only by accident: it starts at the root and has depth. */
const PATH_LIKE_RE = /^\/[^/]+\/[^/]+\//
const STEAMID64_RE = /7656119\d{10}/
const EMAIL_RE = /[^\s@"]+@[^\s@"]+\.[A-Za-z]{2,}/
const BEARER_RE = /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/i
const COOKIE_RE = /(^|[;\s])(sessionid|steamLoginSecure|sid|csrf[_-]?token)=/i

/** Account data in a value (a leaf), or `null`. `key` is the property the value sits under, for the hash allow-list. */
function leakInString(
  text: string,
  key: string,
  username: string
): string | null {
  if (JWT_RE.test(text)) return 'JWT'
  if (CIPHERTEXT_RE.test(text)) return 'steam:v1: / humble:v1: ciphertext'
  if (STEAMID64_RE.test(text)) return 'SteamID64'
  if (EMAIL_RE.test(text)) return 'email'
  if (PASTE_URL_RE.test(text)) return 'live paste link'
  if (BEARER_RE.test(text)) return 'bearer token'
  if (COOKIE_RE.test(text)) return 'cookie'
  if (text.length >= 40 && !HASH_KEYS.has(key.toLowerCase())) {
    if (HEX_RUN_RE.test(text)) {
      return `long hex run (${text.length} chars) under "${key}"`
    }
    if (looksLikeBase64Secret(text)) {
      return `long base64 run (${text.length} chars) under "${key}"`
    }
  }
  if (
    username.length >= 5 &&
    text.toLowerCase().includes(username.toLowerCase())
  ) {
    return 'the OS account name'
  }
  return null
}

/** Every finding in a parsed document: `<json path>: <reason>`. Empty when clean. */
function scanDocument(value: unknown, username: string): string[] {
  const findings: string[] = []
  const walk = (v: unknown, path: string, key: string): void => {
    if (typeof v === 'string') {
      const leak = leakInString(v, key, username)
      if (leak) findings.push(`${path}: ${leak}`)
      return
    }
    if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`, key))
      return
    }
    if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        const here = `${path}.${k}`
        if (isDenylistedKey(k) && !isPlaceholder(x)) {
          findings.push(
            `${here}: denylisted key holds a value, not the placeholder`
          )
          continue
        }
        if (GAMEKEY_PREFIX_RE.test(k) && !k.startsWith('GKREDACTED')) {
          findings.push(`${here}: key starts with a Humble gamekey`)
        }
        const kLeak = leakInString(k, '', username)
        if (kLeak) findings.push(`${here}: key name: ${kLeak}`)
        walk(x, here, k)
      }
    }
  }
  walk(value, '$', '')
  return findings
}

/** A file that is not a JSON document (a deliberately corrupt edge case) is scanned as raw text instead. */
function scanRawText(text: string, username: string): string[] {
  const findings: string[] = []
  if (JWT_RE.test(text)) findings.push('raw: JWT')
  if (CIPHERTEXT_RE.test(text)) findings.push('raw: ciphertext prefix')
  if (/[A-Fa-f0-9]{40,}/.test(text)) findings.push('raw: long hex run')
  if (
    username.length >= 5 &&
    text.toLowerCase().includes(username.toLowerCase())
  ) {
    findings.push('raw: the OS account name')
  }
  return findings
}

function scanFile(relPath: string, username: string): string[] {
  const text = readFileSync(join(CORPUS_DIR, relPath), 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return scanRawText(text, username)
  }
  return scanDocument(parsed, username)
}

// ---- manifest --------------------------------------------------------------------------------------------------

describe('store corpus manifest', () => {
  const listed = manifest.files.filter((f) => f.expect !== 'missing')
  const onDisk = corpusFiles().filter(
    (p) => p !== 'MANIFEST.json' && p !== 'NOTES.md'
  )

  it('lists every file and every listed file exists with its pinned hash', () => {
    const missing: string[] = []
    const wrong: string[] = []
    for (const f of listed) {
      const abs = join(CORPUS_DIR, f.path)
      if (!existsSync(abs)) {
        missing.push(f.path)
        continue
      }
      const sha = createHash('sha256').update(readFileSync(abs)).digest('hex')
      if (sha !== f.sha256) wrong.push(f.path)
    }
    expect({ missing, wrong }).toEqual({ missing: [], wrong: [] })
  })

  it('has no file under corpus/ that the manifest does not list', () => {
    const known = new Set(listed.map((f) => f.path))
    expect(onDisk.filter((p) => !known.has(p))).toEqual([])
  })

  it('lists a missing-file entry with no hash and no file on disk', () => {
    for (const f of manifest.files.filter((x) => x.expect === 'missing')) {
      expect({ path: f.path, sha256: f.sha256 }).toEqual({
        path: f.path,
        sha256: null
      })
      expect(existsSync(join(CORPUS_DIR, f.path))).toBe(false)
    }
  })

  it('meets its floor, which is the committed file count', () => {
    expect(manifest.files.length).toBeGreaterThanOrEqual(manifest.floor)
    expect(manifest.floor).toBe(listed.length)
    expect(manifest.floor).toBeGreaterThan(0)
  })

  it('has per-source counts that match the files and no source with zero files', () => {
    const actual: Record<string, number> = {}
    for (const f of manifest.files)
      actual[f.source] = (actual[f.source] ?? 0) + 1
    expect(manifest.counts).toEqual(actual)
    for (const [source, n] of Object.entries(manifest.counts)) {
      expect({ source, n: n > 0 }).toEqual({ source, n: true })
    }
    // At least one tagged release must have built and booted (the others may fail and be recorded in `failures`).
    expect(
      Object.keys(manifest.counts).filter((s) => /^v0\.\d+$/.test(s)).length
    ).toBeGreaterThan(0)
    for (const source of REQUIRED_SOURCES) {
      expect({ source, present: source in manifest.counts }).toEqual({
        source,
        present: true
      })
    }
  })

  it('covers every outcome the Rust engine must produce, and both byte flavours', () => {
    for (const e of EXPECTS) {
      expect({
        expect: e,
        present: manifest.files.some((f) => f.expect === e)
      }).toEqual({
        expect: e,
        present: true
      })
    }
    for (const fl of FLAVOURS) {
      expect({
        flavour: fl,
        present: manifest.files.some((f) => f.flavour === fl)
      }).toEqual({
        flavour: fl,
        present: true
      })
    }
  })

  it('describes every entry with a known flavour and outcome, a table key and a path under its source', () => {
    for (const f of manifest.files) {
      expect(FLAVOURS).toContain(f.flavour)
      expect(EXPECTS).toContain(f.expect)
      expect(f.tableKey.length).toBeGreaterThan(0)
      expect(f.path.startsWith(`${sourceDir(f.source)}/`)).toBe(true)
    }
  })

  it('stores every harvested file in exactly the bytes TS writes for its flavour', () => {
    // Redacted sources are re-serialised by the harvester. Tag files are raw bytes as that release wrote them and edge files
    // are hand-built, so neither is held to the current flavour.
    const harvested = (f: ManifestEntry) =>
      f.source === 'operator' || f.source === 'backup'
    const off: string[] = []
    for (const f of manifest.files.filter(harvested)) {
      const text = readFileSync(join(CORPUS_DIR, f.path), 'utf8')
      if (serialise(JSON.parse(text), f.flavour) !== text) off.push(f.path)
    }
    expect(off).toEqual([])
  })
})

describe('store corpus chain table', () => {
  // 85-24: the TS migration registry this was checked against is deleted. The store table's
  // `chainVersions` (meta/genStoreTable.ts, compared with the committed storeTable.json by
  // storeTable.test.ts) is held equal to the shell's `Chains::baseline` by cargo
  // (`table_chain_versions_equal_the_shell_chains`), so CHAIN_CURRENT is checked against that.
  it('agrees with the store table chain versions (the shell chains)', () => {
    const { chainVersions } = buildStoreTable()
    // Not vacuous: the two settings chains and the seven library chains.
    expect(Object.keys(chainVersions)).toHaveLength(9)
    const keys = new Set([
      ...Object.keys(chainVersions),
      ...Object.keys(CHAIN_CURRENT)
    ])
    for (const k of keys) {
      expect({ key: k, version: CHAIN_CURRENT[k] ?? 1 }).toEqual({
        key: k,
        version: chainVersions[k] ?? 1
      })
    }
  })
})

// ---- redaction -------------------------------------------------------------------------------------------------

describe('store corpus redaction', () => {
  // The account-name check guards the HARVESTING operator's name, so it is meaningful only on the operator's own
  // machine. On a GitHub-hosted runner the OS account is the runner's own, `runner`, which is not the operator's
  // name and is also a GameLib domain key (`runner: 'gog'`), so every store file matched it (85-19 CI, run
  // 44978826083). There the check is disabled (an empty name is below the 5-character floor); every other scan runs.
  const username =
    process.env.GITHUB_ACTIONS === 'true' ? '' : userInfo().username

  it('finds no account data in any committed file', () => {
    const findings: Record<string, string[]> = {}
    for (const f of manifest.files.filter((x) => x.expect !== 'missing')) {
      const hit = scanFile(f.path, username)
      if (hit.length > 0) findings[f.path] = hit.slice(0, 5)
    }
    expect(findings).toEqual({})
  })

  it('self-test: the scan fails on a planted JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.c2ln'
    expect(scanDocument({ note: jwt }, username)).toEqual([
      expect.stringContaining('JWT')
    ])
  })

  it('self-test: the scan fails on a planted ciphertext prefix', () => {
    expect(scanDocument({ blob: 'steam:v1:AAAAAAAAAAAA' }, username)).toEqual([
      expect.stringContaining('ciphertext')
    ])
    expect(scanDocument({ blob: 'humble:v1:AAAAAAAAAAAA' }, username)).toEqual([
      expect.stringContaining('ciphertext')
    ])
  })

  it('self-test: the scan fails on a denylisted key that holds a value and passes on its placeholder', () => {
    expect(scanDocument({ refreshToken: 'abc' }, username)).toEqual([
      expect.stringContaining('denylisted key')
    ])
    expect(scanDocument({ refreshToken: 'REDACTED' }, username)).toEqual([])
    expect(scanDocument({ cookies: [] }, username)).toEqual([])
  })

  it('self-test: the scan fails on long hex and base64 runs, a SteamID64, an email and a gamekey key', () => {
    expect(scanDocument({ a: 'a'.repeat(40) }, username)).toHaveLength(1)
    expect(
      scanDocument(
        { a: 'q7Hk2LpX9sRt4WzC8vNb1MyJ5dFg3aEu6oQi0TxZcBnVmKjA' },
        username
      )
    ).toHaveLength(1)
    expect(
      scanDocument(
        { a: 'PhoenixPointCompleteEditionAudienceUpgrade' },
        username
      )
    ).toEqual([])
    expect(
      scanDocument({ a: 'STEAMUNIFIEDMESSAGES_INTERFACE_VERSION001' }, username)
    ).toEqual([])
    expect(scanDocument({ sha256: 'a'.repeat(64) }, username)).toEqual([])
    expect(scanDocument({ a: 'x 76561197960287930 y' }, username)).toHaveLength(
      1
    )
    expect(scanDocument({ a: 'someone@example.com' }, username)).toHaveLength(1)
    expect(
      scanDocument({ '2MqyBhd5ew2en7xx:game_choice': 1 }, username)
    ).toHaveLength(1)
    expect(
      scanDocument({ 'GKREDACTED000001:game_choice': 1 }, username)
    ).toEqual([])
    expect(
      scanDocument({ 'https://dpaste.com/AAAAAAAAA': { name: 'x' } }, username)
    ).toHaveLength(1)
    expect(
      scanDocument({ u: 'https://pastebin.com/AAAAAAAA' }, username)
    ).toHaveLength(1)
    expect(
      scanDocument(
        { 'https://paste.invalid/PASTEREDACTED000001': { name: 'x' } },
        username
      )
    ).toEqual([])
  })

  it('self-test: the scan catches the OS account name in a value and in a key', () => {
    expect(
      scanDocument({ p: '/Users/zorbalicious/Games' }, 'zorbalicious')
    ).toHaveLength(1)
    expect(
      scanDocument({ '/Users/zorbalicious': 1 }, 'zorbalicious')
    ).toHaveLength(1)
  })
})

// ---- the harvester's own redaction and expectations ---------------------------------------------------------------

describe('harvester redactValue', () => {
  const ctx = () => newRedactionContext('zorbalicious')

  it('replaces a denylisted key by a same-type placeholder and keeps key names and shape', () => {
    const input = {
      refreshToken: 'abc',
      userId: 7,
      isLoggedIn: true,
      session: false,
      cookies: ['a', 'b'],
      userData: { username: 'someone', steamId: '123', keep: 'me' },
      tokens: { access: 'x', nested: { n: 9 } },
      steamGridDbApiKey: 'k',
      emptyKey: { email: '' }
    }
    expect(redactValue([], input, ctx())).toEqual({
      refreshToken: 'REDACTED',
      userId: 0,
      isLoggedIn: true,
      session: false,
      cookies: [],
      userData: { username: 'REDACTED', steamId: 'REDACTED', keep: 'me' },
      tokens: { access: 'REDACTED', nested: { n: 0 } },
      steamGridDbApiKey: 'REDACTED',
      emptyKey: { email: '' }
    })
  })

  it('redacts ciphertext, JWTs, SteamID64s and emails wherever they sit and keeps ordinary strings', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.c2ln'
    expect(
      redactValue(
        [],
        {
          a: 'steam:v1:AAAA',
          b: ['humble:v1:BBBB', jwt],
          c: {
            d: '76561197960287930',
            e: 'someone@example.com',
            f: 'plain text'
          }
        },
        ctx()
      )
    ).toEqual({
      a: 'REDACTED',
      b: ['REDACTED', 'REDACTED'],
      c: { d: 'REDACTED', e: 'REDACTED', f: 'plain text' }
    })
  })

  it('denylists the documented secret key names and redacts account shapes embedded in a string or a key (C-WR-04)', () => {
    for (const key of [
      'sessionCookie',
      'csrfToken',
      'authToken',
      'idToken',
      'sessionToken',
      'loginToken',
      'bearer',
      'oauth'
    ]) {
      expect(isDenylistedKey(key)).toBe(true)
      expect(redactValue([], { [key]: 'abcdefghijklmnop' }, ctx())).toEqual({
        [key]: 'REDACTED'
      })
    }
    // `author` is not an auth secret.
    expect(isDenylistedKey('author')).toBe(false)
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.c2ln'
    const out = redactValue(
      [],
      {
        url: 'https://x.test/u/76561197960287930/inventory',
        note: 'mail someone@example.com about it',
        header: `Bearer ${jwt}`,
        'who someone@example.com': 1
      },
      ctx()
    ) as Record<string, unknown>
    expect(out).toEqual({
      url: 'https://x.test/u/REDACTED/inventory',
      note: 'mail REDACTED about it',
      header: 'Bearer REDACTED',
      'who REDACTED': 1
    })
  })

  it('keeps a __proto__ key as an own key instead of setting the prototype (C-WR-05)', () => {
    const parsed = JSON.parse('{"__proto__":{"a":"secret"},"b":1}') as unknown
    const out = redactValue([], parsed, ctx()) as Record<string, unknown>
    expect(Object.keys(out)).toEqual(['__proto__', 'b'])
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
    expect(JSON.stringify(out)).toBe('{"__proto__":{"a":"secret"},"b":1}')
  })

  it('replaces the OS account name in values and key names, case-insensitively', () => {
    expect(
      redactValue(
        [],
        { '/Users/Zorbalicious/x': '/Users/zorbalicious/Games' },
        ctx()
      )
    ).toEqual({ '/Users/operator/x': '/Users/operator/Games' })
  })

  it('renames a Humble gamekey prefix to a stable placeholder and keeps the product part', () => {
    const c = ctx()
    const out = redactValue(
      [],
      {
        '2MqyBhd5ew2en7xx:game_choice': 1,
        '5rpen7H55yPCVwY2:other_choice': 2,
        __timestamp: { '2MqyBhd5ew2en7xx:game_choice': 'x' }
      },
      c
    ) as Record<string, unknown>
    expect(Object.keys(out)).toEqual([
      'GKREDACTED000001:game_choice',
      'GKREDACTED000002:other_choice',
      '__timestamp'
    ])
    expect(out.__timestamp).toEqual({ 'GKREDACTED000001:game_choice': 'x' })
  })
})

describe('harvester flavour, table key and expected outcome', () => {
  it('maps paths to flavours and table keys', () => {
    expect(flavourOf('config.json')).toBe('settings')
    expect(flavourOf('GamesConfig/1.json')).toBe('settings')
    expect(flavourOf('store/config.json')).toBe('store')
    expect(tableKeyOf('config.json')).toBe('settings/global')
    expect(tableKeyOf('GamesConfig/1.json')).toBe('settings/game')
    expect(tableKeyOf('store_cache/steam_library.json')).toBe(
      'store_cache/steam_library'
    )
  })

  it('derives expect from the stored version against the chain', () => {
    const stamp = (v: number) => ({
      __internal__: { gamelib: { schemaVersion: v } }
    })
    // steam_library: chain current 3
    expect(expectFor('store', 'store_cache/steam_library', stamp(3))).toBe(
      'roundtrip'
    )
    expect(expectFor('store', 'store_cache/steam_library', stamp(2))).toBe(
      'migrate'
    )
    expect(expectFor('store', 'store_cache/steam_library', {})).toBe('migrate')
    expect(expectFor('store', 'store_cache/steam_library', stamp(9))).toBe(
      'readOnly-newer'
    )
    // baseline 1: an unstamped file is adopted in place, nothing written
    expect(expectFor('store', 'store/timestamp', {})).toBe('roundtrip')
    expect(expectFor('store', 'store/timestamp', stamp(2))).toBe(
      'readOnly-newer'
    )
    // settings: global current v2
    expect(expectFor('settings', 'settings/global', { version: 'v2' })).toBe(
      'roundtrip'
    )
    expect(expectFor('settings', 'settings/global', { version: 'v1' })).toBe(
      'migrate'
    )
    expect(expectFor('settings', 'settings/game', {})).toBe('migrate')
    expect(expectFor('settings', 'settings/global', { version: 'v9' })).toBe(
      'readOnly-newer'
    )
  })
})
