// Phase 85 plan 03: the renderer store policy held as shared vectors (FND-06).
//
// `common/__fixtures__/storePolicyVectors.json` carries the read, write, key-path, cache-name and
// read-only-area rules as `{input, expected}` rows. This suite asserts every row against today's TS
// (`isAllowedStoreField`, `isWritableStoreField`, `isSafeKeyPath`, `CACHE_STORE_NAME_PATTERN` plus
// `RECOGNIZED_CACHE_STORE_NAMES`, `areaForStoreKey`) on every run; plan 85-16's Rust `store_policy.rs`
// asserts the same file, so the two sides cannot drift apart.
//
// Two modes:
//   - compare (default): the committed file must equal the document built from the inputs below and
//     today's TS results, row for row.
//   - write (`GAMELIB_WRITE_STORE_GOLDEN=1`): rewrite the file from the TS code under test. The INPUTS
//     are the hand-curated constants in this file; no expected value is ever typed by hand.
//
// Plan 85-24 retargets the `area` half when readOnlyStores.ts is deleted (the Rust port from 85-16
// then becomes its only implementation).

import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

import {
  CACHE_STORE_NAME_PATTERN,
  RECOGNIZED_CACHE_STORE_NAMES,
  STORE_ALLOWLIST,
  isAllowedStoreField,
  isSafeKeyPath,
  isWritableStoreField
} from 'common/types/storePolicy'
import { areaForStoreKey } from '../../storeVersioning/readOnlyStores'

const FIXTURE = resolve(
  __dirname,
  '../../../common/__fixtures__/storePolicyVectors.json'
)
const WRITE_MODE = process.env['GAMELIB_WRITE_STORE_GOLDEN'] === '1'

type StoreKeyInput = { store: string; key: string }

/** One allowed top-level key per allow-listed store (hand-curated; `'*'` stores accept any key). */
const ALLOWED_KEY_BY_STORE: Record<string, string> = {
  configStore: 'theme',
  wineDownloaderInfoStore: 'wine-releases',
  gogInstalledGamesStore: 'installed',
  timestampStore: '480',
  fontsStore: 'fonts',
  gogConfigStore: 'isLoggedIn',
  steamConfigStore: 'isLoggedIn',
  steamBottleConfigStore: 'bottleName',
  nileConfigStore: 'expired',
  legendaryConfigStore: 'expired',
  humbleConfigStore: 'isLoggedIn',
  sideloadedStore: 'games',
  downloadManager: 'queue',
  gogSyncStore: 'someGame',
  gogPrivateBranches: 'someGame',
  wikigameinfo: 'someGame',
  gameOverridesStore: 'overrides'
}

const READ_INPUTS: StoreKeyInput[] = [
  ...Object.entries(ALLOWED_KEY_BY_STORE).flatMap(([store, key]) => [
    { store, key },
    { store, key: 'notAField' }
  ]),
  // a dot-notation sub-path of an allowed field is allowed, of a secret it is not
  { store: 'configStore', key: 'settings.wineVersion.bin' },
  { store: 'steamConfigStore', key: 'refreshToken' },
  { store: 'steamConfigStore', key: 'refreshToken.x' },
  { store: 'humbleConfigStore', key: 'sessionCookie' },
  { store: 'humbleConfigStore', key: 'csrfToken' },
  { store: 'gogConfigStore', key: 'credentials' },
  // `__internal__` is the store-version namespace: never readable, on any store
  { store: 'timestampStore', key: '__internal__.gamelib.schemaVersion' },
  { store: 'steam_library', key: '__internal__' },
  // cache stores: recognized is open, denied and unknown are closed
  { store: 'steam_library', key: 'games' },
  { store: 'legendary_library', key: 'library' },
  { store: 'humble_library', key: 'games' },
  { store: 'humble_revealed', key: 'anything' },
  { store: 'custom_cache', key: 'anything' },
  // prototype-chain store names fail closed (CR-02)
  { store: 'constructor', key: 'x' },
  { store: 'toString', key: 'x' },
  { store: '__proto__', key: 'x' },
  { store: '', key: 'x' }
]

const WRITE_INPUTS: StoreKeyInput[] = [
  ...Object.entries(ALLOWED_KEY_BY_STORE).flatMap(([store, key]) => [
    { store, key },
    { store, key: 'notAField' }
  ]),
  // write-denied fields on stores whose read is allowed
  { store: 'configStore', key: 'settings' },
  { store: 'configStore', key: 'settings.wrapperOptions' },
  { store: 'configStore', key: 'userHome' },
  { store: 'configStore', key: 'userInfo' },
  { store: 'gogConfigStore', key: 'userData' },
  { store: 'steamConfigStore', key: 'userData' },
  { store: 'nileConfigStore', key: 'userData' },
  { store: 'humbleConfigStore', key: 'userData' },
  // secrets stay denied on the write side too
  { store: 'steamConfigStore', key: 'refreshToken' },
  { store: 'humbleConfigStore', key: 'sessionCookie' },
  { store: 'humbleConfigStore', key: 'csrfToken' },
  { store: 'gogConfigStore', key: 'credentials' },
  // hostile key paths on writable stores (CR-01)
  { store: 'timestampStore', key: '__proto__.polluted' },
  { store: 'timestampStore', key: 'a.constructor.b' },
  { store: 'configStore', key: 'theme.prototype' },
  { store: 'timestampStore', key: '__internal__.gamelib' },
  // cache stores
  { store: 'steam_library', key: 'games' },
  { store: 'humble_library', key: 'games' },
  { store: 'custom_cache', key: 'x' },
  { store: 'constructor', key: 'x' }
]

