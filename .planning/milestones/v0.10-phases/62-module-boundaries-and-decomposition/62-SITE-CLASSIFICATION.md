# Phase 62 Site Classification (D-02 deliverable)

Written by 62-13 against `node meta/boundaryRatchet.cjs --list`: FRONTEND_CEILING 136 (448 files), BACKEND_CEILING 65 (231 files), 201 sites total. File paths reflect the post-split layout (games.ts, depot.ts, ipc.ts already decomposed).

Classes: **behaviour** = the site picks behaviour that differs by store, so it converts to a capability flag (`hasCapability`/`storeCapabilities[r].flag`) or a shared compound predicate. **identity** = the site is genuinely about one named store (store-specific API call, narrowing of the GameInfo union, a per-store lookup/switch); it converts to `isStore(x, '<store>')` or a `Record<Runner|StoreKey, ...>` lookup (a keyed object is not a comparison, so the ratchet does not count it). Sites whose note says "narrowing" read a sideload-only/non-sideload-only field of the GameInfo union; the converting plan must keep the type narrowing (give isStore a type-guard overload or keep a discriminant check outside the ratchet scope) and records which it chose.

Day-one flag set is derived from the behaviour rows below. A flag the audit missed is added via recipe step C8 (62-15-PLAN.md).

Row totals: 62-14: 14, 62-15: 27, 62-16: 24, 62-17: 52, 62-18: 43, 62-19: 41; frontend sum 136, backend sum 65.

## 62-14: launcher.ts

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/backend/launcher.ts:1002:7 | `gameInfo.runner === 'gog' &&` | identity | isStore(x,'gog') | WR-01, D-2 | comet support |
| src/backend/launcher.ts:1167:3 | `switch (wrapperEnv.appRunner) {` | identity | Record<Runner,..> lookup (switch) | WR-01, D-2 | appRunner GAMEID env |
| src/backend/launcher.ts:1727:3 | `switch (runner) {` | identity | Record<Runner,..> lookup (switch) | WR-01, D-2 | per-runner arg index |
| src/backend/launcher.ts:254:9 | `if (runner === 'steam') {` | behaviour | usesBottleRuntime | WR-03, quick 261026-j6x, quick 261027-n77, WR-01, D-2 | persistBottleWineVersion |
| src/backend/launcher.ts:279:7 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | WR-03, quick 261026-j6x, quick 261027-n77, WR-01, D-2 | gogPresence |
| src/backend/launcher.ts:303:7 | `if (runner !== 'steam' && launchResult) {` | behaviour | playtimeTrackedExternally | WR-03, quick 261026-j6x, quick 261027-n77, WR-01, D-2 | bottleProcessMonitor records steam sessions |
| src/backend/launcher.ts:307:7 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | WR-03, quick 261026-j6x, quick 261027-n77, WR-01, D-2 | gogPresence clear |
| src/backend/launcher.ts:328:7 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | WR-03, quick 261026-j6x, quick 261027-n77, WR-01, D-2 | gog playtime sync |
| src/backend/launcher.ts:558:23 | `if (!offlineMode && gameInfo.runner === 'legendary') {` | identity | isStore(x,'legendary') | quick 261026-j6x, quick 261027-n77, WR-01, D-2 | isEpicServiceOffline |
| src/backend/launcher.ts:615:7 | `gameInfo.runner === 'sideload'` | identity | isStore(x,'sideload') | quick 261026-j6x, quick 261027-n77, WR-01, D-2 | narrowing: folder_name vs install_path |
| src/backend/launcher.ts:893:7 | `if (gameInfo.runner === 'legendary' && isLinux) {` | identity | isStore(x,'legendary') | quick 261026-j6x, quick 261027-n77, WR-01, D-2 | EOS overlay |
| src/backend/launcher.ts:946:9 | `if (gameInfo.runner === 'gog') {` | identity | isStore(x,'gog') | quick 261026-j6x, quick 261027-n77, WR-01, D-2 | gogSetup |
| src/backend/launcher.ts:954:9 | `if (gameInfo.runner === 'nile') {` | identity | isStore(x,'nile') | quick 261026-j6x, quick 261027-n77, WR-01, D-2 | nileSetup |
| src/backend/launcher.ts:957:9 | `if (gameInfo.runner === 'legendary') {` | identity | isStore(x,'legendary') | quick 261026-j6x, quick 261027-n77, WR-01, D-2 | legendarySetup |

