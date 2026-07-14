import { addHandler } from 'backend/ipc'
import { isMac } from 'backend/constants/environment'
import { libraryManagerMap } from 'backend/storeManagers'

import { isCrossoverIndexEligible, getCodeweaversFromIndex } from './index'

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

  for (const manager of Object.values(libraryManagerMap)) {
    for (const gameInfo of manager.getListOfGames()) {
      if (!isCrossoverIndexEligible(gameInfo)) {
        // Never looked up — key stays absent (D-16).
        continue
      }

      const result = await getCodeweaversFromIndex(gameInfo)
      map[gameInfo.app_name] = result?.macRating ?? null
    }
  }

  return map
}

addHandler('getCrossoverIndex', async () => buildCrossoverRatingMap())
