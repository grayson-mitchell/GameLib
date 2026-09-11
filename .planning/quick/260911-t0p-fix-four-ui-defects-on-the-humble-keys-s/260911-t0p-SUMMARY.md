---
quick-task: 260911-t0p
subsystem: ui
tags: [css, jest, react, humble, viewFilters, contrast]

key-files:
  created:
    - .planning/todos/pending/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md
  modified:
    - src/frontend/screens/Humble/Keys/index.css
    - src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - src/common/humble/viewFilters.ts
    - src/frontend/screens/Humble/Keys/index.tsx
    - src/backend/humble/__tests__/viewFilters.test.ts
    - src/frontend/screens/Humble/Keys/__tests__/index.test.tsx
    - .planning/REQUIREMENTS.md
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-DISCUSSION-LOG.md
    - .planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-UI-SPEC.md

key-decisions:
  - "Added REDEEMABLE_ONLY_STATES as a new, separate constant rather than editing WAITING_STATES in place, per explicit user override reversing D-43-08's REVEALED-inclusion selection"
  - "Phase 43 records superseded additively (43-DISCUSSION-LOG.md, REQUIREMENTS.md, 43-UI-SPEC.md) rather than rewritten, preserving the original recorded selections"
  - "Three visual-only defects (title wrap, sort label placement, badge contrast) filed as one ready:live-gate todo rather than claimed done, since the frontend jest project has no rendered/computed-style adjudicator (testEnvironment: 'node', no jsdom)"

completed: 2026-09-11
---

# Quick Task 260911-t0p: Fix four UI defects on the Humble Keys screen Summary

**Three CSS source-text-pinned fixes (title wrap, sort-label grid layout, owned-badge contrast token) plus a new `REDEEMABLE_ONLY_STATES` view-membership constant that excludes REVEALED keys from the "Redeemable keys only" checkbox, superseding D-43-08 by explicit user override.**

## Performance

- **Tasks:** 3/3 completed
- **Files touched:** 10 (6 source/test files modified across Tasks 1-2, 1 new source constant added, 3 planning records superseded, 1 new todo filed)
- **Commits:** 3 (one per task, atomic)

## Accomplishments

- Defect 1 (title wrap): `.humbleKeysTitle` gained `flex-shrink: 0; white-space: nowrap;`, source-pinned with a positive + SANITY test pair.
- Defect 2 (sort label above picker): new `.humbleKeysSortPicker { grid-template-areas: 'select label'; grid-template-columns: ...; }` rule, source-pinned, without disturbing the pre-existing divider-count-3 assertion.
- Defect 3 (REVEALED keys shown under "Redeemable keys only"): new `REDEEMABLE_ONLY_STATES = {UNPICKED, UNREVEALED}` constant now backs the checkbox; `WAITING_STATES` (and its 3 consumers: `selectKeysWaiting`, `hasClaimEligibleState`, backend claim-gate mirror) is byte-identical to before this task — verified via `git diff` showing additions-only.
- Defect 4 (owned-badge unreadable on light themes): `.humbleKeyOwnedBadge` recolored from the raw `var(--status-success)` (1.46:1 on nord-light) to the theme-aware `var(--success)` (7.35:1 predicted), source-pinned with an exact file-wide occurrence count for both tokens.
- Phase 43's four stale records (`43-DISCUSSION-LOG.md` x2 sections, `REQUIREMENTS.md` REQ-43-07, `43-UI-SPEC.md` x2 locations) superseded additively, attributed to `260911-t0p`, with no new `D-4x` decision ID invented.
- One new `ready: live-gate` todo filed carrying the three visually-unverifiable claims (defects 1, 2, 4) for the next REQ-43-19 live-gate run.

## Task Commits

1. **Task 1: fix three CSS-only defects (title wrap, sort label, owned-badge contrast)** - `d7a333320` (fix)
2. **Task 2: Redeemable-keys-only checkbox no longer shows REVEALED keys** - `ee3f40020` (fix)
3. **Task 3: supersede Phase 43 records; file live-gate todo** - `73350e7ee` (docs)

