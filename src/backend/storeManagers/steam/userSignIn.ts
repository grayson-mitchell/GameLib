import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SignInNoteDeps } from 'backend/signInProbe/outcomes'
import type { SteamStoresDeps } from './library/installRoot'
import type { TokenStoreSlot } from './tokenStore'
import { withTimeout } from './withTimeout'
import { SIGN_IN_PERSONA_TIMEOUT_MS } from './userTypes'
import type { SignInSession } from './userSignInState'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMCM_SIGNIN_CANCEL,
  RUST_STEAMCM_SIGNIN_CREDENTIALS_START,
  RUST_STEAMCM_SIGNIN_GUARD_SUBMIT,
  RUST_STEAMCM_SIGNIN_QR_START,
  RUST_STEAMCM_SIGNIN_STATUS
} from 'common/types/sidecarTransport'
import type {
  SteamSessionServices,
  SteamUserSliceDeps
} from 'backend/services/types'

/** What the Steam sign-in flows read: the stores, the sign-in outcome writer and the boot-owned session state. */
export type UserSignInDeps = SteamStoresDeps &
  SignInNoteDeps &
  SteamUserSliceDeps<'acquireAuthenticatedWithToken'> &
  RustInvokeDeps & {
    tokenStore: Pick<TokenStoreSlot, 'current'>
    steamSession: { signIn: SteamSessionServices['signIn'] }
  }

/** What the poll and guard-submit flows need from the sign-in deps. */
type SignInPollDeps = UserSignInDeps

// ── Rust Web API sign-in (Phase 79 D-05..D-08, CF-08) ─────────────────────────
// The flows live in Rust; TS keeps the token store, finishing and the UI contract.
// Never logged: the password, guard code, refresh token, account name, SteamID.

/** The profile read both engines share: lease, persona name bounded at 5 s, userData write. */
async function resolveProfile(
  deps: UserSignInDeps,
  known: { refreshToken: string; accountName?: string; steamId: string },
  /** C1/WR-02: false once the sign-in was signed out; the userData write is then skipped. */
  mayWrite: () => boolean
): Promise<string> {
  let personaName = known.accountName || 'Steam User'
  let steamId = known.steamId
  const lease = await deps.steamUser.acquireAuthenticatedWithToken(
    { reason: 'login' },
    known.refreshToken
  )
  if (lease.ok) {
    try {
      const client = lease.client
      const id = client.steamID
      if (id) {
        steamId = steamId || id.getSteamID64()
        const result = await withTimeout(
          client.getPersonas([id]),
          SIGN_IN_PERSONA_TIMEOUT_MS,
          'sign-in getPersonas'
        )
        personaName =
          result.personas[id.getSteamID64()]?.player_name ?? personaName
      }
    } catch (err) {
      logWarning(
        ['getPersonas failed, using fallback username:', err],
        LogPrefix.Steam
      )
    } finally {
      lease.release()
    }
  }
  if (mayWrite()) {
    deps.stores.steam.configStore.set('userData', {
      username: personaName,
      steamId
    })
  }
  return personaName
}

type RustFlowStatus =
  | { status: 'waiting'; challengeUrl?: string }
  | { status: 'guardRequired'; guardType?: string }
  | {
      status: 'done'
      refreshToken: string
      accountName?: string
      steamId?: string
    }
  | { status: 'error'; reason?: string; eresult?: number }

type RustSlot = SignInSession

/** Poll cadence while a rust flow is waited on; the flow's own deadline (120 s / 180 s) ends it. */
const RUST_WAIT_INTERVAL_MS = 1000
/** Safety cap on wait iterations, above the longest Rust flow deadline (180 s). */
const RUST_WAIT_MAX_ITERATIONS = 200

/** A timer that never keeps the sidecar alive (exit contract). */
function sleepUnref(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    handle.unref?.()
  })
}

function fireAndForgetCancel(deps: RustInvokeDeps, flowId: string): void {
  void deps
    .requestRustInvoke(RUST_STEAMCM_SIGNIN_CANCEL, [{ flowId }])
    .catch(() => undefined)
}

