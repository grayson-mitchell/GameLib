import { logInfo, LogPrefix } from 'backend/logger'
import type { AppPaths } from 'backend/process/context'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMPOLL_READ_RUNNING_APP_ID } from 'common/types/sidecarTransport'
import { invokeSteamPoll } from '../pollRust/rustSteamPoll'
import type { Clock, ProcessRunner, TimerHandle } from 'backend/process/types'

export interface RunningPollProbeDeps extends RustInvokeDeps {
  runner: Pick<ProcessRunner, 'run'>
  paths: Pick<AppPaths, 'userHome'>
}

/**
 * Reads the currently running Steam game AppID. D-13: the whole probe (Windows reg.exe,
 * registry.vdf, Linux reaper scan) runs in Rust. A rejected invoke is 0 unless `strict`, where it
 * propagates (WR-01).
 */
async function readRunningAppIdViaRust(
  rust: RustInvokeDeps,
  strict: boolean
): Promise<number> {
  try {
    return (await invokeSteamPoll(rust, RUST_STEAMPOLL_READ_RUNNING_APP_ID, {
      strict
    })) as number
  } catch (error) {
    if (strict) throw error
    return 0
  }
}

/** The macOS reader: the Rust probe (registry.vdf parse with exact casing, T-06-06). */
export function readMacRunningAppId(
  deps: Pick<RunningPollProbeDeps, 'requestRustInvoke'>,
  strict = false
): Promise<number> {
  return readRunningAppIdViaRust(deps, strict)
}

/**
 * Reads the currently running Steam game AppID, cross-platform (the probe is Rust, D-13).
 * Returns 0 when no game is running or on any error. Never throws.
 */
export function readRunningAppId(
  deps: RunningPollProbeDeps,
  _platform: NodeJS.Platform = process.platform
): Promise<number> {
  return readRunningAppIdViaRust(deps, false)
}

/**
 * readRunningAppId for a safety guard: a rejected rustInvoke throws instead of reading as "no
 * game running", so decideSteamNativeDelete's running-check-failed refusal can fire (WR-01, 75
 * review).
 */
export function readRunningAppIdOrThrow(
  deps: RunningPollProbeDeps,
  _platform: NodeJS.Platform = process.platform
): Promise<number> {
  return readRunningAppIdViaRust(deps, true)
}

export interface RunningPoll {
  start(intervalMs?: number): void
  stop(): void
  pollOnce(): Promise<void>
  /** The appId the poller last saw running (0 when none, or never started). */
  lastAppId(): number
  /**
   * quick 261111-a9g: the launch watch claims an appId's status, so the poller stays silent for
   * it. The returned release is bound to this claim (a later hold replaces it and the stale
   * release becomes a no-op) and acts once.
   * - release(true): the watch sent done, or was cancelled (Stop owns the terminal frame). The
   *   claim drains: the poller stays silent until it reads a different RunningAppID, and sends
   *   playing if it still reads this appId drainMs after the release (a premature done heals).
   * - release(false): the watch handed back. The claim is deleted, and if the poller already
   *   reads the appId it sends playing now.
   */
  hold(appId: number): (terminalSent: boolean) => void
}

interface Claim {
  /** Set once released with a terminal frame sent: the drain deadline. */
  until?: number
}

/**
 * The running-game poller as a boot-built instance (D-15). Timer, last id and the in-flight
 * flag are closure state; the interval is a clock timer (unref'd by default), and a tick
 * never overlaps a previous one that is still awaiting the probe (Pitfall 7).
 *
 * Each tick:
 * - 0->X: sends `playing` for X
 * - X->0: sends `done` for X
 * - X->Y: sends `done` for X then `playing` for Y
 * - unchanged: no-op
 * A claimed appId (see RunningPoll.hold) sends neither.
 *
 * AppID is scoped to a numeric-only string (T-06-07 -- no raw external string).
 */
export function createRunningPoll(deps: {
  clock: Clock
  readRunningAppId: () => Promise<number>
  notify: (appId: number, status: 'playing' | 'done') => void
  /** How long a drained claim stays silent while RunningAppID persists (default 20000). */
  drainMs?: number
}): RunningPoll {
  const drainMs = deps.drainMs ?? 20000
  let timer: TimerHandle | null = null
  let lastKnownRunningAppId = 0
  // Reads are awaited (they cross to Rust), so a slow read must not let the next interval tick
  // start a second pollOnce on top of it (RESEARCH Pattern 4). Closure state, not module state.
  let inFlight = false
  const claims = new Map<number, Claim>()

  async function pollOnce(): Promise<void> {
    if (inFlight) return
    inFlight = true
    try {
      const currentAppId = await deps.readRunningAppId()
      const previous = lastKnownRunningAppId
      const previousClaimed = previous !== 0 && claims.has(previous)
      let republish = false
      for (const [id, claim] of claims) {
        if (claim.until === undefined) continue
        if (id !== currentAppId) claims.delete(id)
        else if (deps.clock.now() >= claim.until) {
          claims.delete(id)
          republish = true
        }
      }
      if (currentAppId === previous) {
        if (republish && currentAppId !== 0) {
          deps.notify(currentAppId, 'playing')
          logInfo(
            `Steam: running-game poller: game ${currentAppId} still running ${drainMs} ms after its launch watch ended; reporting playing`,
            LogPrefix.Steam
          )
        }
        return
      }
      if (previous !== 0) {
        if (previousClaimed) {
          logInfo(
            `Steam: running-game poller: game ${previous} stopped (status owned by launch watch)`,
            LogPrefix.Steam
          )
        } else {
          deps.notify(previous, 'done')
          logInfo(
            `Steam: running-game poller: game ${previous} stopped`,
            LogPrefix.Steam
          )
        }
      }
      if (currentAppId !== 0) {
        if (claims.has(currentAppId)) {
          logInfo(
            `Steam: running-game poller: game ${currentAppId} started (status owned by launch watch)`,
            LogPrefix.Steam
          )
        } else {
          deps.notify(currentAppId, 'playing')
          logInfo(
            `Steam: running-game poller: game ${currentAppId} started`,
            LogPrefix.Steam
          )
        }
      }
      lastKnownRunningAppId = currentAppId
    } catch {
      // readRunningAppId never throws; a notify failure must not kill the poll
    } finally {
      inFlight = false
    }
  }

  return {
    start(intervalMs = 5000) {
      if (timer) return // idempotent
      timer = deps.clock.setInterval(() => void pollOnce(), intervalMs)
      logInfo('Steam: started running-game poller', LogPrefix.Steam)
    },
    stop() {
      if (timer) {
        deps.clock.clear(timer)
        timer = null
      }
      lastKnownRunningAppId = 0
      claims.clear()
      logInfo('Steam: stopped running-game poller', LogPrefix.Steam)
    },
    pollOnce,
    lastAppId: () => lastKnownRunningAppId,
    hold(appId) {
      const claim: Claim = {}
      claims.set(appId, claim)
      let released = false
      return (terminalSent) => {
        if (released) return
        released = true
        if (claims.get(appId) !== claim) return
        if (terminalSent) {
          claim.until = deps.clock.now() + drainMs
          return
        }
        claims.delete(appId)
        if (lastKnownRunningAppId === appId) {
          deps.notify(appId, 'playing')
          logInfo(
            `Steam: running-game poller: game ${appId} running; launch watch handed its status back`,
            LogPrefix.Steam
          )
        }
      }
    }
  }
}
