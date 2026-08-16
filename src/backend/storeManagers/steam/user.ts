import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS } from './constants'
import { getTokenStore, readTokenOutcome } from './tokenStore'
import { currentTriggerLabel } from './authTrigger'
import { withTimeout } from './withTimeout'
import { platform } from 'process'
import type {
  RedeemKeyOutcome,
  RedeemKeyResult,
  SteamUserData
} from 'common/types/steam'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import SteamUserLib from 'steam-user'

// ── D-02 (Phase 33-02): ensureConnected canary + relog revalidation ─────────
//
// CANARY_APP_ID = 753 is the Steam client's own AppID — a minimal,
// universally-owned probe app that requires no per-user ownership check, so
// the canary getProductInfo call never fails for reasons unrelated to CM
// socket health.
//
// CANARY_TIMEOUT_MS is deliberately far below STEAM_PICS_TIMEOUT_MS (25s,
// withTimeout.ts) — a healthy CM answers a single-app getProductInfo in well
// under a second; 5s already generously covers network jitter before we
// suspect a stale socket.
//
// RELOG_GRACE_MS mirrors the existing cold-connect grace window below
// (~20s) — client.relog()'s own bounded 4s force-teardown fallback
// (steam-user 09-logon.js) plus its exponential-backoff reconnect
// comfortably fits inside this window.
const CANARY_APP_ID = 753
const CANARY_TIMEOUT_MS = 5000
const RELOG_GRACE_MS = 20000

// ── SteamUser static class ────────────────────────────────────────────────────

export class SteamUser {
  private static client: InstanceType<typeof SteamUserLib> | null = null
  private static session: InstanceType<typeof LoginSession> | null = null
  private static connectingPromise: Promise<string> | null = null
  private static qrSessionState: {
    status: 'waiting' | 'done' | 'error'
    username?: string
  } = { status: 'waiting' }

  // Credential session completion state — parallel to qrSessionState.
  // Settled by the 'authenticated'/'error'/'timeout' listeners registered in
  // startCredentialLogin's guard_required branch. Allows:
  //  (a) DeviceConfirmation phone-approval path to complete login out-of-band
  //      (frontend polls pollCredentialLogin(), like pollQRLogin() for QR).
  //  (b) submitSteamGuardCode to wait for the same settlement instead of
  //      registering a second set of duplicate listeners.
  private static credSessionState: {
    status: 'waiting' | 'done' | 'error'
    username?: string
  } = { status: 'waiting' }
  // Resolve callbacks waiting for credSessionState to change from 'waiting'.
  private static _credSettleCallbacks: Array<
    (result: { status: 'done' | 'error' }) => void
  > = []

  // ── AUTH-05: Steam client detection ────────────────────────────────────────

  static isSteamClientInstalled(): boolean {
    const paths = STEAM_INSTALL_PATHS[platform] ?? []
    return paths.some((p) => existsSync(p))
  }

  // ── AUTH-03: Login state ───────────────────────────────────────────────────

  static isLoggedIn(): boolean {
    return Boolean(configStore.get_nodefault('isLoggedIn'))
  }

  // ── LIB-01: Authenticated client accessor ─────────────────────────────────

  static getClient(): InstanceType<typeof SteamUserLib> | null {
    return this.client
  }

  // ── LIB-01: Reconnect on startup ───────────────────────────────────────────

