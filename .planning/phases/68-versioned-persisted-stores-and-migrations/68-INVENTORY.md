# Phase 68 Inventory: persisted GameLib files outside the D-09 stores (D-12)

**Purpose:** make the rest of GameLib's persisted surface visible so later phases can version it
deliberately. Classified from writer source only; no file under the operator's profile was read
(T-68-27). Date: 2026-11-08.

**Rule:** nothing in this inventory is migrated or versioned by Phase 68 (D-12, deferred). A row
with verdict `needs versioning later` names a todo in `.planning/todos/pending/`.

**Commands used (enumeration is mechanical, classification is by reading each writer):**

```
grep -rlE "writeFile(Sync)?\(|atomicWrite|renameSync\(" src/backend | grep -v __tests__ | grep -v "\.test\."   # 43 files
grep -rnE "localStorage\.(getItem|setItem|removeItem)\(" src/frontend | grep -v __tests__                        # 18 lines
grep -rnE "(storage|Storage)\??\.(getItem|setItem|removeItem|clear)\(" src/frontend | grep -v __tests__          # indirect `storage` aliases
```

The second renderer grep only sees the literal `localStorage.` spelling; most renderer files alias
`const storage = window.localStorage`, so the third grep was added to catch every key written
through an alias. Verdict vocabulary: `rebuildable cache`, `needs versioning later`, `not user data`.

## Backend persisted files

All 43 files printed by the first command are accounted for: 16 appear below, 4 in "Excluded
(D-09 in scope)", 23 in "Out of scope".

| File (relative to userData or described location) | Owner (src path:line) | Holds | Verdict | Todo |
| --- | --- | --- | --- | --- |
| `<appFolder>/mac-steam-offline-owed.json` (0o600) | `src/backend/storeManagers/steam/macSteamOffline.ts:265` | `{since, by, pid}`: the goonline debt a go-offline wrap owes Mac Steam, read at boot to restore Friends online after a `kill -9` | needs versioning later | `todos/pending/2026-11-08-version-mac-steam-offline-owed.md` |
| `<bottle>/.gamelib-engine.json` | `src/backend/engine/engineSwitch.ts:258` | `{kind, id, wineserverBin, dxvk}`: which engine last prepared the bottle and where its DXVK copy lives; drives DXVK removal and restore when the engine changes Reason: its loss leaves stale DXVK DLLs in a bottle and no record of what to restore. | needs versioning later | `todos/pending/2026-11-08-version-gamelib-engine-marker.md` |
| `<toolsPath>/<pinned engine>/.gamelib-pin.json` | `src/backend/engine/fallbackEngine.ts:256` | `{sha256, version}` of the artifact extracted beside it; read only by `markerMatches` (`:89`) to decide whether the pinned Wine/DXVK is installed Reason: a missing or mismatched marker triggers a re-download of the pinned artifact; nothing the user entered; research expected a todo, source says otherwise. | rebuildable cache | none |
| `<bottle>/gamelib-shared-redists.json` | `src/backend/storeManagers/steam/bridge/sharedRedistInstall.ts:260` | per-bottle redist ledger: `done`, `failures`, `rejected`, `markPending`, `displayDriver.prior` (the Graphics value to restore), `settled`; already carries `version: 1` Reason: `displayDriver.prior` and `done` cannot be recomputed from anything else once lost. | needs versioning later | `todos/pending/2026-11-08-version-shared-redists-ledger.md` |
| `<cacheSteamappsDir>/gamelib-shared-redist-index.json` | `src/backend/storeManagers/steam/depot/sharedRedist.ts:168` | `string -> string` index of shared-redist depots already in the download cache Reason: a missing index re-downloads the depot; unreadable reads as `{}`. | rebuildable cache | none |
| `gamelib_bridge.cfg` beside the game exe (0o600, atomic) | `src/backend/storeManagers/steam/bridge/bridgeConfig.ts:239` | port, per-spawn launch secret, interface pins, fix lines for the shim Reason: rewritten on every bridge launch from live helper state. | rebuildable cache | none |
| `<appFolder>/fixes/<app>-<store>.json` | `src/backend/knownFixesFetcher.ts:141` | filtered known-fix profile fetched from the remote source Reason: refetched; atomic temp+rename. | rebuildable cache | none |
| `<appFolder>/areweanticheatyet.json` | `src/backend/anticheat/utils.ts:55` | downloaded AreWeAntiCheatYet / MacAnticheatData `games.json` Reason: re-downloaded when the remote hash differs. | rebuildable cache | none |
| `<steamapps>/appmanifest_<id>.acf` | `src/backend/storeManagers/steam/depot/manifest.ts:215` | Steam's own `appmanifest` format for depot installs Reason: Valve's format, written to match Steam; GameLib does not own its schema. | not user data | none |
| `<prefix>/installed_games` | `src/backend/launcher.ts:961` | JSON array of app names launched in this prefix Reason: re-appended on every launch of each game. | rebuildable cache | none |
| tool version markers: `current_version`, installed-version files, `Info.plist` DXMT suffix | `src/backend/tools/index.ts:195`, `:580`, `:591`, `:699`; `src/backend/tools/dxmt.ts:147`; `src/backend/wine/runtimes/runtimes.ts:54` | a version string or a patched plist beside an installed tool Reason: version markers; `tools/index.ts:699` writes a DXVK restore `.reg` temp file. | not user data | none |
| `valve-client.json` in the Valve client cache dir (0o600) | `src/backend/storeManagers/steam/bridge/drm/valveClient.ts:669` | `{schema: 1, manifestVersion, packageFile, packageSha2, files}` hash list of extracted genuine Valve files Reason: verified by `verifyValveClientDir`, re-fetched from CDN on mismatch. | rebuildable cache | none |
| `gamelib-runner.json` in each cloned runner dir (0o600) | `src/backend/storeManagers/steam/bridge/drm/runnerClone.ts:576`, `src/backend/storeManagers/steam/bridge/overlay/overlayRunnerClone.ts:516` | loader hashes, clone method, `createdAt` for a re-signed CrossOver clone Reason: a clone failing verification is rebuilt. | rebuildable cache | none |

