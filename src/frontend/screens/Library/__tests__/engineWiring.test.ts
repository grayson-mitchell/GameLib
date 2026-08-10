/**
 * Regression tests for the `Library/index.tsx` <-> `filterEngine.ts` wiring
 * (34.11 code review, CR-01 / WR-14).
 *
 * Why this file exists rather than another `filterEngine.test.ts` case:
 * `filterEngine.test.ts:184-200` already asserted the D-28
 * exclude-your-own-facet rule and passed throughout CR-01's lifetime,
 * because it hands `countFor` the FULL library -- a call shape production
 * never made. Production filtered first and counted second. Every assertion
 * below therefore goes through `buildGridPipeline`, the module
 * `Library/index.tsx` actually calls, so the arguments under test are the
 * real ones and not a replica of them.
 *
 * Direct-invocation idiom, no `render()`: the Frontend jest project runs
 * `testEnvironment: 'node'` (`src/frontend/jest.config.js`) and this project
 * has no jsdom and no DOM-rendering test helper installed.
 */
import { GameInfo } from 'common/types'
import { FilterEngineDeps, FilterEngineState } from 'frontend/types'
import { gameKey } from '../filterEngine'
import { buildGridPipeline } from '../engineWiring'

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

function makeState(
  overrides: Partial<FilterEngineState> = {}
): FilterEngineState {
  return {
    view: 'all',
    collection: null,
    stores: [],
    runnability: [],
    searchMatchedKeys: null,
    showHidden: 'off',
    showNonAvailable: 'off',
    showSupportOfflineOnly: false,
    showThirdPartyManagedOnly: false,
    showUpdatesOnly: false,
    ...overrides
  }
}

describe('buildGridPipeline: counts are computed over the UNFILTERED union (CR-01)', () => {
  // The review's own empirical reproduction: 1 gog game + 3 steam games,
  // with gog the currently-selected store. As wired before the fix this
  // reported 0; as unit-tested against the full library it reported 3.
  const libraryUnion = [
    makeGame({ app_name: 'g1', runner: 'gog', title: 'Gog One' }),
    makeGame({ app_name: 's1', runner: 'steam', title: 'Steam One' }),
    makeGame({ app_name: 's2', runner: 'steam', title: 'Steam Two' }),
    makeGame({ app_name: 's3', runner: 'steam', title: 'Steam Three' })
  ]

  it('an unselected sibling store reports its real count, not 0, while another store is selected', () => {
    const pipeline = buildGridPipeline(
      libraryUnion,
      makeState({ stores: ['gog'] }),
      makeDeps()
    )

    // The grid is correctly narrowed to the selected store...
    expect(pipeline.games.map((game) => game.app_name)).toEqual(['g1'])
    // ...and the sibling option still advertises what selecting it WOULD
    // yield. This is the assertion the pre-fix wiring failed: it returned 0
    // because it counted over `pipeline.games` rather than `libraryUnion`.
    expect(pipeline.countForStore('steam')).toBe(3)
  })

  it('the selected store still reports its own count', () => {
    const pipeline = buildGridPipeline(
      libraryUnion,
      makeState({ stores: ['gog'] }),
      makeDeps()
    )

    expect(pipeline.countForStore('gog')).toBe(1)
  })

  it('an unselected runnability tier reports its real count while another tier is selected', () => {
    const runnabilityUnion = [
      makeGame({ app_name: 'n1', runner: 'gog', is_mac_native: true }),
      makeGame({ app_name: 'n2', runner: 'gog', is_mac_native: true }),
      makeGame({ app_name: 'b1', runner: 'gog', mac_arch: '32' }),
      makeGame({ app_name: 'b2', runner: 'gog', mac_arch: '32' })
    ]

    const pipeline = buildGridPipeline(
      runnabilityUnion,
      makeState({ runnability: ['native'] }),
      makeDeps({ hostPlatform: 'darwin' })
    )

    expect(pipeline.games.map((game) => game.app_name)).toEqual(['n1', 'n2'])
    expect(pipeline.countForRunnability('bottle')).toBe(2)
  })

  it('a facet OTHER than the counted one still constrains the count -- skip is per-kind, not a reset (D-28)', () => {
    // Guards the opposite failure mode from CR-01: "fix" the count by
    // counting over the raw union with no state at all and this goes red.
    // Here the collection filter must survive into the store count.
    const pipeline = buildGridPipeline(
      libraryUnion,
      makeState({ stores: ['gog'], collection: 'Backlog' }),
      makeDeps({
        customCategories: {
          Backlog: [gameKey(libraryUnion[1]), gameKey(libraryUnion[2])]
        }
      })
    )

    // Only s1 and s2 are in the Backlog collection, so the steam count is 2
    // (not 3, which would mean the collection constraint was dropped, and
    // not 0, which is CR-01).
    expect(pipeline.countForStore('steam')).toBe(2)
  })
})

describe('buildGridPipeline: counts are computed over the fuzzy-matched set (REQ-34.11-15)', () => {
  const libraryUnion = [
    makeGame({ app_name: 'g1', runner: 'gog', title: 'Witcher' }),
    makeGame({ app_name: 's1', runner: 'steam', title: 'Witcher' }),
    makeGame({ app_name: 's2', runner: 'steam', title: 'Witcher' }),
    makeGame({ app_name: 's3', runner: 'steam', title: 'Something Else' })
  ]

  it('the search constraint narrows the sibling store count', () => {
    // The caller (Library/index.tsx) precomputes the Fuse match set over the
    // same union and puts it on `state`. `countFor` never skips 'search', so
    // this must reach the count.
    const searchMatchedKeys = new Set([
      gameKey(libraryUnion[0]),
      gameKey(libraryUnion[1]),
      gameKey(libraryUnion[2])
    ])

    const pipeline = buildGridPipeline(
      libraryUnion,
      makeState({ stores: ['gog'], searchMatchedKeys }),
      makeDeps()
    )

    // s3 is outside the match set, so the steam count is 2, not 3. Before
    // the CR-01 fix this held only by accident: `searchMatchedKeys` was
    // `null` at the count call sites and the constraint arrived pre-applied
    // in the filtered list being counted over.
    expect(pipeline.countForStore('steam')).toBe(2)
  })

  it('an empty match set is honoured, not treated as "no search"', () => {
    const pipeline = buildGridPipeline(
      libraryUnion,
      makeState({ searchMatchedKeys: new Set<string>() }),
      makeDeps()
    )

    expect(pipeline.games).toHaveLength(0)
    expect(pipeline.countForStore('steam')).toBe(0)
  })
})
