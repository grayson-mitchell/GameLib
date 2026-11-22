/**
 * Harvester for the Phase 85 store corpus (D-09): real files, redacted, pinned by hash, that the Rust store's roundtrip
 * and migration tests run over.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 meta/harvestStoreCorpus.ts <subcommand> ...
 *
 *   operator <profileDir> [--only <relpath>...]   redacted copy of the live operator profile (read only)
 *   backups <profileDir>                          redacted copies of the profile's `*.bak.json` pre-migration captures
 *   tag <v0.8|v0.9|v0.10> [--scratch <dir>]       the files a tagged release writes on a cold boot in a fake HOME
 *   edge                                          the hand-built edge cases (corrupt, BOM, CRLF, newer, missing, ...)
 *
 * Everything lands under CORPUS_DIR, and MANIFEST.json lists every file with its sha256, source, flavour and the outcome
 * the Rust engine is expected to produce (`expect`). `meta/__tests__/storeCorpus.test.ts` fails when the tree and the
 * manifest disagree, when the count falls below the floor, or when a committed value looks like account data.
 *
 * Redaction keeps the JSON shape and the file's byte flavour: the redacted document is re-serialised exactly as the TS
 * store would write it (`JSON.stringify(v, undefined, '\t')` for conf stores, `JSON.stringify(v, null, 2)` for settings
 * documents, no trailing newline), so a file that round-trips in Rust is compared against bytes TS itself would produce.
 */
import { spawn, spawnSync } from 'child_process'
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir, userInfo } from 'os'
import { dirname, join, resolve } from 'path'

import { createFakeHomeProfile } from '../src/backend/testUtils/fakeHomeProfile'

// The script is bundled into a private temp dir by meta/runTs.cjs, so `__dirname` is not the repo: resolve from the
// working directory, which is the repo root for every run (`pnpm` and the jest rootDir alike).
export const CORPUS_DIR = resolve(
  process.cwd(),
  'src-tauri',
  'crates',
  'gamelib-store',
  'tests',
  'fixtures',
  'corpus'
)

export type Flavour = 'store' | 'settings'

export type Expect =
  | 'roundtrip'
  | 'migrate'
  | 'readOnly-failed'
  | 'readOnly-newer'
  | 'startEmpty'
  | 'missing'

export interface ManifestEntry {
  path: string
  sha256: string | null
  source: string
  flavour: Flavour
  expect: Expect
  tableKey: string
  note?: string
}

export interface Manifest {
  floor: number
  counts: Record<string, number>
  /** A tag whose build or boot failed, with the exact error. Such a tag contributes no files. */
  failures?: Record<string, string>
  files: ManifestEntry[]
}

/**
 * Current version of every chain the shell runs (`gamelib-store` `Chains::baseline`), keyed by chain key. A chain key
 * absent here sits at the baseline version 1. `storeCorpus.test.ts` checks this table against the store table's
 * `chainVersions`, which cargo holds equal to the shell's chains, so it cannot drift (85-24; it was checked against
 * the TS migration registry until that was deleted).
 */
export const CHAIN_CURRENT: Readonly<Record<string, number>> = {
  'settings/global': 2,
  'settings/game': 2,
  'store_cache/steam_library': 3,
  'store_cache/gog_library': 3,
  'gog_store/installed': 3,
  'store_cache/legendary_library': 3,
  'store_cache/nile_library': 3,
  'sideload_apps/library': 3,
  'store/download-manager': 3
}

/** Directories (directly under the profile) whose `*.json` files are conf stores. */
const STORE_DIRS = [
  'store',
  'store_cache',
  'gog_store',
  'nile_store',
  'legendary_store',
  'steam_store',
  'humble_store',
  'sideload_apps'
] as const

/**
 * Paths GameLib does not own, never copied: gog_store/auth.json belongs to gogdl, nile_config/** to nile and
 * legendaryConfig/** to legendary. The first is also where the real GOG session tokens live.
 */
const EXCLUDED_PATHS = [
  'gog_store/auth.json',
  'nile_config/**',
  'legendaryConfig/**'
] as const

/** A backup the versioning engine wrote: `<name>.v<from>.<stamp>.bak.json`, or a hand copy `<name>.v<N>.<tag>.json`. */
const BACKUP_RE = /^(.+)\.v(\d+)\.(.+)\.json$/

// ---------------------------------------------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------------------------------------------

/**
 * Key names (compared case-insensitively) whose value is replaced by a same-type placeholder, plus the patterns in
 * DENY_KEY_PATTERNS. `steamid` is here on purpose even though some caches use it for a plain app id: over-redacting an
 * app id costs nothing a roundtrip test needs, under-redacting a SteamID64 leaks an account.
 */
