// The CodeWeavers page scrape was removed (Cloudflare answers it with 403);
// CrossOver ratings come from the index built from the official crossover.tie.gz dump.

/** Apostrophe and right-single-quote variants seen in game titles. */
const APOSTROPHE_RE = /['’‘]/g

/** Combining diacritical marks left behind after an NFKD decomposition. */
const COMBINING_DIACRITIC_RE = /[̀-ͯ]/g

function baseSlugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(COMBINING_DIACRITIC_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * D-04/D-20: the corrected slug builder.
 * (a) Apostrophes are dropped entirely, not hyphenated
 *     ("Baldur's Gate 3" -> "baldurs-gate-3", "Alekhine's Gun" ->
 *     "alekhines-gun") — load-bearing, 118 games depend on it.
 * (b) Roman numerals are kept VERBATIM (D-20 reversal — CodeWeavers'
 *     canonical slugs and Steam's store titles already agree on official
 *     branding, e.g. "Age of Empires II" -> "age-of-empires-ii", "Quake II"
 *     -> "quake-ii"; converting to Arabic digits pulled two already-
 *     matching strings apart instead of uniting them).
 * Also collapses any other run of non-alphanumeric characters to a single
 * hyphen and trims leading/trailing hyphens (T-16-01 — output is always
 * `[a-z0-9-]`, so a crafted title cannot inject a path segment or change
 * host when appended to the CodeWeavers compatibility URL).
 */
export function slugify(title: string): string {
  const withoutApostrophes = title.replace(APOSTROPHE_RE, '')
  return baseSlugify(withoutApostrophes)
}
