---
phase: quick-260925-m5i
plan: 01
subsystem: gamepad
tags: [testing, tdd, gamepad, nintendo, hat-axis]

requires: []
provides:
  - "checkN64Clone1's padDown/padRight hat comparisons corrected to match its own documented convention"
  - "Synthetic hat-axis test coverage for checkN64Clone1 (Vendor 0079 Product 0006 clone pad)"
affects: [gamepad-layouts, nintendo-controller-support]

tech-stack:
  added: []
  patterns:
    - "RED-first measurement: write tests against unmodified source, record actual failure set verbatim, compare to prediction before touching implementation"
    - "Minimal targeted fix over helper-reuse when reuse would collapse two independently-measured device tables into one shared, partially-unmeasured contract"

key-files:
  created: []
  modified:
    - src/frontend/helpers/gamepad_layouts/nintendo.ts
    - src/frontend/helpers/__tests__/nintendoLayout.test.ts
    - .planning/todos/completed/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md

key-decisions:
  - "Minimal two-value swap chosen over routing checkN64Clone1 through nintendoHatDirection: behaviourally equivalent, but nintendoHatDirection's comment is a measurement record for one already-measured device (PowerA) and sharing it would make that measurement the unmeasured N64-clone table's contract"
  - "No rest-value test written for checkN64Clone1's hat: the pad's resting hat value has never been measured, and the harness's unconfigured default (0) appears nowhere in the documented table, so a rest-value case would assert against a harness default dressed up as a device fact"

requirements-completed: [QUICK-260925-m5i]

duration: ~15min
completed: 2026-09-25
---

# Quick Task 260925-m5i: Fix checkN64Clone1 d-pad hat comparisons Summary

**`checkN64Clone1`'s `padDown`/`padRight` hat comparisons were bound to the wrong rows of its own documented convention table (diagonals instead of cardinals); both values are now corrected and pinned by seven new tests, four of which were measured RED against the unmodified source before the fix.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 3 completed
- **Files modified:** 3 (2 source/test, 1 todo moved+edited)

## Accomplishments

- `checkN64Clone1`'s d-pad hat comparisons (`nintendo.ts:340-343`, now `:359-363`) now derive
  cleanly from its own documented comment table: `padUp === -10`, `padDown === 1`,
  `padLeft === 7`, `padRight === -4`. Previously `padDown` tested `-1` (the DOWN-RIGHT diagonal)
  and `padRight` tested `4` (the DOWN-LEFT diagonal) -- both wrong.
- Seven new test cases in `nintendoLayout.test.ts` measured the ACTUAL pre-fix failure set against
  unmodified source before any fix landed, and the observed set matched the plan's prediction
  exactly with zero divergence to reconcile.
- `nintendoHatDirection`'s stale comment (which asserted `checkN64Clone1`'s comment and code
  "already disagree with each other") was repaired to state the two functions deliberately keep
  separate tables for separate devices; its `switch`, cases, and default arm are byte-identical.
- The todo (`2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md`) is moved to
  `completed/` with `status: RESOLVED` and a full account of what shipped and what remains
  unmeasured.

## Task Commits

1. **Task 1: RED -- synthetic hat-axis coverage for checkN64Clone1, against unmodified source** -
   `42d0c1d97` (test)
2. **Task 2: GREEN -- correct the two comparisons and repair the two stale comments** -
   `30140688d` (fix)
