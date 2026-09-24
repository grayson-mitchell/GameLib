import { globSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  validateTranslation,
  countIsOptionalFor,
  englishSourceFor,
  requiredPluralKeys,
  pluralCategoriesFor,
  type MtManifest
} from '../machineFillGamelib'

/**
 * D-08/D-09/D-10 parity gate over every COMMITTED `gamelib.json`.
 *
 * Plan 12 fills `de` and `fr`; the remaining 46 locales land later as a
 * separate revertible commit. This suite discovers locales by globbing and
 * deliberately asserts NO locale count, so that bulk commit is covered the
 * moment it lands, with no edit here -- a hardcoded count would go red on
 * the bulk fill for no good reason.
 *
 * The placeholder/plural/glossary rules are NOT re-implemented: the check
 * reuses `validateTranslation`, the same function the fill itself runs, so
 * the committed result is held to exactly the rule the producer applied.
 */

const LOCALES_DIR = join('public', 'locales')

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

type Catalog = { [key: string]: string | Catalog }

function flatten(catalog: Catalog, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(catalog)) {
    const keyPath = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') {
      out[keyPath] = value
    } else {
      Object.assign(out, flatten(value, keyPath))
    }
  }
  return out
}

const glossary = readJson<{ terms: string[] }>(
  join('meta', 'i18nGlossary.json')
).terms

const catalogPaths = globSync(join(LOCALES_DIR, '*', 'gamelib.json')).sort()
const manifestPaths = globSync(join(LOCALES_DIR, '*', 'gamelib.mt.json')).sort()

const localeOf = (path: string) => basename(dirname(path))
const englishPath = join(LOCALES_DIR, 'en', 'gamelib.json')
const english = flatten(readJson<Catalog>(englishPath))

const translatedPaths = catalogPaths.filter((p) => localeOf(p) !== 'en')

describe('gamelib catalog parity', () => {
  it('discovers the English source catalog', () => {
    expect(catalogPaths).toContain(englishPath)
    expect(Object.keys(english).length).toBeGreaterThan(0)
  })

  // No locale-count assertion here on purpose -- see the file header.
  //
  // The orphan check below reuses `englishSourceFor` -- the SAME resolver
  // `collectMissingKeys`/`fillLocale` use -- instead of a raw `english[keyPath]`
  // lookup, so a CLDR-sibling key a locale legitimately needs (e.g. ru's
  // `_few`/`_many`, which `en` itself never authors) is validated against
  // en's `_other` fallback rather than flagged as an orphan.
  it.each(translatedPaths)('%s honours every source rule', (path) => {
    const locale = localeOf(path)
    const translated = flatten(readJson<Catalog>(path))
    const failures: string[] = []

    for (const [keyPath, target] of Object.entries(translated)) {
      if (target === '') continue // an unfilled key falls back to English

      const source = englishSourceFor(keyPath, english)
      if (source === undefined) {
        failures.push(
          `${locale}: '${keyPath}' is not a key in en/gamelib.json (orphaned translation)`
        )
        continue
      }

      const countOptional = countIsOptionalFor(keyPath, locale, english)
      for (const problem of validateTranslation(source, target, glossary, {
        countOptional
      })) {
        failures.push(`${locale}: '${keyPath}' -- ${problem}`)
      }
    }

    expect(failures).toEqual([])
  })

  // Generalises the old pairwise _one/_other check to N-way CLDR groups:
  // `requiredPluralKeys` (the producer's own rule) returns the union of en's
  // own suffixes and THIS locale's CLDR categories -- e.g. ru needs
  // one/few/many/other, ja needs only one/other. A plural group must be
  // fully present or fully absent in the committed catalog; a locale is
  // never allowed to ship half a group, because i18next would silently fall
  // through to English for any count whose category is missing.
  it.each(translatedPaths)(
    '%s keeps each plural group fully present or fully absent, per its own required CLDR forms',
    (path) => {
      const locale = localeOf(path)
      const translated = flatten(readJson<Catalog>(path))
      const problems: string[] = []

      const bases = new Set<string>()
      for (const keyPath of Object.keys(english)) {
        const match = keyPath.match(/^(.*)_(zero|one|two|few|many|other)$/)
        if (!match) continue
        if (english[`${match[1]}_other`] === undefined) continue
        bases.add(match[1])
      }

      for (const base of bases) {
        const required = requiredPluralKeys(base, english, locale)
        const present = required.filter((k) => Boolean(translated[k]))

        if (present.length !== 0 && present.length !== required.length) {
          problems.push(
            `${locale}: plural group '${base}' is partially present (has ${present.join(', ')}; needs ${required.join(', ')})`
          )
        }
      }

      expect(problems).toEqual([])
    }
  )

  // Non-vacuity proof for pluralCategoriesFor itself, over the real
  // catalog's own bases -- every locale this suite discovers resolves to a
  // real, non-empty CLDR category set (or the fixed `en`-shaped default of
  // one/other via requiredPluralKeys' union fallback), so the group check
  // above is never silently skipping every locale for want of categories.
  it('pluralCategoriesFor resolves every discovered locale to a non-empty category set', () => {
    for (const path of translatedPaths) {
      const locale = localeOf(path)
      expect(pluralCategoriesFor(locale)).not.toBeNull()
      expect(pluralCategoriesFor(locale)!.length).toBeGreaterThan(0)
    }
  })
})