  /**
   * Ensure a live, authenticated steam-user client exists. The client is an
   * in-memory connection that does not survive an app restart, so on startup we
   * re-log-on using the persisted refresh token. Returns true only when the CM
   * connection is established (client.steamID populated). Concurrent callers
   * share a single in-flight connection attempt.
   */
  static async ensureConnected(): Promise<boolean> {
    if (this.client?.steamID) {
      const client = this.client
      try {
        // D-02: a populated client.steamID alone is NOT proof of a live CM
        // connection — a silently-dropped socket (NAT timeout, dead TCP with
        // no FIN/RST ever delivered) leaves steamID populated indefinitely
        // (verified against installed steam-user v5.3.0 source,
        // 09-logon.js). Race a cheap canary call, bounded well below
        // STEAM_PICS_TIMEOUT_MS, so the healthy common case still resolves
        // near-instantly. Tradeoff note (mirrors every other withTimeout
        // site in depot.ts): if this canary times out, the queued request is
        // abandoned locally, not network-cancelled — a pre-accepted,
        // already-consistent tradeoff, not new to this fix.
        await withTimeout(
          client.getProductInfo([CANARY_APP_ID], [], true),
          CANARY_TIMEOUT_MS,
          'ensureConnected canary'
        )
        logInfo(
          '[Timing] SteamUser.ensureConnected: already connected (fast path, canary OK)',
          LogPrefix.Steam
        )
        return true
      } catch (canaryErr) {
        logWarning(
          [
            'Steam: ensureConnected canary failed — socket may be stale, attempting relog:',
            canaryErr
          ],
          LogPrefix.Steam
        )

        let relogStarted = true
        try {
          // client.relog() tears down the half-open socket (its own bounded
          // 4s force-teardown fallback) and reconnects using the stored
          // refresh/access token — no user interaction (verified
          // 09-logon.js:604-624). Guarded because relog() throws
          // synchronously if steamID is falsy or the prior login was not
          // token-based; on throw we fall through to the cold-connect path
          // below rather than crashing.
          client.relog()
        } catch (relogErr) {
          relogStarted = false
          logWarning(
            [
              'Steam: client.relog() threw — falling through to cold-connect path:',
              relogErr
            ],
            LogPrefix.Steam
          )
        }

        if (relogStarted) {
          const relogStart = Date.now()
          const relogResult = await new Promise<boolean>((resolve) => {
            const grace = setTimeout(() => resolve(false), RELOG_GRACE_MS)
            client.once('loggedOn', () => {
              clearTimeout(grace)
              resolve(Boolean(client.steamID))
            })
            client.once('error', () => {
              clearTimeout(grace)
              resolve(false)
            })
          })
          logInfo(
            `[Timing] SteamUser.ensureConnected: relog grace-window wait took ${Date.now() - relogStart}ms, connected=${relogResult}`,
            LogPrefix.Steam
          )
          return relogResult
        }
        // relog() threw synchronously — fall through to the existing
        // cold-connect path below rather than returning here.
      }
    }
    if (!this.isLoggedIn()) return false

    // quick-260814-r2d: branch on the three-state outcome instead of the
    // lossy getCredentials() collapse, so a keyring read that FAILED
    // (timeout, or a Keychain Deny) is never reported the same way as a
    // slot that was genuinely never written to. Scope note: this plan
    // surfaces the retryable condition in the backend log and in the
    // return value only — no new IPC channel and no frontend banner is
    // added here, that is separate work.
    const outcome = await readTokenOutcome(getTokenStore(), currentTriggerLabel())
    if (outcome.status === 'unreadable') {
      // Deliberately does NOT contain the substring "no stored refresh
      // token" — that string reads to a user/log-reader as "you are signed
      // out", which is exactly the false state this fix closes. The
      // session (isLoggedIn/userData) is left untouched; no clearToken()
      // and no configStore.delete happen on this path.
      logWarning(
        `Steam: refresh token read failed (${outcome.reason}) — this is retryable, ` +
          'keeping the signed-in session and NOT clearing any credentials',
        LogPrefix.Steam
      )
      return false
    }
    if (outcome.status === 'absent') {
      logWarning(
        'Steam: logged in but no stored refresh token — cannot reconnect',
        LogPrefix.Steam
      )
      return false
    }

    const start = Date.now()
    if (!this.connectingPromise) {
      this.connectingPromise = this.connectSteamUserClient(
        outcome.token
      ).finally(() => {
        this.connectingPromise = null
      })
    }
    await this.connectingPromise
    // [Timing] debug/steam-install-slow-start: cold-connect / CM-login path —
    // this is the candidate ~15s-worst-case cost (connectSteamUserClient's own
    // logOn timeout). Temporary instrumentation.
    logInfo(
      `[Timing] SteamUser.ensureConnected: cold-connect path took ${Date.now() - start}ms`,
      LogPrefix.Steam
    )

    if (this.client?.steamID) return true

    // debug/steam-relogin-no-autorefresh: connectSteamUserClient's own 15s
    // timeout is calibrated for the LOGIN UX (give up waiting for a persona
    // name and show a placeholder) — it resolves via a fallback the instant
    // 15s elapses even if 'loggedOn' simply hasn't fired YET, which is a real
    // possibility for a cold CM reconnect immediately following an abrupt
    // process kill (a dev rebuild+relaunch, or any ungraceful quit that never
    // ran client.logOff()). That fallback resolution does NOT tear down the
    // client — its 'loggedOn'/'error' .once() listeners are still attached —
    // so the connection can genuinely succeed moments later with nothing left
    // to notice. Give the SAME still-live client one bounded grace window to
    // finish before this functional "is Steam connected" gate (unlike the
    // login flow's display-name fallback) gives up and skips the library
    // fetch entirely.
    const client = this.client
    if (!client) return false
    const graceStart = Date.now()
    const connectedLate = await new Promise<boolean>((resolve) => {
      const grace = setTimeout(() => resolve(false), 20000)
      client.once('loggedOn', () => {
        clearTimeout(grace)
        resolve(Boolean(client.steamID))
      })
      client.once('error', () => {
        clearTimeout(grace)
        resolve(false)
      })
    })
    logInfo(
      `[Timing] SteamUser.ensureConnected: grace-window wait took an additional ${Date.now() - graceStart}ms, connected=${connectedLate}`,
      LogPrefix.Steam
    )
    return connectedLate
  }