function dropPreviousForRust(deps: UserSignInDeps): void {
  const signInState = deps.steamSession.signIn
  const previous = signInState.getSession()
  if (!previous) return
  fireAndForgetCancel(deps, previous.flowId)
  signInState.setSession(null)
}

/**
 * C1/WR-03: a rejected status read (the bounded rustInvoke timeout, a transport hiccup) is not a
 * failed sign-in. It reads as `waiting` until this many fail in a row; only then is the flow
 * cancelled and the sign-in failed.
 */
const STATUS_READ_FAILURE_LIMIT = 3

/** Another poll already read `done` and is finalising: Rust has dropped the flow by now. */
type Finalizing = { status: 'finalizing' }

/**
 * Reads a rust flow's status. Once one poll has read `done` (and started finalising), Rust drops
 * the flow, so an overlapping poll would read `unknownFlow` and fail a sign-in that just
 * succeeded (UAT 79-A item 5). Such a poll reports `finalizing` and waits on the memoised result.
 */
async function readFlowStatus(
  deps: UserSignInDeps,
  slot: RustSlot
): Promise<RustFlowStatus | Finalizing> {
  if (slot.finalize) return { status: 'finalizing' }
  try {
    const r = (await deps.requestRustInvoke(RUST_STEAMCM_SIGNIN_STATUS, [
      { flowId: slot.flowId }
    ])) as RustFlowStatus
    slot.readFailures = 0
    if (r.status !== 'done' && slot.finalize) return { status: 'finalizing' }
    return r
  } catch (err) {
    if (slot.finalize) return { status: 'finalizing' }
    slot.readFailures = (slot.readFailures ?? 0) + 1
    logWarning(
      `Steam sign-in status read failed (${err instanceof Error ? err.name : typeof err}) ${slot.readFailures}/${STATUS_READ_FAILURE_LIMIT}`,
      LogPrefix.Steam
    )
    if (slot.readFailures < STATUS_READ_FAILURE_LIMIT) {
      return { status: 'waiting' }
    }
    // Giving up: cancel the Rust flow so an approval that lands now is not left holding a token.
    fireAndForgetCancel(deps, slot.flowId)
    return { status: 'error', reason: 'statusReadFailed' }
  }
}

function logRustError(what: string, r: { eresult?: number; reason?: string }) {
  logError(
    `${what}: ${r.reason ?? 'error'} EResult=${r.eresult ?? 'unknown'}`,
    LogPrefix.Steam
  )
}

/** A sign-out or a newer sign-in attempt landed while this one was finalising. */
class SignInSupersededError extends Error {
  override name = 'SignInSupersededError'
}

/**
 * Done-handling for a rust flow: the token is stored BEFORE the persona logon (D-06), so a failed
 * logon never loses it. Memoised on the slot: concurrent polls finalise once.
 *
 * C1/WR-02: fenced against a sign-out (logout() resets the sign-in state, which drops the slot)
 * and a newer attempt (dropPreviousForRust). Until the sign-in is committed (isLoggedIn written,
 * synchronously after the token write) either one discards it, clearing the token just stored.
 * After the commit only a sign-out stops the userData write: a newer attempt does not undo an
 * account that is already signed in.
 */
