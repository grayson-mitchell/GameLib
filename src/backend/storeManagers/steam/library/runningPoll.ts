import { logInfo, LogPrefix } from 'backend/logger'
import { join } from 'path'
import { spawnSync, execFileSync } from 'child_process'
import { existsSync, readFileSync } from 'graceful-fs'
import { parse } from '@node-steam/vdf'
import { isWindows, isMac } from 'backend/constants/environment'
import { userHome } from 'backend/constants/paths'
import { sendFrontendMessage } from '../../../ipc'

/** Module-level timer for the running-game poller (single global poll). */
let runningPollTimer: NodeJS.Timeout | null = null

/** Last RunningAppID seen by the poller — used to detect deltas. */
let lastKnownRunningAppId = 0

/**
 * Reads Windows HKCU\Software\Valve\Steam\RunningAppID via reg.exe.
 * Uses argv-form spawnSync (no shell) — registry path is hardcoded (T-06-04).
 * Returns 0 on missing value, non-zero exit status, or thrown error.
 */
function windowsRunningAppId(): number {
  try {
    const result = spawnSync(
      'reg',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'RunningAppID'],
      { encoding: 'utf8', windowsHide: true, timeout: 2000 }
    )
    if (result.status !== 0) return 0
    const match = result.stdout?.match(
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
function macOsRunningAppId(): number {
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
function linuxFallbackRunningAppId(): number {
  try {
    const output = execFileSync('ps', ['-eo', 'args'], {
      encoding: 'utf8',
      timeout: 1000
    })
    const match = output.match(/reaper SteamLaunch --AppId (\d+)/)
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
export function readRunningAppId(): number {
  if (isWindows) return windowsRunningAppId()
  if (isMac) return macOsRunningAppId()
  // Linux: VDF first, reaper fallback when VDF returns 0 (D-05)
  const fromRegistry = linuxRegistryVdfRunningAppId()
  return fromRegistry !== 0 ? fromRegistry : linuxFallbackRunningAppId()
}

/**
 * Executes one running-game poll tick:
 * - 0→X: sends `playing` for X
 * - X→0: sends `done` for X
 * - X→Y: sends `done` for X then `playing` for Y
 * - unchanged: no-op
 *
 * AppID is scoped to a numeric-only string (T-06-07 — no raw external string).
 * Exported for unit testing.
 */
export function pollRunningOnce(): void {
  const currentAppId = readRunningAppId()
  if (currentAppId === lastKnownRunningAppId) return

  if (lastKnownRunningAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(lastKnownRunningAppId),
      runner: 'steam',
      status: 'done'
    })
    logInfo(
      `Steam: running-game poller: game ${lastKnownRunningAppId} stopped`,
      LogPrefix.Steam
    )
  }
  if (currentAppId !== 0) {
    sendFrontendMessage('gameStatusUpdate', {
      appName: String(currentAppId),
      runner: 'steam',
      status: 'playing'
    })
    logInfo(
      `Steam: running-game poller: game ${currentAppId} started`,
      LogPrefix.Steam
    )
  }

  lastKnownRunningAppId = currentAppId
}

/**
 * Starts the running-game poller. Idempotent — calling twice has no effect.
 * Polls every intervalMs milliseconds (default 5000 / D-06).
 *
 * Exported for unit testing.
 */
export function startRunningPoll(intervalMs = 5000): void {
  if (runningPollTimer) return // idempotent
  runningPollTimer = setInterval(pollRunningOnce, intervalMs)
  // Teardown-safety (mirrors the install/uninstall pollers above): unref so a
  // leaked real poller never keeps a Jest worker alive on its own.
  // Production-neutral in the Electron main process. pollRunningOnce is
  // synchronous and its own readRunningAppId() never throws (see docstring),
  // so no try/catch guard is needed here.
  runningPollTimer.unref?.()
  logInfo('Steam: started running-game poller', LogPrefix.Steam)
}

/**
 * Stops the running-game poller and resets lastKnownRunningAppId to 0 so the
 * next startRunningPoll starts with a clean slate. Safe to call when no poll is
 * active (no-op on timer, always resets state).
 *
 * Exported for unit testing.
 */
export function stopRunningPoll(): void {
  if (runningPollTimer) {
    clearInterval(runningPollTimer)
    runningPollTimer = null
  }
  lastKnownRunningAppId = 0
  logInfo('Steam: stopped running-game poller', LogPrefix.Steam)
}