## 62-15: backend downloadmanager / gamedetails / tools / save_sync / utils / uninstaller / macArch

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/backend/downloadmanager/downloadqueue.ts:156:22 | `if (isStartup && element.params.runner === 'steam') {` | behaviour | installManagedExternally | quick 261024-cjq, D-04, GAME-02, D-01 | startup defer of steam queue entries |
| src/backend/downloadmanager/downloadqueue.ts:253:11 | `if (element.params.runner === 'steam') {` | behaviour | installSizeFromSteamStore | D-04, GAME-02, D-01 | getSteamInstallSize |
| src/backend/downloadmanager/downloadqueue.ts:275:11 | `element.params.runner === 'gog' &&` | identity | isStore(x,'gog') | GAME-02, D-01 | gog windows-only install path |
| src/backend/downloadmanager/downloadqueue.ts:344:9 | `if (removedRunner !== 'steam' \|\| forceStatusUpdate) {` | behaviour | installManagedExternally | D-01 | ACF poller emits done; removedRunner |
| src/backend/downloadmanager/downloadqueue.ts:387:11 | `if (runner === 'steam') {` | behaviour | installManagedExternally | D-01 | steam never sets folder_name |
| src/backend/downloadmanager/downloadqueue.ts:439:5 | `element.params.runner === 'gog' &&` | identity | isStore(x,'gog') | D-01 | gog-redist special app |
| src/backend/downloadmanager/downloadqueue.ts:488:9 | `if (element.params.runner !== 'steam') {` | behaviour | installManagedExternally | - | ACF poller owns toast |
| src/backend/downloadmanager/ipc_handler.ts:28:5 | `args.runner === 'legendary'` | identity | isStore(x,'legendary') | - | installDlcs legacy semantics are legendary-only (differs from supportsDlcSelection) |
| src/backend/downloadmanager/utils.ts:152:7 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | WR-02, D-11, D-10, 37-02 (D-06/D-07), D-17, D-01, GAME-02, WR-01, D-03, REQ-37-04, quick 261026-avw | isEpicServiceOffline |
| src/backend/downloadmanager/utils.ts:167:7 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | WR-02, D-11, D-10, 37-02 (D-06/D-07), D-17, D-01, GAME-02, WR-01, D-03, REQ-37-04, quick 261026-avw | stale manifest handling |
| src/backend/downloadmanager/utils.ts:183:7 | `if (runner !== 'steam') {` | behaviour | installManagedExternally | WR-02, D-11, D-10, 37-02 (D-06/D-07), D-17, D-01, GAME-02, WR-01, D-03, REQ-37-04, quick 261026-avw | suppress Installation Started toast |
| src/backend/downloadmanager/utils.ts:201:7 | `if (runner !== 'steam' && installDlcs && installDlcs.length > 0) {` | behaviour | installManagedExternally | WR-02, D-11, D-10, 37-02 (D-06/D-07), D-17, D-01, GAME-02, WR-01, D-03, REQ-37-04, quick 261026-avw | dropped DLC list is a steam re-scope; legacy also true for nile/sideload, confirm in 62-15 |
| src/backend/downloadmanager/utils.ts:366:11 | `if (runner === 'steam') {` | behaviour | installManagedExternally | 37-02 (D-06/D-07), quick 261026-avw | abort stops delegated SteamGame |
| src/backend/downloadmanager/utils.ts:380:7 | `runner !== 'steam' \|\|` | behaviour | installManagedExternally | 37-02 (D-06/D-07), quick 261026-avw | steam skips generic error notify (D-06/D-07 context) |
| src/backend/downloadmanager/utils.ts:391:9 | `if (runner === 'steam' && status === 'error') {` | behaviour | installManagedExternally | 37-02 (D-06/D-07), quick 261026-avw | steam error signIn affordance |
| src/backend/downloadmanager/utils.ts:442:7 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | quick 261026-avw | isEpicServiceOffline |
| src/backend/gamedetails/dispatch.ts:145:7 | `runner === 'legendary' ? LogPrefix.Legendary : LogPrefix.Gog` | identity | Record<Runner,LogPrefix> lookup | quick 261106-pvk, quick 261026-lif, D-02, CR-01, D-01 | log prefix pick |
| src/backend/gamedetails/dispatch.ts:155:9 | `if (!(runner === 'steam' && isDelegatedInstallPolling(appName))) {` | behaviour | installManagedExternally | quick 261106-pvk, quick 261026-lif, D-02, CR-01, D-01 | delegated install polling skips abort lookup |
| src/backend/gamedetails/dispatch.ts:78:5 | `runner === 'legendary' &&` | identity | isStore(x,'legendary') | quick 261106-pvk, quick 261026-lif, D-02, CR-01, D-01 | legendary-as-gog fastpath |
| src/backend/gamedetails/dispatch.ts:99:5 | `runner === 'legendary' &&` | identity | isStore(x,'legendary') | quick 261106-pvk, quick 261026-lif, D-02, CR-01, D-01 | legendary-as-gog fastpath |
| src/backend/save_sync.ts:22:3 | `switch (runner) {` | identity | Record<Runner,..> lookup (switch) | - | per-store sync call |
| src/backend/tools/index.ts:1500:7 | `if (runner === 'steam') {` | behaviour | winePrefixToolsAvailable | D-01 | frontend hides for steam; backend defense in depth |
| src/backend/tools/ipc_handler.ts:50:7 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | D-11 | offline installer check |
| src/backend/utils.ts:381:16 | `const plat = runner === 'legendary' ? 'Legendary (Epic Games)' : runne` | identity | isStore(x,'legendary') | quick 260922-v2e, D-35 | display name; prefer getStoreDisplayName |
| src/backend/utils/macArch.ts:248:21 | `const isSteam = runner === 'steam'` | behaviour | usesBottleRuntime | D-07 | dialog wording for steam bottle |
| src/backend/utils/uninstaller.ts:146:9 | `if (runner !== 'steam') {` | behaviour | installManagedExternally | GAME-03 | ACF poller toast |
| src/backend/utils/uninstaller.ts:154:7 | `if (runner !== 'steam') {` | behaviour | installManagedExternally | GAME-03 | ACF poller done signal (GAME-03) |

## 62-16: rest of backend

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/backend/crossover_index/index.ts:201:10 | `return gameInfo.runner === 'steam' \|\| NAME_MATCHING_SHIPS` | behaviour | appNameIsSteamAppId | - | steam id match |
| src/backend/crossover_index/index.ts:76:7 | `if (gameInfo.runner === 'steam') {` | behaviour | appNameIsSteamAppId | D-11, D-12, WR-07, D-02, D-09, D-13, D-16 | bySteamId lookup |
| src/backend/protocol.ts:134:9 | `if (gameInfo.runner !== 'steam') {` | behaviour | launchHandedToClient | CR-04, D-01 | steam dispatch takes only appName |
| src/backend/protocol.ts:139:11 | `if (gameInfo.runner === 'gog') {` | identity | isStore(x,'gog') | CR-04, D-01 | gogdl rejects -- marker |
| src/backend/protocol.ts:212:9 | `if (gameInfo.runner === 'steam') {` | behaviour | launchHandedToClient | CR-04, D-01 | dispatchSteamLaunch |
| src/backend/shortcuts/shortcuts/shortcuts.ts:111:11 | `if (gameInfo.runner === 'gog') {` | identity | isStore(x,'gog') | D-04 | gog executable lookup |
| src/backend/shortcuts/shortcuts/shortcuts.ts:48:28 | `if (addSteamShortcuts && runner !== 'steam') {` | behaviour | canAddSteamShortcut | D-04 | steam game already in Steam |
| src/backend/shortcuts/utils.ts:76:7 | `if (gameInfo.runner === 'gog') {` | identity | isStore(x,'gog') | - | gog icon path |
| src/backend/sidecar/installFlowRegistration.ts:577:11 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | - | isEpicServiceOffline |
| src/backend/sidecar/oauthLoginCapture.ts:143:3 | `switch (runner) {` | identity | Record<Runner,..> lookup (switch) | WR-01 | per-store login capture |
| src/backend/sidecar/runnerMiscFlowRegistration.ts:173:9 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | D-09, D-15, REQ-34, D-14 | offline installer check |
| src/backend/sidecar/runnerMiscFlowRegistration.ts:240:9 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | D-15, REQ-34, D-14 | isEpicServiceOffline |
| src/backend/sidecar/runnerMiscFlowRegistration.ts:305:11 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | - | getGOGPlaytime |
| src/backend/sidecar/steamAuthFlowRegistration.ts:253:11 | `if (store !== 'steam' \|\| typeof key !== 'string' \|\| key.length ===` | identity | isStore(store,'steam') | REQ-34, WR-02, D-04, D-09, D-14, D-15, WR-10, D-51, D-06, D-13, WR-05 | payload store validation |
| src/backend/sidecar/steamFlowRegistration.ts:215:9 | `if (runner === 'steam') {` | identity | isStore(x,'steam') | WR-05, D-47, D-48, D-35, D-01, D-02 | Humble ownership recompute after steam refresh |
| src/backend/sidecar/steamFlowRegistration.ts:361:7 | `if (runner === 'steam') {` | behaviour | launchHandedToClient | D-01, D-02 | dispatchSteamLaunch |
| src/backend/signInProbe/verdict.ts:113:9 | `if (store === 'humble') {` | identity | isStore(store,'humble') | - | humble auth push |
| src/backend/signInProbe/verdict.ts:124:7 | `if (store === 'humble') {` | identity | isStore(store,'humble') | - | humble auth push |
| src/backend/wiki_game_info/gamesdb/utils.ts:17:21 | `if (!storeName \|\| runner === 'steam') {` | behaviour | appNameIsSteamAppId | quick 261024-tny | appId is Steam ID |
| src/backend/wiki_game_info/howlongtobeat/utils.ts:328:7 | `if (gameInfo.runner == 'gog') {` | identity | isStore(x,'gog') | - | gog id lookup |
| src/backend/wiki_game_info/howlongtobeat/utils.ts:362:7 | `if (gameInfo.runner !== 'gog' && gameInfo.title) {` | identity | isStore(x,'gog') | - | title search fallback |
| src/backend/wiki_game_info/umu/utils.ts:22:7 | `if (runner === 'sideload') {` | behaviour | hasStoreCatalog | - | sideload has no umu id |
| src/backend/wiki_game_info/wiki_game_info.ts:114:40 | `getInfoFromPCGamingWiki(title, runner === 'gog' ? appName : undefined)` | identity | isStore(x,'gog') | - | pcgamingwiki gog id |
| src/backend/wiki_game_info/wiki_game_info.ts:167:9 | `runner === 'steam' ? appName : gamesdb?.steamID \|\| pcgamingwiki?.ste` | behaviour | appNameIsSteamAppId | - | steamID = appName |

