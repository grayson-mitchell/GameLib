import { useEffect, useMemo, useRef, useState } from 'react'
import type { GameInfo } from 'common/types'
import { removeSpecialcharacters } from 'frontend/helpers'
import { buildWikiMetacriticByTitle } from './librarySort'
import { LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS } from './useNonSteamLastPlayed'

type WikiMetacriticMap = Readonly<Record<string, number>>

/**
 * Quick 261029-sbi: a read-only renderer view of the lazy `wikigameinfo` store
 * as title -> Metacritic score, for the Metacritic sort.
 *
 * Strictly read-only: it never calls storeDelete/storeSet. The frontend
 * `CacheStore` class is deliberately NOT used, because its `get()` evicts
 * expired entries and a sort must never evict (D-sbi-2). An expired but
 * present entry's score is used: scores are stable.
 *
 * The key is the backend key (`wiki_game_info.ts` uses
 * `removeSpecialcharacters(gameInfo.title)`). It issues no network request, and
 * it hydrates the lazy store only while the Metacritic sort is active.
 *
 * Returns `null` while inactive or hydrating (caller shows Name A-Z). If
 * hydration gives up after the bounded retries it returns `{}` so the sort runs
 * on Steam scores only (D-sbi-5); a later store-change notification re-arms it.
 */

let wikiStoreHydratedOnce = false

function sameMap(a: WikiMetacriticMap, b: WikiMetacriticMap): boolean {
  const aKeys = Object.keys(a)
  if (aKeys.length !== Object.keys(b).length) return false
  return aKeys.every((key) => key in b && a[key] === b[key])
}

export function useWikiMetacriticScores(
  active: boolean,
  games: readonly GameInfo[]
): WikiMetacriticMap | null {
  const [hydrated, setHydrated] = useState(wikiStoreHydratedOnce)
  const [gaveUp, setGaveUp] = useState(false)
  const [storeVersion, setStoreVersion] = useState(0)

  useEffect(() => {
    if (!active) return
    return window.api.storeOnChanged('wikigameinfo', () => {
      setGaveUp(false)
      setStoreVersion((v) => v + 1)
    })
  }, [active])

  useEffect(() => {
    if (!active || hydrated) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0
    const tryHydrate = () => {
      window.api
        .storeEnsureHydrated('wikigameinfo')
        .then((ok) => {
          if (cancelled) return
          if (ok) {
            wikiStoreHydratedOnce = true
            setHydrated(true)
            return
          }
          const delay = LAST_PLAYED_HYDRATE_RETRY_DELAYS_MS[attempt++]
          if (delay === undefined) {
            console.warn(
              'Library: wikigameinfo did not hydrate after ' +
                `${attempt} attempts; Metacritic sort uses Steam scores only ` +
                'until the store reports a change'
            )
            setGaveUp(true)
            return
          }
          timer = setTimeout(tryHydrate, delay)
        })
        .catch((error: unknown) => {
          console.error('Library: Metacritic wiki hydrate failed', error)
        })
    }
    tryHydrate()
    return () => {
      cancelled = true
      if (timer !== undefined) clearTimeout(timer)
    }
  }, [active, hydrated, storeVersion])

  const previous = useRef<WikiMetacriticMap | null>(null)

  return useMemo(() => {
    if (!active) {
      previous.current = null
      return null
    }
    if (!hydrated) {
      return gaveUp ? {} : null
    }
    // The reads go through the store snapshot, which React cannot see change.
    void storeVersion
    const map = buildWikiMetacriticByTitle(games, (title) =>
      window.api.storeGet('wikigameinfo', removeSpecialcharacters(title))
    )
    if (previous.current && sameMap(previous.current, map)) {
      return previous.current
    }
    previous.current = map
    return map
  }, [active, hydrated, gaveUp, games, storeVersion])
}
