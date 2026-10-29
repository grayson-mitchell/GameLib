/**
 * quick/261016-t3e: bottled-Steam launch started/stopped feedback.
 *
 * `dispatchToBottledSteam('launch', …)` (bottle.ts) returns `{status:'done'}`
 * the instant `runWineCommand({wait:false})` hands the `-applaunch` command
 * off to the bottled Windows Steam client. Nothing in that file watches for
 * the GAME ITSELF actually starting: `raiseBottledGameWindow` only raises a
 * window if one appears within ~18s, and the native running-game poller
 * (`library.ts pollRunningOnce`) reads the native macOS Steam `registry.vdf`,
 * which a bottled WINDOWS Steam never writes. So a bottled launch has never
 * produced a `playing`/`done` `gameStatusUpdate`, and there is no session
 * duration either — Play looks dead even when the game is genuinely running,
 * and worse when Steam itself blocks the launch (the measured ~6-minute
 * one-session-per-account block).
 *
 * This module adopts Playnite's SteamPlayController pattern: poll `ps` for
 * any process whose executable path lives under the game's OWN bottle
 * install directory. First match = `playing`. The matched set emptying again
 * = `done` plus a logged session duration. There is deliberately NO deadline
 * on the first match (LD-4) — a Steam block the user simply waits out still
 * resolves correctly once the game actually starts, however long that takes.
 *
 * Exports: `startBottleProcessMonitor` (returns a `BottleProcessMonitorHandle`
 * or null), `stopBottleProcessMonitor`, `getBottleProcessMonitorPhase`
 * (quick/261024-gvu: 'starting' | 'running' | null, the single-flight guard's
 * probe), `__stopAllBottleProcessMonitors` and
 * `__getActiveMonitorKindForTests`. Production never calls the test hooks —
 * they exist so tests can guarantee `jest.getTimerCount()` returns to 0
 * between cases and observe the default `kind`.
 *
 * Plan 51-23: a caller that launches through a wrapper process (the bridge's
 * `winewrapper.exe --run`) signals that wrapper's exit via the handle's
 * `launcherExited()`. When no game process was ever matched, the launcher's
 * own exit is the bound for the no-match case instead of a deadline (LD-4 /
 * CONTEXT: "Deadline on first process match ... is deliberately absent"), so
 * a crashed or failed launch still stops its helper. `onStopped` fires once
 * on every terminal path except supersede/cancel.
 *
 * quick/261024-g3m: on the first match (both `bridge` and `bottled-steam`
 * kinds) the matched pid(s) and their exe names are handed to
 * `raiseWineGameWindow` (fire-and-forget, best-effort) so the game window
 * comes to the front instead of opening behind GameLib.
 */
import { relative, sep } from 'node:path'
import { spawnAsync } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import {
  raiseWineGameWindow,
  windowsExeNameFromCommand
} from 'backend/utils/wineWindowRaise'
import { sendFrontendMessage } from '../../ipc'
import { recordPlaySession } from 'backend/runsForMe'
import type { SteamBottleLaunchWaitingCause } from 'common/types/steam'
import {
  readBoundedTail,
  classifyBottledSteamBlock,
  bottledSteamLogPaths,
  WAITING_FOR_STEAM_GRACE_MS,
  WAITING_RECHECK_MS
} from './bottleLaunchSignals'

/** Default poll cadence while a match has already been seen. */
const DEFAULT_POLL_INTERVAL_MS = 1500

/**
 * After this much wall time with no match yet, back the cadence off to
 * reduce `ps` churn during a long Steam block the user has walked away from.
 * LD-4 forbids a give-up deadline — this only slows the loop, it never stops
 * it or gives up on the first match.
 */
const NO_MATCH_BACKOFF_AFTER_MS = 10 * 60 * 1000
const NO_MATCH_BACKOFF_INTERVAL_MS = 10 * 1000

/** Bounded-cost guard: stop a monitor whose `ps` spawn is persistently wedged. */
const MAX_CONSECUTIVE_SPAWN_FAILURES = 20

// Duplicated locally (NOT imported from bottle.ts) to avoid a cycle — see
// bottle.ts's own `STEAM_CLIENT_PROCESS_NAMES` comment. This filter is
// belt-and-braces: these binaries live outside `steamapps\common`, so under
// a correct install-directory prefix they cannot match anyway.
const STEAM_CLIENT_PROCESS_NAMES = [
  'steam.exe',
  'steamwebhelper.exe',
  'SteamSetup.exe',
  'GameOverlayUI.exe'
]

