/**
 * storePolicy.ts test suite (Phase 29 Plan 03).
 *
 * This suite constructs NO store and touches NO filesystem path — `storePolicy.ts` is
 * pure data + pure predicates (a type-only import of `ValidStoreName`, zero Electron/
 * fs/path imports, zero side effects). That is why the mandatory three-way `os`/
 * `electron`/`electron-store` test-isolation mock (29-VALIDATION.md § MANDATORY
 * TEST-ISOLATION RULE, commit 92c29a5e) is NOT present here. If a future edit ever
 * gives this suite any store construction (real or mocked), that mock becomes
 * mandatory before merge.
 */
import {
  STORE_ALLOWLIST,
  BOOT_SET_STORES,
  LAZY_STORES,
  STORE_UNIVERSE,
  isAllowedStoreField,
  filterStoreSnapshot
} from '../storePolicy'

// Hardcoded reference of all 21 StoreStructure keys (src/common/types/electron_store.ts).
// This list must NOT be derived from storePolicy.ts's own exports — the whole point is
// that a StoreStructure addition without a matching storePolicy.ts entry FAILS this test.
const ALL_VALID_STORE_NAMES = [
  'configStore',
  'wineDownloaderInfoStore',
  'gogInstalledGamesStore',
  'zoomInstalledGamesStore',
  'timestampStore',
  'fontsStore',
  'gogConfigStore',
  'zoomConfigStore',
  'steamConfigStore',
  'steamBottleConfigStore',
  'nileConfigStore',
  'humbleConfigStore',
  'sideloadedStore',
  'downloadManager',
  'gogSyncStore',
  'zoomSyncStore',
  'gogPrivateBranches',
  'wikigameinfo',
  'uploadedLogs',
  'migrationsStore',
  'gameOverridesStore'
]

const BOOT_SET_CACHE_STORE_NAMES = [
  'legendary_library',
  'gog_library',
  'nile_library',
  'zoom_library'
]

describe('allow-list', () => {
  it('excludes steamConfigStore.refreshToken by name', () => {
    expect(isAllowedStoreField('steamConfigStore', 'refreshToken')).toBe(false)
  })

  it('excludes humbleConfigStore.sessionCookie by name', () => {
    expect(isAllowedStoreField('humbleConfigStore', 'sessionCookie')).toBe(false)
  })

  it('excludes humbleConfigStore.csrfToken by name', () => {
    // T-14-04 / StoreStructure's own comment: "Main-process-only — never included in
    // any sendFrontendMessage payload or HumbleAuthState." This is the exact field
    // whose triple-duplicated deny-list omission motivated this module (D-08).
    expect(isAllowedStoreField('humbleConfigStore', 'csrfToken')).toBe(false)
  })

  it('excludes gogConfigStore.credentials by name', () => {
    expect(isAllowedStoreField('gogConfigStore', 'credentials')).toBe(false)
  })

  it('excludes zoomConfigStore.credentials by name', () => {
    expect(isAllowedStoreField('zoomConfigStore', 'credentials')).toBe(false)
  })

  it('blocks dot-notation subpath reads of a secret', () => {
    expect(isAllowedStoreField('steamConfigStore', 'refreshToken.x')).toBe(false)
  })

  it('allows legitimate neighbour fields', () => {
    expect(isAllowedStoreField('steamConfigStore', 'userData')).toBe(true)
    expect(isAllowedStoreField('humbleConfigStore', 'isLoggedIn')).toBe(true)
    expect(isAllowedStoreField('humbleConfigStore', 'expired')).toBe(true)
    expect(isAllowedStoreField('configStore', 'theme')).toBe(true)
  })

  it('fails closed on an unknown store name', () => {
    expect(isAllowedStoreField('notARealStore', 'anything')).toBe(false)
  })

  it('fails closed on an unknown field of a known, non-wildcard store', () => {
    expect(isAllowedStoreField('steamConfigStore', 'notARealField')).toBe(false)
  })

  it('filterStoreSnapshot strips refreshToken but keeps legitimate fields', () => {
    const filtered = filterStoreSnapshot('steamConfigStore', {
      isLoggedIn: true,
      refreshToken: 'x',
      userData: {}
    })
    expect(Object.keys(filtered).sort()).toEqual(['isLoggedIn', 'userData'])
    expect('refreshToken' in filtered).toBe(false)
  })

  it('filterStoreSnapshot returns {} for a denied cache store', () => {
    const filtered = filterStoreSnapshot('humble_library', {
      revealedKeyValue: 'secret',
      keyindex: 3
    })
    expect(filtered).toEqual({})
  })
})

describe('tier partition', () => {
  it('BOOT_SET_STORES and LAZY_STORES are disjoint', () => {
    const bootSet = new Set(BOOT_SET_STORES)
    const overlap = LAZY_STORES.filter((name) => bootSet.has(name))
    expect(overlap).toEqual([])
  })

  it('their union equals STORE_UNIVERSE', () => {
    const union = new Set([...BOOT_SET_STORES, ...LAZY_STORES])
    expect(new Set(STORE_UNIVERSE)).toEqual(union)
    expect(STORE_UNIVERSE.length).toBe(BOOT_SET_STORES.length + LAZY_STORES.length)
  })

  it('every ValidStoreName appears in STORE_UNIVERSE (anti-drift guard)', () => {
    const universe = new Set(STORE_UNIVERSE)
    for (const name of ALL_VALID_STORE_NAMES) {
      expect(universe.has(name)).toBe(true)
    }
  })

  it('every name in STORE_UNIVERSE has an allow-list entry or is a recognized cache store', () => {
    for (const name of STORE_UNIVERSE) {
      const hasAllowlistEntry = Object.prototype.hasOwnProperty.call(
        STORE_ALLOWLIST,
        name
      )
      const isRecognizedCacheStore = BOOT_SET_CACHE_STORE_NAMES.includes(name)
      expect(hasAllowlistEntry || isRecognizedCacheStore).toBe(true)
    }
  })

  it('the four D-13 cache store names are in BOOT_SET_STORES', () => {
    for (const name of BOOT_SET_CACHE_STORE_NAMES) {
      expect(BOOT_SET_STORES).toContain(name)
    }
  })
})
