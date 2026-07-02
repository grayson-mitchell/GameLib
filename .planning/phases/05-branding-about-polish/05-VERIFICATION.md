---
phase: 05-branding-about-polish
verified: 2026-07-02T10:45:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Click the version number in the sidebar, confirm a modal opens with the title 'GameLib 1.0.0' and body text covering Steam support, CrossOver, and a working link to the Heroic 2.22.0 upstream release notes"
    expected: "Modal header reads 'GameLib 1.0.0'; body renders 5-bullet markdown; 'Built on Heroic 2.22.0 — see upstream release notes' is a clickable link that opens the Heroic v2.22.0 GitHub release page"
    why_human: "ChangelogModal renders via ReactMarkdown in the renderer process — the IPC chain, data flow, and component wiring are all verified in code, but visual rendering and link click behavior require the running app"
  - test: "Confirm the 'Update Available!' block is absent from the sidebar version area"
    expected: "No 'Stable' / 'Beta' update links appear beneath the version number; getLatestReleases returns [] so shouldShowUpdates is falsy"
    why_human: "Requires running the app — suppression is verified in source code but sidebar rendering is a visual check"
  - test: "On macOS, hover over the menu-bar tray icon and read the tooltip"
    expected: "Tooltip reads 'GameLib', not 'Heroic'"
    why_human: "tray_icon.ts and its test are both verified in code; tooltip display requires a running macOS process with a live tray icon"
---

# Phase 5: Branding & About Polish — Verification Report

