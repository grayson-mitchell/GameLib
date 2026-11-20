---
phase: quick-261029-toq
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements: [QUICK-261029-TOQ]
files_modified:
  # Task 1: backend / common / preload
  - src/backend/storeManagers/zoom/constants.ts            # DELETE
  - src/backend/storeManagers/zoom/electronStores.ts       # DELETE
  - src/backend/storeManagers/zoom/games.ts                # DELETE
  - src/backend/storeManagers/zoom/library.ts              # DELETE
  - src/backend/storeManagers/zoom/user.ts                 # DELETE
  - src/backend/storeManagers/zoom/__tests__/user.test.ts  # DELETE
  - src/common/types/zoom.ts                               # DELETE
  - src/preload/api/zoom.ts                                # DELETE
  - src/backend/sidecar/legacyZoomDataCleanup.ts           # CREATE
  - src/backend/sidecar/__tests__/legacyZoomDataCleanup.test.ts  # CREATE
  - src/backend/sidecar/bootstrap.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/backend/storeManagers/index.ts
  - src/backend/launcher.ts
  - src/backend/save_sync.ts
  - src/backend/utils.ts
  - src/backend/protocol.ts
  - src/backend/logger/constants.ts
  - src/backend/downloadmanager/installStallWatchdog.ts
  - src/backend/humble/user.ts
  - src/backend/platform/index.ts
  - src/backend/shortcuts/shortcuts/shortcuts.ts
  - src/backend/wiki_game_info/umu/utils.ts
  - src/backend/sidecar/storeRegistration.ts
  - src/backend/sidecar/oauthLoginCapture.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/oauthLoginFlowRegistration.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/steamFlowRegistration.ts
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/sidecar/runnerMiscFlowRegistration.ts
  - src/backend/sidecar/enrichmentFlowRegistration.ts
  - src/backend/sidecar/downloadQueueFlowRegistration.ts
  - src/common/types.ts
  - src/common/utils.ts
  - src/common/types/storePolicy.ts
  - src/common/types/electron_store.ts
  - src/common/types/ipc.ts
  - src/common/types/oauthLogin.ts
  - src/common/types/sidecarTransport.ts
  - src/preload/api/index.ts
  - src/preload/api/misc.ts
  - src/backend/__tests__/protocol.test.ts
  - src/backend/__tests__/storeChangeNotifier.test.ts
  - src/backend/__tests__/knownFixesFetcher.test.ts
  - src/backend/__tests__/getDefaultLegendarySavePathRefresh.test.ts
  - src/backend/crossover_index/__tests__/ratingMap.test.ts
  - src/backend/gamedetails/__tests__/gameDetailsModules.test.ts
  - src/backend/sidecar/__tests__/oauthLoginCapture.test.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  - src/backend/sidecar/__tests__/electronUntouched.test.ts
  - src/backend/sidecar/__tests__/enrichmentFlows.test.ts
  - src/backend/sidecar/__tests__/skeletonFlows.test.ts
  - src/backend/sidecar/__tests__/runnerSliceRegistration.test.ts
  - src/backend/sidecar/__tests__/runnerAuthFlows.test.ts
  - src/backend/sidecar/__tests__/steamgridSecretStore.test.ts
  - src/backend/sidecar/__tests__/keyringTokenStore.test.ts
  - src/backend/sidecar/__tests__/humbleSecretStore.test.ts
  - src/backend/sidecar/__tests__/gameDetailsFlows.test.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/__tests__/tokenStore.test.ts
  - src/backend/storeManagers/steam/__tests__/depot.test.ts
  - src/backend/storeManagers/legendary/__tests__/epicOfflineMode.test.ts
  - src/common/types/__tests__/storePolicy.test.ts
  # Task 2: frontend
  - src/frontend/assets/zoom-logo.svg                      # DELETE
  - src/frontend/types.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/helpers/electronStores.ts
  - src/frontend/helpers/library.ts
  - src/frontend/components/UI/StoreLogos/index.tsx
  - src/frontend/components/UI/NavShell/navTabs.ts
  - src/frontend/components/UI/NavShell/components/NavTabs/index.tsx
  - src/frontend/screens/Settings/components/ExperimentalFeatures.tsx
  - src/frontend/screens/Settings/sections/LogSettings/index.tsx
  - src/frontend/screens/StoreSearch/index.tsx
  - src/frontend/screens/WebView/storeEmbedOrigins.ts
  - src/frontend/screens/WebView/index.tsx
  - src/frontend/screens/WebView/loginRoutes.ts
  - src/frontend/screens/WebView/useTauriOAuthLogin.ts
  - src/frontend/screens/WebView/components/TauriLoginPanel.tsx
  - src/frontend/screens/Discounts/index.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Library/filterEngine.ts
  - src/frontend/screens/Library/facetLabels.ts
  - src/frontend/screens/Library/components/LibraryTour.tsx
  - src/frontend/screens/Library/components/EmptyLibrary/index.tsx
  - src/frontend/screens/Game/ModifyInstallModal/index.tsx
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/Login/components/OAuthLogin/index.tsx
  - src/frontend/screens/Login/components/Runner/index.tsx
  - src/frontend/screens/Login/components/LoginWarning/index.tsx
  - src/frontend/screens/ConsoleMode/index.tsx
  - src/frontend/state/__tests__/GlobalStateRefreshCacheGuard.test.ts
  - src/frontend/state/__tests__/GlobalStateScopedRefresh.test.ts
  - src/frontend/state/__tests__/GlobalStateRefreshLibraryOrigin.test.ts
  - src/frontend/state/__tests__/GlobalStateSteamCacheHydration.test.ts
  - src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx
  - src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx
  - src/frontend/screens/WebView/__tests__/loginRoutes.test.ts
  - src/frontend/screens/WebView/__tests__/WebViewOAuthNavigation.test.ts
  - src/frontend/screens/WebView/__tests__/useTauriOAuthLogin.test.tsx
  - src/frontend/screens/WebView/__tests__/storeEmbedOrigins.test.ts
  - src/frontend/screens/Library/components/EmptyLibrary/__tests__/index.test.tsx
  - src/frontend/screens/Library/components/InstallModal/WineSelector/__tests__/engineFilter.test.ts
  - src/frontend/screens/Library/__tests__/libraryTourAnchors.test.tsx
  - src/frontend/screens/Library/__tests__/libraryHookStaleness.test.ts
  - src/frontend/screens/Library/__tests__/filterEngine.test.ts
  - src/frontend/screens/Library/__tests__/connectedStoresParity.test.ts
  - src/frontend/screens/Login/components/Runner/__tests__/index.test.tsx
  - src/frontend/screens/Login/__tests__/oauthLoginOverlay.test.ts
  - src/frontend/screens/Login/__tests__/loginInFlightUiReachability.test.tsx
  - src/frontend/screens/Login/__tests__/index.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/StoresPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/navTabs.test.ts
  - src/frontend/components/UI/NavShell/__tests__/NavTabsComponent.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/FilterMoreGroup.test.tsx
  # Task 3: Rust, locales, meta gates, docs
  - src-tauri/src/main.rs
  - src-tauri/src/macos_epic_embed.rs
  - public/locales/*/translation.json   # every catalog carrying the 4 zoom keys (47 incl. en)
  - public/locales/*/gamepage.json      # every catalog carrying not_logged_in.zoom (47 incl. en; en staged by index surgery)
  - meta/i18nGlossary.json
  - meta/__tests__/i18nGlossary.test.ts
  - meta/__tests__/hardcodedStringGate.test.ts
  - meta/hardcodedStringGate.ts
  - meta/machineFillGamelib.ts
  - meta/__tests__/logSecretGate.test.ts
  - meta/deadcode-baseline-unreachable.txt
  - meta/i18nGateScope.json             # only if the regen produces a real diff
  - meta/i18nForkTouchedFiles.json      # only if the regen produces a real diff
  - meta/__tests__/genI18nGateScope.test.ts  # only if counts move
  - meta/i18nCatalogPresenceBaseline.json    # only if the rewrite produces a non-generatedAt diff
  - PRIVACY.md
  - .github/copilot-instructions.md

