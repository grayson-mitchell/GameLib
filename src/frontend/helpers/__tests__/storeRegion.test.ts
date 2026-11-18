/**
 * One stored region shared by Deals and Store Search, each screen validating
 * it against its own list (G-47-8, plans 47-16/47-18).
 *
 * The `Frontend` jest project runs in a node environment, so `localStorage`
 * is stubbed on `globalThis` in memory (the navTabs.test.ts pattern). No
 * module mocks.
 */
import {
  REGION_OPTIONS,
  STORE_SEARCH_REGION_CODES,
  getStoredRegionFor,
  getStoredRegionOverride,
  setStoredRegionOverride
} from '../storeRegion'

// The key Deals has always used; a rename would silently drop every saved choice.
const KEY = 'discounts.regionOverride'

type StorageHolder = { localStorage: Storage }

let store: Map<string, string>

function installStorage(overrides: Partial<Storage> = {}) {
  store = new Map()
  ;(globalThis as unknown as StorageHolder).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
    ...overrides
  }
}

const dealsCodes = REGION_OPTIONS.map((r) => r.countryCode)

describe('storeRegion shared store', () => {
  beforeEach(() => installStorage())

  test('a region written by setStoredRegionOverride lands under the historical key and both getters read it', () => {
    setStoredRegionOverride('DE')
    expect(store.get(KEY)).toBe('DE')
    expect(getStoredRegionOverride()).toBe('DE')
    expect(getStoredRegionFor(STORE_SEARCH_REGION_CODES)).toBe('DE')
  })

  test('setStoredRegionOverride(null) removes the key', () => {
    setStoredRegionOverride('DE')
    setStoredRegionOverride(null)
    expect(store.has(KEY)).toBe(false)
    expect(getStoredRegionOverride()).toBeNull()
  })

  test('getStoredRegionFor returns the stored code only when it is in the allowed list', () => {
    store.set(KEY, 'DE')
    expect(getStoredRegionFor(['DE', 'FR'])).toBe('DE')
    expect(getStoredRegionFor(['FR'])).toBeNull()
    expect(getStoredRegionFor([])).toBeNull()
  })

  test('getStoredRegionFor is null when nothing is stored', () => {
    expect(getStoredRegionFor(['DE'])).toBeNull()
  })

  test('getStoredRegionFor is null when storage throws', () => {
    installStorage({
      getItem: () => {
        throw new Error('storage unavailable')
      }
    })
    expect(getStoredRegionFor(['DE'])).toBeNull()
    expect(getStoredRegionOverride()).toBeNull()
  })

  test('setStoredRegionOverride swallows storage errors', () => {
    installStorage({
      setItem: () => {
        throw new Error('quota')
      }
    })
    expect(() => setStoredRegionOverride('DE')).not.toThrow()
  })

  test('getStoredRegionOverride (Deals) accepts only REGION_OPTIONS codes; a Store-Search-only code reads as Auto there but is honoured by Store Search', () => {
    const searchOnly = STORE_SEARCH_REGION_CODES.find(
      (c) => !dealsCodes.includes(c)
    )
    // 'NZ' is priced by ITAD but GOG has no NZ region.
    expect(searchOnly).toBeDefined()
    expect(STORE_SEARCH_REGION_CODES).toContain('NZ')
    expect(dealsCodes).not.toContain('NZ')

    setStoredRegionOverride('NZ')
    expect(getStoredRegionOverride()).toBeNull()
    expect(getStoredRegionFor(STORE_SEARCH_REGION_CODES)).toBe('NZ')
  })

  test('a hand-edited unknown code is Auto on both screens', () => {
    store.set(KEY, 'ZZ')
    expect(getStoredRegionOverride()).toBeNull()
    expect(getStoredRegionFor(STORE_SEARCH_REGION_CODES)).toBeNull()
  })

  test('STORE_SEARCH_REGION_CODES is the 32 ITAD-priced countries with no duplicates (47-16 decision: itad-list)', () => {
    expect(STORE_SEARCH_REGION_CODES).toHaveLength(32)
    expect(new Set(STORE_SEARCH_REGION_CODES).size).toBe(
      STORE_SEARCH_REGION_CODES.length
    )
    expect(dealsCodes).toHaveLength(29)
  })
})
