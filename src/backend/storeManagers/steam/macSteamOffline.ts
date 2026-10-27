/**
 * Phase 54 (54-01): the go-offline wrap around authenticated Steam CM logons.
 *
 * Spike 046 proved the mechanism: a second authenticated session on the same
 * account signs Mac Steam's Friends out, but `steam://open/gooffline` makes
 * Mac Steam LogOff first (the line lands in `connection_log.txt` within
 * ~0.25 s), and `steam://open/goonline` brings it back afterwards.
 *
 * This module is a LEAF: it decides nothing about sessions. `user.ts` calls
 * `withMacSteamOffline` around every cold authenticated connect. The core
 * invariant is "never a silent logon": when Mac Steam is running and online
 * and its user-initiated LogOff is not observed within 5 s, connect() is NOT
 * called and `GuidedOfflineRequiredError` is thrown so the caller can ask the
 * user to go offline by hand.
 *
 * The wrap records the goonline it owes on disk before going offline and
 * clears the record only once Mac Steam is confirmed back online after the
 * goonline (54-REVIEW WR-01). `restoreMacSteamOnlineIfOwed` is the
 * shutdown and boot cover for a wrap that never reached its goonline, and the
 * boot call is the only cover for a `kill -9` of the sidecar.
 */
import { execFile, spawn } from 'child_process'
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { uptime } from 'os'
import { dirname, join } from 'path'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { shell } from 'backend/platform'
import type { SteamGoOfflineRetryResult } from 'common/types/steam'

const MAC_STEAM_LOGOFF_WAIT_MS = 5000
const MAC_STEAM_LOG_POLL_MS = 250
const MAC_STEAM_ONLINE_SETTLE_MS = 2000
export const GUIDED_RESTORE_TTL_MS = 600000
export const STEAM_GO_OFFLINE_URL = 'steam://open/gooffline'
export const STEAM_GO_ONLINE_URL = 'steam://open/goonline'
// ts-prune-ignore-next
export const MAC_STEAM_OFFLINE_OWED_FILE = 'mac-steam-offline-owed.json'
export const MAC_STEAM_RESTORE_CONFIRM_MS = 10000
// 54-REVIEW WR-02: a gooffline whose LogOff was not seen within
// MAC_STEAM_LOGOFF_WAIT_MS can still land late. A user-initiated LogOff this
// soon after the fire is taken as that late landing; a later one is the
// user's own Go Offline, which GameLib must not undo.
export const MAC_STEAM_LATE_LOGOFF_WINDOW_MS = 60000

const STATE_READ_BYTES = 65536
const STATE_LINE_RE = /^\[[^\]]+\] \[([A-Za-z ]+), -?\d+, -?\d+\]/
const STATE_LINE_TS_RE =
  /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\] \[([A-Za-z ]+), -?\d+, -?\d+\]/
const LOGOFF_EVIDENCE_RE = /user initiated logoff/

export type MacSteamWrapKind =
  | 'toggled'
  | 'already-offline'
  | 'not-running'
  | 'not-darwin'
  | 'guided-restore'

// ts-prune-ignore-next
export type MacSteamRestoreTrigger = 'boot' | 'shutdown'
export type MacSteamRestoreOutcome =
  | 'not-darwin'
  | 'not-owed'
  | 'restored'
  | 'restore-unconfirmed'
  | 'kept-not-running'
  | 'kept-probe-failed'
  | 'kept-owner-alive'

export class GuidedOfflineRequiredError extends Error {
  readonly cause: 'logoff-not-seen' | 'running-probe-failed'
  constructor(cause: 'logoff-not-seen' | 'running-probe-failed') {
    super(
      cause === 'logoff-not-seen'
        ? 'Mac Steam did not log off; guided Go Offline step required'
        : 'Could not tell whether Mac Steam is running; guided Go Offline step required'
    )
    this.name = 'GuidedOfflineRequiredError'
    this.cause = cause
  }
}

