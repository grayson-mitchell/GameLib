---
phase: quick-261026-b9r
plan: 01
status: complete
completed: 2026-10-26
commits:
  - 7df516164 feat: App Management probe, three IPC channels, exact-URL deep-link allowance
  - b1685e0ae feat: first-run WelcomeModal with CrossOver and App Management steps
  - 357e70864 feat: literal i18n keys for welcome status lines (also carries the staged todo moves)
  - 3d9c0e352 feat: welcome.* strings in all 49 gamelib catalogs; close both todos; IPC inventory
  - 54b28c1b1 fix: unexport internal-only symbols flagged by the dead-code gate
---

# Quick 261026-b9r: First-run welcome with macOS App Management step

First-run welcome dialog (replaces the changelog on the first ever launch only) with a store-login step, a macOS CrossOver / CodeWeavers support note, and a probe-driven macOS App Management step with deep link, live status and relaunch. Both source todos are closed.

## What shipped

- Backend `src/backend/appshell/appManagement.ts`: create-and-unlink probe inside the detected CrossOver bundle `Contents/` (EPERM -> denied, any other error incl. EACCES -> unknown, non-darwin or no CrossOver -> not-needed, success -> granted; failed unlink still granted with a warning). Dependency-injected, no timers or handles, nothing at import/boot.
- Channels: `getAppManagementStatus` (invoke), `openAppManagementSettings` (send, no args, opens only the constant, mac-only), `relaunchApp` (send, `app.relaunch(); app.quit()` pair as `resetHeroic`). Registered in `appShellFlowRegistration.ts` (census now 10 invoke + 14 send, docstring "24"), typed in `ipc.ts`, exposed in `preload/api/misc.ts`.
- Rust `main.rs`: `OPEN_EXTERNAL_ALLOWED_EXACT_URLS` allows only the byte-exact Privacy_AppBundles URL; the `x-apple.systempreferences` scheme is NOT in the scheme list. New Rust test pins accept/reject cases.
- Frontend `WelcomeModal` (+ `welcomeState.ts`, scss): probes on mount, window focus, `visibilitychange` (visible), and "Check again", mac only (no probe elsewhere); relaunch note and "Relaunch GameLib" after granted; unknown shows the settings path. CrossOver wording says "please support CodeWeavers by buying CrossOver" and never claims GameLib installs or sets it up; a "not found on this Mac" line shows when CrossOver is absent.
- `HeroicVersion` shows the welcome instead of the changelog on first run; dismissal writes `gamelib_welcome_seen` and calls `setLastChangelogShown(heroicVersion)`.
- i18n: 19 `welcome.*` keys in all 49 `gamelib.json` (48 hand-filled) plus 48 `gamelib.mt.json` stamps. "App Management" is kept in English in quotes in every locale (the Apple pane name was not verified per locale); System Settings / Privacy & Security were translated.
- `.planning/IPC-PORT-INVENTORY.md`: three new channels added to the app-shell bucket (Unique 223 -> 226, Ported 68 -> 71, header 34 -> 37). Needed because `planning-gates` (preload-surface-gate) went red on the new preload channels.
- Both todos moved to `.planning/todos/completed/` with closing notes.

## Decisions and notes requested by the orchestrator

