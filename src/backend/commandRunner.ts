/**
 * The command runner (66.1 MH-4 / D-11): `callRunner`, `runWineCommand`,
 * `getWinePath` and `runScriptForGame` as thin callers of `ProcessRunner.run`.
 *
 * Everything this module needs from the rest of the backend arrives through
 * `CommandRunnerDeps`, so it value-imports nothing from backend/ (depcruise
 * rule `command-runner-is-narrow`) and its Layer-2 suite runs with a scripted
 * runner and zero jest.mock. Production passes the real functions at boot.
 *
 * State (the in-flight dedup map, the PowerShell probe) lives in the factory
 * closure, never at module scope.
 *
 * Behaviour notes against the legacy launcher.ts functions:
 * - callRunner / runWineCommand / runScriptForGame run with no timeout
 *   ({ none: true, reason }) and `windowsHide: false`, exactly as the legacy
 *   spawns did (A1/A4). `wineserver --wait` gets a finite 30-minute timeout
 *   that logs a warning and resolves the first child's result.
 * - The runner's own 8 MiB capture is ignored: results are built from the
 *   legacy per-chunk accumulation (A5).
 * - A run that ends by a signal with no abort is an error. The legacy handler
 *   also consulted `child.killed`; a ChildHandle does not expose it.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import type {
  CallRunnerOptions,
  ExecResult,
  GameInfo,
  GameSettings,
  Runner,
  WineCommandArgs,
  WineInstallation
} from 'common/types'

import type { LegendaryCommand } from 'backend/storeManagers'

import type { logDebug, logError, logInfo, logWarning } from './logger'
import type { LogPrefix } from './logger/constants'
import type LogWriter from './logger/log_writer'
import type { ChildHandle, ProcessRunner, RunResult } from './process/types'

export interface RunnerProps {
  name: Runner
  logPrefix: LogPrefix
  bin: string
  dir?: string
}

export interface WineCommandResult {
  stderr: string
  stdout: string
  code?: number | null
}

export interface CommandRunnerDeps {
  runner: ProcessRunner
  platform: NodeJS.Platform
  logger: {
    logInfo: typeof logInfo
    logWarning: typeof logWarning
    logError: typeof logError
    logDebug: typeof logDebug
    backendPrefix: LogPrefix
  }
  getRunnerLogWriter(runner: Runner): LogWriter
  abort: {
    create(id: string): AbortController
    remove(id: string): void
  }
  errorHandler(
    error: string,
    appName: string,
    runner: Runner
  ): Promise<void> | void
  searchForExecutableOnPath(executable: string): Promise<string | null>
  commandToArgsArray(command: LegendaryCommand): string[]
  wine: {
    getDefaultSettings(): GameSettings
    verifyWinePrefix(settings: GameSettings): Promise<unknown>
    validWine(wineVersion: WineInstallation): Promise<boolean>
    setupEnvVars(
      settings: GameSettings,
      installPath?: string
    ): Record<string, string>
    setupWineEnvVars(
      settings: GameSettings,
      gameId?: string
    ): Record<string, string>
    isUmuSupported(settings: GameSettings): Promise<boolean>
    getUmuPath(): Promise<string>
  }
}

export type CommandRunner = ReturnType<typeof createCommandRunner>

const WINESERVER_WAIT_TIMEOUT_MS = 1_800_000

// The number of messages kept, not lines: a message can be multi-line.
const memoryLog = (limit = 50) => {
  const lines: string[] = []
  return {
    push: (newLine: string) => {
      lines.unshift(newLine)
      if (lines.length > limit) lines.length = limit
    },
    join: (separator = '') => lines.toReversed().join(separator)
  }
}

function quoteIfNecessary(stringToQuote: string) {
  const shouldQuote =
    typeof stringToQuote === 'string' &&
    !(stringToQuote.startsWith('"') && stringToQuote.endsWith('"')) &&
    stringToQuote.includes(' ')

  return shouldQuote ? `"${stringToQuote}"` : String(stringToQuote)
}

// Index of the appName within a runner's command parts, per store (-1: none).
const appNameIndexFinders: Record<Runner, (commandParts: string[]) => number> =
  {
    gog: (commandParts) => {
      const idx = commandParts.findIndex((value) => value === 'launch')
      if (idx > -1) {
        // for GOGdl, between `launch` and the app name there's another element
        return idx + 2
      }
      // for the `download`, `repair` and `update` command it's right after
      const other = commandParts.findIndex((value) =>
        ['download', 'repair', 'update'].includes(value)
      )
      return other > -1 ? other + 1 : -1
    },
    legendary: (commandParts) => {
      // for legendary, the appName comes right after the commands
      const idx = commandParts.findIndex((value) =>
        ['launch', 'install', 'repair', 'update'].includes(value)
      )
      return idx > -1 ? idx + 1 : -1
    },
    nile: (commandParts) => {
      // for nile, we pass the appName as the last command part
      const idx = commandParts.findIndex((value) =>
        ['launch', 'install', 'update', 'verify'].includes(value)
      )
      return idx > -1 ? commandParts.length - 1 : -1
    },
    sideload: () => -1,
    steam: () => -1
  }

function appNameFromCommandParts(commandParts: string[], runner: Runner) {
  const appNameIndex = appNameIndexFinders[runner](commandParts)
  return appNameIndex > -1 ? (commandParts[appNameIndex] ?? '') : ''
}

/**
 * Generates a formatted, safe command that can be logged
 * @param command The runner command that's executed, e.g. install, list, etc.
 * Note that this will be modified, so pass a copy of your actual command parts
 * @param env Enviroment variables to use
 * @param runnerPath The full path to the runner executable
 * @param commandToArgsArray Converts a legendary command object to argv
 * @returns
 */
