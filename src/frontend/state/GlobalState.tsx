import React, { PureComponent } from 'react'

import {
  ConnectivityStatus,
  FavouriteGame,
  GameInfo,
  GameStatus,
  HiddenGame,
  RefreshOptions,
  Runner,
  WineVersionInfo,
  LibraryTopSectionOptions,
  ExperimentalFeatures,
  Status
} from 'common/types'
import {
  DialogModalOptions,
  ExternalLinkDialogOptions,
  HelpItem
} from 'frontend/types'
import { withTranslation } from 'react-i18next'
import { getGameInfo, getLegendaryConfig } from '../helpers'
import { i18n, t, TFunction } from 'i18next'

import ContextProvider from './ContextProvider'

import {
  configStore,
  gogConfigStore,
  gogInstalledGamesStore,
  gogLibraryStore,
  libraryStore,
  nileConfigStore,
  nileLibraryStore,
  wineDownloaderInfoStore,
  sideloadLibrary,
  zoomConfigStore,
  zoomInstalledGamesStore,
  zoomLibraryStore,
  steamConfigStore,
  humbleConfigStore
} from '../helpers/electronStores'
import { IpcRendererEvent } from 'electron'
import { NileRegisterData } from 'common/types/nile'
import { HumbleKey, HumbleSyncState } from 'common/types/humble'
import { SteamSyncStatus } from 'common/types/ipc'
import useGlobalState from './GlobalStateV2'
import { handleSteamBottleSetupRequiredSignal } from './SteamBottleSetup'
import { handleSteamClientSetupRequiredSignal } from './SteamClientSetup'
import { handleSteamBridgeSetupRequiredSignal } from './SteamBridgeSetup'
import { performSteamLogout } from './SteamSignOut'
import { createOAuthLoginCompletion } from '../screens/WebView/useTauriOAuthLogin'

const storage: Storage = window.localStorage
const globalSettings = configStore.get_nodefault('settings')

const RTL_LANGUAGES = ['fa', 'ar']

// GAP CYCLE 4 (34.5-33, Routing item 2): `origin` identifies which call site
// triggered a refresh, instrumenting the search for the runner-less
// `refreshLibrary` emitters (candidates: `main.ts:789`'s
// `sendFrontendMessage('refreshLibrary')` and
// `shellFilesFlowRegistration.ts:274`'s `pushFrontendMessage('refreshLibrary')`,
// both Electron/sidecar-side pushes with no runner argument) that produced
// three `Refreshing undefined Library` lines in the 2026-08-01 checkpoint
// session. Kept local to this file rather than added to the shared
// `common/types.ts` RefreshOptions — this plan's files_modified is scoped to
// GlobalState.tsx only; threading `origin` into `common/types.ts` and the
// `window.api.refreshLibrary` preload signature is a follow-up.
type RefreshLibraryOptions = RefreshOptions & { origin?: string }

type T = TFunction<'gamepage'> & TFunction<'translations'>

interface Props {
  children: React.ReactNode
  i18n: i18n
  t: T
}

interface StateProps {
  epic: {
    library: GameInfo[]
    username?: string
  }
  gog: {
    library: GameInfo[]
    username?: string
  }
  amazon: {
    library: GameInfo[]
    user_id?: string
    username?: string
  }
  zoom: {
    library: GameInfo[]
    username?: string
    enabled: boolean
  }
  steam: {
    library: GameInfo[]
    username?: string | null
  }
  humble: {
    isLoggedIn?: boolean
    username?: string | null
    expired?: boolean
    encryptionDegraded?: boolean
    keys?: HumbleKey[]
    syncedAt?: number | null
    syncError?: HumbleSyncState['syncError']
    syncing?: boolean
  }
  wineVersions: WineVersionInfo[]
  error: boolean
  gameUpdates: string[]
  language: string
  libraryStatus: GameStatus[]
  libraryTopSection: string
  platform: NodeJS.Platform
  isIntelMac: boolean
  refreshing: boolean
  refreshingInTheBackground: boolean
  // debug/login-logout-wipes-library: per-runner scoped refresh tracking, kept
  // SEPARATE from the two global flags above. A single-runner refresh (login/
  // logout of ONE platform) writes here instead of `refreshing`/
  // `refreshingInTheBackground` -- those two remain reserved for a genuine
  // all-runners refresh (mount-time load, manual "Refresh Library"), so
  // Library/index.tsx's merged-grid gate never blanks every platform's games
  // just because one platform logged in or out.
  refreshingByRunner: Partial<Record<Runner, boolean>>
  steamMetadataSyncing: boolean
  // Phase 34.15 (34.15-02), D-06: REPLACES the old background-refresh
  // boolean (see the constructor default and its post-refresh reset,
  // `:308`/`:1080` below) as the driver of the Steam sync indicator. That
  // boolean defaults `true` and is reset to `true` after EVERY unscoped
  // refresh, so it never actually means "a refresh is running" -- the old
  // guard reduced to "Steam is logged in AND the Steam library is empty",
  // permanently, on failure and on a genuinely empty library alike. A
  // tri-state makes the terminal state STRUCTURAL rather than a boolean
  // that happens to clear. `refreshingByRunner.steam` was rejected as the
  // carrier because it is a boolean (cannot distinguish "failed" from
  // "succeeded-and-empty"), and the mount-time refresh is UNSCOPED, so it
  // would never be set on the path where the bug reproduces.
  steamSyncStatus: SteamSyncStatus
  hiddenGames: HiddenGame[]
  favouriteGames: FavouriteGame[]
  customCategories: Record<string, string[]>
  currentCustomCategories: string[]
  theme: string
  isFullscreen: boolean
  isFrameless: boolean
  zoomPercent: number
  primaryFontFamily: string
  secondaryFontFamily: string
  allTilesInColor: boolean
  titlesAlwaysVisible: boolean
  sidebarCollapsed: boolean
  activeController: string
  connectivity: { status: ConnectivityStatus; retryIn: number }
  dialogModalOptions: DialogModalOptions
  externalLinkDialogOptions: ExternalLinkDialogOptions
  showRedeemKeyDialog: boolean
  sideloadedLibrary: GameInfo[]
  hideChangelogsOnStartup: boolean
  lastChangelogShown: string | null
  showInstallModal: {
    show: boolean
    gameInfo: GameInfo | null
    appName: string
    runner: Runner
  }
  helpItems: { [key: string]: HelpItem }
  experimentalFeatures: ExperimentalFeatures
  disableDialogBackdropClose: boolean
  disableAnimations: boolean
}

// function to load the new key or fallback to the old one
const loadCurrentCategories = () => {
  const currentCategories = storage.getItem('current_custom_categories') || null
  if (!currentCategories) {
    const currentCategory = storage.getItem('current_custom_category') || null
    if (!currentCategory) {
      return []
    } else {
      return [currentCategory]
    }
  } else {
    return JSON.parse(currentCategories) as string[]
  }
}

import { attachGameOverrides } from '../helpers/gameOverrides'

type GameOverride = NonNullable<GameInfo['overrides']>

const currentOverrides = () => useGlobalState.getState().gameOverrides

const applyGameOverrides = (
  lib: GameInfo[],
  overrides: Record<string, GameOverride> = currentOverrides()
) => attachGameOverrides(lib, overrides)

