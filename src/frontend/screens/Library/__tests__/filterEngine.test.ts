/**
 * Unit tests for filterEngine.ts (34.11 Plan 01, Wave 0 prerequisite).
 *
 * Direct-invocation idiom — no `render()` and no DOM-rendering test helper
 * of any kind (none are installed; see CrossoverBadge.test.tsx and
 * `src/frontend/jest.config.js`'s `testEnvironment: 'node'` docstring).
 * filterEngine.ts has no React import at all, so this file needs no mocks.
 */
import { GameInfo } from 'common/types'
import {
  FilterEngineDeps,
  FilterEngineState,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'
import {
  countFor,
  deriveRunnabilityTier,
  describeActiveFilters,
  filterLibrary,
  gameKey,
  migrateRunnabilityFacetSelection,
  migrateStoreFacetSelection,
  runnabilityRowsForHost
} from '../filterEngine'

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

describe('filter engine', () => {
  it('an empty stores selection imposes no constraint', () => {
    const library = [
      makeGame({ app_name: 'g1', runner: 'gog' }),
      makeGame({ app_name: 's1', runner: 'steam' })
    ]
    const state = makeState({ stores: [] })
    const deps = makeDeps()

    const result = filterLibrary(library, state, deps)

    expect(result.map((g) => g.app_name).sort()).toEqual(['g1', 's1'])
  })

  it("stores is OR-within-kind: ['gog'] keeps gog and drops steam", () => {
    const library = [
      makeGame({ app_name: 'g1', runner: 'gog' }),
      makeGame({ app_name: 's1', runner: 'steam' })
    ]
    const state = makeState({ stores: ['gog'] })
    const deps = makeDeps()

    const result = filterLibrary(library, state, deps)

    expect(result.map((g) => g.app_name)).toEqual(['g1'])
  })

  it("stores is OR-within-kind: ['gog','steam'] keeps both", () => {
    const library = [
      makeGame({ app_name: 'g1', runner: 'gog' }),
      makeGame({ app_name: 's1', runner: 'steam' }),
      makeGame({ app_name: 'n1', runner: 'nile' })
    ]
    const state = makeState({ stores: ['gog', 'steam'] })
    const deps = makeDeps()

    const result = filterLibrary(library, state, deps)

    expect(result.map((g) => g.app_name).sort()).toEqual(['g1', 's1'])
  })

  it('stores and runnability are AND-across-kinds (D-03)', () => {
    // A GOG game whose derived tier is wontRun on darwin.
    const game = makeGame({
      app_name: 'wont-run-app',
      runner: 'gog',
      is_mac_native: false
    })
    const deps = makeDeps({
      hostPlatform: 'darwin',
      crossoverRatings: { 'wont-run-app': 1 }
    })

    const storeOnly = makeState({ stores: ['gog'] })
    expect(filterLibrary([game], storeOnly, deps)).toHaveLength(1)

    const storeAndRunnability = makeState({
      stores: ['gog'],
      runnability: ['native']
    })
    expect(filterLibrary([game], storeAndRunnability, deps)).toHaveLength(0)
  })

  it('DLC is always excluded regardless of skip', () => {
    const dlc = makeGame({
      app_name: 'dlc-app',
      runner: 'gog',
      install: { is_dlc: true }
    })
    const state = makeState()
    const deps = makeDeps()

    const result = filterLibrary([dlc], state, deps, { skip: 'store' })

    expect(result).toHaveLength(0)
  })

  it("passesMore's both-'only' case returns the UNION of hidden and non-available, not the intersection", () => {
    const hiddenOnly = makeGame({ app_name: 'hiddenGame' })
    const nonAvailableOnly = makeGame({ app_name: 'naGame' })
    const neither = makeGame({ app_name: 'neither' })
    const library = [hiddenOnly, nonAvailableOnly, neither]

    const state = makeState({ showHidden: 'only', showNonAvailable: 'only' })
    const deps = makeDeps({
      hiddenAppNames: ['hiddenGame'],
      nonAvailableAppNames: ['naGame']
    })

    const result = filterLibrary(library, state, deps)

    expect(result.map((g) => g.app_name).sort()).toEqual([
      'hiddenGame',
      'naGame'
    ])
  })

  it('a delisted Steam game is VISIBLE at default filters — is_delisted no longer implies non-available (REQ-37-02, D-11)', () => {
    const delisted = makeGame({
      app_name: 'delisted-app',
      runner: 'steam',
      is_delisted: true
    })
    const state = makeState() // showNonAvailable defaults to 'off'
    const deps = makeDeps({ nonAvailableAppNames: [] })

    const result = filterLibrary([delisted], state, deps)

    expect(result.map((g) => g.app_name)).toEqual(['delisted-app'])
  })

  it('a Steam game whose app_name IS in nonAvailableAppNames is still excluded at showNonAvailable: off (over-removal guard)', () => {
    const nonAvailable = makeGame({
      app_name: 'stuck-app',
      runner: 'steam'
    })
    const state = makeState() // showNonAvailable defaults to 'off'
    const deps = makeDeps({ nonAvailableAppNames: ['stuck-app'] })

    const result = filterLibrary([nonAvailable], state, deps)

    expect(result).toHaveLength(0)
  })
})

// SCOPE WARNING (34.11 code review, CR-01). Every case below hands
// `countFor` the FULL library, because that is the contract `countFor`
// itself has: given the unfiltered set, exclude your own facet. It is a
// correct unit test of a correct function -- and it passed, unbroken,
// during the entire time the shipped Library screen was reporting `0` for
// every unselected facet option.
//
// The reason is that production did not make this call. `Library/index.tsx`
// filtered first and handed `countFor` the ALREADY-NARROWED grid output, on
// which `{ skip }` has nothing left to recover. So do NOT read this block as
// coverage of the counts users actually see: it cannot fail for a
// wrong-argument defect at the call site, which is the only place that
// defect can live now that the engine is correct.
//
// The call site's own coverage is `__tests__/engineWiring.test.ts` (the real
// production arguments, behaviourally) plus the `engineWiring` describe in
// `__tests__/libraryPipeline.test.ts` (structurally). If you are changing
// how counts are computed, that is where a change must be proven.
describe('count', () => {
  it('countFor a store option returns the count for every OTHER active filter, not 0 just because a sibling store is selected (D-28)', () => {
    const library = [
      makeGame({ app_name: 'g1', runner: 'gog' }),
      makeGame({ app_name: 'g2', runner: 'gog' }),
      makeGame({ app_name: 's1', runner: 'steam' }),
      makeGame({ app_name: 's2', runner: 'steam' }),
      makeGame({ app_name: 's3', runner: 'steam' })
    ]
    // gog is the currently-selected store. A self-counting implementation
    // would apply this constraint to the steam count too and return 0.
    const state = makeState({ stores: ['gog'] })
    const deps = makeDeps()

    const steamCount = countFor(library, state, deps, 'store', 'steam')

    expect(steamCount).toBe(3)
  })

  it('countFor a runnability option ignores the currently-selected runnability tier', () => {
    const library = [
      makeGame({ app_name: 'n1', runner: 'gog', is_mac_native: true }),
      makeGame({ app_name: 'n2', runner: 'gog', is_mac_native: true }),
      makeGame({ app_name: 'b1', runner: 'gog', mac_arch: '32' })
    ]
    const state = makeState({ runnability: ['native'] })
    const deps = makeDeps({ hostPlatform: 'darwin' })

    const bottleCount = countFor(library, state, deps, 'runnability', 'bottle')

    expect(bottleCount).toBe(1)
  })
})

describe('runnability', () => {
  it.each<
    [
      boolean,
      GameInfo['mac_arch'],
      number | null | undefined,
      RunnabilityTier | null
    ]
  >([
    [true, undefined, 1, 'native'], // D-09: native takes priority over a wontRun rating
    [false, '32', 1, 'bottle'], // D-11: 32-bit mac build is always a bottle
    [false, '64', 5, 'bottle'], // D-10: medal tiers collapse into 'bottle'
    [false, '64', 4, 'bottle'],
    [false, '64', 3, 'bottle'],
    [false, '64', 2, 'wontRun'],
    [false, '64', 1, 'wontRun'],
    [false, '64', null, 'notChecked']
  ])(
    'darwin: is_mac_native=%s mac_arch=%s rating=%s -> %s',
    (isMacNative, macArch, rating, expected) => {
      const game = makeGame({
        app_name: 'app',
        is_mac_native: isMacNative,
        mac_arch: macArch
      })
      const ratings: Record<string, number | null> =
        rating === undefined ? {} : { app: rating }

      expect(deriveRunnabilityTier(game, ratings, 'darwin')).toBe(expected)
    }
  )

  it('darwin: an app absent from the ratings map (undefined) derives to null, NOT notChecked (D-16)', () => {
    const game = makeGame({ app_name: 'never-looked-up' })

    const tier = deriveRunnabilityTier(game, {}, 'darwin')

    expect(tier).toBeNull()
    expect(tier).not.toBe('notChecked')
  })

  it('linux: is_linux_native true derives to native', () => {
    const game = makeGame({ app_name: 'linux-app', is_linux_native: true })

    expect(deriveRunnabilityTier(game, {}, 'linux')).toBe('native')
  })

  it('linux: is_linux_native false/absent derives to null', () => {
    const game = makeGame({ app_name: 'linux-app' })

    expect(deriveRunnabilityTier(game, {}, 'linux')).toBeNull()
  })

  it('renders no runnability rows at all on a Windows host (D-12 extension)', () => {
    const game = makeGame({
      app_name: 'win-app',
      is_mac_native: true,
      is_linux_native: true,
      mac_arch: '64'
    })

    expect(deriveRunnabilityTier(game, { 'win-app': 5 }, 'win32')).toBeNull()
    expect(runnabilityRowsForHost('win32')).toEqual([])
  })
})

describe('store facet', () => {
  it('a runner with no games still yields a count of 0 rather than throwing', () => {
    const library: GameInfo[] = []
    const state = makeState()
    const deps = makeDeps()

    expect(() => countFor(library, state, deps, 'store', 'zoom')).not.toThrow()
    expect(countFor(library, state, deps, 'store', 'zoom')).toBe(0)
  })
})

describe('migration', () => {
  it('a legacy all-true storesFilters object passed as rawLegacy yields [], NOT six selected stores (D-02 discard, do not translate)', () => {
    const legacy = JSON.stringify({
      legendary: true,
      gog: true,
      nile: true,
      sideload: true,
      zoom: true,
      steam: true
    })

    const result = migrateStoreFacetSelection(null, legacy)

    expect(result).toHaveLength(0)
  })

  it('a legacy platformsFilters/crossoverRatingFilters object likewise yields [] from migrateRunnabilityFacetSelection (D-02)', () => {
    const legacy = JSON.stringify({
      win: true,
      linux: true,
      mac: true,
      browser: true
    })

    const result = migrateRunnabilityFacetSelection(null, legacy)

    expect(result).toHaveLength(0)
  })

  it('malformed JSON yields [] and does not throw', () => {
    expect(() => migrateStoreFacetSelection('{not json', null)).not.toThrow()
    expect(migrateStoreFacetSelection('{not json', null)).toEqual([])
    expect(migrateRunnabilityFacetSelection('{not json', null)).toEqual([])
  })

  it('a valid new-shape array round-trips, and unknown members are filtered out', () => {
    const raw = JSON.stringify(['gog', 'steam', 'not-a-real-store'])

    const result = migrateStoreFacetSelection(raw, null)

    expect(result).toEqual<StoreFacetValue[]>(['gog', 'steam'])
  })
})

describe('empty', () => {
  it('describeActiveFilters returns [] for a fully default state', () => {
    const state = makeState()

    expect(describeActiveFilters(state, '')).toEqual([])
  })

  it("view:'installed' produces exactly one descriptor and view:'all' produces none (D-26)", () => {
    const installed = describeActiveFilters(
      makeState({ view: 'installed' }),
      ''
    )
    const all = describeActiveFilters(makeState({ view: 'all' }), '')

    expect(installed).toHaveLength(1)
    expect(all).toHaveLength(0)
  })

  it("a tri-state at 'only' produces a descriptor whose value is 'only', and one at 'show' produces one whose value is 'show'", () => {
    const only = describeActiveFilters(makeState({ showHidden: 'only' }), '')
    const show = describeActiveFilters(makeState({ showHidden: 'show' }), '')

    expect(only.find((d) => d.kind === 'showHidden')?.value).toBe('only')
    expect(show.find((d) => d.kind === 'showHidden')?.value).toBe('show')
  })
})

describe('gameKey', () => {
  it('composes app_name and runner, matching favouritesIds shape', () => {
    const game = makeGame({ app_name: 'my-app', runner: 'steam' })

    expect(gameKey(game)).toBe('my-app_steam')
  })
})
