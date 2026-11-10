import {
  LogPrefix,
  logDebug,
  logError,
  logInfo,
  logWarning,
  getRunnerLogWriter
} from 'backend/logger'
import { GameConfig } from 'backend/game_config'
import { checkWineBeforeLaunch, sendGameStatusUpdate } from 'backend/utils'
import { isWindows } from 'backend/constants/environment'
import { engineServicesFrom } from 'backend/services/engineServices'
import type { GameSettings } from 'common/types'
import type { ManagerDeps } from 'backend/services/types'
import type { FuelSchema } from 'common/types/nile'
import { isOnline } from '../../online_monitor'
import {
  endEngineLaunch,
  selectEngineForLaunch
} from 'backend/engine/launchEngine'
import { getLaunchSettings } from 'backend/engine/launchSettings'

type NileSetupDeps = Pick<
  ManagerDeps,
  'libraryManagers' | 'launcher' | 'commandRunner' | 'spawnAsync' | 'runner'
> & { stores: Pick<ManagerDeps['stores'], 'kvs' | 'wineManager'> }

/**
 * Handles installing dependencies for games that include PostInstall scripts
 */
export default async function setup(
  deps: NileSetupDeps,
  appName: string,
  installedPath?: string
): Promise<void> {
  const gameInfo = deps.libraryManagers.nile.getGameInfo(appName)
  if (!gameInfo) {
    logError([`Could not find game info for ${appName}. Skipping setup`])
    return
  }

  const basePath = installedPath ?? gameInfo?.install.install_path
  if (!basePath) {
    logError([
      `Could not find install path for ${
        gameInfo?.title ?? appName
      }. Skipping setup`
    ])
    return
  }

  const fuel = deps.libraryManagers.nile.fetchFuelJSON(appName, basePath)
  if (!fuel) {
    logError(
      [
        'Cannot install dependencies for',
        gameInfo?.title ?? appName,
        'without a fuel.json'
      ],
      LogPrefix.Nile
    )
    return
  }

  if (!fuel.PostInstall.length) {
    logInfo(
      ['No PostInstall instructions for', gameInfo?.title ?? appName],
      LogPrefix.Nile
    )
    return
  }

  logWarning(
    'Running setup instructions, if you notice issues with launching a game, please report it on our Discord server',
    LogPrefix.Nile
  )

  const stored = GameConfig.get(appName).config
  if (isWindows) {
    return runNileSetup(deps, appName, basePath, fuel.PostInstall, stored)
  }

  // Phase 61 (D-01, D-03, D-08): on macOS the setup runs on the engine the step selects, in the
  // game's own bottle. An engine-controlled setup skips checkWineBeforeLaunch: its self-heal would
  // persist a derived or fallback engine into wineVersion.
  const game = deps.libraryManagers.nile.getGame(appName)
  const step = await selectEngineForLaunch(engineServicesFrom(deps), game, {
    offline: !isOnline(),
    purpose: 'setup'
  })
  if (step.kind === 'refused') {
    logWarning(
      [
        'Setup: no usable engine for',
        gameInfo?.title ?? appName,
        'skipping setup'
      ],
      LogPrefix.Nile
    )
    return
  }
  if (step.kind === 'use') {
    try {
      return await runNileSetup(
        deps,
        appName,
        basePath,
        fuel.PostInstall,
        getLaunchSettings(step.key, stored)
      )
    } finally {
      endEngineLaunch(step.key)
    }
  }

  const logWriter = getRunnerLogWriter('nile')
  const isWineOkToLaunch = await checkWineBeforeLaunch(
    deps,
    gameInfo,
    stored,
    logWriter
  )
  if (!isWineOkToLaunch) {
    logError(
      ['Was not possible to run setup using', stored.wineVersion.name],
      LogPrefix.Nile
    )
    return
  }
  return runNileSetup(deps, appName, basePath, fuel.PostInstall, stored)
}

async function runNileSetup(
  deps: NileSetupDeps,
  appName: string,
  basePath: string,
  postInstall: FuelSchema['PostInstall'],
  gameSettings: GameSettings
): Promise<void> {
  // Make sure prefix is initialized correctly
  if (!isWindows) await deps.launcher.verifyWinePrefix(gameSettings)

  logDebug(['PostInstall:', postInstall], LogPrefix.Nile)

  sendGameStatusUpdate({
    appName,
    runner: 'nile',
    status: 'redist',
    context: 'AMAZON'
  })

  // Actual setup logic
  for (const action of postInstall) {
    const exeArguments = action.Args ?? []

    if (isWindows) {
      const command = [
        '-NoProfile',
        'Start-Process',
        '-FilePath',
        action.Command
      ]
      if (exeArguments.length) {
        command.push('-ArgumentList', ...exeArguments)
      }
      logInfo(['Setup: Executing', command.join(' ')], LogPrefix.Nile)
      await deps.spawnAsync('powershell', command, {
        cwd: basePath
      })
      continue
    }

    logInfo(
      ['Setup: Executing', [action.Command, ...exeArguments].join(' ')],
      LogPrefix.Nile
    )

    await deps.commandRunner.runWineCommand({
      gameSettings,
      gameInstallPath: basePath,
      commandParts: [action.Command, ...exeArguments],
      wait: true,
      protonVerb: 'run',
      startFolder: basePath
    })
  }
}
