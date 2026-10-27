import { existsSync } from 'graceful-fs'
import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { configStore } from './electronStores'
import { STEAM_INSTALL_PATHS } from './constants'
import { getTokenStore, readTokenOutcome } from './tokenStore'
import { currentTriggerLabel, noteSteamAuthTrigger } from './authTrigger'
import {
  noteSignInSucceeded,
  noteSignedOut,
  publishSignInProbeOutcomes,
  recordSignInProbeOutcome
} from 'backend/signInProbe/outcomes'
import { captureSignInEpoch } from 'backend/signInProbe/sessionEpoch'
import { applySignInVerdict } from 'backend/signInProbe/verdict'
import { withTimeout } from './withTimeout'
import { sendFrontendMessage } from '../../ipc'
import {
  closeAnonymousClient,
  releaseAnonymousForShutdown
} from './anonymousClient'
import {
  withMacSteamOffline,
  GuidedOfflineRequiredError,
  restoreMacSteamOnlineIfOwed,
  type MacSteamRestoreOutcome,
  type MacSteamWrapKind
} from './macSteamOffline'
import { platform } from 'process'
import type {
  RedeemKeyOutcome,
  RedeemKeyResult,
  SteamGoOfflineAction,
  SteamUserData
} from 'common/types/steam'
import { LoginSession, EAuthTokenPlatformType } from 'steam-session'
import SteamUserLib from 'steam-user'
import type { SignInProbeOutcome } from 'common/signInState'

// ── D-02 (Phase 33-02) / Phase 54: ensureConnected canary + wrapped re-entry ─
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
// Phase 54 (spike 046, debug verdict 2026-10-27): a second authenticated CM
// session on the same account signs Mac Steam's Friends out. So this class
// owns EVERY authenticated logon: autoRelogin is off, client.relog() is never
// called, a post-logon drop ENDS the session, and a stale canary re-enters the
// same wrapped cold connect (withMacSteamOffline) a first connect uses.
const CANARY_APP_ID = 753
const CANARY_TIMEOUT_MS = 5000

// How long the last released lease keeps the session open (RESEARCH Pattern 2:
// prescreen -> install -> shim resolve -> shared redist must not thrash).
const AUTH_SESSION_IDLE_GRACE_MS = 60000
// The authenticated connect waits this long for loggedOn/error, then logOff()s
// the attempt. The wrap cannot fire goonline while a logon is in flight, so
// this replaces the old 15 s fallback + separate 20 s grace window.
const AUTH_LOGON_BOUND_MS = 35000
// Persona name lookup at sign-in only; bounded so Mac Steam is not held offline.
const SIGN_IN_PERSONA_TIMEOUT_MS = 5000

export type AuthSessionReason =
  | 'user-refresh'
  | 'login'
  | 'user-install'
  | 'prescreen'
  | 'redeem'
  | 'shared-redist'
  | 'plan-retry'
  | 'original-restore'

export type AuthSessionRefusal =
  | 'shutting-down'
  | 'not-signed-in'
  | 'token-unreadable'
  | 'token-absent'
  | 'logon-rejected'
  | 'client-not-ready'
  | 'go-offline-required'

interface AcquireAuthenticatedOpts {
  reason: AuthSessionReason
  guidedAction?: SteamGoOfflineAction
  appName?: string
}

type SteamUserClient = InstanceType<typeof SteamUserLib>

type AuthenticatedLease =
  | { ok: true; client: SteamUserClient; release: () => void }
  | { ok: false; reason: AuthSessionRefusal }

interface OpenAuthenticatedLease {
  client: SteamUserClient
  release: () => void
}

// QR_LOGIN_TIMEOUT_MS is the single source of truth for the QR session's
// loginTimeout. The challenge-issued log line below interpolates this same
// constant (never a second hand-typed 120000) so the logged value cannot
// drift from the value actually set on the session.
const QR_LOGIN_TIMEOUT_MS = 120000

