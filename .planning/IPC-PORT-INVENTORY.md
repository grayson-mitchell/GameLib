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

**Last verified: 2026-08-25, commit `3b44e05da`, findings: 0** (plan 34.6-13, D-03
close-out re-derive — full record in
`.planning/phases/34.6-.../34.6-PRELOAD-SURFACE-REDERIVE.md`). Re-derived union: **220** distinct
channels (invoke 160 / send 60), plus 30 push channels out of tally; **0** unbucketed. The gate's
`--self-test` was run first and all six checks correctly rejected their bad-input fixtures, so
the zero is a measurement and not a vacuous pass. **Blocker and invariant records rot silently in
this repo — three recorded instances — so this line carries a date, a commit and a count, and any
re-verification must replace all three together.**

**Superseded 2026-09-02 (Phase 39, plan 39-01, working tree `ed1fdf71d`) — the 220 above is now
stale.** The live `src/preload/` union today is **206** (invoke 154 / send 52), confirmed by the
gate's own `check_coverage` (clean, 0 unbucketed) and by `AUDITED_UNION_FLOOR`, re-derived to 206
in this plan's edit. The `## Totals` → `Unique channels` row below reads **207**, not 206 —
one channel higher than the true live union, deliberately: `getEpicGamesStatus` has zero
`src/preload/` exposure but is pinned into this page's Phase 34.5 bucket line by
`ported-channels-gate.py`'s own declared-channel list, so it stays documented here even though
`preload-surface-gate.py`'s union excludes it. The gap between 220 and 206 is the other 17 names
of the same 18-name window-chrome/misc cluster documented under `## Totals` below, not a fresh
finding — this line is a pointer, not a new audit; the two numbers on this page (206 live union,
207 documented bucket total) are expected to differ by exactly this one channel going forward.

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
| Unique channels | 208 |
| Ported to sidecar | 53 |
| **Unported** | **159** |

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

**Unique channels raised 222 → 224 (plan 34.13-07, D-09/D-14/D-15, 2026-08-15):** `isSteamBottleEligible`
and `persistBottleWineVersion` are two BRAND NEW channels created by Phase 34.13 (the install-form's
only new IPC surface), not late-discovered pre-existing ones — unlike every prior "raised N → M" note
above. Both were registered on Electron (`main.ts`, inside the Phase 17 bottle block) AND the Tauri
sidecar (`steamAuthFlowRegistration.ts`, beside the bottle trio — NOT `installFlowRegistration.ts`, the
file CONTEXT.md wrongly names for this work) in the same plan, so neither was ever unported for even one
commit. Both are exposed through `src/preload/api/steam.ts` via `makeHandlerInvoker`. Filed under
"Already ported" rather than a new phase section, matching the precedent 34.5-49 set for
`oauthCaptureLogin`: these channels are born dual-registered, so they were never part of any
per-phase Electron-only backlog this document's other sections enumerate. The `Ported to sidecar`
(28) / `Unported` (183) rows below are deliberately UNCHANGED — per this document's own L44-51 note,
that split is a frozen Phase 34.1-era snapshot, not re-tallied per phase; recording that explicitly
here rather than leaving an apparent, unexplained arithmetic gap.

