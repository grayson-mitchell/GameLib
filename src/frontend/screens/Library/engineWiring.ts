/**
 * The React-free wiring layer between `Library/index.tsx` and
 * `filterEngine.ts` (34.11 code-review fix, CR-01/WR-14).
 *
 * Why this module exists at all: CR-01 was a WIRING defect, not an engine
 * defect. `filterEngine.countFor` was correct in isolation and its unit
 * test passed, because that test handed it the FULL library -- a call shape
 * `Library/index.tsx` never made. Production passed the already-filtered
 * grid output instead, so `countFor`'s `{ skip: kind }` had nothing left to
 * recover and every unselected facet option rendered a permanent `0`.
 *
 * A test living outside `Library/index.tsx` can only ever replicate that
 * component's call shape by hand -- and a hand-written replica of a call
 * shape is exactly what failed to catch CR-01. So the call shape itself
 * moves here, where a test can invoke the REAL one. `Library/index.tsx`
 * now supplies inputs and consumes outputs; it no longer decides which
 * list `filterLibrary`/`countFor` see.
 *
 * Purity constraint, same as `filterEngine.ts` and `chipLabels.ts`: no
 * import from `react`, `react-dom`, `react-i18next` or any `.css`/`.scss`
 * file. The Frontend jest project runs `testEnvironment: 'node'` with no
 * jsdom (`src/frontend/jest.config.js`), so a React-free module is the only
 * way any of this is reachable from a test.
 */

import { FavouriteGame, GameInfo, HiddenGame } from 'common/types'
import {
  FilterEngineDeps,
  FilterEngineState,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'
import * as filterEngine from './filterEngine'

/**
 * The grid list plus both facet-count accessors, all three derived from the
 * SAME `libraryUnion`/`state`/`deps` triple.
 */
export interface LibraryGridPipeline {
  /** The grid's games: every stage applied, nothing skipped. */
  games: GameInfo[]
  countForStore: (value: StoreFacetValue) => number
  countForRunnability: (value: RunnabilityTier) => number
}

/**
 * D-28's exclude-your-own-facet rule, wired correctly.
 *
 * The load-bearing detail is the FIRST argument of all three calls below:
 * every one of them is handed `libraryUnion`, the UNFILTERED union of every
 * connected store's library. `countFor` computes an option's count by
 * re-running the pipeline with that option's own facet skipped -- which can
 * only recover the games that facet excluded if the games are still in the
 * list it is given. Passing `games` (this function's own filtered output)
 * into either `countFor` re-introduces CR-01 verbatim: the store facet has
 * already removed every non-selected store's games, and skipping the store
 * stage on a list they are no longer in cannot bring them back.
 *
 * REQ-34.11-15 (counts computed over the fuzzy-matched set) is satisfied by
 * `state.searchMatchedKeys`, which the caller precomputes over the same
 * `libraryUnion` and which `filterLibrary` applies on every pass here --
 * `countFor` only ever skips `'store'` or `'runnability'`, never `'search'`.
 * Before CR-01's fix this requirement was met only by accident, because the
 * search constraint had already been baked into the filtered list that was
 * being passed in.
 */
export function buildGridPipeline(
  libraryUnion: GameInfo[],
  state: FilterEngineState,
  deps: FilterEngineDeps
): LibraryGridPipeline {
  return {
    games: filterEngine.filterLibrary(libraryUnion, state, deps),
    countForStore: (value: StoreFacetValue) =>
      filterEngine.countFor(libraryUnion, state, deps, 'store', value),
    countForRunnability: (value: RunnabilityTier) =>
      filterEngine.countFor(libraryUnion, state, deps, 'runnability', value)
  }
}

/**
 * Everything `buildEngineDeps` needs, in the raw shapes `Library/index.tsx`
 * actually has in scope -- so the component does no derivation of its own
 * and the whole `FilterEngineDeps` construction is unit-testable (WR-15).
 */
export interface EngineDepsInputs {
  hiddenGames: HiddenGame[]
  /**
   * `favouriteGames.list` from `ContextProvider` -- the UNCONDITIONAL source
   * of truth. Not the Library screen's `favourites` display memo, whose
   * population is gated on the top-section setting (see CR-02 below).
   */
  favouriteGames: FavouriteGame[]
  /**
   * The same unfiltered union `buildGridPipeline` receives. Needed because
   * `FavouriteGame` (= `RecentGame` = `{ appName, title }`) carries no
   * `runner`, while `filterEngine.gameKey` is `${app_name}_${runner}` --
   * the runner can only come from the library entry itself.
   */
  libraryUnion: GameInfo[]
  /** Raw `localStorage['nonAvailableGames']`, parsed here. */
  nonAvailableGamesRaw: string | null
  recentAppNames: string[]
  customCategories: Record<string, string[]>
  gameUpdates: string[]
  crossoverRatings: Record<string, number | null>
  hostPlatform: string
}

/**
 * CR-02: resolves `favouriteGames.list` (keyed by `appName` only) into the
 * `${app_name}_${runner}` key set `filterEngine.passesView` compares against
 * for the `favourites` view.
 *
 * One `appName` can legitimately resolve to more than one key -- the same
 * game owned on two stores produces two library entries with two runners --
 * so this collects EVERY match rather than the first.
 */
export function buildFavouriteKeys(
  favouriteGames: FavouriteGame[],
  libraryUnion: GameInfo[]
): Set<string> {
  const favouriteAppNames = new Set(favouriteGames.map((fav) => fav.appName))

  const keys = new Set<string>()
  for (const game of libraryUnion) {
    if (favouriteAppNames.has(game.app_name)) {
      keys.add(filterEngine.gameKey(game))
    }
  }
  return keys
}

/**
 * CR-02: builds `FilterEngineDeps` from `Library/index.tsx`'s raw inputs.
 *
 * `favouriteKeys` comes from `favouriteGames` DIRECTLY. It must not be
 * derived from the Library screen's `favourites` memo: that memo only
 * populates `if (showFavourites || showFavouritesLibrary)`, and both of
 * those are off by default (`libraryTopSection` defaults to `'disabled'`;
 * `localStorage['show_favorites']` defaults to `'false'` and its only UI was
 * deleted in 34.11-09). Deriving the engine's key set from a DISPLAY memo
 * made the `Favourites` view return zero games on every default install.
 *
 * Hidden favourites are deliberately NOT filtered out here, unlike the
 * display memo's `favouriteGamesList`: `filterLibrary`'s `more` stage
 * (`passesMore` -> `isHiddenGame`) already applies the showHidden tri-state
 * to every game, favourite or not. Pre-filtering here would apply the same
 * rule twice, and would make `deps` depend on filter STATE, which it must
 * not -- `deps` is data, `state` is the selection.
 */
export function buildEngineDeps(inputs: EngineDepsInputs): FilterEngineDeps {
  return {
    hiddenAppNames: inputs.hiddenGames.map((hidden) => hidden.appName),
    // Behaviour preserved verbatim from the pre-fix inline expression,
    // including its lack of a try/catch -- that is a separate, still-open
    // review finding (WR-02) and is deliberately not changed here.
    nonAvailableAppNames: JSON.parse(
      inputs.nonAvailableGamesRaw || '[]'
    ) as string[],
    favouriteKeys: buildFavouriteKeys(
      inputs.favouriteGames,
      inputs.libraryUnion
    ),
    recentAppNames: inputs.recentAppNames,
    customCategories: inputs.customCategories,
    gameUpdates: inputs.gameUpdates,
    crossoverRatings: inputs.crossoverRatings,
    hostPlatform: inputs.hostPlatform
  }
}
