import {
  RUST_LAUNCH_ASK_FORCE_UNINSTALL,
  RUST_LAUNCH_RUNNER_ABORT,
  RUST_LAUNCH_RUNNER_CALL,
  RUST_LAUNCH_GAMES_RUNNING,
  RUST_LAUNCH_RUNNER_KILL,
  RUST_LAUNCH_SCRIPT_RUN,
  RUST_LAUNCH_SPAWN_ASYNC,
  RUST_LAUNCH_TRACKED_KILL,
  RUST_LAUNCH_TRACKED_KILL_ALL,
  RUST_LAUNCH_WINE_COMMAND,
  RUST_LAUNCH_WINE_PATH
} from 'common/types/sidecarTransport'
import type { RustInvokeArgsOf } from 'common/types/ipc/rustInvoke'
import {
  LAUNCH_MANAGER_OPS,
  sidecarInternalInvokeArgs,
  sidecarInternalSendArgs
} from 'common/types/ipc/sidecarInternal'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { IpcRegistry } from 'backend/sidecar/ipcRegistry'
import type { RunnerStreams } from 'backend/runnerStream'
import type { StoreManagers } from 'backend/services/types'
import { resolveTitleForGame } from 'backend/utils/gameTitle'

/**
 * The runner command transport (Phase 88.2, 88.2-15, D-02, D-19): `callRunner`'s helper path lives in Rust
 * (`gamelib-launch`), and these shims are the TypeScript end of it. Each body is one returned typed call (D-06); the
 * schedule in `engineWineShimSchedule.test.ts` pins that and the phase that deletes each one.
 *
 * A call that watches its output (`observe: true`) names a stream (`streamId`, opened in the table of
 * `backend/runnerStream.ts`) and the shell sends the output as `runnerOutput` frames and the spawn as a `runnerSpawned`
 * frame on the sidecar's stdin, ahead of the call's reply; {@link registerRunnerOutputListener} validates each and hands
 * it to the table. The adapter over these shims is wired at boot (88.2-16, 88.2-21) and the TS command runner is deleted (88.2-24).
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
 * Ends the run of the call that watches `streamId` (the id the caller opened in the stream table and sent as the call's
 * `streamId`); the spawned handle's `kill()` is this. Resolves `true` when a run answered to the id, `false` for an id no
 * run holds (a run that has already ended included), as `unknown`. The call then answers as ended. A lookup and a signal,
 * so the channel stays inside the 60 s transport bound.
 */
export async function runnerKill(
  deps: RustInvokeDeps,
  streamId: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_RUNNER_KILL, [streamId])
}

/**
 * `abortController.abort()` for a runner run: ends the run that was given `abortId` as its `abortId`. Resolves `true`
 * when a run answered to the id, `false` for an id no run holds, as `unknown`; the run then answers its call
 * `{ abort: true }`. A lookup and a signal, so the channel stays inside the 60 s transport bound.
 */
export async function runnerAbort(
  deps: RustInvokeDeps,
  abortId: string
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_RUNNER_ABORT, [abortId])
}

/** One wine command, as the `launch_wine_command` zod schema takes it. */
export type WineCommandRequest = RustInvokeArgsOf<
  typeof RUST_LAUNCH_WINE_COMMAND
>[0]

/**
 * Runs one wine command for a game or an installer (88.2-17, D-02): the launch variant of `runWineCommand`, which Rust
 * runs through the wine command core (the prefix check, the wine check, the merged environment, umu, the proton verb, the
 * wrappers and the argv) and answers `{ stdout, stderr, code? }` as `unknown`: the last 50 chunks of each stream joined, the
 * exit code (`null` for a spawn that failed or a child a signal ended) and no code at all when nothing ran (an invalid wine).
 * A call that watches its output (`observe: true`, a `streamId` from the stream table) is sent the chunks and the spawn as
 * frames ahead of the reply, as {@link runnerCall} is. A wine command runs as long as the game or installer it hosts, so the
 * channel is unbounded (`UNBOUNDED_RUST_CHANNELS`); a tracked kill and the app shutdown end it. Rejects with Rust's category
 * word when the call could not be made.
 */
export async function wineCommandRun(
  deps: RustInvokeDeps,
  args: WineCommandRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_WINE_COMMAND, [args])
}

/** One path translation, as the `launch_wine_path` zod schema takes it. */
export type WinePathRequest = RustInvokeArgsOf<typeof RUST_LAUNCH_WINE_PATH>[0]

/**
 * `getWinePath` (88.2-17, D-02): the path translated by `winepath` inside the game's prefix, as text (`""` when `winepath`
 * printed nothing), as `unknown`. It runs a wine command, so the channel is unbounded.
 */
export async function winePathGet(
  deps: RustInvokeDeps,
  args: WinePathRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_WINE_PATH, [args])
}

/** One launch script run, as the `launch_script_run` zod schema takes it. */
export type ScriptRunRequest = RustInvokeArgsOf<
  typeof RUST_LAUNCH_SCRIPT_RUN
>[0]

/**
 * `runScriptForGame` (88.2-17, D-02): a game's before or after launch script, run to its exit. Resolves `true` once it has
 * exited, whatever its code, as `unknown`. A script that could not be started rejects with the OS's text. A script runs as
 * long as the user wrote it to, so the channel is unbounded.
 */
export async function scriptRun(
  deps: RustInvokeDeps,
  args: ScriptRunRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_SCRIPT_RUN, [args])
}