**Unique channels lowered 225 → 207 (Phase 39, plan 39-01, 2026-09-02) — RE-DERIVE, not a new
audit.** `preload-surface-gate.py`'s `AUDITED_UNION_FLOOR` had gone stale at 217 (pre-Phase-35);
the live extractor measures 206 (invoke 154 / send 52) against the working tree at `ed1fdf71d`.
`check_coverage` in the code→doc direction was and remains clean — zero live channels are
undocumented. The gap ran the other way: 18 names were documented but absent from `src/preload/`
today, a coherent window-chrome cluster retired when Tauri took over native window decoration —
deliberately listed here WITHOUT backticks (closeWindow, createNewWindow, gamepadAction,
getEpicGamesStatus, health, isFrameless, isFullscreen, isMaximized, isMinimized, maximizeWindow,
minimizeWindow, openPatreonPage, openReleases, openWikiLink, setFullscreen, setZoomFactor,
showAboutWindow, unmaximizeWindow), so this retrospective note itself can never be mistaken for a
bucket line by `parse_bucket_names`'s >=5-backtick-name rule — this matches Phase 35's own record
(`main.ts`'s deletion removed 136 IPC channel registrations). 17 of those 18 names were deleted
from the bucket lines that carried them; **`getEpicGamesStatus` was put back.** It genuinely has
zero `src/preload/` exposure today (confirmed live: `runnerAuthFlowRegistration.ts` still
registers `ipcMain.handle('getEpicGamesStatus', ...)` in the sidecar, but nothing in
`src/preload/` or `src/frontend/` calls it), so `preload-surface-gate.py`'s 206-channel union
correctly excludes it. But `ported-channels-gate.py` (Phase 34.5's own gate, a different script
with its own hardcoded declared-channel list) requires `getEpicGamesStatus` to remain in this
page's Phase 34.5 Slice 8 bucket line for an orthogonal reason: it tracks whether a channel was
ported to the sidecar during that phase's IPC re-plumb, independent of whether it is exposed via
`src/preload/` today. Removing it broke that previously-passing gate; restoring it fixed the
regression without touching `ported-channels-gate.py` itself. The net effect: 17 names left the
bucket lines, `getEpicGamesStatus` did not, so the `## Totals` → `Unique channels` row above was
set to **207**, not 206, in the same edit as the floor change — one channel higher than the true
live preload union (206) documented below, and that one-channel gap is intentional and permanent
until Phase 34.5's own gate is revised. **Only the `Unique channels` row was re-derived.** The
`Ported to sidecar` (52) and `Unported` (159) rows above remain the Phase 34.1-era snapshot they
already describe themselves as — this phase measured neither, and did not attempt to re-tally
them. One side effect worth naming rather than leaving as a silent surprise for the next reader:
the pre-existing `Ported + Unported` vs `Unique channels` discrepancy noted directly above (a
+14 gap, when `Unique channels` was 225) now reads as a −4 gap (52 + 159 = 211 against 207) —
the sign flipped because only the `Unique channels` side moved. This is the same
pre-existing, not-this-phase's-to-fix accounting gap as before, now on the other side of zero;
whoever re-tallies the baseline should read both notes together.

A second, masked defect was found and fixed in this same edit: `## Totals` had stated 225 unique
channels while the bucket lines themselves (before this edit) contained only 224 distinct names —
`check_totals_reconciliation` had never executed to catch this, because `check_multiline_awareness`
(the 206-vs-217 floor check) called `fail()` and exited first. Fixing the floor without also
reconciling this row would have moved the gate from "fails on check 2" to "fails on check 5" —
a fresh-looking red that this edit closes instead of creating. See
`39-GATE-DISPOSITIONS.md` (phase 39) for the full disposition record.

**Unique channels raised 207 → 208 (quick `260902-wbd`, 2026-09-02):** `getLoginBackground`
is a BRAND NEW channel, not a late-discovered pre-existing one -- it backs the user-selectable
Manage Accounts background artwork ported out of the `wip/login-background-260815` stash. It is
`makeHandlerInvoker`-exposed in `src/preload/api/helpers.ts` and registered on the Tauri sidecar
in `appShellFlowRegistration.ts` (there is no Electron leg to register: the Electron entry points
were deleted by `5643c7583`), so it lands in the Phase 34.1 app-shell bucket alongside its
`getCustomThemes`/`getThemeCSS`/`getCustomCSS` siblings, whose handler bodies it shares a module
with. That bucket's own header count goes 32 → 33 and `Ported to sidecar` goes 52 → 53.

The live `src/preload/` union re-derived by `preload-surface-gate.py` is now **207** (invoke 155 /
send 52), so the 206-vs-207 pair described further up this page is today a **207-vs-208** pair. The
one-channel offset is unchanged and has the same cause (`getEpicGamesStatus` is bucket-pinned with
no preload exposure); only both numbers moved, together, by this one addition.

**This is the THIRD channel to reach `src/preload/` via a quick task rather than a phase**, after
`steamRemoveAllCopies` (`quick-260821-le0`) and `oauthCaptureLogin`. Quick tasks run no
inventory-reconciliation step, so the omission is structural, not an oversight by any one task:
`preload-surface-gate.py` went RED here and was the only thing that caught it -- the full 377-suite
run, lint, tsc and prettier were all green with the channel unlisted.

## Already ported (34)

`cancelDownload`, `checkGameUpdates`, `checkSteamInstalled`, `connectivity-changed`, `getDMQueueInformation`, `get-connectivity-status`, `getLogContent`, `getMaxCpus`, `getSystemInfo`, `hasExecutable`, `install`, `isNative`, `isSteamBottleEligible`, `launch`, `listSteamLibraryTargets`, `logError`, `oauthCaptureLogin`, `openDialog`, `pauseCurrentDownload`, `persistBottleWineVersion`, `refreshLibrary`, `removeFromDMQueue`, `requestAppSettings`, `requestGameSettings`, `resumeCurrentDownload`, `setSetting`, `showUpdateSetting`, `steamPollQR`, `steamRemoveAllCopies`, `steamStartQR`, `uninstall`, `updateGame`, `writeConfig`

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

**One more added 2026-08-23 — 33 → 34, unique channels 224 → 225:**
- `steamRemoveAllCopies` (sidecar invoke) is registered by
  `src/backend/sidecar/steamAuthFlowRegistration.ts:317` and mirrored on the Electron runtime
  at `src/backend/main.ts:946`, so it is genuinely ported on both builds. It was exposed in
  preload (`src/preload/api/steam.ts:27`, typed at `src/common/types/ipc.ts:307`) and appeared
  in NO bucket line. Root cause worth recording: it was added by a QUICK TASK
  (`quick-260821-le0`), which does not run this document's phase-level inventory discipline —
  the same escape route that let `oauthCaptureLogin` above go unbucketed. Found by
  `34.5/preload-surface-gate.py`, which had never been wired into CI and so had never run
  outside the session that wrote it.

## Phase 34.1 — Slice 4 — app shell and window chrome (33 channels)

**Retired 2026-08-27 (Phase 34.18):** `isIntelMac` was dropped from this slice's channel list —
an arm64-only macOS build cannot run on an Intel Mac, so the channel exposed a capability the app
no longer ships (plan 34.18-05, REQ-34.18-07/-09). This slice's total moves from 33 to 32, one
channel fewer. Do not conflate this count with `.planning/REQUIREMENTS.md` REQ-34.1-05's narrower
sidecar-routed-registration count (19 -> 18, same date, same removal, same reason) — both drop by
exactly one for the same cause, but they are two different counts over two different scopes.

Note: the callTool channel (`src/backend/tools/ipc_handler.ts:25`, Winetricks/winecfg/runExe)
was reassigned to Phase 34.5 by Phase 34.1 CONTEXT decision D-14 on 2026-07-25, because it is
Wine tooling and was in this slice only because the inventory grouped channels by file; see
the Phase 34.5 list below for its new home.

`abort`, `changeLanguage`, `changeTrayColor`, `getCurrentChangelog`, `getCustomCSS`, `getCustomThemes`, `getHeroicVersion`, `getLatestReleases`, `getLoginBackground`, `getThemeCSS`, `getWebviewPreloadPath`, `lock`, `notify`, `openCustomThemesWiki`, `openWebviewPage`, `quit`, `set-connectivity-online`, `setTitleBarOverlay`, `unlock`

## Phase 34.2 — Slice 5 — game details, settings and overrides (26 channels)

`addNewApp`, `changeGameVersionPinnedStatus`, `changeInstallPath`, `getAllGameOverrides`, `getAnticheatInfo`, `getAvailableCyberpunkMods`, `getCrossoverIndex`, `getExtraInfo`, `getGameInfo`, `getGameMetadataOverride`, `getGameOverride`, `getGameSdl`, `getGameSettings`, `getKnownFixes`, `getLaunchOptions`, `getStoreSearchDeals`, `getStoreSearchStoreMap`, `getWikiGameInfo`, `isGameAvailable`, `kill`, `readConfig`, `removeRecent`, `repair`, `searchStores`, `setCyberpunkModConfig`, `setGameMetadataOverride`

## Phase 34.3 — Slice 6 — shell, files, logs and diagnostics (29 channels)

`checkDiskSpace`, `clearAchievementCache`, `clearCache`, `clipboardReadText`, `clipboardWriteText`, `copySystemInfoToClipboard`, `deleteUploadedLogFile`, `getShellPath`, `getUploadedLogFiles`, `logInfo`, `openDiscordLink`, `openExternalUrl`, `openFolder`, `openGithubSponsorsPage`, `openKofiPage`, `openLoginPage`, `openSidInfoPage`, `openSupportPage`, `openWeblate`, `openWinePrefixFAQ`, `pathExists`, `removeFolder`, `resetHeroic`, `showConfigFileInFolder`, `showItemInFolder`, `showLogFileInFolder`, `uploadLogFile`

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

**Ported raised 28 → 52, Unported lowered 183 → 159 (plan 34.6-13, D-01, 2026-08-25):** Phase
34.6 ported **24** channels — the 16 in its own slice-9 section plus the 8 in "Late-discovered",
both marked PORTED below. Arithmetic, checkable by hand: **28 + 24 + 0 absorbed = 52** ported, and
**183 − 24 = 159** unported. The "+ 0 absorbed" term is D-03's close-out re-derive finding zero
unbucketed channels (`34.6-PRELOAD-SURFACE-REDERIVE.md`); it is written explicitly rather than
omitted so a later reader can see the term existed and was zero, not that it was forgotten.

**PRE-EXISTING discrepancy, NOT introduced or silently absorbed here.** `Ported + Unported`
= 52 + 159 = **211**, against `Unique channels` = **225** — a gap of 14. That gap predates this
plan: the ported/unported rows are a Phase-34.1-era snapshot (see the L44-51 note above) which was
never re-tallied when `Unique channels` was raised 211 → 222 → 224 → 225 by later audits. This
plan moved both rows by exactly 24 and left the baseline discrepancy untouched, because silently
folding a 14-channel accounting gap into a 24-channel port note would destroy the evidence that
the gap exists at all. **It is flagged here for whoever re-tallies the baseline** — a task this
plan does not own and did not attempt.

## Phase 34.6 — Slice 9 — EOS overlay, SteamGridDB and winetricks (16 channels) — **PORTED**

Split out of Phase 34.5's 57 on 2026-07-29 (D-03/D-05) — deferred, not dropped, because Phase
35's cutover requires the IPC re-plumb to be **COMPLETE**. This phase runs BEFORE Phase 35.

`disableEosOverlay`, `enableEosOverlay`, `getEosOverlayStatus`, `getLatestEosOverlayVersion`, `installEosOverlay`, `isEosOverlayEnabled`, `removeEosOverlay`, `updateEosOverlayInfo` (EOS overlay, 8)

`steamgriddb.getGrids`, `steamgriddb.getHeroes`, `steamgriddb.hasApiKey`, `steamgriddb.searchGame`, `steamgriddb.setApiKey` (SteamGridDB artwork, 5)

`winetricksAvailable`, `winetricksInstall`, `winetricksInstalled` (winetricks, 3)

**PORTED by Phase 34.6 (2026-08-25).** Per cluster: EOS overlay 8 → plan 34.6-08
(`eosOverlayFlowRegistration.ts`); SteamGridDB 5 → plan 34.6-09 (`enrichmentFlowRegistration.ts`,
after the A-03 keyring hardening in plans 34.6-01/02); winetricks 3 → plan 34.6-07
(`wineToolsFlowRegistration.ts`).

**Caveat, recorded rather than glossed:** porting is registration. This phase's live gate closed
`FAIL 7/9`, and `winetricksInstall` is one of the two failing items — though the gap cycle proved
the FAILURE IS NOT IN THE PORT (driven by keyboard the channel sends and winetricks runs end to
end; the mouse path never sends because the renderer unmounts the suggestion rows mid-click, a
pre-existing renderer defect parked with its break point measured). Also unverified on macOS by
any means: `enableEosOverlay`/`disableEosOverlay` have **no reachable UI surface on this platform**
(`AdvancedSettings/index.tsx:401` is `isWindows`-gated, `GameSubMenu/index.tsx:461` is
`isLinux`-gated).

`winetricksInstall` is `addListener`/send-kind (`tools/ipc_handler.ts`) — inherits the send-channel
silent-failure warning already documented for this project's other send channels. `callTool`'s
`winetricks` branch already works from Phase 34.5 via `Winetricks.run()` on the shared
`tools/index.ts` object; this phase is only about the three dedicated IPC channels above.

## Late-discovered — owner Phase 34.6 (8 channels) — **PORTED**

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
- `frontendReady` has a real, unguarded frontend caller (`GlobalState.tsx:1609`). **A-04
  correction (plan 34.6-13, 2026-08-25):** this bullet previously cited `:1586` and claimed the
  channel "will hit `UNPORTED_CHANNEL_MARKER` under Tauri today". BOTH were wrong, and the second
  understated the risk. The line number is `:1609`, re-verified by direct read before this edit.
  And `frontendReady` is **send-kind** (`src/preload/api/misc.ts:93`, `makeListenerCaller`), so it
  could never surface that marker at all: `dispatchSend` finds no listener and simply returns, and
  the Rust `sidecar_send` has no pending/timeout machinery. It failed **SILENTLY** — the marker was
  true only inside the transport and never reached the renderer. That is strictly WORSE than this
  bullet implied, and it is why D-11's `logSendHandlerReached` observable exists.
- `getAchievements`, `getGogDiscounts`, `getPlaytimeFromRunner` are plain unported reads with no
  sidecar registration found by grep.

**PORTED by Phase 34.6 (2026-08-25).** `frontendReady` → plan 34.6-05 (`appShellFlowRegistration.ts`,
with the D-11 send observable); `importGame`/`moveInstall` → plan 34.6-06
(`installFlowRegistration.ts`), hardened for `T-34.5-C6-49-03` by plan 34.6-11;
`runWineCommandForGame` → plan 34.6-07 (`wineToolsFlowRegistration.ts`), likewise hardened;
`getAchievements`/`getDefaultSavePath`/`getPlaytimeFromRunner` → plan 34.6-10
(`runnerMiscFlowRegistration.ts`).

**Coverage caveat:** `runWineCommandForGame` is registered and bucketed but has **ZERO renderer
call sites** — a full-source census measured 0 across `src/frontend/`. It ships exercised by no
gate at all, which the live gate records as UNREACHABLE-BY-CONSTRUCTION rather than as a pass.
This section stays SEPARATE from the slice-9 section above so that section's historical
"(16 channels)" heading count is not silently inflated.

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
