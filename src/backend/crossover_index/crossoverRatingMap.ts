/**
 * CrossOver rating map resolver, extracted out of `ipc_handler.ts` (Phase
 * 34.2 Plan 03, D-06).
 *
 * `crossover_index/ipc_handler.ts` is the one feature module where the
 * reusable function and its own `addHandler` call shared a file, so
 * importing it from the sidecar would be a side-effect import that drags
 * `backend/ipc` (which imports the real `electron`) into the graph -- the
 * exact pattern D-04's curated-import discipline forbids. `buildCrossoverRatingMap`
 * lives here, standalone, so it can be imported without registering
 * anything. `ipc_handler.ts` now only imports it back for its
 * `addHandler('getCrossoverIndex', ...)` registration.
 *
 * MUST NOT import `electron` (or anything that transitively reaches it) --
 * including `backend/ipc`.
 */

import { isMac } from 'backend/constants/environment'
import { libraryManagerMap } from 'backend/storeManagers'

import {
  isCrossoverIndexEligible,
  buildIndexResolver,
  IndexLookupInput
} from './index'

/**
 * D-11/D-16: resolves every library title's CrossOver rating ONCE, into a
 * three-state map (`Record<string, number | null>` keyed by `app_name`) so
 * the grid never fires per-card IPC/scrapes to paint a badge.
 *
 * - key absent   → `isCrossoverIndexEligible` returned false: this game was
 *   NEVER looked up (e.g. a non-Steam title while the D-02 name-matching
 *   gate is closed). No mark should ever be painted for it.
 * - value `null` → eligible and consulted, but `getCodeweaversFromIndex`
 *   found no record. "Looked up, nothing found" — an unknown mark.
 * - value number → eligible and matched. The CrossOver rating badge.
 *
 * Empty on non-macOS: the CrossOver/Wine compatibility question only
 * applies when running games via a macOS translation layer (D-10), so
 * nothing should paint on Linux/Windows regardless of eligibility.
 */
export async function buildCrossoverRatingMap(): Promise<
  Record<string, number | null>
> {
  const map: Record<string, number | null> = {}

  if (!isMac) {
    return map
  }

  // WR-07: the index is loaded ONCE for the whole pass, not once per game.
  // It cannot change mid-pass, and the previous per-game
  // `getCodeweaversFromIndex` call meant a full store read per title — and,
  // on a stale cache, a network attempt per title on a channel exempt from
  // the 60s invoke bound (D-10). Gated by `ratingMapIndexLoads.test.ts`.
  //
  // LAZY-once rather than eager-once: a library with nothing eligible (every
  // title non-Steam while the D-02 gate is closed) must still not consult the
  // index at all, which `ratingMap.test.ts` asserts explicitly. Hoisting the
  // load above the loop unconditionally would have quietly broken that.
  let resolveRatingFor: ((gameInfo: IndexLookupInput) => number | null) | null =
    null

  for (const manager of Object.values(libraryManagerMap)) {
    for (const gameInfo of manager.getListOfGames()) {
      if (!isCrossoverIndexEligible(gameInfo)) {
        // Never looked up — key stays absent (D-16).
        continue
      }

      resolveRatingFor ??= await buildIndexResolver()
      map[gameInfo.app_name] = resolveRatingFor(gameInfo)
    }
  }

  return map
}
