import type { AppRuntime } from './appRuntime'
import { isStore, storeCapabilities } from 'common/storeCapabilities'
import { logError, logInfo, LogPrefix } from './logger'
import i18next from 'i18next'
import { tOrFallback } from './i18nFallback'
import { GameInfo, LaunchOption, Runner } from 'common/types'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import type { Launcher, StoreManagers, Stores } from './services/types'
import { z } from 'zod'
import { Path } from './schemas'
import { isCLINoGui } from './constants/environment'
import type { GlobalConfigSlice } from './config'
import type { AppPaths } from './process/context'
import type { AppState } from './host/appState'
import type { Dialogs } from './host/dialogs'
import type { Notifications } from './host/notifications'
import { assertContainedPath } from './sidecar/rendererPathGuard'

// `steam` is a deliberate addition (D-35-19-05): widening this enum also widens the accepted
// `?runner=` input surface for `handleLaunch`'s `RUNNERS.safeParse(runnerStr)` validator below,
// so nothing is added here without a reason.
//
// The confused-deputy guard (T-34.5-46-03) does NOT live in this enum — it lives in
// `steamFlowRegistration.ts`'s `handleLaunch`, in its own-property check on
// the library manager map. Restated here so a future reader does not re-derive it: `steam` IS an
// own property of the library manager map (`storeManagers/index.ts`), so widening this enum does
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

// A link is a cold-start link when it (re)started GameLib. Two signals, both needed:
// Linux/Windows cold links arrive via deliverStartupProtocolUrl before the renderer exists, and
// macOS cold links arrive through on_open_url -> handleProtocolUrl, the SAME channel warm links
// use, firing in the same second as setup (main.rs). So "renderer has not reported ready" is the
// discriminator, and the uptime window guards the race where frontendReady wins against the link.
// `hideWindowOnProtocolLaunch` applies to cold-start links only (quick 261108-kpc): a link that
// reaches an already-running GameLib leaves its window alone unless it carries gui=false.
const COLD_START_WINDOW_SECONDS = 15

/**
 * The one-way "renderer reported ready" flag of one boot (66.4-17, D-05): it flips once per
 * instance, and a fresh boot starts un-ready. Construction allocates a boolean.
 */
export interface ProtocolState {
  markFrontendReady(): void
  isFrontendReady(): boolean
}

export function createProtocolState(): ProtocolState {
  let frontendReadySeen = false
  return {
    markFrontendReady: () => {
      frontendReadySeen = true
    },
    isFrontendReady: () => frontendReadySeen
  }
}

function isColdStartLink(deps: Pick<ProtocolDeps, 'appRuntime'>): boolean {
  return (
    !deps.appRuntime.protocol.isFrontendReady() ||
    process.uptime() < COLD_START_WINDOW_SECONDS
  )
}

/** What a protocol launch reads: the library managers and the launcher's launch callback (66.1, R3). */
export interface ProtocolDeps {
  managers: Pick<StoreManagers, 'library'>
  launcher: Pick<Launcher, 'launchEventCallback'>
  stores: Pick<Stores, 'kvs'>
  config: Pick<GlobalConfigSlice, 'getSettings'>
  notifications: Pick<Notifications, 'show'>
  dialogs: Pick<Dialogs, 'showMessageBox'>
  appState: Pick<
    AppState,
    'inAppDialogRaiseCount' | 'quit' | 'hideMainWindow' | 'raiseMainWindow'
  >
  sendFrontendMessage: SendFrontendMessage
  appRuntime: Pick<AppRuntime, 'protocol' | 'events' | 'launchFlights'>
  paths: Pick<AppPaths, 'windowIcon'>
}

export function handleProtocol(deps: ProtocolDeps, args: string[]) {
  const url = parseHeroicUrl(args)
  if (!url) return

  logInfo(['Received', url.href], LogPrefix.ProtocolHandler)

  switch (url.hostname) {
    case 'ping':
      return handlePing(url)
    case 'launch':
      return handleLaunchEndingNoGui(deps, url)
    default:
      return
  }
}

function handlePing(url: URL) {
  logInfo(['Received ping! Args:', url.searchParams], LogPrefix.ProtocolHandler)
}

