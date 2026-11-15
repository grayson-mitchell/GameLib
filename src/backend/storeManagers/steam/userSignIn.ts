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
  known: { refreshToken: string; accountName?: string; steamId: string }
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
  deps.stores.steam.configStore.set('userData', {
    username: personaName,
    steamId
  })
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
    if (r.status !== 'done' && slot.finalize) return { status: 'finalizing' }
    return r
  } catch (err) {
    if (slot.finalize) return { status: 'finalizing' }
    logWarning(
      `Steam sign-in status read failed (${err instanceof Error ? err.name : typeof err})`,
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
}

function logRustError(what: string, r: { eresult?: number; reason?: string }) {
  logError(
    `${what}: ${r.reason ?? 'error'} EResult=${r.eresult ?? 'unknown'}`,
    LogPrefix.Steam
  )
}

/**
 * Done-handling for a rust flow: the token is stored BEFORE the persona logon (D-06), so a failed
 * logon never loses it. Memoised on the slot: concurrent polls finalise once.
 */
async function finalizeRustSignIn(
  deps: UserSignInDeps,
  slot: RustSlot,
  done: Extract<RustFlowStatus, { status: 'done' }> | Finalizing
): Promise<string> {
  if (slot.finalize) return slot.finalize
  if (done.status !== 'done') throw new Error('rust sign-in finalize missing')
  slot.finalize = (async () => {
    await deps.tokenStore.current().setToken(done.refreshToken)
    deps.stores.steam.configStore.set('isLoggedIn', true)
    deps.stores.steam.configStore.delete('credentialsMissing')
    deps.signIn.outcomes.noteSignInSucceeded('steam')
    const name = await resolveProfile(deps, {
      refreshToken: done.refreshToken,
      accountName: done.accountName,
      steamId: done.steamId ?? ''
    })
    logInfo('Steam auth complete (rust sign-in)', LogPrefix.Steam)
    return name
  })()
  return slot.finalize
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
        signInState.setCredSessionState({ status: 'done', username })
        return { status: 'done', username }
      } catch (err) {
        logError(
          `Steam credential auth finalization failed (${err instanceof Error ? err.name : typeof err})`,
          LogPrefix.Steam
        )
        signInState.setCredSessionState({ status: 'error' })
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
    try {
      const username = await finalizeRustSignIn(deps, slot, r)
      signInState.setQrSessionState({ status: 'done', username })
      out = { status: 'done', username }
    } catch (err) {
      logError(
        `Steam QR auth finalization failed (${err instanceof Error ? err.name : typeof err})`,
        LogPrefix.Steam
      )
      signInState.setQrSessionState({ status: 'error' })
      out = { status: 'error' }
    }
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
    try {
      const username = await finalizeRustSignIn(deps, slot, r)
      signInState.setCredSessionState({ status: 'done', username })
      return { status: 'done', username }
    } catch {
      signInState.setCredSessionState({ status: 'error' })
      return { status: 'error' }
    }
  }
  if (r.status === 'error') {
    logRustError('Steam credential session error', r)
    signInState.setCredSessionState({ status: 'error' })
    return { status: 'error' }
  }
  return { status: 'waiting' }
}

export async function submitSteamGuardCode(
  deps: UserSignInDeps,
  code: string
): Promise<{ status: 'done' | 'error' }> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  if (!slot) {
    logWarning(
      'submitSteamGuardCode called but no active session',
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
  // Normalise: 5-character email codes may arrive lowercase.
  const normalized = code.trim().toUpperCase()
  try {
    const r = (await deps.requestRustInvoke(RUST_STEAMCM_SIGNIN_GUARD_SUBMIT, [
      { flowId: slot.flowId, code: normalized }
    ])) as { ok?: boolean; kind?: string; eresult?: number }
    if (r.ok === false) {
      // A wrong code (EResult 65) leaves the flow in guardRequired: the user may submit again.
      logError(
        `Steam guard code submission failed: ${r.kind ?? 'error'} EResult=${r.eresult ?? 'unknown'}`,
        LogPrefix.Steam
      )
      return { status: 'error' }
    }
    return await rustWaitSettle(deps, slot)
  } catch (err) {
    logError(
      `Steam guard code submission failed (${err instanceof Error ? err.name : typeof err})`,
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
}