async function finalizeRustSignIn(
  deps: UserSignInDeps,
  slot: RustSlot,
  done: Extract<RustFlowStatus, { status: 'done' }> | Finalizing
): Promise<string> {
  if (slot.finalize) return slot.finalize
  if (done.status !== 'done') throw new Error('rust sign-in finalize missing')
  const signInState = deps.steamSession.signIn
  const signOuts = signInState.getSignOutCount()
  const stillCurrent = () => signInState.getSession() === slot
  const notSignedOut = () => signInState.getSignOutCount() === signOuts
  slot.finalize = (async () => {
    if (!stillCurrent()) throw new SignInSupersededError()
    await deps.tokenStore.current().setToken(done.refreshToken)
    if (!stillCurrent()) {
      // The sign-out's own clearToken may have run before this setToken landed.
      await deps.tokenStore.current().clearToken()
      throw new SignInSupersededError()
    }
    deps.stores.steam.configStore.set('isLoggedIn', true)
    deps.stores.steam.configStore.delete('credentialsMissing')
    deps.signIn.outcomes.noteSignInSucceeded('steam')
    const name = await resolveProfile(
      deps,
      {
        refreshToken: done.refreshToken,
        accountName: done.accountName,
        steamId: done.steamId ?? ''
      },
      notSignedOut
    )
    if (!notSignedOut()) throw new SignInSupersededError()
    logInfo('Steam auth complete (rust sign-in)', LogPrefix.Steam)
    return name
  })()
  return slot.finalize
}

type SettledSignIn = { status: 'done' | 'error'; username?: string }

/**
 * C1/WR-06: the poll channels must not block on finalisation. It includes a cold signed-in logon
 * and the persona read, and the window polls on a 2 s interval that does not wait for the previous
 * call, so a blocking poll left several in flight and each finished the sign-in. The poll starts
 * finalize (memoised on the slot) and returns `done` without a username at once. The first caller
 * to start it records the outcome in the session state when it settles, which a later poll reads.
 * A slot that is no longer the live session records nothing.
 */
function finalizeInBackground(
  deps: UserSignInDeps,
  slot: RustSlot,
  r: Extract<RustFlowStatus, { status: 'done' }> | Finalizing,
  record: (next: SettledSignIn) => void,
  what: string
): void {
  const signInState = deps.steamSession.signIn
  const owner = !slot.finalize
  const finalize = finalizeRustSignIn(deps, slot, r)
  // Someone else started it (a guard-submit wait, an earlier poll) and records its outcome.
  if (!owner) return
  void finalize.then(
    (username) => {
      if (signInState.getSession() === slot) {
        record({ status: 'done', username })
      }
    },
    (err: unknown) => {
      logError(
        `${what} finalization failed (${err instanceof Error ? err.name : typeof err})`,
        LogPrefix.Steam
      )
      if (signInState.getSession() === slot) record({ status: 'error' })
    }
  )
}

/** Waits (unref'd 1 s reads) until the flow is done or errored, finalising on done. */
async function rustWaitSettle(
  deps: UserSignInDeps,
  slot: RustSlot
): Promise<{ status: 'done' | 'error'; username?: string }> {
  const signInState = deps.steamSession.signIn
  for (let i = 0; i < RUST_WAIT_MAX_ITERATIONS; i++) {
    if (signInState.getSession() !== slot) return { status: 'error' }
    const r = await readFlowStatus(deps, slot)
    if (r.status === 'done' || r.status === 'finalizing') {
      try {
        const username = await finalizeRustSignIn(deps, slot, r)
        if (signInState.getSession() === slot) {
          signInState.setCredSessionState({ status: 'done', username })
        }
        return { status: 'done', username }
      } catch (err) {
        logError(
          `Steam credential auth finalization failed (${err instanceof Error ? err.name : typeof err})`,
          LogPrefix.Steam
        )
        if (signInState.getSession() === slot) {
          signInState.setCredSessionState({ status: 'error' })
        }
        return { status: 'error' }
      }
    }
    if (r.status === 'error') {
      logRustError('Steam credential session error', r)
      signInState.setCredSessionState({ status: 'error' })
      return { status: 'error' }
    }
    await sleepUnref(RUST_WAIT_INTERVAL_MS)
  }
  signInState.setCredSessionState({ status: 'error' })
  return { status: 'error' }
}

