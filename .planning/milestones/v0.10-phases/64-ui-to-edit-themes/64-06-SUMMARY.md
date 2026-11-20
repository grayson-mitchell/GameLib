---
phase: 64-ui-to-edit-themes
plan: 06
subsystem: ui
tags: [themes, gallery, dialogs, i18n, duplicate, rename, delete]

requires:
  - phase: 64-04
    provides: "settingsState duplicateTheme / renameCustomTheme / deleteCustomTheme, validateThemeName, resolveThemeKey, MAX_CUSTOM_THEMES"
  - phase: 64-05
    provides: "ThemeGallery / ThemeCard (the Built-in group and the card `actions` slot)"
provides:
  - "Your themes gallery group: empty state, or custom cards in stored order in the same auto-fill grid"
  - "ThemeCardActions: 32px icon buttons (Edit, Duplicate, Rename, Delete) with MUI tooltips and aria-labels naming the theme"
  - "Duplicate on every card: frozen '<name> copy' (numbered when taken), not applied, lands in /accessibility/themes/<id>"
  - "RenameThemeDialog: one dialog for the card and (Plan 09) the editor header, with empty / over-60 / taken validation"
  - "themeDialogs.ts: showThemeLimitDialog and confirmDeleteTheme over showDialogModal, messages as React elements"
  - "ButtonOptions.autoFocus: serializable default-focus flag honoured by MessageBoxModal"
affects: [64-07, 64-09, 64-10, theme gallery, theme editor header]

actuals:
  tokens: 15800
  tasks: 3
  commits: 5
plan_head_before: ed4245cebb8b2d9056fc232240cdc14e1883c7d5
plan_head_after: 77555d65f72e4eea24a2a654f792a53601867aa3

tech-stack:
  added: []
  patterns:
    - "Dialog messages that carry a user-typed name are React elements built with createElement in a .ts module, so MessageBoxModal's string path (textarea.innerHTML entity decoding) never sees them"
    - "Rename error is rendered under the field (role=alert, aria-describedby) rather than through TextInputField's `warning`, because that prop hides itself when the value is empty and the empty-name error must show"
    - "A Dialog-primitive consumer is mounted only while open (`if (!open) return null`), because the primitive suppresses the store embed for as long as it exists"

key-files:
  created:
    - src/frontend/components/UI/ThemeSelector/ThemeCardActions.tsx
    - src/frontend/components/UI/ThemeSelector/RenameThemeDialog.tsx
    - src/frontend/components/UI/ThemeSelector/themeDialogs.ts
    - src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx
    - src/frontend/components/UI/ThemeSelector/__tests__/RenameThemeDialog.test.tsx
    - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/__tests__/autoFocus.test.tsx
  modified:
    - src/frontend/components/UI/ThemeSelector/ThemeGallery.tsx
    - src/frontend/components/UI/ThemeSelector/index.scss
    - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.tsx
    - src/common/types.ts
    - public/locales/en/gamelib.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Duplicate never calls setTheme (OD-6): the copy is stored, its editor opens, and the user applies it from its card"
  - "The Delete fallback name mirrors deleteCustomTheme: the deleted theme's built-in base, else the default theme (midnightMirage)"
  - "A single `t` is passed to confirmDeleteTheme (no separate tGamelibLabel): resolveThemeLabel uses explicit gamelib: keys, so one t serves both"

requirements-completed: [THEME-01, THEME-02]

