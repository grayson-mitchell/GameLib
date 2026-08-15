/**
 * Unit tests for WineSelector's `engineFilter.ts` (Phase 34.13-03, D-16 /
 * D-05).
 *
 * Imports from `../engineFilter` (NOT `../index`) -- `index.tsx`
 * transitively imports `frontend/components/UI/SelectField/index.css`
 * through `SelectField`, which this project's jsdom-less jest config
 * cannot parse. See `engineFilter.ts`'s own header doc-comment and the
 * `SideloadDialog/filters.ts` precedent for the full rationale.
 */
import { Runner, WineInstallation } from 'common/types'

import {
  filterWineEngines,
  resolveBottleNameState,
  resolveCrossoverOnly,
  selectDefaultEngine
} from '../engineFilter'

function makeEngine(
  name: string,
  type: WineInstallation['type']
): WineInstallation {
  return { bin: `/bin/${name}`, name, type }
}

// Mixed list with a 'toolkit' engine at index 0 -- makes the
// selectDefaultEngine CrossOver-seeding assertion genuinely load-bearing
// rather than incidentally true (today's `wineVersionList.at(0)` would
// return this toolkit engine).
const mixedList: WineInstallation[] = [
  makeEngine('Game Porting Toolkit', 'toolkit'),
  makeEngine('Wine Stable', 'wine'),
  makeEngine('Proton Experimental', 'proton'),
  makeEngine('CrossOver 24', 'crossover'),
  makeEngine('CrossOver 23', 'crossover')
]

describe('resolveCrossoverOnly', () => {
  it('is true for runner="steam" with the prop left undefined', () => {
    expect(resolveCrossoverOnly('steam', undefined)).toBe(true)
  })

  const nonSteamRunners: Array<Runner | undefined> = [
    'legendary',
    'gog',
    'sideload',
    'nile',
    'zoom',
    undefined
  ]

  it.each(nonSteamRunners)(
    'is false for runner=%p with the prop left undefined',
    (runner) => {
      expect(resolveCrossoverOnly(runner, undefined)).toBe(false)
    }
  )

  it('an explicit crossoverOnly=false overrides the Steam default', () => {
    expect(resolveCrossoverOnly('steam', false)).toBe(false)
  })

  it('an explicit crossoverOnly=true overrides a non-Steam default', () => {
    expect(resolveCrossoverOnly('gog', true)).toBe(true)
  })
})

describe('filterWineEngines', () => {
  it('returns the SAME array reference when crossoverOnly is false', () => {
    expect(filterWineEngines(mixedList, false)).toBe(mixedList)
  })

  it('keeps only crossover-type entries when crossoverOnly is true', () => {
    const result = filterWineEngines(mixedList, true)
    expect(result.map((v) => v.name)).toEqual(['CrossOver 24', 'CrossOver 23'])
    expect(result.every((v) => v.type === 'crossover')).toBe(true)
  })
})

describe('selectDefaultEngine', () => {
  it('returns a crossover engine even when a toolkit engine sits at index 0 (regression guard)', () => {
    const result = selectDefaultEngine(mixedList, true)
    expect(result?.type).toBe('crossover')
    expect(result?.name).toBe('CrossOver 24')
  })

  it('returns wineVersionList.at(0) unchanged when crossoverOnly is false', () => {
    expect(selectDefaultEngine(mixedList, false)).toBe(mixedList[0])
  })

  it('returns undefined for an empty list', () => {
    expect(selectDefaultEngine([], true)).toBeUndefined()
  })

  it('returns undefined when no engine in the list is crossover-type', () => {
    const onlyNonCrossover = [
      makeEngine('Game Porting Toolkit', 'toolkit'),
      makeEngine('Wine Stable', 'wine'),
      makeEngine('Proton Experimental', 'proton')
    ]
    expect(selectDefaultEngine(onlyNonCrossover, true)).toBeUndefined()
  })
})

describe('resolveBottleNameState', () => {
  it('shared-prefix disable does NOT surface the read-only helper', () => {
    expect(resolveBottleNameState(true, undefined)).toEqual({
      disabled: true,
      showReadOnlyHelper: false
    })
  })

  it('bottleNameReadOnly disables the field AND shows the helper', () => {
    expect(resolveBottleNameState(false, true)).toEqual({
      disabled: true,
      showReadOnlyHelper: true
    })
  })

  it('neither flag set: field enabled, no helper', () => {
    expect(resolveBottleNameState(false, undefined)).toEqual({
      disabled: false,
      showReadOnlyHelper: false
    })
  })

  it('both flags set: field disabled, helper shown (bottleNameReadOnly wins the reason, not the disabled state)', () => {
    expect(resolveBottleNameState(true, true)).toEqual({
      disabled: true,
      showReadOnlyHelper: true
    })
  })
})
