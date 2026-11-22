/**
 * The token-bearing and account family moves to the Rust owner (Phase 85 plan 14, FND-06, D-01 third
 * family).
 *
 * `storeOwnership.json` sets `families.account`, so under `GAMELIB_STORE=rust` (the default) the five
 * account configs (`steam_store`, `humble_store`, `gog_store`, `nile_store`, `legendary_store`) are
 * windows onto mirror cells and each write is a frame for the shell's single writer; under
 * `GAMELIB_STORE=ts` they are conf-backed exactly as before. `steamConfigStore` and
 * `steamBottleConfigStore` share `steam_store/config.json` and so share one cell (D-11, 85-SPIKES S1
 * rule 5). The secrets themselves never live here: they are in the shell's keyring_dispatch (D-14),
 * and what these files may still hold from older profiles (`steam:v1:` / `humble:v1:` ciphertext,
 * unknown keys) is carried through a re-save untouched. The Rust half is `cargo test -p gamelib-store
 * host::tighten` (file modes, ciphertext bytes) and `cargo test --bin gamelib-shell keyring_`.
 *
 * Every value below is a synthetic placeholder.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import { createStores } from '../createStores'
import { createStoreRegistry } from '../storeRegistry'
import type { StoreFrame, StoreFrameSink } from '../storeFrames'
import { isRustOwned } from '../storeOwnership'
import type { StoreMode } from '../storeOwnership'
import { createTestStoreRoot } from '../../testUtils/testStoreRoot'

const ACCOUNT_ROWS = tableFile.rows.filter(
  (row) => row.family === 'account' && row.name !== null
)

interface Probe {
  set(key: string, value: unknown): void
  get(key: string, fallback?: unknown): unknown
  delete(key: string): void
}

type Stores = ReturnType<typeof createStores>

/** Every TS store built over a table row's file, found by the file path it was built over. */
function storesOfRow(
  userData: string,
  rowKey: string,
  stores: Stores
): Probe[] {
  const expected = join(userData, `${rowKey}.json`)
  const found: Probe[] = []
  for (const family of Object.values(stores)) {
    for (const store of Object.values(family as Record<string, unknown>)) {
      const backing = (store as { store?: { path?: string } } | undefined)
        ?.store
      if (backing?.path === expected) found.push(store as Probe)
    }
  }
  if (found.length === 0)
    throw new Error(`createStores built no store for ${rowKey}`)
  return found
}

function build(
  userData: string,
  mode: StoreMode,
  frames: StoreFrame[],
  frameSink?: StoreFrameSink
) {
  const root = createTestStoreRoot(userData, {
    storeMode: mode,
    ...(frameSink ? { frameSink } : { recordFrames: frames })
  })
  const stores = createStores({ registry: createStoreRegistry(), root })
  return { root, stores }
}

let userData: string
beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'gamelib-account-family-'))
})
afterEach(() => {
  rmSync(userData, { recursive: true, force: true })
})

