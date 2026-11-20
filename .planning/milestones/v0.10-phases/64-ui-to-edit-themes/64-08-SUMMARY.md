---
phase: 64-ui-to-edit-themes
plan: 08
subsystem: ui
tags: [themes, editor, contrast, wcag, gradient, i18n, react]

requires:
  - phase: 64-01
    provides: "CONTRAST_FLOORS / checkFloors / formatRatio / tryContrast"
  - phase: 64-02
    provides: "LIVE_DERIVED_TOKENS, NON_COLOUR_TOKENS, CORE_TOKENS, builtinSeed"
  - phase: 64-04
    provides: "isValidGradient / looksLikeGradient (fail-closed CSS.supports gate), validateColourInput"
  - phase: 64-05
    provides: "PREVIEW_TOKENS, BASE_OVERRIDDEN_TOKENS"
  - phase: 64-07
    provides: "ThemeEditor page, TokenList / TokenRow / PreviewPane / ColourField, tokenLabels"
provides:
  - "Live contrast warnings (triangle + text) under BOTH rows of a failing CONTRAST_FLOORS pair, aria-describedby on each input, and a polite plural summary in the preview column; never blocks Save"
  - "AdvancedSection: collapsed disclosure ('<n> more tokens') with a Filter tokens input over every non-core token sorted by name; --focus-ring-width never listed"
  - "GradientField: raw-text gradient editing validated by isValidGradient, commit on blur, revert on invalid, 24px strip painted only from the last valid value"
  - "Derived / Not in preview / Set by base theme chips on the label line with icon-only (i) help (FieldLabel help slot + InfoIcon)"
  - "Clearing a live-derived token removes it from the draft so it follows its source again (OD-1)"
affects: [64-09, 64-10, theme editor unsaved-changes prompt, presence baseline]

actuals:
  tokens: 10500
  tasks: 3
  commits: 6
plan_head_before: 67bf9910c1418b385baa1238327146f88138991e
plan_head_after: 9b2adc1b6956d55a89333faa1535e0dc38955ea5

tech-stack:
  added: []
  patterns:
    - "A row's warnings are rendered inside its card as full-width flex children (flex-wrap), so a warning sits under its own row and the row count the editor tests rely on is unchanged"
    - "Gradient validity is checked only for an EDITED value: an untouched stored value never shows an error, but the strip still refuses to paint anything isValidGradient does not accept (fails closed in jsdom)"
    - "A live-derived token's field is empty by design; an empty commit ('') means 'follow the source' and the editor's commit() deletes the key from the draft"
    - "Help is an icon-only (i) in FieldLabel's help slot; chips are the shared _pillChip mixin made static (hover reset, no accent)"

key-files:
  created:
    - src/frontend/screens/Accessibility/ThemeEditor/AdvancedSection.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorWarnings.test.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx
  modified:
    - src/frontend/screens/Accessibility/ThemeEditor/TokenList.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/TokenRow.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/PreviewPane.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/ColourField.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/index.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/tokenLabels.ts
    - src/frontend/screens/Accessibility/ThemeEditor/index.scss
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx
    - public/locales/en/gamelib.json
    - meta/i18nForkTouchedFiles.json
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts

key-decisions:
  - "Warning text stays --text-default; only the triangle and the 3px inline-start rule use --status-warning (UI-SPEC), so it stays readable on nord-light"
  - "A derived token's text field is empty until set; an empty commit clears it from the draft. This needed a one-line change to ThemeEditor/index.tsx commit() (the plan said not to touch it for the summary; the clear-from-draft rule in the plan context could not be met without it)"
  - "The gradient strip exposes the validated value in a data-gradient attribute because jsdom's cssstyle silently drops gradients from inline style, so the T-64-21 'paints only the last valid value' property would otherwise be untestable"
  - "resolveFloorPairLabels takes the whole failure (id, fg, bg) instead of just the id so an unknown floor id falls back to its two token names rather than blank text"

patterns-established:
  - "Declaration-level `i18n-gate-exempt` must be a JSDoc block immediately before a module-level declaration; a line comment before a statement inside a function body is not honoured by the gate"

requirements-completed: [THEME-02]

coverage:
  - id: D1
    description: "A row whose token is in a failing contrast pair shows an inline warning (triangle + 'Border vs body 2.1:1, needs 3:1') under both rows of the pair, input aria-describedby points at it, and the preview column carries '1 contrast warning' / 'N contrast warnings' / 'No contrast warnings' in a polite live region; Save stays enabled; a fully transparent value drops the warning without throwing"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorWarnings.test.tsx#theme editor contrast warnings"
        status: pass
    human_judgment: false
  - id: D2
    description: "Advanced is collapsed with '<count> more tokens'; open it shows a Filter tokens input and every non-core token sorted by name (live-derived included, --focus-ring-width excluded); a miss says 'No tokens match “<query>”.'"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx#AdvancedSection"
        status: pass
    human_judgment: false
  - id: D3
    description: "Gradient tokens are raw CSS text with a preview strip: accepted only through isValidGradient (var(, url(, ;, {, }, @, !important refused even when CSS.supports says true), commit on blur, revert on invalid, strip paints only the last valid value; no picker"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx#GradientField"
        status: pass
    human_judgment: false
  - id: D4
    description: "Derived / Not in preview / Set by base theme chips on the label line with icon-only (i) help naming the source or base; clearing a live-derived token returns the theme to clean (not dirty)"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditorWarnings.test.tsx#theme editor chips"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx#keeps a live-derived token out of the draft"
        status: pass
    human_judgment: false
  - id: D5
    description: "How the warnings, chips, (i) popovers, Advanced disclosure and gradient strip look and lay out in the real window: wrapping of a row that carries two warnings plus chips, the (i) popover position inside the label column, RTL mirroring, and survival on midnightMirage, gruvbox_dark and dracula"
    requirement: THEME-02
    verification: []
    human_judgment: true
    rationale: "jsdom has no layout; styles use logical properties only (checked by grep) and compile with sass, but the visual result is a live-UAT item (Plan 10)"

