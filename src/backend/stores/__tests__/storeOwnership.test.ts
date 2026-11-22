/**
 * Who owns a store file, on the sidecar's side (Phase 85 plan 11, FND-06, D-01): `GAMELIB_STORE`,
 * the committed `storeOwnership.json` and `storeTable.json`, and the shell's `GAMELIB_STORE_BOOT`
 * report. `store_boot.rs` reads the same two JSON files and decides the same question, so a store
 * this process mirrors is a store the shell opened; these cases pin the sidecar's half of that.
 */
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import { RECOGNIZED_CACHE_STORE_NAMES } from 'common/types/storePolicy'
import {
  dotPathsFor,
  isRustOwned,
  isStoreKey,
  readStoreBootEnv,
  resolveStoreMode
} from '../storeOwnership'

const NONE = { families: {}, stores: {} }

let stderr: jest.SpiedFunction<typeof process.stderr.write>
beforeEach(() => {
  stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
})
afterEach(() => {
  jest.restoreAllMocks()
})
const logged = () => stderr.mock.calls.map((c) => String(c[0])).join('')

describe('resolveStoreMode', () => {
  it('is rust when unset and when it says rust, ts when it says ts, all without a warning', () => {
    expect(resolveStoreMode({})).toBe('rust')
    expect(resolveStoreMode({ GAMELIB_STORE: undefined })).toBe('rust')
    expect(resolveStoreMode({ GAMELIB_STORE: 'rust' })).toBe('rust')
    expect(resolveStoreMode({ GAMELIB_STORE: 'ts' })).toBe('ts')
    expect(stderr).not.toHaveBeenCalled()
  })

  it('falls back to ts, the stack that has always run, with one line for any other value', () => {
    expect(resolveStoreMode({ GAMELIB_STORE: 'TS ' })).toBe('ts')
    expect(logged().match(/not recognised; using ts/g)).toHaveLength(1)
    expect(resolveStoreMode({ GAMELIB_STORE: '' })).toBe('ts')
    expect(resolveStoreMode({ GAMELIB_STORE: 'rust ' })).toBe('ts')
    expect(stderr).toHaveBeenCalledTimes(3)
  })

  it('echoes only printable characters, cut short', () => {
    resolveStoreMode({ GAMELIB_STORE: `\u001b[31m${'x'.repeat(200)}\n` })
    const line = logged()
    expect(line).not.toContain('\u001b')
    expect(line.length).toBeLessThan(120)
  })
})

describe('isRustOwned', () => {
  it('owns the native rows in either mode and never the excluded ones', () => {
    for (const mode of ['rust', 'ts'] as const) {
      expect(isRustOwned('store/uploadedLogs', mode, NONE)).toBe(true)
      expect(isRustOwned('store/migrations', mode, NONE)).toBe(false)
    }
  })

  it('owns every other row only in rust mode, and only when its family flag is set', () => {
    const cache = { families: { cache: true }, stores: {} }
    expect(isRustOwned('store_cache/umu', 'rust', cache)).toBe(true)
    expect(isRustOwned('store_cache/umu', 'ts', cache)).toBe(false)
    expect(isRustOwned('store_cache/umu', 'rust', NONE)).toBe(false)
    // A family flag reaches a store of that family and no other.
    expect(isRustOwned('store/config', 'rust', cache)).toBe(false)
    expect(isRustOwned('steam_store/config', 'rust', cache)).toBe(false)
  })

  it('lets a store’s own flag win over its family’s, in both directions', () => {
    const on = {
      families: { cache: false },
      stores: { 'store_cache/umu': true }
    }
    expect(isRustOwned('store_cache/umu', 'rust', on)).toBe(true)
    expect(isRustOwned('store_cache/itad_prices', 'rust', on)).toBe(false)
    const off = {
      families: { cache: true },
      stores: { 'store_cache/umu': false }
    }
    expect(isRustOwned('store_cache/umu', 'rust', off)).toBe(false)
    expect(isRustOwned('store_cache/itad_prices', 'rust', off)).toBe(true)
  })

  it('treats a recognised runtime store_cache name the table does not list as a cache-family store', () => {
    const cache = { families: { cache: true }, stores: {} }
    const recognised = ['fresh_runtime_cache']
    const owned = (
      mode: 'rust' | 'ts',
      own: {
        families: Record<string, boolean>
        stores: Record<string, boolean>
      }
    ) => isRustOwned('store_cache/fresh_runtime_cache', mode, own, recognised)
    expect(owned('rust', cache)).toBe(true)
    expect(owned('ts', cache)).toBe(false)
    expect(owned('rust', NONE)).toBe(false)
    expect(
      owned('rust', {
        families: {},
        stores: { 'store_cache/fresh_runtime_cache': true }
      })
    ).toBe(true)
  })

  it('refuses a runtime store_cache name the store policy does not recognise, whatever the flags say (T-85-30)', () => {
    const all = {
      families: { cache: true },
      stores: { 'store_cache/brand_new_cache': true }
    }
    expect(isRustOwned('store_cache/brand_new_cache', 'rust', all)).toBe(false)
    expect(isRustOwned('store_cache/brand_new_cache', 'rust', all, [])).toBe(
      false
    )
    // A table row decides for itself: it never needs to be in the recognised list.
    expect(isRustOwned('store_cache/umu', 'rust', all, [])).toBe(true)
    // The shipped list is the policy's: every recognised name today is a user-state table row, so
    // the cache family alone reaches none of them.
    for (const name of RECOGNIZED_CACHE_STORE_NAMES) {
      expect(isStoreKey(`store_cache/${name}`)).toBe(true)
      expect(isRustOwned(`store_cache/${name}`, 'rust', all)).toBe(false)
    }
  })

  it('resolves GamesConfig/<app> through the settings/game pattern row', () => {
    const settings = { families: { settings: true }, stores: {} }
    expect(isRustOwned('GamesConfig/Fortnite', 'rust', settings)).toBe(true)
    expect(isRustOwned('GamesConfig/Fortnite', 'ts', settings)).toBe(false)
    expect(isRustOwned('GamesConfig/..', 'rust', settings)).toBe(false)
    expect(isRustOwned('GamesConfig/a/b', 'rust', settings)).toBe(false)
  })

  it('never owns a key that names no store, or a prototype property', () => {
    const everything = {
      families: {
        cache: true,
        'user-state': true,
        account: true,
        settings: true
      },
      stores: {}
    }
    for (const key of [
      '',
      'nope',
      'store_cache/',
      'store_cache/has space',
      '../store/config',
      'settings/game',
      '__proto__',
      'constructor',
      'toString'
    ]) {
      expect(isRustOwned(key, 'rust', everything)).toBe(false)
      expect(isStoreKey(key)).toBe(false)
    }
    // A store key that names a prototype property is data, never a lookup through the chain.
    const hostile = JSON.parse('{"families":{},"stores":{"__proto__":true}}')
    expect(isRustOwned('store_cache/umu', 'rust', hostile)).toBe(false)
  })

  it('reads the committed ownership file: the cache (85-12), user-state (85-13) and account (85-14) families are Rust’s and settings has not moved yet', () => {
    expect(isRustOwned('store_cache/wikigameinfo', 'rust')).toBe(true)
    expect(isRustOwned('store_cache/wikigameinfo', 'ts')).toBe(false)
    expect(ownershipFile.families.cache).toBe(true)
    // The 85-10 tracer's own override is gone: the family covers that store now.
    expect(Object.keys(ownershipFile.stores)).toEqual([])
    expect(ownershipFile.families['user-state']).toBe(true)
    expect(ownershipFile.families.account).toBe(true)
    expect(ownershipFile.families.settings).toBe(false)
    // Every flag in the file names a family or a store that exists in the table.
    const families = new Set(tableFile.rows.map((r) => r.family))
    for (const family of Object.keys(ownershipFile.families)) {
      expect(families.has(family)).toBe(true)
    }
    for (const store of Object.keys(ownershipFile.stores)) {
      expect(isStoreKey(store)).toBe(true)
    }
  })

  it('has a family and a dot-path flag for every row of the table', () => {
    expect(tableFile.rows.length).toBeGreaterThanOrEqual(50)
    for (const row of tableFile.rows) {
      if (row.name !== null) expect(isStoreKey(row.key)).toBe(true)
      expect(dotPathsFor(row.key)).toBe(row.dotPaths)
    }
    expect(dotPathsFor('store/uploadedLogs')).toBe(false)
  })
})

