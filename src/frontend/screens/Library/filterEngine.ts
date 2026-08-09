/**
 * Games tier-2 filter pipeline (34.11 Plan 01, Wave 0 prerequisite per
 * `34.11-VALIDATION.md`).
 *
 * Purity constraint: this module imports NOTHING from `react`, `react-dom`,
 * `react-i18next` or any `.css`/`.scss` file. The Frontend jest project runs
 * `testEnvironment: 'node'` with no jsdom and no `react-test-renderer` (see
 * `src/frontend/jest.config.js`), so a React-free module is the only way any
 * of this logic is reachable from a test at all.
 *
 * Single-implementation rule: `Library/index.tsx`'s grid pipeline and every
 * facet's option count MUST both go through `filterLibrary`. Implementing
 * the pipeline twice (once inline for the grid, once again for counts) is
 * the single most likely source of a counts-vs-grid mismatch in this phase
 * (`34.11-RESEARCH.md` Anti-Patterns) — `countFor` below is built on
 * `filterLibrary` with a `skip`, never a duplicated predicate chain.
 *
 * `FilterEngineState.searchMatchedKeys` is precomputed by the caller: the
 * operator's `/gsd-plan-phase` decision (D-33 amendment) keeps `Fuse.js`
 * fuzzy search live in `Library/index.tsx` this phase — this codebase does
 * NOT do substring search, and no task in Phase 34.11 removes `Fuse`. The
 * engine therefore never runs its own text match; it only consumes the
 * fuzzy-matched key set so facet counts are computed over it (REQ-34.11-15).
 *
 * This plan changes NO shipped behaviour. `Library/index.tsx` is not wired
 * to this module here — that happens in plan 05.
 */

import { GameInfo } from 'common/types'
import {
  ActiveFilterDescriptor,
  FacetKind,
  FilterEngineDeps,
  FilterEngineState,
  LibraryView,
  RunnabilityTier,
  StoreFacetValue
} from 'frontend/types'

// The six runner keys StoresFilters/StoreFacetValue share, used to validate
// a `localStorage` array against the current opt-in shape (D-02).
const VALID_STORE_FACET_VALUES: StoreFacetValue[] = [
  'legendary',
  'gog',
  'nile',
  'sideload',
  'zoom',
  'steam'
]

const VALID_RUNNABILITY_TIERS: RunnabilityTier[] = [
  'native',
  'bottle',
  'wontRun',
  'notChecked'
]

/**
 * Matches the key shape `Library/index.tsx:472-474` already builds for
 * `favouritesIds`.
 */
export function gameKey(game: GameInfo): string {
  return `${game.app_name}_${game.runner}`
}

/**
 * D-12: derives the runnability tier for one game on one host, or `null`
 * when the tier is uncomputable there — `null` means "render no row for
 * this game", not "render an all-pass row".
 *
 * D-09: a native build always wins over any CrossOver rating.
 * D-11: a 32-bit macOS build is always a bottle, regardless of rating
 * (GPTK is wine64-only and aborts 32-bit executables — Phase 18).
 * D-16: `ratings[app_name] === undefined` (never looked up) is NOT the same
 * state as `=== null` (looked up, no data) — collapsing them would present
 * a fabricated compatibility verdict as fact.
 */
export function deriveRunnabilityTier(
  game: GameInfo,
  ratings: Record<string, number | null>,
  hostPlatform: string
): RunnabilityTier | null {
  if (hostPlatform === 'win32') {
    // GameInfo carries no Windows-native signal of any kind — every row is
    // uncomputable on this host (D-12 extension, operator decision
    // 2026-08-09). Do NOT fall back to a degenerate all-pass row.
    return null
  }

  if (hostPlatform === 'linux') {
    return game.is_linux_native === true ? 'native' : null
  }

  // darwin
  if (game.is_mac_native === true) {
    return 'native'
  }

  if (game.mac_arch === '32') {
    return 'bottle'
  }

  const rating = ratings[game.app_name]

  if (rating === undefined) {
    // Never looked up — omit from ALL counts (D-16 honesty invariant).
    return null
  }

  if (rating === null) {
    return 'notChecked'
  }

  if (rating >= 5 || rating === 4 || rating === 3) {
    // D-10: medal tiers (gold/silver/bronze) collapse into one row — they
    // are evidence, not user-facing controls.
    return 'bottle'
  }

  return 'wontRun'
}

/**
 * The rows the Runnability facet group may render on this host. `'win32'`
 * returns `[]` — the caller renders no group at all, not an empty one.
 */
