/**
 * Whether the Manage Accounts tile should present Steam as connected.
 *
 * A cached `username` alone is NOT proof of a usable session. The backend
 * persists `steamConfigStore.credentialsMissing` when a SUCCESSFUL credential
 * read comes back empty while the session still says `isLoggedIn` — i.e. the
 * refresh token the installer needs is provably gone. Observed live on
 * 2026-08-22: the tile read "signed in" while every install failed with "You
 * are not signed in to Steam", and the library refresh had already detected the
 * condition four times without surfacing it.
 *
 * `Runner` renders `buttonText` only in its not-logged-in branch and has no
 * third state, so — exactly as Humble does for an expired session
 * (`Login/index.tsx`, `humble?.expired`) — a proven-missing credential presents
 * as not-connected with a reconnect prompt rather than as a novel tile state.
 *
 * Pure so it can be unit-tested without a DOM: the frontend jest project runs
 * `testEnvironment: 'node'` with no jsdom (see `src/frontend/jest.config.js`).
 */
export function isSteamConnected(
  username: string | null | undefined,
  credentialsMissing: boolean | undefined
): boolean {
  return Boolean(username) && !credentialsMissing
}
