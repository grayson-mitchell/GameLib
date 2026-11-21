---
phase: 100-game-page-without-the-menu
reviewed: 2026-11-22T00:00:00Z
depth: standard
files_reviewed: 92
files_reviewed_list:
  - meta/__tests__/genI18nGateScope.test.ts
  - meta/backendDiCeilings/frontend-screens-game.json
  - meta/gameInfoNarrowingBaseline.json
  - meta/hardcodedStringGate.ts
  - meta/i18nCatalogPresenceBaseline.json
  - meta/i18nForkTouchedFiles.json
  - meta/i18nGateScope.json
  - public/locales/en/gamelib.json
  - src/backend/__tests__/dialogOptionForwarding.test.ts
  - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
  - src/frontend/components/UI/UninstallModal/index.tsx
  - src/frontend/components/UI/index.tsx
  - src/frontend/customThemes/builtinTokens.generated.json
  - src/frontend/helpers/__tests__/declaredUnavailable.test.ts
  - src/frontend/helpers/__tests__/steamInstallOptionsEntry.test.ts
  - src/frontend/helpers/declaredUnavailable.ts
  - src/frontend/helpers/steamInstallOptionsEntry.ts
  - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts
  - src/frontend/screens/Game/GamePage/__tests__/gamePageTabs.test.ts
  - src/frontend/screens/Game/GamePage/__tests__/playTimeSummary.test.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/installCaret.test.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/longRunningCallSiteGuard.test.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/shortcutsToggle.test.ts
  - src/frontend/screens/Game/GamePage/actions/__tests__/steamUninstallConfirm.test.ts
  - src/frontend/screens/Game/GamePage/actions/installActionGates.ts
  - src/frontend/screens/Game/GamePage/actions/installCaret.ts
  - src/frontend/screens/Game/GamePage/actions/rowAction.ts
  - src/frontend/screens/Game/GamePage/actions/shortcutsToggle.ts
  - src/frontend/screens/Game/GamePage/actions/steamUninstallConfirm.ts
  - src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts
  - src/frontend/screens/Game/GamePage/actions/useSteamShortcut.ts
  - src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts
  - src/frontend/screens/Game/GamePage/components/DownloadSizeInfo.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/HumbleOriginInfo.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/DangerZone.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/EngineRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/IntegrationRows.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/NotInstalledFacts.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/SizeRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/StaticFactRows.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/SwitchRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/WhatsNewLink.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/SwitchRow.test.tsx
  - src/frontend/screens/Game/GamePage/components/InstallTab/__tests__/installTabSource.test.ts
  - src/frontend/screens/Game/GamePage/components/InstallTab/index.css
  - src/frontend/screens/Game/GamePage/components/InstallTab/index.tsx
  - src/frontend/screens/Game/GamePage/components/LeftCard/EditDetailsButton.tsx
  - src/frontend/screens/Game/GamePage/components/LeftCard/FavouriteHeart.tsx
  - src/frontend/screens/Game/GamePage/components/LeftCard/HiddenNotice.tsx
  - src/frontend/screens/Game/GamePage/components/LeftCard/LibraryRow.tsx
  - src/frontend/screens/Game/GamePage/components/LeftCard/StoreBadgeLink.tsx
  - src/frontend/screens/Game/GamePage/components/LeftCard/__tests__/leftCardSource.test.ts
  - src/frontend/screens/Game/GamePage/components/LeftCard/index.css
  - src/frontend/screens/Game/GamePage/components/MainButton.tsx
  - src/frontend/screens/Game/GamePage/components/NativePortInfo.tsx
  - src/frontend/screens/Game/GamePage/components/PlatformSupport.tsx
  - src/frontend/screens/Game/GamePage/components/ProtonDbLink.tsx
  - src/frontend/screens/Game/GamePage/components/RunsForMeToggle.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.importDemotion.test.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/MainButton.steamSplitButton.test.tsx
  - src/frontend/screens/Game/GamePage/components/index.tsx
  - src/frontend/screens/Game/GamePage/index.css
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/playTimeSummary.ts
  - src/frontend/screens/Game/GamePage/usePlayTime.ts
  - src/frontend/screens/Library/components/GameCard/__tests__/cardVisibility.test.ts
  - src/frontend/screens/Library/components/InstallModal/__tests__/steamEligibilityWiring.test.ts
  - src/frontend/screens/Settings/components/EosOverlaySetting.tsx
  - src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
  - src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx
  - src/frontend/screens/Settings/components/SettingsModal/index.tsx
  - src/frontend/screens/Settings/components/WinePrefix.tsx
  - src/frontend/screens/Settings/components/__tests__/EosOverlaySetting.callSiteGuard.test.ts
  - src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts
  - src/frontend/screens/Settings/index.css
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/logsTab.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/tabs.ts
  - src/frontend/screens/Settings/sections/LogSettings/index.css
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx
  - src/frontend/screens/Settings/sections/SyncSaves/gog.tsx
  - src/frontend/screens/Settings/sections/SyncSaves/index.tsx
  - src/frontend/screens/Settings/sections/SyncSaves/legendary.tsx
  - src/frontend/state/__tests__/uiState.test.ts
  - src/frontend/state/uiState.ts
  - src/frontend/styles/_buttons.scss
  - src/frontend/themes.scss
