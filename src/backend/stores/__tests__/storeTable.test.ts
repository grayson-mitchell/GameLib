/**
 * The generated store table (Phase 85, D-11) cannot drift from the TS registry.
 *
 * `src/common/types/ipc/storeTable.json` is what the Rust store reads. This suite regenerates it in memory
 * and fails on any difference, and ties it to `EXPECTED_KINDS` (the kind decision per TS store) and to
 * `STORE_MIGRATIONS` (the chains), so adding a store or a chain on one side without the other fails here.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  buildStoreTable,
  familyOf,
  TABLE_REL,
  type Row,
  type StoreTable
} from '../../../../meta/genStoreTable'
import { STORE_MIGRATIONS } from '../../storeMigrations'

const root = join(__dirname, '..', '..', '..', '..')

const committed = (): StoreTable =>
  JSON.parse(readFileSync(join(root, TABLE_REL), 'utf8')) as StoreTable

/** The `EXPECTED_KINDS` object literal of storeKinds.test.ts, parsed from its text (it is not exported). */
function expectedKinds(): Record<string, string> {
  const text = readFileSync(
    join(root, 'src/backend/__tests__/storeKinds.test.ts'),
    'utf8'
  )
  const start = text.indexOf('const EXPECTED_KINDS')
  const end = text.indexOf('\n}\n', start)
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  const out: Record<string, string> = {}
  for (const m of text
    .slice(start, end)
    .matchAll(/^\s*(\w+): '(cache|user-state)',?$/gm)) {
    out[m[1] as string] = m[2] as string
  }
  return out
}

/** Chains the engine keeps for files that are not conf stores, so they have no table row. */
const CHAINS_WITHOUT_ROWS = [
  'engine/gamelib-engine-marker',
  'steam_bridge/shared-redists'
]

describe('storeTable.json', () => {
  it('equals what the generator produces now', () => {
    expect(committed()).toEqual(buildStoreTable())
  })

  it('names every EXPECTED_KINDS store with the same kind', () => {
    const kinds = expectedKinds()
    const names = Object.keys(kinds)
    // The parse cannot pass vacuously: the literal holds 54 names today.
    expect(names.length).toBeGreaterThanOrEqual(50)
    const rows = committed().rows
    const missing: string[] = []
    const wrongKind: string[] = []
    for (const name of names) {
      const row = rows.find((r) => r.tsNames.includes(name))
      if (!row) missing.push(name)
      else if (row.kind !== kinds[name]) wrongKind.push(name)
    }
    expect(missing).toEqual([])
    expect(wrongKind).toEqual([])
  })

  it('puts steamConfigStore and steamBottleConfigStore in one row', () => {
    const rows = committed().rows.filter(
      (r) =>
        r.tsNames.includes('steamConfigStore') ||
        r.tsNames.includes('steamBottleConfigStore')
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      key: 'steam_store/config',
      tokenBearing: true,
      family: 'account'
    })
    expect(rows[0]?.tsNames).toEqual([
      'steamBottleConfigStore',
      'steamConfigStore'
    ])
  })

  it('excludes store/migrations: Rust never opens it (D-07)', () => {
    const excluded = committed().rows.filter((r) => r.family === 'excluded')
    expect(excluded.map((r) => r.key)).toEqual(['store/migrations'])
  })

  it('has unique, sorted keys and the family the rule gives', () => {
    const rows = committed().rows
    const keys = rows.map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual(keys)
    for (const r of rows)
      expect([r.key, familyOf(r)]).toEqual([r.key, r.family])
  })

  it('treats the special stores as decided', () => {
    const byKey = (k: string): Row => {
      const r = committed().rows.find((x) => x.key === k)
      if (!r) throw new Error(`no row ${k}`)
      return r
    }
    expect(byKey('store/uploadedLogs')).toMatchObject({
      family: 'native',
      kind: 'cache',
      dotPaths: false
    })
    expect(byKey('store/config').family).toBe('settings')
    for (const k of [
      'gog_store/config',
      'nile_store/config',
      'legendary_store/config',
      'humble_store/config'
    ])
      expect(byKey(k).family).toBe('account')
    for (const k of ['steam_update_prompt_ack', 'steam_engine_notices'])
      expect(byKey(`store_cache/${k}`)).toMatchObject({
        kind: 'user-state',
        family: 'user-state'
      })
    expect(byKey('settings/global')).toMatchObject({
      dir: '',
      name: 'config',
      flavour: 'settings',
      chain: 'settings/global'
    })
    expect(byKey('settings/game')).toMatchObject({
      dir: 'GamesConfig',
      name: null,
      flavour: 'settings',
      chain: 'settings/game'
    })
    // Only the settings documents use the settings codec.
    for (const r of committed().rows)
      expect([r.key, r.flavour]).toEqual([
        r.key,
        r.key.startsWith('settings/') ? 'settings' : 'store'
      ])
  })

  it('carries a chain exactly where STORE_MIGRATIONS has one', () => {
    const chainKeys = Object.keys(STORE_MIGRATIONS)
    const rows = committed().rows
    for (const r of rows)
      expect([r.key, r.chain]).toEqual([
        r.key,
        chainKeys.includes(r.key) ? r.key : null
      ])
    const rowKeys = new Set(rows.map((r) => r.key))
    const orphans = chainKeys.filter(
      (k) => !rowKeys.has(k) && !CHAINS_WITHOUT_ROWS.includes(k)
    )
    expect(orphans).toEqual([])
  })
})
