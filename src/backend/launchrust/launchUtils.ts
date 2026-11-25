import {
  RUST_LAUNCH_CHECK_WINE_BEFORE_LAUNCH,
  RUST_LAUNCH_EPIC_SERVICE_OFFLINE
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
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

/** The facts of one wine check, as the `launch_check_wine_before_launch` zod schema takes them. */
export type CheckWineBeforeLaunchArgs = RustInvokeArgsOf<
  typeof RUST_LAUNCH_CHECK_WINE_BEFORE_LAUNCH
>[0]

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

/**
 * The wine self-heal before a launch or a setup: the wine validity check, the default and alternative wines, the dialog
 * that asks to switch, and the default wine download. Resolves
 * `{ ok, wineVersion?, persistGameWine, globalWineVersion?, log }` as `unknown`, where the writes are data the adapter in
 * `launchAdapters.ts` applies (Rust writes no config). A human answers a dialog and a default wine may download, so the
 * channel is unbounded (`UNBOUNDED_RUST_CHANNELS`). Rejects with Rust's category word when the call could not be made.
 */
export async function checkWineBeforeLaunchRust(
  deps: RustInvokeDeps,
  args: CheckWineBeforeLaunchArgs
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_CHECK_WINE_BEFORE_LAUNCH, [args])
}
