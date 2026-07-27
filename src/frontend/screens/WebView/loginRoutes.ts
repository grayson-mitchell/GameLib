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
