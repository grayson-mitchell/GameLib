import { initImagesCache } from './images_cache'
import { fetchLastestReleases } from './utils/releases'
import { DiskSpaceData, StatusPromise, WineInstallation } from 'common/types'
import * as path from 'path'
import {
  BrowserWindow,
  Menu,
  app,
  dialog,
  powerSaveBlocker,
  protocol,
  screen,
  clipboard,
  session
} from 'electron'
import {
  addHandler,
  addListener,
  addOneTimeListener,
  sendFrontendMessage
} from 'backend/ipc'
import 'backend/updater'
import 'backend/discounts'
import 'backend/storeSearch'
import { autoUpdater } from 'electron-updater'
import { cpus } from 'os'
import { existsSync, watch } from 'graceful-fs'
import 'source-map-support/register'

import Backend from 'i18next-fs-backend'
import i18next from 'i18next'
import { join } from 'path'
import { DXVK, Winetricks } from './tools'
import { GameConfig } from './game_config'
import { GlobalConfig } from './config'
import { LegendaryUser } from 'backend/storeManagers/legendary/user'
import { GOGUser } from './storeManagers/gog/user'
import gogPresence from './storeManagers/gog/presence'
import { NileUser } from './storeManagers/nile/user'
import { ZoomUser } from './storeManagers/zoom/user'
import { SteamUser } from './storeManagers/steam/user'
import { noteRefreshTrigger } from './storeManagers/steam/authTrigger'
import { stopRunningPoll } from './storeManagers/steam/library'
import { library as steamLibrary } from './storeManagers/steam/state'
import {
  steamBottleConfigStore,
  steamSyncStore
} from './storeManagers/steam/electronStores'
import { getSteamInstallSize } from './storeManagers/steam/games'
import { listSteamLibraryTargets } from './storeManagers/steam/installLocation'
import { isSteamNativeInstallEnabled } from './storeManagers/steam/nativeInstallSetting'
import {
  ensureSteamClientReady,
  startGuidedClientInstall
} from './storeManagers/steam/clientSetup'
import {
  isBottleProvisioned,
  provisionBottle
} from './storeManagers/steam/bottle'
import { DEFAULT_STEAM_BOTTLE_NAME } from './storeManagers/steam/constants'
import {
  getSteamBottleEligibilityVerdict,
  persistInstallFormWineVersion
} from './storeManagers/steam/installFormIpc'
import { removeAllSteamInstallCopies } from './storeManagers/steam/removeAllCopies'
import { shutdownBridgeHelper } from './storeManagers/steam/bridge/helperProcess'
import { registerHumbleIpcHandlers } from './humble/ipc_handler'
import { runHumbleValidation } from './humble/validation'
import { HumbleLibrary } from './humble/library'
import {
  clearCache,
  isEpicServiceOffline,
  handleExit,
  openUrlOrFile,
  resetHeroic,
  showAboutWindow,
  showItemInFolder,
  getFileSize,
  detectVCRedist,
  getShellPath,
  removeFolder,
  downloadDefaultWine,
  sendGameStatusUpdate,
  checkRosettaInstall,
  writeConfig,
  createNecessaryFolders,
  clearAchievementCache,
  getGame
} from './utils'
import { startPlausible } from './utils/plausible'

import {
  getDiskInfo,
  isAccessibleWithinFlatpakSandbox,
  isWritable
} from './utils/filesystem'

import { Path } from './schemas'

import { uninstallGameCallback } from './utils/uninstaller'
import { checkGameUpdates } from './utils/checkGameUpdates'
import { openDialogCallback } from './utils/openDialog'
import { handleProtocol, shouldHideWindowForProtocolArgs } from './protocol'
import {
  init as initLogger,
  logDebug,
  logError,
  logInfo,
  LogPrefix,
  logWarning
} from './logger'
import {
  launchEventCallback,
  runWineCommand,
  validWine
} from './launcher'
import { readKnownFixes } from './knownFixes'
import { initQueue } from './downloadmanager/downloadqueue'
import {
  initOnlineMonitor,
  isOnline,
  runOnceWhenOnline
} from './online_monitor'
import { notify, showDialogBoxModalAuto } from './dialog/dialog'
import { getDefaultSavePath } from './save_sync'
import { initTrayIcon } from './tray_icon/tray_icon'
import { createMainWindow, getMainWindow, isFrameless } from './main_window'

import { playtimeSyncQueue } from './storeManagers/gog/electronStores'
import { initStoreManagers, libraryManagerMap } from './storeManagers'
import { getGameOverrides, getAllGameOverrides } from './game_overrides'
import {
  isGameAvailable,
  getGameInfo,
  getExtraInfo,
  getGameSettings,
  getInstallInfo,
  kill,
  repair,
  changeInstallPath,
  getLaunchOptions,
  changeGameVersionPinnedStatus,
  getGameOverride,
  getGameSdl,
  readConfig,
  addNewApp,
  getAvailableCyberpunkMods,
  setCyberpunkModConfig
} from './gamedetails/dispatch'
import {
  setGameMetadataOverride,
  setMetadataChangedNotifier
} from './gamedetails/overrides'
import { buildCrossoverRatingMap } from './crossover_index/crossoverRatingMap'
import { configStore } from './constants/key_value_stores'
import {
  customThemesWikiLink,
  discordLink,
  epicLoginUrl,
  githubSponsorsPage,
  heroicGithubURL,
  kofiPage,
  sidInfoUrl,
  supportURL,
  weblateUrl,
  wikiLink,
  wineprefixFAQ
} from './constants/urls'
import { legendaryInstalled } from './storeManagers/legendary/constants'
import {
  isCLIConsoleMode,
  isCLIFullscreen,
  isCLINoGui,
  isFlatpak,
  isIntelMac,
  isLinux,
  isMac,
  isSnap,
  isSteamDeckGameMode,
  isWindows
} from './constants/environment'
import {
  configPath,
  gamesConfigPath,
  publicDir,
  userHome,
  webviewPreloadPath,
  windowIcon
} from './constants/paths'
import { supportedLanguages } from 'common/languages'
import MigrationSystem from './migration'

// D-07/D-08 (Phase 34.1 Plan 02): extracted, Electron-free app-shell handler
// bodies -- the sidecar imports these same modules directly. These
// registrations below stay one-line delegations so the registration site
// remains auditable in one place.
import {
  getCustomThemes,
  getThemeCSS,
  getCustomCSS
} from './appshell/themes'
import {
  getLatestReleasesForStartup,
  getCurrentChangelogEntry
} from './appshell/releases'
import { changeLanguage } from './appshell/language'