export interface MacSteamOfflineDeps {
  platform: NodeJS.Platform
  connectionLogPath: () => string
  isSteamRunning: () => Promise<boolean>
  openUrl: (url: string) => void
  sleep: (ms: number) => Promise<void>
  now: () => number
  onlineDebtPath: () => string
  openUrlDetached: (url: string) => void
  isPidAlive: (pid: number) => boolean
  selfPid: number
  /** 54-REVIEW WR-03: wall-clock ms of the last system boot. A marker written
   *  before it belongs to a process that cannot still be alive, whatever now
   *  holds its PID. Optional so injected test deps can leave it out. */
  systemBootMs?: () => number
}

/**
 * 54-REVIEW WR-03: true only for a live process this user owns. A GameLib
 * sidecar always runs as the same user, so EPERM (a root or other-user
 * process that reused the PID) is not ours.
 */
export function isOwnUserPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Fires a steam:// URL through a direct, detached `/usr/bin/open`. The
 * sidecar's `shell.openExternal` is a frame to the Rust shell over stdout,
 * which is gone at stdin EOF, so a shutdown restore cannot use it.
 */
export function spawnOpenDetached(url: string): void {
  // The child inherits the real user session on purpose: LaunchServices
  // resolves steam:// per user, so a fake or stripped env breaks dispatch.
  // Tests never reach this call; the missing env option is what
  // fakeHomeIsolation.test.ts requires.
  const child = spawn('/usr/bin/open', ['-g', url], {
    detached: true,
    stdio: 'ignore'
  })
  child.on('error', (err) => {
    logWarning(
      `[Steam] go-offline restore: could not spawn open (${(err as NodeJS.ErrnoException).code ?? 'error'})`,
      LogPrefix.Steam
    )
  })
  child.unref()
}

function defaultMacSteamOfflineDeps(): MacSteamOfflineDeps {
  return {
    platform: process.platform,
    connectionLogPath: () => {
      // Loaded on first use, not at module load: backend/config pulls in the
      // whole backend graph (utils, GOG, Electron paths), and user.ts imports
      // this module on every startup path and in every suite that touches it.
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GlobalConfig } =
        require('backend/config') as typeof import('backend/config')
      /* eslint-enable @typescript-eslint/no-require-imports */
      const { defaultSteamPath } = GlobalConfig.get().getSettings()
      return join(
        defaultSteamPath.replaceAll("'", ''),
        'logs',
        'connection_log.txt'
      )
    },
    isSteamRunning: () =>
      new Promise<boolean>((resolve, reject) => {
        execFile(
          '/usr/bin/pgrep',
          ['-x', 'steam_osx'],
          { timeout: 2000 },
          (err) => {
            if (!err) return resolve(true)
            const code: unknown = (err as { code?: unknown }).code
            if (code === 1) return resolve(false)
            reject(err)
          }
        )
      }),
    openUrl: (url) => shell.openExternal(url),
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms)
        t.unref?.()
      }),
    now: () => Date.now(),
    onlineDebtPath: () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { appFolder } =
        require('backend/constants/paths') as typeof import('backend/constants/paths')
      /* eslint-enable @typescript-eslint/no-require-imports */
      return join(appFolder, MAC_STEAM_OFFLINE_OWED_FILE)
    },
    openUrlDetached: spawnOpenDetached,
    isPidAlive: isOwnUserPidAlive,
    selfPid: process.pid,
    systemBootMs: () => Date.now() - uptime() * 1000
  }
}

// One-shot, 10-minute flag armed by checkGuidedOfflineReady(): the user went
// offline because GameLib asked, so the next wrapped logon that finds Steam
// 'Logged Off' restores it afterwards. Without it a user-chosen offline state
// is never undone.
let guidedArmedAt: number | null = null
// 54-REVIEW WR-05: pays an abandoned guided step when its arm lapses unused.
let guidedExpiryTimer: ReturnType<typeof setTimeout> | null = null

function disarmGuided(): void {
  guidedArmedAt = null
  if (guidedExpiryTimer) clearTimeout(guidedExpiryTimer)
  guidedExpiryTimer = null
}

