/**
 * Phase 54 (54-01): one shared ANONYMOUS steam-user client for public PICS
 * reads (`getProductInfo`). An anonymous CM session carries no account, so it
 * can never sign Mac Steam's Friends session out, and it needs no go-offline
 * wrap. Public app info (platform flags, install dir, launch targets) is
 * readable anonymously; entries that need a token come back `missingToken` or
 * `public_only` (see `isPublicOnlyEntry`).
 *
 * This module imports neither the authenticated user module nor the token
 * store: it never reads the keyring and never sees a credential.
 *
 * Sidecar exit contract: every timer here runs on the boot clock (unref'd
 * unless keepAlive, which this module never asks for), the connect is
 * bounded, and the client closes itself when idle, so nothing in this module
 * can hold the event loop open at stdin EOF. "Idle" counts in-flight reads
 * (54-REVIEW WR-09): the close timer is armed only once none is running, so a
 * bulk PICS read longer than ANON_IDLE_CLOSE_MS is never cut off mid-request.
 */
import SteamUserLib from 'steam-user'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { Clock, TimerHandle } from 'backend/process/types'

export const ANON_CONNECT_TIMEOUT_MS = 15000
export const ANON_IDLE_CLOSE_MS = 60000

/** Structurally compatible with platformCapture's PlatformCapturePicsClient. */
interface AnonymousPicsClient {
  getProductInfo(
    apps: number[],
    packages: number[],
    inclTokens?: boolean
  ): Promise<{
    apps?: Record<number, { appinfo?: unknown; missingToken?: boolean }>
    unknownApps?: number[]
  }>
}

export type RawClient = InstanceType<typeof SteamUserLib>

/**
 * The slice of a raw steam-user client this module drives. Constructing one must not connect:
 * only `logOn` does.
 */
type RawClientFactory = () => RawClient

export interface AnonymousClientDeps {
  clock: Clock
  /** Builds one unconnected raw client; boot passes the real steam-user constructor. */
  createClient: RawClientFactory
}

export interface AnonymousClient {
  /** The shared anonymous PICS view, connecting once for concurrent callers; null on failure or after shutdown. */
  get(reason: string): Promise<AnonymousPicsClient | null>
  close(cause: 'idle' | 'logout' | 'shutdown'): void
  /** Closes the client and refuses every later `get` (stdin EOF); clears no token. */
  releaseForShutdown(): void
}

/** What a consumer that only reads public app data needs. */
export interface AnonymousClientSlice {
  anonymousClient: Pick<AnonymousClient, 'get'>
}

/** The production constructor: steam-user with the PICS cache and auto-relogin off. */
export function createRawAnonymousClient(): RawClient {
  return new SteamUserLib({
    enablePicsCache: false,
    autoRelogin: false
  })
}

/**
 * One anonymous steam-user owner per boot (D-05, D-66.3-14). Single-flight connect, in-use
 * counting (the idle close is armed only at inUse === 0, WR-09) and generation fencing (a connect
 * that resolves after close is discarded) are per instance.
 */
