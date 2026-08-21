/**
 * D-01/D-02/D-03/D-20: the CrossOver MATCHING key.
 *
 * This file is a sibling of `src/backend/wiki_game_info/codeweavers/utils.ts`'s
 * `slugify()`/`baseSlugify()` (the URL SLUG), never a reuse of it. The two have
 * opposite correctness criteria:
 *   - The URL slug must keep numerals verbatim (D-20 — CodeWeavers' canonical
 *     names and Steam's store titles already agree on roman-vs-arabic branding,
 *     so converting one side pulls two matching strings apart).
 *   - The matching key's open question is whether to strip EDITION-SUFFIX text
 *     ("Game of the Year Edition", "Definitive Edition", ...) to raise the hit
 *     rate at the cost of a small, measured collision risk (D-03).
 * Conflating the two files is the exact trap D-20 documents. This file must
 * NOT have any import statement naming `slugify`, `naiveSlugify`,
 * `baseSlugify`, or the sibling module's path (the D-20 separation grep
 * checks for exactly this).
 */

/** Combining diacritical marks left behind after an NFKD decomposition
 * (same character class as codeweavers/utils.ts's own constant — duplicated,
 * not imported, to keep this file import-free of the slug module). */
const COMBINING_DIACRITIC_RE = /[̀-ͯ]/g

/**
 * Shape copied from `baseSlugify` (NFKD normalize -> strip combining
 * diacritics -> lowercase), stopping short of the slug's hyphen-collapse so
 * each candidate below can choose its own punctuation policy.
 */
function baseTransform(title: string): string {
  return title
    .normalize('NFKD')
    .replace(COMBINING_DIACRITIC_RE, '')
    .toLowerCase()
}

/**
 * Candidate A — exact lowercase. NFKD + diacritics-strip + lowercase only;
 * punctuation (including apostrophes, colons, curly-quote variants) is left
 * untouched. Cheapest candidate; does NOT unify apostrophe variants (see
 * normalize.test.ts) because U+2019 has no NFKD-compatibility decomposition
 * to U+0027 — this is why candidate A cannot be the shipped `normalize()`.
 */
export function normalizeExactLowercase(title: string): string {
  return baseTransform(title).trim()
}

/**
 * Candidate B — punctuation-stripped. Collapses any run of non-alphanumeric
 * characters (apostrophes of every variant, colons, commas, parens, ...) to
 * a single separator and trims leading/trailing separators. Measured as
 * "free" against the whole-dump self-collision test (0 rating-disagreeing
 * collisions, 19-RESEARCH.md line 534-538) — this is the safe floor.
 */
export function normalizePunctuationStripped(title: string): string {
  return baseTransform(title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Edition-suffix vocabulary the harness measures stripping against (D-03's
 * "live trade-off"). Matched at the END of an already punctuation-collapsed
 * key, so e.g. "baldurs-gate-3-digital-deluxe-edition" -> "baldurs-gate-3".
 * Applied repeatedly (bounded loop) so a chained suffix like
 * "-goty-edition" fully resolves in one pass without a second regex.
 */
const EDITION_SUFFIX_RE =
  /-(?:game-of-the-year|goty|definitive|deluxe|digital-deluxe|complete|ultimate|gold|enhanced|special|anniversary|extended|standard|remastered|remaster|directors-cut|game-of-the-year-goty)(?:-edition)?$/

/** Bounded — an edition-suffix chain is never more than a handful of words
 * deep; this guards against a pathological input looping forever. */
const MAX_EDITION_STRIP_PASSES = 5

/**
 * Candidate C — punctuation-stripped PLUS edition-suffix stripped. Highest
 * measured hit rate (84.6% in the research preview) but the whole-dump
 * self-collision test found this is where harm enters: 11 colliding keys /
 * 33 records (1.2%) where the collision-fused records DISAGREE on rating
 * (19-RESEARCH.md line 536-538). This is the trade-off the D-02 gate
 * adjudicates empirically via meta/measureCrossoverMatching.ts.
 */
export function normalizePunctuationAndEditionStripped(title: string): string {
  let key = normalizePunctuationStripped(title)
  for (let pass = 0; pass < MAX_EDITION_STRIP_PASSES; pass++) {
    const stripped = key.replace(EDITION_SUFFIX_RE, '')
    if (stripped === key) {
      break
    }
    key = stripped.replace(/-+$/, '')
  }
  return key
}

/**
 * The winning normalizer, selected by meta/measureCrossoverMatching.ts's
 * 123-pair ground-truth measurement (D-02): the candidate with the highest
 * hit rate among those that pass the pre-committed gate
 * (wrongHitRate < 0.02 AND hitRate > 0.30).
 *
 * Roman numerals are NOT converted to arabic digits (or vice versa) by any
 * candidate above — D-20's own finding is that CodeWeavers' canonical names
 * and Steam's store titles already agree on official branding ("Quake II",
 * "Age of Empires II"), so normalizing numerals would pull two already-
 * matching strings apart rather than uniting them. This mirrors the slug's
 * verbatim-numerals policy exactly, for the same underlying reason — it is
 * not a coincidence that both files agree here, only the edition-suffix
 * knob is actually contested.
 *
 * Selected candidate: C (punctuation + edition-suffix stripped) — see
 * `.planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md`
 * (the highest hit rate among the candidates that pass the D-02 gate).
 */
export const normalize = normalizePunctuationAndEditionStripped

/**
 * D-02's promotion-gate verdict, machine-readable. Defaults to `false`
 * (fail-safe — v1 ships Steam-AppID-only badges) and is flipped to `true`
 * ONLY by the executor transcribing a recorded PASS from
 * meta/measureCrossoverMatching.ts's dated report. Plan 19-05's runtime
 * lookup imports this symbol to conditionally skip the byName matching path
 * — the name is a stable cross-plan contract, do not rename it.
 *
 * Set from: .planning/phases/19-crossover-compatibility-index-macos/measure-crossover-match-2026-07-13.md
 * Verdict: PASS — candidate C (punctuation + edition-suffix stripped),
 * wrongHitRate 0.81% (1/123), hitRate 85.37% (105/123), against the
 * pre-committed bounds WRONG_HIT_MAX=0.02, HIT_RATE_MIN=0.30, evaluated on
 * the 123-pair Steam ∩ dump-by-AppID ground-truth set.
 */
export const NAME_MATCHING_SHIPS: boolean = true
