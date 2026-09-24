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
    note?: string // per-key translator context: CLDR sample counts + i18nTranslatorNotes.json
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
// Plural handling -- locale CLDR categories, per-locale required plural key
// sets, and the English source a CLDR-sibling key (e.g. ru's `_few`, which
// en itself never authors) should be translated from. i18next resolves
// plurals via `new Intl.PluralRules(lng).select(count)` when
// `compatibilityJSON` is unset/`v4` (confirmed against this repo's own
// i18next dependency, node_modules/i18next/dist/cjs/i18next.js:1218) -- these
// helpers mirror that exactly so the fill emits every suffix i18next will
// actually ask for, not just en's own `_one`/`_other` pair.
// ---------------------------------------------------------------------------

const PLURAL_SUFFIXES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const
const PLURAL_SUFFIX_RE = /_(zero|one|two|few|many|other)$/

/**
 * The CLDR plural categories a locale needs, in canonical order. `null` for
 * an empty or unparseable code -- never throws. `Intl.PluralRules` requires
 * a BCP-47 dash-separated tag; this repo's locale directories mix both forms
 * (`de`, `zh_Hans`, `pt_BR`), so an underscore is mapped to a dash first.
 */
export function pluralCategoriesFor(locale: string): string[] | null {
  if (!locale) return null
  try {
    const tag = locale.replace(/_/g, '-')
    return new Intl.PluralRules(tag).resolvedOptions().pluralCategories
  } catch {
    return null
  }
}

/**
 * Strips a trailing `_zero|_one|_two|_few|_many|_other` suffix, returning
 * the base key path -- or null when the key path does not end with one of
 * those suffixes at all. Whether the base is GENUINELY a plural group in
 * `en` is a separate question, answered by `isPluralGroup` below -- this
 * function alone would misfire on an ordinary key that happens to end
 * `_one` with no `_other` sibling.
 */
export function pluralBaseOf(keyPath: string): string | null {
  const match = keyPath.match(PLURAL_SUFFIX_RE)
  if (!match) return null
  return keyPath.slice(0, -match[0].length)
}

/**
 * A base is only ever treated as a plural group when `en` itself carries
 * `<base>_other` -- this is what stops an ordinary key that happens to end
 * `_one` (with no sibling) from being expanded into a fake plural group.
 */
function isPluralGroup(base: string, enFlat: Record<string, string>): boolean {
  return enFlat[`${base}_other`] !== undefined
}

/**
 * The full set of key paths a locale needs for a plural group: the UNION of
 * en's own suffixes (so lintTranslations' "every en key present" check is
 * untouched) and the locale's own CLDR categories (so a Slavic locale gets
 * `_few`/`_many` even though en only ever authors `_one`/`_other`, and a
 * `ja`-shaped locale only gets `_one`/`_other` -- the ja `_one` is a
 * harmless dead key i18next never asks for). Returned in canonical suffix
 * order.
 */
export function requiredPluralKeys(
  base: string,
  enFlat: Record<string, string>,
  locale: string
): string[] {
  const enSuffixes = new Set(
    PLURAL_SUFFIXES.filter((s) => enFlat[`${base}_${s}`] !== undefined)
  )
  const categories = pluralCategoriesFor(locale) ?? []
  const union = new Set<string>([...enSuffixes, ...categories])
  return PLURAL_SUFFIXES.filter((s) => union.has(s)).map((s) => `${base}_${s}`)
}

/**
 * The English text a given key path should be translated FROM. A literal en
 * key (plural or not) returns its own value. A CLDR-sibling key en does not
 * carry (e.g. ru's `_few`/`_many`, or any locale's `_zero`/`_two`) falls
 * back to en's `_other` form -- the closest English has to offer -- except
 * `_one`, which falls back to en's own `_one`. Returns undefined for a key
 * that is neither a real en key nor a sibling of a real en plural group.
 */
export function englishSourceFor(
  keyPath: string,
  enFlat: Record<string, string>
): string | undefined {
  if (enFlat[keyPath] !== undefined) return enFlat[keyPath]

  const match = keyPath.match(PLURAL_SUFFIX_RE)
  if (!match) return undefined

  const base = keyPath.slice(0, -match[0].length)
  if (!isPluralGroup(base, enFlat)) return undefined

  const suffix = match[1]
  return suffix === 'one' ? enFlat[`${base}_one`] : enFlat[`${base}_other`]
}

