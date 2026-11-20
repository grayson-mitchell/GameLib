---
quick_id: 260710-lmo
slug: complete-heroic-gamelib-rebrand-of-user-facing-strings
description: Complete the Heroic->GameLib rebrand of all user-facing display strings, preserving internal identifiers, i18n keys, upstream URLs, and the legacy-config migration source
date: 2026-07-10
source: user request (branding sweep) + CLAUDE.md rebrand constraints
autonomous: false
files_modified:
  - public/locales/en/translation.json
  - public/locales/en/gamepage.json
  - src/frontend/state/GlobalState.tsx
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
---

# Quick Task 260710-lmo: Complete Heroic -> GameLib rebrand of user-facing strings

## Problem

GameLib is a public fork of Heroic Games Launcher. The internal rename to GameLib is
largely done (config dir, protocol, install paths, icons), but a large amount of the
**visible copy** still says "Heroic": the `en` locale JSON (what users actually see at
runtime) and the matching JSX fallback default strings in ~25 components (2nd arg of
`t('key', 'Default text with Heroic')`). A couple of user-facing strings are also
**factually stale** (they reference the old `~/.config/heroic` path and `heroic://`
protocol that have already migrated to `GameLib` / `gamelib://`).

This is a careful, mostly-mechanical sweep. The hard part is discipline: change
**display copy only**, and preserve i18n keys, internal identifiers, upstream URLs, and
the backend legacy-config migration source (which must keep pointing at `heroic` — it is
the upstream dir being migrated *from*, kept for mergeability with upstream Heroic).

## Scope decisions (read before editing)

**CHANGE (user-facing display copy) "Heroic" -> "GameLib":**
- All string **values** in `public/locales/en/translation.json` and
  `public/locales/en/gamepage.json` that use "Heroic" as the app/brand name.
- The matching JSX default fallback strings (2nd arg of `t(...)`) and inline JSX text in
  the components listed in `files_modified`, so code and runtime agree.

**FACTUAL CORRECTIONS (stale, not just branding — do in the same pass):**
- `customCSS.warning` (translation.json ~line 886) **and** the JSX default in
  `CustomCSS.tsx` (~line 27): the path `~/.config/heroic/config.json` is stale. Real
  config dir is `<config>/GameLib` (see `src/backend/constants/paths.ts` line 24,49:
  `appFolder = join(configFolder, 'GameLib')`, `configPath = join(appFolder, 'config.json')`).
  Change brand word Heroic->GameLib **and** path -> `~/.config/GameLib/config.json`.
- `settings.hide-window-on-protocol-launch` (translation.json ~line 952):
  `"Hide Heroic window when launching games from heroic:// links"` — the protocol
  migrated to `gamelib://` in a prior task. Change Heroic->GameLib **and**
  `heroic://` -> `gamelib://`. (The matching component default in
  `HideWindowOnProtocolLaunch.tsx` line 22-23 already reads
  `"Hide GameLib window when launching games from gamelib:// links"` — locale needs to
  catch up to the code, not the reverse.)
- `WineVersionSelector.tsx` lines ~193/196: the displayed Linux help paths
  `~/.config/heroic/tools/wine` and `~/.config/heroic/tools/proton` are stale
  user-facing display strings. Real path is `<config>/GameLib/tools` (paths.ts line 46:
  `toolsPath = join(appFolder, 'tools')`). Change -> `~/.config/GameLib/tools/wine` and
  `~/.config/GameLib/tools/proton`. **This one was not in the original explicit list — it
  was caught by the audit requirement (zero user-facing display strings may still say
  "Heroic"). Flag it in the SUMMARY.**

**FUNCTIONAL DEFAULT (change per explicit user request):**
- `CrossoverBottle.tsx` line ~10: `useSetting('wineCrossoverBottle', 'Heroic')` ->
  `'GameLib'`. This is a default **value**, not copy. Behavioral note for SUMMARY: new
  Crossover setups will default to a bottle named `GameLib` instead of `Heroic`; existing
  users who already have a `Heroic` bottle are unaffected (their saved setting persists).

