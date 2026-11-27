import {
  RUST_LAUNCH_READOPTED_ANNOUNCE,
  RUST_LAUNCH_RUN
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The launch funnel transport (Phase 88.3, 88.3-10, D-01, D-04, D-25): one Play of a non-Steam game runs in Rust
 * (`gamelib-launch`'s `run_launch`), and this shim is the TypeScript end of it. The body is one returned typed call (D-06);
 * the schedule in `engineWineShimSchedule.test.ts` pins that and the phase that deletes it.
 *
 * The call lasts as long as the play session, so the channel is unbounded (`UNBOUNDED_RUST_CHANNELS`). There is no
 * TypeScript fallback and no flag that selects the funnel (D-18): a rejected call (an argument the crate refused, the shell
 * not ready, a lost reply) fails the caller that asked, which logs `launch failed`.
 */

/**
 * One Play, as the `launch_run` zod schema takes it: `LaunchParams` with the chosen launch option as a plain object (the
 * crate never reads it by key). The Launcher builds it from a `LaunchParams` (an interface is not a record in the type system).
 */
export type LaunchRunRequest = RustInvokeArgsOf<typeof RUST_LAUNCH_RUN>[0]

/**
 * Runs one Play to its end in the Rust funnel. Resolves the `{ status }` the funnel ended with, as `unknown` (the transport
 * is untyped); `settleLaunchStatus` (`launchBuilderReply.ts`) narrows it. Rejects with Rust's category word when the call could not be made.
 */
export async function launchRun(
  deps: RustInvokeDeps,
  params: LaunchRunRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_RUN, [params])
}

/**
 * Tells the renderer about the games the shell re-adopted at boot (Phase 88.3, 88.3-12, D-19, Pitfall 9): a game that
 * outlived a GameLib crash is found by the shell's boot scan, but nothing listens for its status until the renderer's
 * `frontendReady`. The sidecar's `frontendReady` handler calls this on every delivery, so a reopened GameLib shows the game
 * as Playing once the renderer listens, and the shell announces a game adopted after that at once. Resolves the number of
 * games Rust announced, as `unknown`. A quick registry read: the channel stays inside the 60 s bound. Rejects with Rust's
 * category word when the call could not be made (the caller logs one fixed warning and carries on).
 */
export async function announceReadoptedGames(
  deps: RustInvokeDeps
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_READOPTED_ANNOUNCE, [])
}
