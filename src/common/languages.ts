// `as const` here is load-bearing, not stylistic. Without it,
// `(typeof supportedLanguages)[number]` widens to `string`, and
// `Record<SupportedLanguage, string>` in
// `src/frontend/components/UI/LanguageSelector/index.tsx` degrades into a plain
// index signature -- the compiler gate that map depends on to catch a missing or
// extra language key would silently stop catching anything. Nothing enforces
// this constraint staying in place; it is discipline, in the same register as
// this repo's other unenforceable invariants.
export const supportedLanguages = [
  'ar',
  'az',
  'be',
  'bg',
  'bs',
  'ca',
  'cs',
  'de',
  'el',
  'en',
  'es',
  'et',
  'eu',
  'fa',
  'fi',
  'fr',
  'ga',
  'gl',
  'he',
  'hr',
  'hu',
  'ja',
  'ko',
  'id',
  'it',
  'lt',
  'ml',
  'nb_NO',
  'nl',
  'pl',
  'pt',
  'pt_BR',
  'ro',
  'ru',
  'sr',
  'sk',
  'sv',
  'ta',
  'tr',
  'uk',
  'vi',
  'zh_Hans',
  'zh_Hant'
] as const

export type SupportedLanguage = (typeof supportedLanguages)[number]

/**
 * The four underscore-named entries above (`nb_NO`, `pt_BR`, `zh_Hans`,
 * `zh_Hant`) are DIRECTORY names, not language tags. `Intl.PluralRules('nb_NO')`
 * throws `RangeError: Invalid language tag`, and i18next 22.5.1's
 * `PluralResolver.getRule` passes the code straight in and swallows that throw
 * (`return new Intl.PluralRules(code, ...)` / `catch { return; }` -- the
 * `getCleanedCode` normaliser that would fix this only exists from i18next v23).
 * With no rule, `getSuffix` returns `''`, the lookup becomes the UNSUFFIXED key,
 * that key exists in no catalog (only `_one`/`_other` do), and `resolve()` walks
 * on to `fallbackLng: 'en'` -- where it recomputes the suffix for `en` and hits.
 *
 * So the symptom is not "plurals render badly" but "every counted string renders
 * in ENGLISH" for those four languages. Measured on `humbleKeys.cooldown`
 * (quick-260925-bq4).
 *
 * The directory names stay as they are: they are the on-disk layout in two trees,
 * they are the value persisted as `language` in configStore, they key
 * `languageLabels`/`languageFlags` in `LanguageSelector`, and four `meta/` locale
 * tools walk them. Instead, convert at the boundary -- `toI18nextCode` going IN
 * to i18next, `toShippedLanguage` coming back OUT of `i18n.language`.
 */
export function toI18nextCode(lng: string): string
export function toI18nextCode(lng: string | undefined): string | undefined
/**
 * Nullish-tolerant by necessity, not by habit. `GlobalConfig`'s `language` is
 * typed `string` but is genuinely absent in a fresh config, and it used to be
 * handed to i18next as `lng: undefined`, which simply means "use fallbackLng".
 * A version of this that threw on undefined aborted the sidecar's whole
 * `i18next.init()` from inside its try block -- measured:
 * `shellFilesFlows.test.ts`'s clearCache dialog title went from resolved text
 * to `null`, because `t()` on an uninitialised instance returns undefined.
 */
export function toI18nextCode(lng: string | undefined): string | undefined {
  return lng?.replace('_', '-')
}

/** BCP-47 tag -> shipped code, built from `supportedLanguages` itself. */
const SHIPPED_BY_TAG = new Map<string, SupportedLanguage>(
  supportedLanguages.map((lng) => [toI18nextCode(lng), lng])
)

/**
 * Inverse of {@link toI18nextCode}.
 *
 * Deliberately a lookup against `supportedLanguages`, NOT a blind `-` -> `_`
 * replace: an unrecognised code (i18next's `cimode`, or a future tag whose
 * hyphen is not a directory separator) passes through untouched rather than
 * being corrupted into a directory name that does not exist.
 */
export function toShippedLanguage(code: string): string
export function toShippedLanguage(code: string | undefined): string | undefined
export function toShippedLanguage(
  code: string | undefined
): string | undefined {
  return code === undefined ? undefined : (SHIPPED_BY_TAG.get(code) ?? code)
}

/**
 * `supportedLngs` for both i18next init sites.
 *
 * This is load-bearing in BOTH directions and must stay in step with `lng`.
 * Measured against i18next 22.5.1's `toResolveHierarchy`:
 *
 * - `lng: 'nb-NO'` with the UNDERSCORE list here resolves to `["en"]` -- the
 *   locale is filtered out entirely and everything, not just plurals, goes
 *   English. That is worse than the bug this fixes.
 * - `lng: 'nb-NO'` with this list resolves to `["nb-NO", "en"]`.
 * - Dropping `supportedLngs` altogether resolves to `["nb-NO", "nb", "en"]`,
 *   which sends the backend looking for a `locales/nb/` directory that does not
 *   exist. Do not remove it from either init.
 */
// The arrow is load-bearing: passing `toI18nextCode` point-free makes overload
// resolution pick the `string | undefined` signature (Array.map's callback is
// checked against the widest overload), yielding `(string | undefined)[]`.
export const supportedLanguageTags: string[] = supportedLanguages.map((lng) =>
  toI18nextCode(lng)
)

/**
 * The language half of an i18next `init()` call, shared by the renderer
 * (`src/frontend/index.tsx`) and the sidecar
 * (`src/backend/sidecar/bootstrap.ts`) so the two cannot drift apart -- and so
 * `languages.realI18next.test.ts` exercises the same options the app runs
 * rather than a hand-rolled copy of them.
 *
 * @param language the SHIPPED code (a `supportedLanguages` member / directory name)
 */
export function i18nextLanguageOptions(language: string | undefined): {
  lng: string | undefined
  supportedLngs: string[]
} {
  return {
    lng: toI18nextCode(language),
    supportedLngs: supportedLanguageTags
  }
}
