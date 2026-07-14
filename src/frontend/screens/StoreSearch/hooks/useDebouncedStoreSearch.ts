import { useEffect, useRef, useState } from 'react'

import type { StoreSearchResult } from 'common/types/storeSearch'

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
 * 2. `debouncedQuery` -> fetch: fires `window.api.searchStores`. T-20-04:
 *    this is the load-bearing rate control the RESEARCH doc calls out — one
 *    request per pause, never per keystroke.
 *
 * D-11/RESEARCH Pitfall 5: `AbortController` does NOT cancel
 * `ipcRenderer.invoke()`'s already-in-flight promise across the IPC hop —
 * calling `.abort()` only lets the renderer choose to ignore the eventual
 * resolution. The actual cross-hop cancel primitive here is a
 * `generationRef` counter (inspired by, not copied from,
 * `backend/humble/library.ts`'s `currentSyncGeneration()` supersede-
 * detection idiom): every fetch captures its own generation number, and a
 * resolve/reject is discarded if a newer fetch has since started.
 */

export type StoreSearchStatus =
  | 'prompt'
  | 'loading'
  | 'results'
  | 'empty'
  | 'error'

const DEBOUNCE_MS = 400
const MIN_QUERY_LENGTH = 3

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
}

export function useDebouncedStoreSearch(): UseDebouncedStoreSearchResult {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<StoreSearchResult[]>([])
  const [status, setStatus] = useState<StoreSearchStatus>('prompt')
  const [debouncePending, setDebouncePending] = useState(false)
  const [fetching, setFetching] = useState(false)
  const generationRef = useRef(0)

  // Debounce stage: query -> debouncedQuery.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setDebouncePending(false)
      setDebouncedQuery('')
      setResults([])
      setStatus('prompt')
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
    setFetching(true)
    setStatus('loading')

    window.api
      .searchStores(searchQuery)
      .then((response) => {
        if (generationRef.current !== generation) {
          // Superseded by a newer query — discard this stale resolution.
          return
        }
        setFetching(false)
        setResults(response)
        setStatus(response.length === 0 ? 'empty' : 'results')
      })
      .catch((err) => {
        if (generationRef.current !== generation) {
          // Superseded by a newer query — discard this stale rejection.
          return
        }
        setFetching(false)
        // Raw error goes to the log, never to rendered state (T-20-02).
        window.api.logError(String(err))
        setStatus('error')
      })
  }

  useEffect(() => {
    if (!debouncedQuery) {
      return
    }
    fetchResults(debouncedQuery)
    // fetchResults is intentionally omitted from the deps array: it's a
    // plain closure recreated every render, and depending on it would
    // refire the request on every render rather than only on a real
    // debouncedQuery commit.
  }, [debouncedQuery])

  return {
    query,
    setQuery,
    results,
    status,
    loading: debouncePending || fetching,
    retry: () => fetchResults(debouncedQuery)
  }
}