/**
 * A handful of representative sample integers (never exhaustive) that
 * genuinely resolve to `category` under `locale`'s own plural rule --
 * embedded in a translator note so a human/model translating, say, ru's
 * `_few` form knows which counts (2, 3, 4, ...) it covers. Never throws;
 * an unparseable locale yields no samples and the caller simply omits that
 * part of the note.
 */
const PLURAL_SAMPLE_CANDIDATES = [
  0, 1, 2, 3, 4, 5, 6, 10, 11, 20, 21, 22, 25, 100, 101, 102
]

function samplePluralIntegers(
  locale: string,
  category: string,
  count = 3
): number[] {
  try {
    const rules = new Intl.PluralRules(locale.replace(/_/g, '-'))
    const samples: number[] = []
    for (const n of PLURAL_SAMPLE_CANDIDATES) {
      if (rules.select(n) === category) {
        samples.push(n)
        if (samples.length >= count) break
      }
    }
    return samples
  } catch {
    return []
  }
}

/**
 * A translator note applies to a literal key path, OR to a plural BASE path
 * -- in which case it applies to every form of that group (per this task's
 * <interfaces>/action (c): "Notes on a plural BASE path apply to every
 * form").
 */
function resolveTranslatorNote(
  keyPath: string,
  notes: Record<string, string>
): string | undefined {
  if (notes[keyPath]) return notes[keyPath]
  const base = pluralBaseOf(keyPath)
  if (base && notes[base]) return notes[base]
  return undefined
}

/**
 * Builds the `note` sent to the translator for one batch item: the CLDR
 * sample-integers note (plural-category keys only) and the per-key
 * translator-context note from `meta/i18nTranslatorNotes.json`, joined when
 * both apply. Returns undefined when neither applies, so the caller can
 * omit the field entirely (D-09-adjacent: never send a hollow note).
 */
