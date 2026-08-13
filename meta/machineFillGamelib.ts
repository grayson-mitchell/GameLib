/**
 * Glossary-aware machine-fill script for the fork-owned `gamelib` i18n
 * namespace. Run with `pnpm machine-fill-gamelib`.
 *
 * THE D-09 CONTRACT (the load-bearing invariant of this whole file): diff
 * each locale's `public/locales/<locale>/gamelib.json` against
 * `public/locales/en/gamelib.json`, translate ONLY the keys missing or empty
 * in the target, and NEVER overwrite a key that already has a non-empty
 * value. This is what lets a human correction survive every future re-run.
 * `{{interpolation}}` placeholders and `_one`/`_other` plural siblings must
 * survive a fill unchanged. English (`en/gamelib.json`) is the only source
 * of truth -- the three upstream Heroic catalogs (`translation.json`,
 * `gamepage.json`, `login.json`) are read-only translation memory (D-11);
 * this script must never write to them (D-05's `assertNoUpstreamChurn` is
 * the mechanical backstop, but this script must not attempt it in the
 * first place).
 *
 * D-08: this script is BUILT and PROVEN here on one or two locales -- it
 * deliberately does NOT bulk-run across all 48 non-English locales in this
 * phase. A bug in a bulk run ships to 48 files at once; bulk-filling is a
 * separate, explicitly opted-into, revertible commit (see the bulk-run
 * refusal below).
 *
 * Every function in the "pure logic" section below is deliberately free of
 * filesystem, network and clock access -- `now: Date` is threaded through
 * as a parameter wherever a timestamp is needed, and `TranslateFn` is an
 * injected dependency. This is what makes the D-09/D-10 contract
 * hermetically testable (`meta/__tests__/machineFillGamelib.test.ts`) with
 * a fake translator instead of a real network call.
 */

// ---------------------------------------------------------------------------
// Shared types (per this plan's <interfaces> block)
// ---------------------------------------------------------------------------

export type TranslateFn = (
  batch: Array<{
    keyPath: string // dotted key path, passed as context per D-09
    source: string // English value (or the inline t() default when the value is empty)
    locale: string
    memory: Array<{ source: string; target: string }> // upstream translation memory, D-11
  }>
) => Promise<Array<{ keyPath: string; target: string }>>

export interface FillPlan {
  locale: string
  missing: string[] // dotted key paths this run may fill
  preserved: string[] // key paths already non-empty -- never touched (D-09)
}

export interface MtManifest {
  locale: string
  model: string
  filledAt: string // ISO-8601
  keys: string[] // dotted key paths whose value came from MT (D-10)
}

export class BulkRunRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BulkRunRefusedError'
  }
}

// ---------------------------------------------------------------------------
// Pure catalog helpers -- dotted-key flatten/re-nest. Catalogs in this repo
// are nested objects (confirmed against public/locales/en/gamelib.json and
// public/locales/de/translation.json), so we flatten for comparison and
// re-nest on write so the produced file matches the existing shape.
// ---------------------------------------------------------------------------

type Catalog = Record<string, unknown>

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

function setNested(obj: Catalog, path: string, value: string): void {
  const parts = path.split('.')
  let cursor = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!isPlainObject(cursor[part])) {
      cursor[part] = {}
    }
    cursor = cursor[part] as Catalog
  }
  cursor[parts[parts.length - 1]] = value
}

function cloneCatalog(obj: Catalog): Catalog {
  // structuredClone preserves own-enumerable-property insertion order for
  // plain JSON-shaped objects, which is what "preserves the target's
  // existing key order/nesting" depends on.
  return structuredClone(obj)
}

// ---------------------------------------------------------------------------
// D-09: collect which keys a locale is missing relative to English
// ---------------------------------------------------------------------------

/**
 * A key lands in `missing` only when BOTH the target has no entry (or an
 * empty one) AND the English source itself is non-empty -- an empty English
 * catalog value (e.g. the `redeemKey.*` keys, whose real default lives in
 * the inline `t(key, 'Default')` call rather than the generated catalog,
 * see this plan's <interfaces> note) has nothing to translate FROM, so it is
 * neither a fillable gap nor a preserved value; it is simply excluded.
 */
