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

import { GameInfo } from 'common/types'
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