findings:
  critical: 2
  warning: 5
  info: 6
  total: 13
status: issues_found
---

# Phase 100: Code Review Report

**Reviewed:** 2026-11-22
**Depth:** standard
**Files Reviewed:** 92
**Status:** issues_found

## Summary

Reviewed the Install tab rows and gates, the left-card library row, the footer caret, the Logs tab and EOS switch in the settings dialog, the play-time hook, the themes and the `meta/` baselines. I read the deleted `GameSubMenu` and `DotsMenu` from `2e70177da` and checked every item they carried against its new home.

All 20 old ⋮ actions have a new home. Two things are wrong with those homes:

- Verify, Update and What's new share one row, and that row is hidden for any game with no `install.version`. That includes bridge-installed Steam games, so Verify and Repair is unreachable for them.
- A Move longer than 60 s is reported as "Move failed" while it is still running. The Retry link can then start a second move.

The `meta/` baselines were not loosened. Counts went down or were re-pathed, the scope and fork-touched counts match the test (348 and 471), and every `gamelib:` key used by the reviewed source exists in `public/locales/en/gamelib.json`. Tests are mostly source-text gates, which cannot catch either finding above.

Checked and found fine:

- `i18n.language` is BCP-47 in the renderer (`i18nextLanguageOptions` runs it through `toI18nextCode`), so `Intl.*(i18n.language)` in `usePlayTime` is safe for `pt_BR` and `zh_Hans`.
- Hooks in `VersionRow`, `EngineRow`, `DangerZone` and `RunsForMeToggle` all run before their early returns.
- `ProtonDbLink` encodes the title and app id.
- `WhatsNewLink` renders the changelog through the sanitising `GameChangeLog`.

## Critical Issues

