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
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { Runner, WineInstallation } from 'common/types'

import {
  filterWineEngines,
  isBottleCapableEngine,
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

// ---------------------------------------------------------------------------
// 34.13 review B-WR-07 / B-WR-08 — source gates over `index.tsx`.
//
// The component itself cannot be imported here (see this file's header), so
// these read it as text. Each is a THROWING helper driven against a known-bad
// input DERIVED FROM THE REAL SOURCE, never a hand-written replica.
// ---------------------------------------------------------------------------
describe('WineSelector/index.tsx source gates (34.13 review)', () => {
  const WINE_SELECTOR_PATH = join(__dirname, '..', 'index.tsx')
  const stripped = stripSourceComments(readFileSync(WINE_SELECTOR_PATH, 'utf8'))

  function assertDetailsToggleIsLive(source: string) {
    const start = source.indexOf('<details')
    if (start === -1) throw new Error('assertDetailsToggleIsLive: no <details>')
    const tag = source.slice(start, source.indexOf('>', start))
    if (/onChange/.test(tag)) {
      throw new Error(
        'assertDetailsToggleIsLive: <details> carries onChange -- it fires a `toggle` event, never `change`, so the handler can never run'
      )
    }
    if (!/onToggle/.test(tag)) {
      throw new Error(
        'assertDetailsToggleIsLive: <details> has no onToggle handler, so the controlled `open` attribute fights the browser and the section cannot collapse'
      )
    }
    if (/setDetailsOpen\(detailsOpen\)/.test(source)) {
      throw new Error(
        'assertDetailsToggleIsLive: setDetailsOpen writes back its OWN current value -- React bails out and nothing changes'
      )
    }
  }

  it('B-WR-07: the <details> disclosure is genuinely controllable', () => {
    expect(() => assertDetailsToggleIsLive(stripped)).not.toThrow()
  })

  it('B-WR-07-RED: the gate trips on the pre-fix shape, DERIVED FROM THE REAL SOURCE', () => {
    const knownBad = stripped.replace(
      /onToggle=\{[\s\S]*?\n\s*\}\n/,
      'onChange={() => setDetailsOpen(detailsOpen)}\n'
    )
    expect(knownBad).not.toBe(stripped)
    expect(() => assertDetailsToggleIsLive(knownBad)).toThrow(/onChange/)
  })

  it.each([
    ['crossover' as const, true],
    ['toolkit' as const, false],
    ['wine' as const, false],
    ['proton' as const, false]
  ])(
    'B-WR-08: isBottleCapableEngine(%s) === %s -- the runtime half of the D-16 invariant',
    (type, expected) => {
      expect(
        isBottleCapableEngine({
          name: 'X',
          type,
          bin: '/bin/x'
        } as WineInstallation)
      ).toBe(expected)
    }
  )

  it('B-WR-08: an absent engine is not bottle-capable (the no-CrossOver-installed host)', () => {
    expect(isBottleCapableEngine(undefined)).toBe(false)
  })

  it('B-WR-08: filterWineEngines delegates to the single isBottleCapableEngine predicate rather than inlining the type comparison', () => {
    const moduleSource = stripSourceComments(
      readFileSync(join(__dirname, '..', 'engineFilter.ts'), 'utf8')
    )
    expect(moduleSource).toContain('export function isBottleCapableEngine')
    // Exactly ONE literal `'crossover'` comparison in the module: the
    // predicate's own. A second one is a second definition of the invariant.
    const comparisons = moduleSource.match(/=== 'crossover'/g) ?? []
    expect(comparisons).toHaveLength(1)
  })
})
