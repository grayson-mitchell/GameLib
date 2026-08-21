/**
 * Gates for the library header's filtered-vs-total count (quick task
 * 260815-opt Task 3).
 *
 * The problem: `LibraryHeader` renders `numberOfGames` -- the size of the
 * ALREADY-FILTERED list -- beside a title that always reads "All Games". A
 * bare `42` there is indistinguishable from a 42-game library, so the header
 * cannot answer "why am I looking at 6 games instead of 214?". The
 * denominator is what makes it answerable.
 *
 * Two test shapes in one file, because the subject spans two testability
 * regimes (see `src/frontend/jest.config.js`: `testEnvironment: 'node'`, no
 * jsdom, no react-test-renderer):
 *
 *   1. DIRECT UNIT SPECS for the two pure modules this task adds --
 *      `DEFAULT_FILTER_ENGINE_STATE` and `countGamesExcludingDlc`. These are
 *      real behavioural tests: they run the code.
 *
 *   2. COMMENT-STRIPPED SOURCE GATES for `LibraryHeader/index.tsx` and
 *      `Library/index.tsx`. Neither can be invoked here -- their transitive
 *      import graphs pull in ContextProvider, the whole game-list stack and
 *      colocated CSS. This is the `downloadsRingStyles.test.ts` idiom.
 *
 * What the source gates do NOT and CANNOT prove: that the header renders,
 * what it looks like, or that the denominator matches what the user sees
 * after clicking `Clear all`. No component is mounted here. That proof is
 * owed to the live human gate.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { GameInfo } from 'common/types'
import { FilterEngineDeps } from 'frontend/types'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'
import {
  DEFAULT_FILTER_ENGINE_STATE,
  describeActiveFilters,
  filterLibrary
} from '../filterEngine'
import {
  countGamesExcludingDlc,
  countUnfilteredGames,
  findSilentlyExcludedGames
} from '../components/LibraryHeader/gameCount'

function makeGame(overrides: Partial<GameInfo> = {}): GameInfo {
  return {
    runner: 'gog',
    app_name: 'default-app',
    art_cover: '',
    art_square: '',
    install: { is_dlc: false },
    is_installed: false,
    title: 'Default Game',
    canRunOffline: false,
    ...overrides
  } as GameInfo
}

function makeDeps(overrides: Partial<FilterEngineDeps> = {}): FilterEngineDeps {
  return {
    hiddenAppNames: [],
    nonAvailableAppNames: [],
    favouriteKeys: new Set(),
    recentAppNames: [],
    customCategories: {},
    gameUpdates: [],
    crossoverRatings: {},
    hostPlatform: 'darwin',
    ...overrides
  }
}

describe('DEFAULT_FILTER_ENGINE_STATE', () => {
  it('is every filter at its default -- all view, no collection, no facets, no search, nothing shown extra', () => {
    expect(DEFAULT_FILTER_ENGINE_STATE).toEqual({
      view: 'all',
      collection: null,
      stores: [],
      runnability: [],
      searchMatchedKeys: null,
      showHidden: 'off',
      showNonAvailable: 'off',
      showSupportOfflineOnly: false,
      showThirdPartyManagedOnly: false,
      showUpdatesOnly: false
    })
  })

  /**
   * THE LOAD-BEARING INVARIANT (D5). The header renders the
   * filtered-vs-total form only when `activeFilterCount > 0`, and computes
   * its denominator by running the library through THIS state. Those two
   * facts are only consistent if this state produces no active-filter
   * descriptors at all -- otherwise the denominator would be a filtered
   * number while claiming to be the total.
   *
   * It is also the drift alarm: add a field to `FilterEngineState`, give it
   * a non-default value here, and `describeActiveFilters` starts emitting a
   * descriptor for it. This spec fails; the user never sees a wrong total.
   */
  it('produces ZERO active filter descriptors -- the state behind the denominator is exactly the state where the form does not render', () => {
    expect(describeActiveFilters(DEFAULT_FILTER_ENGINE_STATE, '')).toEqual([])
  })

  it('yields the count reachable by Clear all, not the raw union -- hidden and non-available games are excluded', () => {
    const library = [
      makeGame({ app_name: 'visible-1' }),
      makeGame({ app_name: 'visible-2' }),
      makeGame({ app_name: 'hidden-1' }),
      makeGame({ app_name: 'gone-1' })
    ]
    const deps = makeDeps({
      hiddenAppNames: ['hidden-1'],
      nonAvailableAppNames: ['gone-1']
    })

    const result = filterLibrary(library, DEFAULT_FILTER_ENGINE_STATE, deps)

    // `libraryUnion.length` would be 4 here -- a number the user can never
    // reach by clearing filters, which is exactly why the denominator is
    // this call and not that length.
    expect(result.map((g) => g.app_name)).toEqual(['visible-1', 'visible-2'])
  })
})