### CR-01: Verify, Update and What's new vanish for any installed game with no `install.version`

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/VersionRow.tsx:49-57`
**Issue:** `VersionRow` returns `null` when `!version`. The row is the only home of the Verify, Update and What's new actions (⋮ items "Verify and Repair", "Force Update" and "Show Changelog"). The old ⋮ items had no version precondition.

`installActionGates` explicitly keeps Verify live for Steam, but Steam installs often have no version:
- `markBridgeGameInstalled` (`src/backend/storeManagers/steam/bridgeInstallState.ts:164-170`) writes `install: { install_path, install_size: '', platform }` with no `version`. This is the Mac bridge path.
- `installVersionField` (`src/backend/storeManagers/steam/library/installedMap.ts:58-67`) deliberately omits `version` for a null, empty or `'0'` ACF buildid.

Result: for those installs the Install tab has no Verify, so the file-repair action is unreachable. The source-text tests cannot catch this, because they only grep for `useRowAction('repair'`.
**Fix:** Do not gate the row on the version string. Render the row for any installed, non-sideloaded, non-third-party, non-browser game, and show the version text only when present:
```tsx
if (
  !gameInfo.is_installed ||
  isSideloaded ||
  gameInfo.thirdPartyManagedApp ||
  gameInfo.install.platform === 'Browser'
) return null
...
{version ? <>{version} {hasUpdate ? ... : upToDate}</> : t('gamelib:gamepage.installTab.versionUnknown', 'Unknown')}
```
Add a unit or source gate that the row renders without a version.

### CR-02: A Move that runs longer than 60 s is shown as "Move failed", and the Retry link can start a second move

**File:** `src/frontend/screens/Game/GamePage/actions/useInstallLocationActions.ts:35-47` (Retry wiring at 92; row at `InstallTab/LocationRow.tsx:29-40`)
**Issue:** `moveInstall` is not in the shell's `LONG_RUNNING_CHANNELS` (`src-tauri/src/main.rs:199-`). The list has `repair`, `install`, `syncSaves` and others, but not `moveInstall`, `changeInstallPath` or `steamRemoveAllCopies`. The handler (`src/backend/sidecar/installFlowRegistration.ts:490-546`) awaits the whole `moveInstall(path)` copy. Under Tauri the invoke therefore rejects at 60 s while the backend keeps moving the game.

The old code let that rejection go unhandled. The new `moveRow.run` catches it and dispatches `fail`. The row then shows "Move failed. Details are in the log." with a Retry link for a move that is still running and may succeed.

Retry is `retryMove`, which opens the folder picker and calls `moveInstall` again. It is not gated by `gates.move.disabled` or `is.moving`, so a second move can start against the same install. Large installs routinely take more than 60 s to copy, so this is the common case.
**Fix:** Both, ideally:
1. Add `"moveInstall"` (and `"changeInstallPath"`, `"steamRemoveAllCopies"`) to `LONG_RUNNING_CHANNELS`, with the usual measurement note.
2. Make Retry inert while the game is moving. Pass `retryDisabled` from `gates.move.disabled`, or have `RowFailure` render only when `!is.moving`. In `useInstallLocationActions`, do not call `fail` when the rejection is the transport timeout while the game status is still `moving`.

## Warnings

### WR-01: The "Edit details" button sits on top of the 32-bit macOS badge

**File:** `src/frontend/screens/Game/GamePage/components/LeftCard/index.css:182-188` (and `src/frontend/screens/Game/GamePage/index.css:149-153`)
**Issue:** `.editDetailsButton` is absolutely positioned at `top: var(--space-sm); right: var(--space-sm)` inside `.gameArtBand`. `.macArchBadge` is absolutely positioned inside the same `.gameArtBand` at `top: .5rem; right: .5rem` (rendered just before it, `index.tsx:553-554`). For a game with `mac_arch === '32'` the two controls occupy the same corner. The edit button has `z-index: 2` and is revealed on hover, so it covers the badge exactly when the user's pointer is on the art.
**Fix:** Give the badge a different anchor, for example `left`, or stack them with a flex container. Alternatively offset the edit button by the badge width when the badge renders.

### WR-02: Installed third-party-managed games lose "Browse Files"

**File:** `src/frontend/screens/Game/GamePage/actions/installActionGates.ts:134` (`open: unaffected(isInstalled && !isThirdPartyManaged && !isBrowserGame)`; consumed at `InstallTab/LocationRow.tsx:26`)
**Issue:** The old ⋮ "Browse Files" item was shown for every installed game (`GameSubMenu` line 788: `isInstalled && ...`). The old Location fact (`InstalledInfo`) hid its path for third-party games, but the menu item still opened `install_path || folder_name`. `LocationRow` returns `null` when `gates.open.show` is false, so the whole Location row and its Open button vanish for installed EA-managed and Ubisoft-managed games. If those games have a folder, that action now has no home.
**Fix:** Either confirm and document that third-party games have no usable path, or show Open for them when `install_path || folder_name` is non-empty. For example, drop `!isThirdPartyManaged` from `open` and keep it only on Move, Set folder, Modify and Verify.

### WR-03: The long-action guard's header and the CloudSavesSync failure path point at a deleted behavioural test

**File:** `src/frontend/screens/Game/GamePage/actions/__tests__/longRunningCallSiteGuard.test.ts:15-20` (and `meta/backendDiCeilings/frontend-screens-game.json`)
**Issue:** The header says `CloudSavesSync` "is covered behaviourally in `cloudSavesSyncFailure.test.tsx`". That file was deleted in this phase (its ceiling entry was removed, and no such file exists on disk), but the claim stayed.

The rewritten `CloudSavesSync` (`useRowAction`, `lastSyncType`, Retry that re-prompts for force syncs, `pathMissing` gating) has no behavioural test. Neither does `VersionRow`, `LocationRow` or `DangerZone`; each is covered only by `readFileSync` greps. The reducer and `cloudSync.ts` helpers are tested, but not the components' use of them.
**Fix:** Correct the header. Add behavioural tests for the CloudSavesSync failure and Retry path, using the same hook harness as the other tests, or at least a render-tree test as `SwitchRow.test.tsx` does.

### WR-04: Row failure state is sticky, and a second simultaneous failure is hidden

**File:** `src/frontend/screens/Game/GamePage/components/InstallTab/LocationRow.tsx:29-45`, `src/frontend/screens/Game/GamePage/actions/rowAction.ts:30-40`
**Issue:** `failed` leaves only through `dismiss` (never called by any row) or a Retry. Nothing clears it when the user succeeds at something else or the game state changes. A failed Move keeps "Move failed" under the Location row after the user has moved the game via another route, or after Verify succeeded. Also `LocationRow` shows `moveFailed` in preference to `setFolderFailed`, so a Set-folder failure is invisible while a Move failure is showing.
**Fix:** Clear a row's failure when a new action on that row starts (already true via `start`). Also call `dismiss` when another long action on the row begins, or on a status change that ends it. Show both messages, or the most recent.

### WR-05: Danger-zone confirms have no failure path (unhandled rejections)

**File:** `src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts:42-43` and `51-54`
**Issue:** `window.api.uninstall(appName, runner, false, false)` is neither awaited nor caught. `onRemoveAllCopiesYesClick` awaits `steamRemoveAllCopies` and then `refresh` with no `try`, and the dialog does not await its `onClick`, so a rejection becomes an unhandled promise rejection (console-warn only; it never reaches `gamelib.log`). `uninstall` and `steamRemoveAllCopies` can run long and are, or should be, bounded by the invoke timeout (see CR-02), so a false rejection is plausible. This is carried over from the ⋮ menu, but the phase rehomed these as part of the danger zone where a visible failure is expected.
**Fix:** Wrap both in `reportRowActionFailure` or a `useRowAction`, and show a `RowFailure` in `DangerZone`. At minimum add `.catch((error) => reportRowActionFailure({...}))` so the failure reaches the log.

## Info

### IN-01: `StoreBadgeLink` interpolates the store URL into the query string unencoded

**File:** `src/frontend/screens/Game/GamePage/components/LeftCard/StoreBadgeLink.tsx:34`
**Issue:** The `to` prop is `` `/store-page?store-url=${storeUrl}` ``. A store URL containing `&`, `#` or `+` is truncated or altered by `URLSearchParams.get('store-url')` in `WebView/index.tsx`. This is carried from the old ⋮ item.
**Fix:** `` `/store-page?store-url=${encodeURIComponent(storeUrl)}` `` (the WebView side already decodes through `URLSearchParams`).

### IN-02: `ProtonDbLink` dropped the `gamesdb.steamID` fallback

**File:** `src/frontend/screens/Game/GamePage/components/ProtonDbLink.tsx:30-34`
**Issue:** The old ⋮ item resolved the Steam id from `info?.pcgamingwiki?.steamID ?? info?.gamesdb?.steamID` (`WikiInfo.gamesdb` still exists in `common/types.ts:994`). The new row, following `CompatibilityInfo`'s rule, uses only `pcgamingwiki.steamID`. A GOG game with only a GamesDB Steam id now links to a ProtonDB search instead of the app page.
**Fix:** `const steamId = wikiInfo?.pcgamingwiki?.steamID ?? wikiInfo?.gamesdb?.steamID`.

### IN-03: Stale comments and naming left over from the plan-by-plan rollout

**File:** `src/frontend/screens/Game/GamePage/actions/useUninstallActions.ts:9`, `actions/rowAction.ts:14` and `119-123`, `components/MainButton.tsx` (class `SteamInstallCaret`)
**Issue:**
- `// The route classifier stays where the ⋮ menu keeps it; plan 09 moves it.` is wrong: the module already lives in `GamePage/actions/`.
- `@public consumed by the Install-tab rows in plans 04-06` describes a past state.
- The caret keeps the class `SteamInstallCaret` although D-20 extended it to every store.
- `shortcutsToggle.ts` still describes "the old ⋮ menu" in its main docblock.
**Fix:** Update or drop the comments, and rename the class (and its test and CSS selectors) to something store-neutral.

### IN-04: Two `useTranslation()` results with the same namespace in `EosOverlaySetting`

**File:** `src/frontend/screens/Settings/components/EosOverlaySetting.tsx:21-24`
**Issue:** `const { t } = useTranslation()` and `const { t: tDefault } = useTranslation()` are identical calls; the old file needed distinct `t`s for three namespaces. The comment justifying `tDefault` is a leftover. Also, if the user dismisses the "install now?" dialog through the backdrop rather than the "No" button, `eosOverlayRefresh` stays true and the switch stays disabled until the dialog is reopened. This is identical to the old menu's behaviour.
**Fix:** Use one `t`, and reset the spinner via the dialog's close callback, if the dialog API provides one.

### IN-05: Accessibility details

**File:** `src/frontend/screens/Game/GamePage/components/ProtonDbLink.tsx:42-55`, `src/frontend/screens/Settings/sections/GamesSettings/index.tsx` (Game log link), `LeftCard/index.css:97-105` and `180-205`
**Issue:**
- `ProtonDbLink` and the Game-log link are `<a role="button">` without `href`. `ProtonDbLink` has no `tabIndex` or key handler (not keyboard-reachable); the Game-log link handles Enter only, not Space.
- The category-chip × (`opacity: 0`) and the Edit-details button (`opacity: 0`) are revealed only on hover or focus, so touch and Steam Deck touchscreen users cannot discover them. The comment shows the opacity trick is deliberate for the gamepad collector, but there is no touch affordance.
**Fix:** Use `<button type="button">` (the `.iconWithText` style can be kept), and reveal the chips' × and the Edit button with `@media (hover: none)` or always-on.

### IN-06: The footer play-time suffix appears for states that are not idle in practice

**File:** `src/frontend/screens/Game/GamePage/components/GameStatus.tsx:418-427`, `src/frontend/screens/Game/GamePage/playTimeSummary.ts:94-112`
**Issue:** `isStatusIdle` does not include `is.notAvailable`, `is.notSupportedGame` or `is.notInstallable`, and `usePlayTime` returns `null` only for `notInstallable`. A "Game not available" or "This game uses third party launcher" line gets " · Never played" appended. A not-installed game reads "Not installed · Never played".
**Fix:** Pass `isStatusIdle(is) && gameInfo.is_installed && !is.notAvailable && !is.notSupportedGame` (and the Steam metadata case, where played minutes do exist for an uninstalled owned game, can stay as is).

---

_Reviewed: 2026-11-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
