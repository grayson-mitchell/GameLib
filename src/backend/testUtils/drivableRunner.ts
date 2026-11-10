/**
 * A runner double for streaming runs a test drives by hand (winetricks installs): the run
 * stays pending, the test emits stdout/stderr chunks and the exit, and the run settles then.
 * Where a run's outcome is fixed up front, `createScriptedRunner` is the tool; this one is for
 * the interleaving a script cannot express (output after exit, a hold across several ticks).
 *
 * A `handle` callback answers the runs a test does not drive (`which`, `wine --version`):
 * returning a result settles that run, returning undefined hands the run to the test as a
 * driven child. Throwing or rejecting is a spawn error, like the real runner.
 */
import type { ProcessRunner, RunOptions, RunResult } from '../process/types'

export type DrivenRunResult = Partial<RunResult>

export interface DrivenChild {
  readonly cmd: string
  readonly argv: readonly string[]
  readonly opts: RunOptions | undefined
  stdout: { emit(event: 'data', text: string): void }
  stderr: { emit(event: 'data', text: string): void }
  /** 'exit' and 'close' settle the run (the first one wins) with the code; 'error' rejects it. */
  emit(event: 'exit' | 'close', code: number | null): void
  emit(event: 'error', error: Error): void
}

export interface DrivableRunner extends Pick<ProcessRunner, 'run'> {
  readonly children: DrivenChild[]
  readonly calls: readonly {
    cmd: string
    argv: readonly string[]
    opts: RunOptions | undefined
  }[]
}

const baseResult: RunResult = {
  code: 0,
  signal: null,
  stdout: '',
  stderr: '',
  timedOut: false,
  aborted: false,
  truncated: false,
  pid: undefined
}

export function createDrivableRunner(
  handle?: (
    cmd: string,
    argv: readonly string[],
    opts: RunOptions | undefined
  ) => DrivenRunResult | Promise<DrivenRunResult> | undefined
): DrivableRunner {
  const children: DrivenChild[] = []
  const calls: {
    cmd: string
    argv: readonly string[]
    opts: RunOptions | undefined
  }[] = []
  return {
    children,
    calls,
    async run(cmd, argv, opts) {
      calls.push({ cmd, argv, opts })
      const answered = handle?.(cmd, argv, opts)
      if (answered !== undefined) return { ...baseResult, ...(await answered) }
      return new Promise<RunResult>((resolve, reject) => {
        let settled = false
        const child: DrivenChild = {
          cmd,
          argv,
          opts,
          stdout: {
            emit: (_e, text) => opts?.onStdout?.(text, undefined as never)
          },
          stderr: {
            emit: (_e, text) => opts?.onStderr?.(text, undefined as never)
          },
          emit(event: 'exit' | 'close' | 'error', arg: number | null | Error) {
            if (settled) return
            if (event === 'error') {
              settled = true
              reject(arg instanceof Error ? arg : new Error(String(arg)))
              return
            }
            // Settles on a microtask, so output emitted right after the exit (the runner's
            // drain grace) still lands before the run resolves.
            void Promise.resolve().then(() => {
              if (settled) return
              settled = true
              resolve({ ...baseResult, code: arg as number | null })
            })
          }
        }
        children.push(child)
      })
    }
  }
}
