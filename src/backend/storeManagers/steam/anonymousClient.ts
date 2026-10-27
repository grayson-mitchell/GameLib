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
 * Sidecar exit contract: every timer here is `.unref?.()`'d, the connect is
 * bounded, and the client closes itself when idle, so nothing in this module
 * can hold the event loop open at stdin EOF. "Idle" counts in-flight reads
 * (54-REVIEW WR-09): the close timer is armed only once none is running, so a
 * bulk PICS read longer than ANON_IDLE_CLOSE_MS is never cut off mid-request.
 */
import SteamUserLib from 'steam-user'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'

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

type RawClient = InstanceType<typeof SteamUserLib>

let cached: RawClient | null = null
// What callers receive for `cached`: a view whose getProductInfo counts reads
// in flight, so the idle close waits for them (54-REVIEW WR-09).
let cachedView: AnonymousPicsClient | null = null
let inUse = 0
let inflight: Promise<AnonymousPicsClient | null> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let shuttingDown = false
// Bumped by closeAnonymousClient so a connect that was in flight when the
// client was closed discards its result instead of resurrecting the cache.
let generation = 0

function clearIdle(): void {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = null
}

function armIdle(): void {
  clearIdle()
  if (inUse > 0) return
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (inUse > 0) return
    closeAnonymousClient('idle')
  }, ANON_IDLE_CLOSE_MS)
  idleTimer.unref?.()
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
  const client = new SteamUserLib({
    enablePicsCache: false,
    autoRelogin: false
  })

  return new Promise<AnonymousPicsClient | null>((resolve) => {
    let settled = false
    const settle = (value: AnonymousPicsClient | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(value)
    }

    const timeout = setTimeout(() => {
      logWarning(
        '[Steam] anonymous CM logon timed out after 15s',
        LogPrefix.Steam
      )
      safeLogOff(client)
      settle(null)
    }, ANON_CONNECT_TIMEOUT_MS)
    timeout.unref?.()

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

    logInfo('[Steam] CM logon mode=anonymous reason=' + reason, LogPrefix.Steam)
    client.logOn({ anonymous: true })
  })
}

export async function getAnonymousPicsClient(
  reason: string
): Promise<AnonymousPicsClient | null> {
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

export function closeAnonymousClient(
  cause: 'idle' | 'logout' | 'shutdown'
): void {
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

export function releaseAnonymousForShutdown(): void {
  shuttingDown = true
  closeAnonymousClient('shutdown')
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

// ts-prune-ignore-next
export function __resetAnonymousClientForTests(): void {
  clearIdle()
  cached = null
  cachedView = null
  inUse = 0
  inflight = null
  shuttingDown = false
  generation++
}
