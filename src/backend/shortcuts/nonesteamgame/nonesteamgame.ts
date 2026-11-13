import { existsSync, mkdirSync, readdirSync } from 'graceful-fs'
import { join } from 'path'
import { ShortcutsResult } from '../types'
import { getIcon } from '../utils'
import type { ShortcutsDeps } from '../utils'
import {
  prepareImagesForSteam,
  generateShortcutId,
  generateAppId,
  generateShortAppId,
  removeImagesFromSteam
} from './steamhelper'
import { logError, logInfo, LogPrefix, logWarning } from 'backend/logger'
import i18next from 'i18next'
import {
  notify,
  showDialogBoxModalAuto,
  type DialogBoxDeps,
  type NotifyDeps
} from '../../dialog/dialog'
import {
  getWikiGameInfo,
  type WikiGameInfoDeps
} from 'backend/wiki_game_info/wiki_game_info'
import { isAppImage, isFlatpak, isWindows } from 'backend/constants/environment'
import type { Game } from 'common/types/game_manager'
import type { InfoCaches, Stores } from 'backend/services/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'
import { invokeSteamFiles } from 'backend/storeManagers/steam/localFiles/rustSteamFiles'
import type {
  EntryField,
  ShortcutsReadResult
} from 'backend/storeManagers/steam/localFiles/steamFilesTypes'
import {
  RUST_STEAMFILES_SHORTCUTS_APPLY,
  RUST_STEAMFILES_SHORTCUTS_READ
} from 'common/types/sidecarTransport'

const getSteamUserdataDir = async (deps: Pick<ShortcutsDeps, 'config'>) => {
  const { defaultSteamPath } = deps.config.getSettings()
  return join(defaultSteamPath.replaceAll("'", ''), 'userdata')
}

/**
 * Opens a error dialog in frontend with the error message
 * @param props
 */
function showErrorInFrontend(
  deps: DialogBoxDeps,
  props: { gameTitle: string; error: string }
) {
  const error = i18next.t('box.error.add.steam.body', {
    defaultValue: 'Adding {{game}} to Steam failed with:{{newLine}} {{error}}',
    game: props.gameTitle,
    newLine: '\n',
    error: props.error,
    interpolation: { escapeValue: false }
  })

  const title = i18next.t(
    'box.error.add.steam.title',
    'Error Adding Game to Steam'
  )

  showDialogBoxModalAuto(deps, { title, message: error, type: 'ERROR' })
}

/**
 * Opens a notify window in the frontend with given message
 * @param props
 */
function notifyFrontend(
  deps: NotifyDeps,
  props: { message: string; adding: boolean }
) {
  const title = props.adding
    ? i18next.t('notify.finished.add.steam.title', 'Added to Steam')
    : i18next.t('notify.finished.remove.steam.title', 'Removed from Steam')

  notify(deps, {
    body: props.message,
    title
  })
}

/**
 * Check if steam userdata folder exist and return them as a string list.
 * @param steamUserdataDir Path to userdata folder in steam compat folder.
 * @returns All userdata folders as string array and possible error
 */
function checkSteamUserDataDir(steamUserdataDir: string): {
  folders: string[]
  error?: string
} {
  if (!existsSync(steamUserdataDir)) {
    return {
      folders: [],
      error: `${steamUserdataDir} does not exist. Can't add/remove game to/from Steam!`
    }
  }
  const ignoreFolders = ['0', 'ac']
  const folders = readdirSync(steamUserdataDir, {
    withFileTypes: true
  })
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => ignoreFolders.every((folder) => folder !== dirent.name))
    .map((dirent) => dirent.name)

  if (folders.length <= 0) {
    return {
      folders: [],
      error: `${steamUserdataDir} does not contain a valid user directory!`
    }
  }

  return { folders }
}

/** The entry a new shortcut is built from; rustEntryFields turns it into Steam's typed fields. */
interface ShortcutEntry {
  appid: number
  AppName: string
  Exe: string
  StartDir: string
  icon?: string
  LaunchOptions: string
  IsHidden: boolean
  AllowDesktopConfig: boolean
  AllowOverlay: boolean
  OpenVR: boolean
  Devkit: boolean
  DevkitOverrideAppID: boolean
  LastPlayTime: Date
}

/**
 * Phase 75 (P75-F): today's validity messages rebuilt from the Rust read summary. Same strings, same
 * order as `checkIfShortcutObjectIsValid`; `parsed === false` is corrupted like a throwing parse.
 */
