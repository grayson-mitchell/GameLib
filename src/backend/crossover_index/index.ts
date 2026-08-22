import { logError, LogPrefix } from 'backend/logger'
import { CodeweaversInfo, GameInfo } from 'common/types'
import { slugify } from 'backend/wiki_game_info/codeweavers/utils'

import { loadIndex, IndexDescriptor } from './fetcher'
import { crossoverIndexSchema, CrossoverIndex } from './schema'
import { crossoverIndexStore, CachedIndex } from './electronStore'
import { normalize, NAME_MATCHING_SHIPS } from './normalize'

/**
 * D-19: this file is the D-19 seam's single real consumer — the concrete
 * descriptor for the CrossOver compatibility index published daily (19-04)
 * to the rolling `crossover-index` GitHub Release tag on this fork. `name`
 * is also the key `crossoverIndexHas` reads synchronously from
 * `crossoverIndexStore`.
 */
export const crossoverIndexDescriptor: IndexDescriptor<CrossoverIndex> = {
  name: 'index',
  url: 'https://github.com/grayson-mitchell/GameLib/releases/download/crossover-index/crossover-index.json.gz',
  bundledPath: 'crossover-index.json.gz',
  schema: crossoverIndexSchema,
  ttlMinutes: 60 * 24
}

/** The minimal shape this module needs from a `GameInfo` — narrowed so
 * callers (and tests) don't have to construct a full `GameInfo`. */
export type IndexLookupInput = Pick<GameInfo, 'runner' | 'app_name' | 'title'>

interface IndexMaps {
  bySteamId: Map<string, number>
  byName: Map<string, number>
}

/** Memoized keyed on `generatedAt` so the maps rebuild only when the
 * underlying payload actually swaps (not on every lookup). */
let memoized: { generatedAt: string; maps: IndexMaps } | null = null

function buildMaps(index: CrossoverIndex): IndexMaps {
  if (memoized && memoized.generatedAt === index.generatedAt) {
    return memoized.maps
  }

  const bySteamId = new Map<string, number>()
  const byName = new Map<string, number>()

  // First-wins on collision — the builder already deduped by D-04, this is
  // just a defensive tie-break so the runtime lookup never has to choose.
  for (const entry of index.entries) {
    if (entry.steamid && !bySteamId.has(entry.steamid)) {
      bySteamId.set(entry.steamid, entry.rating)
    }
    const key = normalize(entry.name)
    if (!byName.has(key)) {
      byName.set(key, entry.rating)
    }
  }

  const maps = { bySteamId, byName }
  memoized = { generatedAt: index.generatedAt, maps }
  return maps
}

/**
 * D-02 gate-aware resolution shared by `getCodeweaversFromIndex` and
 * `crossoverIndexHas`. Exact Steam-AppID joins are the ground truth and are
 * NEVER subject to `NAME_MATCHING_SHIPS`. Non-Steam name matching (and a
 * Steam-AppID miss falling through to a name match) is consulted ONLY when
 * the D-02 promotion gate cleared — when it did not, those titles must be
 * key-absent (no possibly-wrong rating), which is exactly what 19-06/19-07
 * assume for D-16's honesty invariant.
 */
function resolveRating(
  gameInfo: IndexLookupInput,
  maps: IndexMaps
): number | null {
  if (gameInfo.runner === 'steam') {
    const bySteamId = maps.bySteamId.get(gameInfo.app_name)
    if (bySteamId !== undefined) {
      return bySteamId
    }
  }

  if (!NAME_MATCHING_SHIPS) {
    return null
  }

  const byName = maps.byName.get(normalize(gameInfo.title))
  return byName !== undefined ? byName : null
}

/**
 * Index-first CrossOver lookup (D-11). Returns a `CodeweaversInfo` on a hit
 * with ZERO network calls beyond `loadIndex`'s own cached/TTL'd fetch (which
 * itself never throws). Returns null on any miss — including a gated-out
 * non-Steam name match — so the caller's `?? getInfoFromCodeweavers(title)`
 * runs the lazy scrape. Never fabricates a rating and never adds a `medal`
 * field (D-12 — `CodeweaversInfo` is unchanged).
 */