// quick 261011-rj0: the EResults with which the CM refuses the CREDENTIAL
// itself, as opposed to refusing this connection (LogonSessionReplaced,
// RateLimitExceeded, ServiceUnavailable, ...). Only these mean "the stored
// refresh token is no longer good" and so only these may latch
// `credentialsMissing` -- the Library then shows the sign-in row with Sign in,
// which is the one action that fixes it. Values from
// node_modules/steam-user/enums/EResult.js; literal numbers rather than
// `SteamUserLib.EResult` so the test double (which carries no enum) and the
// runtime cannot disagree.
const CREDENTIAL_REFUSAL_ERESULTS: ReadonlySet<number> = new Set([
  5, // InvalidPassword
  15, // AccessDenied -- the live case (gamelib.log 2026-10-10/11)
  26, // Revoked
  27, // Expired
  63 // AccountLogonDenied
])
const CREDENTIAL_REFUSAL_NAMES: ReadonlySet<string> = new Set([
  'InvalidPassword',
  'AccessDenied',
  'Revoked',
  'Expired',
  'AccountLogonDenied'
])

// ── SteamUser static class ────────────────────────────────────────────────────

export class SteamUser {
  private static client: InstanceType<typeof SteamUserLib> | null = null
  private static session: InstanceType<typeof LoginSession> | null = null
  // Single-flight for the wrapped cold connect; resolves null when connected,
  // otherwise the refusal every joiner reports.
  private static connectingPromise: Promise<AuthSessionRefusal | null> | null =
    null
  // Live leases (acquireAuthenticated / acquireOpenAuthenticated). The last
  // release arms idleTimer; a bare ensureConnected() takes no lease.
  private static leaseCount = 0
  private static idleTimer: ReturnType<typeof setTimeout> | null = null
  // True once releaseForShutdown() has run (stdin EOF: the shell is gone). A reconnect path
  // (ensureConnected's relog, a late login) must not open a NEW CM socket after that, or the
  // sidecar would hold the loop again.
  private static shuttingDown = false
  // steam-sync-false-failed-banner: the terminal 'error' the CM ended the most
  // recent logon attempt with (e.g. AccessDenied for a refresh token Steam no
  // longer accepts). Tagged with the client it belongs to so an error from a
  // REPLACED client (the old one's LogonSessionReplaced arriving while a newer
  // client is still logging on, seen in the 34.9 live gate) can never be
  // mistaken for the current attempt's verdict. Reset at the start of every
  // connectSteamUserClient(). Read through getLogonFailure(), which hands out
  // only message + eresult -- never the client, never the token.
  private static logonFailure: {
    client: InstanceType<typeof SteamUserLib>
    message: string
    eresult?: number
  } | null = null
  private static qrSessionState: {
    status: 'waiting' | 'done' | 'error'
    username?: string
  } = { status: 'waiting' }
  // Tracks the last status pollQRLogin() actually LOGGED (not just observed),
  // so the poll loop below can emit a line only on a CHANGE of status. The
  // frontend polls on a timer (steamAuthFlowRegistration.ts:154), so a line
  // per poll would flood gamelib.log and would itself be a defect (D-02).
  // `null` means "nothing logged yet for this attempt" — reset alongside
  // qrSessionState at both of its reset sites (startQRLogin, logout) so the
  // two fields can never drift into an incoherent pair.
  private static qrLastLoggedStatus: 'waiting' | 'done' | 'error' | null = null

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

