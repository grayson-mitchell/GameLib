import type { SignInProbeOutcome } from 'common/signInState'

export const SIGN_IN_PROBE_ABORT_IDS = {
  legendary: 'signin-probe-legendary',
  nile: 'signin-probe-nile',
  gog: 'gogdl-get-credentials'
} as const

// RED stub: replaced by the real probes in the GREEN commit.
export async function probeLegendarySession(): Promise<SignInProbeOutcome> {
  return 'unknown'
}

export async function probeNileSession(): Promise<SignInProbeOutcome> {
  return 'unknown'
}
