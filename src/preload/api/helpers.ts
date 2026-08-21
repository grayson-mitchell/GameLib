import { frontendListenerSlot, makeHandlerInvoker, makeListenerCaller } from '../ipc'
import { isTauri } from '../tauriTransport'
import { tauriCreateNewWindow, tauriShowAboutWindow } from './tauriChildWindows'

export const notify = makeListenerCaller('notify')
export const openLoginPage = makeListenerCaller('openLoginPage')
export const openSidInfoPage = makeListenerCaller('openSidInfoPage')
export const openSupportPage = makeListenerCaller('openSupportPage')
export const quit = makeListenerCaller('quit')
// D-12 (Phase 34.1 Plan 07): showAboutWindow/createNewWindow open genuine Tauri
// WebviewWindows under Tauri -- renderer-side, per tauriChildWindows.ts's module
// comment. The sidecar registers nothing for these two channels; the preload
// short-circuit below means the UNPORTED_CHANNEL_MARKER path is never reached, the
// same D-02 reasoning the ten window-chrome channels use.
const showAboutWindowIpc = makeListenerCaller('showAboutWindow')
const createNewWindowIpc = makeListenerCaller('createNewWindow')
export const showAboutWindow = () => (isTauri() ? tauriShowAboutWindow() : showAboutWindowIpc())
export const openDiscordLink = makeListenerCaller('openDiscordLink')
export const openWinePrefixFAQ = makeListenerCaller('openWinePrefixFAQ')
export const openCustomThemesWiki = makeListenerCaller('openCustomThemesWiki')
export const createNewWindow = (url: string) => (isTauri() ? tauriCreateNewWindow(url) : createNewWindowIpc(url))
export const readConfig = makeHandlerInvoker('readConfig')
export const isLoggedIn = makeHandlerInvoker('isLoggedIn')
export const writeConfig = makeHandlerInvoker('writeConfig')
export const kill = makeHandlerInvoker('kill')
export const abort = makeListenerCaller('abort')
export const getUserInfo = makeHandlerInvoker('getUserInfo')
export const getAmazonUserInfo = makeHandlerInvoker('getAmazonUserInfo')
export const syncSaves = makeHandlerInvoker('syncSaves')
export const getDefaultSavePath = makeHandlerInvoker('getDefaultSavePath')
export const getGameInfo = makeHandlerInvoker('getGameInfo')
export const getAchievements = makeHandlerInvoker('getAchievements')
export const getExtraInfo = makeHandlerInvoker('getExtraInfo')
export const getLaunchOptions = makeHandlerInvoker('getLaunchOptions')
export const getPrivateBranchPassword = makeHandlerInvoker('getPrivateBranchPassword')
export const setPrivateBranchPassword = makeHandlerInvoker('setPrivateBranchPassword')
// REDmod integration
export const getAvailableCyberpunkMods = makeHandlerInvoker('getAvailableCyberpunkMods')
export const setCyberpunModConfig = makeHandlerInvoker('setCyberpunkModConfig')
export const getGameSettings = makeHandlerInvoker('getGameSettings')
export const getInstallInfo = makeHandlerInvoker('getInstallInfo')
export const runWineCommand = makeHandlerInvoker('runWineCommand')
export const runWineCommandForGame = makeHandlerInvoker('runWineCommandForGame')
export const onConnectivityChanged = frontendListenerSlot('connectivity-changed')
export const getConnectivityStatus = makeHandlerInvoker('get-connectivity-status')
export const setConnectivityOnline = makeListenerCaller('set-connectivity-online')
export const connectivityChanged = makeListenerCaller('connectivity-changed')
export const isNative = makeHandlerInvoker('isNative')
export const getThemeCSS = makeHandlerInvoker('getThemeCSS')
export const getCustomThemes = makeHandlerInvoker('getCustomThemes')
export const getCustomCSS = makeHandlerInvoker('getCustomCSS')
export const getGogDiscounts = makeHandlerInvoker('getGogDiscounts')
export const setTitleBarOverlay = makeListenerCaller('setTitleBarOverlay')
export const isGameAvailable = makeHandlerInvoker('isGameAvailable')