- **First-run signal:** `isFirstRun` is true only when all of `gamelib_welcome_seen`, `last_version` and `last_changelog` are absent (`null`, `''`, and the literal `'null'` count as absent). `last_version` is written by HeroicVersion on every launch since the Heroic fork and is read at module load before the version effect overwrites it, so it is the most reliable "has run before" evidence; `last_changelog` is an independent second witness. Upgrades always carry `last_version`, so they keep the changelog.
- **Electron-era localStorage residual risk:** a pre-Tauri (Electron-era) install whose webview localStorage did not carry over would look like a first run and see the welcome once. Accepted; recorded in `welcomeState.ts`.
- **Pre-install gate follow-up (out of scope per CONTEXT Placement):** a gate before `cxbottle --create` (steam/bottle.ts) is not built. A user who dismisses the welcome without granting can still meet the macOS "prevented from modifying apps" prompt mid-install. Recorded in the closed todo; file a follow-up todo if wanted (needs `severity:`, `platform:`, `ready:` frontmatter).
- **Settings status row:** skipped. It was optional (CONTEXT Claude's Discretion) and would add a new settings surface plus more strings across 49 locales. The welcome is shown once, so a user who dismissed it has no way back to the App Management step short of the mid-install prompt; a Settings row is the natural follow-up.
- **Task 2 test harness:** `HeroicVersion.test.tsx` now re-requires the component per scenario inside `jest.isolateModules` with seeded storage (first-run is decided at module load). The storage mock uses plain functions, not `jest.fn()`, because the jest config resets mock implementations between tests.

## Verification run (exact commands, results)

- `pnpm jest src/backend/appshell/__tests__/appManagement.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/backend/sidecar/__tests__/appShellFlows.test.ts` : pass (146 incl. appshellModules).
- `pnpm jest src/frontend/components/UI/WelcomeModal src/frontend/components/UI/NavShell/__tests__/HeroicVersion.test.tsx` : pass (16).
- `pnpm jest src/backend/appshell src/backend/sidecar/__tests__/appShellFlows.test.ts src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts src/frontend/components/UI` : 1018 passed (final state).
- `pnpm codecheck` : pass (run after each task and after the final fix).
- `cargo test --manifest-path src-tauri/Cargo.toml open_external_scheme_check` : 9 passed. `rustfmt --check --edition 2021 src-tauri/src/main.rs` : clean.
- `npx prettier --check` over every non-ignored path written (scoped, `--file-info` checked first) : pass. `public/locales/` and `.planning/` are prettier-ignored, so no check there.
- `pnpm jest meta/__tests__/gamelibCatalogParity.test.ts meta/__tests__/lintTranslations.test.ts meta/__tests__/i18nGlossary.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts` : 269 passed. `pnpm lint-translations:gamelib` : 0 hard failures, 0 findings for `gamelib.welcome.*` (the 1152 findings are pre-existing). `pnpm i18n-churn-guard` : clean. `pnpm planning-gates` : 12/12 (after the inventory edit was committed).
- Translation validation: real `validateTranslation()` from `meta/machineFillGamelib.ts` over 912 (locale, key) pairs, 0 problems; sabotage control (no glossary/placeholders) returned 6 problems, so the run was not vacuous. `pnpm machine-fill-gamelib` was not run: `ANTHROPIC_API_KEY` is not set in this environment, so all 48 locales were hand-authored (51-04 fallback).
- `pnpm lint`: **fails, not from this work.** `lint:tests` reports 2 errors (`no-regex-spaces` in `steam/bridge/__tests__/helperIntegration.test.ts`) and 652 warnings against a cap of 648; `lint:src` is 0 errors. No eslint output was attributable to any file this plan touched (checked per-file; the one `no-require-imports` disable in `HeroicVersion.test.tsx` is needed by plain eslint and reported unused by the scoped config, a warning only).
- Full `pnpm jest` run: 4 suites / 6 tests failed, all unrelated to this plan and not fixed (scope boundary): `sidecar/__tests__/testContainment.test.ts` (unclassified `steamNativeInstallDefault.test.ts`), `tools/__tests__/dxvkInstallRemove.test.ts`, `meta/__tests__/machineFillGamelib.test.ts` (`pluralCategoriesFor`), `meta/__tests__/genI18nGateScope.test.ts` (A-17 anti-rot), plus `meta/__tests__/findDeadcode.test.ts` (3 other new findings: `RustNotificationBackendLabel`, `delayImportPe.ts` types, `CrossoverInstallRisk`). My own dead-code findings (`APP_MANAGEMENT_PROBE_NAME`, `AppManagementDeps`, `AppManagementView`) were fixed by un-exporting.
- `genI18nGateScope` A-17 anti-rot: `meta/i18nForkTouchedFiles.json` is stale. My two WelcomeModal files are among the missing entries, together with others from earlier work (`resolveBootLanguage.ts`, `SteamBridgeRouteNotice.tsx`, ...). I regenerated once, saw the sibling tests (hard-coded 258-file counts) go red too, and reverted. Whoever owns that ratchet should regenerate and update its counts in one change.
- `graphify update .` run after the code changes.

## Deviations from plan

1. **[Rule 3 - Blocking] IPC-PORT-INVENTORY.md edited.** `planning-gates` failed (preload-surface-gate) because the three new preload channels were in no bucket. Added them to the app-shell bucket with the precedent's count arithmetic (not in the plan's file list).
2. **[Rule 1] Status text uses literal `t()` keys.** The first draft passed `view.statusKey` dynamically, which hides keys from extractors and gave the key as the English default. Replaced by three literal calls; the `notNeeded` key was dropped from the catalogs (that state shows no status line).
3. **Commit hygiene.** The todo `git mv` renames were already staged when the second commit ran, so commit `357e70864` (the status-key change) also carries the todo moves; `3d9c0e352` carries the catalogs, inventory and closing notes.
4. Hook note: the pre-commit hook ran `pnpm install` / helper-binary download on commit; harmless, no files changed.

## Known Stubs

None.

## Threat Flags

None beyond the plan's register. T-b9r-01..05 are implemented as written (exact-URL allowance, no-arg open channel, fixed probe name + immediate unlink, error-code-only logging).

## Self-Check: PASSED

Verified present: `src/backend/appshell/appManagement.ts`, `src/frontend/components/UI/WelcomeModal/{index.tsx,welcomeState.ts,index.scss}`, both todos in `.planning/todos/completed/`, and commits 7df516164, b1685e0ae, 357e70864, 3d9c0e352, 54b28c1b1 in `git log`.
