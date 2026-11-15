import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import type { SignInNoteDeps } from 'backend/signInProbe/outcomes'
import type { SteamStoresDeps } from './library/installRoot'
import type { TokenStoreSlot } from './tokenStore'
import { withTimeout } from './withTimeout'
import { QR_LOGIN_TIMEOUT_MS, SIGN_IN_PERSONA_TIMEOUT_MS } from './userTypes'
import type { SignInSession, SteamSignInState } from './userSignInState'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import {
  RUST_STEAMCM_SIGNIN_CANCEL,
  RUST_STEAMCM_SIGNIN_CREDENTIALS_START,
  RUST_STEAMCM_SIGNIN_GUARD_SUBMIT,
  RUST_STEAMCM_SIGNIN_QR_START,
  RUST_STEAMCM_SIGNIN_STATUS
} from 'common/types/sidecarTransport'
import { steamCmSignInImpl } from './cm/steamCmFlags'
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

/** What the poll and guard-submit flows need from the sign-in deps; the rust engine needs all of them. */
type SignInPollDeps = Pick<UserSignInDeps, 'steamSession'> &
  Partial<UserSignInDeps>

// ── Shared auth success path ───────────────────────────────────────────────

export async function finishAuth(
  deps: UserSignInDeps,
  session: InstanceType<typeof LoginSession>
): Promise<string> {
  const refreshToken = session.refreshToken
  // Store credentials immediately — don't block on the steam-user CM connection.
  await deps.tokenStore.current().setToken(refreshToken)
  deps.stores.steam.configStore.set('isLoggedIn', true)
  deps.stores.steam.configStore.delete('credentialsMissing')
  // Phase 49: a completed sign-in outranks any probe that began earlier.
  deps.signIn.outcomes.noteSignInSucceeded('steam')

  // Log on (through the wrapped entry point) only to read the persona name.
  // If this fails the user is still logged in (credentials already stored
  // above), so we fall back to a placeholder.
  const personaName = await resolveSignInProfile(deps, session)

  logInfo(`Steam auth complete — logged in as ${personaName}`, LogPrefix.Steam)
  return personaName
}

/**
 * Sign-in profile: logs on through the SAME wrapped entry point as every
 * other authenticated connect (the token is passed in memory, so the keyring
 * is not read again), reads the persona name bounded at 5 s, writes
 * userData, and returns the display name. The steamId comes from the
 * steam-session LoginSession, which needs no CM.
 */
async function resolveSignInProfile(
  deps: UserSignInDeps,
  session: InstanceType<typeof LoginSession>
): Promise<string> {
  let steamId = ''
  try {
    steamId = session.steamID?.getSteamID64() ?? ''
  } catch {
    // steamID is derived from the token; absence is not fatal here
  }
  return resolveProfile(deps, {
    refreshToken: session.refreshToken,
    accountName: session.accountName,
    steamId
  })
}

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

async function completeQrProfile(
  deps: UserSignInDeps,
  session: InstanceType<typeof LoginSession>
): Promise<void> {
  const signInState = deps.steamSession.signIn
  try {
    const username = await resolveSignInProfile(deps, session)
    signInState.setQrSessionState({ status: 'done', username })
  } catch (err) {
    logWarning(['Steam QR background CM connect failed:', err], LogPrefix.Steam)
  }
}

// ── Credential session settlement helpers ──────────────────────────────────

/**
 * Called when the credential session authenticates, errors, or times out.
 * Stores the final state and drains any _waitForCredSession() callers.
 */
function _settleCredSession(
  signInState: SteamSignInState,
  status: 'done' | 'error',
  username?: string
): void {
  signInState.setCredSessionState({ status, username })
  const callbacks = signInState.takeCredSettleCallbacks()
  for (const cb of callbacks) cb({ status })
}

/**
 * Returns a Promise that resolves once credSessionState leaves 'waiting'.
 * If already settled, resolves immediately. Used by submitSteamGuardCode
 * so it can share the same authenticated/error/timeout listeners registered
 * in startCredentialLogin without attaching duplicate handlers.
 */
function _waitForCredSession(
  signInState: SteamSignInState
): Promise<{ status: 'done' | 'error' }> {
  const state = signInState.getCredSessionState()
  if (state.status !== 'waiting') {
    return Promise.resolve({ status: state.status })
  }
  return new Promise<{ status: 'done' | 'error' }>((resolve) => {
    signInState.addCredSettleCallback(resolve)
  })
}

