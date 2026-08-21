import { TFunction } from 'i18next'

import { RedeemKeyOutcome } from 'common/types/steam'

// SPEC REQ5 / D-08: the four RedeemKeyOutcome buckets (+ 'error') must each
// render a DISTINCT, non-generic message. Never share a "failed" string
// across buckets — the user needs to know WHY a redeem did not succeed
// (already owned vs malformed key vs rate-limited vs a connectivity error).

export interface RedeemOutcomeCopy {
  message: string
  tone: 'success' | 'error'
}

// Phase 34.8-07 (REQ-34.8-12/-13): routed through an injected TFunction
// rather than GlobalStateV2.ts's module-scope-import idiom — this module is
// called during render/event handling, so it needs the calling component's
// Suspense-resolved `t`, not a module-scope binding that races i18next
// initialisation. Mirrors repairFailure.ts's injected-TFunction idiom,
// including its try/catch English-fallback posture: a throwing `t` must
// still yield a rendered dialog.
export function redeemOutcomeCopy(
  outcome: RedeemKeyOutcome,
  t: TFunction,
  packageName?: string
): RedeemOutcomeCopy {
  switch (outcome) {
    case 'success': {
      if (packageName) {
        // i18next interpolation via the options argument below, not a
        // template literal — a template literal cannot be translated as a
        // unit, which is why this file was a retrofit target in the first
        // place. Mirrors repairFailure.ts's assign-then-pass-to-t()
        // fallback shape verbatim: the SAME `message` binding is both the
        // pre-assigned English fallback and the literal default argument
        // passed to `t`, and the catch keeps it unchanged -- a throwing `t`
        // still yields a rendered dialog, at the cost of the raw
        // placeholder token being visible on that rare failure path rather
        // than a hand-rolled second interpolation implementation.
        let message =
          'Key redeemed! {{packageName}} has been added to your Steam library.'
        try {
          message = t('gamelib:redeemKey.successWithPackage', message, {
            packageName
          })
        } catch {
          // keep the hardcoded English fallback -- a throwing `t` must
          // still yield a rendered dialog
        }
        return { tone: 'success', message }
      }
      let message = 'Key redeemed! Your Steam library has been updated.'
      try {
        message = t('gamelib:redeemKey.successNoPackage', message)
      } catch {
        // keep the hardcoded English fallback
      }
      return { tone: 'success', message }
    }
    case 'already-owned': {
      let message =
        'This key has already been redeemed — you already own this on Steam.'
      try {
        message = t('gamelib:redeemKey.alreadyOwned', message)
      } catch {
        // keep the hardcoded English fallback
      }
      return { tone: 'error', message }
    }
    case 'invalid': {
      let message =
        "This key doesn't look right. Double-check it and try again."
      try {
        message = t('gamelib:redeemKey.invalid', message)
      } catch {
        // keep the hardcoded English fallback
      }
      return { tone: 'error', message }
    }
    case 'rate-limited': {
      let message = 'Too many attempts — please wait a bit before trying again.'
      try {
        message = t('gamelib:redeemKey.rateLimited', message)
      } catch {
        // keep the hardcoded English fallback
      }
      return { tone: 'error', message }
    }
    case 'error':
    default: {
      let message =
        "Couldn't reach Steam to redeem this key. Check your connection and try again."
      try {
        message = t('gamelib:redeemKey.error', message)
      } catch {
        // keep the hardcoded English fallback
      }
      return { tone: 'error', message }
    }
  }
}
