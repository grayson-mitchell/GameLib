import { callAllAbortControllers } from './utils/aborthandler/aborthandler'
import {
  Runner,
  WineInstallation,
  RpcClient,
  Release,
  GameInfo,
  GameSettings,
  GameStatus
} from 'common/types'
import axios from 'axios'
import https from 'node:https'
import { app, dialog, shell, Notification, BrowserWindow } from 'electron'
import { exec, spawn, SpawnOptions, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'graceful-fs'
import { promisify } from 'util'
import i18next, { t } from 'i18next'

import {
  logError,
  logInfo,
  LogPrefix,
  logWarning,
  logDebug
} from 'backend/logger'
import { basename, dirname, join, normalize } from 'path'
import {
  gameInfoStore,
  installStore,
  libraryStore
} from 'backend/storeManagers/legendary/electronStores'
import {
  achievementStore as GOGAchievementStore,
  apiInfoCache as GOGapiInfoCache,
  installInfoStore as GOGinstallInfoStore,
  libraryStore as GOGlibraryStore
} from './storeManagers/gog/electronStores'
import gogPresence from './storeManagers/gog/presence'
import { libraryManagerMap } from './storeManagers'
import {
  installStore as nileInstallStore,
  libraryStore as nileLibraryStore
} from './storeManagers/nile/electronStores'
import * as fileSize from 'filesize'
import { Client as discordClient } from '@xhayper/discord-rpc'
import { showDialogBoxModalAuto } from './dialog/dialog'
import { getMainWindow } from './main_window'
import { sendFrontendMessage } from './ipc'
import { GlobalConfig } from './config'
import { GameConfig } from './game_config'
import { validWine, runWineCommand } from './launcher'
import {
  installWineVersion,
  updateWineVersionInfos,
  wineDownloaderInfoStore
} from './wine/manager/utils'
import { readdir, lstat } from 'fs/promises'
import { getHeroicVersion } from './utils/systeminfo/heroicVersion'
import { backendEvents } from './backend_events'
import { wikiGameInfoStore } from './wiki_game_info/electronStore'
import EasyDl from 'easydl'

import {
  deviceNameCache,
  vendorNameCache
} from './utils/systeminfo/gpu/pci_ids'
import type { AppSettings, WineManagerStatus } from 'common/types'
import { isUmuSupported } from './utils/compatibility_layers'
import { getSystemInfo } from './utils/systeminfo'
import { configStore } from './constants/key_value_stores'
import { isLinux, isMac, isIntelMac, isWindows } from './constants/environment'
import {
  configPath,
  fixAsarPath,
  gamesConfigPath,
  heroicIconFolder,
  publicDir,
  toolsPath,
  windowIcon
} from './constants/paths'
import { parse } from '@node-steam/vdf'

import type LogWriter from 'backend/logger/log_writer'
import { isRunning } from './downloadmanager/downloadqueue'
import { isOnline } from './online_monitor'
import type { Game } from 'common/types/game_manager'

const execAsync = promisify(exec)

function getGame(id: string, runner: Runner): Game {
  // Uses the static top-level `import { libraryManagerMap } from './storeManagers'`
  // above, NOT a synchronous `require('./storeManagers')`: electron-vite/Rollup
  // leaves a bare require() of a module specifier unresolved in the production
  // bundle (it only rewrites static import/import()), so require('./storeManagers')
  // threw "Cannot find module './storeManagers'" at runtime from the packaged
  // chunk. The binding is dereferenced only here at call time, so the
  // utils.ts <-> storeManagers/index.ts circular dependency is unaffected (live
  // binding; mirrors downloadqueue.ts / launcher.ts / uninstaller.ts). getGame()
  // stays a synchronous export — its callers (shortcuts/tools/wiki_game_info
  // ipc_handlers etc.) expect a Game, not a Promise<Game>.
  return libraryManagerMap[runner].getGame(id)
}

/**
 * Compares 2 SemVer strings following "major.minor.patch".
 * Checks if target is newer than base.
 */
function semverGt(target: string, base: string) {
  if (!target || !base) {
    return false
  }
  target = target.replace('v', '')

  // beta to beta
  if (base.includes('-beta') && target.includes('-beta')) {
    const bSplit = base.split('-beta.')
    const tSplit = target.split('-beta.')

    // same major beta?
    if (bSplit[0] === tSplit[0]) {
      base = bSplit[1]
      target = tSplit[1]
      return target > base
    } else {
      base = bSplit[0]
      target = tSplit[0]
    }
  }

  // beta to stable
  if (base.includes('-beta')) {
    base = base.split('-beta.')[0]
  }

  // stable to beta
  if (target.includes('-beta')) {
    target = target.split('-beta.')[0]
  }

  const [bmajor, bminor, bpatch] = base.split('.').map(Number)
  const [tmajor, tminor, tpatch] = target.split('.').map(Number)

  let isGE = false
  // A pretty nice piece of logic if you ask me. :P
  isGE ||= tmajor > bmajor
  isGE ||= tmajor === bmajor && tminor > bminor
  isGE ||= tmajor === bmajor && tminor === bminor && tpatch > bpatch
  return isGE
}

const getFileSize = fileSize.partial({ base: 2 }) as (arg: unknown) => string

async function getWineFromProton(
  gameSettings: GameSettings
): Promise<{ winePrefix: string; wineVersion: WineInstallation }> {
  const wineVersion = gameSettings.wineVersion
  let winePrefix = gameSettings.winePrefix

  if (wineVersion.type !== 'proton' || (await isUmuSupported(gameSettings))) {
    return { winePrefix, wineVersion }
  }

  winePrefix = join(winePrefix, 'pfx')

  // GE-Proton & Proton Experimental use 'files', Proton 7 and below use 'dist'
  for (const distPath of ['dist', 'files']) {
    const protonBaseDir = dirname(wineVersion.bin)
    const wineBin = join(protonBaseDir, distPath, 'bin', 'wine')
    if (!existsSync(wineBin)) continue

    const wineserverBin = join(protonBaseDir, distPath, 'bin', 'wineserver')
    return {
      winePrefix,
      wineVersion: {
        ...wineVersion,
        type: 'wine',
        bin: wineBin,
        wineserver: existsSync(wineserverBin) ? wineserverBin : undefined
      }
    }
  }

  logError(
    [
      'Proton',
      wineVersion.name,
      'has an abnormal structure, unable to supply Wine binary!'
    ],
    LogPrefix.Backend
  )

  return { wineVersion, winePrefix }
}

async function isEpicServiceOffline(
  type: 'Epic Games Store' | 'Fortnite' | 'Rocket League' = 'Epic Games Store'
) {
  if (!isOnline()) return true

  const epicStatusApi = 'https://status.epicgames.com/api/v2/components.json'
  const notification = new Notification({
    title: `${type} ${t('epic.offline-notification-title', 'offline')}`,
    body: t(
      'epic.offline-notification-body',
      'GameLib will maybe not work probably!'
    ),
    urgency: 'normal',
    timeoutType: 'default',
    silent: false
  })

  try {
    const { data } = await axiosClient.get(epicStatusApi)

    for (const component of data.components) {
      const { name: name, status: indicator } = component

      // found component and checking status
      if (name === type) {
        const isOffline = indicator === 'major'
        if (isOffline) {
          notification.show()
        }
        return isOffline
      }
    }

    notification.show()
    return false
  } catch (error) {
    logError(
      ['Failed to get epic service status with', error],
      LogPrefix.Backend
    )
    return false
  }
}

const showAboutWindow = () => {
  app.setAboutPanelOptions({
    applicationName: 'GameLib',
    applicationVersion: getHeroicVersion(),
    copyright: 'GPL V3',
    iconPath: windowIcon,
    website: 'https://github.com/grayson-mitchell/GameLib'
  })
  return app.showAboutPanel()
}

/**
 * CR-04 (Phase 34.1 code review): a translation lookup that survives an UNINITIALIZED
 * i18next instance.
 *
 * `handleExit` became sidecar-reachable this slice (`appShellFlowRegistration.ts`
 * registers `ipcMain.on('quit', ...)`), and the headless sidecar never runs the
 * `i18next.use(Backend).init({...})` call that lives inside `main.ts`'s
 * `app.whenReady()` block. On an uninitialized instance `i18next.t(key, fallback)`
 * returns `undefined` -- the fallback argument does NOT save it (verified against the
 * installed i18next 22.5.1). Those `undefined`s crossed the wire as JSON `null` and
 * `main.rs`'s `dialog_message` arm renders them via `.unwrap_or("")`, so the user was
 * shown a BLANK message with TWO BLANK BUTTONS on the quit-confirm -- with no way to
 * tell which one cancels, on a dialog whose other branch kills in-flight downloads.
 *
 * Under Electron i18next IS initialized, so this returns the real translation and
 * behaviour is unchanged.
 */
function tOrFallback(key: string, fallback: string): string {
  try {
    const translated: unknown = i18next.t(key, fallback)
    return typeof translated === 'string' && translated.length > 0
      ? translated
      : fallback
  } catch {
    return fallback
  }
}

async function handleExit() {
  const isLocked = existsSync(join(gamesConfigPath, 'lock'))
  const mainWindow = getMainWindow()

  if ((isLocked || isRunning()) && mainWindow) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      buttons: [tOrFallback('box.no', 'No'), tOrFallback('box.yes', 'Yes')],
      // CR-04: `cancelId` is LOAD-BEARING, not cosmetic. This dialog's sense is
      // INVERTED relative to every other `showMessageBox` caller in the codebase:
      // index 0 is the SAFE "No" and index 1 is the DESTRUCTIVE "Yes"
      // (killPattern('legendary'|'gogdl'|'nile') + callAllAbortControllers() +
      // app.exit(), i.e. killing an in-flight install/download). The sidecar's
      // `electronStub.showMessageBox` fail-safe default is
      // `options?.cancelId ?? (buttons.length ?? 1) - 1`, which without an explicit
      // cancelId evaluates to 1 here -- so ANY transport error or timeout on the
      // newly-sidecar-reachable `quit` path returned the DESTRUCTIVE answer. Declaring
      // cancelId: 0 restores the stub's documented fail-safe-to-decline property for
      // this caller. Electron's own dialog also honours cancelId (it is the response
      // returned when the dialog is dismissed without a button press), so this is
      // correct on both paths.
      cancelId: 0,
      message: tOrFallback(
        'box.quit.message',
        'There are pending operations, are you sure?'
      ),
      title: tOrFallback('box.quit.title', 'Exit')
    })

    if (response === 0) {
      return
    }

    // This is very hacky and can be removed if bineries handle SIGTERM and SIGKILL
    // FIXME: we should keep track of what we are doing and kill just that
    // this is really dangerous cause we can be killing other processes unrelated
    // to what we are doing x_x
    const possibleChildren = ['legendary', 'gogdl', 'nile']
    possibleChildren.forEach((procName) => {
      try {
        killPattern(procName)
      } catch (error) {
        logInfo([`Unable to kill ${procName}, ignoring.`, error])
      }
    })

    // Kill all child processes
    callAllAbortControllers()
  }

  mainWindow?.hide()
  await gogPresence.deletePresence()

  app.exit()
}