// ── AUTH-02: Credential login status poll ─────────────────────────────────

/**
 * Returns the current credential session authentication state, mirroring
 * pollQRLogin() for the credential+guard flow. Used by the frontend to
 * detect out-of-band completion (e.g. DeviceConfirmation phone approval)
 * while the user is on the guard-code entry screen.
 */
export async function pollCredentialLogin(deps: SignInPollDeps): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}> {
  const signInState = deps.steamSession.signIn
  if (steamCmSignInImpl() === 'rust') {
    return rustPollCredentialLogin(deps as UserSignInDeps)
  }
  const state = signInState.getCredSessionState()
  return { status: state.status, username: state.username }
}

// ── AUTH-01: QR Login ──────────────────────────────────────────────────────

export async function startQRLogin(deps: UserSignInDeps): Promise<{
  status: 'done' | 'error'
  challengeUrl?: string
}> {
  if (steamCmSignInImpl() === 'rust') return rustStartQRLogin(deps)
  const signInState = deps.steamSession.signIn
  try {
    logInfo('Steam QR login: attempt starting', LogPrefix.Steam)

    // Tear down previous session before replacing it
    const previousSession = signInState.getSession()
    if (previousSession) {
      logInfo(
        'Steam QR login: cancelling a previous login session before starting a new one',
        LogPrefix.Steam
      )
      if (previousSession.kind === 'ts') {
        previousSession.session.cancelLoginAttempt()
      }
      signInState.setSession(null)
    }

    const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
    // Give the user 2 minutes to scan and approve. The default 30 s kills the
    // session before the phone's approval round-trip completes.
    session.loginTimeout = QR_LOGIN_TIMEOUT_MS
    signInState.setSession({ kind: 'ts', session })
    signInState.setQrSessionState({ status: 'waiting' })
    signInState.setQrLastLoggedStatus(null)

    const response = await session.startWithQR()

    session.once('authenticated', async () => {
      try {
        logInfo(
          'Steam QR login: authenticated event received — finalizing session',
          LogPrefix.Steam
        )
        await deps.tokenStore.current().setToken(session.refreshToken)
        deps.stores.steam.configStore.set('isLoggedIn', true)
        deps.stores.steam.configStore.delete('credentialsMissing')
        // Phase 49: a completed sign-in outranks any probe that began earlier.
        deps.signIn.outcomes.noteSignInSucceeded('steam')

        // Mark done synchronously so pollQRLogin() returns 'done' as soon as
        // the user approves on their phone — don't block the UI on the CM
        // connection. The persona name (and client.steamID) are populated in
        // the background below and surface on a later poll.
        signInState.setQrSessionState({ status: 'done' })

        // The background connect shares the single-flight connectingPromise
        // (set synchronously below: the token is passed in memory), so a
        // concurrent ensureConnected() from the post-login refresh awaits it
        // instead of opening a second logon.
        void completeQrProfile(deps, session)
      } catch (err) {
        logError(['Steam QR auth finalization failed:', err], LogPrefix.Steam)
        signInState.setQrSessionState({ status: 'error' })
      }
    })

    session.once('timeout', () => {
      logWarning('Steam QR session timed out', LogPrefix.Steam)
      signInState.setQrSessionState({ status: 'error' })
    })

    session.once('error', (err: Error) => {
      logError(['Steam QR session error:', err], LogPrefix.Steam)
      signInState.setQrSessionState({ status: 'error' })
    })

    logInfo(
      `Steam QR login: challenge issued — waiting for phone approval (loginTimeout=${QR_LOGIN_TIMEOUT_MS}ms)`,
      LogPrefix.Steam
    )
    return { status: 'done', challengeUrl: response.qrChallengeUrl }
  } catch (err) {
    logError(['Steam startQRLogin failed:', err], LogPrefix.Steam)
    return { status: 'error' }
  }
}

// ── AUTH-01: QR Poll ───────────────────────────────────────────────────────

