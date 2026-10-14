---
phase: quick-261014-wro
plan: 01
subsystem: ui
tags: [react, i18n, webview, epic-store, jest]

requires:
  - phase: 40-in-app-store-and-wiki-browsing-under-tauri-embedded-child-we
    provides: "StoreEmbedPlaceholder (D-19) and its reason prop groundwork (abbc84a71)"
provides:
  - "StoreEmbedPlaceholder withholds its message paragraph on the Epic-surface-only reason, closing the 2026-10-14 todo"
affects: [webview, store-embed, 50-UI-SPEC, 50-REVIEW]

actuals:
  tokens: 5924
  tasks: 2
  commits: 2
  plan_head_before: 553a04138c1ba58c23ed5c45d5775487068838b0
  plan_head_after: 8bc5277181123a0f4b0f1a8e1250e9d154185d66

tech-stack:
  added: []
  patterns:
    - "Gate a shared component's visible copy on a diagnostic reason string, strict-equality on the one false-making value, rather than restructuring the component"

key-files:
  created: []
  modified:
    - src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx
    - src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UI-SPEC.md
    - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-REVIEW.md
    - .planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md

key-decisions:
  - "Operator chose option 3 of the todo (2026-10-14, in session): render no text on the Epic surface, a text-free styled fill. Options 1, 2 and 4 are closed."

requirements-completed:
  - "2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open"
  - "50-UI-SPEC-E2"

coverage:
  - id: D1
    description: "StoreEmbedPlaceholder's message paragraph renders for undefined, 'suppressed' and 'suppressed+epic-surface', and is withheld only for 'epic-surface'"
    requirement: "2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open"
    verification:
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx#the Epic surface alone renders the fill with no copy"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx#both suppression reasons still speak"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx#exactly one reason value suppresses the copy"
        status: pass
    human_judgment: false
  - id: D2
    description: "50-UI-SPEC E2/E6 rows and 50-REVIEW's open entry record the decision honestly; the todo is closed with a Resolution"
    verification:
      - kind: other
        ref: "pnpm planning-gates (12/12)"
        status: pass
    human_judgment: true
    rationale: "Prose-accuracy and table-churn judgments (no row reflow, discharge reads as a faithful continuation of the original entry) need a human read, not just a passing gate."
  - id: D3
    description: "The text-free fill's real-world appearance on a Mac cold Epic load"
    verification: []
    human_judgment: true
    rationale: "No live gate was run by this plan (not claimed). The jest cases prove no text renders; they say nothing about how an empty styled area reads during a 10-40s load. Documented as unobserved in the todo's Resolution."

duration: 40min
completed: 2026-10-14
status: complete
---

# Quick Task 261014-wro: Withhold the Epic-surface placeholder copy Summary

**`StoreEmbedPlaceholder`'s message paragraph now renders for every `reason` value except exactly `'epic-surface'` — a one-boolean gate closing the todo that cost two debug cycles, with the discriminator pinned from both ends by a four-shape test sweep.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-10-14T10:58:57Z
- **Tasks:** 2/2 completed
- **Files modified:** 6 (3 `.tsx`, 2 planning docs, 1 todo moved)

## Accomplishments

- Gated `StoreEmbedPlaceholder`'s `<p>` on `reason !== 'epic-surface'`, implementing the operator's locked option 3 of the 2026-10-14 todo: withhold the copy only where no window is open (the Epic-surface-only route), keep it everywhere else (both suppression reasons).
- Added three test cases to `StoreEmbedPlaceholder.test.tsx`, written and observed RED against the pre-edit component before the source change: the Epic-surface silent render, both suppression reasons still speaking, and a four-shape sweep pinning that exactly one reason value suppresses the copy.
- Rewrote the doc comments in both `StoreEmbedPlaceholder.tsx` and `StoreEmbedSlotContents.tsx` that asserted the reason prop was invisible/changed no pixel — those sentences became false under this change.
- Amended 50-UI-SPEC's E2 (overflow, long-text) and E6 (empty, loading) rows to state honestly that the Epic surface carries a text-free fill, with a dated note below the table citing the closing commit. No other row touched; the table was not restructured.
- Appended a discharge to 50-REVIEW's open "Open, not fixed here" entry as a blockquote continuation (original text and cost record intact), and repointed its stale `pending/` citation at `completed/`.
- Moved the todo `pending/` → `completed/` via `git mv` and appended a `## Resolution` naming the decision, what did not change, and the unobserved live visual.

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate the placeholder's copy on one reason value, with the discriminator pinned from both ends** - `6c061a598` (feat)
2. **Task 2: Amend 50-UI-SPEC E2/E6, discharge the 50-REVIEW entry, and close the todo** - `8bc527718` (docs)