must_haves:
  truths:
    - "No Zoom Platform store code, type, IPC channel, route, login tile, setting, log entry, asset or store embed remains in src/, src-tauri/src/ or meta/; the only `zoom` hits left are UI-zoom ones (allowlisted below) and the named legacy-tolerance sites"
    - "Every UI-zoom feature still works: Accessibility zoom (zoomPercent/setZoomPercent/setZoomFactor), savedZoomBoot, storeEmbedZoom/--webview-zoom, libraryTileSize, the tauri webview-zoom capability. None of those files is modified"
    - "On sidecar boot, <userData>/zoom_store (which held the Zoom token .zoom.token, installed.json and config.json) and the Zoom cache files <userData>/store_cache/zoom_library.json and zoom_install_info.json are deleted once, in a best-effort, non-blocking way. A missing path is silent, a failure is logged and never thrown, and boot and sidecar exit are not delayed"
    - "A persisted storeFacet ['zoom','gog'] loads as ['gog']; a persisted experimentalFeatures.zoomPlatform=true is inert; a persisted download-queue element with runner 'zoom' is dropped at startup with a warning instead of crashing; a tray recent-game entry with runner 'zoom' falls back to the runner probe"
    - "pnpm codecheck, pnpm lint, the touched jest suites, pnpm lint-translations, the meta gates, pnpm smoke:sidecar and cargo check all pass"
    - "The user's unrelated uncommitted edit to public/locales/en/gamepage.json is still unstaged and byte-identical after the commit"
  artifacts:
    - path: "src/backend/sidecar/legacyZoomDataCleanup.ts"
      provides: "removeLegacyZoomData(userDataPath): Promise<void>, which never rejects"
      exports: ["removeLegacyZoomData", "LEGACY_ZOOM_PATHS"]
    - path: "src/backend/sidecar/__tests__/legacyZoomDataCleanup.test.ts"
      provides: "fake-userData (mkdtemp) tests: removes dir+token+cache files, ENOENT silent, failure logged not thrown"
    - path: "src/common/utils.ts"
      provides: "isRunner(value: unknown): value is Runner, derived from storeMap keys"
      exports: ["storeMap", "isRunner"]
  key_links:
    - from: "src/backend/sidecar/bootstrap.ts"
      to: "removeLegacyZoomData"
      via: "fire-and-forget call after initLogger(), guarded by a once-flag, not awaited before READY"
      pattern: "removeLegacyZoomData\\("
    - from: "src/backend/downloadmanager/downloadqueue.ts"
      to: "isRunner"
      via: "startup prune of queue/finished elements with an unknown runner"
      pattern: "isRunner\\("
    - from: "src/frontend/screens/Library/filterEngine.ts"
      to: "VALID_STORE_FACET_VALUES"
      via: "migrateStoreFacetSelection filters persisted values; 'zoom' no longer in the list"
      pattern: "VALID_STORE_FACET_VALUES"
---

<objective>
Remove the Zoom Platform store from GameLib end to end. The user said "there should be no zoom in
this codebase". GameLib inherited the store from Heroic, behind the off-by-default experimental
flag `zoomPlatform` ("Zoom Platform support (only Linux)"). Its Tauri-era auth channels
(`authZoom`/`getZoomUserInfo`/`logoutZoom`) were already DROPPED in 34.5 (D-02) and never
registered, so no Tauri build could sign in to Zoom.

Purpose: delete the dead store and its types, routes, UI, strings, gate entries and docs. Also
delete Zoom data an older build left on disk, and make every persisted value that can still say
`'zoom'` load safely.

