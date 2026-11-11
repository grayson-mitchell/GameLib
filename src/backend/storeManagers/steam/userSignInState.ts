import type { LoginSession } from 'steam-session'

// Sign-in state leaf (D-10, D-15): the single owner of the QR / credential
// sign-in fields that used to be private statics on SteamUser. userSignIn.ts
// reads and writes them through one boot-owned instance (D-05, D-66.3-13);
// SteamUser.logout() resets it through resetSignInState().

type SignInStatus = 'waiting' | 'done' | 'error'
type SignInSessionState = { status: SignInStatus; username?: string }
type CredSettleCallback = (result: { status: 'done' | 'error' }) => void

export interface SteamSignInState {
  getSession(): InstanceType<typeof LoginSession> | null
  setSession(next: InstanceType<typeof LoginSession> | null): void
  getQrSessionState(): SignInSessionState
  setQrSessionState(next: SignInSessionState): void
  getQrLastLoggedStatus(): SignInStatus | null
  setQrLastLoggedStatus(next: SignInStatus | null): void
  getCredSessionState(): SignInSessionState
  setCredSessionState(next: SignInSessionState): void
  addCredSettleCallback(cb: CredSettleCallback): void
  /** Hands out the pending settle callbacks and leaves the list empty. */
  takeCredSettleCallbacks(): CredSettleCallback[]
  /** Sign-out reset: every sign-in field back to its initial value. */
  resetSignInState(): void
}

/** One instance per boot (D-05): every field is a closure variable, so two instances never share a session. */
export function createSteamSignInState(): SteamSignInState {
  let session: InstanceType<typeof LoginSession> | null = null
  let qrSessionState: SignInSessionState = { status: 'waiting' }
  // Tracks the last status pollQRLogin() actually LOGGED (not just observed),
  // so the poll loop can emit a line only on a CHANGE of status. The frontend
  // polls on a timer, so a line per poll would flood gamelib.log and would
  // itself be a defect (D-02). `null` means "nothing logged yet for this
  // attempt" -- reset alongside qrSessionState (startQRLogin, logout) so the
  // two fields can never drift into an incoherent pair.
  let qrLastLoggedStatus: SignInStatus | null = null
  // Credential session completion state -- parallel to qrSessionState. Settled
  // by the 'authenticated'/'error'/'timeout' listeners registered in
  // startCredentialLogin's guard_required branch.
  let credSessionState: SignInSessionState = { status: 'waiting' }
  // Resolve callbacks waiting for credSessionState to change from 'waiting'.
  let credSettleCallbacks: CredSettleCallback[] = []

  const takeCredSettleCallbacks = (): CredSettleCallback[] => {
    const pending = credSettleCallbacks
    credSettleCallbacks = []
    return pending
  }

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
    addCredSettleCallback: (cb) => {
      credSettleCallbacks.push(cb)
    },
    takeCredSettleCallbacks,
    resetSignInState: () => {
      session = null
      qrSessionState = { status: 'waiting' }
      qrLastLoggedStatus = null
      // Drain any pending credential session callbacks so callers don't hang
      // indefinitely if logout occurs while waiting for a guard code.
      const pendingCbs = takeCredSettleCallbacks()
      credSessionState = { status: 'error' }
      for (const cb of pendingCbs) cb({ status: 'error' })
    }
  }
}
