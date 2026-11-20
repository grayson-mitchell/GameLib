---
phase: 64-ui-to-edit-themes
plan: 07
subsystem: ui
tags: [themes, editor, react-colorful, colour-picker, i18n, container-queries]

requires:
  - phase: 64-04
    provides: "settingsState saveCustomThemeTokens, customThemeKey, validateColourInput / normaliseColour / safeColour"
  - phase: 64-05
    provides: "ThemeThumbnail, resolveThemeLabel"
  - phase: 64-06
    provides: "Edit and Duplicate on the gallery cards, which navigate to /accessibility/themes/<id>"
provides:
  - "Route accessibility/themes/:id and the ThemeEditor page: header, grouped core-token list, sticky live preview"
  - "ColourField: 32px swatch + react-colorful HexAlphaColorPicker in a MUI Popover + validated text input"
  - "tokenLabels.ts: literal t() labels for the 27 core tokens and six group headings"
  - "Draft-only editing: only the preview thumbnail paints from the draft; Save persists, and re-applies only when the edited theme is active"
  - "react-colorful 5.8.1 as a dependency (exact pin)"
affects: [64-08, 64-09, 64-10, theme editor Advanced list, unsaved-changes prompt]

actuals:
  tokens: 16000
  tasks: 3
  commits: 5
plan_head_before: ae13e61593f22e406834c271f5fb066a3bfdd7a8
plan_head_after: 710e04ed22d22a7fd4793e3d95091e598cf6f87f

tech-stack:
  added: ["react-colorful@5.8.1"]
  patterns:
    - "Editor page split into an outer ThemeEditor (route param + not-found) and an inner EditorBody keyed by theme id, so the draft hooks never sit behind a conditional return"
    - "Text field commits only the canonical form from validateColourInput; Enter commits only a valid entry, blur reverts an invalid one"
    - "Preview is first in the DOM and placed in column 2 by grid-column/grid-row on wide layouts, so the stacked layout needs no `order` and tab order matches visual order"
    - "jsdom has no fetch Request; a data-router test installs a minimal FakeRequest (url, method, headers, signal) on globalThis"

key-files:
  created:
    - src/frontend/screens/Accessibility/ThemeEditor/index.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/index.scss
    - src/frontend/screens/Accessibility/ThemeEditor/TokenList.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/TokenRow.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/PreviewPane.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/ColourField.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/tokenLabels.ts
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ColourField.test.tsx
  modified:
    - src/frontend/App.tsx
    - package.json
    - pnpm-lock.yaml
    - public/locales/en/gamelib.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "The invalid-colour input border uses --text-default, not --status-danger: UI-SPEC reserves the danger colour for Delete only, and the error is already carried by text plus aria-invalid"
  - "Enter on invalid text leaves the error showing (no revert); only blur reverts to the last good value. A blur on an unchanged valid value does not call onCommit"
  - "The Rename icon button beside the theme name is not in this plan's task list and is left to Plan 09 (with the unsaved-changes prompt), as the plan text says"
  - "The popover paper class is passed through a module-level const carrying a declaration-level i18n-gate-exempt marker, since the gate flags a bare object-property literal"

requirements-completed: [THEME-02]

coverage:
  - id: T1
    description: "Edit/Duplicate land on a split-pane editor at accessibility/themes/<id> listing the 27 core tokens in six groups; typing a colour repaints only the preview thumbnail while the running app's body classes and inline properties stay as saved"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx#ThemeEditor"
        status: pass
    human_judgment: false
  - id: T2
    description: "Save persists through saveCustomThemeTokens; re-applies and says 'Saved and applied' only when the theme is active, otherwise 'Saved' with no setTheme; a rejected write announces nothing and stays dirty; an unknown id shows 'Theme not found' with a way back"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx#ThemeEditor"
        status: pass
    human_judgment: false
  - id: T3
    description: "Save is disabled until something changes and while a save is pending (two clicks write once); the inactive-theme note shows only while the edited theme is not active; Back returns to /accessibility when clean"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx#writes once for a double click while the save is pending"
        status: pass
    human_judgment: false
  - id: T4
    description: "ColourField: typed rgba() commits canonical hex; invalid or cleared text shows the colour error, commits nothing and reverts on blur; swatch aria-label; picker opens from the swatch, Escape closes it and returns focus; an alpha-slider change commits the picker's canonical hex; no native colour input"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ColourField.test.tsx#ColourField"
        status: pass
    human_judgment: false
  - id: T5
    description: "Narrow window: below about 760px the editor stacks with a non-sticky preview and stays usable at the minimum macOS window size; RTL layout of the split pane; the look of the editor chrome on midnightMirage, gruvbox_dark and dracula"
    requirement: THEME-02
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout or container queries; the stacked layout, sticky preview, RTL mirroring and three-theme survival are live-UAT items (Plan 10). The SCSS uses logical properties only, checked by grep"

