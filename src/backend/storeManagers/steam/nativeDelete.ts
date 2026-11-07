/**
 * quick 261106-s3n: routing decision for "Delete Steam games directly in
 * GameLib" (setting ON), native root. Performs NO deletion itself:
 *   1. refuse while the game is running (fails closed if that can't be read);
 *   2. ask running, signed-in Steam to UninstallApp via the bridge helper;
 *   3. anything that means "Steam can't do it" -> `fallback`, and the caller
 *      deletes the files itself through removeSteamInstallCopy.
 */
import { LogPrefix, logInfo, logWarning } from 'backend/logger'

import { readRunningAppId } from './library'
import { isProcessRunningFromFolder } from './runningFromFolder'
import { requestSteamUninstallApp } from './steamInstallApp'
import type { SteamUninstallAppOutcome } from './steamInstallApp'

type SteamNativeDeleteDecision =
  | { route: 'refused-running' }
  | { route: 'steam-uninstalled' }
  | { route: 'fallback'; why: string }
  | { route: 'steam-error'; code: number }
  | { route: 'refused'; reason: string }

interface SteamNativeDeleteDeps {
  readRunningAppId?: () => number
  isProcessRunningFromFolder?: (folder: string) => Promise<boolean>
  platform?: NodeJS.Platform
  requestSteamUninstallApp?: (
    appId: string
  ) => Promise<SteamUninstallAppOutcome>
}

/** EAppUpdateError "not installed" -- also what signed-out Steam answers. */
const EAPPUPDATE_NOT_INSTALLED = 18

/**
 * EAppUpdateError "app running". Seen as "UninstallApp EAppUpdateError 16" in
 * the 2026-11-07 log while WazHack ran (live gate D).
 */
const EAPPUPDATE_APP_RUNNING = 16

export async function decideSteamNativeDelete(
  appId: string,
  installFolder: string | undefined,
  deps: SteamNativeDeleteDeps = {}
): Promise<SteamNativeDeleteDecision> {
  const running = deps.readRunningAppId ?? readRunningAppId
  const inFolder = deps.isProcessRunningFromFolder ?? isProcessRunningFromFolder
  const platform = deps.platform ?? process.platform
  const uninstall =
    deps.requestSteamUninstallApp ?? ((id) => requestSteamUninstallApp(id))

  try {
    if (running() === Number(appId)) {
      logInfo(
        `SteamGame: delete of appId ${appId} refused: game is running`,
        LogPrefix.Steam
      )
      return { route: 'refused-running' }
    }
    if (platform !== 'win32') {
      if (!installFolder) throw new Error('no install folder to check')
      if (await inFolder(installFolder)) {
        logInfo(
          `SteamGame: delete of appId ${appId} refused: a process is running from ${installFolder}`,
          LogPrefix.Steam
        )
        return { route: 'refused-running' }
      }
    }
  } catch (error) {
    logWarning(
      `SteamGame: delete of appId ${appId} refused: running check failed (${String(error)})`,
      LogPrefix.Steam
    )
    return { route: 'refused', reason: 'running-check-failed' }
  }

  const outcome = await uninstall(appId)
  if (outcome.kind === 'ok') {
    logInfo(
      `SteamGame: Steam UninstallApp accepted appId ${appId}`,
      LogPrefix.Steam
    )
    return { route: 'steam-uninstalled' }
  }
  if (outcome.kind === 'unavailable') {
    logInfo(
      `SteamGame: Steam helper unavailable for appId ${appId} (${outcome.reason}); deleting in GameLib`,
      LogPrefix.Steam
    )
    return { route: 'fallback', why: outcome.reason }
  }
  if (outcome.code === EAPPUPDATE_NOT_INSTALLED) {
    const why =
      outcome.installedApps === 0 ? 'signed-out' : 'steam-not-installed'
    logInfo(
      `SteamGame: UninstallApp error 18 for appId ${appId} (${why}, installedApps ${String(outcome.installedApps)}); deleting in GameLib`,
      LogPrefix.Steam
    )
    return { route: 'fallback', why }
  }
  if (outcome.code === EAPPUPDATE_APP_RUNNING) {
    logInfo(
      `SteamGame: UninstallApp error 16 for appId ${appId}: game is running`,
      LogPrefix.Steam
    )
    return { route: 'refused-running' }
  }
  logWarning(
    `SteamGame: UninstallApp refused appId ${appId} with error ${outcome.code}; nothing deleted`,
    LogPrefix.Steam
  )
  return { route: 'steam-error', code: outcome.code }
}
