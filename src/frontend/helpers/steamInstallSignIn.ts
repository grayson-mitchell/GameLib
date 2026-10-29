import {
  resolveSignInState,
  type SignInProbeOutcomeMap,
  type SignInState
} from 'common/signInState'
import { collectSignInInputs } from './signInInputs'

/**
 * The one install-side Steam sign-in decision (quick 261029-s5l, todo
 * 2026-10-29, 56-25 Gap 4).
 *
 * A missing Steam refresh token latches `steamConfigStore.credentialsMissing`,
 * which the account UI already shows as `expired` (Library row, `Reconnect`
 * tile). The Install affordance ignored it and failed only AFTER the click
 * ("You are not signed in to Steam, so this download could not start"). This
 * helper lets the install chokepoint and the Steam dialog ask the same
 * question through the shared selector.
 *
 * It never reads `credentialsMissing` itself: D-06 makes `collectSignInInputs`
 * the only renderer reader.
 *
 * Only `expired` blocks. `unknown` (probe pending, keychain unreadable) is
 * fail-open by the signInState contract. `not-connected` does not block either:
 * an install can be clicked right after a QR sign-in, before the persona name
 * resolves, so blocking on a missing username would be a false positive; the
 * backend's `not-signed-in` refusal still covers it.
 *
 * Applies to GameLib-native installs only. Delegated `steam://install` never
 * needs GameLib's token and must not be gated by callers.
 */
export function resolveSteamInstallSignInState(
  steamUsername: string | null | undefined,
  outcomes: SignInProbeOutcomeMap
): SignInState {
  return resolveSignInState(
    collectSignInInputs({ steamUsername }, outcomes).steam
  )
}

export function steamInstallNeedsSignIn(state: SignInState): boolean {
  return state === 'expired'
}