export async function askForceUninstall(game: Game) {
  const { title } = game.getGameInfo()
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title,
    message: i18next.t(
      'box.error.folder-not-found.title',
      'Game folder appears to be deleted, do you want to remove the game from the installed list?'
    ),
    buttons: [i18next.t('box.no'), i18next.t('box.yes')],
    // D-07 fail-safe (Phase 33 Plan 03): buttons[1] ("yes") is the destructive branch
    // (forceUninstall) -- an explicit cancelId declares buttons[0] ("no") as the safe
    // decline so a degraded/timed-out dialog never auto-confirms the deletion.
    cancelId: 0
  })

  if (response === 1) {
    await game.forceUninstall()
  }
  return response
}

async function errorHandler(
  error: string,
  appName: string,
  runner: Runner
): Promise<void> {
  const plat = runner === 'legendary' ? 'Legendary (Epic Games)' : runner
  const deletedFolderMsg = 'appears to be deleted'
  const expiredCredentials = 'No saved credentials'
  const legendaryRegex = /legendary.*\.py/
  const ignoreMessages = [
    // this message appears on macOS when no Crossover was found in the system, but it's a false alarm
    'IndexError: list index out of range',
    // Happens with the Zipapp build of Legendary on Linux, if the user updates
    // dependencies requests relies on
    'RequestsDependencyWarning'
  ]

  if (!error) return

  if (ignoreMessages.some((msg) => error.includes(msg))) return

  if (error.includes(deletedFolderMsg) && appName) {
    await askForceUninstall(getGame(appName, runner))
    return
  }

  if (legendaryRegex.test(error)) {
    const MemoryError = 'MemoryError: '
    if (error.includes(MemoryError)) {
      return
    }

    return showDialogBoxModalAuto({
      title: plat,
      message: i18next.t(
        'box.error.legendary.generic',
        'An error has occurred! Try to Logout and Login on your Epic account. {{newline}}  {{error}}',
        { error, newline: '\n' }
      ),
      type: 'ERROR'
    })
  }

  if (error.includes(expiredCredentials)) {
    return showDialogBoxModalAuto({
      title: plat,
      message: i18next.t(
        'box.error.credentials.message',
        'Your Crendentials have expired, Logout and Login Again!'
      ),
      type: 'ERROR'
    })
  }
}