describe(`the account family (${ACCOUNT_ROWS.length} account rows)`, () => {
  it('is flipped by the family flag alone, after cache and user-state, before settings (85-15)', () => {
    expect(ownershipFile.families.account).toBe(true)
    expect(ownershipFile.families.cache).toBe(true)
    expect(ownershipFile.families['user-state']).toBe(true)
    expect(ownershipFile.families.settings).toBe(true)
    expect(Object.keys(ownershipFile.stores)).toEqual([])
  })

  it('names exactly the five account configs, two of them token-bearing (D-01)', () => {
    expect(ACCOUNT_ROWS.map((row) => row.key).sort()).toEqual([
      'gog_store/config',
      'humble_store/config',
      'legendary_store/config',
      'nile_store/config',
      'steam_store/config'
    ])
    expect(
      ACCOUNT_ROWS.filter((row) => row.tokenBearing)
        .map((row) => row.key)
        .sort()
    ).toEqual(['humble_store/config', 'steam_store/config'])
    const steam = ACCOUNT_ROWS.find((row) => row.key === 'steam_store/config')
    expect([...(steam?.tsNames ?? [])].sort()).toEqual([
      'steamBottleConfigStore',
      'steamConfigStore'
    ])
  })

  it('is Rust-owned under rust and TS-owned under ts', () => {
    for (const row of ACCOUNT_ROWS) {
      expect(isRustOwned(row.key, 'rust')).toBe(true)
      expect(isRustOwned(row.key, 'ts')).toBe(false)
    }
  })

  describe.each(ACCOUNT_ROWS.map((row) => [row.key, row] as const))(
    '%s',
    (_key, row) => {
      it('builds one TS store per name the table lists for the file', () => {
        const { stores } = build(userData, 'rust', [])
        expect(storesOfRow(userData, row.key, stores)).toHaveLength(
          row.tsNames.length
        )
      })

      it.each(row.tsNames.map((name, index) => [name, index] as const))(
        'is mirror-backed under rust through %s: a write is a frame for this store',
        (_name, index) => {
          const frames: StoreFrame[] = []
          const { stores } = build(userData, 'rust', frames)
          storesOfRow(userData, row.key, stores)[index]?.set(
            'accountFamilyProbe',
            { n: 1 }
          )
          expect(frames).toHaveLength(1)
          expect(frames[0]).toMatchObject({
            store: row.key,
            op: 'set',
            key: 'accountFamilyProbe'
          })
          // The disk sink stood in for the shell: the file sits at <userData>/<key>.json.
          expect(
            readFileSync(join(userData, `${row.key}.json`), 'utf8')
          ).toContain('accountFamilyProbe')
        }
      )

      it('is conf-backed under GAMELIB_STORE=ts: a write sends no frame and conf writes the file', () => {
        const frames: StoreFrame[] = []
        const { stores } = build(userData, 'ts', frames)
        for (const store of storesOfRow(userData, row.key, stores)) {
          store.set('accountFamilyProbe', { n: 1 })
        }
        expect(frames).toEqual([])
        expect(
          readFileSync(join(userData, `${row.key}.json`), 'utf8')
        ).toContain('accountFamilyProbe')
      })
    }
  )
})