export function runnabilityRowsForHost(hostPlatform: string): RunnabilityTier[] {
  if (hostPlatform === 'win32') {
    return []
  }
  if (hostPlatform === 'linux') {
    return ['native']
  }
  return ['native', 'bottle', 'wontRun', 'notChecked']
}

export function passesView(
  game: GameInfo,
  view: LibraryView,
  deps: FilterEngineDeps
): boolean {
  switch (view) {
    case 'all':
      return true
    case 'installed':
      return !!game.is_installed
    case 'favourites':
      return deps.favouriteKeys.has(gameKey(game))
    case 'recentlyPlayed':
      return deps.recentAppNames.includes(game.app_name)
    default:
      return true
  }
}

export function passesCollection(
  game: GameInfo,
  collection: string | null,
  deps: FilterEngineDeps
): boolean {
  if (collection === null) {
    return true
  }

  const key = gameKey(game)

  if (collection === 'preset_uncategorized') {
    const categorizedGames = new Set(
      Object.values(deps.customCategories).flat()
    )
    return !categorizedGames.has(key)
  }

  const gamesInCategory = deps.customCategories[collection]
  return !!gamesInCategory && gamesInCategory.includes(key)
}

// D-01: opt-in — an empty selection means no constraint. D-03: OR within a
// kind — any selected store matches.
export function passesStore(game: GameInfo, stores: StoreFacetValue[]): boolean {
  if (stores.length === 0) {
    return true
  }
  return stores.includes(game.runner as StoreFacetValue)
}

export function passesRunnability(
  game: GameInfo,
  runnability: RunnabilityTier[],
  deps: FilterEngineDeps
): boolean {
  if (runnability.length === 0) {
    return true
  }
  const tier = deriveRunnabilityTier(game, deps.crossoverRatings, deps.hostPlatform)
  return tier !== null && runnability.includes(tier)
}

export function passesSearch(
  game: GameInfo,
  searchMatchedKeys: Set<string> | null
): boolean {
  if (searchMatchedKeys === null) {
    return true
  }
  return searchMatchedKeys.has(gameKey(game))
}

function isHiddenGame(game: GameInfo, deps: FilterEngineDeps): boolean {
  return deps.hiddenAppNames.includes(game.app_name)
}

// Non-available = in the `nonAvailableGames` localStorage list (parsed by
// the caller into `deps.nonAvailableAppNames`) OR a delisted Steam game.
// The Steam-delisted clause is shipped behaviour (`Library/index.tsx:627-634`)
// and must not be dropped.
function isNonAvailableGame(game: GameInfo, deps: FilterEngineDeps): boolean {
  return (
    deps.nonAvailableAppNames.includes(game.app_name) ||
    (game.runner === 'steam' && !!game.is_delisted)
  )
}

// D-06/D-07: the "more" group — offline support, third-party-managed,
// updates-only, plus the showHidden/showNonAvailable tri-state block ported
// verbatim from `Library/index.tsx:570-580` and `L639-654`.
export function passesMore(
  game: GameInfo,
  state: FilterEngineState,
  deps: FilterEngineDeps
): boolean {
  if (state.showSupportOfflineOnly && !game.canRunOffline) {
    return false
  }

  if (state.showThirdPartyManagedOnly && !game.thirdPartyManagedApp) {
    return false
  }

  if (state.showUpdatesOnly && !deps.gameUpdates.includes(game.app_name)) {
    return false
  }

  const { showHidden, showNonAvailable } = state

  if (showHidden === 'only' && showNonAvailable === 'only') {
    // D-09 (Phase 08.1): both 'only' -> union, not intersection.
    return isNonAvailableGame(game, deps) || isHiddenGame(game, deps)
  }

  if (showHidden === 'only') {
    return isHiddenGame(game, deps)
  }

  if (showNonAvailable === 'only') {
    return isNonAvailableGame(game, deps)
  }

  if (showNonAvailable === 'off' && isNonAvailableGame(game, deps)) {
    return false
  }

  if (showHidden === 'off' && isHiddenGame(game, deps)) {
    return false
  }

  return true
}

/**
 * Applies every filter stage whose kind is not `opts.skip`, in this order:
 * search, view, collection, store, runnability, more. This is AND across
 * kinds (D-03). DLC is always excluded (`game.install.is_dlc`) — this is
 * not a facet and is never skipped.
 */