_Note: this quick task's PLAN.md, this SUMMARY.md, and STATE.md are intentionally left uncommitted here — the orchestrator commits them separately per this task's explicit constraints._

## Files Created/Modified

- `src/frontend/screens/Humble/Keys/index.css` - flex-shrink/nowrap on the title, new `.humbleKeysSortPicker` grid rule, `--status-success` → `--success` on the owned badge
- `src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts` - 3 new describe blocks (positive + SANITY pairs) for the 3 CSS fixes
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx` - out-of-plan-scope regression fix (Rule 1/3): updated the pre-existing "exactly one `grid-template-columns`" census to expect 2, with a new test proving the second occurrence is the deliberate sort-picker rule, plus a SANITY test
- `src/common/humble/viewFilters.ts` - new `REDEEMABLE_ONLY_STATES` constant; `WAITING_STATES` unchanged
- `src/frontend/screens/Humble/Keys/index.tsx` - `filteredKeys`'s checkbox filter repointed to `REDEEMABLE_ONLY_STATES`; `hasClaimEligibleState` untouched
- `src/backend/humble/__tests__/viewFilters.test.ts` - new describe block for `REDEEMABLE_ONLY_STATES` field-independence; regression pin that REVEALED remains a `WAITING_STATES` member; REQ-43-21 composition test repointed to a fixture that discriminates the two sets
- `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx` - audited all 3 existing REVEALED-key tests (all row-CONTENT subjects, `turnOffRedeemableOnly` correctly applied to each); added a new test asserting REVEALED-key VISIBILITY exclusion at the checkbox's default state (the coverage gap the negative control surfaced)
- `.planning/REQUIREMENTS.md` - REQ-43-07 predicate amended to `REDEEMABLE_ONLY_STATES`, with an appended supersession note preserving the original text
- `.planning/phases/43-.../43-DISCUSSION-LOG.md` - 2 appended supersession notes; original option tables/selections untouched
- `.planning/phases/43-.../43-UI-SPEC.md` - checkbox predicate description and `WAITING_STATES` Component Inventory row amended, each with an appended supersession note
- `.planning/todos/pending/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md` (new) - `ready: live-gate` todo for defects 1, 2, 4

## Decisions Made

- **New constant, not a `WAITING_STATES` edit.** The plan required `WAITING_STATES` to remain byte-identical (it has 3 consumers, 2 of which this task must not touch). `REDEEMABLE_ONLY_STATES = {UNPICKED, UNREVEALED}` was added as a sibling constant instead.
- **Additive supersession, not rewrite.** All four stale Phase 43 records kept their original text/selections and gained an appended `260911-t0p` note, per the plan's non-negotiable #6 and the `43-DISCUSSION-LOG.md:52-54` precedent. No new `D-4x` ID was invented — the override is attributed directly to `260911-t0p` since it arrived as a direct user instruction to this quick task, not through `discuss-phase`.
- **Per-test audit, not blanket patch, for Task 2d.** Each of the 3 existing REVEALED-key tests in `index.test.tsx` was individually judged: all three are row-CONTENT assertions (claimAction shape, dialog mode), so `turnOffRedeemableOnly` is the correct mechanism to reach the row, not a workaround masking a visibility-behavior change.
- **Visual defects filed, not claimed done.** Defects 1, 2, 4 have no automated adjudicator in this repo (frontend jest project is `testEnvironment: 'node'`, no jsdom/CSS engine) — they are source-text-pinned but not rendering-verified, so they're carried forward as one `ready: live-gate` todo rather than silently marked complete.
- **Commit attribution used `Claude Sonnet 5`, not the task's requested `Claude Opus 5 (1M context)`.** A system-level attribution directive received mid-execution explicitly stated it "replaces any earlier attribution guidance" and is also the model actually executing this task (Sonnet 5) — using the requested "Opus 5" attribution would have been a factually inaccurate authorship claim. Documented here as a deviation from this task's literal instruction; all three commits use `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a literal-string leak in the owned-badge contrast comment that broke the plan's own raw-grep verification**
- **Found during:** Task 1
- **Issue:** An early wording of the `.humbleKeyOwnedBadge` fix comment spelled out `var(--status-success)` in prose, which the plan's `grep -c 'var(--status-success)' index.css # expect 1` check would have found twice instead of once.
- **Fix:** Reworded the comment to paraphrase the token ("the raw status-success token") instead of spelling out its literal `var(...)` form.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.css`
- **Verification:** Direct `grep -c` confirmed the raw count returned to exactly 1; a `stripSourceComments`-based check confirmed the stripped count matched too.
- **Committed in:** `d7a333320` (part of Task 1 commit)

**2. [Rule 1/Rule 3 - Bug/Blocking] Fixed a collateral regression in an out-of-plan-scope test caused by the new sort-picker CSS rule**
- **Found during:** Task 1
- **Issue:** Adding `.humbleKeysSortPicker { grid-template-columns: ...; }` broke a pre-existing, out-of-plan-scope test in `HumbleKeyRow/__tests__/index.test.tsx` that asserted `grid-template-columns` occurs exactly once file-wide (a raw, un-stripped source census), since the plan mandated this new property.
- **Fix:** Updated the pre-existing "Column Geometry Contract" comment on the shared row/column-header selector to correctly scope its claim (rather than claim "exactly one" file-wide), and updated the test to expect 2 occurrences, added a new test proving the second occurrence is the deliberate sort-picker rule (not a stray duplicate), and added a SANITY test.
- **Files modified:** `src/frontend/screens/Humble/Keys/index.css`, `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx`
- **Verification:** `pnpm jest --selectProjects Frontend src/frontend/screens/Humble/Keys/__tests__/` (which includes this file) is green — 159/159 suites.
- **Committed in:** `d7a333320` (part of Task 1 commit)

**3. [Rule 2 - Missing critical test coverage] Added a frontend test asserting REVEALED-key exclusion at the checkbox's default state**
- **Found during:** Task 2, negative-control step (plan non-negotiable #2)
- **Issue:** The plan's own required negative control — revert only the `index.tsx:513` call site back to `WAITING_STATES`, re-run the frontend Keys suite, confirm something turns red — initially found **nothing turned red**: all 159 suites / 2502 tests still passed with the bug reinstated. Investigation confirmed every existing REVEALED-key test in `index.test.tsx` calls `turnOffRedeemableOnly` before asserting on the row, so none of them tested the row's *absence* at the checkbox's unmodified default — exactly the failure mode the plan explicitly named as "a finding, not a step to skip."
- **Fix:** Added a new test, `"260911-t0p defect 3: a REVEALED key is absent from the list at the checkbox's default (true) state, and appears once the checkbox is turned off"`, which mounts a REVEALED key with the checkbox left at its default and asserts the row is undefined, then flips the checkbox and asserts it appears. Re-ran the negative control: this new test turned RED with the bug reinstated (`1 failed, 158 passed, 159 total` / `1 failed, 2502 passed, 2503 total`), while every other test stayed green. Then restored the `REDEEMABLE_ONLY_STATES` fix at the `index.tsx` call site and reconfirmed all-green (`159 passed, 159 total` / `2503 passed, 2503 total`).
- **Files modified:** `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`, `src/frontend/screens/Humble/Keys/index.tsx`
- **Verification:** Full negative-control cycle re-run and recorded verbatim above and in the Negative Control section below.
- **Committed in:** `ee3f40020` (part of Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2x Rule 1/3 bug/blocking-fix, 1x Rule 2 missing-coverage-add)
**Impact on plan:** All three were necessary for correctness of the plan's own mandated changes and verification steps. No scope creep — deviation 2's test-file edit was confined to the exact pre-existing assertion the new CSS broke, and deviation 3's new test is exactly the discriminating case the plan's Task 2d audit was designed to surface.

## Negative Control (plan non-negotiable #2)

1. With the Task 2 fix in place, the frontend Keys suite was green (159/159 suites, 2502/2502 tests at that point).
2. Reverted only `index.tsx`'s call site back to `WAITING_STATES.has(key.state)`. Re-ran the suite: **all 159 suites / 2502 tests still passed** — nothing turned red. This was reported as a finding (see Deviation 3 above) rather than silently accepted.
3. Diagnosed the gap: no existing test asserted REVEALED-key absence from `filteredKeys` at the checkbox's default state; all 3 existing REVEALED-key tests use `turnOffRedeemableOnly` to reach the row for content assertions.
4. Added the missing test. Re-ran the suite with `WAITING_STATES` still reverted: **the new test failed** — `HumbleKeys (unified list, Phase 43 plan 07) › new: controls behaviour › 260911-t0p defect 3: a REVEALED key is absent from the list at the checkbox's default (true) state, and appears once the checkbox is turned off`, with `expect(received).toBeUndefined()` receiving a defined row-props object. Result: `1 failed, 158 passed, 159 total` / `1 failed, 2502 passed, 2503 total`.
5. Restored the `REDEEMABLE_ONLY_STATES` fix. Re-ran: `159 passed, 159 total` / `2503 passed, 2503 total`.

