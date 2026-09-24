/**
 * Pure helpers for the machine-translation disclosure note and its
 * "Report a translation problem" link in `LanguageSelector` (260925-88h).
 *
 * No React, no i18next, no window/DOM access -- kept free of side effects so
 * both functions are hermetically unit-testable, matching the purity
 * convention this codebase already uses for `chipLabels.ts`/`facetLabels.ts`.
 *
 * T-88h-01 (threat model, mitigate): the issue URL's origin and pathname are
 * CONSTANTS -- every caller-supplied value (`code`, `label`) is encoded
 * strictly as a QUERY VALUE via `URLSearchParams`, never concatenated into
 * the path. A hostile `code`/`label` containing `&`, `#`, `/`, or any other
 * URL-special character stays inside its own encoded query value and can
 * neither add a new parameter nor change the host/path.
 */

export const GAMELIB_ISSUES_NEW_URL =
  'https://github.com/grayson-mitchell/GameLib/issues/new'

const TRANSLATION_ISSUE_TEMPLATE = 'translation_problem.yaml'

/**
 * The MT-disclosure note and report link show for every language except
 * English itself -- 'en', and any regional/script variant spelled with a
 * '-' or '_' separator ('en-US', 'en_GB', ...). Never throws on an empty or
 * unusual code; anything that is not recognisably an English variant is
 * treated as non-English (shows the notice), which is the safe default: a
 * FALSE NEGATIVE here would hide the notice from a genuinely
 * machine-translated language, which is the worse failure mode.
 */
export function shouldShowMtNotice(lang: string): boolean {
  if (!lang) return false
  const normalized = lang.toLowerCase()
  if (normalized === 'en') return false
  if (normalized.startsWith('en-') || normalized.startsWith('en_')) {
    return false
  }
  return true
}

/**
 * Builds the prefilled "Report a translation problem" GitHub issue URL.
 * `code` and `label` are ordinary display/interpolation values -- see the
 * file header's T-88h-01 note for why neither can escape its query-value
 * position no matter what characters they contain.
 */
export function buildTranslationIssueUrl(code: string, label: string): string {
  const url = new URL(GAMELIB_ISSUES_NEW_URL)
  url.searchParams.set('template', TRANSLATION_ISSUE_TEMPLATE)
  url.searchParams.set('language', `${label} (${code})`)
  url.searchParams.set('title', `[Translation] ${label}: `)
  return url.toString()
}