export function getRunnerCallWithoutCredentials(
  command: string[] | LegendaryCommand,
  env: Record<string, string> | NodeJS.ProcessEnv = {},
  runnerPath: string,
  commandToArgsArray: (command: LegendaryCommand) => string[]
): string {
  if (!Array.isArray(command)) {
    command = commandToArgsArray(command)
  }

  const modifiedCommand = [...command]
  // Redact sensitive arguments reaching this shared logging path from ANY runner.
  // Census-derived (34.5-61, F-34.5-G6-22/F-34.5-G6-24) via:
  //   grep -rnE "'--(code|token|code-verifier|client-id|serial|password|secret|refresh-token|api-key)'" \
  //     --include='*.ts' src/backend | grep -v __tests__
  // --code (legendary auth, gog user, nile register) / --token (legendary): pre-existing.
  // --code-verifier (nile PKCE verifier, F-34.5-G6-22) / --password (GOG private-branch
  // password, F-34.5-G6-24, user-chosen secret reused across install/update/library calls) /
  // --serial (nile device serial) / --client-id (nile OAuth client id): added here.
  // Exact array-element match is kept deliberately (not prefix match) so `--code` can never
  // swallow `--code-verifier` or vice versa -- each is redacted independently by its own
  // exact-match loop iteration.
  for (const sensitiveArg of [
    '--code',
    '--token',
    '--code-verifier',
    '--password',
    '--serial',
    '--client-id'
  ]) {
    // PowerShell's argument formatting is quite different, instead of having
    // arguments as members of `command`, they're all in one specific member
    // (the one after "-ArgumentList")
    if (runnerPath === 'powershell') {
      const argumentListIndex = modifiedCommand.indexOf('-ArgumentList') + 1
      if (!argumentListIndex) continue
      // Rule 1 fix (34.5-61): each `-ArgumentList` member is built by
      // `` `"\`"${part}\`""` `` (callRunner, below) -- i.e. every argument is
      // wrapped as `"`"value`""`, not the bare `"value"` this regex used to
      // assume. The pre-fix pattern (`"${sensitiveArg}","(.*?)"`) could never
      // match that wrapped shape, so NEITHER this new flag set NOR the
      // original `--code`/`--token` were ever actually redacted on the
      // PowerShell branch -- proven RED against the real wrapped shape via
      // the production `callRunner` path (34.5-61-SUMMARY.md capture (c)).
      const argumentList = modifiedCommand[argumentListIndex]
      if (argumentList === undefined) continue
      modifiedCommand[argumentListIndex] = argumentList.replace(
        new RegExp(`\`"${sensitiveArg}\`"","\`"(.*?)\`""`),
        `\`"${sensitiveArg}\`"","\`"<redacted>\`""`
      )
    } else {
      const sensitiveArgIndex = modifiedCommand.indexOf(sensitiveArg)
      if (sensitiveArgIndex === -1) {
        continue
      }
      modifiedCommand[sensitiveArgIndex + 1] = '<redacted>'
    }
  }

  const formattedEnvVars: string[] = []
  for (const [key, value] of Object.entries(env)) {
    // Only add variables if they aren't already defined in our own env
    if (key in process.env) {
      if (value === process.env[key]) {
        continue
      }
    }
    formattedEnvVars.push(`${key}=${quoteIfNecessary(value ?? '')}`)
  }

  return [
    ...formattedEnvVars,
    quoteIfNecessary(runnerPath),
    ...modifiedCommand.map(quoteIfNecessary)
  ].join(' ')
}