  /**
   * Phase 49 (49-06, D-14 / D-21): the Steam boot sign-in probe. Reads the
   * keyring slot ONCE under the deliberate `'boot-probe'` trigger and maps the
   * outcome to a probe verdict. It returns an outcome only: applying it is
   * 49-08's pass (`applySignInVerdict`), so this method writes no store.
   *
   * It never opens a CM connection (D-21): presence of the refresh token is the
   * whole question, and a connection would cost a network round trip and could
   * log the account on at boot. A signed-out account returns `unknown` before
   * the trigger is noted, so it never unlocks the keyring gate.
   *
   * `unreadable` (timeout, Keychain denial) is NOT evidence of absence and is
   * `unknown`; only a successful read that finds the slot empty is `expired`
   * (P1, 260822-vov). Noting `'boot-probe'` reverses quick task 260817-d61 for a
   * signed-in account, as recorded in `authTrigger.ts`.
   */
  static async probeCredentialPresence(): Promise<SignInProbeOutcome> {
    if (!this.isLoggedIn()) return 'unknown'
    try {
      noteSteamAuthTrigger('boot-probe')
      const outcome = await readTokenOutcome(getTokenStore(), 'boot-probe')
      if (outcome.status === 'present') return 'healthy'
      if (outcome.status === 'absent') return 'expired'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  // ── LIB-01: Authenticated client accessor ─────────────────────────────────

  static getClient(): InstanceType<typeof SteamUserLib> | null {
    return this.client
  }

  // ── LIB-01: Reconnect on startup ───────────────────────────────────────────

  /**
   * The terminal CM error the CURRENT client's most recent logon attempt ended
   * with, or null when there is none (never attempted, still in flight, or the
   * attempt succeeded). Lets a caller whose ensureConnected() returned false
   * tell "Steam refused this logon" (AccessDenied: steam-user schedules no
   * retry, so waiting or retrying the same token replays the refusal) from
   * "not connected yet". Carries message + eresult only: no client handle, no
   * token. See the `logonFailure` field doc.
   */
  static getLogonFailure(): { message: string; eresult?: number } | null {
    const failure = this.logonFailure
    if (!failure || failure.client !== this.client) return null
    return { message: failure.message, eresult: failure.eresult }
  }

  /** True when the CM refused the stored credential itself, not the connection. */
  private static isCredentialRefusal(rejection: {
    message: string
    eresult?: number
  }): boolean {
    if (typeof rejection.eresult === 'number') {
      return CREDENTIAL_REFUSAL_ERESULTS.has(rejection.eresult)
    }
    return CREDENTIAL_REFUSAL_NAMES.has(rejection.message)
  }

  /**
   * quick 261011-rj0: report what the CM itself said about the stored
   * credential, through the SAME fenced, write-if-changed latch the Phase 49
   * boot probe uses (`applySignInVerdict`), so the Library sign-in row and the
   * Manage Accounts tile learn about it the way they learn everything else.
   *
   * This is deliberately NOT a change to D-21. The boot probe still reads the
   * keyring only and never opens the CM; this runs inside a deliberate
   * `ensureConnected()` caller (a library refresh, an install) that has already
   * paid for the connection. It is the first verdict site fed by a CM response
   * rather than a keyring read, which is why it goes through `applySignInVerdict`
   * and nothing else: the epoch fence (T-49-10) refuses a verdict from an
   * attempt that began before a sign-in completed, and write-if-changed keeps
   * a repeated refusal from re-notifying the renderer.
   *
   * Records and publishes the outcome only when the flag actually moved. A
   * cold connect happens once per launch; re-publishing an unchanged map on
   * every one would be noise, and `resolveSignInState` already lets a latched
   * flag outrank whatever outcome the boot probe recorded.
   */
  private static reportLogonVerdict(
    outcome: 'healthy' | 'expired',
    epochAtStart: number
  ): void {
    const result = applySignInVerdict('steam', outcome, epochAtStart)
    if (result !== 'latched' && result !== 'cleared') return
    recordSignInProbeOutcome('steam', outcome)
    publishSignInProbeOutcomes()
  }

  /**
   * Ensure a live, authenticated steam-user client exists. Returns true only
   * when the CM connection is established (client.steamID populated).
   * Concurrent callers share a single in-flight connection attempt.
   *
   * Takes NO lease, so it never arms the idle timer: a long install run by a
   * caller that has not moved to acquireAuthenticated() is never logged off
   * mid-download.
   *
   * user.ts-internal session check, kept public only because tests drive it
   * directly. Every production caller must use acquireAuthenticated /
   * acquireOpenAuthenticated; steamAuthSessionPolicy.test.ts enforces this.
   */
  static async ensureConnected(): Promise<boolean> {
    const refusal = await this.ensureAuthenticatedSession('user-refresh')
    // An earlier lease cycle may have armed the idle timer; this un-leased
    // caller is now relying on the session, so it must not be logged off
    // under it.
    if (refusal === null && this.leaseCount === 0) this.clearIdleTimer()
    return refusal === null
  }

  /**
   * Lease the authenticated session, opening it (through the go-offline wrap)
   * when it is not already open. Concurrent acquires share one logon. The last
   * release closes the session after AUTH_SESSION_IDLE_GRACE_MS.
   */
  static acquireAuthenticated(
    opts: AcquireAuthenticatedOpts
  ): Promise<AuthenticatedLease> {
    return this.acquireInternal(opts)
  }

  private static acquireAuthenticatedWithToken(
    opts: AcquireAuthenticatedOpts,
    token: string
  ): Promise<AuthenticatedLease> {
    return this.acquireInternal(opts, token)
  }

  private static async acquireInternal(
    opts: AcquireAuthenticatedOpts,
    token?: string
  ): Promise<AuthenticatedLease> {
    if (this.shuttingDown) return { ok: false, reason: 'shutting-down' }
    this.leaseCount++
    this.clearIdleTimer()
    let refusal: AuthSessionRefusal | null
    try {
      refusal = await this.ensureAuthenticatedSession(opts.reason, token)
    } catch (err) {
      this.leaseCount--
      this.armIdleTimer()
      throw err
    }
    const client = this.client
    if (refusal === null && !client?.steamID) refusal = 'client-not-ready'
    if (refusal !== null || !client) {
      this.leaseCount--
      this.armIdleTimer()
      const reason = refusal ?? 'client-not-ready'
      if (reason === 'go-offline-required' && opts.guidedAction) {
        sendFrontendMessage('steamGoOfflineRequired', {
          action: opts.guidedAction,
          appName: opts.appName
        })
      }
      return { ok: false, reason }
    }
    return { ok: true, client, release: this.makeRelease() }
  }

  /**
   * A lease on a session that is ALREADY open, or null. Never reads the
   * keyring and never logs on: launch-path consumers use it so they can reuse
   * an install's session but can never open one.
   */
  static acquireOpenAuthenticated(
    reason: AuthSessionReason
  ): OpenAuthenticatedLease | null {
    const client = this.client
    if (this.shuttingDown || !client?.steamID) return null
    this.leaseCount++
    this.clearIdleTimer()
    logInfo(
      `[Steam] CM session reused mode=authenticated reason=${reason}`,
      LogPrefix.Steam
    )
    return { client, release: this.makeRelease() }
  }

  /** configStore userData.steamId when it is a numeric SteamID64 string. */
  static getPersistedSteamId64(): string | undefined {
    const steamId = configStore.get_nodefault('userData')?.steamId
    return typeof steamId === 'string' && /^\d+$/.test(steamId)
      ? steamId
      : undefined
  }

  private static makeRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.leaseCount = Math.max(0, this.leaseCount - 1)
      this.armIdleTimer()
    }
  }

