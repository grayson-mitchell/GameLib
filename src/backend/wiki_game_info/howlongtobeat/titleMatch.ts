/**
 * Title matching for HowLongToBeat's search results.
 *
 * An HLTB *ID* is exact. A title *search* returns ranked guesses, and attaching the wrong
 * playtime to a game is worse than showing none -- the value lands in the details page with
 * no affordance for the user to correct or even question it. So the rule here is deliberately
 * conservative: it refuses whenever it cannot tell two candidates apart, and refusal is a
 * normal outcome rather than an error.
 *
 * Pure and network-free on purpose, so the acceptance rule can be tested exhaustively without
 * touching HLTB's (undocumented, frequently-moved) search endpoint.
 */

/** Minimum similarity for a candidate to be considered at all. */
export const MIN_CONFIDENCE = 0.9

/**
 * How far the best candidate must beat the runner-up. Near-ties are the dangerous case:
 * `Doom` (1993) and `DOOM` (2016) normalize identically, so similarity alone would pick
 * whichever HLTB happened to rank first.
 */
export const MIN_MARGIN = 0.05

const ROMAN_NUMERALS: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
  xiii: 13,
  xiv: 14,
  xv: 15,
  xvi: 16
}

/**
 * Lowercase, strip diacritics and punctuation, spell `&` as `and`, collapse whitespace, and
 * fold a TRAILING roman numeral to its arabic value.
 *
 * The roman fold is what lets `Final Fantasy VII` match `Final Fantasy 7`. Without it the two
 * score 0.87 by bigram overlap and get refused -- a needless miss, since they are the same
 * game. Only the trailing token is folded, so an interior word that happens to be a roman
 * numeral is left alone.
 *
 * Editions are NOT stripped. "Game" and "Game: Definitive Edition" are frequently separate
 * HLTB entries with different playtimes, so folding them together would trade a miss for a
 * wrong answer -- the exact trade this module exists to avoid.
 */
export function normalizeTitle(title: string): string {
  const normalized = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

  const words = normalized.split(' ')
  const last = words[words.length - 1]
  if (words.length > 1 && last && ROMAN_NUMERALS[last] !== undefined) {
    words[words.length - 1] = String(ROMAN_NUMERALS[last])
    return words.join(' ')
  }

  return normalized
}

/**
 * The trailing sequel number of an ALREADY-NORMALIZED title, or `null` when it has none.
 *
 * `Portal` yields `null`, which is what keeps it distinguishable from `Portal 2` no matter
 * how similar the two strings look to a bigram score.
 */
export function sequelToken(normalized: string): number | null {
  const lastWord = normalized.split(' ').pop()
  if (!lastWord || !/^\d+$/.test(lastWord)) return null

  const parsed = parseInt(lastWord, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** Sørensen-Dice coefficient over character bigrams. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.length < 2 || b.length < 2) return 0

  const bigrams = (s: string): Map<string, number> => {
    const counts = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const gram = s.slice(i, i + 2)
      counts.set(gram, (counts.get(gram) ?? 0) + 1)
    }
    return counts
  }

  const aGrams = bigrams(a)
  const bGrams = bigrams(b)

  let intersection = 0
  for (const [gram, count] of aGrams) {
    intersection += Math.min(count, bGrams.get(gram) ?? 0)
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1))
}

/**
 * Split a store title into the search terms HLTB's endpoint expects.
 *
 * Store metadata carries trademark glyphs that HLTB's index does not: searching the raw
 * `Sekiro™: Shadows Die Twice` returns ZERO results, while `Sekiro Shadows Die Twice`
 * returns the game. Verified live against the endpoint.
 *
 * Only trademark symbols and TRAILING punctuation are removed. Diacritics are left alone
 * (`Pokémon Snap` and `Pokemon Snap` both work), and interior punctuation is preserved
 * because `NieR:Automata` resolves as one term. This is about widening the search, never
 * about deciding a match -- `pickBestMatch` still scores against the original title.
 */
export function toSearchTerms(title: string): string[] {
  return title
    .replace(/[™®©℠]/g, ' ')
    .split(/\s+/)
    .map((term) => term.replace(/[:,.;!?-]+$/, '').trim())
    .filter(Boolean)
}

export interface TitleCandidate<T> {
  title: string
  value: T
}

/**
 * Pick the one candidate that is unambiguously the same game, or `null`.
 *
 * Three conditions, all required:
 *   1. similarity >= MIN_CONFIDENCE
 *   2. the runner-up trails by >= MIN_MARGIN  (refuse near-ties)
 *   3. sequel tokens agree exactly            (refuse Portal -> Portal 2)
 *
 * Condition 3 is checked before scoring so a sequel can never be the runner-up that a
 * legitimate match has to out-margin.
 */
export function pickBestMatch<T>(
  query: string,
  candidates: TitleCandidate<T>[]
): T | null {
  const normalizedQuery = normalizeTitle(query)
  if (!normalizedQuery || candidates.length === 0) return null

  const querySequel = sequelToken(normalizedQuery)

  const scored = candidates
    .map((candidate) => {
      const normalized = normalizeTitle(candidate.title)
      return {
        value: candidate.value,
        normalized,
        score: diceSimilarity(normalizedQuery, normalized)
      }
    })
    .filter((c) => sequelToken(c.normalized) === querySequel)
    .sort((a, b) => b.score - a.score)

  const best = scored[0]
  if (!best || best.score < MIN_CONFIDENCE) return null

  // Every candidate within MIN_MARGIN of the top score is a rival, INCLUDING one that
  // normalizes identically. Two distinct HLTB entries both named "Doom" both score 1.0
  // against the query, so excluding same-normalized rivals here -- the obvious reading of
  // "runner-up" -- would wave through precisely the collision this guard exists to catch.
  const contenders = scored.filter(
    (c) => best.score - c.score < MIN_MARGIN
  ).length
  if (contenders > 1) return null

  return best.value
}
