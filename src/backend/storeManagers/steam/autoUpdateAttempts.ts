/**
 * CR-02: the per-boot marker that stops the unattended auto-update loop. An auto-update that fails
 * leaves the game stale; without this marker every refresh would list it again and re-queue it
 * (two OS notifications plus a detection pass per cycle, forever). The marker maps appId to the
 * target build the attempt was made for, so a newer build or a user-started Update re-arms it.
 *
 * Closure Map on the install runtime only: no timers, no I/O, so the sidecar exit contract is
 * unaffected.
 */
import { logInfo, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import {
  getLastKnownSteamUpdateState,
  type SteamUpdateState
} from './updateDetection'

/** Recorded when the attempt had no known target build; matches any target until cleared. */
export const AUTO_UPDATE_ANY_BUILD = '*'

export function noteAutoUpdateAttempt(
  deps: Pick<ManagerDeps, 'steamInstallRuntime'>,
  appId: string
): void {
  const build =
    getLastKnownSteamUpdateState(deps, appId)?.targetBuild ??
    AUTO_UPDATE_ANY_BUILD
  deps.steamInstallRuntime.autoUpdateAttempts.set(appId, build)
  logInfo(
    `Steam: auto-update attempt recorded for appId ${appId} (build ${build}); not retried for this build this session`,
    LogPrefix.Steam
  )
}

export function clearAutoUpdateAttempt(
  deps: Pick<ManagerDeps, 'steamInstallRuntime'>,
  appId: string
): void {
  deps.steamInstallRuntime.autoUpdateAttempts.delete(appId)
}

export function wasAutoUpdateAttempted(
  deps: Pick<ManagerDeps, 'steamInstallRuntime'>,
  state: Pick<SteamUpdateState, 'appId' | 'targetBuild'>
): boolean {
  const recorded = deps.steamInstallRuntime.autoUpdateAttempts.get(state.appId)
  if (recorded === undefined) return false
  return recorded === AUTO_UPDATE_ANY_BUILD || recorded === state.targetBuild
}
