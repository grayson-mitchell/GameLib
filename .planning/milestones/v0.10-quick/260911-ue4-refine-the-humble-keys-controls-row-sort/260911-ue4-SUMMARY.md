---
quick_id: 260911-ue4
title: Refine the Humble Keys controls row — label left, compact picker, breathing room
date: 2026-09-11
status: complete
subsystem: frontend/Humble Keys screen
tags: [css, humble-keys, sort-picker, ui-refinement]
key-files:
  created: []
  modified:
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
decisions:
  - "Task 2 (compact picker via .humbleKeysSortPicker.selectFieldWrapper .MuiOutlinedInput-root) was descoped mid-execution by the orchestrator — see 'Orchestrator-directed descope' below."
  - "Select track width left at 12rem (unchanged from t0p) since the font-size stays at --text-md with Task 2 dropped — shrinking the track without the compaction would risk clipping 'Expiring soonest'."
metrics:
  duration: ~35 minutes
  completed: 2026-09-11
---

# Quick Task 260911-ue4: Refine the Humble Keys controls row Summary

One-liner: Flipped the sort-picker's label to the left of the select and gave the controls row symmetric top/bottom margins; the picker-compaction task was dropped mid-flight per an operator descope in favor of a shared-component fix.

## What was done

### Task 1 — flip the label to the left of the picker (DONE)

`.humbleKeysSortPicker` (`index.css:731`):
- `grid-template-areas: 'select label'` → `'label select'`
- `grid-template-columns: 12rem max-content` → `max-content 12rem` (order swapped to match; the 12rem select-track value itself is untouched)
- `column-gap: var(--space-sm)` unchanged

Updated the `260911-t0p` pin in `humbleKeysStylesheet.test.ts`:
- Renamed `GRID_TEMPLATE_AREAS_SELECT_LABEL` → `GRID_TEMPLATE_AREAS_LABEL_SELECT`, regex now matches `'label select'`
- Reworded the describe block and the primary assertion's title to say "sits to the left of the select, not above and not to its right"
- Replaced the generic `color: red` SANITY negative control's *wording* is kept (still present, unchanged) and **added a second, more specific SANITY test** whose bad fixture is exactly the pre-ue4 order (`grid-template-areas: 'select label'; grid-template-columns: 12rem max-content;`) — this is the fixture the plan said is "now exactly the right negative control"

### Task 2 — make the picker compact (DROPPED — see descope below)

Not shipped. No compaction rule, no pin for it, in the final commits.

### Task 3 — give the column header room to breathe (DONE)

`.humbleKeysControlsRow` (`index.css:693`): `margin-top: var(--space-lg)` (no margin-bottom) → `margin-top: var(--space-md)` and `margin-bottom: var(--space-md)` (both set, symmetric).

## Orchestrator-directed descope (Task 2 dropped)

Mid-execution, after Tasks 1–3 were implemented and the first commit (`a2c670f2a`) had already landed with all three tasks, the orchestrator relayed an operator scope change:

- **Reason:** the operator determined live that the bulky-control chrome (40px height, `--text-md`, heavy drop shadow) is **app-wide**, not specific to Humble Keys — the same `SearchBar/index.scss` + `SelectField/index.css` chrome is inherited by 6 SearchBar call sites and 21 other SelectField call sites. A Humble-Keys-scoped compaction override would be superseded the moment the shared-component fix lands, and would fight it in the meantime.
- **Action taken:** made a second commit (`90556860c`) that removes the `.humbleKeysSortPicker.selectFieldWrapper .MuiOutlinedInput-root` rule (height/font-size/box-shadow) and its rationale comment in full. No pin had been added for Task 2, so nothing needed removing from the test file.
- **Consequence handled:** Task 1's select-track width stays at the original `12rem` (not shrunk), because the font-size is staying at `--text-md` with the compaction gone — a narrower track would risk clipping "Expiring soonest". Only the area order and matching track order changed, not the 12rem value.

This is a task-level descope by explicit operator/orchestrator instruction mid-flight, not a Rule 1–4 deviation — recorded here per the orchestrator's request so the record doesn't read as a silently dropped task.

## Red-proof result

Reverted `.humbleKeysSortPicker`'s `grid-template-areas` from `'label select'` back to `'select label'`, re-ran `humbleKeysStylesheet.test.ts` in isolation, and confirmed a failure before restoring the fix.

**Test that turned RED:**
`Humble Keys sort picker label sits to the left of the select, not above and not to its right (REQ-43-19, 260911-t0p defect 2, reordered by 260911-ue4) › .humbleKeysSortPicker declares grid-template-areas: 'label select' and an explicit grid-template-columns`

