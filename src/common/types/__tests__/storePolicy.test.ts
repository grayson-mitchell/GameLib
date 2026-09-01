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
  isWritableStoreField,
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
  'zoom_library',
  'steam_library'
]

describe('allow-list', () => {
  it('excludes steamConfigStore.refreshToken by name', () => {
    expect(isAllowedStoreField('steamConfigStore', 'refreshToken')).toBe(false)
  })

  it('excludes humbleConfigStore.sessionCookie by name', () => {
    expect(isAllowedStoreField('humbleConfigStore', 'sessionCookie')).toBe(
      false
    )
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
    expect(isAllowedStoreField('steamConfigStore', 'refreshToken.x')).toBe(
      false
    )
  })

  // Phase 35 plan 16 (D-08 convergence): the Electron path's `SECRET_STORE_KEYS`
  // deny-list is about to be deleted in favour of this allow-list. Every one of its
  // four store names / five field paths must be provably blocked here FIRST, or a gap
  // found after the deletion is a live credential-exposure regression (T-35-72). The
  // deny-list's `key === secret || key.startsWith(`${secret}.`)` semantics require a
  // NESTED-PATH case per field too (T-35-73) — the sub-property most likely to be
  // missed when comparing two policies by their field lists.
  describe('D-08 convergence: every SECRET_STORE_KEYS field, blocked by name AND by nested path', () => {
    it('blocks humbleConfigStore.sessionCookie by name', () => {
      expect(isAllowedStoreField('humbleConfigStore', 'sessionCookie')).toBe(
        false
      )
    })

    it('blocks a nested path under humbleConfigStore.sessionCookie', () => {
      expect(
        isAllowedStoreField('humbleConfigStore', 'sessionCookie.value')
      ).toBe(false)
    })

    it('blocks humbleConfigStore.csrfToken by name', () => {
      expect(isAllowedStoreField('humbleConfigStore', 'csrfToken')).toBe(false)
    })

    it('blocks a nested path under humbleConfigStore.csrfToken', () => {
      expect(isAllowedStoreField('humbleConfigStore', 'csrfToken.value')).toBe(
        false
      )
    })

    it('blocks steamConfigStore.refreshToken by name', () => {
      expect(isAllowedStoreField('steamConfigStore', 'refreshToken')).toBe(
        false
      )
    })

    it('blocks a nested path under steamConfigStore.refreshToken', () => {
      expect(
        isAllowedStoreField('steamConfigStore', 'refreshToken.value')
      ).toBe(false)
    })

    it('blocks gogConfigStore.credentials by name', () => {
      expect(isAllowedStoreField('gogConfigStore', 'credentials')).toBe(false)
    })

    it('blocks a nested path under gogConfigStore.credentials', () => {
      expect(
        isAllowedStoreField('gogConfigStore', 'credentials.accessToken')
      ).toBe(false)
    })

    it('blocks zoomConfigStore.credentials by name', () => {
      expect(isAllowedStoreField('zoomConfigStore', 'credentials')).toBe(false)
    })

    it('blocks a nested path under zoomConfigStore.credentials', () => {
      expect(
        isAllowedStoreField('zoomConfigStore', 'credentials.accessToken')
      ).toBe(false)
    })
  })

  // T-35-74: the structural advantage of an allow-list over a deny-list is that a
  // field in NEITHER list is blocked by DEFAULT, not exposed until someone remembers
  // to deny-list it. Asserted explicitly (not merely implied by the existing
  // unknown-field test above) so a future change to a default-permit shape goes red.
  it('D-08 fail-closed control: a field name in NO list at all is blocked by default', () => {
    expect(
      isAllowedStoreField('humbleConfigStore', 'someFutureSecretNeverListed')
    ).toBe(false)
    expect(
      isAllowedStoreField('steamConfigStore', 'anotherFutureSecretField')
    ).toBe(false)
  })

  it('allows legitimate neighbour fields', () => {
    expect(isAllowedStoreField('steamConfigStore', 'userData')).toBe(true)
    expect(isAllowedStoreField('humbleConfigStore', 'isLoggedIn')).toBe(true)
    expect(isAllowedStoreField('humbleConfigStore', 'expired')).toBe(true)
    expect(isAllowedStoreField('configStore', 'theme')).toBe(true)
  })

  // CR-02 REGRESSION (Phase 29 code review): `notARealStore` happens to miss the
  // prototype chain entirely, so the test below it did NOT cover the real hole.
  // `STORE_ALLOWLIST` was a plain object literal, so `STORE_ALLOWLIST['constructor']`
  // resolved to a FUNCTION through `Object.prototype` — the `policy === undefined`
  // fail-closed branch was skipped and `policy.includes(...)` THREW. This function is
  // called synchronously from preload with no try/catch, and a preload throw blanks
  // the window (SEAM Load-Bearing Invariant A). It must return `false`, never raise.
  it.each([
    'constructor',
    'toString',
    'valueOf',
    'hasOwnProperty',
    '__proto__',
    'prototype',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'toLocaleString'
  ])(
    'CR-02: fails closed (never throws) for prototype-chain store name %p',
    (name) => {
      expect(() => isAllowedStoreField(name, 'x')).not.toThrow()
      expect(isAllowedStoreField(name, 'x')).toBe(false)
    }
  )

  it('CR-02: filterStoreSnapshot is likewise inert for a prototype-chain store name', () => {
    expect(() => filterStoreSnapshot('constructor', { a: 1 })).not.toThrow()
    expect(filterStoreSnapshot('constructor', { a: 1 })).toEqual({})
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
    expect(STORE_UNIVERSE.length).toBe(
      BOOT_SET_STORES.length + LAZY_STORES.length
    )
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

/**
 * WR-04 REGRESSION (Phase 29 code review): the read allow-list was reused verbatim as
 * the write allow-list, so everything readable was renderer-writable — including
 * `configStore.settings` (AppSettings: wineVersion.bin, wrapperOptions, launcherArgs,
 * winePrefix, all consumed on the next game launch), which is effectively local code
 * execution. Read safety and write safety are not the same predicate.
 */
describe('WR-04: write allow-list is strictly narrower than the read allow-list', () => {
  it.each([
    ['configStore', 'settings'],
    ['configStore', 'settings.wineVersion.bin'],
    ['configStore', 'userHome'],
    ['configStore', 'userInfo'],
    ['gogConfigStore', 'userData'],
    ['steamConfigStore', 'userData'],
    ['nileConfigStore', 'userData'],
    ['humbleConfigStore', 'userData']
  ])('%s.%s is readable but NOT writable', (storeName, key) => {
    expect(isAllowedStoreField(storeName, key)).toBe(true)
    expect(isWritableStoreField(storeName, key)).toBe(false)
  })

  it.each([
    ['configStore', 'theme'],
    ['configStore', 'games.hidden'],
    ['configStore', 'language'],
    ['timestampStore', 'anything'],
    ['legendary_library', '__timestamp.library']
  ])('%s.%s stays writable', (storeName, key) => {
    expect(isWritableStoreField(storeName, key)).toBe(true)
  })

  it('a non-readable field is never writable (fail closed by construction)', () => {
    expect(isWritableStoreField('steamConfigStore', 'refreshToken')).toBe(false)
    expect(isWritableStoreField('gogConfigStore', 'credentials')).toBe(false)
    expect(isWritableStoreField('notARealStore', 'anything')).toBe(false)
    // zoomConfigStore's read allow-list is ['isLoggedIn','username'] — `userData` is
    // not readable there at all, so it is write-rejected one layer earlier. Its
    // WRITE_DENIED_FIELDS entry is forward-looking, not load-bearing today.
    expect(isWritableStoreField('zoomConfigStore', 'userData')).toBe(false)
  })

  it('CR-01/CR-02: hostile key paths and prototype-chain store names are not writable, and never throw', () => {
    expect(() => isWritableStoreField('constructor', 'x')).not.toThrow()
    expect(isWritableStoreField('constructor', 'x')).toBe(false)
    expect(isWritableStoreField('timestampStore', '__proto__.polluted')).toBe(
      false
    )
    expect(isWritableStoreField('configStore', 'games.constructor.x')).toBe(
      false
    )
  })
})
