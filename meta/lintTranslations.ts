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
    raw = readFileSync(join(localesPath, language, namespace + '.json')).toString()
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
  }

  return result
}

// the whole run: walks every locale directory (except `en`) and checks it
// against the English source
export function lintTranslations(opts: LintOptions): LintResult {
  // Scope-aware read for the English source too (REQ-41-02 (a)) -- an
  // out-of-scope namespace's English catalog is never opened either.
  const enCatalogs = readCatalogs(opts.localesPath, 'en', opts.namespaces)
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

// This script is run via `node meta/runTs.cjs` (package.json
// `lint-translations`), which DOES set `require.main` -- but this module is
// also imported directly by its jest suite, so the usual
// `require.main === module` idiom would run this at import time under test
// too. JEST_WORKER_ID is set by Jest for every worker (including
// --runInBand).
if (!process.env.JEST_WORKER_ID) {
  main()
}