  // ── AUTH-04: Logout ────────────────────────────────────────────────────────

  /**
   * D-09 gap fix (28-03 gap cycle): the refresh token MUST go through the
   * TokenStore seam (getTokenStore().clearToken()) — never a direct
   * configStore call — so a future Tauri build's keyring-backed store is
   * cleared correctly instead of leaving a stale Keychain entry behind.
   * `configStore.clear()` was replaced with targeted deletes of the specific
   * session keys it used to wipe (isLoggedIn, userData) so the observable
   * Electron behavior is unchanged — a blanket clear() would also nuke any
   * other key ever added to this shared store (see electronStores.ts).
   * clearToken() may be an async RPC round-trip to Rust in the sidecar build,
   * so this method is async; addListener('logoutSteam', ...) in main.ts
   * awaits it inside its own async wrapper, matching this file's existing
   * fire-and-forget IPC convention (e.g. addListener('quit', async () =>
   * handleExit())) — never a floating promise.
   */
  static async logout(): Promise<void> {
    if (this.client) {
      try {
        this.client.logOff()
      } catch (err) {
        logWarning(
          ['Steam client logOff error during logout:', err],
          LogPrefix.Steam
        )
      }
      this.client = null
    }
    // Clear any in-flight connection promise so a fresh ensureConnected() after
    // re-login does not await a stale QR-connect promise (Rule 1 — logout must
    // reset all connection state).
    this.connectingPromise = null
    this.session = null
    this.qrSessionState = { status: 'waiting' }
    // Drain any pending credential session callbacks so callers don't hang
    // indefinitely if logout occurs while waiting for a guard code.
    const pendingCbs = SteamUser._credSettleCallbacks
    SteamUser._credSettleCallbacks = []
    SteamUser.credSessionState = { status: 'error' }
    for (const cb of pendingCbs) cb({ status: 'error' })
    // Token through the seam (D-09) first, then the remaining session keys
    // configStore.clear() used to wipe — see electronStores.ts's configStore
    // schema (isLoggedIn/userData are the only other keys ever written there).
    await getTokenStore().clearToken()
    configStore.delete('isLoggedIn')
    configStore.delete('userData')
    logInfo('Logging user out from Steam', LogPrefix.Steam)
  }

