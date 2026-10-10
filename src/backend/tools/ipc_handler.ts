import { libraryManagerMap } from 'backend/storeManagers'
import { addHandler, sendFrontendMessage } from '../ipc'
import { Winetricks, runWineCommandOnGame } from '.'
import path from 'path'
import { execAsync, getGame, sendGameStatusUpdate } from 'backend/utils'
import { isWindows } from 'backend/constants/environment'

addHandler(
  'runWineCommandForGame',
  async (event, { appName, commandParts, runner }) => {
    if (isWindows) {
      return execAsync(commandParts.join(' '))
    }

    // FIXME: Why are we using `runinprefix` here?
    return runWineCommandOnGame(runner, appName, {
      commandParts,
      wait: false,
      protonVerb: 'runinprefix'
    })
  }
)

// Calls WineCFG or Winetricks. If is WineCFG, use the same binary as wine to launch it to dont update the prefix
addHandler('callTool', async (event, { tool, exe, appName, runner }) => {
  const gameSettings = await libraryManagerMap[runner]
    .getGame(appName)
    .getSettings()

  switch (tool) {
    case 'winecfg':
      await runWineCommandOnGame(runner, appName, {
        gameSettings,
        commandParts: ['winecfg'],
        wait: false
      })
      break
    case 'runExe':
      if (exe) {
        const workingDir = path.parse(exe).dir
        await runWineCommandOnGame(runner, appName, {
          gameSettings,
          commandParts: [exe],
          wait: false,
          startFolder: workingDir
        })
      }
      break
  }
  if (runner === 'gog') {
    // Check if game was modified by offline installer / wine uninstaller
    await libraryManagerMap['gog'].checkForOfflineInstallerChanges(appName)
    const maybeNewGameInfo = libraryManagerMap['gog'].getGameInfo(appName)
    if (maybeNewGameInfo)
      sendFrontendMessage('pushGameToLibrary', maybeNewGameInfo)
  }

  sendGameStatusUpdate({ appName, runner, status: 'done' })
})

// `winetricksInstall` (send-kind, `addListener`) was retired by Phase 45 Plan 02 (D-11 promote,
// 2026-10-10) — `winetricksApply` (`backend/tools/winetricksQueue.ts`, registered by the Tauri
// sidecar's `wineToolsFlowRegistration.ts`) is now the only renderer-reachable install path.

addHandler('winetricksAvailable', async (event, runner, appName) => {
  try {
    return await Winetricks.listAvailable(runner, appName)
  } catch {
    return []
  }
})

addHandler('winetricksInstalled', async (event, runner, appName) => {
  const game = getGame(appName, runner)
  return Winetricks.listInstalled(game)
})