const DENY_KEYS = new Set(
  [
    'refreshToken',
    'token',
    'tokens',
    'accessToken',
    'access_token',
    'refresh_token',
    'password',
    'cookie',
    'cookies',
    'session',
    'session_id',
    'csrf',
    'username',
    'accountName',
    'account_name',
    'email',
    'steamId',
    'steamid',
    'userId',
    'user_id',
    'galaxyUserId',
    'displayName',
    'avatar',
    'cmLogonId'
  ].map((k) => k.toLowerCase())
)

const DENY_KEY_PATTERNS: readonly RegExp[] = [
  /api[_-]?key/i,
  /secret/i,
  /passw(or)?d/i,
  /credential/i,
  // The secret key names this codebase documents (`sessionCookie`, `csrfToken` of the Humble store,
  // `authToken`, `idToken`, `loginToken`): a plaintext value under one of them must not reach a public repo.
  /token/i,
  /cookie/i,
  /csrf/i,
  /session/i,
  /auth(?!or)/i,
  /bearer/i
]

export function isDenylistedKey(key: string): boolean {
  return (
    DENY_KEYS.has(key.toLowerCase()) ||
    DENY_KEY_PATTERNS.some((re) => re.test(key))
  )
}

const PLACEHOLDER = 'REDACTED'

/**
 * `target[key] = value` for an arbitrary key. A plain assignment of `__proto__` (which `JSON.parse` can produce as an
 * own key) sets the prototype instead and the key vanishes from `Object.entries` and `JSON.stringify`; defining the
 * property keeps it, as the shape of the real file requires.
 */
function setOwn(
  target: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  })
}

/** A value of the same JSON type with nothing in it: strings, numbers and booleans flatten, objects keep their keys. */
function placeholderOf(value: unknown): unknown {
  // An empty string holds nothing to hide, and keeping it keeps the real default shape (`steamGridDbApiKey: ""`).
  if (typeof value === 'string') return value === '' ? '' : PLACEHOLDER
  if (typeof value === 'number') return 0
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return []
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) setOwn(out, k, placeholderOf(v))
    return out
  }
  return value
}

/** True when `value` is what placeholderOf would have produced for its type. */
export function isPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return value === PLACEHOLDER || value === ''
  if (typeof value === 'number') return value === 0
  if (typeof value === 'boolean') return value === false
  if (Array.isArray(value)) return value.length === 0
  if (value !== null && typeof value === 'object') {
    return Object.values(value).every(isPlaceholder)
  }
  return true
}

/** A Humble order key (16 alphanumerics) leading a cache key as `<gamekey>:<product>`; it grants access to the order. */
export const GAMEKEY_PREFIX_RE = /^[A-Za-z0-9]{16}:/

/**
 * A link to an uploaded log on a public paste host (`store/uploadedLogs.json` keys its records by it). The paste is
 * live and its text carries the operator's paths, so the link is replaced like a gamekey: a stable placeholder per run.
 */
export const PASTE_URL_RE =
  /^https?:\/\/(?:www\.)?(?:dpaste\.com|dpaste\.org|pastebin\.com|0x0\.st|termbin\.com|hastebin\.com)\//i
const PASTE_PLACEHOLDER_PREFIX = 'https://paste.invalid/PASTEREDACTED'

const CIPHERTEXT_PREFIX_RE = /^(steam|humble):v1:/
const JWT_RE = /^eyJ[A-Za-z0-9_-]{10,}/
const STEAMID64_RE = /^7656119\d{10}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

interface RedactionContext {
  /** The operator's OS account name; every case-insensitive occurrence in a string is replaced. */
  username: string
  /** Humble gamekey -> stable placeholder, so the same order keeps the same placeholder across files in one run. */
  gamekeys: Map<string, string>
  /** Paste link -> stable placeholder, for the same reason. */
  pastes: Map<string, string>
}

export function newRedactionContext(
  username = userInfo().username
): RedactionContext {
  return { username, gamekeys: new Map(), pastes: new Map() }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The OS account name is replaced wherever it appears, in values and in key names alike; text is otherwise kept. */
function replaceUsername(text: string, ctx: RedactionContext): string {
  if (ctx.username.length < 3) return text
  return text.replace(new RegExp(escapeRegExp(ctx.username), 'gi'), 'operator')
}

function pastePlaceholder(url: string, ctx: RedactionContext): string {
  let placeholder = ctx.pastes.get(url)
  if (placeholder === undefined) {
    placeholder = `${PASTE_PLACEHOLDER_PREFIX}${String(ctx.pastes.size + 1).padStart(6, '0')}`
    ctx.pastes.set(url, placeholder)
  }
  return placeholder
}

/**
 * The account shapes found anywhere inside a string, not only when they are the whole of it: a SteamID64, an email or a
 * bearer token inside a URL or a sentence is as much a leak. The same shapes `storeCorpus.test.ts` scans for, so a value
 * the harvester keeps is a value the scan accepts.
 */
const JWT_ANYWHERE_RE = /eyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)*/g
const STEAMID64_ANYWHERE_RE = /7656119\d{10}/g
const EMAIL_ANYWHERE_RE = /[^\s@"]+@[^\s@"]+\.[A-Za-z]{2,}/g

