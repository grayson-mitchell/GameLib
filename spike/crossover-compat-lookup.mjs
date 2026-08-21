#!/usr/bin/env node
/**
 * THROWAWAY FEASIBILITY SPIKE — CrossOver (CodeWeavers) compatibility lookup by slug.
 *
 * Purpose: measure the real slug-match rate for
 * https://www.codeweavers.com/compatibility/crossover/{slug}
 * against a representative sample of game titles, BEFORE building a
 * backend service + UI pill around this data source.
 *
 * This script and its directory (spike/) are throwaway. Delete after the
 * GO/NO-GO decision has been made and recorded in
 * spike/crossover-compat-FINDINGS.md.
 *
 * Run: node spike/crossover-compat-lookup.mjs
 * Requires: Node 18+ (built-in global fetch). No external dependencies.
 */

// ---------------------------------------------------------------------------
// 1. Sample titles — representative mix of easy + hard cases
// ---------------------------------------------------------------------------

const SAMPLE_TITLES = [
  'Hades', // plain title
  '007 Nightfire', // numeric/subtitle title
  'Half-Life 2', // punctuation (hyphen + number)
  "Baldur's Gate 3", // apostrophe
  'The Witcher 3: Wild Hunt', // colon + edition-style subtitle
  'Pokémon', // diacritic
  'Ori and the Blind Forest', // diacritic-adjacent, multi-word
  'Call of Duty: Modern Warfare II', // colon + roman numeral, likely miss (trademark/branding heavy)
  "Marvel's Spider-Man Remastered", // apostrophe + hyphen + edition suffix, likely miss
  'Elden Ring', // plain, likely hit
  'Definitely Not A Real Game 9000', // deliberate oddball, expected miss
  'Grand Theft Auto V' // roman numeral as "V"
]

// ---------------------------------------------------------------------------
// 2. slugify(title) — kebab-case per CrossOver's URL scheme
// ---------------------------------------------------------------------------

function slugify(title) {
  return title
    .normalize('NFKD') // decompose accented chars into base + combining marks
    .replace(/[̀-ͯ]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // any run of non-alphanumeric -> single hyphen
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
}

// Self-check: known-good examples from CodeWeavers site verification.
// A wrong slugifier must fail loudly here rather than silently producing
// bad URLs for the whole sample run.
const KNOWN_GOOD = [
  ['007 Nightfire', '007-nightfire'],
  ['10,000,000', '10-000-000'],
  ['001 Game Creator', '001-game-creator']
]

for (const [input, expected] of KNOWN_GOOD) {
  const actual = slugify(input)
  if (actual !== expected) {
    throw new Error(
      `slugify self-check FAILED: slugify(${JSON.stringify(input)}) = ${JSON.stringify(
        actual
      )}, expected ${JSON.stringify(expected)}`
    )
  }
}
console.log('slugify self-check passed (3/3 known-good examples).\n')

// ---------------------------------------------------------------------------
// 3. Fetch + parse
// ---------------------------------------------------------------------------

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const BASE_URL = 'https://www.codeweavers.com/compatibility/crossover'
const DELAY_MS = 1500 // polite inter-request delay

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractVideoGameJsonLd(html) {
  // Extract the FIRST <script type="application/ld+json">...</script> block.
  const match = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  )
  if (!match) return null

  let data
  try {
    data = JSON.parse(match[1])
  } catch (err) {
    return { parseError: String(err && err.message ? err.message : err) }
  }

  const graph = Array.isArray(data['@graph']) ? data['@graph'] : [data]
  const videoGame = graph.find((node) => {
    const type = node && node['@type']
    if (!type) return false
    return Array.isArray(type)
      ? type.includes('VideoGame')
      : type === 'VideoGame'
  })

  if (!videoGame) return { parseError: 'no VideoGame node in @graph' }

  const aggregateRating = videoGame.aggregateRating || null

  return {
    ratingValue: aggregateRating ? aggregateRating.ratingValue : undefined,
    ratingCount: aggregateRating ? aggregateRating.ratingCount : undefined,
    applicationCategory: videoGame.applicationCategory,
    operatingSystem: videoGame.operatingSystem,
    publisherName: videoGame.publisher ? videoGame.publisher.name : undefined,
    sameAs: videoGame.sameAs
  }
}

// EMPIRICAL CORRECTION (see FINDINGS.md): the CodeWeavers site does NOT return
// a real HTTP 404 for unknown slugs. It returns HTTP 200 with a "soft 404"
// page whose <title> is "404 Not Found | CodeWeavers" and no VideoGame
// JSON-LD block. A real HTTP 404 status is still handled defensively below
// in case behavior differs for some slugs, but the primary hit/miss signal
// is content-based, not status-based.
const SOFT_404_TITLE_RE = /<title>\s*404 Not Found/i

