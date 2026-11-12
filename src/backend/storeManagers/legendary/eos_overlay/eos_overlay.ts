import type { FrontendMessageDeps } from '../../../host/frontendMessage'
import { existsSync, readFileSync } from 'graceful-fs'
import { join } from 'path'

import { logError, LogPrefix, logWarning } from 'backend/logger'
import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import { sendGameStatusUpdate } from 'backend/utils'
import { LegendaryCommand } from '../commands'
import { ValidWinePrefix } from '../commands/base'
import { Path } from 'backend/schemas'
import { deriveLegendaryPaths } from '../constants'
import { isLinux } from 'backend/constants/environment'

import type { Runner } from 'common/types'
import type { ManagerDeps } from 'backend/services/types'

/** The only collaborator the overlay functions need (R3). */
export type EosOverlayDeps = Pick<ManagerDeps, 'libraryManagers'> &
  FrontendMessageDeps & {
    /** The boot-owned abort registry the output handlers end the probe command through (66.4-13). */
    aborts: Pick<AbortRegistry, 'call'>
  } & EosOverlayPathDeps

/** The path roots the overlay's on-disk locations derive from (read from deps.paths, 66.4-11). */
interface EosOverlayPathDeps {
  paths: Pick<ManagerDeps['paths'], 'appFolder' | 'toolsPath'>
}

const currentVersionPath = (deps: EosOverlayPathDeps) =>
  join(
    deriveLegendaryPaths(deps.paths).legendaryConfigPath,
    'overlay_version.json'
  )
const installedVersionPath = (deps: EosOverlayPathDeps) =>
  join(
    deriveLegendaryPaths(deps.paths).legendaryConfigPath,
    'overlay_install.json'
  )
const defaultInstallPath = (deps: EosOverlayPathDeps) =>
  join(deps.paths.toolsPath, 'eos_overlay')
const eosOverlayAppName = '98bc04bc842e4906993fd6d6644ffb8d'

function getStatus(deps: EosOverlayPathDeps): {
  isInstalled: boolean
  version?: string
  install_path?: string
} {
  if (!isInstalled(deps)) {
    return { isInstalled: false }
  }

  const { version, install_path } = JSON.parse(
    readFileSync(installedVersionPath(deps), 'utf-8')
  )

  if (install_path !== defaultInstallPath(deps)) {
    logWarning(
      'EOS Overlay is not installed in default location, permission issues might arise',
      LogPrefix.Legendary
    )
  }

  return { isInstalled: true, version, install_path }
}

async function getLatestVersion(deps: EosOverlayDeps): Promise<string> {
  if (!existsSync(currentVersionPath(deps))) {
    // HACK: `overlay_version.json` isn't created when the overlay isn't installed
    if (!isInstalled(deps)) {
      return ''
    }
    await updateInfo(deps)
    if (!existsSync(currentVersionPath(deps))) {
      logError(
        'EOS Overlay information not found after manual update. User is probably not logged in anymore',
        LogPrefix.Legendary
      )
      return ''
    }
  }
  const { buildVersion }: { buildVersion: string } = JSON.parse(
    readFileSync(currentVersionPath(deps), 'utf-8')
  ).data
  return buildVersion
}

async function updateInfo(deps: EosOverlayDeps) {
  // Without the overlay being installed, this will do nothing at all.
  // So we can just skip running the command if that's the case
  if (!isInstalled(deps)) {
    return
  }

  await deps.libraryManagers['legendary'].runRunnerCommand(
    { subcommand: 'status' },
    {
      abortId: eosOverlayAppName,
      logMessagePrefix: 'Updating EOS Overlay information'
    }
  )
}

/**
 * Installs the EOS overlay
 * @returns The error encountered when installing, if any
 */
async function install(deps: EosOverlayDeps) {
  sendGameStatusUpdate(deps, {
    appName: eosOverlayAppName,
    runner: 'legendary',
    status: isInstalled(deps) ? 'updating' : 'installing'
  })

  let downloadSize = 0
  // Run download without -y to get the install size
  await deps.libraryManagers['legendary'].runRunnerCommand(
    {
      subcommand: 'eos-overlay',
      action: 'install',
      '--path': Path.parse(defaultInstallPath(deps))
    },
    {
      abortId: eosOverlayAppName,
      logMessagePrefix: 'Getting EOS Overlay install size',
      onOutput: (output: string) => {
        const downloadMatch = output.match(/Download size: ([\d.]+) MiB/)
        const downloadSizeStr = downloadMatch?.[1]
        if (downloadSizeStr) {
          downloadSize = parseFloat(downloadSizeStr)
          // Output is in MiB, we want it in bytes
          downloadSize = downloadSize * 1024 ** 2
          deps.aborts.call(eosOverlayAppName)
        }
      }
    }
  )

  const game = deps.libraryManagers['legendary'].getGame(eosOverlayAppName)
  // The EOS Overlay doesn't support Ctrl-C-pausing, so it's fine to just do this
  game.setCurrentDownloadSize(downloadSize)

  // And now actually install it
  const { error } = await deps.libraryManagers['legendary'].runRunnerCommand(
    {
      '-y': true,
      subcommand: 'eos-overlay',
      action: 'install',
      '--path': Path.parse(defaultInstallPath(deps))
    },
    {
      abortId: eosOverlayAppName,
      logMessagePrefix: 'Installing EOS Overlay',
      onOutput: (output: string) => {
        game.onInstallOrUpdateOutput('installing', output, downloadSize)
      }
    }
  )

  sendGameStatusUpdate(deps, {
    appName: eosOverlayAppName,
    runner: 'legendary',
    status: 'done'
  })

  return error
}

