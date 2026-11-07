/**
 * The DRM-mode registry half of the `bottle-stage` DrmStep: the Windows-side
 * path constants, the four HKCU `reg add` argv arrays, the user.reg staging
 * check, the Phase 52 forwarder marker and the bounded `reg add` runner.
 * Current-user hive only (D-21).
 */
import { isPackagedSidecar } from 'backend/sidecar/isPackagedSidecar'
import type { StageDrmBottleDeps } from './stageDrmTypes'

export const DRM_STEAM_DIR_SEGMENTS = ['Program Files (x86)', 'Steam'] as const
export const DRM_STEAM_DIR_WIN = 'C:\\Program Files (x86)\\Steam'
export const DRM_STEAMCLIENT64_WIN = DRM_STEAM_DIR_WIN + '\\steamclient64.dll'
export const DRM_HELPER_WIN = DRM_STEAM_DIR_WIN + '\\steam.exe'
/** Genuine Valve client files (D-06), from the 56-07 cache. */
export const DRM_VALVE_FILES = [
  'steamclient64.dll',
  'tier0_s64.dll',
  'vstdlib_s64.dll'
] as const
/** Files from the 56-10 steamclient-layer component. */
export const DRM_COMPONENT_FILES = ['lsteamclient.dll', 'steam.exe'] as const
export const DRM_REG_ADD_TIMEOUT_MS = 15_000
/**
 * Extra attempts after a timed-out reg add. A fresh bottle's first wine session
 * can wedge in winedevice (winebus HID spin); the next fresh session passes.
 */
export const DRM_REG_ADD_RETRIES = 1

const ACTIVE_PROCESS_KEY = 'HKCU\\Software\\Valve\\Steam\\ActiveProcess'
const STEAM_KEY = 'HKCU\\Software\\Valve\\Steam'
export const MAX_USER_REG_BYTES = 64 * 1024 * 1024

/**
 * The Phase 52 forwarder's version-resource FileDescription, stored UTF-16LE.
 * A steamclient64.dll without it is not ours and is never deleted.
 */
const PHASE52_FORWARDER_MARKER_UTF16 = Buffer.from(
  'GameLib steamclient forwarder',
  'utf16le'
)

/**
 * Four argv arrays (no shell). Throws only inside this pure builder, on a
 * value that could not be a plain Windows drive path.
 */
