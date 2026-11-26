/**
 * The recording command-runner deps for the Phase 88.2 runner goldens (88.2-01, D-11, D-12, D-14).
 *
 * `createRunnerTrace` builds a `CommandRunnerDeps` whose every seam writes down what the real
 * `createCommandRunner` did through it, so a golden can be recorded from the TypeScript before any
 * Rust runner exists and the Rust runner has to reproduce it. The seams:
 *
 *   runner    a scripted `ProcessRunner` that records each `run` in full (program, argv, the whole env
 *             it was given, cwd, `resolveOn`, `track`, the timeout opt-out, `windowsHide`, `replaceEnv`)
 *             and answers from the case's script: chunks in order, an exit code or a signal, a held
 *             run, an intended kill, a spawn error. `createSpawnTracer` was not used because it
 *             records an env diff, not the options, and cannot express a signal, `killedByUs` or a
 *             run that stays pending until an abort lands.
 *   logger    the four backend log functions, recorded as `{ level, prefix, parts }` in call order
 *   writers   `getRunnerLogWriter(runner)` returns a real `LogWriter` cached per runner for the case
 *             (the production cache shape), so the first runner-log entry carries `rotate: true` and
 *             the rest carry `false`
 *   abort     `create`/`remove` record the id and hand out a real `AbortController` the case can abort
 *   errorHandler, searchForExecutableOnPath, commandToArgsArray   recorded in call order
 *
 * `records.logFrames` comes from `jest.spyOn` on the logger module's `enqueueLogEntry` (a raw chunk)
 * and `logLine` (a structured line), in the order they are called, with the target and the rotate
 * flag. The structured line is recorded without its call-time clock (`at`), which is the only
 * non-deterministic field. Both spies replace the implementation, so nothing reaches the real
 * forwarder queue. `jest.spyOn` only, never `jest.mock`: the backend-di ceilings count mocks.
 *
 * Isolation (D-12): the trace never reads the real profile. A spawn whose env carries a `HOME`
 * outside the profile it was given throws, so a case that forgot `withPinnedBaseEnv` fails loudly
 * instead of recording the operator's home.
 *
 * Two later plans record with the same file (88.2-04 `runWineCommand`/`getWinePath`/`runScriptForGame`,
 * 88.2-05 the game processes), so the script steps carry what those need beyond `callRunner`: a step
 * can match one `program`, report `onSpawn`, and a run can end `timedOut`.
 */
import { join, relative, isAbsolute } from 'path'
import * as logger from 'backend/logger'
import LogWriter from 'backend/logger/targetWriter'
import { LogPrefix } from 'backend/logger/constants'
import type { CommandRunnerDeps } from 'backend/commandRunner'
import type {
  ChildHandle,
  LongLivedHandle,
  ProcessRunner,
  RunOptions,
  RunResult
} from 'backend/process/types'
import type { CallRunnerOptions, Runner } from 'common/types'

/** One chunk a scripted child writes. */
export interface ScriptChunk {
  stream: 'stdout' | 'stderr'
  text: string
}

/** What one scripted `run` does. Steps are consumed in order; a step with `program` only matches it. */
export interface RunnerStep {
  /** Only a spawn of exactly this program takes the step. Omit to take any. */
  program?: string
  /** Delivered to `onStdout`/`onStderr` in this order, after `onSpawn`. */
  chunks?: ScriptChunk[]
  /** Exit code. Default 0; `null` is a run with no exit code. */
  code?: number | null
  signal?: NodeJS.Signals | null
  /** The run ended because `killTracked`/`killAllTracked` stopped it on purpose. */
  killedByUs?: boolean
  timedOut?: boolean
  /** The runner's own `aborted` flag on the result. */
  aborted?: boolean
  truncated?: boolean
  drainTimedOut?: boolean
  /** The run stays pending until `releaseAll()` or its signal aborts (then it ends `aborted`). */
  hold?: boolean
  /** With `hold`: abort the case's controller for this run on the next turn of the loop. */
  abortWhileHeld?: boolean
  /** After the run's result is ready, abort the case's controller for this run, then settle. */
  abortAfterExit?: boolean
  /** The run rejects like a spawn error: `spawn <program> <throws>`. */
  throws?: string
}

