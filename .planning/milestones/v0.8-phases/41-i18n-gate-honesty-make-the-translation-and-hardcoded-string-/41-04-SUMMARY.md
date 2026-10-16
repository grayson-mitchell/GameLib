---
phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-
plan: 04
subsystem: testing
tags: [i18n, hardcoded-string-gate, jest, meta-tooling, ci]

# Dependency graph
requires:
  - phase: 41-i18n-gate-honesty-make-the-translation-and-hardcoded-string- (plan 02)
    provides: "Widened D-14 exemption chain (ns-prefixed key/defaultText tuples, object-literal pairing, TFunc alias, closest() method-name check) that took audit-mode violations across facetLabels.ts / chipLabels.ts / helpers/gamepad.ts from 46 to 0"
provides:
  - "meta/i18nGateScope.json widened 171 -> 174 files: facetLabels.ts, chipLabels.ts, helpers/gamepad.ts now permanently in the BLOCKING i18n gate scope"
  - "meta/__tests__/genI18nGateScope.test.ts's DECLARED_UNSCANNED_DEBT shrunk 44 -> 41, with the WR-18 header paragraph corrected (real gamepad.ts line numbers 405/452/459, method-name fix not content-shape)"
  - "meta/__tests__/hardcodedStringGate.test.ts's WR-18 block inverted from an audit-mode ratchet over unscanned debt to per-file coverage sourced from the blocking scanScope() report"
  - "2026-08-27 todo closed with a measured closure record and two framing corrections"