// D-01/D-03 (Phase 34.2 Plan 02): installs the Electron-side metadataChanged
// push for gamedetails/overrides.ts's setGameMetadataOverride, making it
// byte-equivalent to the pre-extraction `sendFrontendMessage('metadataChanged',
// getAllGameOverrides())` call it replaces.
setMetadataChangedNotifier((overrides) =>
  sendFrontendMessage('metadataChanged', overrides)
)

if (isLinux) app.commandLine?.appendSwitch('--gtk-version', '3')

async function initializeWindow(): Promise<BrowserWindow> {
  createNecessaryFolders()
  configStore.set('userHome', userHome)
  const mainWindow = createMainWindow()

  if ((isSteamDeckGameMode || isCLIFullscreen) && !isCLINoGui) {
    logInfo(
      [
        isSteamDeckGameMode
          ? 'GameLib started via Steam-Deck gamemode.'
          : 'GameLib started with --fullscreen',
        'Switching to fullscreen'
      ],
      LogPrefix.Backend
    )
    mainWindow.setFullScreen(true)
  }

  setTimeout(async () => {
    // Will download Wine/GPTK if none was found
    const availableWine = await GlobalConfig.get().getAlternativeWine()
    let shouldDownloadWine = !availableWine.length

    if (isMac && !isIntelMac) {
      const toolkitDownloaded = availableWine.some(
        (wine) => wine.type === 'toolkit'
      )

      if (!toolkitDownloaded) {
        shouldDownloadWine = true
      }
    }

    void DXVK.getLatest()

    Winetricks.download()
    if (shouldDownloadWine) {
      downloadDefaultWine()
    }

    if (isMac) {
      checkRosettaInstall()
    }
  }, 2500)

  const globalConf = GlobalConfig.get().getSettings()

  mainWindow.setIcon(windowIcon)
  app.commandLine.appendSwitch('enable-spatial-navigation')

  mainWindow.on('maximize', () => sendFrontendMessage('maximized'))
  mainWindow.on('unmaximize', () => sendFrontendMessage('unmaximized'))
  mainWindow.on('enter-full-screen', () =>
    sendFrontendMessage('fullscreen', true)
  )
  mainWindow.on('leave-full-screen', () =>
    sendFrontendMessage('fullscreen', false)
  )
  // Reconcile Steam install badges when the user tabs back to GamerLib (D-01/D-02).
  // No background polling — only on focus. The focus handler passes no renderer
  // input into refreshInstallState (it takes no args), so there is no untrusted
  // input surface (T-03-03). Other runners don't implement refreshInstallState,
  // so optional chaining makes this a safe no-op for Epic/GOG/Amazon.
  mainWindow.on('focus', () => {
    void libraryManagerMap['steam']?.refreshInstallState?.()
  })
  mainWindow.on('close', async (e) => {
    e.preventDefault()

    if (!isCLIFullscreen && !isSteamDeckGameMode) {
      // store windows properties
      configStore.set('window-props', {
        ...mainWindow.getBounds(),
        maximized: mainWindow.isMaximized()
      })
    }

    const { exitToTray, noTrayIcon } = GlobalConfig.get().getSettings()

    if (exitToTray && !noTrayIcon) {
      logInfo('Exiting to tray instead of quitting', LogPrefix.Backend)
      return mainWindow.hide()
    }

    handleExit()
  })

  detectVCRedist(mainWindow)

  const startHash =
    isCLIConsoleMode || globalConf.startInConsoleMode ? '/console' : undefined

  if (process.env.ELECTRON_RENDERER_URL) {
    const devUrl = startHash
      ? `${process.env.ELECTRON_RENDERER_URL}#${startHash}`
      : process.env.ELECTRON_RENDERER_URL
    mainWindow.loadURL(devUrl)
    // Open the DevTools.
    mainWindow.webContents.openDevTools()
  } else {
    Menu.setApplicationMenu(null)
    mainWindow.loadFile(
      join(publicDir, 'index.html'),
      startHash ? { hash: startHash } : undefined
    )
    if (globalConf.checkForUpdatesOnStartup) {
      autoUpdater.checkForUpdates()
    }
  }

  // Changelog links workaround
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const pattern = app.isPackaged ? publicDir : 'localhost:5173'
    if (!url.match(pattern)) {
      event.preventDefault()
      openUrlOrFile(url)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    const pattern = app.isPackaged ? publicDir : 'localhost:5173'
    return { action: !details.url.match(pattern) ? 'allow' : 'deny' }
  })

  addListener('setZoomFactor', async (event, zoomFactor) => {
    const factor = processZoomForScreen(parseFloat(zoomFactor))
    mainWindow.webContents.setZoomLevel(factor)
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  })

  function applyZoom() {
    const zoomFactor = processZoomForScreen(
      configStore.get('zoomPercent', 100) / 100
    )
    mainWindow.webContents.setZoomLevel(zoomFactor)
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
  }

  mainWindow.on('maximize', applyZoom)
  mainWindow.on('unmaximize', applyZoom)
  mainWindow.on('restore', applyZoom)
  mainWindow.on('enter-full-screen', applyZoom)
  mainWindow.on('leave-full-screen', applyZoom)
  mainWindow.webContents.on('did-navigate', applyZoom)

  return mainWindow
}

/**
 * WR-05 fix: `buildCrossoverRatingMap()` was previously only ever invoked
 * from `app.whenReady()` (once, at startup) and from the `getCrossoverIndex`
 * one-time renderer pull on mount — nothing tied it to a library-membership
 * change. A game purchased/installed/synced into the library after startup
 * (e.g. a background Steam metadata sync, or a manual "Refresh Library")
 * was therefore permanently absent from `crossoverRatings` for the rest of
 * the session. Extracted here so it can be re-invoked, fire-and-forget,
 * from both the startup path and the `refreshLibrary` handler below —
 * mirroring the existing `metadataChanged` push-after-mutation pattern.
 */
