import { makeListenerCaller, makeHandlerInvoker, frontendListenerSlot } from '../ipc'
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
// the sidecar registers nothing for these ten channels. Phase 35 plan 16 collapsed the
// Electron/Tauri runtime-detection branch that used to guard this -- nothing runs under
// Electron anymore, so the fallback to the generic ipc.ts factory (and the `*Ipc` consts
// that called it) is dead code and has been removed rather than left unreachable.
export const isFullscreen = () => tauriIsFullscreen()
export const isFrameless = () => tauriIsFrameless()
export const isMinimized = () => tauriIsMinimized()
export const isMaximized = () => tauriIsMaximized()
export const minimizeWindow = () => tauriMinimizeWindow()
export const maximizeWindow = () => tauriMaximizeWindow()
export const unmaximizeWindow = () => tauriUnmaximizeWindow()
export const closeWindow = () => tauriCloseWindow()
export const setFullscreen = (enabled: boolean) => tauriSetFullscreen(enabled)
// CR-03 (Phase 34.1 code review): under Tauri these three pushes had NO PRODUCER --
// Electron used to emit them from real window events (`main.ts:240-246`), but nothing
// on the Tauri path did, so `frontendListenerSlot` registered a listener that could
// never fire. For `maximized`/`unmaximized` that made `WindowControls`' restore button
// permanently unreachable (it reads `isMaximized()` once at mount and depends on these
// pushes for every transition after). The producer is renderer-side, in
// `tauriWindowChrome.ts`. Phase 35 plan 16 removed the dead Electron
// `frontendListenerSlot` fallback these three used to carry.
//
// `fullscreen` is a DECLARED no-op under Tauri rather than a real fullscreen watch --
// see `tauriHandleFullscreen`'s own comment: `isFullscreen` under Tauri is the static
// `isSteamDeckGameMode` gamescope signal, not a window-state query, so there is no
// runtime transition to push and emitting real OS fullscreen changes here would
// silently redefine what `App.tsx`'s `fullscreen` class means.
export const handleMaximized = (listener: (e: IpcRendererEvent) => void): (() => void) =>
  tauriHandleMaximized(() => listener(undefined as unknown as IpcRendererEvent))

export const handleUnmaximized = (listener: (e: IpcRendererEvent) => void): (() => void) =>
  tauriHandleUnmaximized(() => listener(undefined as unknown as IpcRendererEvent))

export const handleFullscreen = (listener: (e: IpcRendererEvent, isFullscreen: boolean) => void): (() => void) =>
  tauriHandleFullscreen((isFullscreen) => listener(undefined as unknown as IpcRendererEvent, isFullscreen))
export const openWebviewPage = makeListenerCaller('openWebviewPage')
export const setZoomFactor = (zoomFactor: string) => tauriSetZoomFactor(zoomFactor)
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
// makeHandlerInvoker's own runtime-detection routing means the Electron path never reaches
// the sidecar at all for this channel (there is no Electron-side handler for it, and none is needed).
export const oauthCaptureLogin = makeHandlerInvoker('oauthCaptureLogin')
export const checkGameUpdates = makeHandlerInvoker('checkGameUpdates')
export const refreshLibrary = makeHandlerInvoker('refreshLibrary')
// D-10 (Phase 34.1 Plan 05): Electron used to inject synthetic input via
// `webContents.sendInputEvent` (`main.ts:1377`); Tauri has no equivalent, so the
// renderer dispatches its own DOM events/focus moves instead
// (`tauriGamepadInput.ts`). The sidecar registers nothing for this channel. Phase 35
// plan 16 removed the dead Electron `gamepadActionIpc` fallback, matching the ten
// D-01 window-chrome exports above.
export const gamepadAction = (args: GamepadActionArgs) => tauriGamepadAction(args)
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

import type { StoreOptions } from 'common/types/electron_store'
import { isAllowedStoreField } from 'common/types/storePolicy'
import { registerStore, snapshotGet, snapshotHas, snapshotSet, snapshotDelete } from '../tauriTransport'
// FUTURE WORK
// here is how the store methods can be refactored
// in order to set nodeIntegration: false
// but converting sync methods to async propagates through frontend

// export const storeNew = async (
//   name: string,
//   options: StoreOptions<Record<string, unknown>>
// ) => ipcRenderer.send('storeNew', name, options)

// export const storeSet = async (name: string, key: string, value?: unknown) =>
//   ipcRenderer.send('storeSet', name, key, value)

// export const storeHas = async (name: string, key: string) =>
//   ipcRenderer.invoke('storeHas', name, key)

// export const storeGet = async (name: string, key: string) =>
//   ipcRenderer.invoke('storeGet', name, key)

