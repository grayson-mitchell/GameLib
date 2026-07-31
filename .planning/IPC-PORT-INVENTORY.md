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

## Phase 34.4 — Slice 7 — Steam completion and Humble (31 channels)

Re-scoped 2026-07-27 by `34.4-CONTEXT.md` **D-01/D-02/D-03**: the original 38 became 31.
`isLoggedIn` moved to Phase 34.5 (it is `LegendaryUser.isLoggedIn()` — Epic auth, filed here
only because this inventory grouped channels by file; same reassignment class as 34.1 D-14's
`callTool`). The 6 Humble browser-auth channels moved to the new **Phase 34.4.1** below,
because the `<webview>` + `session.fromPartition` seam they need is shared with Phase 34.5's
Epic/GOG/Amazon logins and does not belong inside a store slice.

`getPrivateBranchPassword`, `getSteamInstallSize`, `getSteamSyncedAt`, `getSteamUserInfo`, `humbleCheckHealth`, `humbleClearOwnershipOverride`, `humbleDisconnect`, `humbleGetClaimAnnotations`, `humbleGetGiftedAt`, `humbleGetKeys`, `humbleGetOwnershipOverrides`, `humbleGetRevealedKeyValue`, `humbleGetSyncState`, `humbleGetUserInfo`, `humbleMarkRedeemed`, `humbleRecordGiftLinkOpened`, `humbleRunValidation`, `humbleSetOwnershipOverride`, `humbleSync`, `humbleUndoRedeemed`, `isSteamBottleProvisioned`, `logoutSteam`, `redeemSteamKey`, `setPrivateBranchPassword`, `steamBottleProvision`, `steamBottleStatus`, `steamClientSetupRecheck`, `steamClientSetupStart`, `steamPollCredential`, `steamStartCredentials`, `steamSubmitGuard`

Note: `humbleDisconnect` shipped here as a **declared partial** (34.4 **D-05**) — it deleted the
stored encrypted cookie (the real sign-out) but its `session.clearStorageData()` call no-opped
against `electronStub.session`. **RESOLVED 2026-07-31 — the partial is CLOSED, live-proven by
Phase 34.4.1's third gate run** (`34.4.1-LIVE-GATE-RERUN-3.md`, item 3 PASS, verdict 4/4):

```
Humble disconnect: cookie census before(total=34, matched=34, verdict=SUPPORTED_NONEMPTY)
                                after(total=0,  matched=0,  verdict=SUPPORTED_BUT_EMPTY)
                                deleted=34 survivingNonHumble=0
Humble disconnect: cleared 34 humblebundle.com cookie(s)
Humble disconnect: cleared storage — localStorage=29, sessionStorage=0, indexedDB=1, caches=0, serviceWorkers=0
```