// If you ever modify this range of characters, please also add them to nile
// source as this function is used to determine how game directory will be named
function removeSpecialcharacters(text: string): string {
  const regexp = new RegExp(/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|'|"|®]/, 'gi')
  return text.replaceAll(regexp, '')
}

async function openUrlOrFile(url: string): Promise<string | void> {
  if (url.startsWith('http')) {
    return shell.openExternal(url)
  }
  return shell.openPath(url)
}

function clearCache(
  library?: 'gog' | 'legendary' | 'nile' | 'zoom',
  fromVersionChange = false
) {
  wikiGameInfoStore.clear()
  if (library === 'gog' || !library) {
    GOGapiInfoCache.clear()
    GOGlibraryStore.clear()
    GOGinstallInfoStore.clear()
    GOGAchievementStore.clear()
  }
  if (library === 'legendary' || !library) {
    installStore.clear()
    libraryStore.clear()
    gameInfoStore.clear()
    // Imported lazily to break a circular dependency (utils.ts <->
    // storeManagers/index.ts) — see the load-bearing comment in
    // storeManagers/gog/user.ts. Fire-and-forget, matching the previous
    // (also unawaited) synchronous call.
    void import('./storeManagers').then(({ libraryManagerMap }) => {
      libraryManagerMap['legendary'].runRunnerCommand(
        { subcommand: 'cleanup' },
        { abortId: 'legandary-cleanup' }
      )
    })
  }
  if (library === 'nile' || !library) {
    nileInstallStore.clear()
    nileLibraryStore.clear()
  }

  if (!fromVersionChange) {
    deviceNameCache.clear()
    vendorNameCache.clear()
  }
}

function clearAchievementCache(appName: string) {
  GOGAchievementStore.delete(appName)
}

function resetHeroic() {
  const appFolders = [gamesConfigPath, configPath]
  appFolders.forEach((folder) => {
    rmSync(folder, { recursive: true, force: true })
  })
  // wait a sec to avoid racing conditions
  setTimeout(() => {
    app.relaunch()
    app.quit()
  }, 1000)
}

function showItemInFolder(item: string) {
  if (existsSync(item)) {
    try {
      shell.showItemInFolder(item)
    } catch (error) {
      logError(
        ['Failed to show item in folder with:', error],
        LogPrefix.Backend
      )
    }
  }
}

function splitPathAndName(fullPath: string): { dir: string; bin: string } {
  const dir = dirname(fullPath)
  const bin = basename(fullPath)
  // Make sure to always return this as `dir, bin` to not break path
  // resolution when using `join(...Object.values(...))`
  return { dir, bin }
}

// Phase 34.9: legendary/gogdl/nile ship as PyInstaller --onedir bundles on
// macOS only, to eliminate the amfid Gatekeeper per-file-extraction tax that
// onefile pays there (~20s cold spawn vs ~0.2s onedir -- measured, see
// 34.9-CONTEXT.md). Windows and Linux keep onefile: they don't pay that tax
// and gain nothing from onedir's ~2.2x bundle-size growth. `comet` is
// deliberately excluded here -- it's a Rust static binary (~0.01s spawn)
// that pays no tax either, and must never be dragged into the nested branch.
const MACOS_ONEDIR_RUNNERS = ['legendary', 'gogdl', 'nile'] as const

function archSpecificBinary(binaryName: string) {
  // Decide onedir nesting from the CLEAN runner name, before any
  // platform-specific suffix is appended below -- so a win32 run (whose
  // `binaryName` gets a `.exe` suffix a few lines down) can never enter the
  // nested branch: the check both requires `process.platform === 'darwin'`
  // AND matches against the pre-suffix name.
  const isMacOnedirRunner =
    process.platform === 'darwin' &&
    (MACOS_ONEDIR_RUNNERS as readonly string[]).includes(binaryName)

  // On Windows the helper binaries have .exe extension
  if (process.platform === 'win32') binaryName += '.exe'

  // Onedir runners live one directory deeper, at `.../{runner}/{runner}`
  // (the folder PyInstaller's `--onedir` produces, containing the
  // executable plus its bundled Python/Mach-O dependencies). Flat runners
  // (Windows, Linux, and `comet` everywhere) keep the single-segment shape.
  const segments = isMacOnedirRunner
    ? [binaryName, binaryName]
    : [binaryName]

  // Try to use the arch-native binary first, if that doesn't exist fall back to
  // the x64 version (assume a compatibility layer like box64 is installed).
  //
  // Phase 34.5 G-1 (34.5-17): the x64 fallback used to be returned
  // unconditionally, without ever checking it exists. When `publicDir`
  // itself was wrong (the sidecar's `getAppPath()`/`process.cwd()` defect,
  // see `34.5-APP-ROOT-SWEEP.md` row 10), that turned a wrong app root into
  // `spawn ./legendary ENOENT` six layers away at `launcher.ts`'s
  // `callRunner` (whose LOGGED absolute path disagreed with its relative
  // spawn argument) -- the exact shape that cost live-gate items 1/2/3
  // (`34.5-LIVE-GATE.md` root cause step 5). Existence-checking the
  // fallback and throwing here instead makes the fault loud at the point of
  // resolution, naming both attempted paths, rather than silent until a
  // spawn six layers downstream.
  const archSpecificPath = join(
    publicDir,
    'bin',
    process.arch,
    process.platform,
    ...segments
  )
  if (existsSync(archSpecificPath)) return archSpecificPath

  const x64Path = join(publicDir, 'bin', 'x64', process.platform, ...segments)
  if (existsSync(x64Path)) return x64Path

  // Phase 34.9 Pitfall 6: a checkout that still holds the OLD flat-file
  // macOS runner (from before this onedir change) would otherwise silently
  // miss both candidates above and fall through to the generic "not found"
  // throw -- which reads like a missing download, not a stale layout, and
  // the REAL downstream failure is a cryptic `spawn ./nile ENOENT` six
  // layers away in `launcher.ts`'s `callRunner` (the exact shape that cost
  // Phase 34.5's live gate items 1/2/3). Detect that specific stale-flat
  // case here and fail loudly, naming the fix, at the point of resolution.
  if (isMacOnedirRunner) {
    const staleFlatPath = join(
      publicDir,
      'bin',
      process.arch,
      'darwin',
      binaryName
    )
    if (existsSync(staleFlatPath)) {
      throw new Error(
        `[archSpecificBinary] Found a pre-Phase-34.9 flat onefile binary at "${staleFlatPath}", ` +
          `but an onedir tree is now expected at "${archSpecificPath}". This checkout's ` +
          `public/bin is stale. Run "pnpm download-helper-binaries" to fetch the current ` +
          `onedir runner bundle.`
      )
    }
  }

  throw new Error(
    `[archSpecificBinary] Could not locate runner binary "${binaryName}". ` +
      `Tried arch-native path: "${archSpecificPath}" and x64 fallback path: "${x64Path}" ` +
      `(resolved publicDir: "${publicDir}"). Neither exists on disk.`
  )
}

let defaultLegendaryPath: string | undefined = undefined
function getLegendaryBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altLegendaryBin) {
    return splitPathAndName(settings.altLegendaryBin)
  }

  if (!defaultLegendaryPath)
    defaultLegendaryPath = archSpecificBinary('legendary')

  return splitPathAndName(fixAsarPath(defaultLegendaryPath))
}

