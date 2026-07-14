/**
 * Unit tests for the pure store-search ownership badge resolver
 * (STORESEARCH-05/06, Phase 20 D-01/D-02/D-04/D-06/D-07). The helper lives
 * in common/discounts/badges.ts (no React/i18n/I/O), as a NEW sibling
 * export alongside the unchanged Discounts-screen `resolveDiscountBadge`;
 * this test sits in the backend suite because jest's project roots only
 * cover src/backend.
 */

import { HumbleKey } from 'common/types/humble'
import {
  resolveStoreSearchBadges,
  StoreOwnershipMatch
} from 'common/discounts/badges'

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk',
    machineName: `mn-${Math.random().toString(36).slice(2)}`,
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

const emptyLibraries = { steam: [], gog: [], epic: [], amazon: [] }

describe('resolveStoreSearchBadges', () => {
  test('D-01: exact steamAppId join yields owned steam badge', () => {
    const result = { title: 'Celeste', steamAppId: '504230' }
    const libraries = {
      ...emptyLibraries,
      steam: [{ app_name: '504230' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned).toEqual<StoreOwnershipMatch[]>([
      { store: 'steam', confidence: 'exact' }
    ])
  })

  test('D-01: title fuzzy-matches a steam entry but steamAppId does not equal app_name -> no steam badge', () => {
    const result = { title: 'Celeste', steamAppId: '999999' }
    const libraries = {
      ...emptyLibraries,
      steam: [{ app_name: '504230' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned.find((m) => m.store === 'steam')).toBeUndefined()
  })

  test('D-01: result with no steamAppId never yields a steam badge even when title matches', () => {
    const result = { title: 'Celeste' }
    const libraries = {
      ...emptyLibraries,
      steam: [{ app_name: '504230' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned.find((m) => m.store === 'steam')).toBeUndefined()
  })

  test.each(['', '0'])(
    'D-01: result steamAppId %p (falsy-guard value) never yields a steam badge',
    (steamAppId) => {
      const result = { title: 'Celeste', steamAppId }
      const libraries = {
        ...emptyLibraries,
        steam: [{ app_name: steamAppId }]
      }
      const { owned } = resolveStoreSearchBadges(result, libraries, [])
      expect(owned.find((m) => m.store === 'steam')).toBeUndefined()
    }
  )

  test('D-02: GOG fuzzy match (>=85%) yields owned gog badge', () => {
    const result = { title: 'Into the Breach' }
    const libraries = {
      ...emptyLibraries,
      gog: [{ title: 'Into The Breach (Steam)' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned).toEqual<StoreOwnershipMatch[]>([
      { store: 'gog', confidence: 'fuzzy' }
    ])
  })

  test("D-02: Epic library match attributes to 'legendary'", () => {
    const result = { title: 'Hollow Knight' }
    const libraries = {
      ...emptyLibraries,
      epic: [{ title: 'Hollow Knight' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned).toEqual<StoreOwnershipMatch[]>([
      { store: 'legendary', confidence: 'fuzzy' }
    ])
  })

  test("D-02: Amazon library match attributes to 'nile'", () => {
    const result = { title: 'Hollow Knight' }
    const libraries = {
      ...emptyLibraries,
      amazon: [{ title: 'Hollow Knight' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned).toEqual<StoreOwnershipMatch[]>([
      { store: 'nile', confidence: 'fuzzy' }
    ])
  })

  test('DLC guard: Terraria does not match Terraria Soundtrack DLC', () => {
    const result = { title: 'Terraria' }
    const libraries = {
      ...emptyLibraries,
      gog: [{ title: 'Terraria Soundtrack DLC' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned).toEqual([])
  })

  test('D-07: owned on GOG AND a waiting key present -> both owned and keyAvailable true (never suppressed)', () => {
    const result = { title: 'Hollow Knight', steamAppId: '367520' }
    const libraries = {
      ...emptyLibraries,
      gog: [{ title: 'Hollow Knight' }]
    }
    const key = makeKey({ title: 'Hollow Knight', steamAppId: '367520' })
    const { owned, keyAvailable } = resolveStoreSearchBadges(
      result,
      libraries,
      [key]
    )
    expect(owned).toEqual<StoreOwnershipMatch[]>([
      { store: 'gog', confidence: 'fuzzy' }
    ])
    expect(keyAvailable).toBe(true)
  })

  test('D-07: exact-Steam-key match sets keyAvailable true', () => {
    const result = { title: 'Some Unmatched Title', steamAppId: '504230' }
    const key = makeKey({
      title: 'A Totally Different Title',
      steamAppId: '504230'
    })
    const { keyAvailable } = resolveStoreSearchBadges(result, emptyLibraries, [
      key
    ])
    expect(keyAvailable).toBe(true)
  })

  test.each(['', '0', undefined])(
    "D-07: falsy-guard value %p on the waiting key's steamAppId prevents a spurious exact key match",
    (steamAppId) => {
      const result = { title: 'Some Unmatched Title', steamAppId }
      const key = makeKey({
        title: 'A Totally Different Title',
        steamAppId
      })
      const { keyAvailable } = resolveStoreSearchBadges(
        result,
        emptyLibraries,
        [key]
      )
      expect(keyAvailable).toBe(false)
    }
  )

  test('multi-store: owned on Steam AND GOG returns entries in deterministic order steam-before-gog', () => {
    const result = { title: 'Hollow Knight', steamAppId: '367520' }
    const libraries = {
      ...emptyLibraries,
      steam: [{ app_name: '367520' }],
      gog: [{ title: 'Hollow Knight' }]
    }
    const { owned } = resolveStoreSearchBadges(result, libraries, [])
    expect(owned).toEqual<StoreOwnershipMatch[]>([
      { store: 'steam', confidence: 'exact' },
      { store: 'gog', confidence: 'fuzzy' }
    ])
  })

  test('no matches anywhere yields empty owned and keyAvailable false', () => {
    const result = { title: 'Totally Unowned Game' }
    const { owned, keyAvailable } = resolveStoreSearchBadges(
      result,
      emptyLibraries,
      []
    )
    expect(owned).toEqual([])
    expect(keyAvailable).toBe(false)
  })
})