export function createAnonymousClient(
  deps: AnonymousClientDeps
): AnonymousClient {
  let cached: RawClient | null = null
  // What callers receive for `cached`: a view whose getProductInfo counts reads
  // in flight, so the idle close waits for them (54-REVIEW WR-09).
  let cachedView: AnonymousPicsClient | null = null
  let inUse = 0
  let inflight: Promise<AnonymousPicsClient | null> | null = null
  let idleTimer: TimerHandle | null = null
  let shuttingDown = false
  // Bumped by close so a connect that was in flight when the client was closed
  // discards its result instead of resurrecting the cache.
  let generation = 0

  function clearIdle(): void {
    if (idleTimer) deps.clock.clear(idleTimer)
    idleTimer = null
  }

  function armIdle(): void {
    clearIdle()
    if (inUse > 0) return
    idleTimer = deps.clock.setTimeout(() => {
      idleTimer = null
      if (inUse > 0) return
      close('idle')
    }, ANON_IDLE_CLOSE_MS)
  }

  function viewFor(client: RawClient): AnonymousPicsClient {
    const raw = client as unknown as AnonymousPicsClient
    const done = (): void => {
      // A read on a client that has since been closed or replaced does not
      // count against the current one.
      if (cached !== client) return
      inUse = Math.max(0, inUse - 1)
      if (inUse === 0) armIdle()
    }
    return {
      getProductInfo: (apps, packages, inclTokens) => {
        if (cached === client) {
          inUse++
          clearIdle()
        }
        let pending: ReturnType<AnonymousPicsClient['getProductInfo']>
        try {
          pending = raw.getProductInfo(apps, packages, inclTokens)
        } catch (err) {
          done()
          throw err
        }
        return Promise.resolve(pending).finally(done)
      }
    }
  }

  function safeLogOff(client: RawClient): void {
    try {
      client.logOff()
    } catch (err) {
      logWarning(['Steam anonymous client logOff error:', err], LogPrefix.Steam)
    }
  }

  function connect(reason: string): Promise<AnonymousPicsClient | null> {
    const gen = generation
    const client = deps.createClient()

    return new Promise<AnonymousPicsClient | null>((resolve) => {
      let settled = false
      const settle = (value: AnonymousPicsClient | null): void => {
        if (settled) return
        settled = true
        deps.clock.clear(timeout)
        resolve(value)
      }

      const timeout = deps.clock.setTimeout(() => {
        logWarning(
          '[Steam] anonymous CM logon timed out after 15s',
          LogPrefix.Steam
        )
        safeLogOff(client)
        settle(null)
      }, ANON_CONNECT_TIMEOUT_MS)

      // Persistent: with autoRelogin false every post-logon drop is emitted as
      // 'error', and an 'error' with no listener throws.
      const onDrop =
        (cause: 'error' | 'disconnected') =>
        (err?: { message?: string; eresult?: number }): void => {
          if (!settled) {
            logWarning(
              `[Steam] anonymous CM logon failed: ${err?.message ?? cause}`,
              LogPrefix.Steam
            )
            safeLogOff(client)
            settle(null)
            return
          }
          if (cached === client) {
            logInfo(
              `[Steam] CM session closed mode=anonymous cause=${cause}` +
                (err?.message ? ` message=${err.message}` : '') +
                (err?.eresult !== undefined ? ` eresult=${err.eresult}` : ''),
              LogPrefix.Steam
            )
            cached = null
            cachedView = null
            inUse = 0
            inflight = null
            clearIdle()
          }
        }
      client.on('error', onDrop('error'))
      client.on('disconnected', (eresult: number, msg?: string) =>
        onDrop('disconnected')({ message: msg, eresult })
      )

      client.once('loggedOn', () => {
        if (settled) return
        if (gen !== generation || shuttingDown) {
          safeLogOff(client)
          settle(null)
          return
        }
        cached = client
        cachedView = viewFor(client)
        inUse = 0
        settle(cachedView)
      })

      logInfo(
        '[Steam] CM logon mode=anonymous reason=' + reason,
        LogPrefix.Steam
      )
      client.logOn({ anonymous: true })
    })
  }

  async function get(reason: string): Promise<AnonymousPicsClient | null> {
    if (shuttingDown) return null
    if (cached && cachedView) {
      armIdle()
      return cachedView
    }
    if (!inflight) {
      const p: Promise<AnonymousPicsClient | null> = connect(reason).finally(
        () => {
          if (inflight === p) inflight = null
        }
      )
      inflight = p
    }
    const result = await inflight
    if (result) armIdle()
    return result
  }

  function close(cause: 'idle' | 'logout' | 'shutdown'): void {
    generation++
    clearIdle()
    const client = cached
    cached = null
    cachedView = null
    inUse = 0
    inflight = null
    if (client) {
      safeLogOff(client)
      logInfo(
        `[Steam] CM session closed mode=anonymous cause=${cause}`,
        LogPrefix.Steam
      )
    }
  }

  function releaseForShutdown(): void {
    shuttingDown = true
    close('shutdown')
  }

  return { get, close, releaseForShutdown }
}

/**
 * True when a PICS entry carries only public data: the token-gated half was
 * withheld (`missingToken`) or the entry is flagged `public_only`.
 */
export function isPublicOnlyEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const e = entry as { missingToken?: unknown; appinfo?: unknown }
  if (e.missingToken === true) return true
  if (e.appinfo && typeof e.appinfo === 'object') {
    const flag = (e.appinfo as { public_only?: unknown }).public_only
    return flag === true || flag === 1 || flag === '1'
  }
  return false
}
