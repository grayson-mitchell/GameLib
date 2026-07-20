import { makeListenerCaller, makeHandlerInvoker, frontendListenerSlot } from '../ipc'

export const clearCache = makeListenerCaller('clearCache')
export const clearAchievementCache = makeListenerCaller('clearAchievementCache')
export const resetHeroic = makeListenerCaller('resetHeroic')
export const openWeblate = makeListenerCaller('openWeblate')
export const changeLanguage = makeListenerCaller('changeLanguage')
export const openExternalUrl = makeListenerCaller('openExternalUrl')
export const getHeroicVersion = makeHandlerInvoker('getHeroicVersion')
export const getLatestReleases = makeHandlerInvoker('getLatestReleases')
export const getCurrentChangelog = makeHandlerInvoker('getCurrentChangelog')
export const openPatreonPage = makeListenerCaller('openPatreonPage')
export const openKofiPage = makeListenerCaller('openKofiPage')
export const openGithubSponsorsPage = makeListenerCaller('openGithubSponsorsPage')
export const isFullscreen = makeHandlerInvoker('isFullscreen')
export const isFrameless = makeHandlerInvoker('isFrameless')
export const isMinimized = makeHandlerInvoker('isMinimized')
export const isMaximized = makeHandlerInvoker('isMaximized')
export const minimizeWindow = makeListenerCaller('minimizeWindow')
export const maximizeWindow = makeListenerCaller('maximizeWindow')
export const unmaximizeWindow = makeListenerCaller('unmaximizeWindow')
export const closeWindow = makeListenerCaller('closeWindow')
export const setFullscreen = makeListenerCaller('setFullscreen')
export const handleMaximized = frontendListenerSlot('maximized')
export const handleUnmaximized = frontendListenerSlot('unmaximized')
export const handleFullscreen = frontendListenerSlot('fullscreen')
export const openWebviewPage = makeListenerCaller('openWebviewPage')
export const setZoomFactor = makeListenerCaller('setZoomFactor')
export const frontendReady = makeListenerCaller('frontendReady')
export const lock = makeListenerCaller('lock')
export const unlock = makeListenerCaller('unlock')
export const login = makeHandlerInvoker('login')
export const logoutLegendary = makeHandlerInvoker('logoutLegendary')
export const authGOG = makeHandlerInvoker('authGOG')
export const logoutGOG = makeListenerCaller('logoutGOG')
export const getAmazonLoginData = makeHandlerInvoker('getAmazonLoginData')
export const authAmazon = makeHandlerInvoker('authAmazon')
export const logoutAmazon = makeHandlerInvoker('logoutAmazon')
export const checkGameUpdates = makeHandlerInvoker('checkGameUpdates')
export const refreshLibrary = makeHandlerInvoker('refreshLibrary')
export const gamepadAction = makeHandlerInvoker('gamepadAction')
export const logError = makeListenerCaller('logError')
export const logInfo = makeListenerCaller('logInfo')
export const showConfigFileInFolder = makeListenerCaller('showConfigFileInFolder')
export const openFolder = makeListenerCaller('openFolder')
export const syncGOGSaves = makeHandlerInvoker('syncGOGSaves')
export const checkDiskSpace = makeHandlerInvoker('checkDiskSpace')
export const getGOGLinuxInstallersLangs = makeHandlerInvoker('getGOGLinuxInstallersLangs')
export const getAlternativeWine = makeHandlerInvoker('getAlternativeWine')
export const getShellPath = makeHandlerInvoker('getShellPath')
export const getWebviewPreloadPath = makeHandlerInvoker('getWebviewPreloadPath')
export const callTool = makeHandlerInvoker('callTool')
export const getAnticheatInfo = makeHandlerInvoker('getAnticheatInfo')
export const getKnownFixes = makeHandlerInvoker('getKnownFixes')
export const clipboardReadText = makeHandlerInvoker('clipboardReadText')
export const clipboardWriteText = makeListenerCaller('clipboardWriteText')
export const pathExists = makeHandlerInvoker('pathExists')
export const processShortcut = makeListenerCaller('processShortcut')
export const handleGoToScreen = frontendListenerSlot('openScreen')
export const handleShowDialog = frontendListenerSlot('showDialog')

// Type-only -- erased at compile time (see the lazy `require('electron-store')` comment
// below for why this module must not statically import the real value).
import type Store from 'electron-store'
import {
  isTauri,
  registerStore,
  snapshotGet,
  snapshotHas,
  snapshotSet,
  snapshotDelete
} from '../tauriTransport'
// FUTURE WORK
// here is how the store methods can be refactored
// in order to set nodeIntegration: false
// but converting sync methods to async propagates through frontend

