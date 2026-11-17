---
phase: 64-ui-to-edit-themes
plan: 09
subsystem: ui
tags: [themes, editor, react-router, useBlocker, notice-stack, i18n, dialogs]

requires:
  - phase: 64-04
    provides: "settingsState saveCustomThemeTokens ('saved' | 'applied' | 'failed'), renameCustomTheme"
  - phase: 64-06
    provides: "RenameThemeDialog, ButtonOptions.autoFocus, themeDialogs createElement-message pattern"
  - phase: 64-07
    provides: "ThemeEditor page, Save handler with the 'failed' branch, Back button"
  - phase: 64-08
    provides: "Editor commit()/TokenList wiring this plan builds on"
provides:
  - "useBlocker in the editor: Back and every route change while dirty open one 'Unsaved changes' prompt (Keep editing / Discard changes / Save theme, Save focused)"
  - "showUnsavedChangesDialog: a React-element message, fixed dialogId, MessageBoxModal-ordering-safe resolution (resolved flag plus queueMicrotask)"
  - "useThemeSaveFailedNotice (show/dismiss with a seq so a repeat failure re-shows) and the ThemeSaveFailedNotice bottom-right notice, registered in AppNoticeStack"
  - "Header Rename icon button opening the same RenameThemeDialog the gallery card uses (OD-5)"
affects: [64-10, presence baseline, theme editor live UAT]

actuals:
  tokens: 9600
  tasks: 3
  commits: 4
plan_head_before: e07ec081c30275f76bd056ca980db19ec84ac53e
plan_head_after: e083b2822562fd41cd67504e20ab7fc02024ec4f

tech-stack:
  added: []
  patterns:
    - "A dialog whose buttons and Escape/backdrop/X must mean different things marks itself resolved in each button onClick and defers the 'dismiss' action one microtask from onClose, because MessageBoxModal runs onClose BEFORE the clicked button's onClick"
    - "Handlers handed to an out-of-tree dialog read the latest save/blocker through a ref refreshed in an effect, so the blocked-state effect fires once per block without a stale closure"
    - "A notice that stays until dismissed keeps its rendered name in local state so the exit animation still shows text after the store cleared it"

key-files:
  created:
    - src/frontend/screens/Accessibility/ThemeEditor/unsavedChangesDialog.ts
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorLeave.test.tsx
    - src/frontend/state/ThemeSaveFailedNotice.ts
    - src/frontend/components/UI/ThemeSaveFailedNotice/index.tsx
    - src/frontend/components/UI/ThemeSaveFailedNotice/index.scss
    - src/frontend/components/UI/ThemeSaveFailedNotice/__tests__/ThemeSaveFailedNotice.test.tsx
  modified:
    - src/frontend/screens/Accessibility/ThemeEditor/index.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/index.scss
    - src/frontend/components/UI/NoticeStack/index.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/NoticeStack.test.tsx
    - src/frontend/components/UI/NoticeStack/__tests__/noticeStackStylesheetGate.test.ts
    - public/locales/en/gamelib.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "The unsaved prompt helper stays a .ts file and builds its message with createElement, matching themeDialogs.ts; the plan allowed .tsx but nothing needs JSX"
  - "A refused Save from the prompt calls blocker.reset() (stay), and so does a skipped save (one already in flight); only 'saved'/'applied' proceed"
  - "The save-failure notice has no auto-hide, like ReadOnlyStoresNotice: edits that did not reach disk must be acknowledged. It is not auto-dismissed on a later successful Save"
  - "noticeStackStylesheetGate treats Body as optional (as Action already was): the notice is one sentence, so it carries a Title only. A className naming Body must still carry the shared class"

requirements-completed: [THEME-02]

