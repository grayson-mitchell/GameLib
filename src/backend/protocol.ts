import { dialog, app } from 'backend/platform'
import { logError, logInfo, LogPrefix } from './logger'
import i18next from 'i18next'
import { GameInfo, LaunchOption, Runner } from 'common/types'
import { getMainWindow } from './main_window'
import { sendFrontendMessage } from './ipc'
import { libraryManagerMap } from './storeManagers'
import { launchEventCallback } from './launcher'
import { z } from 'zod'
import { windowIcon } from './constants/paths'
import { Path } from './schemas'
import { isCLINoGui } from './constants/environment'
import { GlobalConfig } from './config'

// `steam` is a deliberate addition (D-35-19-05): widening this enum also widens the accepted
// `?runner=` input surface for `handleLaunch`'s `RUNNERS.safeParse(runnerStr)` validator below,
// so nothing is added here without a reason. `zoom` is deliberately EXCLUDED — it is a dropped
// platform for this project (see `zoom-platform-drop-reaffirmed.md`), so adding it would widen
// the accepted input surface for a store that ships no user-reachable launch path.
//
// The confused-deputy guard (T-34.5-46-03) does NOT live in this enum — it lives in
// `steamFlowRegistration.ts`'s `handleLaunch`, in its own-property check on
// `libraryManagerMap`. Restated here so a future reader does not re-derive it: `steam` IS an
// own property of `libraryManagerMap` (`storeManagers/index.ts`), so widening this enum does
// not reach a manager that does not exist.
export const RUNNERS = z.enum(['legendary', 'gog', 'nile', 'sideload', 'steam'])

function parseHeroicUrl(args: string[]): URL | undefined {
  const urlStr = args.find((arg) => arg.startsWith('gamelib://'))
  if (!urlStr) return
  try {
    return new URL(urlStr)
  } catch {
    return
  }
}

function urlRequestsNoGui(url: URL): boolean {
  const guiParam = url.searchParams.get('gui')
  return guiParam === 'false' || guiParam === '0' || guiParam === 'no'
}

// Returns true when a `gamelib://launch/...` URL in `args` should suppress
// the main window: either the URL carries `gui=false` (or `0`/`no`), or the
// user enabled the `hideWindowOnProtocolLaunch` setting.
export function shouldHideWindowForProtocolArgs(args: string[]): boolean {
  const url = parseHeroicUrl(args)
  if (!url || url.hostname !== 'launch') return false
  if (urlRequestsNoGui(url)) return true
  try {
    return GlobalConfig.get().getSettings().hideWindowOnProtocolLaunch === true
  } catch {
    return false
  }
}

export function handleProtocol(args: string[]) {
  const url = parseHeroicUrl(args)
  if (!url) return

  logInfo(['Received', url.href], LogPrefix.ProtocolHandler)

  switch (url.hostname) {
    case 'ping':
      return handlePing(url)
    case 'launch':
      return handleLaunch(url)
    default:
      return
  }
}

function handlePing(url: URL) {
  logInfo(['Received ping! Args:', url.searchParams], LogPrefix.ProtocolHandler)
}

