---
status: complete
quick_id: 261029-toq
commits:
  - 5b861e63d  # feat: backend/common/preload/frontend removal + legacy cleanup + queue prune (119 files)
  - 7535b9538  # chore: Rust tray list, 47 locale catalogs, meta gates, docs (108 files)
completed: 2026-10-29
---

# Quick 261029-toq: Remove the Zoom Platform store - Summary

The Zoom Platform store is gone from `src/`, `src-tauri/src/`, `meta/`, the 47 locale catalogs and the docs. A new sidecar boot step deletes the data an older build left on disk, and persisted `'zoom'` values load without crashing.

## Commits

| Commit | Message | Files |
| --- | --- | --- |
| `5b861e63d` | feat(quick-261029-toq): remove the Zoom Platform store from backend, common, preload and frontend | 119 |
| `7535b9538` | chore(quick-261029-toq): drop Zoom strings, gate entries and docs | 108 |

Both commits are code and catalogs only. SUMMARY, STATE and PLAN are not committed. ROADMAP is not touched.

## Deleted

- Files (9): `src/backend/storeManagers/zoom/{constants,electronStores,games,library,user}.ts`, `src/backend/storeManagers/zoom/__tests__/user.test.ts`, `src/common/types/zoom.ts`, `src/preload/api/zoom.ts`, `src/frontend/assets/zoom-logo.svg`.
- Tests (cases, as DEC-7 named):
  - `protocol.test.ts` "RUNNERS.options does not contain zoom".
  - `oauthLoginCapture.test.ts` two zoom li_token cases.
  - `runnerSliceRegistration.test.ts` Describe 7 "SEAM Invariant B" plus header item 7.
  - `runnerAuthFlows.test.ts` "none of the dropped zoom channels are registered" block.
  - `useTauriOAuthLogin.test.tsx` three zoom-only `it`s.
  - `TauriLoginPanel.test.tsx` zoom rows.
  - `oauthLoginOverlay.test.ts` two Zoom-tile cases plus the `not.toMatch(/'zoom'/)` line.
  - `navTabs.test.ts` two zoom default-store cases.
  - `StoresPanel.test.tsx` "never renders a Zoom Store row".
  - `destinationCoverage.test.tsx` "Zoom Store" label case.
  - `storePolicy.test.ts` zoomConfigStore credential cases.
  - `StoreSearchScreen.test.tsx` the `\bzoom\b` assertion line.
  - `GlobalStateRefreshCacheGuard`, `ScopedRefresh` and `RefreshLibraryOrigin` zoom rows and fixture lines.
  - `filterEngine.test.ts` "store facet count for zoom" was re-pointed to `'steam'`, not deleted.

## Added

- `src/backend/sidecar/legacyZoomDataCleanup.ts` and its test (4 cases).
- `isRunner()` in `src/common/utils.ts`, derived from `storeMap` keys.
- `pruneUnknownRunnerElements()` in `downloadqueue.ts` plus a test.
- `filterEngine.test.ts` case: `["zoom","gog"]` loads as `['gog']`, and `["zoom"]` loads as `[]`.
- Rust test `legacy_zoom_runner_falls_back_to_probe`.

## Decisions (as executed)

- **DEC-1:** `removeLegacyZoomData(userData)` removes `zoom_store`, `store_cache/zoom_library.json` and `store_cache/zoom_install_info.json`. It uses `fs.rm` without `force`, so a real removal is observable. ENOENT is silent, other errors are `logWarning`ed, and the function never rejects.
  - It is called fire-and-forget (`void`) from `bootstrap.ts` after `initLogger()`, behind a once-flag. It is not awaited before READY.
  - `store_cache/<name>.json` naming was checked against `cache.ts` and the `cache.test.ts` "store path parity" block.
  - It creates no timer, watcher, socket or child handle. `pnpm smoke:sidecar` PASSES (built, READY, exit 0 on stdin EOF).
  - Installed Zoom game files are not touched.