Output: one code commit (Tasks 1 and 2) and one locales/gates/Rust/docs commit (Task 3), plus
`261029-toq-SUMMARY.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
Load `Skill("gamelib-conventions")` before starting. Three of its rules apply here: the sidecar
exit contract (Task 1 cleanup), fake-HOME isolation (smoke:sidecar is its named real-profile arm)
and the `<verify>` prettier rule.

## Classification: store hits vs UI-zoom hits (measured 2026-10-29)

A case-insensitive `zoom` grep over `src/ src-tauri/src/ meta/ public/locales/en/` returns 1124
lines:
- **Store (Zoom Platform): about 764 lines in 128 files.** These are removed. The count includes
  the 6 files in `storeManagers/zoom/` and the 2 en catalogs. Outside those trees there are also
  `PRIVACY.md` and `.github/copilot-instructions.md`, plus 47 non-en catalog pairs.
- **UI zoom: about 360 lines in 39 files. Do not touch these.** The executor must not modify
  these files or lines:
  - Whole files: `src/frontend/state/savedZoomBoot.ts`,
    `state/__tests__/savedZoomBoot.test.ts`, `state/__tests__/GlobalStateSavedZoomWiring.test.ts`,
    `screens/WebView/storeEmbedZoom.ts`, its test, `screens/WebView/useStoreEmbedHost.ts`, its
    test, `src/preload/api/tauriWindowChrome.ts`, `src/preload/__tests__/windowChrome.test.ts`,
    `screens/Accessibility/index.tsx` and `index.css`, `screens/Library/libraryTileSize.ts` and
    its test, `screens/Library/index.css`, `Library/components/FocusRowStrip/index.css` and its
    test, `Settings/sections/SystemInfo/index.scss` (CSS `zoom:` property),
    `assets/pause-icon.svg` (inkscape:zoom), `helpers/gamepad.ts` ("zoomed in"),
    `preload/__tests__/{tauriAttach,framelessRuntime,tauriTransport}.test.ts`,
    `backend/__tests__/capabilitiesDefault.test.ts`,
    `sidecar/__tests__/appShellImportGate.test.ts` (`setZoomFactor`),
    `meta/sdk/isteamhtmlsurface00{3,5}.manifest.json` (`flZoom`), `meta/i18nGateScope.json`,
    `meta/i18nForkTouchedFiles.json`, `meta/__tests__/genI18nGateScope.test.ts` (they list only
    savedZoomBoot.ts and storeEmbedZoom.ts), `src-tauri/capabilities/default.json`,
    `native/steam-bridge/generated/steam_api_shim.c`, and the `.claude/skills/*` UI-zoom notes.
  - Lines inside mixed files: `zoomPercent`, `setZoomPercent`, `zoomTimer`, `setZoomFactor`,
    `tauriSetZoomFactor` and `applySavedZoomAtBoot` in `frontend/types.ts`,
    `ContextProvider.tsx`, `GlobalState.tsx` (lines ~198, 561, 622-630, 1658-1671, 2310),
    `common/types/electron_store.ts:37`, `common/types/storePolicy.ts:96`,
    `common/types/ipc.ts:97`, `preload/api/misc.ts:12,72`,
    `sidecar/appShellFlowRegistration.ts:89`; `src-tauri/src/macos_epic_embed.rs:405`
    ("resize/zoom/fullscreen"); `public/locales/*/translation.json` `accessibility.zoom`
    ("Zoom", the Accessibility setting label).
  - One mixed comment needs rewording: `GlobalState.tsx` ~1663-1666 says `state.zoom (the Zoom
    Platform storefront)` and `state.zoomPercent` are unrelated. Keep the comment's UI-zoom
    meaning and drop the storefront clause, because `state.zoom` will no longer exist.

**UI-zoom allowlist regexes**, used by the end-state gate in Task 3:
- UIF (paths): `savedZoomBoot|SavedZoomWiring|storeEmbedZoom|useStoreEmbedHost|tauriWindowChrome|windowChrome\.test|/Accessibility/|libraryTileSize|screens/Library/index\.css|FocusRowStrip|SystemInfo/index\.scss|pause-icon\.svg|helpers/gamepad\.ts|tauriAttach\.test|framelessRuntime\.test|tauriTransport\.test|capabilitiesDefault\.test|appShellImportGate\.test|meta/sdk/|i18nGateScope\.json|i18nForkTouchedFiles\.json|genI18nGateScope\.test`
- UIL (lines): `zoomPercent|ZoomPercent|ZoomFactor|zoomFactor|zoomTimer|webview-zoom|setZoom\(|Accessibility zoom|accessibility setting|applySavedZoom|savedZoom|resize/zoom`

**Named legacy-tolerance sites.** These are the only store-meaning `zoom` references allowed to
remain. Each exists because `'zoom'` is a value on real users' disks:
`src/backend/sidecar/legacyZoomDataCleanup.ts` and its test, its call site in
`sidecar/bootstrap.ts`, the new unknown-runner case in `downloadmanager/__tests__/downloadqueue.test.ts`,
`screens/Library/__tests__/filterEngine.test.ts` (persisted facet / legacy storesFilters
migration), `common/__tests__/signInDismissal.test.ts` and `signInState.test.ts` (both prove a
persisted `'zoom'` is dropped; left unchanged), `screens/Library/__tests__/signInTracer.test.ts`
and `screens/Login/__tests__/loginOpenParam.test.ts` (an invalid `'zoom'` param is rejected; left
unchanged), and the new Rust tray test in `src-tauri/src/main.rs`.

## Decisions (state each in the SUMMARY)

- **DEC-1 on-disk data (user decision): delete it.** A new sidecar boot step removes
  `<userData>/zoom_store` recursively. The step is best-effort, runs once per boot, does not
  block and never throws. That folder held the Zoom token. `zoom/constants.ts` sets
  `tokenPath = join(userData, 'zoom_store', '.zoom.token')`, the same file commit `4f0b981e5`
  re-moded to 0600, so the token goes with the folder. The folder also held
  `zoomInstalledGamesStore` (`installed.json`) and `zoomConfigStore` (`config.json`), both
  `cwd: 'zoom_store'`. Zoom also wrote two CacheStore files OUTSIDE that folder:
  `<userData>/store_cache/zoom_library.json` and `<userData>/store_cache/zoom_install_info.json`
  (CacheStore uses `cwd: 'store_cache'`, name = file stem). The step deletes those too, because
  they are Zoom library data. Installed Zoom game files in user-chosen install directories are
  NOT touched. They are the user's games, not GameLib data, and no code path should guess at
  them. No "already cleaned" marker is needed: after the first success every later boot is
  three cheap ENOENT no-ops.
- **DEC-2 persisted config `experimentalFeatures.zoomPlatform`: tolerate it, no migration.**
  The `ExperimentalFeatures` type loses the key. `ExperimentalFeatures.tsx` renders from an
  explicit `FEATURES` array, and no other consumer reads the key after this plan, so a stale
  `true` is inert. A boot-time rewrite of the user's config file was rejected: it risks racing
  other config writes and buys nothing. Proof: the end-state grep finds no `zoomPlatform`
  reader.
- **DEC-3 persisted selections: sanitise on load.**
  - `storeFacet` (localStorage) goes through `migrateStoreFacetSelection`, which filters by
    `VALID_STORE_FACET_VALUES`. Removing `'zoom'` from that list drops it. A new test proves
    `["zoom","gog"]` loads as `['gog']`.
  - The legacy `storesFilters` mask is already discarded (D-02).
  - Sign-in dismissals and probe outcomes already drop `'zoom'`, and existing tests prove it.
  - Download queue: `libraryManagerMap[runner]` would throw on `'zoom'`. A startup prune drops
    such elements with a warning.
  - Tray recent games: Rust `TRAY_RUNNERS` drops `"zoom"`, so the existing filter at
    `main.rs:~735` turns it into `None` and the `trayResolveRunner` probe fallback applies. A
    new Rust test proves this.
  - Protocol URLs: `protocol.ts` `RUNNERS` zod enum already excludes zoom.
- **DEC-4 en catalogs: remove the keys by hand.** Do NOT run `pnpm i18n`.
  - In en `translation.json`, remove `login.zoom`, `setting.experimental_features.zoomPlatform`,
    `setting.log.descriptiveNames.zoom` and `zoom-store` (already orphaned: no `t()` caller).
  - Edit `emptyLibrary.noGames` to drop "or Zoom": "...with your Epic, GOG.com, Amazon, or
    Steam accounts...". Make the matching change to the `Trans` default in `EmptyLibrary`.
  - KEEP `accessibility.zoom` (UI zoom).
  - In en `gamepage.json`, remove `not_logged_in.zoom`. Stage it by index surgery so the user's
    unrelated uncommitted edit stays unstaged; the procedure is in Task 3. If the surgery
    cannot be verified, defer this one key and say so.
- **DEC-5 non-en catalogs: remove the same 5 keys from every catalog that carries them.** This
  follows `34a1e4e0f`, which removed `steam.bridge.steamstub.*` from all catalogs.
  - Measured: each key is present in 47 catalogs including en, so 46 non-en.
  - The removed key is the last in its object in many files. Counts: `login.zoom` 47/47,
    `zoomPlatform` 47/47, `descriptiveNames.zoom` 32/47, `zoom-store` 1/47,
    `not_logged_in.zoom` 45/47. So trailing-comma repair on the preceding line is required.
  - No non-en `emptyLibrary.noGames` mentions Zoom (measured: 0), so no translated prose changes.
  - The presence baseline covers only the `gamelib` namespace, so it should not move. It is
    still re-run per `5fbd769a4`.
- **DEC-6 i18n glossary: remove `ZOOM`, `ZOOM Platform`, `Zoom` from `meta/i18nGlossary.json`.**
  Remove them from its test too, and drop those tokens from the `rationale` prose lists. No
  store uses them now, and keeping `Zoom` would wrongly pin the translatable Accessibility
  word "Zoom" as do-not-translate.
- **DEC-7 tests.**
  - **Deleted whole file: `src/backend/storeManagers/zoom/__tests__/user.test.ts`.** Its only
    subject is the Zoom token's 0600 write in the deleted `zoom/user.ts`.
  - **Deleted cases (zoom-only subjects):**
    - `protocol.test.ts` "RUNNERS.options does not contain zoom" and its describe wrapper if it
      becomes empty. Keep the steam-inclusion case.
    - `oauthLoginCapture.test.ts` zoom li_token cases.
    - `runnerSliceRegistration.test.ts` "SEAM Invariant B" block, whose list is now empty, plus
      header item 7.
    - `runnerAuthFlows.test.ts` "none of the dropped zoom channels are registered" block.
    - `useTauriOAuthLogin.test.tsx` zoom-only `it`s (authZoom full-url, getZoomUserInfo
      done/non-done).
    - `TauriLoginPanel.test.tsx` zoom rows.
    - `oauthLoginOverlay.test.ts` "Zoom tile still carries loginUrl" and "Zoom tile carries NO
      busy" cases, plus the `not.toMatch(/'zoom'/)` line.
    - `navTabs.test.ts` zoom default-store cases.
    - `StoresPanel.test.tsx` "never renders a Zoom Store row".
    - `destinationCoverage.test.tsx` "Zoom Store" label case.
    - `storePolicy.test.ts` zoomConfigStore credential cases.
    - `StoreSearchScreen.test.tsx` `\bzoom\b` assertion line.
    - `filterEngine.test.ts` "store facet count for zoom". Re-point it to `'steam'` (a runner
      with no games).
    - `GlobalStateRefreshCacheGuard`/`ScopedRefresh`/`RefreshLibraryOrigin` zoom rows and
      fixture lines.
  - **Shared tests edited in place**: drop the zoom row, map key, mock entry or list element.
    For generic-behaviour tests that only used `'zoom'` as the runner (`useTauriOAuthLogin`
    mounts at ~724-882 and ~1161), switch to `'gog'`.
    - `storeChangeNotifier.test.ts` uses `zoomInstalledGamesStore` as a stand-in store; its
      comment says why it is NOT `gogInstalledGamesStore`. Substitute the closest remaining
      store with the same shape, keep the reasoning, and reword the comment.
    - `enrichmentFlows.test.ts` uses `authZoom` as the canonical UNPORTED channel. Substitute
      a channel name that is genuinely unregistered (a synthetic name is acceptable if the
      handler treats any unregistered name identically; read the handler to confirm) and keep
      the assertion.

## Interfaces the executor needs

From `src/common/types.ts:25-31`: `export type Runner = 'legendary' | 'gog' | 'sideload' | 'nile' | 'zoom' | 'steam'`.
Drop `'zoom'`. The same file re-exports `ZoomInstallPlatform`/`ZoomInstalledInfo`/`ZoomInstallInfo`
from `./types/zoom` at :15-18 and uses them in unions at ~:772 and ~:1140, so drop those
members too. `ExperimentalFeatures.zoomPlatform?` is at :121, and `runner:` literal union at :243.

From `src/common/utils.ts`: `export const storeMap: { [key in Runner]: string | undefined }`
(contains `zoom: 'zoom'`). `isRunner` is derived from it so the two can never diverge.

From `src/backend/storeManagers/index.ts`:
`export const libraryManagerMap = { sideload, gog, legendary, nile, zoom, steam } satisfies Record<Runner, LibraryManager>`.

From `src/backend/sidecar/bootstrap.ts`: the pattern to copy is `clearStrandedPlaytimeSyncLock()`
(~:410), a try/catch body that logs with `logWarning(..., LogPrefix.Backend)`, and its once-flag
call site `if (!playtimeLockClearInitialized) { playtimeLockClearInitialized = true; ... }` (~:1277).
`initLogger()` is at ~:799.

From `src/backend/downloadmanager/downloadqueue.ts`: `async function initQueue(isStartup = false)`
(~:121), `downloadManager.get('queue', [])` / `get('finished', [])`, and
`libraryManagerMap[element.params.runner].getGameInfo(...)` at ~:215 (the crash site for an
unknown runner).

From `src/frontend/screens/Library/filterEngine.ts:44`: `const VALID_STORE_FACET_VALUES: StoreFacetValue[]`
and `export function migrateStoreFacetSelection(rawNew, rawLegacy): StoreFacetValue[]` (~:646).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Remove Zoom from backend, common and preload; add the legacy data cleanup and unknown-runner queue prune</name>
  <files>All "Task 1" entries in files_modified (8 deletions, 2 creations, ~57 edits)</files>
  <behavior>
    - legacyZoomDataCleanup test 1: build a fake userData with mkdtemp (no HOME involved, no child process). Create `zoom_store/.zoom.token`, `zoom_store/installed.json`, `zoom_store/config.json`, `store_cache/zoom_library.json`, `store_cache/zoom_install_info.json` and an unrelated `store_cache/gog_library.json`. After `await removeLegacyZoomData(dir)`, the 3 zoom targets are gone, `gog_library.json` and `store_cache/` still exist, and logInfo was called once per removed target.
    - Test 2: on an empty fake userData the promise resolves, and logWarning and logError are never called (ENOENT is silent).
    - Test 3: inject an rm that rejects with EACCES for one target (via an optional deps parameter). The promise resolves (never rejects), logWarning is called once naming that path, and the other targets are still attempted.
    - Test 4: `LEGACY_ZOOM_PATHS` is exactly `['zoom_store', 'store_cache/zoom_library.json', 'store_cache/zoom_install_info.json']`, all relative. The test asserts every resolved target stays inside the userData dir.
    - downloadqueue test: a persisted queue `[{params:{runner:'zoom',...}}, {params:{runner:'gog',...}}]` plus a finished entry with runner 'zoom'. `initQueue(true)` never calls `libraryManagerMap.zoom`, leaves queue `[gog element]` and finished `[]`, and logs one warning.
  </behavior>
  <action>
1. **Cleanup module (DEC-1).** Write the tests first and see them fail. Then create `src/backend/sidecar/legacyZoomDataCleanup.ts`:
   - Export `LEGACY_ZOOM_PATHS` (the three relative paths above, readonly).
   - Export `removeLegacyZoomData(userDataPath: string, deps = { rm: fs.promises.rm }): Promise<void>`. For each path, `await deps.rm(join(userDataPath, rel), { recursive: true })` WITHOUT `force`, so success is observable. On success, call `logInfo` with `[legacyZoomDataCleanup] removed <path>` and `LogPrefix.Backend`. Ignore `code === 'ENOENT'` silently. On any other error, call `logWarning` and continue. Wrap the whole thing so the returned promise can never reject.
   - Header comment: why the data is deleted (user decision; the folder held the Zoom token, the token commit is 4f0b981e5); that installed games are not touched; and why this meets the sidecar exit contract. It creates no timer, watcher, socket or child handle. Its only in-flight work is three bounded local fs ops on the libuv threadpool, which finish in milliseconds and cannot outlive stdin EOF meaningfully (half 2: bounded, not unbounded).
2. **Wire it in `bootstrap.ts`.** Add `let legacyZoomCleanupInitialized = false`. After `initLogger()` (the module logs; logging before initLogger is invisible), add an `if (!flag) { flag = true; void removeLegacyZoomData(<userData>) }` block. Do NOT await it before READY. For `<userData>`, use whatever `getPath('userData')` source bootstrap.ts already imports (grep for it). Otherwise use `app.getPath('userData')` from `backend/platform`, which is the source `zoom/constants.ts` used. Before writing, confirm the CacheStore file naming (`store_cache/<name>.json`) against the "store path parity" block in `src/backend/__tests__/cache.test.ts`. If the naming differs, fix `LEGACY_ZOOM_PATHS` to match. If `bootstrapWirings.test.ts` pins boot call sites by source, add the new call there the same way.
3. **`isRunner` (DEC-3).** In `src/common/utils.ts`, remove `zoom` from `storeMap`. Add `export function isRunner(value: unknown): value is Runner`, which returns true when `typeof value === 'string'` and `Object.prototype.hasOwnProperty.call(storeMap, value)`.
4. **Queue prune (DEC-3).** In `downloadqueue.ts`, add an unexported `pruneUnknownRunnerElements()`. It filters `queue` and `finished` by `isRunner(element.params?.runner)`, writes back only the lists that changed, and logs one `logWarning` with the dropped count and appNames under `LogPrefix.DownloadManager`. Call it first thing in `initQueue` when `isStartup`. Add the downloadqueue test case.
5. **Delete** `src/backend/storeManagers/zoom/` (all 6 files), `src/common/types/zoom.ts` and `src/preload/api/zoom.ts`.
6. **Remove the Zoom code paths**:
   - `common/types.ts`: Runner member, Zoom type imports and union members, `zoomPlatform?`, and the `'zoom'` in the `runner:` literal union.
   - `common/types/ipc.ts`: `logoutZoom`, `getZoomUserInfo`, `authZoom`, and the zoom mentions in the :278-280 comment. KEEP `setZoomFactor`.
   - `common/types/oauthLogin.ts`: `OAuthRunner` becomes `'legendary' | 'gog' | 'nile'`.
   - `common/types/electron_store.ts`: `zoomInstalledGamesStore`, `zoomConfigStore`, `zoomSyncStore` and the `ZoomCredentials` import. KEEP `zoomPercent`.
   - `common/types/storePolicy.ts`: every zoom store entry, `'zoom_library'` and the header lines about them. KEEP `'zoomPercent'`.
   - `storeManagers/index.ts`: import and map entry.
   - `launcher.ts`: `case 'zoom'`.
   - `save_sync.ts`: `case 'zoom'`.
   - `utils.ts:441`: `'zoom'` in the `clearCache` param union.
   - `logger/constants.ts`: `LogPrefix.Zoom` and the `RunnerToLogPrefixMap` entry.
   - `wiki_game_info/umu/utils.ts`: the zoom entry.
   - `sidecar/storeRegistration.ts`: zoom electronStores import, the registrations, and the `zoomSyncStore` dead-entry comment block.
   - `sidecar/handlers.ts:269`: `'zoom_library'`.
   - `sidecar/oauthLoginCapture.ts`: zoom user agent, `case 'zoom'` and the zoom comments.
   - `sidecar/oauthLoginFlowRegistration.ts:46`: `'zoom'` in the known list.
   - `sidecar/appShellFlowRegistration.ts:620-638`: the tray runner list `'zoom'` and its comment. Do NOT touch line 89.
   - `sidecar/enrichmentFlowRegistration.ts:188`: `'zoom'`.
   - `preload/api/index.ts`: the Zoom import and spread.
7. **Reword comment-only mentions** so no store mention remains. Delete "Zoom" from enumerations like "Epic/GOG/Amazon/Zoom/Steam", and drop sentences that existed only to explain Zoom's absence. Files: `protocol.ts:18-19`, `installStallWatchdog.ts:13,40`, `humble/user.ts:70`, `platform/index.ts:13`, `shortcuts/shortcuts.ts:178`, `steamFlowRegistration.ts:41`, `keyringTokenStore.ts:34`, `runnerMiscFlowRegistration.ts:22-25,120-121`, `downloadQueueFlowRegistration.ts:27`, `sidecarTransport.ts:332`, `preload/api/misc.ts:190`.
8. **Backend tests (DEC-7).** Delete or edit the cases listed in DEC-7. Remove `Zoom: 'Zoom'` from every LogPrefix mock: electronUntouched, steamgridSecretStore, keyringTokenStore, humbleSecretStore, steam user/tokenStore, oauthLoginCapture. Remove `zoom:` manager doubles and list elements (ratingMap, gameDetailsModules, enrichmentFlows, gameDetailsFlows, epicOfflineMode, knownFixesFetcher row, storeLayer names). Reword comment-only mentions (skeletonFlows, depot, getDefaultLegendarySavePathRefresh).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/backend/sidecar/__tests__/legacyZoomDataCleanup.test.ts src/backend/downloadmanager/__tests__/downloadqueue.test.ts src/backend/__tests__ src/backend/sidecar/__tests__ src/backend/crossover_index src/backend/gamedetails src/backend/storeManagers src/common 2>&1 | tail -15 && npx tsc --noEmit 2>&1 | grep -E '^src/' | grep -v '^src/frontend/' ; test -z "$(npx tsc --noEmit 2>&1 | grep -E '^src/' | grep -v '^src/frontend/')" && npx prettier --check src/backend/sidecar/legacyZoomDataCleanup.ts src/backend/sidecar/__tests__/legacyZoomDataCleanup.test.ts $(git diff --name-only --diff-filter=M -- src/backend src/common src/preload)</automated>
  </verify>
  <done>
    - The 6 zoom store files, `common/types/zoom.ts` and `preload/api/zoom.ts` are deleted.
    - The cleanup and queue-prune tests pass, and the touched backend/common jest suites are green.
    - tsc reports zero errors outside `src/frontend/`. The frontend errors are expected until Task 2.
    - Prettier is clean over the exact files written. The `git diff --name-only` scoping covers only files this task modified; if a concurrent session has touched other files in those trees, replace it with the explicit Task 1 list.
    - No commit yet: Tasks 1 and 2 are committed together once codecheck is green.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove Zoom from the frontend and its tests; prove persisted 'zoom' facets are sanitised; commit code</name>
  <files>All "Task 2" entries in files_modified (1 deletion, ~55 edits)</files>
  <action>
1. **Delete** `src/frontend/assets/zoom-logo.svg`.
2. **Types and state**:
   - `frontend/types.ts`: the `'zoom'` in `Category` (:40) and `StoreFacetValue` (:487), the `zoom` context block (:128), and `StoresFilters.zoom` (:279). KEEP `zoomPercent`/`setZoomPercent`.
   - `ContextProvider.tsx`: the `zoom` default and `zoomPlatform: false`.
   - `GlobalState.tsx`: the zoom store imports (:38-40), `zoom` state type, `loadZoomLibrary`, the initial zoom state (:497-500), `zoomPlatform: false` (:593), the zoom part of `handleExperimentalFeatures` (it now sets only `experimentalFeatures`, so the WR-10 comment goes too), `zoomLogin`/`zoomLogout`, the zoom branches in the overrides/refresh/`includesZoom`/library-push/mount-time user checks (:1276-1278, 1298-1430, 1941-1955, 2010-2064), and the context value block (:2256-2261). Reword the 1663-1666 comment per the context note. Leave every UI-zoom line untouched.
   - `helpers/electronStores.ts`: the three zoom stores and their exports.
   - `helpers/library.ts`: `zoomCategories`.
3. **UI surfaces**:
   - StoreLogos: `case 'zoom'` and the ZoomLogo import.
   - `navTabs.ts`: the `zoom` session field and default-store branch, with comments.
   - NavTabs component: the zoom destructure and refresh condition.
   - ExperimentalFeatures.tsx: the `'zoomPlatform'` FEATURES entry, default and translation comment (DEC-2).
   - LogSettings: the zoom library concat, descriptive name, `zoom.enabled` log file entry and the deps entry.
   - StoreSearch comment.
   - WebView: the zoom `storeEmbedOrigins` entry; in `index.tsx`, `ZOOM_LOGIN_URL`, the `zoom` context, `/store/zoom` and `/loginweb/zoom` routes, `'zoom'` in the login-warning union and the zoom-platform URL branch; in `loginRoutes.ts`, `/loginweb/zoom` and `ZOOM_LOGIN_URL`; in `useTauriOAuthLogin.ts`, the zoom channel map entry, runner list entry, `case 'zoom'`, URL branch, authZoom/getZoomUserInfo branch and comments; the TauriLoginPanel zoom map entry and comment.
   - Discounts: the zoom library.
   - Library: in `index.tsx`, the zoom connected-store push, `showZoom`/`zoomLibrary`, deps and the `!zoom` guard at :1138; in `filterEngine.ts`, `'zoom'` in `VALID_STORE_FACET_VALUES` (DEC-3) and the :110-111 comment; the `facetLabels.ts` zoom entry; LibraryTour and EmptyLibrary zoom library terms. In the EmptyLibrary `Trans` default text, drop "or Zoom" exactly as DEC-4 words it, so the default matches the en catalog.
   - `ModifyInstallModal`: the Zoom type import and union members.
   - Login: in `index.tsx`, the ZoomLogo import, `zoomLoginPath`, the `zoom` context, the `isZoomLoggedIn` state and effect deps, and the zoom Runner tile; OAuthLogin: `OAuthOverlayRunner` becomes a plain alias of `OAuthRunner`, with the D-7 comment removed; Runner and LoginWarning: comments, the `'zoom'` union and the zoom branch.
   - ConsoleMode: the zoom library terms and the `{ key: 'zoom', label: 'ZOOM' }` filter.
4. **Frontend tests (DEC-7).** Delete or edit exactly the cases DEC-7 lists, and drop zoom fixture fields from every context/session mock. These include EmptyLibrary test, libraryTourAnchors (`it.each` list and mock), libraryHookStaleness dep list, connectedStoresParity, engineFilter, Runner test titles, loginInFlightUiReachability, Login index test, NavTabsComponent, destinationCoverage, StoresPanel, FilterMoreGroup comment, GlobalStateSteamCacheHydration comment, WebViewOAuthNavigation comment, loginRoutes, storeEmbedOrigins.
   - Add to `filterEngine.test.ts` `describe('migration')`: `migrateStoreFacetSelection('["zoom","gog"]', null)` returns `['gog']`, and `migrateStoreFacetSelection('["zoom"]', null)` returns `[]` (DEC-3).
   - The existing legacy all-true storesFilters case may keep `zoom: true` in its fixture: that is the real on-disk legacy shape.
5. Run `pnpm codecheck` and `pnpm lint`. Once both are green, commit Tasks 1 and 2 together. Stage ONLY explicit paths: `git rm` for the 9 deletions and `git add -- <each modified/created path from the Task 1 and Task 2 lists>`. Never use `git add -A` or `.`; another session may be committing. Message: `refactor(quick-261029-toq): remove the Zoom Platform store` with a body that lists DEC-1 and DEC-3, then the attribution line.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm lint && npx jest src/frontend 2>&1 | tail -15 && npx prettier --check $(git diff --name-only --diff-filter=AM HEAD~1 HEAD -- src)</automated>
  </verify>
  <done>
    - codecheck and lint pass, and `npx jest src/frontend` is green, including the new facet sanitisation cases.
    - The code commit contains exactly the Task 1 and Task 2 paths: `git show --stat HEAD` lists no stray files.
    - Prettier is clean over the committed src paths.
  </done>
</task>

<task type="auto">
  <name>Task 3: Rust tray/embed lists, locale catalogs, meta gates, docs; full gate battery; commit</name>
  <files>src-tauri/src/main.rs, src-tauri/src/macos_epic_embed.rs, public/locales/*/translation.json, public/locales/*/gamepage.json, meta/i18nGlossary.json, meta/__tests__/i18nGlossary.test.ts, meta/__tests__/hardcodedStringGate.test.ts, meta/hardcodedStringGate.ts, meta/machineFillGamelib.ts, meta/__tests__/logSecretGate.test.ts, meta/deadcode-baseline-unreachable.txt, (conditional) meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts, meta/i18nCatalogPresenceBaseline.json, PRIVACY.md, .github/copilot-instructions.md</files>
  <action>
1. **Rust.**
   - `main.rs`: remove `"zoom"` from `TRAY_RUNNERS` (:486), and rewrite the :483-485 doc comment so it says the list mirrors the TS `Runner` union.
   - Rewrite the `every_member_of_the_typescript_runner_union_survives_the_parse` comment (:14251) the same way.
   - Add a test `legacy_zoom_runner_falls_back_to_probe`: a payload `[{"appName":"x1","title":"T","runner":"zoom"}]` parsed by `tray_recent_games_from_value` keeps the entry with `runner == None` (DEC-3). Check the filter at ~:735 first. If it drops the whole entry instead, assert the behaviour that actually holds and record it.
   - Drop "Zoom" from the comment enumerations at :2405, :3535, :4914, :8344 and :8716.
   - `macos_epic_embed.rs:1204`: remove `"zoom"` from the test key list. Leave :405 alone (window zoom).
2. **Locales (DEC-4, DEC-5).**
   - First record the state: `git status --porcelain public/locales` must show only ` M public/locales/en/gamepage.json`. If any other path is dirty, stop and report.
   - Write a scratchpad Node script (not in the repo) that edits by LINE, the way `34a1e4e0f` did, so file formatting is preserved:
     - For each `public/locales/*/translation.json` and `gamepage.json` except en/gamepage.json, delete the exact key lines for `login.zoom`, `setting.experimental_features.zoomPlatform`, `setting.log.descriptiveNames.zoom`, `zoom-store` and `not_logged_in.zoom`. Locate each line by walking the parsed path, not by a bare `"zoom":` match: `accessibility.zoom` must survive.
     - When the deleted line was the last member of its object, strip the trailing comma from the preceding member line.
     - Then `JSON.parse` the result and deep-compare it with the original parse minus exactly those keys. Fail loudly on any mismatch.
     - Also apply the en/translation.json `emptyLibrary.noGames` text change.
     - Print the per-key removal and comma-repair counts. The expected removals are 47 each, with 46 for not_logged_in.zoom outside en/gamepage. Record them in the SUMMARY.
   - **en/gamepage.json index surgery (DEC-4).**
     1. Save `git diff public/locales/en/gamepage.json` to a scratchpad file. This is the user's change.
     2. Index side: take `git show HEAD:public/locales/en/gamepage.json`, apply the same line removal plus comma repair to the `not_logged_in.zoom` line (the preceding `"title"` line loses its comma), write it with `git hash-object -w --stdin`, and stage it with `git update-index --cacheinfo 100644,<sha>,public/locales/en/gamepage.json`.
     3. Working-tree side: apply the identical removal to the current file.
     4. Check: `git diff --cached public/locales/en/gamepage.json` shows ONLY the zoom line (and the comma change on the line before it), and `git diff public/locales/en/gamepage.json` is byte-identical to the saved user diff.
     If either check fails, restore the index with `git restore --staged public/locales/en/gamepage.json`, restore the working tree from the saved state, defer this one key, and say so in the SUMMARY.
   - Never run `pnpm i18n`.
3. **Meta gates.**
   - `i18nGlossary.json`: remove the `ZOOM`/`ZOOM Platform`/`Zoom` terms and drop those tokens from the `rationale` lists (DEC-6). Remove them from `i18nGlossary.test.ts` too, and re-pin any term count it asserts.
   - `hardcodedStringGate.test.ts`: remove `'ZOOM'`/`'Zoom'` from the glossary `it.each`, and change the ConsoleMode fixture `{ key: 'zoom', label: 'ZOOM' }` to `{ key: 'nile', label: 'Amazon' }`.
   - Comments: `hardcodedStringGate.ts:264` (drop `zoom` from the key list) and `machineFillGamelib.ts:458` (drop `Zoom` from the latent-trap list).
   - `logSecretGate.test.ts:434`: remove `'src/backend/storeManagers/zoom/games.ts'`.
   - `deadcode-baseline-unreachable.txt:145`: remove the `zoomCategories` line.
   - Run `pnpm gen-i18n-gate-scope`, then restore `generatedAt` in both outputs (`git diff` should then show only substantive changes). If membership changed, re-pin the counts in `genI18nGateScope.test.ts` and add a dated history entry, following `4e5d9d862`. If nothing changed, revert both files and record "no change".
   - Run `LINT_TRANSLATIONS_WRITE_BASELINE=1 pnpm lint-translations` (per `5fbd769a4`). If the only diff in `meta/i18nCatalogPresenceBaseline.json` is `generatedAt`, revert it and record "no change". Expect that outcome: the baseline is gamelib-namespace only.
   - Grep `meta/` for any other file that lists the deleted paths (`storeManagers/zoom`, `common/types/zoom`, `preload/api/zoom`, `zoom-logo`). That includes the fakeHomeIsolation, dialogStub, storeLayer and hardcodedStringGate allowlists. Fix any hit.
4. **Docs.**
   - `PRIVACY.md`: remove Zoom from the "Store sessions kept in files" sentence, the Zoom bullet, and the `Zoom Platform` table row. The GOG row is the widest, so the column widths do not change. Add one sentence to the config-folder paragraph: older versions kept a Zoom session in a `zoom_store` folder, and GameLib now deletes that folder, and its Zoom library caches, at startup.
   - `.github/copilot-instructions.md`: drop `zoom` from the runner lists (:29, :87) and delete the Zoom runner note (:31).
5. **End-state gate.** `grep -rniI zoom src src-tauri/src meta | grep -v -E "$UIF" | grep -v -E "$UIL"`, using the regexes from the context section. The output must contain only lines in the named legacy-tolerance files. Paste the residual list into the SUMMARY. Also `grep -rn zoomPlatform src` must be empty (DEC-2).
6. **Commit** with explicit paths only:
   - `git add --` each edited Rust, meta and doc path, plus the locale paths the script printed (it prints them; do not glob blindly).
   - en/gamepage.json is already staged by the index surgery. Do NOT `git add` it.
   - Before committing, run `git diff --cached --stat` and confirm the list.
   - Message: `chore(quick-261029-toq): drop Zoom strings, gate entries and docs`, with a body giving the key counts and the gamepage staging note, then the attribution line.
   - After the commit, re-check that `git diff public/locales/en/gamepage.json` still equals the saved user diff.
   - Note: `meta/__tests__/i18nCatalogChurnGuard.test.ts` "live tree" is red locally because of the user's pre-existing unstaged gamepage.json edit. That is not caused by this plan; do not "fix" it, and record it.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml tray_recent && pnpm codecheck && pnpm lint && pnpm lint-translations && npx jest meta src/backend/sidecar/__tests__/storeLayer.test.ts src/common 2>&1 | tail -20 && pnpm planning-gates && pnpm smoke:sidecar && npx prettier --check PRIVACY.md .github/copilot-instructions.md meta/__tests__/i18nGlossary.test.ts meta/__tests__/hardcodedStringGate.test.ts meta/hardcodedStringGate.ts meta/machineFillGamelib.ts meta/__tests__/logSecretGate.test.ts meta/i18nGlossary.json</automated>
  </verify>
  <done>
    - cargo check and the tray tests pass, including the new legacy zoom test.
    - codecheck, lint, lint-translations, the meta jest project, planning-gates and smoke:sidecar all pass. The only exception is the pre-existing churn-guard live-tree red, which comes from the user's edit and is recorded.
    - Prettier is clean over the doc and meta paths written. The `public/locales/**` files, `meta/deadcode-baseline-unreachable.txt` and the `.rs` files are prettier-ignored or have no parser. Confirm with `npx prettier --file-info` and record that; no check is run over them, because it would be vacuous.
    - The end-state grep leaves only the legacy-tolerance sites.
    - en/gamepage.json's user edit is still unstaged and byte-identical.
    - SUMMARY written, including hit counts, DEC-1..7, removal counts, gate outcomes and the residual list.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sidecar boot → user's filesystem | The new cleanup recursively deletes paths under userData without asking |
| persisted stores/localStorage → runtime | Values written by older builds (`'zoom'`) are read back into runner-keyed lookups |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-toq-01 | Tampering | legacyZoomDataCleanup | mitigate | Targets are three hardcoded relative constants joined to userData. No renderer or RPC input reaches them, and a test asserts every resolved target stays inside userData. fs.rm on a symlink removes the link, not the target. |
| T-toq-02 | Denial of service | sidecar boot/exit | mitigate | Fire-and-forget, never awaited before READY, never rejects, no handles created. Bounded fs ops only (exit-contract half 2). smoke:sidecar in the verify. |
| T-toq-03 | Information disclosure | `zoom_store/.zoom.token` | mitigate | The orphaned plaintext Zoom token is deleted on every install at the next boot, not left behind without code that owns it. |
| T-toq-04 | Denial of service | downloadqueue / tray | mitigate | Unknown-runner queue elements are pruned at startup, and Rust `TRAY_RUNNERS` filtering sends a legacy `zoom` recent entry to the probe fallback, so neither reaches `libraryManagerMap[undefined]`. |
| T-toq-05 | Repudiation | data deletion | accept | Each removal is logged via logInfo and disclosed in PRIVACY.md. No undo is offered: the user explicitly chose deletion, and the data serves no remaining code. |
</threat_model>

<verification>
- `pnpm codecheck`, `pnpm lint`, `npx jest` over every touched suite, `pnpm lint-translations`, the meta jest project, `pnpm planning-gates`, `pnpm smoke:sidecar` and `cargo check` (+ the tray test) all pass.
- The end-state grep leaves only the named legacy-tolerance sites, and `zoomPlatform` has no reader.
- The UI-zoom files listed in context are absent from both commits: `git show --stat HEAD~1 HEAD` contains none of them.
- `git diff public/locales/en/gamepage.json` after the commit equals the pre-task user diff.
</verification>

<success_criteria>
The Zoom Platform store is gone from code, types, UI, catalogs, gates and docs. Older installs
lose their Zoom data and token at the next boot, safely. Legacy `'zoom'` values load without
crashing. Every UI-zoom feature is untouched. All gates are green, and the user's uncommitted
locale edit is preserved unstaged.
</success_criteria>

<output>
Create `.planning/quick/261029-toq-remove-zoom-platform-store/261029-toq-SUMMARY.md` when done.
</output>
