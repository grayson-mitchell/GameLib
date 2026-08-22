/**
 * Unit tests for `FilterFacetGroup/selectionCount.ts`, the single pure
 * counter every facet group uses to answer "how many of MY filters are
 * currently active" (quick task 260815-opt Task 1, D3).
 *
 * Why this module exists at all: `describeActiveFilters` is the declared
 * single source of truth for what is active (34.11 D-26). `storeFacet.length`
 * happens to agree with it today, and a hand-rolled five-term boolean tally
 * in `FilterMoreGroup` would agree with it on the day it is written -- but
 * both are second implementations that can drift from the chip row without
 * anything failing. Counting the descriptor list makes that drift impossible
 * by construction, so this file tests the counter, not three tallies.
 *
 * Pure module, no React, no DOM -- this project runs `testEnvironment:
 * 'node'` with no jsdom (see `src/frontend/jest.config.js`).
 */
import type { ActiveFilterDescriptor } from 'frontend/types'
import {
  MORE_FILTER_KINDS,
  countDescriptorsOfKind
} from '../components/FilterFacetGroup/selectionCount'

function descriptor(
  kind: ActiveFilterDescriptor['kind'],
  value = 'x'
): ActiveFilterDescriptor {
  return { id: `${kind}:${value}`, kind, value }
}

describe('countDescriptorsOfKind', () => {
  it('an empty descriptor list counts 0 for any requested kinds', () => {
    expect(countDescriptorsOfKind([], ['store'])).toBe(0)
    expect(countDescriptorsOfKind([], MORE_FILTER_KINDS)).toBe(0)
  })

  it('descriptors of only non-matching kinds count 0', () => {
    const descriptors = [descriptor('view'), descriptor('search')]

    expect(countDescriptorsOfKind(descriptors, ['store'])).toBe(0)
  })

  it('counts every matching entry, not just the first -- two stores count 2', () => {
    const descriptors = [
      descriptor('store', 'gog'),
      descriptor('store', 'steam'),
      descriptor('runnability', 'native')
    ]

    expect(countDescriptorsOfKind(descriptors, ['store'])).toBe(2)
  })

  it('counts each kind independently over the same list -- runnability counts 1', () => {
    const descriptors = [
      descriptor('store', 'gog'),
      descriptor('store', 'steam'),
      descriptor('runnability', 'native')
    ]

    expect(countDescriptorsOfKind(descriptors, ['runnability'])).toBe(1)
  })

  it('a multi-kind request counts the union -- 2 of 3 fall inside MORE_FILTER_KINDS', () => {
    const descriptors = [
      descriptor('showHidden', 'only'),
      descriptor('showUpdatesOnly', 'true'),
      descriptor('store', 'gog')
    ]

    expect(countDescriptorsOfKind(descriptors, MORE_FILTER_KINDS)).toBe(2)
  })
})

/**
 * `MORE_FILTER_KINDS` is a MANUAL transcription of `describeActiveFilters`'s
 * six More-filters branches. It can drift when a seventh More filter is
 * added there and not here -- at which point the More group's badge would
 * silently under-count while the chip row showed the extra chip. These two
 * guards are the tripwire.
 */
describe('MORE_FILTER_KINDS', () => {
  it('holds exactly the six More-filters descriptor kinds', () => {
    expect([...MORE_FILTER_KINDS].sort()).toEqual([
      'noStorePage',
      'showHidden',
      'showNonAvailable',
      'showSupportOfflineOnly',
      'showThirdPartyManagedOnly',
      'showUpdatesOnly'
    ])
  })

  it('has no duplicate entries (a duplicate would double-count its kind)', () => {
    expect(new Set(MORE_FILTER_KINDS).size).toBe(MORE_FILTER_KINDS.length)
  })
})
