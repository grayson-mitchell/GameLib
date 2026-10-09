import type { SignInState } from 'common/signInState'

// RED-phase placeholder (Phase 49 plan 10 Task 1): the real mapping lands in
// the GREEN commit. Returns a fixed value so the target tests fail on their
// assertions rather than on a missing module.
export interface SignInTile {
  isLoggedIn: boolean
  reconnect: boolean
}

export function resolveSignInTile(_state: SignInState): SignInTile {
  return { isLoggedIn: false, reconnect: false }
}