// D-01/D-02/D-04/D-08 convergence (Phase 35 plan 16): this region used to be three
// independent concerns overlapping in one place -- the Electron/Tauri runtime-detection
// branch pair on every storeNew/storeGet/storeSet/storeHas/storeDelete, the lazy
// `require` of the Node-only file-store package inside the Electron branch of storeNew,
// and a locally duplicated Electron-only credential-key deny-list gating storeGet. All three collapsed in one
// pass (35-PATTERNS.md Pitfall 2: splitting them across tasks/waves risks the second or
// third silently reverting the first). Nothing runs under Electron anymore, so every
// pair collapses to its Tauri body; the Tauri-path snapshot functions
// (`snapshotGet`/`snapshotHas`/`snapshotSet`/`snapshotDelete` in `tauriTransport.ts`)
// already gate reads/writes on `isAllowedStoreField`/`isWritableStoreField` internally,
// and `storeGet` below adds its own explicit gate too so the credential-block warning
// stays informative about which store/key was blocked, matching the pre-collapse
// behavior.
export const storeNew = function (storeName: string, options: StoreOptions<Record<string, unknown>>) {
  registerStore(storeName, options)
}

export const storeSet = (storeName: string, key: string, value?: unknown) => {
  snapshotSet(storeName, key, value)
}

export const storeHas = (storeName: string, key: string) => {
  return snapshotHas(storeName, key)
}

// T-10-12 / WR-09 / T-27-06: stored credentials must never be readable from renderer
// code. This bridge is generic and key-unfiltered by design, which would let
// any renderer script (e.g. XSS via themes/custom CSS) exfiltrate a stored
// session with one call — `storeGet('humbleConfigStore', 'sessionCookie')`
// returns the raw stored value, plaintext when encryption is degraded.
// Gate on the allow-list here in the preload too, so the block holds for
// every renderer caller, not just our own typed store wrappers, and the warning names
// WHICH store and key were blocked (never the value).
//
// D-08 (Phase 29 Plan 05, converged Phase 35 plan 16): this used to be a second,
// locally-duplicated Electron-only credential-key DENY-list, deliberately kept
// divergent from the Tauri path's fail-closed ALLOW-list in
// `src/common/types/storePolicy.ts` (`isAllowedStoreField`) until the Electron cutover
// — see that module's own header comment. Now that nothing runs under Electron, this
// module has exactly ONE secret policy: `isAllowedStoreField`. A deny-list silently
// exposes any newly added secret field by default; CR-06 (Phase 29 code review) already
// found that exact defect once, on three fields (`humbleConfigStore.csrfToken`,
// `gogConfigStore.credentials`, `zoomConfigStore.credentials`) that were shipping
// readable in the Electron build until that fix. The allow-list closes that class of
// bug by construction — an unknown field is blocked by DEFAULT, not exposed until
// someone remembers to deny-list it — which is why it is the survivor here and not the
// other way round. `storePolicy.test.ts`'s D-08 convergence assertions (plan 35-16
// task 1) prove every one of those five fields, plus their nested-path forms, are
// blocked by `isAllowedStoreField` before this deletion landed.
export const storeGet = (storeName: string, key: string, defaultValue?: unknown) => {
  if (!isAllowedStoreField(storeName, key)) {
    console.warn(`storeGet: blocked read of credential key "${key}" from "${storeName}"`)
    return undefined
  }
  return snapshotGet(storeName, key, defaultValue)
}

export const storeDelete = (storeName: string, key: string) => {
  snapshotDelete(storeName, key)
}

export const getWikiGameInfo = makeHandlerInvoker('getWikiGameInfo')
export const fetchPlaytimeFromServer = makeHandlerInvoker('getPlaytimeFromRunner')
export const getUploadedLogFiles = makeHandlerInvoker('getUploadedLogFiles')
export const uploadLogFile = makeHandlerInvoker('uploadLogFile')
export const deleteUploadedLogFile = makeHandlerInvoker('deleteUploadedLogFile')
export const logFileUploadedSlot = frontendListenerSlot('logFileUploaded')
export const logFileUploadDeletedSlot = frontendListenerSlot('logFileUploadDeleted')
export const steamgriddb = {
  hasApiKey: makeHandlerInvoker('steamgriddb.hasApiKey'),
  setApiKey: makeHandlerInvoker('steamgriddb.setApiKey'),
  searchGame: makeHandlerInvoker('steamgriddb.searchGame'),
  getGrids: makeHandlerInvoker('steamgriddb.getGrids'),
  getHeroes: makeHandlerInvoker('steamgriddb.getHeroes')
}