export function collectMissingKeys(
  en: object,
  target: object,
  locale = ''
): FillPlan {
  const enFlat = flattenCatalog(en as Catalog)
  const targetFlat = flattenCatalog(target as Catalog)

  const missing: string[] = []
  const preserved: string[] = []

  for (const key of Object.keys(enFlat)) {
    const targetValue = targetFlat[key]
    const hasTargetValue = targetValue !== undefined && targetValue !== ''

    if (hasTargetValue) {
      preserved.push(key)
      continue
    }

    const englishValue = enFlat[key]
    if (englishValue !== '') {
      missing.push(key)
    }
  }

  return { locale, missing, preserved }
}

// ---------------------------------------------------------------------------
// D-11: upstream catalogs as read-only translation memory
// ---------------------------------------------------------------------------

/**
 * Returns upstream `source -> target` pairs (deduplicated) whose English
 * value matches `source` case-insensitively. Never throws -- a locale with
 * no upstream catalog (or an empty one) simply yields no memory.
 */
export function buildTranslationMemory(
  enUpstream: object,
  localeUpstream: object,
  source: string
): Array<{ source: string; target: string }> {
  if (!enUpstream || !localeUpstream) return []

  const enFlat = flattenCatalog(enUpstream as Catalog)
  const localeFlat = flattenCatalog(localeUpstream as Catalog)
  const needle = source.trim().toLowerCase()

  const seen = new Set<string>()
  const results: Array<{ source: string; target: string }> = []

  for (const [key, enValue] of Object.entries(enFlat)) {
    if (enValue.trim().toLowerCase() !== needle) continue
    const targetValue = localeFlat[key]
    if (!targetValue) continue

    const dedupeKey = `${enValue} ${targetValue}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    results.push({ source: enValue, target: targetValue })
  }

  return results
}

// ---------------------------------------------------------------------------
// D-09 preservation rules, applied to a candidate translation
// ---------------------------------------------------------------------------

const PLACEHOLDER_RE = /\{\{\s*([\w.]+)\s*\}\}/g

function extractPlaceholders(text: string): Set<string> {
  const found = new Set<string>()
  const re = new RegExp(PLACEHOLDER_RE)
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    found.add(match[1])
  }
  return found
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Loose (case-insensitive) presence check, used to decide whether a
// glossary rule even applies to this source string.
function containsTermLoose(text: string, term: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`, 'i')
  return re.test(text)
}

