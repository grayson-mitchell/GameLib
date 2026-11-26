import { RUST_LAUNCH_RUNNER_CALL } from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import { sidecarInternalSendArgs } from 'common/types/ipc/sidecarInternal'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { IpcRegistry } from 'backend/sidecar/ipcRegistry'
import type { RunnerStreams } from 'backend/runnerStream'

/**
 * The runner command transport (Phase 88.2, 88.2-15, D-02, D-19): `callRunner`'s helper path lives in Rust
 * (`gamelib-launch`), and these shims are the TypeScript end of it. Each body is one returned typed call (D-06); the
 * schedule in `engineWineShimSchedule.test.ts` pins that and the phase that deletes each one.
 *
 * A call that watches its output (`observe: true`) names a stream (`streamId`, opened in the table of
 * `backend/runnerStream.ts`) and the shell sends the output as `runnerOutput` frames and the spawn as a `runnerSpawned`
 * frame on the sidecar's stdin, ahead of the call's reply; {@link registerRunnerOutputListener} validates each and hands
 * it to the table. Nothing here is switched over yet: `commandRunner.ts` still serves every caller until the adapter over
 * these shims is wired (88.2-16, 88.2-21).
 *
 * The answer is `unknown`, because the transport is untyped. There is no TypeScript fallback (D-19): a rejected call (an
 * argument the crate refused, the shell not ready, a lost reply) fails the caller that asked.
 */

/** One runner call, as the `launch_runner_call` zod schema takes it. */
export type RunnerCallRequest = RustInvokeArgsOf<
  typeof RUST_LAUNCH_RUNNER_CALL
>[0]

/**
 * Runs one runner command, helper class, to its end. Resolves the `ExecResult` `{ stdout, stderr, fullCommand, error?,
 * abort? }` as `unknown`: a spawn failure, a signal or a non-zero exit is its `error`, a cancel its `abort`. A runner
 * command runs as long as the install or game it hosts, so the channel is unbounded (`UNBOUNDED_RUST_CHANNELS`); the abort
 * id, a kill on the stream id and the app shutdown end it. Rejects with Rust's category word when the call could not be
 * made.
 */
export async function runnerCall(
  deps: RustInvokeDeps,
  args: RunnerCallRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_RUNNER_CALL, [args])
}

/**
 * Wires the shell's `runnerOutput` and `runnerSpawned` frames into `streams`. Both are shell-originated (not in the
 * renderer allow-list) and are validated again here, so a malformed frame is dropped, not delivered; a frame for a stream
 * that is not open is the table's to ignore. One call at boot (88.2-21); it creates no timer or handle.
 */
export function registerRunnerOutputListener(
  ipc: Pick<IpcRegistry, 'on'>,
  streams: RunnerStreams
): void {
  ipc.on('runnerOutput', (_event: unknown, ...args: unknown[]) => {
    const parsed = sidecarInternalSendArgs.runnerOutput.safeParse(args)
    if (!parsed.success) return
    streams.output(parsed.data[0])
  })
  ipc.on('runnerSpawned', (_event: unknown, ...args: unknown[]) => {
    const parsed = sidecarInternalSendArgs.runnerSpawned.safeParse(args)
    if (!parsed.success) return
    streams.spawned(parsed.data[0])
  })
}
