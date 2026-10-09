import type { SignInState, SignInStore } from './signInState'

// RED-phase stub (plan 49-01 Task 2): the three exports exist so the tests
// fail on their assertions rather than on a module-load error. Replaced by the
// real implementation in the GREEN commit.
export function addSignInDismissal(
  dismissed: readonly SignInStore[],
  store: SignInStore
): SignInStore[] {
  void store
  return [...dismissed]
}

export function rearmSignInDismissals(
  dismissed: readonly SignInStore[],
  states: Record<SignInStore, SignInState>
): SignInStore[] {
  void states
  return [...dismissed]
}

export function normalizeSignInDismissals(value: unknown): SignInStore[] {
  void value
  return ['steam']
}