duration: 45min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 07: Theme editor Summary

**A split-pane editor at `/accessibility/themes/:id`: grouped core-token rows with a react-colorful alpha picker and validated text field, a live preview thumbnail that is the only thing painting from the unsaved draft, and Save that persists and re-applies only when the edited theme is active.**

## Performance

- **Duration:** about 45 min
- **Tasks:** 3 (tracer, TDD, auto)
- **Commits:** 5 task commits (tracer, RED, GREEN, layout and strings, gate scope)

## What was built

- **Route and page.** `App.tsx` gains `accessibility/themes/:id` directly after `accessibility`, so the Settings tier-2 Appearance row stays active. `ThemeEditor` reads `id`, finds the theme in `customThemes`, and renders either "Theme not found" (heading, body, "Back to Appearance") or `EditorBody`, which holds the `draft`. The page never touches `document.body`; only `saveCustomThemeTokens` can change the running app (D-05).
- **Save.** `dirty` is the draft differing from the stored tokens; the button is disabled when clean or while saving, and an in-flight ref makes a double click write once. `applied` -> "Saved and applied", `saved` -> "Saved", `failed` -> nothing announced and the draft stays dirty (Plan 09 adds the toast).
- **Token list.** `CORE_TOKEN_GROUPS` rendered as six `h2` groups of `TokenRow`s (label, monospace token name, `ColourField`). Labels and group headings come from `tokenLabels.ts`, one literal `t()` per case.
- **ColourField.** 32px swatch (checkerboard from token colours under the painted colour) opening a 232px MUI `Popover` with `HexAlphaColorPicker`; a 128px text input with a native `input` listener. Typing validates through `validateColourInput`; Enter or blur commits the canonical `#rrggbb[aa]`; invalid text shows the error and blur reverts. No native colour input.
- **Layout.** `container-type: inline-size` page; two columns `minmax(360px, 480px)` / `minmax(320px, 1fr)` with a 32px gap and a sticky preview; at `@container (max-width: 760px)` one column, preview first, static, `max-inline-size: 360px`. Logical properties only.
- **Header.** Ghost Back button (arrow + "Appearance"), `h1.headerTitle` "Edit theme", theme name with "Based on {{base}}", the "Unsaved changes" marker (accent dot) while dirty, the Save theme button, the inactive-theme note and the polite live region.
- **Strings and gate.** 47 editor keys under `customThemes.*` in `gamelib.json` (14 flat, 27 `token.*`, 6 `group.*`); the six ThemeEditor source files added to `i18nGateScope.json` (305 -> 311) and `i18nForkTouchedFiles.json` regenerated (426 -> 432).

## Task Commits

1. **Task 1 (tracer): route, rows, draft-only preview, Save** - `5bb146d01`
2. **Task 2 RED: failing ColourField tests** - `cde5c3502`
3. **Task 2 GREEN: ColourField, react-colorful, TokenRow wiring** - `c331ec14a`
4. **Task 3: header, layout, strings, tests** - `eb33e8668`
5. **Task 3: gate scope** - `710e04ed2`

## Tracer gate

Re-ran the Task 1 `<verify>` end to end after the commit (ThemeEditor jest suite 5/5, `pnpm codecheck`, route count 1, `document.body` count 0, prettier): all green before expanding. Auto mode was off and `<verify>` is automated-only, so no checkpoint.

## TDD (Task 2)

- **RED:** `ColourField.test.tsx` (8 tests) against an empty `ColourField` stub: 7 failed, 1 passed. The 7 failures are `TestingLibraryElementError: Unable to find an accessible element with the role "textbox"/"button"` raised from the target tests' own queries, i.e. the planned behaviours were asserted and absent. The one pass is the negative invariant "never renders a native colour input", which a stub trivially satisfies. `semanticAssessment`: valid RED, the targets executed and failed on the intended missing behaviour (not a syntax, import or fixture fault). The repo's jest output is not one of the `gsd_run check tdd-red-evidence` formats (TAP, JUnit, swift-testing, unittest, go test) and `jest-junit` is not installed, so the classifier was not run; the assessment is manual from the unmodified jest output.
- **GREEN:** two things differed from the RED tests and were corrected in the GREEN commit. (1) The implementation initially let Enter on invalid text revert the field, so the later blur committed the reverted value; Enter now commits only a valid entry and blur reverts. (2) The RED test guessed the alpha step as `#336699fc`; react-colorful's keyboard step is 0.05, so the real emission is `#336699f2`, and the test sends `keyCode: 37` because the library reads `keyCode`, not `key`. The test was corrected, the implementation was not bent to it.
- **REFACTOR:** none.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom has no fetch `Request` for the data router**
- **Found during:** Task 1
- **Issue:** `createMemoryRouter` builds a `Request` on every navigation; jsdom does not expose one, so the Back button test crashed the worker.
- **Fix:** the test installs a minimal `FakeRequest` (url, method, headers, signal) on `globalThis`.
- **Files modified:** `ThemeEditor/__tests__/ThemeEditor.test.tsx`
- **Commit:** `5bb146d01`