## 62-17: frontend helpers / hooks / state / components / DownloadManager / WebView / Settings

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/frontend/components/UI/StoreLogos/index.tsx:14:3 | `switch (runner) {` | identity | Record<Runner,..> lookup (switch) | - | logo per store |
| src/frontend/components/UI/UninstallModal/index.tsx:111:9 | `if (runner === 'sideload' && location.pathname.match(/gamepage/)) {` | identity | isStore(x,'sideload') | - | gamepage redirect |
| src/frontend/components/UI/UninstallModal/index.tsx:120:29 | `if (installingEpicGame && runner === 'legendary') {` | identity | isStore(x,'legendary') | - | epic install lock |
| src/frontend/components/UI/UninstallModal/index.tsx:73:9 | `if (runner === 'steam') {` | behaviour | installHandOffToClient | - | steam uninstall hand-off |
| src/frontend/helpers/index.ts:110:7 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | WR-02 | install platform default |
| src/frontend/helpers/library.ts:206:33 | `if (gameInfo && gameInfo.runner !== 'sideload') {` | identity | isStore(x,'sideload') | WR-01, CR-01 | narrowing for install.is_dlc |
| src/frontend/helpers/reportProblem.ts:59:9 | `if (game.runner !== 'steam') return 'compatibility layer'` | identity | isStore(x,'steam') | - | native vs compatibility layer label |
| src/frontend/helpers/steamInstallOptionsEntry.ts:110:5 | `runner === 'steam' &&` | behaviour | installHandOffToClient | - | existing single decision site (34.13 C-04) |
| src/frontend/helpers/steamInstallOptionsEntry.ts:68:5 | `runner === 'steam' &&` | behaviour | installHandOffToClient | - | existing single decision site (34.13 C-04) |
| src/frontend/helpers/steamInstallOptionsEntry.ts:81:10 | `return runner === 'steam' && !isInstalled && !isDelisted` | behaviour | installHandOffToClient | - | existing single decision site (34.13 C-04) |
| src/frontend/helpers/storeDisplayName.ts:20:3 | `switch (runner) {` | identity | Record<Runner,..> lookup (switch) | - | display names |
| src/frontend/hooks/constants.ts:38:7 | `runner === 'steam'` | behaviour | installManagedExternally | D-05, quick 261029-ji2, REQ-37-02, D-15 | installing label |
| src/frontend/hooks/constants.ts:65:7 | `runner === 'sideload' ? '' : size` | behaviour | hasStoreCatalog | D-05, quick 261029-ji2, REQ-37-02, D-15 | size shown unless sideload |
| src/frontend/hooks/constants.ts:76:7 | `runner === 'steam' && statusContext === 'steam-incomplete'` | behaviour | installManagedExternally | D-05, quick 261029-ji2, REQ-37-02, D-15 | steam-incomplete label |
| src/frontend/hooks/hasAnticheatInfo.ts:9:7 | `gameInfo.runner !== 'sideload' &&` | behaviour | hasStoreCatalog | - | no anticheat info for sideload |
| src/frontend/hooks/hasStatus.ts:184:9 | `runner === 'steam' && newGameInfo?.install?.steamResumePending` | behaviour | installManagedExternally | - | steamResumePending |
| src/frontend/screens/DownloadManager/components/DownloadHero/index.tsx:61:22 | `if (newInfo && newInfo.runner !== 'sideload') {` | identity | isStore(x,'sideload') | quick 261029-exu | narrowing |
| src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.tsx:85:22 | `if (newInfo && newInfo.runner !== 'sideload') {` | identity | isStore(x,'sideload') | D-07 | narrowing |
| src/frontend/screens/DownloadManager/components/DownloadManagerItem/status.ts:43:24 | `const isSteamError = runner === 'steam' && status === 'error'` | behaviour | installManagedExternally | - | isSteamError |
| src/frontend/screens/DownloadManager/components/SteamManagedItem/steamManagedModel.ts:18:7 | `entry.runner === 'steam' &&` | behaviour | installManagedExternally | - | steam managed entries |
| src/frontend/screens/Settings/components/AlternativeExe.tsx:13:20 | `if (isDefault \|\| runner === 'sideload') {` | behaviour | hasStoreCatalog | - | sideload hides |
| src/frontend/screens/Settings/components/OfflineMode.tsx:32:20 | `if (isDefault \|\| runner !== 'legendary') {` | identity | isStore(x,'legendary') | - | epic offline mode |
| src/frontend/screens/Settings/components/Tools/index.tsx:53:7 | `gameinfo.runner === 'sideload' ? undefined : gameinfo.install.install_` | identity | isStore(x,'sideload') | - | narrowing for install_path |
| src/frontend/screens/Settings/sections/GamesSettings/index.tsx:87:35 | `gameInfo?.runner === 'gog' \|\| gameInfo?.runner === 'legendary'` | behaviour | supportsCloudSaves | D-14, D-03, quick 261104-tm6, D-08, quick 261104-uxr, D-02 | legendary or gog (first operand) |
| src/frontend/screens/Settings/sections/GamesSettings/index.tsx:87:5 | `gameInfo?.runner === 'gog' \|\| gameInfo?.runner === 'legendary'` | behaviour | supportsCloudSaves | D-14, D-03, quick 261104-tm6, D-08, quick 261104-uxr, D-02 | legendary or gog (second operand) |
| src/frontend/screens/Settings/sections/GamesSettings/index.tsx:89:24 | `const isSideloaded = gameInfo?.runner === 'sideload'` | behaviour | hasStoreCatalog | D-14, D-03, quick 261104-tm6, D-08, quick 261104-uxr, D-02 | isSideloaded |
| src/frontend/screens/Settings/sections/GamesSettings/index.tsx:91:50 | `const isMacSteamTitle = !isDefault && isMac && gameInfo?.runner === 's` | behaviour | usesBottleRuntime | D-14, D-03, quick 261104-tm6, D-08, quick 261104-uxr, D-02 | isMacSteamTitle |
| src/frontend/screens/Settings/sections/LogSettings/index.tsx:146:9 | `if (showLogOf.runner === 'legendary')` | identity | Record<Runner,..> lookup | - | log label |
| src/frontend/screens/Settings/sections/LogSettings/index.tsx:151:9 | `if (showLogOf.runner === 'gog')` | identity | Record<Runner,..> lookup | - | log label |
| src/frontend/screens/Settings/sections/LogSettings/index.tsx:153:9 | `if (showLogOf.runner === 'nile')` | identity | Record<Runner,..> lookup | - | log label |
| src/frontend/screens/Settings/sections/SyncSaves/index.tsx:51:7 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | - | legendary sync UI |
| src/frontend/screens/Settings/sections/SyncSaves/index.tsx:67:7 | `if (runner === 'gog') {` | identity | isStore(x,'gog') | - | gog sync UI |
| src/frontend/screens/WebView/components/TauriLoginPanel.tsx:111:7 | `if (runner === 'humble' && phase !== 'error' && phase !== 'timeout') {` | identity | isStore(x,'humble') | D-13 | humble login panel |
| src/frontend/screens/WebView/components/TauriLoginPanel.tsx:48:7 | `if (runner === 'humble') return 'Humble Bundle'` | identity | isStore(x,'humble') | D-06, D-04, REQ-34, WR-03, D-13 | humble title |
| src/frontend/screens/WebView/index.tsx:314:44 | `!LOGIN_PATHNAMES.includes(pathname) && runner !== 'humble'` | identity | isStore(x,'humble') | CR-02, D-34, D-35, D-04, D-16, D-06, D-07, D-05, D-19, D-02, D-14, D-09, D-32, D-29, D-10, D-24, REQ-34, D-12, D-01, 40-10 (D-02), D-08, REQ-40-12, quick 261012-d5g, D-11 | isStoreRoute |
| src/frontend/screens/WebView/index.tsx:494:9 | `if (store !== 'gog') return` | identity | isStore(x,'gog') | D-32, D-34, D-09, D-10, D-24, D-06, REQ-34, D-12, D-01, D-02, D-05, 40-10 (D-02), D-08, REQ-40-12, quick 261012-d5g, D-19, D-11 | gog log |
| src/frontend/screens/WebView/index.tsx:540:7 | `if (runner === 'humble') {` | identity | isStore(x,'humble') | D-06, REQ-34, D-09, D-12, D-01, D-02, D-24, D-05, D-34, 40-10 (D-02), D-08, REQ-40-12, quick 261012-d5g, D-19, D-10, D-11 | humble branch |
| src/frontend/screens/WebView/useTauriOAuthLogin.ts:127:5 | `switch (runner) {` | identity | Record<StoreKey,..> lookup (switch) | - | login handler per store |
| src/frontend/screens/WebView/useTauriOAuthLogin.ts:199:13 | `if (activeRunner === 'legendary') {` | identity | isStore(x,'legendary') | - | EPIC_LOGIN_URL |
| src/frontend/screens/WebView/useTauriOAuthLogin.ts:201:20 | `} else if (activeRunner === 'gog') {` | identity | isStore(x,'gog') | - | GOG_LOGIN_URL |
| src/frontend/screens/WebView/useTauriOAuthLogin.ts:341:13 | `if (activeRunner === 'legendary') {` | identity | isStore(x,'legendary') | - | epic code exchange |
| src/frontend/screens/WebView/useTauriOAuthLogin.ts:345:20 | `} else if (activeRunner === 'gog') {` | identity | isStore(x,'gog') | - | gog code exchange |
| src/frontend/state/GlobalState.tsx:1255:43 | `const includesEpic = !scopedRunner \|\| scopedRunner === 'legendary'` | identity | isStore(x,'legendary') | D-51, CR-01, D-07, D-11, D-10, D-05, quick 261106-pvk, D-06, D-16, D-13, WR-05, D-09, 49-07 (D-08), WR-09, D-26, D-31, D-32, D-18, D-23, quick 261102-dma, D-08, REQ-35-20, D-35 | scopedRunner includesEpic |
| src/frontend/state/GlobalState.tsx:1256:42 | `const includesGog = !scopedRunner \|\| scopedRunner === 'gog'` | identity | isStore(x,'gog') | D-51, CR-01, D-07, D-11, D-10, D-05, quick 261106-pvk, D-06, D-16, D-13, WR-05, D-09, 49-07 (D-08), WR-09, D-26, D-31, D-32, D-18, D-23, quick 261102-dma, D-08, REQ-35-20, D-35 | scopedRunner includesGog |
| src/frontend/state/GlobalState.tsx:1257:45 | `const includesAmazon = !scopedRunner \|\| scopedRunner === 'nile'` | identity | isStore(x,'nile') | D-51, CR-01, D-07, D-11, D-10, D-05, quick 261106-pvk, D-06, D-16, D-13, WR-05, D-09, 49-07 (D-08), WR-09, D-26, D-31, D-32, D-18, D-23, quick 261102-dma, D-08, REQ-35-20, D-35 | scopedRunner includesAmazon |
| src/frontend/state/GlobalState.tsx:1630:26 | `if (!gameInfo \|\| gameInfo.runner === 'sideload') {` | identity | isStore(x,'sideload') | D-07, D-11, D-10, D-05, D-51, quick 261106-pvk, D-06, D-16, D-13, WR-05, D-09, 49-07 (D-08), WR-09, D-26, D-31, D-32, D-18, D-23, quick 261102-dma, D-08, CR-01, REQ-35-20, D-35 | narrowing |
| src/frontend/state/GlobalState.tsx:1868:11 | `if (args.runner === 'gog') {` | identity | isStore(x,'gog') | quick 261102-dma, D-08, CR-01, REQ-35-20, D-35 | per-store state slice |
| src/frontend/state/GlobalState.tsx:1884:18 | `} else if (args.runner === 'legendary') {` | identity | isStore(x,'legendary') | quick 261102-dma, D-08, CR-01, REQ-35-20, D-35 | per-store state slice |
| src/frontend/state/GlobalState.tsx:1902:18 | `} else if (args.runner === 'steam') {` | identity | isStore(x,'steam') | quick 261102-dma, D-08, CR-01, REQ-35-20, D-35 | per-store state slice |
| src/frontend/state/GlobalState.tsx:2150:49 | `(game) => game.status === 'installing' && game.runner === 'legendary'` | identity | isStore(x,'legendary') | - | epic install lock |
| src/frontend/state/InstallGameModal.ts:407:7 | `if (runner === 'steam' && action === 'install' && gameInfo) {` | behaviour | isHandOffInstall (compound) | - | steam quick install |
| src/frontend/state/SteamBottleSetup.ts:50:55 | `return state.isOpen && state.appName === appName && runner === 'steam'` | behaviour | usesBottleRuntime | - | bottle setup state match |

