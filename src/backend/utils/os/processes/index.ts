import { ChildProcess, spawn } from 'child_process'

type SpawnWrapperOptions = Partial<{
  onStdout: (data: string, child: ChildProcess) => unknown
  onStderr: (data: string, child: ChildProcess) => unknown
  env: Record<string, string | undefined>
  /** Kill the child (SIGTERM) after this many ms. Default {@link DEFAULT_TIMEOUT_MS}. */
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

async function genericSpawnWrapper(
  command: string,
  args: string[] = [],
  options: SpawnWrapperOptions = {}
): Promise<SpawnWrapperReturn> {
  const child = spawn(command, args, {
    env: options?.env,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  })
  // Sidecar exit contract: unref the child and its pipes so a hung probe never holds the event
  // loop past stdin EOF. Optional calls: test doubles need not implement unref().
  child.unref?.()
  ;(child.stdout as { unref?: () => void } | null)?.unref?.()
  ;(child.stderr as { unref?: () => void } | null)?.unref?.()
  child.stdout.setEncoding('utf-8')
  child.stderr.setEncoding('utf-8')

  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (data: string) => {
    stdout += data
    if (options.onStdout) options.onStdout(data, child)
  })
  child.stderr.on('data', (data: string) => {
    stderr += data
    if (options.onStderr) options.onStderr(data, child)
  })

  return new Promise<SpawnWrapperReturn>((resolve, reject) => {
    // A missing binary (ENOENT) emits 'error' with no 'close'; unhandled, it is an uncaught
    // exception that would take the sidecar down. Reject so the caller's catch handles it.
    child.on('error', reject)
    child.on('close', (code, signal) =>
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signalName: signal
      })
    )
  })
}

export { genericSpawnWrapper }
