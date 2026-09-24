/**
 * quick-260925-bq4: proves, against a REAL `i18next.createInstance()` reading
 * the real `public/locales` catalogs, that every shipped language resolves its
 * own plural forms.
 *
 * Nothing else in the repo can see this defect. `lint-translations` compares key
 * SETS and is blind to which language a resolved string is actually in; no gate
 * detects English drift. The bug it guards -- `Intl.PluralRules('nb_NO')`
 * throwing, i18next swallowing the throw, and every counted string falling
 * through to English for `nb_NO`/`pt_BR`/`zh_Hans`/`zh_Hant` -- shipped silently
 * and grows with every new plural key. See `src/common/languages.ts`'s
 * `toI18nextCode` header for the full mechanism.
 *
 * `src/common`'s jest project has no `__mocks__/i18next.ts` shadowing the real
 * package (unlike the backend project, whose mock echoes keys), so no
 * `jest.unmock('i18next')` is needed here. Every instance below is a fresh
 * `createInstance()`, never the process-wide singleton -- the precedent set by
 * `chipLabels.realI18next.test.ts` and `gamelibNamespaceLoad.test.ts`.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createInstance } from 'i18next'
import Backend from 'i18next-fs-backend'
import {
  i18nextLanguageOptions,
  supportedLanguages,
  supportedLanguageTags,
  toI18nextCode,
  toShippedLanguage
} from '../languages'

// src/common/__tests__/ -> src/common -> src -> repo root.
const REPO_ROOT = join(__dirname, '..', '..', '..')
const LOCALES_DIR = join(REPO_ROOT, 'public', 'locales')

// Fail loudly before any test runs if the depth above is wrong -- otherwise
// every locale below would resolve to a bare key and the suite would look like
// a real catch instead of a path bug. Same guard as chipLabels.realI18next.
if (!existsSync(join(LOCALES_DIR, 'en', 'gamelib.json'))) {
  throw new Error(
    `languages.realI18next.test.ts: expected ${join(LOCALES_DIR, 'en', 'gamelib.json')} -- ` +
      'REPO_ROOT depth is wrong, fix the join(__dirname, ...) chain above.'
  )
}

// A key that IS pluralised in every catalog and carries a visible {{count}}.
// Namespace-qualified: both init sites use `defaultNS: 'translation'`, and this
// key lives in `gamelib`. Unqualified it resolves to a BARE KEY in every
// language including English -- which would make the negative control below
// pass vacuously (bare key === bare key). That is not hypothetical: it is how
// this file was first written, and the vacuous pass is what `ENGLISH_FRAGMENT`
// now rules out, by requiring the English instance to be producing real text
// before any comparison against it means anything.
const PLURAL_KEY = 'gamelib:humbleKeys.cooldown'
const ENGLISH_FRAGMENT = 'retry in'

// The four whose directory name is not a valid BCP-47 tag -- the whole reason
// this file exists.
const UNDERSCORE_LANGUAGES = ['nb_NO', 'pt_BR', 'zh_Hans', 'zh_Hant'] as const

/**
 * Builds an instance the way the app does: options from
 * `i18nextLanguageOptions`, and a `loadPath` that maps the resolved BCP-47 code
 * back to its directory via `toShippedLanguage` -- exactly the two halves both
 * init sites use.
 */
async function initLikeTheApp(language: string) {
  const instance = createInstance()
  await instance.use(Backend).init({
    backend: {
      loadPath: (lng: string, ns: string) =>
        join(LOCALES_DIR, toShippedLanguage(lng), `${ns}.json`)
    },
    ...i18nextLanguageOptions(language),
    fallbackLng: 'en',
    ns: ['translation', 'gamelib'],
    defaultNS: 'translation',
    returnEmptyString: false,
    returnNull: false,
    initImmediate: false
  })
  return instance
}