## 62-18: frontend screens/Game

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:107:17 | `is.linux && gameInfo.runner === 'steam' && !!steamInfo?.compatibilityL` | behaviour | appNameIsSteamAppId | D-08, D-11 | ProtonDB level via Steam id |
| src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:123:5 | `gameInfo.runner === 'steam' &&` | behaviour | usesBottleRuntime | - | mac steam compat |
| src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:35:9 | `if (gameInfo.runner !== 'steam') {` | behaviour | appNameIsSteamAppId | D-51, D-08, D-11 | steam info fetch |
| src/frontend/screens/Game/GamePage/components/AppleWikiInfo.tsx:62:9 | `if (gameInfo.runner === 'sideload') {` | behaviour | hasStoreCatalog | D-08, D-11 | sideload skip |
| src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:100:11 | `if (gameInfo.runner === 'gog') {` | identity | isStore(x,'gog') | - | gog saves |
| src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:144:9 | `if (gameInfo.runner === 'gog') {` | identity | isStore(x,'gog') | - | open gog saves folder |
| src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:165:6 | `(gameInfo.runner === 'legendary' && savesPath === '') \|\|` | identity | isStore(x,'legendary') | - | savesPath disable |
| src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:166:6 | `(gameInfo.runner === 'gog' && !gogSaves.some((save) => save.location))` | identity | isStore(x,'gog') | - | gogSaves disable |
| src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:42:7 | `if (gameInfo.runner === 'sideload') {` | behaviour | hasStoreCatalog | - | sideload has no cloud saves |
| src/frontend/screens/Game/GamePage/components/CompatibilityInfo.tsx:58:7 | `if (gameInfo.runner === 'steam') {` | behaviour | appNameIsSteamAppId | - | protondb url by appId |
| src/frontend/screens/Game/GamePage/components/Description.tsx:11:7 | `if (runner !== 'sideload') {` | behaviour | hasStoreCatalog | - | sideload no description |
| src/frontend/screens/Game/GamePage/components/Developer.tsx:12:7 | `if (runner === 'sideload') {` | behaviour | hasStoreCatalog | - | sideload no developer |
| src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx:59:7 | `if (runner === 'sideload') {` | behaviour | hasStoreCatalog | - | sideload no size |
| src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx:63:7 | `if (runner === 'steam') {` | behaviour | installSizeFromSteamStore | - | steam size |
| src/frontend/screens/Game/GamePage/components/GameStatus.tsx:175:9 | `if (runner === 'steam' && is.installing) {` | behaviour | installManagedExternally | quick 261029-exu | steam installing |
| src/frontend/screens/Game/GamePage/components/GameStatus.tsx:193:7 | `runner === 'steam' &&` | behaviour | installManagedExternally | - | steam status |
| src/frontend/screens/Game/GamePage/components/GameStatus.tsx:242:7 | `runner === 'steam' &&` | behaviour | installHandOffToClient | - | steam hand-off status |
| src/frontend/screens/Game/GamePage/components/GameStatus.tsx:64:9 | `if (runner === 'gog' && is.notInstallable) {` | identity | isStore(x,'gog') | quick 261026-e1c, quick 261029-d7v, D-05, quick 261029-ji2, quick 261029-exu | gog not installable |
| src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx:24:7 | `if (gameInfo.runner !== 'steam') {` | identity | isStore(x,'steam') | - | humble key origin only for steam |
| src/frontend/screens/Game/GamePage/components/InstalledInfo.tsx:53:24 | `const isSideloaded = runner === 'sideload'` | behaviour | hasStoreCatalog | - | isSideloaded |
| src/frontend/screens/Game/GamePage/components/MainButton.tsx:201:7 | `gameInfo.runner === 'steam' &&` | behaviour | installManagedExternally | D-07, quick 260907-dbh, D-21, WR-14 | steam install button |
| src/frontend/screens/Game/GamePage/components/MainButton.tsx:227:26 | `if (is.installing && gameInfo.runner === 'steam') {` | behaviour | installManagedExternally | D-07, quick 260907-dbh, D-21, WR-14 | no pause/cancel (D-07) |
| src/frontend/screens/Game/GamePage/components/MainButton.tsx:276:7 | `gameInfo.runner === 'steam' &&` | behaviour | installHandOffToClient | quick 260907-dbh, D-07, D-21, WR-14 | steam install action |
| src/frontend/screens/Game/GamePage/components/MainButton.tsx:352:17 | `gameInfo.runner !== 'steam'` | behaviour | installManagedExternally | D-21, WR-14 | no cancel surface |
| src/frontend/screens/Game/GamePage/components/MainButton.tsx:69:6 | `(gameInfo.runner === 'steam' && is.installing) \|\|` | behaviour | installManagedExternally | D-07, quick 260907-dbh, D-21, WR-14 | disable cancel while polling (D-07) |
| src/frontend/screens/Game/GamePage/index.tsx:177:24 | `const isSideloaded = runner === 'sideload'` | behaviour | hasStoreCatalog | D-04, D-06, D-13, D-14, D-15, WR-04, REQ-34, 34.13-08, D-23, D-24 | isSideloaded |
| src/frontend/screens/Game/GamePage/index.tsx:206:5 | `gameInfo.runner !== 'sideload' &&` | behaviour | hasStoreCatalog | D-04, D-06, D-13, D-14, D-15, WR-04, REQ-34, 34.13-08, D-23, D-24 | notSupportedGame |
| src/frontend/screens/Game/GamePage/index.tsx:230:9 | `if (runner !== 'steam' \|\| !isMac) return` | behaviour | usesBottleRuntime | WR-04, REQ-34, 34.13-08, D-23, D-24 | mac steam setup effect |
| src/frontend/screens/Game/GamePage/index.tsx:289:11 | `runner !== 'sideload' &&` | behaviour | hasStoreCatalog | REQ-34, 34.13-08, D-23, D-24 | update check |
| src/frontend/screens/Game/GamePage/index.tsx:290:11 | `runner !== 'steam' &&` | behaviour | installManagedExternally | REQ-34, 34.13-08, D-23, D-24 | steam skips update check |
| src/frontend/screens/Game/GamePage/index.tsx:370:9 | `if (gameInfo.runner !== 'sideload')` | identity | isStore(x,'sideload') | REQ-34, 34.13-08, D-23, D-24 | narrowing for update |
| src/frontend/screens/Game/GamePage/index.tsx:757:9 | `if (gameInfo.runner === 'steam' && !is_installed) {` | behaviour | installHandOffToClient | - | steam install options entry |
| src/frontend/screens/Game/GamePage/index.tsx:769:9 | `if (gameInfo.runner === 'sideload') return` | identity | isStore(x,'sideload') | - | narrowing early return |
| src/frontend/screens/Game/GamePicture/index.tsx:23:9 | `if (store === 'legendary') {` | identity | isStore(x,'legendary') | - | epic image params |
| src/frontend/screens/Game/GameSubMenu/index.tsx:108:24 | `const isSideloaded = runner === 'sideload'` | behaviour | hasStoreCatalog | D-05, REQ-35-17, D-27, D-02, quick 261106-s3n | isSideloaded |
| src/frontend/screens/Game/GameSubMenu/index.tsx:109:19 | `const isSteam = runner === 'steam'` | behaviour | winePrefixToolsAvailable | D-05, REQ-35-17, D-27, D-02, quick 261106-s3n | isSteam gates (negated) |
| src/frontend/screens/Game/GameSubMenu/index.tsx:376:19 | `if (!isWin && runner === 'legendary') {` | identity | isStore(x,'legendary') | D-27, D-02, D-05, quick 261106-s3n | unix legendary menu item |
| src/frontend/screens/Game/GameSubMenu/index.tsx:421:5 | `['legendary', 'gog'].includes(runner) &&` | behaviour | supportsModifyInstall | D-27, D-02, D-05, quick 261106-s3n | legendary or gog |
| src/frontend/screens/Game/GameSubMenu/index.tsx:616:17 | `runner === 'legendary' &&` | identity | isStore(x,'legendary') | - | linux legendary item |
| src/frontend/screens/Game/ModifyInstallModal/index.tsx:45:14 | `{gameInfo.runner === 'gog' && (` | identity | isStore(x,'gog') | - | per-store dialog dispatch |
| src/frontend/screens/Game/ModifyInstallModal/index.tsx:48:14 | `{gameInfo.runner === 'legendary' && (` | identity | isStore(x,'legendary') | - | per-store dialog dispatch |
| src/frontend/screens/Game/TimeContainer/index.tsx:55:5 | `runner === 'steam' ? gameInfo.extra?.steamPlaytimeMinutes : undefined` | behaviour | playtimeFromStoreMetadata | - | steamPlaytimeMinutes |
| src/frontend/screens/Game/TimeContainer/index.tsx:68:7 | `if (runner === 'steam') {` | behaviour | playtimeFromStoreMetadata | - | steamLastPlayed |

