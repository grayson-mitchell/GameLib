import { logInfo, LogPrefix } from 'backend/logger'
import { join } from 'path'
import { existsSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { userHome } from 'backend/constants/paths'
import type { Clock, ProcessRunner, TimerHandle } from 'backend/process/types'

export interface RunningPollProbeDeps {
  runner: Pick<ProcessRunner, 'run'>
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
 * Parses via @node-steam/vdf with exact casing (Pitfall 4 — T-06-06).
 * Returns 0 when file absent, parse fails, or key missing.
 */
/** The macOS reader: pure file read, no spawn. */
export function readMacRunningAppId(): number {
  const regPath = join(
    userHome,
    'Library',
    'Application Support',
    'Steam',
    'registry.vdf'
  )
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
}

/**
 * Reads Linux ~/.steam/registry.vdf for RunningAppID.
 * Note: this is ~/.steam/registry.vdf, NOT ~/.steam/steam/registry.vdf (Pitfall 3).
 * Returns 0 when file absent, parse fails, or broken (ValveSoftware/steam-for-linux#9672).
 */
function linuxRegistryVdfRunningAppId(): number {
  const regPath = join(userHome, '.steam', 'registry.vdf')
  if (!existsSync(regPath)) return 0
  try {
    const content = readFileSync(regPath, 'utf-8')
    const parsed = parse(content)
    const raw = parsed?.Registry?.HKCU?.Software?.Valve?.Steam?.RunningAppID
    return raw ? parseInt(raw, 10) : 0
  } catch {
    return 0
  }
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
  if (platform === 'darwin') return readMacRunningAppId()
  // Linux: VDF first, reaper fallback when VDF returns 0 (D-05)
  const fromRegistry = linuxRegistryVdfRunningAppId()
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId(deps)
}

export interface RunningPoll {
  start(intervalMs?: number): void
  stop(): void
  pollOnce(): Promise<void>
  /** The appId the poller last saw running (0 when none, or never started). */
  lastAppId(): number
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
 *
 * AppID is scoped to a numeric-only string (T-06-07 -- no raw external string).
 */
export function createRunningPoll(deps: {
  clock: Clock
  readRunningAppId: () => Promise<number>
  notify: (appId: number, status: 'playing' | 'done') => void
}): RunningPoll {
  let timer: TimerHandle | null = null
  let lastKnownRunningAppId = 0
  let inFlight = false

  async function pollOnce(): Promise<void> {
    if (inFlight) return
    inFlight = true
    try {
      const currentAppId = await deps.readRunningAppId()
      if (currentAppId === lastKnownRunningAppId) return
      if (lastKnownRunningAppId !== 0) {
        deps.notify(lastKnownRunningAppId, 'done')
        logInfo(
          `Steam: running-game poller: game ${lastKnownRunningAppId} stopped`,
          LogPrefix.Steam
        )
      }
      if (currentAppId !== 0) {
        deps.notify(currentAppId, 'playing')
        logInfo(
          `Steam: running-game poller: game ${currentAppId} started`,
          LogPrefix.Steam
        )
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
      logInfo('Steam: stopped running-game poller', LogPrefix.Steam)
    },
    pollOnce,
    lastAppId: () => lastKnownRunningAppId
  }
}
