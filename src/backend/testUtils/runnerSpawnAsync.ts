import type { SpawnAsync } from 'backend/spawnAsync'
import type { ProcessRunner } from 'backend/process/types'

/**
 * A `SpawnAsync` over a TypeScript `ProcessRunner`, for tests that run a real child or replay a recorded trace in-process.
 * Production's `createSpawnAsync` became an adapter over the Rust shim in 88.2-21 and needs the shell; the Phase 87 oracles
 * (`engineWineOracle/spawnTrace.ts`) and the Windows-only real-PowerShell tests keep this runner-based implementation, which
 * is the old `createSpawnAsync` unchanged in behaviour, less its option allow-list (no test passes a key outside it).
 */
export function createRunnerSpawnAsync(runner: ProcessRunner): SpawnAsync {
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
  return async (command, args, options = {}, onOutput) => {
    const stdout = lastChunks()
    const stderr = lastChunks()
    const capped =
      typeof options.timeout === 'number' &&
      Number.isFinite(options.timeout) &&
      options.timeout > 0
    const result = await runner.run(command, args, {
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
    return {
      code: result.code,
      stdout: stdout.join(),
      stderr: stderr.join(),
      timedOut: result.timedOut,
      aborted: result.aborted
    }
  }
}
