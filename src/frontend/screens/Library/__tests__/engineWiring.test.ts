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
import { FavouriteGame, GameInfo, HiddenGame } from 'common/types'
import { FilterEngineDeps, FilterEngineState } from 'frontend/types'
import { gameKey } from '../filterEngine'
import {
  buildEngineDeps,
  buildFavouriteKeys,
  buildGridPipeline,
  collectionIsStale,
  EngineDepsInputs
} from '../engineWiring'

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
    noStorePage: 'off',
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

/**
 * CR-02 / WR-15. Before this fix nothing in the phase exercised
 * `engineDeps` construction at all -- `filterEngine.test.ts` built `deps`
 * from its own local `makeDeps()` factory, and the two source-text gates
 * never look at values. That untested seam is where CR-02 lived: the
 * engine's `favouriteKeys` was derived from the Library screen's
 * `favourites` DISPLAY memo, which only populates when
 * `showFavourites || showFavouritesLibrary`.
 *
 * Both of those are off on a default install -- `libraryTopSection`
 * defaults to `'disabled'` (`src/backend/config.ts`, `GlobalState.tsx`) and
 * `localStorage['show_favorites']` defaults to `'false'` with its only UI
 * (`LibraryFilters`) deleted by 34.11-09 -- so `favouriteKeys` was an empty
 * Set and `passesView(game, 'favourites', deps)` was false for EVERY game.
 *
 * Every case below therefore goes through the real `buildEngineDeps`, and
 * the headline case composes it with the real `buildGridPipeline`, so what
 * is under test is the production path and not a replica of it.
 */
function makeDepsInputs(
  overrides: Partial<EngineDepsInputs> = {}
): EngineDepsInputs {
  return {
    hiddenGames: [],
    favouriteGames: [],
    libraryUnion: [],
    nonAvailableGamesRaw: null,
    recentAppNames: [],
    customCategories: {},
    gameUpdates: [],
    crossoverRatings: {},
    hostPlatform: 'darwin',
    ...overrides
  }
}

function makeFavourite(appName: string): FavouriteGame {
  return { appName, title: appName }
}

describe('buildEngineDeps: the Favourites view works on a default install (CR-02)', () => {
  const libraryUnion = [
    makeGame({ app_name: 'g1', runner: 'gog', title: 'Gog One' }),
    makeGame({ app_name: 'g2', runner: 'gog', title: 'Gog Two' }),
    makeGame({ app_name: 's1', runner: 'steam', title: 'Steam One' })
  ]

  it('the Favourites view returns the favourited games with libraryTopSection disabled and show_favorites false', () => {
    // The default-install configuration exactly: NOTHING about the
    // top-section display setting or the deleted show_favorites toggle is an
    // input to this function any more, which is the fix. Before it, this
    // same configuration produced an empty Set and an empty grid.
    const deps = buildEngineDeps(
      makeDepsInputs({
        libraryUnion,
        favouriteGames: [makeFavourite('g1'), makeFavourite('s1')]
      })
    )

    const pipeline = buildGridPipeline(
      libraryUnion,
      makeState({ view: 'favourites' }),
      deps
    )

    expect(pipeline.games.map((game) => game.app_name).sort()).toEqual([
      'g1',
      's1'
    ])
  })

  it('favouriteKeys carries the runner, not just the app_name -- passesView compares gameKey()', () => {
    const deps = buildEngineDeps(
      makeDepsInputs({ libraryUnion, favouriteGames: [makeFavourite('g1')] })
    )

    expect([...deps.favouriteKeys]).toEqual(['g1_gog'])
  })

  it('a favourite owned on two stores resolves to BOTH keys', () => {
    // FavouriteGame is keyed by appName alone, so the runner can only come
    // from the library entries -- and there can be more than one.
    const dualOwned = [
      makeGame({ app_name: 'dual', runner: 'gog' }),
      makeGame({ app_name: 'dual', runner: 'steam' })
    ]
    const keys = buildFavouriteKeys([makeFavourite('dual')], dualOwned)

    expect([...keys].sort()).toEqual(['dual_gog', 'dual_steam'])
  })

  it('a favourite that is not in the library union produces no key rather than a bogus one', () => {
    const keys = buildFavouriteKeys([makeFavourite('not-owned')], libraryUnion)

    expect([...keys]).toEqual([])
  })

  it('a hidden favourite stays IN favouriteKeys -- the showHidden tri-state is applied by filterLibrary, not by deps', () => {
    // deps is data; state is the selection. Pre-filtering hidden games here
    // would apply the rule twice and make deps depend on filter state.
    const hidden: HiddenGame[] = [{ appName: 'g1', title: 'Gog One' }]
    const deps = buildEngineDeps(
      makeDepsInputs({
        libraryUnion,
        favouriteGames: [makeFavourite('g1')],
        hiddenGames: hidden
      })
    )

    expect(deps.favouriteKeys.has('g1_gog')).toBe(true)

    // ...and filterLibrary is what actually drops it while showHidden is off.
    const offPipeline = buildGridPipeline(
      libraryUnion,
      makeState({ view: 'favourites', showHidden: 'off' }),
      deps
    )
    expect(offPipeline.games).toHaveLength(0)

    const shownPipeline = buildGridPipeline(
      libraryUnion,
      makeState({ view: 'favourites', showHidden: 'show' }),
      deps
    )
    expect(shownPipeline.games.map((game) => game.app_name)).toEqual(['g1'])
  })

  it('no favourites at all still yields an empty key set -- the fix must not fabricate favourites', () => {
    const deps = buildEngineDeps(makeDepsInputs({ libraryUnion }))

    expect(deps.favouriteKeys.size).toBe(0)
    expect(
      buildGridPipeline(libraryUnion, makeState({ view: 'favourites' }), deps)
        .games
    ).toHaveLength(0)
  })
})

