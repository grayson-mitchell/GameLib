/**
 * 49-04 Task 3 RED stub: deliberately inert so the tests fail on assertions.
 * Replaced in the GREEN commit.
 */
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'

export type SignInVerdictResult = 'latched' | 'cleared' | 'unchanged' | 'stale'

export function applySignInVerdict(
  _store: SignInStore,
  _outcome: SignInProbeOutcome,
  _epochAtStart: number
): SignInVerdictResult {
  return 'unchanged'
}
