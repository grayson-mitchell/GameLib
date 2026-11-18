import { useEffect, useRef, useState } from 'react'

import {
  storeSearchErrorCode,
  type StoreSearchErrorCode,
  type StoreSearchResult
} from 'common/types/storeSearch'
import {
  restoreStoreSearchSession,
  STORE_SEARCH_MIN_QUERY_LENGTH,
  writeStoreSearchSession,
  type StoreSearchFetchKey,
  type StoreSearchStatus
} from '../storeSearchSession'

/**
 * STORESEARCH-02/D-11 debounce + min-3-char + generation-counter-cancel hook.
 *
 * No codebase analog (`grep -rn debounce src/frontend` returns zero
 * results — 20-PATTERNS.md "No Analog Found"). Two chained `useEffect`s:
 *
 * 1. `query` -> `debouncedQuery`: trims, gates on `length >= 3` (else status
 *    'prompt', no request), else a 400ms `setTimeout` before committing
 *    `debouncedQuery`; a superseding keystroke clears the pending timer via
 *    the effect's cleanup (standard debounce shape).
 * 2. `debouncedQuery` + `countryCode` -> fetch: fires
 *    `window.api.searchStores(query, country)`. T-20-04: this is the
 *    load-bearing rate control the RESEARCH doc calls out — one request per
 *    pause, never per keystroke. PRICE-01: a region change re-runs the
 *    committed search once.
 *
 * D-11/RESEARCH Pitfall 5: `AbortController` does NOT cancel
 * `ipcRenderer.invoke()`'s already-in-flight promise across the IPC hop —
 * calling `.abort()` only lets the renderer choose to ignore the eventual
 * resolution. The actual cross-hop cancel primitive here is a
 * `generationRef` counter (inspired by, not copied from,
 * `backend/humble/library.ts`'s `currentSyncGeneration()` supersede-
 * detection idiom): every fetch captures its own generation number, and a
 * resolve/reject is discarded if a newer fetch has since started.
 *
 * G-47-12a: the query and the last rows are seeded from, and written back to,
 * the session-only module store in `../storeSearchSession.ts`, so leaving the
 * screen and returning shows them again without a new request.
 *
 * Not exported: used only within this module (ts-prune / `pnpm find-deadcode`
 * flagged the previously-exported form as a used-in-module finding -- there
 * is no external consumer, so the export served no purpose).
 */

const DEBOUNCE_MS = 400
const MIN_QUERY_LENGTH = STORE_SEARCH_MIN_QUERY_LENGTH

interface UseDebouncedStoreSearchResult {
  query: string
  setQuery: (query: string) => void
  results: StoreSearchResult[]
  status: StoreSearchStatus
  /** True while the debounce timer is pending OR a request is in-flight —
   * drives the SearchBar spinner-in-searchButton-slot affordance. */
  loading: boolean
  /** Re-fires the current debouncedQuery (provider-failed retry affordance,
   * D-14). No-op if there is no committed query yet. */
  retry: () => void
  /** The country ITAD actually priced (differs from the requested one only on
   * the D-13 US fallback); null until a search succeeds. */
  pricedCountry: string | null
  /** Stable classification of the last failure (D-03); null otherwise. The
   * raw error text is never exposed (T-20-02, T-47-31). */
  errorCode: StoreSearchErrorCode | null
}

