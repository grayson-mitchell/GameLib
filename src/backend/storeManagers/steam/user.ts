import type { ManagerDeps, SteamSessionServices } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import type { Clock, TimerHandle } from 'backend/process/types'
import { existsSync } from 'graceful-fs'
import { join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamStoresDeps } from './library/installRoot'
import { STEAM_INSTALL_PATHS } from './constants'
import { readTokenOutcome, type TokenStoreSlot } from './tokenStore'
import { applySignInVerdict } from 'backend/signInProbe/verdict'
import { withTimeout } from './withTimeout'
import { sendFrontendMessage } from '../../ipc'
import type { AnonymousClient } from './anonymousClient'
import {
  GuidedOfflineRequiredError,
  type MacSteamOffline,
  type MacSteamRestoreOutcome,
  type MacSteamWrapKind
} from './macSteamOffline'
import { abortSteamUserLogon } from './steamUserLogonAbort'
import { platform } from 'process'
import type { SteamUserData } from 'common/types/steam'
import SteamUserLib from 'steam-user'
import type { SignInProbeOutcome } from 'common/signInState'
import {
  CANARY_APP_ID,
  CANARY_TIMEOUT_MS,
  AUTH_SESSION_IDLE_GRACE_MS,
  AUTH_LOGON_BOUND_MS,
  CREDENTIAL_REFUSAL_ERESULTS,
  CREDENTIAL_REFUSAL_NAMES,
  type AuthSessionReason,
  type AuthSessionRefusal,
  type AcquireAuthenticatedOpts,
  type GuidedInstallTarget,
  type AuthenticatedLease,
  type OpenAuthenticatedLease
} from './userTypes'

type SteamUserMacSteamOffline = Pick<
  MacSteamOffline,
  'withMacSteamOffline' | 'restoreMacSteamOnlineIfOwed'
>

/**
 * Everything one SteamUser needs, required at construction (D-05, D-66.3-16): there is no unbound
 * state and no throw-if-unbound accessor.
 */
export type SteamUserDeps = SteamStoresDeps & {
  /** The boot-owned Mac Steam go-offline instance (the wrap and the shutdown restore). */
  macSteamOffline: SteamUserMacSteamOffline
  /** The boot-owned sign-in fence and outcome map (D-66.3-13). */
  signIn: Pick<ManagerDeps['signIn'], 'epochs' | 'outcomes'>
  /** The boot-owned Steam sign-in session state and auth-unlock latches (D-66.3-13). */
  steamSession: Pick<SteamSessionServices, 'authTrigger' | 'signIn'>
  /** The boot-owned token store slot (66.4-07): the keyring / dev-vault store once 'secret-stores' configured it. */
  tokenStore: Pick<TokenStoreSlot, 'current'>
  /** The boot-owned anonymous CM client; logout() closes it (D-66.3-14). */
  anonymousClient: Pick<AnonymousClient, 'close'>
  /** The boot clock: the idle-close timer lives on it, unref'd (exit contract). */
  clock: Clock
  /** The boot-built global config; the Windows Steam-client probe reads defaultSteamPath. */
  config: Pick<GlobalConfigSlice, 'getSettings'>
}

// ── SteamUser class ───────────────────────────────────────────────────────────

/**
 * The authenticated Steam CM session owner. One instance per boot, built by the 'steam-user' boot
 * step (createSteamUser); the single-flight connect, the wrap ordering, the lease count / idle
 * timer and the session generation fence are per instance and shared by every consumer through
 * Pick slices.
 */
export class SteamUser {
  constructor(private readonly deps: SteamUserDeps) {}

