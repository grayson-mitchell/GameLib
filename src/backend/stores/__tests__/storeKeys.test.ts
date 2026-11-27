/**
 * Which store keys the shell owns, on the sidecar's side (Phase 85, FND-06). Since 85-21 (D-03)
 * there is no rollback flag and no ownership file: `storeFrames.ts` reads `storeTable.json`, the same
 * table `store_boot.rs` reads, and every row the shell opens is Rust's. These cases pin the sidecar's
 * half of that (moved from the deleted storeOwnership suite).
 */
import tableFile from 'common/types/ipc/storeTable.json'
import { RECOGNIZED_CACHE_STORE_NAMES } from 'common/types/storePolicy'
import {
  dotPathsFor,
  isRustOwnedStoreKey,
  isRustOwnedStoreName,
  isStoreKey
} from '../storeFrames'

describe('isRustOwnedStoreKey', () => {
  it('owns every row with a file but the excluded store/migrations (D-07)', () => {
    for (const row of tableFile.rows) {
      if (row.name === null) continue
      expect([row.key, isRustOwnedStoreKey(row.key)]).toEqual([
        row.key,
        row.family !== 'excluded'
      ])
    }
    expect(isRustOwnedStoreKey('store/uploadedLogs')).toBe(true)
    expect(isRustOwnedStoreKey('store/migrations')).toBe(false)
    expect(isStoreKey('store/migrations')).toBe(true)
  })

  it('owns no runtime store_cache name the table does not list (T-85-30)', () => {
    // Shape-valid (the shared vectors need it to parse) but never the shell's.
    for (const key of [
      'store_cache/fresh_runtime_cache',
      'store_cache/brand_new_cache'
    ]) {
      expect([key, isStoreKey(key)]).toEqual([key, true])
      expect([key, isRustOwnedStoreKey(key)]).toEqual([key, false])
    }
    // A table row decides for itself, in or out of the recognised list.
    expect(isRustOwnedStoreKey('store_cache/umu')).toBe(true)
    // Every recognised name is a table row the shell owns.
    expect(RECOGNIZED_CACHE_STORE_NAMES.length).toBeGreaterThan(0)
    for (const name of RECOGNIZED_CACHE_STORE_NAMES) {
      const key = `store_cache/${name}`
      expect([key, tableFile.rows.some((row) => row.key === key)]).toEqual([
        key,
        true
      ])
      expect(isStoreKey(key)).toBe(true)
      expect(isRustOwnedStoreKey(key)).toBe(true)
    }
  })

  it('resolves GamesConfig/<app> through the settings/game pattern row', () => {
    expect(isRustOwnedStoreKey('GamesConfig/Fortnite')).toBe(true)
    expect(isRustOwnedStoreKey('settings/global')).toBe(true)
    expect(isRustOwnedStoreKey('GamesConfig/..')).toBe(false)
    expect(isRustOwnedStoreKey('GamesConfig/a/b')).toBe(false)
  })

  it('never owns a key that names no store, or a prototype property', () => {
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
      expect(isRustOwnedStoreKey(key)).toBe(false)
      expect(isStoreKey(key)).toBe(false)
    }
  })

  it('has a dot-path flag for every row of the table', () => {
    expect(tableFile.rows.length).toBeGreaterThanOrEqual(50)
    for (const row of tableFile.rows) {
      if (row.name !== null) expect(isStoreKey(row.key)).toBe(true)
      expect(dotPathsFor(row.key)).toBe(row.dotPaths)
    }
    expect(dotPathsFor('store/uploadedLogs')).toBe(false)
  })
})

describe('isRustOwnedStoreName', () => {
  it('resolves a TS store name through the table, else as a runtime cache', () => {
    expect(isRustOwnedStoreName('timestampStore')).toBe(true)
    expect(isRustOwnedStoreName('steamBottleConfigStore')).toBe(true)
    expect(isRustOwnedStoreName('wikigameinfo')).toBe(true)
    expect(isRustOwnedStoreName('steam_library')).toBe(true)
    // An unknown or unrecognised name is never Rust's, so the sidecar keeps its push for it.
    expect(isRustOwnedStoreName('brand_new_cache')).toBe(false)
    expect(isRustOwnedStoreName('__proto__')).toBe(false)
  })
})