function refreshCrossoverRatingMap() {
  buildCrossoverRatingMap()
    .then((index) => sendFrontendMessage('crossoverIndexChanged', index))
    .catch((error) =>
      logError(
        ['Failed to build CrossOver rating map', error],
        LogPrefix.Backend
      )
    )
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
const gotTheLock = app.requestSingleInstanceLock()
let openUrlArgument = ''

const processZoomForScreen = (zoomFactor: number) => {
  const screenSize = screen.getPrimaryDisplay().workAreaSize.width
  if (screenSize < 1200) {
    const extraDPIZoomIn = screenSize / 1200
    return (zoomFactor * extraDPIZoomIn - 1) / 0.2
  } else {
    return (zoomFactor - 1) / 0.2
  }
}

if (!gotTheLock) {
  console.log('GameLib is already running, quitting this instance')
  app.quit()
} else {
  app.on('second-instance', (event, argv) => {
    // Someone tried to run a second instance, we should focus our window.
    const mainWindow = getMainWindow()
    if (!shouldHideWindowForProtocolArgs(argv)) {
      mainWindow?.show()
    }

    handleProtocol(argv)
  })
  app.whenReady().then(async () => {
    initLogger()

    await MigrationSystem.get().applyMigrations()

    initOnlineMonitor()
    initStoreManagers()
    initImagesCache()

    // Phase 19 (Plan 06), D-11/D-16: a validated background CrossOver-index
    // refresh resolves the full three-state rating map once at startup and
    // pushes it so the grid's `crossoverRatings` slice updates without the
    // renderer needing to issue a manual pull. Fire-and-forget — never
    // blocks readiness, and never fires on the `getCrossoverIndex` pull path
    // (that handler already returns its own freshly resolved map). Also
    // re-invoked from the `refreshLibrary` handler below (WR-05) so a game
    // added mid-session picks up a badge/filter signal without a restart.
    refreshCrossoverRatingMap()

    // Add User-Agent Client hints to behave like Windows
    if (process.argv.includes('--spoof-windows')) {
      session.defaultSession.webRequest.onBeforeSendHeaders(
        (details, callback) => {
          details.requestHeaders['sec-ch-ua-platform'] = 'Windows'
          callback({ cancel: false, requestHeaders: details.requestHeaders })
        }
      )
    }

    // try to fix notification app name on windows
    if (isWindows) {
      app.setAppUserModelId('GameLib')
    }

    runOnceWhenOnline(async () => {
      const isLoggedIn = LegendaryUser.isLoggedIn()

      if (!isLoggedIn) {
        logInfo('User Not Found, removing it from Store', {
          prefix: LogPrefix.Backend,
          forceLog: true
        })
        configStore.delete('userInfo')
      }

      // Update user details
      if (GOGUser.isLoggedIn()) {
        GOGUser.getUserDetails()
      }
    })

    const settings = GlobalConfig.get().getSettings()

    if (settings && settings.analyticsOptIn === true) {
      startPlausible()
    }

    if (settings?.disableSmoothScrolling) {
      app.commandLine.appendSwitch('disable-smooth-scrolling')
    }

    // Make sure lock is not present when starting up
    playtimeSyncQueue.delete('lock')
    if (!settings.disablePlaytimeSync) {
      runOnceWhenOnline(() => libraryManagerMap['gog'].syncQueuedPlaytime())
    } else {
      logDebug('Skipping playtime sync queue upload - playtime sync disabled', {
        prefix: LogPrefix.Backend
      })
    }
    runOnceWhenOnline(gogPresence.setPresence)
    await i18next.use(Backend).init({
      backend: {
        addPath: path.join(publicDir, 'locales', '{{lng}}', '{{ns}}'),
        allowMultiLoading: false,
        loadPath: path.join(publicDir, 'locales', '{{lng}}', '{{ns}}.json')
      },
      debug: false,
      returnEmptyString: false,
      returnNull: false,
      fallbackLng: 'en',
      lng: settings.language,
      supportedLngs: supportedLanguages
    })

    const mainWindow = await initializeWindow()

    protocol.handle('gamelib', (request) => {
      handleProtocol([request.url])
      return new Response('Operation initiated.', { status: 201 })
    })
    if (process.env.CI !== 'e2e' && !app.isDefaultProtocolClient('gamelib')) {
      if (app.setAsDefaultProtocolClient('gamelib')) {
        logInfo('Registered protocol with OS.', LogPrefix.Backend)
      } else {
        logWarning('Failed to register protocol with OS.', LogPrefix.Backend)
      }
    } else {
      logWarning('Protocol already registered.', LogPrefix.Backend)
    }

    const hideForProtocol = shouldHideWindowForProtocolArgs([
      openUrlArgument,
      ...process.argv
    ])
    const headless =
      isCLINoGui ||
      hideForProtocol ||
      (settings.startInTray && !settings.noTrayIcon)
    if (!headless) {
      const isWayland = Boolean(process.env.WAYLAND_DISPLAY)
      const showWindow = () => {
        const props = configStore.get_nodefault('window-props')
        mainWindow.show()
        // Apply maximize only if we show the window
        if (props?.maximized) {
          mainWindow.maximize()
        }
      }
      if (isWayland) {
        // Electron + Wayland don't send ready-to-show
        mainWindow.webContents.once('did-finish-load', showWindow)
      } else {
        mainWindow.once('ready-to-show', showWindow)
      }
    }

    // set initial zoom level after a moment, if set in sync the value stays as 1
    setTimeout(() => {
      const zoomFactor = processZoomForScreen(
        configStore.get('zoomPercent', 100) / 100
      )

      mainWindow.webContents.setZoomLevel(zoomFactor)
      mainWindow.webContents.setVisualZoomLevelLimits(1, 1)
    }, 200)

    addListener('changeLanguage', async (event, language) =>
      changeLanguage(language)
    )

    fetchLastestReleases()

    initTrayIcon(mainWindow)

    return
  })
}

addListener('notify', (event, args) => notify(args))

addOneTimeListener('frontendReady', () => {
  logInfo('Frontend Ready', LogPrefix.Backend)
  handleProtocol([openUrlArgument, ...process.argv])

  if (isSnap) {
    const snapWarning: Electron.MessageBoxOptions = {
      title: i18next.t(
        'box.warning.snap.title',
        'GameLib is running as a Snap'
      ),
      message: i18next.t('box.warning.snap.message', {
        defaultValue:
          'Some features are not available in the Snap version of the app for now and we are trying to fix it.{{newLine}}Current limitations are: {{newLine}}GameLib will not be able to find Proton from Steam or Wine from Lutris.{{newLine}}{{newLine}}Gamescope, GameMode and MangoHud will also not work since GameLib cannot have access to them.{{newLine}}{{newLine}}To have access to this feature please install GameLib as a Flatpak, DEB or from the AppImage.',
        newLine: '\n'
      }),
      checkboxLabel: i18next.t('box.warning.snap.checkbox', {
        defaultValue: 'Do not show this message again'
      }),
      checkboxChecked: false
    }

    const showSnapWarning = configStore.get('showSnapWarning', true)

    if (showSnapWarning) {
      dialog
        .showMessageBox({
          ...snapWarning
        })
        .then((result) => {
          if (result.checkboxChecked) {
            configStore.set('showSnapWarning', false)
          }
        })
    }
  }

  // skip the download queue if we are running in CLI mode
  if (isCLINoGui) {
    return
  }

  setTimeout(() => {
    logInfo('Starting the Download Queue', LogPrefix.Backend)
    // debug/steam-install-slow-start (Thread B): isStartup=true — the only
    // call site that must NOT auto-start a persisted Steam queue head (see
    // initQueue's doc comment in downloadqueue.ts). GOG/Epic/Amazon keep
    // auto-resuming here unchanged.
    initQueue(true)
  }, 5000)
})

// Maybe this can help with white screens
process.on('uncaughtException', async (err) => {
  logError(err, LogPrefix.Backend)

  // We might get "object has been destroyed" exceptions in CI, since we start
  // and close Heroic quickly there. Displaying an error box would lock up
  // the test (until the timeout is reached), so let's not do that
  if (process.env.CI === 'e2e') return

  showDialogBoxModalAuto({
    title: i18next.t(
      'box.error.uncaught-exception.title',
      'Uncaught Exception occured!'
    ),
    message: i18next.t('box.error.uncaught-exception.message', {
      defaultValue:
        'A uncaught exception occured:{{newLine}}{{error}}{{newLine}}{{newLine}} Report the exception on our Github repository.',
      newLine: '\n',
      error: err
    }),
    type: 'ERROR'
  })
})

let powerId: number | undefined
let displaySleepId: number | undefined

addListener('lock', (e, playing: boolean) => {
  const isSleepBlocked = powerId !== undefined
  const isDisplaySleepBlocked = displaySleepId !== undefined

  if (!playing && !isSleepBlocked) {
    logInfo('Preventing machine to sleep', LogPrefix.Backend)
    powerId = powerSaveBlocker.start('prevent-app-suspension')
  }

  if (playing && !isDisplaySleepBlocked) {
    logInfo('Preventing display to sleep', LogPrefix.Backend)
    displaySleepId = powerSaveBlocker.start('prevent-display-sleep')
  }
})

addListener('unlock', () => {
  if (powerId !== undefined) {
    logInfo('Stopping Power Saver Blocker', LogPrefix.Backend)
    powerSaveBlocker.stop(powerId)
    powerId = undefined
  }
  if (displaySleepId !== undefined) {
    logInfo('Stopping Display Sleep Blocker', LogPrefix.Backend)
    powerSaveBlocker.stop(displaySleepId)
    displaySleepId = undefined
  }
})

addHandler('checkDiskSpace', async (_e, folder): Promise<DiskSpaceData> => {
  // FIXME: Propagate errors

  const parsedPath = Path.parse(folder)

  const { freeSpace, totalSpace } = await getDiskInfo(parsedPath)
  const pathIsWritable = await isWritable(parsedPath)
  const pathIsFlatpakAccessible = isAccessibleWithinFlatpakSandbox(parsedPath)

  return {
    free: freeSpace,
    diskSize: totalSpace,
    validPath: pathIsWritable,
    validFlatpakPath: pathIsFlatpakAccessible,
    message: `${getFileSize(freeSpace)} / ${getFileSize(totalSpace)}`
  }
})

addHandler('isFrameless', () => isFrameless())
addHandler('isMinimized', () => !!getMainWindow()?.isMinimized())
addHandler('isMaximized', () => !!getMainWindow()?.isMaximized())
addListener('minimizeWindow', () => getMainWindow()?.minimize())
addListener('maximizeWindow', () => getMainWindow()?.maximize())
addListener('unmaximizeWindow', () => getMainWindow()?.unmaximize())
addListener('closeWindow', () => getMainWindow()?.close())
// Native fullscreen. On macOS this puts Console mode in its own Space, which
// keeps swipe-to-Space navigation working but causes a brief desktop-Space
// animation when a Steam game is launched (the game's window appears on another
// Space). setSimpleFullScreen avoids the flash but loses the swipe-able Space
// and has focus/chrome rough edges — evaluated in Phase 8 UAT (test 11) and
// rejected. The launch transition is an accepted macOS limitation.
addListener('setFullscreen', (_e, enabled) =>
  getMainWindow()?.setFullScreen(enabled)
)
addListener('quit', async () => handleExit())

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit()
  }
})