// A `--no-gui` link launch is a Steam shortcut: Steam shows "Stop" for as long as this process
// lives. The normal path exits after the game closes (launcher.ts), but every early return skips
// that, so a launch that ends with NO game session (aborted missing-folder prompt, declined
// prompt, failed dispatch, thrown error) would leave GameLib running hidden and Steam stuck on
// Stop. Exit after such a launch UNLESS an in-app dialog re-showed the hidden window during it:
// that one is still on screen for the user to read, and closing GameLib then ends Steam's session.
// Native awaited prompts (askForceUninstall, the not-installed and link-args confirmations) are
// answered by now and do not count. A user who chose to install is staying on purpose.
async function handleLaunchEndingNoGui(deps: ProtocolDeps, url: URL) {
  if (!isCLINoGui) return handleLaunch(deps, url)
  const dialogsBefore = deps.appState.inAppDialogRaiseCount()
  let result: Awaited<ReturnType<typeof handleLaunch>>
  try {
    result = await handleLaunch(deps, url)
  } catch (error) {
    logError(['Protocol launch failed:', error], LogPrefix.ProtocolHandler)
    result = { status: 'error' }
  }
  // 'done' ran the launcher's own exit; 'installing' is a user who chose to install and is
  // staying on purpose. Everything else (including a bare early return) ended with no game.
  if (result?.status === 'done' || result?.status === 'installing')
    return result
  if (deps.appState.inAppDialogRaiseCount() > dialogsBefore) {
    logInfo(
      '--no-gui launch ended with an in-app dialog on screen, staying open',
      LogPrefix.ProtocolHandler
    )
    return result
  }
  logInfo(
    '--no-gui launch ended without a game session, exiting app',
    LogPrefix.ProtocolHandler
  )
  deps.appState.quit()
  return result
}