  private client: InstanceType<typeof SteamUserLib> | null = null
  // Single-flight for the wrapped cold connect; resolves null when connected,
  // otherwise the refusal every joiner reports.
  private connectingPromise: Promise<AuthSessionRefusal | null> | null = null
  // Live leases (acquireAuthenticated / acquireOpenAuthenticated). The last
  // release arms idleTimer; a bare ensureConnected() takes no lease.
  private leaseCount = 0
  private idleTimer: TimerHandle | null = null
  // 54-REVIEW CR-01: the last install target seen per appName. An install's
  // first acquire (games.ts) carries it; a nested acquire for the same app
  // (depot.ts) does not, so its guided push reads it from here. Without it a
  // guided Continue would reinstall into the default library and route.
  private guidedInstallTargets = new Map<string, GuidedInstallTarget>()
  // True once releaseForShutdown() has run (stdin EOF: the shell is gone). A reconnect path
  // (ensureConnected's relog, a late login) must not open a NEW CM socket after that, or the
  // sidecar would hold the loop again.
  private shuttingDown = false
  // 54-REVIEW WR-07: bumped by logout(). A wrapped connect captures it, and a
  // logon that started before a sign-out never opens (or keeps) a session.
  private sessionGeneration = 0
  // 54-REVIEW WR-07: abandons the authenticated logon in flight, if any.
  private abandonPendingLogon: (() => void) | null = null
  // 54-REVIEW WR-07: wraps run one at a time. Single-flight normally makes
  // that true already; after a sign-out mid-wrap, a fresh sign-in's wrap must
  // not overlap the old wrap's goonline.
  private wrapTail: Promise<unknown> = Promise.resolve()
  // steam-sync-false-failed-banner: the terminal 'error' the CM ended the most
  // recent logon attempt with (e.g. AccessDenied for a refresh token Steam no
  // longer accepts). Tagged with the client it belongs to so an error from a
  // REPLACED client (the old one's LogonSessionReplaced arriving while a newer
  // client is still logging on, seen in the 34.9 live gate) can never be
  // mistaken for the current attempt's verdict. Reset at the start of every
  // connectSteamUserClient(). Read through getLogonFailure(), which hands out
  // only message + eresult -- never the client, never the token.
  private logonFailure: {
    client: InstanceType<typeof SteamUserLib>
    message: string
    eresult?: number
  } | null = null
  // ── AUTH-05: Steam client detection ────────────────────────────────────────

  /**
   * Whether a Steam client is installed.
   *
   * On Windows this probes `<defaultSteamPath>/steam.exe`, the same root the
   * D-11 launch gate's hasLibraryFoldersVdf() (clientSetup.ts) reads, so the
   * D-10 and D-11 gates cannot disagree about where Steam lives (quick
   * 261101-whs). On darwin and linux it probes STEAM_INSTALL_PATHS. A blank
   * Default Steam path setting returns false without probing anything.
   */
  isSteamClientInstalled(): boolean {
    if (platform === 'win32') {
      const root = this.deps.config
        .getSettings()
        .defaultSteamPath.replaceAll("'", '')
      // join('', 'steam.exe') would probe a steam.exe relative to the cwd.
      if (root.trim() === '') return false
      return existsSync(join(root, 'steam.exe'))
    }
    const paths = STEAM_INSTALL_PATHS[platform] ?? []
    return paths.some((p) => existsSync(p))
  }

  // ── AUTH-03: Login state ───────────────────────────────────────────────────

