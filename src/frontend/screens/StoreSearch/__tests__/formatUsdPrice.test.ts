import {
  buildOwnedBadgeLabel,
  formatCachedAt,
  formatCountryName,
  formatPrice
} from '../helpers'
import type { StoreOwnershipMatch } from 'common/discounts/badges'

describe('formatPrice', () => {
  it('formats en/USD as "$14.99 USD"', () => {
    expect(formatPrice('14.99', 'USD', 'en')).toBe('$14.99 USD')
  })

  it('formats de/EUR with comma decimals, euro sign and ISO code', () => {
    const out = formatPrice('14.99', 'EUR', 'de')
    expect(out).toContain('14,99')
    expect(out).toContain('€')
    expect(out.endsWith(' EUR')).toBe(true)
  })

  it('formats GBP for en_GB and en-GB', () => {
    for (const lng of ['en_GB', 'en-GB']) {
      const out = formatPrice('12.99', 'GBP', lng)
      expect(out).toContain('£12.99')
      expect(out.endsWith(' GBP')).toBe(true)
    }
  })

  it('formats CAD with the ISO code', () => {
    const out = formatPrice('14.99', 'CAD', 'en')
    expect(out).toContain('14.99')
    expect(out.endsWith(' CAD')).toBe(true)
  })

  it('formats JPY without decimals', () => {
    const out = formatPrice('1480', 'JPY', 'ja')
    expect(out).toContain('1,480')
    expect(out).not.toContain('.')
    expect(out.endsWith(' JPY')).toBe(true)
  })

  it('falls back to "<amount> <code>" for an unusable currency code', () => {
    expect(formatPrice('9.99', 'NOTACODE', 'en')).toBe('9.99 NOTACODE')
  })

  it('never duplicates the ISO code', () => {
    const out = formatPrice('14.99', 'USD', 'en')
    expect(out.match(/USD/g)).toHaveLength(1)
  })
})

describe('formatCachedAt', () => {
  it('renders an absolute date containing the year', () => {
    expect(formatCachedAt(Date.UTC(2026, 10, 14, 15, 30), 'en')).toContain(
      '2026'
    )
  })

  it('falls back for an invalid language', () => {
    expect(
      formatCachedAt(Date.UTC(2026, 10, 14, 15, 30), 'xx_INVALID').length
    ).toBeGreaterThan(0)
  })
})

describe('formatCountryName', () => {
  it('localizes region names', () => {
    expect(formatCountryName('DE', 'en')).toBe('Germany')
    expect(formatCountryName('GB', 'de')).toBe('Vereinigtes Königreich')
  })

  it('falls back to the raw code', () => {
    expect(formatCountryName('ZZ9', 'en')).toBe('ZZ9')
  })
})

describe('buildOwnedBadgeLabel', () => {
  it('returns null when there is no ownership match (missing beats wrong)', () => {
    expect(buildOwnedBadgeLabel([])).toBeNull()
  })

  it('single store returns "Owned on {{store}}"-style copy', () => {
    const owned: StoreOwnershipMatch[] = [{ store: 'gog', confidence: 'fuzzy' }]
    expect(buildOwnedBadgeLabel(owned)).toEqual({
      key: 'storeSearch.badge.ownedOn',
      defaultValue: 'Owned on {{store}}',
      values: { store: 'GOG' }
    })
  })

  it('maps legendary -> Epic and nile -> Amazon display names', () => {
    expect(
      buildOwnedBadgeLabel([{ store: 'legendary', confidence: 'fuzzy' }])
    ).toEqual({
      key: 'storeSearch.badge.ownedOn',
      defaultValue: 'Owned on {{store}}',
      values: { store: 'Epic' }
    })
    expect(
      buildOwnedBadgeLabel([{ store: 'nile', confidence: 'fuzzy' }])
    ).toEqual({
      key: 'storeSearch.badge.ownedOn',
      defaultValue: 'Owned on {{store}}',
      values: { store: 'Amazon' }
    })
  })

  it('two stores joins "Owned on Steam, GOG"', () => {
    const owned: StoreOwnershipMatch[] = [
      { store: 'steam', confidence: 'exact' },
      { store: 'gog', confidence: 'fuzzy' }
    ]
    expect(buildOwnedBadgeLabel(owned)).toEqual({
      key: 'storeSearch.badge.ownedOnMulti',
      defaultValue: 'Owned on {{stores}}',
      values: { stores: 'Steam, GOG' }
    })
  })

  it('caps at the first 2 stores (Steam,GOG,Epic,Amazon order) with a "+N more" overflow', () => {
    // Deliberately unordered input — the helper must re-sort to D-06 order.
    const owned: StoreOwnershipMatch[] = [
      { store: 'nile', confidence: 'fuzzy' },
      { store: 'legendary', confidence: 'fuzzy' },
      { store: 'steam', confidence: 'exact' },
      { store: 'gog', confidence: 'fuzzy' }
    ]
    expect(buildOwnedBadgeLabel(owned)).toEqual({
      key: 'storeSearch.badge.ownedOnOverflow',
      defaultValue: 'Owned on {{stores}} +{{count}} more',
      values: { stores: 'Steam, GOG', count: 2 }
    })
  })
})
