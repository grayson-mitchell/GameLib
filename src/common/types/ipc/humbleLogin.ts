import { z } from 'zod'

import type { RevealOutcome } from '../humble'

import { nonEmptyString, type InvokeFns, type SendFns } from './schemaTypes'

const noArgs = z.tuple([])

export const humbleLoginSyncArgs = {
  // D-06 silent cancel: fired when the /loginweb/humble route unmounts
  // before a candidate cookie is accepted.
  humbleStopLogin: noArgs
}

export const humbleLoginAsyncArgs = {
  humbleStartLogin: noArgs,
  humbleReconnect: noArgs,
  // Phase 14 guided claim flow (HCLAIM-01/02). Both gamekey AND machineName
  // are required (composite-key discipline, Pattern 3). Returns the revealed key value
  // directly (never persisted to a broadcast type -- C4/T-14-02).
  humbleRevealKey: z.tuple([
    z.strictObject({
      gamekey: nonEmptyString(256),
      machineName: nonEmptyString(256)
    })
  ])
}

// `'cancelled'` (quick task 260808-gl6) = the user closed the sign-in window. Distinct
// from `'error'` (the watch could not continue) so the renderer can return to Manage
// Accounts silently instead of rendering a failure panel -- see humble/user.ts's LoginResult.
interface LoginOutcome {
  status: 'done' | 'waiting' | 'error' | 'cancelled'
  username?: string
}

interface HumbleLoginAsyncReturns {
  humbleStartLogin: Promise<LoginOutcome>
  humbleReconnect: Promise<LoginOutcome>
  humbleRevealKey: Promise<RevealOutcome>
}

export type HumbleLoginSync = SendFns<typeof humbleLoginSyncArgs>
export type HumbleLoginAsync = InvokeFns<
  typeof humbleLoginAsyncArgs,
  HumbleLoginAsyncReturns
>
