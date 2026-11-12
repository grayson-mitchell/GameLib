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
import { parsePsLine, processListing } from 'backend/engine/processListing'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'
import {
  raiseWineGameWindow,
  windowsExeNameFromCommand
} from 'backend/utils/wineWindowRaise'
import type { Clock, TimerHandle } from 'backend/process/types'
import type { SpawnDeps } from './provisionBottle'
import type { RunsForMeDeps } from 'backend/runsForMe'

/** The monitor's spawn slice plus the runs-for-me store its session record writes (66.1). */
type BottleMonitorDeps = SpawnDeps & RunsForMeDeps
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
  timers: Set<TimerHandle>
  onStopped?: () => void
  onFirstMatch?: () => void
  onUnavailable?: () => void
  /** Guards onFirstMatch to fire at most once per monitor. */
  firstMatchFired: boolean
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

/** The boot-owned monitor state: one live monitor per appId, timers on the injected clock (66.4-06). */
interface MonitorState {
  active: Map<string, MonitorEntry>
  clock: Pick<Clock, 'setTimeout' | 'clear'>
}

interface StartBottleProcessMonitorArgs {
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
  /**
   * Phase 59 (D-11): called EXACTLY ONCE, the first time a process belonging
   * to this game is seen in the bottle (from either the poll loop or
   * launcherExited()). Never called after the monitor is cancelled. Wrapped
   * in try/catch so a throwing callback cannot break the monitor. The monitor
   * itself still has no deadline (LD-4); the launch deadline that uses this
   * signal lives in backend/engine/launchDeadline.ts.
   */
  onFirstMatch?: () => void
  /**
   * Phase 59 UAT (G3): called once when the monitor gives up because it
   * cannot list processes at all, before onStopped. The game may well be
   * running, so a caller holding a launch deadline must stand it down rather
   * than let it stop a game nobody can see.
   */
  onUnavailable?: () => void
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
 * Run one `ps` snapshot and return every pid+command whose command starts
 * with one of `lowerPrefixes` (case-insensitive) and does not name one of
 * Steam's own client binaries.
 */
async function matchedProcesses(
  deps: SpawnDeps,
  lowerPrefixes: string[]
): Promise<Array<{ pid: string; command: string }>> {
  const stdout = await processListing(deps)
  const matches: Array<{ pid: string; command: string }> = []
  for (const line of stdout.split('\n')) {
    const parsed = parsePsLine(line)
    if (!parsed) continue
    const lowerCommand = parsed.command.toLowerCase()
    if (!lowerPrefixes.some((prefix) => lowerCommand.startsWith(prefix)))
      continue
    const isSteamClientBinary = STEAM_CLIENT_PROCESS_NAMES.some((name) =>
      lowerCommand.endsWith(name.toLowerCase())
    )
    if (isSteamClientBinary) continue
    matches.push(parsed)
  }
  return matches
}

/** Tracked, unref'd sleep — mirrors bottle.ts's own raise-loop sleep helper. */
function trackedSleep(
  state: MonitorState,
  entry: MonitorEntry,
  ms: number
): Promise<void> {
  return new Promise<void>((resolve) => {
    const handle = state.clock.setTimeout(() => {
      entry.timers.delete(handle)
      resolve()
    }, ms)
    entry.timers.add(handle)
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

function clearEntry(
  state: MonitorState,
  appId: string,
  entry: MonitorEntry
): void {
  entry.cancelled = true
  for (const handle of entry.timers) {
    state.clock.clear(handle)
  }
  entry.timers.clear()
  if (state.active.get(appId) === entry) {
    state.active.delete(appId)
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
  deps: SpawnDeps,
  appId: string,
  entry: MonitorEntry,
  matches: Array<{ pid: string; command: string }>
): void {
  entry.everMatched = true
  entry.matchedAt = Date.now()
  if (entry.onFirstMatch && !entry.cancelled && !entry.firstMatchFired) {
    entry.firstMatchFired = true
    try {
      entry.onFirstMatch()
    } catch (error) {
      logWarning(
        [`bottleProcessMonitor [${appId}]: onFirstMatch callback threw`, error],
        LogPrefix.Steam
      )
    }
  }
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
    void raiseWineGameWindow(deps, {
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
  state: MonitorState,
  deps: BottleMonitorDeps,
  appId: string,
  entry: MonitorEntry,
  lowerPrefixes: string[],
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
    if (entry.cancelled || state.active.get(appId) !== entry) return

    const noMatchElapsed = Date.now() - startedAt
    const interval =
      !entry.everMatched && noMatchElapsed > NO_MATCH_BACKOFF_AFTER_MS
        ? NO_MATCH_BACKOFF_INTERVAL_MS
        : pollIntervalMs
    await trackedSleep(state, entry, interval)
    if (entry.cancelled || state.active.get(appId) !== entry) return

    let matches: Array<{ pid: string; command: string }>
    try {
      matches = await matchedProcesses(deps, lowerPrefixes)
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
        if (entry.onUnavailable) {
          try {
            entry.onUnavailable()
          } catch (error) {
            logWarning(
              [
                `bottleProcessMonitor [${appId}]: onUnavailable callback threw`,
                error
              ],
              LogPrefix.Steam
            )
          }
        }
        // Review WR-05: the give-up path must also stop the helper.
        fireStoppedOnce(appId, entry)
        clearEntry(state, appId, entry)
        return
      }
      continue
    }

    if (matches.length > 0 && !entry.everMatched) {
      recordFirstMatch(deps, appId, entry, matches)
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
        recordPlaySession(deps, appId, 'steam', elapsedMs)
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
      clearEntry(state, appId, entry)
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
        if (entry.cancelled || state.active.get(appId) !== entry) return
        const consoleTail = await readBoundedTail(paths.console)
        if (entry.cancelled || state.active.get(appId) !== entry) return
        const loginTail = await readBoundedTail(paths.login)
        if (entry.cancelled || state.active.get(appId) !== entry) return

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
interface BottleProcessMonitorHandle {
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
function startMonitor(
  state: MonitorState,
  deps: BottleMonitorDeps,
  args: StartBottleProcessMonitorArgs
): BottleProcessMonitorHandle | null {
  const {
    appId,
    installPath,
    bottleDir,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    onStopped,
    onFirstMatch,
    onUnavailable,
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
  // 59-UAT G8: CrossOver's winewrapper shows the game as `C:\...`, but a
  // plain Wine engine (the built-in Wine-Staging) keeps the host path GameLib
  // launched it with, so match the install root's host form too.
  const lowerPrefixes = [
    prefix.toLowerCase(),
    `${installPath.replace(/[\\/]+$/, '')}${sep}`.toLowerCase()
  ]

  cancelMonitor(state, appId)

  const entry: MonitorEntry = {
    cancelled: false,
    timers: new Set(),
    onStopped,
    onFirstMatch,
    onUnavailable,
    firstMatchFired: false,
    everMatched: false,
    matchedAt: 0,
    stoppedFired: false,
    terminalSent: false,
    kind
  }
  state.active.set(appId, entry)

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
      await runPollLoop(
        state,
        deps,
        appId,
        entry,
        lowerPrefixes,
        pollIntervalMs,
        bottleDir
      )
    } catch (error) {
      logWarning(
        [`bottleProcessMonitor [${appId}]: poll loop failed`, error],
        LogPrefix.Steam
      )
      sendTerminalDoneOnce(appId, entry)
      clearEntry(state, appId, entry)
    }
  })()

  const isLive = () => !entry.cancelled && state.active.get(appId) === entry
  return {
    launcherExited() {
      if (!isLive() || entry.everMatched) return
      void (async () => {
        try {
          let matches: Array<{ pid: string; command: string }> = []
          try {
            matches = await matchedProcesses(deps, lowerPrefixes)
          } catch {
            // A ps failure counts as "no match".
          }
          if (!isLive() || entry.everMatched) return
          if (matches.length > 0) {
            recordFirstMatch(deps, appId, entry, matches)
            return
          }
          logInfo(
            `bottleProcessMonitor [${appId}]: launcher exited before any game process matched — stopping`,
            LogPrefix.Steam
          )
          sendTerminalDoneOnce(appId, entry)
          fireStoppedOnce(appId, entry)
          clearEntry(state, appId, entry)
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
function stopMonitor(state: MonitorState, appId: string): void {
  const entry = state.active.get(appId)
  if (!entry) return
  sendTerminalDoneOnce(appId, entry)
  clearEntry(state, appId, entry)
}

/** Silent cancel (supersede / test teardown): no terminal status emitted. */
function cancelMonitor(state: MonitorState, appId: string): void {
  const entry = state.active.get(appId)
  if (!entry) return
  clearEntry(state, appId, entry)
}

/**
 * quick/261024-gvu: 'starting' while a monitor is live and no game process has
 * matched yet, 'running' once one has, null when no live monitor exists.
 */
function monitorPhase(
  state: MonitorState,
  appId: string
): 'starting' | 'running' | null {
  const entry = state.active.get(appId)
  if (!entry || entry.cancelled) return null
  return entry.everMatched ? 'running' : 'starting'
}

export interface BottleProcessMonitors {
  /** Never throws, never blocks; a no-op on a non-macOS host. */
  startBottleProcessMonitor: (
    deps: BottleMonitorDeps,
    args: StartBottleProcessMonitorArgs
  ) => BottleProcessMonitorHandle | null
  /** Cancel and fully tear down the monitor for one appId. No-op if unknown. */
  stopBottleProcessMonitor: (appId: string) => void
  getBottleProcessMonitorPhase: (appId: string) => 'starting' | 'running' | null
  /** Silently cancel every registered monitor (no terminal status emitted). */
  stopAllBottleProcessMonitors: () => void
  /** The `kind` an active monitor was started with, `undefined` when none is active. */
  getActiveMonitorKind: (
    appId: string
  ) => 'bottled-steam' | 'bridge' | undefined
}

/**
 * The per-boot bottle process monitors (D-05, 66.4-06). Construction only allocates an empty map:
 * no I/O and no timer; the poll sleeps run on the injected clock (unref'd) once a monitor starts.
 */
export function createBottleProcessMonitors(deps: {
  clock: Pick<Clock, 'setTimeout' | 'clear'>
}): BottleProcessMonitors {
  const state: MonitorState = {
    active: new Map<string, MonitorEntry>(),
    clock: deps.clock
  }
  return {
    startBottleProcessMonitor: (d, args) => startMonitor(state, d, args),
    stopBottleProcessMonitor: (appId) => stopMonitor(state, appId),
    getBottleProcessMonitorPhase: (appId) => monitorPhase(state, appId),
    stopAllBottleProcessMonitors: () => {
      for (const appId of Array.from(state.active.keys())) {
        cancelMonitor(state, appId)
      }
    },
    getActiveMonitorKind: (appId) => state.active.get(appId)?.kind
  }
}