// Stop the Steam running-game poller on quit so the 5s interval does not dangle
// (GAME-05 / D-06). before-quit fires on every platform, including macOS where
// window-all-closed does not quit.
app.on('before-quit', () => {
  stopRunningPoll()
  // Phase 24 Plan 06 (finding #8): tear down the shared, long-lived native
  // Steam-bridge helper so it never orphans on quit. No-op when no bridge
  // game was launched this session (helper never spawned).
  shutdownBridgeHelper()
})

app.on('open-url', (event, url) => {
  event.preventDefault()
  const mainWindow = getMainWindow()

  if (mainWindow) {
    handleProtocol([url])
  } else {
    openUrlArgument = url
  }
})

addListener('openExternalUrl', async (event, url) => openUrlOrFile(url))
addListener('openFolder', async (event, folder) => openUrlOrFile(folder))
addListener('openSupportPage', async () => openUrlOrFile(supportURL))
addListener('openReleases', async () => openUrlOrFile(heroicGithubURL))
addListener('openWeblate', async () => openUrlOrFile(weblateUrl))
addListener('showAboutWindow', () => showAboutWindow())
addListener('openLoginPage', async () => openUrlOrFile(epicLoginUrl))
addListener('openDiscordLink', async () => openUrlOrFile(discordLink))
addListener('openKofiPage', async () => openUrlOrFile(kofiPage))
addListener('openGithubSponsorsPage', async () =>
  openUrlOrFile(githubSponsorsPage)
)
addListener('openWinePrefixFAQ', async () => openUrlOrFile(wineprefixFAQ))
addListener('openWebviewPage', async (event, url) => openUrlOrFile(url))
addListener('openWikiLink', async () => openUrlOrFile(wikiLink))
addListener('openSidInfoPage', async () => openUrlOrFile(sidInfoUrl))
addListener('openCustomThemesWiki', async () =>
  openUrlOrFile(customThemesWikiLink)
)
addListener('showConfigFileInFolder', async (event, appName) => {
  if (appName === 'default') {
    return openUrlOrFile(configPath)
  }
  return openUrlOrFile(path.join(gamesConfigPath, `${appName}.json`))
})

