import { parseSignInStore, type SignInStore } from 'common/signInState'

/**
 * Phase 49 D-13 -- the `?open=<store>` deep link from the Library sign-in
 * notice into Manage Accounts.
 *
 * Pure so Jest can prove it: `Login/index.tsx` imports `./index.scss` and the
 * Frontend jest project has no jsdom or stylesheet transform.
 *
 * `?open=` is renderer-reachable text, so the value is untrusted (T-49-01):
 * it goes through `parseSignInStore`'s exact-membership allow-list, and the
 * consumer opens at most one overlay per mount.
 */

export const LOGIN_OPEN_PARAM = 'open'

export function buildLoginOpenPath(store: SignInStore): string {
  return `/login?${LOGIN_OPEN_PARAM}=${store}`
}

interface LoginOpenRequestInput {
  param: string | null
  alreadyConsumed: boolean
  overlayOpen: boolean
}

/**
 * The store whose overlay should open now, or `null` for "open nothing".
 * Nothing opens if this mount already consumed a request, or if an overlay is
 * already up.
 */
export function resolveLoginOpenRequest({
  param,
  alreadyConsumed,
  overlayOpen
}: LoginOpenRequestInput): SignInStore | null {
  if (alreadyConsumed || overlayOpen) {
    return null
  }
  return parseSignInStore(param)
}
