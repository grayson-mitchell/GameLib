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

## Preload-surface coverage

Every channel exposed via `makeHandlerInvoker`/`makeListenerCaller` under `src/preload/` appears
in exactly one bucket line of this document. Enforcement: `preload-surface-gate.py`
(`.planning/phases/34.5-.../preload-surface-gate.py`), which re-derives the surface from source
at run time rather than trusting any transcribed list. Provenance: `34.5-PRELOAD-SURFACE-AUDIT.md`
(plan 34.5-49, D-CYCLE6-C, 2026-08-12), which measured the gap this invariant closes. Push
(`frontendListenerSlot`) channels are out of tally by this document's own `## Method` convention
above. This is what makes the header rule at the top of this file — "Phase 35 must not run while
any channel below is unported" — mean something for the first time: the set it quantifies over is
now provably the real one, not merely the originally-transcribed one.

## Totals

| | Count |
|---|---:|
| Unique channels | 222 |
| Ported to sidecar | 28 |
| **Unported** | **183** |

Reconciles with SEAM.md line 366 ("~208 of the 220 total IPC endpoints ... remain") and its
"28 wired/re-routed total" tally — that count was approximate and pre-dates this edit; the
`logError` early port below moves it to 28/182 (this table's own historical Phase 34.1-era
snapshot), not yet reflected in SEAM.md's own approximate figure.

**Unique channels raised 210 → 211 (plan 34.5-43, F-34.5-G6-10):** `getInstallInfo` was a real
preload channel that existed in the source the whole time (`common/types/ipc.ts:217`,
`main.ts:842`) but was never counted by this document's original grep-based tally — the +1 is the
previously unlisted channel entering the count for the first time, not a newly created one. This
table's "Ported to sidecar"/"Unported" split is a frozen Phase 34.1-era snapshot and is not
re-tallied per phase (the per-phase sections below carry the current per-slice counts); the +1
above is reflected in "Unported" only because that is where an unlisted-but-real channel belongs
until it is credited to a specific phase's ported set below.

**Unique channels raised 211 → 222 (plan 34.5-49, D-CYCLE6-C, 2026-08-12):** the full
preload-surface audit (`34.5-PRELOAD-SURFACE-AUDIT.md`) diffed **every** channel exposed under
`src/preload/` (217 distinct invoke+send channels, multi-line-aware and comment-stripped) against
this document's bucket lines (211 names) and found **11 unlisted**, each now bucketed below: 3
into "Already ported" (`connectivity-changed`, `get-connectivity-status`, `oauthCaptureLogin` —
each reached under the sidecar by a route other than a dedicated `*FlowRegistration.ts` file, see
the audit for the grep evidence) and 8 into the new "Late-discovered" section owned by Phase 34.6
(`frontendReady`, `getAchievements`, `getDefaultSavePath`, `getGogDiscounts`,
`getPlaytimeFromRunner`, `importGame`, `moveInstall`, `runWineCommandForGame`). 211 + 11 = 222.
This +11 is arithmetically independent of the Phase 34.5 section's own 39+3+16=58 reconciliation
below — none of the 11 belong to slice 8's four runner modules.

## Already ported (31)

`cancelDownload`, `checkGameUpdates`, `checkSteamInstalled`, `connectivity-changed`, `getDMQueueInformation`, `get-connectivity-status`, `getLogContent`, `getMaxCpus`, `getSystemInfo`, `hasExecutable`, `health`, `install`, `isNative`, `launch`, `listSteamLibraryTargets`, `logError`, `oauthCaptureLogin`, `openDialog`, `pauseCurrentDownload`, `refreshLibrary`, `removeFromDMQueue`, `requestAppSettings`, `requestGameSettings`, `resumeCurrentDownload`, `setSetting`, `showUpdateSetting`, `steamPollQR`, `steamStartQR`, `uninstall`, `updateGame`, `writeConfig`

`logError` was ported early by Phase 34.2 gap cycle 2 (plan 34.2-16) — see the Phase 34.3 list
below, which now excludes it, and `34.2-PORTED-CHANNELS.md`'s gap-cycle-2 subsection for the full
rationale (REQ-34.2-12, code-review CR-01). It is a `sidecar send` channel, not one of Phase 34.2's
own 26 slice-5 channels. Phase 34.3 must NOT register it a second time.

**Three more added 2026-08-12 by plan 34.5-49 (D-CYCLE6-C), late-discovered by the full
preload-surface audit — 28 → 31:**
- `connectivity-changed` (sidecar send) and `get-connectivity-status` (sidecar invoke) are
  registered by `src/backend/online_monitor.ts` (`addListener`/`addHandler` from `backend/ipc`),
  which `src/backend/sidecar/bootstrap.ts:480` imports and calls (`initOnlineMonitor()`) directly
  at boot, reached under the sidecar via the `Module._load` shim that redirects `require('electron')`
  to `electronStub.ts`. This is a genuine port — just not via a dedicated
  `sidecar/*FlowRegistration.ts` file the way most of this inventory's other entries are — and is
  confirmed live by the dedicated `src/backend/sidecar/__tests__/onlineMonitorWiring.test.ts`.
  `set-connectivity-online` (their sibling, same module) was already correctly bucketed under
  Phase 34.1.