class GlobalState extends PureComponent<Props> {
  loadLegendaryLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = libraryStore.get('library', [])
    return applyGameOverrides(games, overrides)
  }

  loadGOGLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = gogLibraryStore.get('games', [])

    const installedGames = gogInstalledGamesStore.get('installed', [])
    for (const game of games) {
      for (const installedGame of installedGames) {
        if (installedGame.appName === game.app_name) {
          game.install = installedGame
          game.is_installed = true
        }
      }
    }

    return applyGameOverrides(games, overrides)
  }
  loadAmazonLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = nileLibraryStore.get('library', [])

    return applyGameOverrides(games, overrides)
  }

  loadZoomLibrary = (
    overrides: Record<string, GameOverride> = currentOverrides()
  ): Array<GameInfo> => {
    const games = zoomLibraryStore.get('games', [])
    const installedGames = zoomInstalledGamesStore.get('installed', [])
    for (const game of games) {
      const igame = installedGames.find(
        (igame) => igame.appName === game.app_name
      )
      if (igame) {
        game.install = igame
        game.is_installed = true
      }
    }
    return applyGameOverrides(games, overrides)
  }

  state: StateProps = {
    epic: {
      library: this.loadLegendaryLibrary(),
      username: configStore.get_nodefault('userInfo.displayName')
    },
    gog: {
      library: this.loadGOGLibrary(),
      username: gogConfigStore.get_nodefault('userData.username')
    },
    amazon: {
      library: this.loadAmazonLibrary(),
      user_id: nileConfigStore.get_nodefault('userData.user_id'),
      username: nileConfigStore.get_nodefault('userData.name')
    },
    zoom: {
      library: this.loadZoomLibrary(),
      username: zoomConfigStore.get_nodefault('username'),
      enabled: !!globalSettings?.experimentalFeatures?.zoomPlatform
    },
    steam: {
      library: [],
      username: steamConfigStore.get_nodefault('userData')?.username
    },
    humble: {
      // D-02/D-16: the backend's `isLoggedIn` flag is the connected-state
      // signal (set once the gamekeys endpoint validates a session) — NOT
      // `username`, which only reflects the best-effort identity fetch and
      // is frequently absent (e.g. an identity 404). A connected-but-
      // anonymous account must still show the tile as connected.
      isLoggedIn: humbleConfigStore.get_nodefault('isLoggedIn'),
      username: humbleConfigStore.get_nodefault('userData')?.username,
      // WR-05/D-08: the backend persists `expired` on a 401 health check —
      // read it back so a restart with a known-expired session shows the
      // reconnect state immediately (and even when offline), instead of
      // showing a stale 'Connected' until the network round-trip completes.
      expired: humbleConfigStore.get_nodefault('expired') ?? false,
      encryptionDegraded: humbleConfigStore.get_nodefault('encryptionDegraded'),
      // Phase 11 (Plan 03): keys/sync-state live in humbleLibraryStore /
      // humbleSyncStore (backend), NOT humbleConfigStore — they arrive via
      // IPC (initial fetch on mount + push listeners), never read from a
      // config store at init time.
      keys: [],
      syncedAt: null,
      syncError: 'none',
      syncing: false
    },
    wineVersions: wineDownloaderInfoStore.get('wine-releases', []),
    error: false,
    gameUpdates: [],
    language: this.props.i18n.language,
    libraryStatus: [],
    libraryTopSection: globalSettings?.libraryTopSection || 'disabled',
    platform: window.platform,
    isIntelMac: false,
    refreshing: false,
    refreshingInTheBackground: true,
    refreshingByRunner: {},
    steamMetadataSyncing: false,
    steamSyncStatus: 'idle',
    hiddenGames: configStore.get('games.hidden', []),
    currentCustomCategories: loadCurrentCategories(),
    sidebarCollapsed: JSON.parse(
      storage.getItem('sidebar_collapsed') || 'false'
    ),
    favouriteGames: configStore.get('games.favourites', []),
    customCategories: configStore.get('games.customCategories', {}),
    theme: configStore.get('theme', 'midnightMirage'),
    isFullscreen: false,
    isFrameless: false,
    zoomPercent: configStore.get('zoomPercent', 100),
    secondaryFontFamily:
      configStore.get_nodefault('contentFontFamily') ||
      getComputedStyle(document.documentElement).getPropertyValue(
        '--default-secondary-font-family'
      ),
    primaryFontFamily:
      configStore.get_nodefault('actionsFontFamily') ||
      getComputedStyle(document.documentElement).getPropertyValue(
        '--default-primary-font-family'
      ),
    allTilesInColor: configStore.get('allTilesInColor', false),
    titlesAlwaysVisible: configStore.get('titlesAlwaysVisible', false),
    activeController: '',
    connectivity: { status: 'offline', retryIn: 0 },
    showInstallModal: {
      show: false,
      appName: '',
      runner: 'legendary',
      gameInfo: null
    },
    sideloadedLibrary: applyGameOverrides(sideloadLibrary.get('games', [])),
    dialogModalOptions: { showDialog: false },
    externalLinkDialogOptions: { showDialog: false },
    showRedeemKeyDialog: false,
    hideChangelogsOnStartup: globalSettings?.hideChangelogsOnStartup || false,
    lastChangelogShown: JSON.parse(storage.getItem('last_changelog') || 'null'),
    helpItems: {},
    experimentalFeatures: {
      enableHelp: false,
      cometSupport: true,
      zoomPlatform: false,
      ...(globalSettings?.experimentalFeatures || {})
    },
    disableDialogBackdropClose: configStore.get(
      'disableDialogBackdropClose',
      false
    ),
    disableAnimations: configStore.get('disableAnimations', false)
  }

  setCurrentCustomCategories = (newCustomCategories: string[]) => {
    storage.setItem(
      'current_custom_categories',
      JSON.stringify(newCustomCategories)
    )
    this.setState({ currentCustomCategories: newCustomCategories })
  }

  setLanguage = (newLanguage: string) => {
    this.setState({ language: newLanguage })
    document.querySelector('html')?.setAttribute('lang', newLanguage)
  }

  setTheme = (newThemeName: string) => {
    configStore.set('theme', newThemeName)
    this.setState({ theme: newThemeName })
    window.setTheme(newThemeName)
  }

  zoomTimer: NodeJS.Timeout | undefined = undefined
  setZoomPercent = (newZoomPercent: number) => {
    if (this.zoomTimer) clearTimeout(this.zoomTimer)

    configStore.set('zoomPercent', newZoomPercent)
    this.setState({ zoomPercent: newZoomPercent })

    this.zoomTimer = setTimeout(() => {
      window.api.setZoomFactor((newZoomPercent / 100).toString())
    }, 500)
  }

  setPrimaryFontFamily = (newFontFamily: string, saveToFile = true) => {
    if (saveToFile) configStore.set('actionsFontFamily', newFontFamily)
    document.documentElement.style.setProperty(
      '--primary-font-family',
      newFontFamily
    )
  }

  setSecondaryFontFamily = (newFontFamily: string, saveToFile = true) => {
    if (saveToFile) configStore.set('contentFontFamily', newFontFamily)
    document.documentElement.style.setProperty(
      '--secondary-font-family',
      newFontFamily
    )
  }

  setAllTilesInColor = (value: boolean) => {
    configStore.set('allTilesInColor', value)
    this.setState({ allTilesInColor: value })
  }

  setTitlesAlwaysVisible = (value: boolean) => {
    configStore.set('titlesAlwaysVisible', value)
    this.setState({ titlesAlwaysVisible: value })
  }

  setDisableDialogBackdropClose = (value: boolean) => {
    configStore.set('disableDialogBackdropClose', value)
    this.setState({ disableDialogBackdropClose: value })
  }

  setDisableAnimations = (value: boolean) => {
    configStore.set('disableAnimations', value)
    this.setState({ disableAnimations: value })
  }

  setSideBarCollapsed = (value: boolean) => {
    this.setState({ sidebarCollapsed: value })
  }

  setHideChangelogsOnStartup = (value: boolean) => {
    this.setState({ hideChangelogsOnStartup: value })
  }

  setLastChangelogShown = (value: string) => {
    this.setState({ lastChangelogShown: value })
  }

  hideGame = (appNameToHide: string, appTitle: string) => {
    const newHiddenGames = [
      ...this.state.hiddenGames,
      { appName: appNameToHide, title: appTitle }
    ]

    this.setState({
      hiddenGames: newHiddenGames
    })
    configStore.set('games.hidden', newHiddenGames)
  }

  unhideGame = (appNameToUnhide: string) => {
    const newHiddenGames = this.state.hiddenGames.filter(
      ({ appName }) => appName !== appNameToUnhide
    )

    this.setState({
      hiddenGames: newHiddenGames
    })
    configStore.set('games.hidden', newHiddenGames)
  }

  addGameToFavourites = (appNameToAdd: string, appTitle: string) => {
    const newFavouriteGames = [
      ...this.state.favouriteGames.filter(
        (fav) => fav.appName !== appNameToAdd
      ),
      { appName: appNameToAdd, title: appTitle }
    ]

    this.setState({
      favouriteGames: newFavouriteGames
    })
    configStore.set('games.favourites', newFavouriteGames)
  }

  removeGameFromFavourites = (appNameToRemove: string) => {
    const newFavouriteGames = this.state.favouriteGames.filter(
      ({ appName }) => appName !== appNameToRemove
    )

    this.setState({
      favouriteGames: newFavouriteGames
    })
    configStore.set('games.favourites', newFavouriteGames)
  }

  getCustomCategories = () =>
    Array.from(new Set(Object.keys(this.state.customCategories))).sort()

  getCurrentCustomCategories = () =>
    Array.from(new Set(this.state.currentCustomCategories)).sort()

  setCustomCategory = (newCategory: string) => {
    const newCustomCategories = this.state.customCategories
    newCustomCategories[newCategory] = []

    // when adding a new category, if there are categories selected, select the new
    // one too so the game doesn't disappear form the library
    let newCurrentCustomCategories = this.state.currentCustomCategories
    if (this.state.currentCustomCategories.length > 0) {
      newCurrentCustomCategories = [...newCurrentCustomCategories, newCategory]
    }

    this.setState({
      customCategories: newCustomCategories,
      currentCustomCategories: newCurrentCustomCategories
    })
    configStore.set('games.customCategories', newCustomCategories)
  }

  removeCustomCategory = (category: string) => {
    if (!this.state.customCategories[category]) return

    const newCustomCategories = this.state.customCategories
    delete newCustomCategories[category]
    this.setState({ customCategories: { ...newCustomCategories } })

    const updatedCategories = this.getCurrentCustomCategories().filter(
      (cat) => cat !== category
    )
    this.setCurrentCustomCategories(updatedCategories)
    const numberOfCategories = updatedCategories.length

    if (numberOfCategories < 1) {
      this.setCurrentCustomCategories(['preset_uncategorized'])
    }
    configStore.set('games.customCategories', newCustomCategories)
  }

  renameCustomCategory = (oldName: string, newName: string) => {
    if (!this.state.customCategories[oldName]) return

    const newCustomCategories = this.state.customCategories
    newCustomCategories[newName] = newCustomCategories[oldName]
    delete newCustomCategories[oldName]

    this.setState({ customCategories: { ...newCustomCategories } })
    configStore.set('games.customCategories', newCustomCategories)

    const newCurrentCustomCategories = this.state.currentCustomCategories.map(
      (cat) => (cat === oldName ? newName : cat)
    )
    this.setCurrentCustomCategories(newCurrentCustomCategories)
  }

  addGameToCustomCategory = (category: string, appName: string) => {
    const gamesInCategory = this.state.customCategories[category] || []
    gamesInCategory.push(appName)

    const newCustomCategories = {
      ...this.state.customCategories,
      [category]: gamesInCategory
    }

    this.setState({
      customCategories: newCustomCategories
    })
    configStore.set('games.customCategories', newCustomCategories)
  }

  removeGameFromCustomCategory = (category: string, appName: string) => {
    if (!this.state.customCategories[category]) return

    const newCustomCategories: Record<string, string[]> = {}
    for (const [key, games] of Object.entries(this.state.customCategories)) {
      if (key === category)
        newCustomCategories[key] = games.filter((game) => game !== appName)
      else newCustomCategories[key] = this.state.customCategories[key]
    }

    this.setState({
      customCategories: newCustomCategories
    })
    configStore.set('games.customCategories', newCustomCategories)
  }

  handleShowDialogModal = ({
    showDialog = true,
    ...options
  }: DialogModalOptions) => {
    this.setState({
      dialogModalOptions: { showDialog, ...options }
    })
  }

  showResetDialog = (() => {
    this.handleShowDialogModal({
      title: t('box.reset-heroic.question.title', 'Reset GameLib'),
      message: t(
        'box.reset-heroic.question.message',
        "Are you sure you want to reset GameLib? This will remove all Settings and Caching but won't remove your Installed games or your Epic credentials. Portable versions (AppImage, WinPortable, ...) of GameLib needs to be restarted manually afterwards."
      ),
      buttons: [
        { text: t('box.yes'), onClick: window.api.resetHeroic },
        { text: t('box.no') }
      ]
    })
  }).bind(this)

  handleExternalLinkDialog = (value: ExternalLinkDialogOptions) => {
    this.setState({ externalLinkDialogOptions: value })
  }

  handleRedeemKeyDialog = (show: boolean) => {
    this.setState({ showRedeemKeyDialog: show })
  }

  handleLibraryTopSection = (value: LibraryTopSectionOptions) => {
    this.setState({ libraryTopSection: value })
  }

  handleExperimentalFeatures = (value: ExperimentalFeatures) => {
    this.setState({
      experimentalFeatures: value,
      // WR-10 (pre-existing): `enabled` was assigned the whole (always
      // truthy) ExperimentalFeatures object, so toggling the Zoom feature
      // OFF left zoom.enabled truthy until restart.
      zoom: { ...this.state.zoom, enabled: !!value.zoomPlatform }
    })
  }

  handleSuccessfulLogin = (runner: Runner) => {
    storage.setItem('category', 'all')
    this.refreshLibrary({
      runInBackground: false,
      library: runner,
      origin: 'login-success'
    })
  }

  // Phase 34.5 Plan 26 (F-34.5-G6-02 layer 2, F-34.5-G6-03): `useTauriOAuthLogin.ts` deliberately
  // calls the RAW window.api.login/authGOG/authAmazon/authZoom channels itself (so it keeps
  // owning the UNPORTED_CHANNEL_MARKER catch), so it cannot call epicLogin/gogLogin/amazonLogin/
  // zoomLogin below without invoking the auth channel a second time. This exposes exactly the
  // post-login half of those wrappers -- setState of the signed-in username, then routing
  // through the EXISTING `handleSuccessfulLogin` (never a second, parallel refresh path) -- as a
  // single method on context, built by the exported (and independently unit-tested)
  // `createOAuthLoginCompletion` factory. None of the four wrappers below change.
  completeOAuthLogin = createOAuthLoginCompletion({
    setState: (update) => this.setState(update),
    handleSuccessfulLogin: (runner) => this.handleSuccessfulLogin(runner)
  })

  epicLogin = async (sid: string) => {
    console.log('logging epic')
    const response = await window.api.login(sid)

    if (response.status === 'done') {
      this.setState({
        epic: {
          library: [],
          username: response.data?.displayName
        }
      })

      this.handleSuccessfulLogin('legendary')
    }

    return response.status
  }

  epicLogout = async () => {
    this.setState({ refreshing: true })
    await window.api.logoutLegendary().finally(() => {
      this.setState({
        epic: {
          library: [],
          username: null
        }
      })
    })
    console.log('Logging out from epic')
    this.setState({ refreshing: false })
  }

  gogLogin = async (token: string) => {
    console.log('logging gog')
    const response = await window.api.authGOG(token)

    if (response.status === 'done') {
      this.setState({
        gog: {
          library: [],
          username: response.data?.username
        }
      })

      this.handleSuccessfulLogin('gog')
    }

    return response.status
  }

  gogLogout = async () => {
    window.api.logoutGOG()
    this.setState({
      gog: {
        library: [],
        username: null
      }
    })
    console.log('Logging out from gog')
  }

  amazonLogin = async (data: NileRegisterData) => {
    console.log('logging amazon')
    const response = await window.api.authAmazon(data)

    if (response.status === 'done') {
      this.setState({
        amazon: {
          library: [],
          user_id: response.user?.user_id,
          username: response.user?.name
        }
      })

      this.handleSuccessfulLogin('nile')
    }

    return response.status
  }

  amazonLogout = async () => {
    await window.api.logoutAmazon()
    this.setState({
      amazon: {
        library: [],
        user_id: null,
        username: null
      }
    })
    console.log('Logging out from amazon')
  }

  getAmazonLoginData = async () => window.api.getAmazonLoginData()

  zoomLogin = async (url: string) => {
    console.log('logging zoom')
    const response = await window.api.authZoom(url)

    if (response.status === 'done') {
      const userInfo = await window.api.getZoomUserInfo()
      this.setState({
        zoom: {
          library: [],
          username: userInfo?.username,
          enabled: true
        }
      })

      this.handleSuccessfulLogin('zoom')
    }

    return response.status
  }

  zoomLogout = async () => {
    window.api.logoutZoom()
    this.setState({
      zoom: {
        library: [],
        username: null,
        enabled: true
      }
    })
    console.log('Logging out from zoom')
  }

  steamLogin = async (result: { status: string; username?: string }) => {
    if (result.status === 'done') {
      this.setState({
        steam: {
          library: [],
          username: result.username
        }
      })
      this.refreshLibrary({
        runInBackground: true,
        library: 'steam',
        origin: 'steam-login'
      })
    }
    return result.status
  }

  // Phase 34.4 gap fix (REQ-34.4-02 / live-gate item 2): the earlier
  // G-30-01 mitigation short-circuited this method entirely under Tauri, on
  // the premise that no sidecar listener existed for `logoutSteam` at all.
  // That premise expired the moment Phase 34.4 Plan 01 registered
  // `steamAuthFlowRegistration.ts`'s `ipcMain.on('logoutSteam', ...)` -- the
  // guard survived past that point only because no plan touched this file,
  // leaving the sidecar reachable but permanently unreachable FROM here.
  // `logoutSteam` is still a fire-and-forget `send` with no response
  // protocol, so firing it and immediately wiping local state / reloading
  // -- as this method used to do outright on Electron -- is a race that can
  // silently revert the sign-out on reload (see SteamSignOut.ts's docstring
  // for the full mechanism). `performSteamLogout` closes that race by
  // polling the already-ported `getSteamUserInfo` invoke for confirmation
  // before either branch below runs; it applies to both builds identically.
  steamLogout = async () => {
    await performSteamLogout({
      logoutSteam: window.api.logoutSteam,
      getSteamUserInfo: window.api.getSteamUserInfo,
      onSignedOut: () => {
        this.setState({
          steam: {
            library: [],
            username: null
          }
        })
        console.log('Logging out from steam')
      },
      onSignOutFailed: () => {
        console.warn(
          '[GameLib] logoutSteam did not confirm a signed-out state ' +
            'within the poll window; leaving local state untouched rather ' +
            'than reloading into a possibly-still-signed-in session.'
        )
        this.handleShowDialogModal({
          title: t('login.steam_logout_failed_title', 'Sign-out failed'),
          message: t(
            'login.steam_logout_failed_message',
            "Steam sign-out didn't finish in time. Please try again."
          ),
          buttons: [{ text: t('box.ok', 'OK') }]
        })
      }
    })
  }

  // Humble is not a Runner (v1.2 locked decision) — no library, no
  // refreshLibrary() call. humbleLogin covers both a fresh login and a
  // reconnect-after-expiry (both resolve to the same { status, username }
  // shape from window.api.humbleStartLogin/humbleReconnect).
  humbleLogin = async (result: { status: string; username?: string }) => {
    if (result.status === 'done') {
      this.setState({
        humble: {
          ...this.state.humble,
          // D-02/D-16: 'done' means the gamekeys endpoint already validated
          // the session — that is the connected flag. `username` stays
          // display-only and may legitimately be undefined (identity is
          // best-effort).
          isLoggedIn: true,
          username: result.username,
          expired: false
        }
      })
      // D-23: a successful login/reconnect triggers a sync.
      void window.api.humbleSync()
    }
    return result.status
  }

  // D-03: disconnect is confirmation-gated (blocking modal — correct for a
  // destructive action). The actual wipe (window.api.humbleDisconnect() +
  // clearing local state) only runs if the user confirms.
  humbleDisconnect = async (): Promise<void> => {
    this.handleShowDialogModal({
      title: t('login.humble_disconnect_title', 'Disconnect Humble Bundle?'),
      message: t(
        'login.humble_disconnect_message',
        'This removes your Humble Bundle session from GameLib. You can reconnect at any time.'
      ),
      buttons: [
        {
          text: t('box.yes'),
          onClick: () => {
            window.api.humbleDisconnect()
            this.setState({
              // HumbleUser.disconnect() wipes humbleLibraryStore/humbleSyncStore
              // (Plan 02) — mirror that here so the renderer never shows a
              // stale key inventory for a disconnected account.
              humble: {
                isLoggedIn: false,
                username: null,
                expired: false,
                keys: [],
                syncedAt: null,
                syncError: 'none',
                syncing: false
              }
            })
          }
        },
        { text: t('box.no') }
      ]
    })
  }

  updateGameOverrides = (overrides: Record<string, GameOverride>) => {
    useGlobalState.getState().setGameOverrides(overrides)
    this.setState({
      epic: {
        ...this.state.epic,
        library: this.loadLegendaryLibrary(overrides)
      },
      gog: {
        ...this.state.gog,
        library: this.loadGOGLibrary(overrides)
      },
      zoom: {
        ...this.state.zoom,
        library: this.loadZoomLibrary(overrides)
      },
      amazon: {
        ...this.state.amazon,
        library: this.loadAmazonLibrary(overrides)
      },
      sideloadedLibrary: applyGameOverrides(
        sideloadLibrary.get('games', []),
        overrides
      )
    })
  }

  refresh = async (
    library?: Runner | 'all',
    checkUpdates = false,
    overridesArg?: Record<string, GameOverride>
  ): Promise<void> => {
    console.log('refreshing')

    const { epic, gog, amazon, zoom, gameUpdates } = this.state

    const overrides = overridesArg || currentOverrides()

    // debug/login-logout-wipes-library: `library` names the ONE runner this
    // refresh is scoped to. `undefined` here means "no scope" -- either the
    // caller passed no `library` at all, or explicitly passed `'all'` (both
    // mean the same thing to this function, matching the pre-existing
    // no-argument behavior exactly). Every `includesX` below reads as "no
    // scope => touch everything, same as before this fix".
    const scopedRunner = library && library !== 'all' ? library : undefined
    const includesEpic = !scopedRunner || scopedRunner === 'legendary'
    const includesGog = !scopedRunner || scopedRunner === 'gog'
    const includesZoom = !scopedRunner || scopedRunner === 'zoom'
    const includesAmazon = !scopedRunner || scopedRunner === 'nile'

    let updates = gameUpdates
    if (checkUpdates) {
      try {
        updates = await window.api.checkGameUpdates()
      } catch (error) {
        window.api.logError(`Game update check failed: ${String(error)}`)
      }
    }

    const currentLibraryLength = epic.library?.length

    // Each of the four blocks below asks the same question: "is the CACHE empty, and do we
    // therefore have to go fetch the library?" All four used to also test
    // `!<runner>.library.length` — the length of REACT STATE — and refetch when that was
    // empty even though the cache was full.
    //
    // That second clause was pure cost. React state is only written by the `setState` at
    // the END of this same function, so on any path that deliberately empties state — most
    // obviously a fresh login, where `gogLogin`/`completeOAuthLogin` set
    // `{library: [], username}` before triggering this refresh — it is guaranteed empty
    // here while the cache is already correct. The refetch then went to the network for
    // data the very next line already had in hand.
    //
    // Measured (debug/resolved/gog-login-ui-never-updates.md, live log 2026-08-03):
    // at 01:40:14 the GOG cache held 7 games and React state held 0, so this fired a full
    // second GOG library fetch that finished at 01:40:24 — ~10 seconds, for nothing.
    //
    // Dropping it is safe because freshness is already guaranteed by the CALLER: the
    // post-login path is `handleSuccessfulLogin` -> `refreshLibrary({library: runner})`,
    // whose own `await window.api.refreshLibrary(library)` (see `refreshLibrary` below)
    // has just repopulated the backend store — including for a DIFFERENT account than the
    // cache previously held. A genuinely empty cache still refetches, which is the case
    // this guard exists for.
    //
    // Fixed at all four call sites at once, deliberately. Three of them (epic, zoom,
    // amazon) had no reported symptom — only GOG was diagnosed — but they are the same
    // defect and fixing one would have left three latent.
    //
    // debug/login-logout-wipes-library: each block is now ALSO gated on its
    // `includesX` flag. A runner-scoped call (e.g. `library: 'gog'`) no
    // longer re-reads the other three runners' caches at all — previously
    // pure waste on a scoped call, and now load-bearing: the final
    // `setState` below only writes the slice(s) `includesX` allowed, so a
    // variable that was never (re)computed here must default to the
    // UNCHANGED current value, never an empty/stale placeholder.
    let epicLibrary = epic.library
    if (includesEpic) {
      epicLibrary = libraryStore.get('library', [])
      if (epic.username && !epicLibrary.length) {
        window.api.logInfo('No cache found, getting data from legendary...')
        const { library: legendaryLibrary } = await getLegendaryConfig()
        epicLibrary = legendaryLibrary
      }
    }

    let gogLibrary = gog.library
    if (includesGog) {
      gogLibrary = this.loadGOGLibrary(overrides)
      if (gog.username && !gogLibrary.length) {
        window.api.logInfo('No cache found, getting data from gog...')
        await window.api.refreshLibrary('gog')
        gogLibrary = this.loadGOGLibrary(overrides)
      }
    }

    let zoomLibrary: GameInfo[] = zoom.library
    if (includesZoom && zoom.enabled) {
      zoomLibrary = this.loadZoomLibrary(overrides)
      if (zoom.username && !zoomLibrary.length) {
        window.api.logInfo('No cache found, getting data from zoom...')
        await window.api.refreshLibrary('zoom')
        zoomLibrary = this.loadZoomLibrary(overrides)
      }
    }

    let amazonLibrary = amazon.library
    if (includesAmazon) {
      amazonLibrary = nileLibraryStore.get('library', [])
      if (amazon.user_id && !amazonLibrary.length) {
        window.api.logInfo('No cache found, getting data from nile...')
        await window.api.refreshLibrary('nile')
        amazonLibrary = this.loadAmazonLibrary(overrides)
      }
    }

    const updatedSideload = sideloadLibrary.get('games', [])

    // debug/login-logout-wipes-library: the functional form (matching the
    // existing precedent in `handleGamePush`'s steam branch) reads the
    // LATEST `refreshingByRunner` map at commit time, not the snapshot
    // captured when this async function started — required because two
    // scoped refreshes (e.g. Epic and GOG logging in back-to-back) can have
    // overlapping in-flight windows, and a direct-object merge here would
    // silently drop whichever one's flag got applied first.
    this.setState((prevState: StateProps) => {
      const next: Partial<StateProps> = {
        gameUpdates: updates,
        sideloadedLibrary: applyGameOverrides(updatedSideload, overrides)
      }

      if (includesEpic) {
        next.epic = {
          library: applyGameOverrides(epicLibrary, overrides),
          username: epic.username
        }
      }
      if (includesGog) {
        next.gog = {
          library: gogLibrary,
          username: gog.username
        }
      }
      if (includesZoom) {
        next.zoom = {
          library: zoomLibrary,
          username: zoom.username,
          enabled: zoom.enabled
        }
      }
      if (includesAmazon) {
        next.amazon = {
          library: amazonLibrary,
          user_id: amazon.user_id,
          username: amazon.username
        }
      }

      // debug/login-logout-wipes-library: the final write is scoped exactly
      // like the fetch blocks above. A no-scope ('all'/mount/manual-refresh)
      // call clears the two GLOBAL flags exactly as before this fix. A
      // single-runner call clears ONLY that runner's own `refreshingByRunner`
      // entry — the global flags are never touched, so Library/index.tsx's
      // merged-grid gate (which reads only the two global flags) is
      // completely unaffected by one platform's login/logout finishing.
      if (!scopedRunner) {
        next.refreshing = false
        next.refreshingInTheBackground = true
      } else {
        next.refreshingByRunner = {
          ...prevState.refreshingByRunner,
          [scopedRunner]: false
        }
      }

      return next
    })

    if (currentLibraryLength !== epicLibrary.length) {
      window.api.logInfo('Force Update')
      this.forceUpdate()
    }
  }

  refreshLibrary = async ({
    checkForUpdates,
    runInBackground = true,
    library = undefined,
    origin = 'unknown'
  }: RefreshLibraryOptions): Promise<void> => {
    if (this.state.refreshing) return

    // GAP CYCLE 4 (34.5-33, item 2): this line used to be
    // `Refreshing ${library} Library`, which printed the literal word
    // `undefined` whenever `library` was omitted — indistinguishable from a
    // genuine runner name in a live log. `library ?? 'all'` matches the
    // semantics `window.api.refreshLibrary(undefined)` already carries at
    // main.ts:1051 and (gap cycle 4, plan 34.5-33) now carries in the
    // sidecar handler too — the runner-less case IS "all", never a mystery
    // value. `origin` names the call site so a live log can attribute a
    // refresh to its trigger.
    const runnerScope = library ?? 'all'
    window.api.logInfo(
      `[refreshLibrary] runner=${runnerScope} origin=${origin}`
    )

    // debug/login-logout-wipes-library: a SCOPED call (a specific runner,
    // never `undefined`/`'all'`) tracks its own `refreshingByRunner` entry
    // instead of the two GLOBAL flags below — see `.refresh()`'s matching
    // final `setState` and `StateProps.refreshingByRunner`'s doc comment for
    // why. The guard mirrors the top-of-function `if (this.state.refreshing)
    // return` above, but scoped to this ONE runner, so two overlapping
    // scoped refreshes of the SAME runner (e.g. a double-click) can't step
    // on each other; it does NOT block a DIFFERENT runner's scoped refresh
    // from starting concurrently — that's the whole point of this fix.
    const scopedRunner = library && library !== 'all' ? library : undefined
    if (scopedRunner && this.state.refreshingByRunner[scopedRunner]) return

    if (scopedRunner) {
      this.setState((prevState: StateProps) => ({
        refreshingByRunner: {
          ...prevState.refreshingByRunner,
          [scopedRunner]: true
        }
      }))
    } else {
      this.setState({
        refreshing: true,
        refreshingInTheBackground: runInBackground
      })
    }

    try {
      await window.api.refreshLibrary(library)
      return await this.refresh(library, checkForUpdates)
    } catch (error) {
      window.api.logError(`Library refresh failed: ${String(error)}`)
      // debug/steam-relogin-no-autorefresh: this method's own guard above
      // (`if (this.state.refreshing) return`) means a failure here — from
      // ANY store, not just the one that just errored — permanently wedges
      // every future refreshLibrary() call (including the automatic
      // post-login refresh AND the manual Refresh button in ActionIcons,
      // which calls this exact method) until something outside this
      // function happens to reset `refreshing`. Reset it here so a failed
      // refresh never blocks the next attempt.
      this.setState({ refreshing: false })
      // debug/login-logout-wipes-library: mirror that same never-wedge
      // guarantee for the scoped path — a failed scoped refresh must clear
      // its OWN `refreshingByRunner` entry, or that one runner's future
      // scoped refreshes wedge forever behind the guard just above.
      if (scopedRunner) {
        this.setState((prevState: StateProps) => ({
          refreshingByRunner: {
            ...prevState.refreshingByRunner,
            [scopedRunner]: false
          }
        }))
      }
    }
  }

  handleGameStatus = async ({
    appName,
    status,
    folder,
    context,
    progress,
    runner
  }: GameStatus) => {
    const { libraryStatus, gameUpdates } = this.state
    const currentApp = libraryStatus.find((game) => game.appName === appName)

    // add app to libraryStatus if it was not present
    if (!currentApp) {
      return this.setState({
        libraryStatus: [
          ...libraryStatus,
          { appName, status, folder, context, progress, runner }
        ]
      })
    }

    // if the app's status didn't change, do nothing
    if (currentApp.status === status && currentApp.context === context) {
      return
    }

    // if the app's status did change, remove it from the current list and then handle the new status
    const newLibraryStatus = libraryStatus.filter(
      (game) => game.appName !== appName
    )

    // in these cases we just add the new status
    if (
      [
        'installing',
        'updating',
        'playing',
        'extracting',
        'launching',
        'winetricks',
        'redist',
        'queued'
      ].includes(status)
    ) {
      newLibraryStatus.push({
        appName,
        status,
        folder,
        context,
        progress,
        runner
      })
      this.setState({ libraryStatus: newLibraryStatus })
    }

    // when error or done we remove it from the status info
    if (['error', 'done'].includes(status)) {
      // also remove from updates if it was updating
      if (currentApp.status === 'updating') {
        const updatedGamesUpdates = gameUpdates.filter(
          (game) => game !== appName
        )
        // This avoids calling legendary again before the previous process is killed when canceling
        this.refreshLibrary({
          checkForUpdates: true,
          runInBackground: true,
          library: runner,
          origin: 'game-status'
        })

        storage.setItem('updates', JSON.stringify(updatedGamesUpdates))
        return this.setState({
          gameUpdates: updatedGamesUpdates,
          libraryStatus: newLibraryStatus
        })
      }

      this.refreshLibrary({
        runInBackground: true,
        library: runner,
        origin: 'game-status'
      })

      this.setState({ libraryStatus: newLibraryStatus })
    }
  }

  async componentDidMount() {
    const {
      epic,
      gog,
      amazon,
      zoom,
      gameUpdates = [],
      libraryStatus,
      platform
    } = this.state

    window.api.handleInstallGame(async (e, appName, runner) => {
      const currentApp = libraryStatus.filter(
        (game) => game.appName === appName
      )[0]
      if (!currentApp || (currentApp && currentApp.status !== 'installing')) {
        const gameInfo = await getGameInfo(appName, runner)
        if (!gameInfo || gameInfo.runner === 'sideload') {
          return
        }
        return this.setState({
          showInstallModal: {
            show: true,
            appName,
            runner,
            gameInfo
          }
        })
      }
    })

    window.api.handleGameStatus((e, args) => {
      this.handleGameStatus({ ...args })
    })

    // Phase 17 (17-06), D-07: single global listener that opens the guided
    // bottle-setup flow whenever the backend emits `steamBottleSetupRequired`
    // — fires from EVERY Install/Play entry point (game-details button,
    // library grid, install modal) since they all funnel into
    // window.api.install/launch, which is where the backend decision is
    // made. No frontend eligibility check on gameInfo.is_mac_native is added
    // here or anywhere else (D-11 stays backend-owned).
    window.api.handleSteamBottleSetupRequired(
      handleSteamBottleSetupRequiredSignal
    )

    // Phase 21 (21-10), D-10/D-11: single global listener that opens the
    // native Steam-CLIENT guided-install/prompt-to-launch flow whenever the
    // backend emits `steamClientSetupRequired` — distinct from the bottle
    // listener above (macOS CrossOver bottle flow).
    window.api.handleSteamClientSetupRequired(
      handleSteamClientSetupRequiredSignal
    )

    // Phase 24 (24-09), R7/D-05: single global listener that opens the
    // EXPLICIT bridge-failure dialog whenever the backend emits
    // `steamBridgeSetupRequired` (24-06/24-08) — fires from the bridge
    // install/launch routing branches (installBridgeGame/launchBridgeGame)
    // in SteamGame. Distinct from both listeners above: this is the macOS
    // native Steam-bridge failure surface, offering fall-back-to-bottled or
    // cancel — never a silent auto-fallback, never a dead end.
    window.api.handleSteamBridgeSetupRequired(
      handleSteamBridgeSetupRequiredSignal
    )

    window.api.handleSteamMetadataSyncing((e, { syncing }) => {
      this.setState({ steamMetadataSyncing: syncing })
    })

    // Phase 34.15 (34.15-02), D-06/D-07: mirrors handleSteamMetadataSyncing
    // above. Deliberately does NOT read or touch the old background-refresh
    // flag it replaces (see StateProps.steamSyncStatus doc comment). The
    // payload's `reason` is not stored here; the resolver's mode is what
    // drives rendering (Plan 06) and the notice copy is reason-agnostic in
    // its first form.
    window.api.handleSteamSyncStatus((e, { status }) => {
      this.setState({ steamSyncStatus: status })
    })

    window.api.handleRefreshLibrary((e, runner) => {
      this.refreshLibrary({
        checkForUpdates: false,
        runInBackground: true,
        library: runner,
        origin: 'push'
      })
    })

    window.api.handleMetadataChanged((e, overrides) => {
      this.updateGameOverrides(overrides)
    })

    // Phase 19 (Plan 06), D-11/D-16: pushed after a validated background
    // CrossOver-index refresh so the grid's `crossoverRatings` slice updates
    // without a manual pull. This is the only IPC round-trip involved —
    // painting a card never fires its own request (D-11/D-13). WR-05: the
    // backend (`refreshCrossoverRatingMap()` in main.ts) now re-fires this
    // event after every `refreshLibrary` completion too — not just at
    // startup — so a game added mid-session (a background Steam sync, a
    // manual "Refresh Library") gets a badge/filter signal without a
    // restart. This listener needed no change to pick that up.
    window.api.handleCrossoverIndexChanged((e, index) => {
      useGlobalState.getState().setCrossoverRatings(index)
    })

    // One-time pull on mount so the grid paints on first load without
    // waiting for the next background refresh's push.
    window.api
      .getCrossoverIndex()
      .then((index) => useGlobalState.getState().setCrossoverRatings(index))
      .catch((error) =>
        window.api.logError(`CrossOver index pull failed: ${String(error)}`)
      )

    // D-09: state-only listener — never opens a dialog/modal directly. The
    // non-blocking expiry toast (HumbleExpiryToast) reacts to the resulting
    // `expired` state transition on its own.
    window.api.handleHumbleAuthState((e, humbleState) => {
      this.setState((prevState: StateProps) => ({
        humble: {
          ...prevState.humble,
          isLoggedIn: humbleState.isLoggedIn,
          username: humbleState.username ?? prevState.humble.username,
          expired: !!humbleState.expired
        }
      }))
    })

    // Phase 11 (Plan 03): pushed by HumbleLibrary.sync()/loadCached() with
    // the display-safe key inventory — never the generic storeGet bridge
    // (WR-09). Keys ONLY: this event fires after EVERY committed order
    // (D-26 progressive fill), so it must NOT touch `syncing` — doing so
    // made the Keys header thrash between "Syncing…" and the freshness line
    // once per order (live-UAT round 2). End-of-sync is signalled solely by
    // humbleSyncStateChanged below.
    window.api.handleHumbleKeysUpdated((e, keys) => {
      this.setState((prevState: StateProps) => ({
        humble: { ...prevState.humble, keys }
      }))
    })

    // Phase 11 (Plan 03): progressive-fill sync progress (D-26) — counts
    // only, no cookie/key values.
    window.api.handleHumbleSyncProgress((e, { done, total }) => {
      this.setState((prevState: StateProps) => ({
        humble: { ...prevState.humble, syncing: done < total }
      }))
    })

    // Live-UAT round 2 (D-31/D-32): terminal sync-state push, emitted on
    // EVERY sync() exit path. The single authoritative end-of-sync signal:
    // updates the freshness timestamp + fail-soft banner in-session (they
    // were previously stale from the one mount-time fetch) and force-clears
    // `syncing` (covers aborted syncs whose last progress had done < total).
    window.api.handleHumbleSyncStateChanged((e, syncState) => {
      this.setState((prevState: StateProps) => ({
        humble: {
          ...prevState.humble,
          syncedAt: syncState.syncedAt,
          syncError: syncState.syncError,
          syncing: false
        }
      }))
    })

    // D-08/D-23: this is the expiry-detection trigger, now chained into a
    // sync (Phase 11) so an already-expired session never syncs — the health
    // check must resolve first. Fire-and-forget — the backend pushes
    // humbleAuthState/humbleKeysUpdated/humbleSyncProgress as each stage
    // resolves, so we don't block mount waiting on it. Gated on `isLoggedIn`
    // (the connected flag), NOT `username` — a connected-but-anonymous
    // account (identity fetch failed) must still get the startup health
    // check + sync.
    if (this.state.humble.isLoggedIn) {
      void window.api.humbleCheckHealth().then(() => window.api.humbleSync())
    }

    // Phase 11 (Plan 03): cache-then-sync (D-23) — render whatever is
    // already on disk immediately on mount, independent of whether a sync
    // ever runs (e.g. an expired session still shows its last-known-good
    // cache per HSYNC-04).
    void window.api.humbleGetKeys().then((keys) => {
      this.setState((prevState: StateProps) => ({
        humble: { ...prevState.humble, keys }
      }))
    })
    void window.api.humbleGetSyncState().then((syncState) => {
      this.setState((prevState: StateProps) => ({
        humble: {
          ...prevState.humble,
          syncedAt: syncState.syncedAt,
          syncError: syncState.syncError
        }
      }))
    })

    window.api.handleGamePush((e: IpcRendererEvent, args: GameInfo) => {
      if (!args.app_name) return
      if (args.runner === 'gog') {
        const library = [...this.state.gog.library]
        const index = library.findIndex(
          (game) => game.app_name === args.app_name
        )
        if (index !== -1) {
          library[index] = args
        } else {
          library.push(args)
        }
        this.setState({
          gog: {
            library: [...library],
            username: this.state.gog.username
          }
        })
      } else if (args.runner === 'zoom') {
        // Handle Zoom game push
        const library = [...this.state.zoom.library]
        const index = library.findIndex(
          (game) => game.app_name === args.app_name
        )
        if (index !== -1) {
          library[index] = args
        } else {
          library.push(args)
        }
        this.setState({
          zoom: {
            library: [...library],
            username: this.state.zoom.username,
            enabled: true
          }
        })
      } else if (args.runner === 'steam') {
        this.setState((prevState: StateProps) => {
          const library = [...prevState.steam.library]
          const index = library.findIndex(
            (game) => game.app_name === args.app_name
          )
          if (index !== -1) {
            library[index] = args
          } else {
            library.push(args)
          }
          return {
            steam: {
              library,
              username: prevState.steam.username
            }
          }
        })
      }
    })

    if (platform === 'darwin') {
      this.setState({ isIntelMac: await window.api.isIntelMac() })
    }

    this.setState({
      isFullscreen: await window.api.isFullscreen(),
      isFrameless: await window.api.isFrameless()
    })
    window.api.handleFullscreen(
      (e: IpcRendererEvent, isFullscreen: boolean) => {
        this.setState({ isFullscreen })
      }
    )

    const legendaryUser = configStore.has('userInfo')
    const gogUser = gogConfigStore.has('userData')
    const amazonUser = nileConfigStore.has('userData')
    const zoomUser = zoomConfigStore.has('isLoggedIn')
    // debug/steam-refresh-hung-on-startup: a Steam-only login (no Epic/GOG/
    // Amazon/Zoom account) was previously excluded from the mount-time
    // "refresh everything" gate below entirely, so SteamLibraryManager.refresh()
    // never ran on startup and the "Syncing your Steam library…" spinner
    // (true by default: steam.username seeded synchronously above,
    // refreshingInTheBackground defaults true, steam.library starts empty)
    // spun forever with no errors, since nothing was ever running to clear it.
    const steamUser = steamConfigStore.has('userData')

    if (legendaryUser) {
      await window.api.getUserInfo()
    }

    if (amazonUser) {
      await window.api.getAmazonUserInfo()
    }

    if (zoom.enabled && zoomUser) {
      await window.api.getZoomUserInfo()
    }

    if (!gameUpdates.length) {
      const storedGameUpdates = JSON.parse(storage.getItem('updates') || '[]')
      this.setState({ gameUpdates: storedGameUpdates })
    }

    if (
      legendaryUser ||
      gogUser ||
      amazonUser ||
      steamUser ||
      (zoom.enabled && zoomUser)
    ) {
      this.refreshLibrary({
        checkForUpdates: true,
        runInBackground:
          epic.library.length !== 0 ||
          gog.library.length !== 0 ||
          amazon.library.length !== 0 ||
          ((this.state.zoom.enabled && zoom.library) || []).length !== 0,
        origin: 'mount'
      })
    }

    window.addEventListener(
      'controller-changed',
      (e: CustomEvent<{ controllerId: string }>) => {
        document.body.classList.toggle(
          'controllerLayout',
          e.detail.controllerId !== ''
        )
        this.setState({ activeController: e.detail.controllerId })
      }
    )

    // listen to custom connectivity-changed event to update state
    window.api.onConnectivityChanged((_, connectivity) => {
      this.setState({ connectivity })
    })

    // get the current status
    window.api
      .getConnectivityStatus()
      .then((connectivity) => this.setState({ connectivity }))

    this.setPrimaryFontFamily(this.state.primaryFontFamily, false)
    this.setSecondaryFontFamily(this.state.secondaryFontFamily, false)

    window.api.frontendReady()
  }

  componentDidUpdate() {
    const {
      gameUpdates,
      libraryStatus,
      sidebarCollapsed,
      hideChangelogsOnStartup,
      lastChangelogShown,
      language
    } = this.state

    const isRTL = RTL_LANGUAGES.includes(language)
    document.body.classList.toggle('isRTL', isRTL)

    storage.setItem('updates', JSON.stringify(gameUpdates))
    storage.setItem('sidebar_collapsed', JSON.stringify(sidebarCollapsed))
    storage.setItem('hide_changelogs', JSON.stringify(hideChangelogsOnStartup))
    storage.setItem('last_changelog', JSON.stringify(lastChangelogShown))

    const allowedPendingOps: Status[] = [
      'installing',
      'updating',
      'launching',
      'playing',
      'redist',
      'winetricks',
      'extracting',
      'repairing',
      'moving',
      'syncing-saves',
      'uninstalling'
    ]

    const pendingOps = libraryStatus.filter((game) =>
      allowedPendingOps.includes(game.status)
    ).length
    const playing =
      libraryStatus.filter((game) => game.status === 'playing').length > 0

    if (pendingOps) {
      window.api.lock(playing)
    } else {
      window.api.unlock()
    }
  }

  addHelpItem = (helpItemId: string, helpItem: HelpItem) => {
    this.setState((previous: StateProps) => {
      const newItems = { ...previous.helpItems }
      newItems[helpItemId] = helpItem
      return { helpItems: newItems }
    })
  }

  removeHelpItem = (helpItemId: string) => {
    this.setState((previous: StateProps) => {
      delete previous.helpItems[helpItemId]
      return { helpItems: { ...previous.helpItems } }
    })
  }

  render() {
    const {
      language,
      epic,
      gog,
      amazon,
      zoom,
      steam,
      humble,
      favouriteGames,
      customCategories,
      hiddenGames,
      hideChangelogsOnStartup,
      lastChangelogShown,
      libraryStatus
    } = this.state
    const isRTL = RTL_LANGUAGES.includes(language)

    const installingEpicGame = libraryStatus.some(
      (game) => game.status === 'installing' && game.runner === 'legendary'
    )

    return (
      <ContextProvider.Provider
        value={{
          ...this.state,
          completeOAuthLogin: this.completeOAuthLogin,
          epic: {
            library: epic.library,
            username: epic.username,
            login: this.epicLogin,
            logout: this.epicLogout
          },
          gog: {
            library: gog.library,
            username: gog.username,
            login: this.gogLogin,
            logout: this.gogLogout
          },
          amazon: {
            library: amazon.library,
            user_id: amazon.user_id,
            username: amazon.username,
            getLoginData: this.getAmazonLoginData,
            login: this.amazonLogin,
            logout: this.amazonLogout
          },
          zoom: {
            library: this.state.zoom.enabled ? zoom.library : [],
            username: this.state.zoom.enabled ? zoom.username : undefined,
            login: this.zoomLogin,
            logout: this.zoomLogout,
            enabled: this.state.zoom.enabled
          },
          steam: {
            library: steam.library,
            username: steam.username,
            login: this.steamLogin,
            logout: this.steamLogout
          },
          humble: {
            isLoggedIn: humble.isLoggedIn,
            username: humble.username,
            expired: humble.expired,
            encryptionDegraded: humble.encryptionDegraded,
            keys: humble.keys,
            syncedAt: humble.syncedAt,
            syncError: humble.syncError,
            syncing: humble.syncing,
            login: this.humbleLogin,
            logout: this.humbleDisconnect
          },
          installingEpicGame,
          setLanguage: this.setLanguage,
          isRTL,
          refresh: this.refresh,
          refreshLibrary: this.refreshLibrary,
          hiddenGames: {
            list: hiddenGames,
            add: this.hideGame,
            remove: this.unhideGame
          },
          favouriteGames: {
            list: favouriteGames,
            add: this.addGameToFavourites,
            remove: this.removeGameFromFavourites
          },
          customCategories: {
            list: customCategories,
            listCategories: this.getCustomCategories,
            addToGame: this.addGameToCustomCategory,
            removeFromGame: this.removeGameFromCustomCategory,
            addCategory: this.setCustomCategory,
            removeCategory: this.removeCustomCategory,
            renameCategory: this.renameCustomCategory
          },
          handleLibraryTopSection: this.handleLibraryTopSection,
          handleExperimentalFeatures: this.handleExperimentalFeatures,
          setTheme: this.setTheme,
          setZoomPercent: this.setZoomPercent,
          setAllTilesInColor: this.setAllTilesInColor,
          setTitlesAlwaysVisible: this.setTitlesAlwaysVisible,
          setSideBarCollapsed: this.setSideBarCollapsed,
          setPrimaryFontFamily: this.setPrimaryFontFamily,
          setSecondaryFontFamily: this.setSecondaryFontFamily,
          showDialogModal: this.handleShowDialogModal,
          showResetDialog: this.showResetDialog,
          handleExternalLinkDialog: this.handleExternalLinkDialog,
          showRedeemKeyDialog: this.state.showRedeemKeyDialog,
          handleRedeemKeyDialog: this.handleRedeemKeyDialog,
          hideChangelogsOnStartup: hideChangelogsOnStartup,
          setHideChangelogsOnStartup: this.setHideChangelogsOnStartup,
          lastChangelogShown: lastChangelogShown,
          setLastChangelogShown: this.setLastChangelogShown,
          setCurrentCustomCategories: this.setCurrentCustomCategories,
          help: {
            items: this.state.helpItems,
            addHelpItem: this.addHelpItem,
            removeHelpItem: this.removeHelpItem
          },
          setDisableDialogBackdropClose: this.setDisableDialogBackdropClose,
          disableAnimations: this.state.disableAnimations,
          setDisableAnimations: this.setDisableAnimations
        }}
      >
        {this.props.children}
      </ContextProvider.Provider>
    )
  }
}

export default withTranslation()(GlobalState)