/**
 * Removes the EOS overlay.
 *
 * Phase 35 plan 26 (REQ-35-17, closes D-35-11-01): the confirmation dialog used to be raised
 * HERE, via `dialog.showMessageBox` — a native system dialog under the Tauri sidecar, not the
 * app-styled `showDialogModal` the rest of the app uses, and (per the D-35-11-01 structural
 * analysis) an ASKING dialog can never be moved to the renderer through the one-way
 * `showDialogBoxModalAuto` backend-dialog path. The confirmation now happens in the renderer
 * (`AdvancedSettings/index.tsx`'s `showDialogModal`) BEFORE this function is ever called; this
 * function only enforces the fail-closed gate on the answer it's given.
 *
 * `confirmed` MUST be checked with `=== true`, never a truthiness test: this is a destructive
 * action gated over an IPC boundary, and a malformed or missing argument (`undefined`, `'true'`
 * the string, `1`, an object) must refuse, not proceed (T-35-122).
 *
 * @param confirmed The renderer's confirmation answer. Anything other than the literal `true`
 * refuses the removal.
 * @returns True if the overlay was removed, False if it wasn't (refused or declined).
 */
async function remove(
  deps: EosOverlayDeps,
  confirmed: boolean
): Promise<boolean> {
  if (confirmed !== true) {
    logWarning(
      'EOS Overlay removal refused: confirmation was not the literal `true`',
      LogPrefix.Legendary
    )
    return false
  }

  await deps.libraryManagers['legendary'].runRunnerCommand(
    {
      '-y': true,
      subcommand: 'eos-overlay',
      action: 'remove'
    },
    {
      abortId: eosOverlayAppName
    }
  )

  return true
}

async function enable(
  deps: EosOverlayDeps,
  appName: string
): Promise<{ wasEnabled: boolean; installNow?: boolean }> {
  if (!isInstalled(deps)) {
    // Phase 35 plan 26 (REQ-35-17): this used to ask "install now?" itself via
    // `dialog.showMessageBox` and fold the user's answer into `installNow`. That native dialog
    // is gone — `installNow: true` now unconditionally signals "the overlay isn't installed,
    // ask the renderer" rather than "the user already said yes". Callers (`GameSubMenu`'s
    // `handleEosOverlay`, `AdvancedSettings`'s `toggleEosOverlay`) must raise their own
    // `showDialogModal` confirmation before calling `installEosOverlay()`.
    return { wasEnabled: false, installNow: true }
  }

  const prefix = await getWinePrefixFolder(deps, appName)
  // Can't install the overlay if we don't have a valid prefix
  // FIXME: Notify the user about this
  if (prefix === false) return { wasEnabled: false }

  const command: LegendaryCommand = {
    subcommand: 'eos-overlay',
    action: 'enable'
  }
  if (prefix) command['--prefix'] = prefix

  await deps.libraryManagers['legendary'].runRunnerCommand(command, {
    abortId: eosOverlayAppName,
    logMessagePrefix: 'Enabling EOS Overlay'
  })

  return { wasEnabled: true }
}

async function disable(deps: EosOverlayDeps, appName: string) {
  const prefix = await getWinePrefixFolder(deps, appName)
  // If we don't have a valid prefix anymore, we have nothing to disable
  if (prefix === false) return

  const command: LegendaryCommand = {
    subcommand: 'eos-overlay',
    action: 'disable'
  }
  if (prefix) command['--prefix'] = prefix

  await deps.libraryManagers['legendary'].runRunnerCommand(command, {
    abortId: eosOverlayAppName,
    logMessagePrefix: 'Disabling EOS Overlay'
  })
}

function isInstalled(deps: EosOverlayPathDeps) {
  return existsSync(installedVersionPath(deps))
}

/**
 * Checks if the EOS Overlay is enabled (either for a specific game on Linux or globally on Windows)
 * @param appName required on Linux, does nothing on Windows
 * @returns Enabled = True; Disabled = False
 */
async function isEnabled(
  deps: EosOverlayDeps,
  appName?: string
): Promise<boolean> {
  let enabled = false

  const prefix = await getWinePrefixFolder(deps, appName)
  if (prefix === false) return false

  const command: LegendaryCommand = {
    subcommand: 'eos-overlay',
    action: 'info'
  }
  if (prefix) command['--prefix'] = prefix

  await deps.libraryManagers['legendary'].runRunnerCommand(command, {
    abortId: eosOverlayAppName,
    onOutput: (data: string) => {
      if (data.includes('Overlay enabled')) {
        enabled = data.includes('Yes')
        deps.aborts.call(eosOverlayAppName)
      }
    },
    logMessagePrefix: 'Checking if EOS Overlay is enabled'
  })
  return enabled
}

/**
 * Returns the path to the "real" Wineprefix folder (where "drive_c" and "user.reg" is) for a game
 * @returns null if a prefix can't be returned (we're not on Linux / don't have an AppName)
 * @returns false if parsing the prefix path failed (in other words there is a prefix path set, but it doesn't contain a valid prefix)
 * @returns ValidWinePrefix (a folder that is verified to contain a Wineprefix) otherwise
 */
async function getWinePrefixFolder(
  deps: EosOverlayDeps,
  appName?: string,
  runner: Runner = 'legendary'
): Promise<ValidWinePrefix | null | false> {
  if (!isLinux || !appName) return null

  const { winePrefix, wineVersion } = await deps.libraryManagers[runner]
    .getGame(appName)
    .getSettings()
  const prefixPath =
    wineVersion.type === 'proton' ? join(winePrefix, 'pfx') : winePrefix
  const maybePrefix = ValidWinePrefix.safeParse(prefixPath)
  return maybePrefix.success ? maybePrefix.data : false
}

export {
  getStatus,
  getLatestVersion,
  updateInfo,
  install,
  remove,
  enable,
  disable,
  isEnabled
}