## Excluded (D-09 in scope)

These are versioned by this phase's engine and are not part of D-12.

- `src/backend/config.ts` (`config.json`) and `src/backend/game_config.ts` (`GamesConfig/<app>.json`): D-09/D-10 stores.
- `src/backend/storeVersioning/backup.ts`: the engine's own pre-migration backup writer.
- `src/backend/sidecar/fileStore.ts`: dead in production (its importers are tests only); the live stores go through `store_backend.ts`. Left untouched.
- `src/backend/store_backend.ts` does not appear in the first command's output (it writes through `conf`); it is the in-scope store stack itself.

## Renderer localStorage keys

Every key found by the second and third commands. All renderer keys are UI state or caches held in
the webview's `localStorage`; none holds data the user typed that cannot be re-entered or
re-derived. The configStore is the authority for `language` and `zoomPercent` (`GlobalState.tsx:534`);
zoom is not a localStorage key, so the research row for `savedZoomBoot.ts` is dropped.

| Key | Owner (src path:line) | Holds | Verdict | Todo |
| --- | --- | --- | --- | --- |
| `heroic-tour-state` | `src/frontend/state/TourContext.tsx:116`, `:135` | `{completedTours: string[]}`; wrong-shape JSON is already discarded (`readPersistedTourState`) Reason: losing it replays a tour. | not user data | none |
| `discounts.filters` | `src/frontend/screens/Discounts/helpers.ts:258`, `:270` | Discounts filter selection; shape-validated on read | not user data | none |
| `discounts.regionOverride` | `src/frontend/screens/Discounts/helpers.ts:125`, `:136`, `:138` | a country code Reason: one-click to re-pick. | not user data | none |
| `libraryTileWidth` | `src/frontend/screens/Library/libraryTileSize.ts:78`, `:95` | tile width scalar, clamped on read | not user data | none |
| `gamelib_welcome_seen` | `src/frontend/components/UI/NavShell/components/HeroicVersion/index.tsx:45`, `:102` (key in `UI/WelcomeModal/welcomeState.ts:18`) | flag `'1'` | not user data | none |
| `show_external_link_dialog` | `src/frontend/components/UI/ExternalLinkDialog/index.tsx:28`; `.../SettingsPanel/index.tsx:122` | `'true'/'false'` | not user data | none |
| `last-store` | `src/frontend/components/UI/NavShell/navTabs.ts:108`, `:147` | last visited store tab | not user data | none |
| `last-url-<store>` | `src/frontend/screens/WebView/useStoreEmbedHost.ts:448`; `src/frontend/screens/WebView/index.tsx:243`, `:253` | last embedded store URL Reason: falls back to the store home. | rebuildable cache | none |
| `scrollPosition` | `src/frontend/components/UI/NavShell/components/NavTabs/index.tsx:88`; `src/frontend/screens/Library/index.tsx:590` | scroll offset Reason: ephemeral. | rebuildable cache | none |
| `nonAvailableGames` | `src/frontend/hooks/constants.ts:100`, `:115`, `:143`; `src/frontend/screens/Library/index.tsx:816`; removed at boot `src/frontend/index.tsx:218` | list of app names found unavailable Reason: removed on each boot and healed on each change. | rebuildable cache | none |
| `language` | `src/frontend/components/UI/LanguageSelector/index.tsx:130`; `src/frontend/index.tsx:225` | boot language hint Reason: configStore is the authority, `helpers/resolveBootLanguage.ts`. | rebuildable cache | none |
| `current_custom_categories`, `current_custom_category`, `category` | `src/frontend/state/GlobalState.tsx:220`, `:222`, `:576`, `:956` | current category selection | not user data | none |
| `sidebar_collapsed`, `hide_changelogs`, `last_changelog`, `last_version` | `src/frontend/state/GlobalState.tsx:527`, `:563`, `:2075-2077`; `.../HeroicVersion/index.tsx:43-72`; `src/frontend/components/UI/ChangelogModal/index.tsx:15` | UI flags and last-seen version | not user data | none |
| `updates` | `src/frontend/state/GlobalState.tsx:1569`, `:1965`, `:2074`; `src/frontend/screens/Settings/components/ClearCache.tsx:13` | cached list of games with updates Reason: refetched by `checkGameUpdates`, cleared by Clear Cache. | rebuildable cache | none |
| `layout`, `libraryView`, `libraryInstalledOnly`, `storeFacet`, `storesFilters`, `runnabilityFacet`, `platformsFilters`, `crossoverRatingFilters`, `libraryNativeOnly`, `libraryCollection`, `facetOptInMigrated` | `src/frontend/screens/Library/index.tsx:120-252` | Library view and filter selections and the one-shot facet migration flag; legacy keys are removed on read Reason: already discard or migrate on mismatch. | not user data | none |
| `show_hidden`, `show_favorites`, `show_installed_only`, `show_non_available`, `no_store_page`, `show_support_offline_only`, `show_third_party_managed_only`, `show_updates_only`, `showAlphabetFilter` | `src/frontend/screens/Library/index.tsx:409-514` | filter-mode tri-states and toggles (`filterEngine.migrateFilterMode`) | not user data | none |
| `librarySortField`, `librarySortDirection`, `libraryGroupBy`, `sortDescending`, `sortInstalled` | `src/frontend/screens/Library/librarySort.ts:93-136` (keys at `:52-56`) | sort selection; legacy keys translated on read | not user data | none |
| `<app_name>` (bare app name key) | `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx:124`; `src/frontend/helpers/library.ts:88`, `:127`, `:136`; `GameCard/index.tsx:764`; `Game/GamePage/index.tsx:735`; `UI/UninstallModal/index.tsx:115`; `ConsoleMode/index.tsx:321` | `{...progress, folder}` hint to resume a stopped download Reason: removed on completion, cancel and uninstall; losing it means picking the folder again. | rebuildable cache | none |
| `<appName>_<runner>_progress` | `src/frontend/hooks/hasProgress.ts:13` | last install progress snapshot | rebuildable cache | none |
| `<app_name>-setting_tab`, `default` | `src/frontend/screens/Settings/sections/GamesSettings/index.tsx:138-164` | last used settings tab index | not user data | none |

