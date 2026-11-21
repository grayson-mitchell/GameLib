---
phase: 100-game-page-without-the-menu
plan: 07
subsystem: ui
tags: [react, game-settings-dialog, logs-tab, eos-overlay, wine-prefix, i18n]
status: complete

requires:
  - phase: 100-game-page-without-the-menu
    provides: "plan 01-06 Install tab and game page rows; the existing GamesSettings tab machinery (tabs.ts, SettingsModal, uiState.settingsModalProps)"
provides:
  - "'logs' SettingsTab right after Advanced (per game, never on Default settings); showLogsTab in settingsTabOrder; transient initialTab in initialSettingsTab that is never remembered"
  - "The 'log' GameSettingsModalType is gone; openGameLogsModal now opens { type: 'settings', initialTab: 'logs' } so GameCard is untouched (D-07)"
  - "LogSettings game controls: Last session / GameLib log picker (SelectField.logSessionPicker) and Copy log via clipboardWriteText; Open folder, Upload and the report-form link kept"
  - "Advanced -> Diagnostics & updates 'Game log -> Open the Logs tab' row"
  - "Settings/components/EosOverlaySetting.tsx: EOS overlay switch in Run -> Launch (Linux + installed Epic), handler and probe copied verbatim, with its own call-site guard (5 callOrDeclare sites / 6 spinner releases)"
  - "WinePrefix folder button (.winePrefixFolderButton) that opens the prefix"
affects: [100-09, 100-10]

plan_head_before: 11fd10f3b0bafdae5c205025c695ff46cd4e6b8f
plan_head_after: 0804058495496d4373b86cec40200ec0786824dd

actuals:
  tokens: 12763
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A transient dialog-open request (initialTab) is read only by the lazy useState initialiser and never passed to rememberTab"
    - "A moved handler is copied verbatim into its new component and the menu's call-site guard is mirrored for it; the old guard stays until the old site is deleted"

key-files:
  created:
    - src/frontend/screens/Settings/components/EosOverlaySetting.tsx
    - src/frontend/screens/Settings/components/__tests__/EosOverlaySetting.callSiteGuard.test.ts
    - src/frontend/screens/Settings/sections/GamesSettings/__tests__/logsTab.test.ts
  modified:
    - src/frontend/screens/Settings/sections/GamesSettings/tabs.ts
    - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
    - src/frontend/screens/Settings/sections/GamesSettings/index.scss
    - src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts
    - src/frontend/screens/Settings/components/SettingsModal/index.tsx
    - src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
    - src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx
    - src/frontend/state/uiState.ts
    - src/frontend/state/__tests__/uiState.test.ts
    - src/frontend/screens/Settings/sections/LogSettings/index.tsx
    - src/frontend/screens/Settings/sections/LogSettings/index.css
    - src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts
    - src/frontend/screens/Settings/components/WinePrefix.tsx
    - public/locales/en/gamelib.json
    - meta/i18nGateScope.json
    - meta/i18nForkTouchedFiles.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "The Logs tab renders only when !isDefault (showLogsTab: !isDefault, and the TabPanel is guarded the same way), so the global Default settings page never shows it"
  - "The session picker reuses the shared SelectField (the project's select control) with extraClass logSessionPicker rather than a bare <select>"
  - "The Diagnostics link is an <a className=clickable role=button> matching the report-form link already in LogSettings, switching through setValue('logs') + rememberTab like a tab click"
  - "EosOverlaySetting keeps two useTranslation() handles (t for gamelib: keys, tDefault for the verbatim handler's default-namespace setting.eosOverlay.* keys) so the copied handler text is unchanged"

patterns-established:
  - "initialTab wins in initialSettingsTab only when that tab is currently visible, else the stored/starting-tab rule applies"

requirements-completed: [D-02, D-07, D-14]

coverage:
  - id: D1
    description: "The per-game dialog has a Logs tab after Advanced, absent on Default settings; the 'log' modal type is gone and the library card's Logs item opens the dialog on Logs without making Logs the remembered tab"
    requirement: D-07
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts#Phase 100 D-02: logs follows advanced, before saves; false omits it"
        status: pass
      - kind: unit
        ref: "src/frontend/state/__tests__/uiState.test.ts#opens and closes the game modals"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/GamesSettings/__tests__/logsTab.test.ts#the initialTab prop reaches initialSettingsTab and never rememberTab"
        status: pass
    human_judgment: true
    rationale: "Right-clicking a library card, choosing Logs and seeing the dialog land on the Logs tab needs the running app"
  - id: D2
    description: "The Logs tab has a session picker (Last session / GameLib log), Copy log, Open folder and the log box, keeps Upload and the report-form link, and Advanced -> Diagnostics links to it"
    requirement: D-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/sections/GamesSettings/__tests__/logsTab.test.ts#LogSettings game controls (Phase 100 D-02)"
        status: pass
    human_judgment: true
    rationale: "The picker switching the polled log and Copy putting the text on the clipboard need the running app"
  - id: D3
    description: "On Linux an installed Epic game's Run -> Launch card has an EOS overlay switch that flips only on the backend's answer, keeps the install-now confirmation and never throws on a declined or unavailable channel"
    requirement: D-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Settings/components/__tests__/EosOverlaySetting.callSiteGuard.test.ts#EosOverlaySetting EOS decline call-site gate"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts#EosOverlaySetting carries its noun label key"
        status: pass
    human_judgment: true
    rationale: "Linux-only; toggling the overlay and the install prompt need a Linux machine with an installed Epic game"
  - id: D4
    description: "The Wine tab's prefix field has a folder button that opens the prefix"
    requirement: D-02
    verification: []
    human_judgment: true
    rationale: "No test asserts the folder button; opening the folder needs the running app"

