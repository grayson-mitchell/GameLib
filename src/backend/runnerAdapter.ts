import {
  runnerCall,
  scriptRun,
  winePathGet,
  wineCommandRun
} from 'backend/launchrust/runner'
import type {
  RunnerCallRequest,
  ScriptRunRequest,
  WineCommandRequest
} from 'backend/launchrust/runner'
import type { RunnerStreams } from 'backend/runnerStream'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import type { RunnerProps, WineCommandResult } from 'backend/commandRunner'
import type {
  CallRunnerOptions,
  ExecResult,
  GameInfo,
  GameSettings,
  Runner,
  WineCommandArgs
} from 'common/types'
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

/**
 * The options of a wine command: the TS ones, and the spawn class Rust runs the child as (`game` for the sideload wine launch,
 * a child that outlives GameLib; `helper`, the default, for everything else).
 */
export type RunnerAdapterWineOptions = CallRunnerOptions & {
  spawnClass?: 'helper' | 'game'
}

/** `WineCommandArgs` with the adapter's wine options. A `WineCommandArgs` is assignable to it. */
export type RunnerAdapterWineCommandArgs = Omit<WineCommandArgs, 'options'> & {
  options?: RunnerAdapterWineOptions
}

export interface RunnerAdapter {
  callRunner(
    commandParts: string[],
    runnerProps: RunnerProps,
    options: RunnerAdapterCallOptions
  ): Promise<ExecResult>
  runWineCommand(args: RunnerAdapterWineCommandArgs): Promise<WineCommandResult>
  getWinePath(args: {
    path: string
    gameSettings: GameSettings
    variant?: 'win' | 'unix'
  }): Promise<string>
  runScriptForGame(
    gameInfo: GameInfo,
    gameSettings: GameSettings,
    scriptStage: 'before' | 'after',
    logWriter: LogWriter
  ): Promise<boolean | string>
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

/**
 * Narrows Rust's answer to a wine command to a `WineCommandResult`: an object with a string `stdout` and `stderr`, and a
 * `code` that is a number or `null` when it is there (it is absent when nothing ran, an invalid wine). The answer is handed
 * on as it came.
 */
export function settleWineCommandResult(reply: unknown): WineCommandResult {
  if (
    typeof reply === 'object' &&
    reply !== null &&
    'stdout' in reply &&
    typeof reply.stdout === 'string' &&
    'stderr' in reply &&
    typeof reply.stderr === 'string' &&
    (!('code' in reply) ||
      reply.code === null ||
      typeof reply.code === 'number')
  ) {
    return reply as WineCommandResult
  }
  throw new Error('runWineCommand: the reply was not a command result')
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

/** The caller's environment as a string map; a variable with no value is left out. */
function envRecord(
  env: CallRunnerOptions['env']
): Record<string, string> | undefined {
  if (!env) return undefined
  const record: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === 'string') record[key] = value
  }
  return record
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

  /**
   * The log writers handed off, in order, each once; a closed or refused writer is left out. Called after the log forwarder's
   * flush and sent with nothing awaited in between, as `callRunner` does.
   */
  function handOffAll(
    writers: readonly LogWriter[] | undefined
  ): NonNullable<WineCommandRequest['logTargets']> {
    const targets: NonNullable<WineCommandRequest['logTargets']> = []
    for (const writer of writers ?? []) {
      const handOff = writer.handOff()
      if (handOff) targets.push(handOff)
    }
    return targets
  }

