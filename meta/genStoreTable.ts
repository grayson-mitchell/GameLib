/**
 * Store table generator (Phase 85, D-11).
 *
 * One table names every persisted store, for both sides: `src/common/types/ipc/storeTable.json` is read
 * by the Rust `gamelib-store` crate (`include_str!`) and by the TS drift test. It is built from the
 * registrations the TS stack makes (`registeredStores.json`, the fixture `storeKinds.test.ts` keeps
 * current) plus the rows no TS construction reaches, so a store added on either side without the other
 * fails a test instead of silently missing its migration or its read-only handling.
 *
 * The file is `{ generatedBy, chainVersions, rows }`. `chainVersions` maps every chain key that moves a
 * store past the baseline to the version a store at rest has (`CHAIN_VERSIONS` below); a cargo test in
 * `gamelib-store` (`table.rs`) holds it equal to the shell's `Chains::baseline`, and the TS tables that
 * need a stamped version (`testUtils/storeSchemaVersions.ts`, the corpus harvester's `CHAIN_CURRENT`)
 * are held equal to it in jest, so none of them can drift from the shell.
 *
 * Each row: `{ key, dir, name, tsNames, kind, family, tokenBearing, dotPaths, flavour, chain }`.
 *   key      `<dir>/<name>` (the chain key the engine uses), or `settings/global` / `settings/game`
 *   dir      the directory under the user-data (store) root; `""` for the app-folder `config.json`
 *   name     the file name without `.json`; null for the `settings/game` pattern row
 *   tsNames  the TS store names registered for the file (a file can have several: steam's config)
 *   kind     `cache` (can be rebuilt) or `user-state`, as `declaration.kind` says
 *   family   how the Rust host treats it: cache, user-state, account, settings, native, excluded
 *   chain    the key when `CHAIN_VERSIONS` has a chain for it, else null (baseline v1)
 *
 * Run `node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreTable.ts` to write the
 * file, add `--check` to fail on any difference (the jest drift test compares the same data).
 * Imports below are relative on purpose: `meta/runTs.cjs` bundling does not honour tsconfig baseUrl.
 */
import { readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { join } from 'path'

export const TABLE_REL = 'src/common/types/ipc/storeTable.json'
const REGISTERED_REL =
  'src/backend/stores/__tests__/fixtures/registeredStores.json'
const GENERATOR = 'meta/genStoreTable.ts'
const REGEN_CMD =
  'node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genStoreTable.ts'

type Kind = 'cache' | 'user-state'
export type Family =
  | 'cache'
  | 'user-state'
  | 'account'
  | 'settings'
  | 'native'
  | 'excluded'
type Flavour = 'store' | 'settings'

export interface Row {
  key: string
  dir: string
  name: string | null
  tsNames: string[]
  kind: Kind
  family: Family
  tokenBearing: boolean
  dotPaths: boolean
  flavour: Flavour
  chain: string | null
}

export interface StoreTable {
  generatedBy: string
  chainVersions: Record<string, number>
  rows: Row[]
}

/**
 * The migration chains the shell runs (`gamelib-store` `Chains::baseline`), by chain key, with the
 * version each brings a store to: settings global and game at v2, the seven library chains at v3.
 * Every other store sits at the baseline v1 (D-04). The TS migration registry this replaced was
 * deleted in 85-24 (D-03); the cargo test `table_chain_versions_equal_the_shell_chains` fails when
 * this and the shell disagree. The shell's two step-less engine-file chains (the shared-redist
 * ledger and the engine marker) are at v1 and have no row, so they are not listed.
 */
const CHAIN_VERSIONS: Readonly<Record<string, number>> = {
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

interface Registration {
  registeredAs: string | null
  options: { cwd: string; name?: string }
  declaration: { kind: Kind; tokenBearing?: true }
}

/** `config` files that hold an account (the sign-in state), beyond the token-bearing flag. */
const ACCOUNT_CONFIG_DIRS = new Set([
  'gog_store',
  'nile_store',
  'legendary_store'
])

/**
 * Rows no TS construction in `registeredStores.json` reaches.
 *
 * `steam_update_prompt_ack` and `steam_engine_notices` are CacheStores built through a helper the
 * registration scan does not see; `EXPECTED_KINDS` in `storeKinds.test.ts` names both as user-state
 * and 82-STATE-OWNERSHIP lists them under "Persisted stores". `uploadedLogs` flipped to the native
 * logger in Phase 84 (no TS store is built for it any more) and uses a literal URL as a key, so its
 * dot paths are off. `store/migrations` lost its TS store in 85-21 with the TS migration system (D-06);
 * the file stays on disk (D-07) and its row stays so the table still records that Rust never opens it
 * (the `excluded` family) and the corpus's `migrations.json` files still resolve to a row. The two
 * settings rows are the documents `config.json` and `GamesConfig/<app>.json`. `store/game-overrides` lost
 * its TS store in Phase 86 (86-11, D-29 row 5): per-game overrides are Rust's (`gamelib-info`), the
 * `StoreHost` keeps opening the file as user-state, and `gameOverridesStore` stays in `tsNames` so the
 * renderer's own store resolves to this row. Each later 86 delete (86-17, 86-24) adds its store here.
 */
const EXTRA_ROWS: Omit<Row, 'family' | 'chain'>[] = [
  ...['steam_update_prompt_ack', 'steam_engine_notices'].map((name) => ({
    key: `store_cache/${name}`,
    dir: 'store_cache',
    name,
    tsNames: [name],
    kind: 'user-state' as const,
    tokenBearing: false,
    dotPaths: true,
    flavour: 'store' as const
  })),
  {
    key: 'store/migrations',
    dir: 'store',
    name: 'migrations',
    tsNames: [],
    kind: 'user-state',
    tokenBearing: false,
    dotPaths: true,
    flavour: 'store'
  },
  {
    key: 'store/game-overrides',
    dir: 'store',
    name: 'game-overrides',
    tsNames: ['gameOverridesStore'],
    kind: 'user-state',
    tokenBearing: false,
    dotPaths: true,
    flavour: 'store'
  },
  {
    key: 'store/uploadedLogs',
    dir: 'store',
    name: 'uploadedLogs',
    tsNames: ['uploadedLogs'],
    kind: 'cache',
    tokenBearing: false,
    dotPaths: false,
    flavour: 'store'
  },
  {
    key: 'settings/global',
    dir: '',
    name: 'config',
    tsNames: [],
    kind: 'user-state',
    tokenBearing: false,
    dotPaths: true,
    flavour: 'settings'
  },
  {
    key: 'settings/game',
    dir: 'GamesConfig',
    name: null,
    tsNames: [],
    kind: 'user-state',
    tokenBearing: false,
    dotPaths: true,
    flavour: 'settings'
  }
]

/** The family rule, in precedence order: the specific files first, then the kinds. */
export function familyOf(
  row: Pick<Row, 'key' | 'dir' | 'name' | 'kind' | 'tokenBearing'>
): Family {
  if (row.key === 'store/migrations') return 'excluded' // D-07: Rust never opens it
  if (row.key === 'store/uploadedLogs') return 'native'
  if (row.key === 'store/config') return 'settings'
  if (row.key.startsWith('settings/')) return 'settings'
  if (
    row.tokenBearing ||
    (row.name === 'config' && ACCOUNT_CONFIG_DIRS.has(row.dir))
  )
    return 'account'
  if (row.kind === 'cache') return 'cache'
  return 'user-state'
}

function readRegistrations(): Registration[] {
  return JSON.parse(
    readFileSync(join(process.cwd(), REGISTERED_REL), 'utf8')
  ) as Registration[]
}

/** Registrations grouped by the file they write: `<userData>/store` is `store`, no name is `config`. */
function groupByFile(regs: Registration[]): Omit<Row, 'family' | 'chain'>[] {
  const byKey = new Map<string, Omit<Row, 'family' | 'chain'>>()
  for (const reg of regs) {
    const dir = reg.options.cwd.replace(/^<userData>\//, '')
    const name = reg.options.name ?? 'config'
    const key = `${dir}/${name}`
    const tsName = reg.registeredAs ?? name
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, {
        key,
        dir,
        name,
        tsNames: [tsName],
        kind: reg.declaration.kind,
        tokenBearing: reg.declaration.tokenBearing === true,
        dotPaths: true,
        flavour: 'store'
      })
      continue
    }
    if (existing.kind !== reg.declaration.kind)
      throw new Error(
        `${key} is registered as both ${existing.kind} and ${reg.declaration.kind}`
      )
    if (!existing.tsNames.includes(tsName)) existing.tsNames.push(tsName)
    if (reg.declaration.tokenBearing) existing.tokenBearing = true
  }
  return [...byKey.values()]
}

/** The table, in memory. Pure apart from reading the registrations fixture. */
export function buildStoreTable(): StoreTable {
  const rows: Row[] = [...groupByFile(readRegistrations()), ...EXTRA_ROWS].map(
    (r) => ({
      ...r,
      tsNames: [...r.tsNames].sort(),
      family: familyOf(r),
      chain: Object.prototype.hasOwnProperty.call(CHAIN_VERSIONS, r.key)
        ? r.key
        : null
    })
  )
  const seen = new Set<string>()
  for (const r of rows) {
    if (seen.has(r.key)) throw new Error(`duplicate store table key ${r.key}`)
    seen.add(r.key)
  }
  rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const chainVersions = Object.fromEntries(
    Object.entries(CHAIN_VERSIONS).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
  )
  return { generatedBy: GENERATOR, chainVersions, rows }
}

/** The committed bytes: the table through prettier's JSON parser, so `prettier --check` passes. */
async function renderStoreTable(table: StoreTable): Promise<string> {
  // Resolved from the repo at run time, not bundled: prettier 3 is an ES module package that does not
  // survive esbuild's CommonJS bundle, and jest never calls this (it compares `buildStoreTable()`).
  const prettier = createRequire(join(process.cwd(), 'package.json'))(
    'prettier'
  ) as typeof import('prettier')
  const options =
    (await prettier.resolveConfig(join(process.cwd(), TABLE_REL))) ?? {}
  return prettier.format(JSON.stringify(table), { ...options, parser: 'json' })
}

async function main(): Promise<void> {
  const next = await renderStoreTable(buildStoreTable())
  const path = join(process.cwd(), TABLE_REL)
  if (process.argv.slice(2).includes('--check')) {
    let current = ''
    try {
      current = readFileSync(path, 'utf8')
    } catch {
      // missing counts as stale
    }
    if (current !== next) {
      console.error(`::error::${TABLE_REL} is stale; run ${REGEN_CMD}`)
      process.exit(1)
    }
    console.log(`${TABLE_REL} is up to date`)
    return
  }
  writeFileSync(path, next)
  console.log(`wrote ${TABLE_REL}`)
}

// Guarded so the jest suite can import the pure builder without running the CLI.
if (!process.env.JEST_WORKER_ID) {
  main().catch((e: unknown) => {
    console.error(e)
    process.exit(1)
  })
}