- **DEC-2:** `experimentalFeatures.zoomPlatform` is tolerated and not migrated. `grep -rn zoomPlatform src` is empty, so a stale `true` is inert.
- **DEC-3:** Persisted `'zoom'` is handled in four places.
  - `storeFacet` is sanitised by removing `'zoom'` from `VALID_STORE_FACET_VALUES`.
  - Download-queue elements with an unknown runner are pruned at startup with one warning.
  - Rust `TRAY_RUNNERS` drops `"zoom"`. A legacy tray entry is kept with `runner: None` and takes the probe fallback, which the new Rust test proves.
  - Protocol URLs were already excluded by the `RUNNERS` enum.
- **DEC-4 and DEC-5:** Catalog keys were removed line-wise by a scratchpad script, with a deep compare of the parsed result against the original minus exactly those keys. Nothing was written without that match. `pnpm i18n` was not run.
  - Removed counts: `login.zoom` 47, `setting.experimental_features.zoomPlatform` 47, `setting.log.descriptiveNames.zoom` 47, `zoom-store` 47, `not_logged_in.zoom` 47 (46 non-en plus en/gamepage). Comma repairs on the preceding line: 171 across the 93 bulk-edited files, plus 1 for en/gamepage.
  - These counts differ from the plan's estimates. The plan said `descriptiveNames.zoom` was in 32/47 catalogs and `zoom-store` in 1/47. Measured: both were in 47/47.
  - `accessibility.zoom` is kept. The en `emptyLibrary.noGames` and the `Trans` default now read "...Amazon, or Steam accounts...".
- **en/gamepage.json staging:** index surgery worked as planned. The staged diff is only the `not_logged_in.zoom` line plus the comma change on `"title"`. The unstaged diff equals the saved user diff, apart from hunk offsets that shifted by -1 after the staged removal. This was re-checked after the commit.
- **DEC-6:** Glossary terms `ZOOM`, `ZOOM Platform` and `Zoom` are removed from `meta/i18nGlossary.json`, its test and the rationale prose.
- **DEC-7:** Done as listed. The two substitutions were `storeChangeNotifier.test.ts` and `enrichmentFlows.test.ts`.
  - `storeChangeNotifier.test.ts`: `zoomInstalledGamesStore` became `fontsStore`. That store has no production construction site, so the WR-08 duplicate-registration trap cannot fire.
  - `enrichmentFlows.test.ts`: `authZoom` became the synthetic channel `neverRegisteredChannel`. `sidecarRpc.ts` answers any channel with no handler with `UNPORTED_CHANNEL_MARKER`.

## Deviations from Plan

1. **[Rule 3] `electronUntouched.test.ts` is byte-pinned.** Two gates (`appShellImportGate` Gate 6, `gameDetailsImportGate` Gate 8) hash it against HEAD. I reverted my one-line `Zoom: 'Zoom'` LogPrefix-mock removal there. The extra mock key is harmless. It is the one remaining test-side `Zoom` token outside the named legacy sites.
2. **[Rule 3] `testContainment.test.ts`** has to classify every `*.test.ts` in `sidecar/__tests__`. I added `legacyZoomDataCleanup.test.ts` to the structurally-contained list.
3. **[Rule 3] Meta count re-pins** the plan anticipated only vaguely:
   - `logSecretGate` exemptions 14 to 13. The deleted `zoom/games.ts` held one.
   - `facetLabels` exempted count 16 to 15. The ZOOM Platform glossary literal is gone.
   - `genI18nGateScope`: removing Zoom edited `ModifyInstallModal/index.tsx` and `ExperimentalFeatures.tsx`, making them fork-touched, so fork-touched went 291 to 293. Both audited zero violations with `scanScope({extraFiles})` and were inserted into `i18nGateScope.json` sorted, so scope went 245 to 247. A history entry is added. `generatedAt` was restored in `i18nForkTouchedFiles.json`.