addListener('removeFolder', async (e, [path, folderName]) => {
  removeFolder(path, folderName)
})

addHandler('runWineCommand', async (e, args) => runWineCommand(args))

/// IPC handlers begin here.

addHandler('checkGameUpdates', checkGameUpdates)

addHandler('getEpicGamesStatus', async () => isEpicServiceOffline())

addHandler('getMaxCpus', () => cpus().length)

addHandler('getHeroicVersion', () => app.getVersion())
addHandler('isFullscreen', () => isSteamDeckGameMode || isCLIFullscreen)
addHandler('getGameOverride', async () => getGameOverride())
addHandler('getGameSdl', async (event, appName) => getGameSdl(appName))

addHandler('showUpdateSetting', () => !isFlatpak)

addHandler('getLatestReleases', async () => getLatestReleasesForStartup())

addHandler('getCurrentChangelog', async () => getCurrentChangelogEntry())

addListener('clearCache', (event, showDialog, fromVersionChange = false) => {
  clearCache(undefined, fromVersionChange)
  sendFrontendMessage('refreshLibrary')

  if (showDialog) {
    showDialogBoxModalAuto({
      event,
      title: i18next.t('box.cache-cleared.title', 'Cache Cleared'),
      message: i18next.t(
        'box.cache-cleared.message',
        'GameLib Cache Was Cleared!'
      ),
      type: 'MESSAGE',
      buttons: [{ text: i18next.t('box.ok', 'Ok') }]
    })
  }
})

addListener('clearAchievementCache', (event, appName: string) => {
  clearAchievementCache(appName)
  logInfo(
    'Achievement cache was cleared for game: ' + appName,
    LogPrefix.Backend
  )
})

addListener('resetHeroic', () => resetHeroic())

addListener('createNewWindow', (e, url) => {
  new BrowserWindow({ height: 700, width: 1200 }).loadURL(url)
})

addHandler('isGameAvailable', async (e, args) => isGameAvailable(args))

addHandler('getGameInfo', async (event, appName, runner) =>
  getGameInfo(appName, runner)
)

addHandler(
  'getAchievements',
  async (event, appName, runner, lang = 'en-US') => {
    return getGame(appName, runner).getAchievements?.(lang) ?? []
  }
)

addHandler('getExtraInfo', async (event, appName, runner) =>
  getExtraInfo(appName, runner)
)

addHandler('getGameSettings', async (event, appName, runner) =>
  getGameSettings(appName, runner)
)

addHandler('getGOGLinuxInstallersLangs', async (event, appName) =>
  libraryManagerMap['gog'].getLinuxInstallersLanguages(appName)
)

addHandler(
  'getInstallInfo',
  async (event, appName, runner, installPlatform, build, branch) =>
    getInstallInfo(appName, runner, installPlatform, build, branch)
)

addHandler('getUserInfo', async () => {
  return LegendaryUser.getUserInfo()
})

addHandler('getAmazonUserInfo', async () => NileUser.getUserData())

// Checks if the user have logged in with Legendary already
addHandler('isLoggedIn', () => LegendaryUser.isLoggedIn())

addHandler('login', async (event, sid) => LegendaryUser.login(sid))
addHandler('authGOG', async (event, code) => GOGUser.login(code))
addHandler('logoutLegendary', () => LegendaryUser.logout())
addListener('logoutGOG', () => GOGUser.logout())

addHandler('getAmazonLoginData', () => NileUser.getLoginData())
addHandler('authAmazon', async (event, data) => NileUser.login(data))
addHandler('logoutAmazon', () => NileUser.logout())

addHandler('authZoom', async (event, url) => {
  const login = await ZoomUser.login(url)
  if (login.status === 'done') {
    await ZoomUser.getUserDetails()
  }
  return login
})

addListener('logoutZoom', () => ZoomUser.logout())
addHandler('getZoomUserInfo', async () => ZoomUser.getUserDetails())

addHandler('steamStartQR', async () => SteamUser.startQRLogin())
addHandler('steamPollQR', async () => SteamUser.pollQRLogin())
addHandler('steamPollCredential', async () => SteamUser.pollCredentialLogin())
addHandler('steamStartCredentials', async (event, { username, password }) =>
  SteamUser.startCredentialLogin(username, password)
)
addHandler('steamSubmitGuard', async (event, code) =>
  SteamUser.submitSteamGuardCode(code)
)
addHandler('redeemSteamKey', async (event, payload) => {
  // WR-03: main-process trust boundary for a security-sensitive secret. The
  // renderer payload is untrusted at runtime despite its type contract —
  // reject a malformed shape (non-'steam' store, non-string / empty key)
  // before delegating to steam-user rather than forwarding garbage across.
  const store = payload?.store
  const key = payload?.key
  if (store !== 'steam' || typeof key !== 'string' || key.length === 0) {
    return { store: 'steam', outcome: 'error', message: 'invalid-request' }
  }
  return SteamUser.redeemKey(store, key)
})
addHandler('getSteamUserInfo', async () => SteamUser.getUserDetails())
addHandler('checkSteamInstalled', async () =>
  SteamUser.isSteamClientInstalled()
)
addHandler('getSteamSyncedAt', () => steamSyncStore.get('syncedAt') ?? null)
addHandler('getSteamInstallSize', async (event, appId) =>
  getSteamInstallSize(appId)
)
// Phase 21 (21-09), D-09: multi-library override picker data source. Gated on
// the D-13 opt-in here (the ONLY frontend-facing consumer) rather than inside
// listSteamLibraryTargets() itself — a legacy steam://install (opt-in OFF)
// ignores `path` entirely, so surfacing a picker in that case would be
// misleading busywork; an empty array keeps the frontend's own gate simple
// (>1 result -> show picker) with zero extra IPC round-trips.
addHandler('listSteamLibraryTargets', async () =>
  isSteamNativeInstallEnabled() ? listSteamLibraryTargets() : []
)
// SteamUser.logout() is async (D-09 gap fix — clears the refresh token
// through the TokenStore seam, which may RPC to Rust in the sidecar build).
// Matches this file's existing fire-and-forget IPC convention for async void
// listeners (e.g. addListener('quit', async () => handleExit())).
addListener('logoutSteam', async () => SteamUser.logout())