coverage:
  - id: T1
    description: "Your themes group: empty state at zero custom themes; custom cards in stored order in the same grid; equal names or tokens stay separate cards keyed by their own key"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx#ThemeGallery: Your themes group"
        status: pass
    human_judgment: false
  - id: T2
    description: "Duplicate creates '<name> copy' / '<name> copy 2', does not apply it and opens the editor route; Edit opens the same route; Duplicate at 50 shows 'Theme limit reached' with one 'Close message' button and adds nothing"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx#Duplicate adds \"<name> copy\", does not apply it and opens its editor"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx#refuses Duplicate at the cap with the limit dialog and adds nothing"
        status: pass
    human_judgment: false
  - id: T3
    description: "Rename dialog opens from the card on the current name (focused, selected); empty, 61-character and case-different taken names show their error and keep 'Rename theme' disabled; a valid name renames through the store and closes"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/RenameThemeDialog.test.tsx#RenameThemeDialog"
        status: pass
    human_judgment: false
  - id: T4
    description: "Delete confirms first with 'Keep theme' focused and 'Delete theme' danger; the active theme's dialog names the fallback ('Nord Light' for a nord-light copy) and confirming switches to it; messages are React elements and a markup-bearing name renders as text"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx#Delete"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/DialogHandler/components/MessageBoxModal/__tests__/autoFocus.test.tsx#MessageBoxModal button autoFocus"
        status: pass
    human_judgment: false
  - id: T5
    description: "Tooltips on hover and keyboard focus, the 32px icon row, the danger tint on Delete hover/focus, truncation of a long theme name and the dialog's look in the running app"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSelector/__tests__/ThemeGalleryCustom.test.tsx#gives a custom card Edit and Duplicate (and no built-in-only affordance)"
        status: pass
    human_judgment: true
    rationale: "jsdom has no layout, hover or paint; the aria-labels are asserted, the visual contract and tooltip behaviour are checked live in Plan 10's UAT"

duration: 30min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 06: Your themes group and management actions Summary

**The gallery gains a "Your themes" group with Duplicate on every card and Edit, Rename and Delete on custom cards, backed by a reusable Rename dialog, a limit dialog and a Delete confirmation whose default focus is "Keep theme" (new `ButtonOptions.autoFocus`).**

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-11-17T20:03Z
- **Tasks:** 3 (one tracer, two auto)
- **Files modified:** 14 (6 new, 8 modified)

## Accomplishments

- Task 1 (tracer): `ThemeGallery` renders a second labelled group. Zero custom themes shows "No custom themes yet" plus its body; otherwise one `ThemeCard` per stored theme, in stored order, keyed by `custom:<id>`. `ThemeCardActions` gives every card Duplicate (tooltip "Duplicate", aria-label "Duplicate {{name}}") and custom cards Edit. Duplicate names the copy through i18n, never applies it, and navigates to `/accessibility/themes/<id>`; at the 50-theme cap it shows "Theme limit reached" with one "Close message" button. The tracer passed jest, codecheck and prettier end to end before expansion.
- Task 2: `RenameThemeDialog` on the in-repo `Dialog` wrappers with a `TextInputField`; the name is focused and selected on open; `validateThemeName` drives the three errors; "Rename theme" is disabled while invalid or unchanged; Enter submits; Escape, "Keep name" and the backdrop (unless `disableDialogBackdropClose`) close it. The card's Rename button opens it. Gate scope recorded (302 to 305 scope files, 423 to 426 fork-touched).
- Task 3: `ButtonOptions.autoFocus` plus `autoFocus={button.autoFocus}` in `MessageBoxModal`; `confirmDeleteTheme` with "Keep theme" focused and "Delete theme" in the danger style, naming the fallback when the active theme is deleted; the limit dialog's single button is also `autoFocus`.

## Task Commits

1. Task 1 (tracer): `ae7f0bbab` feat(64-06): Your themes group with Duplicate, Edit and the limit refusal
2. Task 2: `3953e43e8` feat(64-06): Rename dialog from the card with validation; `012f8a858` test(64-06): type the Rename dialog input lookups without assertions (lint fix); `f53d1dfb2` chore(64-06): record the gallery management modules in the i18n gate scope
3. Task 3: `77555d65f` feat(64-06): Delete with confirmation and default focus

`actuals.commits: 5` is the measured `rev-list --count` from the ledger base; all five are this plan's own commits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `genI18nGateScope.test.ts` count pins**
- **Found during:** Task 2 (gate scope)
- **Issue:** The test pins the hand-curated scope at 302 files and the fork-touched set at 423; adding the three modules (305 / 426) turns it red. The plan did not list the file.
- **Fix:** Updated the pins and added the dated log paragraph (the 64-05 precedent); appended a `generatedBy` clause to `i18nGateScope.json`.
- **Files modified:** `meta/__tests__/genI18nGateScope.test.ts`, `meta/i18nGateScope.json`, `meta/i18nForkTouchedFiles.json`
- **Commit:** `f53d1dfb2`

