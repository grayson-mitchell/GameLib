import type { FrontendMessageDeps } from '../../host/frontendMessage'
import type { GameSettings } from 'common/types'
import { logInfo, LogPrefix, logWarning } from 'backend/logger'
import { basename, dirname } from 'path'
import { constants as FS_CONSTANTS } from 'graceful-fs'
import i18next from 'i18next'
import type { ManagerDeps } from 'backend/services/types'
import { access, chmod } from 'fs/promises'
import shlex from 'shlex'
import { showDialogBoxModalAuto } from '../../dialog/dialog'
import { sendGameStatusUpdate } from 'backend/utils'
import { isLinux, isMac } from 'backend/constants/environment'
import { withKnownFixEnv } from 'backend/knownFixOverlays'

import type LogWriter from 'backend/logger/log_writer'
import { Game } from '../../../common/types/game_manager'
import { engineKeyFor } from 'backend/engine/gameKey'

/**
 * Browser games opened a child BrowserWindow. Under the sidecar `new BrowserWindow(...)` threw
 * (the stand-in was an object literal), so this has always rejected; the window, menu and
 * confirm-exit dialog code behind it never ran and is gone (D-35-15-01 stays open: a real fix
 * is a Tauri child window).
 */
const openNewBrowserGameWindow = async (): Promise<boolean> => {
  throw new Error('Browser games are not supported in this build')
}

async function getAppSettings(
  gameConfigs: ManagerDeps['gameConfigs'],
  appName: string
): Promise<GameSettings> {
  return (
    gameConfigs.get(appName).config ||
    (await gameConfigs.get(appName).getSettings())
  )
}

/** The collaborators the shared launch helper uses (66.1, R3). */
export type CommonGameDeps = FrontendMessageDeps &
  Pick<
    ManagerDeps,
    | 'launcher'
    | 'commandRunner'
    | 'spawnAsync'
    | 'dialogs'
    | 'appState'
    | 'gameConfigs'
    | 'engineRuntime'
    | 'windowRaiser'
  >

export async function launchGame(
  deps: CommonGameDeps,
  game: Game,
  logWriter: LogWriter,
  args: string[] = []
): Promise<boolean> {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name
  const runner = gameInfo.runner

  let {
    install: { executable }
  } = gameInfo

  const { browserUrl } = gameInfo

  const gameSettingsOverrides = await deps.gameConfigs
    .get(appName)
    .getSettings()
  if (
    gameSettingsOverrides.targetExe !== undefined &&
    gameSettingsOverrides.targetExe !== ''
  ) {
    executable = gameSettingsOverrides.targetExe
  }

  if (browserUrl) {
    return openNewBrowserGameWindow()
  }

  const gameSettings = deps.engineRuntime.launchSettings.getLaunchSettings(
    engineKeyFor(runner, appName),
    await getAppSettings(deps.gameConfigs, appName)
  )
  const { launcherArgs } = gameSettings
  const extraArgs = [...shlex.split(launcherArgs ?? ''), ...args]
  const extraArgsJoined = extraArgs.join(' ')

  if (executable) {
    const isNative = game.isNative()
    const {
      success: launchPrepSuccess,
      failureReason: launchPrepFailReason,
      rpcClient,
      mangoHudCommand,
      gameScopeCommand,
      gameModeBin
    } = await deps.launcher.prepareLaunch(gameSettings, logWriter, gameInfo)

    // The sideload path does not merge tier-1 envVariables (unchanged), so it
    // opts out of tier-1 in the overlay base and log.
    const wineLaunch = !isNative
      ? await deps.launcher.prepareWineLaunch(game, logWriter, {
          mergesTier1Env: false
        })
      : undefined

    const wrappers = deps.launcher.setupWrappers(
      gameSettings,
      mangoHudCommand,
      gameModeBin,
      gameScopeCommand
    )

    if (!launchPrepSuccess) {
      logWriter.logError(['Launch aborted:', launchPrepFailReason])
      deps.launcher.launchCleanup()
      showDialogBoxModalAuto(deps, {
        title: i18next.t('box.error.launchAborted', 'Launch aborted'),
        message: launchPrepFailReason!,
        type: 'ERROR'
      })
      return false
    }

    sendGameStatusUpdate(deps, {
      appName,
      runner: gameInfo.runner,
      status: 'playing'
    })

    // Native
    if (isNative) {
      logInfo(
        `launching native sideloaded game: ${executable} ${extraArgsJoined}`,
        LogPrefix.Backend
      )

      try {
        await access(executable, FS_CONSTANTS.X_OK)
      } catch {
        logWarning(
          'File not executable, changing permissions temporarily',
          LogPrefix.Backend
        )
        // On Mac, it gives an error when changing the permissions of the file inside the app bundle. But we need it for other executables like scripts.
        if (isLinux || (isMac && !executable.endsWith('.app'))) {
          await chmod(executable, 0o775)
        }
      }

      const env = {
        ...deps.launcher.setupWrapperEnvVars({ appName, appRunner: runner }),
        ...deps.launcher.setupEnvVars(
          gameSettings,
          gameInfo.install.install_path
        ),
        ...deps.launcher.getKnownFixesEnvVariables(appName, runner)
      }

      if (wrappers.length > 0) {
        extraArgs.unshift(...wrappers, executable)
        executable = extraArgs.shift()!
      }

      await deps.commandRunner.callRunner(
        extraArgs,
        {
          name: runner,
          logPrefix: LogPrefix.Backend,
          bin: basename(executable),
          dir: dirname(executable)
        },
        {
          env,
          wrappers,
          logWriters: [logWriter],
          logMessagePrefix: LogPrefix.Backend,
          trackKey: appName
        }
      )

      deps.launcher.launchCleanup(rpcClient)
      // TODO: check and revert to previous permissions
      if (isLinux || (isMac && !executable.endsWith('.app'))) {
        await chmod(executable, 0o775)
      }
      return true
    }

    logInfo(
      `launching non-native sideloaded: ${executable} ${extraArgsJoined}`,
      LogPrefix.Backend
    )

    // quick/261024-g3m: fire before the await — wait:true resolves only at game exit.
    if (isMac) {
      void deps.windowRaiser.raise(
        { spawnAsync: deps.spawnAsync },
        {
          context: `sideload:${appName}`,
          processNames: [basename(executable)]
        }
      )
    }

    await deps.commandRunner.runWineCommand({
      commandParts: [executable, ...extraArgs],
      gameSettings: withKnownFixEnv(
        gameSettings,
        wineLaunch?.knownFixEnv ?? {}
      ),
      wait: true,
      protonVerb: 'waitforexitandrun',
      startFolder: dirname(executable),
      options: {
        wrappers,
        logWriters: [logWriter],
        logMessagePrefix: LogPrefix.Backend,
        trackKey: appName
      }
    })

    deps.launcher.launchCleanup(rpcClient)

    return true
  }
  return false
}
