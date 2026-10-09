/**
 * Phase 49 (49-08, R3): RED stub. Deliberately incomplete so the failing tests
 * fail on their assertions rather than on a missing export. Replaced by the
 * real pass in the GREEN commit.
 */
import type { SignInProbeOutcome, SignInStore } from 'common/signInState'

export const SIGN_IN_PROBE_BOUND_MS = 45_000

export interface SignInProbeRegistration {
  isLoggedIn: () => boolean
  probe: () => Promise<SignInProbeOutcome>
  abortId?: string
}

export interface SignInProbePassDeps {
  registrations: Record<SignInStore, SignInProbeRegistration>
}

export async function boundedSignInProbe(
  _run: () => Promise<SignInProbeOutcome>,
  _onBound: () => void
): Promise<SignInProbeOutcome> {
  return 'unknown'
}

export async function runSignInProbePass(
  _deps?: SignInProbePassDeps
): Promise<void> {
  return
}

export function requestSignInProbePass(_deps?: SignInProbePassDeps): void {
  return
}

export function startSignInProbePass(
  _options: {
    allowInTestWorker?: boolean
    deps?: SignInProbePassDeps
  } = {}
): void {
  return
}

export function __resetSignInProbePassForTests(): void {
  return
}
