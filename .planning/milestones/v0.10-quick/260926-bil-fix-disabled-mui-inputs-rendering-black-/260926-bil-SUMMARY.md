---
phase: quick-260926-bil
plan: 01
status: complete
subsystem: ui
tags: [mui, theming, accessibility, jest]

# Dependency graph
requires:
  - phase: quick-260926-a1l
    provides: "the 2026-09-26 todo this closes (38-S14 sub-case (a), the Steam install dialog's read-only Windows row rendering black in dark themes)"
provides:
  - "buildMuiTheme(isRTL) in src/frontend/muiTheme.ts -- the single app-wide MUI theme factory, now carrying palette.text.disabled / palette.action.disabled as CSS-variable strings"
  - "A source-verified, ratcheted guard (muiTheme.test.ts) that fails the build if a future @mui/material upgrade starts running colour maths on either disabled key"
  - "A full audit of every disabled-capable MUI control in src/frontend, recorded in the closed todo"
affects: [theming, mui, install-modal, select-field]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single createTheme call site, factored into a buildMuiTheme(isRTL) function -- palette keys that MUI emits verbatim (text.disabled, action.disabled) may safely be CSS var() strings; palette keys MUI runs augmentColor/alpha/darken/lighten maths on (primary, secondary, mode) must not be, since that maths throws on a var() string at render"

key-files:
  created:
    - src/frontend/muiTheme.ts
    - src/frontend/__tests__/muiTheme.test.ts
  modified:
    - src/frontend/App.tsx
    - .planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md

key-decisions:
  - "palette.text.disabled = 'var(--text-secondary)' -- resolves in every theme (base body{} default + per-theme overrides including nord-light); --text-tertiary was rejected because it is near-black (#101111) in the classic theme."
  - "palette.action.disabled = 'var(--icon-disabled, var(--text-secondary))' -- --icon-disabled is only defined by 4 of the theme blocks, so the var() fallback covers every other theme."
  - "palette.mode is deliberately left unset -- nord-light is a light theme, the rest are dark, and a single hard-coded mode would be wrong for at least one theme plus would change unrelated MUI defaults."
  - "MUI Slider's grey[400] and MenuItem's disabledOpacity were audited and left unfixed -- neither reproduces the black-on-dark defect (grey[400] is a legible static mid-grey; disabledOpacity dims already-themed colour), so they are a different, non-blocking colour mechanism, not a remaining instance of this bug."

patterns-established:
  - "Before setting a palette key to a var() string, grep the target MUI version's component sources for alpha()/darken()/lighten()/etc. wrapping that key -- verbatim-emitted keys are safe, colour-maths keys throw at render. muiTheme.test.ts's ratchet describe block keeps this true across future @mui/material upgrades."

requirements-completed: [TODO-2026-09-26-disabled-mui-inputs-render-black]

# Metrics
duration: 55min
completed: 2026-09-26
---

# Quick Task 260926-bil: Fix disabled MUI inputs rendering black in dark themes Summary

**`App.tsx`'s `createTheme` call declared no `palette`, so MUI 5.17.1 defaulted to light-mode
`text.disabled`/`action.disabled` (near-black rgba literals) on every disabled MUI control in
every GameLib theme; extracted a single `buildMuiTheme(isRTL)` factory that sets only those two
keys to CSS-variable strings, app-wide, backed by a jest ratchet that fails if a future MUI
upgrade starts running colour maths on them.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-26 (session start)
- **Completed:** 2026-09-26
- **Tasks:** 3/3 completed
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- Re-verified the plan's source claims directly against the installed `@mui/material@5.17.1`
  package (not trusted from the plan) before writing any code: `InputBase.js`, `FormLabel.js`,
  `OutlinedInput.js`, `Button.js`, `Checkbox.js` all emit `palette.text.disabled` /
  `palette.action.disabled` verbatim, with no colour-maths wrapper.
- Extracted the theme construction from `App.tsx`'s `Root()` into `buildMuiTheme(isRTL)` in a new
  `src/frontend/muiTheme.ts`, adding only `palette.text.disabled = 'var(--text-secondary)'` and
  `palette.action.disabled = 'var(--icon-disabled, var(--text-secondary))'` — every other
  pre-existing config (direction, typography, `MuiPaper`/`MuiTooltip` overrides) moved verbatim.
  `palette.mode` is intentionally never set.
- Wired `App.tsx` to call `buildMuiTheme(isRTL)` exclusively; confirmed no `createTheme(` call
  remains outside comments.