affects: [i18n, meta-tooling, ci-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promoting a file out of DECLARED_UNSCANNED_DEBT and into the hand-curated meta/i18nGateScope.json is a matched two-file edit in one commit (scope array + the test's debt register + its count pin), never via pnpm gen-i18n-gate-scope"
    - "A WR-18-style audit-mode ratchet (scanScope({ extraFiles })) inverts cleanly to blocking coverage (scanScope()) once its subject files are permanent scope members — same per-file assertions, different data source"

key-files:
  created: []
  modified:
    - meta/i18nGateScope.json
    - meta/__tests__/genI18nGateScope.test.ts
    - meta/__tests__/hardcodedStringGate.test.ts
    - .planning/todos/completed/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md (moved from pending)

key-decisions:
  - "Hand-edited meta/i18nGateScope.json rather than running pnpm gen-i18n-gate-scope, preserving hand-curated provenance and matching this repo's measured regen-cascade hazard (1 test failure -> 5)"
  - "Corrected two pre-existing framing errors while rewriting the WR-18 header comments: gamepad.ts's three hits are .closest() call ARGUMENTS at real lines 405/452/459, not bare CSS-selector literals at the previously-recorded 323/370/377; and used the plan-authoritative before-count of 46 (8 facetLabels.ts + 35 chipLabels.ts + 3 gamepad.ts), correcting a pre-existing 34-vs-35 chipLabels.ts discrepancy between the two test files' comments"
  - "Deleted W4 ('no collateral outside extraFiles') rather than adapting it — it was a property of audit mode, fully subsumed once all three files are permanent blocking-scope members by the existing whole-scope 'zero violations' assertion"
  - "Left the pre-existing stale '171-file'/'171 -> 215' prose in the --rewrite-scope guard's A0/A2 test TITLES (lines ~798-825, unrelated freshSnapshot() history block) untouched — out of the plan's explicit edit scope (only the :793 assertion pin, not surrounding titles/comments) and touching them would have widened the edit surface in a file with a measured regen-cascade hazard for no test-behavior benefit"

requirements-completed: [REQ-41-04]

# Metrics
duration: 55min
completed: 2026-09-06
---

# Phase 41 Plan 04: Promote facetLabels.ts, chipLabels.ts, helpers/gamepad.ts into the blocking i18n gate scope Summary

**Hand-edited meta/i18nGateScope.json 171 -> 174 files and DECLARED_UNSCANNED_DEBT 44 -> 41, inverting the WR-18 audit-mode ratchet to blocking-scope coverage — all three files now measure 0 violations from the same report guarding the other 171 files, and the 2026-08-27 todo is closed with a measured record.**

## Performance

- **Duration:** ~55 min
- **Started:** 2026-09-06T04:17:00Z (approx, first read)
- **Completed:** 2026-09-06T05:12:38Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (3 code/test files + 1 todo moved pending -> completed)

## Accomplishments

- `meta/i18nGateScope.json` scope widened 171 -> 174 files (verified: 174, sorted, all three present), hand-curated provenance preserved byte-exact apart from `files` and `generatedBy`
- `DECLARED_UNSCANNED_DEBT` shrunk 44 -> 41 entries, with none of the three promoted files remaining
- WR-18 test block in `hardcodedStringGate.test.ts` inverted: W1 now asserts in-scope/not-allowlisted (previously the reverse), W2 sources from the blocking `scanScope()` instead of an `extraFiles` audit widening, W3 unchanged (per-file `exempted` pins), W4 deleted with its retirement reason recorded in the block comment
- Two framing corrections landed in the same commits: gamepad.ts's real violation line numbers (405/452/459, `.closest()` arguments, not bare CSS-selector literals at the previously-recorded 323/370/377) and the corrected `TECHNICAL_DOM_API_METHOD_NAMES` fix-shape description
- 2026-08-27 todo closed with a full measured closure record and the same two framing corrections

## Task Commits

Each task was committed atomically:

1. **Task 1: Hand-edit the scope artifact and shrink the declared debt register in one commit** - `8c236df00` (feat)
2. **Task 2: Retire the WR-18 audit-mode ratchet now that the blocking report covers these files** - `04faad0b5` (test)
3. **Task 3: Measure the promoted gate end to end and close the 2026-08-27 todo** - `0c39d589d` (docs)

_No TDD tasks in this plan — all `type="auto"`._

## Files Created/Modified

- `meta/i18nGateScope.json` - Added `src/frontend/helpers/gamepad.ts`, `src/frontend/screens/Library/components/FilterChipRow/chipLabels.ts`, `src/frontend/screens/Library/facetLabels.ts` to `files` (sorted insertion), appended a Phase 41 clause to `generatedBy`
- `meta/__tests__/genI18nGateScope.test.ts` - Removed the three files from `DECLARED_UNSCANNED_DEBT`, updated the `:793`-area count pin from `toBe(171)` to `toBe(174)`, rewrote the WR-18 header paragraph with corrected line numbers and fix-shape description
- `meta/__tests__/hardcodedStringGate.test.ts` - Inverted the WR-18 describe block (renamed, W1 inverted, W2 re-sourced, W4 deleted), rewrote its surrounding block comment
- `.planning/todos/completed/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md` - Moved from `pending/`, frontmatter updated to `status: RESOLVED`, `discharged`/`discharged_by` added, full measured closure record appended

## Decisions Made

- **`pnpm gen-i18n-gate-scope` was explicitly NOT run.** Both artifacts were hand-edited: `meta/i18nGateScope.json`'s `files` array (sorted insertion, three lines) and `generatedBy` (appended clause), and `genI18nGateScope.test.ts`'s `DECLARED_UNSCANNED_DEBT` array plus its count pin. This matches the plan's explicit instruction and the repo's measured regen-cascade hazard (a live regen here has been measured to take this suite from 1 failure to 5). Verified: `git diff meta/i18nGateScope.json` shows only `files` (+3 lines) and `generatedBy` (1 line) differ — `baseCommit`, `baseVersion`, `generatedAt`, and `excluded` are byte-unchanged.
- **Corrected the "34 vs 35" chipLabels.ts discrepancy.** `genI18nGateScope.test.ts`'s original header said chipLabels.ts measured 35 violations (43 combined with facetLabels.ts's 8, +3 gamepad.ts = 46 total); `hardcodedStringGate.test.ts`'s original WR-18 comment said 34 (45 total). The plan's authoritative measured value is 46 (3/35/8), matching `genI18nGateScope.test.ts`'s and the 41-02 SUMMARY's own headline ("46 to 0"). Both files' rewritten comments now consistently cite 46/35/8/3 — a small pre-existing inconsistency fixed as part of the required header rewrite, not a new deviation.
- **Did not touch the `--rewrite-scope guard` describe block's test titles** (the A0/A2 tests around what were originally lines ~792/821, referencing "the REAL 171-file hand-curated snapshot" and "the real 171 -> 215 diff" in their title strings). These are descriptive Jest test-name strings, not assertions — updating them was not in the plan's explicit task list (only the `:793`-area numeric assertion), and editing prose in this file beyond the plan's named scope was judged unnecessary risk given the file's documented regen-cascade fragility. Flagged here for visibility: these two test titles now read a stale "171" though the underlying assertion correctly reads 174.

## Deviations from Plan

None requiring Rule 1-4 action. Two clarifications, documented above under Decisions Made:
1. Corrected a pre-existing 34-vs-35 chipLabels.ts count inconsistency between the two test files' comments while rewriting them per the plan's own instruction to fix stale numbers — using the plan's authoritative 46/35/8/3 figures.
2. Left two out-of-scope test-title strings (not assertions) referencing the old "171" count untouched, per the plan's explicit edit scope.

**Total deviations:** 0 auto-fixed (Rules 1-4 not triggered).
**Impact on plan:** None — plan executed as specified; the two items above are documentation-consistency clarifications within the plan's own instructed scope, not unplanned scope changes.

## Issues Encountered

The plan's Task 1 `<verify>` block includes a bash one-liner checking `generatedBy` against `/gen-i18n-gate-scope run/` — this regex fails to match even the **original, unmodified** `generatedBy` string (verified by running the same regex against `git show HEAD:meta/i18nGateScope.json` from before any edit in this plan), because the real text has a backtick between "scope" and "run" (`` `pnpm gen-i18n-gate-scope\` run ``) that the regex's literal "scope run" substring does not span. This is a pre-existing defect in the plan's own verify script, not a regression from this plan's edit — the actual jest assertion (`isHandCuratedProvenance`, which only checks the string is not exactly equal to `GENERATOR_PROVENANCE`) passes, and the full `genI18nGateScope` suite (26 passed, 1 skipped) confirms provenance is still read as hand-curated. No code or test file was changed to work around this; it is reported here as a false-negative in the plan's shell verification, not the jest gate.

## Measured Numbers (isolated runs)

**Whole-gate, blocking `scanScope()`** (measured via a temporary script, `meta/__scratch_measure_41_04.ts`, run through `node meta/runTs.cjs`, deleted immediately after measurement and never committed — `git status --porcelain` confirms it left no trace):

| Metric | Before (Plan 41-02 baseline) | After (this plan) |
|---|---|---|
| `scannedFiles` | 171 | **174** |
| `violations.length` | 0 | **0** |
| `totalCandidates` | (not re-measured before) | 2132 |
| `staleExemptions.length` | 0 | **0** |
| `fileExempt` | `["src/frontend/bootErrorSurface.ts"]` | **`["src/frontend/bootErrorSurface.ts"]`** (unchanged) |

**Per-file `scanSource()`:**

| File | violations | exempted |
|---|---|---|
| `facetLabels.ts` | 0 | 13 (non-zero, proves the D-14 chain ran) |
| `chipLabels.ts` | 0 | 36 (non-zero, proves the D-14 chain ran) |
| `gamepad.ts` | 0 | 0 (legitimate — `.closest()` arguments are discarded by the structural DOM-API check before the `exempted` counter increments) |

**Sabotage (whole-gate level):** a scratch copy of `facetLabels.ts` (never the real file) with one bare English literal appended, scanned via `extraFiles` against a `mkdtempSync` temp directory: violation count rose from 0 (real file) to 1 (sabotaged copy) — **delta exactly +1**.

**`DECLARED_UNSCANNED_DEBT` register:** 44 -> 41 entries (counted via `awk`/`grep`, not inferred from exit code); confirmed none of the three promoted files remain (`grep -c` over comment-stripped source returned 0).

## Full Meta Project Re-run (delta against the 41-03 baseline)

| | Baseline (before this plan) | After this plan | Delta |
|---|---|---|---|
| Test Suites | 37 passed, 37 total | 37 passed, 37 total | 0 |
| Tests passed | 1003 | 1002 | **-1** |
| Tests skipped | 1 | 1 | 0 |
| Tests total | 1004 | 1003 | **-1** |

The -1/-1 delta is fully explained by Task 2's intentional deletion of the W4 test ("no collateral outside extraFiles") — no other test count changed, and no new failure appeared anywhere in the 37-suite run. `npx jest --selectProjects Meta --testPathPattern genI18nGateScope --runInBand` (26 passed, 1 skipped) and `npx jest --selectProjects Meta --testPathPattern hardcodedStringGate --runInBand` (150 passed, 150 total) were also each run in isolation and are green.

`pnpm codecheck`: exit 0. `npx eslint` on all three changed source/test files: 0 errors (a handful of pre-existing `@typescript-eslint/no-unsafe-*` warnings in `genI18nGateScope.test.ts` were confirmed, by line content, to sit on code untouched by this plan). `npx prettier --check` on all three changed files: all pass.

## `meta/i18nForkTouchedFiles.json`

**Unchanged.** `git status --porcelain meta/i18nForkTouchedFiles.json` returns no output across all three commits — this plan is a scope MOVE (unscanned debt -> blocking scope) for three files that were already fork-touched, not a fork-touched-set change, exactly as the plan's measured-baseline table predicted (`215` before and after).

## Todo Closure

`.planning/todos/pending/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md` moved to `.planning/todos/completed/2026-08-27-i18n-gate-flags-declaration-site-literals-as-violations.md`, with `status` updated to a `RESOLVED` string, `discharged`/`discharged_by` fields added, and a full `## Disposition` section appended carrying the measured numbers above and two framing corrections (gamepad.ts's real violation shape, and the D-14 tuple exemption being widened rather than newly built).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

REQ-41-04 is fully closed: the blocking i18n hardcoded-string gate now scans `facetLabels.ts`, `chipLabels.ts`, and `helpers/gamepad.ts` on every `pnpm test:ci` run, at zero violations, with dedicated per-file test coverage. No known blockers for subsequent Phase 41 plans. The two out-of-scope stale test-title strings noted under Decisions Made (A0/A2 in the `--rewrite-scope guard` block) are low-risk cosmetic residue, not a functional gap — flagged for whoever next touches that describe block.

## Self-Check: PASSED

- FOUND: `.planning/phases/41-i18n-gate-honesty-make-the-translation-and-hardcoded-string-/41-04-SUMMARY.md`
- FOUND: `8c236df00` (Task 1 commit)
- FOUND: `04faad0b5` (Task 2 commit)
- FOUND: `0c39d589d` (Task 3 commit)
