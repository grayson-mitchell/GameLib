/**
 * Phase 68 D-01 ratchet: every persisted-store construction in production backend
 * code declares `kind: 'cache' | 'user-state'` at the call site.
 *
 * The required constructor parameter makes omission a compile error; this test is the
 * other half. It scans COMMENT-STRIPPED source (the `fakeHomeIsolation.test.ts` idiom),
 * so a docstring that mentions `kind: 'cache'` cannot satisfy it, and it compares the
 * scanned name -> kind table to EXPECTED_KINDS in both directions, so adding, removing
 * or reclassifying a store forces an explicit kind decision here.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { stripSourceComments } from '../testUtils/stripSourceComments'

type Kind = 'cache' | 'user-state'

const REPO_ROOT = join(__dirname, '..', '..', '..')
const BACKEND_ROOT = join(REPO_ROOT, 'src', 'backend')
const FRONTEND_STORES = join(
  REPO_ROOT,
  'src',
  'frontend',
  'helpers',
  'stores.ts'
)
const PRUNED_DIRS = new Set([
  '__tests__',
  '__mocks__',
  'testUtils',
  'node_modules',
  'build',
  'dist'
])

/** The class definitions construct `new Store` themselves; they are not call sites. */
const EXEMPT_FILES: readonly { file: string; reason: string }[] = [
  {
    file: 'src/backend/typed_store.ts',
    reason: 'defines TypeCheckedStoreBackend; no store construction of its own'
  },
  {
    file: 'src/backend/cache.ts',
    reason: 'defines CacheStore; no store construction of its own'
  }
]

/** `StoreStructure` entries with no backend construction at all. */
const EXEMPT_NAMES: readonly { name: string; reason: string }[] = [
  {
    name: 'fontsStore',
    reason:
      'has a StoreStructure entry but no construction (see sidecar/storeRegistration.ts)'
  }
]

const MIN_CONSTRUCTIONS = 51
const MIN_FILES_WITH_CONSTRUCTION = 15
const MIN_MIRRORS = 10

// This is a shrink-and-grow equality ratchet. Never widen it to admit a failing case
// without making the kind decision: cache = discarded on a shape-changing version bump,
// user-state = migrated, never discarded (D-01).
const EXPECTED_KINDS: Record<string, Kind> = {
  // TypeCheckedStoreBackend (19)
  configStore: 'user-state',
  timestampStore: 'user-state',
  steamConfigStore: 'user-state',
  steamBottleConfigStore: 'user-state',
  gogConfigStore: 'user-state',
  gogInstalledGamesStore: 'user-state',
  gogSyncStore: 'user-state',
  gogPrivateBranches: 'user-state',
  nileConfigStore: 'user-state',
  legendaryConfigStore: 'user-state',
  sideloadedStore: 'user-state',
  humbleConfigStore: 'user-state',
  downloadManager: 'user-state',
  gameOverridesStore: 'user-state',
  migrationsStore: 'user-state',
  wineDownloaderInfoStore: 'cache',
  macArchStore: 'user-state',
  runsForMeStore: 'user-state',
  uploadedLogs: 'cache',
  // CacheStore (34)
  steam_library: 'user-state',
  gog_library: 'user-state',
  legendary_library: 'user-state',
  nile_library: 'user-state',
  steam_metadata: 'cache',
  steam_sync: 'cache',
  steam_pending_adoption: 'user-state',
  steam_restart_hold: 'user-state',
  // Phase 74 D-06: per-build "don't ask again" acks; losing them re-prompts the user.
  steam_update_prompt_ack: 'user-state',
  steam_known_fix_reports: 'user-state',
  steam_engine_notices: 'user-state',
  gog_api_info: 'cache',
  gog_achievements: 'cache',
  gog_install_info: 'cache',
  gog_playtime_sync_queue: 'user-state',
  nile_install_info: 'cache',
  legendary_install_info: 'cache',
  legendary_games_override: 'cache',
  legendary_gameinfo: 'cache',
  humble_library: 'user-state',
  humble_sync: 'cache',
  humble_revealed: 'user-state',
  humble_ownership_override: 'user-state',
  humble_gifted_at: 'user-state',
  humble_audit: 'user-state',
  humble_local_redeemed: 'user-state',
  humble_notified_expiration: 'user-state',
  humble_settle_declined: 'user-state',
  humble_steam_appid: 'cache',
  crossover_index: 'cache',
  pci_ids_device: 'cache',
  pci_ids_vendor: 'cache',
  wikigameinfo: 'cache',
  umu: 'cache'
}

const EXPECTED_TOKEN_BEARING = [
  'humbleConfigStore',
  'steamBottleConfigStore',
  'steamConfigStore'
]

interface Construction {
  file: string
  line: number
  name: string
  kind: Kind | undefined
  tokenBearing: boolean
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!PRUNED_DIRS.has(entry.name)) walk(join(dir, entry.name), out)
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