`src/frontend/screens/Login/components/Runner/index.tsx:122` contains a commented-out
`localStorage.clear()`; it is not a key.

Row coverage: the second command's 18 lines map to `heroic-tour-state` (2), `<app_name>-setting_tab`
(2), `last-url-<store>` (3 incl. `useStoreEmbedHost`), `discounts.*` (5), bare `<app_name>` (1, ConsoleMode),
`show_external_link_dialog` (2), `last-store` (2), `scrollPosition` (1): 18.

## Out of scope

External-tool files, binary or transient writers, Keychain-backed secrets and dev tooling. None is
GameLib-owned persistent JSON. One clause each (these are the remaining 23 of the 43 files):

- **External-tool files:** `src/backend/storeManagers/legendary/thirdParty.ts` (legendary `installed.json` edits), `src/backend/save_sync.ts` (legendary `installed.json` `save_path`), `src/backend/storeManagers/gog/library.ts` (gogdl manifest and install files), `src/backend/storeManagers/nile/library.ts` (nile `installed.json`), `src/backend/engine/adoptBottle.ts` (CrossOver `cxbottle.conf`), `src/backend/shortcuts/shortcuts/shortcuts.ts`, `src/backend/shortcuts/nonesteamgame/nonesteamgame.ts`, `src/backend/shortcuts/utils.ts` (`.desktop`, plist, `.icns` and Steam shortcuts output).
- **Binary or payload writers:** `src/backend/knownFixOverlayInstall.ts` (known-fix payload files, `wx`), `src/backend/storeManagers/steam/depot/lzmaNativeBinding.ts` (native addon), `src/backend/storeManagers/steam/bridge/originalRestore.ts` (original DLL backup bytes), `src/backend/storeManagers/steam/bridge/drm/stageDrmBottle.ts` (staged binaries), `src/backend/storeManagers/steam/bridge/drm/drmRestore.ts` (restores `.orig` binaries), `src/backend/storeManagers/steam/bridge/drm/steamclientLayerInstall.ts` (layer files), `src/backend/storeManagers/steam/bridge/drm/runnerEntitlements.ts` (entitlements plist for `codesign`), `src/backend/sidecar/nativeImageShim.ts` (temp input for image conversion), `src/backend/utils/inet/downloader/index.ts` and `src/backend/wine/runtimes/util.ts` (downloaded archives), `src/backend/wine/manager/downloader/main.ts` (rename-aside of an install dir for rollback).
- **Transient or housekeeping:** `src/backend/logger/log_writer.ts` (log rotation), `src/backend/utils/filesystem/windows.ts` (write probe, deleted), `src/backend/constants/paths.ts` (one-time `heroic` to `GameLib` folder rename, not a file write).
- **Dev-only:** `src/backend/sidecar/devSecretVault.ts` (0o600 dev vault behind the dev flag).
- **Keychain-backed secrets:** not files; outside this phase's boundary.

## Summary of verdicts

- `needs versioning later`: 3 backend files (todos filed). No renderer key.
- `rebuildable cache` and `not user data`: every other row.
- Deviation from the research's expectation: `.gamelib-pin.json` is a rebuildable install-completeness marker, so no todo for it.
