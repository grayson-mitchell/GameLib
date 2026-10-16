/**
 * Validator-first, offline, staged locale-fill tool for the Winetricks tab's
 * `winetricksBrowse.*` keys (phase-local tooling, not shipped). Plans 45-09
 * and 45-10 run this to land hand-translated values for the 48 non-English
 * locales once a human (or an external translation process, never this
 * script) has written a staging file.
 *
 * Invocation (see README.md):
 *
 *   JEST_WORKER_ID=1 node meta/runTs.cjs --bundle --platform=node \
 *     --target=node21 \
 *     .planning/phases/45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self/45-i18n-fill/applyFill.ts \
 *     --locales de,ja [--check] [--self-test]
 *
 * `JEST_WORKER_ID` MUST be set in the environment: this file imports
 * `meta/machineFillGamelib.ts`, and that module fires its own network-and-
 * filesystem-writing entry point at import time unless `JEST_WORKER_ID` is
 * present (its own guard, not this file's).
 *
 * This script makes NO network call of any kind -- it never imports a
 * network client and never invokes anything that would reach the network,
 * independent of the staged values it is given.
 *
 * Project policy (D-20 threat register T-45-11): this tool must never be
 * the thing that sends catalog content anywhere. It is a pure filesystem
 * validator-and-writer over locally staged values.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  countIsOptionalFor,
  englishSourceFor,
  mergeFill,
  requiredPluralKeys,
  validateTranslation,
  type MtManifest
} from '../../../../meta/machineFillGamelib'

// ---------------------------------------------------------------------------
// Catalog helpers (deliberately re-implemented here: flattenCatalog and
// setNested in meta/machineFillGamelib.ts are module-private, not exported)
// ---------------------------------------------------------------------------

type Catalog = { [key: string]: string | Catalog }

function isPlainObject(value: unknown): value is Catalog {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function flattenCatalog(obj: Catalog, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    const path = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(value)) {
      Object.assign(out, flattenCatalog(value, path))
    } else {
      out[path] = value === null || value === undefined ? '' : String(value)
    }
  }
  return out
}

function readJsonCatalog(path: string): Catalog {
  return JSON.parse(readFileSync(path, 'utf-8')) as Catalog
}

function readJsonIfExists<T>(path: string): T | null {
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

// ---------------------------------------------------------------------------
// Round-trip safety: assert a value serialized with `serialize` parses back
// and re-serializes byte-identically, before it is ever written to disk.
// ---------------------------------------------------------------------------

function roundTrips(value: unknown, serialize: (v: unknown) => string): boolean {
  const once = serialize(value)
  const parsed = JSON.parse(once)
  const twice = serialize(parsed)
  return once === twice
}

const serializeCatalog = (v: unknown) => JSON.stringify(v, null, 4) + '\n'
const serializeManifest = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

// ---------------------------------------------------------------------------
// Required-key computation for one locale: every English `winetricksBrowse`
// leaf that is absent or empty in the locale's own catalog, with each
// plural base expanded through requiredPluralKeys (union of English's own
// suffixes and the locale's CLDR categories).
// ---------------------------------------------------------------------------

const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/

function pluralBaseOf(keyPath: string): string | null {
  const match = keyPath.match(PLURAL_SUFFIX_RE)
  return match ? keyPath.slice(0, -match[0].length) : null
}

const SCOPE_PREFIX = 'winetricksBrowse.'

function computeRequiredKeys(
  englishFlat: Record<string, string>,
  targetFlat: Record<string, string>,
  locale: string
): string[] {
  const required = new Set<string>()
  const handledBases = new Set<string>()

  // Scoped to winetricksBrowse only (per the plan: "every English leaf
  // under winetricksBrowse") -- englishFlat/targetFlat are flattened from
  // the WHOLE gamelib.json catalog, so every other namespace's keys (e.g.
  // box.*, gamepage.*) must be filtered out here rather than ever being
  // treated as required.
  for (const keyPath of Object.keys(englishFlat)) {
    if (!keyPath.startsWith(SCOPE_PREFIX)) continue
    const base = pluralBaseOf(keyPath)
    if (base !== null && englishFlat[`${base}_other`] !== undefined) {
      if (handledBases.has(base)) continue
      handledBases.add(base)
      for (const plKey of requiredPluralKeys(base, englishFlat, locale)) {
        const existing = targetFlat[plKey]
        if (existing === undefined || existing === '') required.add(plKey)
      }
      continue
    }
    const existing = targetFlat[keyPath]
    if (existing === undefined || existing === '') required.add(keyPath)
  }

  return Array.from(required).sort()
}

// ---------------------------------------------------------------------------
// Staging file: a flat `{ "winetricksBrowse.family.vcrun": "…" }` map at
// 45-i18n-fill/<locale>.json. Missing file is treated as "nothing staged"
// (empty map) -- NOT an error on its own; it surfaces as every required key
// being reported missing, which refuses the run exactly like any other
// incomplete staging file.
//
// Resolved relative to `process.cwd()`, not `__dirname`: this file is
// bundled by `meta/runTs.cjs` into a private `os.tmpdir()` outfile before
// it runs, and esbuild's CommonJS output points `__dirname` at that
// outfile's location, not at this source file's real on-disk directory.
// Every invocation documented in README.md runs from the repo root, which
// is exactly what every other path in this file (the en catalog, the
// glossary, each locale's own catalog) already assumes.
// ---------------------------------------------------------------------------

const STAGING_DIR = join(
  '.planning',
  'phases',
  '45-native-in-app-winetricks-ui-redesigned-from-scratch-one-self',
  '45-i18n-fill'
)

function readStaged(locale: string): Record<string, string> {
  const path = join(STAGING_DIR, `${locale}.json`)
  const staged = readJsonIfExists<Record<string, string>>(path)
  return staged ?? {}
}

// ---------------------------------------------------------------------------
// Per-locale validation. Returns every problem found; an empty array means
// this locale is clean. Never writes anything -- purely a check.
// ---------------------------------------------------------------------------

function validateLocale(
  locale: string,
  englishFlat: Record<string, string>,
  targetFlat: Record<string, string>
): { problems: string[]; staged: Record<string, string>; required: string[] } {
  const problems: string[] = []
  const staged = readStaged(locale)
  const required = computeRequiredKeys(englishFlat, targetFlat, locale)
  const requiredSet = new Set(required)

  for (const key of required) {
    const value = staged[key]
    if (value === undefined || value === '') {
      problems.push(`${locale}: missing required key '${key}'`)
    }
  }

  for (const key of Object.keys(staged)) {
    if (!requiredSet.has(key)) {
      problems.push(`${locale}: staged key '${key}' is not required (not missing/empty in target, or not an English leaf)`)
    }
  }

  for (const key of required) {
    const value = staged[key]
    if (value === undefined || value === '') continue // already reported above

    const source = englishSourceFor(key, englishFlat)
    if (source === undefined) {
      problems.push(`${locale}: '${key}' has no English source to validate against`)
      continue
    }

    const countOptional = countIsOptionalFor(key, locale, englishFlat)
    for (const problem of validateTranslation(source, value, readGlossaryTerms(), {
      countOptional
    })) {
      problems.push(`${locale}: '${key}' -- ${problem}`)
    }
  }

  return { problems, staged, required }
}

let glossaryCache: string[] | null = null
function readGlossaryTerms(): string[] {
  if (glossaryCache) return glossaryCache
  const raw = JSON.parse(
    readFileSync(join('meta', 'i18nGlossary.json'), 'utf-8')
  ) as { terms: string[] }
  glossaryCache = raw.terms
  return glossaryCache
}

// ---------------------------------------------------------------------------
// Self-test: in-memory sabotage, no disk writes. Proves the validator this
// tool calls actually rejects a dropped placeholder.
// ---------------------------------------------------------------------------

function runSelfTest(): number {
  const englishPath = join('public', 'locales', 'en', 'gamelib.json')
  const englishFlat = flattenCatalog(readJsonCatalog(englishPath))
  const key = 'winetricksBrowse.selectedCount_other'
  const source = englishFlat[key]
  if (source === undefined) {
    console.error(`self-test: '${key}' is missing from en/gamelib.json`)
    return 1
  }

  // Sabotage: drop the {{count}} placeholder from the source value.
  const sabotaged = source.replace(/\{\{count\}\}/g, '')
  const countOptional = countIsOptionalFor(key, 'de', englishFlat)
  const problems = validateTranslation(source, sabotaged, readGlossaryTerms(), {
    countOptional
  })

  if (problems.length === 0) {
    console.error(
      'self-test FAILED: validator accepted a translation with {{count}} dropped'
    )
    return 1
  }

  console.log(`self-test: rejected sabotaged '${key}' -- ${problems.join('; ')}`)
  return 0
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  locales: string[]
  check: boolean
  selfTest: boolean
} {
  let locales: string[] = []
  let check = false
  let selfTest = false

  for (const arg of argv) {
    if (arg === '--check') {
      check = true
    } else if (arg === '--self-test') {
      selfTest = true
    } else if (arg.startsWith('--locales=')) {
      locales = arg
        .slice('--locales='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else if (arg === '--locales') {
      // handled by the next-token form below
    }
  }

  // Support `--locales de,ja` (space-separated value) in addition to
  // `--locales=de,ja`.
  const localesIdx = argv.indexOf('--locales')
  if (localesIdx !== -1 && argv[localesIdx + 1]) {
    locales = argv[localesIdx + 1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  return { locales, check, selfTest }
}

function main(): void {
  const { locales, check, selfTest } = parseArgs(process.argv.slice(2))

  if (selfTest) {
    process.exit(runSelfTest())
    return
  }

  if (locales.length === 0) {
    console.error('applyFill: no --locales given (and --self-test not set)')
    process.exit(1)
    return
  }

  const englishPath = join('public', 'locales', 'en', 'gamelib.json')
  const englishFlat = flattenCatalog(readJsonCatalog(englishPath))

  type PerLocale = {
    locale: string
    targetPath: string
    manifestPath: string
    targetCatalog: Catalog
    staged: Record<string, string>
    required: string[]
    merged: object
    manifest: MtManifest
  }

  const allProblems: string[] = []
  const perLocale: PerLocale[] = []

  for (const locale of locales) {
    const targetPath = join('public', 'locales', locale, 'gamelib.json')
    const manifestPath = join('public', 'locales', locale, 'gamelib.mt.json')

    if (!existsSync(targetPath)) {
      allProblems.push(`${locale}: no catalog at ${targetPath}`)
      continue
    }

    const targetCatalog = readJsonCatalog(targetPath)
    const targetFlat = flattenCatalog(targetCatalog)
    const { problems, staged, required } = validateLocale(
      locale,
      englishFlat,
      targetFlat
    )
    allProblems.push(...problems)

    // Only the keys this locale actually needs are ever merged in --
    // mergeFill itself also refuses to overwrite a non-empty existing
    // value, but filtering here keeps a stray extra staged key (already
    // reported as a problem above) from ever reaching the merge step.
    const filled: Record<string, string> = {}
    for (const key of required) {
      if (staged[key] !== undefined && staged[key] !== '') {
        filled[key] = staged[key]
      }
    }

    const priorManifest = readJsonIfExists<MtManifest>(manifestPath)
    const { merged, manifest } = mergeFill(targetCatalog, filled, priorManifest)

    if (!roundTrips(merged, serializeCatalog)) {
      allProblems.push(`${locale}: merged catalog does not round-trip byte-identically`)
    }
    if (!roundTrips(manifest, serializeManifest)) {
      allProblems.push(`${locale}: manifest does not round-trip byte-identically`)
    }

    perLocale.push({
      locale,
      targetPath,
      manifestPath,
      targetCatalog,
      staged,
      required,
      merged,
      manifest
    })
  }

  if (allProblems.length > 0) {
    console.error('applyFill: refusing -- nothing written for any requested locale')
    for (const problem of allProblems) {
      console.error(`  ${problem}`)
    }
    process.exit(1)
    return
  }

  for (const entry of perLocale) {
    console.log(
      `${entry.locale}: ${entry.required.length} required key(s), all staged and valid` +
        (check ? ' (--check: not written)' : '')
    )
  }

  if (check) {
    return
  }

  for (const entry of perLocale) {
    writeFileSync(entry.targetPath, serializeCatalog(entry.merged))
    writeFileSync(entry.manifestPath, serializeManifest(entry.manifest))
    console.log(`${entry.locale}: wrote ${entry.targetPath} and ${entry.manifestPath}`)
  }
}

main()
