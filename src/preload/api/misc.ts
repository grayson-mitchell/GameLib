import { makeListenerCaller, makeHandlerInvoker, frontendListenerSlot } from '../ipc'
import { isTauri } from '../tauriTransport'
import {
  tauriMinimizeWindow,
  tauriMaximizeWindow,
  tauriUnmaximizeWindow,
  tauriCloseWindow,
  tauriIsMaximized,
  tauriIsMinimized,
  tauriIsFullscreen,
  tauriSetFullscreen,
  tauriIsFrameless,
  tauriSetZoomFactor,
  tauriHandleMaximized,
  tauriHandleUnmaximized,
  tauriHandleFullscreen
} from './tauriWindowChrome'
import type { IpcRendererEvent } from 'electron'
import { tauriGamepadAction } from './tauriGamepadInput'
import type { GamepadActionArgs } from 'common/types'

export const clearCache = makeListenerCaller('clearCache')
export const clearAchievementCache = makeListenerCaller('clearAchievementCache')
export const resetHeroic = makeListenerCaller('resetHeroic')
export const openWeblate = makeListenerCaller('openWeblate')
export const changeLanguage = makeListenerCaller('changeLanguage')
export const openExternalUrl = makeListenerCaller('openExternalUrl')
export const getHeroicVersion = makeHandlerInvoker('getHeroicVersion')
export const getLatestReleases = makeHandlerInvoker('getLatestReleases')
export const getCurrentChangelog = makeHandlerInvoker('getCurrentChangelog')
export const openKofiPage = makeListenerCaller('openKofiPage')
export const openGithubSponsorsPage = makeListenerCaller('openGithubSponsorsPage')
// D-01/D-02 (Phase 34.1 Plan 03): window chrome executes RENDERER-SIDE under Tauri --
// the sidecar registers nothing for these ten channels, and the
// UNPORTED_CHANNEL_MARKER path is never reached because this isTauri() short-circuit
// is the only caller path. Under Electron each still goes through the same generic
// ipc.ts factory as before -- byte-identical to the pre-plan behavior.
const isFullscreenIpc = makeHandlerInvoker('isFullscreen')
const isFramelessIpc = makeHandlerInvoker('isFrameless')
const isMinimizedIpc = makeHandlerInvoker('isMinimized')
const isMaximizedIpc = makeHandlerInvoker('isMaximized')
const minimizeWindowIpc = makeListenerCaller('minimizeWindow')
const maximizeWindowIpc = makeListenerCaller('maximizeWindow')
const unmaximizeWindowIpc = makeListenerCaller('unmaximizeWindow')
const closeWindowIpc = makeListenerCaller('closeWindow')
const setFullscreenIpc = makeListenerCaller('setFullscreen')
const setZoomFactorIpc = makeListenerCaller('setZoomFactor')

export const isFullscreen = () => (isTauri() ? tauriIsFullscreen() : isFullscreenIpc())
export const isFrameless = () => (isTauri() ? tauriIsFrameless() : isFramelessIpc())
export const isMinimized = () => (isTauri() ? tauriIsMinimized() : isMinimizedIpc())
export const isMaximized = () => (isTauri() ? tauriIsMaximized() : isMaximizedIpc())
export const minimizeWindow = () => (isTauri() ? tauriMinimizeWindow() : minimizeWindowIpc())
export const maximizeWindow = () => (isTauri() ? tauriMaximizeWindow() : maximizeWindowIpc())
export const unmaximizeWindow = () => (isTauri() ? tauriUnmaximizeWindow() : unmaximizeWindowIpc())
export const closeWindow = () => (isTauri() ? tauriCloseWindow() : closeWindowIpc())
export const setFullscreen = (enabled: boolean) => (isTauri() ? tauriSetFullscreen(enabled) : setFullscreenIpc(enabled))
// CR-03 (Phase 34.1 code review): under Tauri these three pushes had NO PRODUCER --
// Electron emits them from real window events (`main.ts:240-246`), but nothing on the
// Tauri path did, so `frontendListenerSlot` registered a listener that could never
// fire. For `maximized`/`unmaximized` that made `WindowControls`' restore button
// permanently unreachable (it reads `isMaximized()` once at mount and depends on these
// pushes for every transition after). The producer is renderer-side, in
// `tauriWindowChrome.ts`, reached through the SAME `isTauri()` short-circuit as the ten
// D-01 channels above; the Electron path is untouched.
//
// `fullscreen` is a DECLARED no-op under Tauri rather than a real fullscreen watch --
// see `tauriHandleFullscreen`'s own comment: `isFullscreen` under Tauri is the static
// `isSteamDeckGameMode` gamescope signal, not a window-state query, so there is no
// runtime transition to push and emitting real OS fullscreen changes here would
// silently redefine what `App.tsx`'s `fullscreen` class means.
const handleMaximizedIpc = frontendListenerSlot('maximized')
const handleUnmaximizedIpc = frontendListenerSlot('unmaximized')
const handleFullscreenIpc = frontendListenerSlot('fullscreen')

export const handleMaximized = (listener: (e: IpcRendererEvent) => void): (() => void) =>
  isTauri()
    ? tauriHandleMaximized(() => listener(undefined as unknown as IpcRendererEvent))
    : handleMaximizedIpc(listener)