export interface RunnerTraceOptions {
  /** What `deps.platform` says. */
  platform: NodeJS.Platform
  /** The executable names `searchForExecutableOnPath` finds; every other name resolves to `null`. */
  onPath?: readonly string[]
  script: readonly RunnerStep[]
  /** The wine seams (88.2-04 passes the env builders). Default: every one throws by name. */
  wine?: CommandRunnerDeps['wine']
  /** Whether the runner log writer is disabled (a disabled writer sends nothing). Default false. */
  logsDisabled?: boolean
}

export interface RunnerSpawnRecord {
  program: string
  argv: string[]
  /** The whole env the run was given, keys sorted. */
  env: Record<string, string> | null
  cwd: string | null
  replaceEnv: boolean | null
  resolveOn: 'close' | 'exit' | null
  track: { runner: string; key: string } | null
  timeout: { none: true; reason: string } | null
  timeoutMs: number | null
  windowsHide: boolean | null
  /** Whether the run was given an abort signal. */
  hasSignal: boolean
}

/** One entry at the forwarder boundary. */
export type LogFrame =
  | {
      target: unknown
      rotate: boolean
      raw: string
    }
  | {
      target: unknown
      rotate: boolean
      line: { level: string; prefix: string; message: unknown }
    }

export interface LogCall {
  level: 'info' | 'warning' | 'error' | 'debug'
  prefix: unknown
  parts: unknown
}

/** A call into one of the non-logger seams, in call order. */
export type SeamCall =
  | { seam: 'abort.create'; id: string }
  | { seam: 'abort.remove'; id: string; aborted: boolean }
  | { seam: 'errorHandler'; error: string; appName: string; runner: string }
  | { seam: 'searchForExecutableOnPath'; executable: string; found: boolean }
  | { seam: 'commandToArgsArray'; command: unknown }

export interface RunnerTraceRecords {
  spawns: RunnerSpawnRecord[]
  logFrames: LogFrame[]
  logs: LogCall[]
  calls: SeamCall[]
}

export interface RunnerTrace {
  readonly deps: CommandRunnerDeps
  readonly records: RunnerTraceRecords
  /** Settles every held run with its scripted result. */
  releaseAll(): void
  /** Throws when a scripted step was never used: a missing spawn is a diff, not a pass. */
  expectScriptConsumed(): void
  /** Puts the logger module back. Always call it, in `finally`. */
  restore(): void
}

/** The child every scripted run reports. */
const SCRIPTED_CHILD: ChildHandle = {
  pid: 4242,
  exitCode: null,
  signalCode: null,
  kill: () => false
}

const notWired = (what: string) => (): never => {
  throw new Error(
    `runnerTrace: the ${what} dep was not supplied; pass options.wine for a case that reaches it`
  )
}

const NO_WINE: CommandRunnerDeps['wine'] = {
  getDefaultSettings: notWired('wine.getDefaultSettings'),
  verifyWinePrefix: notWired('wine.verifyWinePrefix'),
  validWine: notWired('wine.validWine'),
  setupEnvVars: notWired('wine.setupEnvVars'),
  setupWineEnvVars: notWired('wine.setupWineEnvVars'),
  isUmuSupported: notWired('wine.isUmuSupported'),
  getUmuPath: notWired('wine.getUmuPath')
}

