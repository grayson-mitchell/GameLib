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
 * flag: this script runs through an `esbuild --bundle | node` pipe, so argv
 * never reaches it -- the same env-var convention `meta/verifyUpdaterSigningKey.ts`
 * already uses for its own CI-facing configuration.
 */

import { readdirSync, readFileSync } from 'graceful-fs'
import { join } from 'path'

const ALL_NAMESPACES = ['gamelib', 'gamepage', 'login', 'translation'] as const
type Namespace = (typeof ALL_NAMESPACES)[number]

const namespaceScope: Namespace[] = process.env.LINT_TRANSLATIONS_NAMESPACES
  ? (process.env.LINT_TRANSLATIONS_NAMESPACES.split(',')
      .map((ns) => ns.trim())
      .filter((ns): ns is Namespace =>
        (ALL_NAMESPACES as readonly string[]).includes(ns)
      ) as Namespace[])
  : [...ALL_NAMESPACES]

// there are many extra keys in translation files without a matching
// key in the english file
//
// this is not really a problem so these messages are ignored by default
const printExtraTransations = false

const localesPath = './public/locales'

// Read a file as JSON
function readFile(fileName: string, language: string) {
  try {
    return JSON.parse(
      readFileSync(join(localesPath, language, fileName + '.json')).toString()
    )
  } catch (error) {
    console.log(error)
    return null
  }
}

// Read the 4 files for a given language
function readFiles(language: string) {
  return {
    gamelib: readFile('gamelib', language),
    gamepage: readFile('gamepage', language),
    login: readFile('login', language),
    translation: readFile('translation', language)
  }
}

const enFiles = readFiles('en')
let processingLanguage = ''
let processingFile = ''

// Run checks in string from translation against original in english file
function checkStringValueAgainstEnglish(
  trValue: string,
  enValue: string,
  parent?: string
) {
  if (trValue === '') {
    console.log(
      `Empty translation for ${processingLanguage}.${processingFile}.${parent}`
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
      console.log(
        `Missing content in translation, <X></X> tags not matching original for ${processingLanguage}.${processingFile}.${parent}.\nExpected ${enValue}\nGot: ${trValue}\n\n`
      )
    }
  }
}

// Recursive function traversing objects
function checkValueAgainstEnglish(
  trValue: string | object,
  enValue: string | object,
  parent?: string
) {
  if (typeof enValue === 'undefined') {
    if (printExtraTransations) {
      console.log(
        `Extra translation not present in english for ${processingLanguage}.${processingFile}.${parent}`
      )
    }
  } else {
    if (typeof trValue === 'string') {
      checkStringValueAgainstEnglish(trValue, enValue as string, parent)
    } else {
      for (const key in trValue) {
        checkValueAgainstEnglish(trValue[key], enValue[key], `${parent}.${key}`)
      }
    }
  }
}

// entry point to check a single translation file
function checkFileAgainstEnglish(translations: object) {
  for (const key in translations) {
    checkValueAgainstEnglish(
      translations[key],
      enFiles[processingFile][key],
      key
    )
  }
}

// entry point to check a single language
function checkLanguage(language: string) {
  const langFiles = readFiles(language)

  for (const file in langFiles) {
    // D-15 scope selector -- see the header docstring. Filtering here (not
    // in readFiles()) keeps readFiles() a plain "read everything" helper;
    // this is the one seam that decides what actually gets checked.
    if (!namespaceScope.includes(file as Namespace)) continue

    const content = langFiles[file]
    // The 48 keys catalogue 34.8-07/08a/08b/08c introduced into
    // en/gamelib.json are legitimately empty (defaultValue: '' plus
    // returnEmptyString: false plus the inline t(key, 'Default') fallback --
    // see i18next-parser.config.js and 34.8-09-PLAN.md's own <interfaces>
    // note). The existing `if (dir === 'en') return` in the readdirSync
    // loop below already excludes `en` from ever reaching this function, so
    // no separate empty-string carve-out is needed here.
    if (!content) continue

    processingFile = file
    checkFileAgainstEnglish(content)
  }
}

// loop through all translations and compare to english
readdirSync(localesPath).forEach((dir) => {
  if (dir === 'en') return

  processingLanguage = dir
  checkLanguage(dir)
})
