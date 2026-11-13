import { logInfo, LogPrefix } from 'backend/logger'
import { join } from 'path'
import type { AppPaths } from 'backend/process/context'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_RUNNING_APP_ID } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from '../localFiles/rustSteamFiles'
import type { Clock, ProcessRunner, TimerHandle } from 'backend/process/types'

export interface RunningPollProbeDeps extends RustInvokeDeps {
  runner: Pick<ProcessRunner, 'run'>
  paths: Pick<AppPaths, 'userHome'>
}

/**
 * Reads Windows HKCU\Software\Valve\Steam\RunningAppID via reg.exe.
 * Uses argv-form spawnSync (no shell) — registry path is hardcoded (T-06-04).
 * Returns 0 on missing value, non-zero exit status, or thrown error.
 */
async function windowsRunningAppId(
  deps: RunningPollProbeDeps
): Promise<number> {
  try {
    const result = await deps.runner.run(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { windowsHide: true, timeoutMs: 2000, stdin: '' }
    )
    if (result.timedOut || result.code !== 0) return 0
    const match = result.stdout.match(
      /RunningAppID\s+REG_DWORD\s+0x([0-9a-f]+)/i
    )
    const hex = match?.[1]
    return hex === undefined ? 0 : parseInt(hex, 16)
  } catch {
    return 0
  }
}

/**
 * Reads macOS ~/Library/Application Support/Steam/registry.vdf for RunningAppID.
 * Parsed in Rust (steamfiles) with exact casing (Pitfall 4 — T-06-06).
 * Returns 0 when file absent, parse fails, or key missing.
 */
/** The macOS reader: pure file read, no spawn. */
export async function readMacRunningAppId(
  deps: Pick<RunningPollProbeDeps, 'paths' | 'requestRustInvoke'>,
  strict = false
): Promise<number> {
  const regPath = join(
    deps.paths.userHome,
    'Library',
    'Application Support',
    'Steam',
    'registry.vdf'
  )
  return readRegistryRunningAppId(deps, regPath, strict)
}

/**
 * The registry.vdf RunningAppID read shared by the macOS and Linux readers; 0 on any failure
 * unless `strict`, where a rejected rustInvoke propagates (WR-01, 75 review).
 */
async function readRegistryRunningAppId(
  rust: RustInvokeDeps,
  regPath: string,
  strict = false
): Promise<number> {
  try {
    const r = await invokeSteamFiles(
      rust,
      RUST_STEAMFILES_READ_RUNNING_APP_ID,
      {
        path: regPath
      }
    )
    return r.runningAppId
  } catch (error) {
    if (strict) throw error
    return 0
  }
}

/**
 * Reads Linux ~/.steam/registry.vdf for RunningAppID.
 * Note: this is ~/.steam/registry.vdf, NOT ~/.steam/steam/registry.vdf (Pitfall 3).
 * Returns 0 when file absent, parse fails, or broken (ValveSoftware/steam-for-linux#9672).
 */
function linuxRegistryVdfRunningAppId(
  deps: Pick<RunningPollProbeDeps, 'paths' | 'requestRustInvoke'>,
  strict = false
): Promise<number> {
  const regPath = join(deps.paths.userHome, '.steam', 'registry.vdf')
  return readRegistryRunningAppId(deps, regPath, strict)
}

/**
 * Linux fallback: scans process cmdline for the Steam reaper process which carries
 * the running AppId. Uses argv-form execFileSync with a narrow regex (T-06-05).
 * Returns 0 when no reaper found or execFileSync fails.
 */
async function linuxFallbackRunningAppId(
  deps: RunningPollProbeDeps
): Promise<number> {
  try {
    const result = await deps.runner.run('ps', ['-eo', 'args'], {
      timeoutMs: 1000,
      stdin: ''
    })
    if (result.timedOut || result.truncated || result.code !== 0) return 0
    const match = result.stdout.match(/reaper SteamLaunch --AppId (\d+)/)
    const digits = match?.[1]
    return digits === undefined ? 0 : parseInt(digits, 10)
  } catch {
    return 0
  }
}

/**
 * Reads the currently running Steam game AppID, cross-platform.
 *
 * - Windows: reads HKCU registry via reg.exe (T-06-04)
 * - macOS: reads ~/Library/Application Support/Steam/registry.vdf (T-06-06)
 * - Linux: tries ~/.steam/registry.vdf first; falls back to reaper process scan
 *   because the Linux VDF RunningAppID is broken since 2023 (ValveSoftware/#9672)
 *   (T-06-05)
 *
 * Returns 0 when no game is running or on any error. Never throws.
 * Exported for unit testing.
 */
export async function readRunningAppId(
  deps: RunningPollProbeDeps,
  platform: NodeJS.Platform = process.platform
): Promise<number> {
  if (platform === 'win32') return windowsRunningAppId(deps)
  if (platform === 'darwin') return readMacRunningAppId(deps)
  // Linux: VDF first, reaper fallback when VDF returns 0 (D-05)
  const fromRegistry = await linuxRegistryVdfRunningAppId(deps)
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId(deps)
}

/**
 * readRunningAppId for a safety guard: a rejected registry.vdf rustInvoke
 * (macOS, Linux) throws instead of reading as "no game running", so
 * decideSteamNativeDelete's running-check-failed refusal can fire (WR-01, 75
 * review). Windows (reg.exe) is unchanged.
 */
export async function readRunningAppIdOrThrow(
  deps: RunningPollProbeDeps,
  platform: NodeJS.Platform = process.platform
): Promise<number> {
  if (platform === 'win32') return windowsRunningAppId(deps)
  if (platform === 'darwin') return readMacRunningAppId(deps, true)
  const fromRegistry = await linuxRegistryVdfRunningAppId(deps, true)
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId(deps)
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