// Phase 17 (17-04): dedicated Steam CrossOver bottle provisioning + status.
// D-04: bottled-Steam auth stays opaque — GameLib never inspects
// loginusers.vdf/sentry, so there is no login state to surface here.
// steamBottleStatus therefore reports only `provisioned` + `bottleName`
// (WR-02, 17-17: the always-false `loggedIn` signal was removed).
addHandler('steamBottleProvision', async (event, args) => provisionBottle(args))
addHandler('isSteamBottleProvisioned', async () => isBottleProvisioned())
addHandler('steamBottleStatus', async () => ({
  provisioned: steamBottleConfigStore.get_nodefault('provisioned') ?? false,
  bottleName:
    steamBottleConfigStore.get_nodefault('bottleName') ??
    DEFAULT_STEAM_BOTTLE_NAME
}))

// Phase 34.13 (34.13-07), D-09/D-14/D-15: the install-form's only new IPC
// surface. Both channels delegate to the single shared install-form seam,
// which is ALSO imported by sidecar/steamAuthFlowRegistration.ts — the two
// runtimes are mirrored, not independently reimplemented.
addHandler('isSteamBottleEligible', async (event, appName) =>
  getSteamBottleEligibilityVerdict(appName)
)
addHandler('persistBottleWineVersion', async (event, wineVersion) =>
  persistInstallFormWineVersion(wineVersion)
)
// quick-260821-le0 (Task 3): sweeps every recorded install root for a Steam
// title in one action. Mirrored on the sidecar/Tauri runtime below.
addHandler('steamRemoveAllCopies', async (event, appName) =>
  removeAllSteamInstallCopies(appName)
)

// Phase 21 (21-10), D-10/D-11: native Steam-CLIENT guided install +
// prompt-to-launch recheck — distinct from the bottle trio above (that is
// the macOS CrossOver bottle's own Windows Steam client).
addHandler('steamClientSetupStart', async () => startGuidedClientInstall())
addHandler('steamClientSetupRecheck', async (event, appId) =>
  ensureSteamClientReady(appId)
)

registerHumbleIpcHandlers()

// D-12/T-10-16: dev-only in-app validation trigger. Exercises the real
// Humble adapter with the real stored encrypted cookie from Electron main
// (never a standalone Node script). Registered ONLY when the app is not
// packaged, so this channel does not exist at all in production builds.
if (!app.isPackaged) {
  addHandler('humbleRunValidation', async () => runHumbleValidation())
}

addHandler('getAlternativeWine', async () =>
  GlobalConfig.get().getAlternativeWine()
)

addHandler('readConfig', async (event, configClass) => readConfig(configClass))

addHandler('requestAppSettings', () => GlobalConfig.get().getSettings())
addHandler('requestGameSettings', async (_e, appName) => {
  // debug/steam-bottle-game-no-launch: a bottle-eligible Steam game's real
  // settings live behind SteamGame.getSettings() -> getSteamBottleSettings()
  // (a DEDICATED store, never GameConfig). Calling GameConfig.get(appName)
  // directly here bypassed that routing entirely — the frontend GamePage
  // detail (InstalledInfo.tsx) surfaced the generic per-appId GameConfig's
  // wine (defaulting to the global engine, e.g. Game Porting Toolkit on
  // macOS) instead of the CrossOver bottle. requestGameSettings has no
  // `runner` parameter (IPC signature is appName-only), so detect a Steam
  // game via the in-memory Steam library Map (steam/state.ts) and route
  // through the SAME runner-aware path every other correct call site already
  // uses (e.g. launcher.ts's `game.getSettings()`); every other runner keeps
  // the prior GameConfig.get(appName).getSettings() behavior unchanged.
  if (steamLibrary.has(appName)) {
    return libraryManagerMap['steam'].getGame(appName).getSettings()
  }
  return GameConfig.get(appName).getSettings()
})

addHandler('toggleDXVK', async (event, { appName, action }) =>
  GameConfig.get(appName)
    .getSettings()
    .then(async (gameSettings) =>
      DXVK.installRemove(gameSettings, 'dxvk', action)
    )
)

addHandler('toggleDXVKNVAPI', async (event, { appName, action }) =>
  GameConfig.get(appName)
    .getSettings()
    .then(async (gameSettings) =>
      DXVK.installRemove(gameSettings, 'dxvk-nvapi', action)
    )
)

addHandler('toggleVKD3D', async (event, { appName, action }) =>
  GameConfig.get(appName)
    .getSettings()
    .then(async (gameSettings) =>
      DXVK.installRemove(gameSettings, 'vkd3d', action)
    )
)

addHandler('writeConfig', (event, { appName, config }) =>
  writeConfig(appName, config)
)

addListener('setSetting', (event, { appName, key, value }) => {
  if (appName === 'default') {
    GlobalConfig.get().setSetting(key, value)
  } else {
    GameConfig.get(appName).setSetting(key, value)
  }
})

// Watch the installed games file and trigger a refresh on the installed games if something changes
if (existsSync(legendaryInstalled)) {
  let watchTimeout: NodeJS.Timeout | undefined
  watch(legendaryInstalled, () => {
    logInfo('installed.json updated, refreshing library', LogPrefix.Legendary)
    // `watch` might fire twice (while Legendary/we are still writing chunks of the file), which would in turn make LegendaryLibrary fail to
    // decode the JSON data. So instead of immediately calling LegendaryLibrary.get().refreshInstalled(), call it only after no writes happen
    // in a 500ms timespan
    if (watchTimeout) clearTimeout(watchTimeout)
    watchTimeout = setTimeout(
      () => libraryManagerMap['legendary'].refreshInstalled(),
      500
    )
  })
}

addHandler('refreshLibrary', async (e, library?, origin?) => {
  // quick-260817-d61: records the deferral trigger BEFORE any manager's
  // refresh() runs — noteRefreshTrigger() itself no-ops for a named non-Steam
  // runner (T-d61-03), so this line is safe to call unconditionally on every
  // dispatch shape this handler already supports.
  noteRefreshTrigger(library ?? null, origin)
  if (library !== undefined && library !== 'all') {
    await libraryManagerMap[library].refresh()
  } else {
    const allRefreshPromises = []
    for (const manager of Object.values(libraryManagerMap)) {
      allRefreshPromises.push(manager.refresh())
    }
    await Promise.allSettled(allRefreshPromises)
  }

  // Phase 12 (Plan 04, D-47): a Steam-inclusive refresh (steam | all |
  // undefined — undefined/all both include Steam via libraryManagerMap)
  // triggers the Humble ownership recompute from this composition root, so
  // storeManagers/steam/library.ts stays completely Humble-unaware (the
  // one-way Humble→Steam dependency direction is preserved). recomputeOwnership()
  // self-gates on Steam connectivity + a non-empty cached library (D-48), so
  // calling it here unconditionally is safe even when the Steam refresh
  // failed or produced no games — it is simply a no-op in that case.
  if (library === undefined || library === 'all' || library === 'steam') {
    try {
      HumbleLibrary.recomputeOwnership()
    } catch (err) {
      logWarning(
        ['Humble ownership recompute after Steam refresh failed:', err],
        LogPrefix.Backend
      )
    }
  }

  // WR-05: re-resolve the CrossOver rating map after every library refresh
  // (manual "Refresh Library", a background Steam metadata sync completing,
  // etc.) so a game added mid-session gets a badge/filter signal without
  // requiring an app restart. Fire-and-forget, same as the startup call —
  // never blocks the refreshLibrary IPC response.
  refreshCrossoverRatingMap()
})

