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
import { assertContainedPath } from './sidecar/rendererPathGuard'

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
    // URL-supplied `arg`/`altExe` are attacker-authored (any web page can emit this link).
    // Steam's dispatch below takes only the appName, so they never reach it; every other
    // runner gets them vetted and confirmed first.
    if (gameInfo.runner !== 'steam') {
      // gogdl cannot take a `--` end-of-options marker (it forwards the literal `--` to the
      // game), so a `-`-prefixed URL arg could be parsed as one of ITS options (`--wrapper`,
      // `--override-exe`, or any abbreviation argparse accepts). Drop them for gog only;
      // legendary and nile receive passthrough args behind `--` (`runnerLaunchArgv.ts`).
      if (gameInfo.runner === 'gog') {
        const dropped = args.filter((arg) => arg.startsWith('-'))
        if (dropped.length) {
          logInfo(
            ['Ignoring option-like protocol args for gog:', dropped],
            LogPrefix.ProtocolHandler
          )
          args = args.filter((arg) => !arg.startsWith('-'))
        }
      }

      if (altExe) {
        const installPath = gameInfo.install?.install_path
        try {
          if (!installPath) throw new Error('game has no install path')
          altExe = Path.parse(
            assertContainedPath(installPath, altExe, 'protocol altExe')
          )
        } catch (error) {
          logError(
            [
              'Refusing protocol launch: altExe is not inside the game folder.',
              error
            ],
            LogPrefix.ProtocolHandler
          )
          return
        }
      }

      if (
        (args.length || altExe) &&
        !(await confirmUrlLaunchParameters(title, altExe, args))
      ) {
        // Decline means don't launch at all -- not "launch without the URL's args". The
        // user asked for neither, and a launch they did not expect is the surprise this
        // dialog exists to prevent.
        logInfo(
          'User declined the link-supplied launch parameters, not launching',
          LogPrefix.ProtocolHandler
        )
        if (isCLINoGui) app.quit()
        return
      }
    }

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

// Shows a value exactly, with anything that could forge or hide a line in the dialog
// (control, line-separator and bidi-override characters) escaped as `\u{...}`.
function quoteForDisplay(value: string): string {
  const unsafe = (code: number) =>
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x200e ||
    code === 0x200f ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  const escaped = Array.from(value, (char) => {
    const code = char.charCodeAt(0)
    return unsafe(code) ? `\\u{${code.toString(16)}}` : char
  }).join('')
  return `"${escaped}"`
}

// Asks before a link-supplied executable / args reach a launch. Index 0 is the SAFE
// "Don't launch" and is both `defaultId` and `cancelId`, so Enter, Escape, closing the
// dialog, or the sidecar stub's fail-safe answer (`cancelId`, see `utils.ts` CR-04) all
// decline. Resolves true only for an explicit press of "Launch".
async function confirmUrlLaunchParameters(
  title: string,
  altExe: Path | undefined,
  args: string[]
): Promise<boolean> {
  const executable = altExe
    ? quoteForDisplay(altExe)
    : i18next.t(
        'gamelib:box.protocol.launch.defaultExecutable',
        "(the game's usual executable)"
      )
  const argLines = args.length
    ? args.map((arg) => `  ${quoteForDisplay(arg)}`).join('\n')
    : `  ${i18next.t('gamelib:box.protocol.launch.noArguments', '(none)')}`
  const options = {
    type: 'warning' as const,
    title,
    message: `${title}: ${i18next.t(
      'gamelib:box.protocol.launch.confirmMessage',
      'A link wants to launch this game with the executable and arguments below. Only continue if you trust where the link came from.'
    )}`,
    detail: [
      `${i18next.t('gamelib:box.protocol.launch.executable', 'Executable')}: ${executable}`,
      `${i18next.t('gamelib:box.protocol.launch.arguments', 'Arguments')}:`,
      argLines
    ].join('\n'),
    buttons: [
      i18next.t('gamelib:box.protocol.launch.decline', "Don't launch"),
      i18next.t('gamelib:box.protocol.launch.accept', 'Launch')
    ],
    defaultId: 0,
    cancelId: 0,
    icon: windowIcon
  }
  const mainWindow = getMainWindow()
  const { response } = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options)
  return response === 1
}

function findGame(
  appName?: string | null,
  runner?: Runner
): GameInfo | undefined {
  if (!appName) return

  // If a runner is specified, search for the game in that runner and return it (if found)
  // 260907-f2g: guard the D-01 sentinel. `SteamGame.getGameInfo()` deliberately returns
  // `{} as GameInfo` on a double cache miss, and `{}` is TRUTHY -- returning it here defeats
  // the caller's own `if (!gameInfo)` guard at L116, so the deep link silently does nothing
  // and then throws at `libraryManagerMap[gameInfo.runner]` where `runner` is undefined.
  // The `app_name` check makes this branch AGREE with the loop branch below, whose identical
  // check is one of D-01's four legitimate sentinel consumers and must not be altered.
  if (runner) {
    const gameInfo = libraryManagerMap[runner].getGame(appName).getGameInfo()
    return gameInfo.app_name ? gameInfo : undefined
  }

  // If no runner is specified, search for the game in all runners and return the first one found
  for (const runner of RUNNERS.options) {
    const maybeGameInfo = libraryManagerMap[runner]
      .getGame(appName)
      .getGameInfo()
    if (maybeGameInfo.app_name) return maybeGameInfo
  }
  return
}