// Verbatim (case-sensitive) presence check -- glossed terms must survive
// translation EXACTLY, not just case-insensitively.
function containsTermVerbatim(text: string, term: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`)
  return re.test(text)
}

/**
 * Returns a list of human-readable problem strings -- never throws. The
 * caller (this plan's orchestration layer, see `fillLocale` below) decides
 * to skip a key and report rather than write a broken value when this
 * returns anything non-empty.
 */
export function validateTranslation(
  source: string,
  target: string,
  glossary: string[]
): string[] {
  const problems: string[] = []

  const sourcePlaceholders = extractPlaceholders(source)
  const targetPlaceholders = extractPlaceholders(target)

  for (const placeholder of sourcePlaceholders) {
    if (!targetPlaceholders.has(placeholder)) {
      problems.push(
        `translation drops placeholder {{${placeholder}}} present in the source`
      )
    }
  }
  for (const placeholder of targetPlaceholders) {
    if (!sourcePlaceholders.has(placeholder)) {
      problems.push(
        `translation introduces placeholder {{${placeholder}}} not present in the source`
      )
    }
  }

  for (const term of glossary) {
    if (containsTermLoose(source, term) && !containsTermVerbatim(target, term)) {
      problems.push(
        `translation drops or alters glossary term "${term}" present in the source -- glossary terms must survive verbatim`
      )
    }
  }

  return problems
}

// ---------------------------------------------------------------------------
// D-09: merge -- the single invariant, made structurally obvious: build the
// output from the TARGET, then add only genuinely-missing keys.
// ---------------------------------------------------------------------------

/**
 * `mergeFill` itself never touches the clock or knows the locale/model --
 * those are set by the caller (`fillLocale`, which takes `now: Date`) once
 * the merge has happened. Here, `manifest.locale`/`model`/`filledAt` are
 * carried from `priorManifest` (or left blank) purely so the returned shape
 * is well-formed; only `manifest.keys` is this function's real contract.
 */
export function mergeFill(
  target: object,
  filled: Record<string, string>,
  priorManifest: MtManifest | null
): { merged: object; manifest: MtManifest } {
  const merged = cloneCatalog(target as Catalog)
  const targetFlat = flattenCatalog(target as Catalog)

  const filledKeys: string[] = []
  for (const [key, value] of Object.entries(filled)) {
    const existing = targetFlat[key]
    const hasExisting = existing !== undefined && existing !== ''
    if (hasExisting) continue // D-09: never overwrite a non-empty value

    setNested(merged, key, value)
    filledKeys.push(key)
  }

  const priorKeys = priorManifest?.keys ?? []
  const keys = Array.from(new Set([...priorKeys, ...filledKeys])).sort()

  const manifest: MtManifest = {
    locale: priorManifest?.locale ?? '',
    model: priorManifest?.model ?? '',
    filledAt: priorManifest?.filledAt ?? '',
    keys
  }

  return { merged, manifest }
}

// ---------------------------------------------------------------------------
// Plural-sibling completeness (D-09) -- validateTranslation only ever sees a
// single (source, target) string pair, so it cannot know about a sibling
// key elsewhere in the catalog. This check needs the key PATH, so it lives
// at the orchestration layer instead.
// ---------------------------------------------------------------------------

function pluralSiblingOf(keyPath: string): string | null {
  if (keyPath.endsWith('_one')) return `${keyPath.slice(0, -'_one'.length)}_other`
  if (keyPath.endsWith('_other')) return `${keyPath.slice(0, -'_other'.length)}_one`
  return null
}

// ---------------------------------------------------------------------------
// Orchestration -- ties collectMissingKeys + the injected TranslateFn +
// validateTranslation + mergeFill together. Still fully pure/hermetic: the
// only "impure" input is the injected `translate` function, which a test
// can supply as a deterministic fake.
// ---------------------------------------------------------------------------

export interface FillLocaleParams {
  en: object
  target: object
  locale: string
  translate: TranslateFn
  glossary: string[]
  buildMemory: (source: string) => Array<{ source: string; target: string }>
  priorManifest: MtManifest | null
  model: string
  now: Date
}

export interface FillLocaleResult {
  plan: FillPlan
  merged: object
  manifest: MtManifest
  skipped: Array<{ keyPath: string; problems: string[] }>
}

export async function fillLocale(
  params: FillLocaleParams
): Promise<FillLocaleResult> {
  const {
    en,
    target,
    locale,
    translate,
    glossary,
    buildMemory,
    priorManifest,
    model,
    now
  } = params

  const plan = collectMissingKeys(en, target, locale)
  const skipped: Array<{ keyPath: string; problems: string[] }> = []

  if (plan.missing.length === 0) {
    const { merged, manifest } = mergeFill(target, {}, priorManifest)
    return {
      plan,
      merged,
      manifest: { ...manifest, locale, model, filledAt: now.toISOString() },
      skipped
    }
  }

  const enFlat = flattenCatalog(en as Catalog)
  const batch = plan.missing.map((keyPath) => ({
    keyPath,
    source: enFlat[keyPath],
    locale,
    memory: buildMemory(enFlat[keyPath])
  }))

  const translated = await translate(batch)
  const translatedMap = new Map(translated.map((t) => [t.keyPath, t.target]))

  const filled: Record<string, string> = {}
  for (const keyPath of plan.missing) {
    const source = enFlat[keyPath]
    const targetText = translatedMap.get(keyPath)

    if (targetText === undefined) {
      skipped.push({
        keyPath,
        problems: ['translator returned no result for this key']
      })
      continue
    }

    const problems = validateTranslation(source, targetText, glossary)
    if (problems.length > 0) {
      skipped.push({ keyPath, problems })
      continue
    }

    filled[keyPath] = targetText
  }

  // Plural-sibling completeness: a filled `_one` needs its `_other` sibling
  // (and vice versa) to ALSO end up present in the merged result -- either
  // already preserved, or filled in this same run -- otherwise i18next's
  // plural resolution silently falls through for the count it has no rule
  // for. A sibling missing from both sets means this key must be skipped
  // too, not written half-paired.
  const finalKeys = new Set([...plan.preserved, ...Object.keys(filled)])
  for (const keyPath of Object.keys(filled)) {
    const sibling = pluralSiblingOf(keyPath)
    if (sibling && plan.missing.includes(sibling) && !finalKeys.has(sibling)) {
      skipped.push({
        keyPath,
        problems: [
          `plural sibling '${sibling}' is missing from this fill -- refusing to write an unpaired _one/_other value`
        ]
      })
      delete filled[keyPath]
      finalKeys.delete(keyPath)
    }
  }

  const { merged, manifest: rawManifest } = mergeFill(target, filled, priorManifest)
  const manifest: MtManifest = {
    locale,
    model,
    filledAt: now.toISOString(),
    keys: rawManifest.keys
  }

  return { plan, merged, manifest, skipped }
}

// ---------------------------------------------------------------------------
// Real translation backend (Anthropic Messages API). Everything above this
// line is pure and hermetically tested; everything below touches the
// network, the filesystem and the environment, and is exercised by actually
// RUNNING the CLI (`pnpm machine-fill-gamelib`), never by importing it under
// jest -- see the `JEST_WORKER_ID` guard at the bottom of this file.
// ---------------------------------------------------------------------------

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const LOCALES_DIR = join('public', 'locales')

// Default model -- chosen 2026-08-07, at implementation time, by reading
// this environment's OWN system-reported model identity (this file was
// authored by a GameLib executor agent running as exactly this model; the
// plan's own instructions forbid transcribing a model ID from this plan or
// from any older file in the repo). Anthropic mints new model IDs on an
// ongoing basis -- this default needs periodic refresh. `GAMELIB_MT_MODEL`
// overrides it without touching this file.
const DEFAULT_MODEL = 'claude-sonnet-5'

interface AnthropicTranslatorOptions {
  apiKey: string
  model: string
  glossary: string[]
}

/**
 * The real `TranslateFn` implementation. Kept as a separate factory so the
 * pure logic above stays untouched and the backend is swappable. Batches
 * all keys for a locale into a single request rather than one request per
 * key.
 */
export function createAnthropicTranslator(
  opts: AnthropicTranslatorOptions
): TranslateFn {
  return async (batch) => {
    if (batch.length === 0) return []

    const locale = batch[0].locale
    const system = [
      `You are translating short UI strings for the GameLib desktop app`,
      `from English into the locale "${locale}".`,
      `Reply with ONLY a JSON array of {"keyPath": string, "target": string}`,
      `objects, one per input item, in the same order as the input. No`,
      `markdown, no commentary, no code fences.`,
      `Rules:`,
      `- Reproduce every {{placeholder}} token VERBATIM -- same spelling,`,
      `  same braces, character for character. Never translate, rename or`,
      `  drop a placeholder.`,
      `- The following terms are brand/platform/unit names and must NEVER`,
      `  be translated -- reproduce them exactly, verbatim, in every`,
      `  translation that contains them: ${opts.glossary.join(', ')}`,
      `- Each input item's "memory" array (if non-empty) lists real`,
      `  source/target pairs already used elsewhere in this same locale for`,
      `  this app family -- match that established terminology instead of`,
      `  inventing a new translation for a word already translated`,
      `  elsewhere (e.g. match the existing translation of "Install").`,
      `- Keep the translation's tone and length similar to the source --`,
      `  these are UI labels and dialog copy, not prose.`
    ].join('\n')

    const userPayload = batch.map((item) => ({
      keyPath: item.keyPath,
      source: item.source,
      memory: item.memory
    }))

    // Deliberately no console.log of `system`/`userPayload`/the response
    // body -- never log the API key (T-34.8-34) and never log full request
    // bodies, only a key-count summary.
    console.log(
      `Requesting translation for ${batch.length} key(s) into locale "${locale}"...`
    )

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: JSON.stringify(userPayload) }]
      })
    })

    if (!response.ok) {
      // Do not include the response body in the thrown error -- it may
      // echo request content back, and this message can end up in CI logs.
      throw new Error(
        `Anthropic API request failed for locale "${locale}": HTTP ${response.status}`
      )
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>
    }
    const textBlock = data.content?.find((c) => c.type === 'text')?.text ?? '[]'

    let parsed: unknown
    try {
      parsed = JSON.parse(textBlock)
    } catch {
      throw new Error(
        `Anthropic API response for locale "${locale}" was not valid JSON`
      )
    }

    if (!Array.isArray(parsed)) {
      throw new Error(
        `Anthropic API response for locale "${locale}" was not a JSON array`
      )
    }

    return parsed as Array<{ keyPath: string; target: string }>
  }
}