**LogSettings.tsx line ~159:** the hardcoded `{ title: 'Heroic', args: {} }` in the log
file selector `baseFiles` array is a user-facing tab/label. Change to
`{ title: 'GameLib', args: {} }`.

**DO NOT CHANGE (preserve exactly — mergeability + correctness). These will remain as
"heroic" hits after the sweep and are ALL allowed:**
- i18n **keys** (only their values change): `box.reset-heroic.*`,
  `setting.log.descriptiveNames.heroic`, `setting.log.join-heroic-discord`,
  `settings.resetHeroic.*`, `settings.reset-heroic*`, `heroicVersion` key +
  `{{heroicVersion}}` interpolation var, the `"heroic": { ... }` object key
  (translation.json ~643).
- Internal code identifiers: `clearHeroicCache`, `HeroicVersion` (component),
  `getHeroicVersion` / `window.api.resetHeroic`, `heroicVersion` state,
  `HeroicHowLongToBeatEntry` (type), `ResetHeroic` (component + imports/exports),
  `defaultWineVersion`, `heroicInstallPath`, `heroicIconFolder`, `appFolder` internals.
- Backend env var `HEROIC_GAME_TITLE` (launcher.ts) — passed to game processes. LEAVE.
- CSS class names: `.heroic-icon`, `.heroicIcon`, `.heroicNewReleases`,
  `heroic-tour-tooltip`, `heroic-tour-highlight` (Tour.scss / Tour.tsx / Sidebar.scss /
  SystemInfo.scss / software.tsx). LEAVE.
- `localStorage` key `'heroic-tour-state'` (TourContext.tsx). LEAVE.
- `BranchSelector.tsx` internal option value `'heroic-update-passwordOption'`. LEAVE.
- `WebView/index.tsx` line ~76 zoom URL param `...?li=heroic...`. LEAVE (URL param).
- The **legacy config migration source** in `src/backend/constants/paths.ts` (lines
  26-42: reads `<config>/heroic` to migrate to `GameLib`). MUST keep pointing at `heroic`.
- Upstream GitHub / `raw.githubusercontent` / API URLs containing
  `Heroic-Games-Launcher`. LEAVE ALL.
- Code **comments** mentioning Heroic (e.g. Settings/index.tsx:64,
  useSettingsContext.ts:30, hasProgress.ts, gamepad.ts, shortcuts.ts, paths.ts). LEAVE
  (not user-facing; reduces merge churn).
- Do NOT touch any locale file outside `public/locales/en/` (community-translated).

## Tasks

### Task 1 — Locale JSON sweep + factual corrections (translation.json + gamepage.json)
- **Type:** auto
- **Files:** `public/locales/en/translation.json`, `public/locales/en/gamepage.json`
- **Action:** In both files, replace "Heroic" with "GameLib" in every string **value**
  that uses it as the app/brand name. Preserve every i18n **key** (change values only —
  keys like `box.reset-heroic`, `descriptiveNames.heroic`, `heroicVersion`, the
  `"heroic": {}` object key stay verbatim). translation.json occurrences to change
  (approx lines): 16 (adtraction), 26/27/31 (analytics dialog), 46
  ("Heroic cache cleared."), 83 (executableNotFoundMessage), 115 (restart prompt),
  174 (Rosetta), 185/186 (Snap message + title), 462 (analytics desc), 474
  (settingsDefault), 482 (download_proton_steam), 489 (language fallback), 506
  (hide-window help), 522 (DefaultSteamPath info), 526/527 (save folder), 541 (wine
  search folders), 826 ("Help translate Heroic." -> "Help translate GameLib."), 875
  (analyticsOptIn), 883 (checkForUpdatesOnStartup), 894 (disable_controller), 949
  (gamescope warningFlatpak), 967 ("General Heroic log" -> "General GameLib log" — VALUE
  only, key `heroic` stays), 991 (log upload failure), 1020 (minimize-on-launch), 1043
  (ShowValveProton), 1244/1246 (library tour intro + "Welcome to Heroic!"), 1254/1255/
  1260/1262/1264 (sidebar tour copy), 1326 (proton-ge). Apply the two **factual
  corrections**: (a) `customCSS.warning` ~886 — Heroic->GameLib AND
  `~/.config/heroic/config.json` -> `~/.config/GameLib/config.json`; (b)
  `settings.hide-window-on-protocol-launch` ~952 — Heroic->GameLib AND `heroic://` ->
  `gamelib://`. gamepage.json occurrences to change (approx lines): 201 ("(or the Heroic
  team)"), 246/247/248/251 (login-warning amazon/epic/gog/zoom), 353 (install notice2).
  Do NOT touch already-correct values that read "GameLib" (translation.json 1085, 1140,
  1141, 1166). Line numbers are guidance — grep to confirm exact positions before editing.
