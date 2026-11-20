---
phase: 62-module-boundaries-and-decomposition
plan: 11
subsystem: ipc-types
tags: [refactor, ipc, census]
requires: [62-10]
provides: [per-domain ipc type declarations, ipcDomainCensus]
affects: [src/common/types/ipc/]
key-files:
  created: [src/common/types/ipc/index.ts, src/common/types/ipc/*.ts (26 domain files), src/backend/sidecar/__tests__/ipcDomainCensus.test.ts]
  modified: [meta/findDeadcode.cjs, meta/deadcode-baseline-*.txt (comment cites), src/backend/sidecar/__tests__/testContainment.test.ts, src/frontend/state/__tests__/steamSyncStatusWiring.test.ts, src/backend/storeManagers/steam/__tests__/removeCopies.test.ts]
  deleted: [src/common/types/ipc.ts]
decisions:
  - Owner-less channels live in unpaired files window, testStubs, mainProcess, gog, legendary (gog/legendary hold only push FrontendMessages)
  - Census (d) allowlist keyed Kind:channel, 65 entries
completed: 2026-11-07
---

# Phase 62 Plan 11: ipc.ts split Summary

`common/types/ipc.ts` (945 lines, 294 channel keys: 60 Sync, 6 TestSync, 186 Async, 42 FrontendMessages) is now 26 files under `common/types/ipc/` (21 paired with FlowRegistrations plus window, testStubs, mainProcess, gog, legendary) with `index.ts` rebuilding the four umbrella types as intersections. No consumer import changed. A census test enforces pairing, per-kind uniqueness and intersection completeness.

## Commits
- e884f019e refactor(62-11): split ipc.ts (add ipc/, delete ipc.ts, retarget two source-text tests, deadcode guidance text)
- bc8480ba3 test(62-11): ipcDomainCensus.test.ts (+ testContainment classification)

## Verification
- codecheck green; time 10.4s before and 10.0s after (no regression). lint 0 errors (1121 warnings, unchanged). boundaries 9 known, ratchet 136/65 equal. find-deadcode 44 OK.
- Full `npx jest --silent`: exactly the 6 baseline failures, nothing else.
- Census mutation checks: dropping a part from an intersection fails (c); moving a registered key to another domain file fails (a). Both reverted.
- common/types/ipc/ imports nothing from backend/sidecar (T-62-23). 294 keys verified by script and asserted in census (T-62-22).

## Deviations from Plan
1. [Rule 3] Two source-text tests read the deleted file and had to be retargeted: steamSyncStatusWiring.test.ts (now ipc/steam.ts) and removeCopies.test.ts seam census (now ipc/steamAuth.ts). Not vacuous: both still assert presence of the channel string.
2. [Rule 1] The plan's R2 grep (ipcMain.handle/on only) missed handlers registered via addHandler/addListener in online_monitor.ts and signInProbe/outcomes.ts; refined so those land in mainProcess. createNewWindow, clearDMFinished, Sync connectivity-changed, updateAll and gamepadAction have no handler found and fell to testStubs per R2.
3. The stale `ipc.ts:81 and :185` cites in meta/findDeadcode.cjs and the two baseline comment headers were updated (parser ignores comments; no baseline entries changed). Each interface and umbrella type carries its own ts-prune-ignore-next; TestSync part also gets one.
4. SteamSyncStatus and the local SteamSyncFailureReason (with their rationale comments) moved to ipc/steam.ts; index re-exports SteamSyncStatus. The comment still cites :81/:185 byte-for-byte (D-06).
5. R3 multi-sender picks: gameStatusUpdate (6 senders, launcher.ts -> appShell), refreshLibrary (3, legendary), pushGameToLibrary (8, gog), progressOfWineManager (appShell), progressUpdate (3, steam), humbleAuthState (2, humble).

## Mapping (channel -> domain, all 294)
Rule R1 = registered by <domain>FlowRegistration; R2 = handler-based; R3 = FrontendMessages by sender.

| Domain | Rule | Channels (Kind:channel) |
|---|---|---|
| appShell | R1 | Sync:changeLanguage, Sync:notify, Sync:dialogDisplayed, Sync:frontendReady, Sync:lock, Sync:unlock, Sync:quit, Sync:openReleases, Sync:openWebviewPage, Sync:openAppManagementSettings, Sync:relaunchApp, Sync:abort, Sync:changeTrayColor, Sync:setTitleBarOverlay, Async:getHeroicVersion, Async:getAppManagementStatus, Async:getLatestReleases, Async:getCurrentChangelog, Async:getWebviewPreloadPath, Async:getLoginBackground |
| appShell | R3 | FrontendMessages:gameStatusUpdate, FrontendMessages:showDialog, FrontendMessages:maximized, FrontendMessages:unmaximized, FrontendMessages:fullscreen, FrontendMessages:connectivity-changed, FrontendMessages:launchGame, FrontendMessages:installGame, FrontendMessages:recentGamesChanged, FrontendMessages:gameSettingWriteFailed, FrontendMessages:progressOfWineManager, FrontendMessages:metadataChanged, FrontendMessages:crossoverIndexChanged, FrontendMessages:runsForMeChanged, FrontendMessages:signInProbeOutcomes, FrontendMessages:message |
| clipboard | R1 | Sync:clipboardWriteText, Sync:copySystemInfoToClipboard, Async:clipboardReadText |
| dialog | R1 | Async:openDialog |
| downloadQueue | R1 | Sync:removeFromDMQueue, Sync:resumeCurrentDownload, Sync:pauseCurrentDownload, Sync:cancelDownload, Async:getDMQueueInformation |
| downloadQueue | R3 | FrontendMessages:changedDMQueueInformation |
| enrichment | R1 | Async:getAnticheatInfo, Async:getKnownFixes, Async:getGamelibFixStatus, Async:getRunsForMeMap, Async:setRunsForMe, Async:getCrossoverIndex, Async:removeRecent, Async:getWikiGameInfo, Async:getGogDiscounts, Async:searchStores, Async:getStoreSearchDeals, Async:getStoreSearchStoreMap, Async:steamgriddb.hasApiKey, Async:steamgriddb.setApiKey, Async:steamgriddb.searchGame, Async:steamgriddb.getGrids, Async:steamgriddb.getHeroes |
| eosOverlay | R1 | Async:getEosOverlayStatus, Async:getLatestEosOverlayVersion, Async:updateEosOverlayInfo, Async:installEosOverlay, Async:removeEosOverlay, Async:enableEosOverlay, Async:disableEosOverlay, Async:isEosOverlayEnabled |
| gameDetails | R1 | Sync:addNewApp, Sync:changeGameVersionPinnedStatus, Sync:setGameMetadataOverride, Async:kill, Async:getGameInfo, Async:getExtraInfo, Async:getGameSettings, Async:getInstallInfo, Async:readConfig, Async:repair, Async:changeInstallPath, Async:getGameMetadataOverride, Async:getAllGameOverrides, Async:isGameAvailable, Async:getLaunchOptions, Async:getGameOverride, Async:getGameSdl, Async:getAvailableCyberpunkMods, Async:setCyberpunkModConfig |
| gog | R3 | FrontendMessages:pushGameToLibrary |
| humbleLogin | R1 | Sync:humbleStopLogin, Async:humbleStartLogin, Async:humbleReconnect, Async:humbleRevealKey |
| humble | R1 | Sync:humbleDisconnect, Async:humbleGetUserInfo, Async:humbleCheckHealth, Async:humbleRunValidation, Async:humbleSync, Async:humbleGetKeys, Async:humbleGetSyncState, Async:humbleSetOwnershipOverride, Async:humbleClearOwnershipOverride, Async:humbleGetOwnershipOverrides, Async:humbleRecordGiftLinkOpened, Async:humbleGetGiftedAt, Async:humbleMarkRedeemed, Async:humbleUndoRedeemed, Async:humbleGetRevealedKeyValue, Async:humbleGetClaimAnnotations |
| humble | R3 | FrontendMessages:openScreen, FrontendMessages:humbleAuthState, FrontendMessages:humbleKeysUpdated, FrontendMessages:humbleSyncProgress, FrontendMessages:humbleSyncStateChanged |
| install | R1 | Async:checkGameUpdates, Async:listSteamLibraryTargets, Async:getSteamDeleteRoute, Async:getSteamInstallAppTargets, Async:install, Async:uninstall, Async:moveInstall, Async:importGame, Async:updateGame |
| legendary | R3 | FrontendMessages:refreshLibrary |
| logger | R1 | Sync:logError, Sync:logInfo, Sync:showLogFileInFolder, Async:uploadLogFile, Async:deleteUploadedLogFile, Async:getUploadedLogFiles |
| logger | R3 | FrontendMessages:logFileUploaded, FrontendMessages:logFileUploadDeleted |
| mainProcess | R2 | Sync:set-connectivity-online, Async:get-connectivity-status, Async:getSignInProbeOutcomes |
| oauthLogin | R1 | Async:oauthCaptureLogin |
| runnerAuth | R1 | Sync:logoutGOG, Async:getEpicGamesStatus, Async:getUserInfo, Async:getAmazonUserInfo, Async:isLoggedIn, Async:login, Async:authGOG, Async:authAmazon, Async:logoutLegendary, Async:logoutAmazon, Async:getAmazonLoginData |
| runnerMisc | R1 | Async:callTool, Async:getLegendaryVersion, Async:getGogdlVersion, Async:getCometVersion, Async:getNileVersion, Async:getAchievements, Async:getGOGLinuxInstallersLangs, Async:egsSync, Async:syncGOGSaves, Async:syncSaves, Async:downloadRuntime, Async:isRuntimeInstalled, Async:getDefaultSavePath, Async:getPlaytimeFromRunner |
| settings | R1 | Sync:setSetting, Async:getMaxCpus, Async:showUpdateSetting, Async:requestAppSettings, Async:requestGameSettings, Async:writeConfig, Async:isNative, Async:getLogContent, Async:getSystemInfo, Async:hasExecutable, Async:setPrivateBranchPassword, Async:getPrivateBranchPassword |
| shellFiles | R1 | Sync:openExternalUrl, Sync:openFolder, Sync:openSupportPage, Sync:openWeblate, Sync:openLoginPage, Sync:openDiscordLink, Sync:openKofiPage, Sync:openGithubSponsorsPage, Sync:openWinePrefixFAQ, Sync:openWikiLink, Sync:openSidInfoPage, Sync:showConfigFileInFolder, Sync:removeFolder, Sync:clearCache, Sync:clearAchievementCache, Sync:resetHeroic, Sync:showItemInFolder, Async:checkDiskSpace, Async:getShellPath, Async:pathExists |
| shortcuts | R1 | Sync:processShortcut, Async:shortcutsExists, Async:addShortcut, Async:removeShortcut, Async:addToSteam, Async:removeFromSteam, Async:isAddedToSteam |
| steamAuth | R1 | Sync:logoutSteam, Async:steamStartQR, Async:steamPollQR, Async:steamPollCredential, Async:steamStartCredentials, Async:steamSubmitGuard, Async:redeemSteamKey, Async:getSteamUserInfo, Async:checkSteamInstalled, Async:getSteamSyncedAt, Async:getSteamInstallSize, Async:steamBottleProvision, Async:isSteamBottleProvisioned, Async:steamBottleStatus, Async:isSteamBottleEligible, Async:getSteamBridgeRoute, Async:getSteamEngineState, Async:listSteamEngineOptions, Async:dismissSteamEngineNotice, Async:setSteamBridgeUserRoute, Async:steamRemoveAllCopies, Async:steamGoOfflineRetry, Async:steamGoOfflineCancel, Async:steamBridgeListFriends, Async:steamBridgeInviteFriend, Async:persistBottleWineVersion, Async:steamClientSetupStart, Async:steamClientSetupRecheck |
| steam | R1 | Async:refreshLibrary, Async:launch |
| steam | R3 | FrontendMessages:steamBottleSetupRequired, FrontendMessages:steamSetupDownloadProgress, FrontendMessages:steamBridgeSetupRequired, FrontendMessages:steamGoOfflineRequired, FrontendMessages:steamEngineStateChanged, FrontendMessages:steamRequestNotice, FrontendMessages:steamBridgeRouteNotice, FrontendMessages:steamBottleLaunchWaiting, FrontendMessages:steamClientSetupRequired, FrontendMessages:steamMetadataSyncing, FrontendMessages:steamSyncStatus, FrontendMessages:progressUpdate |
| storeEmbed | R1 | Sync:storeEmbedSetBounds, Async:storeEmbedOpen, Async:storeEmbedHide, Async:storeEmbedShow, Async:storeEmbedClose, Async:storeEmbedTakeNavEvents, Async:storeEmbedBack, Async:storeEmbedForward, Async:storeEmbedReload, Async:storeEmbedNavigate |
| testStubs | R2 | Sync:createNewWindow, Sync:clearDMFinished, Sync:connectivity-changed, TestSync:setLegendaryCommandStub, TestSync:resetLegendaryCommandStub, TestSync:setGogdlCommandStub, TestSync:resetGogdlCommandStub, TestSync:setNileCommandStub, TestSync:resetNileCommandStub, Async:updateAll, Async:gamepadAction |
| window | R2 | Sync:setZoomFactor, Sync:minimizeWindow, Sync:maximizeWindow, Sync:unmaximizeWindow, Sync:closeWindow, Sync:setFullscreen, Async:isFullscreen, Async:isFrameless, Async:isMaximized, Async:isMinimized |
| wineTools | R1 | Async:runWineCommand, Async:winetricksInstalled, Async:winetricksAvailable, Async:winetricksApply, Async:winetricksQueueState, Async:winetricksCancelRemaining, Async:getAlternativeWine, Async:runWineCommandForGame, Async:installWineVersion, Async:refreshWineVersionInfo, Async:removeWineVersion, Async:wine.isValidVersion, Async:toggleDXVK, Async:toggleVKD3D, Async:toggleDXVKNVAPI |
| wineTools | R3 | FrontendMessages:wineVersionsUpdated, FrontendMessages:progressOfWinetricks, FrontendMessages:installing-winetricks-component, FrontendMessages:winetricksQueueChanged |

## Known Stubs
None.

## Self-Check: PASSED