**2. [Rule 1 - Bug] Rename error cannot go through `TextInputField`'s `warning` prop**
- **Found during:** Task 2
- **Issue:** `TextInputField` renders `{value && warning}`, so the "Enter a name." error (value empty) would never show.
- **Fix:** The error is a `<p role="alert">` under the field, linked by `aria-describedby`, styled with `--status-danger`.
- **Files modified:** `RenameThemeDialog.tsx`, `index.scss`
- **Commit:** `3953e43e8`

**3. [Rule 1 - Bug] Lint errors in two new tests**
- **Found during:** Task 2 (post-commit lint)
- **Issue:** `no-unnecessary-type-assertion` on `getByLabelText(...) as HTMLInputElement`. A first `--fix` produced code tsc rejected, so it was reverted.
- **Fix:** `getByLabelText<HTMLInputElement>(...)`.
- **Commit:** `012f8a858`

**4. [Interface simplification] `ThemeCardActions` and `confirmDeleteTheme` signatures**
- The plan sketched `ThemeCardActions({ themeKey, name, custom, ... })` and `confirmDeleteTheme({ t, tGamelibLabel, ... })`. `themeKey` and `custom` would be unused (Edit, Rename and Delete render only when their handler is passed), and `resolveThemeLabel` uses explicit `gamelib:` keys, so one `t` serves both. Both props were dropped. No behaviour change.

**Total deviations:** 4 (1 Rule 3, 2 Rule 1, 1 interface simplification). **Impact:** none on the delivered contract.

## Auth Gates

None.

## Issues Encountered

- Verification: `pnpm codecheck` exit 0; `pnpm lint:src` exit 0 (production ratchet PASS; 0 errors); jest over `ThemeSelector` and `DialogHandler` 58 passed plus the whole `meta/__tests__/hardcodedStringGate.test.ts` file (scope-orchestration case included) and `genI18nGateScope.test.ts` passing on the final tree (275 passed, 1 skipped); `pnpm find-deadcode` prints only the two pre-existing `NativePort*` findings; prettier clean over every non-ignored written path (`public/locales/en/gamelib.json` is prettier-ignored, so its shape was hand-matched: 4-space indent, keys sorted).
- Known pre-existing failures left alone: `lintTranslations` REQ-41-02 and `comparePresenceBaseline` R13 (the new `customThemes.*` keys drift the presence baseline, which Plan 64-10 regenerates by design; not regenerated here), the `pnpm planning-gates` preload-surface-gate, and the `NativePort*` knip findings.
- `public/locales/en/gamelib.json` was clean at the start, so only this plan's hunks were staged. The working tree's other dirty files (`.planning/...`) were not touched.
- Owed to Plan 10 (live): tooltips on hover and keyboard focus, the card action row look, long-name truncation, the Rename dialog's text pre-selection under the Tauri window's gamepad tab hack (`Dialog` fires two simulated tab presses on mount, after the input has taken focus), and the Delete dialog's default focus on a real WKWebView.
- The editor route `accessibility/themes/:id` lands in Plan 07; until then Duplicate and Edit navigate to a path with no route.

## Known Stubs

None. Duplicate and Edit navigate to the editor route Plan 07 adds, which is a declared dependency, not a stub of this plan's goal.

## Threat Flags

None. T-64-16 (user-typed name in dialog messages) is mitigated and tested: messages are React elements and a name of `<b>x</b> &amp; y` renders as literal text. T-64-17 (cap) is enforced by `duplicateTheme` and covered by the limit-refusal test.

## Self-Check: PASSED

- Files: `ThemeCardActions.tsx`, `RenameThemeDialog.tsx`, `themeDialogs.ts`, the three new test files all present.
- Commits: `ae7f0bbab`, `3953e43e8`, `012f8a858`, `f53d1dfb2`, `77555d65f` all ancestors of HEAD.
