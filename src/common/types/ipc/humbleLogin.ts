import type { RevealOutcome } from '../humble'

export interface HumbleLoginSync {
  // D-06 silent cancel: fired when the /loginweb/humble route unmounts
  // before a candidate cookie is accepted.
  humbleStopLogin: () => void
}

export interface HumbleLoginAsync {
  // `'cancelled'` (quick task 260808-gl6) = the user closed the sign-in window. Distinct
  // from `'error'` (the watch could not continue) so the renderer can return to Manage
  // Accounts silently instead of rendering a failure panel — see humble/user.ts's
  // LoginResult.
  humbleStartLogin: () => Promise<{
    status: 'done' | 'waiting' | 'error' | 'cancelled'
    username?: string
  }>
  humbleReconnect: () => Promise<{
    status: 'done' | 'waiting' | 'error' | 'cancelled'
    username?: string
  }>
  // Phase 14 guided claim flow (HCLAIM-01/02). Both gamekey AND machineName
  // are required (composite-key discipline, Pattern 3) — unlike the older
  // machineName-only channels above. Returns the revealed key value directly
  // (never persisted to a broadcast type — C4/T-14-02).
  humbleRevealKey: (params: {
    gamekey: string
    machineName: string
  }) => Promise<RevealOutcome>
}