interface MonitorEntry {
  cancelled: boolean
  timers: Set<ReturnType<typeof setTimeout>>
  onStopped?: () => void
  /** True once any game process has matched (read by launcherExited). */
  everMatched: boolean
  matchedAt: number
  /** Guards onStopped to fire at most once per monitor. */
  stoppedFired: boolean
  /** Guards the single terminal 'done' status (quick/261024-gvu). */
  terminalSent: boolean
  /** Carried on the entry so a test can observe the default without the
   * poll loop needing to branch on it (see StartBottleProcessMonitorArgs's
   * own `kind` doc). */
  kind: 'bottled-steam' | 'bridge'
}

const activeMonitors = new Map<string, MonitorEntry>()

export interface StartBottleProcessMonitorArgs {
  appId: string
  installPath: string
  bottleDir: string
  pollIntervalMs?: number
  /**
   * Phase 51 Plan 01 (D-51-01): which kind of bottled process this monitor
   * is watching -- carried on the entry for future branching (none yet;
   * this plan's own behaviour is identical for both kinds). Defaults to
   * `'bottled-steam'` so every pre-existing caller (bottle.ts's own
   * `tellBottledSteamToLaunch`) is unaffected.
   */
  kind?: 'bottled-steam' | 'bridge'
  /**
   * Phase 51 Plan 01 (D-51-01): called EXACTLY ONCE, the moment the
   * matched process(es) that had previously been seen running are gone
   * (the existing "matched process(es) gone" branch below) -- never when
   * `stopBottleProcessMonitor()` cancels the monitor first (e.g. a second
   * launch superseding this one), and never more than once per monitor.
   * Wrapped in try/catch so a throwing callback can never abort the poll
   * loop's own cleanup.
   */
  onStopped?: () => void
}

/**
 * Derive the uppercase-drive, backslash-separated Windows path prefix a `ps`
 * command line must start with (case-insensitively) to belong to this game.
 * Returns `null` when `installPath` does not live inside
 * `<bottleDir>/drive_c/` — that installPath cannot be matched by this
 * mechanism at all, and the caller must log and skip.
 *
 * The trailing backslash is load-bearing: without it `Avernum 4` would match
 * a process living under a sibling `Avernum 4 Remaster` directory.
 */
function deriveWindowsPrefix(
  bottleDir: string,
  installPath: string
): string | null {
  const driveCRoot = `${bottleDir}${sep}drive_c`
  const rel = relative(driveCRoot, installPath)

  if (
    rel === '' ||
    rel.startsWith('..') ||
    rel.split(sep).includes('..') ||
    // `relative()` only returns an absolute path when the two inputs are on
    // different Windows drives, which cannot happen here, but a defensive
    // check costs nothing and matches the task's "is absolute" wording.
    rel.startsWith(sep)
  ) {
    return null
  }

  const windowsRel = rel.split(sep).join('\\')
  return `C:\\${windowsRel}\\`
}

/**
 * Parse one `ps -axo pid=,command=` line into its pid and command, or
 * `null` if the line does not match the expected shape. Windows command
 * lines contain spaces, so everything after the pid is taken as-is — never
 * split further on whitespace.
 */
function parsePsLine(line: string): { pid: string; command: string } | null {
  const match = /^\s*(\d+)\s(.*)$/.exec(line)
  if (!match) return null
  let command = match[2].trim()
  if (command.startsWith('"')) {
    command = command.slice(1)
  }
  return { pid: match[1], command }
}

/**
 * Run one `ps` snapshot and return every pid+command whose command starts
 * with `lowerPrefix` (case-insensitive) and does not name one of Steam's
 * own client binaries.
 */
async function matchedProcesses(
  lowerPrefix: string
): Promise<Array<{ pid: string; command: string }>> {
  const { stdout } = await spawnAsync('ps', ['-axo', 'pid=,command='])
  const matches: Array<{ pid: string; command: string }> = []
  for (const line of stdout.split('\n')) {
    const parsed = parsePsLine(line)
    if (!parsed) continue
    const lowerCommand = parsed.command.toLowerCase()
    if (!lowerCommand.startsWith(lowerPrefix)) continue
    const isSteamClientBinary = STEAM_CLIENT_PROCESS_NAMES.some((name) =>
      lowerCommand.endsWith(name.toLowerCase())
    )
    if (isSteamClientBinary) continue
    matches.push(parsed)
  }
  return matches
}