export async function pollQRLogin(deps: SignInPollDeps): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
  challengeUrl?: string
}> {
  if (steamCmSignInImpl() === 'rust') {
    return rustPollQRLogin(deps as UserSignInDeps)
  }
  const signInState = deps.steamSession.signIn
  const state = signInState.getQrSessionState()
  if (state.status !== signInState.getQrLastLoggedStatus()) {
    logInfo(
      `Steam QR poll: status ${signInState.getQrLastLoggedStatus() ?? 'none'} -> ${state.status}`,
      LogPrefix.Steam
    )
    signInState.setQrLastLoggedStatus(state.status)
  }
  if (state.status === 'done') {
    // username is undefined until the background CM connection resolves the
    // persona name (see the QR 'authenticated' handler). The frontend picks
    // up the real name on a subsequent poll once it's populated.
    return { status: 'done', username: state.username }
  }
  if (state.status === 'error') {
    return { status: 'error' }
  }
  return { status: 'waiting' }
}

// ── AUTH-02: Credential Login ──────────────────────────────────────────────

export async function startCredentialLogin(
  deps: UserSignInDeps,
  username: string,
  password: string
): Promise<{ status: 'done' | 'guard_required' | 'error' }> {
  if (steamCmSignInImpl() === 'rust') {
    return rustStartCredentialLogin(deps, username, password)
  }
  const signInState = deps.steamSession.signIn
  try {
    // Drain any pending callbacks from a previous guard_required attempt
    // (e.g. user pressed "Back to Credentials" and is starting a new login).
    const staleCallbacks = signInState.takeCredSettleCallbacks()
    signInState.setCredSessionState({ status: 'waiting' })
    for (const cb of staleCallbacks) cb({ status: 'error' })

    // Tear down previous session before replacing it
    const previousSession = signInState.getSession()
    if (previousSession) {
      if (previousSession.kind === 'ts') {
        previousSession.session.cancelLoginAttempt()
      }
      signInState.setSession(null)
    }

    const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
    // Set loginTimeout before startWithCredentials (steam-session throws if
    // changed after polling starts, LoginSession.js:107). 180 s gives ample
    // time for email retrieval. Mirrors the QR path's 120 s setting.
    session.loginTimeout = 180000
    signInState.setSession({ kind: 'ts', session })

    const response = await session.startWithCredentials({
      accountName: username,
      password
      // NOTE: password is passed to steam-session but never written to configStore
    })

    if (response.actionRequired) {
      // Attach persistent listeners BEFORE returning guard_required.
      //
      // When DeviceConfirmation (type 4) is in validActions, steam-session
      // calls setImmediate(_doPoll) inside _processStartSessionResponse before
      // returning. That setImmediate is queued but has NOT run yet — we are in
      // the microtask checkpoint immediately after the await resolved. Registering
      // here guarantees our handlers are in place before the first poll executes.
      //
      // Two purposes:
      //  (a) DeviceConfirmation / phone-approval path: 'authenticated' fires
      //      when the user approves on their phone. finishAuth stores the token
      //      and the frontend picks up the done state via pollCredentialLogin().
      //  (b) DeviceCode / typed-authenticator path: after submitSteamGuardCode()
      //      resolves, steam-session triggers a poll that returns a refreshToken
      //      and fires 'authenticated' here. _settleCredSession resolves
      //      _waitForCredSession() inside submitSteamGuardCode without needing
      //      a second set of duplicate listeners on the same session object.
      session.once('authenticated', async () => {
        try {
          const personaName = await finishAuth(deps, session)
          _settleCredSession(signInState, 'done', personaName)
        } catch (err) {
          logError(
            ['Steam credential auth finalization failed:', err],
            LogPrefix.Steam
          )
          _settleCredSession(signInState, 'error')
        }
      })

      session.once('error', (err: Error) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errAny = err as any
        const eresult = errAny?.eresult ?? errAny?.EResult ?? 'unknown'
        logError(
          [
            `Steam credential session error: EResult=${eresult} msg=${err.message}`
          ],
          LogPrefix.Steam
        )
        _settleCredSession(signInState, 'error')
      })

      session.once('timeout', () => {
        logWarning('Steam credential session timed out', LogPrefix.Steam)
        _settleCredSession(signInState, 'error')
      })

      logInfo('Steam Guard required for credential login', LogPrefix.Steam)
      return { status: 'guard_required' }
    }

    // No guard required — wait for authenticated event (polling started internally)
    return new Promise<{ status: 'done' | 'error' }>((resolve) => {
      session.once('authenticated', async () => {
        try {
          await finishAuth(deps, session)
          resolve({ status: 'done' })
        } catch (err) {
          logError(
            ['Steam credential auth finalization failed:', err],
            LogPrefix.Steam
          )
          resolve({ status: 'error' })
        }
      })

      session.once('error', (err: Error) => {
        logError(['Steam credential session error:', err], LogPrefix.Steam)
        resolve({ status: 'error' })
      })

      session.once('timeout', () => {
        logWarning('Steam credential session timed out', LogPrefix.Steam)
        resolve({ status: 'error' })
      })
    })
  } catch (err) {
    logError(['Steam startCredentialLogin failed:', err], LogPrefix.Steam)
    return { status: 'error' }
  }
}

