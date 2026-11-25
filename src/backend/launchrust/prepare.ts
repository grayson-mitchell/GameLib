import { RUST_LAUNCH_PREPARE } from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The launch prepare steps live in Rust (Phase 88.1, `gamelib-launch`): the offline decision, the settings and system
 * information log, the Linux wrappers and the umu runtime of `prepareLaunch` (D-01). The Launcher's `prepareLaunch` member reaches it through the
 * adapter in `launchAdapters.ts`, which gather the facts only the TypeScript has and replay the returned log lines
 * into the caller's `LogWriter`; this file holds the call. Each body is one returned typed call (D-06); the
 * schedule in `engineWineShimSchedule.test.ts` pins that and the phase that deletes each one.
 *
 * Each answer is `unknown`, because the transport is untyped; `launchAdapters.ts` narrows it before a manager sees
 * it. There is no TypeScript fallback (D-19): a rejected call (an argument the crate refused, the shell not ready, a
 * lost reply) fails the launch that asked.
 */

/** The facts of one prepare step, as the `launch_prepare` zod schema takes them. */
export type PrepareLaunchArgs = RustInvokeArgsOf<typeof RUST_LAUNCH_PREPARE>[0]

/**
 * The prepare step of a launch: the offline decision (the Epic status check and the expired-store rule included),
 * the per-game log lines, the Linux MangoHud, GameMode and Gamescope commands and the umu runtime download. Resolves
 * `{ success, failureReason?, mangoHudCommand?, gameModeBin?, gameScopeCommand?, offlineMode?, log }` as `unknown`,
 * where `log` is the lines as `{ level, parts }` for the caller's `LogWriter` to write. A game with no `umu-run`
 * online may download the runtime, which can pass the 60 s transport bound, so the channel is unbounded
 * (`UNBOUNDED_RUST_CHANNELS`). Rejects with Rust's category word when the call could not be made.
 */
export async function prepareLaunch(
  deps: RustInvokeDeps,
  args: PrepareLaunchArgs
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_PREPARE, [args])
}