function redactEmbedded(text: string): string {
  return text
    .replace(JWT_ANYWHERE_RE, PLACEHOLDER)
    .replace(STEAMID64_ANYWHERE_RE, PLACEHOLDER)
    .replace(EMAIL_ANYWHERE_RE, PLACEHOLDER)
}

function redactString(value: string, ctx: RedactionContext): string {
  if (PASTE_URL_RE.test(value)) return pastePlaceholder(value, ctx)
  if (
    CIPHERTEXT_PREFIX_RE.test(value) ||
    JWT_RE.test(value) ||
    STEAMID64_RE.test(value) ||
    EMAIL_RE.test(value)
  ) {
    return PLACEHOLDER
  }
  return replaceUsername(redactEmbedded(value), ctx)
}

/** Key names are kept, except a Humble gamekey prefix and the OS account name: a key is never replaced wholesale. */
function redactKey(key: string, ctx: RedactionContext): string {
  if (PASTE_URL_RE.test(key)) return pastePlaceholder(key, ctx)
  let out = key
  const gk = GAMEKEY_PREFIX_RE.exec(key)
  if (gk) {
    const bare = gk[0].slice(0, -1)
    let placeholder = ctx.gamekeys.get(bare)
    if (placeholder === undefined) {
      placeholder = `GKREDACTED${String(ctx.gamekeys.size + 1).padStart(6, '0')}`
      ctx.gamekeys.set(bare, placeholder)
    }
    out = `${placeholder}:${key.slice(gk[0].length)}`
  }
  return replaceUsername(redactEmbedded(out), ctx)
}

/**
 * Redact one value found at `keyPath` (outermost key first). Denylisted keys, ciphertext, JWTs, SteamID64s, emails and
 * the OS account name are replaced by same-type placeholders; every other value and every key name is kept.
 */
export function redactValue(
  keyPath: readonly string[],
  value: unknown,
  ctx: RedactionContext = newRedactionContext()
): unknown {
  const last = keyPath[keyPath.length - 1]
  if (last !== undefined && isDenylistedKey(last)) return placeholderOf(value)
  if (typeof value === 'string') return redactString(value, ctx)
  if (Array.isArray(value)) {
    return value.map((v, i) => redactValue([...keyPath, String(i)], v, ctx))
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      setOwn(out, redactKey(k, ctx), redactValue([...keyPath, k], v, ctx))
    }
    return out
  }
  return value
}

// ---------------------------------------------------------------------------------------------------------------
// Flavour, table key and expected outcome
// ---------------------------------------------------------------------------------------------------------------

/** The two on-disk flavours (D-05): the root settings document and per-game documents are 2-space, the rest tab. */
export function flavourOf(relPath: string): Flavour {
  if (relPath === 'config.json' || relPath.startsWith('GamesConfig/')) {
    return 'settings'
  }
  return 'store'
}

/** The store whose rules apply: the chain key the TS registry uses (`<dir>/<name>`, or `settings/global|game`). */
export function tableKeyOf(relPath: string): string {
  if (relPath === 'config.json') return 'settings/global'
  if (relPath.startsWith('GamesConfig/')) return 'settings/game'
  return relPath.replace(/\.json$/, '')
}

function currentVersionOf(tableKey: string): number {
  return CHAIN_CURRENT[tableKey] ?? 1
}

/** `{ ...json }` in the exact bytes TS writes for it. */
export function serialise(value: unknown, flavour: Flavour): string {
  return flavour === 'settings'
    ? JSON.stringify(value, null, 2)
    : JSON.stringify(value, undefined, '\t')
}

function storedVersion(flavour: Flavour, data: unknown): number {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return 0
  }
  const doc = data as Record<string, unknown>
  if (flavour === 'settings') {
    const m = /^v(\d+)$/.exec(
      typeof doc.version === 'string' ? doc.version : ''
    )
    return m ? Number(m[1]) : 0
  }
  const internal = doc.__internal__
  if (internal === null || typeof internal !== 'object') return 0
  const gamelib = (internal as Record<string, unknown>).gamelib
  if (gamelib === null || typeof gamelib !== 'object') return 0
  const v = (gamelib as Record<string, unknown>).schemaVersion
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0
}

/** What the Rust engine must do with a parsed, current-flavour file: roundtrip, migrate, or open read-only. */
export function expectFor(
  flavour: Flavour,
  tableKey: string,
  data: unknown
): Expect {
  const current = currentVersionOf(tableKey)
  const v = storedVersion(flavour, data)
  if (v > current) return 'readOnly-newer'
  // An unstamped file at baseline 1 is adopted in place with nothing written; any older stamp runs a chain.
  if (v < current && current > 1) return 'migrate'
  return 'roundtrip'
}

