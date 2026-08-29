// Phase 27 Plan 05 (blank-screen fix): a REAL dependency edge on the Tauri attach module,
// not merely an ordering convention in the renderer entry. This file reads `window.api.*`
// at module scope (below), so `window.api` must already exist when this module evaluates.
//
// index.tsx declaring `import '../preload/tauriAttach'` as its first import is NOT enough
// once the bundle is chunked: Rollup inlined tauriAttach into the ENTRY chunk while this
// file landed in a SHARED chunk that the entry chunk imports — and ES modules evaluate an
// imported chunk in full before any of the importing chunk's own module bodies. The attach
// therefore ran AFTER this file, `window.api` was undefined, and the module-scope read
// below threw inside the module graph, leaving a silent blank Tauri window.
//
// An explicit import is the only ordering guarantee that survives chunking: evaluation
// order between a module and its dependency is fixed by the spec, whatever Rollup does with
// chunk boundaries. The attach module is idempotent and no-oped identically under the old
// Electron build.
import '../../preload/tauriAttach'

import {
  GameInfo,
  InstallProgress,
  Runner,
  GameSettings,
  InstallPlatform,
  InstallInfo
} from 'common/types'

import { install, launch, repair, updateGame } from './library'
import * as fileSize from 'filesize'
import { getStoreDisplayName } from './storeDisplayName'
const readFile = window.api.readConfig

const writeConfig = window.api.writeConfig

const notify = (args: { title: string; body: string }) =>
  window.api.notify(args)

const loginPage = window.api.openLoginPage

const sidInfoPage = window.api.openSidInfoPage

const handleQuit = window.api.quit

const openDiscordLink = window.api.openDiscordLink

export const size = fileSize.partial({ base: 2 }) as (arg: unknown) => string

const sendKill = window.api.kill

const syncSaves = async (
  savesPath: string,
  appName: string,
  runner: Runner,
  arg?: string
): Promise<string> => {
  const response: string = await window.api.syncSaves({
    arg,
    path: savesPath,
    appName,
    runner
  })
  return response
}

const getLegendaryConfig = async (): Promise<{
  library: GameInfo[]
  user: string
}> => {
  // TODO: I'd say we should refactor this to be two different IPC calls, makes type annotations easier
  const library: GameInfo[] = (await readFile('library')) as GameInfo[]
  const user: string = (await readFile('user')) as string

  if (!user) {
    return { library: [], user: '' }
  }

  return { library, user }
}

const getGameInfo = async (appName: string, runner: Runner) => {
  return window.api.getGameInfo(appName, runner)
}

const getGameSettings = async (
  appName: string,
  runner: Runner
): Promise<GameSettings | null> => {
  return window.api.getGameSettings(appName, runner)
}

const getInstallInfo = async (
  appName: string,
  runner: Runner,
  installPlatform: InstallPlatform,
  build?: string,
  branch?: string
): Promise<InstallInfo | null> => {
  return window.api.getInstallInfo(
    appName,
    runner,
    handleRunnersPlatforms(installPlatform, runner),
    build,
    branch
  )
}

function handleRunnersPlatforms(
  platform: InstallPlatform,
  runner: Runner
): InstallPlatform {
  if (runner === 'legendary') {
    return platform
  }
  switch (platform) {
    case 'Mac':
      return 'osx'
    case 'Windows':
      return 'windows'
    default:
      return platform
  }
}

const createNewWindow = (url: string) => window.api.createNewWindow(url)

function getProgress(progress: InstallProgress): number {
  if (progress && progress.percent) {
    const percent = progress.percent
    // this should deal with a few edge cases
    if (typeof percent === 'string') {
      return Number(String(percent).replace('%', ''))
    }
    return percent
  }
  return 0
}

function removeSpecialcharacters(text: string): string {
  const regexp = new RegExp(/[:|/|*|?|<|>|\\|&|{|}|%|$|@|`|!|™|+|'|"|®]/, 'gi')
  return text.replaceAll(regexp, '')
}

// Quick task 260823-qsm (34.4 WR-02): the mapping moved to `./storeDisplayName`, which has no
// runtime imports at all, so dependency-light surfaces can use it without dragging this module's
// side-effecting `preload/tauriAttach` import in with it. Delegating rather than duplicating keeps
// one source of truth; this export's name and signature are unchanged for its four consumers.
const getStoreName = (runner: Runner, other: string) =>
  getStoreDisplayName(runner, other)

function getPreferredInstallLanguage(
  availableLanguages: string[],
  preferredLanguages: readonly string[]
) {
  const foundPreffered = preferredLanguages.find((plang) =>
    availableLanguages.some((alang) => alang.startsWith(plang))
  )
  if (foundPreffered) {
    const foundAvailable = availableLanguages.find((alang) =>
      alang.startsWith(foundPreffered)
    )
    if (foundAvailable) {
      return foundAvailable
    }
  }
  return availableLanguages[0]
}

export {
  createNewWindow,
  getGameInfo,
  getGameSettings,
  getInstallInfo,
  getLegendaryConfig,
  getProgress,
  handleQuit,
  install,
  launch,
  loginPage,
  notify,
  openDiscordLink,
  repair,
  sendKill,
  sidInfoPage,
  syncSaves,
  updateGame,
  writeConfig,
  removeSpecialcharacters,
  getStoreName,
  getPreferredInstallLanguage
}