**Phase Goal:** GameLib presents complete, accurate identity across tray tooltip, backend logs, documentation, and the in-app release notes link
**Verified:** 2026-07-02T10:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | macOS tray tooltip reads "GameLib" instead of "Heroic" (BRAND-02) | VERIFIED | `tray_icon.ts:34` contains `appIcon.setToolTip('GameLib')`; test at `tray_icon.test.ts:38-46` asserts `tooltip === 'GameLib'`; verify-branding.cjs PASS |
| 2 | Backend log/dialog strings use "GameLib" where they previously showed "Heroic" (BRAND-03) | VERIFIED | All 7 backend files rebranded: D-05 strings in updater.ts, launcher.ts, gog/setup.ts, zoom/games.ts, utils.ts; D-06 Discord strings in utils.ts; logger/paths.ts all 3 platform paths + relativeFilePath; config.ts crossover bottle; presence.ts application_type; About panel website and updater changelog URL also rebranded via CR resolution commit 100aaf43; ESLint 0 errors; verify-branding.cjs 30/30 PASS |
| 3 | README accurately documents GameLib as fork of Heroic with Steam support and build/install steps (BRAND-04) | VERIFIED | `README.md:3`: "GameLib is a derivative of Heroic Games Launcher"; Steam support on L4, L12, L49, L143; pnpm install/dist steps at L154-171; typos absent; instructional Heroic mentions replaced; launch.json has exactly 2 occurrences of "Launch GameLib (HMR & HR)", 0 of "Launch Heroic" |
| 4 | Clicking version number opens GameLib release notes view with what changed and upstream Heroic link (APP-01) | VERIFIED | `public/changelog.json` all 8 Release fields valid, `name: "GameLib 1.0.0"`, body contains upstream v2.22.0 link; `getCurrentChangelog()` reads local file via `readFileSync(join(publicDir, 'changelog.json'))`, no GITHUB_API call; IPC chain complete: `main.ts:703-704` addHandler → `preload/api/misc.ts:11` makeHandlerInvoker → `ChangelogModal/index.tsx:25` window.api.getCurrentChangelog(); modal renders `release.name` + `release.body` via ReactMarkdown; click on version number in `HeroicVersion/index.tsx:86` triggers modal |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `public/changelog.json` | Bundled GameLib 1.0.0 release notes conforming to Release type | VERIFIED | All 8 fields present; `name`: "GameLib 1.0.0"; `body` includes 5 bullets + upstream v2.22.0 link; JSON parse clean |
| `src/backend/utils.ts` | getCurrentChangelog local-file read + getLatestReleases suppression + rebranded strings | VERIFIED | `getCurrentChangelog` uses `readFileSync(join(publicDir, 'changelog.json'))`; `getLatestReleases` returns `[]` with suppression comment; D-05 strings and D-06 Discord strings rebranded; GITHUB_API and notify imports removed (CR-01 resolved) |
| `src/backend/tray_icon/tray_icon.ts` | GameLib tray tooltip | VERIFIED | `appIcon.setToolTip('GameLib')` at L34; no `setToolTip('Heroic')` |
| `src/backend/storeManagers/gog/presence.ts` | Discord presence GameLib identity | VERIFIED | `application_type: 'GameLib'` at L43; no `'Heroic Games Launcher'` |
| `src/backend/constants/paths.ts` | GameLib default install path and wine prefix dir | VERIFIED | `join(userHome, 'Games', 'GameLib')` for heroicInstallPath and defaultWinePrefixDir; legacy `join(configFolder, 'heroic')` migration preserved |
| `src/backend/logger/paths.ts` | GameLib-labelled log directories and log filename | VERIFIED | All 3 platform log paths use 'GameLib'; `relativeFilePath = 'gamelib'` |
| `src/backend/config.ts` | GameLib default CrossOver bottle | VERIFIED | `wineCrossoverBottle: 'GameLib'` at L355 |
| `src/backend/updater.ts` | Dialog strings + changelog URL rebranded | VERIFIED | "Do you want to restart GameLib now?" at L65; `grayson-mitchell/GameLib/releases` at L53; no Heroic-Games-Launcher URL |
| `README.md` | Accurate GameLib-branded docs with fork attribution | VERIFIED | Fork attribution retained; Steam support documented; build/install steps present; typos fixed; instructional Heroic mentions replaced |
| `.vscode/launch.json` | GameLib-named launch configuration | VERIFIED | Exactly 2 occurrences of "Launch GameLib (HMR & HR)"; 0 occurrences of "Launch Heroic (HMR & HR)" |
| `scripts/verify-branding.cjs` | Phase 5 branding verification section (Section 5) | VERIFIED | Section 5 added with 16 assertions (tray, logger paths, install path, config bottle, presence, Discord version, D-05 dialog strings, changelog existence + local-read, About website, updater URL); 30/30 checks PASS |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/backend/utils.ts getCurrentChangelog` | `public/changelog.json` | `readFileSync(join(publicDir, 'changelog.json'))` | WIRED | L797-799 reads the file; no GITHUB_API reference remaining |
| `public/changelog.json body` | Heroic v2.22.0 release | Markdown link in body | WIRED | Body contains `releases/tag/v2.22.0` as confirmed by `node -e` validation |
| `src/backend/main.ts:703-704` | `getCurrentChangelog` | `addHandler('getCurrentChangelog', ...)` | WIRED | IPC handler registered; function imported at L54 |
| `src/preload/api/misc.ts:11` | `main.ts` handler | `makeHandlerInvoker('getCurrentChangelog')` | WIRED | Preload exposes `getCurrentChangelog` to renderer |
| `ChangelogModal/index.tsx:25` | Preload | `window.api.getCurrentChangelog()` | WIRED | Calls IPC, sets `currentChangelog` state, renders `release.name` + `release.body` via ReactMarkdown |
| `HeroicVersion/index.tsx:86` | `ChangelogModal` | `onClick → setShowChangelogModalOnClick` | WIRED | Click on version span triggers modal render |
| `scripts/verify-branding.cjs Section 5` | `public/changelog.json` | `fs.existsSync` check | WIRED | Check at L144 asserts changelog file exists |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `ChangelogModal/index.tsx` | `currentChangelog` | `window.api.getCurrentChangelog()` → `utils.ts getCurrentChangelog()` → `readFileSync(changelog.json)` → `JSON.parse()` | Yes — reads bundled file with real content | FLOWING |
| `HeroicVersion/index.tsx` | `newReleases` | `window.api.getLatestReleases()` → `getLatestReleases()` returns `[]` intentionally | Intentionally empty (suppression) | STATIC — by design (D-04), prevents false Heroic update notices |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `public/changelog.json` validates all Release fields + upstream link | `node -e "const r=require('./public/changelog.json'); ..."` | All fields valid; upstream v2.22.0 link present | PASS |
| `pnpm codecheck` (tsc --noEmit) exits 0 | `pnpm codecheck; echo $?` | EXIT CODE: 0 | PASS |
| Branding gate exits 0 | `node scripts/verify-branding.cjs` | 30 checks: 30 passed, 0 failed | PASS |
| ESLint on utils.ts + updater.ts reports 0 errors | `npx eslint src/backend/utils.ts src/backend/updater.ts` | 0 errors (52 pre-existing warnings) | PASS |
| `tray_icon.ts` sets GameLib tooltip | `grep "setToolTip" src/backend/tray_icon/tray_icon.ts` | `appIcon.setToolTip('GameLib')` | PASS |
| `getLatestReleases` returns `[]` | grep in utils.ts | `return []` at L790 with suppression comment | PASS |
| `getCurrentChangelog` reads local file | grep in utils.ts | `readFileSync(changelogPath, 'utf-8')` at L798; no GITHUB_API ref | PASS |

### Probe Execution

No phase-declared probes. `scripts/verify-branding.cjs` functions as the functional equivalent and was run above.

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/verify-branding.cjs` | `node scripts/verify-branding.cjs` | 30/30 PASS, exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BRAND-02 | 05-01-PLAN, 05-04-PLAN | macOS tray tooltip reads "GameLib" | SATISFIED | `tray_icon.ts:34` setToolTip('GameLib'); test asserts it; verify-branding checks it |
| BRAND-03 | 05-01-PLAN, 05-02-PLAN, 05-04-PLAN | Residual backend log/dialog strings read GameLib | SATISFIED | All 7 files rebranded across D-05/D-06/D-08 strings + log paths + config + presence + About/updater URLs |
| BRAND-04 | 05-03-PLAN | README accurately documents GameLib fork + Steam + build steps | SATISFIED | README.md typos fixed, fork attribution kept, Steam documented, build/install steps present, launch.json synchronized |
| APP-01 | 05-01-PLAN, 05-04-PLAN | Clicking version opens GameLib release notes with upstream Heroic link | SATISFIED (code) | Full IPC data flow verified; changelog.json contains correct content; visual rendering is human check |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/constants/paths.ts` | 32-43 | `renameSync` migration fires at module import time (IN-01 from code review) | INFO | Correctly guarded (existsSync, CI=e2e guard, try/catch); inert in tests; noted by code reviewer as fragile pattern for future, not a current defect |

No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files. No stub return values. No placeholder content. CR-01 (unused imports `notify`, `GITHUB_API`) resolved in commit `100aaf43`.

### Human Verification Required

#### 1. GameLib 1.0.0 Changelog Modal

**Test:** Run the app, click the version number text in the sidebar (or trigger it on first launch after clearing localStorage `last_changelog`). Observe the modal that opens.
**Expected:** Modal header reads "GameLib 1.0.0"; body shows 5 bullets (Steam support, CrossOver/Proton, rebrand, unified library, Steam account management); a clickable link "Built on Heroic 2.22.0 — see upstream release notes" opens `https://github.com/Heroic-Games-Launcher/HeroicGamesLauncher/releases/tag/v2.22.0` in the browser.
**Why human:** The IPC chain, data source, and ChangelogModal component wiring are fully verified in code. The visual rendering of ReactMarkdown and the clickable link behavior require a running app.

