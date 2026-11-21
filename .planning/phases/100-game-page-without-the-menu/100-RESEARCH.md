# Phase 100: Game page without the ⋮ menu - Research

**Researched:** 2026-11-21
**Domain:** GameLib frontend (React 18 + TypeScript on the Tauri shell): game page information architecture, per-game settings dialog, CSS/theme tokens, repo ratchets
**Confidence:** HIGH on the code inventory, gate/ratchet map and test idioms (every file below was read this session); MEDIUM on the three data-source gaps in Open Questions (they need a user decision, not more research)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Design source (locked by sketches, not re-discussed)**
- **D-01:** `.claude/skills/sketch-findings-gamelib/references/game-page.md` §2–§5 is the design contract: the ⋮ item → new home table, Install-tab row order (installed and not installed), left card library row (heart, chips, Hide), integration switch rows (per-row pending and inline failure; state flips only on the backend's answer), and the footer. Its "What to Avoid" list is binding (no ⋮ "just for one thing", no flipping labels, no control swapped for a spinner, no destructive action in the footer, no filled chips for user categories, no hard-coded colours).
- **D-02:** `.claude/skills/sketch-findings-gamelib/references/game-settings-dialog.md` "Additions from 012" is the contract for the ⚙ changes (Logs tab after Advanced with session picker / Copy / Open folder / monospace log box, plus a "Game log → Open the Logs tab" link in Advanced → Diagnostics & updates; EOS overlay switch in Run → Launch; Wine prefix folder button). Rule: ⚙ holds only what changes how the game runs.

**Install-tab content the sketch did not map**
- **D-03:** Cloud saves becomes a fact row: value "Synced …" (or the syncing / unsupported state), actions `[Sync now ▾]` (the existing sync commands) and `[Open saves folder]`. Auto-sync moves out of the row into a switch row under Library & integration. The hover-opened MUI `Menu` in `CloudSavesSync.tsx` is removed — no hidden actions.
- **D-04:** The Apple compatibility block (`AppleWikiInfo` — AppleGamingWiki rating / "Runs via Windows Steam bottle", with refresh and its links) moves from the Install tab to the **Ratings** tab, beside the ProtonDB row.
- **D-05:** Platforms (glyphs, installed platform outlined), Online required and Third-party manager become fact rows with no actions in the same `.fact` shape. Online required / Third-party manager render only when they apply.
- **D-06:** The Native-port hint (`NativePortInfo`) and the Humble key origin (`HumbleOriginInfo`) render as neutral accent-tinted notes (the 009 `.note` style) in the Install tab, after the fact rows and before Library & integration.

**Library card menu and categories**
- **D-07:** The library `GameCard` right-click menu stays as it is. The one change is forced by the ⚙ merge: its Logs item opens the ⚙ dialog on the new Logs tab.
- **D-08:** The per-game Categories modal (`openGameCategoriesModal`) stays, reachable only from the library card's right-click menu. The game page uses only the "+ Category" checklist popover.
- **D-09:** "New category…" in the popover creates the category and assigns this game in one step (type, Enter); the popover stays open. Renaming and deleting categories stay in `CategoriesManager`.

**Long-running row actions (Verify, Move…, Set install folder, Check for updates, Modify)**
- **D-10:** The footer status line (`GameStatus`) stays the single progress readout (percent, ETA). The row's button that started the action turns into a pulsing busy label ("Verifying…", "Moving…"). No second progress bar in the row.
- **D-11:** While one runs, conflicting Install-tab actions are disabled with a reason tooltip (e.g. during Move: Verify, Modify, Set folder and Uninstall are disabled — "Wait for the move to finish"). Unrelated actions (Open, Open prefix, switch rows) stay live. Gating mirrors `MainButton`'s existing `is.*` checks.
- **D-12:** Failures show inline in the row: red text under it plus a Retry link, the same shape as switch-row failures. This replaces the error dialogs for these actions (e.g. the `repairFailure.ts` dialog path). Detail stays in the log (the Logs tab).
- **D-13:** Confirmations: Move… and "Wrong folder?" → Set install folder keep their confirmation; Verify drops its yes/no dialog. Uninstall / Remove all copies keep their existing confirm (`UninstallModal`, `steamUninstallConfirm.ts`).

**Rollout and live check**
- **D-14:** Build the new homes plan by plan while ⋮ stays as a fallback; a final plan deletes `DotsMenu.tsx` and `GameSubMenu/` (moving `shortcutsToggle.ts`, `repairFailure.ts`, `steamUninstallConfirm.ts` logic to where their actions now live). Every intermediate build keeps every action reachable.
- **D-15:** Live UAT covers the midnight, dracula and gruvbox themes (dracula is the known risk for the new switch track: pink `--color-primary`, per-theme `--on-primary` knob; `--fav` heart colour is defined per theme).
- **D-16:** Live UAT walks a Steam game (danger zone with Remove all copies, no Move), an Epic or GOG game (Move / Modify / Check for updates, Engine row), a sideloaded game (no Verify), and one not-installed game (Download / Install size / Platforms, Locate link, Show in Steam only).

### Claude's Discretion
- Exact component split (e.g. a shared `FactRow` / `SwitchRow` component), file layout, and how the ⋮ logic is decomposed into hooks.
- Which conflicting actions each long action disables, within D-11's rule.
- Plan count and wave order within D-14's rollout shape.
- Copy for busy labels, reason tooltips and inline failures (through `t()`, noun labels).

### Deferred Ideas (OUT OF SCOPE)
- Aligning the library card right-click menu with the no-flipping-labels rule (checkmarked nouns instead of Add/Remove pairs) — considered and left out of this phase (D-07).
</user_constraints>

<phase_requirements>
## Phase Requirements

No requirement IDs are mapped (ROADMAP: "Requirements: TBD"). The D-01..D-16 decisions above are the requirement set. The "Decision → research support" table below is the planner's traceability substitute.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-01 | Sketch §2–§5 is the contract | "⋮ → home map with handlers and gating", "Token reality check" |
| D-02 | ⚙ Logs tab, EOS switch, prefix folder button | "⚙ dialog findings" |
| D-03 | Cloud saves fact row | "Open Questions 2" (no last-sync data exists), "CloudSavesSync findings" |
| D-04 | AppleWikiInfo → Ratings | "Ratings tab findings" |
| D-05/D-06 | Fact rows + notes | "Install tab: current components → new rows" |
| D-07/D-08/D-09 | GameCard Logs, categories popover | "Left card findings" (category key format, `setCustomCategory` resets) |
| D-10/D-11/D-12/D-13 | Long actions: busy, gating, inline failure, confirms | "Long-action state", "Open Questions 3" |
| D-14 | Rollout + deletion | "Recommended plan shape", "Ratchets and gates that bite on move/delete" |
| D-15/D-16 | Live UAT | "Validation Architecture" (UAT file shape), "Token reality check" |
</phase_requirements>

## Summary

Phase 100 is a frontend re-homing of ~24 actions from a 812-line `GameSubMenu` (hosted by a 155-line `DotsMenu`) onto the left card, the Install tab, the ⚙ dialog and the footer. Every handler already exists; the work is (a) extracting them as hooks/pure modules without rewriting, (b) building ~5 new presentational primitives (fact row, switch row, inline failure, danger zone, category popover), (c) re-pointing the `'log'` modal type into a Logs tab, and (d) deleting `DotsMenu`/`GameSubMenu` and migrating the **many source-text gates and ratchets that read those files by path**. No new dependency is needed.

Three things in CONTEXT/the sketch do not match the real code and need a decision before or during planning: (1) **the sketch's theme tokens (`--color-primary`, `--color-border-strong`, `--on-primary`, `--fav`, `--radius-md`, `--font-sans` …) do not exist in the app** — they are sketch-only aliases; `--fav` and `--on-primary` are not "defined per theme" as D-15 says (grep over `src/` finds zero definitions), so they must be mapped to real tokens or added to `themes.scss` for all 10 themes; (2) **the status line does not say "Played …"** — `GameStatus.tsx` renders no play time, so removing `TimeContainer` removes play time from the game page entirely unless the status line gains it; (3) **there is no last-sync timestamp anywhere**, so the D-03 value "Synced 3 days ago" has no data source. A fourth constraint shapes D-12: the backend `repair` and `moveInstall` handlers already swallow runner-level failures (resolve + notification/dialog), so a frontend-only inline failure can only observe rejections.

**Primary recommendation:** Keep ⋮ untouched until the final plan (copy handlers into new hook files rather than editing `GameSubMenu`, so its source-text guards stay green); build shared primitives + a pure `installActionGates()` function first; then land left card, Install tab, ⚙ changes, footer/tabs in independent plans; delete ⋮ and retarget every path-keyed gate/ratchet in one last plan. Put all new strings in the `gamelib:` namespace (en catalog only) and keep new components free of `className="…is-text…"` and `asStoreGame`/`isStore(<object>,…)` calls, or update the census pins in the same commit.

## Architectural Responsibility Map

All capabilities are renderer (frontend) tier; the backend/Rust tiers are consumed through existing `window.api` channels and are not changed.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Action placement, row layout, busy/disabled/failure UI | Browser / Client (React) | — | Pure re-homing of existing UI |
| Long-action truth (`is.*` from library status events) | Browser / Client (zustand `libraryState`, `GameContext`) | API / Backend pushes `status` events | `status` already flows through `hasStatus`; no new channel |
| Move / Verify / Update / Uninstall / shortcuts / Steam shortcut / EOS overlay execution | API / Backend (sidecar via `window.api`) | — | Existing IPC; unchanged |
| Favourite / Hide / Categories persistence | Browser / Client (`libraryState` → `configStore`) | — | Existing store actions |
| Per-game ⚙ remembered tab | Browser / Client (localStorage, `GamesSettings/tabs.ts`) | — | Existing mechanism |
| Theme tokens (`--fav`, switch track) | CDN/Static (CSS: `themes.scss`) | — | Stylesheet only |
| Runner-level failure of Verify/Move | API / Backend (swallows + notifies) | Client observes only rejection | See Open Question 3 |

## Standard Stack

### Core (all already installed — no new packages)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react / react-dom | repo-pinned | UI | existing |
| @mui/material, @mui/icons-material | repo-pinned | `Tabs`/`Tab` (page + ⚙), `Popover`/`Menu` for the "+ Category" popover, icons | already used by `GamePage` and `CloudSavesSync` |
| @fortawesome/react-fontawesome + free-solid/brand icons | repo-pinned | glyphs (platform icons, folder, steam) | already used |
| zustand (`useUiState`, `useLibraryState`) | repo-pinned | favourites/hidden/categories/`settingsModalProps` | existing state APIs |
| react-i18next | repo-pinned | `t()` — new strings in `gamelib:` namespace | repo i18n gate |
| jest 29 + ts-jest, `testEnvironment: 'node'` | repo-pinned | tests (no jsdom, no react-test-renderer) | [VERIFIED: src/frontend/jest.config.js header comment] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New switch-track component | Re-skin existing `ToggleSwitch` | `ToggleSwitch` is a checkbox-square used in ~dozens of settings; changing it restyles the whole app. Add a **new** `SwitchRow` component; leave `ToggleSwitch` alone (sketch §4 rejected the square for these rows). |
| MUI `Popover` for the category popover | `Dropdown` (`components/UI/Dropdown`) | `Dropdown` is a hover/focus panel with a known gamepad quirk (see Pitfall 9); MUI `Popover` + checkbox list is in-stack and handles focus trap/escape. |
| Rewriting handlers | Extract verbatim | CONTEXT says extract, don't rewrite; several source-text gates pin handler bodies. |

**Installation:** none. **Package Legitimacy Audit:** not required — this phase installs no external package (no `npm install`, no `Cargo.toml` change).

## Architecture Patterns

### System Architecture Diagram

```
GamePage/index.tsx  (owns gameInfo, status→is.*, hasUpdate, handleUpdate, SettingsContext, GameContext)
 │
 ├─ LEFT CARD (mainInfoScroll → mainInfoBody)
 │    art band: Back · [Edit details ✎ → showDialogModal(EditGameDialog) | openInstallGameModal (sideload)]
 │    gameMeta: StoreBadge link ↗ → /store-page?store-url=… (non-sideload, storeUrl set)
 │    title row: h1 + FavouriteHeart ── useFavouriteGames().add/remove(appName)       [bare appName]
 │    LibraryRow: CategoryChips ── useCustomCategories().addToGame/removeFromGame     [key `${appName}_${runner}`]
 │                 + Category popover (checklist, "New category…" → addCategory + addToGame)
 │                 HideToggle ── useHiddenGames().add/remove(appName)  + HiddenNotice(Unhide)
 │    notices · Description        (TimeContainer REMOVED → "Played …" must land in GameStatus, Open Q1)
 │
 ├─ FOOTER actionDock
 │    GameStatus ◄── single progress readout (percent/ETA) for verify/move/update/install  (D-10)
 │    MainButton: Install split ▾ | Play | Pause/Stop · SteamUpdateButton · LaunchOptionSelector · SettingsButton(⚙)
 │
 └─ RIGHT PANEL  Tabs: Install · Achievements · Ratings · Requirements
      Install tab (installTab) ── gates = installActionGates(is, runner, gameInfo)  (pure, D-11)
        Location ─ [Open] [Move…→confirm→picker→moveInstall] "Wrong folder?"→confirm→picker→changeInstallPath
        Size     ─ [Modify…] → ModifyInstallModal (owned here)
        Version  ─ [Verify] [Check for updates → handleUpdate] "What's new" → GameChangeLog (owned here)
        Engine   ─ [Open prefix] (non-native, non-Steam)
        Cloud saves ─ value · [Sync now ▾] [Open saves folder]            (Open Q2 for the "Synced …" value)
        Platforms · Online required · Third-party manager   (no actions)
        notes: NativePortInfo · HumbleOriginInfo
        Library & integration: SwitchRow × { Runs for me(mac) · Auto-sync saves · Shortcuts · Show in Steam }
        DangerZone: Uninstall… (+ Remove all copies… Steam) → UninstallModal / steamUninstallConfirm
      Ratings tab: Scores · HLTB · CompatibilityInfo(ProtonDB link) · AppleWikiInfo (moved, D-04)
      Requirements tab: unchanged

⚙ SettingsModal (type 'settings' only; 'log' merged)
      GamesSettings tabs: Run · Wine · Winetricks · Advanced · **Logs** · Cloud Saves Sync · Gamescope · Legacy
        Run→Launch: + EOS overlay switch (Linux + Epic)       Wine tab: WinePrefix + folder button
        Advanced→Diagnostics: VerboseLogs + "Game log → Open the Logs tab"
      uiState.openGameLogsModal → open 'settings' with a transient initial tab 'logs'
```

### Recommended Project Structure

```
src/frontend/screens/Game/
├── GamePage/
│   ├── index.tsx                         # slimmed: no DotsMenu, no TimeContainer, no dead showUninstallModal state
│   ├── components/
│   │   ├── InstallTab/                   # NEW: index.tsx (composition) + one file per row
│   │   │    FactRow.tsx · SwitchRow.tsx · RowFailure.tsx · LocationRow · SizeRow · VersionRow · EngineRow
│   │   │    CloudSavesRow · FactsRows (platforms/online/third-party) · IntegrationRows · DangerZone
│   │   ├── LeftCard/ (or flat)           # FavouriteHeart · CategoryChips · CategoryPopover · HideToggle · EditDetailsButton · StoreBadgeLink
│   │   ├── MainButton.tsx                # + non-Steam Install ▾ (Locate existing installation…)
│   │   └── (existing rows retired or reshaped: InstalledInfo, DownloadSizeInfo, PlatformSupport, CloudSavesSync, RunsForMeToggle)
│   └── actions/                          # NEW home for the extracted logic (D-14)
│        shortcutsToggle.ts · repairFailure.ts · steamUninstallConfirm.ts (git mv from GameSubMenu/, tests move with them)
│        installActionGates.ts            # pure D-11 gating function
│        useEosOverlay.ts · useShortcuts.ts · useSteamShortcut.ts · useMoveInstall.ts · useChangeInstall.ts · useVerify.ts · useUninstall.ts · useEditGame.ts
├── GameSubMenu/   ── DELETED in the last plan
└── TimeContainer/ ── DELETED (after Open Q1 resolution)
```

### Pattern 1: Extract handlers as hooks, bodies verbatim
**What:** Copy each handler out of `GameSubMenu/index.tsx` into a hook in `GamePage/actions/`, keeping identifier names (`handleEosOverlay`, `setEosOverlayRefresh`, `callOrDeclare(`, `finally { setSteamRefresh(false) }`). Leave `GameSubMenu` itself unedited until D-14's final plan.
**Why:** `GameSubMenuEosDeclineCallSiteGuard.test.ts`, `longRunningCallSiteGuard.test.ts`, `shortcutsToggle.test.ts` (source gate), `tileMenuParity.test.ts` and `steamInstallOptionsEntry.test.ts` read `GameSubMenu/index.tsx` text. Editing it mid-rollout breaks them; copying keeps ⋮ a working fallback (D-14) and makes the final retarget a path-constant change.

### Pattern 2: Pure gating function (D-11)
`installActionGates({ is, runner, gameInfo, isThirdParty }) → Record<ActionId, { show: boolean; disabled: boolean; reason?: string }>` in one pure module, unit-tested without React (the Frontend jest project cannot render components). Mirror `MainButton`'s `disabledPlayButtons`/`disabledInstallButtons` conjuncts (verbatim in MainButton.tsx:41-66, shown below) and `GameSubMenu`'s own `show` gates (table below).

### Pattern 3: State flips only on the backend's answer (D-01 §4)
`shortcutsToggle.ts` is the model: result `=== true` sets state; a rejection leaves state unchanged and `setBusy(false)` runs in `finally`; the function never rethrows. For D-12 add an **optional** `setFailed?: (failed: boolean) => void` option (callback style, like `setBusy`/`setHasShortcuts`) — do NOT change the return type: `shortcutsToggle.test.ts:133` asserts `await expect(run(hasShortcuts)).resolves.toBeUndefined()`. Failure = rejection, or the resolved value contradicting the intent (add → `result !== true`; remove → `result === true`).

### Pattern 4: Busy label derived from `is.*`, not local state
`is.reparing` ('repairing'), `is.moving`, `is.updating` already come from `hasStatus` and survive remount. Use them for "Verifying…/Moving…/Updating…" labels; add a click-latch only for the gap before the first status event (precedent: `playClickedLatch.ts`, `releasesPlayClicked(status)` in `GamePage/index.tsx:367`). `changeInstallPath` and `modify` have no `is.*` flag, so they need local pending state.

### Anti-Patterns to Avoid
- **Editing `GameSubMenu/index.tsx` before the final plan** — breaks 5 source gates (see ratchet table).
- **New `className="… is-text …"` in new JSX** — the `themeTokens.test.ts` census pins exactly 39 `is-text` sites; use own classes (e.g. `sbtn`) and add a contrast spec instead.
- **Plain `t('…')` for new strings** — writes into upstream-owned catalogs and fails `pnpm i18n-churn-guard`.
- **A `useEffect` that polls from a permanently mounted component** — `permanentlyMountedPolls.test.ts` census.
- **Flipping Add/Remove labels** (D-01): label is the noun, state is the control (heart `aria-pressed`, switch `aria-checked`).

## ⋮ → home map with handlers, dependencies and gating

Source: `GameSubMenu/index.tsx` and `DotsMenu.tsx`, read in full this session. `isSideloaded = !hasCapability(runner,'hasStoreCatalog')`, `isSteam = !hasCapability(runner,'winePrefixToolsAvailable')`, `isBrowserGame = gameInfo.install.platform === 'Browser'`, `isThirdPartyManaged = !!gameInfo.thirdPartyManagedApp` [VERIFIED: GameSubMenu/index.tsx:131-148].

| ⋮ item | Handler / call (lines) | State & deps | Gate today | New home | Extract unchanged? |
|---|---|---|---|---|---|
| Install with options… | `openSteamInstallOptions(appName, gameInfo)` (514-524) | — | `showSteamSubMenuInstallOptions({runner,isInstalled,isDelisted: !!asStoreGame(gameInfo,'steam')?.is_delisted})` | **Already covered**: `MainButton` Steam caret (`showSteamMainButtonInstallOptions`) | n/a — delete; `showSteamSubMenuInstallOptions` becomes dead (knip) |
| Locate existing installation… | `openInstallGameModal({appName,runner,gameInfo,action:'import'})` (532-551) | `is.installing\|\|is.importing\|\|is.queued` disables | `!isInstalled && !isSteam` | Footer Install ▾ (non-Steam) **and** Install-tab "Already installed elsewhere?" link | yes (one call) |
| Edit Game | `handleEdit` (260-276): sideload → `openInstallGameModal`, else `showDialogModal(EditGameDialog)` | `useUiState.showDialogModal` | always | Left card art band pencil | yes (duplicate exists in `GameCard:385-401`; keep both, D-07) |
| Logs | `openGameLogsModal(gameInfo)` | `useUiState` | `isInstalled && !is.uninstalling && !isBrowserGame` | ⚙ Logs tab (⚙ itself already hidden for the same cases: `SettingsButton`) | re-point (see ⚙ findings) |
| Hide / Unhide | `hiddenGames.add(appName,title)` / `.remove(appName)` | `useHiddenGames()` | always | Left HideToggle + notice | yes |
| Favourites | `favouriteGames.add(appName,title)` / `.remove(appName)` | `useFavouriteGames()` | always | Left heart | yes |
| Shortcuts | `toggleShortcuts({hasShortcuts,appName,runner,setHasShortcuts,setBusy})` (250-258); probe `window.api.shortcutsExists(appName,runner)` in effect | `hasShortcuts`, `shortcutsBusy` | `isInstalled` | Install tab switch row | **yes** — `shortcutsToggle.ts` is pure |
| Uninstall | `getSteamDeleteRoute(appName).catch(()=>CLOSED_STEAM_DELETE_ROUTE)` → `steamUninstallNeedsConfirm(route)` ? `UninstallModal` : `window.api.uninstall(appName, runner, false, false)` (623-642) | `showUninstallModal`; `disabled={is.playing}` | `isInstalled` | Danger zone | yes |
| Remove all copies… (Steam) | `showDialogModal` confirm → `window.api.steamRemoveAllCopies(appName)` + `refresh(runner)` (225-246) | `useLibraryState.refresh`; `disabled={is.playing}` | `isInstalled && isSteam` | Danger zone | yes |
| Force Update if Available | `handleUpdate` prop (from `GamePage`) | `disableUpdate = is.installing \|\| is.updating` | `isInstalled && !isSideloaded && !isSteam && !isThirdPartyManaged` | Version row "Check for updates" | yes (see Open Q4: it enqueues an update, it is not a read-only check) |
| Move Game | confirm (`showDialogModal`, yes/no) → `openDialog({properties:['openDirectory'],defaultPath:defaultInstallPath})` → `window.api.moveInstall({appName,path,runner})` (150-173) | `useOpenDialog`, `requestAppSettings` | same as Force Update | Location row "Move…" | yes |
| Change Install Location | confirm → picker → `window.api.changeInstallPath({appName,path,runner})` + `refresh(runner)` (175-199) | same | same as Force Update | Location row "Wrong folder?" → "Set install folder…" | yes |
| Verify and Repair | confirm → `repair(appName, runner)` catch → `reportRepairFailure` (201-219) | — | `isInstalled && !isSideloaded && !isThirdPartyManaged`; `disabled={isSteam && is.playing}` | Version row "Verify" | yes (D-13 drops the confirm; D-12 replaces the dialog) |
| Enable/Disable EOS Overlay | `handleEosOverlay` (278-366) + mount probe (413-435), app id `'98bc04bc842e4906993fd6d6644ffb8d'` (line 120) | `eosOverlayEnabled`, `eosOverlayRefresh` (from `libraryStatus`), `showDialogModal`, `tDefault` | `isInstalled && isLinux && isStore(runner,'legendary')` | ⚙ Run → Launch switch | yes — **verbatim** (5 `callOrDeclare` sites pinned) |
| Add to / Remove from Steam | `handleAddToSteam` (368-396): `window.api.addToSteam/removeFromSteam`, `finally{setSteamRefresh(false)}`, ERROR dialog on rejection; probe `isAddedToSteam` | `addedToSteam`, `steamRefresh` | `!isSteam` (shown even when not installed) | Install tab "Show in Steam" switch (the only switch shown when not installed) | yes; replace the ERROR dialog with inline failure (D-12) |
| Categories | `openGameCategoriesModal(gameInfo)` | — | always | Left chips + popover (modal stays only via GameCard, D-08) | new UI over existing store |
| Store | `NavLink to={`/store-page?store-url=${storeUrl}`}` | `storeUrl = gameExtraInfo?.storeUrl \|\| gameInfo.store_url` (DotsMenu:104-109) | `!isSideloaded && storeUrl` | Left meta store badge link ↗ | yes |
| Show Changelog | `handleChangeLog` → `GameChangeLog` (DotsMenu:142-150) | `gameExtraInfo.changelog` | `!isSideloaded && !!changelog?.length` | "What's new" on Version row **and** update status line | needs a small owner component (both places) |
| Check Compatibility (ProtonDB) | `createNewWindow(protonDBurl)`; url resolved via `getWikiGameInfo` steamID (437-451) | `protonDBurl` | `!isSideloaded && isLinux` | Ratings tab ProtonDB row (see Pitfall 8) | url logic exists in `CompatibilityInfo.tsx` |
| Requirements | `onShowRequirements` dialog (DotsMenu:123-132) | — | `hasRequirements` | **Removed** (tab covers it) | delete |
| Modify Installation | `onShowModifyInstall` → `ModifyInstallModal` (DotsMenu:134-140) | `gameInstallInfo` from context | `hasCapability(runner,'supportsModifyInstall') && isInstalled && !isThirdPartyManaged` | Size row "Modify…" owns the modal | yes |
| Browse Files | `window.api.openFolder(gameInfo.install.install_path \|\| gameInfo.folder_name)` (466-472) | — | `isInstalled` | Location row "Open" | yes |
| Browse Wine Prefix | `window.api.openFolder(gameSettings?.winePrefix)` (474-480) | `hasWine = !is.win && !is.native && gameSettings?.wineVersion.type !== 'crossover'` | `hasWine` | Engine row "Open prefix" + ⚙ Wine-tab folder button | yes |

Capability flags used (read this session, `src/common/storeCapabilities.ts`): `supportsModifyInstall` is true only for `legendary` and `gog`; `supportsCloudSaves` same; `canAddSteamShortcut`/`winePrefixToolsAvailable` true for every runner except `steam`; `hasStoreCatalog` false only for `sideload`.

## Install tab: current components → new rows

| Current (right panel `infoTab`, order today) | Reality | New |
|---|---|---|
| `PlatformSupport` | glyph row, installed platform outlined (`platformSupport__icon--installed`) | fact row "Platforms" (no actions, D-05) |
| `AppleWikiInfo` | route/CrossOver/Proton/Wine/GameLib/bridge rows; `is.native` early-returns; own data via `getSteamBridgeRoute`, `getGamelibFixStatus` (independent of `wikiInfo`) | **moves to Ratings** (D-04) |
| `RunsForMeToggle` | `ToggleSwitch` + `setRunsForMe`; mac-only, hidden when `is_mac_native === true`; failure only `logError` | switch row "Runs for me" + inline failure |
| `DownloadSizeInfo` | not-installed only, online only; Steam estimate branch `SteamInstallSize` (effect), third-party branch | fact rows Download size / Install size (not installed); Third-party row |
| `InstalledInfo` | size, version, "Online Required", third-party, path (click opens folder), Wine/Bottle/prefix; contains **dead code after `return info`** (the PopoverComponent branch) | Location / Size / Version / Engine / Online required rows; delete the file or its dead tail |
| `CloudSavesSync` | `p` showing "Sync saves: Enabled/Disabled" (`autoSyncSaves`) or red "Unsupported"; hover `Menu` only when `enableQuickSavesMenu`; sync + force-sync confirm dialogs; `handleOpenFolder` (gog: each `gogSaves` location; else `savesPath`) | fact row (D-03); **reuse** `handleSync/executeSync/handleOpenFolder` logic; Auto-sync → switch row |
| `HumbleOriginInfo` | plain `div.humbleOriginInfo`; Steam + REDEEMED key matched on `steamAppId` | neutral note (D-06) |
| `NativePortInfo` | `div.steamEngineNotice.nativePortInfo` with 3 `button is-text` | neutral note (D-06); **3 of the 39 `is-text` census sites live here** — keep their markup unchanged |

CSS trap: `GamePage/index.css:~566-640` styles `& div.infoTab, & div.extraTab { & > div > * { display:flex; text-align:end; border-bottom… } }` — every direct child of the panel becomes a flex row. New fact grids must live under a **different panel class** (e.g. `installTab`; `TabPanel` takes `className`), otherwise the legacy row rule fights `.fact`. The Ratings tab keeps `extraTab` (AppleWikiInfo's `iconWithText` rows already match that styling, so the move is style-safe).

## ⚙ dialog findings (D-02, D-07)

- `GameSettingsModalType` is `export type GameSettingsModalType = 'settings' | 'log' | 'category'` [VERIFIED: SettingsModal/index.tsx:13]. `SettingsModal` renders `{type === 'settings' && <GamesSettings />}`, `{type === 'log' && <LogSettings />}`, `{type === 'category' && <CategorySettings />}` (index.tsx:68-70). `SettingsModalHeader` has `typeLabel = { settings, log, category }[type]` (SettingsModalHeader.tsx:~26) — a typed record: removing `'log'` from the union forces both edits (compile error otherwise).
- `SettingsTab` is `'wine' | 'winetricks' | 'run' | 'advanced' | 'saves' | 'gamescope' | 'legacy'` [VERIFIED: GamesSettings/tabs.ts:7-14]; `settingsTabOrder({runFirst, showWineTab, showWinetricksTab, showCloudSavesTab, showGamescopeTab, showLegacyTab})` pushes `'advanced'` then optional `'saves'`. Add `'logs'` right after `'advanced'`, only when `!isDefault` (the global Settings page has its own Log route via `Settings/index.tsx` `type === 'log'`, which must stay). `tabLabels` is a `Record<SettingsTab,string>` (compile-forced). Tests: `GamesSettings/__tests__/tabs.test.ts`, `runAdvancedTabs.test.ts`, `enginePlacement.test.ts`.
- **Opening on Logs:** `openGameLogsModal` currently sets `type: 'log'` (uiState.ts:119-127; test at `state/__tests__/uiState.test.ts:53`). Replace with `type: 'settings'` plus a **transient** `initialTab: 'logs'` in `settingsModalProps` read by `GamesSettings`' lazy `useState` initializer (`initialSettingsTab(readRememberedTab(...), …)`). Do not write it through `rememberTab` (it would persist Logs as the next-open tab). `GameCard/index.tsx:484` (`onclick: () => openGameLogsModal(gameInfo)`) then needs no edit; keep the action name.
- **Logs tab content:** reuse `LogSettings` (`sections/LogSettings/index.tsx`) rather than a new component. Today for a game (`isInSettingsMenu = appName === 'default'` false) it shows the one game log, polls `getLogContent` every 1000 ms (`setInterval` + cleanup; fine because `TabPanel` only mounts the active tab), and has Show-in-folder, Upload, and "Open the report form". The sketch's "session picker" is a `<select>` of "Last session" / "GameLib log" [CITED: sources/012-game-page-no-menu/index.html:486]; it maps to the existing `showLogOf` state (`{appName, runner}` vs `{}`) — no new backend. Add **Copy** (`window.api.clipboardWriteText(logFileContent)`) and keep Upload/report (do not drop existing capability). The monospace box is the existing `.log-box`.
- **Advanced → Diagnostics & updates:** `GamesSettings` renders `<VerboseLogs />` and `{!isSideloaded && <IgnoreGameUpdates />}` inside `SettingsCard`; put the "Game log → Open the Logs tab" row there in `GamesSettings/index.tsx` itself (it owns `setValue`), not inside `VerboseLogs`.
- **EOS overlay in Run → Launch:** add a settings field component beside `ShowFPS`/`Mangohud`/`GameMode` in the Launch `SettingsCard` (render only `isLinux && isStore(runner,'legendary')`, installed). Follow the 261121-dzl pattern: `ToggleSwitch` + `gamelib:settings.fields.<name>.label` (noun) + icon-only `InfoIcon`; `fieldLabels.test.ts` lists `[component, label key, hasHelp]` tuples — add the new field there. The logic is `handleEosOverlay` + probe copied verbatim (see Pattern 1). `SettingsContext` supplies `appName`/`runner`/`gameInfo`.
- **Wine prefix folder button:** `WinePrefix.tsx` renders `PathSelectionBox` which already supports `afterInput?: ReactNode` (props, PathSelectionBox/index.tsx:32,49,240-245; used by `SyncSaves/legendary.tsx`). Pass a folder button calling `window.api.openFolder(winePrefix)`. `WinePrefix` returns `<></>` for win32 and `crossover`, matching `hasWine`'s intent.
- **Orphaned setting:** `enableQuickSavesMenu` is a user setting whose only consumers are `CloudSavesSync` (the hover menu D-03 deletes) and a `ToggleSwitch` in `SyncSaves/index.tsx:21-45` labelled "Enable Quick Save-Sync Menu on game page" (`setting.enable-quick-sync-menu`, translation.json:855). After D-03 it does nothing. Remove the toggle from `SyncSaves` (and the `QuickSavesToggle` component) in the same plan; leaving a dead setting is a visible regression. [Also `cloudSavesSyncFailure.test.tsx` seeds `enableQuickSavesMenu: true` and mocks `@mui/material` Menu — it must be rewritten.]

## Left-card findings (D-07, D-08, D-09)

- Favourites and hidden are keyed by **bare `appName`** (`favouriteGames.add(appName, title)`, `.list.find(f => f.appName === appName)`); custom categories are keyed by **`${appName}_${runner}`** [VERIFIED: CategorySettings/index.tsx:~34-37 `const appNameWithRunner = useMemo(() => `${appName}_${runner}`, [appName, runner])`]. The popover must use the composite key.
- **`setCustomCategory(newCategory)` REPLACES the category with `[]`** [VERIFIED: libraryState.ts:763-767 `const newCustomCategories = { ...get().customCategories, [newCategory]: [] }`]. `CategorySettings` guards by disabling submit when `listCategories().includes(newCategory.trim())`. The popover's "New category…" must do the same (trim, non-empty, not already present) or it silently wipes an existing category's games. "Create + assign" is exactly `handleSubmit` there: `addCategory(formatted)` then `addToGame(formatted, appNameWithRunner)` (D-09 = reuse that sequence; keep the popover open).
- `setCustomCategory` also appends the new category to `currentCustomCategories` when a category filter is active (libraryState.ts:769-776) — expected, no action.
- Category chips come from `listCategories().filter(cat => list[cat]?.includes(appNameWithRunner))`; remove via `removeFromGame(category, appNameWithRunner)`. Renaming/deleting stays in `CategoriesManager`/`CategorySettings` (D-08/D-09 unchanged).
- Genres render as `<span className="genre">` filled chips (`Genres.tsx`); category chips need distinct classes (outlined + tag icon) per sketch.
- Store badge today is only an SVG/PNG (`StoreLogos`, `.store-icon` 28px) in `.gameMeta`; the sketch shows text "Epic Games ↗". There is no runner→display-name helper to reuse in this component; add one (through `t()`), and link only when `!isSideloaded && storeUrl`, else leave the plain badge.
- `GameStatus`/`GamePage` own `hasUpdate`; the "What's new" link in the update status line (`GameStatus.tsx` `hasUpdate` branches) needs the changelog dialog: give it to a small `WhatsNewLink` owner component used by both `GameStatus` and the Version row (GameStatus has no dialog state today).

## Long-action state (D-10..D-13)

`MainButton` gating, verbatim [VERIFIED: MainButton.tsx:41-66]:

```ts
const disabledPlayButtons =
  is.reparing || is.moving || is.updating || is.uninstalling || is.syncing ||
  is.launching || is.installingWinetricksPackages || is.installingRedist ||
  is.preparingDrm || is.downloadingEngine || is.startingSteam ||
  (is_installed && is.installing)

const disabledInstallButtons =
  is.playing || is.updating || is.reparing || is.moving || is.uninstalling ||
  is.notSupportedGame || is.notInstallable || is.importing || is.downloadingEngine ||
  (hasCapability(gameInfo.runner, 'installManagedExternally') && is.installing) ||
  is.settingUpBottle
```

`GameContextType.is` has exactly: `installing, importing, installingWinetricksPackages, installingRedist, preparingDrm, downloadingEngine, startingSteam, launching, linux, linuxNative, mac, macNative, moving, native, notAvailable, notInstallable, notSupportedGame, playing, queued, reparing, sideloaded, settingUpBottle, syncing, uninstalling, updating, win, notPlayableOffline` [VERIFIED: src/frontend/types.ts:311-339]. Note the spelling `reparing`.

Observation channels: status ∈ {`repairing`→`is.reparing`, `moving`→`is.moving`, `updating`→`is.updating`, `installing`, `syncing-saves`→`is.syncing`, `uninstalling`}; `GameStatus` already renders "Moving file …%", "reparing … %", update percent/ETA (GameStatus.tsx:130-175). `changeInstallPath` and `modifyInstall` have **no status**, so their pending state is local to the row.

**D-12 reality (frontend-only constraint):**
- `repair` (backend `dispatch.ts:262-281`): a runner failure is caught, `notify('Error Repairing')`, logged, **and the invoke resolves** (comment at dispatch.ts:241-253 states the renderer handler "could therefore never fire for an actual runner-level repair failure, only for a transport one"). A renderer inline failure for Verify therefore only sees transport rejections.
- `moveInstall` (installFlowRegistration.ts:~535-556): on `moveRes.status === 'error'` the **backend itself** shows an ERROR dialog (`showDialogBoxModalAuto`) and resolves; a rejected path shape rethrows after its own dialog. The renderer sees a rejection only for the path-shape case.
- `changeInstallPath` and `updateGame` reject/propagate normally; `updateGame` just enqueues (`downloadQueue.addToQueue`) and resolves.
- So "replaces the error dialogs for these actions" cannot fully hold without a backend change. See Open Question 3.

D-13: Verify drops the yes/no; Move… and Set install folder keep confirm; Uninstall / Remove all copies keep existing confirms.

## Ratings tab findings (D-04)

`extraInfo` tab renders `hasWikiInfo ? <Scores/><HLTB/><CompatibilityInfo/> : <WikiInfoEmptyState/>` (GamePage/index.tsx:719-727). Two consequences: (1) `AppleWikiInfo` must be mounted **outside** that conditional — its bottle/bridge/GameLib rows do not depend on `wikiInfo` (it returns null only when `!wikiInfo && !gamelibLine.visible`, and `is.native`); (2) `CompatibilityInfo` renders the ProtonDB row only when `steamInfo.compatibilityLevel` exists, but the ⋮ "Check Compatibility" worked on any Linux non-sideload game (a search URL fallback). To avoid losing that access, render an always-available ProtonDB link row on Linux non-sideload (reuse `CompatibilityInfo`'s `protonDBurl` computation: `appNameIsSteamAppId` → `/app/{appName}`, else `pcgamingwiki.steamID`, else `/search?q={title}`). Tab value strings (`'info'`, `'extra'`) can stay; only labels change.

## Token reality check (D-15) — the sketch tokens are not the app's tokens

The sketch CSS uses a sketch-only token layer (`sources/themes/default.css`: `--color-bg`, `--color-surface`, `--color-border(-strong)`, `--color-text(-muted)`, `--color-primary`, `--color-danger/-success/-warning`, `--radius-*`, `--font-sans`, `--space-N`). **None of these (nor `--fav`, `--on-primary`) is defined anywhere in `src/`** [VERIFIED: `grep -rn -e "--color-primary" -e "--on-primary" -e "--fav" src` → no matches; the only `--color-` hit is a comment in `NavShell/index.scss:290`]. The app tokens are those in `themes.scss` / `styles/_colors.scss`.

| Sketch token | Use in the app | Notes |
|---|---|---|
| `--color-bg` | `--body-background` | |
| `--color-surface` / panel | `--navbar-background` (menus) / `--background` / `--modal-background` | the dock already uses `--body-background` (test L5 pins it) |
| `--color-border` | `--border-color` (global `gray`, measured ≥3:1 in all themes by `themeTokens.test.ts`) | existing Install rows use `var(--neutral-04)` |
| `--color-border-strong` | `--border-color` or `--neutral-04` | `--neutral-04`/`-05` must stay un-themed (test census) |
| `--color-text` | `--text-default` | |
| `--color-text-muted` | `--text-secondary` | |
| `--color-primary` (switch on, dracula pink) | `--accent` (defined in every theme, global fallback in `_colors.scss`) — **or** `var(--primary, var(--accent))` | `--primary` is declared in only some blocks; dracula `--primary:#ff79c6`, `--accent:#bd93f9` (themes.scss:375,396). Existing `ToggleSwitch` uses `--accent`. Choose and record. |
| `--on-primary` (knob when on) | `--body-background` (or `--text-tertiary`, themed dark text for fills) | needs a measured contrast check vs the chosen track |
| `--color-danger` | `var(--danger, var(--status-danger))` for fills/borders; for **text** derive like `--winetricks-danger-text: color-mix(in srgb, var(--danger, #cc3333) 40%, var(--text-default, #caf3fd))` [VERIFIED: WinetricksSettings/index.scss:49-53] | `--danger` is declared in 8 of 10 blocks |
| `--color-warning` | `--status-warning` | used by `.wikiLink` (pinned by test L3) |
| `--color-success` | `--success` / `--status-success` | |
| `--fav` | **new token** — add to every theme block in `themes.scss` (10 blocks: midnightMirage, cyberSpaceOasis, gruvbox_dark, high-contrast, dracula, nord-light, nord-dark, marine, zombie, sweet) plus a `body {}` default, **or** derive from `--status-danger` | sketch values: midnight `#ff5c8a`, gruvbox `#fb4934`, dracula `#ff79c6` |
| `--radius-md/-lg`, `--font-sans`, `--text-sm/-xs` | `--text-sm`, `--text-xs` exist (`styles/_typography.scss`); radii/fonts: use literal `6px`/`10px` or existing `--space-*` per surrounding files (sketch §Shape: 6px controls, 10px containers) | verify before use |

`themeTokens.test.ts` already provides the machinery (`contrastRatio`, `resolveValue`, `cssBlock`, per-theme scope) for new per-theme contrast specs: add one each for switch track vs surface (3:1 non-text), knob vs track, `--fav` heart vs surface (3:1), danger text vs surface (4.5:1), and the outlined-chip border. Dracula's navbar is *lighter* than body (sketch SKILL.md "design_direction" constraint 2) — resolve surfaces explicitly, not by assumption.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| Shortcuts add/remove state machine | new toggle logic | `toggleShortcuts` (extend with optional `setFailed`) | pinned semantics: "do shortcuts exist now", never rethrows |
| Steam uninstall confirm decision | inline route check | `steamUninstallNeedsConfirm` + `CLOSED_STEAM_DELETE_ROUTE` | fails closed on malformed replies |
| EOS overlay enable/install flow | new flow | `handleEosOverlay` verbatim with `callOrDeclare` | 5 call sites pinned; declines never throw |
| Category create+assign | new store action | `addCategory` + `addToGame` as in `CategorySettings.handleSubmit` (with the exists-guard) | `setCustomCategory` wipes an existing list |
| Folder pickers | `<input type=file>` | `useOpenDialog` | `dialogOptionForwarding` census; existing handlers use it |
| Cloud sync commands | new sync calls | the four `syncCommands` + `executeSync` + force-confirm in `CloudSavesSync.tsx` | gog vs legendary branches, default save path lookup |
| Log viewer | new viewer | `LogSettings`/`LogBox` | truncation to 1000 lines, error/warn colouring, upload |
| Popover focus/escape handling | custom | MUI `Popover` | gamepad + a11y behaviour |
| Contrast verification | eyeballing | `themeTokens.test.ts` helpers | repo precedent; 3:1/4.5:1 floors |

## Runtime State Inventory (refactor/move phase)

| Category | Items found | Action |
|---|---|---|
| Stored data | localStorage `${runner}-${app_name}-setting_tab` (remembered ⚙ tab; legacy `${app_name}-setting_tab` migrated once) — adding `'logs'` is compatible: `initialSettingsTab` falls back to the starting tab if a stored value is not rendered. User setting `enableQuickSavesMenu` becomes inert (D-03). `configStore` keys `games.hidden`, `games.favourites`, `games.customCategories` unchanged. | code edit only; remove the dead setting's toggle; no data migration |
| Live service config | None — verified: no backend/IPC change in scope | none |
| OS-registered state | None — Steam non-Steam shortcuts / OS shortcuts are untouched | none |
| Secrets / env vars | None | none |
| Build artifacts | None. i18n: `gamelib.json` keys added; old keys (`gamelib:gamepage.moreActions`) become unused (parser runs with `keepRemoved: true`, so nothing is auto-pruned) | none required |

## Common Pitfalls

### Pitfall 1: Source-text gates and ratchets keyed to the files being moved/deleted
**What goes wrong:** deleting `GameSubMenu`/`DotsMenu`/`TimeContainer` and adding new files turns ~15 gates red in non-obvious places.
**How to avoid:** use the table below as the final plan's checklist; run each named gate.

| Gate / test (all read this session) | Keyed to | What breaks | Fix |
|---|---|---|---|
| `GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts` | `GameSubMenu/index.tsx` text: exactly 5 `window.api.<eosChannel>` sites, 6 `setEosOverlayRefresh(false)`, `callOrDeclare(` count | file path | move test beside the new EOS hook; change `componentPath`; counts stay if code is verbatim |
| `longRunningCallSiteGuard.test.ts` | `blockAfter(read('screens/Game/GameSubMenu/index.tsx'), 'async function handleAddToSteam()')` + `finally` contains `setSteamRefresh(false)` | path + exact anchor string | keep `async function handleAddToSteam()` and its `finally` verbatim in the new hook; retarget path |
| `shortcutsToggle.test.ts:159-170` | `GameSubMenu/index.tsx`: `blockAfter(source,'function handleShortcuts()')` delegates to `toggleShortcuts(`; `shortcutsBusy ? refreshCircle()` regex | path + `refreshCircle` (spinner swap, which D-01 forbids) | rewrite the source gate for the new row; the pure tests move with `shortcutsToggle.ts` |
| `tileMenuParity.test.ts` | whole `GameSubMenu/index.tsx` | whole file | delete (its premise — ⋮ parity with the tile menu — is gone); keep a note in the GameCard test that the tile menu is unchanged |
| `helpers/__tests__/steamInstallOptionsEntry.test.ts` (D1–D5 block, `readStrippedGameSubMenu`) + `showSteamSubMenuInstallOptions` in `steamInstallOptionsEntry.ts` | `GameSubMenu` source and the predicate | file + the predicate becomes dead (knip) | delete D-block and the predicate (and its `SteamSubMenuInstallOptionsState` type + spec B4); update the doc comment |
| `InstallModal/__tests__/steamEligibilityWiring.test.ts` Group C `ORIGIN_CONTROLS` | `GameSubMenu: 'screens/Game/GameSubMenu/index.tsx'` | file missing | drop that entry (3→2 controls) |
| `src/backend/__tests__/dialogOptionForwarding.test.ts:314-330` | census: "Five files, seven calls: GameSubMenu (moveInstall + changeInstallPath)…" `toHaveLength(5)` + path in `arrayContaining` | GameSubMenu no longer calls `openDialog(` | update the path to the new hook file(s); keep 5 files if both pickers are in one hook file, else recount |
| `NavShell/__tests__/themeTokens.test.ts` ~2530 + 2750-3250 ("Game-menu .is-link family") | `GAME_SUB_MENU_TSX`; census `39 total, 27 is-link, 26 GameSubMenu …`; `cssBlock(gamePageCss,'.gameTools .link')`, dracula hover override at index.css:820-851 | census + `.gameTools` resolution tests | re-derive: remove `GameSubMenu` (26) → `is-text` total 13, is-link 1; delete the `.gameTools`-specific specs (winning-rule, IACVT, dracula hover fix, "checker can fail" ones tied to them); **keep** the MainButton + pure `.is-text` families. Any new JSX `is-text` changes the pins. |
| `GamePage/__tests__/gamePageActionDock.test.ts` L6 | `inOrder([... '<Description', '<TimeContainer', 'className="actionDock"'])`; dock order incl. `'<DotsMenu'`; `expect(tsx.match(/<DotsMenu/g)).toHaveLength(1)` | three `it`s | rewrite to the new order (heart/chips in the body; dock = status, MainButton, LaunchOptionSelector, spacer, SettingsButton) |
| `components/__tests__/DotsMenu.disclosure.test.tsx` | `DotsMenu` | whole file | delete; also remove its `meta/backendDiCeilings/frontend-screens-game.json` entry (`…DotsMenu.disclosure.test.tsx: 8`) — a stale entry **fails** |
| `MainButton.steamSplitButton.test.tsx` S9, S11 / `MainButton.importDemotion.test.tsx` | comments + assertions mention "demoted to GameSubMenu"; S11 asserts the caret item shares `GameSubMenu`'s class vocabulary | semantics change when a non-Steam ▾ appears (S9: "Import button absent for Steam AND for gog") | revisit; the Steam caret contract stays |
| `cloudSavesSyncFailure.test.tsx` | `CloudSavesSync` hover Menu, `enableQuickSavesMenu: true` | component reshaped | rewrite for the new row; counts 9 `jest.mock` in `frontend-screens-game.json` |
| `uiState.test.ts:53` | `type: 'log'` | union change | update expected `settingsModalProps` |
| `SettingsModalHeader.test.tsx` | `typeLabel.log` | union change | update |
| `meta/gameInfoNarrowingBaseline.json` | `GameSubMenu/index.tsx: 1` (+ reason at :59), `TimeContainer/index.tsx: 2` | deleted files = **stale entries fail**; any new non-test file calling `asStoreGame`/`isStoreGame` or `isStore(<object>,'x')` adds a count that must be baselined with a reason | prefer `hasCapability(runner, …)` and `isStore(runner,'x')` (identifier named `runner` is not counted); remove the two entries; add reasons only if unavoidable (the `is_delisted` read) |
| `meta/backendDiCeilings/frontend-screens-game.json` (jestMock counts, **exact**) | per-test-file `jest.mock(` count | new test files with `jest.mock` need an entry, deleted ones must lose theirs | prefer pure-function tests with no `jest.mock`; otherwise add the shard line |
| `meta/i18nGateScope.json` (hand-curated, blocking `hardcodedStringGate`) lists `GameSubMenu/index.tsx`, `GameSubMenu/repairFailure.ts`, `DotsMenu.tsx` (:139,167-168); `meta/i18nForkTouchedFiles.json` lists the four `GameSubMenu/*` + files; `meta/__tests__/genI18nGateScope.test.ts` `DECLARED_UNSCANNED_DEBT` (lists `shortcutsToggle.ts` :648, `steamUninstallConfirm.ts` :694) | file lists | deleted/moved files: remove/rename in all three; new files: run `pnpm gen-i18n-gate-scope` (local-only, needs the upstream merge-base) and hand-add new `.tsx` to scope after the gate scan finds zero literals (precedent: commits `60e1c07ed`, `5aa82aac0`), else add to `DECLARED_UNSCANNED_DEBT` |
| `meta/knip-baseline.txt` (318 lines, exact identity set) | exports/files | newly unused exports (`showSteamSubMenuInstallOptions`, `getInstallPlatformIcon` if its only consumer goes, retired components) **fail**; baseline lines for removed things must be removed | run `pnpm find-deadcode` per plan |
| `meta/hardcodedStringGate.ts:242` | comment/`HEX_GUID_RE` naming GameSubMenu's EOS app-id constant | a literal 32-hex id moves to a new file | still exempt by regex (comment update only) |
| `Settings/index.css:170` | comment | cosmetic | update/omit |

### Pitfall 2: i18n namespace
All new strings via `t('gamelib:…', 'Default')` (or `useTranslation('gamelib')`); en catalog only (`public/locales/en/gamelib.json`; precedent commit `4c6786fc4` edited only the en file). Plain `t('key')` against `gamepage`/`translation` adds keys to upstream-owned catalogs and `pnpm i18n-churn-guard` fails in CI (`.github/workflows/test.yml:32-34` runs `pnpm i18n` then the guard). `t()` defaults must be string literals (i18next-parser lexer; see the note in `repairFailure.ts:138-144`). Reusing existing upstream keys by read (e.g. `t('box.yes')`, `t('button.uninstall')`) is fine. `public/locales/**` is prettier-ignored: omit prettier in `<verify>` for it (hand-match the 4-space indentation).

### Pitfall 3: Frontend jest cannot render components
No jsdom, no react-test-renderer (jest.config.js header). Tests are (a) pure functions, (b) source-text gates through `stripSourceComments`, (c) direct function-component invocation with a hand-rolled `react` mock. Design logic into pure modules (`installActionGates`, failure-state reducer, category-name validation, token contrast) so each slice has a real behavioural test; do not promise rendered-DOM assertions. Any suite asserting user-visible labels must resolve `t` faithfully (`faithfulTranslate.ts`'s `makeFaithfulT`) — `labelSuiteI18nCensus.test.ts` enforces this for MainButton suites.

### Pitfall 4: `setCustomCategory` wipes an existing category (see Left-card findings).

### Pitfall 5: `toggleShortcuts` rejection test
Changing its return type breaks `shortcutsToggle.test.ts:133` (`resolves.toBeUndefined()`); add the optional callback instead.

### Pitfall 6: Dead state/dead code carried along
`GamePage/index.tsx` has `const [showUninstallModal, setShowUninstallModal] = useState(false)` (line 116) and mounts `<UninstallModal>` (528-535) but **nothing ever calls `setShowUninstallModal(true)`** — dead. The new danger zone should own its `UninstallModal`; delete the dead pair. `InstalledInfo.tsx` has an unreachable second `return` after `return info`.

### Pitfall 7: Play time disappears
See Open Question 1.

### Pitfall 8: ProtonDB access regresses on Linux games with no wiki data
See Ratings findings.

### Pitfall 9: Gamepad focus collector needs non-zero boxes and `.focus()`-reachable controls
MainButton comments (WR-14, caret) document that Tauri's gamepad focus collector requires a non-zero box and that unmounting is the only way to remove a control from the focus ring (no `disabled`-like prop on `Dropdown`). New popover/switch rows must be real focusable elements (`button`/`role="switch"` with `tabIndex`), and `Dropdown`'s `toggle` uses `window.api.gamepadAction({action:'tab'})` — the new non-Steam Install ▾ should reuse `Dropdown` rather than a bespoke menu.

### Pitfall 10: Hover-opened menus and "hidden actions" (D-03)
`CloudSavesSync`'s `Menu` opens on `onMouseEnter` only when `enableQuickSavesMenu` — keyboard/gamepad users could never reach it. The replacement `[Sync now ▾]` must be click-activated.

### Pitfall 11: Install-tab `Version` row semantics
`handleUpdate` for non-Steam calls `updateGame` which unconditionally enqueues an `update` queue element (installFlowRegistration.ts:298-322); for Steam it first runs `confirmSteamUpdate`. A button labelled "Check for updates" that actually starts an update surprises users. Row should show state from `gameUpdates.includes(appName)` (`hasUpdate`, already computed in `GamePage`) and available version from `gameInstallInfo?.game.version` (present on Legendary/GOG install info) [VERIFIED: types/gog.ts:18-26, types/legendary.ts:142-154]; see Open Question 4.

## Code Examples

### Pure gating function shape (D-11)
```ts
// Source: derived from MainButton.tsx:41-66 and GameSubMenu/index.tsx gates (this session)
export type ActionId =
  | 'open' | 'move' | 'setFolder' | 'modify' | 'verify' | 'checkUpdates'
  | 'openPrefix' | 'syncNow' | 'openSaves' | 'uninstall' | 'removeAll'

export interface Gate { show: boolean; disabled: boolean; reason?: 'moving'|'verifying'|'updating'|'installing'|'playing'|'uninstalling' }

export function installActionGates(i: {
  is: GameContextType['is']
  runner: Runner
  isThirdPartyManaged: boolean
}): Record<ActionId, Gate> { /* each entry: show from the capability/store gate; disabled from is.* with a reason id the row maps to a gamelib: tooltip */ }
```

### Inline row failure state (D-12) — reducer, testable without React
```ts
type RowState = { phase: 'idle' | 'busy' | 'failed' }
// transitions: start → busy; settle(ok) → idle; settle(rejected | contradicted answer) → failed; retry → busy
```

### Shortcuts failure signal without changing the return type
```ts
// shortcutsToggle.ts: add `setFailed?: (failed: boolean) => void` to ToggleShortcutsOptions
// success path:  const ok = hasShortcuts ? result !== true : result === true; setFailed?.(!ok)
// catch path:    setFailed?.(true)   // existing console/logError signals stay
```

### Sketch CSS mapped to app tokens (fact row)
```css
/* Source: game-page.md fact-row CSS, tokens replaced per the table above */
.installTab .fact { display: grid; grid-template-columns: 112px 1fr; gap: 2px 14px; padding: 10px 2px;
  border-bottom: 1px solid var(--border-color); font-size: var(--text-sm); align-items: baseline; }
.installTab .fact > b { font-weight: 500; color: var(--text-secondary); }
```

## State of the Art

| Old | Current | When | Impact |
|---|---|---|---|
| ⋮ junk drawer + `GameSubMenu` | actions beside what they change | sketch 012, 2026-11-21 | this phase |
| `'log'` as a separate `GameSettingsModalType` | Logs tab inside ⚙ | this phase | uiState/header/test edits |
| Hover `Menu` for quick save-sync | click-activated `[Sync now ▾]` | this phase | `enableQuickSavesMenu` setting retired |

**Deprecated/outdated within the repo:** `GameSubMenu`, `DotsMenu`, `TimeContainer`, `showSteamSubMenuInstallOptions`, the `.game-actions`/`.gameTools` CSS (index.css:777-857 and the RTL rule at :872-875), `gamepage.moreActions` i18n key.

## Recommended plan shape (within D-14; planner's discretion)

1. **Foundations** — `FactRow`, `SwitchRow` (new track, tokens), `RowFailure`, `installActionGates` + tests; token mapping/`--fav` in `themes.scss` + contrast specs; extract hooks into `GamePage/actions/` (copy, ⋮ untouched).
2. **Left card** — heart, chips + popover, Hide + notice, Edit details pencil, store link; remove `TimeContainer` (after Open Q1) and add the status-line play time.
3. **Install tab** — Location/Size/Version/Engine/Cloud/fact rows/notes + install-tab CSS panel class (`installTab`); `WhatsNewLink`.
4. **Library & integration + danger zone** — switch rows (shortcuts, Show in Steam, Runs for me, Auto-sync) and Uninstall/Remove all copies; remove `enableQuickSavesMenu` toggle.
5. **⚙ dialog** — Logs tab (+ `initialTab`, uiState/header/test), EOS switch, prefix folder button, Diagnostics link.
6. **Footer + tabs + Ratings** — non-Steam Install ▾ (Locate), tab renames/order, `overflow-x: auto`, AppleWikiInfo → Ratings, ProtonDB link.
7. **Delete ⋮ + migrate gates** — delete `DotsMenu`, `GameSubMenu/`, `TimeContainer`, dead CSS/state; retarget every row of the gate table; `git mv` the three pure modules + tests; `100-HUMAN-UAT.md` (D-15/D-16). Steps 2–6 are independent of one another after step 1.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The footer "Install split ▾" for non-Steam should keep the main button's current behaviour (opens the install modal) and only add "Locate existing installation…" to ▾; the sketch's "main = default folder / Choose folder and options…" would be a new capability | Footer / Plan shape | If the user wants one-click default-folder install for Epic/GOG, the plan needs a new install path (`install()` with default path) — scope creep vs "no new capabilities" |
| A2 | `--accent` (not `--primary`) should be the switch-track on-colour, `--body-background` the knob | Token reality check | Dracula switch reads purple instead of the pink the sketch showed; D-15 live check may reject it |
| A3 | `gamelib.json` en-only additions are sufficient (other 48 locales untouched) | Pitfall 2 | `gamelibCatalogParity.test.ts` or `lint-translations:gamelib` could flag missing locale keys — precedent commit `4c6786fc4` suggests not, but I did not run those gates |
| A4 | Shortcut-switch labels per OS (Applications / Desktop & Start menu / Desktop & app menu) describe what `addShortcut(appName, runner, true)` actually creates | Install tab | Wrong description text; verify against `shortcuts.ts` per platform before copy is written [CITED: game-page.md §2 item 6, not verified in backend] |
| A5 | `useSetting('autoSyncSaves')` inside `GamePage`'s `SettingsContext.Provider` is per-game (as `CloudSavesSync` already uses it there) | Switch rows | If it reads global, Auto-sync switch would toggle the wrong scope — existing component already does this, so low risk |
| A6 | `pnpm backend-di-ceilings` is red today only because of unrelated uncommitted files (`otherSessionPlaying.test.ts`, `steamOfflineMode.test.ts`) | Validation | If those are committed baselines elsewhere, ignore; otherwise the gate cannot be used as a clean signal until they are baselined [VERIFIED: output below] |

## Open Questions

1. **Play time vanishes if `TimeContainer` is removed.** (D-… phase text "left-card play-time block removed as duplicates")
   - What we know: `GameStatus.tsx` (read in full, 406 lines) renders only install/update/moving/etc. strings — **no "Played …"** (also `grep -rn "Played" GamePage/components` finds none). Only the sketch mock claims "Installed · Played 12 h 40 m · Last played 3 days ago" [CITED: sources/012-game-page-no-menu/index.html:398]. `TimeContainer` holds the real logic: `timestampStore`, `fetchPlaytimeFromServer`, Steam `steamPlaytimeMinutes`/`steamLastPlayed`, first/last-played popover.
   - Unclear: whether the user wants play time dropped from the game page or moved into the status line.
   - Recommendation: move it — extract `TimeContainer`'s data logic into a hook/pure formatter and append "Played …" (and Steam's last played) to the `is_installed` idle branch of `GameStatus`. Needs user confirmation (it changes the status line; the dock test L5/L6 and `GameStatus.*` tests are affected).

2. **D-03 "Synced 3 days ago" has no data.**
   - What we know: no last-sync timestamp exists in frontend or backend (searched `lastSync|syncedAt|sync_time` in `src/backend`, `src/common`: none relevant). Today's row shows only auto-sync Enabled/Disabled and an "Unsupported" state.
   - Recommendation: value = `Syncing…` (while `isSyncing`) / `Unsupported` / otherwise the auto-sync mode ("Automatic" / "Manual") — no invented timestamp. If the user wants "Synced …", that needs a backend change (out of scope: frontend-only).

3. **D-12 vs backend: runner-level Verify/Move failures are not observable by the renderer.** (see Long-action state)
   - Recommendation: implement inline failure for what is observable (rejections, path-shape errors, `changeInstallPath`, shortcut/Steam-shortcut/Runs-for-me answers) and **keep** the existing backend notification/dialog for runner-level repair/move failures; record this as a known limit in the plan. A true fix is a backend rethrow — out of "frontend-only" scope; ask the user.

4. **"Check for updates" = `handleUpdate`** (enqueues an update regardless; Steam goes through `confirmSteamUpdate`; Steam also has the footer `SteamUpdateButton`, and the sketch limits "Check for updates" to Epic/GOG). Recommendation: keep `handleUpdate` unchanged as the action, show up-to-date/available from `hasUpdate` + `gameInstallInfo.game.version`, and label the button honestly. If the user wants a pure read-only check, `window.api.checkGameUpdates()` exists (global, returns app names) but is consumed only inside `libraryState.refresh`.

5. **Non-Steam Install ▾ contents** — see A1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | jest, tsc | ✓ | v22.23.4 | — |
| pnpm | all scripts | ✓ | 10.28.0 | — |
| jest (Frontend project) | verification | ✓ | whole project: 373 suites / 6390 tests, ~24 s, all green at research time | — |
| `pnpm codecheck` (tsc main + meta) | verification | ✓ | exits 0, ~4 s incremental | — |
| `pnpm find-deadcode` | knip ratchet | ✓ | PASS (312 baselined findings) | — |
| `pnpm gameinfo-narrowing-ceiling` | ratchet | ✓ | PASS (877 files, 46 allowlisted) | — |
| `pnpm backend-di-ceilings` | ratchet | ⚠ | **FAIL today**: `otherSessionPlaying.test.ts` (2) and `steamOfflineMode.test.ts` (1) have no baseline — unrelated uncommitted work in the tree | judge only the `frontend-screens-game` shard: `pnpm backend-di-ceilings --shard frontend-screens-game` |
| `pnpm tauri:dev` live app | D-15/D-16 UAT | assumed ✓ (operator machine) | — | Note: tauri dev does not rebuild the sidecar; frontend-only changes need only vite HMR. Use `pnpm tauri:dev`, never `tauri:dev:run` (MEMORY). |
| `pnpm gen-i18n-gate-scope` | i18n scope chores | local-only (needs upstream merge-base object) | — | hand-edit scope JSON surgically (documented in `genI18nGateScope.ts` header) |

**Missing with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | jest 29 + ts-jest, project `Frontend` (`testEnvironment: 'node'`; **no jsdom**) [VERIFIED: src/frontend/jest.config.js] |
| Config file | `src/frontend/jest.config.js` (root `jest.config.js` aggregates projects) |
| Quick run command | `pnpm exec jest --selectProjects Frontend --testPathPattern '<regex>'` (note: `--selectProjects` is variadic — positional paths after it are swallowed; use `--testPathPattern`) — e.g. `'screens/Game'` |
| Full suite command | `pnpm exec jest --selectProjects Frontend` (~24 s) then `pnpm test:ci` for all projects |
| Static gates | `pnpm codecheck` · `pnpm lint:src` / `pnpm lint:tests` (`pnpm lint` = both ceilings) · `pnpm find-deadcode` · `pnpm gameinfo-narrowing-ceiling` · `pnpm backend-di-ceilings --shard frontend-screens-game` · `pnpm i18n && pnpm i18n-churn-guard` · `pnpm lint-translations:gamelib` · `pnpm planning-gates` · Meta tests: `pnpm exec jest --selectProjects Meta --testPathPattern 'genI18nGateScope\|hardcodedStringGate\|gamelibCatalogParity'` (these are slow: >3 min for the first two) |

### Phase Requirements → Test Map
| Decision | Behavior | Test type | Automated command | File exists? |
|----------|----------|-----------|-------------------|-------------|
| D-11 | gating matrix per runner/`is.*` (Move disables Verify/Modify/Set folder/Uninstall; Open/switch rows stay live; reason ids) | unit (pure) | `… --testPathPattern 'installActionGates'` | ❌ Wave 0 |
| D-12 | row state machine busy→failed→retry; shortcuts `setFailed` for add/remove × reject/contradicted answer | unit (pure) | `… --testPathPattern 'shortcutsToggle\|rowFailure'` | shortcutsToggle ✅ (extend), rowFailure ❌ |
| D-09 | new-category validation: trim, non-empty, not existing (no wipe), composite key | unit (pure) | `… --testPathPattern 'categoryName'` | ❌ Wave 0 |
| D-10 | busy labels derived from `is.*`; one progress readout (no second `LinearProgress` in Install tab) | source gate | `… --testPathPattern 'InstallTab'` | ❌ Wave 0 |
| D-02 | `SettingsTab` includes `'logs'` after `'advanced'`, only when `!isDefault`; initial tab honours `initialTab` | unit | `… --testPathPattern 'GamesSettings'` | ✅ extend `tabs.test.ts` |
| D-07 | `openGameLogsModal` opens `type:'settings'` + `initialTab:'logs'` | unit | `… --testPathPattern 'uiState'` | ✅ update `uiState.test.ts:53` |
| D-02 | EOS call sites remain `callOrDeclare`-wrapped (5 sites, 6 releases) | source gate (moved) | `… --testPathPattern 'Eos'` | ✅ retarget |
| D-13/uninstall | `steamUninstallNeedsConfirm` fails closed | unit | `… --testPathPattern 'steamUninstallConfirm'` | ✅ moves |
| D-01/D-15 | theme tokens: switch track ≥3:1, knob vs track, `--fav` ≥3:1, danger text ≥4.5:1, outlined chip border, in all 10 themes | unit (CSS-parse) | `… --testPathPattern 'themeTokens'` | ✅ extend |
| D-01 | no hard-coded colours / `color: black` in new CSS; no `is-text` literals beyond census | source gate | `… --testPathPattern 'themeTokens\|gamePageActionDock'` | ✅ |
| D-14 | no `DotsMenu`/`GameSubMenu`/`TimeContainer` import remains; ratchets green | static | `pnpm codecheck && pnpm find-deadcode && pnpm gameinfo-narrowing-ceiling` | ✅ |
| D-15/D-16 | live theme + store-type walk | manual | `100-HUMAN-UAT.md` | ❌ create (shape: `### N.` heading at column 0, inline `expected:`, `result:` opening with a bare/bracketed status word — `Skill("gamelib-conventions")`) |

### Sampling Rate
- **Per task commit:** `pnpm codecheck` + `pnpm exec jest --selectProjects Frontend --testPathPattern '<touched area>'` + (if a file moved/deleted/added) `pnpm find-deadcode` and `pnpm gameinfo-narrowing-ceiling`.
- **Per wave merge:** full Frontend project + `pnpm lint:src` + `pnpm lint:tests` + the shard-scoped DI ceiling + `pnpm i18n && pnpm i18n-churn-guard` (when strings changed).
- **Phase gate:** `pnpm test:ci` green, all static gates green, then `/gsd-verify-work` against `100-HUMAN-UAT.md`.

### `<verify>` rule (Skill gamelib-conventions)
Every task whose `<verify>` touches written files runs `npx prettier --check <exact paths>` — scoped, never `.` — after `npx prettier --file-info <path>` confirms `ignored: false`. Per the convention: `.planning/**`, `public/locales/**`, `.claude/**` are prettier-ignored → omit the check for tasks writing only those. `.tsx`, `.ts`, `.css`, `.scss` under `src/` are checked. Note `src/preload/.prettierrc` uses `printWidth: 120` (not relevant here).

### Wave 0 Gaps
- [ ] `GamePage/actions/__tests__/installActionGates.test.ts`
- [ ] `GamePage/actions/__tests__/rowFailure.test.ts`
- [ ] category-name validation module + test
- [ ] `100-HUMAN-UAT.md` skeleton
- No framework install needed.

## Security Domain

`security_enforcement` is not set to false in `.planning/config.json` (key absent) → included. Frontend-only phase; no new IPC, no backend surface.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | yes | new-category name: `trim()`, non-empty, not already present, rendered as React text (no `dangerouslySetInnerHTML`); paths come only from `useOpenDialog` pickers (the backend `assertPlausibleAbsolutePath` guard on `moveInstall` is unchanged) |
| V6 Cryptography | no | — |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Raw backend error text rendered in the UI (paths/credentials-adjacent) | Information disclosure | Keep T-34.2-52: inline failure text is a **fixed translated string**; raw error goes to console/`window.api.logError` only (`reportRepairFailure` precedent). The Logs tab is where detail lives. |
| Changelog HTML | XSS | `GameChangeLog` already sanitizes via `sanitize-html`; keep rendering through it (do not inline the changelog into a Version row) |
| Renderer-supplied path to `moveInstall`/`changeInstallPath` | Tampering | unchanged picker-bounded flow (`installFlowRegistration.ts` T-34.5-C6-49-03) |
| Store URL link | Tampering | keep the existing in-app `NavLink` to `/store-page?store-url=` (no new `window.open`) |

## Project Constraints (from CLAUDE.md)

- Stack: React + TypeScript on a Rust/Tauri shell; GameLib is independent of Heroic — do not raise upstream-mergeability concerns.
- Conventions table (Skill `gamelib-conventions` loaded): todo frontmatter (`severity/platform/ready`) for any `.planning/todos/pending/` file; fake-HOME for spawns (n/a here); sidecar exit contract (n/a); Rust shutdown contract (n/a); **UAT item shape** for `100-HUMAN-UAT.md`; **scoped `npx prettier --check` in every `<verify>`** (skip over ignored paths).
- Use GSD commands with a hyphen (`/gsd-execute-phase`).
- `graphify query` before reading code; never read `GRAPH_REPORT.md`/`graph.json`; run `graphify update .` after code changes.
- Memory: dev launch is `pnpm tauri:dev` (never `tauri:dev:run`); GSD `commit` sweeps dirty `.planning` unless `--files` scopes it; `phase.complete`/`new-milestone` can clobber live STATE — executors should snapshot STATE.
- Sketch findings are the design contract for game page/settings dialog (Skill `sketch-findings-gamelib`); dracula is the stress theme; macOS embed/titlebar notes are not relevant to this phase.

## Sources

### Primary (HIGH confidence — files read this session)
- `.planning/phases/100-game-page-without-the-menu/100-CONTEXT.md`; `.claude/skills/sketch-findings-gamelib/references/game-page.md`, `game-settings-dialog.md`, `SKILL.md`, `sources/012-game-page-no-menu/{README.md,index.html (grep)}`
- `src/frontend/screens/Game/GameSubMenu/{index.tsx,shortcutsToggle.ts,repairFailure.ts,steamUninstallConfirm.ts,__tests__/*}`
- `src/frontend/screens/Game/GamePage/{index.tsx,index.css,components/*.tsx (DotsMenu, MainButton, GameStatus, InstalledInfo, DownloadSizeInfo, PlatformSupport, RunsForMeToggle, CloudSavesSync, HumbleOriginInfo, NativePortInfo, AppleWikiInfo, CompatibilityInfo, SettingsButton, index), __tests__/gamePageActionDock.test.ts}`, `Game/TimeContainer/index.tsx`
- `src/frontend/screens/Settings/{components/SettingsModal/*, sections/GamesSettings/{index.tsx,tabs.ts}, sections/LogSettings/index.tsx, sections/CategorySettings/index.tsx, sections/SyncSaves/index.tsx, components/{WinePrefix,ShowFPS}.tsx}`; `src/frontend/state/{uiState.ts,accountHooks.ts,libraryState.ts (categories)}`; `src/frontend/helpers/{steamInstallOptionsEntry.ts,declaredUnavailable.ts,library.ts}`; `components/UI/{UninstallModal,ToggleSwitch,TabPanel,Dropdown,PathSelectionBox,StoreLogos}`; `screens/Library/components/GameCard/index.tsx` (menu); `src/common/storeCapabilities.ts`; `src/frontend/types.ts` (`GameContextType`)
- `src/backend/gamedetails/dispatch.ts:230-300`, `src/backend/sidecar/installFlowRegistration.ts:290-330,455-580` (failure behaviour)
- `src/frontend/themes.scss`, `styles/_colors.scss`, `components/UI/NavShell/__tests__/themeTokens.test.ts` (census/contrast machinery), `WinetricksSettings/index.scss:37-53`
- `meta/{gameInfoNarrowingCeiling.cjs,gameInfoNarrowingBaseline.json,backendDiCeilings.cjs,backendDiCeilings/frontend-screens-game.json,knipRatchet.cjs,i18nGateScope.json,i18nForkTouchedFiles.json,genI18nGateScope.ts,i18nCatalogChurnGuard.ts}`, `meta/__tests__/genI18nGateScope.test.ts`, `src/backend/__tests__/dialogOptionForwarding.test.ts`, `eslint.config.mjs` (runner-literal rule), `package.json` scripts, `.github/workflows/test.yml`
- Executed this session: Frontend jest project (373 suites/6390 tests green, 23.9 s), `pnpm codecheck` (0), `pnpm find-deadcode` (PASS), `pnpm gameinfo-narrowing-ceiling` (PASS), `pnpm backend-di-ceilings` (FAIL: unrelated untracked files)

### Secondary / Tertiary
- None — no web or Context7 lookups were needed (no external library research).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; everything in-repo and read.
- Architecture / handler inventory: HIGH — GameSubMenu/DotsMenu/GamePage read in full.
- Pitfalls / gate map: HIGH for the files read; MEDIUM that the list is exhaustive (I grepped `GameSubMenu|DotsMenu|GamesSubmenu` repo-wide but did not run every Meta gate).
- Token mapping: HIGH on "tokens absent", MEDIUM on the recommended mapping (needs the D-15 live check).

**Research date:** 2026-11-21
**Valid until:** ~30 days or until `GameSubMenu`/`GamePage` change materially (the working tree already has uncommitted edits to unrelated Steam bridge files).
