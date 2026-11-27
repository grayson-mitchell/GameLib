/**
 * `spawnAsync` as an adapter over the `spawnAsyncRun` shim (Phase 88.2, 88.2-21, D-02, D-30). It keeps the signature and the
 * result of the legacy `utils.spawnAsync` and runs the child in Rust (`launch_spawn_async`, Helper class) instead of in
 * `ProcessRunner`. It is an interim adapter over a scheduled shim (`spawnAsyncRun`, deletedBy 98): the 29 importers keep this
 * entry until they call the shim themselves.
 *
 * Same contract as before: it resolves `{ code, stdout, stderr, timedOut, aborted }` where stdout/stderr are the last 50 chunks
 * joined (Rust keeps them), rejects on a spawn error, and has NO timeout of its own because callers run installers, archive
 * moves and cxbottle for hours. A caller that wants a cap passes `timeout` (milliseconds); `signal` aborts.
 *
 * - option allow-list: an option no production caller passes is a `TypeError` here, before anything is sent;
 * - `env` is the whole environment of the child (Rust's replace-env); absent, the child inherits the shell's environment;
 * - `timeout` passes through (a `NaN` or `Infinity` travels as `null`, which the schema takes and Rust reads as no timeout);
 *   the timeout kills the child with SIGKILL and resolves `code: null`, `timedOut: true`;
 * - `signal`: an abort sends `runnerKill(streamId)` and resolves (never rejects with an AbortError) `code: null`,
 *   `aborted: true`. A signal that is already aborted resolves so without starting a child (a helper-class `spawnAsync`
 *   reports no spawned frame to kill after, and a kill sent right behind the call could reach Rust before the run is
 *   registered);
 * - `onOutput` is called with every chunk of both streams, in order, from the frames the shell sends ahead of the reply.
 *
 * Value imports are limited to the shim module and `node:*`, so this module never joins the utils import cycle.
 */
import { runnerKill, spawnAsyncRun } from './launchrust/runner'
import type { SpawnAsyncRequest } from './launchrust/runner'
import type { RustInvokeDeps } from './host/rustInvokeDeps'
import type { RunnerStreams } from './runnerStream'

/** The only SpawnOptions keys any production caller passes (enumerated in the 66.1-06 SUMMARY). */
interface SpawnAsyncOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  /** child_process semantics: milliseconds; 0/undefined means no cap. */
  timeout?: number
  signal?: AbortSignal
  windowsHide?: boolean
}

export type SpawnAsync = (
  command: string,
  args: string[],
  options?: SpawnAsyncOptions,
  onOutput?: (data: string) => void
) => Promise<{
  code: number | null
  stdout: string
  stderr: string
  /** Always set by the real implementation; optional so fakes need not supply it. The `timeout` elapsed and the runner killed the child with SIGKILL. */
  timedOut?: boolean
  /** The `signal` aborted the run. */
  aborted?: boolean
}>

const ALLOWED_KEYS: readonly string[] = [
  'cwd',
  'env',
  'timeout',
  'signal',
  'windowsHide'
]

/**
 * An abort that reaches Rust before the run is registered gets "no such run" back, so it is asked again until the call
 * settles: the transport has no order guarantee between the call and the kill (the shell serves each call on its own
 * worker, sidecar.rs), and an installer can run for hours, so no fixed number of retries is safe. The delay starts at
 * `KILL_RETRY_MS` and doubles up to `KILL_RETRY_MAX_MS`. It is bounded by the call's own life: the retry timer is unref'd
 * and cleared when the call settles, so it leaves nothing in flight (the sidecar exit contract).
 */
const KILL_RETRY_MS = 25
const KILL_RETRY_MAX_MS = 500

/** What the adapter takes: the boot's transport and the stream table the shell's output frames are fed into. */
export interface SpawnAsyncDeps extends RustInvokeDeps {
  streams: RunnerStreams
}

/** The environment as a string map; a variable with no value is left out (a child never sees `undefined`). */
function envRecord(env: NodeJS.ProcessEnv): Record<string, string> {
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') record[key] = value
  }
  return record
}

/** Narrows Rust's answer to the result: an answer of any other shape is an error at the call, never a malformed result. */
function settleResult(reply: unknown): Awaited<ReturnType<SpawnAsync>> {
  if (
    typeof reply === 'object' &&
    reply !== null &&
    'stdout' in reply &&
    typeof reply.stdout === 'string' &&
    'stderr' in reply &&
    typeof reply.stderr === 'string' &&
    'code' in reply &&
    (reply.code === null || typeof reply.code === 'number')
  ) {
    return {
      code: reply.code,
      stdout: reply.stdout,
      stderr: reply.stderr,
      timedOut: 'timedOut' in reply && reply.timedOut === true,
      aborted: 'aborted' in reply && reply.aborted === true
    }
  }
  throw new Error('spawnAsync: the reply was not a command result')
}

export function createSpawnAsync(deps: SpawnAsyncDeps): SpawnAsync {
  return async (command, args, options = {}, onOutput) => {
    for (const key of Object.keys(options)) {
      if (!ALLOWED_KEYS.includes(key)) {
        throw new TypeError(
          `spawnAsync: unsupported option "${key}" (allowed: ${ALLOWED_KEYS.join(', ')})`
        )
      }
    }
    const { signal } = options
    if (signal?.aborted) {
      return {
        code: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: true
      }
    }

    // A stream is opened to hear the output, and to name the run a kill ends (an abort).
    const streamId =
      onOutput || signal
        ? deps.streams.open(
            onOutput ? { onOutput: (chunk) => onOutput(chunk) } : {}
          )
        : undefined

    const request: SpawnAsyncRequest = { command, args: [...args] }
    if (streamId !== undefined) request.streamId = streamId
    if (onOutput) request.observe = true
    if (options.cwd !== undefined) request.cwd = options.cwd
    if (options.env !== undefined) request.env = envRecord(options.env)
    if (typeof options.timeout === 'number') {
      request.timeoutMs = Number.isFinite(options.timeout)
        ? options.timeout
        : null
    }
    if (options.windowsHide !== undefined)
      request.windowsHide = options.windowsHide

    let settled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const kill = (delayMs: number): void => {
      if (settled || streamId === undefined) return
      // Anything but a `true` answer, and a rejected kill alike, asks again after the delay unless the call has settled.
      const again = () => {
        if (settled) return
        retryTimer = setTimeout(
          () => kill(Math.min(delayMs * 2, KILL_RETRY_MAX_MS)),
          delayMs
        )
        retryTimer.unref()
      }
      void runnerKill(deps, streamId).then((ended) => {
        if (ended !== true) again()
      }, again)
    }
    const onAbort = () => kill(KILL_RETRY_MS)
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      return settleResult(await spawnAsyncRun(deps, request))
    } catch (error) {
      // A spawn error rejects with Rust's text, as the child's `error` event did: always an Error.
      throw error instanceof Error ? error : new Error(String(error))
    } finally {
      settled = true
      if (retryTimer) clearTimeout(retryTimer)
      signal?.removeEventListener('abort', onAbort)
      if (streamId !== undefined) deps.streams.close(streamId)
    }
  }
}