Failure output:
```
Expected pattern: /grid-template-areas:\s*'label select'/
Received string:  "
  grid-template-areas: 'select label';
  grid-template-columns: max-content 12rem;
  column-gap: var(--space-sm);
"
```

All 35 other tests in the suite still passed with the reverted value in place — the pin isolates exactly the claim it's supposed to guard. Restored the fix afterward; full suite re-confirmed green (176/176).

## Final values

- **Height:** unchanged from t0p (40px, from the global `.selectFieldWrapper .MuiOutlinedInput-root` rule) — Task 2 dropped, so no compaction shipped.
- **Font-size:** unchanged from t0p (`var(--text-md)`).
- **Track width:** unchanged from t0p (`12rem` ≈ 192px), only its position in the column order changed (now the second track, after `max-content` for the label).
- **Controls row margins:** `margin-top` and `margin-bottom` both `var(--space-md)` (was `margin-top: var(--space-lg)`, no `margin-bottom`).

## Deviations from Plan

### Orchestrator-directed descope

**1. [Orchestrator descope] Dropped Task 2 (compact picker) entirely**
- **Found during:** after Task 1–3 were committed
- **Directive:** operator confirmed the bulky-control problem is app-wide (SearchBar + 21 other SelectField call sites), not Humble-Keys-specific; the fix is moving to the shared components as a separate task, so a scoped override here would immediately fight it.
- **Action:** removed the `.humbleKeysSortPicker.selectFieldWrapper .MuiOutlinedInput-root` rule and its comment; kept the select track at `12rem` unshrunk since the font-size is staying at `--text-md`.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.css`
- **Commit:** `90556860c`

No Rule 1–4 auto-fixes were needed beyond this orchestrator-directed descope. Tasks 1 and 3 were executed exactly as the plan specified.

## Do-not-disturb items — confirmed intact

- `var(--divider, color-mix(in srgb, currentColor 14%, transparent))` still occurs exactly 3 times per the stripped-source regex test (`declares the currentColor color-mix fallback at exactly the three known sites` — PASS). A naive un-stripped `grep -c 'var(--divider'` on the raw file returns 2, exactly as the plan warned it would (the sort-picker's occurrence is prettier-wrapped) — this is expected and not a regression.
- `grid-template-columns` file-wide raw-source count is still 2 (`grep -c 'grid-template-columns' index.css` → 2), and `HumbleKeyRow/__tests__/index.test.tsx`'s sibling test confirming the second occurrence is the `.humbleKeysSortPicker` rule still passes.
- `var(--status-success)` still occurs exactly once (`grep -c` → 1).
- No new comment in `index.css` spells out `grid-template-columns` literally; the load-bearing paraphrase convention from `260911-t0p` is preserved (and the new ue4 comment above the sort-picker rule was written to avoid it too).

## Final Verification (actual output)

**`pnpm jest --selectProjects Frontend --passWithNoTests src/frontend/screens/Humble/Keys/`** (final run, after both commits):
```
PASS Frontend src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
PASS Frontend src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/__tests__/index.test.tsx
PASS Frontend src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
PASS Frontend src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
Test Suites: 4 passed, 4 total
Tests:       176 passed, 176 total
```

**`pnpm codecheck`** (final run):
```
> gamelib@0.7.0 codecheck /Users/graysonmitchell/Projects/GameLib
> tsc --noEmit
```
Exit code 0, no output — no type errors.

**`git status --porcelain`** (final):
```
?? .claude/skills/archify/
?? .planning/quick/260911-t0p-fix-four-ui-defects-on-the-humble-keys-s/260911-t0p-UAT.md
?? .planning/quick/260911-ue4-refine-the-humble-keys-controls-row-sort/
?? skills-lock.json
```
The two unrelated untracked paths (`.claude/skills/archify/`, `skills-lock.json`) are still present and untouched, as required. The `260911-t0p-UAT.md` file was pre-existing/untracked before this task started (read-only reference). The `260911-ue4/` directory holds this plan's own PLAN.md and this SUMMARY.md, which are intentionally left for the orchestrator's docs commit per this task's constraints.

## Commits

- `a2c670f2a` — `fix(260911-ue4): flip sort-picker label left, compact the select, breathe room around the controls row` (Tasks 1, 2, 3 — Task 2 later reverted)
- `90556860c` — `fix(260911-ue4): drop the Humble-Keys-scoped picker-compaction override per operator descope` (removes Task 2's rule)

## Self-Check: PASSED

- FOUND: `src/frontend/screens/Humble/Keys/index.css` (modified, exists)
- FOUND: `src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts` (modified, exists)
- FOUND commit `a2c670f2a` in `git log --oneline`
- FOUND commit `90556860c` in `git log --oneline`
