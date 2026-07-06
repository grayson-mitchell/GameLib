import { distance } from 'fastest-levenshtein'
import { GameInfo } from 'common/types'
import { HumbleKey } from 'common/types/humble'
import { HUMBLE_FUZZY_MATCH_THRESHOLD } from './constants'

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
 */

/**
 * T-12-01 (ReDoS guard): EDITION_SUFFIXES and DLC_KEYWORDS are fixed,
 * hardcoded, developer-controlled constants. They must NEVER be accepted
 * from a config file, IPC payload, or the Humble API response — the only
 * regex construction below interpolates these trusted literals, never
 * untrusted title strings (T-12-05).
 */
const EDITION_SUFFIXES = [
  'game of the year edition',
  'goty edition',
  'goty',
  'definitive edition',
  'enhanced edition',
  'remastered',
  'anniversary edition',
  'complete edition',
  'ultimate edition',
  'deluxe edition',
  'standard edition',
  'collection'
] as const

const DLC_KEYWORDS = [
  'dlc',
  'season pass',
  'expansion',
  'soundtrack',
  'artbook',
  'art book',
  'content pack',
  'bonus content',
  'upgrade pack'
] as const

/**
 * Lowercase, strip trademark symbols, parenthetical qualifiers (e.g.
 * "(Steam)"), edition suffixes, and punctuation; collapse whitespace.
 *
 * The parenthetical strip is required by the project's own documented
 * must-match fixture "Into the Breach" vs "Into The Breach (Steam)" — the
 * trailing qualifier alone drops the Levenshtein ratio to ~0.71, well below
 * the locked 0.85 threshold.
 */
export function normalizeTitle(title: string): string {
  let t = title.toLowerCase().replace(/[™®©]/g, '')
  t = t.replace(/\([^)]*\)/g, ' ')
  for (const suffix of EDITION_SUFFIXES) {
    t = t.replace(new RegExp(`\\b${suffix}\\b`, 'g'), '')
  }
  return t
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Length-sensitive similarity: `1 - distance / maxLen` over normalized
 * titles. A base-game/DLC pair differs substantially in total length, so
 * this ratio naturally penalizes the containment relationship that
 * token-set algorithms reward.
 */
export function titleSimilarity(a: string, b: string): number {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (na.length === 0 || nb.length === 0) return 0
  const maxLen = Math.max(na.length, nb.length)
  return 1 - distance(na, nb) / maxLen
}

/**
 * Defense-in-depth guard, in addition to the length-sensitive ratio above:
 * if the raw (pre-normalization) longer title contains a DLC/expansion
 * keyword that the shorter title does not, never treat this as a match
 * regardless of the computed score — protects short base-game titles
 * (e.g. a 3-word base game + a 1-word "DLC" suffix could still occasionally
 * clear 85% on length-sensitive scoring for very short titles).
 */
export function isDlcFalsePositiveRisk(a: string, b: string): boolean {
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  const longerLower = longer.toLowerCase()
  const shorterLower = shorter.toLowerCase()
  return DLC_KEYWORDS.some(
    (kw) => longerLower.includes(kw) && !shorterLower.includes(kw)
  )
}

export function fuzzyMatch(humbleTitle: string, steamTitle: string): boolean {
  if (isDlcFalsePositiveRisk(humbleTitle, steamTitle)) return false
  return (
    titleSimilarity(humbleTitle, steamTitle) >= HUMBLE_FUZZY_MATCH_THRESHOLD
  )
}

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
    if (key.steamAppId !== undefined) {
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