_Task 1 is `tdd="true"`; RED was observed for cases 1 and 3 against the unmodified source before the one-conditional edit landed (see Verification output below)._

## Files Created/Modified

- `src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx` - message `<p>` gated on `reason !== 'epic-surface'`; doc comments rewritten
- `src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx` - doc comment rewritten (no longer claims `reason` "changes no pixel")
- `src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx` - three new test cases
- `.planning/phases/50-.../50-UI-SPEC.md` - E2/E6 rows amended, one dated note added below the table
- `.planning/phases/50-.../50-REVIEW.md` - open entry discharged in place, stale citation repointed
- `.planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md` - moved from `pending/` via `git mv`, `## Resolution` appended

## Decisions Made

- Operator's locked choice (option 3, 2026-10-14, in session): render no text on the Epic surface. Options 1 (conditional wording), 2 (reason-neutral wording) and 4 (accept it) are closed and were not re-litigated in code, comments, or here.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error in the new sweep test's call-shape construction**
- **Found during:** Task 1, running `pnpm codecheck` after the source edit
- **Issue:** The sweep test's ternary built `reason === undefined ? undefined : { reason }` and passed it to a cast typed `(props: { reason?: string }) => AnyReactElement`. Passing an explicit `undefined` argument against a required (non-optional) parameter type failed `tsc --noEmit`: `Type 'undefined' is not assignable to type '{ reason?: string | undefined; }'`.
- **Fix:** Changed the ternary's "no reason" branch to `{}` instead of `undefined` — functionally identical at runtime (the component's `= {}` default parameter treats a call with no properties the same as a call with an explicit `reason: undefined`), and type-correct.
- **Files modified:** `src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx`
- **Verification:** `pnpm codecheck` now exits 0; the sweep test still passes with the corrected call shape (confirmed in the full scoped-jest rerun).
- **Committed in:** `6c061a598` (part of Task 1's commit)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** The fix was required for the plan's own verification gate (`pnpm codecheck`) to pass; no scope creep, no behavior change to the component under test.

## Issues Encountered

None beyond the deviation above.

## Verification output

All commands run from the checkout root, verbatim measured results:

1. **Baseline, before any edit:**
   ```
   Test Suites: 3 passed, 3 total
   Tests:       27 passed, 27 total
   Time:        0.539 s
   ```

2. **RED, test cases added, before the source edit** (`npx jest .../StoreEmbedPlaceholder.test.tsx`):
   ```
   ✕ the Epic surface alone renders the fill with no copy
     Expected: ""
     Received: "Paused while a window is open"
   ✕ exactly one reason value suppresses the copy
     - Expected  - ["epic-surface"]
     + Received  + []
   ✓ both suppression reasons still speak
   Tests: 2 failed, 8 passed, 10 total
   ```

3. **GREEN, scoped jest after the source edit:**
   ```
   PASS src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx
   PASS src/frontend/screens/WebView/components/__tests__/StoreEmbedSlotContents.test.tsx
   PASS src/frontend/screens/WebView/__tests__/epicEmbedSurfaceContract.test.ts
   Test Suites: 3 passed, 3 total
   Tests:       30 passed, 30 total
   ```
   Matches the plan's expected 3 suites / 30 tests / 0 failed (baseline 27).

4. **`pnpm codecheck`:** exit 0 (empty output), after the Rule 1 fix above. Failed with `exit code 2` once, before the fix (TS2345), as documented in Deviations.

5. **`pnpm lint`:** exit 0. Tail of output: `✖ 638 problems (0 errors, 638 warnings)` then `production: PASS | tests: PASS`. Tests scope sits at exactly 638 of 638 — no new warning introduced, ceiling not touched.

6. **`pnpm i18n`:** exit 0. `Added keys: 0`, `Restored keys: 0` for all three catalogues (`gamelib`, `gamepage`, `login`). `git status --porcelain -- public/locales` produced no output (clean). Note: the run also reported `Unreferenced keys: 10` (gamelib) and `5` (gamepage) — present but not written to disk by this parser, and not something this plan's `<automated>` check measures (it checks exit code + worktree-clean only, both of which held). Pre-existing, out of this plan's scope.

7. **`git diff --exit-code "$BASE" -- public/locales src/frontend/screens/WebView/index.css`:** exit 0 (no committed diff).

8. **Comment-filtered grep for the gating literal** (`StoreEmbedPlaceholder.tsx`, non-comment lines): `1` — the literal appears exactly once in code, as the plan's `<done>` criterion requires.

9. **`npx prettier --check`** over the three `.tsx` paths written in Task 1: `Checking formatting...` / `All matched files use Prettier code style!` — passes.

10. **`pnpm planning-gates`:** `12/12 planning gates passed.`

11. **Task 2 file-existence / structure checks:** todo present under `completed/`, absent under `pending/`; exactly one `## Resolution` heading; `261014-wro` appears once in `50-REVIEW.md` and once in `50-UI-SPEC.md`; the `completed/` todo path appears once in `50-REVIEW.md`.

12. **`git diff --exit-code "$BASE" -- .planning/ROADMAP.md .planning/STATE.md .../50-UAT.md`:** exit 0 (no diff).

13. **Rename detection:** `git diff --find-renames --diff-filter=R --name-only "$BASE" -- .planning/todos` names the moved file — the move is recorded as a rename, not add-plus-delete.

14. **`npx prettier --file-info`** on the three Task 2 doc paths: all three `{"ignored":true,"inferredParser":null}` — confirms the Task 2 `<verify>` block's human-check note that a `--check` there would be vacuous, correctly omitted.

15. **UI-SPEC diff churn:** `git diff --stat "$BASE" -- .../50-UI-SPEC.md` → `1 file changed, 9 insertions(+), 4 deletions(-)`. Full diff reviewed by eye: only the four cited rows (`:148`, `:149`, `:160`, `:161`) plus the one added note changed; pipe counts and column alignment intact.

## Open observations

- **The text-free fill on a Mac cold Epic load is visually unobserved.** No live gate was run by this plan. The jest cases prove that no text renders; they say nothing about how an empty styled area reads during a 10-40s load, which is the exact downside option 3's own text names. Whether this is worth a live gate is the operator's call — no live-gate todo was filed unilaterally. Recorded in the todo's `## Resolution`.
- **Two stale `todos/pending/` citations were left out of this task's scope**, per the plan's explicit instruction: `.planning/debug/resolved/embed-suppression-sticks.md:31` and `.planning/todos/completed/2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md` both still cite a `pending/` path for a todo that has now moved. Only `50-REVIEW.md:124`'s citation was repointed, as the plan specified.
- **The todo's own `StoreEmbedSlotContents.tsx:52` citation was already stale at planning time** — the `suppressed || isEpicSurface` branch sits at `:59` at HEAD (confirmed again during this execution), not `:52`. A small instance of the line-number rot this repo keeps paying for; the todo's reasoning itself is unaffected and was left as-is (out of scope to hand-correct a closed todo's body beyond the Resolution).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The todo is closed, 50-UI-SPEC and 50-REVIEW reflect the shipped decision, and the component change is covered by tests on both sides of the discriminator. Nothing here blocks other work. The one open thread — whether the text-free fill needs a live-gate check on real hardware — is explicitly left for the operator to decide, not filed as a new todo.

## Self-Check: PASSED

- `src/frontend/screens/WebView/components/StoreEmbedPlaceholder.tsx` — FOUND
- `src/frontend/screens/WebView/components/StoreEmbedSlotContents.tsx` — FOUND
- `src/frontend/screens/WebView/components/__tests__/StoreEmbedPlaceholder.test.tsx` — FOUND
- `.planning/todos/completed/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md` — FOUND
- `.planning/todos/pending/2026-10-14-paused-while-a-window-is-open-copy-is-shown-when-no-window-is-open.md` — ABSENT (correct, moved)
- commit `6c061a598` — FOUND in `git log --oneline --all`
- commit `8bc527718` — FOUND in `git log --oneline --all`

---
*Phase: quick-261014-wro*
*Completed: 2026-10-14*
