import type { EngineOption } from 'common/types/engine'

// Phase 61 D-04, D-07, D-11, D-14, D-15: the pure decisions behind the
// store-agnostic Engine control. No React and no stylesheet imports, so jest
// can load it (same reason as WineSelector/engineFilter.ts).

/**
 * What the select shows: the stored pick when there is one, otherwise the
 * engine the backend derived for the game (so a game with no stored engine
 * never claims "Automatic" for something else, D-08), otherwise Automatic.
 */
export function effectiveSelectValue(
  stored: string | undefined,
  derived: string | undefined
): string {
  return stored || derived || 'automatic'
}

/** D-14: everything except Automatic and CrossOver is flagged unsupported. */
export function isUnsupportedEngineId(id: string): boolean {
  return (
    id.startsWith('pinned:') ||
    id.startsWith('wine-manager:') ||
    id.startsWith('legacy:')
  )
}

/**
 * D-07, D-11: the Legacy entry is offered only while it is the current value,
 * and nothing path-like is ever offered.
 */
export function visibleOptions(
  options: EngineOption[],
  currentValue: string
): EngineOption[] {
  return options.filter((o) => {
    if (o.id.includes('/')) return false
    if (o.kind === 'legacy') return o.id === currentValue
    return true
  })
}

/**
 * D-04: moving a plain-prefix game onto a managed bottle leaves its saves in
 * the old prefix, so Automatic and CrossOver ask first. A Legacy game runs on
 * a winePrefix (on macOS its own or the shared default) and switching it to
 * Automatic or CrossOver lands on a fresh per-game bottle, so it gets the same
 * confirm (UAT G-1). Pinned and Wine Manager builds keep the prefix.
 */
export function needsFreshBottleConfirm(
  prefixKind: 'bottle' | 'plain' | 'legacy' | null | undefined,
  next: string
): boolean {
  return (
    (prefixKind === 'plain' || prefixKind === 'legacy') &&
    (next === 'automatic' || next === 'crossover')
  )
}
