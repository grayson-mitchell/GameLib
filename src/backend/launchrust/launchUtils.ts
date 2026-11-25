import { RUST_LAUNCH_EPIC_SERVICE_OFFLINE } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The `utils.ts` launch rows live in Rust (Phase 88.1, `gamelib-launch`): the Epic status check (`isEpicServiceOffline`)
 * and the wine self-heal before a launch or a setup (`checkWineBeforeLaunch`, D-28). The callers reach them through
 * these shims (the Epic callers directly, the wine check through the adapter in `launchAdapters.ts`); each body is one
 * returned typed call (D-06), which `engineWineShimSchedule.test.ts` pins together with the phase that deletes it.
 *
 * There is no TypeScript fallback (D-19): a rejected call (an argument the crate refused, the shell not ready, a lost
 * reply) fails the caller that asked.
 */

/** The Epic services the status page tells apart. */
export type EpicService = 'Epic Games Store' | 'Fortnite' | 'Rocket League'

/**
 * Whether the Epic status page says `service` (the Epic Games Store when absent) is down. Rust answers `true` when the
 * app is not online (the engine's online flag, which the TS online monitor feeds through `setEngineOnline`), shows the
 * offline notification itself and logs the failures. Resolves a boolean as `unknown`, the transport being untyped. Rejects with Rust's category word when the call could not be made.
 */
export async function isEpicServiceOffline(
  deps: RustInvokeDeps,
  service?: EpicService
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_EPIC_SERVICE_OFFLINE, [service])
}