function isSoft404(html) {
  return SOFT_404_TITLE_RE.test(html)
}

async function lookupTitle(title) {
  const slug = slugify(title)
  const url = `${BASE_URL}/${slug}`

  let status
  let hit = false
  let ratingValue
  let ratingCount
  let note = ''

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': CHROME_UA },
      redirect: 'follow'
    })
    status = res.status

    if (status === 200) {
      const html = await res.text()

      if (isSoft404(html)) {
        // Real miss: site answers with HTTP 200 + a "404 Not Found" title
        // page instead of a real 404 status.
        hit = false
        status = '200 (soft-404)'
      } else {
        try {
          const parsed = extractVideoGameJsonLd(html)
          if (!parsed) {
            hit = false
            note =
              '200 but no JSON-LD block found and no soft-404 marker (ambiguous, not counted as clean hit/miss)'
          } else if (parsed.parseError) {
            hit = false
            note = `200 but unparsed: ${parsed.parseError} (ambiguous, not counted as clean hit/miss)`
          } else {
            hit = true
            ratingValue = parsed.ratingValue
            ratingCount = parsed.ratingCount
            if (ratingValue === undefined) {
              note = 'hit, parsed, but no aggregateRating present'
            }
          }
        } catch (err) {
          // Defensive: extraction itself should already be try/catch'd above,
          // but guard the whole thing so a malformed page never crashes the run.
          hit = false
          note = `200 but unparsed (unexpected error): ${err.message} (ambiguous, not counted as clean hit/miss)`
        }
      }
    } else if (status === 404) {
      hit = false
    } else {
      note = `unexpected status ${status} (not counted as clean hit/miss)`
    }
  } catch (err) {
    status = 'ERROR'
    note = `fetch failed: ${err.message}`
  }

  return { title, slug, url, status, hit, ratingValue, ratingCount, note }
}

// ---------------------------------------------------------------------------
// 4. Run sequentially with a polite delay, print table + summary
// ---------------------------------------------------------------------------

async function main() {
  const results = []

  for (let i = 0; i < SAMPLE_TITLES.length; i++) {
    const title = SAMPLE_TITLES[i]
    const result = await lookupTitle(title)
    results.push(result)
    console.log(
      `[${i + 1}/${SAMPLE_TITLES.length}] ${title} -> ${result.slug} -> ${result.status} ${
        result.hit ? 'HIT' : 'MISS'
      }${result.note ? ` (${result.note})` : ''}`
    )
    if (i < SAMPLE_TITLES.length - 1) {
      await sleep(DELAY_MS)
    }
  }

  console.log('\n--- Per-title results ---')
  const header = [
    'Title',
    'Slug',
    'Status',
    'Hit/Miss',
    'RatingValue',
    'RatingCount'
  ]
  console.log(header.join(' | '))
  console.log(header.map(() => '---').join(' | '))
  for (const r of results) {
    console.log(
      [
        r.title,
        r.slug,
        String(r.status),
        r.hit ? 'HIT' : 'MISS',
        r.ratingValue !== undefined ? String(r.ratingValue) : '-',
        r.ratingCount !== undefined ? String(r.ratingCount) : '-'
      ].join(' | ')
    )
  }

  const hits = results.filter((r) => r.hit).length
  const total = results.length
  const pct = ((hits / total) * 100).toFixed(1)

  console.log(`\nSUMMARY: match rate = ${hits}/${total} hits (${pct}%)`)

  const ambiguous = results.filter((r) => (r.note || '').includes('ambiguous'))
  if (ambiguous.length > 0) {
    console.log(
      `NOTE: ${ambiguous.length} title(s) returned HTTP 200 with content that was neither a recognizable VideoGame JSON-LD hit nor the known soft-404 marker. They are counted as MISS above but flagged here for manual review: ${ambiguous
        .map((r) => r.title)
        .join(', ')}`
    )
  }

  const errorStatuses = results.filter(
    (r) =>
      r.status === 'ERROR' ||
      (typeof r.status === 'number' && r.status !== 200 && r.status !== 404)
  )
  if (errorStatuses.length > 0) {
    console.log(
      `NOTE: ${errorStatuses.length} title(s) returned a network error or unexpected status (not a clean 200/404): ${errorStatuses
        .map((r) => `${r.title} (${r.status})`)
        .join(', ')}`
    )
  }

  return results
}

main().catch((err) => {
  console.error('Spike run failed:', err)
  process.exitCode = 1
})