// ---------------------------------------------------------------------------------------------------------------
// Corpus and manifest I/O
// ---------------------------------------------------------------------------------------------------------------

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function readManifest(): Manifest {
  const path = join(CORPUS_DIR, 'MANIFEST.json')
  if (!existsSync(path)) return { floor: 0, counts: {}, files: [] }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

/** Rewrite MANIFEST.json: files sorted by path, counts by source, floor = the committed (non-missing) file count. */
function writeManifest(manifest: Manifest): void {
  const files = [...manifest.files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  )
  const counts: Record<string, number> = {}
  for (const f of files) counts[f.source] = (counts[f.source] ?? 0) + 1
  const next: Manifest = {
    floor: files.filter((f) => f.expect !== 'missing').length,
    counts: Object.fromEntries(
      Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1))
    ),
    ...(manifest.failures && Object.keys(manifest.failures).length > 0
      ? { failures: manifest.failures }
      : {}),
    files
  }
  mkdirSync(CORPUS_DIR, { recursive: true })
  writeFileSync(
    join(CORPUS_DIR, 'MANIFEST.json'),
    JSON.stringify(next, null, 2) + '\n'
  )
}

/** Write one corpus file (creating directories) and return its manifest entry. */
function writeCorpusFile(
  relPath: string,
  bytes: Buffer | string,
  meta: Omit<ManifestEntry, 'path' | 'sha256'>
): ManifestEntry {
  const dest = join(CORPUS_DIR, relPath)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, bytes)
  return { path: relPath, sha256: sha256(bytes), ...meta }
}

/**
 * Replace the manifest's entries for `source` (all of them, or only the paths in `onlyPaths`) with `entries`, and delete
 * the corpus files that source no longer produces. A re-run of a subcommand therefore never leaves a stale file behind.
 */
function replaceSource(
  source: string,
  entries: ManifestEntry[],
  onlyPaths?: ReadonlySet<string>
): void {
  const manifest = readManifest()
  const keep: ManifestEntry[] = []
  for (const f of manifest.files) {
    const owned = f.source === source && (!onlyPaths || onlyPaths.has(f.path))
    if (!owned) keep.push(f)
    else if (!entries.some((e) => e.path === f.path)) {
      rmSync(join(CORPUS_DIR, f.path), { force: true })
    }
  }
  writeManifest({ ...manifest, files: [...keep, ...entries] })
}

// ---------------------------------------------------------------------------------------------------------------
// Profile walking
// ---------------------------------------------------------------------------------------------------------------

function isBackupName(fileName: string): boolean {
  return BACKUP_RE.test(fileName)
}

/**
 * The store JSON files directly inside a profile: `*.json` in each store directory and in GamesConfig, plus config.json.
 * Backups and anything in EXCLUDED_PATHS are not returned; non-JSON files never are.
 */
function profileStoreFiles(profileDir: string): string[] {
  const out: string[] = []
  const add = (dir: string) => {
    const abs = join(profileDir, dir)
    if (!existsSync(abs) || !statSync(abs).isDirectory()) return
    for (const name of readdirSync(abs).sort()) {
      const rel = `${dir}/${name}`
      if (!name.endsWith('.json') || isBackupName(name)) continue
      if ((EXCLUDED_PATHS as readonly string[]).includes(rel)) continue
      if (statSync(join(abs, name)).isFile()) out.push(rel)
    }
  }
  if (existsSync(join(profileDir, 'config.json'))) out.push('config.json')
  for (const d of STORE_DIRS) add(d)
  add('GamesConfig')
  return out
}

/** Parse, redact and re-serialise one profile file; `null` when it is not a JSON document (the caller records why). */
function redactFile(
  profileDir: string,
  relPath: string,
  ctx: RedactionContext,
  flavour: Flavour = flavourOf(relPath)
): { text: string; data: unknown } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(profileDir, relPath), 'utf8'))
  } catch {
    return null
  }
  const redacted = redactValue([], parsed, ctx)
  return { text: serialise(redacted, flavour), data: redacted }
}

// ---------------------------------------------------------------------------------------------------------------
// Subcommands
// ---------------------------------------------------------------------------------------------------------------

/**
 * `operator <profileDir> [--only <relpath>...]`: the named real-profile arm.
 *
 * This is the one place the harvester touches the operator's real profile, and it is a real-profile arm on purpose:
 * D-09 requires the live profile as a corpus source, because only real accumulated state (sorted nested keys, `.0`
 * floats, integer-like key order, older-shape captures) exposes the divergences a synthetic file never would. The
 * justification for the exemption from the fake-HOME convention is this: the arm only reads, never writes to the
 * profile and never spawns a process; every other arm (`tag`) spawns under a fresh createFakeHomeProfile().
 */