## 62-19: frontend screens/Library, ConsoleMode, Humble, Login and anything else

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/frontend/screens/ConsoleMode/InstallOverlay/consoleSteamTarget.ts:171:7 | `if (runner === 'steam') {` | behaviour | installHandOffToClient | WR-01 | console steam target |
| src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:135:9 | `if (game.runner !== 'steam') return` | behaviour | installManagedExternally | D-23, WR-01, WR-02, D-29 | poll steam install |
| src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:210:9 | `if (game.runner === 'steam' && clientSetupHandOff) {` | behaviour | installHandOffToClient | D-29, WR-01 | client setup hand-off row |
| src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:405:10 | `{game.runner === 'steam' ? (` | behaviour | installHandOffToClient | D-29 | steam overlay body |
| src/frontend/screens/ConsoleMode/InstallOverlay/index.tsx:57:22 | `const isSideload = game.runner === 'sideload'` | identity | isStore(x,'sideload') | D-29, D-24, D-23, WR-01, WR-02 | isSideload variable |
| src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx:186:41 | `idle: status === 'playing' \|\| game.runner === 'steam'` | behaviour | launchHandedToClient | - | idle spinner |
| src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx:190:10 | `{game.runner === 'steam'` | behaviour | launchHandedToClient | - | launch text |
| src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx:197:8 | `{game.runner !== 'steam' && (` | behaviour | launchHandedToClient | - | no cancel hold hint |
| src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx:51:23 | `active: !!game && game.runner !== 'steam',` | behaviour | launchHandedToClient | - | useCancelOnHold inactive |
| src/frontend/screens/ConsoleMode/components/LaunchOverlay/index.tsx:90:9 | `if (game.runner === 'steam') {` | behaviour | launchHandedToClient | - | steam launch cleanup path |
| src/frontend/screens/ConsoleMode/index.tsx:285:9 | `if (game.runner !== 'sideload') {` | identity | isStore(x,'sideload') | - | narrowing for update |
| src/frontend/screens/Humble/Keys/index.tsx:411:5 | `switch (store) {` | identity | Record<StoreKey,..> lookup (switch) | D-53, D-43, REQ-43-24, WR-04 | login connected per store |
| src/frontend/screens/Humble/Keys/index.tsx:92:3 | `switch (store) {` | identity | Record<StoreKey,..> lookup (switch) | D-43, WR-02, WR-04, D-42, D-33, WR-06, D-67, D-20, D-65, D-66, D-58, WR-01, D-53, REQ-43-24 | login path per store |
| src/frontend/screens/Library/components/GameCard/constants.ts:9:7 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | - | epic image params |
| src/frontend/screens/Library/components/GameCard/index.tsx:188:9 | `if (gameInfo.runner !== 'sideload')` | identity | isStore(x,'sideload') | D-08, D-07, D-05, 37-REVIEW W-01, D-27, D-28, WR-10, WR-02, WR-05 | narrowing for update |
| src/frontend/screens/Library/components/GameCard/index.tsx:359:24 | `const isSideloaded = runner === 'sideload'` | behaviour | hasStoreCatalog | 37-REVIEW W-01, D-27, D-28, WR-10, WR-02, WR-05, D-05 | isSideloaded |
| src/frontend/screens/Library/components/GameCard/index.tsx:360:19 | `const isSteam = runner === 'steam'` | behaviour | canBeDelisted | 37-REVIEW W-01, D-27, D-28, WR-10, WR-02, WR-05, D-05 | isSteam feeds isNoStorePageGame (37-REVIEW W-01) |
| src/frontend/screens/Library/components/GameCard/index.tsx:627:29 | `{(justPlayed \|\| runner !== 'nile') && logo && (` | identity | isStore(x,'nile') | WR-10, WR-02, D-27, WR-05, D-05 | amazon logo |
| src/frontend/screens/Library/components/GameCard/index.tsx:740:7 | `gameInfo.runner === 'steam'` | behaviour | installHandOffToClient | - | steam install click |
| src/frontend/screens/Library/components/GameCard/index.tsx:746:38 | `if (!isInstalled && !isQueued && gameInfo.runner !== 'sideload') {` | identity | isStore(x,'sideload') | - | narrowing for install |
| src/frontend/screens/Library/components/GameCard/steamIncompleteCard.ts:15:5 | `args.runner === 'steam' &&` | behaviour | installManagedExternally | - | steam-incomplete card |
| src/frontend/screens/Library/components/GamesList/index.tsx:112:21 | `if (gameInfo.runner !== 'sideload')` | identity | isStore(x,'sideload') | - | narrowing |
| src/frontend/screens/Library/components/GamesList/index.tsx:95:15 | `if (gameInfo.runner !== 'sideload') {` | identity | isStore(x,'sideload') | - | narrowing for is_dlc |
| src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:495:11 | `if (runner === 'legendary') {` | identity | isStore(x,'legendary') | - | sdl config |
| src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:639:5 | `['legendary', 'gog'].includes(runner) && DLCList && DLCList?.length > ` | behaviour | supportsDlcSelection | - | legendary or gog |
| src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:119:22 | `if (!info \|\| info.runner !== 'sideload') {` | identity | isStore(x,'sideload') | - | narrowing |
| src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx:193:21 | `disabled={runner !== 'legendary'}` | identity | isStore(x,'legendary') | - | third-party install is epic-only |
| src/frontend/screens/Library/components/InstallModal/WineSelector/engineFilter.ts:31:27 | `return crossoverOnly ?? runner === 'steam'` | behaviour | usesBottleRuntime | WR-08 | crossover-only default |
| src/frontend/screens/Library/components/InstallModal/WineSelector/index.tsx:198:5 | `runner === 'steam' &&` | behaviour | usesBottleRuntime | WR-07, CR-01 | mac steam bottle |
| src/frontend/screens/Library/components/InstallModal/defaultPlatform.ts:57:10 | `return runner === 'steam' ? macDepotOffered : isMacNative` | behaviour | usesBottleRuntime | D-14 | mac depot offered vs native |
| src/frontend/screens/Library/components/InstallModal/index.tsx:186:22 | `const isSideload = runner === 'sideload'` | behaviour | hasStoreCatalog | D-01, 34.13-12, 34.13-08, D-17, 34.13-05, D-12, D-05, D-04, CR-01, D-14, D-25, D-20, D-07, quick 261105-upw, quick 261030-o77, WR-02, D-22, WR-04, D-03, WR-15, 34.13-11, WR-01, D-11, D-18, quick 260819-s8p, WR-03, D-16 | isSideload |
| src/frontend/screens/Library/components/InstallModal/index.tsx:193:5 | `runner === 'steam' && action === 'install' && Boolean(gameInfo)` | behaviour | isHandOffInstall (compound) | D-17, 34.13-12, 34.13-05, D-12, D-05, D-04, D-01, CR-01, D-14, D-25, D-20, D-07, quick 261105-upw, quick 261030-o77, WR-02, D-22, WR-04, D-03, WR-15, 34.13-11, WR-01, D-11, D-18, quick 260819-s8p, WR-03, D-16 | runner==='steam' && action==='install' |
| src/frontend/screens/Library/components/InstallModal/index.tsx:625:47 | `const disabledPlatformSelection = Boolean(runner === 'sideload' && app` | identity | isStore(x,'sideload') | D-14, D-25, D-16, CR-01 | disabledPlatformSelection |
| src/frontend/screens/Library/components/InstallModal/steamEligibilityProbe.ts:82:7 | `if (runner !== 'steam' \|\| action !== 'install') {` | behaviour | isHandOffInstall (compound) | 34.13-08, D-04, D-12, 34.13-11, D-02, 34.13-05, D-25, D-05, D-01, D-03, D-20, WR-02, WR-04, WR-08, WR-15, 34.13-07 | runner!=='steam'  |
| src/frontend/screens/Library/components/LibrarySignInNotice/index.tsx:64:3 | `switch (store) {` | identity | Record<StoreKey,..> lookup (switch) | D-10 | logo per store |
| src/frontend/screens/Library/filterEngine.ts:371:29 | `const isNoStorePageGame = game.runner === 'steam' && !!game.is_deliste` | behaviour | canBeDelisted | D-09, D-03, D-28, D-26, D-02, WR-01, D-08, quick 260827-vpl, D-04 | isNoStorePageGame (canonical) |
| src/frontend/screens/Library/gameCount.ts:139:9 | `game.runner === 'steam' &&` | identity | isStore(x,'steam') | - | steam DLC count scope |
| src/frontend/screens/Library/gameCount.ts:46:14 | `(lib) => lib.runner !== 'sideload' && lib.install.is_dlc` | identity | isStore(x,'sideload') | CR-01, REQ-37-02, D-15 | narrowing for is_dlc |
| src/frontend/screens/Library/librarySort.ts:206:7 | `if (game.runner === 'steam') {` | behaviour | playtimeFromStoreMetadata | - | steamLastPlayed |
| src/frontend/screens/Library/useNonSteamLastPlayed.ts:108:30 | `games.filter((game) => game.runner !== 'steam').map((g) => g.app_name)` | behaviour | playtimeFromStoreMetadata | - | non-steam last-played fetch |
| src/frontend/screens/Login/components/LoginWarning/index.tsx:34:14 | `} else if (warnLoginForStore === 'gog') {` | identity | isStore(x,'gog') | - | gog login warning |

