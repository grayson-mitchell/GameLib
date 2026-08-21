/**
 * D-01/D-02/D-03: the measurement harness that decides — empirically — whether
 * non-Steam library titles can be matched onto the CrossOver `.tie` dump's
 * canonical names.
 *
 * Run with: `pnpm exec esbuild --bundle --platform=node --target=node21
 *            meta/measureCrossoverMatching.ts | node`
 * (No package.json script entry in this plan — package.json is owned by the
 * sibling builder plan 19-01 in the same wave.)
 *
 * This script is disjoint from meta/buildCrossoverIndex.ts (19-01): it fetches
 * and parses the CodeWeavers dump itself rather than depending on that plan.
 *
 * Scores THREE samples with SEPARATE denominators, never pooled:
 *   1. The Steam-library ∩ dump-by-AppID ground-truth set — the ONLY sample
 *      the D-02 gate is evaluated against (D-02/D-03 amendment).
 *   2. The real non-Steam library (qualitative table only, no percentage —
 *      the sample is too small, n≈5, to express a meaningful rate).
 *   3. A synthetic adversarial set (pass/fail per failure mode, not a rate).
 * Plus a whole-dump self-collision test (a large-denominator wrong-hit proxy
 * that needs no library at all).
 *
 * Privacy (RESEARCH.md line 824): the committed report carries aggregate
 * counts + the synthetic cases only — never a full dump of the user's owned
 * titles.
 */

import { gunzipSync } from 'zlib'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { XMLParser } from 'fast-xml-parser'
import {
  normalizeExactLowercase,
  normalizePunctuationStripped,
  normalizePunctuationAndEditionStripped
} from '../src/backend/crossover_index/normalize'

// ---------------------------------------------------------------------------
// D-02: the pre-committed gate bounds. Fixed HERE, before any scoring runs,
// and printed verbatim into the report header — so the verdict cannot be
// rationalized after the fact.
// ---------------------------------------------------------------------------
const WRONG_HIT_MAX = 0.02
const HIT_RATE_MIN = 0.3

const DUMP_URL =
  'https://ftp.codeweavers.com/pub/crossover/tie/crossover.tie.gz'
/** T-19-02-04: bounds the fetch so a runaway/hostile payload cannot exhaust
 * memory. The real payload is ~3 MB gzipped; this ceiling is generous. */
const MAX_DUMP_BYTES = 20 * 1024 * 1024

const PRODUCT_NAME = 'GameLib' // electron-builder.yml productName

// ---------------------------------------------------------------------------
// Local library caches — the store_cache on-disk convention
// (src/backend/cache.ts:22-26), computed rather than hardcoded so this runs
// correctly on any contributor's machine/OS.
// ---------------------------------------------------------------------------

function getUserDataDir(): string {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', PRODUCT_NAME)
  }
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming')
    return join(appData, PRODUCT_NAME)
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config')
  return join(configHome, PRODUCT_NAME)
}

function getStoreCacheDir(): string {
  return join(getUserDataDir(), 'store_cache')
}

function readStoreCacheFile(filename: string): Record<string, unknown> | null {
  const path = join(getStoreCacheDir(), filename)
  if (!existsSync(path)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>
  } catch (error) {
    console.log(`Could not parse ${filename}:`, error)
    return null
  }
}

interface LibraryEntry {
  app_name: string
  title: string
}

function readLibraryEntries(
  filename: string,
  collectionKey: string
): LibraryEntry[] {
  const data = readStoreCacheFile(filename)
  const collection = data?.[collectionKey]
  if (!collection || typeof collection !== 'object') {
    return []
  }
  return Object.values(collection).filter(
    (entry): entry is LibraryEntry =>
      !!entry &&
      typeof entry === 'object' &&
      typeof (entry as LibraryEntry).app_name === 'string' &&
      typeof (entry as LibraryEntry).title === 'string'
  )
}

