/**
 * The focus row's pure data layer (Phase 48 Plan 02, Task 1 tracer).
 *
 * No React, no DOM. `selectFocusRowGames` builds a FRESH `FilterEngineState`
 * from `DEFAULT_FILTER_ENGINE_STATE` and the persisted pick alone -- every
 * live filter value (the main grid's `libraryView`, `currentCollection`,
 * store/runnability facets, search text, alphabet filter) is structurally
 * absent from this function's parameter list, which is what makes the row
 * independent of them (SPEC R4).
 */
import { isValidFocusRowSelection } from 'common/focusRowMigration'
import { FocusRowSelection, GameInfo } from 'common/types'
import {
  FilterEngineDeps,
  FilterEngineState,
  FilterMode,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'
import {
  DEFAULT_FILTER_ENGINE_STATE,
  filterLibrary,
  passesHiddenLaneFilter
} from '../../filterEngine'

// SPEC R3's amended cap, CONTEXT D-04: a fixed 20-card ceiling, independent
// of any user setting (the old RecentlyPlayed lane used a user-chosen count
// instead -- deliberately not carried forward here, and since removed).
export const FOCUS_ROW_MAX_CARDS = 20

// Re-exported from the one definition in `common/focusRowMigration.ts` (48-05):
// a `src/common` module cannot import from `src/frontend`, so the guard lives
// there and this file re-exports it rather than carrying a second copy that
// could drift. It remains load-bearing against T-48-03 on the renderer side.
export { isValidFocusRowSelection }

/**
 * The grid's own comparator (`Library/index.tsx:916-922`), reused so the
 * focus row's ordering cannot drift from it. Always ascending -- the focus
 * row has no `sortDescending` (SPEC R4 independence) -- with a final
 * `app_name` tie-break so identical titles are stable regardless of input
 * order.
 */
export function focusRowTitleComparator(a: GameInfo, b: GameInfo): number {
  const titleA = a.title.toUpperCase().replace('THE ', '')
  const titleB = b.title.toUpperCase().replace('THE ', '')
  const cmp = titleA.localeCompare(titleB)
  if (cmp !== 0) {
    return cmp
  }
  return a.app_name.localeCompare(b.app_name)
}

export function selectFocusRowGames(
  libraryUnion: GameInfo[],
  focusRow: FocusRowSelection,
  showHidden: FilterMode,
  deps: FilterEngineDeps
): GameInfo[] {
  if (!isValidFocusRowSelection(focusRow)) {
    return []
  }

  const { kind, value } = focusRow

  const focusRowState: FilterEngineState = {
    ...DEFAULT_FILTER_ENGINE_STATE,
    view:
      kind === 'view'
        ? (value as FilterEngineState['view'])
        : DEFAULT_FILTER_ENGINE_STATE.view,
    collection:
      kind === 'collection' ? value : DEFAULT_FILTER_ENGINE_STATE.collection,
    stores:
      kind === 'store'
        ? [value as StoreFacetValue]
        : DEFAULT_FILTER_ENGINE_STATE.stores,
    runnability:
      kind === 'runnability'
        ? [value as RunnabilityTier]
        : DEFAULT_FILTER_ENGINE_STATE.runnability,
    // Deliberately NOT the live `showHidden` value: this makes `passesMore`
    // take no hidden-games decision at all (the 'only' arm is skipped and
    // the 'off' exclusion is false), leaving `passesHiddenLaneFilter` below
    // as the single authority (SPEC R4).
    showHidden: 'show'
  }

  // `filterLibrary` never mutates `libraryUnion` (Array.prototype.filter
  // returns a new array), and the `.filter` below returns a further new
  // array -- `ordered` below copies again before sorting, so the input is
  // never touched at any step.
  const filtered = filterLibrary(libraryUnion, focusRowState, deps).filter(
    (game) =>
      passesHiddenLaneFilter(
        deps.hiddenAppNames.includes(game.app_name),
        showHidden
      )
  )

  const isRecentlyPlayedView = kind === 'view' && value === 'recentlyPlayed'

  const ordered = [...filtered].sort((a, b) => {
    if (isRecentlyPlayedView) {
      const indexA = deps.recentAppNames.indexOf(a.app_name)
      const indexB = deps.recentAppNames.indexOf(b.app_name)
      if (indexA !== indexB) {
        return indexA - indexB
      }
      return a.app_name.localeCompare(b.app_name)
    }
    return focusRowTitleComparator(a, b)
  })

  return ordered.slice(0, FOCUS_ROW_MAX_CARDS)
}
