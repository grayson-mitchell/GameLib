import type { ConnectivitySnapshot } from '../../types'
import type { SignInProbeOutcomeMap } from '../../signInState'

// ts-prune-ignore-next
export interface MainProcessSync {
  'set-connectivity-online': () => void
}

// ts-prune-ignore-next
export interface MainProcessAsync {
  'get-connectivity-status': () => ConnectivitySnapshot
  // Phase 49 (49-04), D-08: read-only pull of this launch's sign-in probe
  // outcomes, for a renderer that mounted after the `signInProbeOutcomes` push.
  // Pure getter -- it can never start a probe (P3, T-49-11).
  getSignInProbeOutcomes: () => SignInProbeOutcomeMap
}
