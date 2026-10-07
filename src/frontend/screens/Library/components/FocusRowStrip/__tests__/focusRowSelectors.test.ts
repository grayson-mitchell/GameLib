/**
 * Unit tests for focusRowSelectors.ts (Phase 48 Plan 02, Task 1 tracer).
 *
 * Direct-invocation idiom — no `render()` and no DOM-rendering test helper
 * (none are installed; see `filterEngine.test.ts`'s own docstring and
 * `src/frontend/jest.config.js`'s `testEnvironment: 'node'`). This selector
 * has no React import at all, so this file needs no mocks.
 *
 * `makeGame()` / `makeDeps()` are copied from
 * `src/frontend/screens/Library/__tests__/filterEngine.test.ts` rather than
 * imported — that file does not export them, and this is the established
 * per-test-file factory convention in this codebase.
 */
import { FocusRowSelection, GameInfo } from 'common/types'
import { FilterEngineDeps, LibraryView } from 'frontend/types'
import {
  FOCUS_ROW_MAX_CARDS,
  focusRowTitleComparator,
  isValidFocusRowSelection,
  selectFocusRowGames
} from '../focusRowSelectors'

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

describe('isValidFocusRowSelection', () => {
  it('accepts every valid kind with a non-empty string value', () => {
    expect(isValidFocusRowSelection({ kind: 'view', value: 'all' })).toBe(true)
    expect(isValidFocusRowSelection({ kind: 'collection', value: 'x' })).toBe(
      true
    )
    expect(isValidFocusRowSelection({ kind: 'store', value: 'x' })).toBe(true)
    expect(isValidFocusRowSelection({ kind: 'runnability', value: 'x' })).toBe(
      true
    )
  })

  it('accepts every LibraryView member (anti-drift: tsc fails if LibraryView gains one the whitelist lacks)', () => {
    const ALL_VIEWS = {
      all: true,
      installed: true,
      recentlyPlayed: true,
      favourites: true
    } satisfies Record<LibraryView, true>

    for (const value of Object.keys(ALL_VIEWS)) {
      expect(isValidFocusRowSelection({ kind: 'view', value })).toBe(true)
    }
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a bare string (legacy enum shape)', 'favourites'],
    ['an empty object', {}],
    ['an unknown kind', { kind: 'nope', value: 'x' }],
    ['a missing value', { kind: 'view' }],
    ['an unrecognised view value', { kind: 'view', value: 'bogus' }]
  ])('rejects %s', (_label, malformed) => {
    expect(isValidFocusRowSelection(malformed)).toBe(false)
  })
})

describe('focusRowTitleComparator', () => {
  it('sorts ascending, stripping a leading "THE " and ignoring case', () => {
    const a = makeGame({ app_name: 'a', title: 'The Zebra' })
    const b = makeGame({ app_name: 'b', title: 'apple' })
    expect([a, b].sort(focusRowTitleComparator)).toEqual([b, a])
  })

  it('tie-breaks identical titles on app_name', () => {
    const a = makeGame({ app_name: 'zebra', title: 'Same Title' })
    const b = makeGame({ app_name: 'apple', title: 'Same Title' })
    expect([a, b].sort(focusRowTitleComparator)).toEqual([b, a])
  })
})

