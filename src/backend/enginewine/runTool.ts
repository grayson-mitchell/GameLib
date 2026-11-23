import type { RunnerTool } from 'common/types/engine'
import {
  RUST_ENGINE_CANCEL,
  RUST_ENGINE_RUN_TOOL
} from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

/**
 * The Steam bridge's tool runs live in Rust (Phase 87, `gamelib-engine` `crossover::run_tool`): one of five allowlisted
 * absolute-path programs (`cp`, `xattr`, `codesign`, `plutil`, `ps`), run with the isolated profile (the two-profile rule's
 * isolated half), empty stdin and a 1 MiB output cap. The bridge's DRM and overlay runner files keep their `RunTool` call
 * signature `(tool, args, {timeoutMs, signal})`; an `AbortSignal` cannot cross `rustInvoke` (Pitfall 10), so each run is
 * named with a cancel id and an abort sends `engine_cancel` for it. Both halves of that live in
 * `storeManagers/steam/engine/rustRunTool.ts`, which builds the `RunTool` over the two shims here until Phase 97 moves the
 * bridge's runner setup into Rust. Each body is one returned typed call (D-06). The shim schedule in
 * `engineWineShimSchedule.test.ts` pins the shape and the phase that deletes each shim.
 */

/** One tool run: the program (checked against the allowlist in Rust), its arguments and the limits. */
export interface RunToolRequest {
  tool: RunnerTool
  args: readonly string[]
  /** The run's own time limit; Rust caps it at the spawn ceiling. */
  timeoutMs: number
  /** Names the run for {@link cancelRunTool}: 1 to 64 of `[A-Za-z0-9_-]`. */
  cancelId?: string
}

/**
 * Runs one allowlisted tool. Resolves the `RunToolResult` `{code, stdout, stderr, timedOut, aborted}` as an unknown (the
 * caller narrows it); a program outside the list is an answer (`stderr: "tool not allowed: ..."`), not a spawn. Rejects
 * with Rust's category word for an argument the crate refused (an unclean cancel id, an unknown field).
 */
export async function rustRunTool(
  deps: RustInvokeDeps,
  request: RunToolRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_RUN_TOOL, [request])
}

/** Cancels the run that registered `cancelId`. Resolves `true` when one was in flight, `false` when none was. */
export async function cancelRunTool(
  deps: RustInvokeDeps,
  cancelId: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_ENGINE_CANCEL, [{ cancelId }])
}
