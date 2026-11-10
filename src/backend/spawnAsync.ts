/**
 * `spawnAsync` as a thin caller of `ProcessRunner.run` (Phase 66.1, MH-5 / D-11).
 *
 * Same signature and result shape as the legacy `utils.spawnAsync`: it resolves
 * `{ code, stdout, stderr }` where stdout/stderr are the last 50 chunks joined, rejects on a
 * spawn error, and has NO timeout of its own because callers run installers, archive moves and
 * cxbottle for hours. A caller that wants a cap passes `timeout` (milliseconds, the child_process
 * contract: the child is killed and `code` is null); `signal` aborts the same way.
 *
 * Value imports are limited to `node:*` so this module never joins the utils import cycle.
 */
import type { ProcessRunner } from './process/types'

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
) => Promise<{ code: number | null; stdout: string; stderr: string }>

const ALLOWED_KEYS: readonly string[] = [
  'cwd',
  'env',
  'timeout',
  'signal',
  'windowsHide'
]

// Local copy of utils.memoryLog (last `limit` chunks); kept here so this module stays narrow.
const lastChunks = (limit = 50) => {
  const lines: string[] = []
  return {
    push: (chunk: string) => {
      lines.unshift(chunk)
      if (lines.length > limit) lines.length = limit
    },
    join: () => lines.toReversed().join('')
  }
}

export function createSpawnAsync(deps: { runner: ProcessRunner }): SpawnAsync {
  return async (command, args, options = {}, onOutput) => {
    for (const key of Object.keys(options)) {
      if (!ALLOWED_KEYS.includes(key)) {
        throw new TypeError(
          `spawnAsync: unsupported option "${key}" (allowed: ${ALLOWED_KEYS.join(', ')})`
        )
      }
    }
    const stdout = lastChunks()
    const stderr = lastChunks()
    const capped =
      typeof options.timeout === 'number' &&
      Number.isFinite(options.timeout) &&
      options.timeout > 0

    const result = await deps.runner.run(command, args, {
      cwd: options.cwd,
      env: options.env,
      replaceEnv: options.env !== undefined,
      ...(capped
        ? { timeoutMs: options.timeout }
        : {
            timeout: {
              none: true as const,
              reason:
                'spawnAsync callers (installers, archive moves, cxbottle, ps) run unbounded; callers own cancellation'
            }
          }),
      signal: options.signal,
      windowsHide: options.windowsHide ?? false,
      onStdout: (chunk) => {
        onOutput?.(chunk)
        stdout.push(chunk)
      },
      onStderr: (chunk) => {
        onOutput?.(chunk)
        stderr.push(chunk)
      }
    })
    return { code: result.code, stdout: stdout.join(), stderr: stderr.join() }
  }
}