  // ── User details ───────────────────────────────────────────────────────────

  static async getUserDetails(): Promise<SteamUserData | undefined> {
    const userData = configStore.get_nodefault('userData')
    return userData
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  static async getCredentials(): Promise<{ refreshToken: string } | undefined> {
    // quick-260814-r2d: routed through readTokenOutcome so both `absent` and
    // `unreadable` map to undefined here — this method's signature/return
    // type and every other caller are unchanged. This keeps a single read
    // path through the seam (ensureConnected() above uses the same call)
    // rather than two divergent ones.
    const outcome = await readTokenOutcome(getTokenStore(), currentTriggerLabel())
    if (outcome.status !== 'present') return undefined
    return { refreshToken: outcome.token }
  }

  // ── Shared auth success path ───────────────────────────────────────────────

  private static async finishAuth(refreshToken: string): Promise<string> {
    // Store credentials immediately — don't block on the steam-user CM connection.
    await getTokenStore().setToken(refreshToken)
    configStore.set('isLoggedIn', true)

    // Connect steam-user to get the persona name. If this fails the user is still
    // logged in (credentials already stored above), so we fall back to a placeholder.
    const personaName = await this.connectSteamUserClient(refreshToken)
    configStore.set('userData', {
      username: personaName,
      steamId: this.client?.steamID?.getSteamID64() ?? ''
    })

    logInfo(
      `Steam auth complete — logged in as ${personaName}`,
      LogPrefix.Steam
    )
    return personaName
  }

  private static connectSteamUserClient(refreshToken: string): Promise<string> {
    if (this.client) {
      try {
        this.client.logOff()
      } catch {
        // ignore
      }
    }

    const client = new SteamUserLib({ enablePicsCache: false })
    this.client = client

    return new Promise<string>((resolve) => {
      const timeout = setTimeout(() => {
        logWarning(
          'Steam CM connection timed out after 15s, using fallback username',
          LogPrefix.Steam
        )
        resolve('Steam User')
      }, 15000)

      client.once('loggedOn', async () => {
        clearTimeout(timeout)
        try {
          // [Timing] debug/steam-install-slow-start diagnostic lead (a) —
          // ONE-TIME log of the region info steam-user exposes post-logon.
          // cellID drives which CDN edges getContentServers's directory call
          // returns (confirmed: node_modules/steam-user/components/cdn.js
          // passes {cell_id: this.cellID || 0} to GetServersForSteamPipe).
          // We never set a cellID on logOn, so this tells us what steam-user
          // resolved/persisted for us (or whether it's falling back to 0).
          // Additive-only — does not change logon/connection behavior.
          logInfo(
            `[Timing] SteamUser.loggedOn: cellID=${client.cellID} publicIP=${client.publicIP}`,
            LogPrefix.Steam
          )
          if (!client.steamID) {
            resolve('Steam User')
            return
          }

          const steamId64 = client.steamID.getSteamID64()
          let personaName = 'Steam User'

          try {
            const result = await client.getPersonas([client.steamID])
            personaName =
              result.personas[steamId64]?.player_name ?? 'Steam User'
          } catch (err) {
            logWarning(
              ['getPersonas failed, using fallback username:', err],
              LogPrefix.Steam
            )
          }

          resolve(personaName)
        } catch (err) {
          logWarning(['Steam loggedOn handler failed:', err], LogPrefix.Steam)
          resolve('Steam User')
        }
      })

      client.once('error', (err: Error) => {
        clearTimeout(timeout)
        logWarning(
          ['Steam client error, username unavailable:', err],
          LogPrefix.Steam
        )
        resolve('Steam User')
      })

      client.logOn({ refreshToken })
    })
  }

  // ── Credential session settlement helpers ──────────────────────────────────

  /**
   * Called when the credential session authenticates, errors, or times out.
   * Stores the final state and drains any _waitForCredSession() callers.
   */
  private static _settleCredSession(
    status: 'done' | 'error',
    username?: string
  ): void {
    SteamUser.credSessionState = { status, username }
    const callbacks = SteamUser._credSettleCallbacks
    SteamUser._credSettleCallbacks = []
    for (const cb of callbacks) cb({ status })
  }

  /**
   * Returns a Promise that resolves once credSessionState leaves 'waiting'.
   * If already settled, resolves immediately. Used by submitSteamGuardCode
   * so it can share the same authenticated/error/timeout listeners registered
   * in startCredentialLogin without attaching duplicate handlers.
   */
  private static _waitForCredSession(): Promise<{ status: 'done' | 'error' }> {
    const state = SteamUser.credSessionState
    if (state.status !== 'waiting') {
      return Promise.resolve({ status: state.status })
    }
    return new Promise<{ status: 'done' | 'error' }>((resolve) => {
      SteamUser._credSettleCallbacks.push(resolve)
    })
  }

  // ── AUTH-02: Credential login status poll ─────────────────────────────────

  /**
   * Returns the current credential session authentication state, mirroring
   * pollQRLogin() for the credential+guard flow. Used by the frontend to
   * detect out-of-band completion (e.g. DeviceConfirmation phone approval)
   * while the user is on the guard-code entry screen.
   */
  static async pollCredentialLogin(): Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }> {
    const state = this.credSessionState
    return { status: state.status, username: state.username }
  }

