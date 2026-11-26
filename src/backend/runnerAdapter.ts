import { runnerCall } from 'backend/launchrust/runner'
import type { RunnerCallRequest } from 'backend/launchrust/runner'
import type { RunnerStreams } from 'backend/runnerStream'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RunnerProps } from 'backend/commandRunner'
import type { CallRunnerOptions, ExecResult, Runner } from 'common/types'
import type LogWriter from 'backend/logger/targetWriter'

/**
 * The commandRunner-shaped adapter over the runner transport (Phase 88.2, 88.2-16, D-02, D-19, D-30). `callRunner` keeps the
 * signature and the `ExecResult` of `createCommandRunner(...).callRunner`, and runs the command in Rust (`launch_runner_call`)
 * instead of in `ProcessRunner`. Nothing is switched over here: `commandRunner.ts` still serves every caller until the boot
 * wires this in (88.2-21).
 *
 * What the adapter does around the one invoke:
 * - appends the runner's own writer to the caller's writers, as the TypeScript did, and hands each writer to Rust through
 *   `LogWriter.handOff()` (the TS facade stays the only rotator, D-30), the runner's own last;
 * - waits for the log forwarder to flush, so the lines the TypeScript logged before the call precede the ones Rust writes;
 * - opens a stream in the table of `runnerStream.ts` when the caller watches the output or the spawn, sends its id as the
 *   call's `streamId` with `observe: true`, and closes it when the call settles (which delivers anything still held);
 * - narrows the answer, which the transport leaves `unknown`, to an `ExecResult`.
 *
 * The adapter logs nothing itself and keeps no state: a runner credential never reaches a log from here (Rust writes the
 * one redacted command line), and there is no TypeScript fallback (D-19), so a call Rust could not make rejects the caller.
 */

/** The names Rust knows a log sanitizer by (`logSanitizer` of the call). */
export type RunnerLogSanitizerName = 'gogAuth' | 'nileAuth'

/** What the adapter takes from the rest of the backend, all of it passed in at boot (88.2-21). */
export interface RunnerAdapterDeps extends RustInvokeDeps {
  /** The table `registerRunnerOutputListener` feeds, built with `createRunnerStreams({ kill })`. */
  streams: RunnerStreams
  getRunnerLogWriter(runner: Runner): LogWriter
  /** `flushLogForwarder`: resolves once every line queued so far is written; never rejects. */
  flushLogs(): Promise<void>
  /**
   * The sanitizer function each Rust sanitizer name stands for. A caller passes a function (`logSanitizer`); Rust applies a
   * named one, so the adapter finds the name by identity. A function that is none of these is refused: it would otherwise
   * reach the log unsanitized.
   */
  logSanitizers?: Partial<
    Record<RunnerLogSanitizerName, (line: string) => string>
  >
}

/** The options `callRunner` takes: the TS ones, and the spawn observer the stream carries. */
export type RunnerAdapterCallOptions = CallRunnerOptions & {
  onSpawn?: (
    child: Parameters<NonNullable<CallRunnerOptions['onOutput']>>[1]
  ) => void
}

export interface RunnerAdapter {
  callRunner(
    commandParts: string[],
    runnerProps: RunnerProps,
    options: RunnerAdapterCallOptions
  ): Promise<ExecResult>
}

/**
 * Narrows Rust's answer to an `ExecResult`: an object with a string `stdout` and `stderr`. Any other answer is an error at the
 * call, never a malformed result in a caller. The object is handed on as it came, so `fullCommand`, `error`, `abort` and
 * the rest reach the caller as Rust set them.
 */
export function settleExecResult(reply: unknown): ExecResult {
  if (
    typeof reply === 'object' &&
    reply !== null &&
    'stdout' in reply &&
    typeof reply.stdout === 'string' &&
    'stderr' in reply &&
    typeof reply.stderr === 'string'
  ) {
    return reply as ExecResult
  }
  throw new Error('callRunner: the reply was not a command result')
}

/** The caller's environment as `[key, value]` pairs in insertion order; a variable with no value is left out. */
function envPairs(env: CallRunnerOptions['env']): string[][] | undefined {
  if (!env) return undefined
  const pairs: string[][] = []
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') pairs.push([key, value])
  }
  return pairs
}

export function createRunnerAdapter(deps: RunnerAdapterDeps): RunnerAdapter {
  function sanitizerName(
    sanitizer: CallRunnerOptions['logSanitizer']
  ): RunnerLogSanitizerName | undefined {
    if (!sanitizer) return undefined
    for (const name of ['gogAuth', 'nileAuth'] as const) {
      if (deps.logSanitizers?.[name] === sanitizer) return name
    }
    throw new Error('callRunner: the log sanitizer is not one Rust knows')
  }

  async function callRunner(
    commandParts: string[],
    runnerProps: RunnerProps,
    options: RunnerAdapterCallOptions
  ): Promise<ExecResult> {
    const logSanitizer = sanitizerName(options.logSanitizer)

    // Automatically add the relevant LogWriter for the runner, as the TypeScript did.
    options.logWriters ??= []
    options.logWriters.push(deps.getRunnerLogWriter(runnerProps.name))

    const observe = !!options.onOutput || !!options.onSpawn
    const streamId = observe
      ? deps.streams.open({
          onOutput: options.onOutput,
          onSpawn: options.onSpawn
        })
      : undefined

    try {
      // The lines the TypeScript logged so far are written before Rust writes its own.
      await deps.flushLogs()

      // Claimed after the flush and sent with nothing awaited in between, so no line of a handed-off writer can slip in
      // between the claim of its rotation and the call that makes it.
      const logTargets: NonNullable<RunnerCallRequest['logTargets']> = []
      for (const writer of options.logWriters) {
        const handOff = writer.handOff()
        if (handOff) logTargets.push(handOff)
      }

      const request: RunnerCallRequest = {
        commandParts: commandParts.filter(Boolean),
        runner: {
          name: runnerProps.name,
          bin: runnerProps.bin,
          ...(runnerProps.dir !== undefined ? { dir: runnerProps.dir } : {}),
          logPrefix: runnerProps.logPrefix
        },
        logTargets
      }
      if (streamId !== undefined) {
        request.streamId = streamId
        request.observe = true
      }
      const env = envPairs(options.env)
      if (env) request.env = env
      if (options.wrappers) request.wrappers = options.wrappers
      if (options.logMessagePrefix !== undefined)
        request.logMessagePrefix = options.logMessagePrefix
      if (logSanitizer) request.logSanitizer = logSanitizer
      if (options.abortId) request.abortId = options.abortId
      if (options.trackKey !== undefined) request.trackKey = options.trackKey
      if (options.cwd !== undefined) request.cwd = options.cwd
      if (options.skipErrorHandler) request.skipErrorHandler = true

      return settleExecResult(await runnerCall(deps, request))
    } finally {
      if (streamId !== undefined) deps.streams.close(streamId)
    }
  }

  return { callRunner }
}
