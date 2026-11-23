import type { Runner } from 'common/types'
import { RUST_ENGINE_FALLBACK_ENSURE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The first-need download of the pinned fallback engine lives in Rust (Phase 87, `gamelib-engine` `fallback`): one flight
 * per pin id, the archive fetched, verified against the pin's size and sha256 and extracted under the tools path, with the
 * `gameStatusUpdate` `engine-download` sequence Rust sends itself. The shim here is the only TS path to it; the Steam
 * callers reach it through `storeManagers/steam/engine/pinnedEngine.ts`, which keeps the abort signal and the log lines
 * around it. The body is one returned typed call (D-06). The shim schedule in `engineWineShimSchedule.test.ts` pins the
 * shape and the phase that deletes it.
 */

/** What `engine_fallback_ensure` is asked: a pin id (never a URL or a path), the game the status events are for. */
export interface EnsureFallbackEngineRequest {
  pinId: string
  appName: string
  runner: Runner
  /** Names the run for `engine_cancel`: 1 to 64 of `[A-Za-z0-9_-]`. An `AbortSignal` cannot cross `rustInvoke`. */
  cancelId?: string
}

/**
 * Makes the pin's engine available. Resolves the `PinnedEngineResult` JSON as an unknown (the caller narrows it): a failure
 * or a cancel is an answer, `{ok: false, aborted, reason, error}`. Rejects with Rust's category word for an argument it
 * refused (an unknown pin id, an unclean cancel id).
 */
export async function ensureFallbackEngine(
  deps: RustInvokeDeps,
  request: EnsureFallbackEngineRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_FALLBACK_ENSURE, [request])
}
