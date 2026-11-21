/**
 * Pure helpers for the machine-translation disclosure note and its
 * "Report a translation problem" link in `LanguageSelector` (260925-88h,
 * reworked by quick 261121-vlo).
 *
 * No React, no i18next, no window/DOM access -- kept free of side effects so
 * every function is hermetically unit-testable, matching the purity
 * convention this codebase already uses for `chipLabels.ts`/`facetLabels.ts`.
 *
 * T-vlo-01 (threat model, mitigate): the prefill is a plain string that
 * reaches the report form only through in-app router state. The form uses it
 * solely as the initial value of a React-controlled textarea; it is never
 * parsed as HTML or as a URL. This replaces the former GitHub new-issue
 * link, whose query-injection concerns retired with it.
 */

// The in-app report form (Settings > Report a problem) -- the same target the
// game page's "Report a problem" link navigates to.
const REPORT_ROUTE = '/settings/report'

// The slice of React Router's `navigate` this module needs. Kept private and
// structural so this file imports nothing from React or the router.
type NavigateToReport = (
  to: string,
  options: { state: { reportMessage: string } }
) => void

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
 * The text the report form's "What happened?" box starts with:
 * `[Translation] <label> (<code>): `. The code is included so the report names
 * the shipped locale even when the display label is ambiguous. Both values are
 * returned verbatim -- nothing is escaped or encoded, because the receiving
 * textarea is React-controlled (see the file header).
 */
export function buildTranslationReportMessage(
  code: string,
  label: string
): string {
  return `[Translation] ${label} (${code}): `
}

/**
 * Opens the in-app report form with the language prefilled, through route
 * state, instead of leaving the app.
 */
export function reportTranslationProblem(
  navigate: NavigateToReport,
  code: string,
  label: string
): void {
  navigate(REPORT_ROUTE, {
    state: { reportMessage: buildTranslationReportMessage(code, label) }
  })
}
