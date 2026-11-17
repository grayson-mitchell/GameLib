---
quick_id: 261117-q1t
status: complete
date: 2026-11-17
commits: [61d80ed3b, d8d53ef42, 87b84e949]
live_gate: owed
---

# Quick 261117-q1t: Launch without Steam as a per-game setting

Reworks 261117-p38 to match the operator's intent: launch any game with the Steam app not
running, the same way Epic's offline launch works. Before, the option only appeared for games
with no Steam API and no DRM, as a sub-menu button.

The executor did not write this file. The orchestrator wrote it from the executor's report.

## What changed

- **Setting.** A new per-game key, `launchWithoutSteam?: boolean`, in `GameSettings`,
  `settingsSchema.ts` and the settingsParity fixture. It is separate from Epic's `offlineMode`,
  because the launcher forces `offlineMode` on whenever the network is down.
- **Toggle.**
  - `Settings/components/LaunchWithoutSteam.tsx` sits in the run tab, before
    `SteamOverlayOverride`, and is gated by `isMacSteamTitle`.
  - State comes from the kept `steamDirectLaunchVerdict` channel. A pure function,
    `describeLaunchWithoutSteamControl`, picks one of: hidden; disabled with a DRM badge; or the
    toggle, with or without a yellow warning.
- **Verdict.**
  - Shape is now `{applies:true, kind, warning:'none'|'steam-api'|'unknown', launch}` or
    `{applies:false, reason}`.
  - Steam DRM (SteamStub, or the curated CEG list) is the only game-level reason that blocks it.
  - Steam-API games and games that could not be read are allowed, with a warning.
  - The cache record is now v2. Results of "unknown" are not cached.
- **Play.**
  - `launchDispatch.ts` checks `getSettings().launchWithoutSteam === true`. If reading the
    settings fails, it warns and uses the Steam launch.
  - These cases fall back to `steamGame.launch()` and log the reason, so the launch never fails
    because of the setting:
    - DRM is found;
    - the route or host is unsupported;
    - the game is not installed;
    - a Mac-native game has no binary;
    - a bridge launch refuses because of DRM it found late.
  - A failure to start the process still raises a notice.
- **Removed.**
  - `SteamDirectLaunchButton.tsx` and its confirm dialog. The deletion landed in another
    session's commit `2b2d34ddd`, which swept the staged change.
  - The `steamLaunchWithoutSteam` channel, plus its Rust contract, preload and registration
    entries, the census counts, and the IPC inventory row.
  - The `mode` parameter of `dispatchSteamLaunch`.
- **i18n.**
  - Added `warning` and `drmBadge`, and dropped the strings only the confirm dialog used.
  - All 48 locales were filled: 96 pairs, 0 validation failures. The record is
    `261117-q1t-i18n-fill.json`.
- **Boundary.** Nothing writes, copies or emulates steam_api. The `directLaunch/` folder has no
  file-writing calls.

## Tests and gates

- **Passed:**
  - Steam, sidecar, Settings, moduleStateCensus and themeTokens suites: 218 suites / 5743 tests,
    then 158 suites / 4037 tests.
  - `pnpm codecheck`, `check:ipc-contract`, `lintTranslations`, `machineFillGamelib` and
    `i18n-churn-guard`.
- **Late-DRM bridge fallback.** A test checks that `steamGame.launch()` runs once, and only after
  the bridge launch is no longer in flight.
- **Already failing before this task:**
  - `find-deadcode` (`BoundedOutputCapture`, from `4234aa0da`).
  - `genI18nGateScope` on the working tree, because of another session's uncommitted
    `meta/i18nGateScope.json` edit.
  - The `planning-gates` STATE anchor.

## Owed

The operator's live check has not been run. Its 7 steps are in
`.planning/todos/completed/2026-11-07-launch-steam-games-without-steam.md`.
