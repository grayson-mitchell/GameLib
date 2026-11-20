---
phase: quick-261121-dzl
plan: 01
subsystem: frontend-settings
tags: [settings-dialog, sketch-009, i18n, ui]
requires: []
provides:
  - Dialog opt-in header slot (header row with the close X)
  - SettingsModalHeader (thumbnail, title alone, Game settings / App ID / Saved subline)
  - createSettingSetter onWrite callback (real save signal)
  - GamesSettings/tabs.ts (starting tab, tab order, runner-keyed remembered tab with migration)
  - SettingsCard, neutral settingsNote, amber settingsWarning, settingsToggleDescription
affects:
  - src/frontend/components/UI/Dialog
  - src/frontend/screens/Settings
tech-stack:
  added: []
  patterns:
    - pure tabs module tested in the node environment
    - opt-in slot on a shared primitive (25 consumers unchanged)
key-files:
  created:
    - src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
    - src/frontend/screens/Settings/components/SettingsModal/index.scss
    - src/frontend/screens/Settings/sections/GamesSettings/tabs.ts
    - src/frontend/screens/Settings/sections/GamesSettings/SettingsCard.tsx
    - src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx
    - src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx
    - src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts
    - src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts
  modified:
    - src/frontend/components/UI/Dialog/components/Dialog.tsx
    - src/frontend/components/UI/Dialog/index.css
    - src/frontend/screens/Settings/components/SettingsModal/index.tsx
    - src/frontend/hooks/useSettingsContext.ts
    - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
    - src/frontend/screens/Settings/sections/GamesSettings/index.scss
    - src/frontend/screens/Settings/components/ (13 field components, 4 tests)
    - public/locales/en/gamelib.json
decisions:
  - "Header close button: exactly one [aria-label=close], moved into .Dialog__header only when a header is passed; gamepad.ts untouched"
  - "settingsWarning amber box selector is `div.settingsWarning` so WrappersTable's inline span of the same class keeps its bold amber text style"
  - "All new keys in the gamelib namespace; Wine/Winetricks tab labels gamelib:settings.navbar.*"
metrics:
  duration: "~1h 20m"
  completed: 2026-11-21
status: complete
commits: 3
plan_head_before: c26dbb6fb70ec561890c78c0e3e71e2c4dbec8da
plan_head_after: 3ff5d2ad8824b864564f40d2c9882eac91481331
actuals:
  tokens: 21000
  tasks: 3
  commits: 3
---

# Phase quick-261121-dzl Plan 01: Game settings dialog redesign per sketch 009 B Summary

Variant B of sketch 009 implemented item by item: X in a header row beside the thumbnail and title, a real "Saved" flash, Run-first tabs on macOS, bordered cards, neutral notes and an amber Steam warning, noun labels with (i) help, and both 2026-11-21 todos closed.

## Commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | 21c670ce6 | Dialog header slot, SettingsModalHeader, onWrite save signal, footer removed (#1, #9, #10, #11) |
| 2 | 3a67d0c85 | tabs.ts, SettingsCard, cards and notes in GamesSettings, Wine/Winetricks via t() (#2, #4, #7, #8, #12) |
| 3 | 3ff5d2ad8 | Always-visible Engine and Steam overlay, LWS description and amber warning, noun labels, copy fixes, todos closed (#3, #5, #6) |

## Verification

- Task 1 jest list, Task 2 jest list and Task 3 jest list all green; the new `261121-dzl` specs: 11 in Task 1 (>= 9), 20 in tabs.test.ts (>= 6).
- `meta/__tests__/hardcodedStringGate.test.ts` passed (178 tests, 187 s); `i18nCatalogChurnGuard` and `pnpm i18n-churn-guard` clean; `tokenCensus` and `muiTabsSelectorScoping` green.
- `pnpm codecheck` exit 0; eslint 0 errors (remaining warnings are pre-existing: Dialog.tsx floating promises and exhaustive-deps, OfflineMode, LauncherArgs, SteamDialog, SteamOverlayOverride test mock); `npx prettier --check` over every written, non-ignored path passes (gamelib.json and .planning are prettier-ignored; no check).
- Todo gate (`.planning/todos/todo-frontmatter-gate.py`) passes.
- The gamelib.json CSP was followed per task: only own hunks staged; the 4 foreign reorder hunks in the customThemes block remain unstaged. `git add` was always by exact path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `.settingsWarning` class collision**
- **Found during:** Task 3
- **Issue:** `WrappersTable` already renders `<span className="settingsWarning">` styled in Settings/index.css (bold amber text). A plain `.settingsWarning` box rule in GamesSettings/index.scss would have turned that span into a bordered flex box.
- **Fix:** The box style is scoped as `div.settingsWarning`. LaunchWithoutSteam and OfflineMode warnings are divs and the plan's `.settingsWarning` selector in tests still matches.
- **Files modified:** src/frontend/screens/Settings/sections/GamesSettings/index.scss
- **Commit:** 3ff5d2ad8

**2. [Rule 1 - Type fixes in new tests]** Tightened test helpers (`closeButton()`, `getItem` return type, a redundant assertion, an unused import) to satisfy `pnpm codecheck` and eslint. Commits 21c670ce6, 3a67d0c85, 3ff5d2ad8.

Otherwise the plan was executed as written. The Wine-tab `wineTabHint` key remains in the catalogue (parser keeps it; only the source stopped using it) and the old LWS description/warning keys likewise stay, as planned.

## Auth gates

None.

## Known Stubs

None.

## Threat Flags

None. No new endpoints, auth paths or trust-boundary file access. T-261121-dzl-01 (remembered tab) mitigated through `initialSettingsTab`/`readRememberedTab`; T-261121-dzl-05 mitigated through the single close button (tests D-F).

## Human UAT (pending)

Run `pnpm tauri:dev` (never `tauri:dev:run`). Frontend-only checks; the launcher.ts and launchFailure.ts copy changes need `pnpm build:sidecar` and a dev restart to show and are not part of this list.

### 1. Header and X, short title
expected: Low Magic Age (576770) settings: thumbnail, "Low Magic Age" alone, X in the same row, subline "Game settings · Steam App ID 576770 · Saved automatically"; nothing overlaps any (i) control.
result: pending

### 2. Header and X, long title
expected: A game with a long title clamps it to two lines beside the X, and the dialog does not widen past the window.
result: pending

### 3. Saved flash
expected: Toggling any setting flashes "Saved" in the subline for about a second, then it returns to "Saved automatically".
result: pending

### 4. Opening tab and order on macOS
expected: 576770 opens on Run with tabs Run, Wine, Winetricks, Advanced; a game with an old remembered tab still opens on that tab once.
result: pending

### 5. Cards, notes and warning in three themes
expected: In midnightMirage, gruvbox_dark and dracula, cards (Launch, Steam, Launch target, Scripts, Wrappers & environment, Diagnostics & updates, Wine engine), the neutral Wine-engine note and the amber Launch-without-Steam warning are all legible and distinct from the dialog surface.
result: pending

### 6. Engine and Steam overlay
expected: Both are plain always-visible selects with (i) help, with no "(advanced)" twisty.
result: pending

### 7. Height and scrolling
expected: The dialog stays at 80% height across tabs, and the header and tab strip stay visible while scrolling Advanced, with no gap above the strip.
result: pending

### 8. Log, Categories and the Default settings page
expected: The Log and Categories modals show the header with "Log" / "Categories" and no Saved indicator; Settings > Game Defaults still renders with the neutral note, cards and its own footer.
result: pending

## Self-Check: PASSED

- Created files exist (SettingsModalHeader.tsx, tabs.ts, SettingsCard.tsx, index.scss, 4 new test files): FOUND
- Commits 21c670ce6, 3a67d0c85, 3ff5d2ad8 are ancestors of HEAD: FOUND
- Both todos present under .planning/todos/completed/ with `## Resolution`, absent from pending/: FOUND