  isLoggedIn(): boolean {
    return Boolean(
      this.deps.stores.steam.configStore.get_nodefault('isLoggedIn')
    )
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
  async probeCredentialPresence(): Promise<SignInProbeOutcome> {
    if (!this.isLoggedIn()) return 'unknown'
    try {
      this.deps.steamSession.authTrigger.noteSteamAuthTrigger('boot-probe')
      const outcome = await readTokenOutcome(
        this.deps.tokenStore.current(),
        'boot-probe'
      )
      if (outcome.status === 'present') return 'healthy'
      if (outcome.status === 'absent') return 'expired'
      return 'unknown'
    } catch {
      return 'unknown'
    }
  }

  // ── LIB-01: Authenticated client accessor ─────────────────────────────────

  getClient(): InstanceType<typeof SteamUserLib> | null {
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
  getLogonFailure(): { message: string; eresult?: number } | null {
    const failure = this.logonFailure
    if (!failure || failure.client !== this.client) return null
    return { message: failure.message, eresult: failure.eresult }
  }

  /** True when the CM refused the stored credential itself, not the connection. */
  private isCredentialRefusal(rejection: {
    message: string
    eresult?: number
  }): boolean {
    if (typeof rejection.eresult === 'number') {
      return CREDENTIAL_REFUSAL_ERESULTS.includes(rejection.eresult)
    }
    return CREDENTIAL_REFUSAL_NAMES.includes(rejection.message)
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
  private reportLogonVerdict(
    outcome: 'healthy' | 'expired',
    epochAtStart: number
  ): void {
    const result = applySignInVerdict(
      { stores: this.deps.stores, epochs: this.deps.signIn.epochs },
      'steam',
      outcome,
      epochAtStart
    )
    if (result !== 'latched' && result !== 'cleared') return
    this.deps.signIn.outcomes.record('steam', outcome)
    this.deps.signIn.outcomes.publish()
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
  async ensureConnected(): Promise<boolean> {
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
  acquireAuthenticated(
    opts: AcquireAuthenticatedOpts
  ): Promise<AuthenticatedLease> {
    return this.acquireInternal(opts)
  }

  acquireAuthenticatedWithToken(
    opts: AcquireAuthenticatedOpts,
    token: string
  ): Promise<AuthenticatedLease> {
    return this.acquireInternal(opts, token)
  }

  private async acquireInternal(
    opts: AcquireAuthenticatedOpts,
    token?: string
  ): Promise<AuthenticatedLease> {
    if (this.shuttingDown) return { ok: false, reason: 'shutting-down' }
    if (
      opts.appName &&
      (opts.installPath !== undefined ||
        opts.forceWindowsViaBottle !== undefined)
    ) {
      this.guidedInstallTargets.set(opts.appName, {
        installPath: opts.installPath,
        forceWindowsViaBottle: opts.forceWindowsViaBottle
      })
    }
    this.leaseCount++
    this.clearIdleTimer()
    let refusal: AuthSessionRefusal | null
    try {
      refusal = await this.ensureAuthenticatedSession(opts.reason, token, 1)
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
        const target =
          opts.guidedAction === 'install' && opts.appName
            ? this.guidedInstallTargets.get(opts.appName)
            : undefined
        sendFrontendMessage('steamGoOfflineRequired', {
          action: opts.guidedAction,
          appName: opts.appName,
          ...(target?.installPath !== undefined
            ? { installPath: target.installPath }
            : {}),
          ...(target?.forceWindowsViaBottle !== undefined
            ? { forceWindowsViaBottle: target.forceWindowsViaBottle }
            : {})
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
  acquireOpenAuthenticated(
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
  getPersistedSteamId64(): string | undefined {
    const steamId =
      this.deps.stores.steam.configStore.get_nodefault('userData')?.steamId
    return typeof steamId === 'string' && /^\d+$/.test(steamId)
      ? steamId
      : undefined
  }

  private makeRelease(): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.leaseCount = Math.max(0, this.leaseCount - 1)
      this.armIdleTimer()
    }
  }

  private armIdleTimer(): void {
    if (this.leaseCount > 0 || !this.client) return
    this.clearIdleTimer()
    this.idleTimer = this.deps.clock.setTimeout(() => {
      this.idleTimer = null
      if (this.leaseCount === 0) this.endSession('idle')
    }, AUTH_SESSION_IDLE_GRACE_MS)
  }

  /**
   * The one body that may open an authenticated CM logon. null = connected.
   * `tokenOverride` is the sign-in path: the token is already in memory, so
   * the keyring is not read again. `callerLeases` is how many of the current
   * leases the caller itself holds (acquireInternal counts its own first).
   */
  private async ensureAuthenticatedSession(
    reason: AuthSessionReason,
    tokenOverride?: string,
    callerLeases = 0
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
        this.deps.stores.steam.configStore.delete('credentialsMissing')
        return null
      } catch (canaryErr) {
        logWarning(
          [
            'Steam: ensureConnected canary failed — socket may be stale, re-entering the wrapped cold connect:',
            canaryErr
          ],
          LogPrefix.Steam
        )
        // 54-REVIEW WR-08: other holders (a long download, a bridge install's
        // shim and redist steps) still use this client. Ending it would log
        // it off under them, and a replacement logon on the same account
        // would replace their session anyway. Refuse this acquire only; the
        // last release's idle close or a CM drop ends the session.
        const othersHolding = this.leaseCount - callerLeases
        if (othersHolding > 0 && this.client === client) {
          logWarning(
            `Steam: ensureConnected canary failed while ${othersHolding} other lease(s) hold the session; keeping it for them and refusing this caller`,
            LogPrefix.Steam
          )
          return 'client-not-ready'
        }
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
        this.deps.tokenStore.current(),
        this.deps.steamSession.authTrigger.currentTriggerLabel()
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
        this.deps.stores.steam.configStore.set('credentialsMissing', true)
        return 'token-absent'
      }
      token = outcome.token
    }

    // quick 261011-rj0: captured BEFORE the connect attempt, exactly as the
    // probe pass does (pass.ts). A sign-in that completes while this logon is
    // in flight bumps the epoch, and whatever the CM then says about the OLD
    // token is refused by `applySignInVerdict` as stale (T-49-10).
    const epochAtStart = this.deps.signIn.epochs.capture('steam')
    const start = Date.now()
    if (!this.connectingPromise && token !== undefined) {
      if (this.client?.steamID) {
        // Another caller finished connecting while the keyring was being read;
        // logging on again would log that fresh session off.
        this.reportLogonVerdict('healthy', epochAtStart)
        return null
      }
      const p: Promise<AuthSessionRefusal | null> = this.wrappedConnect(
        token,
        reason,
        this.sessionGeneration
      ).finally(() => {
        // A sign-out mid-connect may have handed the slot to a newer connect.
        if (this.connectingPromise === p) this.connectingPromise = null
      })
      this.connectingPromise = p
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
  private wrappedConnect(
    token: string,
    reason: AuthSessionReason,
    generation: number
  ): Promise<AuthSessionRefusal | null> {
    const run = this.wrapTail.then(() =>
      this.wrappedConnectNow(token, reason, generation)
    )
    this.wrapTail = run.catch(() => undefined)
    return run
  }

  private async wrappedConnectNow(
    token: string,
    reason: AuthSessionReason,
    generation: number
  ): Promise<AuthSessionRefusal | null> {
    if (generation !== this.sessionGeneration) return 'not-signed-in'
    try {
      await this.deps.macSteamOffline.withMacSteamOffline((wrap) =>
        this.connectSteamUserClient(token, { reason, wrap, generation })
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
    if (generation !== this.sessionGeneration) return 'not-signed-in'
    // debug/shutdown-mid-connect-logon-survives: a connect the shutdown
    // release abandoned reports that, and opens nothing for its caller.
    if (this.shuttingDown) return 'shutting-down'
    if (this.client?.steamID) return null
    if (this.getLogonFailure()) return 'logon-rejected'
    return 'client-not-ready'
  }

  /** Close the current authenticated session (idle, stale canary, CM drop). */
  private endSession(cause: string): void {
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

  private clearIdleTimer(): void {
    if (this.idleTimer) this.deps.clock.clear(this.idleTimer)
    this.idleTimer = null
  }

  // ── AUTH-04: Logout ────────────────────────────────────────────────────────

  /**
   * D-09 gap fix (28-03 gap cycle): the refresh token MUST go through the
   * TokenStore seam (this.deps.tokenStore.current().clearToken()) — never a direct
   * configStore call — so a future Tauri build's keyring-backed store is
   * cleared correctly instead of leaving a stale Keychain entry behind.
   * `configStore.clear()` was replaced with targeted deletes of the specific
   * session keys it used to wipe (isLoggedIn, userData) so the observable
   * Electron behavior is unchanged — a blanket clear() would also nuke any
   * other key ever added to this shared store (see stores.ts).
   * It also restores the locked auth-trigger state (quick 261112-7wv).
   * clearToken() may be an async RPC round-trip to Rust in the sidecar build,
   * so this method is async; addListener('logoutSteam', ...) in main.ts
   * awaits it inside its own async wrapper, matching this file's existing
   * fire-and-forget IPC convention (e.g. addListener('quit', async () =>
   * handleExit())) — never a floating promise.
   */
  async logout(): Promise<void> {
    this.clearIdleTimer()
    this.leaseCount = 0
    // 54-REVIEW WR-07: a wrapped logon already in flight must not open a
    // session for the account being signed out.
    this.sessionGeneration++
    this.abandonPendingLogon?.()
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
    this.guidedInstallTargets.clear()
    this.deps.anonymousClient.close('logout')
    this.deps.steamSession.signIn.resetSignInState()
    // Quick 261112-7wv: lock the keyring gate and drop any armed refresh logon
    // grant. Must stay synchronous and before the first await below so a
    // refresh racing a slow clearToken cannot consume a stale grant. Sits
    // beside resetSignInState: both are boot-owned steamSession latches.
    this.deps.steamSession.authTrigger.resetSteamAuthTrigger()
    // Token through the seam (D-09) first, then the remaining session keys
    // configStore.clear() used to wipe — see stores.ts's configStore
    // schema (isLoggedIn/userData are the only other keys ever written there).
    await this.deps.tokenStore.current().clearToken()
    this.deps.stores.steam.configStore.delete('isLoggedIn')
    this.deps.stores.steam.configStore.delete('userData')
    // A signed-out session has no credential to be missing — leaving a stale
    // `true` here would mislabel the next login's tile before any read runs.
    this.deps.stores.steam.configStore.delete('credentialsMissing')
    // Phase 49: fence any boot probe that began before this sign-out.
    this.deps.signIn.outcomes.noteSignedOut('steam')
    logInfo('Logging user out from Steam', LogPrefix.Steam)
  }

  // ── User details ───────────────────────────────────────────────────────────

  async getUserDetails(): Promise<SteamUserData | undefined> {
    const userData =
      this.deps.stores.steam.configStore.get_nodefault('userData')
    return userData
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  async getCredentials(): Promise<{ refreshToken: string } | undefined> {
    // quick-260814-r2d: routed through readTokenOutcome so both `absent` and
    // `unreadable` map to undefined here — this method's signature/return
    // type and every other caller are unchanged. This keeps a single read
    // path through the seam (ensureConnected() above uses the same call)
    // rather than two divergent ones.
    const outcome = await readTokenOutcome(
      this.deps.tokenStore.current(),
      this.deps.steamSession.authTrigger.currentTriggerLabel()
    )
    if (outcome.status !== 'present') return undefined
    return { refreshToken: outcome.token }
  }

  /**
   * Sidecar exit contract, half 1 for a handle we cannot unref(): a logged-on steam-user client
   * owns the CM TCP socket and its heartbeat timer inside the library, and both are referenced.
   * Measured (debug/sidecar-survives-force-quit): an anonymous-logged-on client keeps a bare
   * node process alive indefinitely; `logOff()` lets it drain in ~100ms. Called on stdin EOF.
   * Unlike logout() this clears no token and no stored session -- the user stays signed in.
   * The release also pays any goonline the go-offline wrap owes, after logOff, so no GameLib
   * logon can land once Mac Steam reconnects. The anonymous CM client is released by the caller
   * (releaseOnStdinEof / the quit handler) through the boot-owned instance, before this call.
   *
   * debug/shutdown-mid-connect-logon-survives: a logon still in flight is abandoned FIRST
   * (abortSteamUserLogon, so steam-user cannot log on again by itself), which also settles
   * the wrap at once: it goes back online now and runs no refresh, instead of waiting on a
   * logon that would otherwise land seconds later with Mac Steam online.
   */
  releaseForShutdown(): Promise<MacSteamRestoreOutcome> {
    this.shuttingDown = true
    this.clearIdleTimer()
    this.abandonPendingLogon?.()
    const client = this.client
    if (client) {
      try {
        abortSteamUserLogon(client)
      } catch (err) {
        logWarning(
          ['Steam client logOff error during shutdown release:', err],
          LogPrefix.Steam
        )
      }
    }
    return this.deps.macSteamOffline.restoreMacSteamOnlineIfOwed('shutdown')
  }

  private connectSteamUserClient(
    refreshToken: string,
    opts: {
      reason: AuthSessionReason
      wrap: MacSteamWrapKind
      generation: number
    }
  ): Promise<void> {
    if (this.shuttingDown) return Promise.resolve()
    if (opts.generation !== this.sessionGeneration) {
      logInfo(
        '[Steam] CM logon abandoned: signed out while the go-offline wrap was in flight',
        LogPrefix.Steam
      )
      return Promise.resolve()
    }
    if (this.client) {
      try {
        abortSteamUserLogon(this.client)
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
          abortSteamUserLogon(client)
        } catch {
          // ignore
        }
        if (this.client === client) this.client = null
        settle()
      }, AUTH_LOGON_BOUND_MS)
      bound.unref?.()

      const settle = (): void => {
        if (settled) return
        settled = true
        clearTimeout(bound)
        if (this.abandonPendingLogon === abandon) {
          this.abandonPendingLogon = null
        }
        resolve()
      }

      // 54-REVIEW WR-07: logout() calls this so the wrap stops waiting on a
      // logon for an account that is no longer signed in. releaseForShutdown()
      // calls it too (debug/shutdown-mid-connect-logon-survives).
      const abandon = (): void => {
        if (settled) return
        try {
          abortSteamUserLogon(client)
        } catch {
          // ignore
        }
        if (this.client === client) this.client = null
        settle()
      }
      this.abandonPendingLogon = abandon

      client.once('loggedOn', () => {
        // debug/shutdown-mid-connect-logon-survives: a logon that lands after
        // the shutdown release is never kept either. Mac Steam may already be
        // back online, so it is logged off before anything else runs.
        if (this.shuttingDown || opts.generation !== this.sessionGeneration) {
          // Signed out (or shut down) while this logon was in flight: never
          // keep it.
          try {
            abortSteamUserLogon(client)
          } catch {
            // ignore
          }
          if (this.client === client) this.client = null
          if (this.shuttingDown) {
            logWarning(
              '[Steam] CM logon landed after the shutdown release, logged off at once',
              LogPrefix.Steam
            )
          }
          settle()
          return
        }
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
}

export function createSteamUser(deps: SteamUserDeps): SteamUser {
  return new SteamUser(deps)
}