async function handleLaunch(url: URL) {
  let appName
  let runnerStr
  let args: string[] = []
  let altExe: Path | undefined = undefined

  // Windows automatically adds a trailing / to shortcuts
  if (url.pathname && url.pathname !== '/') {
    // Old-style pathname URLs:
    // - `gamelib://launch/Quail`
    // - `gamelib://launch/legendary/Quail`
    const splitPath = url.pathname.split('/').filter(Boolean)
    appName = splitPath.pop()
    runnerStr = splitPath.pop()
  } else {
    // New-style params URL:
    // `gamelib://launch?appName=Quail&runner=legendary&arg=foo&arg=bar`
    appName = url.searchParams.get('appName')
    runnerStr = url.searchParams.get('runner')
    args = url.searchParams.getAll('arg').map(decodeURIComponent)

    const altExeParameter = url.searchParams.get('altExe')
    if (altExeParameter) {
      const altExeParse = Path.safeParse(decodeURIComponent(altExeParameter))
      if (altExeParse.success) altExe = altExeParse.data
    }
  }

  if (!appName) {
    logError('No appName in protocol URL', LogPrefix.ProtocolHandler)
    return
  }

  let runner: Runner | undefined
  const runnerParse = RUNNERS.safeParse(runnerStr)
  if (runnerParse.success) {
    runner = runnerParse.data
  }
  const gameInfo = findGame(appName, runner)
  if (!gameInfo) {
    return logError(
      `Could not receive game data for ${appName}!`,
      LogPrefix.ProtocolHandler
    )
  }

  const { is_installed, title } = gameInfo
  const settings = await libraryManagerMap[gameInfo.runner]
    .getGame(appName)
    .getSettings()
  const hideForThisLaunch =
    urlRequestsNoGui(url) ||
    GlobalConfig.get().getSettings().hideWindowOnProtocolLaunch === true

  if (is_installed) {
    let launchOption: LaunchOption | undefined = undefined
    if (altExe)
      launchOption = {
        type: 'altExe',
        executable: altExe
      }

    if (hideForThisLaunch) {
      const mainWindow = getMainWindow()
      if (mainWindow?.isVisible()) {
        logInfo(
          'Hiding main window for protocol launch',
          LogPrefix.ProtocolHandler
        )
        mainWindow.hide()
      }
    }

    // Steam is dispatched through the same shared helper the sidecar `launch` handler uses
    // (`dispatchSteamLaunch`), NOT `launchEventCallback`. `launchEventCallback`'s first action
    // is an `existsSync(gameInfo.install.install_path)` precheck followed by
    // `askForceUninstall` + `{ status: 'abort' }` — the exact abort
    // `steamFlowRegistration.ts`'s `handleLaunch` avoids on purpose for a Steam title, whose
    // "install path" is the Steam client's own concern, not a local binary this process can
    // stat. Imported lazily (`await import(...)`) mirroring `launchEventCallback`'s own lazy
    // `await import('backend/storeManagers')` at `launcher.ts`, so no new static edge is added
    // to this module's import graph.
    if (gameInfo.runner === 'steam') {
      const { dispatchSteamLaunch } =
        await import('backend/storeManagers/steam/launchDispatch')
      const launched = await dispatchSteamLaunch(appName)
      return { status: launched ? 'done' : 'error' }
    }

    return launchEventCallback({
      appName: appName,
      runner: gameInfo.runner,
      skipVersionCheck: settings.ignoreGameUpdates,
      args,
      launchArguments: launchOption
    })
  }

  logInfo(`"${title}" not installed.`, LogPrefix.ProtocolHandler)

  const mainWindow = getMainWindow()
  if (!mainWindow) return

  const { response } = await dialog.showMessageBox(mainWindow, {
    buttons: [i18next.t('box.yes'), i18next.t('box.no')],
    cancelId: 1,
    message: `${title} ${i18next.t(
      'box.protocol.install.not_installed',
      'Is Not Installed, do you wish to Install it?'
    )}`,
    title: title,
    icon: windowIcon
  })
  if (response === 0) {
    if (isCLINoGui || hideForThisLaunch) {
      logInfo(
        'Window was hidden but user wants to install, showing GUI',
        LogPrefix.ProtocolHandler
      )
      mainWindow.show()
    }
    sendFrontendMessage('installGame', appName, gameInfo.runner)
  } else if (response === 1) {
    logInfo('Not installing game', LogPrefix.ProtocolHandler)
    if (isCLINoGui) {
      logInfo('--no-gui flag detected, exiting app', LogPrefix.ProtocolHandler)
      app.quit()
    }
  }
}

function findGame(
  appName?: string | null,
  runner?: Runner
): GameInfo | undefined {
  if (!appName) return

  // If a runner is specified, search for the game in that runner and return it (if found)
  if (runner) return libraryManagerMap[runner].getGame(appName).getGameInfo()

  // If no runner is specified, search for the game in all runners and return the first one found
  for (const runner of RUNNERS.options) {
    const maybeGameInfo = libraryManagerMap[runner]
      .getGame(appName)
      .getGameInfo()
    if (maybeGameInfo.app_name) return maybeGameInfo
  }
  return
}