export async function startQRLogin(deps: UserSignInDeps): Promise<{
  status: 'done' | 'error'
  challengeUrl?: string
}> {
  const signInState = deps.steamSession.signIn
  try {
    logInfo('Steam QR login: attempt starting', LogPrefix.Steam)
    dropPreviousForRust(deps)
    signInState.setQrSessionState({ status: 'waiting' })
    signInState.setQrLastLoggedStatus(null)
    const r = (await deps.requestRustInvoke(
      RUST_STEAMCM_SIGNIN_QR_START,
      []
    )) as { ok?: boolean; flowId?: string; challengeUrl?: string }
    if (!r.flowId || !r.challengeUrl) {
      logError('Steam QR login: Rust returned no flow', LogPrefix.Steam)
      return { status: 'error' }
    }
    signInState.setSession({
      flowId: r.flowId,
      lastChallengeUrl: r.challengeUrl
    })
    return { status: 'done', challengeUrl: r.challengeUrl }
  } catch (err) {
    logError(
      `Steam startQRLogin failed (${err instanceof Error ? err.name : typeof err})`,
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
}

export async function pollQRLogin(deps: SignInPollDeps): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
  challengeUrl?: string
}> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  const known = signInState.getQrSessionState()
  if (!slot) {
    return known.status === 'done'
      ? { status: 'done', username: known.username }
      : { status: known.status }
  }
  if (known.status === 'done') {
    return { status: 'done', username: known.username }
  }
  if (known.status === 'error') return { status: 'error' }
  const r = await readFlowStatus(deps, slot)
  let out: {
    status: 'done' | 'waiting' | 'error'
    username?: string
    challengeUrl?: string
  }
  if (r.status === 'done' || r.status === 'finalizing') {
    // An overlapping poll may already have moved the state on (and finalize may have settled).
    if (signInState.getQrSessionState().status === 'waiting') {
      signInState.setQrSessionState({ status: 'done' })
      finalizeInBackground(
        deps,
        slot,
        r,
        (next) => signInState.setQrSessionState(next),
        'Steam QR auth'
      )
    }
    const now = signInState.getQrSessionState()
    out =
      now.status === 'done'
        ? { status: 'done', username: now.username }
        : { status: now.status }
  } else if (r.status === 'error') {
    logRustError('Steam QR session error', r)
    signInState.setQrSessionState({ status: 'error' })
    out = { status: 'error' }
  } else {
    out = { status: 'waiting' }
    if (
      r.status === 'waiting' &&
      r.challengeUrl &&
      r.challengeUrl !== slot.lastChallengeUrl
    ) {
      slot.lastChallengeUrl = r.challengeUrl
      out.challengeUrl = r.challengeUrl
    }
  }
  if (out.status !== signInState.getQrLastLoggedStatus()) {
    logInfo(
      `Steam QR poll: status ${signInState.getQrLastLoggedStatus() ?? 'none'} -> ${out.status}`,
      LogPrefix.Steam
    )
    signInState.setQrLastLoggedStatus(out.status)
  }
  return out
}