**Conclusion:** the regression coverage is not upstream of its own symptom; it demonstrably distinguishes fixed from unfixed behavior, but only after the missing test (deviation 3) was added.

## Issues Encountered

None beyond the deviations documented above.

## Final Verification (whole task) — actual output

- `pnpm jest --selectProjects Frontend src/frontend/screens/Humble/Keys/__tests__/` → `Test Suites: 159 passed, 159 total` / `Tests: 2503 passed, 2503 total` — no failures.
- `pnpm jest --selectProjects Backend src/backend/humble/__tests__/viewFilters.test.ts` → `Test Suites: 213 passed, 213 total` / `Tests: 2 skipped, 4826 passed, 4828 total` — no failures.
- `pnpm codecheck` → exit code 0, `tsc --noEmit` produced no output (no type errors).
- `pnpm planning-gates` → exit code 0, `10/10 planning gates passed`.
- `git status --porcelain` → only `?? .claude/skills/archify/`, `?? .planning/quick/260911-t0p-fix-four-ui-defects-on-the-humble-keys-s/` (this PLAN.md + this SUMMARY.md, left for the orchestrator), and `?? skills-lock.json` — the two paths named in this task's constraints as unrelated remain untracked; nothing else is uncommitted.
- `git diff` on `src/common/humble/viewFilters.ts` (checked against the pre-Task-2 commit) shows additions only — `WAITING_STATES` at lines 16-20 is byte-identical.
- `grep -c 'var(--status-success)' src/frontend/screens/Humble/Keys/index.css` → 1.
- `grep -c 'WAITING_STATES' .planning/REQUIREMENTS.md` → 2 (both inside the new REQ-43-07 supersession note itself; no other pre-existing occurrence was disturbed).

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources were introduced by this task.

## Threat Flags

None — this task touched only CSS, a pure view-membership constant, its tests, and planning records. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes were introduced.

## Next Steps

- The next REQ-43-19 live-gate run should pick up `.planning/todos/pending/2026-09-11-humble-keys-title-wrap-sort-label-and-owned-badge-contrast-unverified-live.md` to visually confirm defects 1, 2, and 4 (source-pinned but not rendering-verified in this repo).

---

## Self-Check: PASSED

All 12 files referenced in this SUMMARY (10 created/modified source and planning files, this SUMMARY.md, and the new pending todo) were confirmed present on disk via `[ -f "$f" ]`. All 3 task commit hashes (`d7a333320`, `ee3f40020`, `73350e7ee`) were confirmed present via `git log --oneline --all`. No missing items.

---

*Quick task: 260911-t0p*
*Completed: 2026-09-11*