describe('countGamesExcludingDlc', () => {
  it('an empty list counts 0', () => {
    expect(countGamesExcludingDlc([])).toBe(0)
  })

  it('undefined and null count 0 rather than throwing (today `if (!list) return 0`)', () => {
    expect(countGamesExcludingDlc(undefined)).toBe(0)
    expect(countGamesExcludingDlc(null)).toBe(0)
  })

  it('excludes non-sideload DLC entries -- 5 entries with 2 DLC counts 3', () => {
    const list = [
      makeGame({ app_name: 'a' }),
      makeGame({ app_name: 'b' }),
      makeGame({ app_name: 'c' }),
      makeGame({ app_name: 'dlc-1', install: { is_dlc: true } }),
      makeGame({ app_name: 'dlc-2', install: { is_dlc: true } })
    ]

    expect(countGamesExcludingDlc(list)).toBe(3)
  })

  /**
   * Today's predicate is `lib.runner !== 'sideload' && lib.install.is_dlc`,
   * so a sideloaded entry flagged as DLC is COUNTED. Transcribed, not
   * "improved": the numerator and the denominator must apply the identical
   * rule or the header can print `42 of 41`, and changing the rule here
   * would change the shipped unfiltered count too.
   */
  it('a sideload entry flagged is_dlc is still COUNTED (the shipped predicate excludes sideload from the DLC test)', () => {
    const list = [
      makeGame({ app_name: 'a' }),
      makeGame({
        app_name: 'side-dlc',
        runner: 'sideload',
        install: { is_dlc: true }
      })
    ]

    expect(countGamesExcludingDlc(list)).toBe(2)
  })

  it('an install object with no is_dlc key does not throw and is counted', () => {
    const list = [makeGame({ app_name: 'a', install: {} })]

    expect(countGamesExcludingDlc(list)).toBe(1)
  })
})

/**
 * The denominator, end to end. This is a BEHAVIOURAL proof, not a source
 * gate, and it exists in this shape because `libraryPipeline.test.ts`
 * forbids the engine call from living inside `Library/index.tsx` -- an
 * engine call in that component is one no test can reach with the real
 * arguments, which is what CR-01 was. Pulling it into
 * `countUnfilteredGames` is what makes the assertions below possible at all.
 */
describe('countUnfilteredGames -- the denominator', () => {
  it('counts what Clear all would show: excludes hidden, non-available AND DLC in one pass', () => {
    const library = [
      makeGame({ app_name: 'keep-1' }),
      makeGame({ app_name: 'keep-2' }),
      makeGame({ app_name: 'keep-3' }),
      makeGame({ app_name: 'hidden-1' }),
      makeGame({ app_name: 'gone-1' }),
      makeGame({ app_name: 'dlc-1', install: { is_dlc: true } })
    ]
    const deps = makeDeps({
      hiddenAppNames: ['hidden-1'],
      nonAvailableAppNames: ['gone-1']
    })

    // 6 in the union, 3 reachable. `libraryUnion.length` would say 6 and
    // the raw filtered length would say 3 only by coincidence here -- the
    // DLC entry is what separates this from a plain `filterLibrary().length`.
    expect(countUnfilteredGames(library, deps)).toBe(3)
  })

  it('agrees with the numerator function on an unfiltered library -- otherwise the header could print "N of M" with M < N', () => {
    const library = [
      makeGame({ app_name: 'a' }),
      makeGame({ app_name: 'b' }),
      makeGame({ app_name: 'dlc', install: { is_dlc: true } })
    ]

    expect(countUnfilteredGames(library, makeDeps())).toBe(
      countGamesExcludingDlc(library)
    )
  })

  it('an empty union counts 0', () => {
    expect(countUnfilteredGames([], makeDeps())).toBe(0)
  })
})

const LIBRARY_HEADER_PATH = join(
  __dirname,
  '..',
  'components',
  'LibraryHeader',
  'index.tsx'
)
const LIBRARY_INDEX_PATH = join(__dirname, '..', 'index.tsx')