let defaultGogdlPath: string | undefined = undefined
function getGOGdlBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altGogdlBin) {
    return splitPathAndName(settings.altGogdlBin)
  }

  if (!defaultGogdlPath) defaultGogdlPath = archSpecificBinary('gogdl')

  return splitPathAndName(fixAsarPath(defaultGogdlPath))
}

let defaultCometPath: string | undefined = undefined
function getCometBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altCometBin) {
    return splitPathAndName(settings.altCometBin)
  }

  if (!defaultCometPath) defaultCometPath = archSpecificBinary('comet')

  return splitPathAndName(fixAsarPath(defaultCometPath))
}

let defaultNilePath: string | undefined = undefined
function getNileBin(): { dir: string; bin: string } {
  const settings = GlobalConfig.get().getSettings()
  if (settings?.altNileBin) {
    return splitPathAndName(settings.altNileBin)
  }

  if (!defaultNilePath) defaultNilePath = archSpecificBinary('nile')

  return splitPathAndName(fixAsarPath(defaultNilePath))
}

export function createNecessaryFolders() {
  const defaultFolders = [gamesConfigPath, heroicIconFolder]

  const necessaryFoldersByPlatform = {
    win32: [...defaultFolders],
    linux: [...defaultFolders, toolsPath],
    darwin: [...defaultFolders, toolsPath]
  }

  const platformFolders =
    necessaryFoldersByPlatform[
      process.platform as keyof typeof necessaryFoldersByPlatform
    ] ?? necessaryFoldersByPlatform['linux']
  platformFolders.forEach((folder: string) => {
    if (!existsSync(folder)) {
      mkdirSync(folder)
    }
  })
}

function getFormattedOsName(): string {
  switch (process.platform) {
    case 'linux':
      return 'Linux'
    case 'win32':
      return 'Windows'
    case 'darwin':
      return 'macOS'
    default:
      return 'Unknown OS'
  }
}

export async function getSteamLibraries(): Promise<string[]> {
  const { defaultSteamPath } = GlobalConfig.get().getSettings()
  const path = defaultSteamPath.replaceAll("'", '')
  const vdfFile = join(path, 'steamapps', 'libraryfolders.vdf')
  const libraries = ['/usr/share/steam']

  if (existsSync(vdfFile)) {
    const json = parse(readFileSync(vdfFile, 'utf-8'))
    if (!json.libraryfolders) {
      return libraries
    }
    const folders: { path: string }[] = Object.values(json.libraryfolders)
    return [...libraries, ...folders.map((folder) => folder.path)].filter(
      (path) => existsSync(path)
    )
  }
  logDebug(
    'Unable to load Steam Libraries, libraryfolders.vdf not found',
    LogPrefix.Backend
  )
  return libraries
}

function constructAndUpdateRPC(gameInfo: GameInfo): RpcClient {
  const client = new discordClient({
    clientId: '852942976564723722'
  })

  const versionText = `GameLib ${app.getVersion()}`

  const image = gameInfo.art_icon || gameInfo.art_square
  const title = gameInfo.title

  const overrides = image.startsWith('http')
    ? {
        largeImageKey: image,
        smallImageKey: 'icon_new',
        largeImageText: title,
        smallImageText: versionText
      }
    : {
        largeImageKey: 'icon_new',
        largeImageText: versionText
      }

  client.on('ready', async () => {
    await client.user?.setActivity({
      name: title,
      type: 0,
      startTimestamp: Date.now(),
      state: 'via GameLib on ' + getFormattedOsName(),
      statusDisplayType: 0, // Use game title for name plate
      ...overrides
    })
  })

  client.login()
  logInfo('Started Discord Rich Presence', LogPrefix.Backend)
  return client
}

