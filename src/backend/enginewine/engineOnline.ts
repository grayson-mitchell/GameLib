import { RUST_ENGINE_SET_ONLINE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The online state Rust reads lives in the engine context (Phase 87, `gamelib-engine`
 * `EngineCtx.online`); the sidecar's online monitor still does the probing until Phase 98, so it writes
 * its status through here at boot and on every change. Rust-initiated network work (the DXMT boot update
 * and the DXMT fetch behind a wine install) checks the flag as the TS checked `onlineMonitor.isOnline()`.
 * The body is one typed call (D-06); the shim schedule in `engineWineShimSchedule.test.ts` pins that and the
 * phase that deletes it. The flag is a boolean and gates only Rust-initiated fetches, so a wrong value can
 * only skip or attempt one (T-87-75).
 */
export async function setEngineOnline(
  deps: RustInvokeDeps,
  online: boolean
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_SET_ONLINE, [{ online }])
}
