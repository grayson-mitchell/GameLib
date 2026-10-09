import type { SignInState } from 'common/signInState'

/**
 * How a Manage Accounts tile presents one store's sign-in state (Phase 49
 * R7, D-06). Replaces the retired Steam-only tile helper: all five
 * tiles now map the SAME `SignInState` the Library notice reads, so the two
 * surfaces cannot disagree about a store.
 *
 * `Runner` renders `buttonText` only in its not-logged-in branch and has no
 * third state, so an expired session presents exactly as Humble's always did:
 * as not-logged-in, with `reconnect` selecting the "Sign-in expired --
 * Reconnect" button text instead of the plain login text. A cached username
 * alone is NOT proof of a usable session (observed live on 2026-08-22: the
 * Steam tile read "signed in" while every install failed) -- that is why the
 * decision lives in the shared selector rather than in a username check here.
 *
 * `unknown` renders as Connected (RESEARCH A8). It means "logged in, but we
 * could not tell yet" -- a pending probe, an offline launch, a denied Keychain
 * prompt. None of those is evidence of a broken session, so a tile must not
 * regress on them; only a proven `expired` shows Reconnect.
 *
 * Pure and import-free at runtime so it can be unit-tested without a DOM: the
 * frontend jest project runs `testEnvironment: 'node'` with no jsdom (see
 * `src/frontend/jest.config.js`).
 */
interface SignInTile {
  /** Feeds `Runner`'s `isLoggedIn`. */
  isLoggedIn: boolean
  /** True only for a proven expiry: show the Reconnect button text. */
  reconnect: boolean
}

export function resolveSignInTile(state: SignInState): SignInTile {
  switch (state) {
    case 'connected':
    case 'unknown':
      return { isLoggedIn: true, reconnect: false }
    case 'expired':
      return { isLoggedIn: false, reconnect: true }
    case 'not-connected':
      return { isLoggedIn: false, reconnect: false }
  }
}