/** Tracked, unref'd sleep — mirrors bottle.ts's own raise-loop sleep helper. */
function trackedSleep(entry: MonitorEntry, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const handle = setTimeout(() => {
      entry.timers.delete(handle)
      resolve()
    }, ms)
    entry.timers.add(handle)
    handle.unref?.()
  })
}

/**
 * quick/261024-gvu: send the one terminal `done` status for a monitor, at most
 * once. The monitor owns the backend `launching` hold (see
 * startBottleProcessMonitor), so every exit path that is not a supersede must
 * clear it through here.
 */
function sendTerminalDoneOnce(appId: string, entry: MonitorEntry): void {
  if (entry.terminalSent) return
  entry.terminalSent = true
  sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'done'
  })
}

function clearEntry(appId: string, entry: MonitorEntry): void {
  entry.cancelled = true
  for (const handle of entry.timers) {
    clearTimeout(handle)
  }
  entry.timers.clear()
  if (activeMonitors.get(appId) === entry) {
    activeMonitors.delete(appId)
  }
}

/** Fire entry.onStopped at most once; a throwing callback is logged. */
function fireStoppedOnce(appId: string, entry: MonitorEntry): void {
  if (entry.stoppedFired) return
  entry.stoppedFired = true
  if (!entry.onStopped) return
  try {
    entry.onStopped()
  } catch (error) {
    logWarning(
      [`bottleProcessMonitor [${appId}]: onStopped callback threw`, error],
      LogPrefix.Steam
    )
  }
}

/** First-match bookkeeping shared by the poll loop and launcherExited(). */
function recordFirstMatch(
  appId: string,
  entry: MonitorEntry,
  matches: Array<{ pid: string; command: string }>
): void {
  entry.everMatched = true
  entry.matchedAt = Date.now()
  logInfo(
    [
      `bottleProcessMonitor [${appId}]: matched process(es) — game started`,
      matches.map((m) => `${m.pid} ${m.command}`).join('; ')
    ],
    LogPrefix.Steam
  )
  sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'playing'
  })
  try {
    const processNames = [
      ...new Set(
        matches
          .map((m) => windowsExeNameFromCommand(m.command))
          .filter((n): n is string => n !== null)
      )
    ]
    void raiseWineGameWindow({
      context: `${entry.kind}:${appId}`,
      pids: matches.map((m) => m.pid),
      processNames
    })
  } catch (error) {
    logWarning(
      [`bottleProcessMonitor [${appId}]: window raise failed to start`, error],
      LogPrefix.Steam
    )
  }
}