const insideProfile = (home: string, path: string): boolean => {
  const rel = relative(home, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function recordSpawn(
  profileHome: string,
  program: string,
  argv: readonly string[],
  opts: RunOptions | undefined
): RunnerSpawnRecord {
  let env: Record<string, string> | null = null
  if (opts?.env) {
    env = {}
    for (const key of Object.keys(opts.env).sort()) {
      const value = opts.env[key]
      if (value !== undefined) env[key] = value
    }
    const home = env.HOME
    if (home !== undefined && !insideProfile(profileHome, home)) {
      throw new Error(
        'runnerTrace: a spawn env carries a HOME outside the fake profile; run the case inside withPinnedBaseEnv'
      )
    }
  }
  return {
    program,
    argv: [...argv],
    env,
    cwd: opts?.cwd ?? null,
    replaceEnv: opts?.replaceEnv ?? null,
    resolveOn: opts?.resolveOn ?? null,
    track: opts?.track ? { ...opts.track } : null,
    timeout: opts?.timeout ? { ...opts.timeout } : null,
    timeoutMs: opts?.timeoutMs ?? null,
    windowsHide: opts?.windowsHide ?? null,
    hasSignal: opts?.signal !== undefined
  }
}

/**
 * Builds the recording deps for one case and installs the log-frame spies. `profile` is the case's
 * fake HOME; call `restore()` when the case is done.
 */
export function createRunnerTrace(
  profile: { home: string },
  options: RunnerTraceOptions
): RunnerTrace {
  const records: RunnerTraceRecords = {
    spawns: [],
    logFrames: [],
    logs: [],
    calls: []
  }

  const spies = [
    jest
      .spyOn(logger, 'enqueueLogEntry')
      .mockImplementation((target, rotate, entry) => {
        records.logFrames.push(
          'raw' in entry
            ? { target, rotate, raw: entry.raw }
            : {
                target,
                rotate,
                line: {
                  level: entry.line.level,
                  prefix: entry.line.prefix,
                  message: entry.line.msg
                }
              }
        )
      }),
    jest
      .spyOn(logger, 'logLine')
      .mockImplementation((target, rotate, level, prefix, message) => {
        records.logFrames.push({
          target,
          rotate,
          line: { level, prefix, message }
        })
      })
  ]

  // The abort registry: a real controller per id, found again through its signal.
  const bySignal = new Map<AbortSignal, AbortController>()
  const controllers = new Map<string, AbortController>()

  const steps = options.script.map((step) => ({ step, used: false }))
  const held: (() => void)[] = []

  const takeStep = (program: string): RunnerStep => {
    for (const entry of steps) {
      if (entry.used) continue
      if (entry.step.program !== undefined && entry.step.program !== program) {
        continue
      }
      entry.used = true
      return entry.step
    }
    throw new Error(
      `unscripted process call: ${program} (the script has no unused step for it)`
    )
  }

  const run: ProcessRunner['run'] = async (program, argv, opts) => {
    records.spawns.push(recordSpawn(profile.home, program, argv, opts))
    const step = takeStep(program)
    if (step.throws !== undefined) {
      throw Object.assign(new Error(`spawn ${program} ${step.throws}`), {
        code: step.throws
      })
    }
    opts?.onSpawn?.(SCRIPTED_CHILD)
    let stdout = ''
    let stderr = ''
    for (const chunk of step.chunks ?? []) {
      if (chunk.stream === 'stdout') {
        stdout += chunk.text
        opts?.onStdout?.(chunk.text, SCRIPTED_CHILD)
      } else {
        stderr += chunk.text
        opts?.onStderr?.(chunk.text, SCRIPTED_CHILD)
      }
    }
    const result: RunResult = {
      code: step.code === undefined ? 0 : step.code,
      signal: step.signal ?? null,
      stdout,
      stderr,
      timedOut: step.timedOut ?? false,
      aborted: step.aborted ?? false,
      truncated: step.truncated ?? false,
      pid: SCRIPTED_CHILD.pid,
      ...(step.drainTimedOut !== undefined && {
        drainTimedOut: step.drainTimedOut
      }),
      ...(step.killedByUs !== undefined && { killedByUs: step.killedByUs })
    }
    const controllerOf = (): AbortController | undefined =>
      opts?.signal ? bySignal.get(opts.signal) : undefined

    if (step.hold) {
      const signal = opts?.signal
      const abortedResult: RunResult = { ...result, code: null, aborted: true }
      if (signal?.aborted) return abortedResult
      return new Promise<RunResult>((resolve) => {
        const onAbort = () => resolve(abortedResult)
        signal?.addEventListener('abort', onAbort, { once: true })
        if (step.abortWhileHeld) {
          // Only the abort ends this run: `releaseAll()` leaves it pending.
          setImmediate(() => controllerOf()?.abort())
          return
        }
        held.push(() => {
          signal?.removeEventListener('abort', onAbort)
          resolve(result)
        })
      })
    }
    await new Promise<void>((resolve) => setImmediate(resolve))
    if (step.abortAfterExit) controllerOf()?.abort()
    return result
  }

  const notTraced = (method: string) => (): never => {
    throw new Error(
      `runnerTrace: ${method} is not traced yet; add it with the plan that needs it`
    )
  }

  const runner: ProcessRunner = {
    run,
    runSync: notTraced('runSync'),
    spawnLongLived: notTraced('spawnLongLived') as () => LongLivedHandle,
    killTracked: () => 0,
    killAllTracked: () => 0,
    teardownAll: () => undefined,
    openDetached: notTraced('openDetached')
  }

  const writers = new Map<Runner, LogWriter>()
  const found = new Set(options.onPath ?? [])

  const record =
    (level: LogCall['level']) =>
    (parts: unknown, prefix?: unknown): void => {
      records.logs.push({ level, prefix, parts })
    }

  const deps: CommandRunnerDeps = {
    runner,
    platform: options.platform,
    logger: {
      logInfo: record('info'),
      logWarning: record('warning'),
      logError: record('error'),
      logDebug: record('debug'),
      backendPrefix: LogPrefix.Backend
    },
    getRunnerLogWriter(name) {
      let writer = writers.get(name)
      if (!writer) {
        writer = new LogWriter(
          { kind: 'runner', runner: name },
          options.logsDisabled ?? false
        )
        writers.set(name, writer)
      }
      return writer
    },
    abort: {
      create(id) {
        records.calls.push({ seam: 'abort.create', id })
        const controller = new AbortController()
        controllers.set(id, controller)
        bySignal.set(controller.signal, controller)
        return controller
      },
      remove(id) {
        records.calls.push({
          seam: 'abort.remove',
          id,
          aborted: controllers.get(id)?.signal.aborted ?? false
        })
        controllers.delete(id)
      }
    },
    errorHandler(error, appName, runnerName) {
      records.calls.push({
        seam: 'errorHandler',
        error,
        appName,
        runner: runnerName
      })
    },
    searchForExecutableOnPath(executable) {
      const hit = found.has(executable)
      records.calls.push({
        seam: 'searchForExecutableOnPath',
        executable,
        found: hit
      })
      return Promise.resolve(hit ? join('<PATH>', executable) : null)
    },
    commandToArgsArray(command) {
      records.calls.push({ seam: 'commandToArgsArray', command })
      return []
    },
    wine: options.wine ?? NO_WINE
  }

  return {
    deps,
    records,
    releaseAll() {
      for (const release of held.splice(0)) release()
    },
    expectScriptConsumed() {
      const left = steps.filter((entry) => !entry.used)
      if (left.length > 0) {
        throw new Error(
          `unconsumed runner script steps: ${left.length} (a spawn the case expected never happened)`
        )
      }
    },
    restore() {
      for (const spy of spies) spy.mockRestore()
    }
  }
}

/** The `onOutput` option of a `callRunner` call that records every chunk it is handed, in order. */
export function recordStream(): {
  onOutput: NonNullable<CallRunnerOptions['onOutput']>
  chunks: string[]
} {
  const chunks: string[] = []
  return {
    onOutput: (output) => {
      chunks.push(output)
    },
    chunks
  }
}