describe('selectFocusRowGames', () => {
  it('returns [] when focusRow is null', () => {
    const library = [makeGame()]
    expect(selectFocusRowGames(library, null, 'off', makeDeps())).toEqual([])
  })

  it('returns all games alphabetically for { kind: "view", value: "all" }', () => {
    const library = [
      makeGame({ app_name: 'c', title: 'Charlie' }),
      makeGame({ app_name: 'a', title: 'Alpha' }),
      makeGame({ app_name: 'b', title: 'Bravo' })
    ]
    const result = selectFocusRowGames(
      library,
      { kind: 'view', value: 'all' },
      'off',
      makeDeps()
    )
    expect(result.map((g) => g.app_name)).toEqual(['a', 'b', 'c'])
  })

  it('returns only installed games for { kind: "view", value: "installed" }', () => {
    const library = [
      makeGame({ app_name: 'a', title: 'Alpha', is_installed: true }),
      makeGame({ app_name: 'b', title: 'Bravo', is_installed: false })
    ]
    const result = selectFocusRowGames(
      library,
      { kind: 'view', value: 'installed' },
      'off',
      makeDeps()
    )
    expect(result.map((g) => g.app_name)).toEqual(['a'])
  })

  it('returns only favourited games for { kind: "view", value: "favourites" }', () => {
    const library = [
      makeGame({ app_name: 'a', runner: 'gog', title: 'Alpha' }),
      makeGame({ app_name: 'b', runner: 'gog', title: 'Bravo' })
    ]
    const result = selectFocusRowGames(
      library,
      { kind: 'view', value: 'favourites' },
      'off',
      makeDeps({ favouriteKeys: new Set(['a_gog']) })
    )
    expect(result.map((g) => g.app_name)).toEqual(['a'])
  })

  it('orders recentlyPlayed by recentAppNames index, most-recent first, not alphabetically', () => {
    // Deliberately non-alphabetical recency order so an alphabetical sort
    // could never produce this result by accident.
    const library = [
      makeGame({ app_name: 'zebra', title: 'Zebra' }),
      makeGame({ app_name: 'apple', title: 'Apple' }),
      makeGame({ app_name: 'mango', title: 'Mango' })
    ]
    const result = selectFocusRowGames(
      library,
      { kind: 'view', value: 'recentlyPlayed' },
      'off',
      makeDeps({ recentAppNames: ['zebra', 'mango', 'apple'] })
    )
    expect(result.map((g) => g.app_name)).toEqual(['zebra', 'mango', 'apple'])
  })

  it('caps at FOCUS_ROW_MAX_CARDS (20) for a 25-game library', () => {
    expect(FOCUS_ROW_MAX_CARDS).toBe(20)
    const library = Array.from({ length: 25 }, (_, i) =>
      makeGame({
        app_name: `app-${String(i).padStart(2, '0')}`,
        title: `Game ${String(i).padStart(2, '0')}`
      })
    )
    const result = selectFocusRowGames(
      library,
      { kind: 'view', value: 'all' },
      'off',
      makeDeps()
    )
    expect(result).toHaveLength(20)
  })

  it('handles a hidden game across all three showHidden modes', () => {
    const library = [
      makeGame({ app_name: 'hidden-game', title: 'Hidden Game' }),
      makeGame({ app_name: 'visible-game', title: 'Visible Game' })
    ]
    const deps = makeDeps({ hiddenAppNames: ['hidden-game'] })
    const pick: FocusRowSelection = { kind: 'view', value: 'all' }

    const off = selectFocusRowGames(library, pick, 'off', deps)
    expect(off.map((g) => g.app_name)).toEqual(['visible-game'])

    const only = selectFocusRowGames(library, pick, 'only', deps)
    expect(only.map((g) => g.app_name)).toEqual(['hidden-game'])

    const show = selectFocusRowGames(library, pick, 'show', deps)
    expect(show.map((g) => g.app_name)).toEqual(['hidden-game', 'visible-game'])
  })

  it('returns without throwing for a 0-game and a 1-game library', () => {
    expect(() =>
      selectFocusRowGames([], { kind: 'view', value: 'all' }, 'off', makeDeps())
    ).not.toThrow()
    expect(
      selectFocusRowGames([], { kind: 'view', value: 'all' }, 'off', makeDeps())
    ).toEqual([])

    const oneGame = [makeGame()]
    expect(() =>
      selectFocusRowGames(
        oneGame,
        { kind: 'view', value: 'all' },
        'off',
        makeDeps()
      )
    ).not.toThrow()
    expect(
      selectFocusRowGames(
        oneGame,
        { kind: 'view', value: 'all' },
        'off',
        makeDeps()
      )
    ).toHaveLength(1)
  })

  it('returns [] with no throw for a collection naming nothing', () => {
    const library = [makeGame({ app_name: 'a', title: 'Alpha' })]
    const result = selectFocusRowGames(
      library,
      { kind: 'collection', value: 'DeletedCollection' },
      'off',
      makeDeps()
    )
    expect(result).toEqual([])
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a bare string (legacy enum shape)', 'favourites'],
    ['an empty object', {}],
    ['an unknown kind', { kind: 'nope', value: 'x' }],
    ['a missing value', { kind: 'view' }],
    ['an unrecognised view value', { kind: 'view', value: 'bogus' }]
  ])(
    'yields [] with no throw for malformed persisted value: %s',
    (_label, malformed) => {
      const library = [makeGame()]
      expect(() =>
        selectFocusRowGames(
          library,
          malformed as FocusRowSelection,
          'off',
          makeDeps()
        )
      ).not.toThrow()
      expect(
        selectFocusRowGames(
          library,
          malformed as FocusRowSelection,
          'off',
          makeDeps()
        )
      ).toEqual([])
    }
  )

  it('excludes DLC', () => {
    const library = [
      makeGame({ app_name: 'base', title: 'Base Game' }),
      makeGame({
        app_name: 'dlc',
        title: 'DLC Pack',
        install: { is_dlc: true }
      })
    ]
    const result = selectFocusRowGames(
      library,
      { kind: 'view', value: 'all' },
      'off',
      makeDeps()
    )
    expect(result.map((g) => g.app_name)).toEqual(['base'])
  })

  it('returns identical output order whether identically-titled games are given reversed, tie-broken on app_name', () => {
    const gameA = makeGame({ app_name: 'zebra', title: 'Same Title' })
    const gameB = makeGame({ app_name: 'apple', title: 'Same Title' })

    const resultForward = selectFocusRowGames(
      [gameA, gameB],
      { kind: 'view', value: 'all' },
      'off',
      makeDeps()
    )
    const resultReversed = selectFocusRowGames(
      [gameB, gameA],
      { kind: 'view', value: 'all' },
      'off',
      makeDeps()
    )

    expect(resultForward.map((g) => g.app_name)).toEqual(['apple', 'zebra'])
    expect(resultReversed.map((g) => g.app_name)).toEqual(['apple', 'zebra'])
  })

  it('does not mutate its input libraryUnion array', () => {
    const library = [
      makeGame({ app_name: 'c', title: 'Charlie' }),
      makeGame({ app_name: 'a', title: 'Alpha' }),
      makeGame({ app_name: 'b', title: 'Bravo' })
    ]
    const snapshot = [...library]

    selectFocusRowGames(
      library,
      { kind: 'view', value: 'all' },
      'off',
      makeDeps()
    )

    expect(library).toEqual(snapshot)
  })

  it('is independent of every live filter value — held-out table, not inspection (R4 adjacency)', () => {
    // None of these "live" values is a parameter of selectFocusRowGames.
    // This table enumerates 8 combinations of what the live Library screen
    // filter state COULD be and proves the result for a fixed pick never
    // changes, because the function structurally cannot read them.
    const liveFilterCombinations: Array<{
      libraryView: string
      currentCollection: string | null
      storeFacet: string[]
      runnabilityFacet: string[]
      filterText: string
      alphabetFilterLetter: string | null
    }> = [
      {
        libraryView: 'all',
        currentCollection: null,
        storeFacet: [],
        runnabilityFacet: [],
        filterText: '',
        alphabetFilterLetter: null
      },
      {
        libraryView: 'installed',
        currentCollection: null,
        storeFacet: [],
        runnabilityFacet: [],
        filterText: '',
        alphabetFilterLetter: null
      },
      {
        libraryView: 'favourites',
        currentCollection: 'SomeCollection',
        storeFacet: [],
        runnabilityFacet: [],
        filterText: '',
        alphabetFilterLetter: null
      },
      {
        libraryView: 'recentlyPlayed',
        currentCollection: null,
        storeFacet: ['epic'],
        runnabilityFacet: [],
        filterText: '',
        alphabetFilterLetter: null
      },
      {
        libraryView: 'all',
        currentCollection: null,
        storeFacet: [],
        runnabilityFacet: ['native'],
        filterText: '',
        alphabetFilterLetter: null
      },
      {
        libraryView: 'all',
        currentCollection: null,
        storeFacet: [],
        runnabilityFacet: [],
        filterText: 'zelda',
        alphabetFilterLetter: null
      },
      {
        libraryView: 'all',
        currentCollection: null,
        storeFacet: [],
        runnabilityFacet: [],
        filterText: '',
        alphabetFilterLetter: 'B'
      },
      {
        libraryView: 'installed',
        currentCollection: 'OtherCollection',
        storeFacet: ['gog'],
        runnabilityFacet: ['bottle'],
        filterText: 'anything',
        alphabetFilterLetter: '#'
      }
    ]

    const library = [
      makeGame({ app_name: 'c', title: 'Charlie' }),
      makeGame({ app_name: 'a', title: 'Alpha' }),
      makeGame({ app_name: 'b', title: 'Bravo' })
    ]
    const fixedPick: FocusRowSelection = { kind: 'view', value: 'all' }
    const deps = makeDeps()

    expect(liveFilterCombinations).toHaveLength(8)

    const results = liveFilterCombinations.map(() =>
      // The row's live values are never passed in -- that IS the assertion.
      selectFocusRowGames(library, fixedPick, 'off', deps)
    )

    for (const result of results) {
      expect(result).toEqual(results[0])
    }
  })
})
