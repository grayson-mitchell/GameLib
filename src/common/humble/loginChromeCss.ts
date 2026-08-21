/**
 * Single source of truth for the Humble login-chrome CSS text and its
 * hostname predicate (quick task 260822-di1, extended by 260822-eib). Both
 * login surfaces (the Electron `<webview>`,
 * `screens/WebView/components/humbleLoginChromeCss.ts`, and the Tauri login
 * child window, `src-tauri/src/main.rs`'s `login_chrome_css_script()`)
 * import or drift-pin against this file's exports so the CSS text and the
 * host-scoping logic each exist in exactly ONE place. Home chosen
 * deliberately: `src/common/humble/` already hosts modules imported by both
 * the frontend (`screens/Humble/**`) and the backend, and their unit suites
 * already live under `src/backend/humble/__tests__/` — this follows that
 * precedent rather than inventing a new location. Not added to
 * `src/backend/humble/constants.ts`: that file is backend-only Humble domain
 * config, and the frontend must be able to import this module without
 * pulling the backend graph in.
 *
 * Two rules, both full-width page chrome around the login form (260822-eib):
 * `footer.site-footer` (di1) and `.simple-navbar` (eib). A live fetch of
 * Humble's CSS bundle on 2026-08-22 confirmed `.simple-navbar` sets
 * `background:#3b3e48`, `height:4.375em`, `width:100%` and flex centering,
 * and its only content is the Humble logo link — nothing else. Shipped as
 * TWO separate rules rather than a comma-joined selector list: a
 * comma-joined list is a single declaration block, so a CSS syntax error
 * anywhere in the list drops the whole rule and both hidings fail together,
 * whereas separate rules fail independently — the same fail-safe reasoning
 * that made di1 choose CSS over DOM surgery.
 *
 * The navbar's Humble logo was previously treated (by di1) as a partial
 * authenticity cue worth keeping. That reasoning is superseded (D-5,
 * 260822-eib): this is an OS-level child webview the user reached from
 * inside GameLib, its origin is already shown by `login_origin_banner_script`,
 * and a logo rendered by the page itself was never a signal a phisher could
 * not also render. Do not re-add the navbar on authenticity grounds.
 *
 * D-1 (declined scope, still declined): the optional `.base-main-wrapper` /
 * `.inner-main-wrapper` spacing tighten from the original task brief is NOT
 * included. There is no measured baseline for those wrappers' current
 * padding, so any override would be an unverifiable guess, and an
 * `!important` padding override on a wrapper that hosts the React-rendered
 * login form is exactly the class of change that shifts layout
 * unpredictably. If removing the navbar leaves the form oddly positioned,
 * that is a follow-up driven by real measurement, not a guess bundled here.
 *
 * D-3 (host-gate ordering, carried into both consumers): the hostname check
 * runs BEFORE any idempotence flag or DOM work on the consuming side, so a
 * non-participating document (`accounts.google.com`, or any other host this
 * runner-agnostic login window opens) is left with zero trace at all.
 */

/**
 * Two chrome-hiding rules, single line, space-separated — load-bearing shape
 * (260822-eib D-2). A newline here could only be mirrored on the Rust side
 * as a `\n` escape (two source characters), which would make the drift-pin
 * extractor's captured Rust literal diverge from this real newline with no
 * clean fix. Do not reformat into a template literal or joined array.
 */
export const HUMBLE_LOGIN_CHROME_CSS =
  'footer.site-footer { display: none !important; } .simple-navbar { display: none !important; }'

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
