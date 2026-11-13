import type { AbortRegistry } from 'backend/utils/aborthandler/aborthandler'
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
// Static import, matching `utils/systeminfo/heroicVersion.ts` and
// `sidecar/platform/index.ts`: `process.env.npm_package_version` is UNSET in the packaged
// SEA sidecar binary, so it cannot be the source of the User-Agent version below.
import pkg_json from 'backend/../../package.json'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'graceful-fs'
import i18next, { t } from 'i18next'
import { tOrFallback } from './i18nFallback'

import {
  logError,
  logInfo,
  LogPrefix,
  logWarning,
  logDebug
} from 'backend/logger'
import { basename, dirname, join, normalize, relative } from 'path'
import { homedir, release as osRelease } from 'os'
import {
  assertContainedPath,
  assertPlausibleAbsolutePath
} from './sidecar/rendererPathGuard'
import { resolveTitleForGame } from './utils/gameTitle'
import { checkEpicServiceOffline } from './utils/epicServiceStatus'
import * as fileSize from 'filesize'
import { Client as discordClient } from '@xhayper/discord-rpc'
import { showDialogBoxModalAuto, type DialogBoxDeps } from './dialog/dialog'
import type { SendFrontendMessage } from './host/frontendMessage'
import type { GlobalConfigSlice } from './config'
import type { GameConfigs } from './game_config'
import type { Dialogs } from './host/dialogs'
import type { Notifications } from './host/notifications'
import type { OpenExternal } from './host/openExternal'
import type { AppState } from './host/appState'
import type { AppInfo, AppPaths } from './process/context'
import { validWine } from './launcher'
import {
  installWineVersion,
  updateWineVersionInfos
} from './wine/manager/utils'
import type { CommandRunner, ManagerDeps, Stores } from './services/types'
import { readdir, lstat, rm } from 'fs/promises'
import type { AppRuntimeSlice, StatusUpdateDeps } from './appRuntime'
import EasyDl from 'easydl'

import type { AppSettings, WineManagerStatus } from 'common/types'
import { isUmuSupported, type UmuDeps } from './utils/compatibility_layers'
import { isLinux, isMac, isWindows } from './constants/environment'
import { fixAsarPath } from './process/appPaths'

import type LogWriter from 'backend/logger/log_writer'
import type { OnlineMonitor } from './online_monitor'
import type { Game } from 'common/types/game_manager'
import type { ProcessRunner } from 'backend/process/types'
import { isStore } from 'common/storeCapabilities'
import type { SpawnAsync } from './spawnAsync'
import type { RustInvokeDeps } from './host/rustInvokeDeps'
import { RUST_STEAMFILES_READ_LIBRARY_FOLDERS } from 'common/types/sidecarTransport'
import { invokeSteamFiles } from './storeManagers/steam/localFiles/rustSteamFiles'

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
    const [bHead = '', bBeta] = base.split('-beta.')
    const [tHead = '', tBeta] = target.split('-beta.')

    // same major beta?
    if (bHead === tHead) {
      // A missing beta number never compares greater (undefined comparisons are false)
      if (bBeta === undefined || tBeta === undefined) return false
      return tBeta > bBeta
    } else {
      base = bHead
      target = tHead
    }
  }

  // beta to stable
  if (base.includes('-beta')) {
    base = base.split('-beta.')[0] ?? ''
  }

  // stable to beta
  if (target.includes('-beta')) {
    target = target.split('-beta.')[0] ?? ''
  }

  // Missing parts default to NaN: every comparison below is then false, exactly as
  // the former `undefined` comparisons were
  const [bmajor = NaN, bminor = NaN, bpatch = NaN] = base.split('.').map(Number)
  const [tmajor = NaN, tminor = NaN, tpatch = NaN] = target
    .split('.')
    .map(Number)

  let isGE = false
  // A pretty nice piece of logic if you ask me. :P
  isGE ||= tmajor > bmajor
  isGE ||= tmajor === bmajor && tminor > bminor
  isGE ||= tmajor === bmajor && tminor === bminor && tpatch > bpatch
  return isGE
}

const getFileSize = fileSize.partial({ base: 2 }) as (arg: unknown) => string

