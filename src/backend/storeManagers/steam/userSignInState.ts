// Sign-in state leaf (D-10, D-15): the single owner of the QR / credential
// sign-in fields that used to be private statics on SteamUser. userSignIn.ts
// reads and writes them through one boot-owned instance (D-05, D-66.3-13);
// SteamUser.logout() resets it through resetSignInState().

/**
 * The live sign-in session: a Rust Web API flow id. The slot is mutable: `finalize` memoises the
 * done-handling so two polls never store the token twice, and `lastChallengeUrl` is the QR the
 * window last drew.
 */
export type SignInSession = {
  flowId: string
  lastChallengeUrl?: string
  finalize?: Promise<string>
}

type SignInStatus = 'waiting' | 'done' | 'error'
type SignInSessionState = { status: SignInStatus; username?: string }

export interface SteamSignInState {
  getSession(): SignInSession | null
  setSession(next: SignInSession | null): void
  getQrSessionState(): SignInSessionState
  setQrSessionState(next: SignInSessionState): void
  getQrLastLoggedStatus(): SignInStatus | null
  setQrLastLoggedStatus(next: SignInStatus | null): void
  getCredSessionState(): SignInSessionState
  setCredSessionState(next: SignInSessionState): void
  /** Sign-out reset: every sign-in field back to its initial value. */
  resetSignInState(): void
}

/** One instance per boot (D-05): every field is a closure variable, so two instances never share a session. */
export function createSteamSignInState(opts?: {
  /** Fire-and-forget steamcm_signin_cancel for a dropped rust flow (sign-out reset). */
  cancelRustFlow?: (flowId: string) => void
}): SteamSignInState {
  let session: SignInSession | null = null
  let qrSessionState: SignInSessionState = { status: 'waiting' }
  // Tracks the last status pollQRLogin() actually LOGGED (not just observed),
  // so the poll loop can emit a line only on a CHANGE of status. The frontend
  // polls on a timer, so a line per poll would flood gamelib.log and would
  // itself be a defect (D-02). `null` means "nothing logged yet for this
  // attempt" -- reset alongside qrSessionState (startQRLogin, logout) so the
  // two fields can never drift into an incoherent pair.
  let qrLastLoggedStatus: SignInStatus | null = null
  // Credential session completion state -- parallel to qrSessionState.
  let credSessionState: SignInSessionState = { status: 'waiting' }

  return {
    getSession: () => session,
    setSession: (next) => {
      session = next
    },
    getQrSessionState: () => qrSessionState,
    setQrSessionState: (next) => {
      qrSessionState = next
    },
    getQrLastLoggedStatus: () => qrLastLoggedStatus,
    setQrLastLoggedStatus: (next) => {
      qrLastLoggedStatus = next
    },
    getCredSessionState: () => credSessionState,
    setCredSessionState: (next) => {
      credSessionState = next
    },
    resetSignInState: () => {
      if (session) opts?.cancelRustFlow?.(session.flowId)
      session = null
      qrSessionState = { status: 'waiting' }
      qrLastLoggedStatus = null
      credSessionState = { status: 'error' }
    }
  }
}
