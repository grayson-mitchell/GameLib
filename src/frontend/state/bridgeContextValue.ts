import type { ContextType } from 'frontend/types'
import useUiState from './uiState'
import useSettingsState, { selectIsRTL } from './settingsState'
import useAuthState from './authState'
import useLibraryState, { selectInstallingEpicGame } from './libraryState'
import {
  composeAmazonAccount,
  composeCustomCategories,
  composeEpicAccount,
  composeFavouriteGames,
  composeGogAccount,
  composeHiddenGames,
  composeHumbleAccount,
  composeSteamAccount
} from './accountHooks'

// Phase 69 D-09 bridge: GlobalState re-renders when a store that owns a
// context field changes, and spreads the stores' current values into the
// Provider value so unconverted consumers keep reading them from context.
// Each later slice plan adds its store to both functions; 69-24 deletes this
// file together with GlobalState.tsx.

type BridgedKeys =
  | 'platform'
  | 'error'
  | 'isFullscreen'
  | 'isFrameless'
  | 'activeController'
  | 'connectivity'
  | 'dialogModalOptions'
  | 'externalLinkDialogOptions'
  | 'showRedeemKeyDialog'
  | 'showDialogModal'
  | 'showResetDialog'
  | 'handleExternalLinkDialog'
  | 'handleRedeemKeyDialog'
  | 'language'
  | 'isRTL'
  | 'theme'
  | 'zoomPercent'
  | 'allTilesInColor'
  | 'titlesAlwaysVisible'
  | 'hideTitles'
  | 'cleanTiles'
  | 'sidebarCollapsed'
  | 'hideChangelogsOnStartup'
  | 'lastChangelogShown'
  | 'experimentalFeatures'
  | 'disableDialogBackdropClose'
  | 'disableAnimations'
  | 'focusRow'
  | 'setLanguage'
  | 'setTheme'
  | 'setZoomPercent'
  | 'setPrimaryFontFamily'
  | 'setSecondaryFontFamily'
  | 'setAllTilesInColor'
  | 'setTitlesAlwaysVisible'
  | 'setHideTitles'
  | 'setCleanTiles'
  | 'setSideBarCollapsed'
  | 'setHideChangelogsOnStartup'
  | 'setLastChangelogShown'
  | 'handleExperimentalFeatures'
  | 'setDisableDialogBackdropClose'
  | 'setDisableAnimations'
  | 'handleFocusRow'
  | 'signInProbeOutcomes'
  | 'dismissedSignInNotices'
  | 'handleDismissSignInNotice'
  | 'handleRearmSignInDismissals'
  | 'completeOAuthLogin'
  | 'currentCustomCategories'
  | 'setCurrentCustomCategories'
  | 'hiddenGames'
  | 'favouriteGames'
  | 'customCategories'
  | 'sideloadedLibrary'
  | 'gameUpdates'
  | 'refresh'
  | 'refreshing'
  | 'refreshingInTheBackground'
  | 'refreshingByRunner'
  | 'refreshLibrary'
  | 'steamMetadataSyncing'
  | 'steamSyncStatus'
  | 'libraryStatus'
  | 'installingEpicGame'

/** Subscribes `onChange` to every bridged store. Lasts for the app's life (D-07). */
export function subscribeBridge(onChange: () => void): void {
  useUiState.subscribe(onChange)
  useSettingsState.subscribe(onChange)
  useAuthState.subscribe(onChange)
  useLibraryState.subscribe(onChange)
}

