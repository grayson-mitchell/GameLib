import os from 'os'

import { LogPrefix, RunnerToLogPrefixMap } from './constants'
import { LogForwarder } from './forwarder'
import LogWriter from './targetWriter'

import type { Runner } from 'common/types'
import type {
  GameLogType,
  LogFrameEntry,
  LogFrameTarget
} from 'common/types/sidecarTransport'
import type { LogLevel } from './constants'
import type { LogTransport } from './forwarder'
import type { LogOptions, RunnerOrComet } from './types'

/**
 * The ONE process-wide piece of general-log state (moduleStateCensus: this file is sanctioned for
 * two module-state sites, this and `runnerLogWriters`). Every general log call below queues into it;
 * the forwarder sends frames to the Rust shell, which writes `gamelib.log` (Phase 84, FND-05).
 */
const logForwarder = new LogForwarder()
const runnerLogWriters = new Map<RunnerOrComet, LogWriter>()

function logGeneral(
  level: LogLevel,
  message: unknown,
  options?: LogOptions
): void {
  const prefix =
    (typeof options === 'string' ? options : options?.prefix) ??
    LogPrefix.General
  logForwarder.logLine({ kind: 'general' }, false, level, prefix, message)
}

const logDebug = (message: unknown, options?: LogOptions): void => {
  logGeneral('DEBUG', message, options)
}
const logInfo = (message: unknown, options?: LogOptions): void => {
  logGeneral('INFO', message, options)
}
const logWarning = (message: unknown, options?: LogOptions): void => {
  logGeneral('WARNING', message, options)
}
const logError = (message: unknown, options?: LogOptions): void => {
  logGeneral('ERROR', message, options)
}

/**
 * `logErrorSettled` (Phase 34.2 plan 34.2-26, CR-01; reshaped for Phase 84 D-10): queues the line
 * exactly like `logError` and returns a promise that resolves once the entry has been handed to
 * stdout (the stream's write callback), after at most `LOG_FLUSH_TIMEOUT_MS`, or at once when no
 * transport is bound. It never rejects, so a call-site `.catch` guard
 * and the fatal `uncaughtException` guard (Phase 72 D-04, which awaits it before exiting) can
 * never be failed or hung by a log write. The old rejection path (a general writer failing on
 * ENOTDIR) no longer exists: the native writer owns the file.
 *
 * It settles through the shared `flush`, so it also waits (inside the same bound) for every
 * Promise-valued message any target writer holds, and the writes queued behind each (IN-11, via
 * `trackLogSettle`). That is deliberate: its one production caller is the fatal
 * `uncaughtException` sink, the exit path WR-09 exists for, and a settle that skipped those links
 * would lose a game or runner writer's held lines on a fatal exit. The cost is latency: while
 * any writer holds a Promise message that never settles, every call takes the full
 * `LOG_FLUSH_TIMEOUT_MS` (2 s), whatever its own entry is.
 *
 * On that fatal path the guard's own cap ends the wait first: it races this promise against
 * `UNCAUGHT_FLUSH_CAP_MS` (1.5 s, `sidecar/processGuards.ts`) and then exits. So the full 2 s never
 * happens there, held lines that settle after 1.5 s are lost there, and with a target writer's link
 * that never settles (`trackLogSettle`) the chain wait uses the guard's whole window: the fatal
 * entry then reaches stdout only through the 50 ms tick, and its write callback is never awaited
 * (IN-14). A general-log Promise message that never settles is worse: the fatal entry is chained
 * behind it on the general target, so it never reaches stdout at all (IN-15).
 *
 * Deliberately NOT applied to `logDebug`/`logWarning`/`logError` above: widening the shared
 * wrappers to return a promise would add roughly 309 floating-promise warnings at the
 * statement-position call sites with no runtime change (the 34.2-26 audit).
 */
const logErrorSettled = (
  message: unknown,
  options?: LogOptions
): Promise<void> => {
  logGeneral('ERROR', message, options)
  return logForwarder.flush()
}

/**
 * `logInfoSettled` (Phase 34.3 plan 04, REQ-34.3-09): the `logInfo` sibling of `logErrorSettled`.
 * It has no production caller today: it is kept as that sibling and is listed in
 * `meta/logSecretGate.ts` (IN-13). It shares `flush`, so a future caller would carry the same
 * coupling to the target writers' held Promise messages (IN-11, see `logErrorSettled`): up to the
 * full `LOG_FLUSH_TIMEOUT_MS` while any writer holds one that has not settled.
 */
const logInfoSettled = (
  message: unknown,
  options?: LogOptions
): Promise<void> => {
  logGeneral('INFO', message, options)
  return logForwarder.flush()
}

/**
 * Queues one entry for a typed target on the process-wide forwarder. The per-target `LogWriter`
 * facade (`./targetWriter`) reaches the forwarder through this and `logLine` at call time, so the
 * forwarder stays this file's one module-state site.
 */