/** Text between the opening paren at `open` and its balanced close, string-aware. */
function balancedArgs(src: string, open: number): string {
  let depth = 0
  let quote: string | null = null
  for (let i = open; i < src.length; i++) {
    const c = src[i]
    if (quote) {
      if (c === '\\') i++
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(') depth++
    else if (c === ')' && --depth === 0) return src.slice(open + 1, i)
  }
  return src.slice(open + 1)
}

const CONSTRUCTION =
  /new\s+(?:CacheStore|TypeCheckedStoreBackend)\s*(?:<[^()]*?>)?\s*\(/g

function scan(): { constructions: Construction[]; filesScanned: number } {
  const exempt = new Set(EXEMPT_FILES.map((e) => e.file))
  const constructions: Construction[] = []
  const files = walk(BACKEND_ROOT)
  for (const abs of files) {
    const rel = relative(REPO_ROOT, abs).split(sep).join('/')
    if (exempt.has(rel)) continue
    const src = stripSourceComments(readFileSync(abs, 'utf8'))
    for (const m of src.matchAll(CONSTRUCTION)) {
      const open = (m.index ?? 0) + m[0].length - 1
      const args = balancedArgs(src, open)
      const name = /^\s*['"]([^'"]+)['"]/.exec(args)?.[1] ?? '<non-literal>'
      const kind = /kind:\s*'(cache|user-state)'/.exec(args)?.[1] as
        | Kind
        | undefined
      constructions.push({
        file: rel,
        line: src.slice(0, m.index).split('\n').length,
        name,
        kind,
        tokenBearing: /tokenBearing:\s*true/.test(args)
      })
    }
  }
  return { constructions, filesScanned: files.length }
}

const { constructions, filesScanned } = scan()
const scannedKinds: Record<string, Kind> = {}
for (const c of constructions) if (c.kind) scannedKinds[c.name] = c.kind

describe('store kind declarations (D-01)', () => {
  test('no construction lacks a valid kind', () => {
    const offenders = constructions
      .filter((c) => !c.kind)
      .map((c) => `${c.file}:${c.line} (${c.name})`)
    expect(offenders).toEqual([])
  })

  test('anti-vacuity: the walk found the constructions it should', () => {
    expect(filesScanned).toBeGreaterThan(100)
    expect(constructions.length).toBeGreaterThanOrEqual(MIN_CONSTRUCTIONS)
    expect(
      new Set(constructions.map((c) => c.file)).size
    ).toBeGreaterThanOrEqual(MIN_FILES_WITH_CONSTRUCTION)
  })

  test('no two constructions share a name', () => {
    const names = constructions.map((c) => c.name)
    expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([])
  })

  test('the scanned name -> kind table equals EXPECTED_KINDS exactly', () => {
    expect(scannedKinds).toEqual(EXPECTED_KINDS)
  })

  test('exempt files still exist', () => {
    for (const e of EXEMPT_FILES) {
      expect({
        file: e.file,
        exists: existsSync(join(REPO_ROOT, e.file))
      }).toEqual({ file: e.file, exists: true })
    }
  })

  test('fontsStore is exempt by name because it really has no construction', () => {
    for (const e of EXEMPT_NAMES) {
      expect(constructions.map((c) => c.name)).not.toContain(e.name)
      expect(Object.keys(EXPECTED_KINDS)).not.toContain(e.name)
    }
  })
})

describe('classification (D-02, D-13, D-14)', () => {
  test('tokenBearing is declared on exactly the steam and humble config stores (D-13)', () => {
    expect(
      constructions
        .filter((c) => c.tokenBearing)
        .map((c) => c.name)
        .sort()
    ).toEqual(EXPECTED_TOKEN_BEARING)
  })

  test.each([
    'steam_library',
    'gog_library',
    'legendary_library',
    'nile_library',
    'sideloadedStore'
  ])('D-02 library store %s is user-state', (name) => {
    expect(scannedKinds[name]).toBe('user-state')
  })

  test.each([
    'humble_library',
    'steam_known_fix_reports',
    'runsForMeStore',
    'macArchStore'
  ])('D-14 store %s is user-state', (name) => {
    expect(scannedKinds[name]).toBe('user-state')
  })

  test('steamConfigStore and steamBottleConfigStore share a file and a kind', () => {
    expect(scannedKinds.steamConfigStore).toBe(
      scannedKinds.steamBottleConfigStore
    )
  })
})

describe('renderer mirror parity (D-02)', () => {
  const src = stripSourceComments(readFileSync(FRONTEND_STORES, 'utf8'))
  const mirrors = [
    ...src.matchAll(
      /new\s+(?:CacheStore|TypeCheckedStoreFrontend)\s*(?:<[^()]*?>)?\s*\(\s*['"]([^'"]+)['"]/g
    )
  ].map((m) => m[1] ?? '')

  test('anti-vacuity: mirrors were parsed', () => {
    expect(mirrors.length).toBeGreaterThanOrEqual(MIN_MIRRORS)
  })

  test('every mirror maps to a backend declaration with a kind', () => {
    expect(mirrors.filter((n) => !(n in EXPECTED_KINDS))).toEqual([])
  })

  test.each([
    'legendary_library',
    'gog_library',
    'steam_library',
    'nile_library'
  ])('library mirror %s exists and is user-state', (name) => {
    expect(mirrors).toContain(name)
    expect(EXPECTED_KINDS[name]).toBe('user-state')
  })
})
