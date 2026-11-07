import { z } from 'zod'

import type { ConnectivitySnapshot } from '../../types'
import type { SignInProbeOutcomeMap } from '../../signInState'
import type { InvokeFns, SendFns } from './schemaTypes'

const noArgs = z.tuple([])

export const mainProcessSyncArgs = {
  'set-connectivity-online': noArgs
}

export const mainProcessAsyncArgs = {
  'get-connectivity-status': noArgs,
  // Phase 49 (49-04), D-08: read-only pull of this launch's sign-in probe
  // outcomes, for a renderer that mounted after the `signInProbeOutcomes` push.
  // Pure getter -- it can never start a probe (P3, T-49-11).
  getSignInProbeOutcomes: noArgs
}

interface MainProcessAsyncReturns {
  'get-connectivity-status': ConnectivitySnapshot
  getSignInProbeOutcomes: SignInProbeOutcomeMap
}

export type MainProcessSync = SendFns<typeof mainProcessSyncArgs>
export type MainProcessAsync = InvokeFns<
  typeof mainProcessAsyncArgs,
  MainProcessAsyncReturns
>
