import { LogPrefix } from './constants'
import { logTargetRefusal } from './forwarder'
// Bound at call time, never at load: `./index` imports this file for its two constructors, so a
// load-time use would meet a half-initialised module.
import {
  enqueueLogEntry,
  logLine,
  logWarning,
  oweLogRotation,
  trackLogSettle
} from './index'
import { stringifyLogValue } from './stringifyLogValue'

import type { LogFrameTarget } from 'common/types/sidecarTransport'
import type { LogLevel } from './constants'
import type { LogOptions } from './types'

/*
 * The per-target log writer (Phase 84 plan 04, FND-05, D-05): the old `LogWriter` call-site API
 * (`writeString`, `logDebug|Info|Warning|Error`, `close`) over the sidecar's forwarder. It writes no
 * file. Every call becomes an entry for a typed target (`{ kind: 'game', appName, runner, type }`,
 * `{ kind: 'runner', runner }`, `{ kind: 'gogRedist' }`, `{ kind: 'general' }`) that the Rust writer
 * resolves to a path, rotates and appends.
 *
 * Parity rules the old class carried and this facade keeps:
 * - a disabled writer sends nothing and never rotates; a `forceLog` write on a disabled writer is
 *   sent and claims the rotation;
 * - the first accepted entry of each non-general writer instance carries `rotate: true`, claimed
 *   synchronously before any `await` (debug session `bootstrapwirings-log-drop`: a claim made after
 *   an await let overlapping callers rotate the live log). Rust rotates `gamelib.log` itself, so a
 *   general target never carries it;
 * - `close()` sends the closing marker line (respecting disabled), after which every
 *   later write rejects.
 *
 * Raw chunks are sent as separate entries, never merged: Rust applies the newline and blank rules per
 * chunk (D-06), and a transcript is never altered here (D-15).
 *
 * This module holds no module-level state (moduleStateCensus); the one process-wide forwarder lives
 * in `./index`.
 */

function describeTarget(target: LogFrameTarget): string {
  switch (target.kind) {
    case 'general':
      return 'gamelib.log'
    case 'gogRedist':
      return 'gog-redist.log'
    case 'runner':
      return `${target.runner} runner log`
    case 'game':
      return `${target.appName} (${target.runner}) ${target.type} log`
  }
}

const END_OF_LOG = '============= End of log ============='

export default class LogWriter {
  readonly #target: LogFrameTarget
  /** Whether logs are disabled: a call without `forceLog` sends nothing. */
  readonly #logsDisabled: boolean
  /** True for a target Rust would reject: the writer sends nothing at all. */
  readonly #refused: boolean
  /** Whether the next accepted entry still has to carry the rotate flag. */
  #rotatePending: boolean
  #closed = false
  /** Tail of the chain of Promise-valued raw messages, so one writer's entries keep their order. */
  #tail: Promise<void> = Promise.resolve()
  /** How many chained steps have not finished: while any are, later entries queue behind them. */
  #pending = 0

  public constructor(target: LogFrameTarget, logsDisabled: boolean) {
    this.#target = target
    this.#logsDisabled = logsDisabled
    this.#rotatePending = target.kind !== 'general'
    const refusal = logTargetRefusal(target)
    this.#refused = refusal !== null
    if (refusal !== null) {
      logWarning(`log target refused: ${refusal}`, LogPrefix.Backend)
    }
  }

  public get target(): LogFrameTarget {
    return this.#target
  }

  /** The rotate flag for the entry being accepted now: true exactly once, claimed synchronously. */
  #claimRotate(): boolean {
    const rotate = this.#rotatePending
    this.#rotatePending = false
    return rotate
  }

  /**
   * Sends a chunk of text for this target as one raw entry, in call order. A Promise message holds
   * the later chunks of this writer until it settles.
   */
  async writeString(
    message: string | Promise<string>,
    forceLog: boolean = false
  ): Promise<void> {
    if (this.#closed)
      throw new Error(
        `Attempted to write to log file "${describeTarget(this.#target)}" after it was closed`
      )

    if (this.#refused) return
    if (this.#logsDisabled && !forceLog) return

    // Claim the rotation SYNCHRONOUSLY, before this function's first `await`.
    const rotate = this.#claimRotate()
    const send = (text: string): void => {
      enqueueLogEntry(this.#target, rotate, { raw: text })
    }

    if (typeof message === 'string' && this.#pending === 0) {
      send(message)
      return
    }
    const link = this.#tail
      .then(() => message)
      .then(send, (error: unknown) => {
        // The entry never reaches a frame, so its rotation is not spent: the next write carries it.
        if (rotate) oweLogRotation(this.#target)
        throw error
      })
    // The chain survives a rejected message; the caller of THIS write still sees the rejection.
    this.#extend(link)
    await link
  }

  #extend(link: Promise<unknown>): void {
    this.#pending += 1
    const done = (): void => {
      this.#pending -= 1
    }
    this.#tail = link.then(done, done)
    // The forwarder's flush must see this link too, or a fatal exit loses the held lines (WR-09).
    trackLogSettle(this.#tail)
  }

  /** Sends one structured line (formatted by Rust from the call-time clock) for this target. */
  #logBase(
    message: unknown,
    level: LogLevel,
    options: LogOptions | undefined
  ): Promise<void> {
    if (this.#closed) {
      return Promise.reject(
        new Error(
          `Attempted to write to log file "${describeTarget(this.#target)}" after it was closed`
        )
      )
    }
    const forceLog = typeof options === 'string' ? false : options?.forceLog
    if (this.#refused) return Promise.resolve()
    if (this.#logsDisabled && !forceLog) return Promise.resolve()

    const prefix =
      (typeof options === 'string' ? options : options?.prefix) ??
      LogPrefix.General
    const rotate = this.#claimRotate()
    // The call-time clock (D-12): a line held behind a Promise message is enqueued later, but is
    // stamped now (WR-10).
    const at = Date.now()
    // Convert here, synchronously, so the writer knows whether the message is asynchronous: the
    // forwarder would hold such a line in its own chain, which this writer's later writes cannot
    // see, and a later write could then overtake it (WR-08).
    const body = stringifyLogValue(message)
    if (typeof body === 'string') {
      if (this.#pending === 0) {
        logLine(this.#target, rotate, level, prefix, body, at)
      } else {
        this.#extend(
          this.#tail.then(() => {
            logLine(this.#target, rotate, level, prefix, body, at)
          })
        )
      }
    } else {
      // Chain the Promise message like `writeString` does, so later writes queue behind it and an
      // owed rotation (the message rejected) reaches the first entry queued after it, never one
      // already written (WR-08).
      body.catch(() => undefined)
      this.#extend(
        this.#tail
          .then(() => body)
          .then(
            (text) => {
              logLine(this.#target, rotate, level, prefix, text, at)
            },
            () => {
              if (rotate) oweLogRotation(this.#target)
            }
          )
      )
    }
    return Promise.resolve()
  }

  public logDebug(message: unknown, options?: LogOptions): Promise<void> {
    return this.#logBase(message, 'DEBUG', options)
  }

  public logInfo(message: unknown, options?: LogOptions): Promise<void> {
    return this.#logBase(message, 'INFO', options)
  }

  public logWarning(message: unknown, options?: LogOptions): Promise<void> {
    return this.#logBase(message, 'WARNING', options)
  }

  public logError(message: unknown, options?: LogOptions): Promise<void> {
    return this.#logBase(message, 'ERROR', options)
  }

  /**
   * Sends a final message before closing. Any later write rejects.
   */
  public async close(): Promise<void> {
    await this.writeString(END_OF_LOG)
    this.#closed = true
  }
}
