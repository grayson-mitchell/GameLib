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
   * Whether this writer has already passed its one-time rotate gate. Used to
   * rotate log files.
   *
   * Set when the first {@link writeString} ENTERS the gate, not when its write
   * completes -- the gate is about "has this writer already claimed the
   * rotation", and claiming it after an `await` leaves it open to every
   * overlapping caller (debug session `bootstrapwirings-log-drop`). A write
   * that subsequently fails deliberately does NOT reopen it: re-rotating on the
   * next call would archive away whatever did land, which is the bug, not the
   * recovery.
   */
  #wasWrittenTo: boolean
  /**
   * Memoized `mkdir -p` of {@link logFilePath}'s parent, shared by every
   * concurrent {@link writeString}.
   *
   * Kept SEPARATE from {@link #wasWrittenTo} deliberately. The two used to be
   * the same gate, which meant "has this writer rotated yet" and "does the
   * directory exist yet" were answered by one flag -- so closing the rotation
   * race by claiming that flag early also stopped every subsequent write from
   * awaiting the directory, and appends began racing ahead of the `mkdir` with
   * ENOENT. Rotation must happen exactly once; the directory must be awaited by
   * ALL of them. Reset to `undefined` on failure so a later write can retry --
   * a failed `mkdir` must not be remembered as success, but it must also never
   * reopen the rotate gate.
   */
  #logDirectoryReady: Promise<void> | undefined
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
    this.#logDirectoryReady = undefined
    this.#isClosed = false
    this.#messageWaitPromise = Promise.resolve()
  }

  /**
   * Ensures {@link logFilePath}'s parent directory exists, once per writer.
   * Every {@link writeString} awaits this -- including `skipInitialArchive`
   * writers, which previously skipped it along with the rotate block and simply
   * relied on some other writer having made the directory first.
   */
  async #ensureLogDirectory(): Promise<void> {
    if (!this.#logDirectoryReady) {
      this.#logDirectoryReady = fsPromises
        .mkdir(path.dirname(this.logFilePath), { recursive: true })
        .then(() => undefined)
        .catch((error) => {
          // Let a later write try again rather than caching the failure.
          this.#logDirectoryReady = undefined
          throw error
        })
    }
    return this.#logDirectoryReady
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
      // Claim the rotation SYNCHRONOUSLY, before this function's first `await`.
      // Debug session `bootstrapwirings-log-drop`: this flag used to be set only
      // after the `appendFile` below RESOLVED, which left the gate open across
      // the whole first write. The append's bytes reach the file when the call
      // is dispatched to libuv's threadpool, but the continuation that flipped
      // the flag only ran once the event loop picked the completion up -- so any
      // other `writeString` entering in between saw `#wasWrittenTo === false`
      // AND an existing file, and renamed the live log, and everything already
      // written into it, to `.old`. No production caller awaits a `logXXX()`
      // (they are all fire-and-forget), so overlapping entry is the normal case
      // at boot; under load the window widened far enough to silently drop
      // freshly-logged lines out of `gamelib.log`. Claiming it here makes the
      // rotate exactly-once per writer, which is what the constructor docstring
      // already describes as the intended behaviour, and completes the intent of
      // `#archiveOldLogFile`'s own "needs to be synchronous" note.
      this.#wasWrittenTo = true

      this.#archiveOldLogFile()

      // print this message only once when a new log file is created and it's not the general log
      if (!this.#isGeneralLog)
        logDebug(`Logging to file(s) ${this.logFilePath}`, LogPrefix.Backend)
    }

    // Outside the gate above ON PURPOSE -- see #logDirectoryReady's docstring.
    await this.#ensureLogDirectory()

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