export async function startCredentialLogin(
  deps: UserSignInDeps,
  accountName: string,
  password: string
): Promise<{ status: 'done' | 'guard_required' | 'error' }> {
  const signInState = deps.steamSession.signIn
  try {
    signInState.setCredSessionState({ status: 'waiting' })
    dropPreviousForRust(deps)

    const r = (await deps.requestRustInvoke(
      RUST_STEAMCM_SIGNIN_CREDENTIALS_START,
      [{ accountName, password }]
    )) as {
      flowId?: string
      status?: string
      reason?: string
      eresult?: number
    }
    if (!r.flowId || (r.status !== 'guardRequired' && r.status !== 'waiting')) {
      logRustError('Steam credential login failed', r)
      signInState.setCredSessionState({ status: 'error' })
      return { status: 'error' }
    }
    const slot: RustSlot = { flowId: r.flowId }
    signInState.setSession(slot)
    if (r.status === 'guardRequired') {
      logInfo('Steam Guard required for credential login', LogPrefix.Steam)
      return { status: 'guard_required' }
    }
    return await rustWaitSettle(deps, slot)
  } catch (err) {
    logError(
      `Steam startCredentialLogin failed (${err instanceof Error ? err.name : typeof err})`,
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
}

export async function pollCredentialLogin(deps: SignInPollDeps): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  const known = signInState.getCredSessionState()
  if (!slot || known.status !== 'waiting') {
    return { status: known.status, username: known.username }
  }
  const r = await readFlowStatus(deps, slot)
  if (r.status === 'done' || r.status === 'finalizing') {
    // An overlapping poll may already have moved the state on (and finalize may have settled).
    if (signInState.getCredSessionState().status === 'waiting') {
      signInState.setCredSessionState({ status: 'done' })
      finalizeInBackground(
        deps,
        slot,
        r,
        (next) => signInState.setCredSessionState(next),
        'Steam credential auth'
      )
    }
    const now = signInState.getCredSessionState()
    return { status: now.status, username: now.username }
  }
  if (r.status === 'error') {
    logRustError('Steam credential session error', r)
    signInState.setCredSessionState({ status: 'error' })
    return { status: 'error' }
  }
  return { status: 'waiting' }
}

/**
 * Why a guard submit failed, so the window can tell a retry from a restart (C2/WR-02):
 * - `wrongCode`: Steam rejected the code (EResult 65 email, 88 authenticator); the flow stays in
 *   guardRequired and another code may be submitted.
 * - `failed`: the submit itself did not complete (transport error, Rust rejection); the flow was not
 *   changed, so another submit may work.
 * - `expired`: there is no live flow to submit to any more (no session, Rust no longer knows the
 *   flow, or it ended in error while settling); the user has to start the sign-in again.
 */
export type GuardSubmitFailure = 'wrongCode' | 'failed' | 'expired'

/** EResults that mean "that code was wrong" and leave the flow waiting for another one. */
const WRONG_GUARD_CODE_ERESULTS: readonly number[] = [65, 88]

export async function submitSteamGuardCode(
  deps: UserSignInDeps,
  code: string
): Promise<
  | { status: 'done'; username?: string }
  | { status: 'error'; reason: GuardSubmitFailure }
> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  if (!slot) {
    logWarning(
      'submitSteamGuardCode called but no active session',
      LogPrefix.Steam
    )
    return { status: 'error', reason: 'expired' }
  }
  // Normalise: 5-character email codes may arrive lowercase.
  const normalized = code.trim().toUpperCase()
  let r: { ok?: boolean; kind?: string; eresult?: number }
  try {
    r = (await deps.requestRustInvoke(RUST_STEAMCM_SIGNIN_GUARD_SUBMIT, [
      { flowId: slot.flowId, code: normalized }
    ])) as { ok?: boolean; kind?: string; eresult?: number }
  } catch (err) {
    logError(
      `Steam guard code submission failed (${err instanceof Error ? err.name : typeof err})`,
      LogPrefix.Steam
    )
    return { status: 'error', reason: 'failed' }
  }
  if (r.ok === false) {
    logError(
      `Steam guard code submission failed: ${r.kind ?? 'error'} EResult=${r.eresult ?? 'unknown'}`,
      LogPrefix.Steam
    )
    if (r.kind === 'unknownFlow') return { status: 'error', reason: 'expired' }
    if (
      r.kind === 'eresult' &&
      typeof r.eresult === 'number' &&
      WRONG_GUARD_CODE_ERESULTS.includes(r.eresult)
    ) {
      return { status: 'error', reason: 'wrongCode' }
    }
    return { status: 'error', reason: 'failed' }
  }
  try {
    const settled = await rustWaitSettle(deps, slot)
    // A settle error means the flow ended (denied, timed out, superseded or finalisation failed).
    return settled.status === 'done'
      ? { status: 'done', username: settled.username }
      : { status: 'error', reason: 'expired' }
  } catch (err) {
    logError(
      `Steam guard code submission failed while settling (${err instanceof Error ? err.name : typeof err})`,
      LogPrefix.Steam
    )
    return { status: 'error', reason: 'expired' }
  }
}