function harvestOperator(profileDir: string, only: readonly string[]): void {
  if (!existsSync(profileDir)) {
    throw new Error(`operator profile not found at ${profileDir}`)
  }
  const ctx = newRedactionContext()
  const wanted = only.length > 0 ? new Set(only) : undefined
  const entries: ManifestEntry[] = []
  for (const rel of profileStoreFiles(profileDir)) {
    if (wanted && !wanted.has(rel)) continue
    const result = redactFile(profileDir, rel, ctx)
    if (result === null) {
      console.warn(`skip (not JSON): ${rel}`)
      continue
    }
    const flavour = flavourOf(rel)
    const tableKey = tableKeyOf(rel)
    entries.push(
      writeCorpusFile(`operator/${rel}`, result.text, {
        source: 'operator',
        flavour,
        expect: expectFor(flavour, tableKey, result.data),
        tableKey
      })
    )
  }
  if (wanted) {
    for (const rel of wanted) {
      if (!entries.some((e) => e.path === `operator/${rel}`)) {
        throw new Error(
          `--only ${rel}: not a harvestable file in ${profileDir}`
        )
      }
    }
  }
  replaceSource(
    'operator',
    entries,
    wanted ? new Set([...wanted].map((r) => `operator/${r}`)) : undefined
  )
  console.log(`operator: ${entries.length} file(s) written`)
}

/**
 * `backups <profileDir>`: the engine's real pre-migration captures (`<name>.v<from>.<stamp>.bak.json`) and the hand copy
 * `config.v1.from-phase68.*.json`. Each is the bytes of a store as an OLDER shape wrote it, so they are the migration
 * corpus: `expect` is `migrate` when the version in the file name is below the chain's current version.
 * Read only, same justification as the operator arm: it never writes to the profile and never spawns.
 */
function harvestBackups(profileDir: string): void {
  if (!existsSync(profileDir)) {
    throw new Error(`operator profile not found at ${profileDir}`)
  }
  const ctx = newRedactionContext()
  const entries: ManifestEntry[] = []
  const dirs = ['', ...STORE_DIRS, 'GamesConfig']
  for (const dir of dirs) {
    const abs = join(profileDir, dir)
    if (!existsSync(abs)) continue
    for (const name of readdirSync(abs).sort()) {
      const m = BACKUP_RE.exec(name)
      if (!m || !statSync(join(abs, name)).isFile()) continue
      const origRel = `${dir ? `${dir}/` : ''}${m[1]}.json`
      const rel = `${dir ? `${dir}/` : ''}${name}`
      if ((EXCLUDED_PATHS as readonly string[]).includes(origRel)) continue
      const result = redactFile(profileDir, rel, ctx, flavourOf(origRel))
      if (result === null) {
        console.warn(`skip (not JSON): ${rel}`)
        continue
      }
      const flavour = flavourOf(origRel)
      const tableKey = tableKeyOf(origRel)
      const from = Number(m[2])
      const current = currentVersionOf(tableKey)
      entries.push(
        writeCorpusFile(`backups/${rel}`, result.text, {
          source: 'backup',
          flavour,
          expect:
            from > current
              ? 'readOnly-newer'
              : from < current
                ? 'migrate'
                : 'roundtrip',
          tableKey,
          note: `captured at v${from}`
        })
      )
    }
  }
  replaceSource('backup', entries)
  console.log(`backups: ${entries.length} file(s) written`)
}

const SENTINEL = '__GAMELIB_SIDECAR_READY__'
const TAGS = ['v0.8', 'v0.9', 'v0.10'] as const
const BOOT_WAIT_MS = 30_000
const EXIT_WAIT_MS = 15_000

interface RunResult {
  status: number | null
  stdout: string
  stderr: string
}

/**
 * Run a build-time command (git, pnpm) with a fresh fake HOME and dispose it after. Nothing here is profile-dependent, so
 * this is the isolated half of the two-profile rule. `extraEnv` carries only non-profile keys (the pnpm store path).
 */
function runIsolated(
  command: string,
  args: string[],
  cwd: string,
  extraEnv: NodeJS.ProcessEnv = {},
  timeoutMs = 600_000
): RunResult {
  const profile = createFakeHomeProfile({ prefix: 'gamelib-corpus-build-' })
  try {
    const r = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...profile.childEnv(process.env), ...extraEnv }
    })
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  } finally {
    profile.dispose()
  }
}

function must(r: RunResult, what: string): void {
  if (r.status !== 0) {
    const tail = (r.stderr || r.stdout).split('\n').slice(-25).join('\n')
    throw new Error(`${what} exited ${String(r.status)}\n${tail}`)
  }
}

/**
 * The operator's content-addressable pnpm store, so a tag's install links from it instead of downloading again. Asking
 * where it lives is profile-dependent by purpose (a fake HOME would answer with an empty store); the call reads that one
 * path and nothing else, spawns pnpm only for this, and never writes.
 */
