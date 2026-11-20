---
phase: quick-261104-unp
plan: 01
status: complete
note: Tasks 1-2 done; Task 3 live check on macOS approved by the user 2026-11-04
commits: [45f24f66f, 3cd2f5be7]
---

# Quick 261104-unp: Regroup game settings into Run and Advanced

The Other tab is gone. A Run tab (always shown, every platform, per-game and Default) holds the everyday launch choices; Advanced keeps the plumbing.

## What changed
- `GamesSettings/index.tsx`: Run panel (LaunchOptionSelector, LauncherArgs, PreferedLanguage, OfflineMode, ShowFPS, Mangohud, GameMode, NvidiaPrime, SteamOverlayOverride); Advanced panel (AlternativeExe, scripts, Wrappers, EnvVariables, VerboseLogs, IgnoreGameUpdates, PreferSystemLibs, BattlEye/EAC).
- One `showStatsOverlay` gate replaces `isMacNativeStatsOverlayTitle` and the Other-tab visibility gate (261104-uas rules preserved).
- `getStartingTab` returns only `wine` (where it did before) or `run`. A saved `other` tab maps to `run`.
- New `runAdvancedTabs.test.ts` (replaces `nativeMacStatsOverlay.test.ts`); `steamEnginePlacement.test.ts` updated.
- `gamelib.json`: `settings.navbar.run = "Run"`.

## Verification
- RED seen first (9 of 10 failed). GamesSettings tests + hardcodedStringGate + i18nCatalogChurnGuard: 4 suites, 208 tests pass. `tsc --noEmit` clean. Scoped prettier clean. `pnpm i18n` + `pnpm i18n-churn-guard` clean, gamelib-only churn.

## Decisions
- `settings.navbar.other` stays in translation.json as an unused upstream key. The churn guard forbids edits to non-gamelib catalogues and the parser runs with keepRemoved, so retiring it is not allowed.
- The label uses the `gamelib:` namespace for the same reason.

## Deviations
- [Rule 1] Stale pointer: the Steam overlay exit message said "Advanced > Steam overlay"; the control moved to Run. Fixed in `steam/games.ts` (message + comment) and `gamelib.json` (commit 3cd2f5be7). `launcher.ts:206` ("Advanced tab > Enable verbose logs") remains correct.
- The `git rm` of `nativeMacStatsOverlay.test.ts` was staged by me but got swept into a concurrent commit (947682764, "docs(phase-60) ... threat verification"), not into 45f24f66f. The deletion is in history either way.

## Pending
Task 3 live check on macOS (see checkpoint steps).

## Live check
Approved by the user on 2026-11-04 (Task 3 steps 1-6). Note: nativeMacStatsOverlay.test.ts deletion landed in concurrent commit 947682764, not 45f24f66f.
