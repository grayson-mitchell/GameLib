import type { ManagerDeps, SteamSessionServices } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import { existsSync } from 'graceful-fs'
import { join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMCM_SESSION_LOGOUT } from 'common/types/sidecarTransport'
import type { SteamCmClient } from './cm/SteamCmClient'
import type { SteamStoresDeps } from './library/installRoot'
import { STEAM_INSTALL_PATHS } from './constants'
import { readTokenOutcome, type TokenStoreSlot } from './tokenStore'
import { RustCmSession } from './rustSession'
import { isCredentialRefusal, reportLogonVerdict } from './logonVerdict'
import type { SendFrontendMessage } from '../../host/frontendMessage'
import type { AnonymousClient } from './anonymousClient'
import { platform } from 'process'
import type { SteamUserData } from 'common/types/steam'
import type { SignInProbeOutcome } from 'common/signInState'
import {
  type AuthSessionReason,
  type AcquireAuthenticatedOpts,
  type GuidedInstallTarget,
  type AuthenticatedLease,
  type OpenAuthenticatedLease
} from './userTypes'

/**
 * Everything one SteamUser needs, required at construction (D-05, D-66.3-16): there is no unbound
 * state and no throw-if-unbound accessor.
 */
export type SteamUserDeps = SteamStoresDeps & {
  /** The boot-owned sign-in fence and outcome map (D-66.3-13). */
  signIn: Pick<ManagerDeps['signIn'], 'epochs' | 'outcomes'>
  /** The boot-owned Steam sign-in session state and auth-unlock latches (D-66.3-13). */
  steamSession: Pick<SteamSessionServices, 'authTrigger' | 'signIn'>
  /** The boot-owned token store slot (66.4-07): the keyring / dev-vault store once 'secret-stores' configured it. */
  tokenStore: Pick<TokenStoreSlot, 'current'>
  /** The boot-owned anonymous CM client; logout() closes it (D-66.3-14). */
  anonymousClient: Pick<AnonymousClient, 'close'>
  /** The boot-built global config; the Windows Steam-client probe reads defaultSteamPath. */
  config: Pick<GlobalConfigSlice, 'getSettings'>
  sendFrontendMessage: SendFrontendMessage
  /** The boot's rustInvoke transport: the Rust CM session (Phase 79). */
  rustInvoke: RustInvokeDeps
}

// ── SteamUser class ───────────────────────────────────────────────────────────

/**
 * The authenticated Steam CM session owner. One instance per boot, built by the 'steam-user' boot
 * step (createSteamUser). The Rust CM session (rustSession.ts) does the connecting; this class keeps
 * the policy it consults, the guided-install targets and the sign-out generation fence, shared by
 * every consumer through Pick slices.
 */
export class SteamUser {
  constructor(private readonly deps: SteamUserDeps) {}

  // 54-REVIEW CR-01: the last install target seen per appName. An install's
  // first acquire (games.ts) carries it; a nested acquire for the same app
  // (depot.ts) does not, so its guided push reads it from here. Without it a
  // guided Continue would reinstall into the default library and route.
  private guidedInstallTargets = new Map<string, GuidedInstallTarget>()
  // True once releaseForShutdown() has run (stdin EOF: the shell is gone). A late login must
  // not open a NEW CM session after that.
  private shuttingDown = false
  // 54-REVIEW WR-07: bumped by logout(). The Rust session captures it, and a logon that
  // started before a sign-out never opens (or keeps) a session.
  private sessionGeneration = 0

  // Phase 79 (D-03): the Rust CM session (cm=rust), built over this class's policy.
  private readonly rust = new RustCmSession(this.deps, {
    isShuttingDown: () => this.shuttingDown,
    isLoggedIn: () => this.isLoggedIn(),
    generation: () => this.sessionGeneration,
    isCredentialRefusal,
    reportLogonVerdict: (outcome, epoch) =>
      reportLogonVerdict(this.deps, outcome, epoch)
  })

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

  getClient(): SteamCmClient | null {
    return this.rust.getClient()
  }

  // ── LIB-01: Reconnect on startup ───────────────────────────────────────────

  /**
   * The credential refusal the last session acquire ended with, or null when
   * there is none (never attempted, still in flight, succeeded, or cleared by
   * the next acquire or a sign-out). The Rust session reports a refusal of the
   * credential itself (for example AccessDenied) as `logon-rejected` and does
   * not retry it, so waiting or retrying the same token replays the refusal.
   * Lets a caller whose ensureConnected() returned false tell "Steam refused
   * this logon" from "not connected yet". Carries message + eresult only: no
   * client handle, no token. See RustCmSession's `logonFailure` field.
   */
  getLogonFailure(): { message: string; eresult?: number } | null {
    return this.rust.getLogonFailure()
  }

