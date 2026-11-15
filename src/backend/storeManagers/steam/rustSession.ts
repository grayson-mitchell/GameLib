import type { SteamSessionServices } from 'backend/services/types'
import type { ManagerDeps } from 'backend/services/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  RUST_STEAMCM_LICENSES,
  RUST_STEAMCM_SESSION_ACQUIRE,
  RUST_STEAMCM_SESSION_ACQUIRE_OPEN,
  RUST_STEAMCM_SESSION_ENSURE_CONNECTED,
  RUST_STEAMCM_SESSION_RELEASE,
  RUST_STEAMCM_SESSION_STATUS
} from 'common/types/sidecarTransport'
import type { SteamCmClient } from './cm/SteamCmClient'
import { createRustCmClient } from './cm/RustCmClient'
import { createLiveLeaseClient } from './cm/liveLeaseClient'
import { invokeSteamCm } from './cm/rustSteamCm'
import type { SteamStoresDeps } from './library/installRoot'
import { readTokenOutcome, type TokenStoreSlot } from './tokenStore'
import type {
  AuthSessionReason,
  AuthSessionRefusal,
  OpenAuthenticatedLease
} from './userTypes'

// What the Rust session returns for an acquire (gamelib-steamcm facade.rs).
type RustAcquireResult =
  | { ok: true; leaseId: number; steamId: string }
  | {
      ok: false
      refusal?: AuthSessionRefusal
      logonFailure?: { kind: string; eresult?: number | null }
    }

/** What the Rust session reads from the owning SteamUser's deps. */
export type RustSessionDeps = SteamStoresDeps & {
  signIn: Pick<ManagerDeps['signIn'], 'epochs'>
  steamSession: Pick<SteamSessionServices, 'authTrigger'>
  tokenStore: Pick<TokenStoreSlot, 'current'>
  rustInvoke: RustInvokeDeps
}

/** The SteamUser-owned policy the Rust session consults; the session itself never reaches back. */
export type RustSessionHost = {
  isShuttingDown(): boolean
  isLoggedIn(): boolean
  /** The sign-out fence: bumped by logout(). */
  generation(): number
  isCredentialRefusal(rejection: { message: string; eresult?: number }): boolean
  reportLogonVerdict(outcome: 'healthy' | 'expired', epochAtStart: number): void
}

export type RustAcquireSessionResult =
  | { ok: true; client: SteamCmClient; release: () => void }
  | { ok: false; reason: AuthSessionRefusal }

/**
 * Phase 79 (D-03): the TS side of the Rust CM session (cm=rust). Policy (shuttingDown, isLoggedIn,
 * the token read, the credential verdict) is the host's; the session itself (logon, wrap, lease
 * counting, idle close) is the Rust session's. Logging names the reason and channel only, never
 * the token, the lease args or results.
 */
export class RustCmSession {
  constructor(
    private readonly deps: RustSessionDeps,
    private readonly host: RustSessionHost
  ) {}

  // Leases this class holds on the Rust CM session, keyed by lease id, in acquisition order.
  // getClient() answers from here synchronously.
  private leases = new Map<number, SteamCmClient>()
  // The last acquire refusal's logon failure; cleared by the next acquire and by reset().
  private logonFailure: { message: string; eresult?: number } | null = null

  // Resolves a held lease per call, so a released lease never strands a caller still holding
  // its own (review 79 C1/CR-01: an install handed a concurrent Refresh's client).
  private readonly live = createLiveLeaseClient(() => this.latestLease())

  private latestLease(): SteamCmClient | null {
    let last: SteamCmClient | null = null
    for (const c of this.leases.values()) last = c
    return last
  }

  getClient(): SteamCmClient | null {
    return this.leases.size > 0 ? this.live : null
  }

  getLogonFailure(): { message: string; eresult?: number } | null {
    return this.logonFailure
  }

  /** Drop every TS-held lease without telling the Rust session (logout fences it, shutdown skips IPC). */
  dropLeases(): void {
    this.leases.clear()
  }

  /** Sign-out: forget the leases and the last logon failure. */
  reset(): void {
    this.leases.clear()
    this.logonFailure = null
  }

