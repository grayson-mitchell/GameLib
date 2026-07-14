import { buildOwnedBadgeLabel, formatUsdPrice } from '../helpers'
import type { StoreOwnershipMatch } from 'common/discounts/badges'

describe('formatUsdPrice', () => {
  it('formats a decimal price as a single "$X USD" string (D-13)', () => {
    expect(formatUsdPrice('14.99', 'USD')).toBe('$14.99 USD')
  })

  it('does not fabricate decimals for a whole-number CheapShark string', () => {
    expect(formatUsdPrice('9', 'USD')).toBe('$9 USD')
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