4. **[Rule 3] Frontend count pins re-measured.** Login tile counts 6 to 5, `LOGIN_PATHNAMES` 7 to 6, embed origins 18 to 15 pairs, `makeLibrary` reads 12 to 9.
5. Commit type: `feat`/`chore` per the executor's instructions. The plan text said `refactor` for commit 1.
6. The plan's verify command `cargo test ... tray_recent` matches 0 tests. I ran the new test and the two neighbouring tray tests by name instead. All pass.
7. `meta/i18nCatalogPresenceBaseline.json`: regen produced a `generatedAt`-only diff, so it was reverted. No change.
8. `prettier --write` was applied to the 110 touched or created `src/` files. Everything is clean now.

## Verification

| Gate | Result |
| --- | --- |
| `pnpm codecheck` | pass |
| `pnpm lint` | 0 errors. Warnings are pre-existing. No unused-vars findings in touched files. |
| `jest src/backend src/common src/preload` | all pass except the pre-existing failures below |
| `jest src/frontend` | all pass except `steamInstallOptionsEntry` C3 (known) |
| `jest meta src/common storeLayer` | 2406 pass. 2 fail, both pre-existing (below). |
| `pnpm lint-translations` | 0 hard failures |
| `pnpm planning-gates` | 12/12 |
| `pnpm smoke:sidecar` | PASS |
| `cargo check`, `cargo test legacy_zoom` | pass |

Pre-existing failures, not caused here:
- `steamInstallOptionsEntry.test.ts` C3.
- `i18nCatalogChurnGuard` "live tree". It reports the whole-catalog working-tree churn, and the user's gamepage.json edit is still unstaged.
- `findDeadcode` "exits 0 against the real repo". It lists 9 used-in-module findings in macArch, steam, `signInIdentityResync` and `librarySort`. A diff against a clean HEAD worktree showed the identical list, so none are from this task.
- `steamFlows.test.ts` Test C, `skeletonFlows.test.ts` Test 2 and `getDefaultLegendarySavePathRefresh.test.ts`. All three also fail on a clean HEAD worktree (openExternal and `app.getAppPath` mock issues).
- `dxvkInstallRemove` and `sharedRedistInstall` failed once in a loaded full run and passed in isolation. They are timing flakes.

## End-state grep residual

Run with the plan's UIF and UIL regexes (`grep -rniI zoom src src-tauri/src meta`). Only these remain, all legacy-tolerance or pinned:
- `src/backend/sidecar/legacyZoomDataCleanup.ts` and its test.
- The call site in `sidecar/bootstrap.ts`.
- `testContainment.test.ts` (one classification entry).
- `downloadmanager/downloadqueue.ts` (a doc comment on the prune) and the new unknown-runner case in `downloadqueue.test.ts`.
- `filterEngine.test.ts`, `signInDismissal.test.ts`, `signInState.test.ts`, `signInTracer.test.ts` and `loginOpenParam.test.ts` (persisted or invalid `'zoom'` is rejected).
- `electronUntouched.test.ts` (byte-pinned mock key, deviation 1).
- `src-tauri/src/main.rs`: the new tray test plus the `TRAY_RUNNERS` doc comment.

`grep -rn zoomPlatform src` is empty. No UI-zoom file appears in either commit.

## Live checks still needed

The user must restart `tauri dev` first. Dev does not rebuild the sidecar, so check that `sidecar.js` mtime is fresh.
1. Take a profile with `<userData>/zoom_store/` and `store_cache/zoom_library.json`. After one boot, confirm they are gone. Also confirm the log shows `[legacyZoomDataCleanup] removed ...`, and that the app exits cleanly when the window is closed.
2. Put an element with `runner: 'zoom'` in the persisted download queue. Confirm the app starts and the log has one "Dropped N persisted download element(s) with an unknown runner" warning.
3. Set `localStorage.storeFacet` to `["zoom","gog"]`. Confirm the Library loads with only GOG selected.
4. Confirm Accessibility zoom still works (slider, relaunch re-applies), the Login screen shows five tiles, Settings, Experimental shows two toggles, and the empty-library text no longer mentions Zoom.

## Self-Check: PASSED

Both commits exist in history (`5b861e63d` is an ancestor of HEAD `7535b9538`). The new files exist. The 9 deletions are in the first commit. The user's gamepage.json diff is unstaged and equal to the saved copy.
