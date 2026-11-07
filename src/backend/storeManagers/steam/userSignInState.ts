import type { LoginSession } from 'steam-session'

// Sign-in state leaf (D-10, D-15): the single owner of the QR / credential
// sign-in fields that used to be private statics on SteamUser. userSignIn.ts
// reads and writes them through these accessors; SteamUser.logout() resets
// them through resetSignInState().

type SignInStatus = 'waiting' | 'done' | 'error'
type SignInSessionState = { status: SignInStatus; username?: string }
type CredSettleCallback = (result: { status: 'done' | 'error' }) => void

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

export function getSession(): InstanceType<typeof LoginSession> | null {
  return session
}

export function setSession(next: InstanceType<typeof LoginSession> | null) {
  session = next
}

export function getQrSessionState(): SignInSessionState {
  return qrSessionState
}

export function setQrSessionState(next: SignInSessionState) {
  qrSessionState = next
}

export function getQrLastLoggedStatus(): SignInStatus | null {
  return qrLastLoggedStatus
}

export function setQrLastLoggedStatus(next: SignInStatus | null) {
  qrLastLoggedStatus = next
}

export function getCredSessionState(): SignInSessionState {
  return credSessionState
}

export function setCredSessionState(next: SignInSessionState) {
  credSessionState = next
}

export function addCredSettleCallback(cb: CredSettleCallback) {
  credSettleCallbacks.push(cb)
}

/** Hands out the pending settle callbacks and leaves the list empty. */
export function takeCredSettleCallbacks(): CredSettleCallback[] {
  const pending = credSettleCallbacks
  credSettleCallbacks = []
  return pending
}

/** Sign-out reset: every sign-in field back to its initial value. */
export function resetSignInState(): void {
  session = null
  qrSessionState = { status: 'waiting' }
  qrLastLoggedStatus = null
  // Drain any pending credential session callbacks so callers don't hang
  // indefinitely if logout occurs while waiting for a guard code.
  const pendingCbs = takeCredSettleCallbacks()
  credSessionState = { status: 'error' }
  for (const cb of pendingCbs) cb({ status: 'error' })
}