describe('buildEngineDeps: the remaining fields (WR-15)', () => {
  it('maps hiddenGames to app names and passes the rest through unchanged', () => {
    const libraryUnion = [makeGame({ app_name: 'g1', runner: 'gog' })]
    const deps = buildEngineDeps(
      makeDepsInputs({
        libraryUnion,
        hiddenGames: [
          { appName: 'h1', title: 'Hidden One' },
          { appName: 'h2', title: 'Hidden Two' }
        ],
        nonAvailableGamesRaw: '["na1","na2"]',
        recentAppNames: ['r1'],
        customCategories: { Backlog: ['g1_gog'] },
        gameUpdates: ['u1'],
        crossoverRatings: { g1: null },
        hostPlatform: 'linux'
      })
    )

    expect(deps.hiddenAppNames).toEqual(['h1', 'h2'])
    expect(deps.nonAvailableAppNames).toEqual(['na1', 'na2'])
    expect(deps.recentAppNames).toEqual(['r1'])
    expect(deps.customCategories).toEqual({ Backlog: ['g1_gog'] })
    expect(deps.gameUpdates).toEqual(['u1'])
    expect(deps.crossoverRatings).toEqual({ g1: null })
    expect(deps.hostPlatform).toBe('linux')
  })

  it('an absent nonAvailableGames key yields an empty list', () => {
    expect(buildEngineDeps(makeDepsInputs()).nonAvailableAppNames).toEqual([])
  })
})

/**
 * 08.1 review WR-04. `buildEngineDeps` is called from the `engineDeps` useMemo
 * in `Library/index.tsx`, OUTSIDE the try/catch that wraps the Fuse search, so
 * a throw here does not degrade one filter -- it unmounts the whole Library
 * screen. The input is a localStorage string the app itself rewrites, which is
 * exactly the kind of value a partial write or an older format can corrupt.
 *
 * Red-proof, measured against the previous `JSON.parse(raw || '[]') as
 * string[]` implementation rather than assumed: SIX of the seven cases throw
 * or return a non-array there. The wrong-shape cases matter as much as the
 * malformed ones -- `'"5"'` and `'{}'` PARSE fine and reached `filterEngine`
 * as something with no `.includes`, moving the failure one layer downstream
 * instead of throwing.
 *
 * The EXCEPTION is `''`, which is green on both sides: `'' || '[]'`
 * short-circuits to `'[]'`, so the old expression already yielded `[]` for it.
 * It is kept as a behavioural pin, NOT counted as a red-proof -- calling it
 * one would overstate this block's power, which is the failure mode
 * `T-34.11-26` and `F-34.10-08` both exist to prevent.
 */
describe('buildEngineDeps: a corrupt nonAvailableGames value cannot take down the Library (WR-04)', () => {
  const degradesToEmpty: Array<[string, string]> = [
    ['truncated JSON from a partial write', '["na1"'],
    ['not JSON at all (an older plain-text format)', 'na1,na2'],
    ['the empty string', ''],
    ['a JSON string rather than an array', '"5"'],
    ['a JSON object rather than an array', '{}'],
    ['a JSON number rather than an array', '42'],
    ['JSON null', 'null']
  ]

  it.each(degradesToEmpty)('%s yields an empty list, no throw', (_why, raw) => {
    const deps = buildEngineDeps(makeDepsInputs({ nonAvailableGamesRaw: raw }))
    expect(deps.nonAvailableAppNames).toEqual([])
  })

  it('keeps the string entries of a mixed array and drops the rest', () => {
    const deps = buildEngineDeps(
      makeDepsInputs({ nonAvailableGamesRaw: '["na1",7,null,"na2",{}]' })
    )
    expect(deps.nonAvailableAppNames).toEqual(['na1', 'na2'])
  })
})

/**
 * WR-09 (quick 260827-t9c). A renamed or deleted category left behind in a
 * persisted `currentCollection` selection used to filter the whole grid to
 * nothing, with no row left in the Collections list to click to recover --
 * `collectionIsStale` is the predicate `Library/index.tsx` now runs on every
 * `currentCollection`/`customCategories.list` change to detect and clear
 * exactly that state. Five rows: the two non-collection sentinels that must
 * never be convicted, a live category, a renamed-away category, and a
 * deleted-entirely category.
 */
describe('collectionIsStale (WR-09)', () => {
  it.each<[string, string | null, Record<string, string[]>, boolean]>([
    ['null (no collection constraint) is never stale', null, {}, false],
    [
      "the Uncategorized sentinel is never stale even with an empty customCategories map",
      'preset_uncategorized',
      {},
      false
    ],
    [
      'a category that still exists is not stale',
      'Shooters',
      { Shooters: [] },
      false
    ],
    [
      'a category renamed out from under the selection is stale',
      'Shooters',
      { Shooters2: [] },
      true
    ],
    [
      'a category deleted entirely is stale against an empty map',
      'Shooters',
      {},
      true
    ]
  ])('%s', (_why, collection, customCategories, expected) => {
    expect(collectionIsStale(collection, customCategories)).toBe(expected)
  })
})