// 54-REVIEW WR-01: bumped on every marker write, so a late goonline
// confirmation clears only the marker it was fired for, never a newer one.
let debtGeneration = 0
// The in-session goonline confirmation still watching connection_log, if any.
let onlineConfirmInFlight: Promise<void> | null = null

// 54-REVIEW WR-04: wraps whose gooffline has been fired but whose LogOff has
// not been seen yet. A shutdown restore in that window cannot know whether
// the gooffline lands before or after its goonline, so it keeps the marker.
let goofflinePending = 0
// Resolved once the shutdown restore begins: the wrap then stops waiting on
// unref'd timers (the LogOff watch, the settle) and fires its goonline at
// once, before the event loop can drain.
let shutdownBegun = false
let signalShutdown: () => void = () => undefined
let shutdownSignal: Promise<void> = newShutdownSignal()

function newShutdownSignal(): Promise<void> {
  return new Promise<void>((resolve) => {
    signalShutdown = resolve
  })
}

function beginMacSteamShutdown(): void {
  shutdownBegun = true
  signalShutdown()
}

// One restore flight per trigger: a shutdown never waits on a boot's confirm window.
const restoreInFlight: {
  boot: Promise<MacSteamRestoreOutcome> | null
  shutdown: Promise<MacSteamRestoreOutcome> | null
} = { boot: null, shutdown: null }

// ts-prune-ignore-next
export function __resetMacSteamOfflineForTests(): void {
  disarmGuided()
  restoreInFlight.boot = null
  restoreInFlight.shutdown = null
  debtGeneration = 0
  onlineConfirmInFlight = null
  goofflinePending = 0
  shutdownBegun = false
  shutdownSignal = newShutdownSignal()
}

// ts-prune-ignore-next
export function __macSteamOnlineConfirmForTests(): Promise<void> {
  return onlineConfirmInFlight ?? Promise.resolve()
}

type OnlineDebtBy = 'toggled' | 'guided' | 'toggled-unconfirmed'

function recordOnlineDebt(
  by: OnlineDebtBy,
  deps: MacSteamOfflineDeps,
  sinceMs: number = deps.now()
): void {
  debtGeneration++
  try {
    const p = deps.onlineDebtPath()
    mkdirSync(dirname(p), { recursive: true })
    writeFileSync(
      p,
      JSON.stringify({
        since: new Date(sinceMs).toISOString(),
        by,
        pid: deps.selfPid
      }),
      { mode: 0o600 }
    )
  } catch (err) {
    logWarning(
      `[Steam] go-offline wrap: could not record the owed goonline (${(err as NodeJS.ErrnoException).code ?? 'error'})`,
      LogPrefix.Steam
    )
  }
}

function clearOnlineDebt(deps: MacSteamOfflineDeps): void {
  try {
    rmSync(deps.onlineDebtPath(), { force: true })
  } catch (err) {
    logWarning(
      `[Steam] go-offline wrap: could not clear the owed goonline (${(err as NodeJS.ErrnoException).code ?? 'error'})`,
      LogPrefix.Steam
    )
  }
}

function isOnlineDebtOwed(deps: MacSteamOfflineDeps): boolean {
  try {
    return existsSync(deps.onlineDebtPath())
  } catch {
    return false
  }
}

// Best effort: presence is the debt, content is diagnostic only.
interface OnlineDebt {
  sinceMs?: number
  pid?: number
  by?: string
}

function readOnlineDebt(deps: MacSteamOfflineDeps): OnlineDebt {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(deps.onlineDebtPath(), 'utf8')
    )
    if (typeof parsed !== 'object' || parsed === null) return {}
    const { since, pid, by } = parsed as {
      since?: unknown
      pid?: unknown
      by?: unknown
    }
    const out: OnlineDebt = {}
    if (typeof since === 'string') {
      const t = Date.parse(since)
      if (!Number.isNaN(t)) out.sinceMs = t
    }
    if (typeof pid === 'number') out.pid = pid
    if (typeof by === 'string') out.by = by
    return out
  } catch {
    return {}
  }
}