duration: 50min
completed: 2026-11-18
status: complete
---

# Phase 64 Plan 08: Contrast warnings, Advanced section and chips Summary

**The token list now tells the user, live and without blocking Save, when an edit drops Border/Accent under a 3:1 floor; every other resolved token is editable behind a filterable Advanced disclosure (gradients as validated raw text), and rows explain themselves with Derived / Not in preview / Set by base theme chips whose help sits behind an icon-only (i).**

## Performance

- **Duration:** about 50 min
- **Tasks:** 3 (tracer, TDD, auto)
- **Commits:** 6 (tracer, RED, GREEN, chips/styles/strings, fix, gate scope)
- **Files:** 17 changed, +1224 / -32

## What was built

- **Warnings (Task 1, tracer).** `TokenList` and `PreviewPane` each compute `checkFloors(draft)` (memoised). A row gets the failures whose `fg` or `bg` is its token, so the Border row carries both border pairs and Body background carries border-body plus accent-body. Text comes from literal `t()` calls (`resolveFloorPairLabels` for Border/body, Border/dialog, Accent/body) with the ratio from `formatRatio` (truncated, never rounded). The preview column's summary is a plural-aware `role="status" aria-live="polite"` line.
- **Advanced (Task 2).** `AdvancedSection` builds the universe from the base seed keys, the draft keys and `LIVE_DERIVED_TOKENS`, minus `CORE_TOKENS` and `NON_COLOUR_TOKENS`, sorted by name; collapsed by default; rows mount only while open. The filter matches token name or label, case-insensitively, via a native `input` listener. `--gradient-body-background` is always a gradient row; any other token whose value `looksLikeGradient` is too.
- **GradientField (Task 2).** Two-row monospace textarea, no picker. `isValidGradient` on every change, error under the field while an edit is invalid, commit on blur when valid, revert on blur when invalid, 24px strip from the last valid value only (T-64-21).
- **Chips (Task 3).** Derived (help names the source token's label), Not in preview (no help text exists, so no (i)), Set by base theme (help names the base). Styles use the shared pill chip, made static.

## TDD (Task 2)

- **RED** (`23d305b85`): 20 tests written against empty-component stubs so the failure is on the assertions, not a missing module. Run output: 7 AdvancedSection tests fail on "Unable to find an accessible element with the role button and name /Advanced/", 13 GradientField tests fail on "Unable to find an accessible element with the role textbox". Target tests ran and failed for the planned reason (the component does not render the behaviour yet). `gsd_run check tdd-red-evidence` was not run: jest emits none of the classifier's supported report formats (TAP / JUnit / go / swift-testing / unittest) and no reporter for them is installed; adding one would be a new package install, which this plan does not authorise. `semanticAssessment`: valid RED, target assertions executed and failed on the planned behaviour, no syntax / load / fixture fault.
- **GREEN** (`51ee22253`): 43 ThemeEditor tests pass (50 across `src/frontend/screens/Accessibility`).
- **REFACTOR:** none needed.

## Tracer gate

After Task 1: `pnpm exec jest src/frontend/screens/Accessibility/ThemeEditor/__tests__` (22 passed) and `pnpm codecheck` re-run end-to-end, both green. Tracer verified end-to-end, expansion proceeded.

## Verification

| Check | Result |
| --- | --- |
| `pnpm exec jest src/frontend/screens/Accessibility meta/__tests__/genI18nGateScope.test.ts meta/__tests__/gamelibCatalogParity.test.ts` | 280 passed, 1 skipped |
| `meta/__tests__/hardcodedStringGate.test.ts` (whole file, 313-file scope) | 176 / 176 passed |
| `pnpm codecheck` | exit 0 |
| `node meta/lintScoped.cjs --src` (`pnpm lint:src`) | exit 0 (warnings only, none in files this plan touched) |
| `pnpm find-deadcode` | only the two pre-existing `NativePortDataStyle` / `NativePortMac` findings |
| `prettier --check` over every non-ignored path written (gamelib.json is prettier-ignored) | clean |
| Acceptance: `grep -c "checkFloors(" TokenList.tsx` | 1 (>= 1) |
| Acceptance: `grep -c "isValidGradient" GradientField.tsx` | 6 (>= 1) |
| Acceptance: `grep -c "ThemeEditor/GradientField.tsx" meta/i18nGateScope.json` | 1 |
| en catalog keys named in Task 3 `<verify>` | all present |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing editor tests collided with the second `role="status"` region**
- **Found during:** Task 1
- **Issue:** the plan puts the contrast summary in `<p role="status">`; four Plan 07 tests used `screen.getByRole('status')` and now found two.
- **Fix:** `ThemeEditor.test.tsx` reads the header status through a `headerStatus()` helper (`.themeEditor__status`).
- **Files modified:** `src/frontend/screens/Accessibility/ThemeEditor/__tests__/ThemeEditor.test.tsx`
- **Commit:** 3e99f709a

**2. [Rule 3 - Blocking] A live-derived token had no way to be cleared, and Advanced needs the base**
- **Found during:** Task 2
- **Issue:** the plan requires "clearing a derived value removes it from the draft" and Advanced needs `base` for `builtinSeed`, but `ThemeEditor/index.tsx` stored `''` verbatim and did not pass `base` to `TokenList`. The plan says not to modify `index.tsx` (Plan 09 owns it), which was written about where the warning count is computed.
- **Fix:** minimal edit to `index.tsx`: `commit()` deletes the key when the value is `''`, and `TokenList` receives `base={theme.base}`. `ColourField` gained an `allowEmpty` prop (derived tokens only). An editor-level test proves set-then-clear returns to a clean draft. Plan 09 executes after this plan, so there is no concurrent edit; flagged here for it.
- **Files modified:** `index.tsx`, `ColourField.tsx`, `TokenList.tsx`, `ThemeEditor.test.tsx`
- **Commit:** 51ee22253

**3. [Rule 3 - Blocking] i18n gate flagged the warning DOM id; find-deadcode flagged an export**
- **Found during:** Task 3 verification (full `hardcodedStringGate.test.ts` run)
- **Issue:** the template literal `${inputId}-warn-${failure.id}` was read as a user-facing literal (the line comment marker inside a function body was not honoured); `advancedTokens` was exported but used only inside its file.
- **Fix:** module-level `warningId` helper under a JSDoc `i18n-gate-exempt` marker; `advancedTokens` un-exported.
- **Commit:** 86b8a11bb

**4. [Rule 3 - Blocking] Gate scope count pins**
- **Issue:** adding two files to scope moves the pins in `meta/__tests__/genI18nGateScope.test.ts` (not in the plan's file list).
- **Fix:** 311 -> 313 scope, 432 -> 434 fork-touched, plus the dated note, as Plans 64-05/06/07 did.
- **Commit:** 9b2adc1b6

**5. [Rule 1 - Bug in plan's test seam] jsdom drops gradients from inline style**
- **Issue:** `style.backgroundImage` is always `''` in jsdom's cssstyle, so "the strip paints only the last valid gradient" could not be observed.
- **Fix:** the strip also carries the validated value in `data-gradient`; the tests assert on that (and that `style.backgroundImage` is empty for an untrusted stored value).
- **Commit:** 51ee22253

### Plan-text differences (not defects)

- `resolveFloorPairLabels` takes the failure object rather than the bare id (fallback to token names for an unknown id).
- Styles for the warning line, summary, Advanced and gradient field landed with the code in Tasks 1 and 3 as appropriate; Task 2 deliberately left `index.scss` to Task 3, per the plan's file lists.

**Total deviations:** 5 auto-fixed (4 Rule 3, 1 Rule 1). **Impact:** none on scope; `index.tsx` is touched in two lines.

## Known Stubs

None. (The RED-commit stubs were replaced in the GREEN commit.)

## Threat Flags

None. T-64-21 (gradient strip) is mitigated and tested: `url(`, `var(`, `;` are refused even when the injected `supports` returns true, and an untrusted stored value never reaches the strip. T-64-22 (contrast on every keystroke) is O(1) per pair, three pairs per render.

## Issues Encountered

None blocking. Known, out-of-scope failures were left alone as instructed (`lintTranslations` REQ-41-02 and `comparePresenceBaseline` R13 presence-baseline drift for Plan 64-10 to regenerate; the two `NativePort*` dead-code findings; the other listed pre-existing failures).

## Next Phase Readiness

Plan 64-09 (unsaved-changes prompt, Rename in the editor header) can build on a draft that now also carries Advanced edits and honours `''` as "remove". Plan 64-10 owns the presence-baseline regeneration for the new en keys (`contrastWarning`, `contrastSummary*`, `pair*`, `advanced*`, `filter*`, `chip*`, `gradientError`) and the live UAT items in coverage D5.

## Self-Check: PASSED

- Created files all present: AdvancedSection.tsx, GradientField.tsx, ThemeEditorWarnings / AdvancedSection / GradientField tests.
- Commits present on HEAD: 3e99f709a, 23d305b85, 51ee22253, d27291501, 86b8a11bb, 9b2adc1b6.
- `commits:` measured from the ledger: `git rev-list --count 67bf9910c..HEAD` = 6.