function realPnpmStore(): string {
  const r = spawnSync('pnpm', ['store', 'path'], { encoding: 'utf8' })
  const path = (r.stdout ?? '').trim()
  if (r.status !== 0 || path.length === 0) {
    throw new Error('pnpm store path failed; cannot share the pnpm store')
  }
  return path
}

/** The directory a sidecar chose for its user data inside a fake profile: the one holding store/config.json. */
function findUserData(root: string): string | null {
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (queue.length > 0) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number }
    if (existsSync(join(dir, 'store', 'config.json'))) return dir
    if (depth >= 5) continue
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const n of names.sort()) {
      const abs = join(dir, n)
      try {
        if (statSync(abs).isDirectory())
          queue.push({ dir: abs, depth: depth + 1 })
      } catch {
        // vanished between readdir and stat
      }
    }
  }
  return null
}

/**
 * A plain, referenced timer. It must NOT be unref'd: this is a one-shot CLI, and if the sidecar under test dies early an
 * unreferenced wait leaves nothing holding the event loop, so the process exits 0 mid-await without ever reaching its
 * cleanup (measured: the first v0.10 run left its worktree behind that way).
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Boot one tag's sidecar in the fresh fake profile `profile`, wait until it has written store/config.json (or
 * BOOT_WAIT_MS pass), close stdin so it leaves by event-loop drain, give it EXIT_WAIT_MS, then kill its process group.
 * Returns the user-data dir. Raw stdout/stderr stay in memory and are discarded: nothing is written outside the profile,
 * so there is no capture to register for shredding.
 */