// export const storeNew = async (
//   name: string,
//   options: Store.Options<Record<string, unknown>>
// ) => ipcRenderer.send('storeNew', name, options)

// export const storeSet = async (name: string, key: string, value?: unknown) =>
//   ipcRenderer.send('storeSet', name, key, value)

// export const storeHas = async (name: string, key: string) =>
//   ipcRenderer.invoke('storeHas', name, key)

// export const storeGet = async (name: string, key: string) =>
//   ipcRenderer.invoke('storeGet', name, key)

interface StoreMap {
  [key: string]: Store
}
const stores: StoreMap = {}

export const storeNew = function (storeName: string, options: Store.Options<Record<string, unknown>>) {
  if (isTauri()) {
    registerStore(storeName)
    return
  }
  // Lazy, guarded `require` -- see ipc.ts's ipcRenderer comment for why: electron-store is
  // Node-only (fs-backed via `conf`) and must not be a static import value if this module
  // is ever reached from the Tauri renderer bundle (BLOCKER-1 / T-27-07).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ElectronStore = require('electron-store') as typeof Store
  stores[storeName] = new ElectronStore(options)
}

export const storeSet = (storeName: string, key: string, value?: unknown) => {
  if (isTauri()) {
    snapshotSet(storeName, key, value)
    return
  }
  stores[storeName].set(key, value)
}

export const storeHas = (storeName: string, key: string) => {
  if (isTauri()) {
    return snapshotHas(storeName, key)
  }
  return stores[storeName].has(key)
}

// T-10-12 / WR-09 / T-27-06: stored credentials must never be readable from renderer
// code. This bridge is generic and key-unfiltered by design, which would let
// any renderer script (e.g. XSS via themes/custom CSS) exfiltrate a stored
// session with one call — `storeGet('humbleConfigStore', 'sessionCookie')`
// returns the raw stored value, plaintext when encryption is degraded.
// Deny-list known credential keys here in the preload, so the block holds for
// every renderer caller, not just our own typed store wrappers. The UI only
// needs isLoggedIn/userData/expired/encryptionDegraded — never the secrets.
// Preserved verbatim for the Tauri snapshot path too (tauriTransport.ts's own
// SECRET_STORE_KEYS copy gates snapshotGet/snapshotHas directly -- this check gates both
// paths from here as well, defense in depth).
const SECRET_STORE_KEYS: Record<string, readonly string[]> = {
  humbleConfigStore: ['sessionCookie'],
  steamConfigStore: ['refreshToken']
}

const isSecretStoreKey = (storeName: string, key: string) =>
  (SECRET_STORE_KEYS[storeName] ?? []).some(
    // electron-store supports dot-notation paths — block subpath reads too.
    (secret) => key === secret || key.startsWith(`${secret}.`)
  )

export const storeGet = (storeName: string, key: string, defaultValue?: unknown) => {
  if (isSecretStoreKey(storeName, key)) {
    console.warn(
      `storeGet: blocked read of credential key "${key}" from "${storeName}"`
    )
    return undefined
  }
  if (isTauri()) {
    return snapshotGet(storeName, key, defaultValue)
  }
  return stores[storeName].get(key, defaultValue)
}

export const storeDelete = (storeName: string, key: string) => {
  if (isTauri()) {
    snapshotDelete(storeName, key)
    return
  }
  stores[storeName].delete(key)
}

export const getWikiGameInfo = makeHandlerInvoker('getWikiGameInfo')
export const fetchPlaytimeFromServer = makeHandlerInvoker('getPlaytimeFromRunner')
export const getUploadedLogFiles = makeHandlerInvoker('getUploadedLogFiles')
export const uploadLogFile = makeHandlerInvoker('uploadLogFile')
export const deleteUploadedLogFile = makeHandlerInvoker('deleteUploadedLogFile')
export const logFileUploadedSlot = frontendListenerSlot('logFileUploaded')
export const logFileUploadDeletedSlot = frontendListenerSlot('logFileUploadDeleted')
export const isIntelMac = makeHandlerInvoker('isIntelMac')
export const steamgriddb = {
  hasApiKey: makeHandlerInvoker('steamgriddb.hasApiKey'),
  setApiKey: makeHandlerInvoker('steamgriddb.setApiKey'),
  searchGame: makeHandlerInvoker('steamgriddb.searchGame'),
  getGrids: makeHandlerInvoker('steamgriddb.getGrids'),
  getHeroes: makeHandlerInvoker('steamgriddb.getHeroes')
}