export function useDebouncedStoreSearch(
  countryCode: string
): UseDebouncedStoreSearchResult {
  // G-47-12a: the first render restores the kept query and, when they are
  // still current for this country, its rows (see restoreStoreSearchSession).
  const [seed] = useState(() =>
    restoreStoreSearchSession(countryCode, Date.now())
  )
  const [query, setQuery] = useState(seed.query)
  const [debouncedQuery, setDebouncedQuery] = useState(seed.debouncedQuery)
  const [results, setResults] = useState<StoreSearchResult[]>(seed.results)
  const [status, setStatus] = useState<StoreSearchStatus>(seed.status)
  const [pricedCountry, setPricedCountry] = useState<string | null>(
    seed.pricedCountry
  )
  const [fetchedFor, setFetchedFor] = useState<StoreSearchFetchKey | null>(
    seed.fetchedFor
  )
  const [errorCode, setErrorCode] = useState<StoreSearchErrorCode | null>(null)
  const [debouncePending, setDebouncePending] = useState(false)
  // A restored committed query without current rows (status 'loading') is
  // fetched by the mount effect below, so the spinner shows from the first frame.
  const [fetching, setFetching] = useState(seed.status === 'loading')
  const generationRef = useRef(0)

  // Debounce stage: query -> debouncedQuery.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      // WR-01: invalidate any in-flight fetch so a late-arriving response
      // cannot clobber the 'prompt' state we're about to set below. The
      // discard branches in fetchResults() return before setFetching(false),
      // so `fetching` must be cleared here too or the spinner (loading =
      // debouncePending || fetching) would stay stuck true.
      generationRef.current++
      setDebouncePending(false)
      setFetching(false)
      setDebouncedQuery('')
      setResults([])
      setFetchedFor(null)
      setErrorCode(null)
      setStatus('prompt')
      return
    }

    if (trimmed === debouncedQuery) {
      // A restored or unchanged query must not show the spinner or re-run the
      // search. debouncedQuery is deliberately not a dependency: only a query
      // change should start the debounce.
      setDebouncePending(false)
      return
    }

    setDebouncePending(true)
    const timer = setTimeout(() => {
      setDebouncePending(false)
      setDebouncedQuery(trimmed)
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [query])

  // Fetch stage: debouncedQuery -> window.api.searchStores, guarded by a
  // generation counter (RESEARCH Pitfall 5 — AbortController does not
  // cancel across the IPC hop).
  const fetchResults = (searchQuery: string) => {
    if (!searchQuery) {
      return
    }
    const generation = ++generationRef.current
    const requestedCountry = countryCode
    setFetching(true)
    setStatus('loading')

    window.api
      .searchStores(searchQuery, requestedCountry)
      .then((response) => {
        if (generationRef.current !== generation) {
          // Superseded by a newer query — discard this stale resolution.
          return
        }
        setFetching(false)
        setResults(response.results)
        setPricedCountry(response.pricedCountry)
        setFetchedFor({
          query: searchQuery.trim(),
          countryCode: requestedCountry,
          at: Date.now()
        })
        setErrorCode(null)
        setStatus(response.results.length === 0 ? 'empty' : 'results')
      })
      .catch((err) => {
        if (generationRef.current !== generation) {
          // Superseded by a newer query — discard this stale rejection.
          return
        }
        setFetching(false)
        // Raw error goes to the log, never to rendered state (T-20-02).
        window.api.logError(String(err))
        setErrorCode(storeSearchErrorCode(err))
        setStatus('error')
      })
  }

  useEffect(() => {
    if (!debouncedQuery) {
      return
    }
    if (
      (status === 'results' || status === 'empty') &&
      fetchedFor !== null &&
      fetchedFor.query === debouncedQuery &&
      fetchedFor.countryCode === countryCode
    ) {
      // The rows on screen are already for this query and country (restored
      // on return), so a fetch would only blank the body with 'loading' to get
      // the same rows (G-47-12a).
      return
    }
    fetchResults(debouncedQuery)
    // fetchResults is intentionally omitted from the deps array: it's a
    // plain closure recreated every render, and depending on it would
    // refire the request on every render rather than only on a real
    // debouncedQuery / countryCode change.

    // IN-01: bump the generation on cleanup (deps change or unmount) so a
    // resolution in flight for this debouncedQuery is discarded — this is
    // the same one-line invalidation primitive as the WR-01 fix above, and
    // it also guards against setState after unmount.
    return () => {
      generationRef.current++
    }
  }, [debouncedQuery, countryCode])

  // Keep the query and last rows for the session (G-47-12a).
  useEffect(() => {
    writeStoreSearchSession({
      query,
      results,
      status,
      pricedCountry,
      fetchedFor
    })
  }, [query, results, status, pricedCountry, fetchedFor])

  return {
    query,
    setQuery,
    results,
    status,
    loading: debouncePending || fetching,
    retry: () => fetchResults(debouncedQuery),
    pricedCountry,
    errorCode
  }
}