  async function runWineCommand(
    args: RunnerAdapterWineCommandArgs
  ): Promise<WineCommandResult> {
    const options = args.options
    const observe = !!options?.onOutput || !!args.onSpawn
    const streamId = observe
      ? deps.streams.open({
          onOutput: options?.onOutput,
          onSpawn: args.onSpawn
        })
      : undefined

    try {
      await deps.flushLogs()

      const request: WineCommandRequest = {
        // A copy: Rust builds its own argv, and the caller's list is never touched (87 finding 3).
        commandParts: [...args.commandParts],
        logTargets: handOffAll(options?.logWriters),
        spawnClass: options?.spawnClass ?? 'helper'
      }
      if (streamId !== undefined) {
        request.streamId = streamId
        request.observe = true
      }
      if (args.gameSettings) request.gameSettings = args.gameSettings
      if (args.wait !== undefined) request.wait = args.wait
      if (args.protonVerb !== undefined) request.protonVerb = args.protonVerb
      if (args.installFolderName !== undefined)
        request.installFolderName = args.installFolderName
      if (args.gameInstallPath !== undefined)
        request.gameInstallPath = args.gameInstallPath
      if (args.startFolder !== undefined) request.startFolder = args.startFolder
      if (args.skipPrefixCheckIKnowWhatImDoing !== undefined)
        request.skipPrefixCheckIKnowWhatImDoing =
          args.skipPrefixCheckIKnowWhatImDoing
      if (args.ignoreLogging !== undefined)
        request.ignoreLogging = args.ignoreLogging
      if (args.resolveOnExit !== undefined)
        request.resolveOnExit = args.resolveOnExit
      if (options?.logMessagePrefix !== undefined)
        request.logMessagePrefix = options.logMessagePrefix
      const env = envRecord(options?.env)
      const wineOptions: NonNullable<WineCommandRequest['options']> = {}
      if (env) wineOptions.env = env
      if (options?.wrappers) wineOptions.wrappers = [...options.wrappers]
      if (options?.trackKey !== undefined)
        wineOptions.trackKey = options.trackKey
      if (Object.keys(wineOptions).length) request.options = wineOptions

      return settleWineCommandResult(await wineCommandRun(deps, request))
    } finally {
      if (streamId !== undefined) deps.streams.close(streamId)
    }
  }

  async function getWinePath({
    path,
    gameSettings,
    variant
  }: {
    path: string
    gameSettings: GameSettings
    variant?: 'win' | 'unix'
  }): Promise<string> {
    const reply = await winePathGet(deps, {
      path,
      gameSettings,
      ...(variant !== undefined ? { variant } : {})
    })
    if (typeof reply !== 'string') {
      throw new Error('getWinePath: the reply was not a path')
    }
    return reply
  }

  async function runScriptForGame(
    gameInfo: GameInfo,
    gameSettings: GameSettings,
    scriptStage: 'before' | 'after',
    logWriter: LogWriter
  ): Promise<boolean | string> {
    const scriptPath = gameSettings[`${scriptStage}LaunchScriptPath`]
    if (typeof scriptPath !== 'string') {
      throw new Error('runScriptForGame: the settings name no script')
    }
    const verbose = !!gameSettings.verboseLogs

    // The writer is read only when verbose logs are on (Rust drops the script's output otherwise), so it is handed off, and
    // its rotation claimed, only then.
    let logTarget: ScriptRunRequest['logTarget']
    if (verbose) {
      await deps.flushLogs()
      logTarget = logWriter.handOff() ?? undefined
    }

    const request: ScriptRunRequest = {
      scriptPath,
      stage: scriptStage,
      appName: gameInfo.app_name,
      runner: gameInfo.runner,
      title: gameInfo.title,
      // The TS text, verbatim: Rust hands both to the script as they are, never re-serialised.
      settingsJson: JSON.stringify(gameSettings),
      infoJson: JSON.stringify(gameInfo)
    }
    if (typeof gameInfo.install?.executable === 'string')
      request.executable = gameInfo.install.executable
    if (typeof gameSettings.winePrefix === 'string')
      request.prefix = gameSettings.winePrefix
    if (typeof gameInfo.install?.install_path === 'string')
      request.installPath = gameInfo.install.install_path
    if (verbose) request.verbose = true
    if (logTarget) request.logTarget = logTarget

    try {
      await scriptRun(deps, request)
    } catch (error) {
      // A script that could not be started: the text Rust answered, as an Error, as the TS rethrew the spawn error.
      throw new Error(error instanceof Error ? error.message : String(error))
    }
    return true
  }

  return { callRunner, runWineCommand, getWinePath, runScriptForGame }
}