// Shared by both assertions below so the live check and its non-vacuity
// proof can never drift apart -- two separately-written predicates would
// let the live check rot while the sabotage check stayed green.
function findEmptyEnglishKeys(catalog: Record<string, string>): string[] {
  return Object.entries(catalog)
    .filter(([, value]) => value === '')
    .map(([key]) => key)
}

// English source completeness (REQ-41-03)
//
// An empty English value is precisely what makes a key un-fillable --
// machine-fill skips any key whose English source is empty, so it renders
// English in every locale and can never be translated. This is an
// AUTHORING gap in `en`, not a translation gap, and REQ-41-01's inverted
// presence check (plan 41-05) is only allowed to key off `en` being
// non-empty because this block keeps that true.
//
// Accepted trade-off: `pnpm i18n` writes `defaultValue: ''`
// (i18next-parser.config.js:22) for any key whose `t()` default is a
// VARIABLE rather than a string literal, so this assertion WILL go red the
// next time such a key is minted. That is a TRUE POSITIVE by REQ-41-03's
// own definition -- an empty English value is un-localisable -- and the
// remedy is to author the string, exactly as plan 41-01 did for the six
// `redeemKey.*` keys this block was added alongside.
//
// Deliberately no exemption list: the comment at meta/lintTranslations.ts
// (around checkLanguage()) claims 48 "legitimately empty" keys exist by
// design; only 6 existed when this block was written (2026-09-06) and
// plan 41-01 authored all six. Plan 41-03 corrects that stale comment.
//
// `pnpm i18n` idempotence, measured 2026-09-06 (plan 41-01, Task 3): run
// against a tarred snapshot of public/locales, `pnpm i18n` left
// en/gamelib.json BYTE-IDENTICAL to the committed authored file -- git
// reported zero changed paths under public/locales/, and the six
// redeemKey.* values (and all 224 keys / 0 empty values) were unchanged.
// `pnpm i18n` is value-preserving for pre-authored keys; this assertion is
// what would catch a future reversion, not a parser-config change.
describe('English source completeness (REQ-41-03)', () => {
  it('has zero empty-string values in the committed English catalog', () => {
    const emptyKeys = findEmptyEnglishKeys(english)
    expect(emptyKeys).toEqual([])
  })

  it('is non-vacuous -- the shared predicate catches a sabotaged empty value', () => {
    const sabotaged = { ...english, 'redeemKey.error': '' }
    expect(findEmptyEnglishKeys(sabotaged)).toEqual(['redeemKey.error'])
  })

  it('actually read the catalog -- guards against a truncated/empty file making the first assertion vacuously true', () => {
    expect(Object.keys(english).length).toBeGreaterThan(200)
  })
})

describe('machine-translation provenance', () => {
  it('never ships a provenance sidecar without its catalog', () => {
    const orphaned = manifestPaths.filter(
      (path) => !catalogPaths.includes(join(dirname(path), 'gamelib.json'))
    )
    expect(orphaned).toEqual([])
  })

  it('never claims MT provenance for the English source catalog', () => {
    // en is authored, never machine-filled -- a sidecar here would mislabel
    // hand-written source copy as model output.
    expect(manifestPaths.map(localeOf)).not.toContain('en')
  })

  it.each(manifestPaths)('%s lists only keys that still exist', (path) => {
    const manifest = readJson<MtManifest>(path)
    const catalog = flatten(
      readJson<Catalog>(join(dirname(path), 'gamelib.json'))
    )

    // Stale provenance is what would make a future Weblate import mislabel
    // a human translation as machine output.
    const stale = manifest.keys.filter((key) => catalog[key] === undefined)
    expect(stale).toEqual([])
  })

  it.each(manifestPaths)('%s is stamped with its own locale', (path) => {
    const manifest = readJson<MtManifest>(path)
    expect(manifest.locale).toBe(localeOf(path))
    expect(manifest.model).not.toBe('')
    expect(Date.parse(manifest.filledAt)).not.toBeNaN()
  })
})