coverage:
  - id: C1
    description: "Back and any route change while the draft is dirty open one prompt with Keep editing, Discard changes and Save theme (focused, primary); Keep editing and Escape/backdrop/X stay with the draft intact, Discard leaves without writing, Save theme writes then leaves, a refused Save stays; a clean draft leaves at once"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorLeave.test.tsx#ThemeEditor leave prompt"
        status: pass
    human_judgment: false
  - id: C2
    description: "A refused Save shows the bottom-right notice with the curly-quoted name, announces nothing as saved, keeps Save enabled and the draft dirty; the notice stays until dismissed, exits through the phase fallback, and re-shows on a repeat failure"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/ThemeSaveFailedNotice/__tests__/ThemeSaveFailedNotice.test.tsx#ThemeSaveFailedNotice"
        status: pass
    human_judgment: false
  - id: C3
    description: "Header Rename sits between Back and Save theme in tab order, opens the shared Rename dialog, a valid rename updates the heading without dirtying the draft or tripping the leave prompt"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorLeave.test.tsx#header Rename"
        status: pass
    human_judgment: false
  - id: C4
    description: "How the notice and the prompt look in the real app: notice position and stacking beside the other toasts, exit animation, focus ring on the focused Save theme button, the header Rename icon across themes and RTL"
    requirement: THEME-02
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout, animation or theme tokens; the stack position, slot collapse and three-theme survival are live-UAT items (Plan 10)"

duration: 40min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 09: Leave prompt, save-failure notice and header Rename Summary

**Leaving the theme editor with unsaved edits now goes through one useBlocker-driven Save / Discard / Keep editing prompt, a refused Save raises a bottom-right notice and keeps the draft dirty, and the header gains a Rename button that opens the gallery's Rename dialog.**

## Performance

- **Duration:** about 40 min
- **Tasks:** 3 (tracer, auto, auto)
- **Commits:** 4 (tracer, notice, header Rename plus strings, gate scope)

## What was built

- **Leave prompt (D-06).** `useBlocker(({ currentLocation, nextLocation }) => dirty && !saving && pathname changed)`. A blocked blocker opens `showUnsavedChangesDialog` once per block. The Back button still navigates to `/accessibility`; the blocker intercepts it, so Back and any other route change share one dialog. Handlers read the latest blocker and `save` through a ref, so the effect that opens the dialog fires once per block.
- **Dialog resolution.** `MessageBoxModal` runs `onClose` before the clicked button's `onClick`, and Escape, the backdrop and X reach only `onClose`. Each button sets a local `resolved` flag; `onClose` closes the dialog by `dialogId` and defers "Keep editing" one microtask behind `if (!resolved)`. A button click is therefore never followed by a stray `blocker.reset()`, and Escape means Keep editing. The message is a React element (T-64-23).
- **Save from the prompt.** The page `save()` now returns its outcome (or `null` when one is already in flight). `saved`/`applied` call `blocker.proceed()`; `failed` or `null` call `blocker.reset()` and the editor stays.
- **Save-failure notice.** `useThemeSaveFailedNotice` (`name`, `seq`, `show`, `dismiss`); each `show` bumps `seq` so a repeat failure re-shows a dismissed notice. `ThemeSaveFailedNotice` copies the ReadOnlyStoresNotice shape (phase state, `useNoticePhaseFallback`, `useSuppressStoreEmbedWhile`, `renderNoticeSlot` with slot key `themeSaveFailed`, warning triangle, shared dismiss X) with no auto-hide. It is registered in `AppNoticeStack` after `ReadOnlyStoresNotice` and before `HumbleExpiryToast`. The editor's Save calls `show(theme.name)` on `failed`; nothing is announced as saved and the draft stays dirty.
- **Header Rename.** A `faPenToSquare` icon button (aria-label "Rename {{name}}") beside the theme name opens `RenameThemeDialog` for this theme. Tab order is Back, Rename, Save, then rows. Renaming never touches the token draft.
- **Strings and gate.** `unsavedTitle`, `unsavedBody`, `unsavedKeepEditing`, `unsavedDiscard`, `saveFailed`, `dismissNotice` under `customThemes.*`. The three new modules added to `i18nGateScope.json` (313 -> 316) and `i18nForkTouchedFiles.json` regenerated (434 -> 437).

## Task Commits

1. **Task 1 (tracer): leave prompt via useBlocker** - `d94feced7`
2. **Task 2: save-failure notice in the stack** - `ab124b14a`
3. **Task 3: header Rename and strings** - `1f9c0efa1`
4. **Task 3: gate scope** - `e083b2822`

## Tracer gate