- `oauthCaptureLogin` (sidecar invoke) was **never registered under Electron at all** — it is a
  Tauri-only channel added by Phase 34.4.1 (D-01/D-04, `src/backend/sidecar/oauthLoginFlowRegistration.ts`)
  and was simply never written into a bucket line. It carries an OAuth `code=`/redirect URL — see
  the audit's finding note; recorded here as ported, the credential-handling concern is a
  **separate** flag, not a reason to withhold bucketing.

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

## Phase 34.5 — Slice 8 — non-Steam runners, Wine and shortcuts (58 channels)

**Re-scoped 2026-07-29 by `34.5-CONTEXT.md` D-01/D-02/D-03, then again 2026-08-11 by plan 34.5-43
(F-34.5-G6-10): the 58 below reconciles as 39 ported + 3 dropped + 16 moved.**
- **39th channel, late-discovered (2026-08-11, plan 34.5-43):** `getInstallInfo` was found
  unported AND absent from every bucket in this document (see the amended ⚠ paragraph below). It
  is ported by plan 34.5-43 into `gameDetailsFlowRegistration.ts` — a game-details channel by
  concern, not one of this slice's four runner modules — bringing the reconciliation from
  38+3+16=57 to 39+3+16=58.
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
  D-03) are both already reflected in the 58 below (they were already in the prior 57 before
  `getInstallInfo` joined) — no further reassignment needed.

Gained `isLoggedIn` from slice 7 on 2026-07-27 (34.4 **D-03**) — 56 → 57.

`addShortcut`, `addToSteam`, `authAmazon`, `authGOG`, `authZoom`, `callTool`, `disableEosOverlay`, `downloadRuntime`, `egsSync`, `enableEosOverlay`, `getAlternativeWine`, `getAmazonLoginData`, `getAmazonUserInfo`, `getCometVersion`, `getEosOverlayStatus`, `getEpicGamesStatus`, `getGOGLinuxInstallersLangs`, `getGogdlVersion`, `getInstallInfo`, `getLatestEosOverlayVersion`, `getLegendaryVersion`, `getNileVersion`, `getUserInfo`, `getZoomUserInfo`, `installEosOverlay`, `installWineVersion`, `isAddedToSteam`, `isEosOverlayEnabled`, `isLoggedIn`, `isRuntimeInstalled`, `login`, `logoutAmazon`, `logoutGOG`, `logoutLegendary`, `logoutZoom`, `processShortcut`, `refreshWineVersionInfo`, `removeEosOverlay`, `removeFromSteam`, `removeShortcut`, `removeWineVersion`, `runWineCommand`, `shortcutsExists`, `steamgriddb.getGrids`, `steamgriddb.getHeroes`, `steamgriddb.hasApiKey`, `steamgriddb.searchGame`, `steamgriddb.setApiKey`, `syncGOGSaves`, `syncSaves`, `toggleDXVK`, `toggleDXVKNVAPI`, `toggleVKD3D`, `updateEosOverlayInfo`, `wine.isValidVersion`, `winetricksAvailable`, `winetricksInstall`, `winetricksInstalled`

**Status (2026-08-02): the blocking live gate has now run THREE times and FAILED all three —
channel membership and the 38/3/16 split above are unchanged by any of them.** The first run
(`34.5-LIVE-GATE.md`, plan 34.5-15) FAILED 0/5 on a `publicDir`-resolution defect that kept the
`legendary`/`gogdl`/`nile` runner binaries from spawning at all. A gap cycle (plans 34.5-16
through 34.5-18) closed that defect at the code level, and a RE-RUN
(**`34.5-LIVE-GATE-RERUN.md`**, plan 34.5-20) re-attempted all five items: **FAIL, 0 of 5 clean**
(3 FAIL — items 1/2/3 — and 2 NOT ATTEMPTED — items 4/5). The RE-RUN proved the runner-binary
spawn defect closed (all four binaries `exists=true`, no asset-root defect line) and that the
OAuth redirect-capture mechanism itself works for `gog` and `nile`, but surfaced a new,
downstream-of-capture defect: nothing consumes a successful capture into a completed,
UI-visible, library-populated login.

A THIRD run (**`34.5-LIVE-GATE-RERUN-2.md`**, plan 34.5-41, gap cycle 5) attempted all five items
again: **FAIL, 0 of 5 clean** — `items_passed: 0`, `items_failed: 2` (items 2, 4),
`items_blocked: 1` (item 1), `items_not_attempted: 2` (items 3, 5). It closed the RE-RUN's own
downstream-of-capture defect (F-34.5-G6-02): GOG's full chain — capture → `gogdl auth` →
`refreshLibrary complete runner=gog managers=1` → 7 titles persisted — ran end to end, with
`[useTauriOAuthLogin] runner=gog phase=idle (login completed, library refresh triggered)` firing
twice where run 2 produced zero such lines. The failure moved again, to a frontend-render layer:
the library data lands on disk and the UI shows nothing. **Items 4 and 5 carry a result for the
first time in this phase's history** — item 4 FAIL, item 5 NOT ATTEMPTED with its blocking
prerequisite explicitly recorded rather than silently skipped.

