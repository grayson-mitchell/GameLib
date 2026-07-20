import { RedeemKeyOutcome } from 'common/types/steam'

// SPEC REQ5 / D-08: the four RedeemKeyOutcome buckets (+ 'error') must each
// render a DISTINCT, non-generic message. Never share a "failed" string
// across buckets — the user needs to know WHY a redeem did not succeed
// (already owned vs malformed key vs rate-limited vs a connectivity error).

export interface RedeemOutcomeCopy {
  message: string
  tone: 'success' | 'error'
}

export function redeemOutcomeCopy(
  outcome: RedeemKeyOutcome,
  packageName?: string
): RedeemOutcomeCopy {
  switch (outcome) {
    case 'success':
      return {
        tone: 'success',
        message: packageName
          ? `Key redeemed! ${packageName} has been added to your Steam library.`
          : 'Key redeemed! Your Steam library has been updated.'
      }
    case 'already-owned':
      return {
        tone: 'error',
        message: 'This key has already been redeemed — you already own this on Steam.'
      }
    case 'invalid':
      return {
        tone: 'error',
        message: "This key doesn't look right. Double-check it and try again."
      }
    case 'rate-limited':
      return {
        tone: 'error',
        message: 'Too many attempts — please wait a bit before trying again.'
      }
    case 'error':
    default:
      return {
        tone: 'error',
        message:
          "Couldn't reach Steam to redeem this key. Check your connection and try again."
      }
  }
}
