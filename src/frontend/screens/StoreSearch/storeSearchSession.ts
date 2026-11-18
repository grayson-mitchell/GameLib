import type { StoreSearchResult } from 'common/types/storeSearch'

/**
 * Store Search's query and last rows, kept for the session in module memory
 * so leaving the screen (Settings, a theme change) and returning restores
 * them (G-47-12a).
 *
 * Same lifetime rule as `Library/librarySessionSearch.ts` (quick 261029-n4v,
 * D-22 / WR-11): never localStorage or sessionStorage. The rows carry prices
 * and the backend treats a search as fresh for one hour, so a copy that
 * survived a relaunch would show stale prices as current. Module memory dies
 * with the webview (relaunch or window reload).
 *
 * Safe for the lazily loaded StoreSearch route: the module is imported once
 * and stays loaded.
 */
export type StoreSearchStatus =
  | 'prompt'
  | 'loading'
  | 'results'
  | 'empty'
  | 'error'

export const STORE_SEARCH_MIN_QUERY_LENGTH = 3

/** The trimmed query and the requested country a set of rows was fetched for,
 * and when (ms since epoch). */
export type StoreSearchFetchKey = {
  query: string
  countryCode: string
  at: number
}

type StoreSearchSession = {
  query: string
  results: StoreSearchResult[]
  status: StoreSearchStatus
  pricedCountry: string | null
  fetchedFor: StoreSearchFetchKey | null
}

type RestoredStoreSearchSession = StoreSearchSession & {
  debouncedQuery: string
}

const emptySession = (): StoreSearchSession => ({
  query: '',
  results: [],
  status: 'prompt',
  pricedCountry: null,
  fetchedFor: null
})

let kept: StoreSearchSession = emptySession()

export function writeStoreSearchSession(value: StoreSearchSession): void {
  kept = {
    ...value,
    results: [...value.results],
    fetchedFor: value.fetchedFor ? { ...value.fetchedFor } : null
  }
}

export function restoreStoreSearchSession(
  countryCode: string,
  now: number
): RestoredStoreSearchSession {
  void now
  const trimmed = kept.query.trim()
  const debouncedQuery =
    trimmed.length >= STORE_SEARCH_MIN_QUERY_LENGTH ? trimmed : ''
  const rowsAreCurrent =
    (kept.status === 'results' || kept.status === 'empty') &&
    kept.fetchedFor !== null &&
    kept.fetchedFor.countryCode === countryCode

  if (!rowsAreCurrent) {
    return { ...emptySession(), query: kept.query, debouncedQuery }
  }
  return {
    query: kept.query,
    debouncedQuery,
    results: [...kept.results],
    status: kept.status,
    pricedCountry: kept.pricedCountry,
    fetchedFor: kept.fetchedFor ? { ...kept.fetchedFor } : null
  }
}

export function resetStoreSearchSessionForTests(): void {
  kept = emptySession()
}
