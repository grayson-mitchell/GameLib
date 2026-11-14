import CacheStore from '../cache'
import type { StoreRoot } from 'backend/stores/storeRoot'

/** A cached ITAD payload with the adapter's own staleness clock. */
export interface ItadCacheEntry<T> {
  data: T
  fetchedAt: number
}

/**
 * Keep-last-good stores for the IsThereAnyDeal adapter (D-08, D-10).
 *
 * Stale entries are retained as the 429/network fallback; the 30-day lifespan (minutes) is only a
 * ceiling since `invalidateCheck` is `() => false`, and the adapter decides freshness from
 * `fetchedAt`. Phase 20's "no persisted cache" decision is deliberately reversed because ITAD's
 * terms require caching.
 */
export function createStoreSearchStores(deps: { root: StoreRoot }) {
  const itadPricesStore = new CacheStore<ItadCacheEntry<unknown>>(
    'itad_prices',
    60 * 24 * 30,
    { root: deps.root, kind: 'cache', invalidateCheck: () => false }
  )
  const itadSteamGidsStore = new CacheStore<ItadCacheEntry<string | null>>(
    'itad_steam_gids',
    60 * 24 * 30,
    { root: deps.root, kind: 'cache', invalidateCheck: () => false }
  )
  return { itadPricesStore, itadSteamGidsStore }
}
