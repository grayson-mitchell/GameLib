/**
 * Unit tests for the CheapShark storeID -> Runner mapping constant
 * (common/discounts/storeMapping.ts — Phase 20, RESEARCH Open Question 1).
 *
 * Asserts each of the four confirmed mappings by value so the constant
 * cannot silently drift.
 */

import {
  CHEAPSHARK_STORE_TO_RUNNER,
  resolveRunner
} from 'common/discounts/storeMapping'

describe('CHEAPSHARK_STORE_TO_RUNNER', () => {
  it('maps storeID 1 to steam', () => {
    expect(CHEAPSHARK_STORE_TO_RUNNER['1']).toBe('steam')
  })

  it('maps storeID 7 to gog', () => {
    expect(CHEAPSHARK_STORE_TO_RUNNER['7']).toBe('gog')
  })

  it('maps storeID 25 to legendary (Epic)', () => {
    expect(CHEAPSHARK_STORE_TO_RUNNER['25']).toBe('legendary')
  })

  it('maps storeID 4 to nile (Amazon, inactive on CheapShark today)', () => {
    expect(CHEAPSHARK_STORE_TO_RUNNER['4']).toBe('nile')
  })
})

describe('resolveRunner', () => {
  it('resolves a known storeID to its Runner', () => {
    expect(resolveRunner('1')).toBe('steam')
    expect(resolveRunner('7')).toBe('gog')
    expect(resolveRunner('25')).toBe('legendary')
    expect(resolveRunner('4')).toBe('nile')
  })

  it('returns undefined for an unknown storeID', () => {
    expect(resolveRunner('999')).toBeUndefined()
  })
})