Re-ran the Task 1 `<verify>` after its commit (ThemeEditor jest suites, `useBlocker` grep, `pnpm codecheck`, `--file-info` plus `prettier --check`): all green before expanding. Auto mode was off and `<verify>` is automated-only, so no checkpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] NoticeStack count test and stylesheet-gate table did not know the new notice**
- **Found during:** Task 2
- **Issue:** `NoticeStack.test.tsx` pins `AppNoticeStack` to three children, and `noticeStackStylesheetGate.test.ts` fails its discovery guards for any `renderNoticeSlot` caller or `AppNoticeStack` child not in its `SLOTS` table.
- **Fix:** added a `ThemeSaveFailedNotice` stub and a four-child expectation to `NoticeStack.test.tsx`; added the notice (tsx, scss, root base `themeSaveFailedNotice`) to the `SLOTS` table.
- **Files modified:** `NoticeStack/__tests__/NoticeStack.test.tsx`, `NoticeStack/__tests__/noticeStackStylesheetGate.test.ts`
- **Commit:** `ab124b14a`

**2. [Rule 3 - Blocking] Shared-parts gate required a `noticeStackBody` the one-sentence notice has no use for**
- **Found during:** Task 2
- **Issue:** `missingSharedClasses` demanded every shared part but Action. The notice text is one sentence (the plan's `saveFailed` key); splitting it into Title and Body would break the spec'd copy, and adding a title would invent copy.
- **Fix:** the gate now also treats Body as optional (the same way Action already was); the per-className loop still requires the shared class wherever a notice names a Body part.
- **Commit:** `ab124b14a`

**3. [Rule 3 - Blocking] genI18nGateScope count pins**
- **Found during:** Task 3 gate run
- **Issue:** `genI18nGateScope.test.ts` pins the scope and fork-touched counts (313 / 434); the three new modules moved them to 316 / 437.
- **Fix:** updated the pins and added the plan's history note, as Plans 07 and 08 did.
- **Commit:** `e083b2822`

**4. [Rule 3 - Blocking] ThemeEditor `index.scss` needed rules for the Rename button**
- **Found during:** Task 3
- **Issue:** the plan's file list omits the stylesheet, but the new name row and icon button need layout.
- **Fix:** `.themeEditor__nameRow` and `.themeEditor__rename` (logical properties only).
- **Commit:** `1f9c0efa1`

**Total deviations:** 4 auto-fixed (all Rule 3). **Impact:** none on scope; each is a test or stylesheet that had to learn about an added module.

## Verification run

- `pnpm exec jest src/frontend/screens/Accessibility src/frontend/components/UI/NoticeStack src/frontend/components/UI/ThemeSaveFailedNotice src/frontend/components/UI/ThemeSelector src/frontend/state`: 54 suites, 721 tests pass.
- Whole `meta/__tests__/hardcodedStringGate.test.ts`: pass (run after the scope and en-string changes). `meta/__tests__/genI18nGateScope.test.ts`: 26 pass, 1 skipped (after the pin update). `meta/__tests__/gamelibCatalogParity.test.ts`: pass.
- `pnpm codecheck` exit 0; `pnpm lint:src` exit 0; `pnpm find-deadcode` prints only the two pre-existing `NativePortDataStyle` / `NativePortMac` findings.
- `npx prettier --check` over every non-ignored path written, after a `--file-info` ignored check (`gamelib.json` is prettier-ignored).
- Acceptance greps: `RenameThemeDialog` in the editor 2, `ThemeSaveFailedNotice/index.tsx` in the scope 1, `ThemeSaveFailedNotice` in `NoticeStack/index.tsx` 2, `useBlocker` 2, `queueMicrotask` 1.
- Known failures not caused by this plan (`lintTranslations` REQ-41-02, `comparePresenceBaseline` R13) were not touched; the presence baseline was not regenerated (Plan 64-10).

## Known Stubs

None.

## Threat Flags

None. T-64-23 (the prompt message is a React element, the name renders as text) and T-64-24 (only a `true` from the checked write announces Saved; `failed` shows the notice and keeps the draft dirty; tests assert both) are covered as the plan's threat model names them.

## Issues Encountered

None. The first attempt at `getByLabelText(...).value` assertions was "fixed" by an eslint autofix that stripped needed casts; the test now uses the generic `getByLabelText<HTMLInputElement>`.

## Next Phase Readiness

Plan 10 can regenerate the presence baseline and run the live UAT: notice position and stacking beside the other toasts at the bottom right, Save theme focus ring in the prompt, the header Rename icon across themes and RTL.

## Self-Check: PASSED

All six created files and the nine modified files exist; the four task commits (`d94feced7`, `ab124b14a`, `1f9c0efa1`, `e083b2822`) are ancestors of HEAD.