export async function getCodeweaversFromIndex(
  gameInfo: IndexLookupInput
): Promise<CodeweaversInfo | null> {
  try {
    const index = await loadIndex(crossoverIndexDescriptor)
    if (!index) {
      return null
    }

    const maps = buildMaps(index)
    const rating = resolveRating(gameInfo, maps)
    if (rating === null) {
      return null
    }

    return {
      macRating: rating,
      linuxRating: null,
      slug: slugify(gameInfo.title)
    }
  } catch (error) {
    logError(
      [
        `Was not able to look up CrossOver index rating for ${gameInfo.title}`,
        error
      ],
      LogPrefix.Backend
    )
    return null
  }
}

/**
 * WR-07 (34.2-REVIEW.md round 1): batch entry point for callers that resolve
 * MANY games in one pass. Loads the index once and returns a resolver closed
 * over the built maps.
 *
 * `getCodeweaversFromIndex` is the right shape for a single lookup and the
 * wrong shape for a loop: it calls `loadIndex` per invocation, and `loadIndex`
 * reads the whole payload back out of `crossoverIndexStore` every time
 * (electron-store's `get` re-reads and re-parses the backing file on each
 * access — measured at ~1.4ms per call against a 239KB / 2421-entry real
 * store). Per game that is a linear cost for a value that cannot change
 * mid-pass, and on a stale cache it was a network attempt per game.
 * `buildMaps` was already memoized on `generatedAt`, so map construction was
 * never the cost — the repeated LOAD was.
 *
 * Resolution is identical to `getCodeweaversFromIndex`'s: the same D-02-gated
 * `resolveRating`. A total load failure yields a resolver returning null for
 * everything, matching that function's null-on-any-miss contract, so callers
 * cannot tell a failed load from a miss — deliberate, and the same
 * degradation D-09 already specifies.
 */
export async function buildIndexResolver(): Promise<
  (gameInfo: IndexLookupInput) => number | null
> {
  try {
    const index = await loadIndex(crossoverIndexDescriptor)
    if (!index) {
      return () => null
    }

    const maps = buildMaps(index)
    return (gameInfo: IndexLookupInput) => resolveRating(gameInfo, maps)
  } catch (error) {
    logError(
      ['Was not able to load the CrossOver index for batch resolution', error],
      LogPrefix.Backend
    )
    return () => null
  }
}

/**
 * Synchronous self-heal probe (D-13): reads the store's last-good payload
 * (no network) and applies the SAME D-02-gated resolution as
 * `getCodeweaversFromIndex`. Used by `wiki_game_info.ts` to decide whether a
 * cached Phase-16 "checked, none found" miss is now covered by the index.
 */
export function crossoverIndexHas(gameInfo: IndexLookupInput): boolean {
  const cached = crossoverIndexStore.get(crossoverIndexDescriptor.name) as
    | CachedIndex<CrossoverIndex>
    | undefined
  if (!cached) {
    return false
  }

  const maps = buildMaps(cached.data)
  return resolveRating(gameInfo, maps) !== null
}

/**
 * D-16 eligibility predicate consumed by 19-06's `buildCrossoverRatingMap`:
 * "was this game looked up at all?" Steam-runner games are ALWAYS eligible
 * (the exact-AppID join is ungated); a non-Steam game is eligible only when
 * the D-02 gate (`NAME_MATCHING_SHIPS`) cleared. 19-06 calls this FIRST and
 * leaves the map key ABSENT when it returns false — distinct from a `null`
 * looked-up-absent value.
 */
export function isCrossoverIndexEligible(
  gameInfo: Pick<GameInfo, 'runner'>
): boolean {
  return gameInfo.runner === 'steam' || NAME_MATCHING_SHIPS
}
