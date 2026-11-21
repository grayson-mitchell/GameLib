/**
 * Harvester for the Phase 85 store corpus (D-09): real files, redacted, pinned by hash, that the Rust store's roundtrip
 * and migration tests run over.
 *
 *   node meta/runTs.cjs --bundle --platform=node --target=node22 meta/harvestStoreCorpus.ts <subcommand> ...
 *
 *   operator <profileDir> [--only <relpath>...]   redacted copy of the live operator profile (read only)
 *
 * Everything lands under CORPUS_DIR, and MANIFEST.json lists every file with its sha256, source, flavour and the outcome
 * the Rust engine is expected to produce (`expect`). `meta/__tests__/storeCorpus.test.ts` fails when the tree and the
 * manifest disagree, when the count falls below the floor, or when a committed value looks like account data.
 *
 * Redaction keeps the JSON shape and the file's byte flavour: the redacted document is re-serialised exactly as the TS
 * store would write it (`JSON.stringify(v, undefined, '\t')` for conf stores, `JSON.stringify(v, null, 2)` for settings
 * documents, no trailing newline), so a file that round-trips in Rust is compared against bytes TS itself would produce.
 */
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { userInfo } from 'os'
import { dirname, join, resolve } from 'path'

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
 * Current version of every chain the TS engine declares (`STORE_MIGRATIONS`), keyed by chain key. A chain key
 * absent here sits at the baseline version 1. `storeCorpus.test.ts` checks this table against the real registry, so it
 * cannot drift.
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
export const EXCLUDED_PATHS = [
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
  /credential/i
]

export function isDenylistedKey(key: string): boolean {
  return (
    DENY_KEYS.has(key.toLowerCase()) ||
    DENY_KEY_PATTERNS.some((re) => re.test(key))
  )
}

const PLACEHOLDER = 'REDACTED'

/** A value of the same JSON type with nothing in it: strings, numbers and booleans flatten, objects keep their keys. */
export function placeholderOf(value: unknown): unknown {
  if (typeof value === 'string') return PLACEHOLDER
  if (typeof value === 'number') return 0
  if (typeof value === 'boolean') return false
  if (Array.isArray(value)) return []
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = placeholderOf(v)
    return out
  }
  return value
}

/** True when `value` is what placeholderOf would have produced for its type. */
export function isPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return value === PLACEHOLDER
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

const CIPHERTEXT_PREFIX_RE = /^(steam|humble):v1:/
const JWT_RE = /^eyJ[A-Za-z0-9_-]{10,}/
const STEAMID64_RE = /^7656119\d{10}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/

export interface RedactionContext {
  /** The operator's OS account name; every case-insensitive occurrence in a string is replaced. */
  username: string
  /** Humble gamekey -> stable placeholder, so the same order keeps the same placeholder across files in one run. */
  gamekeys: Map<string, string>
}

export function newRedactionContext(
  username = userInfo().username
): RedactionContext {
  return { username, gamekeys: new Map() }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The OS account name is replaced wherever it appears, in values and in key names alike; text is otherwise kept. */
function replaceUsername(text: string, ctx: RedactionContext): string {
  if (ctx.username.length < 3) return text
  return text.replace(new RegExp(escapeRegExp(ctx.username), 'gi'), 'operator')
}

function redactString(value: string, ctx: RedactionContext): string {
  if (
    CIPHERTEXT_PREFIX_RE.test(value) ||
    JWT_RE.test(value) ||
    STEAMID64_RE.test(value) ||
    EMAIL_RE.test(value)
  ) {
    return PLACEHOLDER
  }
  return replaceUsername(value, ctx)
}

/** Key names are kept, except a Humble gamekey prefix and the OS account name: a key is never replaced wholesale. */
function redactKey(key: string, ctx: RedactionContext): string {
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
  return replaceUsername(out, ctx)
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
      out[redactKey(k, ctx)] = redactValue([...keyPath, k], v, ctx)
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

export function currentVersionOf(tableKey: string): number {
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
    const m = /^v(\d+)$/.exec(String(doc.version ?? ''))
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

export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function readManifest(): Manifest {
  const path = join(CORPUS_DIR, 'MANIFEST.json')
  if (!existsSync(path)) return { floor: 0, counts: {}, files: [] }
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest
}

/** Rewrite MANIFEST.json: files sorted by path, counts by source, floor = the committed (non-missing) file count. */
export function writeManifest(manifest: Manifest): void {
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

export function isBackupName(fileName: string): boolean {
  return BACKUP_RE.test(fileName)
}

/**
 * The store JSON files directly inside a profile: `*.json` in each store directory and in GamesConfig, plus config.json.
 * Backups and anything in EXCLUDED_PATHS are not returned; non-JSON files never are.
 */
export function profileStoreFiles(profileDir: string): string[] {
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
  ctx: RedactionContext
): { text: string; data: unknown } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(profileDir, relPath), 'utf8'))
  } catch {
    return null
  }
  const redacted = redactValue([], parsed, ctx)
  return { text: serialise(redacted, flavourOf(relPath)), data: redacted }
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

function parseArgs(argv: string[]): { positional: string[]; only: string[] } {
  const positional: string[] = []
  const only: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string
    if (a === '--only') {
      const next = argv[++i]
      if (next === undefined) throw new Error('--only needs a path')
      only.push(next)
    } else positional.push(a)
  }
  return { positional, only }
}

function main(): void {
  const [sub, ...rest] = process.argv.slice(2)
  const { positional, only } = parseArgs(rest)
  switch (sub) {
    case 'operator': {
      const dir = positional[0]
      if (!dir)
        throw new Error('usage: operator <profileDir> [--only <rel>...]')
      harvestOperator(dir, only)
      return
    }
    default:
      throw new Error(`unknown subcommand ${String(sub)}`)
  }
}

if (!process.env.JEST_WORKER_ID) {
  try {
    main()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