/**
 * 54-REVIEW WR-02: a `toggled-unconfirmed` marker (the wrap's LogOff was not
 * seen) is owed only when connection_log shows a user-initiated LogOff within
 * MAC_STEAM_LATE_LOGOFF_WINDOW_MS of the fire, i.e. the gooffline landed
 * late. Every other marker is owed by its presence alone.
 */
function isUnconfirmedDebtStale(
  debt: OnlineDebt,
  logPath: () => string
): boolean {
  if (debt.by !== 'toggled-unconfirmed') return false
  if (debt.sinceMs === undefined) return false
  return !logoffSeenWithin(
    logPath(),
    debt.sinceMs,
    debt.sinceMs + MAC_STEAM_LATE_LOGOFF_WINDOW_MS
  )
}

function debtOwnedByOtherLiveProcess(
  debt: OnlineDebt,
  deps: MacSteamOfflineDeps
): boolean {
  if (typeof debt.pid !== 'number' || debt.pid === deps.selfPid) return false
  // 54-REVIEW WR-03: the marker survives a reboot with the dead sidecar's PID,
  // which a system daemon may now hold. A marker older than this boot is never
  // owned by a live process.
  if (debt.sinceMs !== undefined && deps.systemBootMs) {
    try {
      if (debt.sinceMs < deps.systemBootMs()) return false
    } catch {
      // fall through to the PID probe
    }
  }
  return deps.isPidAlive(debt.pid)
}

/**
 * The state word of the LAST bracketed `[State, n, m]` line in the last 64 KiB
 * of connection_log.txt, or null (missing file / no bracketed line). Never
 * returns or logs the account id the lines carry.
 */
