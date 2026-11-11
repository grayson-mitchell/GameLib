import {
  defaultWinePrefix,
  fixesPath,
  gamesConfigPath
} from 'backend/constants/paths'
import { notify } from 'backend/dialog/dialog'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import type { ManagerDeps } from 'backend/services/types'
import type { GlobalConfigSlice } from 'backend/config'
import { sendGameStatusUpdate } from 'backend/utils'
import { resolveGameTitle } from 'backend/utils/gameTitle'
import { Runner } from 'common/types'
import { storeMap } from 'common/utils'
import { storeCapabilities } from 'common/storeCapabilities'
import type { Event } from 'backend/platform/types'
import { existsSync, readdirSync, rmSync } from 'graceful-fs'
import i18next from 'i18next'
import { join } from 'path'

/** R1 slice: the per-runner managers. */
export type UninstallerDeps = Pick<
  ManagerDeps,
  'libraryManagers' | 'notifications'
> & { config: Pick<GlobalConfigSlice, 'getSettings'> }

export const removePrefix = async (
  deps: UninstallerDeps,
  appName: string,
  runner: Runner
) => {
  const { winePrefix } = await deps.libraryManagers[runner]
    .getGame(appName)
    .getSettings()
  logInfo(`Removing prefix ${winePrefix}`, LogPrefix.Backend)

  if (!existsSync(winePrefix)) {
    logInfo(`Prefix folder ${winePrefix} doesn't exist, ignoring removal`)
    return
  }

  // folder exists, do some sanity checks before deleting it
  const { defaultInstallPath, sharedWinePrefix } = deps.config.getSettings()

  if (winePrefix === defaultInstallPath) {
    logInfo(
      `Can't delete folder ${winePrefix}, prefix folder is the default install directory ${defaultInstallPath}`
    )
    return
  }

  if (winePrefix === sharedWinePrefix) {
    logInfo(
      `Can't delete folder ${winePrefix}, prefix folder is the shared prefix directory ${sharedWinePrefix}`
    )
    return
  }

  // keep this check for backwards compatibility
  if (winePrefix === defaultWinePrefix) {
    logInfo(
      `Can't delete folder ${winePrefix}, prefix folder is the default prefix directory ${defaultWinePrefix}`
    )
    return
  }

  const dirContent = readdirSync(winePrefix)

  if (dirContent.length > 0) {
    const driveCPath = join(winePrefix, 'drive_c')
    const pfxPath = join(winePrefix, 'pfx')

    if (!existsSync(driveCPath) && !existsSync(pfxPath)) {
      logInfo(
        `Can't delete folder ${winePrefix}, folder does not contain a drive_c/pfx folder. If this is the correct prefix folder, delete it manually.`
      )
      return
    }
  }

  // if we got here, we are safe to delete this folder
  rmSync(winePrefix, { recursive: true })
}

export const removeFixFile = (appName: string, runner: Runner) => {
  // The downloaded tier-1 copy is re-fetched at install from GameLib's repo for
  // every store (quick 261026-avw), so deleting it is safe. Local
  // (`fixes/local/`) and bundled files live elsewhere and are never touched;
  // `.profile.json` is never downloaded and is not deleted.
  const store = storeMap[runner]
  if (!store) return
  const fixFilePath = join(fixesPath, `${appName}-${store}.json`)
  if (existsSync(fixFilePath)) {
    rmSync(fixFilePath)
  }
}

const removeSettingsAndLogs = (appName: string) => {
  const removeIfExists = (filename: string) => {
    logInfo(`Removing ${filename}`, LogPrefix.Backend)
    const gameSettingsFile = join(gamesConfigPath, filename)
    if (existsSync(gameSettingsFile)) {
      rmSync(gameSettingsFile)
    }
  }

  removeIfExists(appName.concat('.json'))
  removeIfExists(appName.concat('.log'))
  removeIfExists(appName.concat('-lastPlay.log'))
}

export const uninstallGameCallback = async (
  deps: UninstallerDeps,
  event: Event,
  appName: string,
  runner: Runner,
  shouldRemovePrefix: boolean,
  shouldRemoveSetting: boolean
) => {
  sendGameStatusUpdate({
    appName,
    runner,
    status: 'uninstalling'
  })

  const game = deps.libraryManagers[runner].getGame(appName)
  // Quick task 260905-mv5 (site 2, D-03): getGameInfo() can return
  // `{} as GameInfo` on a double cache miss (D-01) -- resolveGameTitle
  // falls back to appName so neither the uninstall-error nor the
  // uninstall-success notification below is ever nameless.
  const title = resolveGameTitle(deps.libraryManagers, runner, appName)

  let uninstalled = false

  try {
    const result = await game.uninstall({ shouldRemovePrefix })
    if (result?.refused) {
      // quick 261107-td5: the uninstall declined and changed nothing. The
      // refusing route owns the user-facing message; keep settings/logs/
      // prefix/fix file and clear the "uninstalling" status.
      // quick 261110-uog: stderr is logged by the refusing/failing route itself; only its length here (logSecretGate).
      logInfo(
        `Uninstall refused; keeping settings for ${runner} ${appName} (stderrLength=${result.stderr.length})`,
        LogPrefix.Backend
      )
      sendGameStatusUpdate({ appName, runner, status: 'done' })
      return
    }
    if (result?.failed) {
      // quick 261108-anw: the delete errored, possibly partially. Keep
      // GameLib state so a retry is possible; the failing route sends no
      // done, so this is the single done. The route owns the in-app notice.
      // quick 261110-uog: stderr is logged by the refusing/failing route itself; only its length here (logSecretGate).
      logInfo(
        `Uninstall failed; keeping settings for ${runner} ${appName} (stderrLength=${result.stderr.length})`,
        LogPrefix.Backend
      )
      sendGameStatusUpdate({ appName, runner, status: 'done' })
      return
    }
    uninstalled = true
  } catch (error) {
    notify(deps, {
      title,
      body: i18next.t('notify.uninstallError', 'Error uninstalling')
    })
    logError(error, LogPrefix.Backend)
  }

  if (uninstalled) {
    if (shouldRemovePrefix) {
      removePrefix(deps, appName, runner)
    }
    if (shouldRemoveSetting) {
      removeSettingsAndLogs(appName)
    }
    removeFixFile(appName, runner)

    // GAME-03: Steam uninstall is confirmed by the ACF poller (pollUninstallOnce),
    // which fires the "Game Uninstalled" toast when the manifest disappears.
    // Suppress the success notify here for steam to avoid a duplicate/premature toast.
    if (!storeCapabilities[runner].installManagedExternally) {
      notify(deps, { title, body: i18next.t('notify.uninstalled') })
    }
    logInfo('Finished uninstalling', LogPrefix.Backend)
  }

  // Steam: ACF poller emits the real done signal — suppress it here to prevent
  // the badge flash caused by uninstallGameCallback resolving instantly (GAME-03).
  if (!storeCapabilities[runner].installManagedExternally) {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
  }
}
