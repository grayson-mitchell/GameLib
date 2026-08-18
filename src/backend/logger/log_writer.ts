import { existsSync, renameSync } from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'

import { LogLevel, LogPrefix } from './constants'
import { formatLogMessage } from './formatter'

import type { LogOptions } from './types'

import { getLogFilePath, logDebug } from './index'

const LOG_LEVEL_LOGGING_FUNC: Record<LogLevel, (message: string) => unknown> = {
  DEBUG: console.log,
  INFO: console.log,
  WARNING: console.warn,
  ERROR: console.error
}

export default class LogWriter {
  /** The log file path the writer should write into */
  public readonly logFilePath: string
  /** Whether the writer should also output to `console.log`/`.warn`/`.error` */
  readonly #outputToOsStreams: boolean
  /**
   * Whether logs are disabled. If they are, calls to {@link logBase} that don't
   * have the {@link LogOptions#forceLog} option set aren't logged
   */
  readonly #logsDisabled: boolean

  readonly #isGeneralLog: boolean

  /**
   * Whether the log file was already written to by this writer. Used to rotate
   * log files
   */
  #wasWrittenTo: boolean
  /** Whether the log file was closed by calling {@link close} */
  #isClosed: boolean
  /**
   * A {@link Promise} the writer waits for before writing new messages to the
   * file. This is used in case a Promise is passed to {@link writeString}
   */
  #messageWaitPromise: Promise<unknown>

  /**
   * Phase 23.1 plan 05 (coordinator-directed fix, worker-thread logger
   * initialization defect): `skipInitialArchive` seeds {@link #wasWrittenTo}
   * as already-true instead of `false`, so THIS writer's own first write
   * never triggers {@link #archiveOldLogFile}. Exists for exactly one
   * caller shape: multiple independent `LogWriter` instances -- one per
   * `worker_threads.Worker` spawned by `DecompressPool`, up to
   * `DECOMPRESS_POOL_MAX_WORKERS` of them, plus the sidecar's own
   * main-thread writer -- all constructed against the SAME physical
   * `logFilePath` (`getLogFilePath({})`, `gamelib.log`) within the same
   * live process. `#archiveOldLogFile`'s rotate-on-first-write behavior is
   * correct for exactly one writer per file per process lifetime (the
   * sidecar main thread's own boot-time writer, unchanged, still defaults
   * `skipInitialArchive` to `false`); without this flag, every ADDITIONAL
   * worker's writer would independently rename the CURRENT, actively-
   * written-to `gamelib.log` to `gamelib.log.old` on its own first log
   * call -- a genuine multi-writer log-corruption race (each subsequent
   * worker's first write clobbering whatever the previous writer/thread had
   * just started), not merely a cosmetic rotation. Workers with this flag
   * set simply append to whatever `heroicLogWriter` (the main thread's
   * writer, which already ran its own one-time archive at boot) already
   * created -- the same thing every SUBSEQUENT call on that main-thread
   * writer already does once its own `#wasWrittenTo` flips true.
   */
  public constructor(
    logFilePath: string,
    outputToOsStreams: boolean,
    logsDisabled: boolean,
    skipInitialArchive: boolean = false
  ) {
    this.logFilePath = logFilePath
    this.#outputToOsStreams = outputToOsStreams
    this.#logsDisabled = logsDisabled
    this.#isGeneralLog = logFilePath === getLogFilePath({})
    this.#wasWrittenTo = skipInitialArchive
    this.#isClosed = false
    this.#messageWaitPromise = Promise.resolve()
  }

  public get oldLogFilePath(): string {
    return this.logFilePath + '.old'
  }

  /**
   * Renames {@link logFilePath} to {@link oldLogFilePath} if it exists. If
   * {@link oldLogFilePath} already exists, it is overwritten
   */
  #archiveOldLogFile() {
    // NOTE: This function needs to be synchronous since, in practice, most
    //       LogWriter users don't `await` the `logXXX` calls. If this function
    //       would be async, Having two calls happen in quick succession will
    //       make them both try to archive the log file, which doesn't go well
    const haveToArchive = existsSync(this.logFilePath)
    if (!haveToArchive) return
    return renameSync(this.logFilePath, this.oldLogFilePath)
  }

  /**
   * Writes a string to the log file, waiting for any previous messages in the
   * queue to be written first
   */
  async writeString(
    message: string | Promise<string>,
    forceLog: boolean = false
  ): Promise<void> {
    if (this.#isClosed)
      throw new Error(
        `Attempted to write to log file "${this.logFilePath}" after it was closed`
      )

    if (this.#logsDisabled && !forceLog) {
      return
    }

    if (!this.#wasWrittenTo) {
      this.#archiveOldLogFile()

      // print this message only once when a new log file is created and it's not the general log
      if (!this.#isGeneralLog)
        logDebug(`Logging to file(s) ${this.logFilePath}`, LogPrefix.Backend)
      const dirname = path.dirname(this.logFilePath)
      await fsPromises.mkdir(dirname, { recursive: true })
    }

    // Wait for any previously-submitted Promise<string>s to be written first
    await this.#messageWaitPromise

    // If our message is a Promise<string>, add it to the chain of `#messageWaitPromise`
    // Any future calls to `writeString` will then wait on the new chain with
    // this message added
    if (message instanceof Promise) {
      this.#messageWaitPromise = this.#messageWaitPromise.then(() => message)
      message = await message
    }

    if (!message.trim().length) return

    // Append a newline only if there isn't one already. This is used in favor
    // of `.trim()`ing the message as it still allows for messages to insert
    // additional whitespace if desired
    const appendNewline = !message.endsWith('\n')
    if (appendNewline) message += '\n'

    await fsPromises.appendFile(this.logFilePath, message, 'utf-8')
    this.#wasWrittenTo = true
  }

  /**
   * Formats a log message and logs it to {@link logFilePath} and, if enabled,
   * the console
   */
  private async logBase(
    message: unknown,
    level: LogLevel,
    options_or_prefix?: LogOptions
  ): Promise<void> {
    let options: LogOptions
    if (typeof options_or_prefix === 'string') {
      options = { prefix: options_or_prefix }
    } else {
      options = options_or_prefix ?? {}
    }

    const messageStrPromise = formatLogMessage(
      message,
      level,
      options.prefix ?? LogPrefix.General
    )

    const fileWritePromise = this.writeString(
      messageStrPromise,
      options.forceLog
    )
    const consoleLogWritePromise = this.#outputToOsStreams
      ? messageStrPromise.then(LOG_LEVEL_LOGGING_FUNC[level])
      : Promise.resolve()
    await Promise.all([fileWritePromise, consoleLogWritePromise])
  }

  public logDebug(message: unknown, options?: LogOptions) {
    return this.logBase(message, 'DEBUG', options)
  }

  public logInfo(message: unknown, options?: LogOptions) {
    return this.logBase(message, 'INFO', options)
  }

  public logWarning(message: unknown, options?: LogOptions) {
    return this.logBase(message, 'WARNING', options)
  }

  public logError(message: unknown, options?: LogOptions) {
    return this.logBase(message, 'ERROR', options)
  }

  /**
   * Writes a final message to the log file before closing it. Any future calls
   * of {@link writeString} will throw an Error
   */
  public async close() {
    await this.writeString('============= End of log =============')
    this.#isClosed = true
  }
}