export const handleUnmaximized = (listener: (e: IpcRendererEvent) => void): (() => void) =>
  isTauri()
    ? tauriHandleUnmaximized(() => listener(undefined as unknown as IpcRendererEvent))
    : handleUnmaximizedIpc(listener)

export const handleFullscreen = (listener: (e: IpcRendererEvent, isFullscreen: boolean) => void): (() => void) =>
  isTauri()
    ? tauriHandleFullscreen((isFullscreen) => listener(undefined as unknown as IpcRendererEvent, isFullscreen))
    : handleFullscreenIpc(listener)
export const openWebviewPage = makeListenerCaller('openWebviewPage')
export const setZoomFactor = (zoomFactor: string) =>
  isTauri() ? tauriSetZoomFactor(zoomFactor) : setZoomFactorIpc(zoomFactor)
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
// Phase 34.4.1 Plan 09 (D-04, REQ-34.4.1-08): captures an OAuth redirect for one of the four
// still-unported login runners via the Tauri login-window seam. Tauri-only by construction --
// makeHandlerInvoker's own isTauri() routing means the Electron path never reaches the sidecar
// at all for this channel (there is no Electron-side handler for it, and none is needed).
export const oauthCaptureLogin = makeHandlerInvoker('oauthCaptureLogin')
export const checkGameUpdates = makeHandlerInvoker('checkGameUpdates')
export const refreshLibrary = makeHandlerInvoker('refreshLibrary')
// D-10 (Phase 34.1 Plan 05): Electron injects synthetic input via
// `webContents.sendInputEvent` (`main.ts:1377`); Tauri has no equivalent, so under
// Tauri the renderer dispatches its own DOM events/focus moves instead
// (`tauriGamepadInput.ts`). The sidecar registers nothing for this channel -- the
// UNPORTED_CHANNEL_MARKER path is never reached because this isTauri() short-circuit
// is the only caller path, matching the ten D-01 window-chrome exports above.
const gamepadActionIpc = makeHandlerInvoker('gamepadAction')
export const gamepadAction = (args: GamepadActionArgs) =>
  isTauri() ? tauriGamepadAction(args) : gamepadActionIpc(args)
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
import { registerStore, snapshotGet, snapshotHas, snapshotSet, snapshotDelete } from '../tauriTransport'
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
    registerStore(storeName, options)
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
//
// D-08 (Phase 29 Plan 05): this DENY-list governs the ELECTRON path ONLY, and is
// intentionally NOT the Tauri path's policy. The Tauri path enforces the fail-closed
// ALLOW-list in `src/common/types/storePolicy.ts` (`isAllowedStoreField`) — see that
// module's own header comment and `tauriTransport.ts`'s matching D-08 comment for the
// full rationale. Flipping this shipped Electron build to fail-closed risks blocking a
// legitimate read among the 379 `window.api.*` call-sites, which the additive/reversible
// invariant forbids — so the two builds deliberately carry divergent secret policies
// until the Electron cutover (Phase 35), the same interim-divergence pattern the Phase 28
// D-11 precedent established for the keyring path. Do not "fix" this by unifying the two
// policies early; that is Phase 35's job, not this plan's.
// CR-06 (Phase 29 code review): the deny-list is EXTENDED here, additively, to the
// three remaining fields `storePolicy.ts`'s own header identifies as secrets —
// `humbleConfigStore.csrfToken` ("Main-process-only — never included in any
// sendFrontendMessage payload or HumbleAuthState"), `gogConfigStore.credentials`
// (GOGLoginData: access + refresh tokens) and `zoomConfigStore.credentials`
// (ZoomCredentials). Until this change they were readable in the SHIPPING Electron
// build by any renderer script (`window.api.storeGet('gogConfigStore','credentials')`).
// The divergence rationale above is about not FLIPPING this path to an allow-list —
// it does not justify leaving three known secrets off the deny-list, and adding three
// names is strictly additive with no Phase 35 coupling. Verified against every
// frontend call site: nothing in `src/frontend` reads `credentials` or `csrfToken`
// (GlobalState.tsx reads only userData/isLoggedIn/expired/encryptionDegraded/username).
const SECRET_STORE_KEYS: Record<string, readonly string[]> = {
  humbleConfigStore: ['sessionCookie', 'csrfToken'],
  steamConfigStore: ['refreshToken'],
  gogConfigStore: ['credentials'],
  zoomConfigStore: ['credentials']
}

const isSecretStoreKey = (storeName: string, key: string) => {
  // CR-02-class hazard on this path too: `SECRET_STORE_KEYS` is a plain object
  // literal, so a bare `SECRET_STORE_KEYS[storeName]` for a prototype-chain name
  // (`constructor`, `toString`, …) resolves to a FUNCTION, and `.some(...)` on it
  // THROWS — from a preload function the renderer calls synchronously. An
  // own-property lookup keeps this predicate total.
  const secrets = Object.prototype.hasOwnProperty.call(SECRET_STORE_KEYS, storeName) ? SECRET_STORE_KEYS[storeName] : []
  return secrets.some(
    // electron-store supports dot-notation paths — block subpath reads too.
    (secret) => key === secret || key.startsWith(`${secret}.`)
  )
}

export const storeGet = (storeName: string, key: string, defaultValue?: unknown) => {
  if (isSecretStoreKey(storeName, key)) {
    console.warn(`storeGet: blocked read of credential key "${key}" from "${storeName}"`)
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
