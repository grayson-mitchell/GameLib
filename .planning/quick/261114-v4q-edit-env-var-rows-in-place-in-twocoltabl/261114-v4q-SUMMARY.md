# Quick 261114-v4q: Edit env-var rows in place — Summary

TwoColTableInput now edits the selected row in place (Enter/Save commits via one onChange, Escape/Cancel discards); the footer row is add-only.

## Commits
- 32f0b7ef3 fix: component, tests, gamelib strings, todo moved to completed
- follow-up docs commit: Resolution note on the closed todo

## Changes
- index.tsx: editingIndex/editKey/editValue state; derived edit validation; saveEdit with validation + fullFills guards and upsert-by-key on rename; connector split on edit key; Escape stops propagation; originalInputs state removed, footer dirty flag derived.
- 12 new tests (src/frontend/components/UI/TwoColTableInput/__tests__/index.test.tsx), covering env-var and wrapper shapes.
- en/gamelib.json: twoColTable.{cancel,edit,remove,save} (placed after "tour" — the parser's sort order, not before it as the plan said).

## Verification
- jest TwoColTableInput + Settings: 37 suites / 420 tests pass.
- prettier, codecheck, i18n-churn-guard, planning-gates (12/12) pass. eslint: 0 errors (pre-existing exhaustive-deps warning in index.tsx; one no-unsafe-member-access warning in the test).
- hardcodedStringGate: 1 failure, NOT from this task: `PlatformSupport.tsx:71 "(installed)"` in the user's uncommitted GamePage work. No violations in TwoColTableInput.

## Deviations
- Rule 3: added an undefined guard in editRow (noUncheckedIndexedAccess type error).
- Removed the unrelated `downloadAbout` line `pnpm i18n` added to en/gamelib.json (user's uncommitted work), as the plan directed.
