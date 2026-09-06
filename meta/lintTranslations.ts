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
 */

import { readdirSync, readFileSync } from 'graceful-fs'
import { join } from 'path'

const ALL_NAMESPACES = ['gamelib', 'gamepage', 'login', 'translation'] as const
type Namespace = (typeof ALL_NAMESPACES)[number]

// there are many extra keys in translation files without a matching
// key in the english file
//
// this is not really a problem so these messages are ignored by default
const printExtraTransations = false

type CatalogRecord = Record<string, unknown>

export interface LintOptions {
  localesPath: string
  namespaces: Namespace[]
}

export interface LintResult {
  findings: string[]
  hardFailures: string[]
}

// Read a file as JSON
export function readCatalog(
  localesPath: string,
  language: string,
  namespace: Namespace
): CatalogRecord | null {
  try {
    return JSON.parse(
      readFileSync(join(localesPath, language, namespace + '.json')).toString()
    )
  } catch (error) {
    console.log(error)
    return null
  }
}

// Read the given namespaces for a language
export function readCatalogs(
  localesPath: string,
  language: string,
  namespaces: readonly Namespace[]
): Partial<Record<Namespace, CatalogRecord | null>> {
  const result: Partial<Record<Namespace, CatalogRecord | null>> = {}
  for (const namespace of namespaces) {
    result[namespace] = readCatalog(localesPath, language, namespace)
  }
  return result
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

// entry point to check a single language
export function checkLanguage(
  language: string,
  enCatalogs: Partial<Record<Namespace, CatalogRecord | null>>,
  opts: LintOptions
): LintResult {
  const result: LintResult = { findings: [], hardFailures: [] }
  const langCatalogs = readCatalogs(opts.localesPath, language, ALL_NAMESPACES)

  for (const namespace of ALL_NAMESPACES) {
    // D-15 scope selector -- see the header docstring. Filtering here (not
    // in readCatalogs()) keeps readCatalogs() a plain "read everything"
    // helper; this is the one seam that decides what actually gets checked.
    if (!opts.namespaces.includes(namespace)) continue

    const content = langCatalogs[namespace]
    // Measured at HEAD (2026-09-06): 6 of the 48 keys catalogued by
    // 34.8-07/08a/08b/08c in en/gamelib.json were empty. Plan 41-01
    // (REQ-41-03) authored all six, taking en/gamelib.json to 0 empty
    // values -- there is deliberately no "legitimately empty" exemption
    // register any more. The `if (dir === 'en') return` in
    // lintTranslations() below already excludes `en` from ever reaching
    // this function.
    if (!content) continue

    const enCatalog = enCatalogs[namespace]
    checkFileAgainstEnglish(
      content,
      enCatalog as CatalogRecord,
      language,
      namespace,
      result
    )
  }

  return result
}

// the whole run: walks every locale directory (except `en`) and checks it
// against the English source
export function lintTranslations(opts: LintOptions): LintResult {
  const enCatalogs = readCatalogs(opts.localesPath, 'en', ALL_NAMESPACES)
  const result: LintResult = { findings: [], hardFailures: [] }

  readdirSync(opts.localesPath).forEach((dir) => {
    if (dir === 'en') return

    const langResult = checkLanguage(dir, enCatalogs, opts)
    result.findings.push(...langResult.findings)
    result.hardFailures.push(...langResult.hardFailures)
  })

  return result
}

function main(): void {
  const localesPath = './public/locales'
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

  if (result.hardFailures.length > 0) {
    process.exit(1)
  }
}

// This script is run via `node meta/runTs.cjs` (package.json
// `lint-translations`), which DOES set `require.main` -- but this module is
// also imported directly by its jest suite, so the usual
// `require.main === module` idiom would run this at import time under test
// too. JEST_WORKER_ID is set by Jest for every worker (including
// --runInBand).
if (!process.env.JEST_WORKER_ID) {
  main()
}
