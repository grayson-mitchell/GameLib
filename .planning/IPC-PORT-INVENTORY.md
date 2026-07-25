# IPC Port Inventory — Electron → Tauri sidecar

**Generated:** 2026-07-25, during the Phase 35 discuss-phase that split the cutover into slices 4-8.

This is the authoritative work-list for Phases 34.1-34.5 and the completion gate for
Phase 35 (Electron cutover). Phase 35 must not run while any channel below is unported.

## Method (reproducible)

- Unported = channel names registered via `addHandler(`/`addListener(` under `src/backend/`,
  minus those registered on the sidecar via `ipcMain.handle`/`ipcMain.on` under
  `src/backend/sidecar/`.
- Note `install`, `updateGame`, `launch`, `requestGameSettings` and `openDialog` register
  across multiple lines and are easy to miss with a single-line grep.
- `rustInvoke` dialog channels (`showMessageBox`/`showErrorBox`/`showSaveDialog`) and push
  relays (`gameStatusUpdate`/`progressUpdate`/`changedDMQueueInformation`/`pushGameToLibrary`)
  are counted outside this tally, per the convention SEAM.md established in Phase 30.

## Totals

| | Count |
|---|---:|
| Unique channels | 210 |
| Ported to sidecar | 28 |
| **Unported** | **182** |

Reconciles with SEAM.md line 366 ("~208 of the 220 total IPC endpoints ... remain") and its
"28 wired/re-routed total" tally — that count was approximate and pre-dates this edit; the
`logError` early port below moves it to 28/182, not yet reflected in SEAM.md's own approximate
figure.

## Already ported (28)

`cancelDownload`, `checkGameUpdates`, `checkSteamInstalled`, `getDMQueueInformation`, `getLogContent`, `getMaxCpus`, `getSystemInfo`, `hasExecutable`, `health`, `install`, `isNative`, `launch`, `listSteamLibraryTargets`, `logError`, `openDialog`, `pauseCurrentDownload`, `refreshLibrary`, `removeFromDMQueue`, `requestAppSettings`, `requestGameSettings`, `resumeCurrentDownload`, `setSetting`, `showUpdateSetting`, `steamPollQR`, `steamStartQR`, `uninstall`, `updateGame`, `writeConfig`

`logError` was ported early by Phase 34.2 gap cycle 2 (plan 34.2-16) — see the Phase 34.3 list
below, which now excludes it, and `34.2-PORTED-CHANNELS.md`'s gap-cycle-2 subsection for the full
rationale (REQ-34.2-12, code-review CR-01). It is a `sidecar send` channel, not one of Phase 34.2's
own 26 slice-5 channels. Phase 34.3 must NOT register it a second time.

## Phase 34.1 — Slice 4 — app shell and window chrome (33 channels)

Note: the callTool channel (`src/backend/tools/ipc_handler.ts:25`, Winetricks/winecfg/runExe)
was reassigned to Phase 34.5 by Phase 34.1 CONTEXT decision D-14 on 2026-07-25, because it is
Wine tooling and was in this slice only because the inventory grouped channels by file; see
the Phase 34.5 list below for its new home.

`abort`, `changeLanguage`, `changeTrayColor`, `closeWindow`, `createNewWindow`, `gamepadAction`, `getCurrentChangelog`, `getCustomCSS`, `getCustomThemes`, `getHeroicVersion`, `getLatestReleases`, `getThemeCSS`, `getWebviewPreloadPath`, `isFrameless`, `isFullscreen`, `isIntelMac`, `isMaximized`, `isMinimized`, `lock`, `maximizeWindow`, `minimizeWindow`, `notify`, `openCustomThemesWiki`, `openReleases`, `openWebviewPage`, `quit`, `set-connectivity-online`, `setFullscreen`, `setTitleBarOverlay`, `setZoomFactor`, `showAboutWindow`, `unlock`, `unmaximizeWindow`

## Phase 34.2 — Slice 5 — game details, settings and overrides (26 channels)

`addNewApp`, `changeGameVersionPinnedStatus`, `changeInstallPath`, `getAllGameOverrides`, `getAnticheatInfo`, `getAvailableCyberpunkMods`, `getCrossoverIndex`, `getExtraInfo`, `getGameInfo`, `getGameMetadataOverride`, `getGameOverride`, `getGameSdl`, `getGameSettings`, `getKnownFixes`, `getLaunchOptions`, `getStoreSearchDeals`, `getStoreSearchStoreMap`, `getWikiGameInfo`, `isGameAvailable`, `kill`, `readConfig`, `removeRecent`, `repair`, `searchStores`, `setCyberpunkModConfig`, `setGameMetadataOverride`

## Phase 34.3 — Slice 6 — shell, files, logs and diagnostics (29 channels)

