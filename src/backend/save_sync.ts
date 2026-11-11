import { InstalledInfo, Runner } from 'common/types'

import { GOGCloudSavesLocation, SaveFolderVariable } from 'common/types/gog'
import { logDebug, LogPrefix, logInfo, logError, logWarning } from './logger'
import { getShellPath } from './utils'
import {
  existsSync,
  readFileSync,
  realpathSync,
  writeFileSync
} from 'graceful-fs'
import type { AppPaths } from 'backend/process/context'
import type { CommandRunner, Launcher, StoreManagers } from './services/types'
import type { ProcessRunner } from './process/types'
import { readWindowsShellFolder } from './sidecar/knownFolders'
import { LegendaryAppName } from './storeManagers/legendary/commands/base'
import { legendaryInstalled } from './storeManagers/legendary/constants'

/** What the save-path resolvers read: the managers, `getWinePath` and the wine prefix helpers (66.1, R3). */
export interface SaveSyncDeps {
  /** reg.exe for the redirected Documents folder on win32. */
  runner: Pick<ProcessRunner, 'run'>
  managers: Pick<StoreManagers, 'library'>
  commandRunner: Pick<CommandRunner, 'getWinePath'>
  launcher: Pick<Launcher, 'setupWineEnvVars' | 'verifyWinePrefix'>
  paths: Pick<AppPaths, 'knownFolder'>
}

async function getDefaultSavePath(
  deps: SaveSyncDeps,
  appName: string,
  runner: Runner,
  alreadyDefinedGogSaves: GOGCloudSavesLocation[]
): Promise<string | GOGCloudSavesLocation[]> {
  const defaultSavePath: Record<
    Runner,
    () => Promise<string | GOGCloudSavesLocation[]>
  > = {
    legendary: () => getDefaultLegendarySavePath(deps, appName),
    gog: () => getDefaultGogSavePaths(deps, appName, alreadyDefinedGogSaves),
    nile: () => Promise.resolve(''),
    sideload: () => Promise.resolve(''),
    steam: () => Promise.resolve('')
  }
  return defaultSavePath[runner]()
}

async function getDefaultLegendarySavePath(
  deps: SaveSyncDeps,
  appName: string
): Promise<string> {
  const game = deps.managers.library['legendary'].getGame(appName)
  const { save_folder, save_path } = game.getGameInfo()
  logInfo(
    ['Computing save path for save folder', save_folder],
    LogPrefix.Legendary
  )
  if (save_path) {
    logDebug(
      ['Legendary has a save path stored, discarding it:', save_path],
      LogPrefix.Legendary
    )
    // FIXME: This isn't really that safe
    try {
      const installedJsonLoc = legendaryInstalled
      const installedJsonData = JSON.parse(
        readFileSync(installedJsonLoc, 'utf-8')
      )
      installedJsonData[appName].save_path = null
      writeFileSync(
        installedJsonLoc,
        JSON.stringify(installedJsonData, undefined, '  ')
      )
    } catch (e) {
      logError(['Failed to discard save path:', e], LogPrefix.Legendary)
      return save_path
    }
  }

  if (!game.isNative()) {
    await deps.launcher.verifyWinePrefix(await game.getSettings())
  }

  logInfo(['Computing default save path for', appName], LogPrefix.Legendary)
  await deps.managers.library['legendary'].runRunnerCommand(
    {
      subcommand: 'sync-saves',
      appName: LegendaryAppName.parse(appName),
      '--skip-upload': true,
      '--skip-download': true,
      '--accept-path': true
    },
    {
      abortId: appName + '-savePath',
      logMessagePrefix: 'Getting default save path',
      env: game.isNative()
        ? {}
        : deps.launcher.setupWineEnvVars(await game.getSettings())
    }
  )

  // `sync-saves --accept-path` above rewrites `save_path` into `installed.json` on DISK, but
  // `getGameInfo` merges install fields from the module-scope `installedGames` map, which is
  // only rebuilt by `refreshInstalled()` -- so without an explicit refresh here, the readback
  // below can return a stale (or absent) value even though the fresh one is already on disk
  // (measured desk + live by quick task 260912-qop). `sidecar/installedJsonWatcher.ts`'s
  // 500ms debounce cannot substitute for this call: live evidence shows its `refreshLibrary`
  // push landing AFTER the "Unable to compute default save path" error, so it loses the race
  // for this, the very first read. Do not remove or weaken the watcher -- it still correctly
  // heals the map for subsequent reads; it simply cannot win this particular one.
  deps.managers.library['legendary'].refreshInstalled()
  const { save_path: new_save_path } = deps.managers.library[
    'legendary'
  ].getGameInfo(appName, true)!
  if (!new_save_path) {
    logError(
      ['Unable to compute default save path for', appName],
      LogPrefix.Legendary
    )
    return ''
  }
  logInfo(['Computed save path:', new_save_path], LogPrefix.Legendary)
  return new_save_path
}