/** The store-owned context fields, read at call time. */
export function bridgedContextSlice(): Pick<ContextType, BridgedKeys> {
  const ui = useUiState.getState()
  const settings = useSettingsState.getState()
  const auth = useAuthState.getState()
  const library = useLibraryState.getState()
  return {
    platform: ui.platform,
    error: ui.error,
    isFullscreen: ui.isFullscreen,
    isFrameless: ui.isFrameless,
    activeController: ui.activeController,
    connectivity: ui.connectivity,
    dialogModalOptions: ui.dialogModalOptions,
    externalLinkDialogOptions: ui.externalLinkDialogOptions,
    showRedeemKeyDialog: ui.showRedeemKeyDialog,
    showDialogModal: ui.showDialogModal,
    showResetDialog: ui.showResetDialog,
    handleExternalLinkDialog: ui.handleExternalLinkDialog,
    handleRedeemKeyDialog: ui.handleRedeemKeyDialog,
    language: settings.language,
    isRTL: selectIsRTL(settings),
    theme: settings.theme,
    zoomPercent: settings.zoomPercent,
    allTilesInColor: settings.allTilesInColor,
    titlesAlwaysVisible: settings.titlesAlwaysVisible,
    hideTitles: settings.hideTitles,
    cleanTiles: settings.cleanTiles,
    sidebarCollapsed: settings.sidebarCollapsed,
    hideChangelogsOnStartup: settings.hideChangelogsOnStartup,
    lastChangelogShown: settings.lastChangelogShown,
    experimentalFeatures: settings.experimentalFeatures,
    disableDialogBackdropClose: settings.disableDialogBackdropClose,
    disableAnimations: settings.disableAnimations,
    focusRow: settings.focusRow,
    setLanguage: settings.setLanguage,
    setTheme: settings.setTheme,
    setZoomPercent: settings.setZoomPercent,
    setPrimaryFontFamily: settings.setPrimaryFontFamily,
    setSecondaryFontFamily: settings.setSecondaryFontFamily,
    setAllTilesInColor: settings.setAllTilesInColor,
    setTitlesAlwaysVisible: settings.setTitlesAlwaysVisible,
    setHideTitles: settings.setHideTitles,
    setCleanTiles: settings.setCleanTiles,
    setSideBarCollapsed: settings.setSideBarCollapsed,
    setHideChangelogsOnStartup: settings.setHideChangelogsOnStartup,
    setLastChangelogShown: settings.setLastChangelogShown,
    handleExperimentalFeatures: settings.handleExperimentalFeatures,
    setDisableDialogBackdropClose: settings.setDisableDialogBackdropClose,
    setDisableAnimations: settings.setDisableAnimations,
    handleFocusRow: settings.handleFocusRow,
    signInProbeOutcomes: auth.signInProbeOutcomes,
    dismissedSignInNotices: auth.dismissedSignInNotices,
    handleDismissSignInNotice: auth.handleDismissSignInNotice,
    handleRearmSignInDismissals: auth.handleRearmSignInDismissals,
    completeOAuthLogin: auth.completeOAuthLogin,
    currentCustomCategories: library.currentCustomCategories,
    setCurrentCustomCategories: library.setCurrentCustomCategories,
    hiddenGames: composeHiddenGames(library),
    favouriteGames: composeFavouriteGames(library),
    customCategories: composeCustomCategories(library),
    sideloadedLibrary: library.sideloadedLibrary,
    gameUpdates: library.gameUpdates,
    refresh: library.refresh,
    refreshing: library.refreshing,
    refreshingInTheBackground: library.refreshingInTheBackground,
    refreshingByRunner: library.refreshingByRunner,
    refreshLibrary: library.refreshLibrary,
    steamMetadataSyncing: library.steamMetadataSyncing,
    steamSyncStatus: library.steamSyncStatus,
    libraryStatus: library.libraryStatus,
    installingEpicGame: selectInstallingEpicGame(library)
  }
}

/**
 * The epic/gog/amazon/steam/humble composites, built from authState identities
 * plus libraryState's libraries, with the same keys unconverted consumers
 * always saw.
 */
export function bridgedAccounts(): Pick<
  ContextType,
  'epic' | 'gog' | 'amazon' | 'steam' | 'humble'
> {
  const auth = useAuthState.getState()
  const library = useLibraryState.getState()
  return {
    epic: composeEpicAccount(library, auth),
    gog: composeGogAccount(library, auth),
    amazon: composeAmazonAccount(library, auth),
    steam: composeSteamAccount(library, auth),
    humble: composeHumbleAccount(auth)
  }
}
