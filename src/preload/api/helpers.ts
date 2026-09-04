import { frontendListenerSlot, makeHandlerInvoker, makeListenerCaller } from '../ipc'
import { tauriCreateNewWindow } from './tauriChildWindows'
import { SHOW_ABOUT_DIALOG_EVENT } from 'common/aboutDialogEvent'

export const notify = makeListenerCaller('notify')
export const openLoginPage = makeListenerCaller('openLoginPage')
export const openSidInfoPage = makeListenerCaller('openSidInfoPage')
export const openSupportPage = makeListenerCaller('openSupportPage')
export const quit = makeListenerCaller('quit')
export const openDiscordLink = makeListenerCaller('openDiscordLink')
export const openWinePrefixFAQ = makeListenerCaller('openWinePrefixFAQ')
export const openCustomThemesWiki = makeListenerCaller('openCustomThemesWiki')
// D-12 (Phase 34.1 Plan 07): createNewWindow opens a genuine Tauri WebviewWindow --
// renderer-side, per tauriChildWindows.ts's module comment. Phase 35 plan 17 collapsed
// the Electron-branch fallback (`makeListenerCaller('createNewWindow')`), which is
// unreachable now that the Tauri shell is the only shell.
export const createNewWindow = (url: string) => tauriCreateNewWindow(url)

// Quick `260905-d33`: About is an in-app modal now, so this no longer constructs a
// WebviewWindow -- it raises the event `AboutDialogHost` listens for. The NAME is kept
// deliberately: the macOS tray reaches About by evaluating
// `window.api?.showAboutWindow?.()` from Rust (`open_about_window_from_tray`), and that
// eval is optional-chained, so renaming or removing this would break the tray item
// silently, with no error on either side.
export const showAboutWindow = () => window.dispatchEvent(new CustomEvent(SHOW_ABOUT_DIALOG_EVENT))
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
export const getLoginBackground = makeHandlerInvoker('getLoginBackground')
export const getGogDiscounts = makeHandlerInvoker('getGogDiscounts')
export const setTitleBarOverlay = makeListenerCaller('setTitleBarOverlay')
export const isGameAvailable = makeHandlerInvoker('isGameAvailable')