async function getDefaultGogSavePaths(
  deps: SaveSyncDeps,
  appName: string,
  alreadyDefinedGogSaves: GOGCloudSavesLocation[]
): Promise<GOGCloudSavesLocation[]> {
  const game = deps.managers.library['gog'].getGame(appName)
  const gameSettings = await game.getSettings()
  const installInfo = game.getGameInfo().install as InstalledInfo
  const gog_save_location = await deps.managers.library[
    'gog'
  ].getSaveSyncLocation(appName, installInfo)

  const { platform: installed_platform, install_path } = installInfo
  if (!gog_save_location || !install_path) {
    logError([
      'gog_save_location/install_path undefined. gog_save_location = ',
      gog_save_location,
      'install_path = ',
      install_path
    ])
    return []
  }

  // If no save locations are defined, assume the default
  if (!gog_save_location.length) {
    const clientId =
      deps.managers.library['gog'].readInfoFile(appName)?.clientId
    gog_save_location.push({
      name: '__default',
      location:
        installed_platform === 'windows'
          ? `%LocalAppData%/GOG.com/Galaxy/Applications/${clientId}/Storage/Shared/Files`
          : `$HOME/Library/Application Support/GOG.com/Galaxy/Applications/${clientId}/Storage`
    })
  }

  // A value of `undefined` means "a known variable with no resolved folder": the win32 native
  // Documents lookup failed. It is never guessed (`<home>\Documents` is the wrong folder on a
  // OneDrive-redirected profile, quick 261111-aq4); the locations that need it are left out below.
  const gogVariableMap: Record<string, string | undefined> = {
    INSTALL: install_path,
    SAVED_GAMES: '%USERPROFILE%/Saved Games',
    APPLICATION_DATA_LOCAL: '%LOCALAPPDATA%',
    APPLICATION_DATA_LOCAL_LOW: '%APPDATA%\\..\\LocalLow',
    APPLICATION_DATA_ROAMING: '%APPDATA%',
    APPLICATION_SUPPORT: '$HOME/Library/Application Support',
    DOCUMENTS: !game.isNative()
      ? '%USERPROFILE%\\Documents'
      : process.platform === 'win32'
        ? await readWindowsShellFolder(deps, 'Personal')
        : deps.paths.knownFolder('documents')
  } satisfies Record<SaveFolderVariable, string | undefined>
  const resolvedLocations: GOGCloudSavesLocation[] = []
  for (const location of gog_save_location) {
    // If a location with the same name already has a path set,
    // skip doing all this work
    const potAlreadyDefinedLocation = alreadyDefinedGogSaves.find(
      ({ name }) => name === location.name
    )

    if (potAlreadyDefinedLocation?.location.length) {
      resolvedLocations.push(potAlreadyDefinedLocation)
      continue
    }

    // Get all GOG-defined variables out of the path & resolve them
    const matches = [...location.location.matchAll(/<\?(\w+)\?>/g)]

    // A known variable whose folder could not be resolved (win32 Documents, registry lookup
    // failed): leave the location OUT. It is not blanked or guessed because this list can reach
    // gogdl `save-sync` verbatim (CloudSavesSync.tsx -> gog/games.ts syncSaves), which would sync
    // whatever folder it is given. The Settings Sync Saves Retry button re-queries.
    const unresolvedVariable = matches
      .map((match) => match[1])
      .find(
        (name) =>
          name !== undefined &&
          Object.prototype.hasOwnProperty.call(gogVariableMap, name) &&
          gogVariableMap[name] === undefined
      )
    if (unresolvedVariable !== undefined) {
      logWarning(
        [
          `Leaving out save location "${location.name}":`,
          `the Windows Documents folder (<?${unresolvedVariable}?>) could not be read`,
          'from the registry (User Shell Folders "Personal"), so it was not guessed'
        ],
        LogPrefix.Gog
      )
      continue
    }

    let locationWithVariablesRemoved = location.location
    for (const match of matches) {
      const matchedText = match[0]
      const variableName = match[1]
      if (variableName === undefined) continue
      if (!gogVariableMap[variableName]) {
        logWarning(
          [
            'Unknown save path variable:',
            `${variableName},`,
            'inserting variable itself into save path.',
            'User will have to manually correct the path'
          ],
          LogPrefix.Gog
        )
      }
      locationWithVariablesRemoved = locationWithVariablesRemoved.replace(
        matchedText,
        gogVariableMap[variableName] ?? variableName
      )
    }

    // Path now contains no more GOG-defined variables, but might
    // still contain Windows (%NAME%) or Unix ($NAME) ones
    let absolutePath: string
    if (!game.isNative()) {
      absolutePath = await deps.commandRunner.getWinePath({
        path: locationWithVariablesRemoved,
        gameSettings
      })
      // Wine already resolves symlinks and ./.. for us,
      // so no need to run `realpathSync` here
    } else {
      absolutePath = await getShellPath(locationWithVariablesRemoved)
      if (existsSync(absolutePath)) {
        try {
          absolutePath = realpathSync(absolutePath)
        } catch {
          logWarning(
            ['Failed to run `realpath` on', `"${absolutePath}"`],
            LogPrefix.Gog
          )
        }
      }
    }

    resolvedLocations.push({
      name: location.name,
      location: absolutePath
    })
  }

  return resolvedLocations
}

export { getDefaultSavePath }