export function shortcutsValidityFromSummary(
  summary: ShortcutsReadResult
): ShortcutsResult {
  const checkResult: ShortcutsResult = { success: false, errors: [] }
  if (!summary.parsed) {
    checkResult.errors.push(
      summary.readError ?? 'Could not parse shortcuts.vdf!'
    )
  } else if (!summary.hasShortcutsRoot) {
    checkResult.errors.push('Could not find entry "shortcuts"!')
  } else if (!summary.rootIsList) {
    checkResult.errors.push('Entry "shortcuts" is not an array!')
  } else {
    checkResult.success = true
    for (const entry of summary.entries) {
      const present = {
        AppName: entry.hasAppName,
        Exe: entry.hasExe,
        LaunchOptions: entry.hasLaunchOptions
      }
      for (const key of ['AppName', 'Exe', 'LaunchOptions'] as const) {
        if (!present[key]) {
          checkResult.errors.push(
            `One of the game entries is missing the ${key} parameter!`
          )
          checkResult.success = false
        }
      }
    }
  }
  return checkResult
}

/** The index of the first entry titled `title` in a Rust read summary, else -1. */
export function titleIndexFromSummary(
  summary: ShortcutsReadResult,
  title: string
): number {
  return summary.entries.findIndex((entry) => entry.appName === title)
}

/** The Rust read of one shortcuts.vdf, or a thrown-read as an unparsed summary. */
async function readSummary(
  deps: RustInvokeDeps,
  path: string
): Promise<ShortcutsReadResult> {
  try {
    return await invokeSteamFiles(deps, RUST_STEAMFILES_SHORTCUTS_READ, {
      path
    })
  } catch (error) {
    return {
      exists: true,
      parsed: false,
      readError: `${error}`,
      hasShortcutsRoot: false,
      rootIsList: false,
      entries: []
    }
  }
}

/**
 * The entry as Steam's typed fields, in the key order the TS writer used. Steam stores the flags as
 * int32 (no boolean coercion), the appid as the int32 bit pattern and LastPlayTime as unix seconds.
 */
function rustEntryFields(entry: ShortcutEntry): EntryField[] {
  const str = (key: string, value: string): EntryField => ({
    kind: 'string',
    key,
    value
  })
  const int = (key: string, value: number): EntryField => ({
    kind: 'int32',
    key,
    value
  })
  const fields: EntryField[] = [
    str('AppName', entry.AppName),
    str('Exe', entry.Exe),
    str('StartDir', entry.StartDir),
    int('appid', entry.appid)
  ]
  if (entry.icon) {
    fields.push(str('icon', entry.icon))
  }
  fields.push(
    str('LaunchOptions', entry.LaunchOptions),
    int('IsHidden', 0),
    int('AllowDesktopConfig', 1),
    int('AllowOverlay', 1),
    int('OpenVR', 0),
    int('Devkit', 0),
    int('DevkitOverrideAppID', 0),
    int('LastPlayTime', Math.floor(entry.LastPlayTime.getTime() / 1000))
  )
  return fields
}

/** The icon lookup's managers plus the kvs store the shortcut's last-played read uses. */
export type NonSteamGameDeps = ShortcutsDeps &
  DialogBoxDeps &
  NotifyDeps & {
    stores: Pick<Stores, 'kvs' | 'wikiGameInfo' | 'crossoverIndex'>
    infoCaches: Pick<InfoCaches, 'hltb'>
  } & Pick<WikiGameInfoDeps, 'appRuntime'> &
  RustInvokeDeps

/**
 * Adds a non-steam game to steam via editing shortcuts.vdf
 * @param deps the managers the icon lookup reads
 * @param game the {@link Game} to add
 * @returns boolean
 */
