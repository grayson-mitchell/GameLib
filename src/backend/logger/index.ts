import { GameConfig } from 'backend/game_config'
import { GlobalConfig } from 'backend/config'
import { formatSystemInfo, getSystemInfo } from 'backend/utils/systeminfo'
import { backendEvents } from 'backend/backend_events'

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

function getRunnerLogWriter(runner: RunnerOrComet) {
  const writer = runnerLogWriters.get(runner)
  if (writer) return writer

  const globalConfig = GlobalConfig.get().getSettings()
  const newWriter = new LogWriter(
    getLogFilePath({ runner }),
    false,
    globalConfig.disableLogs
  )
  runnerLogWriters.set(runner, newWriter)
  return newWriter
}

async function createGameLogWriter(
  appName: string,
  runner: Runner,
  type: GameLogType = 'launch'
): Promise<LogWriter> {
  const logsDisabledGlobally = GlobalConfig.get().getSettings().disableLogs
  const logsDisabledPerGame =
    type === 'launch'
      ? !(await GameConfig.get(appName).getSettings()).verboseLogs
      : false

  return new LogWriter(
    getLogFilePath({ appName, runner, type }),
    false,
    logsDisabledGlobally || logsDisabledPerGame
  )
}

/**
 * Headless-safe writer initialization (Phase 27 Plan 04 deviation — Rule 3,
 * blocking). Assigns `heroicLogWriter` directly, skipping the Electron-app-
 * only side effects `init()` below performs: `GlobalConfig.get()` (assumes
 * an already-initialized `userData` config directory/file — a real
 * Electron app guarantees this before app code runs, a headless sidecar
 * process does not), the one-time system-info dump (shells out to
 * hardware/binary-version probes via a fire-and-forget async chain that can
 * outlive a short-lived caller — e.g. a test process tearing down before it
 * resolves), and the `settingChanged` event listener (meaningless without
 * GlobalConfig). Used ONLY by the headless sidecar
 * (`backend/sidecar/bootstrap.ts`) so the REAL `logInfo`/`logWarning`/
 * `logError` calls throughout the backend's existing code (reused unchanged
 * by the sidecar's curated Steam flows, Plan 04's own objective) have a
 * writer to dereference, without pulling in Electron-app-only startup
 * machinery the sidecar doesn't have. `init()` itself is completely
 * unmodified — the Electron main process's own startup path is unaffected.
 */
function initHeadless(skipInitialArchive: boolean = false): void {
  // Phase 23.1 plan 05 (coordinator-directed fix): also the ONLY init path a
  // DecompressPool-spawned worker_threads.Worker can use -- a worker's own
  // V8 isolate gets a fresh, independent module registry that never runs
  // the sidecar main thread's call to this function, so decompressWorker.ts
  // calls it too, as the first statement inside its own `if (parentPort)`
  // block (see that file). `skipInitialArchive` is forwarded to LogWriter
  // unchanged (see its own doc comment on the same parameter) -- the
  // sidecar's main-thread call site (bootstrap.ts) is unaffected, still
  // defaulting to `false`; decompressWorker.ts is the one caller that
  // passes `true`.
  heroicLogWriter = new LogWriter(
    getLogFilePath({}),
    false,
    false,
    skipInitialArchive
  )
}

function init() {
  // Add a basic error handler to our stdout/stderr. If we don't do this,
  // the main `process.on('uncaughtException', ...)` handler catches them (and
  // presents an error message to the user, which is hardly necessary for
  // "just" failing to write to the streams)
  for (const channel of ['stdout', 'stderr'] as const) {
    process[channel].once('error', (error: Error) => {
      heroicLogWriter.writeString(`Error writing to ${channel}: ${error.stack}`)

      process[channel].on('error', () => {
        // Silence further write errors
      })
    })
  }

  const globalSettings = GlobalConfig.get().getSettings()
  heroicLogWriter = new LogWriter(
    getLogFilePath({}),
    true,
    globalSettings.disableLogs
  )

  if (globalSettings.disableLogs)
    heroicLogWriter.logWarning(
      'IMPORTANT: Logs are disabled. Enable logs before reporting any issue',
      { forceLog: true }
    )

  heroicLogWriter.logInfo(
    ['System Information:', getSystemInfo().then(formatSystemInfo)],
    LogPrefix.Backend
  )

  backendEvents.on('settingChanged', ({ key, oldValue, newValue }) =>
    heroicLogWriter.logInfo([
      'Settings key',
      key,
      'changed from',
      oldValue,
      'to',
      newValue
    ])
  )
}

export {
  init,
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
