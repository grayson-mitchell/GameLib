import CacheStore from '../cache'
import type { CrossoverIndex } from './schema'

/**
 * A cached wrapper around a validated index payload. `fetchedAt` is the
 * loader's OWN staleness clock — required because `invalidateCheck: () =>
 * false` (below) disables CacheStore's built-in TTL eviction entirely, so the
 * fetcher (fetcher.ts) reads `fetchedAt` itself to decide whether to refetch.
 */
export interface CachedIndex<T> {
  data: T
  fetchedAt: number
}

/**
 * D-08 / D-09: 24-hour TTL, keep-last-good store for the CrossOver
 * compatibility index (and, per D-19, any future index sharing this seam —
 * e.g. the deferred mac-arch-overrides index — since the value is keyed by
 * `descriptor.name`, not hardcoded to one index shape).
 *
 * `invalidateCheck: () => false` mirrors the `umuStore` precedent
 * (wiki_game_info/electronStore.ts): CacheStore.get() only *deletes* an
 * expired entry when invalidateCheck returns true, so passing `() => false`
 * means an entry is NEVER auto-evicted on read — it is only ever REPLACED by
 * a validated newer `set()`. This is the D-09 keep-last-good mitigation
 * (T-19-05): a bad publish can only be ignored, never destroy the working
 * index.
 */
export const crossoverIndexStore = new CacheStore<
  CachedIndex<CrossoverIndex>
>('crossover_index', 60 * 24, {
  invalidateCheck: () => false
})