async function bootSidecar(
  worktree: string,
  profile: ReturnType<typeof createFakeHomeProfile>
): Promise<string> {
  const bundle = join(worktree, 'build', 'main', 'sidecar.js')
  if (!existsSync(bundle)) throw new Error(`no sidecar bundle at ${bundle}`)
  const child = spawn(process.execPath, [bundle], {
    cwd: worktree,
    // The eight profile variables plus PATH only: nothing else of the operator's environment reaches the old release.
    env: { ...profile.env, PATH: process.env.PATH ?? '' },
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: process.platform !== 'win32'
  })
  let out = ''
  child.stdout.on('data', (d: Buffer) => {
    out = (out + d.toString()).slice(-4096)
  })
  let err = ''
  child.stderr.on('data', (d: Buffer) => {
    err = (err + d.toString()).slice(-1500)
  })
  let exited = false
  child.on('exit', () => {
    exited = true
  })
  const killGroup = () => {
    try {
      if (process.platform === 'win32' || child.pid === undefined)
        child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  try {
    const bootDeadline = Date.now() + BOOT_WAIT_MS
    let userData: string | null = null
    while (Date.now() < bootDeadline && !exited) {
      userData = findUserData(profile.root)
      if (userData !== null && out.includes(SENTINEL)) break
      await sleep(250)
    }
    userData = findUserData(profile.root)
    child.stdin.end()
    const exitDeadline = Date.now() + EXIT_WAIT_MS
    while (!exited && Date.now() < exitDeadline) await sleep(100)
    if (userData === null) {
      throw new Error(
        `the sidecar wrote no store/config.json within ${BOOT_WAIT_MS} ms (ready sentinel ${
          out.includes(SENTINEL) ? 'seen' : 'not seen'
        }; exit ${exited ? 'seen' : 'not seen'}); stderr tail:\n${err}`
      )
    }
    return userData
  } finally {
    killGroup()
  }
}

/**
 * `tag <v0.8|v0.9|v0.10>`: build the tagged sidecar in a detached worktree and boot it in a fresh fake HOME, then copy the
 * store files it wrote. These are raw bytes, as that release wrote them: no re-serialisation, because how an older release
 * laid out a file is exactly what a migration test needs. A fresh profile holds no account data, and the copy is refused
 * if the redactor would change anything in it.
 *
 * A tag that cannot build or boot is recorded in the manifest (`failures`) with the exact error and the other tags
 * continue; the manifest floor and storeCorpus.test.ts decide whether what remains is enough.
 */
async function harvestTag(tag: string, scratchParent?: string): Promise<void> {
  if (!(TAGS as readonly string[]).includes(tag)) {
    throw new Error(`unknown tag ${tag}; expected one of ${TAGS.join(', ')}`)
  }
  const repo = process.cwd()
  const scratch = mkdtempSync(
    join(scratchParent ?? tmpdir(), 'gamelib-corpus-')
  )
  const worktree = join(scratch, `gamelib-${tag}`)
  let added = false
  const profile = createFakeHomeProfile({ prefix: `gamelib-corpus-${tag}-` })
  try {
    must(
      runIsolated('git', ['worktree', 'add', '--detach', worktree, tag], repo),
      `git worktree add ${tag}`
    )
    added = true
    const store = realPnpmStore()
    // The fake HOME has no corepack cache: let corepack fetch the pinned pnpm into it without prompting, which the
    // dispose() then shreds. Neither key names anything of the operator's.
    const pnpmEnv = {
      npm_config_store_dir: store,
      COREPACK_ENABLE_DOWNLOAD_PROMPT: '0',
      // pnpm refuses to rewrite a node_modules it did not create without a TTY; CI=true is its documented answer.
      CI: 'true'
    }
    must(
      runIsolated('pnpm', ['install', '--frozen-lockfile'], worktree, pnpmEnv),
      `pnpm install in ${tag}`
    )
    must(
      runIsolated('pnpm', ['build:sidecar'], worktree, pnpmEnv, 300_000),
      `pnpm build:sidecar in ${tag}`
    )
    const userData = await bootSidecar(worktree, profile)
    const ctx = newRedactionContext()
    const entries: ManifestEntry[] = []
    for (const rel of profileStoreFiles(userData)) {
      const bytes = readFileSync(join(userData, rel))
      let parsed: unknown
      try {
        parsed = JSON.parse(bytes.toString('utf8'))
      } catch {
        console.warn(`${tag}: skip (not JSON): ${rel}`)
        continue
      }
      if (
        JSON.stringify(redactValue([], parsed, ctx)) !== JSON.stringify(parsed)
      ) {
        throw new Error(
          `${tag}: ${rel} holds data the redactor would change; a fresh profile must hold none`
        )
      }
      const flavour = flavourOf(rel)
      const tableKey = tableKeyOf(rel)
      entries.push(
        writeCorpusFile(`${tag}/${rel}`, bytes, {
          source: tag,
          flavour,
          expect: expectFor(flavour, tableKey, parsed),
          tableKey
        })
      )
    }
    if (entries.length === 0)
      throw new Error(`${tag}: the boot wrote no store files`)
    replaceSource(tag, entries)
    const manifest = readManifest()
    if (manifest.failures) delete manifest.failures[tag]
    writeManifest(manifest)
    console.log(`${tag}: ${entries.length} file(s) written`)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    replaceSource(tag, [])
    const manifest = readManifest()
    writeManifest({
      ...manifest,
      failures: {
        ...manifest.failures,
        [tag]: replaceUsername(message, newRedactionContext()).slice(0, 1500)
      }
    })
    console.error(`${tag}: FAILED, recorded in the manifest: ${message}`)
  } finally {
    profile.dispose()
    if (added)
      runIsolated('git', ['worktree', 'remove', '--force', worktree], repo)
    runIsolated('git', ['worktree', 'prune'], repo)
    rmSync(scratch, { recursive: true, force: true })
  }
}

interface EdgeCase {
  /** Path under corpus/edge/. */
  path: string
  /** File bytes, or `null` for a manifest-only entry (the file does not exist). */
  bytes: Buffer | null
  flavour: Flavour
  expect: Expect
  tableKey: string
  note: string
}

const EDGE_STAMP_V1 = { __internal__: { gamelib: { schemaVersion: 1 } } }

/** The hand-built edge cases. The bytes are written exactly as listed; nothing here is re-serialised or redacted. */
function edgeCases(): EdgeCase[] {
  const tab = (v: unknown): string => serialise(v, 'store')
  return [
    {
      path: 'store_cache/edge_unknown_keys.json',
      bytes: Buffer.from(
        tab({
          'edge-game': {
            title: 'Edge Game',
            extra: {
              unknownKeyA: { nested: [1, 2, 3] },
              unknownKeyB: 'kept at depth 2'
            }
          },
          ...EDGE_STAMP_V1
        })
      ),
      flavour: 'store',
      expect: 'roundtrip',
      tableKey: 'store_cache/wikigameinfo',
      note: 'current version with two keys no schema declares, nested at depth 2: they must survive untouched'
    },
    {
      path: 'store/edge_corrupt.json',
      bytes: Buffer.from('{not json'),
      flavour: 'store',
      expect: 'readOnly-failed',
      tableKey: 'store/timestamp',
      note: 'user state that does not parse: keep the bytes, copy aside, open read-only (D-18)'
    },
    {
      path: 'store_cache/edge_corrupt_cache.json',
      bytes: Buffer.from('{not json'),
      flavour: 'store',
      expect: 'startEmpty',
      tableKey: 'store_cache/wikigameinfo',
      note: 'a cache that does not parse: continue empty once its copy exists (D-18)'
    },
    {
      path: 'store/edge_array_root.json',
      bytes: Buffer.from('[1]'),
      flavour: 'store',
      expect: 'readOnly-failed',
      tableKey: 'store/timestamp',
      note: 'valid JSON whose root is an array, not an object'
    },
    {
      path: 'store/edge_empty.json',
      bytes: Buffer.alloc(0),
      flavour: 'store',
      expect: 'readOnly-failed',
      tableKey: 'store/timestamp',
      note: 'zero bytes'
    },
    {
      path: 'store/edge_bom.json',
      bytes: Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from(tab({ lastPlayed: 'x', ...EDGE_STAMP_V1 }))
      ]),
      flavour: 'store',
      expect: 'readOnly-failed',
      tableKey: 'store/timestamp',
      note: 'UTF-8 BOM then a valid object: serde_json rejects a BOM where TS conf resets the store'
    },
    {
      path: 'store/edge_crlf.json',
      bytes: Buffer.from(
        tab({ lastPlayed: 'x', nested: { a: 1 }, ...EDGE_STAMP_V1 }).replace(
          /\n/g,
          '\r\n'
        )
      ),
      flavour: 'store',
      expect: 'roundtrip',
      tableKey: 'store/timestamp',
      note: 'semantic roundtrip: valid JSON with CRLF line breaks; Rust rewrites with LF only on the next real write, never on a no-op boot'
    },
    {
      path: 'store/edge_newer.json',
      bytes: Buffer.from(
        tab({
          lastPlayed: 'x',
          __internal__: { gamelib: { schemaVersion: 99 } }
        })
      ),
      flavour: 'store',
      expect: 'readOnly-newer',
      tableKey: 'store/timestamp',
      note: 'schemaVersion 99, newer than any chain: open read-only, bytes never rewritten'
    },
    {
      path: 'store/edge_lone_surrogate.json',
      // JSON.stringify would write the escape for a lone surrogate too; it is spelled out so the bytes are plain ASCII.
      bytes: Buffer.from(
        '{\n\t"text": "\\ud800",\n\t"__internal__": {\n\t\t"gamelib": {\n\t\t\t"schemaVersion": 1\n\t\t}\n\t}\n}'
      ),
      flavour: 'store',
      expect: 'readOnly-failed',
      tableKey: 'store/timestamp',
      note: 'a lone UTF-16 surrogate escape: JS accepts it, serde_json rejects it'
    },
    {
      path: 'settings/edge_newer_global.json',
      bytes: Buffer.from(
        serialise({ version: 'v9', language: 'en' }, 'settings')
      ),
      flavour: 'settings',
      expect: 'readOnly-newer',
      tableKey: 'settings/global',
      note: 'a settings document at version v9, newer than the global chain (v2)'
    },
    {
      path: 'store/edge_missing.json',
      bytes: null,
      flavour: 'store',
      expect: 'missing',
      tableKey: 'store/timestamp',
      note: 'manifest-only: the file does not exist, the store starts empty'
    }
  ]
}