  // ── AUTH-01: QR Login ──────────────────────────────────────────────────────

  static async startQRLogin(): Promise<{
    status: 'done' | 'error'
    challengeUrl?: string
  }> {
    try {
      // Tear down previous session before replacing it
      if (this.session) {
        this.session.cancelLoginAttempt()
        this.session = null
      }

      const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
      // Give the user 2 minutes to scan and approve. The default 30 s kills the
      // session before the phone's approval round-trip completes.
      session.loginTimeout = 120000
      this.session = session
      this.qrSessionState = { status: 'waiting' }

      const response = await session.startWithQR()

      session.once('authenticated', async () => {
        try {
          await getTokenStore().setToken(session.refreshToken)
          configStore.set('isLoggedIn', true)

          // Mark done synchronously so pollQRLogin() returns 'done' as soon as
          // the user approves on their phone — don't block the UI on the CM
          // connection. The persona name (and client.steamID) are populated in
          // the background below and surface on a later poll.
          this.qrSessionState = { status: 'done' }

          // Assign the background connect to connectingPromise so a concurrent
          // ensureConnected() (triggered by post-login refreshLibrary) sees the
          // in-flight promise and awaits it instead of starting a second
          // connectSteamUserClient — which would logOff this client and resolve
          // the first with the 'Steam User' fallback, overwriting the real name.
          // .finally() mirrors the ensureConnected dedupe pattern (clears on settle).
          const connectPromise = this.connectSteamUserClient(
            session.refreshToken
          )
          this.connectingPromise = connectPromise.finally(() => {
            this.connectingPromise = null
          })
          connectPromise
            .then((personaName) => {
              configStore.set('userData', {
                username: personaName,
                steamId: this.client?.steamID?.getSteamID64() ?? ''
              })
              this.qrSessionState = { status: 'done', username: personaName }
            })
            .catch((err) => {
              logWarning(
                ['Steam QR background CM connect failed:', err],
                LogPrefix.Steam
              )
            })
        } catch (err) {
          logError(['Steam QR auth finalization failed:', err], LogPrefix.Steam)
          this.qrSessionState = { status: 'error' }
        }
      })

      session.once('timeout', () => {
        logWarning('Steam QR session timed out', LogPrefix.Steam)
        this.qrSessionState = { status: 'error' }
      })

      session.once('error', (err: Error) => {
        logError(['Steam QR session error:', err], LogPrefix.Steam)
        this.qrSessionState = { status: 'error' }
      })

      return { status: 'done', challengeUrl: response.qrChallengeUrl }
    } catch (err) {
      logError(['Steam startQRLogin failed:', err], LogPrefix.Steam)
      return { status: 'error' }
    }
  }

