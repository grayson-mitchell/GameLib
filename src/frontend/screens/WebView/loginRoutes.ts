/**
 * Pure route classifier for `WebView/index.tsx`'s D-06 branch split (Phase
 * 34.4.1 plan 05): which pathnames drive the login surface
 * (`TauriLoginPanel`) versus the store/wiki surface
 * (`WebviewUnavailablePanel`) inside the `!webviewPreloadPath` branch.
 *
 * Derived directly from the `urls` map in `index.tsx`: every `/loginweb/*`
 * entry plus the two legacy `/loginEpic`/`/loginGOG` paths are login
 * pathnames; everything else in that map (`/store/*`, `/wiki`) is the store
 * half, and anything not in the map at all (e.g. a `store-page` pathname,
 * which carries its URL in a query param rather than the pathname itself)
 * defaults to the store half too.
 *
 * Deliberately pure: no React, no `window.api`, and no import from
 * `index.tsx` -- the import direction is index -> loginRoutes, never the
 * reverse, so this file stays trivially unit-testable and reusable.
 */

export const LOGIN_PATHNAMES: readonly string[] = [
  '/loginEpic',
  '/loginGOG',
  '/loginweb/legendary',
  '/loginweb/gog',
  '/loginweb/nile',
  '/loginweb/zoom',
  '/loginweb/humble'
]

export function isLoginPathname(pathname: string): boolean {
  return LOGIN_PATHNAMES.includes(pathname)
}

/**
 * OAuth login urls for the three static-url runners (Phase 34.4.1 Plan 09, D-04,
 * REQ-34.4.1-08). Lifted out of `index.tsx`'s own locals (verbatim, same literal) so
 * `useTauriOAuthLogin.ts` can import them without duplicating the strings — one definition,
 * two consumers, never two copies that can drift. `index.tsx` imports these back rather than
 * keeping its own separate literals.
 *
 * `nile` has no entry here: its login url is fetched per-mount via
 * `window.api.getAmazonLoginData()` (it is account-session-dependent, not a static constant),
 * exactly as `index.tsx`'s own `/loginweb/nile` effect already does. `humble` also has no entry
 * here — it is not an OAuth runner this plan wires; its login url stays local to `index.tsx`.
 */
export const EPIC_LOGIN_URL = 'https://www.epicgames.com/id/login?responseType=code'
export const GOG_LOGIN_URL =
  'https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=galaxy'
export const ZOOM_LOGIN_URL =
  'https://www.zoom-platform.com/login?li=heroic&return_li_token=true'