export function filterLibrary(
  library: GameInfo[],
  state: FilterEngineState,
  deps: FilterEngineDeps,
  opts?: { skip?: FacetKind }
): GameInfo[] {
  const skip = opts?.skip

  return library.filter((game) => {
    if (game.install.is_dlc) {
      return false
    }
    if (skip !== 'search' && !passesSearch(game, state.searchMatchedKeys)) {
      return false
    }
    if (skip !== 'view' && !passesView(game, state.view, deps)) {
      return false
    }
    if (
      skip !== 'collection' &&
      !passesCollection(game, state.collection, deps)
    ) {
      return false
    }
    if (skip !== 'store' && !passesStore(game, state.stores)) {
      return false
    }
    if (
      skip !== 'runnability' &&
      !passesRunnability(game, state.runnability, deps)
    ) {
      return false
    }
    if (skip !== 'more' && !passesMore(game, state, deps)) {
      return false
    }
    return true
  })
}

/**
 * D-28: the exclude-your-own-facet rule. Computes the option's count with
 * every active filter EXCEPT that facet's own, so selecting one store
 * option does not collapse every sibling option's count to 0.
 */
export function countFor(
  library: GameInfo[],
  state: FilterEngineState,
  deps: FilterEngineDeps,
  kind: 'store' | 'runnability',
  value: string
): number {
  const survivors = filterLibrary(library, state, deps, { skip: kind })

  if (kind === 'store') {
    return survivors.filter((game) => game.runner === value).length
  }

  return survivors.filter(
    (game) =>
      deriveRunnabilityTier(game, deps.crossoverRatings, deps.hostPlatform) ===
      value
  ).length
}

/**
 * D-26: chips render for everything non-default, including views. Emits
 * nothing for a default value at each kind.
 */
export function describeActiveFilters(
  state: FilterEngineState,
  searchTerm: string
): ActiveFilterDescriptor[] {
  const descriptors: ActiveFilterDescriptor[] = []

  if (state.view !== 'all') {
    descriptors.push({
      id: `view:${state.view}`,
      kind: 'view',
      value: state.view
    })
  }

  if (state.collection !== null) {
    descriptors.push({
      id: `collection:${state.collection}`,
      kind: 'collection',
      value: state.collection
    })
  }

  for (const store of state.stores) {
    descriptors.push({ id: `store:${store}`, kind: 'store', value: store })
  }

  for (const tier of state.runnability) {
    descriptors.push({
      id: `runnability:${tier}`,
      kind: 'runnability',
      value: tier
    })
  }

  if (searchTerm) {
    descriptors.push({ id: 'search', kind: 'search', value: searchTerm })
  }

  if (state.showHidden !== 'off') {
    descriptors.push({
      id: `showHidden:${state.showHidden}`,
      kind: 'showHidden',
      value: state.showHidden
    })
  }

  if (state.showNonAvailable !== 'off') {
    descriptors.push({
      id: `showNonAvailable:${state.showNonAvailable}`,
      kind: 'showNonAvailable',
      value: state.showNonAvailable
    })
  }

  if (state.showSupportOfflineOnly) {
    descriptors.push({
      id: 'showSupportOfflineOnly',
      kind: 'showSupportOfflineOnly',
      value: 'true'
    })
  }

  if (state.showThirdPartyManagedOnly) {
    descriptors.push({
      id: 'showThirdPartyManagedOnly',
      kind: 'showThirdPartyManagedOnly',
      value: 'true'
    })
  }

  if (state.showUpdatesOnly) {
    descriptors.push({
      id: 'showUpdatesOnly',
      kind: 'showUpdatesOnly',
      value: 'true'
    })
  }

  return descriptors
}

/**
 * D-02: legacy `localStorage` values are DISCARDED, never translated into an
 * equivalent opt-in selection. A legacy all-boolean opt-out mask (e.g. every
 * `StoresFilters` key `true`) must not be inverted into "all six selected" —
 * that is a semantics migration, not the format migration `migrateFilterMode`
 * (`Library/index.tsx:185-189`) performs. Every non-valid-array input,
 * including malformed JSON, yields `[]` and never throws.
 */
export function migrateStoreFacetSelection(
  rawNew: string | null,
  rawLegacy: string | null
): StoreFacetValue[] {
  // rawLegacy is intentionally unused beyond acknowledging its presence in
  // the signature (D-02: legacy shapes are discarded, not read for data).
  void rawLegacy

  if (rawNew === null) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(rawNew)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is StoreFacetValue =>
      VALID_STORE_FACET_VALUES.includes(value as StoreFacetValue)
    )
  } catch {
    return []
  }
}

export function migrateRunnabilityFacetSelection(
  rawNew: string | null,
  rawLegacy: string | null
): RunnabilityTier[] {
  void rawLegacy

  if (rawNew === null) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(rawNew)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((value): value is RunnabilityTier =>
      VALID_RUNNABILITY_TIERS.includes(value as RunnabilityTier)
    )
  } catch {
    return []
  }
}
