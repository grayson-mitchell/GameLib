import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import { noteSignInSucceeded } from 'backend/signInProbe/outcomes'
import { configStore } from './stores'
import { getTokenStore } from './tokenStore'
import { withTimeout } from './withTimeout'
import { SteamUser } from './user'
import { QR_LOGIN_TIMEOUT_MS, SIGN_IN_PERSONA_TIMEOUT_MS } from './userTypes'
import {
  addCredSettleCallback,
  getCredSessionState,
  getQrLastLoggedStatus,
  getQrSessionState,
  getSession,
  setCredSessionState,
  setQrLastLoggedStatus,
  setQrSessionState,
  setSession,
  takeCredSettleCallbacks
} from './userSignInState'

// ── Shared auth success path ───────────────────────────────────────────────

export async function finishAuth(
  session: InstanceType<typeof LoginSession>
): Promise<string> {
  const refreshToken = session.refreshToken
  // Store credentials immediately — don't block on the steam-user CM connection.
  await getTokenStore().setToken(refreshToken)
  configStore.set('isLoggedIn', true)
  configStore.delete('credentialsMissing')
  // Phase 49: a completed sign-in outranks any probe that began earlier.
  noteSignInSucceeded('steam')

  // Log on (through the wrapped entry point) only to read the persona name.
  // If this fails the user is still logged in (credentials already stored
  // above), so we fall back to a placeholder.
  const personaName = await resolveSignInProfile(session)

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
  session: InstanceType<typeof LoginSession>
): Promise<string> {
  let personaName = session.accountName || 'Steam User'
  let steamId = ''
  try {
    steamId = session.steamID?.getSteamID64() ?? ''
  } catch {
    // steamID is derived from the token; absence is not fatal here
  }
  const lease = await SteamUser.acquireAuthenticatedWithToken(
    { reason: 'login' },
    session.refreshToken
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
  configStore.set('userData', { username: personaName, steamId })
  return personaName
}

async function completeQrProfile(
  session: InstanceType<typeof LoginSession>
): Promise<void> {
  try {
    const username = await resolveSignInProfile(session)
    setQrSessionState({ status: 'done', username })
  } catch (err) {
    logWarning(['Steam QR background CM connect failed:', err], LogPrefix.Steam)
  }
}

// ── Credential session settlement helpers ──────────────────────────────────

/**
 * Called when the credential session authenticates, errors, or times out.
 * Stores the final state and drains any _waitForCredSession() callers.
 */
function _settleCredSession(status: 'done' | 'error', username?: string): void {
  setCredSessionState({ status, username })
  const callbacks = takeCredSettleCallbacks()
  for (const cb of callbacks) cb({ status })
}

/**
 * Returns a Promise that resolves once credSessionState leaves 'waiting'.
 * If already settled, resolves immediately. Used by submitSteamGuardCode
 * so it can share the same authenticated/error/timeout listeners registered
 * in startCredentialLogin without attaching duplicate handlers.
 */
function _waitForCredSession(): Promise<{ status: 'done' | 'error' }> {
  const state = getCredSessionState()
  if (state.status !== 'waiting') {
    return Promise.resolve({ status: state.status })
  }
  return new Promise<{ status: 'done' | 'error' }>((resolve) => {
    addCredSettleCallback(resolve)
  })
}

// ── AUTH-02: Credential login status poll ─────────────────────────────────

/**
 * Returns the current credential session authentication state, mirroring
 * pollQRLogin() for the credential+guard flow. Used by the frontend to
 * detect out-of-band completion (e.g. DeviceConfirmation phone approval)
 * while the user is on the guard-code entry screen.
 */
export async function pollCredentialLogin(): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}> {
  const state = getCredSessionState()
  return { status: state.status, username: state.username }
}

// ── AUTH-01: QR Login ──────────────────────────────────────────────────────