const KEY_PATH_INPUTS: string[] = [
  'theme',
  'a.b.c',
  '480',
  'a.__proto__.b',
  '__proto__',
  'constructor',
  'prototype.x',
  'x.prototype',
  'a.constructor',
  'a..b',
  '',
  '.',
  'a.',
  '.a',
  '__internal__.gamelib',
  'a.__proto__x',
  'protoTYPE',
  'Constructor'
]

const CACHE_NAME_INPUTS: string[] = [
  'steam_library',
  'gog_library',
  'legendary_library',
  'nile_library',
  'humble_library',
  'custom_cache',
  'name-with-dash_9',
  'x'.repeat(64),
  'x'.repeat(65),
  '',
  '../x',
  'a/b',
  'a.b',
  'a b',
  'steam_library\n',
  'ünïcode'
]

const AREA_INPUTS: string[] = [
  // every AREA_BY_KEY key
  'store_cache/steam_library',
  'store_cache/gog_library',
  'gog_store/installed',
  'store_cache/legendary_library',
  'store_cache/nile_library',
  'sideload_apps/library',
  'steam_store/config',
  'gog_store/config',
  'legendary_store/config',
  'nile_store/config',
  'humble_store/config',
  'store/download-manager',
  'store/timestamp',
  'gog_store/saveTimestamps',
  'store_cache/gog_playtime_sync_queue',
  'store/config',
  'settings/global',
  'settings/game',
  // the humble prefix rule and the app-data fallback
  'store_cache/humble_revealed',
  'store_cache/humble_library',
  'store_cache/umu',
  'store/fonts',
  'GamesConfig/480',
  ''
]

type VectorDoc = {
  read: (StoreKeyInput & { allowed: boolean })[]
  write: (StoreKeyInput & { allowed: boolean })[]
  keyPath: { key: string; safe: boolean }[]
  cacheName: { name: string; accepted: boolean }[]
  area: { storeKey: string; area: string }[]
}

function buildDoc(): VectorDoc {
  return {
    read: READ_INPUTS.map((i) => ({
      ...i,
      allowed: isAllowedStoreField(i.store, i.key)
    })),
    write: WRITE_INPUTS.map((i) => ({
      ...i,
      allowed: isWritableStoreField(i.store, i.key)
    })),
    keyPath: KEY_PATH_INPUTS.map((key) => ({
      key,
      safe: isSafeKeyPath(key)
    })),
    cacheName: CACHE_NAME_INPUTS.map((name) => ({
      name,
      accepted:
        CACHE_STORE_NAME_PATTERN.test(name) &&
        RECOGNIZED_CACHE_STORE_NAMES.includes(name)
    })),
    area: AREA_INPUTS.map((storeKey) => ({
      storeKey,
      area: areaForStoreKey(storeKey)
    }))
  }
}

if (WRITE_MODE) {
  writeFileSync(FIXTURE, JSON.stringify(buildDoc(), null, 2) + '\n')
}

describe('store policy vectors (today TS policy -> committed vectors)', () => {
  const committed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as VectorDoc

  it('covers every allow-listed store, so a new store cannot skip the vectors', () => {
    expect(Object.keys(ALLOWED_KEY_BY_STORE).sort()).toEqual(
      Object.keys(STORE_ALLOWLIST).sort()
    )
  })

  it('has every section non-empty and at least 40 vectors in total', () => {
    const sizes = [
      committed.read.length,
      committed.write.length,
      committed.keyPath.length,
      committed.cacheName.length,
      committed.area.length
    ]
    expect(sizes.every((n) => n > 0)).toBe(true)
    expect(sizes.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(40)
  })

  it('denies a renderer write of steamConfigStore.refreshToken, explicitly', () => {
    expect(
      committed.write.find(
        (v) => v.store === 'steamConfigStore' && v.key === 'refreshToken'
      )?.allowed
    ).toBe(false)
    expect(isWritableStoreField('steamConfigStore', 'refreshToken')).toBe(false)
  })

  it.each(['read', 'write'] as const)(
    '%s vectors equal what today TS computes',
    (section) => {
      expect(committed[section]).toEqual(buildDoc()[section])
    }
  )

  it('keyPath vectors equal isSafeKeyPath', () => {
    expect(committed.keyPath).toEqual(buildDoc().keyPath)
  })

  it('cacheName vectors equal the pattern plus the recognized list', () => {
    expect(committed.cacheName).toEqual(buildDoc().cacheName)
  })

  it('area vectors equal areaForStoreKey', () => {
    expect(committed.area).toEqual(buildDoc().area)
  })

  it('the file is the exact document the inputs produce (no stray or reordered rows)', () => {
    expect(committed).toEqual(buildDoc())
  })
})