  // ── AUTH-01: QR Poll ───────────────────────────────────────────────────────

  static async pollQRLogin(): Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }> {
    const state = this.qrSessionState
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

  static async startCredentialLogin(
    username: string,
    password: string
  ): Promise<{ status: 'done' | 'guard_required' | 'error' }> {
    try {
      // Drain any pending callbacks from a previous guard_required attempt
      // (e.g. user pressed "Back to Credentials" and is starting a new login).
      const staleCallbacks = SteamUser._credSettleCallbacks
      SteamUser._credSettleCallbacks = []
      SteamUser.credSessionState = { status: 'waiting' }
      for (const cb of staleCallbacks) cb({ status: 'error' })

      // Tear down previous session before replacing it
      if (this.session) {
        this.session.cancelLoginAttempt()
        this.session = null
      }

      const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
      // Set loginTimeout before startWithCredentials (steam-session throws if
      // changed after polling starts, LoginSession.js:107). 180 s gives ample
      // time for email retrieval. Mirrors the QR path's 120 s setting.
      session.loginTimeout = 180000
      this.session = session

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
            const personaName = await SteamUser.finishAuth(session.refreshToken)
            SteamUser._settleCredSession('done', personaName)
          } catch (err) {
            logError(
              ['Steam credential auth finalization failed:', err],
              LogPrefix.Steam
            )
            SteamUser._settleCredSession('error')
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
          SteamUser._settleCredSession('error')
        })

        session.once('timeout', () => {
          logWarning('Steam credential session timed out', LogPrefix.Steam)
          SteamUser._settleCredSession('error')
        })

        logInfo('Steam Guard required for credential login', LogPrefix.Steam)
        return { status: 'guard_required' }
      }

      // No guard required — wait for authenticated event (polling started internally)
      return new Promise<{ status: 'done' | 'error' }>((resolve) => {
        session.once('authenticated', async () => {
          try {
            await this.finishAuth(session.refreshToken)
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

  static async submitSteamGuardCode(
    code: string
  ): Promise<{ status: 'done' | 'error' }> {
    if (!this.session) {
      logWarning(
        'submitSteamGuardCode called but no active session',
        LogPrefix.Steam
      )
      return { status: 'error' }
    }

    const session = this.session

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
      return await SteamUser._waitForCredSession()
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

  // ── REQ-26-02/04/05/06: Redeem a single Steam key ──────────────────────────

  /**
   * Redeems a single Steam key on the live authenticated CM session. Mirrors
   * submitSteamGuardCode's shape: guard clause first, plain JSON result,
   * never throws across the IPC boundary.
   *
   * `client.redeemKey()`'s TypeScript signature is misleading — it resolves
   * ONLY on EPurchaseResult.OK; every other outcome (already-owned, invalid,
   * rate-limited) REJECTS with an Error carrying `purchaseResultDetails` and
   * `packageList` as extra properties (verified against
   * node_modules/steam-user/components/apps.js:887, not the .d.ts).
   *
   * `store` is REQ-26-06's hidden, store-aware-ready parameter (D-05) —
   * callers default it to 'steam'; only 'steam' is wired today.
   */
  static async redeemKey(
    store: 'steam',
    key: string
  ): Promise<RedeemKeyResult> {
    const connected = await this.ensureConnected()
    const client = this.getClient()
    if (!connected || !client) {
      logWarning(
        'Steam redeemKey: not connected — skipping redeemKey call',
        LogPrefix.Steam
      )
      return { store, outcome: 'error', message: 'not-connected' }
    }

    try {
      const { purchaseResultDetails, packageList } = await client.redeemKey(key)
      // purchaseResultDetails here should already be EPurchaseResult.OK (0) —
      // the promise would have rejected otherwise — but classify defensively
      // anyway rather than assuming.
      return this.classifyPurchaseResult(
        store,
        purchaseResultDetails,
        packageList
      )
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e = err as any
      // WR-01: Only a rejection carrying a NUMERIC EPurchaseResult is a genuine
      // Steam purchase verdict. A transport/timeout/unexpected failure (e.g. the
      // 90s internal timeout in steam-user's redeemKey, or a mid-call CM
      // disconnect) carries no purchaseResultDetails — classifying THAT as
      // Unknown -> 'invalid' wrongly tells the user a valid key "doesn't look
      // right". Map it to the generic 'error' outcome (connectivity copy).
      if (typeof e?.purchaseResultDetails !== 'number') {
        // WR-02: status-only diagnostic so genuine unexpected failures are
        // traceable. NEVER log the raw key (T-26-01) — only store/outcome and
        // the error shape (message/name), which never contain the key.
        logWarning(
          [
            `Steam redeemKey failed without a purchase result: store=${store} outcome=error name=${
              e?.name ?? 'unknown'
            } message=${e?.message ?? 'none'}`
          ],
          LogPrefix.Steam
        )
        return { store, outcome: 'error', message: 'redeem-failed' }
      }
      // WR-02: log the rejected purchase-result status before classifying.
      // classifyPurchaseResult's own log cannot distinguish a resolved vs a
      // rejected redeemKey; this line records that the promise rejected.
      logWarning(
        [
          `Steam redeemKey rejected with purchase result: store=${store} purchaseResultDetails=${e.purchaseResultDetails}`
        ],
        LogPrefix.Steam
      )
      return this.classifyPurchaseResult(
        store,
        e.purchaseResultDetails,
        e.packageList ?? {}
      )
    }
  }

  /**
   * Classifies a raw EPurchaseResult value into exactly one of the 4 SPEC
   * REQ5 outcome buckets. References the namespaced `SteamUserLib.EPurchaseResult`
   * enum (8 values) — NEVER the differently-numbered 84-value
   * `EPurchaseResultDetail` enum, which collides on the value 53 but means
   * something different there.
   *
   * Logging is status-only (store/outcome/purchaseResultDetails) — mirrors
   * humble/library.ts's doRevealKey discipline. The raw key value is never
   * passed to this method and must never be logged anywhere in this path.
   */
  private static classifyPurchaseResult(
    store: 'steam',
    details: SteamUserLib.EPurchaseResult,
    packageList: Record<string, string>
  ): RedeemKeyResult {
    let outcome: RedeemKeyOutcome

    switch (details) {
      case SteamUserLib.EPurchaseResult.OK:
        outcome = 'success'
        break
      case SteamUserLib.EPurchaseResult.AlreadyOwned:
        outcome = 'already-owned'
        break
      case SteamUserLib.EPurchaseResult.OnCooldown:
        outcome = 'rate-limited'
        break
      case SteamUserLib.EPurchaseResult.InvalidKey:
      case SteamUserLib.EPurchaseResult.DuplicatedKey:
      case SteamUserLib.EPurchaseResult.RegionLockedKey:
      case SteamUserLib.EPurchaseResult.BaseGameRequired:
      case SteamUserLib.EPurchaseResult.Unknown:
      default:
        outcome = 'invalid'
        break
    }

    logInfo(
      `Steam redeemKey: store=${store} outcome=${outcome} purchaseResultDetails=${details}`,
      LogPrefix.Steam
    )

    return { store, outcome, packageList }
  }
}
