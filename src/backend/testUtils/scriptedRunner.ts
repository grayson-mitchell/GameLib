/**
 * D-12(a): the default for unit tests; never spawns; an unscripted call fails
 * loudly because a default result would hide a missing script.
 *
 * Steps are matched first-match in order; a consumed step does not match again
 * unless `repeat: true`. All state lives in the factory closure.
 */
import type {
  LongLivedHandle,
  LongLivedOptions,
  ProcessRunner,
  RunOptions,
  RunResult,
  RunSyncOptions,
  SyncResult,
  TrackFilter
} from '../process/types'

export interface ScriptStep {
  cmd: string
  argv?: readonly string[]
  match?: (argv: readonly string[]) => boolean
  result?: Partial<RunResult>
  chunks?: { stream: 'stdout' | 'stderr'; text: string }[]
  error?: { code: string }
  repeat?: boolean
}
export interface ScriptedCall {
  method: 'run' | 'runSync' | 'spawnLongLived' | 'openDetached'
  cmd: string
  argv: readonly string[]
  env?: NodeJS.ProcessEnv
  cwd?: string
  opts?: unknown
}
export interface ScriptedRunner extends ProcessRunner {
  readonly calls: readonly ScriptedCall[]
  expectAllConsumed(): void
}

const noChild = { pid: undefined, kill: () => false }

export function createScriptedRunner(
  script: readonly ScriptStep[]
): ScriptedRunner {
  const steps = script.map((step) => ({ step, used: false }))
  const calls: ScriptedCall[] = []
  const live = new Map<
    string,
    { handle: LongLivedHandle; teardown: () => void }
  >()
  const teardowns = new Map<string, () => void>()

  const take = (cmd: string, argv: readonly string[]): ScriptStep => {
    for (const entry of steps) {
      const s = entry.step
      if (entry.used && !s.repeat) continue
      if (s.cmd !== cmd) continue
      if (s.argv !== undefined) {
        if (s.argv.length !== argv.length) continue
        if (s.argv.some((a, i) => a !== argv[i])) continue
      }
      if (s.match && !s.match(argv)) continue
      entry.used = true
      return s
    }
    throw new Error(
      `unscripted process call: ${cmd} ${JSON.stringify([...argv])}`
    )
  }

  const positive = (v: number | undefined, name: string) => {
    if (v !== undefined && !(Number.isFinite(v) && v > 0)) {
      throw new TypeError(`${name} must be a positive finite number`)
    }
  }

  return {
    calls,
    expectAllConsumed() {
      const left = steps.filter((e) => !e.used && !e.step.repeat)
      if (left.length > 0) {
        throw new Error(
          `unconsumed script steps: ${left
            .map((e) => `${e.step.cmd} ${JSON.stringify(e.step.argv ?? '*')}`)
            .join(', ')}`
        )
      }
    },
    async run(cmd, argv, opts?: RunOptions): Promise<RunResult> {
      positive(opts?.timeoutMs, 'timeoutMs')
      calls.push({
        method: 'run',
        cmd,
        argv,
        env: opts?.env,
        cwd: opts?.cwd,
        opts
      })
      const s = take(cmd, argv)
      if (s.error) {
        throw Object.assign(new Error(`spawn ${cmd} ${s.error.code}`), {
          code: s.error.code
        })
      }
      for (const c of s.chunks ?? []) {
        if (c.stream === 'stdout') opts?.onStdout?.(c.text, noChild)
        else opts?.onStderr?.(c.text, noChild)
      }
      await Promise.resolve()
      return {
        code: 0,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: false,
        truncated: false,
        pid: undefined,
        ...s.result
      }
    },
    runSync(cmd, argv, opts: RunSyncOptions): SyncResult {
      positive(opts.timeoutMs, 'timeoutMs')
      calls.push({
        method: 'runSync',
        cmd,
        argv,
        env: opts.env,
        cwd: opts.cwd,
        opts
      })
      const s = take(cmd, argv)
      if (s.error) {
        throw Object.assign(new Error(`spawn ${cmd} ${s.error.code}`), {
          code: s.error.code
        })
      }
      return {
        code: 0,
        signal: null,
        stdout: '',
        stderr: '',
        timedOut: false,
        ...(s.result
          ? {
              code: s.result.code ?? 0,
              signal: s.result.signal ?? null,
              stdout: s.result.stdout ?? '',
              stderr: s.result.stderr ?? '',
              timedOut: s.result.timedOut ?? false
            }
          : {})
      }
    },
    spawnLongLived(cmd, argv, opts: LongLivedOptions): LongLivedHandle {
      calls.push({
        method: 'spawnLongLived',
        cmd,
        argv,
        env: opts.env,
        cwd: opts.cwd,
        opts
      })
      take(cmd, argv)
      let resolveExit!: (v: {
        code: number | null
        signal: NodeJS.Signals | null
      }) => void
      const exited = new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((r) => {
        resolveExit = r
      })
      const handle: LongLivedHandle = {
        id: opts.id,
        pid: undefined,
        exited,
        kill(signal) {
          live.delete(opts.id)
          resolveExit({ code: null, signal: signal ?? 'SIGTERM' })
          return true
        },
        unregister() {
          teardowns.delete(opts.id)
        }
      }
      live.set(opts.id, { handle, teardown: () => handle.kill() })
      const teardown = opts.teardown
      teardowns.set(opts.id, () =>
        teardown ? teardown(handle) : handle.kill('SIGTERM')
      )
      return handle
    },
    killTracked(_filter: TrackFilter): number {
      return 0
    },
    killAllTracked: () => live.size,
    teardownAll() {
      const all = [...teardowns.values()]
      teardowns.clear()
      for (const t of all) t()
    },
    openDetached(url) {
      calls.push({ method: 'openDetached', cmd: url, argv: [] })
    }
  }
}