async function handleLaunch(deps: ProtocolDeps, url: URL) {
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
  // A cold-start link is handled before any library refresh has populated the managers'
  // installed maps (the renderer drives `refreshLibrary`, and `initStoreManagers` is dead under
  // Tauri), so `is_installed` would read false for an installed game. Load it from disk first.
  if (isColdStartLink(deps)) await loadInstalledStateFromDisk(deps, runner)
  const gameInfo = findGame(deps, appName, runner)
  if (!gameInfo) {
    return logError(
      `Could not receive game data for ${appName}!`,
      LogPrefix.ProtocolHandler
    )
  }

  const { is_installed, title } = gameInfo
  const settings = await deps.managers.library[gameInfo.runner]
    .getGame(appName)
    .getSettings()
  const coldStart = isColdStartLink(deps)
  const hideForThisLaunch =
    urlRequestsNoGui(url) ||
    (coldStart && deps.config.getSettings().hideWindowOnProtocolLaunch === true)

  if (is_installed) {
    // URL-supplied `arg`/`altExe` are attacker-authored (any web page can emit this link).
    // Steam's dispatch below takes only the appName, so they never reach it; every other
    // runner gets them vetted and confirmed first.
    if (!storeCapabilities[gameInfo.runner].launchHandedToClient) {
      // gogdl cannot take a `--` end-of-options marker (it forwards the literal `--` to the
      // game), so a `-`-prefixed URL arg could be parsed as one of ITS options (`--wrapper`,
      // `--override-exe`, or any abbreviation argparse accepts). Drop them for gog only;
      // legendary and nile receive passthrough args behind `--` (`runnerLaunchArgv.ts`).
      if (isStore(gameInfo, 'gog')) {
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
        !(await confirmUrlLaunchParameters(deps, title, altExe, args))
      ) {
        // Decline means don't launch at all -- not "launch without the URL's args". The
        // user asked for neither, and a launch they did not expect is the surprise this
        // dialog exists to prevent.
        logInfo(
          'User declined the link-supplied launch parameters, not launching',
          LogPrefix.ProtocolHandler
        )
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
      logInfo(
        `Hiding main window for protocol launch (${
          urlRequestsNoGui(url) ? 'gui=false' : 'cold start'
        })`,
        LogPrefix.ProtocolHandler
      )
      deps.appState.hideMainWindow()
    }

    // Steam is dispatched through the same shared helper the sidecar `launch` handler uses
    // (`dispatchSteamLaunch`), NOT `launchEventCallback`. `launchEventCallback`'s first action
    // is an `existsSync(gameInfo.install.install_path)` precheck followed by
    // `askForceUninstall` + `{ status: 'abort' }` — the exact abort
    // `steamFlowRegistration.ts`'s `handleLaunch` avoids on purpose for a Steam title, whose
    // "install path" is the Steam client's own concern, not a local binary this process can
    // stat. Imported lazily (`await import(...)`) mirroring `launchEventCallback`'s own lazy
    // manager import at `launcher.ts`, so no new static edge is added
    // to this module's import graph.
    if (storeCapabilities[gameInfo.runner].launchHandedToClient) {
      const { dispatchSteamLaunch } =
        await import('backend/storeManagers/steam/launchDispatch')
      const launched = await dispatchSteamLaunch(
        {
          libraryManagers: deps.managers.library,
          stores: deps.stores,
          notifications: deps.notifications,
          sendFrontendMessage: deps.sendFrontendMessage,
          appRuntime: deps.appRuntime
        },
        appName
      )
      return { status: launched ? 'done' : 'error' }
    }

    return deps.launcher.launchEventCallback({
      appName: appName,
      runner: gameInfo.runner,
      skipVersionCheck: settings.ignoreGameUpdates,
      args,
      launchArguments: launchOption
    })
  }

  logInfo(`"${title}" not installed.`, LogPrefix.ProtocolHandler)

  const { response } = await deps.dialogs.showMessageBox({
    buttons: [tOrFallback('box.yes', 'Yes'), tOrFallback('box.no', 'No')],
    cancelId: 1,
    message: `${title} ${i18next.t(
      'box.protocol.install.not_installed',
      'Is Not Installed, do you wish to Install it?'
    )}`,
    title: title,
    icon: deps.paths.windowIcon
  })
  if (response === 0) {
    if (isCLINoGui || hideForThisLaunch) {
      logInfo(
        'Window was hidden but user wants to install, showing GUI',
        LogPrefix.ProtocolHandler
      )
      deps.appState.raiseMainWindow()
    }
    deps.sendFrontendMessage('installGame', appName, gameInfo.runner)
    return { status: 'installing' as const }
  } else if (response === 1) {
    logInfo('Not installing game', LogPrefix.ProtocolHandler)
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
  deps: Pick<ProtocolDeps, 'dialogs' | 'paths'>,
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
    icon: deps.paths.windowIcon
  }
  const { response } = await deps.dialogs.showMessageBox(options)
  return response === 1
}

/**
 * Populates the per-runner installed state from the persisted stores, the same local reads
 * `init()`/`refresh()` do first, minus their network work. Synchronous and idempotent. Nile
 * self-loads in `getGameInfo`; Steam falls back to its persisted cache; sideload has no
 * library-manager lookup. So only gog and legendary need this.
 */
export async function loadInstalledStateFromDisk(
  deps: Pick<ProtocolDeps, 'managers'>,
  runner?: Runner
): Promise<void> {
  const targets = runner ? [runner] : RUNNERS.options
  for (const target of targets) {
    try {
      if (target === 'gog') {
        deps.managers.library.gog.refreshInstalled()
      } else if (target === 'legendary') {
        deps.managers.library.legendary.loadGamesInAccount()
        deps.managers.library.legendary.refreshInstalled()
      }
    } catch (error) {
      logError(
        [`Could not load installed state for ${target}:`, error],
        LogPrefix.ProtocolHandler
      )
    }
  }
}

function findGame(
  deps: Pick<ProtocolDeps, 'managers'>,
  appName?: string | null,
  runner?: Runner
): GameInfo | undefined {
  if (!appName) return

  // If a runner is specified, search for the game in that runner and return it (if found)
  // 260907-f2g: guard the D-01 sentinel. `SteamGame.getGameInfo()` deliberately returns
  // `{} as GameInfo` on a double cache miss, and `{}` is TRUTHY -- returning it here defeats
  // the caller's own `if (!gameInfo)` guard at L116, so the deep link silently does nothing
  // and then throws at `deps.managers.library[gameInfo.runner]` where `runner` is undefined.
  // The `app_name` check makes this branch AGREE with the loop branch below, whose identical
  // check is one of D-01's four legitimate sentinel consumers and must not be altered.
  if (runner) {
    const gameInfo = deps.managers.library[runner]
      .getGame(appName)
      .getGameInfo()
    return gameInfo.app_name ? gameInfo : undefined
  }

  // If no runner is specified, search for the game in all runners and return the first one found
  for (const runner of RUNNERS.options) {
    const maybeGameInfo = deps.managers.library[runner]
      .getGame(appName)
      .getGameInfo()
    if (maybeGameInfo.app_name) return maybeGameInfo
  }
  return
}
