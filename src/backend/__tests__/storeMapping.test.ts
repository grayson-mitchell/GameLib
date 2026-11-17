/**
 * Unit tests for the ITAD shop id -> Runner mapping constant
 * (common/discounts/storeMapping.ts, Phase 47).
 *
 * The literals in common/ are asserted equal to the measured constants in
 * itadCoverage.ts so the two cannot drift.
 */

import {
  ITAD_SHOP_TO_RUNNER,
  resolveRunner
} from 'common/discounts/storeMapping'
import {
  ITAD_SHOP_ID_EPIC,
  ITAD_SHOP_ID_GOG,
  ITAD_SHOP_ID_STEAM
} from 'backend/storeSearch/itadCoverage'
import {
  STORE_SEARCH_ERROR_MARKER,
  storeSearchErrorCode
} from 'common/types/storeSearch'

describe('ITAD_SHOP_TO_RUNNER', () => {
  it('keys the measured shop ids', () => {
    expect(ITAD_SHOP_TO_RUNNER[ITAD_SHOP_ID_STEAM]).toBe('steam')
    expect(ITAD_SHOP_TO_RUNNER[ITAD_SHOP_ID_GOG]).toBe('gog')
    expect(ITAD_SHOP_TO_RUNNER[ITAD_SHOP_ID_EPIC]).toBe('legendary')
  })

  it('has exactly the three mapped shops (no Amazon)', () => {
    expect(Object.keys(ITAD_SHOP_TO_RUNNER).sort()).toEqual(
      [ITAD_SHOP_ID_STEAM, ITAD_SHOP_ID_GOG, ITAD_SHOP_ID_EPIC].sort()
    )
  })
})

describe('resolveRunner', () => {
  it('resolves a known shop id to its Runner', () => {
    expect(resolveRunner(ITAD_SHOP_ID_STEAM)).toBe('steam')
    expect(resolveRunner(ITAD_SHOP_ID_GOG)).toBe('gog')
    expect(resolveRunner(ITAD_SHOP_ID_EPIC)).toBe('legendary')
  })

  it('returns undefined for Amazon and unknown ids', () => {
    expect(resolveRunner('4')).toBeUndefined()
    expect(resolveRunner('999')).toBeUndefined()
  })
})

describe('storeSearchErrorCode', () => {
  it('reads the marker from an Error message', () => {
    expect(
      storeSearchErrorCode(new Error('[storeSearch:rateLimited] prices 429'))
    ).toBe('rateLimited')
    expect(
      storeSearchErrorCode(
        new Error(`${STORE_SEARCH_ERROR_MARKER.notConfigured} search none`)
      )
    ).toBe('notConfigured')
  })

  it('reads the marker from a string rejection (as Tauri delivers)', () => {
    expect(
      storeSearchErrorCode('Error: [storeSearch:notConfigured] search none')
    ).toBe('notConfigured')
  })

  it('falls back to provider', () => {
    expect(storeSearchErrorCode(new Error('boom'))).toBe('provider')
    expect(storeSearchErrorCode(undefined)).toBe('provider')
  })
})