// ---------------------------------------------------------------------------
// CLI: locale resolution + the D-08 bulk-run refusal. This runs BEFORE any
// ANTHROPIC_API_KEY check or network call, so the refusal itself can be
// proven without a real API key or network access.
// ---------------------------------------------------------------------------

function readJsonFile(path: string): object {
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8')) as object
}

function listAllLocaleDirs(): string[] {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'en')
    .map((entry) => entry.name)
}

function resolveLocales(): string[] {
  const localesEnv = process.env.GAMELIB_MT_LOCALES

  if (!localesEnv || localesEnv.trim() === '') {
    throw new BulkRunRefusedError(
      'GAMELIB_MT_LOCALES is not set. D-08 ships this script BUILT and ' +
        'PROVEN on one or two locales -- bulk-filling all 48 non-English ' +
        'locales is a separate, revertible commit, not this run. Set ' +
        'GAMELIB_MT_LOCALES to a comma-separated list of locale codes ' +
        '(for example "de,fr") to fill specific locales, or set it to ' +
        '"all" together with GAMELIB_MT_CONFIRM_BULK=1 to deliberately ' +
        'opt into a full 48-locale bulk run.'
    )
  }

  const trimmed = localesEnv.trim()
  if (trimmed.toLowerCase() === 'all') {
    if (process.env.GAMELIB_MT_CONFIRM_BULK !== '1') {
      throw new BulkRunRefusedError(
        'GAMELIB_MT_LOCALES=all requires the explicit opt-in ' +
          'GAMELIB_MT_CONFIRM_BULK=1. D-08 ships this script BUILT and ' +
          'PROVEN on one or two locales -- a bulk run across all 48 ' +
          'locale files must be a deliberate, separate, revertible ' +
          'commit, never an accidental default.'
      )
    }
    return listAllLocaleDirs()
  }

  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// CLI: per-locale fill + D-10 provenance write. Upstream catalogs
// (translation.json / gamepage.json / login.json) are opened READ-ONLY here
// -- grep this file for any `writeFileSync(...)` naming those filenames to
// confirm none exists.
// ---------------------------------------------------------------------------

function readGlossary(): string[] {
  const raw = JSON.parse(
    readFileSync(join('meta', 'i18nGlossary.json'), 'utf-8')
  ) as { terms: string[] }
  return raw.terms
}

function buildMemoryFor(locale: string) {
  const enTranslation = readJsonFile(join(LOCALES_DIR, 'en', 'translation.json'))
  const localeTranslation = readJsonFile(
    join(LOCALES_DIR, locale, 'translation.json')
  )
  const enGamepage = readJsonFile(join(LOCALES_DIR, 'en', 'gamepage.json'))
  const localeGamepage = readJsonFile(join(LOCALES_DIR, locale, 'gamepage.json'))
  const enLogin = readJsonFile(join(LOCALES_DIR, 'en', 'login.json'))
  const localeLogin = readJsonFile(join(LOCALES_DIR, locale, 'login.json'))

  return (source: string) => [
    ...buildTranslationMemory(enTranslation, localeTranslation, source),
    ...buildTranslationMemory(enGamepage, localeGamepage, source),
    ...buildTranslationMemory(enLogin, localeLogin, source)
  ]
}

async function fillOneLocale(
  locale: string,
  translate: TranslateFn,
  model: string
): Promise<void> {
  const en = readJsonFile(join(LOCALES_DIR, 'en', 'gamelib.json'))
  const targetPath = join(LOCALES_DIR, locale, 'gamelib.json')
  const target = readJsonFile(targetPath)
  const manifestPath = join(LOCALES_DIR, locale, 'gamelib.mt.json')
  const priorManifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf-8')) as MtManifest)
    : null

  const result = await fillLocale({
    en,
    target,
    locale,
    translate,
    glossary: readGlossary(),
    buildMemory: buildMemoryFor(locale),
    priorManifest,
    model,
    now: new Date()
  })

  console.log(
    `[${locale}] filled ${result.manifest.keys.length - (priorManifest?.keys.length ?? 0)} ` +
      `new key(s), ${result.plan.preserved.length} preserved, ` +
      `${result.skipped.length} skipped.`
  )
  if (result.skipped.length > 0) {
    for (const s of result.skipped) {
      console.log(`  SKIPPED ${s.keyPath}: ${s.problems.join('; ')}`)
    }
  }

  if (result.manifest.keys.length === 0) {
    return // nothing filled (ever, across all runs) -- no file to write
  }

  // Note: this writes ONLY public/locales/<locale>/gamelib.json and its
  // gamelib.mt.json sidecar -- never translation.json/gamepage.json/
  // login.json, which are read-only translation memory (D-11).
  writeFileSync(targetPath, JSON.stringify(result.merged, null, 4) + '\n')
  writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2) + '\n')
}