async function getWineFromProton(
  deps: UmuDeps,
  gameSettings: GameSettings
): Promise<{ winePrefix: string; wineVersion: WineInstallation }> {
  const wineVersion = gameSettings.wineVersion
  let winePrefix = gameSettings.winePrefix

  if (
    wineVersion.type !== 'proton' ||
    (await isUmuSupported(deps, gameSettings))
  ) {
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
  deps: {
    notifications: Pick<Notifications, 'show'>
    onlineMonitor: Pick<OnlineMonitor, 'isOnline'>
  },
  type: 'Epic Games Store' | 'Fortnite' | 'Rocket League' = 'Epic Games Store'
) {
  if (!deps.onlineMonitor.isOnline()) return true

  const epicStatusApi = 'https://status.epicgames.com/api/v2/components.json'
  const notification = {
    show: () =>
      deps.notifications.show({
        title: `${type} ${t('epic.offline-notification-title', 'offline')}`,
        body: t(
          'epic.offline-notification-body',
          'GameLib will maybe not work probably!'
        )
      })
  }

  return checkEpicServiceOffline(
    {
      fetchComponents: async () =>
        (await axiosClient.get<unknown>(epicStatusApi)).data,
      notify: () => notification.show(),
      onError: (error) =>
        logError(
          ['Failed to get epic service status with', error],
          LogPrefix.Backend
        ),
      onUnreachable: (error) =>
        logWarning(
          [
            'Could not reach the Epic status page (',
            (error as { code?: unknown } | undefined)?.code ?? error,
            '), treating Epic as offline for this launch/install check'
          ],
          LogPrefix.Backend
        )
    },
    type
  )
}

export async function askForceUninstall(
  deps: { dialogs: Pick<Dialogs, 'showMessageBox'> },
  game: Game,
  appName: string
) {
  // Quick task 260905-mv5 (site 1, D-03): getGameInfo() can return
  // `{} as GameInfo` on a double cache miss (D-01) -- resolveTitleForGame
  // falls back to appName so this destructive-confirmation dialog is never
  // nameless.
  const title = resolveTitleForGame(game, appName)
  const { response } = await deps.dialogs.showMessageBox({
    type: 'question',
    title,
    message: i18next.t(
      'box.error.folder-not-found.title',
      'Game folder appears to be deleted, do you want to remove the game from the installed list?'
    ),
    buttons: [tOrFallback('box.no', 'No'), tOrFallback('box.yes', 'Yes')],
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

/** errorHandler reads the manager table only in its deleted-folder branch. */
export type ErrorHandlerDeps = Pick<
  ManagerDeps,
  'libraryManagers' | 'dialogs' | 'appState' | 'sendFrontendMessage'
>

async function errorHandler(
  deps: ErrorHandlerDeps,
  error: string,
  appName: string,
  runner: Runner
): Promise<void> {
  const plat = isStore(runner, 'legendary') ? 'Legendary (Epic Games)' : runner
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
    await askForceUninstall(
      deps,
      deps.libraryManagers[runner].getGame(appName),
      appName
    )
    return
  }

  if (legendaryRegex.test(error)) {
    const MemoryError = 'MemoryError: '
    if (error.includes(MemoryError)) {
      return
    }

    showDialogBoxModalAuto(deps, {
      title: plat,
      message: i18next.t(
        'box.error.legendary.generic',
        'An error has occurred! Try to Logout and Login on your Epic account. {{newline}}  {{error}}',
        { error, newline: '\n' }
      ),
      type: 'ERROR'
    })
    return
  }

  if (error.includes(expiredCredentials)) {
    showDialogBoxModalAuto(deps, {
      title: plat,
      message: i18next.t(
        'box.error.credentials.message',
        'Your Crendentials have expired, Logout and Login Again!'
      ),
      type: 'ERROR'
    })
    return
  }
}

// If you ever modify this range of characters, please also add them to nile
// source as this function is used to determine how game directory will be named
function removeSpecialcharacters(text: string): string {
  const regexp = new RegExp(/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|'|"|®]/, 'gi')
  return text.replaceAll(regexp, '')
}

/** The cache families `clearCache` empties. */
export interface ClearCacheDeps extends DialogBoxDeps {
  stores: Pick<
    Stores,
    'wikiGameInfo' | 'gog' | 'legendary' | 'nile' | 'systemInfo'
  >
}

/**
 * Fires `legendary cleanup` (fire-and-forget, as the old lazy-import call was). Callers that
 * clear the legendary caches call this right after `clearCache`. The abort id keeps its
 * historical spelling: abort ids are matched by string.
 */
export function startLegendaryCleanup(deps: {
  libraryManagers: Pick<ManagerDeps['libraryManagers'], 'legendary'>
}): void {
  void deps.libraryManagers.legendary.runRunnerCommand(
    { subcommand: 'cleanup' },
    { abortId: 'legandary-cleanup' }
  )
}

function clearCache(
  deps: ClearCacheDeps,
  library?: 'gog' | 'legendary' | 'nile',
  fromVersionChange = false
) {
  const { wikiGameInfo, gog, legendary, nile, systemInfo } = deps.stores
  wikiGameInfo.wikiGameInfoStore.clear()
  if (isStore(library, 'gog') || !library) {
    gog.apiInfoCache.clear()
    gog.libraryStore.clear()
    gog.installInfoStore.clear()
    gog.achievementStore.clear()
  }
  if (isStore(library, 'legendary') || !library) {
    legendary.installStore.clear()
    legendary.libraryStore.clear()
    legendary.gameInfoStore.clear()
  }
  if (isStore(library, 'nile') || !library) {
    nile.installStore.clear()
    nile.libraryStore.clear()
  }

  if (!fromVersionChange) {
    systemInfo.deviceNameCache.clear()
    systemInfo.vendorNameCache.clear()
  }
}

function clearAchievementCache(
  deps: { stores: Pick<Stores, 'gog'> },
  appName: string
) {
  deps.stores.gog.achievementStore.delete(appName)
}

function resetHeroic(deps: {
  appState: Pick<AppState, 'relaunch' | 'quit'>
  paths: Pick<AppPaths, 'gamesConfigPath' | 'configPath'>
}) {
  const appFolders = [deps.paths.gamesConfigPath, deps.paths.configPath]
  appFolders.forEach((folder) => {
    rmSync(folder, { recursive: true, force: true })
  })
  // wait a sec to avoid racing conditions
  setTimeout(() => {
    deps.appState.relaunch()
    deps.appState.quit()
  }, 1000)
}

function showItemInFolder(
  deps: { openExternal: Pick<OpenExternal, 'showItemInFolder'> },
  item: string
) {
  if (existsSync(item)) {
    try {
      deps.openExternal.showItemInFolder(item)
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

function archSpecificBinary(
  binaryName: string,
  paths: Pick<AppPaths, 'publicDir'>
) {
  const { publicDir } = paths
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
  const segments = isMacOnedirRunner ? [binaryName, binaryName] : [binaryName]

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

function getLegendaryBin(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<AppPaths, 'publicDir'>
}): { dir: string; bin: string } {
  const settings = deps.config.getSettings()
  if (settings?.altLegendaryBin) {
    return splitPathAndName(settings.altLegendaryBin)
  }

  return splitPathAndName(
    fixAsarPath(archSpecificBinary('legendary', deps.paths))
  )
}

function getGOGdlBin(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<AppPaths, 'publicDir'>
}): { dir: string; bin: string } {
  const settings = deps.config.getSettings()
  if (settings?.altGogdlBin) {
    return splitPathAndName(settings.altGogdlBin)
  }

  return splitPathAndName(fixAsarPath(archSpecificBinary('gogdl', deps.paths)))
}

function getCometBin(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<AppPaths, 'publicDir'>
}): { dir: string; bin: string } {
  const settings = deps.config.getSettings()
  if (settings?.altCometBin) {
    return splitPathAndName(settings.altCometBin)
  }

  return splitPathAndName(fixAsarPath(archSpecificBinary('comet', deps.paths)))
}

function getNileBin(deps: {
  config: Pick<GlobalConfigSlice, 'getSettings'>
  paths: Pick<AppPaths, 'publicDir'>
}): {
  dir: string
  bin: string
} {
  const settings = deps.config.getSettings()
  if (settings?.altNileBin) {
    return splitPathAndName(settings.altNileBin)
  }

  return splitPathAndName(fixAsarPath(archSpecificBinary('nile', deps.paths)))
}

export function createNecessaryFolders(deps: {
  paths: Pick<AppPaths, 'gamesConfigPath' | 'heroicIconFolder' | 'toolsPath'>
}) {
  const { gamesConfigPath, heroicIconFolder, toolsPath } = deps.paths
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

/** The one setting the Steam library lookups read: where Steam is installed. */
export type SteamLibrariesDeps = {
  config: Pick<GlobalConfigSlice, 'getSettings'>
} & RustInvokeDeps

/**
 * The Steam library roots. A missing or malformed libraryfolders.vdf yields
 * the system path only. A rejected rustInvoke (timeout, shell restart) also
 * yields the system path only, unless `opts.strict`: then it propagates, so an
 * install-state reader cannot mistake "could not read the library list" for
 * "nothing is installed in the other libraries" (WR-01, 75 review).
 */
export async function getSteamLibraries(
  deps: SteamLibrariesDeps,
  opts: { strict?: boolean } = {}
): Promise<string[]> {
  const { defaultSteamPath } = deps.config.getSettings()
  const path = defaultSteamPath.replaceAll("'", '')
  const vdfFile = join(path, 'steamapps', 'libraryfolders.vdf')
  const libraries = ['/usr/share/steam']

  let result
  try {
    result = await invokeSteamFiles(
      deps,
      RUST_STEAMFILES_READ_LIBRARY_FOLDERS,
      {
        path: vdfFile
      }
    )
  } catch (error) {
    if (opts.strict) throw error
    return libraries
  }
  if (!result.exists) {
    logDebug(
      'Unable to load Steam Libraries, libraryfolders.vdf not found',
      LogPrefix.Backend
    )
    return libraries
  }
  if (!result.parsed) return libraries
  return [...libraries, ...result.paths].filter((path) => existsSync(path))
}

function constructAndUpdateRPC(
  deps: { appInfo: Pick<AppInfo, 'version'> },
  gameInfo: GameInfo
): RpcClient {
  const client = new discordClient({
    clientId: '852942976564723722'
  })

  const versionText = `GameLib ${deps.appInfo.version}`

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

// Quick task 260922-v2e (D3/D4): the probe is referenced work -- its process
// handle and its stdout/stderr pipes each hold the sidecar's event loop open
// (CLAUDE.md "The sidecar's exit contract", half 2, in-flight work).
// `unref()` is the wrong tool here (it would have to cover the child AND all
// three stdio pipes, and would silently drop the result on a quick quit), so
// the probe is bounded instead: `runner.run(..., { timeoutMs, windowsHide })` kills
// the child at this bound, the pipes close, and the loop drains normally.
// Value: must be >= 3x the worst measured probe wall time on the operator's
// Windows 11 box (cold + warm) and <= 30_000 (D4) -- see quick 260922-v2e's
// SUMMARY.md for the Task 3 measurement this value is derived from.
const VC_REDIST_PROBE_TIMEOUT_MS = 15_000

/**
 * Detects MS Visual C++ Redistributable and prompts for its installation if it's not found
 * Many games require this while not actually specifying it, so it's good to have
 *
 * Only works on Windows of course
 *
 * Quick task 260922-v2e: called exactly once per sidecar process, from
 * `appShellFlowRegistration.ts`'s `frontendReady` handler (inside its
 * one-shot boot-work block) -- NOT from `bootstrap.ts`'s `init()` -- because
 * the in-app dialog path (`showDialogBoxModalAuto` ->
 * `sendFrontendMessage('showDialog')`) is one-way and is silently dropped if
 * no renderer listener is mounted yet; `frontendReady` is the earliest point
 * a renderer is guaranteed to exist. The powershell probe below is bounded
 * (see `VC_REDIST_PROBE_TIMEOUT_MS` above) so a hung/slow child cannot keep
 * the sidecar process alive past the exit contract's in-flight-work bound.
 */
async function detectVCRedist(
  deps: {
    stores: Pick<Stores, 'kvs'>
    runner: Pick<ProcessRunner, 'run'>
  } & DialogBoxDeps
): Promise<void> {
  if (!isWindows) {
    return
  }

  const skip = deps.stores.kvs.configStore.get('skipVcRuntime', false)

  if (skip) {
    logInfo('VCRuntime check skipped (skipVcRuntime is set)', LogPrefix.Backend)
    return
  }

  // According to this article avoid using wmic and Win32_Product
  // https://xkln.net/blog/please-stop-using-win32product-to-find-installed-software-alternatives-inside/
  // wmic is also deprecated
  const probeStartedAt = Date.now()

  // get applications
  //
  // D6 (260922-v2e): `-NoProfile -NonInteractive` prepended so a user's
  // powershell profile script cannot add seconds to every probe or hang a
  // prompt until the timeout below fires. The Get-ItemProperty /
  // Select-Object / Format-Table tail stays byte-identical.
  let result
  try {
    result = await deps.runner.run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        'Get-ItemProperty',
        'HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,',
        'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*',
        '|',
        'Select-Object',
        'DisplayName',
        '|',
        'Format-Table',
        '-AutoSize'
      ],
      // D3: bounded so a hung/slow probe cannot keep the sidecar's event loop
      // open past this timeout; windowsHide keeps no console flash on launch.
      { timeoutMs: VC_REDIST_PROBE_TIMEOUT_MS, windowsHide: true }
    )
  } catch (error) {
    logError(['Check of VCRuntime crashed with:', error], LogPrefix.Backend)
    return
  }

  const { code, stderr, stdout, timedOut } = result
  const detectedVCRInstallations = stdout
    .split('\n')
    .filter(
      (installation) =>
        installation && installation.includes('Microsoft Visual C++ 2022')
    )

  // D5 (260922-v2e): timeout-safe. A timeout kill reports `timedOut` with
  // `code === null`; `null` is falsy, so a bare `if (code)` guard would fall
  // through to "fewer than 4 lines -> show the dialog" -- a false nag caused
  // purely by the bound above. The timedOut branch returns first and never
  // shows a dialog; any other non-zero code keeps the pre-existing
  // logError behaviour, also without a dialog.
  if (timedOut) {
    logWarning(
      `VCRuntime check killed after exceeding VC_REDIST_PROBE_TIMEOUT_MS (${VC_REDIST_PROBE_TIMEOUT_MS}ms)`,
      LogPrefix.Backend
    )
    return
  }
  if (code) {
    // log-secret-gate-exempt: stderr of the powershell Get-ItemProperty VCRuntime probe
    logError(
      `Failed to check for VCRuntime installations\n${stderr}`,
      LogPrefix.Backend
    )
    return
  }
  // VCR installers install both the "Minimal" and "Additional" runtime, and we have 2 installers (x86 and x64) -> 4 installations in total
  if (detectedVCRInstallations.length < 4) {
    // 260919-sch: moved off the native 3-button dialog.showMessageBox onto
    // showDialogBoxModalAuto because the Rust dialog command's `buttons`
    // array only maps to a native dialog when its length is exactly 2 --
    // it cannot express a third "don't show again" button. Do not restore
    // this natively; see dialog.ts's policy docstring.
    showDialogBoxModalAuto(deps, {
      type: 'MESSAGE',
      title: t('box.vcruntime.notfound.title', 'VCRuntime not installed'),
      message: t(
        'box.vcruntime.notfound.message',
        'The Microsoft Visual C++ Runtimes are not installed, which are required by some games'
      ),
      buttons: [
        {
          text: t('box.downloadNow', 'Download now'),
          action: 'vcRuntimeDownload'
        },
        { text: t('box.ok', 'OK') },
        {
          text: t('box.dontShowAgain', "Don't show again"),
          action: 'vcRuntimeSkip'
        }
      ]
    })
  } else {
    // D7 (260922-v2e): count + elapsed only -- no DisplayNames, no stderr.
    const elapsedMs = Date.now() - probeStartedAt
    logInfo(
      `VCRuntime is installed (${detectedVCRInstallations.length} matching entries, probe ${elapsedMs} ms)`,
      LogPrefix.Backend
    )
  }
}

const getLatestReleases = async (): Promise<Release[]> => {
  // Suppressed: GameLib at 1.0.0 vs Heroic 2.22+ always triggers the update
  // notice and points users at Heroic downloads, not GameLib. Re-enable when
  // the GameLib release pipeline ships and this function is repointed at
  // GameLib's own GitHub releases.
  return []
}

const getCurrentChangelog = async (deps: {
  paths: Pick<AppPaths, 'publicDir'>
}): Promise<Release | null> => {
  if (process.env.CI === 'e2e') return null

  try {
    const changelogPath = join(deps.paths.publicDir, 'changelog.json')
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

// Bounded like killCrossoverWineserverWith: a wedged wineserver must not hold a game stop.
const WINESERVER_KILL_TIMEOUT_MS = 15_000

async function shutdownWine(
  deps: {
    commandRunner: Pick<CommandRunner, 'runWineCommand'>
    spawnAsync: SpawnAsync
  },
  gameSettings: GameSettings
) {
  if (gameSettings.wineVersion.wineserver) {
    const result = await deps.spawnAsync(
      gameSettings.wineVersion.wineserver,
      ['-k'],
      {
        env: { WINEPREFIX: gameSettings.winePrefix },
        timeout: WINESERVER_KILL_TIMEOUT_MS
      }
    )
    if (result.timedOut) {
      logWarning(
        `wineserver -k did not finish within ${WINESERVER_KILL_TIMEOUT_MS}ms`,
        LogPrefix.Backend
      )
    }
  } else {
    await deps.commandRunner.runWineCommand({
      gameSettings,
      commandParts: ['wineboot', '-k'],
      wait: true,
      protonVerb: 'run'
    })
  }
}

/**
 * Expands the variables `echo` used to expand, without a shell: on Windows
 * `%VAR%` (unknown names stay literal, as cmd left them), elsewhere `$VAR`,
 * `${VAR}` (unset expands to '', as sh did) and a leading `~` / `~/`.
 * Nothing else is interpreted, so `$(...)`, backticks, `;`, `&` and `|` stay
 * literal — the input can be a GOG remote-config save location or come from
 * the renderer via the `getShellPath` invoke channel.
 */
function expandPathVariables(
  path: string,
  windows: boolean,
  env: NodeJS.ProcessEnv,
  home: string
): string {
  if (windows) {
    const lookup = (name: string) => {
      const key = Object.keys(env).find(
        (k) => k.toUpperCase() === name.toUpperCase()
      )
      return key === undefined ? undefined : env[key]
    }
    return path.replace(
      /%([^%]+)%/g,
      (match, name: string) => lookup(name) ?? match
    )
  }
  const expanded = path.replace(
    /\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g,
    (_match, braced?: string, bare?: string) => env[braced ?? bare ?? ''] ?? ''
  )
  return expanded.replace(/^~(?=\/|$)/, home)
}

// Still returns a Promise: the `getShellPath` invoke channel and save_sync.ts
// await it, and its old shell-backed body was async.
const getShellPath = (path: string): Promise<string> =>
  Promise.resolve(
    normalize(
      expandPathVariables(path, isWindows, process.env, homedir()).trim()
    )
  )

async function ContinueWithFoundWine(
  deps: { dialogs: Pick<Dialogs, 'showMessageBox'> },
  selectedWine: string,
  foundWine: string
): Promise<{ response: number }> {
  const { response } = await deps.dialogs.showMessageBox({
    title: i18next.t('box.warning.wine-change.title', 'Wine not found!'),
    message: i18next.t('box.warning.wine-change.message', {
      defaultValue:
        'We could not find the selected wine version to launch this title ({{selectedWine}}). {{newline}} We found another one, do you want to continue launching using {{foundWine}} ?',
      newline: '\n',
      selectedWine: selectedWine,
      foundWine: foundWine
    }),
    buttons: [tOrFallback('box.yes', 'Yes'), tOrFallback('box.no', 'No')]
  })

  return { response }
}

export async function downloadDefaultWine(
  deps: AppRuntimeSlice<'events'> & {
    aborts: Pick<AbortRegistry, 'create' | 'delete'>
    stores: Pick<Stores, 'kvs' | 'wineManager'>
    runner: Pick<ProcessRunner, 'run'>
    paths: Pick<AppPaths, 'toolsPath' | 'userHome' | 'configPath'>
    config: Pick<
      GlobalConfigSlice,
      'getSettings' | 'getAlternativeWine' | 'setSetting'
    >
    sendFrontendMessage: SendFrontendMessage
  }
) {
  if (isWindows) return null
  // refresh wine list
  await updateWineVersionInfos(deps, true)
  // get list of wines on wineDownloaderInfoStore
  const availableWine = deps.stores.wineManager.wineDownloaderInfoStore.get(
    'wine-releases',
    []
  )
  const isMacOSUpToDate = isMacSonomaOrHigher()
  const release = availableWine.find((version) => {
    if (isLinux) {
      return version.type === 'Proton-CachyOS'
    } else if (isMac) {
      if (!isMacOSUpToDate) {
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
    deps.sendFrontendMessage('progressOfWineManager', release.version, state)
  }
  const result = await installWineVersion(deps, release, onProgress)

  if (result === 'success') {
    let downloadedWine = null
    try {
      const wineList = await deps.config.getAlternativeWine({
        wineDownloaderInfoStore:
          deps.stores.wineManager.wineDownloaderInfoStore,
        runner: deps.runner,
        paths: deps.paths,
        sendFrontendMessage: deps.sendFrontendMessage
      })
      // update the game config to use that wine
      const firstWine = wineList[0]
      if (firstWine === undefined) {
        throw new Error('No alternative wine version found after installing')
      }
      downloadedWine = firstWine
      logInfo(`Changing wine version to ${downloadedWine.name}`)
      deps.config.setSetting('wineVersion', downloadedWine, deps.stores.kvs)
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
  deps: AppRuntimeSlice<'events'> & {
    aborts: Pick<AbortRegistry, 'create' | 'delete'>
    stores: Pick<Stores, 'kvs' | 'wineManager'>
    runner: Pick<ProcessRunner, 'run'>
    paths: Pick<AppPaths, 'toolsPath' | 'userHome' | 'configPath'>
    config: Pick<
      GlobalConfigSlice,
      'getSettings' | 'getAlternativeWine' | 'setSetting'
    >
    gameConfigs: Pick<GameConfigs, 'get'>
    dialogs: Pick<Dialogs, 'showMessageBox'>
    sendFrontendMessage: SendFrontendMessage
  },
  gameInfo: GameInfo,
  gameSettings: GameSettings,
  logWriter: LogWriter
): Promise<boolean> {
  const wineIsValid = await validWine(gameSettings.wineVersion)

  if (wineIsValid) {
    return true
  } else {
    const { disableLogs } = deps.config.getSettings()
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
    const { wineVersion: defaultwine } = deps.config.getSettings()
    const defaultWineIsValid = await validWine(defaultwine)
    if (defaultWineIsValid) {
      const { response } = await ContinueWithFoundWine(
        deps,
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
        deps.gameConfigs
          .get(gameInfo.app_name)
          .setSetting('wineVersion', defaultwine)
        return true
      } else {
        logInfo('User canceled the launch', LogPrefix.Backend)
        return false
      }
    } else {
      const wineList = await deps.config.getAlternativeWine({
        wineDownloaderInfoStore:
          deps.stores.wineManager.wineDownloaderInfoStore,
        runner: deps.runner,
        paths: deps.paths,
        sendFrontendMessage: deps.sendFrontendMessage
      })
      const firstFoundWine = wineList[0]

      const isValidWine =
        firstFoundWine !== undefined && (await validWine(firstFoundWine))

      if (!wineList.length || !firstFoundWine || !isValidWine) {
        const firstFoundWine = await downloadDefaultWine(deps)
        if (firstFoundWine) {
          logInfo(`Changing wine version to ${firstFoundWine.name}`)
          gameSettings.wineVersion = firstFoundWine
          deps.gameConfigs
            .get(gameInfo.app_name)
            .setSetting('wineVersion', firstFoundWine)
          return true
        }
      }

      if (firstFoundWine && isValidWine) {
        const { response } = await ContinueWithFoundWine(
          deps,
          gameSettings.wineVersion.name,
          firstFoundWine.name
        )

        if (response === 0) {
          logInfo(`Changing wine version to ${firstFoundWine.name}`)
          gameSettings.wineVersion = firstFoundWine
          deps.gameConfigs
            .get(gameInfo.app_name)
            .setSetting('wineVersion', firstFoundWine)
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

const RSYNC_PROBE_TIMEOUT_MS = 5_000
const ROSETTA_PROBE_TIMEOUT_MS = 10_000

export async function moveOnWindows(
  deps: {
    spawnAsync: SpawnAsync
    runner: Pick<ProcessRunner, 'run'>
    sendFrontendMessage: SendFrontendMessage
  },
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
  const { code, stderr } = await deps.spawnAsync(
    'robocopy',
    [install_path, newInstallPath, '/MOVE', '/MIR', '/NJH', '/NJS', '/NDL'],
    {},
    (data) => {
      let percent = 0
      const percentMatch = data.match(/(\d+)(?:\.\d+)?%/)?.[1]
      if (percentMatch) percent = Number(percentMatch)

      const filenameMatch = data.match(/([\w.:\\]+)$/)?.[1]
      if (filenameMatch) currentFile = filenameMatch

      deps.sendFrontendMessage('progressUpdate', {
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
    // log-secret-gate-exempt: stderr of robocopy (install move), not an auth command
    logError(`Error: ${stderr}`, LogPrefix.Backend)
  }
  return { status: 'done', installPath: newInstallPath }
}

export async function moveOnUnix(
  deps: {
    spawnAsync: SpawnAsync
    runner: Pick<ProcessRunner, 'run'>
    sendFrontendMessage: SendFrontendMessage
  },
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

  // D-35-19-07: `which rsync` answers the wrong question. macOS 15+ (Sequoia)
  // ships Apple's `openrsync` as /usr/bin/rsync, so the existence probe SUCCEEDS
  // and the `mv` fallback below never engages -- while openrsync rejects two of
  // the flags GNU rsync takes, aborting the move outright. What matters is the
  // IMPLEMENTATION, so probe `rsync --version` (which also proves existence).
  let rsyncFlavour: 'gnu' | 'openrsync' | null = null
  try {
    const probe = await deps.runner.run('rsync', ['--version'], {
      timeoutMs: RSYNC_PROBE_TIMEOUT_MS
    })
    if (probe.timedOut || probe.code !== 0) {
      throw new Error(
        `rsync --version ${
          probe.timedOut ? 'timed out' : `exited with code ${probe.code}`
        }`
      )
    }
    rsyncFlavour = /openrsync/i.test(probe.stdout) ? 'openrsync' : 'gnu'
  } catch (error) {
    logError(error, LogPrefix.Gog)
  }
  if (rsyncFlavour) {
    const origin = install_path + '/'
    // `--no-human-readable` is load-bearing on GNU, not decoration: without it
    // GNU groups digits (`12,582,912`) and the `/^\s+(\d+)/` byte parse in the
    // progress callback below reads "12". openrsync implements neither that flag
    // nor `--info=`, but already prints plain digits, and its `--progress` output
    // is byte-compatible with that same parser (verified against a real
    // transfer), which is why the callback is untouched by this fix.
    //
    // The GNU list is kept byte-identical to what shipped before, so the path
    // that already worked cannot regress.
    const rsyncArgs =
      rsyncFlavour === 'openrsync'
        ? ['--archive', '--compress', '--remove-source-files', '--progress']
        : [
            '--archive',
            '--compress',
            '--no-human-readable',
            '--remove-source-files',
            '--info=name,progress'
          ]
    logInfo(
      `moving command (${rsyncFlavour}): rsync ${rsyncArgs.join(
        ' '
      )} ${origin} ${destination} `,
      LogPrefix.Backend
    )
    const { code, stderr } = await deps.spawnAsync(
      'rsync',
      [...rsyncArgs, origin, destination],
      {},
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

        deps.sendFrontendMessage('progressUpdate', {
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
    // D-35-19-08: this branch `rm -rf`s the SOURCE install, so it must only be
    // reached on unambiguous success. The previous test was `code !== 1`, which
    // read rsync's 2, 10, 11, 12, 23 (PARTIAL TRANSFER), 24 and 30 as success --
    // a partial transfer would leave an incomplete copy at the destination and
    // then delete the original. `spawnAsync` types `code` as `number | null`,
    // and a null (killed by signal) must not delete either; `=== 0` covers both.
    if (code === 0) {
      logInfo(`Finished Moving ${title}`, LogPrefix.Backend)
      // remove the old install path
      await deps.spawnAsync('rm', ['-rf', install_path])
    } else {
      // log-secret-gate-exempt: stderr of rsync (install move), not an auth command
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  } else {
    const { code, stderr } = await deps.spawnAsync('mv', [
      '-f',
      install_path,
      destination
    ])
    // D-35-19-08: same inverted test as above. `mv` reports any failure as a
    // non-zero exit, not specifically 1.
    if (code === 0) {
      return { status: 'done', installPath: destination }
    } else {
      // log-secret-gate-exempt: stderr of mv -f (install move), not an auth command
      logError(`Error: ${stderr}`, LogPrefix.Backend)
      return { status: 'error', error: stderr }
    }
  }
  return { status: 'done', installPath: destination }
}

/**
 * Resolves `${root}/${folderName}` for a recursive delete, or returns
 * undefined when `folderName` is empty, `.`, or escapes `root` (`..`, an
 * absolute path) — either would make the delete hit `root` itself or
 * something outside it. Both values can arrive from the renderer through
 * the internal `removeFolder` helper.
 */
function resolveFolderToRemove(
  root: string,
  folderName: string
): string | undefined {
  if (!root || !folderName) return undefined
  try {
    const folderToDelete = assertContainedPath(root, folderName, 'removeFolder')
    return relative(root, folderToDelete) ? folderToDelete : undefined
  } catch {
    return undefined
  }
}

/**
 * Recursively deletes `${path}/${folderName}` (or the default install path
 * when `path` is `'default'`). Internal helper — no renderer channel reaches
 * it (Phase 72 D-09). `rm`'s own retries absorb an aborted runner still
 * releasing files, so there is deliberately no timer here (sidecar exit
 * contract: nothing may hold the event loop open at stdin EOF).
 */
async function removeFolder(
  deps: { config: Pick<GlobalConfigSlice, 'getSettings'> },
  path: string,
  folderName: string
): Promise<void> {
  let root: string
  let name: string
  if (path === 'default') {
    const { defaultInstallPath } = deps.config.getSettings()
    root = defaultInstallPath.replaceAll("'", '')
    name = folderName
  } else {
    assertPlausibleAbsolutePath(path, 'removeFolder')
    root = path.replaceAll("'", '')
    name = folderName.replaceAll("'", '')
  }
  const folderToDelete = resolveFolderToRemove(root, name)
  if (!folderToDelete) {
    logWarning(
      [`removeFolder: refusing folder name "${folderName}"`],
      LogPrefix.Backend
    )
    return
  }
  await rm(folderToDelete, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 200
  })
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

export async function checkRosettaInstall(deps: {
  runner: Pick<ProcessRunner, 'run'>
  paths: Pick<AppPaths, 'windowIcon'>
  dialogs: Pick<Dialogs, 'showMessageBox'>
}) {
  // the spawn itself fails when Rosetta is not installed
  const result = await deps.runner
    .run('arch', ['-x86_64', '/usr/sbin/sysctl', 'sysctl.proc_translated'], {
      timeoutMs: ROSETTA_PROBE_TIMEOUT_MS
    })
    .then((r) => !r.timedOut && r.code === 0)
    .catch(() => false)

  logInfo(
    `Rosetta is ${result ? 'available' : 'not available'} on this system.`,
    LogPrefix.Backend
  )

  if (!result) {
    // show a dialog saying that Heroic wont run without rosetta and add information on how to install it
    await deps.dialogs.showMessageBox({
      title: i18next.t('box.warning.rosetta.title', 'Rosetta not found'),
      message: i18next.t(
        'box.warning.rosetta.message',
        'GameLib requires Rosetta to run correctly on macOS with Apple Silicon chips. Please install it from the macOS terminal using the following command: "softwareupdate --install-rosetta" and restart GameLib. '
      ),
      buttons: ['OK'],
      icon: deps.paths.windowIcon
    })

    logInfo(
      'Rosetta is not available, install it with: softwareupdate --install-rosetta from the terminal',
      LogPrefix.Backend
    )
  }
}

export function isMacSonomaOrHigher(): boolean {
  if (!isMac) return false
  logInfo('Checking if macOS is Sonoma or higher', LogPrefix.Backend)

  const release = osRelease()
  const [major] = release.split('.').map(Number)
  const isMacSonomaOrHigher = major !== undefined && major >= 14

  logInfo(
    `macOS is ${
      isMacSonomaOrHigher ? 'Sonoma or higher' : 'not Sonoma or higher'
    }`,
    LogPrefix.Backend
  )

  return isMacSonomaOrHigher
}

function sendGameStatusUpdate(deps: StatusUpdateDeps, payload: GameStatus) {
  deps.sendFrontendMessage('gameStatusUpdate', payload)
  deps.appRuntime.events.emit('gameStatusUpdate', payload)
}

function sendProgressUpdate(deps: StatusUpdateDeps, payload: GameStatus) {
  deps.sendFrontendMessage('progressUpdate', payload)
  deps.appRuntime.events.emit(`progressUpdate-${payload.appName}`, payload)
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

async function extractFiles(
  deps: { runner: Pick<ProcessRunner, 'run'> },
  { path, destination, strip = 0 }: ExtractOptions
) {
  if (path.includes('.tar'))
    return extractTarFile(deps, { path, destination, strip })

  logError(['extractFiles: Unsupported file', path], LogPrefix.Backend)
  return { status: 'error', error: 'Unsupported file type' }
}

async function extractTarFile(
  deps: { runner: Pick<ProcessRunner, 'run'> },
  { path, destination, strip = 0 }: ExtractOptions
) {
  const { code, stderr } = await deps.runner.run(
    'tar',
    ['-xf', path, '-C', destination, `--strip-components=${strip}`],
    {
      timeout: {
        none: true,
        reason:
          'tar extraction of multi-GB tool and runtime archives runs as long as the disk takes; callers own cancellation'
      }
    }
  )
  if (code !== 0) {
    // log-secret-gate-exempt: stderr of tar -xf (archive extraction), not an auth command
    logError(`Extracting Error: ${stderr}`, LogPrefix.Backend)
    return { status: 'error', error: stderr }
  }
  return { status: 'done', installPath: destination }
}

/**
 * Shared outbound HTTP client.
 *
 * The `User-Agent` is REQUIRED, not cosmetic. Axios' default agent string
 * (`axios/<version>`) is rejected outright by at least one upstream we depend on:
 * PCGamingWiki answers `403` to `axios/*` and to an empty agent, while accepting any
 * descriptive one. That 403 emptied `pcgamingwiki` for every game, and because
 * `getHowLongToBeat` takes its ID from the PCGamingWiki result
 * (`wiki_game_info/wiki_game_info.ts`), it emptied `howlongtobeat` with it -- which is
 * `hasWikiInfo`'s entire basis on macOS/Windows, so the game page's "Extra info" tab
 * (Metacritic / OpenCritic / HowLongToBeat) never rendered at all. Verified live
 * 2026-08-22 against axios 1.13.5 with this exact client config: default agent -> 403,
 * descriptive agent -> 200.
 *
 * MediaWiki sites ask for an agent naming the tool and a contact URL, which is the shape
 * used here. The contact is the FORK's repository, deliberately: `package.json`'s
 * `repository.url` still points at upstream Heroic, and pointing a third party at Heroic
 * for GameLib's traffic would misattribute it.
 *
 * Do not remove this header, and do not replace it with a browser agent string --
 * impersonating a browser is what the policy exists to discourage, and a descriptive
 * agent already works.
 */
const GAMELIB_USER_AGENT = `GameLib/${pkg_json.version} (+https://github.com/grayson-mitchell/GameLib)`

const axiosClient = axios.create({
  timeout: 10 * 1000,
  httpsAgent: new https.Agent({ keepAlive: true }),
  headers: { 'User-Agent': GAMELIB_USER_AGENT }
})

export const writeConfig = (
  deps: {
    stores: Pick<Stores, 'kvs'>
    config: Pick<GlobalConfigSlice, 'getSettings' | 'set' | 'flush'>
    gameConfigs: Pick<GameConfigs, 'get'>
  },
  appName: string,
  config: Partial<AppSettings>
) => {
  logInfo(
    `Writing config for ${appName === 'default' ? 'GameLib' : appName}`,
    LogPrefix.Backend
  )
  const oldConfig =
    appName === 'default'
      ? deps.config.getSettings()
      : deps.gameConfigs.get(appName).config

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
    deps.config.set(config as AppSettings)
    deps.config.flush()
    const { configStore } = deps.stores.kvs
    const currentConfigStore = configStore.get_nodefault('settings')
    if (currentConfigStore) {
      configStore.set('settings', { ...currentConfigStore, ...config })
    }
  } else {
    const gameConfig = deps.gameConfigs.get(appName)
    gameConfig.config = config as GameSettings
    gameConfig.flush()
  }
}

export {
  errorHandler,
  getCurrentChangelog,
  isEpicServiceOffline,
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
  VC_REDIST_PROBE_TIMEOUT_MS,
  shutdownWine,
  getShellPath,
  getLatestReleases,
  getWineFromProton,
  getFileSize,
  removeFolder,
  getPathDiskSize,
  sendGameStatusUpdate,
  sendProgressUpdate,
  calculateEta,
  extractFiles,
  axiosClient,
  parseSize
}

// Exported only for testing purpose
export const testingExportsUtils = {
  semverGt,
  expandPathVariables
}