async function runPollLoop(
  appId: string,
  entry: MonitorEntry,
  lowerPrefix: string,
  pollIntervalMs: number,
  bottleDir: string
): Promise<void> {
  const startedAt = Date.now()
  // Session duration is measured from the FIRST MATCH (entry.matchedAt), not
  // from monitor start: the no-deadline wait for a blocked Steam (measured at
  // ~6 minutes on 2026-10-16) is not play time and must not inflate the
  // logged figure.
  let consecutiveFailures = 0
  // D-51-16 (Phase 51 Plan 08): waiting-state check bookkeeping.
  // `lastWaitingCheckAt === null` means "never checked yet" -- distinct
  // from 0, which Date.now() can never actually produce in this context but
  // which would otherwise read ambiguously. `lastDetectedCause === undefined`
  // means the same thing for the classification itself, so the FIRST check
  // always emits (even when the classifier returns null -- "no single
  // cause" is itself the signal that the waiting state has begun).
  let lastWaitingCheckAt: number | null = null
  let lastDetectedCause: SteamBottleLaunchWaitingCause | null | undefined =
    undefined

  while (true) {
    if (entry.cancelled || activeMonitors.get(appId) !== entry) return

    const noMatchElapsed = Date.now() - startedAt
    const interval =
      !entry.everMatched && noMatchElapsed > NO_MATCH_BACKOFF_AFTER_MS
        ? NO_MATCH_BACKOFF_INTERVAL_MS
        : pollIntervalMs
    await trackedSleep(entry, interval)
    if (entry.cancelled || activeMonitors.get(appId) !== entry) return

    let matches: Array<{ pid: string; command: string }>
    try {
      matches = await matchedProcesses(lowerPrefix)
      consecutiveFailures = 0
    } catch (error) {
      consecutiveFailures++
      logWarning(
        [
          `bottleProcessMonitor [${appId}]: ps spawn failed (${consecutiveFailures}/${MAX_CONSECUTIVE_SPAWN_FAILURES})`,
          error
        ],
        LogPrefix.Steam
      )
      if (consecutiveFailures >= MAX_CONSECUTIVE_SPAWN_FAILURES) {
        logWarning(
          `bottleProcessMonitor [${appId}]: giving up after ${MAX_CONSECUTIVE_SPAWN_FAILURES} consecutive ps failures`,
          LogPrefix.Steam
        )
        sendTerminalDoneOnce(appId, entry)
        // Review WR-05: the give-up path must also stop the helper.
        fireStoppedOnce(appId, entry)
        clearEntry(appId, entry)
        return
      }
      continue
    }

    if (matches.length > 0 && !entry.everMatched) {
      recordFirstMatch(appId, entry, matches)
    } else if (matches.length === 0 && entry.everMatched) {
      const elapsedMs = Date.now() - entry.matchedAt
      const elapsedSeconds = Math.round(elapsedMs / 1000)
      logInfo(
        `bottleProcessMonitor [${appId}]: matched process(es) gone after ${elapsedSeconds}s of play — game stopped`,
        LogPrefix.Steam
      )
      // Quick 261029-mkz (U-2): a session that stayed up 60 s+ auto-marks the
      // game "Runs for me". Own try/catch so cleanup below always runs
      // (T-mkz-03). Recorded only on this branch: the give-up path and a
      // stopBottleProcessMonitor() cancel never reach it.
      try {
        recordPlaySession(appId, 'steam', elapsedMs)
      } catch (error) {
        logWarning(
          [`bottleProcessMonitor [${appId}]: recordPlaySession failed`, error],
          LogPrefix.Steam
        )
      }
      sendTerminalDoneOnce(appId, entry)
      // Phase 51 Plan 01 (D-51-01): fires exactly once, here, on the ONLY
      // branch that observes the game's own process(es) genuinely gone --
      // never on the `stopBottleProcessMonitor()`-cancels-first path below,
      // which never reaches this branch at all. Guarded so a throwing
      // callback cannot prevent `clearEntry()` from running.
      fireStoppedOnce(appId, entry)
      clearEntry(appId, entry)
      return
    }
    // no-op: empty-before-first-match, or still matching after first match.

    // D-51-16 (Phase 51 Plan 08): bottled-Steam-only waiting state. Never
    // runs for `kind: 'bridge'` (no Steam client lives in a bridge bottle),
    // and never runs once a match has ever been seen -- `everMatched` is
    // updated by the branch just above, so a tick whose `ps` poll just
    // produced the FIRST match skips this block in the SAME tick.
    if (entry.kind === 'bottled-steam' && !entry.everMatched) {
      const elapsedSinceStart = Date.now() - startedAt
      const dueForCheck =
        elapsedSinceStart >= WAITING_FOR_STEAM_GRACE_MS &&
        (lastWaitingCheckAt === null ||
          Date.now() - lastWaitingCheckAt >= WAITING_RECHECK_MS)

      if (dueForCheck) {
        lastWaitingCheckAt = Date.now()
        const paths = bottledSteamLogPaths(bottleDir)

        const bootstrapTail = await readBoundedTail(paths.bootstrap)
        if (entry.cancelled || activeMonitors.get(appId) !== entry) return
        const consoleTail = await readBoundedTail(paths.console)
        if (entry.cancelled || activeMonitors.get(appId) !== entry) return
        const loginTail = await readBoundedTail(paths.login)
        if (entry.cancelled || activeMonitors.get(appId) !== entry) return

        const detectedCause = classifyBottledSteamBlock({
          bootstrapTail,
          consoleTail,
          loginTail,
          appId,
          launchStartedAt: startedAt
        })

        if (detectedCause !== lastDetectedCause) {
          lastDetectedCause = detectedCause
          logInfo(
            `[bottle-waiting] appId=${appId} cause=${detectedCause ?? 'none'}`,
            LogPrefix.Steam
          )
          sendFrontendMessage('steamBottleLaunchWaiting', {
            appName: appId,
            detectedCause
          })
        }
      }
    }
  }
}

/** Returned by startBottleProcessMonitor so a launcher wrapper can signal exit. */
export interface BottleProcessMonitorHandle {
  /**
   * The launch wrapper process has exited (cleanly or not). If a game process
   * was already matched this is a no-op; otherwise one immediate check runs
   * and, finding nothing, the monitor stops and fires onStopped once.
   */
  launcherExited(): void
}

/**
 * Start polling for the given bottled game's own process(es). Never throws,
 * never blocks the caller, and is a complete no-op on any non-macOS host or
 * when `installPath` does not resolve under `<bottleDir>/drive_c/`.
 */
