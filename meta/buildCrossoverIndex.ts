/**
 * CI-only index builder — turns CodeWeavers' daily `.tie` XML dump into the
 * small offline artifact the macOS library badges/filter read:
 * `crossover-index.json.gz` plus a `collisions.json` drift report.
 *
 * Run with `pnpm build-crossover-index`.
 *
 * This is CI-only. The Electron app never parses XML — it only ever reads
 * the small JSON this script emits (Phase 19, CXIDX-01).
 *
 * By default reads the dump from `process.env.CROSSOVER_DUMP_FILE` (used by
 * CI/tests to point at a local file); otherwise fetches CodeWeavers' `.tie`
 * dump over HTTPS and gunzips it.
 *
 * Collisions (D-05) are logged and resolved but NEVER fail the build. A
 * ZERO-RECORD extraction (T-02 — the dump's real shape differs from what a
 * naive reading of the docs implies) is the ONE case that DOES fail the
 * build: an empty index is worse than a stale one.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

import { XMLParser } from 'fast-xml-parser'

const DUMP_URL =
  'https://ftp.codeweavers.com/pub/crossover/tie/crossover.tie.gz'
const DEFAULT_OUT_DIR = 'dist-index'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DumpRecord {
  appid: string
  name: string
  rating: number
  label: string
  cxversion: string
  num: number
  steamid?: string
}

export interface Collision {
  key: string
  winnerAppid: string
  loserAppids: string[]
}

export interface DedupResult {
  winners: DumpRecord[]
  collisions: Collision[]
}

interface RawNameVariant {
  '#text'?: string
  '@_lang'?: string
}

type RawName = string | RawNameVariant

interface RawMedal {
  '#text'?: string
  '@_rating'?: string
  '@_platform'?: string
  '@_version'?: string
  '@_num'?: string
  '@_last'?: string
}

interface RawAppProfile {
  description?: unknown
  category?: RawName[]
  steamid?: RawName
  medal?: RawMedal[]
}

interface RawApp {
  '@_appid': string
  '@_timestamp'?: string
  name?: RawName[]
  cxversion?: unknown
  appprofile?: RawAppProfile
}

export interface RawDump {
  c4p?: {
    applications?: {
      app?: RawApp[]
    }
  }
}

interface IndexPayload {
  version: 1
  generatedAt: string
  entries: Array<{
    name: string
    rating: number
    label: string
    steamid?: string
  }>
}

// ---------------------------------------------------------------------------
// Zero-record guard (T-02 / Pitfall 2) — distinct from the collision path,
// which NEVER fails the build (D-05).
// ---------------------------------------------------------------------------

export class ZeroRecordError extends Error {
  constructor() {
    super(
      'CrossOver dump extraction yielded zero records — the dump shape ' +
        'likely changed (see T-02 / Pitfall 2). Refusing to publish an ' +
        'empty index; an empty index is worse than a stale one.'
    )
    this.name = 'ZeroRecordError'
  }
}

export function assertNonEmpty(records: DumpRecord[]): void {
  if (records.length === 0) {
    throw new ZeroRecordError()
  }
}

// ---------------------------------------------------------------------------
// Parse (T-01 — raised entity limits via a ProcessEntitiesOptions object.
// Never disable entity processing outright — that would leave `&amp;`
// undecoded in names like "Command & Conquer".)
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: {
    enabled: true,
    maxTotalExpansions: 500_000, // default 1_000 — throws on this dump otherwise
    maxExpandedLength: 50_000_000, // default 100_000 — far too low for a 23.7 MB doc
    maxEntityCount: 1_000 // default 100
  },
  isArray: (name: string) => ['app', 'name', 'medal', 'category'].includes(name)
})

export function parseDump(xml: string): RawDump {
  return parser.parse(xml) as RawDump
}

// ---------------------------------------------------------------------------
// Extract (T-02 — real shape: c4p > applications > app[]; steamid/category/
// medal all live INSIDE <appprofile>, not as direct children of <app>.)
// ---------------------------------------------------------------------------

function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'object') {
    return (value as { '#text'?: string })['#text']
  }
  return String(value)
}

// The canonical name is the <name> with NO @_lang attribute (a lang="en"
// duplicate is also present in the real dump — it must NOT be preferred).
function canonicalName(names: RawName[] | undefined): string {
  const list = names ?? []
  const bare = list.find((n) => typeof n !== 'object' || !n['@_lang'])
  const en = list.find((n) => typeof n === 'object' && n['@_lang'] === 'en')
  return text(bare ?? en ?? list[0]) ?? ''
}

// Numeric dotted-version compare, e.g. "26.2.0" vs "26.10.0" (NOT lexical —
// lexical comparison would rank "26.10.0" below "26.2.0").
function compareVersion(a: string, b: string): number {
  const partsA = a.split('.').map((n) => parseInt(n, 10) || 0)
  const partsB = b.split('.').map((n) => parseInt(n, 10) || 0)
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function extractRecords(parsed: RawDump): DumpRecord[] {
  const apps = parsed?.c4p?.applications?.app ?? []
  const records: DumpRecord[] = []

  for (const app of apps) {
    const profile = app.appprofile
    if (!profile) continue

    // Pitfall 2 — category lives inside <appprofile>, not on <app>.
    const categories = (profile.category ?? [])
      .map(text)
      .filter((c): c is string => Boolean(c))
    if (!categories.some((c) => c.startsWith('Games'))) continue

    // THE MEDAL RULE (verified 6/6 against the live site): rating = the
    // medal on the highest cxversion for that platform.
    const macMedals = (profile.medal ?? []).filter(
      (m) => m['@_platform'] === 'Mac'
    )
    if (!macMedals.length) continue // -> ~2,866 games survive on the live dump

    const sorted = [...macMedals].sort((x, y) =>
      compareVersion(y['@_version'] ?? '0', x['@_version'] ?? '0')
    )
    const best = sorted[0]

    records.push({
      appid: String(app['@_appid']),
      name: canonicalName(app.name),
      rating: Number(best['@_rating']),
      label: text(best) ?? '',
      cxversion: String(best['@_version'] ?? ''),
      num: Number(best['@_num'] ?? 0),
      steamid: profile.steamid !== undefined ? text(profile.steamid) : undefined
    })
  }

  return records
}

// ---------------------------------------------------------------------------
// Dedup (D-04 + Pitfall 5 — a TOTAL, deterministic three-key order:
// highest cxversion, then most `num`, then LOWEST appid ascending. The third
// key is mandatory: many collisions tie exactly on both cxversion and num
// (e.g. Quake / EverQuest / Ghost Recon), which would otherwise make the
// build non-deterministic.)
// ---------------------------------------------------------------------------

function winner(a: DumpRecord, b: DumpRecord): number {
  return (
    compareVersion(b.cxversion, a.cxversion) || // 1. highest cxversion  (D-04)
    b.num - a.num || // 2. most ratings                (D-04)
    a.appid.localeCompare(b.appid) // 3. lowest appid — breaks exact ties (Pitfall 5)
  )
}

export function dedupRecords(records: DumpRecord[]): DedupResult {
  const groups = new Map<string, DumpRecord[]>()
  for (const record of records) {
    const key = record.steamid ?? `appid:${record.appid}`
    const group = groups.get(key)
    if (group) {
      group.push(record)
    } else {
      groups.set(key, [record])
    }
  }

  const winners: DumpRecord[] = []
  const collisions: Collision[] = []

  // Map iteration order is insertion order (stable for identical input), and
  // determinism WITHIN a group is guaranteed by winner()'s total three-key
  // order — so this is deterministic and never throws on ties (D-05).
  for (const [key, group] of groups) {
    const sortedGroup = [...group].sort(winner)
    winners.push(sortedGroup[0])
    if (sortedGroup.length > 1) {
      collisions.push({
        key,
        winnerAppid: sortedGroup[0].appid,
        loserAppids: sortedGroup.slice(1).map((r) => r.appid)
      })
    }
  }

  return { winners, collisions }
}

// ---------------------------------------------------------------------------
// Emit — guarded main() (runs only when invoked as the script, never on a
// test import of this module).
// ---------------------------------------------------------------------------

async function loadDumpXml(): Promise<string> {
  const localPath = process.env.CROSSOVER_DUMP_FILE
  if (localPath) {
    return readFileSync(localPath, 'utf-8')
  }

  const response = await fetch(DUMP_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch CrossOver dump: ${response.status} ${response.statusText}`
    )
  }
  const gzBuffer = Buffer.from(await response.arrayBuffer())
  return gunzipSync(gzBuffer).toString('utf-8')
}

export async function main(): Promise<void> {
  const outDir = process.env.CROSSOVER_INDEX_OUT_DIR ?? DEFAULT_OUT_DIR
  mkdirSync(outDir, { recursive: true })

  const xml = await loadDumpXml()
  const parsed = parseDump(xml)
  const records = extractRecords(parsed)

  // T-02 — the ONE case that must fail the build. D-05's "collisions never
  // fail" is about collisions, not a structurally broken parse.
  assertNonEmpty(records)

  const { winners, collisions } = dedupRecords(records)

  const payload: IndexPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    entries: winners
      .map((r) => ({
        name: r.name,
        rating: r.rating,
        label: r.label,
        steamid: r.steamid
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  const json = JSON.stringify(payload)
  writeFileSync(join(outDir, 'crossover-index.json.gz'), gzipSync(json))
  writeFileSync(
    join(outDir, 'collisions.json'),
    JSON.stringify(collisions, null, 2)
  )

  console.log(
    `Built CrossOver index: ${winners.length} records, ` +
      `${collisions.length} collisions ` +
      `(${records.length} total extracted, ` +
      `${records.length - winners.length} deduped away).`
  )
}

// Guard main() so importing this module (e.g. from the Task 1 regression
// test) never triggers a network fetch / filesystem write / process.exit.
//
// NOTE: this script is bundled by esbuild to
// node_modules/.cache/build-crossover-index.cjs and run as
// `node node_modules/.cache/build-crossover-index.cjs` (the meta/
// convention, package.json `build-crossover-index`), which DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite, so the usual `require.main === module` idiom would run this at
// import time under test too. `JEST_WORKER_ID` is set by Jest for every
// worker (including --runInBand), so this reliably distinguishes "imported
// under test" from "run as a CLI".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
