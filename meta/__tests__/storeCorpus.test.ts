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

import {
  createMigrations,
  STORE_MIGRATIONS
} from '../../src/backend/storeMigrations'
import {
  CHAIN_CURRENT,
  CORPUS_DIR,
  GAMEKEY_PREFIX_RE,
  isDenylistedKey,
  isPlaceholder,
  serialise,
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
const FLAVOURS: readonly Flavour[] = ['store', 'settings']

/** Sources every complete corpus must carry. Task-by-task the harvester adds to it; see NOTES.md. */
const REQUIRED_SOURCES: readonly string[] = ['operator']

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
  'etag'
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
  if (BEARER_RE.test(text)) return 'bearer token'
  if (COOKIE_RE.test(text)) return 'cookie'
  if (
    text.length >= 40 &&
    !HASH_KEYS.has(key.toLowerCase()) &&
    (HEX_RUN_RE.test(text) ||
      (BASE64_RUN_RE.test(text) && !PATH_LIKE_RE.test(text)))
  ) {
    return `long hex/base64 run (${text.length} chars) under "${key}"`
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
    for (const source of REQUIRED_SOURCES) {
      expect({ source, present: source in manifest.counts }).toEqual({
        source,
        present: true
      })
    }
  })

  it('describes every entry with a known flavour and outcome, a table key and a path under its source', () => {
    for (const f of manifest.files) {
      expect(FLAVOURS).toContain(f.flavour)
      expect(EXPECTS).toContain(f.expect)
      expect(f.tableKey.length).toBeGreaterThan(0)
      expect(f.path.startsWith(`${f.source}/`)).toBe(true)
    }
  })

  it('stores every harvested file in exactly the bytes TS writes for its flavour', () => {
    const harvested = (f: ManifestEntry) =>
      f.source !== 'edge' && f.expect !== 'missing'
    const off: string[] = []
    for (const f of manifest.files.filter(harvested)) {
      const text = readFileSync(join(CORPUS_DIR, f.path), 'utf8')
      if (serialise(JSON.parse(text), f.flavour) !== text) off.push(f.path)
    }
    expect(off).toEqual([])
  })
})

describe('store corpus chain table', () => {
  it('agrees with the TS migration registry', () => {
    const runner = createMigrations()
    const keys = new Set([
      ...Object.keys(STORE_MIGRATIONS),
      ...Object.keys(CHAIN_CURRENT)
    ])
    const rows: Record<string, number> = {}
    for (const k of keys) rows[k] = runner.currentVersionOf(k)
    for (const [k, v] of Object.entries(rows)) {
      expect({ key: k, version: CHAIN_CURRENT[k] ?? 1 }).toEqual({
        key: k,
        version: v
      })
    }
  })
})

// ---- redaction -------------------------------------------------------------------------------------------------

describe('store corpus redaction', () => {
  const username = userInfo().username

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
    expect(scanDocument({ a: 'Zm9v'.repeat(12) }, username)).toHaveLength(1)
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
