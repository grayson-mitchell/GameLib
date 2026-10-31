import { parseEngineOverride } from '../engineIds'
import {
  pinById,
  pinnedEngineIds,
  pinnedEngineIdsFrom,
  ENGINE_PINS
} from '../enginePins'

describe('pins', () => {
  test('pinById returns the current pin', () => {
    expect(pinById('wine-staging-11.20')).toBe(ENGINE_PINS.current)
  })
  test('pinById rejects hostile ids', () => {
    expect(pinById('__proto__')).toBeNull()
    expect(pinById('../x')).toBeNull()
    expect(pinById('')).toBeNull()
  })
  test('pinnedEngineIds lists current only while previous is null', () => {
    expect(pinnedEngineIds()).toEqual(['wine-staging-11.20'])
  })
  test('pinnedEngineIdsFrom lists current then previous', () => {
    const prev = { ...ENGINE_PINS.current, id: 'old' }
    expect(
      pinnedEngineIdsFrom({ current: ENGINE_PINS.current, previous: prev })
    ).toEqual(['wine-staging-11.20', 'old'])
  })
})

describe('parseEngineOverride', () => {
  test('accepts automatic and crossover', () => {
    expect(parseEngineOverride('automatic')).toBe('automatic')
    expect(parseEngineOverride('crossover')).toBe('crossover')
  })
  test('accepts known pinned id only', () => {
    expect(parseEngineOverride('pinned:wine-staging-11.20')).toBe(
      'pinned:wine-staging-11.20'
    )
    expect(parseEngineOverride('pinned:wine-staging-9.99')).toBe('automatic')
  })
  test('accepts a safe wine-manager version', () => {
    expect(parseEngineOverride('wine-manager:Wine-Staging-macOS-11.20')).toBe(
      'wine-manager:Wine-Staging-macOS-11.20'
    )
  })
  test('rejects DXMT, GPTK and path-like wine-manager ids', () => {
    expect(
      parseEngineOverride('wine-manager:Wine-Staging-macOS-11.20-DXMT')
    ).toBe('automatic')
    expect(parseEngineOverride('wine-manager:Game-Porting-Toolkit-2.1')).toBe(
      'automatic'
    )
    expect(parseEngineOverride('wine-manager:../../bin')).toBe('automatic')
    expect(parseEngineOverride('wine-manager:/usr/bin/wine')).toBe('automatic')
  })
  test('non-strings and paths become automatic', () => {
    for (const v of [
      undefined,
      null,
      42,
      {},
      '/Applications/Wine.app/bin/wine',
      'crossover '
    ])
      expect(parseEngineOverride(v)).toBe('automatic')
  })
})
