import { RUST_LAUNCH_WINDOW_RAISE } from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { SpawnAsync } from 'backend/spawnAsync'
import { logWarning, LogPrefix } from 'backend/logger'

/**
 * The Wine window raiser transport (Phase 88.3, 88.3-13, D-19, D-21): the raise itself (the `osascript` Helper loop of at most 12
 * attempts 1.5 s apart and one 2.5 s settle re-raise) runs in Rust (`gamelib-launch`'s `raise_wine_window`), and this is the
 * TypeScript end of it for the callers that stay until their bottle lifecycle moves: the Steam bottle monitor, the bottled-Steam
 * launch and the common launch (Phase 96). The body of {@link raiseWineWindow} is one returned typed call (D-06); the schedule in
 * `engineWineShimSchedule.test.ts` pins that and the phase that deletes it.
 *
 * The call answers when the raise is over, about 21 s at most, inside the 60 s `rustInvoke` bound.
 */

/** One raise, as the `launch_window_raise` zod schema takes it: the pids and names are filtered in Rust (the all-digit pids, the non-empty names). */
export type WindowRaiseRequest = RustInvokeArgsOf<
  typeof RUST_LAUNCH_WINDOW_RAISE
>[0]

/**
 * Runs one raise to its end in Rust. Resolves `null`, as `unknown` (the transport is untyped). Rejects with Rust's category word when
 * the call could not be made (the shell not ready, an argument the crate refused, a lost reply).
 */
export async function raiseWineWindow(
  deps: RustInvokeDeps,
  args: WindowRaiseRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_WINDOW_RAISE, [args])
}

/** What the callers' deps hand `raise`: kept for the call shape the callers already use; the Rust raise spawns for itself and reads none of it. */
export interface WindowRaiseDeps {
  spawnAsync: SpawnAsync
}

/**
 * The window raiser the boot's 'abort-registry' step builds and the bottle monitor, the bottled-Steam launch and the common launch call
 * (`raise(deps, opts)`). The shape is the TS raiser's: `raise` never rejects.
 */
export interface WineWindowRaiser {
  raise(
    deps: WindowRaiseDeps,
    opts: { context: string; pids?: string[]; processNames?: string[] }
  ): Promise<void>
  /**
   * Kept for the type. The Rust raise has no stop: its wait between attempts ends on the shell's shutdown token, so there is nothing for
   * the sidecar to cancel (the TS raiser's `stop()` left its call pending forever, a recorded D-20 candidate).
   */
  stop(): void
}

/**
 * The boot's window raiser over Rust. `transport` is read at call time: the host exists only after boot, as with the other shims. A rejected
 * call (the shell not ready, a lost reply, the 60 s bound) is one warning line and the raise resolves, as the TS raise never rejected.
 */
export function createRustWindowRaiser(deps: {
  transport: () => RustInvokeDeps
}): WineWindowRaiser {
  return {
    async raise(_spawnDeps, opts) {
      try {
        await raiseWineWindow(deps.transport(), {
          context: opts.context,
          pids: opts.pids,
          processNames: opts.processNames
        })
      } catch (error) {
        logWarning(
          [`raiseWineGameWindow [${opts.context}]: raise failed`, error],
          LogPrefix.Steam
        )
      }
    },
    stop() {
      // Nothing to cancel on this side.
    }
  }
}