// ── AUTH-02: Submit SteamGuard code ───────────────────────────────────────

export async function submitSteamGuardCode(
  deps: SignInPollDeps,
  code: string
): Promise<{ status: 'done' | 'error' }> {
  if (steamCmSignInImpl() === 'rust') {
    return rustSubmitSteamGuardCode(deps as UserSignInDeps, code)
  }
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  if (slot?.kind !== 'ts') {
    logWarning(
      'submitSteamGuardCode called but no active session',
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
  const session = slot.session

  // Defense-in-depth: normalize to uppercase and strip whitespace so that
  // 5-character alphanumeric EMAIL guard codes (e.g. kqm4f → KQM4F) are
  // accepted regardless of how the frontend formatted them. .toUpperCase()
  // is a no-op for purely numeric TOTP/authenticator codes (e.g. 12345).
  const normalized = code.trim().toUpperCase()

  try {
    await session.submitSteamGuardCode(normalized)

    // The 'authenticated'/'error'/'timeout' listeners on this session were
    // registered in startCredentialLogin (guard_required branch). Do NOT
    // register duplicate listeners here — instead wait for _settleCredSession
    // to be called by the already-registered handlers. This prevents double
    // finishAuth calls and avoids listener leaks.
    return await _waitForCredSession(signInState)
  } catch (err) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errAny = err as any
    const eresult = errAny?.eresult ?? errAny?.EResult ?? 'unknown'
    logError(
      [
        `Steam guard code submission failed: EResult=${eresult}, message=${errAny?.message ?? 'none'}`
      ],
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
}

// ── Rust engine (GAMELIB_STEAMCM_SIGNIN=rust, Phase 79 D-05..D-08, CF-08) ─────
// The Web API flows live in Rust; TS keeps the token store, finishing and the UI contract.
// Never logged: the password, guard code, refresh token, account name, SteamID.

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

type RustSlot = Extract<SignInSession, { kind: 'rust' }>

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
  if (previous.kind === 'rust') fireAndForgetCancel(deps, previous.flowId)
  else previous.session.cancelLoginAttempt()
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

async function rustStartQRLogin(deps: UserSignInDeps): Promise<{
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
      kind: 'rust',
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

async function rustPollQRLogin(deps: UserSignInDeps): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
  challengeUrl?: string
}> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  const known = signInState.getQrSessionState()
  if (slot?.kind !== 'rust') {
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

async function rustStartCredentialLogin(
  deps: UserSignInDeps,
  accountName: string,
  password: string
): Promise<{ status: 'done' | 'guard_required' | 'error' }> {
  const signInState = deps.steamSession.signIn
  try {
    const staleCallbacks = signInState.takeCredSettleCallbacks()
    signInState.setCredSessionState({ status: 'waiting' })
    for (const cb of staleCallbacks) cb({ status: 'error' })
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
    const slot: RustSlot = { kind: 'rust', flowId: r.flowId }
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

async function rustPollCredentialLogin(deps: UserSignInDeps): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  const known = signInState.getCredSessionState()
  if (slot?.kind !== 'rust' || known.status !== 'waiting') {
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

async function rustSubmitSteamGuardCode(
  deps: UserSignInDeps,
  code: string
): Promise<{ status: 'done' | 'error' }> {
  const signInState = deps.steamSession.signIn
  const slot = signInState.getSession()
  if (slot?.kind !== 'rust') {
    logWarning(
      'submitSteamGuardCode called but no active session',
      LogPrefix.Steam
    )
    return { status: 'error' }
  }
  // Same normalisation as the ts engine: 5-character email codes may arrive lowercase.
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
