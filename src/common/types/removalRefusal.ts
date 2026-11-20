/**
 * Phase 82 (FND-02, D-13): the closed sets and payload of the removal-refusal notice. Shared by the
 * backend push (`backend/safety/refusal.ts`), the `removalRefusedNotice` IPC schema and the
 * renderer store. Closed sets and game titles only: never a path, never raw error text
 * (logSecretGate), so what crosses the boundary can be shown to the user and logged as-is.
 */
import type { Runner } from 'common/types'
import type { RemovalReason } from './safety'

/** The destructive operation that was refused or that failed. */
export const REMOVAL_REFUSAL_KINDS = [
  'uninstall',
  'remove-prefix',
  'remove-bottle',
  'reset',
  'cancel-install'
] as const

/**
 * `refused`: the guard stopped the operation before anything was deleted.
 * `failed`: a delete ran and errored, or its effect is unconfirmed, so some files may be gone.
 */
export const REMOVAL_REFUSAL_OUTCOMES = ['refused', 'failed'] as const

export type RemovalRefusalKind = (typeof REMOVAL_REFUSAL_KINDS)[number]
export type RemovalRefusalOutcome = (typeof REMOVAL_REFUSAL_OUTCOMES)[number]

export interface RemovalRefusalPayload {
  kind: RemovalRefusalKind
  outcome: RemovalRefusalOutcome
  /** The check that stopped the removal: the first blocking item's reason. */
  reason: RemovalReason
  /** The game's title; absent for `reset`, which has no single game. */
  title?: string
  appName?: string
  runner?: Runner
  /** The other game's title, for `nested-known-install` and `inside-known-install`. */
  otherTitle?: string
}
