/**
 * 49-04 Task 2 RED stub: deliberately inert so the tests fail on assertions.
 * Replaced in the GREEN commit.
 */
import type { SignInStore } from 'common/signInState'

export function captureSignInEpoch(_store: SignInStore): number {
  return 0
}

export function isSignInEpochCurrent(
  _store: SignInStore,
  _epoch: number
): boolean {
  return true
}

export function bumpSignInEpoch(_store: SignInStore): void {
  return undefined
}

export function __resetSignInEpochsForTests(): void {
  return undefined
}