- Wrote `src/frontend/__tests__/muiTheme.test.ts`: pins the disabled-palette shape, the preserved
  overrides, the absence of `palette.mode`, and a ratchet that re-scans every top-level
  `@mui/material` component source file (>50 files) for colour-maths functions
  (`alpha`/`darken`/`lighten`/`emphasize`/`decomposeColor`/`getContrastRatio`/`getLuminance`)
  applied to either disabled key.
- **Proved the ratchet can actually fail** (not just pass vacuously): temporarily pointed its
  regex at `primary\.main` — a key MUI *does* run `alpha()` maths on — reran it, and it correctly
  flagged 17 real offending lines across `Autocomplete.js`, `ListItem.js`, `ListItemButton.js`,
  `MenuItem.js`, `TableRow.js`. Reverted immediately afterward; `git diff` confirmed a byte-clean
  revert.
- Audited every `disabled`-capable MUI control call site in `src/frontend` (full table in the
  closed todo's Resolution section) and moved
  `.planning/todos/pending/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md` to
  `completed/` with that audit and an honest live-verification-outstanding status line.

## Task Commits

Each task was committed atomically (TDD RED/GREEN for Task 1; Task 2's content landed inside
Task 1's commits, see Deviations):

1. **Task 1 RED: add failing test for buildMuiTheme disabled palette** - `f3e9e4fcf` (test)
2. **Task 1 GREEN: fix disabled MUI inputs rendering black in dark themes** - `22664d224` (feat)
3. **Task 3: audit every disabled MUI control and close the todo** - `4a3c0c386` (docs)

_No plan-metadata commit was made — the orchestrator owns STATE.md/ROADMAP.md per this plan's
constraints._

## Files Created/Modified

- `src/frontend/muiTheme.ts` - new; exports `buildMuiTheme(isRTL)`, `MUI_DISABLED_TEXT`,
  `MUI_DISABLED_ACTION`; the single app-wide MUI theme factory.
- `src/frontend/__tests__/muiTheme.test.ts` - new; 13 tests across two describe blocks (the
  factory's shape, and the colour-maths ratchet).
- `src/frontend/App.tsx` - `createTheme` import removed, inline `createTheme({...})` call replaced
  with `const theme = buildMuiTheme(isRTL)`; nothing else in the file touched.
- `.planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md` -
  moved from `pending/` via `git mv`; appended `## Resolution (2026-09-26, quick 260926-bil)` with
  the fix description and the full disabled-control audit table.

## Decisions Made

- `--text-secondary` over `--text-tertiary` for `text.disabled`: tertiary is `#101111`
  (near-black) in the `classic` theme and would reproduce the exact bug being fixed.
- `--icon-disabled` gets a `var(..., var(--text-secondary))` fallback rather than being used bare:
  only 4 of the theme blocks (`midnightMirage`, `classic`/`cyberSpaceOasis`(Alt), `gruvbox_dark`)
  define it.
- `palette.mode` stays unset: `nord-light` is a light theme, everything else is dark; MUI's mode
  switch changes more than these two keys, so a single hard-coded value would be wrong twice over
  (wrong for nord-light, and wrong scope).
- Slider (`palette.grey[400]`, a static `#bdbdbd`) and MenuItem (`palette.action.disabledOpacity`,
  an opacity multiplier on already-themed colour) were deliberately left unfixed: neither is the
  black-literal substitution this todo reports, and grey[400] in particular is legible against
  both light and dark GameLib surfaces. Documented in the audit table rather than silently
  ignored.

## Deviations from Plan

**1. [Efficiency, not a rule violation] Task 2's ratchet content was written inside Task 1's RED
commit, not as a separate commit.** The plan structured Task 1 (factory + shape pins) and Task 2
(colour-maths ratchet) as sequential TDD tasks against the same file
(`src/frontend/__tests__/muiTheme.test.ts`). Because both describe blocks belong in one file and
the RED-phase authoring pass naturally covered both, the ratchet `describe` block was written and
committed as part of Task 1's `test(...)`/`feat(...)` pair. Task 2's full verify block
(`npx jest ... muiTheme.test.ts && npx prettier --check ...`) was still run and confirmed green
independently, and the "prove it can fail" action step (pointing the regex at `primary\.main`,
confirming 17 offenders, reverting) was performed exactly as specified — just without a standalone
commit, since there was no file delta left to commit for Task 2 on its own. No test coverage or
verification step from the plan was skipped.

No other deviations. All three tasks' behavior lists, actions, and verify blocks were followed as
written; no Rule 1-4 auto-fixes were needed.

## Issues Encountered

- **Pre-existing, unrelated `pnpm planning-gates` failure.** `.planning/planning-envelope-tag-gate.py`
  fails (12/13 gates pass) on three files belonging to an already-committed, unrelated quick task
  (`quick-260925-uok`, commit `20ffb98e7`): `260925-uok-SUMMARY.md`, `260925-uok-VERIFICATION.md`,
  `deferred-items.md`, each carrying a trailing orphan envelope-tag line. Confirmed via `git log`
  that this commit predates this task entirely and none of its files were touched here. This same
  failure was already independently observed and logged by quick task `260926-8vk`
  (`.planning/quick/260926-8vk-close-vite-watcher-build-public-bin-todo/deferred-items.md`), so it
  is not re-logged here. All gates specific to this task's own files passed:
  `todo-frontmatter-gate.py`, `planning-frontmatter-gate.py`, `state-sdk-field-anchor-gate.py`,
  `uat-visibility-gate.py`.
- **Two pre-existing jest failures**, as called out in this task's constraints and confirmed
  unmodified before and after this task's commits: `storeEmbedSingleOpener.test.ts` (a
  Windows-path-separator assertion mismatch, `\\` vs `/`) and `labelSuiteI18nCensus.test.ts` (an
  unrelated string-match assertion). Neither touches `muiTheme.ts`, `App.tsx`, or the new test
  file; both were failing identically before this task's first commit.

## User Setup Required

None - no external service configuration required.

## What Was Verified vs. What Still Needs a Live Check

**Verified by source + jest (this task's scope):**
- The exact MUI 5.17.1 component files (`InputBase.js`, `FormLabel.js`, `OutlinedInput.js`,
  `Button.js`, `Checkbox.js`, `IconButton.js`, `NativeSelectInput.js`, `Slider.js`, `MenuItem.js`)
  were re-read directly from `node_modules`, not trusted from the plan or the todo.
- `buildMuiTheme(false)` / `buildMuiTheme(true)` produce the expected palette, direction,
  typography, and preserved `MuiPaper`/`MuiTooltip` overrides — pinned by 13 passing jest tests.
- `pnpm codecheck` (tsc, both configs) exits 0.
- `npx prettier --check` is clean on every path this task wrote.
- The colour-maths ratchet was proven capable of failing (not vacuous) by temporarily targeting a
  real maths-bearing key and observing 17 genuine offenders, then reverting cleanly.
- `App.tsx` builds its theme only through `buildMuiTheme(isRTL)`.

**NOT verified — outstanding, as stated in the closed todo's Resolution section:**
- No live render was performed. The `Frontend` jest project is `testEnvironment: 'node'` with no
  jsdom/CSS engine (see `jest.config.js`'s own comment), so nothing in this task's test suite can
  see an actual rendered pixel.
- The todo's own "Verification (once fixed)" steps — opening the Steam install dialog in a dark
  theme on a Windows host and confirming the "Windows" row's icon/label are legible, then checking
  at least one other disabled MUI control in the same theme — were not performed.
- The black-colour mechanism itself was never confirmed with DevTools, before or after this fix;
  the original todo explicitly flagged this as an inference from source reading, not a measured
  computed style, and that remains true.

## Next Phase Readiness

- The todo is closed with a full audit table; any future defect in this class (a new MUI control
  whose disabled colour resolves to a hardcoded literal) should be caught by grepping for
  `disabled` on `@mui/material` imports the same way this audit did, and checked against
  `text.disabled`/`action.disabled` first before assuming a new override is needed.
- `muiTheme.test.ts`'s ratchet will fail loudly on a future `@mui/material` upgrade if MUI starts
  running colour maths on either disabled key — at that point, switch to per-component
  `&.Mui-disabled` `styleOverrides` for the affected component(s) instead of the palette-level
  var() strings.
- A live operator check (Windows, dark theme, Steam install dialog) is recommended before
  considering this defect fully closed in practice, not just in source.

---
*Phase: quick-260926-bil*
*Completed: 2026-09-26*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`src/frontend/muiTheme.ts`,
`src/frontend/__tests__/muiTheme.test.ts`, `src/frontend/App.tsx`,
`.planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md`, this
SUMMARY.md); confirmed the old `pending/` path no longer exists. All three commit hashes
(`f3e9e4fcf`, `22664d224`, `4a3c0c386`) confirmed present in `git log --oneline --all`.