function enqueueLogEntry(
  target: LogFrameTarget,
  rotate: boolean,
  entry: LogFrameEntry
): void {
  logForwarder.enqueue(target, rotate, entry)
}

/**
 * Records that a rotation a writer claimed did not reach a frame (a rejected Promise message), so
 * the next entry for the target carries it (WR-05). Bound at call time like `enqueueLogEntry`.
 */
function oweLogRotation(target: LogFrameTarget): void {
  logForwarder.oweRotation(target)
}

/**
 * Registers a pending link of a target writer's own chain with the forwarder, so `flush` (the fatal
 * exit guard, `releaseOnStdinEof`) waits for a Promise-valued message the writer holds (WR-09).
 * Every `flush` caller waits on it, including `logErrorSettled` and `logInfoSettled` (IN-11): a
 * link that never settles costs each of them the full `LOG_FLUSH_TIMEOUT_MS` until it does.
 * Bound at call time like `enqueueLogEntry`.
 */
function trackLogSettle(link: Promise<unknown>): void {
  logForwarder.trackSettle(link)
}

/**
 * Queues one structured line for a typed target (the facade's `logDebug|Info|Warning|Error`). `at`
 * is the call-time clock the facade took before it held the line (WR-10, D-12).
 */
function logLine(
  target: LogFrameTarget,
  rotate: boolean,
  level: LogLevel,
  prefix: string,
  message: unknown,
  at?: number
): void {
  logForwarder.logLine(target, rotate, level, prefix, message, at)
}

/**
 * Binds the stdout transport the forwarder sends frames on (the 'sidecar-rpc' boot step). Lines
 * logged before this call wait in the forwarder's queue, up to its caps.
 */
function bindLogTransport(transport: LogTransport): void {
  logForwarder.bind(transport)
}

/**
 * Hands every queued line to stdout and waits for the write (bounded, never rejects). Called last
 * by `releaseOnStdinEof`, so the loop can drain with nothing left in the queue.
 */
function flushLogForwarder(): Promise<void> {
  return logForwarder.flush()
}

/**
 * The caller passes `disableLogs` (66.3-06): this module reads no config. The writer is
 * cached per runner on first use, so a later call with a different `disableLogs` returns the
 * first writer.
 */
function getRunnerLogWriter(
  runner: RunnerOrComet,
  settings: { disableLogs: boolean }
) {
  const writer = runnerLogWriters.get(runner)
  if (writer) return writer

  const newWriter = new LogWriter(
    { kind: 'runner', runner },
    settings.disableLogs
  )
  runnerLogWriters.set(runner, newWriter)
  return newWriter
}

/**
 * `verboseLogs` is the per-game setting; it only matters for the 'launch' log type. Both
 * settings are required (no defaults) so a caller cannot silently skip them.
 */
async function createGameLogWriter(
  appName: string,
  runner: Runner,
  type: GameLogType,
  settings: { disableLogs: boolean; verboseLogs: boolean }
): Promise<LogWriter> {
  const logsDisabledPerGame = type === 'launch' ? !settings.verboseLogs : false

  return new LogWriter(
    { kind: 'game', appName, runner, type },
    settings.disableLogs || logsDisabledPerGame
  )
}

/**
 * The 'logger' boot step's marker. The general log has no writer to create any more: it is the
 * forwarder (`logForwarder` above), usable from module load, and the shell owns the file. Kept so
 * the boot step order and the `initHeadless as initLogger` import stay as they were.
 */
function initHeadless(): void {
  // Nothing to do: see above.
}

/**
 * Logs one boot line of cheap, static facts (platform, arch, OS release, CPU model/count, total
 * memory). Everything here is an in-process `os` read: no child process, no I/O, nothing to bound.
 *
 * The full System Information dump (GPU via lspci/powershell, OS name, runner `--version` probes,
 * comet `spawnSync`) is deliberately NOT run at boot. It is spawn-heavy, referenced and (before
 * the probes were bounded) unbounded, so running it at boot violated the sidecar's exit contract
 * (A-CR-1, 66.1 review). It is fetched lazily by the `getSystemInfo` RPC and by launch-time logging.
 */
export function logBootFacts(): void {
  const cpus = os.cpus()
  logInfo(
    [
      'System facts:',
      `${process.platform} ${process.arch} ${os.release()},`,
      `CPU: ${cpus[0]?.model ?? 'unknown'} x${cpus.length},`,
      `memory: ${Math.round(os.totalmem() / 1024 ** 3)} GiB`
    ],
    LogPrefix.Backend
  )
}

export {
  bindLogTransport,
  enqueueLogEntry,
  oweLogRotation,
  trackLogSettle,
  logLine,
  flushLogForwarder,
  initHeadless,
  logDebug,
  logInfo,
  logInfoSettled,
  logWarning,
  logError,
  logErrorSettled,
  getRunnerLogWriter,
  createGameLogWriter,
  LogPrefix,
  RunnerToLogPrefixMap
}