⚠ **This inventory was NOT exhaustive, and the extent of that incompleteness is still UNKNOWN
(F-34.5-G6-10, 2026-08-02; amended 2026-08-11 by plan 34.5-43).** The third gate found
`getInstallInfo` — a real channel (`src/common/types/ipc.ts:217`, exposed via
`src/preload/api/helpers.ts:43` as `makeHandlerInvoker`) — to be unported AND absent from every
bucket in this document: it was not among the 38 ported, the 3 dropped, or the 16 deferred to
Phase 34.6. It surfaced live as
`[GAMELIB_UNPORTED_CHANNEL] No handler registered for channel 'getInstallInfo'`, blocking the game
page outright. **Plan 34.5-43 has since ported `getInstallInfo` and bucketed it** (now the 39th
name in the 39+3+16=58 reconciliation above) — but it was ONE previously unlisted channel out of
an UNKNOWN total, and fixing this one named example **must not be assumed to be** evidence that no
others remain. **The header rule above — "Phase 35 must not run while any channel below is
unported" — cannot catch a channel that was never listed.** `ported-channels-gate.py` verifies
that the 39+3+16=58 split reconciles *internally*; it does not verify that this inventory covers
the real preload surface. No audit of that surface has been performed, so the true number of
missing channels is unknown and **must not be assumed to be one**. Auditing it is a Phase 35
precondition, scoped to gap cycle 6, and is plan **34.5-49**'s own deliverable (D-CYCLE6-C) — this
plan (34.5-43) buckets ONE channel only and does not perform that audit.

**UPDATE 2026-08-12 (plan 34.5-49, D-CYCLE6-C) — the extent is now KNOWN: 11 more unlisted
channels, all bucketed.** `34.5-PRELOAD-SURFACE-AUDIT.md` re-derived the preload surface from
source (217 distinct invoke+send channels, multi-line-aware, comment-stripped) and set-differenced
it against this document's bucket-line names (211). The result was **11** unlisted channels — not
zero, and not assumed to be one — each now bucketed above (3 into "Already ported", 8 into the new
"Late-discovered — owner Phase 34.6" section). This closes the **enumeration question**
`U-34.5-14` was created to answer; it closes **nothing** about whether any of those 11 (or any of
the other 211+11=222) channels actually works under Tauri. This paragraph is kept, not deleted,
because it is provenance: deleting the record of how the gap was found the moment it stops being
embarrassing would recreate the exact blind spot `U-34.5-14` exists to prevent. See the
"Preload-surface coverage" section below for the standing invariant this establishes.

Per D-08's no-partial-pass rule, Phase 34.5 does NOT close on any of these three results; see
`34.5-LIVE-GATE-RERUN-2.md` for the third run's full evidence and `34.5-42-SUMMARY.md` for this
propagation pass.

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

## Late-discovered — owner Phase 34.6 (8 channels)

Found 2026-08-12 by plan 34.5-49's full preload-surface audit (D-CYCLE6-C,
`34.5-PRELOAD-SURFACE-AUDIT.md`) — unported, and absent from every bucket line until this plan.
Deliberately **not** folded into the "Phase 34.6 — Slice 9" list above: none of these 8 belong to
the EOS overlay, SteamGridDB or winetricks clusters that section's own "(16 channels)" heading
counts, and merging them in would silently inflate that historical count. This section is their
own bucket, with Phase 34.6 as the owner because that is the next phase scheduled to port
non-Steam-runner/Wine/shortcut-adjacent unported channels before Phase 35's cutover gate.

`frontendReady`, `getAchievements`, `getDefaultSavePath`, `getGogDiscounts`, `getPlaytimeFromRunner`, `importGame`, `moveInstall`, `runWineCommandForGame`

- `getDefaultSavePath` already had a prior owner decision (Phase 34.6, per
  `34.5-PORTED-CHANNELS.md` correction 1 / `deferred-items.md` item 4) — this is its first actual
  bucket **line**.
- `importGame`, `moveInstall` and `runWineCommandForGame` are flagged findings
  (T-34.5-C6-49-03, see the audit): renderer-supplied filesystem paths / a command string
  reaching a Wine process, with no sidecar handler. Flagging is a record, not a fix.
- `frontendReady` has a real, unguarded frontend caller (`GlobalState.tsx:1586`) that will hit
  `UNPORTED_CHANNEL_MARKER` under Tauri today.
- `getAchievements`, `getGogDiscounts`, `getPlaytimeFromRunner` are plain unported reads with no
  sidecar registration found by grep.

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
