import type { ChildHandle, ProcessRunner } from 'backend/process/types'

/** Runner slice the probes need: they only ever call `run`. */
export type ProbeDeps = { runner: Pick<ProcessRunner, 'run'> }

type SpawnWrapperOptions = Partial<{
  onStdout: (data: string, child: ChildHandle) => unknown
  onStderr: (data: string, child: ChildHandle) => unknown
  /** Replaces the child's environment (the pre-runner `spawn({ env })` semantics). */
  env: Record<string, string | undefined>
  /** Kill the child after this many ms. Default {@link DEFAULT_TIMEOUT_MS}. */
  timeoutMs: number
}>

/** Upper bound for a system probe (lspci/powershell/df/free); a hung probe must not live forever. */
const DEFAULT_TIMEOUT_MS = 30_000

interface SpawnWrapperReturn {
  stdout: string
  stderr: string
  exitCode: number | null
  signalName: string | null
}

/**
 * Runs a probe command through the process runner. Rejects only on spawn error (ENOENT);
 * a timeout kills the child (SIGKILL) and resolves with whatever was captured.
 */
async function genericSpawnWrapper(
  deps: ProbeDeps,
  command: string,
  args: string[] = [],
  options: SpawnWrapperOptions = {}
): Promise<SpawnWrapperReturn> {
  const r = await deps.runner.run(command, args, {
    env: options.env,
    replaceEnv: options.env !== undefined ? true : undefined,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    onStdout: options.onStdout,
    onStderr: options.onStderr,
    stdin: ''
  })
  return {
    stdout: r.stdout,
    stderr: r.stderr,
    exitCode: r.code,
    signalName: r.signal
  }
}

export { genericSpawnWrapper }