/** `edge`: write corpus/edge/ and replace the manifest's `edge` entries. */
function harvestEdge(): void {
  const entries: ManifestEntry[] = []
  for (const c of edgeCases()) {
    const meta = {
      source: 'edge',
      flavour: c.flavour,
      expect: c.expect,
      tableKey: c.tableKey,
      note: c.note
    }
    if (c.bytes === null) {
      entries.push({ path: `edge/${c.path}`, sha256: null, ...meta })
    } else {
      entries.push(writeCorpusFile(`edge/${c.path}`, c.bytes, meta))
    }
  }
  replaceSource('edge', entries)
  console.log(`edge: ${entries.length} entr(ies) written`)
}

function parseArgs(argv: string[]): {
  positional: string[]
  only: string[]
  scratch?: string
} {
  const positional: string[] = []
  const only: string[] = []
  let scratch: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a === '--only') {
      const next = argv[++i]
      if (next === undefined) throw new Error('--only needs a path')
      only.push(next)
    } else if (a === '--scratch') {
      scratch = argv[++i]
      if (scratch === undefined) throw new Error('--scratch needs a directory')
    } else positional.push(a)
  }
  return { positional, only, scratch }
}

async function main(): Promise<void> {
  const [sub, ...rest] = process.argv.slice(2)
  const { positional, only, scratch } = parseArgs(rest)
  switch (sub) {
    case 'operator': {
      const dir = positional[0]
      if (!dir)
        throw new Error('usage: operator <profileDir> [--only <rel>...]')
      harvestOperator(dir, only)
      return
    }
    case 'backups': {
      const dir = positional[0]
      if (!dir) throw new Error('usage: backups <profileDir>')
      harvestBackups(dir)
      return
    }
    case 'tag': {
      const tag = positional[0]
      if (!tag)
        throw new Error('usage: tag <v0.8|v0.9|v0.10> [--scratch <dir>]')
      await harvestTag(tag, scratch)
      return
    }
    case 'edge': {
      harvestEdge()
      return
    }
    default:
      throw new Error(`unknown subcommand ${String(sub)}`)
  }
}

if (!process.env.JEST_WORKER_ID) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