describe('steam_store/config: steamConfigStore and steamBottleConfigStore are one cell over one file (D-11)', () => {
  const steamPair = (stores: Stores) => ({
    config: stores.steam.configStore as unknown as Probe,
    bottle: stores.steam.steamBottleConfigStore as unknown as Probe
  })

  /** Interleaved writes through both names, nested dot paths included. */
  function interleave(stores: Stores) {
    const { config, bottle } = steamPair(stores)
    config.set('isLoggedIn', true)
    bottle.set('bottleName', 'placeholder-bottle')
    config.set('userData.username', 'placeholder-user')
    bottle.set('provisioned', true)
    config.set('userData.steamId', 'placeholder-id')
    bottle.set('bottleName', 'placeholder-bottle-2')
  }

  const FRAME_ORDER = [
    ['set', 'isLoggedIn', 'true'],
    ['set', 'bottleName', '"placeholder-bottle"'],
    ['set', 'userData.username', '"placeholder-user"'],
    ['set', 'provisioned', 'true'],
    ['set', 'userData.steamId', '"placeholder-id"'],
    ['set', 'bottleName', '"placeholder-bottle-2"']
  ]

  it('both names resolve to the same file path', () => {
    const { stores } = build(userData, 'rust', [])
    const paths = storesOfRow(userData, 'steam_store/config', stores).map(
      (store) => (store as unknown as { store: { path: string } }).store.path
    )
    expect(paths).toEqual([
      join(userData, 'steam_store', 'config.json'),
      join(userData, 'steam_store', 'config.json')
    ])
  })

  it('a write through one name is read through the other at once, before the shell answers (one cell)', () => {
    // A sink that never answers: every write stays pending in the cell. Two cells would each hold
    // only their own pending ops; one shared cell shows each name the other's write immediately.
    const sent: StoreFrame[] = []
    const silent: StoreFrameSink = {
      send: (frame) => {
        sent.push(frame)
      }
    }
    const { stores } = build(userData, 'rust', [], silent)
    const { config, bottle } = steamPair(stores)
    config.set('isLoggedIn', true)
    expect(bottle.get('isLoggedIn')).toBe(true)
    bottle.set('bottleName', 'placeholder-bottle')
    expect(config.get('bottleName')).toBe('placeholder-bottle')
    config.set('userData.username', 'placeholder-user')
    expect(bottle.get('userData')).toEqual({ username: 'placeholder-user' })
    bottle.delete('isLoggedIn')
    expect(config.get('isLoggedIn', 'unset')).toBe('unset')
    expect(sent.map((frame) => [frame.store, frame.op, frame.key])).toEqual([
      ['steam_store/config', 'set', 'isLoggedIn'],
      ['steam_store/config', 'set', 'bottleName'],
      ['steam_store/config', 'set', 'userData.username'],
      ['steam_store/config', 'delete', 'isLoggedIn']
    ])
  })

  it('interleaved writes are frames in call order, all naming the one store', () => {
    const frames: StoreFrame[] = []
    const { stores } = build(userData, 'rust', frames)
    interleave(stores)
    expect(
      frames.map((frame) => [frame.store, frame.op, frame.key, frame.valueJson])
    ).toEqual(
      FRAME_ORDER.map(([op, key, valueJson]) => [
        'steam_store/config',
        op,
        key,
        valueJson
      ])
    )
  })

  it('leaves one file whose bytes are the stamped view serialised with tabs, equal to conf’s for the same writes', () => {
    const tsDir = mkdtempSync(join(tmpdir(), 'gamelib-account-family-ts-'))
    try {
      const rust = build(userData, 'rust', [])
      interleave(rust.stores)
      const ts = build(tsDir, 'ts', [])
      interleave(ts.stores)

      const file = join(userData, 'steam_store', 'config.json')
      const text = readFileSync(file, 'utf8')
      const onDisk = JSON.parse(text) as Record<string, unknown>
      const { __internal__: envelope, ...data } = onDisk
      expect(envelope).toEqual({
        gamelib: {
          schemaVersion:
            rust.root.versioning.currentVersionOf('steam_store/config')
        }
      })
      expect(data).toEqual({
        isLoggedIn: true,
        bottleName: 'placeholder-bottle-2',
        userData: { username: 'placeholder-user', steamId: 'placeholder-id' },
        provisioned: true
      })
      expect(text).toBe(JSON.stringify(onDisk, undefined, '\t'))
      expect(text).toBe(
        readFileSync(join(tsDir, 'steam_store', 'config.json'), 'utf8')
      )
      // Both names read the final state back.
      const { config, bottle } = steamPair(rust.stores)
      expect(config.get('bottleName')).toBe('placeholder-bottle-2')
      expect(bottle.get('userData')).toEqual({
        username: 'placeholder-user',
        steamId: 'placeholder-id'
      })
    } finally {
      rmSync(tsDir, { recursive: true, force: true })
    }
  })
})

describe('older profiles: ciphertext and unknown keys survive a re-save untouched (T-85-36)', () => {
  /** An older account file: ciphertext-shaped placeholder values, an unknown key, the envelope last. */
  function fixture(rowKey: string, version: number): Record<string, unknown> {
    const token =
      rowKey === 'steam_store/config'
        ? { refreshToken: 'steam:v1:REDACTED' }
        : { sessionCookie: 'humble:v1:REDACTED', csrf: 'humble:v1:REDACTED' }
    return {
      ...token,
      isLoggedIn: false,
      aFieldFromALaterVersion: { nested: [1, 'steam:v1:REDACTED'] },
      __internal__: { gamelib: { schemaVersion: version } }
    }
  }

  it.each(['steam_store/config', 'humble_store/config'])(
    '%s re-saves with every other key byte-identical',
    (rowKey) => {
      const probe = createTestStoreRoot(userData)
      const version = probe.versioning.currentVersionOf(rowKey)
      const file = join(userData, `${rowKey}.json`)
      mkdirSync(join(file, '..'), { recursive: true })
      const doc = fixture(rowKey, version)
      const text = JSON.stringify(doc, undefined, '\t')
      writeFileSync(file, text)

      const frames: StoreFrame[] = []
      const { stores } = build(userData, 'rust', frames)
      const [store] = storesOfRow(userData, rowKey, stores)
      // Reads see the older keys as they are.
      expect(store?.get('aFieldFromALaterVersion')).toEqual(
        doc.aFieldFromALaterVersion
      )
      store?.set('isLoggedIn', true)

      expect(frames).toHaveLength(1)
      expect(readFileSync(file, 'utf8')).toBe(
        text.replace('"isLoggedIn": false', '"isLoggedIn": true')
      )
    }
  )
})
