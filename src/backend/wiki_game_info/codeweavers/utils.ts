import {
  BASE_URL,
  BROWSER_USER_AGENT,
  SOFT_404_TITLE_RE,
  ldJsonRegEx
} from './constants'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { CodeweaversInfo } from 'common/types'
import { axiosClient } from 'backend/utils'

/**
 * T-16-02: bounds response body size so a pathological/huge page cannot
 * balloon parse cost. ~5MB is generous for a single compatibility page.
 */
const MAX_CONTENT_LENGTH = 5 * 1024 * 1024

/** Roman numerals I-X, longest-alternative-first so e.g. "VIII" is matched
 * before "VI"/"I"/"V" would otherwise consume a prefix of it. */
const ROMAN_NUMERAL_RE = /\b(VIII|VII|III|IV|IX|VI|II|I|V|X)\b/g
const ROMAN_NUMERAL_MAP: Record<string, string> = {
  I: '1',
  II: '2',
  III: '3',
  IV: '4',
  V: '5',
  VI: '6',
  VII: '7',
  VIII: '8',
  IX: '9',
  X: '10'
}

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
 * D-04: the corrected slug builder used as the PRIMARY lookup slug.
 * (a) Apostrophes are dropped entirely, not hyphenated
 *     ("Baldur's Gate 3" -> "baldurs-gate-3").
 * (b) Standalone roman numerals I-X are normalized to Arabic digits
 *     ("Modern Warfare II" -> "modern-warfare-2").
 * Also collapses any other run of non-alphanumeric characters to a single
 * hyphen and trims leading/trailing hyphens (T-16-01 — output is always
 * `[a-z0-9-]`, so a crafted title cannot inject a path segment or change
 * host when appended to the fixed BASE_URL).
 */
export function slugify(title: string): string {
  const withoutApostrophes = title.replace(APOSTROPHE_RE, '')
  const withArabicNumerals = withoutApostrophes.replace(
    ROMAN_NUMERAL_RE,
    (match) => ROMAN_NUMERAL_MAP[match]
  )
  return baseSlugify(withArabicNumerals)
}

/**
 * The pre-D-04 "naive" slug: apostrophes collapse to a hyphen (via the
 * generic non-alphanumeric-run collapse) and roman numerals are left
 * untouched. Used ONLY as the single secondary fallback slug when the
 * primary (`slugify`) slug misses (D-04, SC-02 — bounded to one retry).
 */
export function naiveSlugify(title: string): string {
  return baseSlugify(title)
}

function isSoft404(html: string): boolean {
  return SOFT_404_TITLE_RE.test(html)
}

interface ParsedRating {
  rating: number
  ratingCount: number
}

/**
 * Ports `extractVideoGameJsonLd` from spike/crossover-compat-lookup.mjs:
 * match the first `application/ld+json` script block, parse it, and walk
 * `@graph` for a `VideoGame` node's `aggregateRating`. Returns null on any
 * parse/shape failure (soft-404 pages have no such block at all).
 */
function extractVideoGameJsonLd(html: string): ParsedRating | null {
  const match = html.match(ldJsonRegEx)
  if (!match) {
    return null
  }

  let data
  try {
    data = JSON.parse(match[1])
  } catch {
    return null
  }

  const graph = Array.isArray(data?.['@graph']) ? data['@graph'] : [data]
  const videoGame = graph.find((node: { '@type'?: string | string[] }) => {
    const type = node?.['@type']
    if (!type) {
      return false
    }
    return Array.isArray(type) ? type.includes('VideoGame') : type === 'VideoGame'
  })

  const aggregateRating = videoGame?.aggregateRating
  if (!aggregateRating) {
    return null
  }

  const rating = Number(aggregateRating.ratingValue)
  const ratingCount = Number(aggregateRating.ratingCount)

  if (!Number.isFinite(rating) || !Number.isFinite(ratingCount)) {
    return null
  }

  return { rating, ratingCount }
}

/**
 * Fetches a single CodeWeavers compatibility page for `slug` and classifies
 * it by CONTENT, never by HTTP status (D-03 — every response is HTTP 200).
 * Returns null for both a soft-404 and a hit-with-no-parseable-rating; the
 * caller distinguishes "no rating found" from "fetch/parse threw" (D-09).
 */
async function fetchRatingForSlug(slug: string): Promise<ParsedRating | null> {
  const url = `${BASE_URL}/${slug}`

  const { data: html } = await axiosClient.get<string>(url, {
    headers: { 'User-Agent': BROWSER_USER_AGENT },
    responseType: 'text',
    maxContentLength: MAX_CONTENT_LENGTH
  })

  if (isSoft404(html)) {
    return null
  }

  return extractVideoGameJsonLd(html)
}

export async function getInfoFromCodeweavers(
  title: string
): Promise<CodeweaversInfo | null> {
  const slug = slugify(title)

  try {
    logInfo(
      `Getting CodeWeavers CrossOver rating for ${title}`,
      LogPrefix.ExtraGameInfo
    )

    const primary = await fetchRatingForSlug(slug)
    if (primary) {
      return { rating: primary.rating, ratingCount: primary.ratingCount, slug }
    }

    // D-04 / SC-02: primary slug missed (content-classified soft-404, or a
    // hit page with no parseable aggregateRating). Attempt exactly ONE
    // fallback — the pre-D-04 naive slug — before giving up. Never more
    // than one fallback (polite, bounded lookups).
    const fallbackSlug = naiveSlugify(title)
    if (fallbackSlug !== slug) {
      const fallback = await fetchRatingForSlug(fallbackSlug)
      if (fallback) {
        return {
          rating: fallback.rating,
          ratingCount: fallback.ratingCount,
          slug: fallbackSlug
        }
      }
    }

    // Genuine miss (both slugs content-classified as soft-404/unratable).
    // Cacheable — NOT null — so this game isn't re-fetched every visit.
    return { rating: null, ratingCount: null, slug }
  } catch (error) {
    logError(
      [`Was not able to get CodeWeavers data for ${title}`, error],
      LogPrefix.ExtraGameInfo
    )
    // Fetch/parse threw. Retryable — distinct from the cacheable miss above.
    return null
  }
}
