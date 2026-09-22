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