`checkDiskSpace`, `clearAchievementCache`, `clearCache`, `clipboardReadText`, `clipboardWriteText`, `copySystemInfoToClipboard`, `deleteUploadedLogFile`, `getShellPath`, `getUploadedLogFiles`, `logInfo`, `openDiscordLink`, `openExternalUrl`, `openFolder`, `openGithubSponsorsPage`, `openKofiPage`, `openLoginPage`, `openPatreonPage`, `openSidInfoPage`, `openSupportPage`, `openWeblate`, `openWikiLink`, `openWinePrefixFAQ`, `pathExists`, `removeFolder`, `resetHeroic`, `showConfigFileInFolder`, `showItemInFolder`, `showLogFileInFolder`, `uploadLogFile`

Note: `logError` was ported early by Phase 34.2 gap cycle 2 (plan 34.2-16) — see "Already ported"
above. It is NOT counted in this slice's 29 and must not be registered again by whichever plan
ports this list.

## Phase 34.4 — Slice 7 — Steam completion and Humble (38 channels)

`getPrivateBranchPassword`, `getSteamInstallSize`, `getSteamSyncedAt`, `getSteamUserInfo`, `humbleCheckHealth`, `humbleClearOwnershipOverride`, `humbleDisconnect`, `humbleGetClaimAnnotations`, `humbleGetGiftedAt`, `humbleGetKeys`, `humbleGetLoginUserAgent`, `humbleGetOwnershipOverrides`, `humbleGetRevealedKeyValue`, `humbleGetSyncState`, `humbleGetUserInfo`, `humbleLoginNavigated`, `humbleMarkRedeemed`, `humbleReconnect`, `humbleRecordGiftLinkOpened`, `humbleRevealKey`, `humbleRunValidation`, `humbleSetOwnershipOverride`, `humbleStartLogin`, `humbleStopLogin`, `humbleSync`, `humbleUndoRedeemed`, `isLoggedIn`, `isSteamBottleProvisioned`, `logoutSteam`, `redeemSteamKey`, `setPrivateBranchPassword`, `steamBottleProvision`, `steamBottleStatus`, `steamClientSetupRecheck`, `steamClientSetupStart`, `steamPollCredential`, `steamStartCredentials`, `steamSubmitGuard`

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (56 channels)

`addShortcut`, `addToSteam`, `authAmazon`, `authGOG`, `authZoom`, `callTool`, `disableEosOverlay`, `downloadRuntime`, `egsSync`, `enableEosOverlay`, `getAlternativeWine`, `getAmazonLoginData`, `getAmazonUserInfo`, `getCometVersion`, `getEosOverlayStatus`, `getEpicGamesStatus`, `getGOGLinuxInstallersLangs`, `getGogdlVersion`, `getLatestEosOverlayVersion`, `getLegendaryVersion`, `getNileVersion`, `getUserInfo`, `getZoomUserInfo`, `installEosOverlay`, `installWineVersion`, `isAddedToSteam`, `isEosOverlayEnabled`, `isRuntimeInstalled`, `login`, `logoutAmazon`, `logoutGOG`, `logoutLegendary`, `logoutZoom`, `processShortcut`, `refreshWineVersionInfo`, `removeEosOverlay`, `removeFromSteam`, `removeShortcut`, `removeWineVersion`, `runWineCommand`, `shortcutsExists`, `steamgriddb.getGrids`, `steamgriddb.getHeroes`, `steamgriddb.hasApiKey`, `steamgriddb.searchGame`, `steamgriddb.setApiKey`, `syncGOGSaves`, `syncSaves`, `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D`, `updateEosOverlayInfo`, `wine.isValidVersion`, `winetricksAvailable`, `winetricksInstall`, `winetricksInstalled`

## Not an IPC channel, but blocks Phase 35

- **Renderer bundler migration.** `electron.vite.config.ts` builds the renderer that Tauri
  serves (`tauri.conf.json` → `frontendDist: "../build"`), and `pnpm tauri:dev` literally runs
  `electron-vite build` first. Migrate to plain Vite before the cutover.
- **Sidecar still imports Electron packages.** `src/backend/sidecar/handlers.ts` imports
  `electron-store`; `build:sidecar` externalizes `electron` and `electron-store`.
- **SEAM.md convergence items** deferred explicitly to the cutover: Phase 29 D-08 (Electron
  `SECRET_STORE_KEYS` deny-list vs Tauri fail-closed allow-list) and Phase 31 D-02
  (settings divergence). Both become moot once the Electron path is deleted.
- **Phase 33 D-04** — boot-time auto-resume, deferred to Phase 35.
- **Parked renderer bugs** (`debug-uninstall-game-vanishes-parked`) must be re-tested against
  Tauri rather than fixed in Electron.