#### 2. Update Available Block Absent

**Test:** Launch the app and inspect the sidebar version area.
**Expected:** No "Update Available! Stable / Beta" links appear. The version number is shown without the `heroicNewReleases` div.
**Why human:** `getLatestReleases()` returning `[]` means `shouldShowUpdates` is falsy in `HeroicVersion/index.tsx` — verified in source. Absence of the rendered UI block is a visual check.

#### 3. macOS Tray Tooltip (on macOS only)

**Test:** On macOS, launch the app and hover over the GameLib icon in the menu bar.
**Expected:** System tooltip reads "GameLib".
**Why human:** `setToolTip('GameLib')` and the corresponding unit test are both verified. The tooltip display requires a live macOS tray icon in a running Electron process.

### Gaps Summary

No gaps found. All 4 roadmap success criteria are satisfied in the codebase:

1. **BRAND-02** — tray tooltip: `setToolTip('GameLib')` in source, test coverage, branding gate PASS.
2. **BRAND-03** — backend strings: all D-05/D-06/D-08 strings across 7 files rebranded; About panel and updater URLs fixed via code-review resolution commit `100aaf43`; ESLint 0 errors; 30/30 branding checks PASS.
3. **BRAND-04** — README: fork attribution retained, Steam documented, build/install steps present, typos fixed, launch.json synchronized.
4. **APP-01** — changelog: bundled `public/changelog.json` with "GameLib 1.0.0" name and upstream v2.22.0 link; `getCurrentChangelog()` reads local file; full IPC data flow from file through backend handler, preload, and ChangelogModal confirmed wired and substantive.

Three items require human testing (visual rendering, UI absence check, tray tooltip display) before the phase can be marked fully passed.

---

_Verified: 2026-07-02T10:45:00Z_
_Verifier: Claude (gsd-verifier)_