export function readMacSteamCmState(path: string): string | null {
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const len = Math.min(size, STATE_READ_BYTES)
    if (len === 0) return null
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString('utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = STATE_LINE_RE.exec(lines[i].replace(/\r$/, ''))
      if (m) return m[1]
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * Like readMacSteamCmState, but only considers bracketed lines whose
 * timestamp (local time) is at or after `sinceMs` floored to the whole second.
 */
export function readMacSteamCmStateSince(
  path: string,
  sinceMs: number
): string | null {
  const floor = Math.floor(sinceMs / 1000) * 1000
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const len = Math.min(size, STATE_READ_BYTES)
    if (len === 0) return null
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString('utf8').split('\n')
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = STATE_LINE_TS_RE.exec(lines[i].replace(/\r$/, ''))
      if (!m) continue
      const ts = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6])
      ).getTime()
      if (ts >= floor) return m[7]
    }
    return null
  } catch {
    return null
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * True when a timestamped user-initiated LogOff line in the last 64 KiB of
 * connection_log.txt falls in [fromMs floored to the second, toMs].
 */
function logoffSeenWithin(path: string, fromMs: number, toMs: number): boolean {
  const floor = Math.floor(fromMs / 1000) * 1000
  let fd: number | null = null
  try {
    fd = openSync(path, 'r')
    const size = fstatSync(fd).size
    const len = Math.min(size, STATE_READ_BYTES)
    if (len === 0) return false
    const buf = Buffer.alloc(len)
    readSync(fd, buf, 0, len, size - len)
    for (const raw of buf.toString('utf8').split('\n')) {
      const line = raw.replace(/\r$/, '')
      if (!LOGOFF_EVIDENCE_RE.test(line)) continue
      const m = STATE_LINE_TS_RE.exec(line)
      if (!m) continue
      const ts = new Date(
        Number(m[1]),
        Number(m[2]) - 1,
        Number(m[3]),
        Number(m[4]),
        Number(m[5]),
        Number(m[6])
      ).getTime()
      if (ts >= floor && ts <= toMs) return true
    }
    return false
  } catch {
    return false
  } finally {
    if (fd !== null) closeSync(fd)
  }
}

/**
 * Resolves true as soon as a line appended AFTER this call matches `pattern`,
 * false at `timeoutMs`. The start offset is taken synchronously so a stale
 * matching line already in the file can never satisfy it. Polling waits on
 * `deps.sleep`, whose default implementation `.unref?.()`s its timer, so a
 * pending poll never holds the sidecar's event loop open at stdin EOF.
 */
export function watchConnectionLog(
  path: string,
  pattern: RegExp,
  timeoutMs: number,
  deps: Pick<MacSteamOfflineDeps, 'sleep' | 'now'>
): Promise<boolean> {
  let offset = 0
  try {
    offset = statSync(path).size
  } catch {
    offset = 0
  }
  let carry = ''

  const readNew = (): string[] => {
    let fd: number | null = null
    try {
      fd = openSync(path, 'r')
      const size = fstatSync(fd).size
      if (size < offset) {
        offset = 0
        carry = ''
      }
      if (size === offset) return []
      const buf = Buffer.alloc(size - offset)
      readSync(fd, buf, 0, buf.length, offset)
      offset = size
      const parts = (carry + buf.toString('utf8')).split('\n')
      carry = parts.pop() ?? ''
      return parts.map((l) => l.replace(/\r$/, ''))
    } catch {
      return []
    } finally {
      if (fd !== null) closeSync(fd)
    }
  }

  return (async () => {
    const start = deps.now()
    for (;;) {
      if (readNew().some((l) => pattern.test(l))) return true
      if (deps.now() - start >= timeoutMs) return false
      await deps.sleep(MAC_STEAM_LOG_POLL_MS)
    }
  })()
}

/**
 * Runs `connect` with Mac Steam taken offline for the duration, when that is
 * needed to protect its Friends session. See the module doc.
 */
export async function withMacSteamOffline<T>(
  connect: (wrap: MacSteamWrapKind) => Promise<T>,
  deps: MacSteamOfflineDeps = defaultMacSteamOfflineDeps()
): Promise<{ value: T; wrap: MacSteamWrapKind }> {
  if (deps.platform !== 'darwin') {
    return { value: await connect('not-darwin'), wrap: 'not-darwin' }
  }

  // A boot restore in flight is landing a goonline; do not read state mid-flight.
  if (restoreInFlight.boot) await restoreInFlight.boot

  let running: boolean
  try {
    running = await deps.isSteamRunning()
  } catch {
    logWarning(
      '[Steam] go-offline wrap: Steam-running probe failed, deferring to the guided Go Offline step (no logon)',
      LogPrefix.Steam
    )
    throw new GuidedOfflineRequiredError('running-probe-failed')
  }
  if (!running) {
    logInfo('[Steam] go-offline wrap: Mac Steam not running', LogPrefix.Steam)
    return { value: await connect('not-running'), wrap: 'not-running' }
  }

  const logPath = deps.connectionLogPath()
  const state = readMacSteamCmState(logPath)

  if (state === 'Logged Off') {
    const guidedArmed =
      guidedArmedAt !== null &&
      deps.now() - guidedArmedAt < GUIDED_RESTORE_TTL_MS
    disarmGuided()
    let debtPresent = false
    if (isOnlineDebtOwed(deps)) {
      const debt = readOnlineDebt(deps)
      if (!debtOwnedByOtherLiveProcess(debt, deps)) {
        if (isUnconfirmedDebtStale(debt, () => logPath)) {
          // The wrap's gooffline never landed: this Logged Off is the user's
          // own choice, and the marker no longer means anything.
          clearOnlineDebt(deps)
          logInfo(
            '[Steam] go-offline wrap: unconfirmed marker with no late LogOff, marker cleared',
            LogPrefix.Steam
          )
        } else {
          debtPresent = true
        }
      }
    }
    const armed = guidedArmed || debtPresent
    if (!armed) {
      logInfo(
        '[Steam] go-offline wrap: Mac Steam state=Logged Off, no toggle needed',
        LogPrefix.Steam
      )
      return {
        value: await connect('already-offline'),
        wrap: 'already-offline'
      }
    }
    logInfo(
      guidedArmed
        ? '[Steam] go-offline wrap: Mac Steam state=Logged Off (guided), will restore online afterwards'
        : '[Steam] go-offline wrap: Mac Steam state=Logged Off (owed from an interrupted wrap), will restore online afterwards',
      LogPrefix.Steam
    )
    return {
      value: await runThenGoOnline(connect, 'guided-restore', deps),
      wrap: 'guided-restore'
    }
  }

  logInfo(
    `[Steam] go-offline wrap: Mac Steam state=${state ?? 'unknown'}, firing gooffline`,
    LogPrefix.Steam
  )
  const firedAt = deps.now()
  recordOnlineDebt('toggled', deps, firedAt)
  // Watch BEFORE the verb so the start offset precedes any LogOff line.
  const seen = watchConnectionLog(
    logPath,
    LOGOFF_EVIDENCE_RE,
    MAC_STEAM_LOGOFF_WAIT_MS,
    deps
  )
  goofflinePending++
  let sawLogoff: boolean
  try {
    deps.openUrl(STEAM_GO_OFFLINE_URL)
    // 54-REVIEW WR-04: a shutdown cuts the watch short; the gooffline may
    // still land, so the wrap goes straight on to its goonline below.
    sawLogoff = await Promise.race([seen, shutdownSignal.then(() => true)])
  } finally {
    goofflinePending--
  }
  if (shutdownBegun) {
    logInfo(
      '[Steam] go-offline wrap: shutdown began during the LogOff watch, going back online',
      LogPrefix.Steam
    )
  }
  if (!sawLogoff) {
    logWarning(
      `[Steam] go-offline wrap: no user-initiated LogOff within ${MAC_STEAM_LOGOFF_WAIT_MS}ms, deferring to the guided Go Offline step (no logon)`,
      LogPrefix.Steam
    )
    // 54-REVIEW WR-02: Steam has not gone offline, so nothing is owed yet.
    // The marker is kept only as `toggled-unconfirmed`, owed if the gooffline
    // lands late (isUnconfirmedDebtStale), so a later Go Offline the user
    // chooses is never undone by it.
    recordOnlineDebt('toggled-unconfirmed', deps, firedAt)
    throw new GuidedOfflineRequiredError('logoff-not-seen')
  }
  return {
    value: await runThenGoOnline(connect, 'toggled', deps),
    wrap: 'toggled'
  }
}

async function runThenGoOnline<T>(
  connect: (wrap: MacSteamWrapKind) => Promise<T>,
  kind: MacSteamWrapKind,
  deps: MacSteamOfflineDeps
): Promise<T> {
  let ok = false
  recordOnlineDebt(kind === 'guided-restore' ? 'guided' : 'toggled', deps)
  try {
    const value = await connect(kind)
    ok = true
    return value
  } finally {
    // 54-REVIEW WR-04: the settle sleep is unref'd, so at shutdown it is cut
    // short; otherwise the loop could drain before the goonline fires.
    if (ok && !shutdownBegun) {
      await Promise.race([
        deps.sleep(MAC_STEAM_ONLINE_SETTLE_MS),
        shutdownSignal
      ])
    }
    logInfo('[Steam] go-offline wrap: firing goonline', LogPrefix.Steam)
    fireGoOnlineAndConfirm(deps)
  }
}

/**
 * 54-REVIEW WR-01: the in-session goonline. Fired through the detached
 * `/usr/bin/open` (not the shell's stdout frame, which has no acknowledgement
 * and is dropped when the shell is exiting), then confirmed from
 * connection_log the way the boot restore confirms it. The marker is cleared
 * only on confirmation; unconfirmed, it stays owed for the next wrap, the
 * shutdown restore or the boot restore. Never awaited by the wrap, so the
 * lease holder's result is not held for the confirm window; the watch polls
 * on `deps.sleep` (unref'd) and is bounded at MAC_STEAM_RESTORE_CONFIRM_MS.
 */
function fireGoOnlineAndConfirm(deps: MacSteamOfflineDeps): void {
  const gen = debtGeneration
  let logPath: string | null = null
  try {
    logPath = deps.connectionLogPath()
  } catch {
    logPath = null
  }
  const since = deps.now()
  // Watch BEFORE the fire so the start offset precedes any confirming line.
  const seen =
    logPath === null
      ? Promise.resolve(false)
      : watchConnectionLog(
          logPath,
          /processing complete/,
          MAC_STEAM_RESTORE_CONFIRM_MS,
          deps
        )
  deps.openUrlDetached(STEAM_GO_ONLINE_URL)
  const p: Promise<void> = seen
    .then((saw) => {
      const confirmed =
        saw ||
        (logPath !== null &&
          readMacSteamCmStateSince(logPath, since) === 'Logged On')
      if (!confirmed) {
        logWarning(
          `[Steam] go-offline wrap: online not confirmed within ${MAC_STEAM_RESTORE_CONFIRM_MS}ms, marker kept`,
          LogPrefix.Steam
        )
        return
      }
      // A wrap that started after this goonline owns the marker now.
      if (debtGeneration !== gen) return
      clearOnlineDebt(deps)
      logInfo(
        '[Steam] go-offline wrap: Mac Steam back online, marker cleared',
        LogPrefix.Steam
      )
    })
    .catch(() => undefined)
    .finally(() => {
      if (onlineConfirmInFlight === p) onlineConfirmInFlight = null
    })
  onlineConfirmInFlight = p
}

async function runRestore(
  trigger: MacSteamRestoreTrigger,
  deps: MacSteamOfflineDeps
): Promise<MacSteamRestoreOutcome> {
  if (deps.platform !== 'darwin') return 'not-darwin'
  try {
    if (!isOnlineDebtOwed(deps)) return 'not-owed'
    const debt = readOnlineDebt(deps)
    if (debtOwnedByOtherLiveProcess(debt, deps)) {
      logInfo(
        `[Steam] go-offline restore trigger=${trigger}: marker owned by a live GameLib process, marker kept`,
        LogPrefix.Steam
      )
      return 'kept-owner-alive'
    }
    if (isUnconfirmedDebtStale(debt, deps.connectionLogPath)) {
      clearOnlineDebt(deps)
      logInfo(
        '[Steam] go-offline restore: unconfirmed marker with no late LogOff, nothing owed, marker cleared',
        LogPrefix.Steam
      )
      return 'not-owed'
    }
    let running: boolean
    try {
      running = await deps.isSteamRunning()
    } catch {
      logInfo(
        `[Steam] go-offline restore trigger=${trigger}: running probe failed, marker kept`,
        LogPrefix.Steam
      )
      return 'kept-probe-failed'
    }
    if (!running) {
      logInfo(
        `[Steam] go-offline restore trigger=${trigger}: owed but Mac Steam not running, marker kept`,
        LogPrefix.Steam
      )
      return 'kept-not-running'
    }
    const logPath = deps.connectionLogPath()
    // Watch BEFORE the fire so the start offset precedes any confirming line.
    const seen =
      trigger === 'boot'
        ? watchConnectionLog(
            logPath,
            /processing complete/,
            MAC_STEAM_RESTORE_CONFIRM_MS,
            deps
          )
        : null
    logInfo(
      `[Steam] go-offline restore trigger=${trigger}: firing goonline`,
      LogPrefix.Steam
    )
    deps.openUrlDetached(STEAM_GO_ONLINE_URL)
    if (seen === null) {
      if (goofflinePending > 0) {
        // 54-REVIEW WR-04: a wrap's gooffline may still land after this
        // goonline; the wrap fires its own goonline next, and the boot
        // restore pays the marker if neither is confirmed.
        logInfo(
          `[Steam] go-offline restore trigger=${trigger}: a gooffline is still in flight, marker kept`,
          LogPrefix.Steam
        )
        return 'restore-unconfirmed'
      }
      clearOnlineDebt(deps)
      return 'restored'
    }
    const confirmed =
      (await seen) ||
      (debt.sinceMs !== undefined &&
        readMacSteamCmStateSince(logPath, debt.sinceMs) === 'Logged On')
    if (confirmed) {
      clearOnlineDebt(deps)
      logInfo(
        '[Steam] go-offline restore trigger=boot: Mac Steam back online, marker cleared',
        LogPrefix.Steam
      )
      return 'restored'
    }
    logInfo(
      `[Steam] go-offline restore trigger=boot: online not confirmed within ${MAC_STEAM_RESTORE_CONFIRM_MS}ms, marker kept`,
      LogPrefix.Steam
    )
    return 'restore-unconfirmed'
  } catch {
    return 'kept-probe-failed'
  }
}

/**
 * Pays the goonline a wrap owed when its process died first. Never rejects;
 * single-flight per trigger. With no marker it does no work at all.
 */
export function restoreMacSteamOnlineIfOwed(
  trigger: MacSteamRestoreTrigger,
  deps: MacSteamOfflineDeps = defaultMacSteamOfflineDeps()
): Promise<MacSteamRestoreOutcome> {
  if (trigger === 'shutdown') beginMacSteamShutdown()
  const existing = restoreInFlight[trigger]
  if (existing) return existing
  const p: Promise<MacSteamRestoreOutcome> = runRestore(trigger, deps)
    .catch((): MacSteamRestoreOutcome => 'kept-probe-failed')
    .finally(() => {
      if (restoreInFlight[trigger] === p) restoreInFlight[trigger] = null
    })
  restoreInFlight[trigger] = p
  return p
}

/**
 * The renderer's Continue button on the guided Go Offline step. Reports
 * whether Mac Steam is now offline (or not running) and, when it is, arms the
 * one-shot guided restore.
 */
export async function checkGuidedOfflineReady(
  deps: MacSteamOfflineDeps = defaultMacSteamOfflineDeps()
): Promise<SteamGoOfflineRetryResult> {
  if (deps.platform !== 'darwin') return { status: 'not-macos' }
  let running: boolean
  try {
    running = await deps.isSteamRunning()
  } catch {
    return { status: 'still-online' }
  }
  if (running) {
    const state = readMacSteamCmState(deps.connectionLogPath())
    if (state !== 'Logged Off') return { status: 'still-online' }
  }
  disarmGuided()
  if (running) {
    recordOnlineDebt('guided', deps)
    // 54-REVIEW WR-05: if no wrapped logon consumes this arm in time (the
    // retry failed before its logon, or a redeem is never retried), pay the
    // goonline anyway. unref'd: it never holds the sidecar open.
    guidedExpiryTimer = setTimeout(
      () => payAbandonedGuidedOffline('expired', deps),
      GUIDED_RESTORE_TTL_MS
    )
    guidedExpiryTimer.unref?.()
  }
  guidedArmedAt = deps.now()
  return { status: 'ready' }
}

/**
 * 54-REVIEW WR-05: the user left the guided Go Offline step (Cancel, close)
 * or its arm lapsed, while Mac Steam is offline only because GameLib asked.
 * Fires the goonline and clears the marker once Steam is confirmed online.
 * A no-op unless the step is still armed and the marker is this process's own
 * `guided` record, so it never undoes a wrap in flight or the user's choice.
 */
export function payAbandonedGuidedOffline(
  cause: 'cancel' | 'expired',
  deps: MacSteamOfflineDeps = defaultMacSteamOfflineDeps()
): boolean {
  const armed = guidedArmedAt !== null
  disarmGuided()
  if (deps.platform !== 'darwin' || !armed) return false
  if (!isOnlineDebtOwed(deps)) return false
  const debt = readOnlineDebt(deps)
  if (debt.by !== 'guided' || debt.pid !== deps.selfPid) return false
  logInfo(
    `[Steam] go-offline guided step ${cause === 'cancel' ? 'cancelled' : 'expired'}: firing goonline`,
    LogPrefix.Steam
  )
  fireGoOnlineAndConfirm(deps)
  return true
}