## Flag set

Per-runner values (runner order: legendary, gog, sideload, nile, steam). Per-game facts (`is_delisted`, `thirdPartyManagedApp`, `canRunOffline`, `steamResumePending`) stay on `GameInfo`.

| flag | true for | behaviour | justifying sites |
|---|---|---|---|
| installManagedExternally | steam | install, progress, completion toast, cancel and uninstall are owned by the Steam client and the ACF poller; no pause/cancel surface, no generic folder delete (D-07, GAME-03) | downloadqueue, downloadmanager/utils, uninstaller, dispatch:155, MainButton, GameStatus, hasStatus, hooks/constants, status.ts, steamManagedModel, steamIncompleteCard, ConsoleMode InstallOverlay:135 |
| installHandOffToClient | steam | install begins by handing off to the Steam client (quick install, client setup, install-options entry) | steamInstallOptionsEntry, UninstallModal:73, GamePage:757, GameCard:740, MainButton:276, GameStatus:242, ConsoleMode InstallOverlay |
| launchHandedToClient | steam | launch is a `steam://` hand-off or bridge spawn, args ignored, no cancel hold | protocol:134/212, steamFlowRegistration:361, LaunchOverlay |
| usesBottleRuntime | steam | the game runs in a bottle with CrossOver-first engine selection | launcher:254, macArch, engineFilter, WineSelector, defaultPlatform, SteamBottleSetup, GamesSettings:91, GamePage:230, AppleWikiInfo:123 |
| appNameIsSteamAppId | steam | `appName` is the Steam appId (wiki, ProtonDB, gamesdb, crossover index) | wiki_game_info:167, gamesdb, crossover_index, CompatibilityInfo, AppleWikiInfo |
| playtimeFromStoreMetadata | steam | playtime and last-played come from store metadata, not local tracking | TimeContainer, librarySort, useNonSteamLastPlayed |
| playtimeTrackedExternally | steam | play sessions are recorded by bottleProcessMonitor, not by launcher | launcher:303 |
| canBeDelisted | steam | store-page-less delisted handling applies (reads per-game `is_delisted`) | filterEngine:371, GameCard:360 |
| installSizeFromSteamStore | steam | install size comes from the Steam store query | downloadqueue:253, DownloadSizeInfo:63 |
| supportsDlcSelection | legendary, gog | DLC list selector at install | DownloadDialog:639 |
| supportsCloudSaves | legendary, gog | cloud saves settings tab | GamesSettings:87 |
| supportsModifyInstall | legendary, gog | modify-install menu item | GameSubMenu:421 |
| hasStoreCatalog | legendary, gog, nile, steam (not sideload) | store-provided metadata: description, developer, size, update, anticheat, cloud sync | Description, Developer, DownloadSizeInfo:59, hasAnticheatInfo, CloudSavesSync:42, umu, others |
| canAddSteamShortcut | legendary, gog, sideload, nile (not steam) | "Add to Steam" shortcut makes sense | shortcuts.ts:48 |
| winePrefixToolsAvailable | legendary, gog, sideload, nile (not steam) | wine prefix tools (backend deny, frontend hides) | tools/index:1500, GameSubMenu:109 |