async function addNonSteamGame(
  deps: NonSteamGameDeps,
  game: Game
): Promise<boolean> {
  const gameInfo = game.getGameInfo()
  const steamUserdataDir = await getSteamUserdataDir(deps)
  const wikiInfo = await getWikiGameInfo(deps, game)
  const steamID = wikiInfo?.pcgamingwiki?.steamID ?? wikiInfo?.gamesdb?.steamID

  const { folders, error } = checkSteamUserDataDir(steamUserdataDir)

  if (error) {
    logError(error, LogPrefix.Shortcuts)
    showErrorInFrontend(deps, {
      gameTitle: gameInfo.title,
      error
    })
    return false
  }

  const errors = []
  let added = false
  for (const folder of folders) {
    const configDir = join(steamUserdataDir, folder, 'config')
    const shortcutsFile = join(configDir, 'shortcuts.vdf')

    if (!existsSync(configDir)) {
      mkdirSync(configDir)
    }

    // A missing file is created by the add mutation (createIfMissing).
    const summary = await readSummary(deps, shortcutsFile)
    if (summary.exists) {
      const checkResult = shortcutsValidityFromSummary(summary)
      if (!checkResult.success) {
        errors.push(
          `Can't add "${gameInfo.title}" to Steam user "${folder}". "${shortcutsFile}" is corrupted!`,
          ...checkResult.errors
        )
        continue
      }
      if (titleIndexFromSummary(summary, gameInfo.title) > -1) {
        added = true
        continue
      }
    }

    // add new Entry
    const newEntry = {} as ShortcutEntry
    newEntry.AppName = gameInfo.title
    newEntry.Exe = `"${deps.paths.exe}"`
    newEntry.StartDir = `"${process.cwd()}"`

    if (isFlatpak) {
      newEntry.Exe = `"flatpak"`
    } else if (!isWindows && isAppImage) {
      newEntry.Exe = `"${process.env.APPIMAGE}"`
    } else if (isWindows && process.env.PORTABLE_EXECUTABLE_FILE) {
      newEntry.Exe = `"${process.env.PORTABLE_EXECUTABLE_FILE}"`
      newEntry.StartDir = `"${process.env.PORTABLE_EXECUTABLE_DIR}"`
    }

    newEntry.appid = generateShortcutId(newEntry.Exe, newEntry.AppName)

    await getIcon(deps, gameInfo.app_name, gameInfo)
      .then((path) => {
        if (path) {
          newEntry.icon = path
        } else {
          logWarning(
            `Couldn't find an icon for ${gameInfo.title}`,
            LogPrefix.Shortcuts
          )
        }
      })
      .catch((error) =>
        logWarning(
          [`Couldn't find a icon for ${gameInfo.title} with:`, error],
          LogPrefix.Shortcuts
        )
      )

    await prepareImagesForSteam(deps, {
      steamUserConfigDir: configDir,
      appID: {
        bigPictureAppID: generateAppId(newEntry.Exe, newEntry.AppName),
        otherGridAppID: generateShortAppId(newEntry.Exe, newEntry.AppName)
      },
      gameInfo,
      steamID: steamID
    })

    const args = []
    args.push('--no-gui')
    if (!isWindows) {
      args.push('--no-sandbox')
    }

    const { runner, app_name } = gameInfo

    args.push(`"gamelib://launch?appName=${app_name}&runner=${runner}"`)
    newEntry.LaunchOptions = args.join(' ')
    if (isFlatpak) {
      newEntry.LaunchOptions = `run com.heroicgameslauncher.hgl ${newEntry.LaunchOptions}`
    }
    newEntry.IsHidden = false
    newEntry.AllowDesktopConfig = true
    newEntry.AllowOverlay = true
    newEntry.OpenVR = false
    newEntry.Devkit = false
    newEntry.DevkitOverrideAppID = false

    const lastPlayed = deps.stores.kvs.tsStore.get_nodefault(
      `${gameInfo.app_name}.lastPlayed`
    )
    if (lastPlayed) {
      newEntry.LastPlayTime = new Date(lastPlayed)
    } else {
      newEntry.LastPlayTime = new Date()
    }

    try {
      const result = await invokeSteamFiles(
        deps,
        RUST_STEAMFILES_SHORTCUTS_APPLY,
        {
          path: shortcutsFile,
          mutation: {
            op: 'add',
            entry: rustEntryFields(newEntry),
            createIfMissing: true
          }
        }
      )
      if (!result.written && !result.alreadyPresent) {
        errors.push(result.readError ?? 'shortcuts.vdf was not written')
        continue
      }
    } catch (error) {
      errors.push(`${error}`)
      continue
    }
    added = true
  }

  if (!added) {
    const errorMessage = errors.join('\n')
    logError(errorMessage, LogPrefix.Shortcuts)
    showErrorInFrontend(deps, {
      gameTitle: gameInfo.title,
      error: errorMessage
    })
    return false
  }

  if (errors.length === 0) {
    logInfo(
      `${gameInfo.title} was successfully added to Steam.`,
      LogPrefix.Shortcuts
    )

    const message = i18next.t('notify.finished.add.steam.success', {
      defaultValue:
        '{{game}} was successfully added to Steam. A restart of Steam is required for changes to take effect.',
      game: gameInfo.title
    })
    notifyFrontend(deps, { message, adding: true })
    return true
  } else {
    logWarning(
      `${gameInfo.title} could not be added to all found Steam users.`,
      LogPrefix.Shortcuts
    )
    logError(errors.join('\n'), LogPrefix.Shortcuts)

    const message = i18next.t('notify.finished.add.steam.corrupt', {
      defaultValue:
        '{{game}} could not be added to all found Steam users. See logs for more info. A restart of Steam is required for changes to take effect.',
      game: gameInfo.title
    })
    notifyFrontend(deps, { message, adding: true })
    return true
  }
}