// get pid/tid on launch and inject
addHandler('launch', (event, args): StatusPromise => {
  return launchEventCallback(args)
})

// WR-02: body factored into `backend/utils/openDialog.ts` so the Tauri sidecar's
// `dialogFlowRegistration.ts` serves the SAME implementation instead of leaving the
// channel unported (and plan 30-03's picker unreachable).
addHandler('openDialog', async (e, args) => {
  const mainWindow = getMainWindow()
  if (!mainWindow) {
    return false
  }

  return openDialogCallback(mainWindow, args)
})

addListener('showItemInFolder', async (e, item) => showItemInFolder(item))

addHandler('uninstall', uninstallGameCallback)

addHandler('repair', async (event, appName, runner) => repair(appName, runner))

addHandler(
  'moveInstall',
  async (event, { appName, path, runner }): Promise<void> => {
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'moving'
    })

    const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()
    notify({ title, body: i18next.t('notify.moving', 'Moving Game') })

    const moveRes = await libraryManagerMap[runner]
      .getGame(appName)
      .moveInstall(path)
    if (moveRes.status === 'error') {
      notify({
        title,
        body: i18next.t('notify.error.move', 'Error Moving Game')
      })
      logError(
        `Error while moving ${appName} to ${path}: ${moveRes.error} `,
        LogPrefix.Backend
      )

      showDialogBoxModalAuto({
        event,
        title: i18next.t('box.error.title', 'Error'),
        message: i18next.t('box.error.moving', 'Error Moving Game {{error}}', {
          error: moveRes.error
        }),
        type: 'ERROR'
      })
    }

    if (moveRes.status === 'done') {
      notify({ title, body: i18next.t('notify.moved') })
      logInfo(`Finished moving ${appName} to ${path}.`, LogPrefix.Backend)
    }

    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
  }
)

addHandler(
  'importGame',
  async (
    event,
    {
      appName,
      path,
      runner,
      platform,
      winePrefix,
      wineVersion,
      wineCrossoverBottle
    }
  ): StatusPromise => {
    if (runner === 'legendary') {
      const epicOffline = await isEpicServiceOffline()
      if (epicOffline) {
        showDialogBoxModalAuto({
          event,
          title: i18next.t('box.warning.title', 'Warning'),
          message: i18next.t(
            'box.warning.epic.import',
            'Epic Servers are having major outage right now, the game cannot be imported!'
          ),
          type: 'ERROR'
        })
        return { status: 'error' }
      }
    }

    const { title } = libraryManagerMap[runner].getGame(appName).getGameInfo()
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'importing'
    })

    const abortMessage = () => {
      notify({
        title,
        body: i18next.t('notify.import.failed', 'Importing Failed')
      })
      sendGameStatusUpdate({
        appName,
        runner,
        status: 'done'
      })
    }

    try {
      const { abort, error } = await libraryManagerMap[runner]
        .getGame(appName)
        .importGame(path, platform)
      if (abort || error) {
        abortMessage()
        return { status: 'done' }
      }
    } catch (error) {
      abortMessage()
      logError(error, LogPrefix.Backend)
      return { status: 'error' }
    }

    if (winePrefix && wineVersion) {
      const gameSettings = await getGame(appName, runner).getSettings()
      writeConfig(appName, {
        ...gameSettings,
        winePrefix,
        wineVersion,
        wineCrossoverBottle
      })
    }

    notify({
      title,
      body: i18next.t('notify.install.imported', 'Game Imported')
    })
    sendGameStatusUpdate({
      appName,
      runner,
      status: 'done'
    })
    logInfo(`imported ${title}`, LogPrefix.Backend)
    return { status: 'done' }
  }
)

addHandler('kill', async (event, appName, runner) => kill(appName, runner))

addHandler('changeInstallPath', async (event, args) => changeInstallPath(args))

addHandler('egsSync', async (event, args) => {
  return libraryManagerMap['legendary'].toggleGamesSync(args)
})

addHandler('syncGOGSaves', async (event, gogSaves, appName, arg) =>
  libraryManagerMap['gog'].getGame(appName).syncSaves(arg, '', gogSaves)
)

addHandler('getLaunchOptions', async (event, appName, runner) =>
  getLaunchOptions(appName, runner)
)

addHandler('syncSaves', async (event, { arg = '', path, appName, runner }) => {
  if (runner === 'legendary') {
    const epicOffline = await isEpicServiceOffline()
    if (epicOffline) {
      logWarning(
        'Epic is offline right now, cannot sync saves!',
        LogPrefix.Backend
      )
      return 'Epic is offline right now, cannot sync saves!'
    }
  }
  if (!isOnline()) {
    logWarning('App is offline, cannot sync saves!', LogPrefix.Backend)
    return 'App is offline, cannot sync saves!'
  }

  const output = await libraryManagerMap[runner]
    .getGame(appName)
    .syncSaves(arg, path)
  logInfo(output, LogPrefix.Backend)
  return output
})

addHandler(
  'getDefaultSavePath',
  async (event, appName, runner, alreadyDefinedGogSaves) =>
    getDefaultSavePath(appName, runner, alreadyDefinedGogSaves)
)