export function startBottleProcessMonitor(
  args: StartBottleProcessMonitorArgs
): BottleProcessMonitorHandle | null {
  const {
    appId,
    installPath,
    bottleDir,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    onStopped,
    kind = 'bottled-steam'
  } = args

  if (!isMac) {
    return null
  }

  const prefix = deriveWindowsPrefix(bottleDir, installPath)
  if (prefix === null) {
    logWarning(
      `bottleProcessMonitor [${appId}]: installPath "${installPath}" does not live under bottle "${bottleDir}"'s drive_c — no process monitor started`,
      LogPrefix.Steam
    )
    return null
  }
  const lowerPrefix = prefix.toLowerCase()

  cancelMonitor(appId)

  const entry: MonitorEntry = {
    cancelled: false,
    timers: new Set(),
    onStopped,
    everMatched: false,
    matchedAt: 0,
    stoppedFired: false,
    terminalSent: false,
    kind
  }
  activeMonitors.set(appId, entry)

  // quick/261024-gvu: Steam launches bypass launcher.ts launchEventCallback
  // (steamFlowRegistration handleLaunch / protocol.ts call dispatchSteamLaunch
  // directly), so nothing else ever emits `launching` for them; the frontend's
  // local playClicked dropped as soon as the launch IPC resolved on hand-off,
  // flickering Play until `playing`. The monitor holds `launching` from here
  // (before the launch IPC resolves) until started / gave up / stopped.
  sendFrontendMessage('gameStatusUpdate', {
    appName: appId,
    runner: 'steam',
    status: 'launching'
  })

  void (async () => {
    try {
      await runPollLoop(appId, entry, lowerPrefix, pollIntervalMs, bottleDir)
    } catch (error) {
      logWarning(
        [`bottleProcessMonitor [${appId}]: poll loop failed`, error],
        LogPrefix.Steam
      )
      sendTerminalDoneOnce(appId, entry)
      clearEntry(appId, entry)
    }
  })()

  const isLive = () => !entry.cancelled && activeMonitors.get(appId) === entry
  return {
    launcherExited() {
      if (!isLive() || entry.everMatched) return
      void (async () => {
        try {
          let matches: Array<{ pid: string; command: string }> = []
          try {
            matches = await matchedProcesses(lowerPrefix)
          } catch {
            // A ps failure counts as "no match".
          }
          if (!isLive() || entry.everMatched) return
          if (matches.length > 0) {
            recordFirstMatch(appId, entry, matches)
            return
          }
          logInfo(
            `bottleProcessMonitor [${appId}]: launcher exited before any game process matched — stopping`,
            LogPrefix.Steam
          )
          sendTerminalDoneOnce(appId, entry)
          fireStoppedOnce(appId, entry)
          clearEntry(appId, entry)
        } catch (error) {
          logWarning(
            [`bottleProcessMonitor [${appId}]: launcherExited failed`, error],
            LogPrefix.Steam
          )
        }
      })()
    }
  }
}

/** Cancel and fully tear down the monitor for one appId. No-op if unknown. */
export function stopBottleProcessMonitor(appId: string): void {
  const entry = activeMonitors.get(appId)
  if (!entry) return
  sendTerminalDoneOnce(appId, entry)
  clearEntry(appId, entry)
}

/** Silent cancel (supersede / test teardown): no terminal status emitted. */
function cancelMonitor(appId: string): void {
  const entry = activeMonitors.get(appId)
  if (!entry) return
  clearEntry(appId, entry)
}

/**
 * quick/261024-gvu: 'starting' while a monitor is live and no game process has
 * matched yet, 'running' once one has, null when no live monitor exists.
 */
export function getBottleProcessMonitorPhase(
  appId: string
): 'starting' | 'running' | null {
  const entry = activeMonitors.get(appId)
  if (!entry || entry.cancelled) return null
  return entry.everMatched ? 'running' : 'starting'
}

/** Test-only teardown hook: cancel every registered monitor (silently). */
export function __stopAllBottleProcessMonitors(): void {
  for (const appId of Array.from(activeMonitors.keys())) {
    cancelMonitor(appId)
  }
}

/**
 * Test-only observer: the `kind` an active monitor for `appId` was started
 * with (or defaulted to) -- `undefined` if no monitor is active for that
 * appId. Exists purely so a test can assert the documented default
 * (`'bottled-steam'`) without the poll loop itself needing to branch on
 * `kind` yet. Never called from production code.
 */
export function __getActiveMonitorKindForTests(
  appId: string
): 'bottled-steam' | 'bridge' | undefined {
  return activeMonitors.get(appId)?.kind
}