/**
 * Removes a non-steam game from steam via editing shortcuts.vdf
 * @param gameInfo @see GameInfo of the game to remove
 * @param steamUserdataDir Path to steam userdata directory, optional
 * @returns none
 */
async function removeNonSteamGame(
  deps: NotifyDeps & Pick<ShortcutsDeps, 'config'> & RustInvokeDeps,
  game: Game
): Promise<void> {
  const gameInfo = game.getGameInfo()
  const steamUserdataDir = await getSteamUserdataDir(deps)
  const { folders, error } = checkSteamUserDataDir(steamUserdataDir)

  // we don't show a error here.
  // If someone changes the steam path to a invalid one
  // we just assume it is removed
  if (error) {
    logWarning(error, LogPrefix.Shortcuts)
    return
  }

  const errors = []
  let removed = false
  for (const folder of folders) {
    const configDir = join(steamUserdataDir, folder, 'config')
    const shortcutsFile = join(configDir, 'shortcuts.vdf')

    if (!existsSync(configDir) || !existsSync(shortcutsFile)) {
      continue
    }

    const summary = await readSummary(deps, shortcutsFile)
    const rustCheck = shortcutsValidityFromSummary(summary)
    if (!rustCheck.success) {
      errors.push(
        `Can't remove "${gameInfo.title}" from Steam user "${folder}". "${shortcutsFile}" is corrupted!`,
        ...rustCheck.errors
      )
      continue
    }
    if (titleIndexFromSummary(summary, gameInfo.title) < 0) {
      continue
    }
    try {
      const result = await invokeSteamFiles(
        deps,
        RUST_STEAMFILES_SHORTCUTS_APPLY,
        {
          path: shortcutsFile,
          mutation: { op: 'remove', appName: gameInfo.title }
        }
      )
      if (!result.written) {
        if (result.readError) errors.push(result.readError)
        continue
      }
      removed = true
      const exe = result.removedExe ?? ''
      const appName = result.removedAppName ?? ''
      removeImagesFromSteam({
        steamUserConfigDir: configDir,
        appID: {
          bigPictureAppID: generateAppId(exe, appName),
          otherGridAppID: generateShortAppId(exe, appName)
        },
        gameInfo
      })
    } catch (error) {
      errors.push(`${error}`)
    }
  }

  if (errors.length === 0) {
    // game was not on any steam shortcut
    // nothing to notify
    if (!removed) {
      return
    }

    logInfo(
      `${gameInfo.title} was successfully removed from Steam.`,
      LogPrefix.Shortcuts
    )

    const message = i18next.t('notify.finished.remove.steam.success', {
      defaultValue:
        '{{game}} was successfully removed from Steam. A restart of Steam is required for changes to take effect.',
      game: gameInfo.title
    })
    notifyFrontend(deps, { message, adding: false })
  } else {
    logWarning(
      `${gameInfo.title} could not be removed from all found Steam users.`,
      LogPrefix.Shortcuts
    )
    logError(errors.join('\n'), LogPrefix.Shortcuts)

    const message = i18next.t('notify.finished.remove.steam.corrupt', {
      defaultValue:
        '{{game}} could not be removed from all found Steam users. See logs for more info. A restart of Steam is required for changes to take effect.',
      game: gameInfo.title
    })
    notifyFrontend(deps, { message, adding: false })
  }
}

/**
 * Checks if a game was added to shortcuts.vdf
 * @param game The {@link Game} to check
 * @returns boolean
 */
async function isAddedToSteam(
  deps: Pick<ShortcutsDeps, 'config'> & RustInvokeDeps,
  game: Game
): Promise<boolean> {
  const steamUserdataDir = await getSteamUserdataDir(deps)

  const { folders, error } = checkSteamUserDataDir(steamUserdataDir)

  if (error) {
    return false
  }

  let added = false
  for (const folder of folders) {
    const configDir = join(steamUserdataDir, folder, 'config')
    const shortcutsFile = join(configDir, 'shortcuts.vdf')

    if (!existsSync(configDir) || !existsSync(shortcutsFile)) {
      continue
    }

    const summary = await readSummary(deps, shortcutsFile)
    if (
      shortcutsValidityFromSummary(summary).success &&
      titleIndexFromSummary(summary, game.getGameInfo().title) > -1
    ) {
      added = true
    }
  }

  return added
}

export { addNonSteamGame, removeNonSteamGame, isAddedToSteam }