async function main(): Promise<void> {
  try {
    const locales = resolveLocales()

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      // Read from process.env ONLY -- never a CLI flag, never a config
      // file. Copies the rationale from verifyUpdaterSigningKey.ts: a
      // secret passed as a CLI flag leaks via shell history and process
      // listings; an env var does not.
      console.error(
        '::error::ANTHROPIC_API_KEY is not set. The D-08/D-09/D-10/D-11 ' +
          'machine-fill script translates en/gamelib.json into the other ' +
          'locales via the Anthropic API; enrol ANTHROPIC_API_KEY in the ' +
          'environment (never as a CLI flag) before running it.'
      )
      process.exit(1)
      return
    }

    const model = process.env.GAMELIB_MT_MODEL || DEFAULT_MODEL
    const glossary = readGlossary()
    const translate = createAnthropicTranslator({ apiKey, model, glossary })

    console.log(
      `machine-fill-gamelib: locale(s) [${locales.join(', ')}], model "${model}"`
    )

    for (const locale of locales) {
      await fillOneLocale(locale, translate, model)
    }
  } catch (error) {
    if (error instanceof BulkRunRefusedError) {
      console.error(`::error::${error.message}`)
      process.exit(1)
      return
    }
    console.error(
      '::error::machine-fill-gamelib failed:',
      error instanceof Error ? error.message : error
    )
    process.exit(1)
  }
}

// This script is bundled by esbuild to
// node_modules/.cache/machine-fill-gamelib.cjs and run as
// `node node_modules/.cache/machine-fill-gamelib.cjs`, which DOES set
// `require.main` -- but this module is also imported directly by its jest
// suite above, so the usual `require.main === module` idiom would run this
// at import time under test too -- see buildCrossoverIndex.ts's own comment
// on this. JEST_WORKER_ID is set by Jest for every worker (including
// --runInBand), so it reliably distinguishes "imported under test" from
// "run as a CLI", guarding main() from ever firing a network call,
// filesystem write or process.exit during the test suite above.
if (!process.env.JEST_WORKER_ID) {
  void main()
}