/**
 * A4 fallback heuristic (RESEARCH.md Pitfall 8/Assumptions Log A4): a title
 * is treated as DLC/add-on/non-game if it is a longer prefix-extension of
 * another owned title in the same sample (e.g. a "<Base Game> Art Book" or
 * "<Base Game> Soundtrack" entry extends its base game). Approximate by
 * design — this sample is qualitative-only (n≈5), never gate-scored, so
 * precision here does not affect the D-02 verdict. Only AGGREGATE
 * classification counts are printed in the report — per-title owned names are
 * never emitted (see the Sample 2 privacy redaction).
 */
function classifyBaseGames(
  entries: LibraryEntry[]
): { title: string; isBaseGame: boolean }[] {
  const titles = entries.map((e) => e.title)
  return entries.map((e) => ({
    title: e.title,
    isBaseGame: !titles.some(
      (other) => other !== e.title && e.title.startsWith(other)
    )
  }))
}

// ---------------------------------------------------------------------------
// The dump fetch + parse (self-contained — this plan does not depend on the
// sibling builder plan 19-01).
// ---------------------------------------------------------------------------

async function fetchDump(): Promise<{
  buffer: Buffer
  lastModified: string | null
}> {
  const response = await fetch(DUMP_URL, {
    headers: { 'User-Agent': 'GameLib-CrossOverMeasurement/1.0' }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch CrossOver dump: HTTP ${response.status}`)
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0')
  if (contentLength > MAX_DUMP_BYTES) {
    throw new Error(
      `Dump Content-Length ${contentLength} exceeds the ${MAX_DUMP_BYTES}-byte ceiling`
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_DUMP_BYTES) {
    throw new Error(
      `Dump body ${arrayBuffer.byteLength} bytes exceeds the ${MAX_DUMP_BYTES}-byte ceiling`
    )
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    lastModified: response.headers.get('last-modified')
  }
}

interface DumpRecord {
  /** The dump's OWN <app appid="..."> identity (com.codeweavers.c4.N) — NOT
   * a Steam AppID. Used only for the D-04 tiebreak and for detecting
   * "same dump entry" hits. */
  ccxAppId: string
  name: string
  rating: number
  cxversion: string
  num: number
  steamid?: string
}

function text(v: unknown): string | number | boolean | null | undefined {
  const value =
    v && typeof v === 'object' ? (v as Record<string, unknown>)['#text'] : v
  return value as string | number | boolean | null | undefined
}

function canonicalName(app: Record<string, unknown>): string {
  const names = (app.name as unknown[]) ?? []
  const bare = names.find(
    (n) => typeof n !== 'object' || !(n as Record<string, unknown>)['@_lang']
  )
  const en = names.find(
    (n) =>
      typeof n === 'object' && (n as Record<string, unknown>)['@_lang'] === 'en'
  )
  return String(text(bare ?? en ?? names[0]) ?? '')
}

/** Numeric dotted-version compare (e.g. "26.2.0" vs "25.0.1"). */
function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) {
      return diff
    }
  }
  return 0
}

/**
 * Parses the dump into Mac-medal records. Mirrors meta/buildCrossoverIndex.ts's
 * (19-01) own parse — Pitfall 1 (raised entity limits), Pitfall 2 (the real
 * `c4p > applications > app[]` shape; `category`/`medal`/`steamid` live
 * INSIDE `<appprofile>`), and THE MEDAL RULE (rating = medal on the highest
 * cxversion for that platform).
 */
function parseMacMedalRecords(xml: string): DumpRecord[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    processEntities: {
      enabled: true,
      maxTotalExpansions: 500_000,
      maxExpandedLength: 50_000_000,
      maxEntityCount: 1_000
    },
    isArray: (name) => ['app', 'name', 'medal', 'category'].includes(name)
  })

  const parsed = parser.parse(xml) as {
    c4p?: { applications?: { app?: Record<string, unknown>[] } }
  }
  const apps = parsed.c4p?.applications?.app ?? []
  if (!apps.length) {
    throw new Error(
      'Parsed 0 <app> records — the dump shape has changed (Pitfall 2). Aborting.'
    )
  }

  const records: DumpRecord[] = []

  for (const app of apps) {
    const profile = app.appprofile as Record<string, unknown> | undefined
    if (!profile) {
      continue
    }

    const categories = (
      ((profile.category as unknown[]) ?? [])
        .map(text)
        .filter(Boolean) as string[]
    ).map(String)
    if (!categories.some((c) => c.startsWith('Games'))) {
      continue
    }

    const macMedals = ((profile.medal as unknown[]) ?? []).filter(
      (m) =>
        m &&
        typeof m === 'object' &&
        (m as Record<string, unknown>)['@_platform'] === 'Mac'
    ) as Record<string, unknown>[]
    if (!macMedals.length) {
      continue
    }

    macMedals.sort((x, y) =>
      compareVersion(String(y['@_version']), String(x['@_version']))
    )
    const best = macMedals[0]

    records.push({
      ccxAppId: String(app['@_appid']),
      name: canonicalName(app),
      rating: Number(best['@_rating']),
      cxversion: String(best['@_version']),
      num: Number(best['@_num'] ?? 0),
      steamid:
        profile.steamid !== undefined
          ? String(text(profile.steamid))
          : undefined
    })
  }

  return records
}

// ---------------------------------------------------------------------------
// D-04 dedup — highest cxversion, then most num, then lowest ccxAppId
// (a total order, so index construction here is deterministic).
// ---------------------------------------------------------------------------

function pickWinner(records: DumpRecord[]): DumpRecord {
  return records
    .slice()
    .sort(
      (a, b) =>
        compareVersion(b.cxversion, a.cxversion) ||
        b.num - a.num ||
        a.ccxAppId.localeCompare(b.ccxAppId)
    )[0]
}

function buildSteamIdIndex(records: DumpRecord[]): Map<string, DumpRecord> {
  const groups = new Map<string, DumpRecord[]>()
  for (const r of records) {
    if (!r.steamid) {
      continue
    }
    const list = groups.get(r.steamid) ?? []
    list.push(r)
    groups.set(r.steamid, list)
  }
  const result = new Map<string, DumpRecord>()
  for (const [steamid, list] of groups) {
    result.set(steamid, pickWinner(list))
  }
  return result
}

function buildNameKeyIndex(
  records: DumpRecord[],
  normalizeFn: (title: string) => string
): Map<string, DumpRecord> {
  const groups = new Map<string, DumpRecord[]>()
  for (const r of records) {
    const key = normalizeFn(r.name)
    if (!key) {
      continue
    }
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  const result = new Map<string, DumpRecord>()
  for (const [key, list] of groups) {
    result.set(key, pickWinner(list))
  }
  return result
}

// ---------------------------------------------------------------------------
// Sample 1: the ground-truth set (Steam library ∩ dump-by-AppID).
// ---------------------------------------------------------------------------

interface GroundTruthPair {
  title: string
  correct: DumpRecord
}

interface ScoreResult {
  hit: number
  wrong: number
  miss: number
  total: number
}

/**
 * HIT: the name lookup found the SAME dump entry the AppID join proves
 * correct, OR a different entry that agrees on rating (no visible harm to
 * the user-facing badge).
 * WRONG: the name lookup found a DIFFERENT entry that DISAGREES on rating —
 * the harmful case (T-19-02-02): the title would show the wrong game's
 * medal.
 * MISS: the name lookup found nothing.
 * hit + wrong + miss === total, always (never pooled with the other samples).
 */
function scoreGroundTruth(
  pairs: GroundTruthPair[],
  normalizeFn: (title: string) => string,
  nameIndex: Map<string, DumpRecord>
): ScoreResult {
  let hit = 0
  let wrong = 0
  let miss = 0

  for (const { title, correct } of pairs) {
    const matched = nameIndex.get(normalizeFn(title))
    if (!matched) {
      miss++
    } else if (
      matched.ccxAppId === correct.ccxAppId ||
      matched.rating === correct.rating
    ) {
      hit++
    } else {
      wrong++
    }
  }

  return { hit, wrong, miss, total: pairs.length }
}

function wrongHitRate(r: ScoreResult): number {
  return r.total === 0 ? 0 : r.wrong / r.total
}

function hitRate(r: ScoreResult): number {
  return r.total === 0 ? 0 : r.hit / r.total
}

function passesGate(r: ScoreResult): boolean {
  return wrongHitRate(r) < WRONG_HIT_MAX && hitRate(r) > HIT_RATE_MIN
}

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`
}

// ---------------------------------------------------------------------------
// Whole-dump self-collision test — a large-denominator wrong-hit proxy
// needing no library at all.
// ---------------------------------------------------------------------------

interface CollisionResult {
  distinctKeys: number
  collidingKeys: number
  disagreeingKeys: number
  recordsAtRisk: number
}

function selfCollisionTest(
  records: DumpRecord[],
  normalizeFn: (title: string) => string
): CollisionResult {
  const groups = new Map<string, DumpRecord[]>()
  for (const r of records) {
    const key = normalizeFn(r.name)
    if (!key) {
      continue
    }
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }

  let collidingKeys = 0
  let disagreeingKeys = 0
  let recordsAtRisk = 0

  for (const list of groups.values()) {
    if (list.length > 1) {
      collidingKeys++
      const ratings = new Set(list.map((r) => r.rating))
      if (ratings.size > 1) {
        disagreeingKeys++
        recordsAtRisk += list.length
      }
    }
  }

  return {
    distinctKeys: groups.size,
    collidingKeys,
    disagreeingKeys,
    recordsAtRisk
  }
}

// ---------------------------------------------------------------------------
// Synthetic adversarial set (D-03) — pass/fail per failure mode, never a
// rate. Each case reports whether titleA and titleB normalize IDENTICALLY
// under each candidate, so the report shows the trade-off directly rather
// than asserting a single universal expectation.
// ---------------------------------------------------------------------------

interface SyntheticCase {
  label: string
  titleA: string
  titleB: string
}

const SYNTHETIC_CASES: SyntheticCase[] = [
  {
    label: 'Apostrophe variant (U+0027 vs U+2019)',
    titleA: "Alekhine's Gun",
    titleB: 'Alekhine’s Gun'
  },
  {
    label: 'Roman vs Arabic numerals',
    titleA: 'Quake II',
    titleB: 'Quake 2'
  },
  {
    label: 'Edition-suffix pair',
    titleA: "Baldur's Gate 3 (Digital Deluxe Edition)",
    titleB: "Baldur's Gate 3"
  },
  {
    label: 'Chained edition-suffix ("... GOTY Edition")',
    titleA: 'Some Game GOTY Edition',
    titleB: 'Some Game'
  },
  {
    label:
      "Duplicate-<app>-record base title (dedup is the builder's job, D-04)",
    titleA: 'EverQuest',
    titleB: 'EverQuest'
  }
]

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

interface Candidate {
  label: string
  fn: (title: string) => string
}

const CANDIDATES: Candidate[] = [
  { label: 'A — exact lowercase', fn: normalizeExactLowercase },
  { label: 'B — punctuation-stripped', fn: normalizePunctuationStripped },
  {
    label: 'C — punctuation + edition-suffix stripped',
    fn: normalizePunctuationAndEditionStripped
  }
]

async function main() {
  console.log('Fetching CrossOver .tie dump...')
  const { buffer, lastModified } = await fetchDump()
  console.log(`Downloaded ${buffer.byteLength} bytes (gzipped).`)

  const xml = gunzipSync(buffer).toString('utf-8')
  console.log(`Decompressed to ${xml.length} chars. Parsing...`)

  const macMedalRecords = parseMacMedalRecords(xml)
  console.log(`Parsed ${macMedalRecords.length} Mac-medal game records.`)

  // Sample 1: ground truth.
  const steamLibrary = readLibraryEntries('steam_library.json', 'games')
  const steamIdIndex = buildSteamIdIndex(macMedalRecords)
  const groundTruthPairs: GroundTruthPair[] = steamLibrary
    .filter((g) => steamIdIndex.has(g.app_name))
    .map((g) => ({ title: g.title, correct: steamIdIndex.get(g.app_name)! }))
  console.log(
    `Ground-truth set: ${groundTruthPairs.length} Steam titles present in the dump by AppID.`
  )

  const candidateResults = CANDIDATES.map((candidate) => {
    const nameIndex = buildNameKeyIndex(macMedalRecords, candidate.fn)
    const groundTruth = scoreGroundTruth(
      groundTruthPairs,
      candidate.fn,
      nameIndex
    )
    const collisions = selfCollisionTest(macMedalRecords, candidate.fn)
    return { ...candidate, nameIndex, groundTruth, collisions }
  })

  const passingCandidates = candidateResults.filter((c) =>
    passesGate(c.groundTruth)
  )
  const winner =
    passingCandidates.length > 0
      ? passingCandidates.reduce((best, c) =>
          hitRate(c.groundTruth) > hitRate(best.groundTruth) ? c : best
        )
      : null
  const verdict = winner !== null ? 'PASS' : 'FAIL'

  // Sample 2: real non-Steam library, qualitative only.
  const legendaryLibrary = readLibraryEntries(
    'legendary_library.json',
    'library'
  )
  const gogLibrary = readLibraryEntries('gog_library.json', 'games')
  const nileLibrary = readLibraryEntries('nile_library.json', 'games')
  const nonSteamEntries = [...legendaryLibrary, ...gogLibrary, ...nileLibrary]
  const classified = classifyBaseGames(nonSteamEntries)
  const winnerFn = winner?.fn ?? normalizePunctuationAndEditionStripped
  const winnerIndex =
    winner?.nameIndex ?? buildNameKeyIndex(macMedalRecords, winnerFn)
  const nonSteamRows = classified.map(({ title, isBaseGame }) => {
    if (!isBaseGame) {
      return { title, classification: 'DLC/addon (excluded)', outcome: '—' }
    }
    const matched = winnerIndex.get(winnerFn(title))
    return {
      title,
      classification: 'base game',
      outcome: matched ? `HIT (rating ${matched.rating})` : 'MISS'
    }
  })

  // Sample 3: synthetic adversarial set.
  const syntheticRows = SYNTHETIC_CASES.map((c) => ({
    label: c.label,
    results: CANDIDATES.map(
      (candidate) => candidate.fn(c.titleA) === candidate.fn(c.titleB)
    )
  }))

  // -------------------------------------------------------------------------
  // Report
  // -------------------------------------------------------------------------
  const generatedAt = new Date().toISOString()
  const reportDate = generatedAt.slice(0, 10)

  const lines: string[] = []
  lines.push('# CrossOver Name-Matching Measurement Report')
  lines.push('')
  lines.push(`Generated: ${generatedAt}`)
  lines.push(`Dump Last-Modified: ${lastModified ?? 'unknown'}`)
  lines.push('')
  lines.push('## D-02 pre-committed gate (fixed BEFORE this run)')
  lines.push('')
  lines.push(`- \`WRONG_HIT_MAX = ${WRONG_HIT_MAX}\` (wrong hits must be < 2%)`)
  lines.push(`- \`HIT_RATE_MIN = ${HIT_RATE_MIN}\` (hit rate must be > 30%)`)
  lines.push(
    '- Evaluated ONLY on Sample 1 (the ground-truth set) — never on Sample 2 or 3 (D-02/D-03 amendment).'
  )
  lines.push('')
  lines.push(
    `## Sample 1: Steam library ∩ dump-by-AppID ground-truth set (n=${groundTruthPairs.length})`
  )
  lines.push('')
  lines.push(
    "> Read this honestly: Steam titles are the EASIEST case for this matcher — CodeWeavers' " +
      'canonical names were sourced with a Steam AppID attached for roughly a third of the dump, ' +
      "so they track Steam's own titles closely. The true non-Steam (Epic/GOG/Amazon) hit rate is " +
      'expected to be LOWER than this number (19-RESEARCH.md Pitfall 9). This bias is stated ' +
      'explicitly so the ground-truth number is read honestly, not as a universal hit rate.'
  )
  lines.push('')
  lines.push(
    '| Candidate | HIT | WRONG | MISS | hitRate | wrongHitRate | Gate |'
  )
  lines.push('|---|---|---|---|---|---|---|')
  for (const c of candidateResults) {
    lines.push(
      `| ${c.label} | ${c.groundTruth.hit} | ${c.groundTruth.wrong} | ${c.groundTruth.miss} | ` +
        `${pct(hitRate(c.groundTruth))} | ${pct(wrongHitRate(c.groundTruth))} | ` +
        `${passesGate(c.groundTruth) ? 'PASS' : 'FAIL'} |`
    )
  }
  lines.push('')
  lines.push(
    `**VERDICT: ${verdict}** — ` +
      (winner
        ? `winner: Candidate ${winner.label}, wrongHitRate=${pct(wrongHitRate(winner.groundTruth))}, hitRate=${pct(hitRate(winner.groundTruth))}. NAME_MATCHING_SHIPS = true.`
        : 'no candidate passed the gate. NAME_MATCHING_SHIPS = false (Steam-AppID-only badges ship in v1).')
  )
  lines.push('')
  lines.push(
    `## Sample 2: real non-Steam library (qualitative only, n=${nonSteamRows.length}, NO percentage computed — sample too small to be statistically meaningful)`
  )
  lines.push('')
  lines.push(
    'Aggregate outcomes only — per-title names are intentionally omitted because this ' +
      'report ships on a public fork (D-02/D-03 must_have: aggregate counts + synthetic ' +
      "cases only, never a dump of the user's owned titles)."
  )
  lines.push('')
  // Derive counts from nonSteamRows WITHOUT ever writing a per-title name to the report.
  const sample2BaseRows = nonSteamRows.filter(
    (row) => row.classification === 'base game'
  )
  const sample2BaseHit = sample2BaseRows.filter((row) =>
    row.outcome.startsWith('HIT')
  ).length
  const sample2BaseMiss = sample2BaseRows.length - sample2BaseHit
  const sample2DlcCount = nonSteamRows.length - sample2BaseRows.length
  lines.push('| Classification | Count | Outcomes |')
  lines.push('|---|---|---|')
  lines.push(
    `| Base games (matched against dump) | ${sample2BaseRows.length} | ${sample2BaseHit} HIT, ${sample2BaseMiss} MISS |`
  )
  lines.push(
    `| DLC/add-ons (excluded before matching) | ${sample2DlcCount} | — |`
  )
  lines.push(`| **Total** | **${nonSteamRows.length}** | — |`)
  lines.push('')
  lines.push(
    '## Sample 3: synthetic adversarial set (pass/fail per failure mode, never pooled into a rate)'
  )
  lines.push('')
  lines.push(`| Case | ${CANDIDATES.map((c) => c.label).join(' | ')} |`)
  lines.push(`|---|${CANDIDATES.map(() => '---').join('|')}|`)
  for (const row of syntheticRows) {
    lines.push(
      `| ${row.label} | ${row.results.map((r) => (r ? 'unify' : 'diverge')).join(' | ')} |`
    )
  }
  lines.push('')
  lines.push(
    `## Whole-dump self-collision test (n=${macMedalRecords.length} Mac-medal records — a large-denominator wrong-hit proxy requiring no library)`
  )
  lines.push('')
  lines.push(
    '| Candidate | Distinct keys | Colliding keys | Disagreeing keys (harmful) | Records at risk |'
  )
  lines.push('|---|---|---|---|---|')
  for (const c of candidateResults) {
    lines.push(
      `| ${c.label} | ${c.collisions.distinctKeys} | ${c.collisions.collidingKeys} | ` +
        `${c.collisions.disagreeingKeys} | ${c.collisions.recordsAtRisk} (${pct(c.collisions.recordsAtRisk / macMedalRecords.length)}) |`
    )
  }
  lines.push('')
  lines.push('## Privacy note')
  lines.push('')
  lines.push(
    'This report carries aggregate counts and the synthetic test cases only. It does NOT ' +
      "include the full list of the user's owned titles (RESEARCH.md line 824) — Sample 2's " +
      'table is limited to the ~5 real non-Steam base games after DLC/add-on filtering, not the ' +
      'whole library.'
  )
  lines.push('')

  const reportPath = join(
    '.planning',
    'phases',
    '19-crossover-compatibility-index-macos',
    `measure-crossover-match-${reportDate}.md`
  )
  writeFileSync(reportPath, lines.join('\n'))
  console.log(`\nReport written to ${reportPath}`)
  console.log(`\nVERDICT: ${verdict}`)
}

void main()