export async function startQRLogin(): Promise<{
  status: 'done' | 'error'
  challengeUrl?: string
}> {
  try {
    logInfo('Steam QR login: attempt starting', LogPrefix.Steam)

    // Tear down previous session before replacing it
    const previousSession = getSession()
    if (previousSession) {
      logInfo(
        'Steam QR login: cancelling a previous login session before starting a new one',
        LogPrefix.Steam
      )
      previousSession.cancelLoginAttempt()
      setSession(null)
    }

    const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
    // Give the user 2 minutes to scan and approve. The default 30 s kills the
    // session before the phone's approval round-trip completes.
    session.loginTimeout = QR_LOGIN_TIMEOUT_MS
    setSession(session)
    setQrSessionState({ status: 'waiting' })
    setQrLastLoggedStatus(null)

    const response = await session.startWithQR()

    session.once('authenticated', async () => {
      try {
        logInfo(
          'Steam QR login: authenticated event received — finalizing session',
          LogPrefix.Steam
        )
        await getTokenStore().setToken(session.refreshToken)
        configStore.set('isLoggedIn', true)
        configStore.delete('credentialsMissing')
        // Phase 49: a completed sign-in outranks any probe that began earlier.
        noteSignInSucceeded('steam')

        // Mark done synchronously so pollQRLogin() returns 'done' as soon as
        // the user approves on their phone — don't block the UI on the CM
        // connection. The persona name (and client.steamID) are populated in
        // the background below and surface on a later poll.
        setQrSessionState({ status: 'done' })

        // The background connect shares the single-flight connectingPromise
        // (set synchronously below: the token is passed in memory), so a
        // concurrent ensureConnected() from the post-login refresh awaits it
        // instead of opening a second logon.
        void completeQrProfile(session)
      } catch (err) {
        logError(['Steam QR auth finalization failed:', err], LogPrefix.Steam)
        setQrSessionState({ status: 'error' })
      }
    })

    session.once('timeout', () => {
      logWarning('Steam QR session timed out', LogPrefix.Steam)
      setQrSessionState({ status: 'error' })
    })

    session.once('error', (err: Error) => {
      logError(['Steam QR session error:', err], LogPrefix.Steam)
      setQrSessionState({ status: 'error' })
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

export async function pollQRLogin(): Promise<{
  status: 'done' | 'waiting' | 'error'
  username?: string
}> {
  const state = getQrSessionState()
  if (state.status !== getQrLastLoggedStatus()) {
    logInfo(
      `Steam QR poll: status ${getQrLastLoggedStatus() ?? 'none'} -> ${state.status}`,
      LogPrefix.Steam
    )
    setQrLastLoggedStatus(state.status)
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
  username: string,
  password: string
): Promise<{ status: 'done' | 'guard_required' | 'error' }> {
  try {
    // Drain any pending callbacks from a previous guard_required attempt
    // (e.g. user pressed "Back to Credentials" and is starting a new login).
    const staleCallbacks = takeCredSettleCallbacks()
    setCredSessionState({ status: 'waiting' })
    for (const cb of staleCallbacks) cb({ status: 'error' })

    // Tear down previous session before replacing it
    const previousSession = getSession()
    if (previousSession) {
      previousSession.cancelLoginAttempt()
      setSession(null)
    }

    const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
    // Set loginTimeout before startWithCredentials (steam-session throws if
    // changed after polling starts, LoginSession.js:107). 180 s gives ample
    // time for email retrieval. Mirrors the QR path's 120 s setting.
    session.loginTimeout = 180000
    setSession(session)

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
          const personaName = await finishAuth(session)
          _settleCredSession('done', personaName)
        } catch (err) {
          logError(
            ['Steam credential auth finalization failed:', err],
            LogPrefix.Steam
          )
          _settleCredSession('error')
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
        _settleCredSession('error')
      })

      session.once('timeout', () => {
        logWarning('Steam credential session timed out', LogPrefix.Steam)
        _settleCredSession('error')
      })

      logInfo('Steam Guard required for credential login', LogPrefix.Steam)
      return { status: 'guard_required' }
    }

    // No guard required — wait for authenticated event (polling started internally)
    return new Promise<{ status: 'done' | 'error' }>((resolve) => {
      session.once('authenticated', async () => {
        try {
          await finishAuth(session)
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
  code: string
): Promise<{ status: 'done' | 'error' }> {
  const session = getSession()
  if (!session) {
    logWarning(
      'submitSteamGuardCode called but no active session',
      LogPrefix.Steam
    )
    return { status: 'error' }
  }

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
    return await _waitForCredSession()
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