  async acquireSession(
    reason: AuthSessionReason,
    tokenOverride?: string
  ): Promise<RustAcquireSessionResult> {
    if (this.host.isShuttingDown())
      return { ok: false, reason: 'shutting-down' }
    if (tokenOverride === undefined && !this.host.isLoggedIn()) {
      return { ok: false, reason: 'not-signed-in' }
    }
    let token = tokenOverride
    if (token === undefined) {
      const outcome = await readTokenOutcome(
        this.deps.tokenStore.current(),
        this.deps.steamSession.authTrigger.currentTriggerLabel()
      )
      if (outcome.status === 'unreadable') {
        logWarning(
          `Steam: refresh token read failed (${outcome.reason}) — this is retryable, ` +
            'keeping the signed-in session and NOT clearing any credentials',
          LogPrefix.Steam
        )
        return { ok: false, reason: 'token-unreadable' }
      }
      if (outcome.status === 'absent') {
        logWarning(
          'Steam: logged in but no stored refresh token — cannot reconnect',
          LogPrefix.Steam
        )
        this.deps.stores.steam.configStore.set('credentialsMissing', true)
        return { ok: false, reason: 'token-absent' }
      }
      token = outcome.token
    }

    const epochAtStart = this.deps.signIn.epochs.capture('steam')
    const generation = this.host.generation()
    this.logonFailure = null
    let r: RustAcquireResult
    try {
      // logonId 0: the Rust session picks its own (D-18); the token is passed unchanged (D-07).
      r = (await this.deps.rustInvoke.requestRustInvoke(
        RUST_STEAMCM_SESSION_ACQUIRE,
        [{ refreshToken: token, reason, logonId: 0 }]
      )) as RustAcquireResult
    } catch (err) {
      logWarning(
        `Steam: the Rust CM session acquire failed (${err instanceof Error ? err.name : typeof err})`,
        LogPrefix.Steam
      )
      return { ok: false, reason: 'client-not-ready' }
    }
    if (!r.ok) {
      const refusal = r.refusal ?? 'client-not-ready'
      if (refusal === 'logon-rejected' && r.logonFailure) {
        const rejection = {
          message: r.logonFailure.kind,
          ...(typeof r.logonFailure.eresult === 'number'
            ? { eresult: r.logonFailure.eresult }
            : {})
        }
        this.logonFailure = rejection
        logWarning(
          `Steam: the CM rejected the stored-credential logon (${rejection.message})`,
          LogPrefix.Steam
        )
        if (this.host.isCredentialRefusal(rejection)) {
          this.host.reportLogonVerdict('expired', epochAtStart)
        }
      }
      return { ok: false, reason: refusal }
    }
    // A sign-out or shutdown while the logon was in flight: never keep the lease.
    if (this.host.isShuttingDown() || generation !== this.host.generation()) {
      this.release(r.leaseId)
      return {
        ok: false,
        reason: this.host.isShuttingDown() ? 'shutting-down' : 'not-signed-in'
      }
    }
    const client = await this.buildClient(r.leaseId, r.steamId)
    if (!client) {
      this.release(r.leaseId)
      return { ok: false, reason: 'client-not-ready' }
    }
    this.host.reportLogonVerdict('healthy', epochAtStart)
    return { ok: true, client, release: this.makeRelease(r.leaseId) }
  }

  private async buildClient(
    leaseId: number,
    steamId: string
  ): Promise<SteamCmClient | null> {
    let licenses
    try {
      const l = await invokeSteamCm(
        this.deps.rustInvoke,
        RUST_STEAMCM_LICENSES,
        { leaseId }
      )
      licenses = l.ok ? l.result : []
    } catch {
      return null
    }
    const client = createRustCmClient(this.deps.rustInvoke, {
      leaseId,
      steamId,
      licenses
    })
    this.leases.set(leaseId, client)
    return client
  }

  private release(leaseId: number): void {
    this.leases.delete(leaseId)
    this.deps.rustInvoke
      .requestRustInvoke(RUST_STEAMCM_SESSION_RELEASE, [{ leaseId }])
      .catch((err: unknown) => {
        logWarning(
          `Steam: the Rust CM lease release failed (${err instanceof Error ? err.name : typeof err})`,
          LogPrefix.Steam
        )
      })
  }

  private makeRelease(leaseId: number): () => void {
    let released = false
    return () => {
      if (released) return
      released = true
      this.release(leaseId)
    }
  }

  async ensureConnected(): Promise<boolean> {
    if (this.host.isShuttingDown()) return false
    try {
      const status = (await this.deps.rustInvoke.requestRustInvoke(
        RUST_STEAMCM_SESSION_STATUS,
        []
      )) as { connected?: boolean }
      if (status.connected) {
        const r = (await this.deps.rustInvoke.requestRustInvoke(
          RUST_STEAMCM_SESSION_ENSURE_CONNECTED,
          []
        )) as { connected?: boolean }
        if (r.connected) {
          this.deps.stores.steam.configStore.delete('credentialsMissing')
          return true
        }
      }
    } catch (err) {
      logWarning(
        `Steam: the Rust CM session check failed (${err instanceof Error ? err.name : typeof err})`,
        LogPrefix.Steam
      )
    }
    // Not connected: open the session through the policy path, then let the lease go.
    const res = await this.acquireSession('user-refresh')
    if (!res.ok) return false
    res.release()
    return true
  }

  async acquireOpen(
    reason: AuthSessionReason
  ): Promise<OpenAuthenticatedLease | null> {
    if (this.host.isShuttingDown()) return null
    let r: { ok: boolean; leaseId?: number; steamId?: string }
    try {
      r = (await this.deps.rustInvoke.requestRustInvoke(
        RUST_STEAMCM_SESSION_ACQUIRE_OPEN,
        [{ reason }]
      )) as typeof r
    } catch {
      return null
    }
    if (!r.ok || r.leaseId === undefined || r.steamId === undefined) return null
    const client = await this.buildClient(r.leaseId, r.steamId)
    if (!client) {
      this.release(r.leaseId)
      return null
    }
    logInfo(
      `[Steam] CM session reused mode=authenticated reason=${reason}`,
      LogPrefix.Steam
    )
    return { client, release: this.makeRelease(r.leaseId) }
  }
}