const specialCharactersRegex =
  /('\w)|(\\(\w|\d){5})|(\\"(\\.|[^"])*")|[^((0-9)|(a-z)|(A-Z)|\s)]/g // addeed regex for capturings "'s" + unicodes + remove subtitles in quotes
const cleanTitle = (title: string) =>
  title
    .replaceAll(specialCharactersRegex, '')
    .replaceAll(' ', '-')
    .replaceAll('®', '')
    .toLowerCase()
    .split('--definitive')[0]

const formatEpicStoreUrl = (title: string) => {
  const storeUrl = `https://www.epicgames.com/store/product/`
  return `${storeUrl}${cleanTitle(title)}`
}

function quoteIfNecessary(stringToQuote: string) {
  const shouldQuote =
    typeof stringToQuote === 'string' &&
    !(stringToQuote.startsWith('"') && stringToQuote.endsWith('"')) &&
    stringToQuote.includes(' ')

  if (shouldQuote) {
    return `"${stringToQuote}"`
  }

  return String(stringToQuote)
}

function removeQuoteIfNecessary(stringToUnquote: string) {
  if (
    stringToUnquote &&
    stringToUnquote.startsWith('"') &&
    stringToUnquote.endsWith('"')
  ) {
    return stringToUnquote.replace(/^"+/, '').replace(/"+$/, '')
  }

  return String(stringToUnquote)
}

/**
 * Detects MS Visual C++ Redistributable and prompts for its installation if it's not found
 * Many games require this while not actually specifying it, so it's good to have
 *
 * Only works on Windows of course
 */
function detectVCRedist(mainWindow: BrowserWindow) {
  if (!isWindows) {
    return
  }

  const skip = configStore.get('skipVcRuntime', false)

  if (skip) {
    return
  }

  // According to this article avoid using wmic and Win32_Product
  // https://xkln.net/blog/please-stop-using-win32product-to-find-installed-software-alternatives-inside/
  // wmic is also deprecated
  const detectedVCRInstallations: string[] = []
  let stderr = ''

  // get applications
  const child = spawn('powershell.exe', [
    'Get-ItemProperty',
    'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,',
    'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
    '|',
    'Select-Object',
    'DisplayName',
    '|',
    'Format-Table',
    '-AutoSize'
  ])

  child.stdout.setEncoding('utf-8')
  child.stdout.on('data', (data: string) => {
    const splitData = data.split('\n')
    for (const installation of splitData) {
      if (installation && installation.includes('Microsoft Visual C++ 2022')) {
        detectedVCRInstallations.push(installation)
      }
    }
  })

  child.stderr.setEncoding('utf-8')
  child.stderr.on('data', (data: string) => {
    stderr += data
  })

  child.on('error', (error: Error) => {
    logError(['Check of VCRuntime crashed with:', error], LogPrefix.Backend)
    return
  })

  child.on('close', async (code: number) => {
    if (code) {
      logError(
        `Failed to check for VCRuntime installations\n${stderr}`,
        LogPrefix.Backend
      )
      return
    }
    // VCR installers install both the "Minimal" and "Additional" runtime, and we have 2 installers (x86 and x64) -> 4 installations in total
    if (detectedVCRInstallations.length < 4) {
      const { response } = await dialog.showMessageBox(mainWindow, {
        title: t('box.vcruntime.notfound.title', 'VCRuntime not installed'),
        message: t(
          'box.vcruntime.notfound.message',
          'The Microsoft Visual C++ Runtimes are not installed, which are required by some games'
        ),
        buttons: [
          t('box.downloadNow', 'Download now'),
          t('box.ok', 'Ok'),
          t('box.dontShowAgain', "Don't show again")
        ]
      })

      if (response === 2) {
        return configStore.set('skipVcRuntime', true)
      }

      if (response === 0) {
        openUrlOrFile('https://aka.ms/vs/17/release/vc_redist.x86.exe')
        openUrlOrFile('https://aka.ms/vs/17/release/vc_redist.x64.exe')
        dialog.showMessageBox(mainWindow, {
          message: t(
            'box.vcruntime.install.message',
            'The download links for the Visual C++ Runtimes have been opened. Please install both the x86 and x64 versions.'
          )
        })
      }
    } else {
      logInfo('VCRuntime is installed', LogPrefix.Backend)
    }
  })
}

const getLatestReleases = async (): Promise<Release[]> => {
  // Suppressed: GameLib at 1.0.0 vs Heroic 2.22+ always triggers the update
  // notice and points users at Heroic downloads, not GameLib. Re-enable when
  // the GameLib release pipeline ships and this function is repointed at
  // GameLib's own GitHub releases.
  return []
}

const getCurrentChangelog = async (): Promise<Release | null> => {
  if (process.env.CI === 'e2e') return null

  try {
    const changelogPath = join(publicDir, 'changelog.json')
    const content = readFileSync(changelogPath, 'utf-8')
    return JSON.parse(content) as Release
  } catch (error) {
    logError(
      ['Error reading local GameLib changelog:', error],
      LogPrefix.Backend
    )
    return null
  }
}

// can be removed if legendary and gogdl handle SIGTERM and SIGKILL
// for us
function killPattern(pattern: string) {
  logInfo(['Trying to kill', pattern], LogPrefix.Backend)
  let ret
  if (isWindows) {
    ret = spawnSync('Stop-Process', ['-name', pattern], {
      shell: 'powershell.exe'
    })
  } else {
    ret = spawnSync('pkill', ['-f', pattern])
  }
  logInfo(['Killed', pattern], LogPrefix.Backend)
  return ret
}

async function shutdownWine(gameSettings: GameSettings) {
  if (gameSettings.wineVersion.wineserver) {
    spawnSync(gameSettings.wineVersion.wineserver, ['-k'], {
      env: { WINEPREFIX: gameSettings.winePrefix }
    })
  } else {
    await runWineCommand({
      gameSettings,
      commandParts: ['wineboot', '-k'],
      wait: true,
      protonVerb: 'run'
    })
  }
}

const getShellPath = async (path: string): Promise<string> =>
  normalize((await execAsync(`echo ${path}`)).stdout.trim())

export const spawnAsync = async (
  command: string,
  args: string[],
  options: SpawnOptions = {},
  onOutput?: (data: string) => void
): Promise<{ code: number | null; stdout: string; stderr: string }> => {
  const child = spawn(command, args, options)
  const stdout = memoryLog()
  const stderr = memoryLog()

  if (child.stdout) {
    child.stdout.on('data', (data) => {
      if (onOutput) {
        onOutput(data.toString())
      }
      stdout.push(data.toString())
    })
  }

  if (child.stderr) {
    child.stderr.on('data', (data) => {
      if (onOutput) {
        onOutput(data.toString())
      }
      stderr.push(data.toString())
    })
  }

  return new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code) => {
      resolve({
        code,
        stdout: stdout.join(''),
        stderr: stderr.join('')
      })
    })
  })
}

async function ContinueWithFoundWine(
  selectedWine: string,
  foundWine: string
): Promise<{ response: number }> {
  const { response } = await dialog.showMessageBox({
    title: i18next.t('box.warning.wine-change.title', 'Wine not found!'),
    message: i18next.t('box.warning.wine-change.message', {
      defaultValue:
        'We could not find the selected wine version to launch this title ({{selectedWine}}). {{newline}} We found another one, do you want to continue launching using {{foundWine}} ?',
      newline: '\n',
      selectedWine: selectedWine,
      foundWine: foundWine
    }),
    buttons: [i18next.t('box.yes'), i18next.t('box.no')]
  })

  return { response }
}

export async function downloadDefaultWine() {
  if (isWindows) return null
  // refresh wine list
  await updateWineVersionInfos(true)
  // get list of wines on wineDownloaderInfoStore
  const availableWine = wineDownloaderInfoStore.get('wine-releases', [])
  const isMacOSUpToDate = await isMacSonomaOrHigher()
  const release = availableWine.find((version) => {
    if (isLinux) {
      return version.type === 'Proton-CachyOS'
    } else if (isMac) {
      if (isIntelMac || !isMacOSUpToDate) {
        return version.type === 'Wine-Crossover'
      } else {
        return version.type === 'Game-Porting-Toolkit'
      }
    }
    return false
  })

  if (!release) {
    logError('Could not find default wine version', LogPrefix.Backend)
    return null
  }

  // download the latest version
  const onProgress = (state: WineManagerStatus) => {
    sendFrontendMessage('progressOfWineManager', release.version, state)
  }
  const result = await installWineVersion(release, onProgress)

  if (result === 'success') {
    let downloadedWine = null
    try {
      const wineList = await GlobalConfig.get().getAlternativeWine()
      // update the game config to use that wine
      downloadedWine = wineList[0]
      logInfo(`Changing wine version to ${downloadedWine.name}`)
      GlobalConfig.get().setSetting('wineVersion', downloadedWine)
    } catch (error) {
      logError(
        ['Error when changing wine version to default', error],
        LogPrefix.Backend
      )
    }
    return downloadedWine
  }
  return null
}