duration: 16 min
completed: 2026-11-21
---

# Phase 100 Plan 07: Logs tab, EOS overlay switch and Wine prefix folder button Summary

**The per-game settings dialog gains a Logs tab (session picker, Copy, Open folder, Upload) that the library card's right-click Logs item opens without changing the remembered tab, an EOS overlay switch in Run -> Launch with its handler copied verbatim and guarded, and a Wine prefix folder button.**

## Performance

- **Duration:** 16 min
- **Completed:** 2026-11-21
- **Tasks:** 3
- **Files modified:** 20 (3 created)

## Accomplishments

- Task 1 (tracer): 'logs' joins SettingsTab after Advanced (never on Default); initialSettingsTab takes a transient initialTab that is never written through rememberTab; the 'log' modal type is deleted and openGameLogsModal opens the settings dialog on Logs, so GameCard needs no edit (D-07).
- Task 2: LogSettings shows a Last session / GameLib log picker and a Copy log button for a game (clipboardWriteText, the app's own channel); Advanced -> Diagnostics & updates has a "Game log -> Open the Logs tab" row.
- Task 3: EosOverlaySetting renders in Run -> Launch for Linux + installed Epic games, handler and probe verbatim (five callOrDeclare sites, six spinner releases pinned by a mirrored guard); WinePrefix has an icon-only folder button. The GameSubMenu guard is kept for plan 09.
- i18n bookkeeping: fork-touched 471 -> 472, scope 348 -> 349 for EosOverlaySetting.tsx (scanned, gate showed 0 violations).

## Task Commits

1. **Task 1: Logs tab end to end, 'log' modal type merged** - `75381abf0` (feat)
2. **Task 2: Logs tab content and the Diagnostics link** - `bb70a87c3` (feat)
3. **Task 3: EOS overlay switch and Wine prefix folder button** - `cb6feba49` (feat)
4. **Task 3 bookkeeping: i18n gate scope** - `080405849` (chore)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Icon-only prefix button had no styling**
- **Found during:** Task 3
- **Issue:** the plan names `.winePrefixFolderButton` but lists no stylesheet, so the button would have rendered as a native button.
- **Fix:** added a small token-coloured rule to GamesSettings/index.scss (not in files_modified).
- **Files modified:** src/frontend/screens/Settings/sections/GamesSettings/index.scss
- **Commit:** cb6feba49

**Total deviations:** 1 auto-fixed (1 missing critical). **Impact:** none on behaviour; one extra stylesheet hunk.

## Verification

Plan-end gates all green: full Frontend jest (384 suites, 6655 tests), Meta genI18nGateScope + hardcodedStringGate (204 passed), codecheck, find-deadcode (312 baselined, PASS), gameinfo-narrowing-ceiling (PASS), backend-di-ceilings frontend (0 FAIL), i18n-churn-guard clean, prettier scoped over all touched non-ignored paths (gamelib.json is prettier-ignored). `pnpm lint` reports 0 errors; the three warnings in touched files are the verbatim-copied EOS effect/promise shapes and an existing LogSettings effect dependency. GameCard and GameSubMenu are untouched (D-07, D-14).

## Issues Encountered

An unrelated Phase 85 commit (`edeb9e29d`) from another session landed between this plan's commits; it is not counted in `commits`. `commits: 4` counts only subjects carrying (100-07), measured before this SUMMARY's own docs commit.

## Known Stubs

None.

## Threat Flags

None. T-100-20..23 dispositions hold: Copy is user-initiated on a log already redacted at write time; polling runs only while the Logs TabPanel is mounted; the EOS handler is verbatim behind callOrDeclare with a pinning guard; initialTab is never persisted.

## Next Phase Readiness

Ready for 100-08. Plan 09 can delete the menu's Logs and EOS items and the GameSubMenu EOS guard now that both live in the settings dialog.

## Self-Check: PASSED

All created files exist; commits 75381abf0, bb70a87c3, cb6feba49 and 080405849 are on main.