  /**
   * Ensure the Rust CM session is open and signed in. Returns true only when
   * it is connected. Concurrent callers share one logon: the Rust session
   * actor runs a single logon for every waiting acquire.
   *
   * A connected session is checked without taking a lease. A closed one is
   * opened through a lease that is released at once, so the Rust session's
   * idle close (IDLE_GRACE after the last release) applies to it. Work that
   * must keep the session open holds its own acquireAuthenticated() lease.
   *
   * user.ts-internal session check, kept public only because tests drive it
   * directly. Every production caller must use acquireAuthenticated /
   * acquireOpenAuthenticated; steamAuthSessionPolicy.test.ts enforces this.
   */
  async ensureConnected(): Promise<boolean> {
    return this.rust.ensureConnected()
  }

  /**
   * Lease the authenticated session, opening it when it is not already open.
   * There is no go-offline wrap: the Rust logon keeps Mac Steam's Friends list
   * signed in, so a logon is never delayed or refused for it. Concurrent
   * acquires share one logon. The Rust session closes 60 s (its IDLE_GRACE,
   * the former AUTH_SESSION_IDLE_GRACE_MS) after the last release.
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
    return this.rustAcquire(opts, token)
  }

  // ── Phase 79 (D-03): the Rust engine ──────────────────────────────────────
  // The session itself lives in ./rustSession (RustCmSession); this class keeps the policy the
  // session consults through rustHost (shuttingDown, isLoggedIn, the sign-out fence, the credential
  // verdict).

  private async rustAcquire(
    opts: AcquireAuthenticatedOpts,
    tokenOverride?: string
  ): Promise<AuthenticatedLease> {
    const res = await this.rust.acquireSession(opts.reason, tokenOverride)
    if (!res.ok) return { ok: false, reason: res.reason }
    return { ok: true, client: res.client, release: res.release }
  }

  /**
   * A lease on a session that is ALREADY open, or null. Never reads the
   * keyring and never logs on: launch-path consumers use it so they can reuse
   * an install's session but can never open one.
   */
  async acquireOpenAuthenticated(
    reason: AuthSessionReason
  ): Promise<OpenAuthenticatedLease | null> {
    return this.rust.acquireOpen(reason)
  }

  /** configStore userData.steamId when it is a numeric SteamID64 string. */
  getPersistedSteamId64(): string | undefined {
    const steamId =
      this.deps.stores.steam.configStore.get_nodefault('userData')?.steamId
    return typeof steamId === 'string' && /^\d+$/.test(steamId)
      ? steamId
      : undefined
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
    // 54-REVIEW WR-07: a logon already in flight must not open a session for the account being
    // signed out.
    this.sessionGeneration++
    // T-79-61: drop every TS-held lease; the Rust session is fenced below (its generation bump).
    this.rust.reset()
    this.guidedInstallTargets.clear()
    // The one anonymous-session close: it sends steamcm_anon_close {reason:'logout'} itself, so
    // the Rust logout below must not repeat it (79-REVIEW C1/IN-02).
    this.deps.anonymousClient.close('logout')
    this.deps.steamSession.signIn.resetSignInState()
    // Quick 261112-7wv: lock the keyring gate and drop any armed refresh logon
    // grant. Must stay synchronous and before the first await below so a
    // refresh racing a slow Rust logout or clearToken cannot consume a stale grant. Sits
    // beside resetSignInState: both are boot-owned steamSession latches.
    this.deps.steamSession.authTrigger.resetSteamAuthTrigger()
    try {
      await this.deps.rustInvoke.requestRustInvoke(
        RUST_STEAMCM_SESSION_LOGOUT,
        []
      )
    } catch (err) {
      logWarning(
        `Steam: the Rust CM logout failed (${err instanceof Error ? err.name : typeof err})`,
        LogPrefix.Steam
      )
    }
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
   * Stdin EOF: the shell is gone. The Rust shell's EOF / exit hook (steamcm_dispatch.rs) owns the CM
   * session teardown and any owed Mac Steam go-online, and no library-owned CM handle exists in the
   * sidecar any more, so this only fences new logons and drops the TS-held leases. Unlike logout()
   * it clears no token and no stored session: the user stays signed in.
   */
  releaseForShutdown(): Promise<void> {
    this.shuttingDown = true
    // No IPC: the shell's stdin-EOF / exit hook (79-16) owns the Rust session teardown and
    // the owed go-online, and a rustInvoke here would race the closing transport.
    this.rust.dropLeases()
    return Promise.resolve()
  }
}

export function createSteamUser(deps: SteamUserDeps): SteamUser {
  return new SteamUser(deps)
}
