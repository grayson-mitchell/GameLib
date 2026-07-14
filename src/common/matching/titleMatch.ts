import { distance } from 'fastest-levenshtein'

/**
 * Pure, store-agnostic fuzzy title-matching module (Phase 20 D-02). No I/O,
 * no logging, no store import, and no dependency on any `backend/` type —
 * this module is shared verbatim between the Humble ownership-dedup surface
 * (backend/humble/dedup.ts) and the store-search badge resolver so the 85%
 * threshold and DLC false-positive guard behave identically everywhere a
 * fuzzy title match is needed. Signatures are string/number/boolean only.
 *
 * Lifted byte-for-byte from backend/humble/dedup.ts (Phase 12, HDEDUP-01).
 */

/**
 * T-12-01 (ReDoS guard, preserved from dedup.ts / T-20-01): EDITION_SUFFIXES
 * and DLC_KEYWORDS are fixed, hardcoded, developer-controlled constants.
 * They must NEVER be accepted from a config file, IPC payload, or any store
 * API response — the only regex construction below interpolates these
 * trusted literals, never untrusted title strings (T-12-05).
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
 * HDEDUP-01 success criterion 3 (Phase 12 dedup fuzzy-name fallback, D-02):
 * locked at 85%+, NOT the community-norm 70% — DLC titles false-positive
 * match base games at lower thresholds and false positives waste gift
 * links. Single source of truth — re-exported (never redefined) by
 * backend/humble/constants.ts.
 */
export const HUMBLE_FUZZY_MATCH_THRESHOLD = 0.85

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