## Compound predicates

- `isHandOffInstall(runner, action)` = `hasCapability(runner, 'installHandOffToClient') && action === 'install'`. Inputs are common types, so it lives in `src/common/storeCapabilities.ts`. Replaces InstallModal:193, steamEligibilityProbe:82, state/InstallGameModal:407.
- Other compounds (GameStatus steam+installing, MainButton steam+installing, steamInstallOptionsEntry) combine a flag with frontend-only state; the converting plan builds them in `src/frontend/helpers/<name>.ts` (62-17 owns frontend helpers) as `hasCapability(runner, flag) && <state>`.

## 62-23: WR-02 sites (gap closure)

| site | expression | class | target | decision IDs nearby | note |
|---|---|---|---|---|---|
| src/backend/utils.ts:455 | `if (library === 'gog' \|\| !library) {` | identity | isStore(x,'gog') | D-02 | per-store cache clear |
| src/backend/utils.ts:461 | `if (library === 'legendary' \|\| !library) {` | identity | isStore(x,'legendary') | D-02 | per-store cache clear |
| src/backend/utils.ts:476 | `if (library === 'nile' \|\| !library) {` | identity | isStore(x,'nile') | D-02 | per-store cache clear |
| src/frontend/components/UI/NavShell/components/FilterStoreFacet/index.tsx:72 | `value === 'sideload'` | identity | isStore(x,'sideload') | D-02 | facet value is the runner; sideload has no brand, label Other |
| src/frontend/components/UI/NavShell/components/FilterFocusRow/index.tsx:135 | `value === 'sideload'` | identity | isStore(x,'sideload') | D-02 | facet value is the runner; sideload has no brand, label Other |
| src/frontend/screens/Library/components/FocusRowStrip/index.tsx:228 | `focusRow.value === 'sideload'` | identity | isStore(x,'sideload') | D-02 | facet value is the runner; sideload has no brand, label Other |
| src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts:84 | `descriptor.value === 'sideload'` | identity | isStore(x,'sideload') | D-02 | facet value is the runner; sideload has no brand, label Other |

The filter `value` is a genuine store identity, not an opaque facet value or a capability: `StoreFacetValue` is the runner union, and the `'sideload'` branch only picks a label (`RunnerToStore` deliberately has no `sideload` key), so `isStore` is correct. The widened selector's remaining blind spots are documented in the `meta/runnerLiteralSelectors.cjs` header. Task 1's lint run surfaced exactly these seven sites and no others.