/** One spawnAsync call, as the `launch_spawn_async` zod schema takes it. */
export type SpawnAsyncRequest = RustInvokeArgsOf<
  typeof RUST_LAUNCH_SPAWN_ASYNC
>[0]

/**
 * `spawnAsync` (88.2-17, D-02): one program run to its end, with no shell. Resolves `{ code, stdout, stderr, timedOut,
 * aborted }` as `unknown`: the last 50 chunks of each stream joined, `code` `null` for a child a signal ended, a timeout
 * answering `timedOut: true` and a kill on the `streamId` `aborted: true`, both with a `null` code. A call that watches its
 * output (`observe: true`) is sent `runnerOutput` frames ahead of the reply. A program that could not be started rejects with
 * the OS's text. A caller runs installers and archive moves for hours, so the channel is unbounded.
 */
export async function spawnAsyncRun(
  deps: RustInvokeDeps,
  args: SpawnAsyncRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_SPAWN_ASYNC, [args])
}

/** The `killTracked` filter, as the `launch_tracked_kill` zod schema takes it. */
export type TrackedKillFilter = RustInvokeArgsOf<
  typeof RUST_LAUNCH_TRACKED_KILL
>[0]

/**
 * `killTracked` (88.2-17, D-07): ends the registered runs the filter names (no field every run, `runner` alone every run of
 * that runner, both one run) and resolves how many it ended, as `unknown`. A lookup and a signal bounded by the child grace, so
 * the channel stays inside the 60 s transport bound.
 */
export async function trackedKill(
  deps: RustInvokeDeps,
  filter: TrackedKillFilter
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_TRACKED_KILL, [filter])
}

/**
 * `killAllTracked` (88.2-17, D-07): ends every registered run, games through their own handles and helpers through their
 * tokens, and resolves how many it ended, as `unknown`. It waits up to the exit budget's child grace, so it is bounded.
 */
export async function trackedKillAll(deps: RustInvokeDeps): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_TRACKED_KILL_ALL, [])
}

/**
 * Whether a game run is registered in Rust (88.2-17, D-07), the answer the quit check reads, as `unknown` (a boolean). A
 * registry read, so it stays bounded.
 */
export async function gamesRunning(deps: RustInvokeDeps): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_GAMES_RUNNING, [])
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

/** One deleted-folder prompt, as the `launch_ask_force_uninstall` zod schema takes it. */
export type AskForceUninstallRequest = RustInvokeArgsOf<
  typeof RUST_LAUNCH_ASK_FORCE_UNINSTALL
>[0]

/**
 * `askForceUninstall` (88.2-20, D-26): asks whether to remove a game whose folder is gone from the installed list, in Rust,
 * and on Yes removes it through the manager hook (`registerLaunchManagerHooks` below answers the title and the removal).
 * Resolves the index of the button the user clicked (`0` No, `1` Yes) or `null` for a dismissal, which is answered like No, as
 * `unknown`. It waits on the user, so the channel is unbounded (`UNBOUNDED_RUST_CHANNELS`). Rejects with Rust's category
 * word when the call could not be made.
 */
export async function askForceUninstall(
  deps: RustInvokeDeps,
  args: AskForceUninstallRequest
): Promise<unknown> {
  return deps.requestRustInvoke(RUST_LAUNCH_ASK_FORCE_UNINSTALL, [args])
}

/**
 * Why a `launchManagerCall` was refused. The only thing the message may name is an op the call carried, cut to 32 characters
 * with anything outside `[A-Za-z0-9_-]` shown as `?`; the runner and the app name (the payload) are never in it, whatever was
 * wrong with them, because a forged call's text can carry a path or a token.
 */
function managerCallRefusal(args: unknown[]): string {
  const [op] = args
  if (
    typeof op !== 'string' ||
    !(LAUNCH_MANAGER_OPS as readonly string[]).includes(op)
  ) {
    const named =
      typeof op === 'string'
        ? ` '${op.slice(0, 32).replace(/[^A-Za-z0-9_-]/g, '?')}'`
        : ''
    return `launchManagerCall: unknown op${named}`
  }
  return `launchManagerCall: bad arguments for ${op}`
}

/**
 * Answers the shell's `launchManagerCall` (88.2-18, 88.2-20, D-26): the Rust launch crate's ManagerHooks, called as `[op,
 * { runner, appName }]`.
 *
 * - `game_title` resolves the title the dialog shows, the manager's title with the app name as its fallback
 *   (`resolveTitleForGame`), as text.
 * - `force_uninstall` awaits the manager's `forceUninstall()` for the game and resolves `true` once it is done.
 *
 * The frame is validated by the sidecar's boundary and again here, so a forged call is refused before any manager is
 * touched. A refusal never carries the runner or the app name. A manager that throws rejects the call, which the shell maps
 * to its own fixed hook failure. One call at boot (88.2-21); it creates no timer or handle.
 */
export function registerLaunchManagerHooks(
  ipc: Pick<IpcRegistry, 'handle'>,
  deps: { libraryManagers: StoreManagers['library'] }
): void {
  ipc.handle(
    'launchManagerCall',
    async (_event: unknown, ...args: unknown[]) => {
      const parsed = sidecarInternalInvokeArgs.launchManagerCall.safeParse(args)
      if (!parsed.success) throw new Error(managerCallRefusal(args))
      const [op, { runner, appName }] = parsed.data
      const game = deps.libraryManagers[runner].getGame(appName)
      if (op === 'game_title') return resolveTitleForGame(game, appName)
      await game.forceUninstall()
      return true
    }
  )
}
