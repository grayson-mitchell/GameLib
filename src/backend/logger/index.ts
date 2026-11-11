import os from 'os'

import { LogPrefix, RunnerToLogPrefixMap } from './constants'
import LogWriter from './log_writer'
import { GameLogType, getLogFilePath } from './paths'

import type { Runner } from 'common/types'
import type { RunnerOrComet } from './types'

let heroicLogWriter: LogWriter
const runnerLogWriters = new Map<RunnerOrComet, LogWriter>()

const logDebug = (...params: Parameters<LogWriter['logDebug']>) => {
  heroicLogWriter.logDebug(...params)
}
const logInfo = (...params: Parameters<LogWriter['logInfo']>) => {
  heroicLogWriter.logInfo(...params)
}
const logWarning = (...params: Parameters<LogWriter['logWarning']>) => {
  heroicLogWriter.logWarning(...params)
}
const logError = (...params: Parameters<LogWriter['logError']>) => {
  heroicLogWriter.logError(...params)
}

/**
 * `logErrorSettled` (Phase 34.2 gap cycle 4, plan 34.2-26 — closes CR-01):
 * added BESIDE `logError` above, not in place of it. `logError` and
 * `logErrorSettled` are one-line siblings over the identical
 * `Parameters<LogWriter['logError']>` type, so they cannot drift
 * semantically — the only difference is that this one is an EXPRESSION
 * body, so it actually `return`s the `Promise<void>` `heroicLogWriter
 * .logError(...)` produces, instead of silently dropping it the way the
 * block-body `logError` above does (and the way `logDebug`/`logWarning`
 * still do). `loggerFlowRegistration.ts`'s `logError` IPC listener imports
 * THIS export so its call-site `.catch` guard has a real promise to attach
 * to.
 *
 * Deliberately NOT applied to `logDebug`/`logWarning`/`logError` above:
 * this project measured 309 statement-position `logError(...)` call sites
 * under `src/backend` (excluding `src/backend/logger/` and `__tests__`),
 * none of them awaited, and `eslint.config.mjs:39` sets
 * `@typescript-eslint/no-floating-promises` to `warn` — so changing the
 * shared wrapper's inferred return type from `void` to `Promise<void>`
 * would add roughly 309 new warnings against a current backend baseline in
 * the low thousands (a project-wide, undeclared blast radius), with ZERO
 * runtime behavior change, since the promise is dropped either way — only
 * the drop site moves from inside this file to every one of those 309
 * call sites. The code review that raised CR-01 named this blast radius
 * and asked for it to be audited before acting; this comment IS that
 * audit's result. Widening all four wrappers remains a separately-scoped
 * follow-up, already recorded in this phase's `deferred-items.md` under
 * "From plan 34.2-20", and restated by plan 34.2-30.
 *
 * Phase 34.3 plan 04 (REQ-34.3-09) added `logInfoSettled` below for the
 * identical call-site-guard reason — `logInfo` is a `send` channel and, per
 * the `sidecar-send-channels-fail-silently` gotcha, a call-site rejection
 * that escapes its listener would kill the sidecar. The shared-wrapper
 * widening described above remains the same separately-scoped deferred
 * follow-up for both `logInfo` and `logError`.
 */
const logErrorSettled = (
  ...params: Parameters<LogWriter['logError']>
): Promise<void> => heroicLogWriter.logError(...params)

/**
 * `logInfoSettled` (Phase 34.3 plan 04 — REQ-34.3-09): byte-shape-identical
 * sibling of `logErrorSettled` above, over `logInfo`'s own parameter type.
 * `logInfo` above is a block-body wrapper that drops the `Promise<void>`
 * `heroicLogWriter.logInfo(...)` returns; this expression-body sibling
 * forwards it instead, so `loggerFlowRegistration.ts`'s `logInfo` send
 * listener has a real promise to attach its call-site `.catch` guard to —
 * the exact same reason `logErrorSettled` exists.
 */
const logInfoSettled = (
  ...params: Parameters<LogWriter['logInfo']>
): Promise<void> => heroicLogWriter.logInfo(...params)

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
    getLogFilePath({ runner }),
    false,
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
    getLogFilePath({ appName, runner, type }),
    false,
    settings.disableLogs || logsDisabledPerGame
  )
}

/**
 * Writer initialization for the headless sidecar (`backend/sidecar/bootstrap.ts`). Assigns
 * `heroicLogWriter` directly so the REAL `logInfo`/`logWarning`/`logError` calls throughout
 * the backend have a writer to dereference. The Electron-era `init()` (GlobalConfig read,
 * one-time system-info dump, `settingChanged` listener) had no caller and was deleted in
 * 66.3-06 so this module imports no config.
 */
function initHeadless(): void {
  heroicLogWriter = new LogWriter(getLogFilePath({}), false, false)
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
  heroicLogWriter.logInfo(
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
  RunnerToLogPrefixMap,
  getLogFilePath
}