export function buildDrmRegistryCommands(): string[][] {
  const add = (key: string, name: string, data: string): string[] => {
    if (
      (data !== 'Public' && !/^[A-Za-z]:\\/.test(data)) ||
      /["\r\n\0]/.test(data)
    ) {
      throw new Error('buildDrmRegistryCommands: invalid registry data')
    }
    return ['reg', 'add', key, '/v', name, '/t', 'REG_SZ', '/d', data, '/f']
  }
  return [
    add(ACTIVE_PROCESS_KEY, 'SteamClientDll64', DRM_STEAMCLIENT64_WIN),
    add(ACTIVE_PROCESS_KEY, 'Universe', 'Public'),
    add(ACTIVE_PROCESS_KEY, 'SteamPath', DRM_STEAM_DIR_WIN),
    add(STEAM_KEY, 'SteamPath', DRM_STEAM_DIR_WIN)
  ]
}

const regEscape = (s: string): string => s.replace(/\\/g, '\\\\')

/**
 * The helper steam.exe / lsteamclient rewrite SteamPath with a trailing
 * backslash after staging. That is the same directory, so it must not count as
 * "not staged": a needless `reg add` starts a fresh wine session whose
 * wineboot --init can hang on a crashing winebus (debug
 * drm-second-launch-bottle-stage).
 */
const sameSteamPath = (v: string | undefined): boolean =>
  v !== undefined &&
  v.replace(/(\\\\)+$/, '').toLowerCase() ===
    regEscape(DRM_STEAM_DIR_WIN).toLowerCase()

/**
 * Names (`<section>:<value>`) of the four values buildDrmRegistryCommands()
 * writes that are missing or different in a wine user.reg body; [] when fully
 * staged. Pure; never throws (an unreadable body reports `user.reg:unparseable`).
 */
export function drmRegistryMismatches(text: string): string[] {
  try {
    if (typeof text !== 'string' || text.length > MAX_USER_REG_BYTES) {
      return ['user.reg:unparseable']
    }
    const sections = new Map<string, Map<string, string>>()
    let current: Map<string, string> | null = null
    for (const line of text.split('\n')) {
      const header = /^\[(.+?)\](\s+\d+)?\s*$/.exec(line)
      const name = header?.[1]
      if (header && name !== undefined) {
        current = sections.get(name) ?? new Map<string, string>()
        sections.set(name, current)
        continue
      }
      const value = /^"([^"]+)"="(.*)"\s*$/.exec(line)
      const valueKey = value?.[1]
      const valueText = value?.[2]
      if (valueKey !== undefined && valueText !== undefined && current) {
        current.set(valueKey, valueText)
      }
    }
    const activeName = 'Software\\\\Valve\\\\Steam\\\\ActiveProcess'
    const steamName = 'Software\\\\Valve\\\\Steam'
    const active = sections.get(activeName)
    const steam = sections.get(steamName)
    const out: string[] = []
    if (active?.get('SteamClientDll64') !== regEscape(DRM_STEAMCLIENT64_WIN)) {
      out.push(`${activeName}:SteamClientDll64`)
    }
    if (active?.get('Universe') !== 'Public') {
      out.push(`${activeName}:Universe`)
    }
    if (!sameSteamPath(active?.get('SteamPath'))) {
      out.push(`${activeName}:SteamPath`)
    }
    if (!sameSteamPath(steam?.get('SteamPath'))) {
      out.push(`${steamName}:SteamPath`)
    }
    return out
  } catch {
    return ['user.reg:unparseable']
  }
}

/**
 * True when a wine user.reg body already holds all four values written by
 * buildDrmRegistryCommands(). Pure; never throws.
 */
export function drmRegistryStagedInUserReg(text: string): boolean {
  return drmRegistryMismatches(text).length === 0
}

/** True when the bytes carry the Phase 52 forwarder version string. */
export function isPhase52ForwarderBytes(buf: Buffer): boolean {
  return buf.includes(PHASE52_FORWARDER_MARKER_UTF16)
}

/**
 * Dev-only fault injection (T-56-32-01): GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS
 * shortens attempt 0 so the live gate can force the retry path. Ignored by a
 * packaged sidecar (isPackagedSidecar fails closed) and by anything but 3-5
 * digits.
 */
export function forcedFirstTimeoutMs(deps: StageDrmBottleDeps): number | null {
  const raw = (deps.env ?? process.env).GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS
  if (raw === undefined || !/^[0-9]{3,5}$/.test(raw)) return null
  if ((deps.isPackaged ?? isPackagedSidecar)()) return null
  return Number(raw)
}

export async function runRegArgv(
  commands: string[][],
  run: NonNullable<StageDrmBottleDeps['runReg']>,
  timeoutMs: number
): Promise<string | null> {
  for (const commandParts of commands) {
    const valueName = commandParts[4]
    // The timer is unref'd (sidecar exit contract, half 1) and cleared once the
    // race settles.
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((resolveTimeout) => {
      timer = setTimeout(() => resolveTimeout('timeout'), timeoutMs)
      timer.unref?.()
    })
    try {
      const res = await Promise.race([run(commandParts), timeout])
      if (res === 'timeout') {
        return `reg add ${valueName} timed out after ${timeoutMs} ms`
      }
      if (res.code !== 0) {
        return `reg add ${valueName} failed code=${String(res.code)} stderr=${String(res.stderr ?? '').slice(0, 120)}`
      }
    } catch (err) {
      return `reg add ${valueName} failed: ${String(err)}`
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  return null
}
