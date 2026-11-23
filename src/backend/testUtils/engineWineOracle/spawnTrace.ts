/**
 * The spawn-trace recorder for the Phase 87 oracles (87-05, D-08).
 *
 * `createSpawnTracer` returns a `ProcessRunner` and a `SpawnAsync` over it, so both TS spawn seams
 * (`deps.runner.run` and `deps.spawnAsync`, which is a thin caller of `run`) land in one ordered
 * trace. Each call is recorded as `{program, argv, envDiff, cwd, stdin, result}`. What answers the
 * call is chosen in this order:
 *   1. a scripted output whose program and argv match (consumed once unless `repeat`), so a case can
 *      replay `{code, stdout, stderr}` for a binary the test machine does not have;
 *   2. the `delegate` runner (a `createRealRunner()` one, isolated by default) when the case needs a
 *      real effect, such as `tar` extracting into the profile;
 *   3. nothing: an unscripted call fails by name, because a default result would hide a missing
 *      script (the same rule as `createScriptedRunner`).
 *
 * `envDiff` is the env the call set, diffed against the fake-HOME base env the tracer was given:
 * `set` holds each key whose value differs from the base, `unset` the base's home variables the
 * call dropped (only when `replaceEnv` is true; the full base is the operator's process env and
 * is never recorded). Values are recorded as given: `normalise` rewrites profile paths into
 * placeholders before the trace is written to a golden.
 *
 * Only `run` and `runSync` are traced so far. `spawnLongLived` (winetricks progress) is a later
 * plan's seam and throws by name until then.
 */
import { createSpawnAsync, type SpawnAsync } from 'backend/spawnAsync'
import { FAKE_HOME_ENV_KEYS } from 'backend/testUtils/fakeHomeProfile'
import type {
  ChildHandle,
  ProcessRunner,
  RunOptions,
  RunResult,
  RunSyncOptions,
  SyncResult
} from 'backend/process/types'

/** A scripted child has no process behind it. */
const noChild: ChildHandle = {
  pid: undefined,
  exitCode: null,
  signalCode: null,
  kill: () => false
}

export interface SpawnRecord {
  program: string
  argv: string[]
  envDiff: { set: Record<string, string>; unset: string[] }
  cwd: string | null
  stdin: string | null
  /** The seam the call came through. */
  via: 'run' | 'runSync'
  result: { code: number | null; stdout: string; stderr: string }
}

export interface ScriptedOutput {
  program: string
  /** Exact argv. Omit to match any argv. */
  argv?: readonly string[]
  match?: (argv: readonly string[]) => boolean
  code?: number
  stdout?: string
  stderr?: string
  repeat?: boolean
}

export interface SpawnTracer {
  readonly runner: ProcessRunner
  readonly spawnAsync: SpawnAsync
  /** The raw trace, in call order. */
  readonly records: readonly SpawnRecord[]
  /** Throws when a non-repeating scripted output was never used. */
  expectAllConsumed(): void
}

export interface SpawnTracerOptions {
  /** The base env a spawn merges over: pass `profile.fake.childEnv()`. */
  baseEnv: NodeJS.ProcessEnv
  scripted?: readonly ScriptedOutput[]
  /** Runs what no scripted output answers. */
  delegate?: ProcessRunner
}

function diffEnv(
  base: NodeJS.ProcessEnv,
  env: NodeJS.ProcessEnv | undefined,
  replaceEnv: boolean | undefined
): SpawnRecord['envDiff'] {
  const set: Record<string, string> = {}
  const unset: string[] = []
  if (env) {
    for (const key of Object.keys(env).sort()) {
      const value = env[key]
      if (value !== undefined && base[key] !== value) set[key] = value
    }
    if (replaceEnv) {
      for (const key of FAKE_HOME_ENV_KEYS) {
        if (base[key] !== undefined && env[key] === undefined) unset.push(key)
      }
    }
  }
  return { set, unset }
}

export function createSpawnTracer(options: SpawnTracerOptions): SpawnTracer {
  const records: SpawnRecord[] = []
  const script = (options.scripted ?? []).map((step) => ({
    step,
    used: false
  }))

  const take = (
    program: string,
    argv: readonly string[]
  ): ScriptedOutput | undefined => {
    for (const entry of script) {
      const s = entry.step
      if (entry.used && !s.repeat) continue
      if (s.program !== program) continue
      if (s.argv !== undefined) {
        if (s.argv.length !== argv.length) continue
        if (s.argv.some((a, i) => a !== argv[i])) continue
      }
      if (s.match && !s.match(argv)) continue
      entry.used = true
      return s
    }
    return undefined
  }

  const unscripted = (program: string, argv: readonly string[]): never => {
    throw new Error(
      `unscripted process call: ${program} ${JSON.stringify([...argv])}`
    )
  }

  const notTraced = (method: string): never => {
    throw new Error(
      `spawnTrace: ${method} is not traced yet; add it with the plan that needs it`
    )
  }

  const runner: ProcessRunner = {
    async run(program, argv, opts?: RunOptions): Promise<RunResult> {
      const scripted = take(program, argv)
      let result: RunResult
      if (scripted) {
        result = {
          code: scripted.code ?? 0,
          signal: null,
          stdout: scripted.stdout ?? '',
          stderr: scripted.stderr ?? '',
          timedOut: false,
          aborted: false,
          truncated: false,
          pid: undefined
        }
        if (result.stdout) opts?.onStdout?.(result.stdout, noChild)
        if (result.stderr) opts?.onStderr?.(result.stderr, noChild)
      } else if (options.delegate) {
        result = await options.delegate.run(program, argv, opts)
      } else {
        return unscripted(program, argv)
      }
      records.push({
        program,
        argv: [...argv],
        envDiff: diffEnv(options.baseEnv, opts?.env, opts?.replaceEnv),
        cwd: opts?.cwd ?? null,
        stdin: opts?.stdin ?? null,
        via: 'run',
        result: {
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr
        }
      })
      return result
    },
    runSync(program, argv, opts: RunSyncOptions): SyncResult {
      const scripted = take(program, argv)
      let result: SyncResult
      if (scripted) {
        result = {
          code: scripted.code ?? 0,
          signal: null,
          stdout: scripted.stdout ?? '',
          stderr: scripted.stderr ?? '',
          timedOut: false
        }
      } else if (options.delegate) {
        result = options.delegate.runSync(program, argv, opts)
      } else {
        return unscripted(program, argv)
      }
      records.push({
        program,
        argv: [...argv],
        envDiff: diffEnv(options.baseEnv, opts.env, opts.replaceEnv),
        cwd: opts.cwd ?? null,
        stdin: opts.input ?? null,
        via: 'runSync',
        result: {
          code: result.code,
          stdout: result.stdout,
          stderr: result.stderr
        }
      })
      return result
    },
    spawnLongLived: () => notTraced('spawnLongLived'),
    killTracked: () => 0,
    killAllTracked: () => 0,
    teardownAll: () => undefined,
    openDetached: () => notTraced('openDetached')
  }

  return {
    runner,
    spawnAsync: createSpawnAsync({ runner }),
    records,
    expectAllConsumed() {
      const left = script.filter((e) => !e.used && !e.step.repeat)
      if (left.length > 0) {
        throw new Error(
          `unconsumed scripted outputs: ${left
            .map(
              (e) => `${e.step.program} ${JSON.stringify(e.step.argv ?? '*')}`
            )
            .join(', ')}`
        )
      }
    }
  }
}
