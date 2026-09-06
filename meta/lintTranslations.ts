/**
 * Script to run some checks against translations
 *
 * run with `pnpm lint-translations`
 *
 * It can flag:
 * - empty strings
 * - translations in language file that are not present in `en` file
 * - translations that add content between indexed content-less tags
 *   like `<1></1>` in `en` file but with content in the translation
 * - translations missing content-less tags that are present in `en`
 *   file, like a translation missing a `<2></2>` tag
 *
 * It shows a list with the different results of the checks, language
 * and keys compared.
 *
 * D-15 (Phase 34.8-09): the general-purpose `pnpm lint-translations`
 * invocation above still checks all four namespaces, unchanged. A
 * SEPARATE, `gamelib`-only invocation exists (`pnpm lint-translations:gamelib`)
 * for anything that wires this script's checks into an actionable CI-facing
 * gate. Running these checks across all 49 locales for the three upstream
 * namespaces (`translation`/`gamepage`/`login`) surfaces a wall of
 * pre-existing failures on Weblate-sourced data this fork does not own and
 * cannot fix -- a gate with unactionable noise stops being read. Scope is
 * read from `LINT_TRANSLATIONS_NAMESPACES` (comma-separated), not a CLI
 * flag. This is a DELIBERATE convention, not a mechanical necessity -- CLI
 * argv is reachable via `process.argv` regardless of invocation form. It
 * matches `meta/verifyUpdaterSigningKey.ts`'s own precedent of reading
 * CI-facing configuration from the environment rather than a flag.
 * (Correction, C3-02: an earlier version of this comment claimed argv was
 * mechanically unreachable because of the script's invocation mechanism --
 * that claim was false and has been removed.)
 *
 * REQ-41-02: an out-of-scope namespace is never read at all -- reads are
 * scoped by `opts.namespaces`, the same set `namespaceScope` filtered on
 * before. An absent IN-scope catalog is then classified by ownership,
 * reusing the D-05/D-06 split `meta/i18nCatalogChurnGuard.ts` already
 * establishes for `public/locales/`: `gamelib` is fork-owned (this fork
 * authors it, so an absent one is a real defect -- a hard, counted, named
 * failure with a non-zero exit code); `gamepage`/`login`/`translation` are
 * upstream Weblate-sourced data this fork neither owns nor can fix (an
 * absent one is simply not yet translated for that locale -- reported on
 * one clean line, no stack trace, no exit-code contribution). This is what
 * keeps D-15's own rationale intact -- "a gate with unactionable noise
 * stops being read" -- while making the fork-owned half honest.
 *
 * REQ-41-01: `checkFileAgainstEnglish` (above `checkValueAgainstEnglish`)
 * enumerates the TRANSLATION's own keys and looks English up BY them -- a
 * key present and non-empty in `en` but entirely ABSENT from a locale
 * catalog is therefore never visited by that loop, and can never be
 * reported. The gate stayed green at zero coverage for that key: measured
 * at HEAD (2026-09-06) this was hiding 794 missing (locale, key) pairs
 * across 17 keys, invisible to `pnpm lint-translations:gamelib` the whole
 * time. `checkEnglishKeysPresent` below is the INVERTED direction that
 * closes this: it enumerates `en`'s own flattened keys and asserts each is
 * present and non-empty in the locale catalog, reporting every miss by
 * name. It is keyed off `en` being non-empty rather than an exemption
 * list -- a key that is itself empty in `en` (there were 6 before phase
 * 41-01 authored them; there are 0 now) is silently excluded from this
 * check rather than needing to be named in a carve-out register, and the
 * check degrades correctly if a new empty-in-English key ever appears. Like
 * the ownership split above, this inverted check runs ONLY over
 * `FORK_OWNED_NAMESPACES` -- running it across the three upstream
 * namespaces would surface a wall of unactionable Weblate-sourced gaps this
 * fork neither owns nor can fix, which is precisely the noise D-15 exists
 * to keep out of a gate that must stay read.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'graceful-fs'
import { join, resolve } from 'path'

const ALL_NAMESPACES = ['gamelib', 'gamepage', 'login', 'translation'] as const
type Namespace = (typeof ALL_NAMESPACES)[number]

// there are many extra keys in translation files without a matching
// key in the english file
//
// this is not really a problem so these messages are ignored by default
const printExtraTransations = false

// D-05/D-06 split-brain (see meta/i18nCatalogChurnGuard.ts's own header):
// `gamelib` is the only fork-owned namespace under public/locales/ --
// `gamepage`/`login`/`translation` are upstream Weblate-sourced data this
// fork neither owns nor can fix. This is a REUSED decision, not a new one:
// it is what lets an absent fork-owned catalog fail the gate while an
// absent upstream catalog stays a report.
const FORK_OWNED_NAMESPACES: readonly Namespace[] = ['gamelib']

function isForkOwned(namespace: Namespace): boolean {
  return (FORK_OWNED_NAMESPACES as readonly string[]).includes(namespace)
}

type CatalogRecord = Record<string, unknown>

export interface LintOptions {
  localesPath: string
  namespaces: Namespace[]
  // REQ-41-01, gap-closure plan 41-06: the presence baseline this run
  // compares against. Defaults to the committed PRESENCE_BASELINE_PATH.
  // Injectable so the "baseline is absent" boundary is testable without
  // moving, renaming or deleting the committed artifact -- this project has
  // a recorded incident of a test clobbering a real artifact, and R13/R14/
  // R15 all read this file's real bytes.
  baselinePath?: string
}

export interface LintResult {
  findings: string[]
  hardFailures: string[]
}

// Thrown by readCatalog() when a catalog file exists but is not valid JSON.
// A corrupt catalog is a real defect in a file that exists, unlike an
// upstream file that was simply never shipped -- it is a hard failure
// regardless of namespace ownership. Carries the parse-failure MESSAGE
// TEXT, never the raw Error object (T-41-03-04: no stack trace in gate
// output).
export class CorruptCatalogError extends Error {
  constructor(
    public readonly language: string,
    public readonly namespace: Namespace,
    parseMessage: string
  ) {
    super(`${language}/${namespace}.json is not valid JSON: ${parseMessage}`)
    this.name = 'CorruptCatalogError'
  }
}

// Read a file as JSON. Returns `null` if the file is absent (ENOENT or any
// other read failure) -- absence is classified by the caller (fork-owned vs
// upstream-owned), not here, and nothing is printed for it (no
// `console.log(error)`: that was the source of the ENOENT stack traces
// REQ-41-02 closes). Throws `CorruptCatalogError` if the file exists but
// fails to parse as JSON.
export function readCatalog(
  localesPath: string,
  language: string,
  namespace: Namespace
): CatalogRecord | null {
  let raw: string
  try {
    raw = readFileSync(
      join(localesPath, language, namespace + '.json')
    ).toString()
  } catch {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new CorruptCatalogError(language, namespace, message)
  }
}

// Run checks in string from translation against original in english file
function checkStringValueAgainstEnglish(
  trValue: string,
  enValue: string,
  language: string,
  namespace: string,
  parent: string | undefined,
  result: LintResult
): void {
  if (trValue === '') {
    result.findings.push(
      `Empty translation for ${language}.${namespace}.${parent}`
    )
    return
  }

  const i18nTags = enValue.match(/<(\d+)><\/\1>/)
  if (i18nTags) {
    // check content-less tags like `<1></1>`
    const invalidTags: string[] = []
    const matches = [...enValue.matchAll(/<(\d+)><\/\1>/g)]
    matches.forEach((ma) => {
      const str = ma[0]
      if (!trValue.includes(str)) {
        invalidTags.push(str)
      }
    })

    if (invalidTags.length) {
      result.findings.push(
        `Missing content in translation, <X></X> tags not matching original for ${language}.${namespace}.${parent}.\nExpected ${enValue}\nGot: ${trValue}\n\n`
      )
    }
  }
}

// Recursive function traversing objects
function checkValueAgainstEnglish(
  trValue: unknown,
  enValue: unknown,
  language: string,
  namespace: string,
  parent: string | undefined,
  result: LintResult
): void {
  if (typeof enValue === 'undefined') {
    if (printExtraTransations) {
      result.findings.push(
        `Extra translation not present in english for ${language}.${namespace}.${parent}`
      )
    }
  } else {
    if (typeof trValue === 'string') {
      checkStringValueAgainstEnglish(
        trValue,
        enValue as string,
        language,
        namespace,
        parent,
        result
      )
    } else {
      const trObj = trValue as Record<string, unknown>
      const enObj = enValue as Record<string, unknown>
      for (const key in trObj) {
        checkValueAgainstEnglish(
          trObj[key],
          enObj[key],
          language,
          namespace,
          `${parent}.${key}`,
          result
        )
      }
    }
  }
}

// entry point to check a single translation file
function checkFileAgainstEnglish(
  translations: CatalogRecord,
  enCatalog: CatalogRecord,
  language: string,
  namespace: string,
  result: LintResult
): void {
  for (const key in translations) {
    checkValueAgainstEnglish(
      translations[key],
      enCatalog[key],
      language,
      namespace,
      key,
      result
    )
  }
}

// Flattens a nested catalog object into `.`-joined leaf keys, matching the
// flatten() helper meta/__tests__/gamelibCatalogParity.test.ts already uses
// as this repo's reference key-flattening implementation. Non-string leaves
// (there are none in practice for gamelib.json, but the type is
// `unknown`-safe) are stringified defensively rather than silently dropped.
function flattenCatalog(
  catalog: CatalogRecord,
  prefix = ''
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(catalog)) {
    const keyPath = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out[keyPath] = value
    } else if (value && typeof value === 'object') {
      Object.assign(out, flattenCatalog(value as CatalogRecord, keyPath))
    } else {
      out[keyPath] = String(value)
    }
  }
  return out
}

// REQ-41-01: the INVERTED presence check. Enumerates `en`'s own flattened
// keys (not the locale's) and asserts each is present AND non-empty in the
// locale catalog. This is what `checkFileAgainstEnglish` above structurally
// cannot do -- that loop enumerates the TRANSLATION's keys, so a key wholly
// absent from the translation is never visited. Keyed off `en` being
// non-empty: a key that is itself empty in `en` is silently skipped, no
// exemption register needed (see the header docstring).
export function checkEnglishKeysPresent(
  language: string,
  namespace: string,
  enCatalog: CatalogRecord,
  localeCatalog: CatalogRecord
): string[] {
  const findings: string[] = []
  const enFlat = flattenCatalog(enCatalog)
  const localeFlat = flattenCatalog(localeCatalog)

  for (const [key, enValue] of Object.entries(enFlat)) {
    if (enValue === '') continue // en itself has no translatable content here

    const localeValue = localeFlat[key]
    if (localeValue === undefined || localeValue === '') {
      findings.push(
        `Missing translation for ${language}.${namespace}.${key} (en is non-empty)`
      )
    }
  }

  return findings
}

// REQ-41-01: one derivation of the missing (locale, key) SET, consumed by
// both the committed baseline (meta/i18nCatalogPresenceBaseline.json) and
// the live gate that compares against it (comparePresenceBaseline below).
// A second, independently-written derivation would let the gate agree with
// a wrong baseline -- there must be exactly one source of truth for what
// "missing" means.
export function missingPairs(
  localesPath: string,
  namespace: Namespace
): Array<{ locale: string; key: string }> {
  // REQ-41-02, gap-closure plan 41-06 (GAP-1, second site): a corrupt
  // English catalog is reported elsewhere (lintTranslations()'s
  // hardFailures) -- this derivation only computes the missing-pair SET, and
  // treats a corrupt/absent English catalog identically: nothing can be
  // derived, so there is nothing missing to report from here. Mirrors the
  // locale-catalog catch immediately below.
  let enCatalog: CatalogRecord | null
  try {
    enCatalog = readCatalog(localesPath, 'en', namespace)
  } catch {
    enCatalog = null
  }
  if (!enCatalog) return []

  const enFlat = flattenCatalog(enCatalog)
  const nonEmptyEnKeys = Object.entries(enFlat)
    .filter(([, value]) => value !== '')
    .map(([key]) => key)

  const pairs: Array<{ locale: string; key: string }> = []
  const locales = readdirSync(localesPath).filter((dir) => dir !== 'en')

  for (const locale of locales) {
    let localeCatalog: CatalogRecord | null
    try {
      localeCatalog = readCatalog(localesPath, locale, namespace)
    } catch {
      // A corrupt catalog is reported elsewhere (checkLanguage's
      // hardFailures) -- missingPairs() only derives the presence set, and
      // treats a corrupt/absent catalog identically: everything is missing.
      localeCatalog = null
    }
    const localeFlat = localeCatalog ? flattenCatalog(localeCatalog) : {}

    for (const key of nonEmptyEnKeys) {
      const value = localeFlat[key]
      if (value === undefined || value === '') {
        pairs.push({ locale, key })
      }
    }
  }

  return pairs
}

// REQ-41-01: the committed baseline SET is what makes drift in EITHER
// direction (a new blind spot, or a fill nobody re-recorded) a hard
// failure. Only `gamelib` has a baseline today -- FORK_OWNED_NAMESPACES has
// exactly one entry, and this is that entry's known-missing register.
export const PRESENCE_BASELINE_PATH = 'meta/i18nCatalogPresenceBaseline.json'

// The baseline drift check below is a statement about the REAL committed
// tree matching the REAL committed baseline -- it is meaningless for any of
// the mkdtempSync fixture trees the R1-R7 tests (plan 41-03) and R8-R12
// tests (this plan) build, which intentionally contain only a handful of
// keys and would "drift" from the 794-pair baseline on every single run.
// Gating on an exact resolved-path match to this constant is what lets
// `lintTranslations()` stay usable against an arbitrary fixture path (as
// every existing test already relies on) while still gating the real CLI
// invocation (`main()`'s `./public/locales`, which resolves identically).
const CANONICAL_LOCALES_PATH = 'public/locales'

interface PresenceBaselineFile {
  namespace: Namespace
  generatedAt: string
  generatedBy: string
  reason: string
  totalPairs: number
  missing: Record<string, string[]>
}

function pairId(locale: string, key: string): string {
  return `${locale} ${key}`
}

function readPresenceBaseline(baselinePath: string): PresenceBaselineFile {
  const parsed: unknown = JSON.parse(readFileSync(baselinePath).toString())
  return parsed as PresenceBaselineFile
}

// REQ-41-01: symmetric-difference comparison between the live derivation
// (missingPairs, above -- the single source of truth) and the committed
// baseline SET. `added` = a pair that is missing live but NOT recorded in
// the baseline (a new blind spot: exactly the failure this check exists to
// prevent). `removed` = a pair recorded in the baseline that is no longer
// missing live (the baseline overstates reality -- someone filled a locale
// without regenerating it). Both directions must be checked: a baseline
// that only ever shrinks silently rots the moment reality improves out from
// under it.
export function comparePresenceBaseline(
  localesPath: string,
  baselinePath: string
): {
  added: Array<{ locale: string; key: string }>
  removed: Array<{ locale: string; key: string }>
} {
  const baseline = readPresenceBaseline(baselinePath)

  const baselineSet = new Set<string>()
  for (const [key, locales] of Object.entries(baseline.missing)) {
    for (const locale of locales) baselineSet.add(pairId(locale, key))
  }

  const live = missingPairs(localesPath, baseline.namespace)
  const liveSet = new Set<string>()
  for (const pair of live) liveSet.add(pairId(pair.locale, pair.key))

  const added = live.filter(
    (pair) => !baselineSet.has(pairId(pair.locale, pair.key))
  )

  const removed: Array<{ locale: string; key: string }> = []
  for (const [key, locales] of Object.entries(baseline.missing)) {
    for (const locale of locales) {
      if (!liveSet.has(pairId(locale, key))) removed.push({ locale, key })
    }
  }

  return { added, removed }
}

// REQ-41-01: regeneration is a deliberate, explicitly-opted-into act, never
// an import-time or test-time side effect. Guarded twice over: the caller
// (main(), below) only reaches this behind
// `LINT_TRANSLATIONS_WRITE_BASELINE === '1'`, and main() itself only runs
// behind the pre-existing `!process.env.JEST_WORKER_ID` guard (T-41-05-01 --
// this project has a recorded failure where importing a meta script ran its
// main and rewrote a committed artifact).
function writePresenceBaseline(localesPath: string): void {
  const namespace: Namespace = 'gamelib'
  const pairs = missingPairs(localesPath, namespace)

  let previousSet = new Set<string>()
  if (existsSync(PRESENCE_BASELINE_PATH)) {
    try {
      const previous = readPresenceBaseline(PRESENCE_BASELINE_PATH)
      previousSet = new Set(
        Object.entries(previous.missing).flatMap(([key, locales]) =>
          locales.map((locale) => pairId(locale, key))
        )
      )
    } catch {
      previousSet = new Set()
    }
  }

  const missing: Record<string, string[]> = {}
  for (const pair of pairs) {
    ;(missing[pair.key] ??= []).push(pair.locale)
  }
  const sortedMissing: Record<string, string[]> = {}
  for (const key of Object.keys(missing).sort()) {
    sortedMissing[key] = [...missing[key]].sort()
  }

  const currentSet = new Set(pairs.map((pair) => pairId(pair.locale, pair.key)))
  const added = pairs.filter(
    (pair) => !previousSet.has(pairId(pair.locale, pair.key))
  )
  const removedIds = [...previousSet].filter((id) => !currentSet.has(id))

  const baseline: PresenceBaselineFile = {
    namespace,
    generatedAt: new Date().toISOString(),
    generatedBy: 'Phase 41 REQ-41-01',
    reason:
      'Known-missing (locale, key) pairs at the time the inverted presence check landed. ' +
      'Filling these requires `pnpm machine-fill-gamelib`, which needs an API key and is out ' +
      "of Phase 41's unattended scope. This file is a RECORD of a known gap, not a permission " +
      'to grow it. The assertion is over `missing`, never over `totalPairs` -- do not "fix" ' +
      'the gate by comparing counts.',
    totalPairs: pairs.length,
    missing: sortedMissing
  }

  writeFileSync(
    PRESENCE_BASELINE_PATH,
    JSON.stringify(baseline, null, 2) + '\n'
  )

  console.log(
    `Wrote ${PRESENCE_BASELINE_PATH}: ${pairs.length} pairs across ${Object.keys(sortedMissing).length} keys`
  )
  console.log(`Added (new blind spot recorded): ${added.length}`)
  added.forEach((pair) =>
    console.log(`  + ${pair.locale}.${namespace}.${pair.key}`)
  )
  console.log(`Removed (no longer missing): ${removedIds.length}`)
  removedIds.forEach((id) => {
    const [locale, key] = id.split(' ')
    console.log(`  - ${locale}.${namespace}.${key}`)
  })
}

// entry point to check a single language
export function checkLanguage(
  language: string,
  enCatalogs: Partial<Record<Namespace, CatalogRecord | null>>,
  opts: LintOptions
): LintResult {
  const result: LintResult = { findings: [], hardFailures: [] }

  for (const namespace of opts.namespaces) {
    // REQ-41-02 (a): scope-aware reads. `opts.namespaces` is read here, one
    // namespace at a time, rather than pre-reading ALL_NAMESPACES and
    // filtering afterwards (the old D-15 shape) -- an out-of-scope
    // namespace file is therefore never opened, so it cannot raise an
    // ENOENT trace.
    let content: CatalogRecord | null
    try {
      content = readCatalog(opts.localesPath, language, namespace)
    } catch (error) {
      if (error instanceof CorruptCatalogError) {
        // REQ-41-02: a catalog that exists but fails to parse is a hard
        // failure regardless of ownership -- a corrupt file that exists is
        // a real defect, unlike an upstream file that was never shipped.
        result.hardFailures.push(error.message)
        continue
      }
      throw error
    }

    if (!content) {
      // REQ-41-02 (b): ownership classification replaces the old silent
      // `if (!content) continue`. Measured at HEAD (2026-09-06): all 49
      // locales have gamelib.json; the 5 absent catalogs are all
      // upstream-owned, so this cannot turn the gamelib-scoped gate red.
      const path = `${language}/${namespace}.json`
      if (isForkOwned(namespace)) {
        result.hardFailures.push(
          `${path} is absent -- this is a fork-owned catalog (D-06) and must exist`
        )
      } else {
        result.findings.push(
          `${path} is absent -- upstream (Weblate) catalog not yet translated for this locale`
        )
      }
      continue
    }

    const enCatalog = enCatalogs[namespace]
    if (!enCatalog) continue // english source itself absent for this namespace -- nothing to check against

    checkFileAgainstEnglish(content, enCatalog, language, namespace, result)

    // REQ-41-01: the inverted direction, gated to fork-owned namespaces
    // only (D-15 unactionable-noise rationale -- see header docstring). The
    // forward-direction call above is left unchanged and still runs: the
    // two directions catch different things (the forward loop still catches
    // <X></X> tag mismatches and empty translations for keys that DO
    // exist in the locale catalog).
    if (isForkOwned(namespace)) {
      result.findings.push(
        ...checkEnglishKeysPresent(language, namespace, enCatalog, content)
      )
    }
  }

  return result
}

// the whole run: walks every locale directory (except `en`) and checks it
// against the English source
export function lintTranslations(opts: LintOptions): LintResult {
  const result: LintResult = { findings: [], hardFailures: [] }

  // Scope-aware read for the English source too (REQ-41-02 (a)) -- an
  // out-of-scope namespace's English catalog is never opened either.
  // Gap-closure plan 41-06 (GAP-1): a corrupt en/<namespace>.json is a named
  // hard failure, not an uncaught CorruptCatalogError -- mirrors
  // checkLanguage()'s existing handling of a corrupt LOCALE catalog above.
  // `result` is declared before this loop (moved up from after it) so the
  // catch below has somewhere to push.
  const enCatalogs: Partial<Record<Namespace, CatalogRecord | null>> = {}
  const corruptEnglishNamespaces = new Set<Namespace>()
  for (const namespace of opts.namespaces) {
    try {
      enCatalogs[namespace] = readCatalog(opts.localesPath, 'en', namespace)
    } catch (error) {
      if (error instanceof CorruptCatalogError) {
        result.hardFailures.push(error.message)
        enCatalogs[namespace] = null
        corruptEnglishNamespaces.add(namespace)
        continue
      }
      throw error
    }
  }

  readdirSync(opts.localesPath).forEach((dir) => {
    if (dir === 'en') return

    const langResult = checkLanguage(dir, enCatalogs, opts)
    result.findings.push(...langResult.findings)
    result.hardFailures.push(...langResult.hardFailures)
  })

  // REQ-41-01: the live-tree gate. Compares the missingPairs() derivation
  // against the committed baseline SET for every fork-owned namespace in
  // scope that has one, and fails in BOTH directions -- naming every pair.
  // `added` (a new blind spot) and `removed` (the baseline overstating
  // reality) are both hardFailures: a baseline can drift silently in either
  // direction, and this project has a recorded lesson that a one-directional
  // check misses half the defect class.
  //
  // Gap-closure plan 41-06 (GAP-2, REQ-41-01): every skip of this check
  // below emits a named `findings` entry identifying the namespace and the
  // reason -- a `continue` with no finding, no hard failure and no log line
  // is indistinguishable from a pass, which is the defect class this phase
  // exists to eliminate. The ONLY silent branch is `!isForkOwned(namespace)`,
  // a D-15 scope decision (see its own comment below), not a statement about
  // whether a check was available.
  const isCanonicalLocalesPath =
    resolve(opts.localesPath) === resolve(CANONICAL_LOCALES_PATH)
  const baselinePath = opts.baselinePath ?? PRESENCE_BASELINE_PATH

  for (const namespace of opts.namespaces) {
    // D-15 scope decision, the ONE deliberate silent branch: the three
    // upstream Weblate namespaces have no baseline and never will. This is
    // not a statement about whether a check was available (unlike the
    // guards below) -- emitting for it would add noise to every
    // full-namespace run. See <design_notes> in 41-06-PLAN.md.
    if (!isForkOwned(namespace)) {
      continue
    }

    // Gap-closure plan 41-06 (GAP-1): a corrupt English catalog for this
    // namespace already produced a named hardFailure above -- the drift
    // check cannot run without it (missingPairs() would have nothing to
    // derive from), so this is checked FIRST, ahead of the canonical-path
    // and baseline-existence guards below, so a corrupt-en fixture reports
    // this reason rather than an incidental one.
    if (corruptEnglishNamespaces.has(namespace)) {
      result.findings.push(
        `presence baseline drift check skipped for ${namespace}: ` +
          `its English catalog could not be parsed (see the hard failure above)`
      )
      continue
    }

    if (!isCanonicalLocalesPath) {
      result.findings.push(
        `presence baseline drift check skipped for ${namespace}: localesPath ` +
          `"${opts.localesPath}" does not resolve to the canonical "${CANONICAL_LOCALES_PATH}"`
      )
      continue
    }
    if (!existsSync(baselinePath)) {
      result.findings.push(
        `presence baseline drift check skipped for ${namespace}: ` +
          `${baselinePath} does not exist`
      )
      continue
    }

    const diff = comparePresenceBaseline(opts.localesPath, baselinePath)
    for (const pair of diff.added) {
      result.hardFailures.push(
        `${pair.locale}.${namespace}.${pair.key}: a new key is not localised and was not ` +
          'recorded — fill it or regenerate the baseline'
      )
    }
    for (const pair of diff.removed) {
      result.hardFailures.push(
        `${pair.locale}.${namespace}.${pair.key}: the baseline overstates reality; ` +
          'regenerate it with LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations:gamelib'
      )
    }
  }

  return result
}

function main(): void {
  const localesPath = './public/locales'

  // REQ-41-01: regeneration is opt-in and separate from the normal gate
  // path -- it writes the one filesystem artifact this module has ever
  // written, and exits 0 unconditionally (it is not itself a pass/fail
  // check; re-running the normal path afterwards is what proves the
  // regeneration was applied correctly).
  if (process.env.LINT_TRANSLATIONS_WRITE_BASELINE === '1') {
    writePresenceBaseline(localesPath)
    return
  }

  const namespaces: Namespace[] = process.env.LINT_TRANSLATIONS_NAMESPACES
    ? process.env.LINT_TRANSLATIONS_NAMESPACES.split(',')
        .map((ns) => ns.trim())
        .filter((ns): ns is Namespace =>
          (ALL_NAMESPACES as readonly string[]).includes(ns)
        )
    : [...ALL_NAMESPACES]

  const result = lintTranslations({ localesPath, namespaces })

  result.findings.forEach((finding) => console.log(finding))
  result.hardFailures.forEach((failure) => console.log(failure))

  // REQ-41-02 (c): the exit code is derived from a counted failure set,
  // never from "did anything throw" -- and this summary line is what makes
  // the run's result readable without parsing the body above.
  console.log(
    `lint-translations[${namespaces.join(',')}]: ${result.findings.length} findings, ${result.hardFailures.length} hard failures`
  )

  if (result.hardFailures.length > 0) {
    process.exit(1)
  }
}

// Gap-closure plan 41-07 (CR-03): this comment previously claimed that the
// standard `require.main === module` idiom "would run this at import time
// under test too," and used that claim to justify relying on
// JEST_WORKER_ID alone. That claim was measured false, independently, by
// both this phase's code reviewer and its verifier: under this repo's
// ts-jest transform, a module required from inside a test file sees
// `require.main` resolve to the TEST FILE's own module, not to this
// module -- so `require.main === module` is `false` here under jest, and
// the idiom was safe all along (see 41-REVIEW.md CR-03, 41-VERIFICATION.md
// WR-01, and this plan's own re-measurement in 41-07-SUMMARY.md).
//
// `require.main === module` is ADDED, not substituted for JEST_WORKER_ID,
// because of a second, separate fact: this script is invoked as
// `node meta/runTs.cjs ... meta/lintTranslations.ts` (package.json
// `lint-translations`), and runTs.cjs compiles the entry with esbuild
// `--bundle` before spawning `node <outfile>`. Bundling collapses every
// source module into the OUTFILE's single module scope, so inside that
// bundle `require.main === module` is `true` regardless of which source
// file this top-level code originally lived in -- `require.main ===
// module` alone cannot refuse a bundled import of this module by some
// other entry point. JEST_WORKER_ID covers that hole; `require.main ===
// module` in turn covers a hole JEST_WORKER_ID never did: a non-bundled,
// non-jest import (a direct require() of a transpiled copy, an ad-hoc
// script) that reaches this file outside both the CLI bundle and jest.
// Neither condition is redundant with the other.
//
// Both conditions gate the ONLY filesystem-writing branch in this module:
// main()'s LINT_TRANSLATIONS_WRITE_BASELINE=1 path overwrites the committed
// meta/i18nCatalogPresenceBaseline.json. This project has a recorded
// incident where importing a different meta script (genI18nGateScope.ts,
// which has no entry-point guard) ran its main and overwrote the artifact
// it was supposed to be measuring -- this guard exists to keep this module
// out of that same bug class.
if (require.main === module && !process.env.JEST_WORKER_ID) {
  main()
}