export function createCommandRunner(deps: CommandRunnerDeps) {
  const { runner, logger, wine } = deps
  const commandsRunning: Record<string, Promise<ExecResult>> = {}
  let shouldUsePowerShell: boolean | null = null

  async function runWineCommand({
    gameSettings,
    commandParts,
    wait,
    protonVerb = 'run',
    installFolderName,
    gameInstallPath,
    options,
    startFolder,
    skipPrefixCheckIKnowWhatImDoing = false,
    ignoreLogging = false,
    onSpawn,
    resolveOnExit = false
  }: WineCommandArgs): Promise<WineCommandResult> {
    const settings = gameSettings ? gameSettings : wine.getDefaultSettings()
    const { wineVersion, winePrefix } = settings

    if (!skipPrefixCheckIKnowWhatImDoing && wineVersion.type !== 'crossover') {
      let requiredPrefixFiles = [
        'dosdevices',
        'drive_c',
        'system.reg',
        'user.reg',
        'userdef.reg'
      ]
      if (wineVersion.type === 'proton') {
        requiredPrefixFiles = [
          'pfx.lock',
          'tracked_files',
          'version',
          'config_info',
          ...requiredPrefixFiles.map((path) => join('pfx', path))
        ]
      }
      requiredPrefixFiles = requiredPrefixFiles.map((path) =>
        join(winePrefix, path)
      )
      requiredPrefixFiles.push(winePrefix)

      if (!requiredPrefixFiles.every((path) => existsSync(path))) {
        logger.logWarning(
          'Required prefix files are missing, running `verifyWinePrefix` to create prefix',
          logger.backendPrefix
        )
        mkdirSync(winePrefix, { recursive: true })
        await wine.verifyWinePrefix(settings)
      }
    }

    if (!(await wine.validWine(wineVersion))) {
      return { stdout: '', stderr: 'Invalid wine' }
    }

    const envVars: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...options?.env,
      ...wine.setupEnvVars(settings, gameInstallPath),
      ...wine.setupWineEnvVars(settings, installFolderName),
      PROTON_VERB: protonVerb
    }

    if (ignoreLogging) {
      delete envVars['PROTON_LOG']
    }

    const wineBin = wineVersion.bin.replaceAll("'", '')
    const umuSupported = await wine.isUmuSupported(settings)
    const runnerBin = umuSupported ? await wine.getUmuPath() : wineBin

    if (wineVersion.type === 'proton' && !umuSupported) {
      commandParts.unshift(protonVerb)
    }

    logger.logDebug(
      ['Running Wine command:', commandParts.join(' ')],
      logger.backendPrefix
    )

    const wrappers = options?.wrappers || []
    let bin = runnerBin

    if (wrappers.length) {
      bin = wrappers.shift()!
      commandParts.unshift(...wrappers, runnerBin)
    }

    const stdout = memoryLog()
    const stderr = memoryLog()

    const header = `Wine Command: ${bin} ${commandParts.join(' ')}\n\nGame Log:\n`
    // The header is written when the child starts, before any output.
    const writeHeader = () => {
      options?.logWriters?.forEach((writer) => writer.writeString(header))
    }

    const onChunk =
      (log: ReturnType<typeof memoryLog>) =>
      (data: string, child: ChildHandle) => {
        options?.logWriters?.forEach((writer) => writer.writeString(data))
        options?.onOutput?.(data, child)
        log.push(data)
      }

    const res = await runner
      .run(bin, commandParts, {
        env: envVars,
        replaceEnv: true,
        cwd: startFolder,
        track: {
          runner: 'wine',
          key: options?.trackKey ?? installFolderName ?? winePrefix
        },
        onSpawn: (child) => {
          onSpawn?.(child)
          writeHeader()
        },
        onStdout: onChunk(stdout),
        onStderr: onChunk(stderr),
        resolveOn: resolveOnExit ? 'exit' : 'close',
        timeout: {
          none: true,
          reason:
            'a wine command runs as long as the game or installer it hosts; the caller cancels through killTracked or its own deadline'
        },
        windowsHide: false
      })
      .catch((error: unknown) => {
        // The legacy handler only logged a spawn error and never settled; surface an
        // empty result instead of hanging the caller.
        logger.logError(
          ['Wine command failed to run:', error],
          logger.backendPrefix
        )
        return null
      })

    const response: WineCommandResult = {
      stderr: stderr.join(''),
      stdout: stdout.join(''),
      code: res ? res.code : null
    }

    if (wait && wineVersion.wineserver) {
      const waited = await runner
        .run(wineVersion.wineserver, ['--wait'], {
          env: envVars,
          replaceEnv: true,
          cwd: startFolder,
          timeoutMs: WINESERVER_WAIT_TIMEOUT_MS,
          windowsHide: false
        })
        .catch(() => null)
      if (waited?.timedOut) {
        logger.logWarning(
          `wineserver --wait for prefix ${winePrefix} did not finish within 30 minutes; returning the command result without waiting further`,
          logger.backendPrefix
        )
      }
    }

    return response
  }

  async function callRunner(
    commandParts: string[],
    runnerProps: RunnerProps,
    options: CallRunnerOptions
  ): Promise<ExecResult> {
    const appName = appNameFromCommandParts(commandParts, runnerProps.name)

    // Automatically add the relevant LogWriter for the runner
    options.logWriters ??= []
    options.logWriters.push(deps.getRunnerLogWriter(runnerProps.name))

    // Necessary to get rid of possible undefined or null entries
    commandParts = commandParts.filter(Boolean)

    let bin = runnerProps.bin
    let fullRunnerPath = runnerProps.dir ? join(runnerProps.dir, bin) : bin
    const isWindows = deps.platform === 'win32'

    // macOS/Linux: spawning an executable in the current working directory
    // requires a "./"
    if (!isWindows && !isAbsolute(bin) && runnerProps.dir) bin = './' + bin

    // On Windows: Use PowerShell's `Start-Process` to wait for the process and
    // its children to exit, provided PowerShell is available
    if (shouldUsePowerShell === null)
      shouldUsePowerShell =
        isWindows && !!(await deps.searchForExecutableOnPath('powershell'))

    if (shouldUsePowerShell) {
      const argsAsString = commandParts
        .map((part) => part.replaceAll('\\', '\\\\'))
        .map((part) => `"\`"${part}\`""`)
        .join(',')
      commandParts = [
        '-NoProfile',
        'Start-Process',
        `"\`"${fullRunnerPath}\`""`,
        '-Wait',
        '-NoNewWindow'
      ]
      if (argsAsString) commandParts.push('-ArgumentList', argsAsString)

      bin = fullRunnerPath = 'powershell'
    }

    const safeCommand = getRunnerCallWithoutCredentials(
      [...commandParts],
      options?.env,
      fullRunnerPath,
      (command) => deps.commandToArgsArray(command)
    )

    const prefix = `${options.logMessagePrefix ?? 'Running command'}:`
    logger.logInfo([prefix, safeCommand], runnerProps.logPrefix)

    if (options?.logWriters) {
      for (const writer of options.logWriters) {
        await writer.logInfo(
          [prefix, safeCommand, '\n\n'].filter(Boolean).join(' ')
        )
        if (appName) await writer.logInfo('Game Output:')
      }
    }

    // check if the same command is currently running
    // if so, return the same promise instead of running it again
    const key = [runnerProps.name, commandParts].join(' ')
    // 49-REVIEW WR-01 (F-49-R1-5): a caller that observes the stream can never be
    // served by joining someone else's in-flight run, because `onOutput` is only
    // ever invoked from the run this call creates (below). Such a caller neither
    // joins nor registers as joinable; callers without an observer keep the
    // original dedup.
    const joinable = !options?.onOutput
    const currentPromise = commandsRunning[key]

    if (joinable && key in commandsRunning && currentPromise !== undefined) {
      return currentPromise
    }

    const abortId = options?.abortId || appName || Math.random().toString()
    const abortController = deps.abort.create(abortId)

    const stdout = memoryLog()
    const stderr = memoryLog()

    const onChunk =
      (log: ReturnType<typeof memoryLog>) =>
      (data: string, child: ChildHandle) => {
        const stringToLog = options?.logSanitizer
          ? options.logSanitizer(data)
          : data

        options?.logWriters?.forEach((writer) =>
          writer.writeString(stringToLog)
        )
        options?.onOutput?.(data, child)
        log.push(data.trim())
      }

    const execute = async (): Promise<ExecResult> => {
      let result: RunResult
      try {
        result = await runner.run(bin, commandParts, {
          cwd: options?.cwd || runnerProps.dir,
          env: { ...(process.env as Record<string, string>), ...options?.env },
          replaceEnv: true,
          signal: abortController.signal,
          // Phase 72 D-13: on Windows with PowerShell this PID is powershell's
          // (hence the /T tree kill in the runner's tracked registry).
          track: {
            runner: runnerProps.name,
            key: options?.trackKey ?? abortId
          },
          onStdout: onChunk(stdout),
          onStderr: onChunk(stderr),
          timeout: {
            none: true,
            reason:
              'store CLI downloads and installs run for as long as the transfer takes; the user cancels through the abort controller or killTracked'
          },
          windowsHide: false
        })
      } catch (error) {
        return classifyFailure(error)
      }

      if (!options?.skipErrorHandler) {
        void deps.errorHandler(
          `${stdout.join().concat(stderr.join())}`,
          appName,
          runnerProps.name
        )
      }

      if (result.aborted) {
        return classifyFailure(new Error('aborted'))
      }

      // killTracked/killAllTracked ended this child on purpose (stop game, cancel, quit): a
      // cancellation, never an error, even when no abort controller was signalled for it.
      if (result.killedByUs) {
        return classifyFailure(new Error('killed by us'), true)
      }

      if (result.signal) {
        return classifyFailure(
          new Error(`Process terminated with signal ${result.signal}`)
        )
      }

      // debug/steam-install-slow-start (D-2): a process that exits with a
      // non-zero code but WITHOUT an OS-level signal (e.g. a store CLI catching
      // SIGTERM from killAllTracked() and shutting down gracefully with a
      // failure exit code) must not be reported as a successful completion.
      // Rejecting routes the outcome through the same classification below
      // (abort vs error, based on `abortController.signal.aborted`), so a
      // deliberate cancel/quit is still reported as `abort`.
      if (result.code !== 0 && result.code !== null) {
        return classifyFailure(
          new Error(`Process exited with code ${result.code}`)
        )
      }

      return {
        stdout: stdout.join(),
        stderr: stderr.join('\n'),
        fullCommand: safeCommand
      }
    }

    const classifyFailure = (error: unknown, intended = false): ExecResult => {
      if (intended || abortController.signal.aborted) {
        logger.logInfo(
          ['Abort command', `"${safeCommand}"`],
          runnerProps.logPrefix
        )

        return {
          stdout: '',
          stderr: '',
          fullCommand: safeCommand,
          abort: true
        }
      }

      // `errorHandler` expects a `string`, never the raw Error object.
      const errorMessage =
        error instanceof Error ? error.message : String(error)

      if (!options?.skipErrorHandler) {
        void deps.errorHandler(errorMessage, appName, runnerProps.name)
      }

      logger.logError(
        ['Error running', 'command', `"${safeCommand}":`, error],
        runnerProps.logPrefix
      )

      return {
        stdout: '',
        stderr: errorMessage,
        fullCommand: safeCommand,
        error: errorMessage
      }
    }

    const promise: Promise<ExecResult> = execute().finally(() => {
      // remove from list when done (only the registered, joinable run)
      if (joinable && commandsRunning[key] === promise) {
        delete commandsRunning[key]
      }
      deps.abort.remove(abortId)
    })

    // keep track of which commands are running
    if (joinable) {
      commandsRunning[key] = promise
    }

    return promise
  }

  /**
   * Converts Unix paths to Windows ones or vice versa
   * @param path The Windows/Unix path you have
   * @param gameSettings Required for runWineCommand
   * @param variant The path variant (Windows/Unix) that you'd like to get (passed to `winepath` as -u/-w)
   * @returns The path returned by `winepath`
   */
  async function getWinePath({
    path,
    gameSettings,
    variant = 'unix'
  }: {
    path: string
    gameSettings: GameSettings
    variant?: 'win' | 'unix'
  }): Promise<string> {
    logger.logDebug(`Getting wine path for ${path}.`, logger.backendPrefix)
    // TODO: Proton has a special verb for getting Unix paths, and another one for Windows ones. Use those instead
    //       Note that this would involve running `proton runinprefix cmd /c echo path` first to expand env vars
    //       https://github.com/ValveSoftware/Proton/blob/4221d9ef07cc38209ff93dbbbca9473581a38255/proton#L1526-L1533
    const { stdout, stderr } = await runWineCommand({
      gameSettings,
      commandParts: [
        'cmd',
        '/c',
        'winepath',
        variant === 'unix' ? '-u' : '-w',
        path
      ],
      wait: false,
      protonVerb: 'runinprefix',
      ignoreLogging: true
    })

    const result = stdout.trim()
    if (!result) {
      // log-secret-gate-exempt: stderr of `cmd /c winepath` (path translation), not an auth command
      logger.logError(
        `Couldn't get wine path for ${path}.\n${stderr}`,
        logger.backendPrefix
      )
    }

    return result
  }

  /* Execute script before launch/after exit, wait until the script
   * exits to continue
   *
   * The script can start sub-processes with `bash another-command &`
   * if `another-command` should run asynchronously
   *
   * Notes:
   * - Output and logs are printed in the game's log
   * - Make sure the script is executable
   * - Make sure any async process is not stuck running in the background forever,
   *   use the after script to kill any running process if that's the case
   */
  async function runScriptForGame(
    gameInfo: GameInfo,
    gameSettings: GameSettings,
    scriptStage: 'before' | 'after',
    logWriter: LogWriter
  ): Promise<boolean | string> {
    const scriptPath = gameSettings[`${scriptStage}LaunchScriptPath`]
    const scriptEnv = {
      HEROIC_GAME_APP_NAME: gameInfo.app_name,
      HEROIC_GAME_EXEC: gameInfo.install.executable,
      HEROIC_GAME_PREFIX: gameSettings.winePrefix,
      HEROIC_GAME_RUNNER: gameInfo.runner,
      HEROIC_GAME_SCRIPT_STAGE: scriptStage,
      HEROIC_GAME_TITLE: gameInfo.title,
      HEROIC_GAME_SETTINGS: JSON.stringify(gameSettings),
      HEROIC_GAME_INFO: JSON.stringify(gameInfo),
      ...process.env
    }

    const onChunk = gameSettings.verboseLogs
      ? (data: string) => {
          void logWriter.writeString(data)
        }
      : undefined

    try {
      await runner.run(scriptPath, [], {
        cwd: gameInfo.install.install_path,
        env: scriptEnv,
        replaceEnv: true,
        // Resolve when the script exits, not when every background child it
        // started lets go of the pipes.
        resolveOn: 'exit',
        onStdout: onChunk,
        onStderr: onChunk,
        timeout: {
          none: true,
          reason:
            'a launch script runs as long as the user wrote it to; it is the before/after hook of a game session and ends with that session'
        },
        windowsHide: false
      })
    } catch (err) {
      if (gameSettings.verboseLogs) {
        void logWriter.logError(err as Error)
      }
      throw err
    }
    return true
  }

  return { callRunner, runWineCommand, getWinePath, runScriptForGame }
}