function readGated(path: string): string {
  return stripSourceComments(readFileSync(path, 'utf8'))
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

function gateSource(source: string): string {
  return stripSourceComments(source)
    .split('\n')
    .map(stripTrailingLineComment)
    .join('\n')
}

/**
 * Proves the stripper is load-bearing BEFORE any gate leans on it. Without
 * this, a gate could be satisfied by a source file that merely NAMES the
 * token it is looking for inside a comment -- which is the exact defect
 * class `stripSourceComments` was extracted to close (see its docstring).
 */
describe('source-gate stripper integrity', () => {
  const SPECIMEN = [
    '// activeFilterCount > 0',
    '/*',
    ' activeFilterCount > 0',
    '*/',
    '/* activeFilterCount > 0 */',
    'const real = 1'
  ].join('\n')

  it('a token appearing ONLY inside line and block comments does not survive stripping', () => {
    expect(SPECIMEN).toContain('activeFilterCount > 0')
    expect(gateSource(SPECIMEN)).not.toContain('activeFilterCount > 0')
  })

  it('real code on the same specimen survives -- the stripper is not simply deleting everything', () => {
    expect(gateSource(SPECIMEN)).toContain('const real = 1')
  })
})

describe('LibraryHeader source gate -- filtered-vs-total count', () => {
  const source = readGated(LIBRARY_HEADER_PATH)

  it('reads activeFilterCount off LibraryContext', () => {
    expect(source).toContain('LibraryContext')
    expect(source).toContain('activeFilterCount')
  })

  it('gates the new form on activeFilterCount > 0, so an unfiltered library renders exactly what it renders today', () => {
    expect(source).toContain('activeFilterCount > 0')
  })

  it('SANITY: the gate token assertion fires against a known-bad specimen that omits it', () => {
    expect(gateSource('const x = 1')).not.toContain('activeFilterCount > 0')
  })

  it('carries a LITERAL key and a LITERAL default for the new string (i18next-parser resolves nothing else)', () => {
    expect(source).toContain("'gamelib:library.header.filteredOfTotal'")
    expect(source).toContain("'{{shown}} of {{total}}'")
  })

  it('never uses {{count}} -- reserved by i18next for plural key resolution (C6)', () => {
    expect(source).not.toContain('{{count}}')
  })

  it('SANITY: the {{count}} prohibition fires against a known-bad specimen', () => {
    expect(gateSource("t('k', '{{count}} of {{total}}')")).toContain(
      '{{count}}'
    )
  })

  it('counts through the shared helper and keeps no inline DLC filter of its own (D6)', () => {
    expect(source).toContain('countGamesExcludingDlc')
    expect(source).not.toContain('install.is_dlc')
  })

  it('SANITY: the inline-DLC-filter prohibition fires against the predicate it replaced', () => {
    expect(
      gateSource(
        "list.filter((lib) => lib.runner !== 'sideload' && lib.install.is_dlc)"
      )
    ).toContain('install.is_dlc')
  })
})

describe('Library/index.tsx source gate -- denominator wiring', () => {
  const source = readGated(LIBRARY_INDEX_PATH)

  it('passes totalGames to LibraryHeader', () => {
    expect(source).toMatch(/<LibraryHeader[\s\S]{0,200}?totalGames=/)
  })

  it('SANITY: the totalGames wiring assertion fires against the call site it replaced', () => {
    expect(gateSource('<LibraryHeader list={libraryToShow} />')).not.toMatch(
      /<LibraryHeader[\s\S]{0,200}?totalGames=/
    )
  })

  it('derives that total through countUnfilteredGames, not libraryUnion.length', () => {
    expect(source).toContain('countUnfilteredGames(libraryUnion, engineDeps)')
    expect(source).not.toMatch(/totalGames=\{libraryUnion\.length\}/)
  })

  it('SANITY: the denominator-source assertion fires against the naive alternative', () => {
    const knownBad = gateSource(
      '<LibraryHeader list={libraryToShow} totalGames={libraryUnion.length} />'
    )

    expect(knownBad).not.toContain(
      'countUnfilteredGames(libraryUnion, engineDeps)'
    )
    expect(knownBad).toMatch(/totalGames=\{libraryUnion\.length\}/)
  })

  /**
   * `libraryPipeline.test.ts` already forbids `filterLibrary(`/`countFor(`
   * in this component. Restated here from the denominator's side so that a
   * future contributor who inlines the engine call to "simplify" this
   * feature sees WHY it is not inline, in the file that motivated it.
   */
  it('holds no engine call shape of its own -- the denominator goes through the testable helper', () => {
    expect(source).not.toContain('filterLibrary(')
    expect(source).not.toContain('DEFAULT_FILTER_ENGINE_STATE')
  })
})

/**
 * Gates for `findSilentlyExcludedGames` -- the blind-spot guard added by debug
 * session `steam-library-22-games-missing` (2026-08-21).
 *
 * WHY THIS BLOCK EXISTS AT ALL: the guard shipped with the fix but with no
 * test of its own, and its only observed evidence was that it stayed SILENT on
 * a passing live run. Silence from an untested guard is worth nothing -- it is
 * indistinguishable from a guard that cannot fire. That is the failure this
 * project has hit repeatedly: a check that is non-vacuous and correctly
 * computed and still guards nothing. So every spec below is paired: the guard
 * must FIRE on the known-bad input that actually occurred, and stay SILENT on
 * the known-good one.
 *
 * The known-bad input is not invented. On 2026-08-21 at 22:38:02 a clean boot
 * pushed 25 owned, correctly-installed Steam appIds into the
 * `nonAvailableGames` list via a hydration-race false negative, dropping the
 * header from 381 to 356 with no filter chip rendered. 719040 (Wasteland 3)
 * and 1335830 (Len's Island) were among them.
 */
describe('findSilentlyExcludedGames', () => {
  it('FIRES for an owned, non-DLC, non-delisted Steam game stuck in nonAvailableAppNames', () => {
    const library = [
      makeGame({ runner: 'steam', app_name: '719040', title: 'Wasteland 3' })
    ]

    expect(
      findSilentlyExcludedGames(
        library,
        makeDeps({ nonAvailableAppNames: ['719040'] })
      )
    ).toEqual(['719040'])
  })

  it('stays SILENT on the same library when nothing is excluded', () => {
    const library = [
      makeGame({ runner: 'steam', app_name: '719040', title: 'Wasteland 3' })
    ]

    expect(findSilentlyExcludedGames(library, makeDeps())).toEqual([])
  })

  it('reports EVERY silently excluded entry, not just the first', () => {
    const library = [
      makeGame({ runner: 'steam', app_name: '719040' }),
      makeGame({ runner: 'steam', app_name: '1335830' }),
      makeGame({ runner: 'steam', app_name: '1771300' })
    ]

    expect(
      findSilentlyExcludedGames(
        library,
        makeDeps({
          nonAvailableAppNames: ['719040', '1335830', '1771300']
        })
      )
    ).toEqual(['719040', '1335830', '1771300'])
  })

  /**
   * A delisted Steam game is excluded by `isNonAvailableGame`'s own delisted
   * clause. That exclusion is CORRECT and expected, so surfacing it would
   * make the guard cry wolf on every library holding a delisted title -- and a
   * guard that fires on normal use cannot distinguish signal from noise. The
   * store census taken during the session held 9 such entries.
   */
  it('does NOT fire for a delisted Steam game -- that exclusion is legitimate', () => {
    const library = [
      makeGame({ runner: 'steam', app_name: '206060', is_delisted: true })
    ]

    expect(
      findSilentlyExcludedGames(
        library,
        makeDeps({ nonAvailableAppNames: ['206060'] })
      )
    ).toEqual([])
  })

  it('does NOT fire for DLC -- DLC is unconditionally excluded from the header count', () => {
    const library = [
      makeGame({
        runner: 'steam',
        app_name: '12345',
        install: { is_dlc: true }
      })
    ]

    expect(
      findSilentlyExcludedGames(
        library,
        makeDeps({ nonAvailableAppNames: ['12345'] })
      )
    ).toEqual([])
  })

  /**
   * Scope is Steam-only and deliberately so: the hydration race proven in
   * `steam/games.ts` is the mechanism this guard watches. Widening it to every
   * runner without evidence of the same defect there would trade a targeted
   * gate for a noisy one.
   */
  it('does NOT fire for a non-Steam runner excluded by the same list', () => {
    const library = [makeGame({ runner: 'gog', app_name: 'gog-game' })]

    expect(
      findSilentlyExcludedGames(
        library,
        makeDeps({ nonAvailableAppNames: ['gog-game'] })
      )
    ).toEqual([])
  })

  it('picks the excluded Steam game out of a mixed library, leaving the healthy ones alone', () => {
    const library = [
      makeGame({ runner: 'steam', app_name: '719040' }),
      makeGame({ runner: 'steam', app_name: '8870' }),
      makeGame({ runner: 'gog', app_name: 'gog-game' }),
      makeGame({ runner: 'steam', app_name: '206060', is_delisted: true })
    ]

    expect(
      findSilentlyExcludedGames(
        library,
        makeDeps({ nonAvailableAppNames: ['719040', 'gog-game', '206060'] })
      )
    ).toEqual(['719040'])
  })
})