describe('readStoreBootEnv', () => {
  const parse = (value: unknown) =>
    readStoreBootEnv({ GAMELIB_STORE_BOOT: JSON.stringify(value) })

  it('is empty, silently, when the shell reported nothing', () => {
    for (const env of [
      {},
      { GAMELIB_STORE_BOOT: undefined },
      { GAMELIB_STORE_BOOT: '' }
    ]) {
      const boot = readStoreBootEnv(env)
      expect(boot.readOnly.size).toBe(0)
      expect(boot.startEmpty.size).toBe(0)
    }
    expect(stderr).not.toHaveBeenCalled()
  })

  it('reads the read-only stores with their reasons and the stores that start empty', () => {
    const boot = parse({
      readOnly: [
        { store: 'store/config', reason: 'newer' },
        { store: 'steam_store/config', reason: 'failed' }
      ],
      startEmpty: ['store_cache/steam_metadata']
    })
    expect([...boot.readOnly]).toEqual([
      ['store/config', 'newer'],
      ['steam_store/config', 'failed']
    ])
    expect([...boot.startEmpty]).toEqual(['store_cache/steam_metadata'])
    expect(stderr).not.toHaveBeenCalled()
  })

  it('skips entries of the wrong shape or with an unknown reason, keeping the good ones', () => {
    const boot = parse({
      readOnly: [
        null,
        'store/config',
        { store: 4, reason: 'newer' },
        { store: 'store/config', reason: 'whatever' },
        { store: 'store/config' },
        { store: 'gog_store/config', reason: 'newer' }
      ],
      startEmpty: [1, null, 'store_cache/umu']
    })
    expect([...boot.readOnly]).toEqual([['gog_store/config', 'newer']])
    expect([...boot.startEmpty]).toEqual(['store_cache/umu'])
  })

  it('returns no entries and writes one line for malformed input, never echoing it', () => {
    for (const text of ['{nope TOKEN-VALUE', '[1,2]', '"text"', '4', 'null']) {
      const boot = readStoreBootEnv({ GAMELIB_STORE_BOOT: text })
      expect(boot.readOnly.size).toBe(0)
      expect(boot.startEmpty.size).toBe(0)
    }
    expect(stderr).toHaveBeenCalledTimes(5)
    expect(logged()).not.toContain('TOKEN-VALUE')
  })

  it('ignores fields it does not know and a non-array readOnly or startEmpty', () => {
    const boot = parse({ readOnly: 'store/config', startEmpty: {}, extra: 1 })
    expect(boot.readOnly.size).toBe(0)
    expect(boot.startEmpty.size).toBe(0)
    expect(stderr).not.toHaveBeenCalled()
  })
})
