---
phase: quick-260710-lmo
plan: 01
subsystem: ui
tags: [i18n, react, rebrand, locale, settings]

# Dependency graph
requires: []
provides:
  - All en-locale display copy and JSX default fallback strings say "GameLib" instead of "Heroic"
  - Two factual corrections: customCSS warning path (~/.config/GameLib/config.json) and hide-window-on-protocol-launch (gamelib:// links)
  - WineVersionSelector stale Linux help paths corrected (~/.config/GameLib/tools/{wine,proton})
  - CrossoverBottle default bottle name is now 'GameLib' for new Crossover setups
  - ThemeSelector "Old School Heroic" renamed to "Old School GameLib"
affects: [settings-ui, tours, login-warnings, wine-manager]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Locale value edits kept strictly separate from i18n keys — every preserved key (box.reset-heroic, descriptiveNames.heroic, heroicVersion, etc.) still resolves to a GameLib-branded value"

key-files:
  created: []
  modified:
    - public/locales/en/translation.json
    - public/locales/en/gamepage.json
    - src/frontend/screens/Settings/index.tsx
    - src/frontend/screens/Settings/sections/LogSettings/index.tsx
    - src/frontend/screens/Settings/components/MinimizeOnGameLaunch.tsx
    - src/frontend/screens/Settings/components/AnalyticsDialog.tsx
    - src/frontend/screens/Settings/components/ShowValveProton.tsx
    - src/frontend/screens/Settings/components/DownloadProtonToSteam.tsx
    - src/frontend/screens/Settings/components/CheckUpdatesOnStartup.tsx
    - src/frontend/screens/Settings/components/DefaultSteamPath.tsx
    - src/frontend/screens/Settings/components/AnalyticsOptIn.tsx
    - src/frontend/screens/Settings/components/DisableController.tsx
    - src/frontend/screens/Settings/components/HideWindowOnProtocolLaunch.tsx
    - src/frontend/screens/Settings/components/PreferedLanguage.tsx
    - src/frontend/screens/Settings/components/CustomCSS.tsx
    - src/frontend/screens/Settings/components/Gamescope.tsx
    - src/frontend/screens/Settings/components/CrossoverBottle.tsx
    - src/frontend/screens/Settings/components/WineVersionSelector.tsx
    - src/frontend/screens/WebView/index.tsx
    - src/frontend/screens/WineManager/index.tsx
    - src/frontend/screens/Library/components/LibraryTour.tsx
    - src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx
    - src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx
    - src/frontend/screens/Login/components/LoginWarning/index.tsx
    - src/frontend/components/UI/Sidebar/components/SidebarTour.tsx
    - src/frontend/components/UI/LogFileUploadDialog/index.tsx
    - src/frontend/components/UI/ThemeSelector/index.tsx

key-decisions:
  - "GlobalState.tsx required no edits — its reset-dialog default strings already read 'GameLib' from a prior rebrand pass; only the preserved box.reset-heroic i18n key and window.api.resetHeroic identifier remain, both correctly out of scope."
  - "WineVersionSelector.tsx stale ~/.config/heroic/tools/{wine,proton} display paths were not in the plan's original explicit edit list — caught by the mandatory zero-Heroic-display-string audit and corrected in the same pass per plan instructions."

patterns-established: []

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-07-10
---

# Phase quick-260710-lmo Plan 01: Complete Heroic -> GameLib rebrand of user-facing strings Summary

**Rebranded every user-facing "Heroic" display string to "GameLib" across the en locale JSON and ~24 component JSX defaults, corrected three stale Heroic-era paths/protocol references, and changed the CrossoverBottle default value — while preserving all i18n keys, code identifiers, CSS classes, localStorage keys, upstream URLs, and the backend legacy-migration source.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-10T15:38:00+12:00 (approx)
- **Completed:** 2026-07-10T15:46:00+12:00 (approx)
- **Tasks:** 2 code tasks completed + 1 non-blocking human-verify checkpoint deferred
- **Files modified:** 27 (2 locale JSON + 25 components)

## Accomplishments
- `public/locales/en/translation.json`: 38 string values changed Heroic -> GameLib (analytics dialog, cache-cleared toast, restart prompts, Rosetta/Snap warnings, save-folder help, tours, log labels, weblate, etc.); all i18n **keys** (`box.reset-heroic`, `setting.log.descriptiveNames.heroic`, `heroicVersion`, the `"heroic": {}` object key) left verbatim
- `public/locales/en/gamepage.json`: 6 string values changed (anticheat disclaimer, four store login-warning strings, third-party install notice)
- Two factual corrections applied: `customCSS.warning` path `~/.config/heroic/config.json` -> `~/.config/GameLib/config.json`; `hide-window-on-protocol-launch` protocol `heroic://` -> `gamelib://`
- 25 component files updated so JSX default fallback strings (2nd arg of `t(...)`) and inline JSX text agree with the new locale values
- `ThemeSelector/index.tsx`: `'Old School Heroic'` -> `'Old School GameLib'`
- `CrossoverBottle.tsx`: default bottle name `'Heroic'` -> `'GameLib'` (functional default, not just copy — see Decisions)
- `WineVersionSelector.tsx`: stale Linux help paths `~/.config/heroic/tools/{wine,proton}` -> `~/.config/GameLib/tools/{wine,proton}` — this was not in the plan's original explicit list; caught by the mandatory zero-residual-Heroic audit
- `LogSettings/index.tsx`: hardcoded log-tab `{ title: 'Heroic' }` -> `{ title: 'GameLib' }`; the `join-heroic-discord` i18n **key** left unchanged
- Both locale JSON files validated with `node -e "JSON.parse(...)"` after every edit — always parsed successfully
- `pnpm codecheck` (`tsc --noEmit`) passes with zero errors after both commits
- Final grep audit `grep -rni "heroic" src/ public/locales/en/` reviewed in full — every residual hit falls into an allowed category (i18n keys, code identifiers like `clearHeroicCache`/`getHeroicVersion`/`HeroicHowLongToBeatEntry`/`ResetHeroic`, `HEROIC_GAME_TITLE`+sibling env vars in `launcher.ts`, CSS classes `.heroic-icon`/`.heroicIcon`/`.heroicVersion`/`.heroicNewReleases`/`heroic-tour-*`, `localStorage` key `'heroic-tour-state'`, `BranchSelector`'s `'heroic-update-passwordOption'` value, the WebView `?li=heroic` URL param, upstream `Heroic-Games-Launcher`/`heroicgameslauncher.com` GitHub/API/CDN URLs, and code comments) — zero user-facing display strings remain

## Task Commits

1. **Task 1: Locale JSON sweep + factual corrections (translation.json + gamepage.json)** - `3961a9a5` (chore)
2. **Task 2: JSX default strings + ThemeSelector + CrossoverBottle + WineVersionSelector + LogSettings title** - `5d21570f` (chore)

**Plan metadata:** pending (this SUMMARY commit)

## Files Created/Modified
- `public/locales/en/translation.json` - 38 value edits + 2 factual path/protocol corrections
- `public/locales/en/gamepage.json` - 6 value edits
- `src/frontend/screens/Settings/index.tsx` - settingsDefault help text default
- `src/frontend/screens/Settings/sections/LogSettings/index.tsx` - "General Heroic log" default + hardcoded log-tab title
- `src/frontend/screens/Settings/components/{MinimizeOnGameLaunch,AnalyticsDialog,ShowValveProton,DownloadProtonToSteam,CheckUpdatesOnStartup,DefaultSteamPath,AnalyticsOptIn,DisableController,HideWindowOnProtocolLaunch,PreferedLanguage,Gamescope}.tsx` - JSX default fallback text
- `src/frontend/screens/Settings/components/CustomCSS.tsx` - brand + stale config path default
- `src/frontend/screens/Settings/components/CrossoverBottle.tsx` - default bottle name value
- `src/frontend/screens/Settings/components/WineVersionSelector.tsx` - stale tools/wine, tools/proton display paths
- `src/frontend/screens/WebView/index.tsx` - adtraction-locked default text (upstream wiki URL and `?li=heroic` param left untouched)
- `src/frontend/screens/WineManager/index.tsx` - proton-ge explanation default
- `src/frontend/screens/Library/components/LibraryTour.tsx` - intro + "Welcome to Heroic!" title defaults
- `src/frontend/screens/Library/components/InstallModal/ThirdPartyDialog/index.tsx` - notice2 default
- `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx` - inline "(or the Heroic team)" JSX text
- `src/frontend/screens/Login/components/LoginWarning/index.tsx` - 4 store login-warning defaults
- `src/frontend/components/UI/Sidebar/components/SidebarTour.tsx` - 5 tour step defaults
- `src/frontend/components/UI/LogFileUploadDialog/index.tsx` - upload-failure default
- `src/frontend/components/UI/ThemeSelector/index.tsx` - "Old School Heroic" -> "Old School GameLib"

## Decisions Made
- `GlobalState.tsx` needed no edits: its `box.reset-heroic.question.{title,message}` default strings already read "GameLib" from a prior rebrand pass (quick task 260701-ufx); the plan listed it defensively but the file was already correct.
- `WineVersionSelector.tsx` line 193/196 stale paths were flagged by the plan as an audit-catch, not an original explicit-list item — corrected in the same Task 2 commit per the plan's instruction to fix it in the same pass and call it out here.
- `CrossoverBottle.tsx` default change is a **behavioral** default, not pure copy: new Crossover wine-type setups will default to a bottle named `GameLib` instead of `Heroic`. Existing users who already have a Crossover bottle named `Heroic` are unaffected — their saved `wineCrossoverBottle` setting persists and is not migrated or renamed.

## Deviations from Plan

None - plan executed exactly as written, including the explicitly-flagged audit-catch item (WineVersionSelector stale paths).

## Issues Encountered

**Worktree cwd drift (self-corrected, no lasting impact):** Early in Task 1, a `cd /Users/graysonmitchell/Projects/GameLib && ...` Bash invocation drifted the working directory out of the assigned worktree (`/Users/graysonmitchell/Projects/GameLib/.claude/worktrees/agent-ac115eba4de847702`) into the main repository checkout (branch `main`), and the first `translation.json` edit pass was applied there by mistake. Caught immediately via the mandatory cwd-drift assertion pattern before any commit; the accidental change was reverted with `git checkout -- public/locales/en/translation.json` in the main repo (confirmed clean afterward, `git status --short` showed no residual diff), and all edits were redone correctly inside the worktree using absolute paths rooted at the worktree, with no further `cd` calls. No commits were made against the main repo at any point; both task commits (`3961a9a5`, `5d21570f`) are on the `worktree-agent-ac115eba4de847702` branch only.

## User Setup Required
None - no external service configuration required.

## Human Verification (Non-blocking, Deferred)

The plan's final task is `checkpoint:human-verify` for visual/functional UAT in a running Electron app. This environment cannot launch the GUI, so verification is deferred to a real dev-build run. Expected outcomes (per plan `<how-to-verify>`):

1. **Settings** — scan descriptions (analytics, controller, custom CSS warning, default steam path, minimize-on-launch, hide-window-on-protocol-launch, language fallback). All should read "GameLib"; CustomCSS warning should show `~/.config/GameLib/config.json`; hide-window should read "gamelib:// links".
2. **Tours** — Library tour and Sidebar tour; every step should say "GameLib" / "Welcome to GameLib!".
3. **Login warnings** — Epic/GOG/Amazon/Zoom login warning copy should say "logged in ... in GameLib".
4. **Theme selector** — "Old School Heroic" now reads "Old School GameLib".
5. **Crossover bottle** — with a Crossover wine type selected, default bottle name field shows `GameLib` (new setups only).
6. **Wine manager / Wine version help (Linux)** — help path list shows `~/.config/GameLib/tools/wine` and `.../proton`.
7. **Log selector** — app log tab reads "GameLib" and "General GameLib log".

This is **non-blocking** — code changes are complete and verified via `pnpm codecheck` + the full grep audit; only the visual confirmation is pending.

## Next Phase Readiness
Rebrand sweep complete at the code level. No further Heroic->GameLib display-string work is outstanding in `src/` or `public/locales/en/`. Recommend running the app in dev mode to confirm the seven UAT points above.

---
*Phase: quick-260710-lmo*
*Completed: 2026-07-10*

## Self-Check: PASSED

- FOUND: public/locales/en/translation.json
- FOUND: public/locales/en/gamepage.json
- FOUND: src/frontend/screens/Settings/components/CrossoverBottle.tsx
- FOUND: src/frontend/components/UI/ThemeSelector/index.tsx
- FOUND: src/frontend/screens/Settings/components/WineVersionSelector.tsx
- FOUND: .planning/quick/260710-lmo-complete-heroic-gamelib-rebrand-of-user-/260710-lmo-SUMMARY.md
- FOUND: commit 3961a9a5 (Task 1)
- FOUND: commit 5d21570f (Task 2)
- FOUND: commit b1514c67 (SUMMARY commit)
