/**
 * Single source of truth for the Humble login-chrome CSS text and its
 * hostname predicate (quick task 260822-di1). Both login surfaces (the
 * Electron `<webview>`, `screens/WebView/components/humbleLoginChromeCss.ts`,
 * and the Tauri login child window, `src-tauri/src/main.rs`'s
 * `login_chrome_css_script()`) import or drift-pin against this file's
 * exports so the CSS text and the host-scoping logic each exist in exactly
 * ONE place. Home chosen deliberately: `src/common/humble/` already hosts
 * modules imported by both the frontend (`screens/Humble/**`) and the
 * backend, and their unit suites already live under
 * `src/backend/humble/__tests__/` — this follows that precedent rather than
 * inventing a new location. Not added to `src/backend/humble/constants.ts`:
 * that file is backend-only Humble domain config, and the frontend must be
 * able to import this module without pulling the backend graph in.
 *
 * D-1 (declined scope): the optional `.base-main-wrapper` / `.inner-main-wrapper`
 * spacing tighten from the task brief is NOT included. There is no measured
 * baseline for those wrappers' current padding, so any override would be an
 * unverifiable guess, and an `!important` padding override on a wrapper that
 * hosts the React-rendered login form is exactly the class of change that
 * shifts layout unpredictably. Hiding the footer alone already achieves the
 * de-clutter goal this task exists for; a second rule is a one-line append to
 * `HUMBLE_LOGIN_CHROME_CSS` later, with the drift pin already in place to
 * keep both sides honest.
 *
 * D-3 (host-gate ordering, carried into both consumers): the hostname check
 * runs BEFORE any idempotence flag or DOM work on the consuming side, so a
 * non-participating document (`accounts.google.com`, or any other host this
 * runner-agnostic login window opens) is left with zero trace at all.
 */

/** The single CSS rule (D-1) — nothing else. */
export const HUMBLE_LOGIN_CHROME_CSS =
  'footer.site-footer { display: none !important; }'

/** Exact-match host. */
export const HUMBLE_LOGIN_CHROME_HOST = 'humblebundle.com'

/**
 * Suffix used to match subdomains (e.g. `www.humblebundle.com`). Anchored at
 * the END of the hostname via `.slice(-length)`, never a substring test —
 * a substring test (`indexOf`) would also match the look-alike host
 * `humblebundle.com.evil.example`, which is exactly the case
 * `isHumbleLoginChromeHost` below exists to reject. Implemented as
 * `hostname.slice(-HUMBLE_LOGIN_CHROME_HOST_SUFFIX.length) ===
 * HUMBLE_LOGIN_CHROME_HOST_SUFFIX` deliberately, so the identical expression
 * shape can be transliterated into the Rust-side injected JS
 * (`login_chrome_css_script`) byte-for-byte.
 */
export const HUMBLE_LOGIN_CHROME_HOST_SUFFIX = '.humblebundle.com'

/**
 * True only when `hostname` equals `HUMBLE_LOGIN_CHROME_HOST` exactly, or
 * ends with `HUMBLE_LOGIN_CHROME_HOST_SUFFIX`. See the suffix constant's own
 * doc comment for why this is anchored rather than a substring test.
 */
export function isHumbleLoginChromeHost(hostname: string): boolean {
  if (hostname === HUMBLE_LOGIN_CHROME_HOST) {
    return true
  }
  return (
    hostname.slice(-HUMBLE_LOGIN_CHROME_HOST_SUFFIX.length) ===
    HUMBLE_LOGIN_CHROME_HOST_SUFFIX
  )
}

/**
 * Parses `url` and returns `HUMBLE_LOGIN_CHROME_CSS` when its hostname
 * qualifies, `null` otherwise. Never throws — an Electron `<webview>`
 * returns `''` from `getURL()` before its first navigation, and this must be
 * safe to call with that value.
 */
export function humbleLoginChromeCssForUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url)
    return isHumbleLoginChromeHost(hostname) ? HUMBLE_LOGIN_CHROME_CSS : null
  } catch {
    return null
  }
}