**2. [Rule 1 - Bug] `jest.fn()` implementation reset between tests**
- **Found during:** Task 1
- **Issue:** the jest config resets mock implementations, so the `storeSetChecked` stub resolved `undefined` and Save reported `failed`.
- **Fix:** a plain recorder function with a call array instead of `jest.fn()`.
- **Commit:** `5bb146d01`

**3. [Rule 1 - Bug] Enter on invalid text reverted the field and a later blur committed the reverted value**
- **Found during:** Task 2 GREEN
- **Fix:** see TDD GREEN above.
- **Commit:** `c331ec14a`

**4. [Rule 3 - Blocking] hardcoded-string gate flagged the popover class-name object property**
- **Found during:** Task 3 gate run
- **Issue:** `slotProps={{ paper: { className: 'colourField__popover' } }}` read as a user-facing object-property literal.
- **Fix:** moved to a module-level const with a declaration-level `i18n-gate-exempt` marker (never file-level).
- **Commit:** `710e04ed2`

**5. [Rule 1 - Colour contract] invalid-input border colour**
- **Issue:** the first stylesheet used `--status-danger` on the invalid input; UI-SPEC reserves that colour for Delete only.
- **Fix:** `--text-default` border plus the error text and `aria-invalid`.
- **Commit:** `eb33e8668`

None of these changed the plan's scope.

## Verification run

- `pnpm exec jest src/frontend/screens/Accessibility`: 4 suites, 25 tests pass.
- Whole `meta/__tests__/hardcodedStringGate.test.ts`: 176/176 pass (after deviation 4; the first full run had the one popover violation). `meta/__tests__/genI18nGateScope.test.ts`: 26 pass, 1 skipped. `meta/__tests__/gamelibCatalogParity.test.ts` passes.
- `pnpm codecheck` exit 0; `pnpm lint:src` exit 0 with no finding in a ThemeEditor file; `pnpm find-deadcode` prints only the two pre-existing `NativePortDataStyle` / `NativePortMac` findings in `src/common/nativePortCatalogue.ts`.
- `npx prettier --check` over every non-ignored path written, after a `--file-info` ignored check. `pnpm-lock.yaml` and `gamelib.json` are prettier-ignored.
- Physical inline-direction property grep over `index.scss`: 0.
- Known failures not caused by this plan (`lintTranslations` REQ-41-02, `comparePresenceBaseline` R13) were not run against or touched; the presence baseline was not regenerated (Plan 64-10).

## Known Stubs

None. (`TokenRow` and `ColourField` take real values; the Advanced list, contrast warnings and chips are later plans' scope, not stubs.)

## Threat Flags

None. The only new trust-boundary surface is the one the plan's threat model names: T-64-18 (only canonical values enter the draft), T-64-19 (the draft feeds only the preview through `safeColour`; the app changes only via `saveCustomThemeTokens`, which re-validates) and T-64-SC (exact `react-colorful@5.8.1`, lockfile committed, audit verdict OK; no human checkpoint required).

## Issues Encountered

`pnpm add` reported `Packages: +4 -170`. The lockfile diff is only the 14 react-colorful lines; the 170 removals were already-stale `node_modules` entries not in the lockfile, and the full suite and `codecheck` still pass afterwards.

## Next Phase Readiness

Plan 08 can add the Advanced disclosure, chips and contrast warnings to `TokenRow` / `TokenList` (`ColourField` already takes `describedBy` for the warning id). Plan 09 can route Back and route changes through the unsaved-changes prompt (`useBlocker` works under the data router the tests already use), add the header Rename button and the save-failure toast. The live checks for stacking at the minimum window, RTL and the three-theme survival belong to Plan 10's UAT.

## Self-Check: PASSED

All nine created files and the seven modified files exist; the five task commits (`5bb146d01`, `cde5c3502`, `c331ec14a`, `eb33e8668`, `710e04ed2`) are ancestors of HEAD.