export async function checkWineBeforeLaunch(
  gameInfo: GameInfo,
  gameSettings: GameSettings,
  logWriter: LogWriter
): Promise<boolean> {
  const wineIsValid = await validWine(gameSettings.wineVersion)

  if (wineIsValid) {
    return true
  } else {
    const { disableLogs } = GlobalConfig.get().getSettings()
    if (!disableLogs) {
      logError(
        `Wine version ${gameSettings.wineVersion.name} is not valid, trying another one.`,
        LogPrefix.Backend
      )
    }

    if (gameSettings.verboseLogs) {
      logWriter.logWarning([
        'Wine version',
        gameSettings.wineVersion.name,
        'is not valid, trying another one.\n'
      ])
    }

    // check if the default wine is valid now
    const { wineVersion: defaultwine } = GlobalConfig.get().getSettings()
    const defaultWineIsValid = await validWine(defaultwine)
    if (defaultWineIsValid) {
      const { response } = await ContinueWithFoundWine(
        gameSettings.wineVersion.name,
        defaultwine.name
      )

      if (response === 0) {
        logInfo(`Changing wine version to ${defaultwine.name}`)
        if (gameSettings.verboseLogs) {
          logWriter.logInfo([
            'Changing wine version to',
            defaultwine.name,
            '\n'
          ])
        }
        gameSettings.wineVersion = defaultwine
        GameConfig.get(gameInfo.app_name).setSetting('wineVersion', defaultwine)
        return true
      } else {
        logInfo('User canceled the launch', LogPrefix.Backend)
        return false
      }
    } else {
      const wineList = await GlobalConfig.get().getAlternativeWine()
      const firstFoundWine = wineList[0]

      const isValidWine = await validWine(firstFoundWine)

      if (!wineList.length || !firstFoundWine || !isValidWine) {
        const firstFoundWine = await downloadDefaultWine()
        if (firstFoundWine) {
          logInfo(`Changing wine version to ${firstFoundWine.name}`)
          gameSettings.wineVersion = firstFoundWine
          GameConfig.get(gameInfo.app_name).setSetting(
            'wineVersion',
            firstFoundWine
          )
          return true
        }
      }

      if (firstFoundWine && isValidWine) {
        const { response } = await ContinueWithFoundWine(
          gameSettings.wineVersion.name,
          firstFoundWine.name
        )

        if (response === 0) {
          logInfo(`Changing wine version to ${firstFoundWine.name}`)
          gameSettings.wineVersion = firstFoundWine
          GameConfig.get(gameInfo.app_name).setSetting(
            'wineVersion',
            firstFoundWine
          )
          return true
        } else {
          logInfo('User canceled the launch', LogPrefix.Backend)
          return false
        }
      }
    }
  }
  return false
}

export async function moveOnWindows(
  newInstallPath: string,
  gameInfo: GameInfo
): Promise<
  { status: 'done'; installPath: string } | { status: 'error'; error: string }
> {
  const {
    install: { install_path },
    title
  } = gameInfo

  if (!install_path) {
    return { status: 'error', error: 'No install path found' }
  }

  newInstallPath = join(newInstallPath, basename(install_path))

  let currentFile = ''

  // move using robocopy and show progress of the current file being copied
  const { code, stderr } = await spawnAsync(
    'robocopy',
    [install_path, newInstallPath, '/MOVE', '/MIR', '/NJH', '/NJS', '/NDL'],
    { stdio: 'pipe' },
    (data) => {
      let percent = 0
      const percentMatch = data.match(/(\d+)(?:\.\d+)?%/)?.[1]
      if (percentMatch) percent = Number(percentMatch)

      const filenameMatch = data.match(/([\w.:\\]+)$/)?.[1]
      if (filenameMatch) currentFile = filenameMatch

      sendFrontendMessage('progressUpdate', {
        appName: gameInfo.app_name,
        runner: gameInfo.runner,
        status: 'moving',
        progress: {
          percent,
          file: currentFile,
          // FIXME: Robocopy does not report bytes moved / an ETA, so we have to
          //        leave these blank for now
          bytes: '',
          eta: ''
        }
      })
    }
  )
  if (code !== 0) {
    logInfo(`Finished Moving ${title}`, LogPrefix.Backend)
  } else {
    logError(`Error: ${stderr}`, LogPrefix.Backend)
  }
  return { status: 'done', installPath: newInstallPath }
}

export async function moveOnUnix(
  newInstallPath: string,
  gameInfo: GameInfo
): Promise<
  { status: 'done'; installPath: string } | { status: 'error'; error: string }