function buildNoteFor(
  keyPath: string,
  locale: string,
  notes: Record<string, string>
): string | undefined {
  const parts: string[] = []

  const match = keyPath.match(PLURAL_SUFFIX_RE)
  if (match) {
    const category = match[1]
    const samples = samplePluralIntegers(locale, category)
    if (samples.length > 0) {
      parts.push(
        `CLDR plural category "${category}" -- sample count(s): ${samples.join(', ')}`
      )
    }
  }

  const keyNote = resolveTranslatorNote(keyPath, notes)
  if (keyNote) parts.push(keyNote)

  return parts.length > 0 ? parts.join(' | ') : undefined
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
  const processedBases = new Set<string>()

  const evaluate = (key: string, englishValue: string): void => {
    const targetValue = targetFlat[key]
    const hasTargetValue = targetValue !== undefined && targetValue !== ''

    if (hasTargetValue) {
      preserved.push(key)
      return
    }

    if (englishValue !== '') {
      missing.push(key)
    }
  }

  for (const key of Object.keys(enFlat)) {
    const base = pluralBaseOf(key)

    // A genuine plural group (en carries `<base>_other`) is expanded to its
    // FULL required set -- en's own suffixes unioned with this locale's CLDR
    // categories -- and processed once per base, not once per en suffix. An
    // ordinary key that happens to end `_one`/etc. with no `_other` sibling
    // falls through to the plain per-key path below, unchanged from before.
    if (base !== null && isPluralGroup(base, enFlat)) {
      if (processedBases.has(base)) continue
      processedBases.add(base)

      for (const reqKey of requiredPluralKeys(base, enFlat, locale)) {
        evaluate(reqKey, englishSourceFor(reqKey, enFlat) ?? '')
      }
      continue
    }

    evaluate(key, enFlat[key])
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

// 260903-itr (option C): renamed from `containsTermLoose`. The old name
// described a case-INsensitive presence check while `containsTermVerbatim`
// below stayed case-SENSITIVE -- an asymmetric pair. Under that asymmetry,
// any source string containing a glossary term's ordinary lowercase word
// form (e.g. "browser" in "Open in browser") counted as "the glossary rule
// applies", then demanded the literal capitalised glossary term survive
// verbatim into the translation -- something no genuine translation of an
// ordinary word can do. `Browser` is both a brand/identifier and an
// everyday English noun, so this silently rejected 185 of 242 outstanding
// machine-fill translations across 46 languages while the run still
// exited 0; German passed only because "Browser" happens to also be the
// capitalised German noun. The same trap is latent for `Mac`, `GE` and
// `Zoom`.
//
// The fix, applied here: this check is now symmetric with
// `containsTermVerbatim` -- if the source contains the glossary term
// verbatim, the translation must contain it verbatim too. A source that
// merely contains the term's lowercase common-word form no longer trips
// the rule at all.
function containsTermSourcePresence(text: string, term: string): boolean {
  const re = new RegExp(
    `(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`
  )
  return re.test(text)
}

// 260903-ly4: the strict trailing `(?![A-Za-z0-9_])` lookahead this function
// used to share with `containsTermSourcePresence` forbade a glossed term
// from taking ANY suffix at all. English brands do not inflect, so the
// defect was invisible in English; it was not invisible elsewhere. Measured
// 2026-09-02 against the real catalogs, after the 2026-09-03 +185 batch: 57
// fills remained outstanding, and ZERO of the 57 have a glossary-term-free
// English source. Per-locale evidence: Estonian misses 31 of its 33
// Steam-bearing strings vs 2 of 176 others (94% vs 1%); Finnish 9 of 33 vs 5
// of 176; Hungarian 4 of 33 vs 0; Croatian 2 vs 0; Slovenian 1 vs 0; and
// Danish, Norwegian-Bokmål and Swedish each miss the exact SAME single
// string, `webview.unavailable.body`, whose English source opens with the
// genitive `GameLib's` -- three independent North Germanic locales failing
// on one English possessive. Estonian attaches case suffixes directly onto
// a foreign proper noun with no separator (`Steami`, `Steamis`,
// `Steamiga`); Finnish and Hungarian do the same (`Steamin`, `Steamet`);
// the North Germanic languages form the possessive with a bare trailing
// `-s` and no apostrophe (`GameLibs`). Each of these is the CORRECT
// translation, and the strict trailing boundary rejected every one of them
// while the fill run still exited 0 -- the same root shape as the
// `containsTermLoose`/`Browser` defect fixed above under `260903-itr`, just
// on the opposite side: that fix TIGHTENED the SOURCE-side matcher, this
// one RELAXES the TARGET-side matcher.
//
// The fix: drop the trailing lookahead from this function only, keeping the
// leading `(?<![A-Za-z0-9_])` lookbehind. `containsTermSourcePresence`
// above is untouched -- it stays strict on both sides, because English does
// not inflect and an apostrophe (not in `[A-Za-z0-9_]`) already lets
// `GameLib's` match the term `GameLib` under the strict form.
//
// ACCEPTED COST, stated plainly, not waved away as harmless: a relaxed
// trailing boundary makes this survival check weaker for short glossary
// terms -- `Mac` is now also satisfied by German `Macht`/`Machen`, and `GE`
// by any all-caps word starting `GE`. This deliberately trades a
// FALSE-REJECT (silently discards a correct translation while the run
// exits 0 -- the failure mode that has now bitten this project twice) for a
// FALSE-PASS on the survival check (at worst, one bad translation reaches a
// catalog already labelled MT-origin by its `gamelib.mt.json` sidecar). The
// direction is chosen, not accidental.
function containsTermVerbatim(text: string, term: string): boolean {
  const re = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(term)}`)
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
    if (
      containsTermSourcePresence(source, term) &&
      !containsTermVerbatim(target, term)
    ) {
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
  notes?: Record<string, string> // per-key translator context, D-notes; defaults to {}
}

export interface FillLocaleResult {
  plan: FillPlan
  merged: object
  manifest: MtManifest
  skipped: Array<{ keyPath: string; problems: string[] }>
}

/**
 * `filledAt` records when these keys were FILLED, not when the script last
 * ran. A re-run that fills nothing must therefore carry the prior timestamp
 * forward: re-stamping it rewrites the sidecar on every no-op run, which
 * both breaks the "a repeat run changes no file" guarantee and silently
 * ages the provenance a later Weblate import would read.
 */
function stampFilledAt(
  filled: Record<string, string>,
  priorManifest: MtManifest | null,
  now: Date
): string {
  if (Object.keys(filled).length === 0 && priorManifest?.filledAt) {
    return priorManifest.filledAt
  }
  return now.toISOString()
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
    now,
    notes
  } = params
  const notesMap = notes ?? {}

  const plan = collectMissingKeys(en, target, locale)
  const skipped: Array<{ keyPath: string; problems: string[] }> = []

  if (plan.missing.length === 0) {
    const { merged, manifest } = mergeFill(target, {}, priorManifest)
    return {
      plan,
      merged,
      manifest: {
        ...manifest,
        locale,
        model,
        filledAt: stampFilledAt({}, priorManifest, now)
      },
      skipped
    }
  }

  const enFlat = flattenCatalog(en as Catalog)
  const batch = plan.missing.map((keyPath) => {
    const source = englishSourceFor(keyPath, enFlat) ?? ''
    const note = buildNoteFor(keyPath, locale, notesMap)
    return {
      keyPath,
      source,
      locale,
      memory: buildMemory(source),
      ...(note ? { note } : {})
    }
  })

  const translated = await translate(batch)
  const translatedMap = new Map(translated.map((t) => [t.keyPath, t.target]))

  const filled: Record<string, string> = {}
  for (const keyPath of plan.missing) {
    const source = englishSourceFor(keyPath, enFlat) ?? ''
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

  // Plural-GROUP completeness (generalises the old pairwise _one/_other
  // check): every required form of a triggered plural base -- per
  // requiredPluralKeys, the union of en's own suffixes and this locale's
  // CLDR categories -- must end up present in the merged result, either
  // already preserved or filled in this same run. i18next's plural
  // resolution silently falls through to English for any count whose
  // category is missing, so a half-written group is worse than an
  // untranslated one -- write nothing for that group instead.
  const triggeredBases = new Set<string>()
  for (const keyPath of plan.missing) {
    const base = pluralBaseOf(keyPath)
    if (base !== null && isPluralGroup(base, enFlat)) {
      triggeredBases.add(base)
    }
  }

  const finalKeys = new Set([...plan.preserved, ...Object.keys(filled)])
  for (const base of triggeredBases) {
    const required = requiredPluralKeys(base, enFlat, locale)
    const complete = required.every((k) => finalKeys.has(k))
    if (complete) continue

    for (const keyPath of required) {
      if (Object.prototype.hasOwnProperty.call(filled, keyPath)) {
        skipped.push({
          keyPath,
          problems: [
            `plural group '${base}' is missing a required form -- refusing to write an incomplete plural group`
          ]
        })
        delete filled[keyPath]
        finalKeys.delete(keyPath)
      }
    }
  }

  const { merged, manifest: rawManifest } = mergeFill(
    target,
    filled,
    priorManifest
  )
  const manifest: MtManifest = {
    locale,
    model,
    filledAt: stampFilledAt(filled, priorManifest, now),
    keys: rawManifest.keys
  }

  return { plan, merged, manifest, skipped }
}

/**
 * Recovers the JSON array from a model response.
 *
 * The system prompt asks for a bare array with no code fences and no
 * commentary, and usually gets one -- but not every time: a live run
 * aborted mid-fill because a single chunk came back fenced. Failing the
 * whole locale on one chatty response would make the eventual 46-locale
 * bulk fill a coin flip, so strip the two shapes actually observed
 * (markdown fences, leading/trailing prose) before parsing. Anything with
 * no array in it at all still throws at the `JSON.parse` call site.
 */
export function extractJsonArray(text: string): string {
  const withoutFences = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  const start = withoutFences.indexOf('[')
  const end = withoutFences.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return withoutFences

  return withoutFences.slice(start, end + 1)
}

/**
 * Splits a translation batch into request-sized slices.
 *
 * The whole-locale-in-one-request design this replaced could not fit its own
 * output: 124 keys of translated JSON needs roughly 4,600 output tokens, more
 * than the per-request ceiling, so every run past ~110 keys was truncated.
 * Slicing keeps each response comfortably inside the ceiling and keeps the
 * script working as `en/gamelib.json` grows and as the remaining 46 locales
 * land.
 */
export function chunkBatch<T>(batch: T[], size: number): T[][] {
  if (size < 1) throw new Error('chunkBatch size must be at least 1')

  const chunks: T[][] = []
  for (let i = 0; i < batch.length; i += size) {
    chunks.push(batch.slice(i, i + size))
  }
  return chunks
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

// Keys per API request, and the output ceiling each request is given.
// A translated key costs roughly 35 output tokens, so 40 keys lands near
// 1,400 -- an order of magnitude inside the ceiling, leaving room for
// longer locales without another truncation.
const KEYS_PER_REQUEST = 40
const RESPONSE_MAX_TOKENS = 8192

/**
 * The real `TranslateFn` implementation. Kept as a separate factory so the
 * pure logic above stays untouched and the backend is swappable. Issues one
 * request per `KEYS_PER_REQUEST`-key slice and concatenates the results;
 * the caller matches them back by `keyPath`, so slice order is irrelevant.
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
      `  these are UI labels and dialog copy, not prose.`,
      `- An input item's "note" field, when present, is BINDING translator`,
      `  context for that specific item -- follow it exactly, even when it`,
      `  seems to conflict with your own instinct for a natural phrasing.`,
      `- When a note names a term (e.g. a UI section name) and the SAME`,
      `  note text appears on more than one item in this batch, translate`,
      `  that term IDENTICALLY in every one of those items -- do not vary`,
      `  the wording between them.`
    ].join('\n')

    const results: Array<{ keyPath: string; target: string }> = []

    for (const chunk of chunkBatch(batch, KEYS_PER_REQUEST)) {
      const userPayload = chunk.map((item) => ({
        keyPath: item.keyPath,
        source: item.source,
        memory: item.memory,
        ...(item.note ? { note: item.note } : {})
      }))

      // Deliberately no console.log of `system`/`userPayload`/the response
      // body -- never log the API key (T-34.8-34) and never log full request
      // bodies, only a key-count summary.
      console.log(
        `Requesting translation for ${chunk.length} key(s) into locale "${locale}"...`
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
          max_tokens: RESPONSE_MAX_TOKENS,
          // This is mechanical transliteration against an explicit rule
          // list, not a reasoning task. Current models run adaptive
          // thinking by DEFAULT, and thinking is billed against the same
          // max_tokens ceiling as the answer -- a whole-locale batch spent
          // the entire budget reasoning and returned a thinking block with
          // no text block at all. Disabling it keeps the ceiling for output.
          thinking: { type: 'disabled' },
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
        stop_reason?: string
        content?: Array<{ type: string; text?: string }>
      }

      // Fail LOUDLY on a truncated or text-less response. The previous
      // `?? '[]'` fallback turned both into an empty translation array,
      // which the caller could only report as "translator returned no
      // result for this key" -- indistinguishable from a model quirk, and
      // it exited 0 having written nothing.
      if (data.stop_reason === 'max_tokens') {
        throw new Error(
          `Anthropic API response for locale "${locale}" hit max_tokens ` +
            `(${RESPONSE_MAX_TOKENS}) and was truncated -- lower ` +
            `KEYS_PER_REQUEST (currently ${KEYS_PER_REQUEST}) or raise the ceiling.`
        )
      }

      const textBlock = data.content?.find((c) => c.type === 'text')?.text
      if (textBlock === undefined) {
        throw new Error(
          `Anthropic API response for locale "${locale}" contained no text ` +
            `block (blocks: ${(data.content ?? []).map((c) => c.type).join(', ') || 'none'}).`
        )
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(extractJsonArray(textBlock))
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

      results.push(...(parsed as Array<{ keyPath: string; target: string }>))
    }

    return results
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

function readTranslatorNotes(): {
  rationale: string
  notes: Record<string, string>
} {
  return JSON.parse(
    readFileSync(join('meta', 'i18nTranslatorNotes.json'), 'utf-8')
  ) as { rationale: string; notes: Record<string, string> }
}

function buildMemoryFor(locale: string) {
  const enTranslation = readJsonFile(
    join(LOCALES_DIR, 'en', 'translation.json')
  )
  const localeTranslation = readJsonFile(
    join(LOCALES_DIR, locale, 'translation.json')
  )
  const enGamepage = readJsonFile(join(LOCALES_DIR, 'en', 'gamepage.json'))
  const localeGamepage = readJsonFile(
    join(LOCALES_DIR, locale, 'gamepage.json')
  )
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
    now: new Date(),
    notes: readTranslatorNotes().notes
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

// This script is run via `node meta/runTs.cjs` (package.json
// `machine-fill-gamelib`), which DOES set
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