// Simulate keyboard and mouse actions as if the real input device is used
addHandler('gamepadAction', async (event, args) => {
  // we can only receive gamepad events if the main window exists
  const mainWindow = getMainWindow()!

  const { action, metadata } = args
  const inputEvents: (
    | Electron.MouseInputEvent
    | Electron.MouseWheelInputEvent
    | Electron.KeyboardInputEvent
  )[] = []

  /*
   * How to extend:
   *
   * Valid values for type are 'keyDown', 'keyUp' and 'char'
   * Valid values for keyCode are defined here:
   * https://www.electronjs.org/docs/latest/api/accelerator#available-key-codes
   *
   */
  switch (action) {
    case 'rightStickUp':
      inputEvents.push({
        type: 'mouseWheel',
        deltaY: 50,
        x: mainWindow.getBounds().width / 2,
        y: mainWindow.getBounds().height / 2
      })
      break
    case 'rightStickDown':
      inputEvents.push({
        type: 'mouseWheel',
        deltaY: -50,
        x: mainWindow.getBounds().width / 2,
        y: mainWindow.getBounds().height / 2
      })
      break
    case 'leftStickUp':
    case 'leftStickDown':
    case 'leftStickLeft':
    case 'leftStickRight':
    case 'padUp':
    case 'padDown':
    case 'padLeft':
    case 'padRight':
      // spatial navigation
      inputEvents.push({
        type: 'keyDown',
        keyCode: action.replace(/pad|leftStick/, '')
      })
      inputEvents.push({
        type: 'keyUp',
        keyCode: action.replace(/pad|leftStick/, '')
      })
      break
    case 'leftClick':
      inputEvents.push({
        type: 'mouseDown',
        button: 'left',
        x: metadata.x,
        y: metadata.y
      })
      inputEvents.push({
        type: 'mouseUp',
        button: 'left',
        x: metadata.x,
        y: metadata.y
      })
      break
    case 'rightClick':
      inputEvents.push({
        type: 'mouseDown',
        button: 'right',
        x: metadata.x,
        y: metadata.y
      })
      inputEvents.push({
        type: 'mouseUp',
        button: 'right',
        x: metadata.x,
        y: metadata.y
      })
      break
    case 'back':
      mainWindow.webContents.goBack()
      break
    case 'esc':
      inputEvents.push({
        type: 'keyDown',
        keyCode: 'Esc'
      })
      inputEvents.push({
        type: 'keyUp',
        keyCode: 'Esc'
      })
      break
    case 'tab':
      inputEvents.push(
        {
          type: 'keyDown',
          keyCode: 'Tab'
        },
        {
          type: 'keyUp',
          keyCode: 'Tab'
        }
      )
      break
    case 'shiftTab':
      inputEvents.push(
        {
          type: 'keyDown',
          keyCode: 'Tab',
          modifiers: ['shift']
        },
        {
          type: 'keyUp',
          keyCode: 'Tab',
          modifiers: ['shift']
        }
      )
      break
  }

  if (inputEvents.length) {
    inputEvents.forEach((event) => mainWindow.webContents.sendInputEvent(event))
  }
})

addHandler('getShellPath', async (event, path) => getShellPath(path))

addHandler('getWebviewPreloadPath', () => webviewPreloadPath)

addHandler('clipboardReadText', () => clipboard.readText())

addListener('clipboardWriteText', (e, text) => clipboard.writeText(text))

addHandler('getCustomThemes', async () => getCustomThemes())

addHandler('getThemeCSS', async (event, theme) => getThemeCSS(theme))

addHandler('getCustomCSS', async () => getCustomCSS())

addListener('setTitleBarOverlay', (e, args) => {
  const mainWindow = getMainWindow()
  if (typeof mainWindow?.['setTitleBarOverlay'] === 'function') {
    logDebug(`Setting titlebar overlay options ${JSON.stringify(args)}`)
    mainWindow?.setTitleBarOverlay(args)
  }
})

addListener('addNewApp', (e, args) => addNewApp(args))

addListener('setGameMetadataOverride', (e, args) =>
  setGameMetadataOverride(args)
)

addHandler('getGameMetadataOverride', async (_e, appName) => {
  return getGameOverrides(appName)
})

addHandler('getAllGameOverrides', async () => {
  return getAllGameOverrides()
})

addHandler('isNative', (e, { appName, runner }) => {
  return libraryManagerMap[runner].getGame(appName).isNative()
})

addHandler('pathExists', async (e, path: string) => {
  return existsSync(path)
})

addListener('processShortcut', async (e, combination: string) => {
  const mainWindow = getMainWindow()

  switch (combination) {
    // hotkey to reload the app
    case 'ctrl+r':
      mainWindow?.reload()
      break
    // hotkey to quit the app
    case 'ctrl+q':
      handleExit()
      break
    // hotkey to open the settings on frontend
    case 'ctrl+k':
      sendFrontendMessage('openScreen', '/settings/general')
      break
    // hotkey to open the downloads screen on frontend
    case 'ctrl+j':
      sendFrontendMessage('openScreen', '/download-manager')
      break
    // hotkey to open the library screen on frontend
    case 'ctrl+l':
      sendFrontendMessage('openScreen', '/library')
      break
    case 'ctrl+shift+i':
      mainWindow?.webContents?.openDevTools()
      break
  }
})

addHandler(
  'getPlaytimeFromRunner',
  async (e, runner, appName): Promise<number | undefined> => {
    const { disablePlaytimeSync } = GlobalConfig.get().getSettings()
    if (disablePlaytimeSync) {
      return
    }
    if (runner === 'gog') {
      return libraryManagerMap[runner].getGame(appName).getGOGPlaytime()
    }

    return
  }
)

addHandler('getPrivateBranchPassword', (e, appName) =>
  libraryManagerMap['gog'].getGame(appName).getBranchPassword()
)
addHandler('setPrivateBranchPassword', (e, appName, password) =>
  libraryManagerMap['gog'].getGame(appName).setBranchPassword(password)
)

addHandler('getAvailableCyberpunkMods', async () =>
  getAvailableCyberpunkMods()
)
addHandler('setCyberpunkModConfig', async (e, props) =>
  setCyberpunkModConfig(props)
)

addListener('changeGameVersionPinnedStatus', (e, appName, runner, status) =>
  changeGameVersionPinnedStatus(appName, runner, status)
)

addHandler('getKnownFixes', (e, appName, runner) =>
  readKnownFixes(appName, runner)
)

addHandler('wine.isValidVersion', async (e, wineVersion: WineInstallation) =>
  validWine(wineVersion)
)

/*
  Other Keys that should go into translation files:
  t('box.error.generic.title')
  t('box.error.generic.message')
 */

/*
 * INSERT OTHER IPC HANDLERS HERE
 */
import './logger/ipc_handler'
import './wine/manager/ipc_handler'
import './shortcuts/ipc_handler'
import './anticheat/ipc_handler'
import './storeManagers/legendary/eos_overlay/ipc_handler'
import './wine/runtimes/ipc_handler'
import './downloadmanager/ipc_handler'
import './utils/ipc_handler'
import './wiki_game_info/ipc_handler'
import './recent_games/ipc_handler'
import './tools/ipc_handler'
import './progress_bar'
import './steamgrid/ipc_handler'