> {
  const {
    install: { install_path },
    title
  } = gameInfo
  if (!install_path) {
    return { status: 'error', error: 'No install path found' }
  }

  const destination = join(newInstallPath, basename(install_path))

  let currentFile = ''

  let rsyncExists = false
  try {
    await execAsync('which rsync')
    rsyncExists = true
  } catch (error) {
    logError(error, LogPrefix.Gog)
  }
  if (rsyncExists) {
    const origin = install_path + '/'
    logInfo(
      `moving command: rsync --archive --compress --no-human-readable --remove-source-files --info=name,progress ${origin} ${destination} `,
      LogPrefix.Backend
    )
    const { code, stderr } = await spawnAsync(
      'rsync',
      [
        '--archive',
        '--compress',
        '--no-human-readable',
        '--remove-source-files',
        '--info=name,progress',
        origin,
        destination
      ],
      { stdio: 'pipe' },
      (data) => {
        let percent = 0
        let eta = ''
        let bytes = '0'

        // Multiple output lines might be buffered into a single `data`, so
        // we have to iterate over every line (we can't just look at the last
        // one since that might skip new files)
        for (const outLine of data.trim().split('\n')) {
          // Rsync outputs either the file currently being transferred or a
          // progress report. To know which one of those `outLine` is, we check
          // if it includes a %, :, and starts with a space
          // If all of these aren't the case, it's *most likely* a filename
          // FIXME: This is pretty hacky, but I don't see an obvious way to
          //        "divide" the two output types other than that
          const isFilenameOutput =
            !outLine.includes('%') &&
            !outLine.includes(':') &&
            !outLine.startsWith(' ')

          if (isFilenameOutput) {
            // If we have a filename output, set `lastFile` and reset all
            // other metrics. Either there'll be a progress update in the next
            // line of `data`, or we've just started copying and thus start at 0
            currentFile = outLine
            percent = 0
            eta = ''
            bytes = '0'
          } else {
            // If we got the progress update, try to read out the bytes, ETA and
            // percent
            const bytesMatch = outLine.match(/^\s+(\d+)/)?.[1]
            const etaMatch = outLine.match(/(\d+:\d{2}:\d{2})/)?.[1]
            const percentMatch = outLine.match(/(\d+)%/)?.[1]
            if (bytesMatch) bytes = getFileSize(Number(bytesMatch))
            if (etaMatch) eta = etaMatch
            if (percentMatch) percent = Number(percentMatch)
          }
        }

        sendFrontendMessage('progressUpdate', {
          appName: gameInfo.app_name,
          runner: gameInfo.runner,
          status: 'moving',
          progress: {
            percent,
            eta,
            bytes,
            file: currentFile
          }
        })
      }
    )
    if (code !== 1) {
      logInfo(`Finished Moving ${title}`, LogPrefix.Backend)
      // remove the old install path
      await spawnAsync('rm', ['-rf', install_path])
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  } else {
    const { code, stderr } = await spawnAsync('mv', [
      '-f',
      install_path,
      destination
    ])
    if (code !== 1) {
      return { status: 'done', installPath: destination }
    } else {
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  }
  return { status: 'done', installPath: destination }
}

// helper object for an array with a length limit
// this is used when calling system processes to not store the complete output in memory
//
// the `limit` is the number of messages, it doesn't mean it will be exactly `limit` lines since a message can be multi-line
const memoryLog = (limit = 50) => {
  const lines: string[] = []

  return {
    push: (newLine: string) => {
      lines.unshift(newLine)
      if (lines.length > limit) {
        lines.length = limit
      }
    },
    join: (separator = '') => {
      return lines.toReversed().join(separator)
    }
  }
}

function removeFolder(path: string, folderName: string) {
  if (path === 'default') {
    const { defaultInstallPath } = GlobalConfig.get().getSettings()
    const path = defaultInstallPath.replaceAll("'", '')
    const folderToDelete = `${path}/${folderName}`
    if (existsSync(folderToDelete)) {
      return setTimeout(() => {
        rmSync(folderToDelete, { recursive: true })
      }, 5000)
    }
    return
  }

  const folderToDelete = `${path}/${folderName}`.replaceAll("'", '')
  if (existsSync(folderToDelete)) {
    return setTimeout(() => {
      rmSync(folderToDelete, { recursive: true })
    }, 2000)
  }
  return
}

async function getPathDiskSize(path: string): Promise<number> {
  const statData = await lstat(path)
  let size = 0
  if (statData.isSymbolicLink()) {
    return 0
  }
  if (statData.isDirectory()) {
    const contents = await readdir(path)

    for (const item of contents) {
      const itemPath = join(path, item)
      size += await getPathDiskSize(itemPath)
    }
    return size
  }

  return statData.size
}

export async function checkRosettaInstall() {
  if (isIntelMac) {
    return
  }

  // the spawn itself fails when Rosetta is not installed
  const result = await execAsync(
    'arch -x86_64 /usr/sbin/sysctl sysctl.proc_translated'
  )
    .then(() => true)
    .catch(() => false)

  logInfo(
    `Rosetta is ${result ? 'available' : 'not available'} on this system.`,
    LogPrefix.Backend
  )

  if (!result) {
    // show a dialog saying that Heroic wont run without rosetta and add information on how to install it
    await dialog.showMessageBox({
      title: i18next.t('box.warning.rosetta.title', 'Rosetta not found'),
      message: i18next.t(
        'box.warning.rosetta.message',
        'GameLib requires Rosetta to run correctly on macOS with Apple Silicon chips. Please install it from the macOS terminal using the following command: "softwareupdate --install-rosetta" and restart GameLib. '
      ),
      buttons: ['OK'],
      icon: windowIcon
    })

    logInfo(
      'Rosetta is not available, install it with: softwareupdate --install-rosetta from the terminal',
      LogPrefix.Backend
    )
  }
}

export async function isMacSonomaOrHigher() {
  if (!isMac) return false
  logInfo('Checking if macOS is Sonoma or higher', LogPrefix.Backend)

  const release = (await getSystemInfo(true)).OS.version
  const [major] = release.split('.').map(Number)
  const isMacSonomaOrHigher = major >= 14

  logInfo(
    `macOS is ${
      isMacSonomaOrHigher ? 'Sonoma or higher' : 'not Sonoma or higher'
    }`,
    LogPrefix.Backend
  )

  return isMacSonomaOrHigher
}

function sendGameStatusUpdate(payload: GameStatus) {
  sendFrontendMessage('gameStatusUpdate', payload)
  backendEvents.emit('gameStatusUpdate', payload)
}

function sendProgressUpdate(payload: GameStatus) {
  sendFrontendMessage('progressUpdate', payload)
  backendEvents.emit(`progressUpdate-${payload.appName}`, payload)
}

interface ProgressCallback {
  (
    downloadedBytes: number,
    downloadSpeed: number,
    progress: number,
    diskWriteSpeed: number
  ): void
}

interface DownloadArgs {
  url: string
  dest: string
  abortSignal?: AbortSignal
  progressCallback?: ProgressCallback
  ignoreFailure?: boolean
}

/**
 * Downloads a file from a given URL to a specified destination path.
 * @param {string} url - The URL of the file to download.
 * @param {string} dest - The destination path to save the downloaded file.
 * @param {AbortSignal} abortSignal - The AbortSignal instance to cancel the download.
 * @param {ProgressCallback} [progressCallback] - An optional callback function to track the download progress.
 * @param {boolean} ignoreFailure - When "true", failure to download the file is ignore (no log and no thrown error).
 * @returns {Promise<void>} - A Promise that resolves when the download is complete.
 * @throws {Error} - If the download fails or is incomplete.
 */
export async function downloadFile({
  url,
  dest,
  abortSignal,
  progressCallback,
  ignoreFailure
}: DownloadArgs): Promise<void> {
  let lastProgressUpdateTime = Date.now()
  let lastBytesWritten = 0
  let fileSize = 0

  const connections = 5
  try {
    const response = await axiosClient.head(url)
    fileSize = parseInt(String(response.headers['content-length'] ?? '0'), 10)
  } catch (err) {
    if (!ignoreFailure) {
      logError(
        `Downloader: Failed to get headers for ${url}. \nError: ${err}`,
        LogPrefix.DownloadManager
      )
      throw new Error('Failed to get headers')
    } else {
      return
    }
  }

  try {
    const dl = new EasyDl(url, dest, {
      existBehavior: 'overwrite',
      connections
    }).start()

    abortSignal?.addEventListener('abort', () => {
      dl.destroy()
    })

    dl.on('error', (error) => {
      logError(error, LogPrefix.Backend)
    })

    dl.on('retry', (retry) => {
      logInfo(`Retrying download: ${retry}`, LogPrefix.Backend)
    })

    const throttledProgressCallback = throttle(
      (
        bytes: number,
        speed: number,
        percentage: number,
        writingSpeed: number
      ) => {
        if (progressCallback) {
          logInfo(
            `Downloaded: ${bytesToSize(bytes)} / ${bytesToSize(
              fileSize
            )}  @${bytesToSize(speed)}/s (${percentage.toFixed(2)}%)`,
            LogPrefix.Backend
          )
          progressCallback(bytes, speed, percentage, writingSpeed)
        }
      },
      1000
    ) // Throttle progress reporting to 1 second

    dl.on('progress', ({ total }) => {
      const { bytes = 0, speed = 0, percentage = 0 } = total
      const currentTime = Date.now()
      const timeElapsed = currentTime - lastProgressUpdateTime

      if (timeElapsed >= 1000) {
        const bytesWrittenSinceLastUpdate = bytes - lastBytesWritten
        const writingSpeed = bytesWrittenSinceLastUpdate / (timeElapsed / 1000) // Bytes per second

        throttledProgressCallback(bytes, speed, percentage, writingSpeed)

        lastProgressUpdateTime = currentTime
        lastBytesWritten = bytes
      }
    })

    const downloaded = await dl.wait()

    if (!downloaded) {
      logWarning(
        `Downloader: Download stopped or paused`,
        LogPrefix.DownloadManager
      )
      throw new Error('Download stopped or paused')
    }

    logInfo(
      `Downloader: Finished downloading ${url}`,
      LogPrefix.DownloadManager
    )
  } catch (err) {
    if (!ignoreFailure) {
      logError(
        `Downloader: Download Failed with: ${err}`,
        LogPrefix.DownloadManager
      )
      throw new Error(`Download failed with ${err}`)
    } else {
      return
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function throttle<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0
  return (...args: Parameters<T>) => {
    const now = Date.now()
    if (now - lastCall >= limit) {
      lastCall = now
      callback(...args)
    }
  }
}

function bytesToSize(bytes: number) {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
  if (bytes === 0) return `0 ${sizes[0]}`
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`
}

function parseSize(size: string): number {
  const units = ['bytes', 'kb', 'mb', 'gb', 'tb', 'pb']
  let unit_index = 0
  size = size.trim().toLowerCase()
  for (const unit of units) {
    if (size.endsWith(unit)) {
      size = size.slice(0, -unit.length).trim()
      break
    }
    unit_index += 1
  }
  try {
    return Math.round(parseFloat(size) * 1024 ** unit_index)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (error) {
    logWarning(`Invalid size value '${size}'`, LogPrefix.Backend)
    return 0
  }
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds - hours * 3600) / 60)
  const remainingSeconds = seconds - hours * 3600 - minutes * 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
}

function calculateEta(
  downloadedBytes: number,
  downloadSpeed: number,
  downloadSize: number,
  lastProgressTime: number = Date.now()
): string | null {
  // Calculate the remaining seconds
  const remainingBytes = downloadSize - downloadedBytes
  const elapsedSeconds = (Date.now() - lastProgressTime) / 1000
  const remainingSeconds = remainingBytes / downloadSpeed - elapsedSeconds

  // Check if the download has completed or failed
  if (remainingSeconds <= 0) {
    return '00:00:00'
  } else if (!isFinite(remainingSeconds)) {
    return null
  }

  // Format the remaining seconds as "hh:mm:ss"
  const eta = formatTime(Math.floor(remainingSeconds))
  return eta
}

interface ExtractOptions {
  path: string
  destination: string
  strip: number
}

async function extractFiles({ path, destination, strip = 0 }: ExtractOptions) {
  if (path.includes('.tar')) return extractTarFile({ path, destination, strip })

  logError(['extractFiles: Unsupported file', path], LogPrefix.Backend)
  return { status: 'error', error: 'Unsupported file type' }
}

async function extractTarFile({
  path,
  destination,
  strip = 0
}: ExtractOptions) {
  const { code, stderr } = await spawnAsync('tar', [
    '-xf',
    path,
    '-C',
    destination,
    `--strip-components=${strip}`
  ])
  if (code !== 0) {
    logError(`Extracting Error: ${stderr}`, LogPrefix.Backend)
    return { status: 'error', error: stderr }
  }
  return { status: 'done', installPath: destination }
}

const axiosClient = axios.create({
  timeout: 10 * 1000,
  httpsAgent: new https.Agent({ keepAlive: true })
})

export const writeConfig = (appName: string, config: Partial<AppSettings>) => {
  logInfo(
    `Writing config for ${appName === 'default' ? 'GameLib' : appName}`,
    LogPrefix.Backend
  )
  const oldConfig =
    appName === 'default'
      ? GlobalConfig.get().getSettings()
      : GameConfig.get(appName).config

  // log only the changed setting
  const sharedKeys = (
    Object.keys(oldConfig) as (keyof typeof oldConfig)[]
  ).filter((key) => key in config)
  const changedKeys = sharedKeys.filter(
    (key) => JSON.stringify(oldConfig[key]) !== JSON.stringify(config[key])
  )
  for (const key of changedKeys) {
    const oldValue = oldConfig[key]
    const newValue = config[key]
    logInfo(
      ['Changed config:', key, 'from', oldValue, 'to', newValue],
      LogPrefix.Backend
    )
  }

  if (appName === 'default') {
    GlobalConfig.get().set(config as AppSettings)
    GlobalConfig.get().flush()
    const currentConfigStore = configStore.get_nodefault('settings')
    if (currentConfigStore) {
      configStore.set('settings', { ...currentConfigStore, ...config })
    }
  } else {
    GameConfig.get(appName).config = config as GameSettings
    GameConfig.get(appName).flush()
  }
}

export {
  errorHandler,
  execAsync,
  getCurrentChangelog,
  handleExit,
  isEpicServiceOffline,
  openUrlOrFile,
  showAboutWindow,
  showItemInFolder,
  removeSpecialcharacters,
  clearCache,
  clearAchievementCache,
  resetHeroic,
  getLegendaryBin,
  getGOGdlBin,
  getCometBin,
  getNileBin,
  archSpecificBinary,
  MACOS_ONEDIR_RUNNERS,
  formatEpicStoreUrl,
  constructAndUpdateRPC,
  quoteIfNecessary,
  removeQuoteIfNecessary,
  detectVCRedist,
  killPattern,
  shutdownWine,
  getShellPath,
  getLatestReleases,
  getWineFromProton,
  getFileSize,
  memoryLog,
  removeFolder,
  getPathDiskSize,
  sendGameStatusUpdate,
  sendProgressUpdate,
  calculateEta,
  extractFiles,
  axiosClient,
  parseSize,
  getGame
}

// Exported only for testing purpose
// ts-prune-ignore-next
export const testingExportsUtils = {
  semverGt
}
