/**
 * Quick 261117-ubb -- the sidecar half of the pinned `libsteam_api.dylib` hand-off. Asks the Rust
 * shell (`steam_api_pin_resolve`) for the path of the pinned, Valve-signed dylib the macOS bridge
 * helper should load, bounded so a slow first-time fetch can never hold a launch.
 *
 * Contract:
 * - macOS only. Anywhere else the resolver answers `null` without calling Rust.
 * - Creating the resolver issues nothing (sidecar exit contract: no in-flight work at boot). The
 *   first rustInvoke happens on the first bridge launch.
 * - A launch waits at most {@link STEAM_API_PIN_WAIT_MS}. A slower fetch finishes in the shell's
 *   worker thread and is cached for the next launch; this launch goes UNPINNED (`null`) and the
 *   helper falls back to the Steam client's own copy.
 * - The reply is parsed strictly. A path is accepted only for cached/snapshot/fetched, and only
 *   when it is absolute and names `libsteam_api.dylib`. The helper re-validates the file by
 *   content regardless, so this parse is the first of two independent checks.
 */
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAM_API_PIN_RESOLVE } from 'common/types/sidecarTransport'

/**
 * The longest a bridge launch waits for the pin to resolve. UNMEASURED: spike 089 recorded no fetch
 * duration, so the live gate records `elapsedMs` of the first cold fetch. A cache hit returns in
 * milliseconds.
 */
const STEAM_API_PIN_WAIT_MS = 10_000

export interface SteamApiPinDeps {
  requestRustInvoke: RustInvokeDeps['requestRustInvoke']
  isMac: boolean
  /** Overrides {@link STEAM_API_PIN_WAIT_MS} (tests). */
  waitMs?: number
  /** Defaults to the app logger under `LogPrefix.Steam`; a test injects its own sink. */
  log?: { info(message: string): void; warn(message: string): void }
}

type PinReply =
  | { pinned: true; source: string; path: string }
  | { pinned: false; detail: string }

/** The Rust sources that carry a usable path; `unpinned` and `unsupported` never do. */
const isPinnedSource = (source: string): boolean =>
  source === 'cached' || source === 'snapshot' || source === 'fetched'
const DYLIB_SUFFIX = '/libsteam_api.dylib'

function parseReply(reply: unknown): PinReply {
  if (typeof reply !== 'object' || reply === null) {
    return { pinned: false, detail: 'malformed reply' }
  }
  const { source, path, detail } = reply as Record<string, unknown>
  if (typeof source !== 'string' || !isPinnedSource(source)) {
    return {
      pinned: false,
      detail:
        typeof detail === 'string' && detail !== ''
          ? detail
          : `source=${typeof source === 'string' ? source : 'unknown'}`
    }
  }
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    !path.endsWith(DYLIB_SUFFIX) ||
    /[\0\n\r]/.test(path)
  ) {
    return { pinned: false, detail: 'rejected path in reply' }
  }
  return { pinned: true, source, path }
}

/**
 * Builds the resolver the bridge-helper registry hands to `ensureBridgeHelperReady`. One in-flight
 * request is shared by concurrent callers and by a launch that follows a timed-out one.
 */
export function createSteamApiPinResolver(
  deps: SteamApiPinDeps
): () => Promise<string | null> {
  const waitMs = deps.waitMs ?? STEAM_API_PIN_WAIT_MS
  const log = deps.log ?? {
    info: (message: string) => logInfo(message, LogPrefix.Steam),
    warn: (message: string) => logWarning(message, LogPrefix.Steam)
  }
  let inFlight: Promise<PinReply> | null = null

  return async () => {
    if (!deps.isMac) return null

    const startedAt = Date.now()
    if (!inFlight) {
      // Both arms are attached here, so a rejection arriving after the wait expired is handled.
      const request: Promise<PinReply> = deps
        .requestRustInvoke(RUST_STEAM_API_PIN_RESOLVE, [])
        .then(parseReply, (error: unknown) => ({
          pinned: false as const,
          detail: `resolve failed: ${error instanceof Error ? error.message : String(error)}`
        }))
      inFlight = request
      void request.then(() => {
        if (inFlight === request) inFlight = null
      })
    }
    const request = inFlight

    let timer: NodeJS.Timeout | undefined
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), waitMs)
      // Sidecar exit contract: this timer never holds the event loop open.
      timer.unref()
    })

    let outcome: PinReply | 'timeout'
    try {
      outcome = await Promise.race([request, timedOut])
    } finally {
      clearTimeout(timer)
    }

    if (outcome === 'timeout') {
      log.warn(
        `steam api pin: UNPINNED (still resolving after ${waitMs}ms) -- this launch uses the Steam client's copy; the shell keeps fetching and caches it for the next launch`
      )
      void request.then((late) =>
        log.info(
          late.pinned
            ? `steam api pin: finished after the wait: source=${late.source}; the next launch is pinned`
            : `steam api pin: finished after the wait, still UNPINNED (${late.detail})`
        )
      )
      return null
    }
    if (outcome.pinned) {
      log.info(
        `steam api pin: source=${outcome.source} path=${outcome.path} elapsedMs=${Date.now() - startedAt}`
      )
      return outcome.path
    }
    log.warn(
      `steam api pin: UNPINNED (${outcome.detail}) -- the bridge helper will load the Steam client's own libsteam_api.dylib`
    )
    return null
  }
}