- **Verify:**
  - `node -e "JSON.parse(require('fs').readFileSync('public/locales/en/translation.json','utf8')); JSON.parse(require('fs').readFileSync('public/locales/en/gamepage.json','utf8')); console.log('JSON OK')"`
  - `grep -n '"[^"]*[Hh]eroic[^"]*":' public/locales/en/translation.json public/locales/en/gamepage.json` returns ONLY key lines from the preserve list (no VALUE contains "Heroic" as brand). Manually confirm every residual hit is a key, not a value.
  - `pnpm codecheck` green.
- **Done:** Both locale files are valid JSON; no user-facing brand value says "Heroic";
  factual path/protocol corrections applied; all i18n keys unchanged.
- **Commit:** `chore(rebrand): GameLib copy in en locale JSON + stale path/protocol fixes`

### Task 2 — JSX default strings + ThemeSelector + CrossoverBottle + WineVersionSelector + LogSettings title
- **Type:** auto
- **Files:** all `src/frontend/**` entries in `files_modified` (every component except the
  two locale files).
- **Action:** For each component, change "Heroic" -> "GameLib" in the JSX default
  fallback strings (2nd arg of `t(...)`) and any inline JSX display text, so they match
  the Task 1 locale values. Specific edits: GlobalState.tsx:548 reset-message default;
  Settings/index.tsx:55 settingsDefault default (leave the line-64 comment);
  LogSettings/index.tsx:132 "General Heroic log" default AND line ~159 hardcoded
  `{ title: 'Heroic' }` -> `{ title: 'GameLib' }` (leave the `join-heroic-discord` KEY);
  MinimizeOnGameLaunch, AnalyticsDialog (3 strings), ShowValveProton, DownloadProtonToSteam,
  CheckUpdatesOnStartup, DefaultSteamPath, AnalyticsOptIn (2), DisableController,
  HideWindowOnProtocolLaunch:27 `help.` default (the `setting.` default at 22-23 is
  already GameLib/gamelib://), PreferedLanguage, Gamescope, WebView/index.tsx:511
  adtraction default (leave the `li=heroic` URL at :76), WineManager:132, LibraryTour
  (2), ThirdPartyDialog:126, DownloadDialog/index.tsx:234 inline "(or the Heroic team)",
  LoginWarning (4 strings), SidebarTour (5 strings), LogFileUploadDialog:82. Then the
  three special edits: **ThemeSelector/index.tsx:15** `'Old School Heroic'` ->
  `'Old School GameLib'`; **CrossoverBottle.tsx:10** default `'Heroic'` -> `'GameLib'`
  (functional default value); **CustomCSS.tsx:27** default — Heroic->GameLib AND
  `~/.config/heroic/config.json` -> `~/.config/GameLib/config.json` (mirror the Task 1
  locale fix; also note the typo "can be changes manually" may be left as-is to minimize
  churn — brand/path only); **WineVersionSelector.tsx:193/196** display paths
  `~/.config/heroic/tools/wine` -> `~/.config/GameLib/tools/wine` and
  `.../proton` -> `~/.config/GameLib/tools/proton`. Do NOT touch CSS classes,
  localStorage keys, component/type/api identifiers, or the BranchSelector option value.
- **Verify:**
  - `pnpm codecheck` green.
  - Final audit: `grep -rni "heroic" src/ public/locales/en/` — review EVERY remaining
    hit and confirm it falls into an allowed category (i18n key, code identifier, CSS
    class, localStorage key, BranchSelector option value, zoom URL param, upstream URL,
    code comment, or the paths.ts legacy-migration source). ZERO hits may be a
    user-facing display string. Expected residual categories only.
- **Done:** All component display copy matches the GameLib locale values; the two path
  corrections + CrossoverBottle default + ThemeSelector name + LogSettings title applied;
  `pnpm codecheck` green; grep audit shows only allowed-category residuals.
- **Commit:** `chore(rebrand): GameLib copy in component defaults + theme/bottle/path fixes`

### Task 3 — Runtime visual spot-check (checkpoint:human-verify, non-blocking)
- **Type:** checkpoint:human-verify
- **Gate:** non-blocking (GUI cannot be launched in this environment; spot-check is
  advisory and does not block the commits above).
- **What was built:** All user-facing "Heroic" copy rebranded to "GameLib" across the
  `en` locale and component defaults, plus stale `~/.config/heroic` paths and `heroic://`
  protocol references corrected.
- **How to verify (when you next run the app):**
  1. **Settings** — open Settings; scan descriptions (analytics, controller, custom CSS
     warning, default steam path, minimize-on-launch, hide-window-on-protocol-launch,
     language fallback). All should read "GameLib"; CustomCSS warning should show
     `~/.config/GameLib/config.json`; hide-window should read "gamelib:// links".
  2. **Tours** — trigger the Library tour and Sidebar tour; every step should say
     "GameLib" / "Welcome to GameLib!".
  3. **Login warnings** — open a store login (Epic/GOG/Amazon/Zoom) via the store page to
     trigger the LoginWarning; copy should say "logged in ... in GameLib".
  4. **Theme selector** — confirm the theme formerly "Old School Heroic" now reads
     "Old School GameLib".
  5. **Crossover bottle** — with a Crossover wine type selected, confirm the default
     bottle name field shows `GameLib` (new setups only).
  6. **Wine manager / Wine version help (Linux)** — confirm the help path list shows
     `~/.config/GameLib/tools/wine` and `.../proton`.
  7. **Log selector** — confirm the app log tab reads "GameLib" and "General GameLib log".
- **Resume signal:** Type "approved" or describe any string still showing "Heroic".

## Success criteria
- `public/locales/en/translation.json` and `gamepage.json` are valid JSON with no
  user-facing brand value reading "Heroic".
- All component JSX default/display strings agree with the GameLib locale values.
- Factual corrections applied: CustomCSS path, hide-window protocol, WineVersionSelector
  tool paths.
- CrossoverBottle default -> `GameLib`; ThemeSelector -> `Old School GameLib`; LogSettings
  title -> `GameLib`.
- `pnpm codecheck` green after each commit.
- `grep -rni "heroic" src/ public/locales/en/` residuals are ALL in allowed categories
  (keys, identifiers, CSS classes, localStorage key, BranchSelector value, zoom URL,
  upstream URLs, comments, legacy-migration source) — zero user-facing display strings.
- Two coherent commits, each leaving codecheck green and locale JSON valid.

## Output
Write `.planning/quick/260710-lmo-complete-heroic-gamelib-rebrand-of-user-/260710-lmo-SUMMARY.md`
when done. In the SUMMARY, call out the behavioral note (Crossover bottle default now
`GameLib`) and the audit-caught addition (WineVersionSelector display paths corrected
beyond the original explicit list).
