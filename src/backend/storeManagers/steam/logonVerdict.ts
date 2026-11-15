import type { ManagerDeps } from 'backend/services/types'
import { applySignInVerdict } from 'backend/signInProbe/verdict'
import type { SendFrontendMessage } from '../../host/frontendMessage'
import type { SteamStoresDeps } from './library/installRoot'
import {
  CREDENTIAL_REFUSAL_ERESULTS,
  CREDENTIAL_REFUSAL_NAMES
} from './userTypes'

/** What the logon verdict reads from the owning SteamUser's deps. */
export type LogonVerdictDeps = SteamStoresDeps & {
  signIn: Pick<ManagerDeps['signIn'], 'epochs' | 'outcomes'>
  sendFrontendMessage: SendFrontendMessage
}

/** True when the CM refused the stored credential itself, not the connection. */
export function isCredentialRefusal(rejection: {
  message: string
  eresult?: number
}): boolean {
  if (typeof rejection.eresult === 'number') {
    return CREDENTIAL_REFUSAL_ERESULTS.includes(rejection.eresult)
  }
  return CREDENTIAL_REFUSAL_NAMES.includes(rejection.message)
}

/**
 * quick 261011-rj0: report what the CM itself said about the stored
 * credential, through the SAME fenced, write-if-changed latch the Phase 49
 * boot probe uses (`applySignInVerdict`), so the Library sign-in row and the
 * Manage Accounts tile learn about it the way they learn everything else.
 *
 * This is deliberately NOT a change to D-21. The boot probe still reads the
 * keyring only and never opens the CM; this runs inside a deliberate
 * `ensureConnected()` caller (a library refresh, an install) that has already
 * paid for the connection. It is the first verdict site fed by a CM response
 * rather than a keyring read, which is why it goes through `applySignInVerdict`
 * and nothing else: the epoch fence (T-49-10) refuses a verdict from an
 * attempt that began before a sign-in completed, and write-if-changed keeps
 * a repeated refusal from re-notifying the renderer.
 *
 * Records and publishes the outcome only when the flag actually moved. A
 * cold connect happens once per launch; re-publishing an unchanged map on
 * every one would be noise, and `resolveSignInState` already lets a latched
 * flag outrank whatever outcome the boot probe recorded.
 */
export function reportLogonVerdict(
  deps: LogonVerdictDeps,
  outcome: 'healthy' | 'expired',
  epochAtStart: number
): void {
  const result = applySignInVerdict(
    {
      stores: deps.stores,
      epochs: deps.signIn.epochs,
      sendFrontendMessage: deps.sendFrontendMessage
    },
    'steam',
    outcome,
    epochAtStart
  )
  if (result !== 'latched' && result !== 'cleared') return
  deps.signIn.outcomes.record('steam', outcome)
  deps.signIn.outcomes.publish()
}
