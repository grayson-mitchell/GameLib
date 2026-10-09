/**
 * Phase 49 D-10 -- the pure helpers behind "Dismiss" on a not-connected row.
 *
 * Division of labour: the RENDERER owns the dismissed set (an AppSettings key
 * added by plan 49-07); the sidecar probe pass never writes it; and re-arm is
 * a pure prune applied renderer-side. Nothing here touches storage.
 *
 * Every function returns a fresh array in `SIGN_IN_STORES` order, so two equal
 * sets are always deep-equal regardless of how they were built, and no input
 * is ever mutated.
 */
import {
  SIGN_IN_STORES,
  parseSignInStore,
  type SignInState,
  type SignInStore
} from './signInState'

/** Canonical-order, deduplicated copy of `members`. */
function canonical(members: readonly SignInStore[]): SignInStore[] {
  return SIGN_IN_STORES.filter((store) => members.includes(store))
}

/** Dismissing twice equals dismissing once. */
export function addSignInDismissal(
  dismissed: readonly SignInStore[],
  store: SignInStore
): SignInStore[] {
  return canonical([...dismissed, store])
}

/**
 * Drops exactly the stores whose state is `'expired'`. An expired row ignores
 * the dismissed set anyway, so pruning here only matters for the store's NEXT
 * `not-connected` episode: connect-then-expire re-arms the dismissal once.
 * A `connected` or `not-connected` store is never removed.
 */
export function rearmSignInDismissals(
  dismissed: readonly SignInStore[],
  states: Record<SignInStore, SignInState>
): SignInStore[] {
  return canonical(dismissed.filter((store) => states[store] !== 'expired'))
}

/**
 * Validates a persisted value through `parseSignInStore`: anything that is not
 * an array becomes `[]`, unknown entries are dropped, duplicates collapse.
 */
export function normalizeSignInDismissals(value: unknown): SignInStore[] {
  if (!Array.isArray(value)) {
    return []
  }
  const known: SignInStore[] = []
  for (const entry of value as unknown[]) {
    const store = parseSignInStore(entry)
    if (store !== null) {
      known.push(store)
    }
  }
  return canonical(known)
}