  private static armIdleTimer(): void {
    if (this.leaseCount > 0 || !this.client) return
    this.clearIdleTimer()
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      if (this.leaseCount === 0) this.endSession('idle')
    }, AUTH_SESSION_IDLE_GRACE_MS)
    this.idleTimer.unref?.()
  }

  /**
   * The one body that may open an authenticated CM logon. null = connected.
   * `tokenOverride` is the sign-in path: the token is already in memory, so
   * the keyring is not read again.
   */
  private static async ensureAuthenticatedSession(
    reason: AuthSessionReason,
    tokenOverride?: string
  ): Promise<AuthSessionRefusal | null> {
    if (this.shuttingDown) return 'shutting-down'
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
        // A live, canary-verified CM connection disproves any latched
        // credentialsMissing verdict — clear it so the tile recovers without
        // waiting for the next login.
        configStore.delete('credentialsMissing')
        return null
      } catch (canaryErr) {
        logWarning(
          [
            'Steam: ensureConnected canary failed — socket may be stale, re-entering the wrapped cold connect:',
            canaryErr
          ],
          LogPrefix.Steam
        )
        // Phase 54: never client.relog(). A relog is an authenticated logon
        // outside the go-offline wrap (spike 046c), so the stale session is
        // ended and the cold path below opens the replacement.
        if (this.client === client) this.endSession('stale-canary')
      }
    }
    // The sign-in path has just persisted the session itself and passes the
    // token in memory, so it does not depend on the stored flag.
    if (tokenOverride === undefined && !this.isLoggedIn()) {
      return 'not-signed-in'
    }

    let token = tokenOverride
    // A connect already in flight is joined below without a second keyring
    // read: the read can raise a real Keychain prompt and its token is unused.
    if (token === undefined && !this.connectingPromise) {
      // quick-260814-r2d: branch on the three-state outcome instead of the
      // lossy getCredentials() collapse, so a keyring read that FAILED
      // (timeout, or a Keychain Deny) is never reported the same way as a
      // slot that was genuinely never written to. Scope note: this surfaces
      // the retryable condition in the backend log and in the return value
      // only — no new IPC channel and no frontend banner is added here.
      const outcome = await readTokenOutcome(
        getTokenStore(),
        currentTriggerLabel()
      )
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
        return 'token-unreadable'
      }
      if (outcome.status === 'absent') {
        logWarning(
          'Steam: logged in but no stored refresh token — cannot reconnect',
          LogPrefix.Steam
        )
        // A successful read that came back EMPTY is proof the credential is
        // gone, not a transient failure — deliberately NOT set in the
        // `unreadable` branch above, whose whole point is that a denied/
        // timed-out read must never be reported as signed-out. Latching it
        // here costs no extra keyring traffic: this branch only runs on reads
        // a deliberate user action already triggered.
        configStore.set('credentialsMissing', true)
        return 'token-absent'
      }
      token = outcome.token
    }

    // quick 261011-rj0: captured BEFORE the connect attempt, exactly as the
    // probe pass does (pass.ts). A sign-in that completes while this logon is
    // in flight bumps the epoch, and whatever the CM then says about the OLD
    // token is refused by `applySignInVerdict` as stale (T-49-10).
    const epochAtStart = captureSignInEpoch('steam')
    const start = Date.now()
    if (!this.connectingPromise && token !== undefined) {
      if (this.client?.steamID) {
        // Another caller finished connecting while the keyring was being read;
        // logging on again would log that fresh session off.
        this.reportLogonVerdict('healthy', epochAtStart)
        return null
      }
      this.connectingPromise = this.wrappedConnect(token, reason).finally(
        () => {
          this.connectingPromise = null
        }
      )
    }
    if (!this.connectingPromise) return 'client-not-ready'
    const refusal = await this.connectingPromise
    // [Timing] debug/steam-install-slow-start: cold-connect / CM-login path.
    logInfo(
      `[Timing] SteamUser.ensureConnected: cold-connect path took ${Date.now() - start}ms`,
      LogPrefix.Steam
    )

    if (refusal === null) {
      // The CM accepted the stored credential: that disproves any latched
      // `credentialsMissing`, whether the `absent` branch above or a previous
      // refusal set it. Fenced and write-if-changed, so a clean flag costs
      // nothing here.
      this.reportLogonVerdict('healthy', epochAtStart)
      return null
    }

    if (refusal === 'logon-rejected') {
      // steam-sync-false-failed-banner: the CM already ended this attempt with
      // a terminal 'error' (AccessDenied for a refresh token Steam no longer
      // accepts, InvalidPassword, ...). steam-user schedules no retry after
      // such an error (09-logon.js _handleLogOnResponse default arm), so there
      // is nothing to wait for.
      const rejection = this.getLogonFailure()
      if (rejection) {
        logWarning(
          `Steam: the CM rejected the stored-credential logon (${rejection.message}) — ` +
            'steam-user schedules no retry after this, so not waiting out a reconnect',
          LogPrefix.Steam
        )
        // quick 261011-rj0: a refusal of the CREDENTIAL (AccessDenied for a
        // revoked/expired refresh token) is a sign-in problem, and belongs on
        // the sign-in surface with the Sign in action -- not behind the
        // generic "Couldn't sync / Retry" banner, whose Retry would replay
        // this exact refusal. A terminal error that is NOT about the
        // credential (LogonSessionReplaced, a rate limit) latches nothing.
        if (this.isCredentialRefusal(rejection)) {
          this.reportLogonVerdict('expired', epochAtStart)
        }
      }
    }
    return refusal
  }

  /**
   * The cold connect, inside the Mac Steam go-offline wrap. A refusal from the
   * wrap (Mac Steam did not log off) means NO logOn call at all.
   */
  private static async wrappedConnect(
    token: string,
    reason: AuthSessionReason
  ): Promise<AuthSessionRefusal | null> {
    try {
      await withMacSteamOffline((wrap) =>
        this.connectSteamUserClient(token, { reason, wrap })
      )
    } catch (err) {
      if (err instanceof GuidedOfflineRequiredError) {
        logWarning(
          `[Steam] CM logon skipped: Mac Steam did not go offline (${err.cause}), no authenticated logon issued`,
          LogPrefix.Steam
        )
        return 'go-offline-required'
      }
      throw err
    }
    if (this.client?.steamID) return null
    if (this.getLogonFailure()) return 'logon-rejected'
    return 'client-not-ready'
  }

  /** Close the current authenticated session (idle, stale canary, CM drop). */
  private static endSession(cause: string): void {
    this.clearIdleTimer()
    const client = this.client
    if (!client) return
    this.client = null
    try {
      client.logOff()
    } catch {
      // the socket is already gone
    }
    logInfo(
      `[Steam] CM session closed mode=authenticated cause=${cause}`,
      LogPrefix.Steam
    )
  }

  private static clearIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
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
    this.clearIdleTimer()
    this.leaseCount = 0
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
    this.logonFailure = null
    closeAnonymousClient('logout')
    this.session = null
    this.qrSessionState = { status: 'waiting' }
    this.qrLastLoggedStatus = null
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
    // A signed-out session has no credential to be missing — leaving a stale
    // `true` here would mislabel the next login's tile before any read runs.
    configStore.delete('credentialsMissing')
    // Phase 49: fence any boot probe that began before this sign-out.
    noteSignedOut('steam')
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
    const outcome = await readTokenOutcome(
      getTokenStore(),
      currentTriggerLabel()
    )
    if (outcome.status !== 'present') return undefined
    return { refreshToken: outcome.token }
  }

  // ── Shared auth success path ───────────────────────────────────────────────

  private static async finishAuth(
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
    const personaName = await this.resolveSignInProfile(session)

    logInfo(
      `Steam auth complete — logged in as ${personaName}`,
      LogPrefix.Steam
    )
    return personaName
  }

  /**
   * Sign-in profile: logs on through the SAME wrapped entry point as every
   * other authenticated connect (the token is passed in memory, so the keyring
   * is not read again), reads the persona name bounded at 5 s, writes
   * userData, and returns the display name. The steamId comes from the
   * steam-session LoginSession, which needs no CM.
   */
  private static async resolveSignInProfile(
    session: InstanceType<typeof LoginSession>
  ): Promise<string> {
    let personaName = session.accountName || 'Steam User'
    let steamId = ''
    try {
      steamId = session.steamID?.getSteamID64() ?? ''
    } catch {
      // steamID is derived from the token; absence is not fatal here
    }
    const lease = await this.acquireAuthenticatedWithToken(
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

  private static async completeQrProfile(
    session: InstanceType<typeof LoginSession>
  ): Promise<void> {
    try {
      const username = await this.resolveSignInProfile(session)
      this.qrSessionState = { status: 'done', username }
    } catch (err) {
      logWarning(
        ['Steam QR background CM connect failed:', err],
        LogPrefix.Steam
      )
    }
  }

  /**
   * Sidecar exit contract, half 1 for a handle we cannot unref(): a logged-on steam-user client
   * owns the CM TCP socket and its heartbeat timer inside the library, and both are referenced.
   * Measured (debug/sidecar-survives-force-quit): an anonymous-logged-on client keeps a bare
   * node process alive indefinitely; `logOff()` lets it drain in ~100ms. Called on stdin EOF.
   * Unlike logout() this clears no token and no stored session -- the user stays signed in.
   * The release also pays any goonline the go-offline wrap owes, after logOff, so no GameLib
   * logon can land once Mac Steam reconnects.
   */
  static releaseForShutdown(): Promise<MacSteamRestoreOutcome> {
    this.shuttingDown = true
    this.clearIdleTimer()
    releaseAnonymousForShutdown()
    const client = this.client
    if (client) {
      try {
        client.logOff()
      } catch (err) {
        logWarning(
          ['Steam client logOff error during shutdown release:', err],
          LogPrefix.Steam
        )
      }
    }
    return restoreMacSteamOnlineIfOwed('shutdown')
  }

  private static connectSteamUserClient(
    refreshToken: string,
    opts: { reason: AuthSessionReason; wrap: MacSteamWrapKind }
  ): Promise<void> {
    if (this.shuttingDown) return Promise.resolve()
    if (this.client) {
      try {
        this.client.logOff()
      } catch {
        // ignore
      }
    }

    // autoRelogin false (spike 046c): this class owns every logon, so a CM
    // drop is a fatal 'error' for the session instead of a silent re-logon
    // that would sign Mac Steam's Friends out again.
    const client = new SteamUserLib({
      enablePicsCache: false,
      autoRelogin: false
    })
    this.client = client
    // A new attempt starts with a clean slate: a verdict from a previous
    // attempt must never be reported against this one.
    this.logonFailure = null

    const describeDrop = (cause: string, detail: unknown): string => {
      const eresult =
        detail instanceof Error
          ? (detail as Error & { eresult?: number }).eresult
          : undefined
      const message =
        detail instanceof Error ? detail.message : String(detail ?? 'unknown')
      return `Steam CM session dropped (${cause}): ${message}${
        typeof eresult === 'number' ? ` eresult=${eresult}` : ''
      }`
    }

    return new Promise<void>((resolve) => {
      let settled = false
      const bound = setTimeout(() => {
        if (settled) return
        logWarning(
          `Steam CM logon did not complete within ${AUTH_LOGON_BOUND_MS}ms, abandoning the attempt`,
          LogPrefix.Steam
        )
        // Abandon BEFORE the wrap fires goonline, so no logon can land while
        // Mac Steam is back online.
        try {
          client.logOff()
        } catch {
          // ignore
        }
        if (this.client === client) this.client = null
        settle()
      }, AUTH_LOGON_BOUND_MS)
      bound.unref?.()

      function settle(): void {
        if (settled) return
        settled = true
        clearTimeout(bound)
        resolve()
      }

      client.once('loggedOn', () => {
        // [Timing] debug/steam-install-slow-start diagnostic: region info
        // steam-user exposes post-logon (cellID drives which CDN edges the
        // content-server directory returns). Additive-only.
        logInfo(
          `[Timing] SteamUser.loggedOn: cellID=${client.cellID} publicIP=${client.publicIP}`,
          LogPrefix.Steam
        )
        client.on('disconnected', (...args: unknown[]) => {
          if (this.client !== client) return
          logWarning(describeDrop('disconnected', args[1]), LogPrefix.Steam)
          this.endSession('disconnected')
        })
        settle()
      })

      // 'error' is subscribed for the client's whole life: an unhandled
      // EventEmitter 'error' would crash the sidecar, and with autoRelogin off
      // every CM drop arrives as one.
      client.on('error', (err: Error) => {
        if (!settled) {
          logWarning(
            ['Steam client error, logon did not complete:', err],
            LogPrefix.Steam
          )
          // Only the CURRENT client's error is this attempt's verdict -- see
          // the logonFailure field doc for the replaced-client case.
          if (this.client === client) {
            this.logonFailure = {
              client,
              message: err.message,
              eresult: (err as Error & { eresult?: number }).eresult
            }
          }
          settle()
          return
        }
        if (this.client !== client) return
        logWarning(describeDrop('error', err), LogPrefix.Steam)
        this.endSession('error')
      })

      logInfo(
        `[Steam] CM logon mode=authenticated reason=${opts.reason} wrap=${opts.wrap}`,
        LogPrefix.Steam
      )
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
      logInfo('Steam QR login: attempt starting', LogPrefix.Steam)

      // Tear down previous session before replacing it
      if (this.session) {
        logInfo(
          'Steam QR login: cancelling a previous login session before starting a new one',
          LogPrefix.Steam
        )
        this.session.cancelLoginAttempt()
        this.session = null
      }

      const session = new LoginSession(EAuthTokenPlatformType.SteamClient)
      // Give the user 2 minutes to scan and approve. The default 30 s kills the
      // session before the phone's approval round-trip completes.
      session.loginTimeout = QR_LOGIN_TIMEOUT_MS
      this.session = session
      this.qrSessionState = { status: 'waiting' }
      this.qrLastLoggedStatus = null

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
          this.qrSessionState = { status: 'done' }

          // The background connect shares the single-flight connectingPromise
          // (set synchronously below: the token is passed in memory), so a
          // concurrent ensureConnected() from the post-login refresh awaits it
          // instead of opening a second logon.
          void this.completeQrProfile(session)
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

  static async pollQRLogin(): Promise<{
    status: 'done' | 'waiting' | 'error'
    username?: string
  }> {
    const state = this.qrSessionState
    if (state.status !== this.qrLastLoggedStatus) {
      logInfo(
        `Steam QR poll: status ${this.qrLastLoggedStatus ?? 'none'} -> ${state.status}`,
        LogPrefix.Steam
      )
      this.qrLastLoggedStatus = state.status
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
            const personaName = await SteamUser.finishAuth(session)
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
            await this.finishAuth(session)
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
    const lease = await this.acquireAuthenticated({
      reason: 'redeem',
      guidedAction: 'redeem'
    })
    if (!lease.ok) {
      logWarning(
        'Steam redeemKey: not connected — skipping redeemKey call',
        LogPrefix.Steam
      )
      return {
        store,
        outcome: 'error',
        message:
          lease.reason === 'go-offline-required'
            ? 'go-offline-required'
            : 'not-connected'
      }
    }
    const client = lease.client

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
    } finally {
      lease.release()
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
