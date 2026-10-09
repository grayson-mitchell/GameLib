/**
 * 49-04 Task 2 RED stub: deliberately inert so the tests fail on assertions.
 * Replaced in the GREEN commit.
 */
import type {
  SignInProbeOutcome,
  SignInProbeOutcomeMap,
  SignInStore
} from 'common/signInState'

export function getSignInProbeOutcomes(): SignInProbeOutcomeMap {
  return {}
}

export function recordSignInProbeOutcome(
  _store: SignInStore,
  _outcome: SignInProbeOutcome | undefined
): void {
  return undefined
}

export function publishSignInProbeOutcomes(): void {
  return undefined
}

export function registerSignInProbeOutcomesHandler(): void {
  return undefined
}

export function noteSignInSucceeded(_store: SignInStore): void {
  return undefined
}

export function noteSignedOut(_store: SignInStore): void {
  return undefined
}

export function __resetSignInProbeOutcomesForTests(): void {
  return undefined
}
