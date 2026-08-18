import { GameInfo } from 'common/types'
import { HumbleKey } from 'common/types/humble'
import { fuzzyMatch } from 'common/matching/titleMatch'

/**
 * Pure ownership-matching module (HDEDUP-01, D-44/D-45). No I/O, no logging,
 * no store import — the Steam library array and the D-42 override predicate
 * are passed in by the caller (library.ts, Plan 03) so this module is
 * unit-testable with zero mocking of axios/electron-store, exactly like
 * classify.ts injects `isRevealed`.
 *
 * Two-tier matching:
 *   1. If a key carries `steamAppId`, ownership is decided by EXACT AppID
 *      equality against the Steam library's `app_name` (the stringified
 *      AppID) — the verdict is final, with NO fuzzy fallback (D-44).
 *   2. Otherwise, a length-sensitive normalized-Levenshtein ratio at 85%+
 *      (HUMBLE_FUZZY_MATCH_THRESHOLD) with an explicit DLC-keyword guard —
 *      deliberately NOT token-set matching, which scores base-game/DLC
 *      pairs highly by construction (12-RESEARCH.md Pattern 3 / Pitfall 1).
 *
 * Phase 20 (D-02): the pure matcher primitives (normalizeTitle,
 * titleSimilarity, isDlcFalsePositiveRisk, fuzzyMatch) and the
 * HUMBLE_FUZZY_MATCH_THRESHOLD constant now live in
 * common/matching/titleMatch.ts so the store-search badge resolver can
 * reuse them without a second matcher. Re-exported here so existing
 * importers of this module keep compiling unchanged.
 */
export {
  normalizeTitle,
  titleSimilarity,
  isDlcFalsePositiveRisk,
  fuzzyMatch
} from 'common/matching/titleMatch'

/**
 * Recomputes the ownership overlay (`ownedElsewhere`/`matchConfidence`) for
 * every key against the given Steam library snapshot.
 *
 * Rules, in order:
 *   - UNPICKED pseudo-entries are excluded from matching entirely (D-27) —
 *     returned unchanged.
 *   - An EMPTY `steamGames` array is treated as "no usable Steam data": all
 *     keys are returned unchanged rather than zeroed out (D-48 unit-level
 *     floor — the real connectivity gate lives in the caller, library.ts).
 *   - `steamAppId` present → exact `app_name` equality, verdict final
 *     ('exact' on hit, 'none' on miss — NO fuzzy fallback, D-44).
 *   - Otherwise → fuzzy title matching across the library ('fuzzy' on hit).
 *     No platform gate: a GOG/Epic key matching a Steam-owned title is the
 *     intended cross-platform behavior (D-45, Pattern 4).
 *   - D-42 override ("Not the same game") only ever clears a FUZZY match —
 *     an exact AppID match is ground truth and cannot be overridden.
 */
export function recomputeOwnership(
  keys: HumbleKey[],
  steamGames: GameInfo[],
  isOverridden: (machineName: string) => boolean
): HumbleKey[] {
  if (steamGames.length === 0) {
    return keys
  }
  return keys.map((key) => {
    if (key.state === 'UNPICKED') {
      return key
    }
    let ownedElsewhere = false
    let matchConfidence: HumbleKey['matchConfidence'] = 'none'
    // D-71 / WR-01 fix: a falsy-but-present steamAppId ('' or '0') must not
    // shadow the fuzzy tier. `!== undefined` alone let '' / '0' satisfy the
    // AppID branch, find no match, and never fall through to fuzzy. Note: a
    // plain JS truthiness check (`if (key.steamAppId)`) is NOT sufficient
    // here — the string '0' is truthy in JavaScript — so '0' is excluded
    // explicitly alongside '' and undefined.
    const hasUsableSteamAppId =
      key.steamAppId !== undefined &&
      key.steamAppId !== '' &&
      key.steamAppId !== '0'
    if (hasUsableSteamAppId) {
      if (steamGames.some((g) => g.app_name === key.steamAppId)) {
        ownedElsewhere = true
        matchConfidence = 'exact'
      }
    } else if (steamGames.some((g) => fuzzyMatch(key.title, g.title))) {
      ownedElsewhere = true
      matchConfidence = 'fuzzy'
    }
    if (matchConfidence === 'fuzzy' && isOverridden(key.machineName)) {
      ownedElsewhere = false
      matchConfidence = 'none'
    }
    return { ...key, ownedElsewhere, matchConfidence }
  })
}
