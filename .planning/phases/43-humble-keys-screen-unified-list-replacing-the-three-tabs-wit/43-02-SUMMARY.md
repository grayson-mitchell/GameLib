---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 02
subsystem: infra
tags: [humble, diagnostics, sort, classify, live-probe]

# Dependency graph
requires: []
provides:
  - "D-43-05 settled by live measurement: `created` exists on every populated Humble order (POSITIVE verdict)"
  - "`.planning/phases/43-.../43-PROBE-D-43-05.md` recording the raw evidence, verdict, and shippable sort-option set"
  - "Explicit scope boundary: capturing `created` into `HumbleKey` + the classifier version bump is a follow-up gap plan, not part of 43-07"
affects: ["43-07 (sort picker)", "future gap plan for Most recent sort"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["temporary, clearly-marked, fully-reverted diagnostic probes for measure-before-specify questions (mirrors D-43-11's approach)"]

key-files:
  created:
    - ".planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-05.md"
  modified:
    - "src/backend/humble/classify.ts (temporarily, fully reverted)"
    - "src/backend/humble/library.ts (temporarily, fully reverted)"

key-decisions:
  - "VERDICT: POSITIVE — `created` is present on every observed order (5/5), so `Most recent` is a real, buildable sort, not a phantom option"
  - "`created` sits on the ORDER, not on HumbleKey — Most recent sorts by purchase batch, not per-key timestamp; recorded explicitly so a later reader doesn't assume per-key precision"
  - "Shipping the third sort option needs a backend capture into HumbleKey plus a HUMBLE_CLASSIFIER_VERSION bump (7 -> 8) — this is explicitly out of 43-07's scope and must be minted as a follow-up gap plan via /gsd-plan-phase 43 --gaps"
  - "43-07 ships two evidenced sort options (Expiring soonest, Alphabetical) until the gap plan lands"

requirements-completed: [REQ-43-05]

# Metrics
duration: ~10min active (plus an operator-driven live-sync checkpoint pause)
completed: 2026-09-10
---

# Phase 43 Plan 02: D-43-05 Order-Date Diagnostic Probe Summary

**Live probe on a real Humble sync found a `created` field on every populated order — D-43-05 resolved POSITIVE, `Most recent` is real but needs a backend capture and classifier-version bump before it can ship, out of 43-07's scope.**

## Performance

- **Duration:** ~10 min of active edits across two commits, separated by a `checkpoint:human-verify` pause while the operator ran a live Humble sync and captured evidence
- **Started:** 2026-09-10T08:06:40+12:00 (Task 1 commit)
- **Completed:** 2026-09-10T08:16:16+12:00 (Task 3 commit)
- **Tasks:** 3/3 (Task 1: auto, Task 2: checkpoint:human-verify, Task 3: auto)
- **Files modified:** 3 (2 source files touched-then-reverted to byte-identical state, 1 new probe document)

## Accomplishments
- Installed a temporary, uncapped, value-free diagnostic (`probeOrderFieldNamesD4305`) on the populated-order commit path in `library.ts`, deliberately bypassing `fieldNames`'s `MAX_DIAGNOSED_FIELDS = 15` cap so a truncated field list could never be misread as a real absence
- Operator ran a live Humble sync on the packaged app; captured 5 probe lines (5 distinct orders/gamekeys), each showing the identical 15-field top-level shape with no `+N more` truncation marker
- Recorded a POSITIVE verdict with full raw evidence, the shippable sort-option set, and the scope boundary for the follow-up gap plan in `43-PROBE-D-43-05.md`
- Fully reverted the probe from both files; `git diff` against the pre-probe sha (`ac2d2cdd0553b54b0c5fedbd687583179fbf84c1`) for both files is empty

## Task Commits
1. **Task 1: Add the temporary uncapped order-field-name diagnostic** - `f385991a6` (feat)
2. **Task 2: Operator runs one Humble sync and captures the field-name evidence** - checkpoint, no commit (evidence captured into `/tmp/gamelib-probe-d4305-20260909T200728Z/` and reported back to the executor)
3. **Task 3: Record the verdict and revert the probe** - `c922d130b` (docs)

_Note: Task 2 is a `checkpoint:human-verify` gate — no code changes, no commit. The operator ran the live sync, extracted the log lines, and reported the evidence back inline._

## Files Created/Modified
- `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-05.md` - Probe design, raw evidence (5 captured log lines), POSITIVE verdict, shippable sort-option set, and residual unknowns
- `src/backend/humble/classify.ts` - Temporarily added then fully reverted `probeOrderFieldNamesD4305`; final state is byte-identical to pre-probe sha
- `src/backend/humble/library.ts` - Temporarily added then fully reverted the probe's `logInfo` call site and its import; final state is byte-identical to pre-probe sha

## Decisions Made
- **VERDICT: POSITIVE** — `created` exists on every one of the 5 observed orders, with an identical 15-field shape across all of them: `[amount_spent,choices_remaining,claimed,created,currency,gamekey,is_giftee,missed_credit,path_ids,product,subproducts,total,total_choices,tpkd_dict,uid]`
- The captured field count (15) numerically collides with `MAX_DIAGNOSED_FIELDS` (15) by coincidence, not truncation — confirmed by direct read of the deployed probe source (no slice, no cap reference) and by the absence of the `+N more` suffix that the capped helper would have appended past 15. Documented explicitly in the probe doc so a later reader doesn't re-open the truncation question.
- `created` is an ORDER-level field, not a per-key field — every `HumbleKey` derived from one order shares the same `created` value, so `Most recent` sorts by purchase batch, not per-key precision. This is a real characteristic of the data, not a defect, and is recorded as such.
- Shipping `Most recent` requires: (1) capturing `created` into `HumbleKey` (`src/common/types/humble.ts`), (2) a `HUMBLE_CLASSIFIER_VERSION` bump from 7 to 8 to force one-time reclassification of frozen orders, and (3) a new comparator. This is explicitly scoped OUT of plan 43-07 and recorded as a follow-up gap plan (`/gsd-plan-phase 43 --gaps`).
- 43-07 ships the two evidenced sort options (`Expiring soonest`, `Alphabetical`) per `43-UI-SPEC.md`'s § "Sort Picker Contract" branch table, until the gap plan lands.

## Deviations from Plan

None - plan executed exactly as written. The only adjustment made during Task 1 was removing an extra `TEMPORARY PROBE (D-43-05)` marker comment I initially placed on the import line in `library.ts` (in addition to the one on the log call site) — the plan's acceptance criterion required a combined count of exactly `2` across both files (1 in `classify.ts`, 1 in `library.ts`), and I had produced `3`. Caught and corrected before committing Task 1; not a deviation from the plan's intent, just a self-correction during the same task.

## Issues Encountered
None. The `npx jest --selectProjects Backend ...` command (per the plan's exact acceptance-criteria wording) runs the full 213-suite Backend project rather than only the two named humble test files — this is a known project quirk (jest's `--selectProjects` interacts with positional test-path patterns this way here), not a defect introduced by this plan. Baseline (213 suites / 4805 passed / 2 skipped / 4807 total) was measured before Task 1's edit and reproduced identically after both Task 1 and Task 3, confirming zero regression.

## User Setup Required
None - no external service configuration required. The live-sync verification step (Task 2) required the operator to run the packaged app with an existing Humble login — this was operator-driven per the plan's checkpoint design, not a setup step for future work.

## Next Phase Readiness
- 43-07 (the sort picker) has an unambiguous instruction: ship two sort options now (`Expiring soonest`, `Alphabetical`); `Most recent` is real but requires backend work first.
- A follow-up gap plan is needed to capture `created` into `HumbleKey`, bump `HUMBLE_CLASSIFIER_VERSION` to 8, and add the `Most recent` comparator — not yet minted, tracked in `43-PROBE-D-43-05.md`'s "Sort options to ship" section.
- Tree carries no probe residue: `git diff ac2d2cdd0553b54b0c5fedbd687583179fbf84c1 -- src/backend/humble/classify.ts src/backend/humble/library.ts` is empty.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*

## Self-Check: PASSED

- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-PROBE-D-43-05.md`
- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-02-SUMMARY.md`
- FOUND: commit `f385991a6` (Task 1)
- FOUND: commit `c922d130b` (Task 3)