The storage clear is real, per-category and reported: it is no longer a no-op. The reported clear
count agrees with an independent post-removal re-read of the jar, and the behavioural half was
verified separately — the re-login was genuinely fresh (**68 `session_expired` rejections over
6 min 17 s**, against the failing run's ~3 seconds and zero poll lines).

**It took three live gate runs to get here** (FAIL 2/4 → FAIL 3/4 → PASS 4/4), and a fully-green
test suite was present for all three. Two distinct defects hid behind that green: a census reading
the cookie jar in the **wrong direction** (undercounting Humble's own cookies), and a delete
reporting an **attempted** count for an operation WebKit never actually performed.

**One property remains explicitly UNTESTED and must not be read as closed here:** that the clear is
**domain-scoped**. `survivingNonHumble=0` is vacuous, not passing — the jar held only Humble cookies
(`total` 34 == `matched` 34), so nothing existed for the delete to spare. See
`REQ-34.4.1-GAP-05`'s rider in `.planning/REQUIREMENTS.md`. Whichever phase next holds a
multi-origin jar owns re-running that check.

## Phase 34.4.1 — the embedded-browser login seam (6 channels)

`humbleGetLoginUserAgent`, `humbleLoginNavigated`, `humbleReconnect`, `humbleRevealKey`, `humbleStartLogin`, `humbleStopLogin`

Carved out of slice 7 on 2026-07-27. Five of the six drive `HumbleUser.watchForLogin()`'s
partition-cookie poll or the `<webview>`'s user-agent; `humbleRevealKey` is a *different*
Chromium dependency — `humblePostRequest` (`humble/adapter.ts:264`) routes through Electron's
`net.request` on the `persist:humble` partition specifically because Cloudflare Bot Management
403s axios's TLS/HTTP fingerprint. **This phase runs BEFORE Phase 34.5**, whose Epic/GOG/Amazon
logins depend on the same seam.

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (57 channels)

**Re-scoped 2026-07-29 by `34.5-CONTEXT.md` D-01/D-02/D-03: the 57 below reconciles as
38 ported + 3 dropped + 16 moved.**
- **3 DROPPED permanently:** `authZoom`, `getZoomUserInfo`, `logoutZoom` — never ported; Zoom
  sign-in dies at the Phase 35 cutover. Rationale (D-02): absent from GameLib's stated core value
  ("Epic, GOG, Amazon, and Steam"), smallest storefront, purely inherited from Heroic. No new code
  is needed — the `UNPORTED_CHANNEL_MARKER` machinery already catches them at boot and declares
  them honestly.
- **16 MOVED** to the new `## Phase 34.6` section below (EOS overlay 8, SteamGridDB artwork 5,
  winetricks 3) — see that section for the full list by cluster. Rationale (D-03/D-05): deferred,
  not dropped, and tracked in `ROADMAP.md`'s new Phase 34.6 entry so Phase 35's completion gate
  stays honest rather than silently accepting the loss.
- **Correction carried forward (D-04):** `getCometVersion` is GOG's, not Zoom's — `comet` is the
  GOG Galaxy Communication replacement, gated on `gameInfo.runner === 'gog'`
  (`src/backend/launcher.ts:973`). It **IS ported** in the 38, under Runner CLI versions; an
  earlier discussion wrongly bundled it with Zoom.
- `callTool` (arrived from Phase 34.1 per D-14) and `isLoggedIn` (arrived from Phase 34.4 per
  D-03) are both already reflected in the 57 below — no further reassignment needed.

Gained `isLoggedIn` from slice 7 on 2026-07-27 (34.4 **D-03**) — 56 → 57.

`addShortcut`, `addToSteam`, `authAmazon`, `authGOG`, `authZoom`, `callTool`, `disableEosOverlay`, `downloadRuntime`, `egsSync`, `enableEosOverlay`, `getAlternativeWine`, `getAmazonLoginData`, `getAmazonUserInfo`, `getCometVersion`, `getEosOverlayStatus`, `getEpicGamesStatus`, `getGOGLinuxInstallersLangs`, `getGogdlVersion`, `getLatestEosOverlayVersion`, `getLegendaryVersion`, `getNileVersion`, `getUserInfo`, `getZoomUserInfo`, `installEosOverlay`, `installWineVersion`, `isAddedToSteam`, `isEosOverlayEnabled`, `isLoggedIn`, `isRuntimeInstalled`, `login`, `logoutAmazon`, `logoutGOG`, `logoutLegendary`, `logoutZoom`, `processShortcut`, `refreshWineVersionInfo`, `removeEosOverlay`, `removeFromSteam`, `removeShortcut`, `removeWineVersion`, `runWineCommand`, `shortcutsExists`, `steamgriddb.getGrids`, `steamgriddb.getHeroes`, `steamgriddb.hasApiKey`, `steamgriddb.searchGame`, `steamgriddb.setApiKey`, `syncGOGSaves`, `syncSaves`, `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D`, `updateEosOverlayInfo`, `wine.isValidVersion`, `winetricksAvailable`, `winetricksInstall`, `winetricksInstalled`

## Phase 34.6 — Slice 9 — EOS overlay, SteamGridDB and winetricks (16 channels)

Split out of Phase 34.5's 57 on 2026-07-29 (D-03/D-05) — deferred, not dropped, because Phase
35's cutover requires the IPC re-plumb to be **COMPLETE**. This phase runs BEFORE Phase 35.

`disableEosOverlay`, `enableEosOverlay`, `getEosOverlayStatus`, `getLatestEosOverlayVersion`, `installEosOverlay`, `isEosOverlayEnabled`, `removeEosOverlay`, `updateEosOverlayInfo` (EOS overlay, 8)

`steamgriddb.getGrids`, `steamgriddb.getHeroes`, `steamgriddb.hasApiKey`, `steamgriddb.searchGame`, `steamgriddb.setApiKey` (SteamGridDB artwork, 5)

`winetricksAvailable`, `winetricksInstall`, `winetricksInstalled` (winetricks, 3)

`winetricksInstall` is `addListener`/send-kind (`tools/ipc_handler.ts`) — inherits the send-channel
silent-failure warning already documented for this project's other send channels. `callTool`'s
`winetricks` branch already works from Phase 34.5 via `Winetricks.run()` on the shared
`tools/index.ts` object; this phase is only about the three dedicated IPC channels above.

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