3. **Task 3: Resolve the todo and move it to completed/** - pending (this commit, docs)

## Files Created/Modified

- `src/frontend/helpers/gamepad_layouts/nintendo.ts` - `checkN64Clone1`'s `padDown`/`padRight`
  comparisons corrected (`dPadVal === -1` -> `=== 1`; `dPadVal === 4` -> `=== -4`); in-situ
  rationale comment added above the four `checkAction` calls; `nintendoHatDirection`'s stale
  comment repaired (comment-only, switch untouched).
- `src/frontend/helpers/__tests__/nintendoLayout.test.ts` - New `describe` block: four cardinal/
  diagonal RED-then-GREEN cases (DOWN, RIGHT, DOWN-RIGHT, DOWN-LEFT), two GREEN-by-design
  contract-preservation cases (UP, LEFT), and one routing positive control (non-vacuity proof via
  `buttons[8]` -> `back`).
- `.planning/todos/completed/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md` -
  Moved from `pending/`, `status: RESOLVED` added, `## ✅ FIXED IN CODE` section documenting what
  shipped and what remains unmeasured on real hardware.

## Decisions Made

- **Minimal two-value swap, not `nintendoHatDirection` reuse.** Both options are behaviourally
  equivalent (same `Math.round(v * 10)` transform, same four cardinals, same null-default).
  Reuse was rejected because `nintendoHatDirection`'s comment is a measurement record for one
  specific, already-measured device (PowerA 20d6/a720, whose neutral value diverged from the
  generic convention it otherwise matched) and the file already states twice (at
  `nintendoHatDirection`'s own comment and at `RAW_HID_STICK_AXES`'s comment, `:154-158`) that one
  device's measured table must not become another, unmeasured device's contract. The
  `RAW_HID_STICK_AXES` precedent was not abstract: borrowing `checkGamecube`'s axis row was
  live-falsified for the PowerA pad on 2026-09-25.
- **No rest-value test for `checkN64Clone1`'s hat axis.** This pad's resting hat value has never
  been measured (unlike PowerA's measured `3.28571`), and the test harness's unconfigured default
  is `0`, which appears nowhere in the documented table. Asserting "no d-pad action at rest" would
  test a harness default, not a device fact -- green both pre- and post-fix, proving nothing. This
  mirrors the file's own precedent (case (G), `:592-600`), deliberately not written for the same
  reason.

## RED Measurement Record (Task 1)

Test suite run against UNMODIFIED `nintendo.ts`. Predicted 4 RED / 3 green-by-design; OBSERVED
matched exactly, with zero divergence:

| Case | Predicted | Observed |
|------|-----------|----------|
| DOWN (`0.14286`) -> `padDown` | RED (nothing dispatched) | RED -- `Received array: []` |
| RIGHT (`-0.42857`) -> `padRight` | RED (nothing dispatched) | RED -- `Received array: []` |
| DOWN-RIGHT (`-0.14286`) -> no `padDown` | RED (`padDown` wrongly fires) | RED -- `Received array: ["padDown"]` |
| DOWN-LEFT (`0.42857`) -> no `padRight` | RED (`padRight` wrongly fires) | RED -- `Received array: ["padRight"]` |
| UP (`-1`) -> `padUp` | GREEN pre-fix by design | GREEN |
| LEFT (`0.71429`) -> `padLeft` | GREEN pre-fix by design | GREEN |
| Routing control: `buttons[8]` -> `back` | GREEN pre-fix by design | GREEN |

Full Frontend jest run pre-fix: `Test Suites: 3 failed, 173 passed, 176 total` /
`Tests: 7 failed, 2995 passed, 3002 total` (4 of the 7 failing tests were the new RED cases above;
the other 3 failures were in `labelSuiteI18nCensus.test.ts` and `storeEmbedSingleOpener.test.ts`,
pre-existing and unrelated to this plan's files -- confirmed unchanged by this plan's diff).

Post-fix (Task 2): `nintendoLayout.test.ts` fully green (all 7 new cases + 30+ pre-existing cases).
Full Frontend jest run: `Test Suites: 2 failed, 174 passed, 176 total` /
`Tests: 3 failed, 2999 passed, 3002 total` -- the same two pre-existing, unrelated suites remain
red; zero new failures, zero newly skipped.

## Deviations from Plan

None -- plan executed exactly as written. The observed RED set matched the predicted RED set with
no divergence, so no reconciliation was required before Task 2.

## Verification Results

1. `npx jest --selectProjects Frontend` -- `Test Suites: 2 failed, 174 passed, 176 total`,
   `Tests: 3 failed, 2999 passed, 3002 total`. The two failing suites
   (`labelSuiteI18nCensus.test.ts`, `storeEmbedSingleOpener.test.ts`) are pre-existing and
   unrelated to any file this plan touched.
2. `pnpm codecheck` -- exits 0.
3. `pnpm lint` -- `production: PASS | tests: PASS` (638 pre-existing warnings, 0 errors, none
   introduced by this plan's files).
4. `npx prettier --check` over `nintendo.ts`, `nintendoLayout.test.ts`, the moved todo, this PLAN,
   and this SUMMARY -- all formatted.
5. `pnpm planning-gates` -- run in Task 3, see below.
6. `git diff` on `nintendo.ts` (Task 2 commit) shows exactly two changed comparison values
   (`dPadVal === -1` -> `=== 1`, `dPadVal === 4` -> `=== -4`) plus comment-only additions/repairs.
   `nintendoHatDirection`'s `switch`/cases/default arm are byte-identical; `checkNintendo` and
   `checkGameCube` are untouched.

## Known Stubs

None.

## Threat Flags

None -- no new network endpoint, auth path, file access pattern, or schema change was introduced.
The plan's own threat model (T-260925-m5i-01/02/SC) covers the full surface touched.

## Self-Check: PASSED

- FOUND: `src/frontend/helpers/gamepad_layouts/nintendo.ts`
- FOUND: `src/frontend/helpers/__tests__/nintendoLayout.test.ts`
- FOUND: `.planning/todos/completed/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md`
- CONFIRMED ABSENT: `.planning/todos/pending/2026-09-24-checkn64clone1-dpad-code-contradicts-its-own-comment.md`
- FOUND: this SUMMARY.md
- FOUND commit `42d0c1d97` (Task 1, test)
- FOUND commit `30140688d` (Task 2, fix)
- FOUND commit `0088beb41` (Task 3, docs)