describe('shipped language codes resolve plural rules (quick-260925-bq4)', () => {
  it('every supported language yields a usable plural rule once converted', () => {
    for (const language of supportedLanguages) {
      const tag = toI18nextCode(language)

      // The exact call i18next's PluralResolver.getRule makes. It must not
      // throw, and it must offer at least one category to select.
      const categories = new Intl.PluralRules(tag).resolvedOptions()
        .pluralCategories

      expect(categories.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('the converted tag round-trips back to the shipped directory name', () => {
    for (const language of supportedLanguages) {
      expect(toShippedLanguage(toI18nextCode(language))).toBe(language)
    }
  })

  it('every tag in supportedLngs maps back to a locale directory that exists', () => {
    // Guards the loadPath half: a tag whose inverse names no directory would
    // load nothing and fall through to English, reproducing the bug by a
    // different route.
    for (const tag of supportedLanguageTags) {
      expect(existsSync(join(LOCALES_DIR, toShippedLanguage(tag)))).toBe(true)
    }
  })

  it('an absent language does not throw -- it stays undefined for fallbackLng', () => {
    // How this fix first broke. `GlobalConfig`'s `language` is typed `string`
    // but is absent in a fresh config; it used to reach i18next as
    // `lng: undefined`, meaning "use fallbackLng". A throwing converter aborted
    // the sidecar's entire init from inside its try block, leaving `t()`
    // returning undefined for every backend string -- caught by
    // shellFilesFlows.test.ts as a `null` dialog title, three layers away from
    // the cause.
    expect(() => toI18nextCode(undefined)).not.toThrow()
    expect(toI18nextCode(undefined)).toBeUndefined()
    expect(toShippedLanguage(undefined)).toBeUndefined()
    expect(i18nextLanguageOptions(undefined)).toEqual({
      lng: undefined,
      supportedLngs: supportedLanguageTags
    })
  })

  it('an unrecognised code passes through toShippedLanguage untouched', () => {
    // i18next appends `cimode` to supportedLngs itself, and a future tag may
    // carry a hyphen that is not a directory separator. Neither may be
    // rewritten into a directory name that does not exist.
    expect(toShippedLanguage('cimode')).toBe('cimode')
    expect(toShippedLanguage('en')).toBe('en')
    expect(toShippedLanguage('de-AT')).toBe('de-AT')
  })

  describe('the four underscore-named locales', () => {
    it.each(UNDERSCORE_LANGUAGES)(
      '%s selects its own plural variant instead of falling back to English',
      async (language) => {
        const instance = await initLikeTheApp(language)
        const english = await initLikeTheApp('en')

        for (const count of [1, 5]) {
          const resolved = instance.t(PLURAL_KEY, { count })

          // Non-vacuous: the key must actually have resolved (not a bare key),
          // the English instance must be giving real English text, and the two
          // must differ for the same count.
          const englishText = english.t(PLURAL_KEY, { count })
          expect(englishText).toContain(ENGLISH_FRAGMENT)

          expect(resolved).not.toBe(PLURAL_KEY)
          expect(resolved).not.toContain(ENGLISH_FRAGMENT)
          expect(resolved).not.toBe(englishText)
          expect(resolved).toContain(String(count))
        }
      }
    )

    it.each(UNDERSCORE_LANGUAGES)(
      '%s resolves a plural rule and a non-empty suffix through the live resolver',
      async (language) => {
        const instance = await initLikeTheApp(language)
        const resolver = instance.services.pluralResolver
        const tag = toI18nextCode(language)

        expect(resolver.getRule(tag)).toBeDefined()
        expect(resolver.getSuffix(tag, 5)).not.toBe('')
      }
    )

    it.each(UNDERSCORE_LANGUAGES)(
      '%s does not drag its bare language part into the resolve hierarchy',
      async (language) => {
        // Without supportedLngs, 'nb-NO' resolves to ["nb-NO","nb","en"] and the
        // backend goes looking for a locales/nb/ directory that does not exist.
        const instance = await initLikeTheApp(language)
        const tag = toI18nextCode(language)

        const hierarchy =
          instance.services.languageUtils.toResolveHierarchy(tag)

        // `pt-BR` legitimately yields ["pt-BR","pt","en"] -- `pt` is itself a
        // shipped language with its own catalog, so falling back to it before
        // English is correct and desirable. What must never happen is a code in
        // the chain with NO directory behind it (`nb`, `zh`), which is what
        // dropping supportedLngs would produce.
        expect(hierarchy[0]).toBe(tag)
        expect(hierarchy[hierarchy.length - 1]).toBe('en')
        for (const code of hierarchy) {
          expect(existsSync(join(LOCALES_DIR, toShippedLanguage(code)))).toBe(
            true
          )
        }
      }
    )
  })

  // Kept permanently, per the precedent in chipLabels.realI18next.test.ts: the
  // strongest answer to "does the assertion above actually distinguish anything"
  // is showing the SAME key resolve two different ways under the two
  // configurations. This is the pre-fix configuration -- raw underscore `lng`,
  // underscore `supportedLngs` -- and it is what shipped.
  describe('negative control -- the configuration this fix replaced', () => {
    it.each(UNDERSCORE_LANGUAGES)(
      '%s DID fall through to English with the raw underscore code',
      async (language) => {
        const instance = createInstance()
        await instance.use(Backend).init({
          backend: {
            loadPath: (lng: string, ns: string) =>
              join(LOCALES_DIR, lng, `${ns}.json`)
          },
          lng: language,
          supportedLngs: [...supportedLanguages],
          fallbackLng: 'en',
          ns: ['translation', 'gamelib'],
          defaultNS: 'translation',
          returnEmptyString: false,
          returnNull: false,
          initImmediate: false
        })
        const english = await initLikeTheApp('en')

        // Non-vacuity first: the English instance must be returning REAL
        // English text, not a bare key. Without this the equality below is
        // satisfied by two identical bare keys and proves nothing.
        const englishText = english.t(PLURAL_KEY, { count: 5 })
        expect(englishText).toContain(ENGLISH_FRAGMENT)

        // No plural rule, empty suffix, and the English string comes back --
        // the three symptoms, all at once.
        expect(
          instance.services.pluralResolver.getRule(language)
        ).toBeUndefined()
        expect(instance.services.pluralResolver.getSuffix(language, 5)).toBe('')
        expect(instance.t(PLURAL_KEY, { count: 5 })).toBe(englishText)
      }
    )
  })
})
